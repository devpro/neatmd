const DEFAULT_OPTIONS = {
  maxLineLength: 240,
};

// abbreviations that end on a full stop without ending a sentence single letters,
// which cover "e.g.", "i.e." and initials, are handled by their own rule below a word that also stands on its own, such as "no", stays out: "the answer is no." does end a sentence
const ABBREVIATIONS = [
  'al',
  'approx',
  'cf',
  'Dr',
  'etc',
  'fig',
  'Inc',
  'Ltd',
  'Mr',
  'Mrs',
  'Ms',
  'Prof',
  'ref',
  'vs',
  'ep'
];

// each abbreviation is matched as written and capitalised, since it can open a sentence
const abbreviationAlternatives = [...new Set(
  ABBREVIATIONS.flatMap(word => [word, word[0].toUpperCase() + word.slice(1)])
)].join('|');

// uses hardened semantic line breaks
// 1. (?<!\b(?:etc|ref|...)\.) -> Ignore known abbreviations
// 2. (?<!\b[a-zA-Z]\.) -> Ignore single letters (handles e.g., i.e., initials)
// 3. (?<=[.!?]) -> Must follow a punctuation mark
// 4. \s+ -> Consume the space(s)
// 5. (?=[A-Z0-9`*_'\[]) -> The next word MUST start with a Capital letter, number, or Markdown formatting
const SENTENCE_SPLIT_REGEX = new RegExp(
  `(?<!\\b(?:${abbreviationAlternatives})\\.)(?<!\\b[a-zA-Z]\\.)(?<=[.!?])\\s+(?=[A-Z0-9\`*_'\\[])`
);

