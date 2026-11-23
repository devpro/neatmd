import path from 'node:path';
import { endsOnAbbreviation } from './abbreviations.js';

const DEFAULT_COMMENT_LENGTH = 180;

const STYLE_BY_EXTENSION = {
  '.cs': 'slash',
  '.js': 'slash',
  '.mjs': 'slash',
  '.cjs': 'slash',
  '.ts': 'slash',
  '.tsx': 'slash',
  '.jsx': 'slash',
  '.css': 'slash',
  '.scss': 'slash',
  '.razor': 'razor',
  '.cshtml': 'razor',
  '.sh': 'hash',
  '.yml': 'hash',
  '.yaml': 'hash'
};

// generated and vendored output is never edited
const GENERATED = /(?:\.min\.)|(?:\.map$)/;

// elements that wrap running text inside a comment, which a break must not cross
const INLINE_TAGS = ['c', 'i', 'b', 'em', 'strong', 'code'];

const CLAUSE_WORDS = 'so|and|but|which|since|because|while|where|when|then|or|not|never|rather|instead|with|without|only|unless|until|if|as';

export function commentStyleOf(filePath) {
  if (GENERATED.test(filePath)) return null;
  return STYLE_BY_EXTENSION[path.extname(filePath).toLowerCase()] ?? null;
}

export function defaultCommentLength() {
  return DEFAULT_COMMENT_LENGTH;
}

const INLINE_TAG = new RegExp(`^<(/?)(${INLINE_TAGS.join('|')})[ >]`);
const CLAUSE_START = new RegExp(String.raw`^, (${CLAUSE_WORDS})\b`);

// finds where a comment line may be broken, ranked from the most natural break to the least
// a plain space is a candidate only when asked for, as the last resort of a text with no other boundary
// a boundary inside parentheses is one only when asked for, for a line held by a parenthesis from start to end
export function breakCandidates(text, { words = false, insideParens = false } = {}) {
  const result = [];
  const state = { parens: 0, inTick: false, inQuote: false, inAngle: false, insideTag: false, depths: new Map(INLINE_TAGS.map(tag => [tag, 0])) };

  for (let i = 0; i < text.length; i++) {
    if (isProtected(text, i, state)) continue;

    if (text[i] === '(') state.parens++;
    if (text[i] === ')') state.parens = Math.max(0, state.parens - 1);
    if (state.parens > 0 && !insideParens) continue;

    const candidate = boundaryAt(text, i, words);
    if (candidate) result.push(candidate);
  }

  return result;
}

// tells whether a character sits inside inline code, quotes, a tag or the text of an inline element, and moves the state past it
function isProtected(text, i, state) {
  const c = text[i];

  if (c === '`') { state.inTick = !state.inTick; return true; }
  if (state.inTick) return true;
  if (c === '"') { state.inQuote = !state.inQuote; return true; }
  if (state.inQuote) return true;
  return isInsideAngle(text, i, state) || state.insideTag;
}

function isInsideAngle(text, i, state) {
  if (text[i] === '<') {
    trackInlineTag(text.slice(i, i + 12), state);
    if (/[A-Za-z/]/.test(text[i + 1] ?? '')) state.inAngle = true;
  } else if (text[i] === '>' && state.inAngle) {
    state.inAngle = false;
    return true;
  }
  return state.inAngle;
}

function trackInlineTag(text, state) {
  const tag = INLINE_TAG.exec(text);
  if (!tag) return;
  state.depths.set(tag[2], Math.max(0, state.depths.get(tag[2]) + (tag[1] ? -1 : 1)));
  state.insideTag = [...state.depths.values()].some(depth => depth > 0);
}

function boundaryAt(text, i, words) {
  const c = text[i];
  if (c === ' ') return spaceBoundary(text, i, words);
  if (text[i + 1] !== ' ') return null;

  switch (c) {
    case '.':
    case '!':
    case '?':
      return endsSentence(text, i) ? { at: i + 2, rank: 0 } : null;
    case ';':
      return { at: i + 2, rank: 1 };
    case ':':
      return i > 10 && !isKeyColon(text, i) ? { at: i + 2, rank: 2 } : null;
    case ',':
      return { at: i + 2, rank: CLAUSE_START.test(text.slice(i)) ? 2 : 3 };
    default:
      return null;
  }
}

