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

  // a table is broken by the beginning of another block level structure, whatever pipes that line happens to contain
  function startsNewBlock(line) {
    return /^\s*(#|>|(?:[-*+]|\d+[.)])\s|```|~~~)/.test(line);
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

    // ignores empty lines, headings, and link/image lines
    if (line.trim() === '' || line.startsWith('#') || isLinkOrImage) {
      output.push(line);
      i++;
      continue;
    }

    // isolates blockquotes, ordered lists (1., 2)), and unordered lists (-, *, +)
    const prefixMatch = line.match(/^(\s*(?:>\s*)*)((?:[-*+]|\d+[.)])\s+)?/);
    const bqPart = prefixMatch[1] || '';
    const listPart = prefixMatch[2] || '';

    const prefix = bqPart + listPart; // E.g., "  1. "
    const indentPrefix = bqPart + ' '.repeat(listPart.length); // E.g., "     "
    const textToProcess = line.substring(prefix.length);

    // keeps marker only lines, such as the ">" separating two blockquote paragraphs, since there is no text to split
    if (textToProcess.trim() === '') {
      output.push(line);
      i++;
      continue;
    }

    // uses hardened semantic line breaks
    // 1. (?<!\b(?:etc|vs|Mr|Mrs|Dr|Prof|Inc|Ltd)\.) -> Ignore common multi-letter abbreviations
    // 2. (?<!\b[a-zA-Z]\.) -> Ignore single letters (handles e.g., i.e., initials)
    // 3. (?<=[.!?]) -> Must follow a punctuation mark
    // 4. \s+ -> Consume the space(s)
    // 5. (?=[A-Z0-9`*_'\[]) -> The next word MUST start with a Capital letter, number, or Markdown formatting
    const sentenceSplitRegex = /(?<!\b(?:etc|vs|Mr|Mrs|Dr|Prof|Inc|Ltd)\.)(?<!\b[a-zA-Z]\.)(?<=[.!?])\s+(?=[A-Z0-9`*_'\[])/;
    const rawSentences = textToProcess.split(sentenceSplitRegex);

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
              if (!isInsideQuotesOrCode(substring, pos)) {
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
            // C. finds the *next* available space, if the word is longer than max length (e.g. long URL)
            // force wraps if a single unbroken word exceeds max limit
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
    return res.trimEnd();
  });
}

function isInsideQuotesOrCode(text, index) {
  let inBackticks = false;
  let inDoubleQuotes = false;
  let inSingleQuotes = false;

  for (let i = 0; i < index; i++) {
    const char = text[i];
    const prevChar = i > 0 ? text[i - 1] : '';
    const nextChar = i < text.length - 1 ? text[i + 1] : '';

    if (prevChar === '\\') continue;

    if (char === '`') {
      inBackticks = !inBackticks;
    } else if (char === '"' && !inBackticks) {
      inDoubleQuotes = !inDoubleQuotes;
    } else if (char === "'" && !inBackticks) {
      // handles apostrophes in words
      const isWordBefore = /[a-zA-Z0-9]/.test(prevChar);
      const isWordAfter = /[a-zA-Z0-9]/.test(nextChar);
      if (!(isWordBefore && isWordAfter)) {
        inSingleQuotes = !inSingleQuotes;
      }
    }
  }

  return inBackticks || inDoubleQuotes || inSingleQuotes;
}
