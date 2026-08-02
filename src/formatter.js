export function formatMarkdown(content, maxLineLength) {
    const lines = content.split(/\r?\n/);
    const output = [];
    let inCodeBlock = false;

    for (let line of lines) {
        // toggles code block state
        if (line.startsWith('```')) {
            inCodeBlock = !inCodeBlock;
            output.push(line);
            continue;
        }

        // ignores code blocks, empty lines, headings, and tables
        if (inCodeBlock || line.trim() === '' || line.startsWith('#') || line.startsWith('|')) {
            output.push(line);
            continue;
        }

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
    }

    // strips any trailing newlines generated during the split/join cycle, and append exactly one
    return output.join('\n').replace(/\n+$/, '') + '\n';
}