function endsSentence(text, i) {
  return /[A-Z0-9`'"]/.test(text[i + 2] ?? '') && !(text[i] === '.' && endsOnAbbreviation(text.slice(0, i + 1)));
}

function spaceBoundary(text, i, words) {
  const rest = text.slice(i);

  // the dash ends the line, since a continuation opening on a dash reads as a list item
  if (/^ [–—] /.test(rest)) return { at: i + 3, rank: 2 };
  if (text[i - 1] !== ',' && /^ (so|and|but|which|since|because|while|where|when|instead of|rather than) /.test(rest)) {
    return { at: i + 1, rank: 4 };
  }
  if (words && text[i + 1] !== ' ' && !/^ (?:[-*+]|\d+[.)])\s/.test(rest)) return { at: i + 1, rank: 5 };
  return null;
}

// a colon closing a dotted or snake_case key, or followed by a literal, belongs to a key and value such as "enabled: false"
function isKeyColon(text, i) {
  // the key is read backwards from the colon, since a pattern anchored there would be tried from every position of the text
  let start = i;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  return /[._]/.test(text.slice(start, i)) || /^: (?:true|false|null|\d)/.test(text.slice(i));
}

// splits text into parts that each fit in room, or returns null when no safe break exists
// a plain word break is taken only when no clause boundary fits, so one part without a boundary no longer leaves the whole line unsplit
function splitText(text, room) {
  if (text.length <= room) return [text];

  const fits = candidate => {
    const head = text.slice(0, candidate.at).trimEnd();
    return head.length >= 30 && text.length - candidate.at >= 20 && head.length <= room;
  };
  let candidates = breakCandidates(text).filter(fits);
  if (candidates.length === 0) {
    // a word break carries no meaning of its own, so the line is filled as far as it goes, as a plain word wrap would
    const words = breakCandidates(text, { words: true }).filter(fits).sort((a, b) => b.at - a.at);
    if (words.length === 0) return null;
    const tail = splitText(text.slice(words[0].at).trimStart(), room);
    return tail ? [text.slice(0, words[0].at).trimEnd(), ...tail] : null;
  }

  // prefers a stronger break, then the one closest to the middle
  const middle = text.length / 2;
  candidates.sort((a, b) => (a.rank - b.rank) * 25 + (Math.abs(a.at - middle) - Math.abs(b.at - middle)));

  const best = candidates[0];
  const tail = splitText(text.slice(best.at).trimStart(), room);
  if (!tail) return null;
  return [text.slice(0, best.at).trimEnd(), ...tail];
}

// separates the text of a comment from the marker closing it at the end of the line, taken with the spaces before it
// the suffix is null when the line does not end on the marker
function readClosing(text, marker) {
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith(marker)) return { body: trimmed, suffix: null };
  const body = trimmed.slice(0, -marker.length).trimEnd();
  return { body, suffix: trimmed.slice(body.length) };
}

// describes how one line is made of a prefix, the comment text and a suffix, or returns null for anything but comment text
// the state tells which kind of multi line comment the line sits in
function readCommentLine(line, state, style) {
  if (style === 'hash') return readHashLine(line);
  if (style === 'razor') {
    if (state.block === 'razor') return readRazorBlockLine(line, state);
    const open = /^(\s*)@\*\s?(.*)$/.exec(line);
    if (open) return readRazorOpening(line, open, state);
  }
  return readSlashLine(line, state);
}

function readRazorBlockLine(line, state) {
  const lead = /^\s*/.exec(line)[0];
  const { body, suffix } = readClosing(line.slice(lead.length), '*@');
  if (suffix !== null) state.block = null;
  if (!body || body.includes('*@')) return null;
  return { prefix: lead, cont: lead, text: body, suffix: suffix ?? '' };
}

function readRazorOpening(line, open, state) {
  const { body, suffix } = readClosing(open[2], '*@');
  if (suffix === null) state.block = 'razor';
  const text = suffix === null ? open[2] : body;
  if (!text || text.includes('*@')) return null;
  const lead = line.slice(0, line.indexOf('@*') + 2) + ' ';
  return { prefix: lead, cont: open[1] + '   ', text, suffix: suffix ?? '' };
}

function readSlashLine(line, state) {
  if (state.block === 'c') {
    if (/\*\//.test(line)) state.block = null;
    const star = /^(\s*\*\s?)(?!\/)/.exec(line);
    return star ? { prefix: star[1], cont: star[1], text: line.slice(star[1].length), suffix: '' } : null;
  }

  const slash = /^(\s*\/\/\/?\s?)/.exec(line);
  if (slash) return { prefix: slash[1], cont: slash[1], text: line.slice(slash[1].length), suffix: '' };

  const single = /^(\s*)(\/\*\s?)(.*)$/.exec(line);
  if (single) {
    const { body, suffix } = readClosing(single[3], '*/');
    if (suffix !== null && !/\*\/|\/\*/.test(body)) {
      return { prefix: single[1] + single[2], cont: single[1] + '   ', text: body, suffix };
    }
  }

  if (/^\s*\/\*(?!.*\*\/)/.test(line)) state.block = 'c';
  return null;
}

function readHashLine(line) {
  const hash = /^(\s*#(?!!)\s?)/.exec(line);
  if (!hash) return null;

  // a commented-out setting carrying its own trailing comment is code, which a split would scatter over two lines
  const text = line.slice(hash[1].length);
  if (/^[\w.-]+:\s.*\s#\s/.test(text)) return null;
  return { prefix: hash[1], cont: hash[1], text, suffix: '' };
}

// breaks comment lines longer than maxLength at clause boundaries, and changes nothing else
// a line with no safe break is left whole and reported
export function splitComments(content, maxLength = DEFAULT_COMMENT_LENGTH, style = 'slash') {
  const eol = content.includes('\r\n') ? '\r\n' : '\n';
  const lines = content.split(/\r?\n/);
  const state = { block: null };
  const output = [];
  const stuck = [];
  let split = 0;

  lines.forEach((line, index) => {
    const parts = readCommentLine(line, state, style);
    if (!parts || line.length <= maxLength) {
      output.push(line);
      return;
    }

    const list = /^(-|\d+\.|\d+\))\s/.exec(parts.text);
    const cont = list ? parts.cont + ' '.repeat(list[0].length) : parts.cont;
    const pieces = splitText(parts.text, maxLength - cont.length - parts.suffix.length);

    if (!pieces) {
      stuck.push({ line: index + 1, text: line.trim().slice(0, 100) });
      output.push(line);
      return;
    }

    pieces.forEach((piece, n) => {
      const last = n === pieces.length - 1;
      output.push((n === 0 ? parts.prefix : cont) + piece + (last ? parts.suffix : ''));
    });
    split++;
  });

  return { content: output.join(eol), split, stuck };
}
