import { breakCandidates } from './comments.js';
import { abbreviationAlternatives } from './abbreviations.js';

const DEFAULT_OPTIONS = {
  maxLineLength: 240,
};

// the shortest last line a word wrap leaves, the same floor a clause break keeps
const MIN_TAIL = 20;

// uses hardened semantic line breaks
// 1. (?<!\b(?:etc|ref|...)\.) -> Ignore known abbreviations
// 2. (?<!\b[a-zA-Z]\.) -> Ignore single letters (handles e.g., i.e., initials)
// 3. (?<=[.!?]) -> Must follow a punctuation mark
// 4. \s+ -> Consume the space(s)
// 5. (?=[A-Z0-9`*_'\[]) -> The next word MUST start with a Capital letter, number, or Markdown formatting
const SENTENCE_SPLIT_REGEX = new RegExp(
  `(?<!\\b(?:${abbreviationAlternatives})\\.)(?<!\\b[a-zA-Z]\\.)(?<=[.!?])\\s+(?=[A-Z0-9\`*_'\\[])`
);

// the elements that open an HTML block even in the middle of a paragraph, as listed by CommonMark
const BLOCK_TAGS = new Set([
  'address', 'article', 'aside', 'base', 'basefont', 'blockquote', 'body', 'caption', 'center', 'col', 'colgroup',
  'dd', 'details', 'dialog', 'dir', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'form', 'frame',
  'frameset', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'head', 'header', 'hr', 'html', 'legend', 'li', 'link',
  'main', 'menu', 'menuitem', 'nav', 'noframes', 'ol', 'optgroup', 'option', 'p', 'param', 'search', 'section',
  'summary', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'title', 'tr', 'track', 'ul'
]);

export function readFence(line) {
  const text = line.trim();
  const marker = /^(?:`{3,}|~{3,})/.exec(text)?.[0];
  return marker ? { marker, info: text.slice(marker.length) } : null;
}

// reads the start of an HTML block, whose content is not Markdown and is never touched
// a line opening on an autolink such as <https://example.com> is text, since a tag name is never followed by a colon
function readHtmlStart(line, afterText) {
  const text = line.trimStart();
  if (text.startsWith('<!--')) return { end: /-->/, rest: text.slice(4) };

  // these elements may hold blank lines, so only their closing tag ends them
  const raw = text.match(/^<(pre|script|style|textarea)(?=[\s>]|$)/i);
  if (raw) return { end: new RegExp(`</${raw[1]}>`, 'i'), rest: text.slice(raw[0].length) };

  // only a block level element interrupts a paragraph, any other tag right after text is inline HTML within it
  const tag = text.match(/^<\/?([A-Za-z][A-Za-z0-9-]*)(?=[\s/>]|$)/);
  if (tag && (!afterText || BLOCK_TAGS.has(tag[1].toLowerCase()))) return { end: 'blank' };
  return null;
}

function isSeparatorLine(line) {
  return line.includes('|') && line.includes('-') && line.replace(/[:\-|\s]/g, '') === '';
}

// a table is broken by the beginning of another block level structure, whatever pipes that line happens to contain
function startsNewBlock(line) {
  return /^\s*(#|>|(?:[-*+]|\d+[.)])\s|```|~~~)/.test(line);
}

