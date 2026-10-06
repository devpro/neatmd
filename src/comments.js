import path from 'node:path';

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
const GENERATED = /\.min\.|\.map$/;

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

// finds where a comment line may be broken, ranked from the most natural break to the least
export function breakCandidates(text) {
  const result = [];
  let parens = 0;
  let inTick = false;
  let inQuote = false;
  let inAngle = false;

  const inlineDepth = new Map(INLINE_TAGS.map(tag => [tag, 0]));
  const tagPattern = new RegExp(`^<(/?)(${INLINE_TAGS.join('|')})[ >]`);

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '`') { inTick = !inTick; continue; }
    if (inTick) continue;
    if (c === '"') { inQuote = !inQuote; continue; }
    if (inQuote) continue;

    if (c === '<') {
      const tag = tagPattern.exec(text.slice(i, i + 12));
      if (tag) inlineDepth.set(tag[2], Math.max(0, inlineDepth.get(tag[2]) + (tag[1] ? -1 : 1)));
      if (/[A-Za-z/]/.test(text[i + 1] ?? '')) { inAngle = true; continue; }
    }
    if (c === '>' && inAngle) { inAngle = false; continue; }
    if (inAngle) continue;
    if ([...inlineDepth.values()].some(depth => depth > 0)) continue;

    if (c === '(') parens++;
    if (c === ')') parens = Math.max(0, parens - 1);
    if (parens > 0) continue;

    const rest = text.slice(i);
    if (c === ';' && text[i + 1] === ' ') {
      result.push({ at: i + 2, rank: 0 });
    } else if (c === ':' && text[i + 1] === ' ' && i > 10) {
      result.push({ at: i + 2, rank: 1 });
    } else if (c === ',' && new RegExp(`^, (${CLAUSE_WORDS})\\b`).test(rest)) {
      result.push({ at: i + 2, rank: 1 });
    } else if (c === ' ' && text[i - 1] !== ',' && /^ (so|and|but|which|since|because|while|where|when|instead of|rather than) /.test(rest)) {
      result.push({ at: i + 1, rank: 3 });
    } else if (c === ',' && text[i + 1] === ' ') {
      result.push({ at: i + 2, rank: 2 });
    }
  }

  return result;
}

// splits text into parts that each fit in room, or returns null when no safe break exists
function splitText(text, room) {
  if (text.length <= room) return [text];

  const candidates = breakCandidates(text).filter(candidate => {
    const head = text.slice(0, candidate.at).trimEnd();
    return head.length >= 30 && text.length - candidate.at >= 20 && head.length <= room;
  });
  if (candidates.length === 0) return null;

  // prefers a stronger break, then the one closest to the middle
  const middle = text.length / 2;
  candidates.sort((a, b) => (a.rank - b.rank) * 25 + (Math.abs(a.at - middle) - Math.abs(b.at - middle)));

  const best = candidates[0];
  const tail = splitText(text.slice(best.at).trimStart(), room);
  if (!tail) return null;
  return [text.slice(0, best.at).trimEnd(), ...tail];
}

// describes how one line is made of a prefix, the comment text and a suffix, or returns null for anything but comment text
// the state tells which kind of multi line comment the line sits in
function readCommentLine(line, state, style) {
  if (style === 'razor') {
    if (state.block === 'razor') {
      const body = /^(\s*)(.*?)(\s*\*@)?\s*$/.exec(line);
      if (body[3]) state.block = null;
      if (!body[2] || /\*@/.test(body[2])) return null;
      return { prefix: body[1], cont: body[1], text: body[2], suffix: body[3] ?? '' };
    }

    const open = /^(\s*)@\*\s?(.*)$/.exec(line);
    if (open) {
      const close = /^(.*?)(\s*\*@)\s*$/.exec(open[2]);
      if (!close) state.block = 'razor';
      const text = close ? close[1] : open[2];
      if (!text || /\*@/.test(text)) return null;
      const lead = line.slice(0, line.indexOf('@*') + 2) + ' ';
      return { prefix: lead, cont: open[1] + '   ', text, suffix: close ? close[2] : '' };
    }
  }

  if (style === 'slash' || style === 'razor') {
    if (state.block === 'c') {
      if (/\*\//.test(line)) state.block = null;
      const star = /^(\s*\*\s?)(?!\/)/.exec(line);
      return star ? { prefix: star[1], cont: star[1], text: line.slice(star[1].length), suffix: '' } : null;
    }

    const slash = /^(\s*\/\/\/?\s?)/.exec(line);
    if (slash) return { prefix: slash[1], cont: slash[1], text: line.slice(slash[1].length), suffix: '' };

    if (/^\s*\/\*(?!.*\*\/)/.test(line)) state.block = 'c';
    return null;
  }

  const hash = /^(\s*#(?!!)\s?)/.exec(line);
  return hash ? { prefix: hash[1], cont: hash[1], text: line.slice(hash[1].length), suffix: '' } : null;
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
