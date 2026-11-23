const CONTEXT = 3;

// pairs the lines found exactly once on both sides, keeping the longest run of them in the same order
function anchors(before, after) {
  const count = lines => {
    const seen = new Map();
    lines.forEach((line, index) => seen.set(line, seen.has(line) ? -1 : index));
    return seen;
  };
  const inBefore = count(before);
  const inAfter = count(after);

  const piles = [];
  for (const [line, from] of inBefore) {
    const to = inAfter.get(line) ?? -1;
    if (from === -1 || to === -1) continue;

    let low = 0;
    let high = piles.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (piles[middle].to < to) low = middle + 1;
      else high = middle;
    }
    piles[low] = { from, to, previous: piles[low - 1] };
  }

  const chain = [];
  for (let node = piles.at(-1); node; node = node.previous) chain.unshift(node);
  return chain;
}

// a patience diff: it stays fast when most of a long file changes, where a minimal diff takes quadratic time or memory
function compare(before, after) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start && before.at(-1 - end) === after.at(-1 - end)) end++;

  const mark = (sign, lines) => lines.map(text => ({ sign, text }));
  const oldLines = before.slice(start, before.length - end);
  const newLines = after.slice(start, after.length - end);
  const middle = [];
  const pairs = anchors(oldLines, newLines);

  if (pairs.length === 0) {
    middle.push(mark('-', oldLines), mark('+', newLines));
  } else {
    let from = 0;
    let to = 0;
    for (const pair of pairs) {
      middle.push(compare(oldLines.slice(from, pair.from), newLines.slice(to, pair.to)), mark(' ', [oldLines[pair.from]]));
      from = pair.from + 1;
      to = pair.to + 1;
    }
    middle.push(compare(oldLines.slice(from), newLines.slice(to)));
  }

  return [mark(' ', before.slice(0, start)), middle.flat(), mark(' ', before.slice(before.length - end))].flat();
}

// keeps the newline in each line, so that a missing final newline is a difference as any other
function toLines(content) {
  return content.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

// returns the hunks of a unified diff, and an empty text when nothing differs
export function unifiedDiff(before, after) {
  const edits = compare(toLines(before), toLines(after));

  // changes whose context lines touch share a hunk
  const ranges = [];
  edits.forEach((edit, index) => {
    if (edit.sign === ' ') return;
    const from = Math.max(0, index - CONTEXT);
    const to = Math.min(edits.length, index + CONTEXT + 1);
    if (ranges.length > 0 && from <= ranges.at(-1).to) ranges.at(-1).to = to;
    else ranges.push({ from, to });
  });

  let oldLine = 0;
  let newLine = 0;
  let position = 0;
  const advance = to => {
    for (; position < to; position++) {
      if (edits[position].sign !== '+') oldLine++;
      if (edits[position].sign !== '-') newLine++;
    }
  };

  // an empty side is numbered from the line before it, as diff and patch do
  const span = (start, length) => `${length === 0 ? start : start + 1},${length}`;

  return ranges.map(({ from, to }) => {
    advance(from);
    const [oldStart, newStart] = [oldLine, newLine];
    advance(to);
    const body = edits.slice(from, to)
      .map(({ sign, text }) => sign + (text.endsWith('\n') ? text : `${text}\n\\ No newline at end of file\n`))
      .join('');
    return `@@ -${span(oldStart, oldLine - oldStart)} +${span(newStart, newLine - newStart)} @@\n${body}`;
  }).join('');
}