// a row may open on a list marker, such as "1. The cluster | runs", so only the blocks that cannot be a cell end it
function endsTable(line) {
  return /^\s*(#|>|```|~~~)/.test(line);
}

export function formatMarkdown(content, options = {}) {
  const maxLineLength = typeof options === 'number'
    ? options
    : (options?.maxLineLength ?? DEFAULT_OPTIONS.maxLineLength);

  const lines = content.split(/\r?\n/);
  const output = [];

  // openFence holds the marker of the fenced block being crossed, such as "```" or "~~~~", and null outside of any block
  // htmlEnd holds what ends the HTML being crossed: a pattern for a comment or a raw text element, 'blank' for any other block, and null outside of HTML
  const state = { openFence: null, htmlEnd: null };

  let i = frontMatterEnd(lines);
  output.push(...lines.slice(0, i));

  while (i < lines.length) {
    const tableEnd = isVerbatim(lines, i, state) ? -1 : findTableEnd(lines, i);

    if (tableEnd === -1) {
      output.push(lines[i]);
      i++;
    } else if (tableEnd > i) {
      output.push(...formatTable(lines.slice(i, tableEnd)));
      i = tableEnd;
    } else {
      // pushed one by one, since a line of many sentences would exceed the number of arguments a call accepts
      for (const formattedLine of formatLine(lines[i], maxLineLength)) output.push(formattedLine);
      i++;
    }
  }

  // strips trailing empty lines and appends exactly one EOF newline
  // a document holding no content stays empty, since that newline would read as a second line
  const formatted = output.slice(0, output.findLastIndex(line => line !== '') + 1).join('\n');
  return formatted === '' ? '' : formatted + '\n';
}

// counts the lines of front matter, copied verbatim as it is metadata rather than Markdown
// an opening marker with no closing one is a thematic break, so the document is formatted from the top as usual
function frontMatterEnd(lines) {
  if (lines[0]?.trim() !== '---') return 0;
  return lines.findIndex((candidate, index) => index > 0 && candidate.trim() === '---') + 1;
}

// a fence is closed by at least as many of the same character, with nothing but spaces after it
function closesFence(fence, openFence) {
  return fence.marker[0] === openFence[0]
    && fence.marker.length >= openFence.length
    && fence.info.trim() === '';
}

// tells whether a line belongs to a fenced block or to HTML, whose content is never touched, and moves the state past it
function isVerbatim(lines, i, state) {
  const line = lines[i];
  const fence = readFence(line);

  if (state.openFence) {
    if (fence && closesFence(fence, state.openFence)) state.openFence = null;
    return true;
  }

  // a fence marker inside HTML is part of it, so the end of the HTML is looked for first
  if (crossesHtml(line, state)) return true;

  if (fence) {
    state.openFence = fence.marker;
    return true;
  }
  return opensHtml(lines, i, state);
}

// the blank line ending a block is formatted as any other blank line
function crossesHtml(line, state) {
  if (!state.htmlEnd) return false;
  if (state.htmlEnd === 'blank') {
    if (line.trim() !== '') return true;
    state.htmlEnd = null;
    return false;
  }
  if (state.htmlEnd.test(line)) state.htmlEnd = null;
  return true;
}

function opensHtml(lines, i, state) {
  const afterText = i > 0 && lines[i - 1].trim() !== '' && !/^\s*(#|```|~~~)/.test(lines[i - 1]);
  const html = readHtmlStart(lines[i], afterText);
  if (!html) return false;

  // a comment or an element closed on its opening line ends there
  if (html.end === 'blank' || !html.end.test(html.rest)) state.htmlEnd = html.end;
  return true;
}

// returns the index after the last row of the table starting at a line, and the index of the line itself when no table starts there
function findTableEnd(lines, start) {
  const isTable = lines[start].includes('|') && !startsNewBlock(lines[start]) && start + 1 < lines.length && isSeparatorLine(lines[start + 1]);
  if (!isTable) return start;

  // takes the header and the separator, then every row until a blank line or another block
  let end = start + 2;
  while (end < lines.length && lines[end].includes('|') && !endsTable(lines[end])) end++;
  return end;
}

// headings, thematic breaks, and link/image lines are left as written
function isLeftWhole(line) {
  // detects lines that are strictly badges, images, or links (e.g., [![Alt](url)](url) or [Text](url))
  const isLinkOrImage = /^\s*!?\[.*\]\(.*\)\s*$/.test(line);

  // detects a thematic break, whose first character would otherwise read as a list marker
  const isThematicBreak = /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line);

  return line.startsWith('#') || isThematicBreak || isLinkOrImage;
}

function formatLine(line, maxLineLength) {
  // empties a line holding nothing but spacing
  // the trailing spaces of a line carrying content are a hard line break, so they are left alone
  if (line.trim() === '') return [''];
  if (isLeftWhole(line)) return [line];

  // isolates blockquotes, ordered lists (1., 2)), and unordered lists (-, *, +)
  const prefixMatch = line.match(/^(\s*(?:>\s*)*)((?:[-*+]|\d+[.)])\s+)?/);
  const bqPart = prefixMatch[1] || '';
  const sourceListPart = prefixMatch[2] || '';

  // an unordered list is written with a dash, whatever marker the source used
  const listPart = sourceListPart.replace(/^[*+]/, '-');

  const prefix = bqPart + listPart; // E.g., "  1. "
  const indentPrefix = bqPart + ' '.repeat(listPart.length); // E.g., "     "
  const textToProcess = line.substring(bqPart.length + sourceListPart.length);

  // keeps marker only lines, such as the ">" separating two blockquote paragraphs, since there is no text to split
  if (textToProcess.trim() === '') return [prefix + textToProcess];

  // gets the real marker on first sentence, subsequent sentences get blank spaces to align
  return splitSentences(textToProcess)
    .flatMap((sentence, index) => wrapLine((index === 0 ? prefix : indentPrefix) + sentence, indentPrefix, maxLineLength));
}