export function formatMarkdown(content, options = {}) {
  const maxLineLength = typeof options === 'number'
    ? options
    : (options?.maxLineLength ?? DEFAULT_OPTIONS.maxLineLength);

  const lines = content.split(/\r?\n/);
  const output = [];

  // holds the marker of the fenced block being crossed, such as "```" or "~~~~", and null outside of any block
  let openFence = null;

  function readFence(line) {
    const match = line.trim().match(/^(`{3,}|~{3,})(.*)$/);
    return match ? { marker: match[1], info: match[2] } : null;
  }

  // a fence is closed by at least as many of the same character, with nothing but spaces after it
  function closesFence(fence) {
    return fence.marker[0] === openFence[0]
      && fence.marker.length >= openFence.length
      && fence.info.trim() === '';
  }

  function isSeparatorLine(line) {
    return line.includes('|') && line.includes('-') && line.replace(/[:\-|\s]/g, '') === '';
  }

  // a table is broken by the beginning of another block level structure, whatever pipes that line happens to contain
  function startsNewBlock(line) {
    return /^\s*(#|>|(?:[-*+]|\d+[.)])\s|```|~~~)/.test(line);
  }

  let i = 0;

  // copies front matter verbatim, which is metadata rather than Markdown
  // an opening marker with no closing one is a thematic break, so the document is formatted from the top as usual
  if (lines[0]?.trim() === '---') {
    const closing = lines.findIndex((candidate, index) => index > 0 && candidate.trim() === '---');
    if (closing !== -1) {
      output.push(...lines.slice(0, closing + 1));
      i = closing + 1;
    }
  }

  while (i < lines.length) {
    const line = lines[i];
    const fence = readFence(line);

    // opens and closes fenced blocks, whose content is never touched
    if (openFence) {
      if (fence && closesFence(fence)) {
        openFence = null;
      }
      output.push(line);
      i++;
      continue;
    }

    if (fence) {
      openFence = fence.marker;
      output.push(line);
      i++;
      continue;
    }

    // detects table
    if (line.includes('|') && !startsNewBlock(line) && i + 1 < lines.length && isSeparatorLine(lines[i + 1])) {
      // takes the header and the separator, then every row until a blank line or another block
      let tableLines = [lines[i], lines[i + 1]];
      i += 2;
      while (i < lines.length && lines[i].includes('|') && !startsNewBlock(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      const formattedTable = formatTable(tableLines);
      output.push(...formattedTable);
      continue;
    }

    // detects lines that are strictly badges, images, or links (e.g., [![Alt](url)](url) or [Text](url))
    const isLinkOrImage = /^\s*!?\[.*\]\(.*\)\s*$/.test(line);

    // detects a thematic break, whose first character would otherwise read as a list marker
    const isThematicBreak = /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line);

    // ignores empty lines, headings, thematic breaks, and link/image lines
    if (line.trim() === '' || line.startsWith('#') || isThematicBreak || isLinkOrImage) {
      output.push(line);
      i++;
      continue;
    }

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
    if (textToProcess.trim() === '') {
      output.push(prefix + textToProcess);
      i++;
      continue;
    }

    const rawSentences = textToProcess.split(SENTENCE_SPLIT_REGEX);

    // Re-joins any sentence split that occurred inside quotes or inline code
    const sentences = [];
    let currentSentence = '';
    let currentPos = 0;

    for (let k = 0; k < rawSentences.length; k++) {
      if (k === 0) {
        currentSentence = rawSentences[k];
        currentPos += rawSentences[k].length;
      } else {
        if (isInsideQuotesOrCode(textToProcess, currentPos)) {
          currentSentence += ' ' + rawSentences[k];
        } else {
          sentences.push(currentSentence);
          currentSentence = rawSentences[k];
        }
        currentPos += 1 + rawSentences[k].length;
      }
    }
    if (currentSentence) sentences.push(currentSentence);

    for (let j = 0; j < sentences.length; j++) {
      let sentence = sentences[j];

      // gets the real marker on first sentence, subsequent sentences get blank spaces to align
      let remaining = (j === 0) ? prefix + sentence : indentPrefix + sentence;

      while (remaining.length > maxLineLength) {
        let splitPos = -1;
        const substring = remaining.substring(0, maxLineLength + 1);

        // A. looks for natural sentence breaks in the second half of the line
        const punctuations = ['. ', ': ', '; ', '? ', '! ', ' - '];
        let bestPunctPos = -1;

        for (const p of punctuations) {
          let pos = substring.lastIndexOf(p);

          // ensures we don't break at punctuation that lives inside quotes/code
          while (pos !== -1) {
            const splitAt = p === ' - ' ? pos + 2 : pos + 1;
            if (splitAt > prefix.length && splitAt > bestPunctPos) {
              // asks about the whole line, so a quoted phrase reaching past the limit is still seen as a pair
              if (!isInsideQuotesOrCode(remaining, pos)) {
                bestPunctPos = splitAt;
                break;
              }
            }
            pos = substring.lastIndexOf(p, pos - 1);
          }
        }

        // splits only at punctuation if it's reasonably far into the line (e.g., > 50% of max length)
        if (bestPunctPos >= maxLineLength / 2) {
          splitPos = bestPunctPos;
        } else {
          // B. fallbacks to standard word-wrap (last space before limit)
          const spacePos = substring.lastIndexOf(' ');
          if (spacePos > prefix.length) {
            splitPos = spacePos;
          } else {
            // C. finds the *next* available space, if the word is longer than max length (e.g. long URL) force wraps if a single unbroken word exceeds max limit
            const nextSpace = remaining.indexOf(' ', Math.max(maxLineLength, prefix.length));
            splitPos = nextSpace !== -1 ? nextSpace : remaining.length;
          }
        }

        output.push(remaining.substring(0, splitPos).trimEnd());

        remaining = indentPrefix + remaining.substring(splitPos).trimStart();
      }

      if (remaining.length > 0) {
        output.push(remaining);
      }
    }

    i++;
  }

  // strips trailing empty lines and append exactly one EOF newline
  return output.join('\n').replace(/\n+$/, '') + '\n';
}

function formatTable(tableLines) {
  // a table nested in a list item is held there by its indentation, which the header carries for the whole table
  const indent = tableLines[0].match(/^\s*/)[0];

  const parsedRows = tableLines.map(line => {
    let trimmed = line.trim();
    let hasLeadingPipe = trimmed.startsWith('|');
    let hasTrailingPipe = trimmed.endsWith('|');

    if (hasLeadingPipe) trimmed = trimmed.substring(1);
    if (hasTrailingPipe) trimmed = trimmed.substring(0, trimmed.length - 1);

    return {
      cells: trimmed.split('|').map(c => c.trim()),
      hasLeadingPipe,
      hasTrailingPipe
    };
  });

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
    const isSeparator = rowIndex === 1;
    let formattedCells = [];

    for (let colIndex = 0; colIndex < colCount; colIndex++) {
      let cell = row.cells[colIndex] || '';
      const isFirst = colIndex === 0;
      const isLast = colIndex === colCount - 1;

      if (isSeparator) {
        const startsWithColon = cell.startsWith(':');
        const endsWithColon = cell.endsWith(':');

        let dashCount = 0;
        if (isFirst && !row.hasLeadingPipe) {
          dashCount = colWidths[colIndex] + 1;
        } else if (isLast && !row.hasTrailingPipe) {
          // matches header length for the open-ended last column
          const headerLength = parsedRows[0].cells[colIndex] ? parsedRows[0].cells[colIndex].length : 3;
          dashCount = headerLength + 1;
        } else {
          dashCount = colWidths[colIndex] + 2;
        }

        dashCount = Math.max(3, dashCount); // At least 3 dashes

        // starts empty unless it's a colon (preventing the +1 dash bug)
        let res = startsWithColon ? ':' : '';
        res += '-'.repeat(Math.max(1, dashCount - (startsWithColon ? 1 : 0) - (endsWithColon ? 1 : 0)));
        res += endsWithColon ? ':' : '';

        formattedCells.push(res);
      } else {
        let formattedCell = '';
        if (isFirst && !row.hasLeadingPipe) {
          formattedCell = cell.padEnd(colWidths[colIndex], ' ') + ' ';
        } else if (isLast && !row.hasTrailingPipe) {
          formattedCell = ' ' + cell;
        } else {
          formattedCell = ' ' + cell.padEnd(colWidths[colIndex], ' ') + ' ';
        }
        formattedCells.push(formattedCell);
      }
    }

    let res = formattedCells.join('|');
    if (row.hasLeadingPipe) res = '|' + res;
    if (row.hasTrailingPipe) res = res + '|';
    return (indent + res).trimEnd();
  });
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
