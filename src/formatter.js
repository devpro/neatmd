const DEFAULT_OPTIONS = {
  maxLineLength: 240,
};

export function formatMarkdown(content, options = {}) {
  const maxLineLength = typeof options === 'number'
    ? options
    : (options?.maxLineLength ?? DEFAULT_OPTIONS.maxLineLength);

  const lines = content.split(/\r?\n/);
  const output = [];
  let inCodeBlock = false;

  function isSeparatorLine(line) {
    return line.includes('|') && line.includes('-') && line.replace(/[:\-|\s]/g, '') === '';
  }

  let i = 0;
  while (i < lines.length) {
    let line = lines[i];

    // toggles code blocks
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      output.push(line);
      i++;
      continue;
    }

    if (inCodeBlock) {
      output.push(line);
      i++;
      continue;
    }

    // detects table
    if (line.includes('|') && i + 1 < lines.length && isSeparatorLine(lines[i + 1])) {
      let tableLines = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const formattedTable = formatTable(tableLines);
      output.push(...formattedTable);
      continue;
    }

    // detects lines that are strictly badges, images, or links (e.g., [![Alt](url)](url) or [Text](url))
    const isLinkOrImage = /^\s*!?\[.*\]\(.*\)\s*$/.test(line);

    // ignores empty lines, headings, and link/image lines
    if (line.trim() === '' || line.startsWith('#') || isLinkOrImage) {
      output.push(line);
      i++;
      continue;
    }

    // uses standard wrap logic
    let remaining = line;

    while (remaining.length > maxLineLength) {
      let splitPos = -1;
      const substring = remaining.substring(0, maxLineLength + 1);

      // A. looks for natural sentence breaks in the second half of the line
      const punctuations = ['. ', ': ', '; ', '? ', '! ', ' - '];
      let bestPunctPos = -1;

      for (const p of punctuations) {
        const pos = substring.lastIndexOf(p);
        if (pos !== -1) {
          // includes the punctuation in the current line, break before the space
          const splitAt = p === ' - ' ? pos + 2 : pos + 1;
          if (splitAt > bestPunctPos) {
            bestPunctPos = splitAt;
          }
        }
      }

      // splits only at punctuation if it's reasonably far into the line (e.g., > 50% of max length)
      if (bestPunctPos >= maxLineLength / 2) {
        splitPos = bestPunctPos;
      } else {
        // B. fallbacks to standard word-wrap (last space before limit)
        const spacePos = substring.lastIndexOf(' ');
        if (spacePos > 0) {
          splitPos = spacePos;
        } else {
          // C. finds the *next* available space, if the word is longer than max length (e.g. long URL)
          const nextSpace = remaining.indexOf(' ', maxLineLength);
          splitPos = nextSpace !== -1 ? nextSpace : remaining.length;
        }
      }

      output.push(remaining.substring(0, splitPos).trimEnd());

      remaining = remaining.substring(splitPos).trimStart();
    }

    if (remaining.length > 0) {
      output.push(remaining);
    }

    i++;
  }

  // strips trailing empty lines and append exactly one EOF newline
  return output.join('\n').replace(/\n+$/, '') + '\n';
}

function formatTable(tableLines) {
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

  // calculatess max width for each column (skipping the separator row)
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
          // Match header length for the open-ended last column
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
    return res.trimEnd();
  });
}