function splitSentences(text) {
  const [first, ...others] = text.split(SENTENCE_SPLIT_REGEX);

  // Re-joins any sentence split that occurred inside quotes or inline code
  const sentences = [];
  let currentSentence = first;
  let currentPos = first.length;

  for (const sentence of others) {
    if (isInsideQuotesOrCode(text, currentPos) || isInsideLink(text, currentPos) || opensBlock(sentence)) {
      currentSentence += ' ' + sentence;
    } else {
      sentences.push(currentSentence);
      currentSentence = sentence;
    }
    currentPos += 1 + sentence.length;
  }
  if (currentSentence) sentences.push(currentSentence);
  return sentences;
}

function wrapLine(line, indentPrefix, maxLineLength) {
  const output = [];
  let remaining = line;

  // a line whose overflow holds no space is left whole, as markdownlint's MD013 accepts it, so a lint-clean file is not rewrapped
  while (remaining.length > maxLineLength && /\s/.test(remaining.slice(maxLineLength))) {
    const splitPos = findSplit(remaining, maxLineLength, indentPrefix.length);
    output.push(remaining.substring(0, splitPos).trimEnd());

    // a word too long to break leaves nothing behind it, and a line of bare indentation would read as blank on the next pass
    const rest = remaining.substring(splitPos).trimStart();
    remaining = rest === '' ? '' : indentPrefix + rest;
  }

  if (remaining.length > 0) output.push(remaining);
  return output;
}

function findSplit(line, maxLineLength, prefixLength) {
  // A. looks for natural sentence breaks in the second half of the line
  // splits only at punctuation if it's reasonably far into the line (e.g., > 50% of max length)
  const head = line.substring(0, maxLineLength + 1);
  const punctuations = ['. ', ': ', '; ', '? ', '! ', ' - '];
  const bestPunctPos = Math.max(...punctuations.map(p => findPunctuationBreak(line, head, p, prefixLength)));
  if (bestPunctPos >= maxLineLength / 2) return bestPunctPos;

  // B. breaks at a clause boundary, such as ", so" or ", which", before resorting to a plain word
  const clausePos = findClauseBreak(line, maxLineLength, prefixLength);
  if (clausePos !== -1) return clausePos;

  return findWordBreak(line, head, maxLineLength, prefixLength);
}

function findPunctuationBreak(line, head, punctuation, prefixLength) {
  let pos = head.lastIndexOf(punctuation);

  while (pos !== -1) {
    const splitAt = pos + punctuation.length - 1;
    if (splitAt <= prefixLength) return -1;

    // ensures we don't break at punctuation that lives inside quotes/code
    // asks about the whole line, so a quoted phrase reaching past the limit is still seen as a pair
    if (!opensBlock(line.substring(splitAt)) && !isInsideQuotesOrCode(line, pos) && !isInsideLink(line, pos)) return splitAt;

    // a negative start is read as 0, which would find a match at the start of the line forever
    pos = pos > 0 ? head.lastIndexOf(punctuation, pos - 1) : -1;
  }
  return -1;
}

// C. fallbacks to standard word-wrap (last space before limit)
function findWordBreak(line, head, maxLineLength, prefixLength) {
  // a space inside a link is skipped, since the link has to stay on one line
  const allowed = pos => !isInsideLink(line, pos) && !opensBlock(line.substring(pos));
  // a break inside inline code or emphasis is valid but reads badly, so it is avoided while a space before it keeps the line half full
  const preferred = pos => allowed(pos) && !isInsideCodeOrEmphasis(line, pos);
  const lastSpace = (accepts, from = head.length) => {
    let pos = head.lastIndexOf(' ', from);
    while (pos > prefixLength && !accepts(pos)) pos = head.lastIndexOf(' ', pos - 1);
    return pos > prefixLength ? pos : -1;
  };

  let spacePos = lastSpace(preferred);
  if (spacePos < maxLineLength / 2) spacePos = lastSpace(allowed);
  if (spacePos === -1) return findNextSpace(line, Math.max(maxLineLength, prefixLength), allowed);

  // a last line of a word or two is avoided by moving a few words down, as long as the line above stays half full
  const leavesShortTail = pos => line.length - pos - 1 < MIN_TAIL;
  let earlier = spacePos;
  while (earlier !== -1 && leavesShortTail(earlier)) earlier = lastSpace(preferred, earlier - 1);
  return earlier >= maxLineLength / 2 ? earlier : spacePos;
}

