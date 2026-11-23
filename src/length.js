// lists the lines of a formatted document that stay over the limit, which are those it has no right place to cut: table rows and headings
// front matter and fenced code are copied verbatim, and a line whose overflow holds no space is left whole on purpose, so none of them is listed
export function findLongLines(content, maxLineLength) {
  const lines = content.split('\n');
  const found = [];
  let fence = null;
  let i = 0;

  if (lines[0].trim() === '---') {
    i = lines.findIndex((line, index) => index > 0 && line.trim() === '---') + 1;
  }

  for (; i < lines.length; i++) {
    const line = lines[i];
    const marker = line.match(/^\s*(`{3,}|~{3,})(.*)$/);

    if (fence) {
      if (marker?.[1].startsWith(fence) && marker[2].trim() === '') fence = null;
      continue;
    }
    if (marker) {
      fence = marker[1];
      continue;
    }

    const isLinkOnly = /^\s*!?\[.*\]\(.*\)\s*$/.test(line);
    if (line.length > maxLineLength && !isLinkOnly && /\s/.test(line.slice(maxLineLength))) {
      found.push({ line: i + 1, length: line.length });
    }
  }

  return found;
}