// D. finds the *next* available space, if the word is longer than max length (e.g. long URL) force wraps if a single unbroken word exceeds max limit
function findNextSpace(line, from, allowed) {
  let nextSpace = line.indexOf(' ', from);
  while (nextSpace !== -1 && !allowed(nextSpace)) nextSpace = line.indexOf(' ', nextSpace + 1);
  return nextSpace === -1 ? line.length : nextSpace;
}

// finds the latest clause boundary that keeps the line within the limit, and returns -1 when none sits in its second half
// a boundary inside a link, inline code or quotes is not a boundary
// one inside parentheses is tried only when none fits outside them, since a line held by one parenthesis would otherwise break at a random word
function findClauseBreak(line, maxLineLength, prefixLength) {
  const outside = fittingBreak(line, maxLineLength, prefixLength, false);
  return outside !== -1 ? outside : fittingBreak(line, maxLineLength, prefixLength, true);
}

function fittingBreak(line, maxLineLength, prefixLength, insideParens) {
  const fitting = breakCandidates(line.slice(prefixLength), { insideParens })
    .map(candidate => ({ ...candidate, at: candidate.at + prefixLength }))
    .filter(candidate => {
      const head = line.slice(0, candidate.at).trimEnd();
      return head.length <= maxLineLength
        && head.length >= maxLineLength / 2
        && line.length - candidate.at >= MIN_TAIL
        && !opensBlock(line.slice(candidate.at))
        && !isInsideLink(line, candidate.at - 2)
        && !isInsideQuotesOrCode(line, candidate.at - 2);
    })
    .sort((a, b) => a.rank - b.rank || b.at - a.at);

  return fitting.length > 0 ? fitting[0].at : -1;
}

// a line opening on one of these starts a list item, a heading, a quote, a fence or a setext underline instead of continuing the paragraph
const BLOCK_OPENERS = [/^(?:[-*+]|\d{1,9}[.)])(?:\s|$)/, /^#{1,6}(?:\s|$)/, /^(?:>|`{3}|~{3})/, /^[-=]+\s*$/];

function opensBlock(text) {
  const start = text.trimStart();
  return BLOCK_OPENERS.some(opener => opener.test(start));
}

function formatTable(tableLines) {
  // a table nested in a list item is held there by its indentation, which the header carries for the whole table
  // the least indented line gives it: a header opening on an empty cell is indented by that cell
  const indent = tableLines.map(line => line.match(/^\s*/)[0]).reduce((a, b) => (b.length < a.length ? b : a));

  // the separator tells whether rows carry a leading pipe, so that a pipe opening a row of a table without one is an empty cell
  const tableHasLeadingPipe = tableLines[1].trim().startsWith('|');

  const parsedRows = tableLines.map(line => {
    let trimmed = line.trim();
    let hasLeadingPipe = tableHasLeadingPipe && trimmed.startsWith('|');
    let hasTrailingPipe = /(?<!\\)\|$/.test(trimmed);

    if (hasLeadingPipe) trimmed = trimmed.substring(1);
    if (hasTrailingPipe) trimmed = trimmed.substring(0, trimmed.length - 1);

    return {
      // a pipe escaped with a backslash belongs to the cell, inline code or not
      cells: trimmed.split(/(?<!\\)\|/).map(c => c.trim()),
      hasLeadingPipe,
      hasTrailingPipe
    };
  });

  // an empty first cell padded to the width of its column would open the row with four spaces or more, which Markdown reads as an indented code block
  // the row has no leading pipe to stop that, so a placeholder takes the cell
  if (!tableHasLeadingPipe) {
    const firstWidth = Math.max(...parsedRows.filter((row, index) => index !== 1).map(row => row.cells[0].length));
    if (firstWidth >= 4) {
      parsedRows.forEach((row, index) => {
        if (index > 1 && row.cells[0] === '') row.cells[0] = '&nbsp;';
      });
    }
  }

  const colCount = Math.max(...parsedRows.map(r => r.cells.length));
  const colWidths = new Array(colCount).fill(0);

  // calculates max width for each column (skipping the separator row)
  parsedRows.forEach((row, rowIndex) => {
    if (rowIndex === 1) return;
    row.cells.forEach((cell, colIndex) => {
      colWidths[colIndex] = Math.max(colWidths[colIndex], cell.length);
    });
  });

  return parsedRows.map((row, rowIndex) => {
    const formatCell = rowIndex === 1 ? formatSeparatorCell : formatTextCell;
    const formattedCells = colWidths.map((width, colIndex) => formatCell(row.cells[colIndex] || '', width, {
      opensRow: colIndex === 0 && !row.hasLeadingPipe,
      endsRow: colIndex === colCount - 1 && !row.hasTrailingPipe
    }));

    let res = formattedCells.join('|');
    if (row.hasLeadingPipe) res = '|' + res;
    if (row.hasTrailingPipe) res = res + '|';
    return (indent + res).trimEnd();
  });
}

function formatSeparatorCell(cell, width, { opensRow, endsRow }) {
  const startsWithColon = cell.startsWith(':');
  const endsWithColon = cell.endsWith(':');

  // an open-ended last column follows its longest value, as the other columns do
  const dashCount = Math.max(3, width + (opensRow || endsRow ? 1 : 2)); // At least 3 dashes

  // starts empty unless it's a colon (preventing the +1 dash bug)
  let res = startsWithColon ? ':' : '';
  res += '-'.repeat(Math.max(1, dashCount - (startsWithColon ? 1 : 0) - (endsWithColon ? 1 : 0)));
  res += endsWithColon ? ':' : '';
  return res;
}

function formatTextCell(cell, width, { opensRow, endsRow }) {
  if (opensRow) return cell.padEnd(width, ' ') + ' ';
  if (endsRow) return ' ' + cell;
  return ' ' + cell.padEnd(width, ' ') + ' ';
}

// holds the last computed map, since every candidate split position on a line asks about the same text
let mappedText = null;
let mappedPositions = null;

// maps the positions that sit inside inline code, or between a matching pair of quotes a lone quote character,
// such as the apostrophe of "the '90s", closes nothing and protects nothing
function mapProtectedPositions(text) {
  if (text === mappedText) return mappedPositions;

  const positions = new Uint8Array(text.length);

  function protect(from, to) {
    for (let i = from; i <= to; i++) positions[i] = 1;
  }

  // inline code first, where a run of backticks is closed by a run of the same length
  const codeSpan = /(`+)[\s\S]*?\1/g;
  let match;
  while ((match = codeSpan.exec(text)) !== null) {
    protect(match.index, match.index + match[0].length - 1);
  }

  for (const quote of ['"', "'"]) {
    const found = [];

    for (let i = 0; i < text.length; i++) {
      if (text[i] !== quote || positions[i] === 1 || text[i - 1] === '\\') continue;

      // skips apostrophes sitting inside a word
      if (quote === "'" && /[a-zA-Z0-9]/.test(text[i - 1] || '') && /[a-zA-Z0-9]/.test(text[i + 1] || '')) continue;

      found.push(i);
    }

    // pairs the quotes in order and drops any trailing unmatched one
    for (let i = 0; i + 1 < found.length; i += 2) {
      protect(found[i], found[i + 1]);
    }
  }

  mappedText = text;
  mappedPositions = positions;
  return positions;
}

function isInsideQuotesOrCode(text, index) {
  const positions = mapProtectedPositions(text);
  return index >= 0 && index < positions.length && positions[index] === 1;
}

const LINK = /!?\[(?:[^[\]]|!?\[[^\]]*\](?:\([^)]*\))?)*\](?:\([^)]*\))?/g;

let linkedText = null;
let linkSpans = null;

// a link is one unit: neither its text nor its target is a place to end a line or a sentence
function isInsideLink(text, index) {
  if (text !== linkedText) {
    linkedText = text;
    linkSpans = [...text.matchAll(LINK)].map(m => [m.index, m.index + m[0].length]);
  }
  return linkSpans.some(([from, to]) => index >= from && index < to);
}

const INLINE_SPAN = /(`+)[\s\S]*?\1|(?<![\w*])(\*\*?)(?=\S)[^*]+?(?<=\S)\2(?![\w*])|(?<!\w)(__?)(?=\S)[^_]+?(?<=\S)\3(?!\w)/g;

let spannedText = null;
let inlineSpans = null;

function isInsideCodeOrEmphasis(text, index) {
  if (text !== spannedText) {
    spannedText = text;
    inlineSpans = [...text.matchAll(INLINE_SPAN)].map(m => [m.index, m.index + m[0].length]);
  }
  return inlineSpans.some(([from, to]) => index > from && index < to);
}
