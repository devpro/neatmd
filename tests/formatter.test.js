import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatMarkdown } from '../src/index.js';

test('formats sentence line-breaks under 240 char max line length', () => {
  const input = readFileSync(
    new URL('./fixtures/wrap.in.md', import.meta.url),
    'utf-8'
  );
  const expected = readFileSync(
    new URL('./fixtures/wrap.out.md', import.meta.url),
    'utf-8'
  );

  const options = {
    maxLineLength: 240,
    trimTrailingWhitespace: false,
    insertFinalNewline: true
  };

  const result = formatMarkdown(input, options.maxLineLength);

  assert.equal(result, expected);
});

test('leaves a document without content empty', () => {
  // a final newline added to an empty file shows up as a second, invalid line
  assert.equal(formatMarkdown('', 240), '');
  assert.equal(formatMarkdown('\n', 240), '');
  assert.equal(formatMarkdown('   \n\n  \n', 240), '');
});

test('empties a line holding nothing but spaces', () => {
  assert.equal(formatMarkdown('One.\n   \nTwo.\n', 240), 'One.\n\nTwo.\n');
  assert.equal(formatMarkdown('- Item\n\t\n- Other\n', 240), '- Item\n\n- Other\n');

  // the trailing spaces of a line with content are a hard line break and stay
  assert.equal(formatMarkdown('One.  \nTwo.\n', 240), 'One.  \nTwo.\n');
  assert.equal(formatMarkdown('> Hello  \n> world!\n', 240), '> Hello  \n> world!\n');

  // spacing is content inside a fenced block and inside front matter
  assert.equal(formatMarkdown('```text\n   \n```\n', 240), '```text\n   \n```\n');
  assert.equal(formatMarkdown('---\na: 1\n   \n---\n\nBody.\n', 240), '---\na: 1\n   \n---\n\nBody.\n');
});

test('does not end a sentence on a known abbreviation', () => {
  const kept = [
    '- Connect to Azure (ref. [Sign in](https://example.com/pat))\n',
    'The rule is documented (cf. [Section 2](https://example.com)) already.\n',
    'It weighs approx. 3 kilos.\n',
    'See fig. 4 for the layout.\n',
    'Written by Barnes et al. [2019](https://example.com) last year.\n',
    'Tabs, spaces, etc. [Nothing](https://example.com) settles it.\n'
  ];

  for (const input of kept) {
    assert.equal(formatMarkdown(input, 240), input);
  }

  // a real sentence boundary is still one, including right after an abbreviation
  assert.equal(
    formatMarkdown('The ref. [Doc](https://example.com) helps. Another sentence.\n', 240),
    'The ref. [Doc](https://example.com) helps.\nAnother sentence.\n'
  );
});

test('writes unordered list markers as a dash', () => {
  assert.equal(formatMarkdown('* Item\n+ Other\n- Third\n', 240), '- Item\n- Other\n- Third\n');
  assert.equal(formatMarkdown('- Item\n  * Nested\n', 240), '- Item\n  - Nested\n');
  assert.equal(formatMarkdown('> * Quoted item\n', 240), '> - Quoted item\n');

  // ordered markers keep their own punctuation
  assert.equal(formatMarkdown('1. Item\n2) Other\n', 240), '1. Item\n2) Other\n');

  // a thematic break is not a list, and neither is emphasis
  const untouched = ['* * *\n', '***\n', '- - -\n', '___\n', '*emphasis* to start a line.\n'];
  for (const input of untouched) {
    assert.equal(formatMarkdown(input, 240), input);
  }
});

test('only protects text held between a matching pair of quotes', () => {
  // an unmatched quote character must not swallow the rest of the line
  assert.equal(
    formatMarkdown("The '90s were a good decade. This still starts a line.\n", 240),
    "The '90s were a good decade.\nThis still starts a line.\n"
  );
  assert.equal(
    formatMarkdown('A 6" nail went in. This still starts a line.\n', 240),
    'A 6" nail went in.\nThis still starts a line.\n'
  );
  assert.equal(
    formatMarkdown('Count the ` backtick. This still starts a line.\n', 240),
    'Count the ` backtick.\nThis still starts a line.\n'
  );

  // a matching pair still holds its sentences together
  assert.equal(
    formatMarkdown('It told me "Hey. Santiago". And then left.\n', 240),
    'It told me "Hey. Santiago".\nAnd then left.\n'
  );
  assert.equal(
    formatMarkdown('Run `npm test. Again` now. Then stop.\n', 240),
    'Run `npm test. Again` now.\nThen stop.\n'
  );
});

test('splits a line holding thousands of sentences in reasonable time', () => {
  // the quote state used to be rebuilt from the start of the line for every candidate split
  const input = 'Aa bb. '.repeat(20000).trim() + '\n';

  const start = Date.now();
  const result = formatMarkdown(input, 240);
  const elapsed = Date.now() - start;

  assert.equal(result.split('\n').length, 20001);
  assert.ok(elapsed < 3000, `formatting took ${elapsed} ms`);
});

test('leaves front matter untouched', () => {
  const input = '---\ntitle: Example\ndescription: One sentence. Another sentence.\n---\n\nOne. Two\n';
  const expected = '---\ntitle: Example\ndescription: One sentence. Another sentence.\n---\n\nOne.\nTwo\n';

  assert.equal(formatMarkdown(input, 240), expected);
});

test('only treats a leading fence of dashes as front matter when it is closed', () => {
  // an opening marker with no closing one is a thematic break, and the text below it is ordinary prose
  assert.equal(formatMarkdown('---\nOne. Two\n', 240), '---\nOne.\nTwo\n');

  // a thematic break in the middle of a document never opens front matter
  assert.equal(
    formatMarkdown('Intro. Here\n\n---\n\ntitle: One. Two\n', 240),
    'Intro.\nHere\n\n---\n\ntitle: One.\nTwo\n'
  );
});

test('leaves the content of every kind of fenced block alone', () => {
  const cases = [
    // tilde fences are as valid as backtick fences
    '~~~bash\nls. Then stop\n~~~\n',
    // a fence is only closed by at least as many of the same character
    '````markdown\n```bash\nls. Then stop\n```\n````\n',
    '~~~~\n~~~\nls. Then stop\n~~~\n~~~~\n',
    // a backtick line never closes a tilde block, and the other way round
    '~~~\nls. Then stop\n```\nmore. Text\n~~~\n',
    // a closing fence carries no info string, so this one stays inside the block
    '````\n```js\nconst a = 1. Then two\n```\n````\n'
  ];

  for (const input of cases) {
    assert.equal(formatMarkdown(input, 240), input);
  }
});

test('formats again after a fenced block is closed', () => {
  const input = '~~~bash\nls. Then stop\n~~~\n\nOne. Two\n';
  const expected = '~~~bash\nls. Then stop\n~~~\n\nOne.\nTwo\n';

  assert.equal(formatMarkdown(input, 240), expected);
});

test('keeps the blocks written right after a table out of it', () => {
  // a swallowed block would show up as a column widened to the length of that line
  const input = readFileSync(
    new URL('./fixtures/table-break.in.md', import.meta.url),
    'utf-8'
  );
  const expected = readFileSync(
    new URL('./fixtures/table-break.out.md', import.meta.url),
    'utf-8'
  );

  assert.equal(formatMarkdown(input, 240), expected);
});

test('keeps the indentation of a table nested in a list item', () => {
  // without the indentation the table would no longer belong to the item, and the list would restart below it
  const input = '1. Uno\n\n    Col 1 | Col 2\n    -|-\n    One | Foo\n\n2. Dos\n';
  const expected = '1. Uno\n\n    Col 1 | Col 2\n    ------|------\n    One   | Foo\n\n2. Dos\n';

  assert.equal(formatMarkdown(input, 240), expected);
});

test('sizes the separator of an open-ended last column on its longest value', () => {
  const input = 'Key | Value\n-|-\na | a much longer value\n';
  const expected = 'Key | Value\n----|--------------------\na   | a much longer value\n';

  assert.equal(formatMarkdown(input, 240), expected);
});

test('stops a table at the first line that opens another block', () => {
  const table = 'Key | Value\n----|------\na   | b\n';

  // a table is broken by the beginning of another block level structure, so these lines are never table rows
  const interrupters = [
    '# Heading with a | pipe',
    '> quote with a | pipe',
    '```text | fence'
  ];

  for (const interrupter of interrupters) {
    const result = formatMarkdown(table + interrupter + '\n', 240);
    assert.equal(result, table + interrupter + '\n');
  }
});

test('keeps a row opening on a list marker in the table', () => {
  const input = 'Step | Meaning\n-|-\n1. The cluster | runs\n- The identity | proves\n';
  const expected = 'Step           | Meaning\n---------------|--------\n1. The cluster | runs\n- The identity | proves\n';

  assert.equal(formatMarkdown(input, 240), expected);
});

test('keeps a row with an empty first cell from reading as an indented code block', () => {
  const input = 'Name | Value\n-|-\nlonger name | a\n | b\n';
  const result = formatMarkdown(input, 240).split('\n');

  assert.ok(result.every(line => !/^ {4}/.test(line)), result.join('\n'));
  assert.equal(result[3], '&nbsp;      | b');
});

test('does not open a table on a line that belongs to another block', () => {
  const cases = [
    '# Heading | Other\n---|---\n',
    '- item | other\n---|---\n',
    '> quote | other\n---|---\n'
  ];

  for (const input of cases) {
    assert.equal(formatMarkdown(input, 240), input);
  }
});

test('keeps marker only lines that carry no text', () => {
  const cases = [
    '> Hello:\n>\n> World\n',
    '> > Nested:\n> >\n> > Quote\n',
    '1. First\n\n   > Quoted:\n   >\n   > Continued\n',
    '- First\n-\n- Second\n'
  ];

  for (const input of cases) {
    assert.equal(formatMarkdown(input, 240), input);
  }
});

test('breaks an overlong sentence at a clause boundary rather than at a random word', () => {
  const input = 'This sentence is long enough to need a break somewhere, and the clause boundary is the natural place to put it, rather than a random word.\n';
  const expected = 'This sentence is long enough to need a break somewhere,\nand the clause boundary is the natural place to put it, rather than a random word.\n';

  assert.equal(formatMarkdown(input, 90), expected);
});

test('never breaks a clause inside a link text, inline code or quotes', () => {
  const input = 'Some words that lead up to the link [read this, and then that, so be it](https://example.com/a-long-target) and carry on after it.\n';
  const result = formatMarkdown(input, 80);

  // the commas inside the link text are not clause boundaries
  for (const line of result.split('\n')) {
    assert.ok(!/(this|that),$/.test(line), `clause break inside the link text: ${line}`);
  }
});

test('falls back to the last space when a line has no clause boundary', () => {
  const input = 'word '.repeat(30).trim() + '\n';
  const result = formatMarkdown(input, 60);

  assert.ok(result.split('\n').every(line => line.length <= 60));
});

test('keeps an escaped pipe inside its table cell', () => {
  const input = 'Command | Does\n-|-\n`a \\| b` | pipes\n`c` | plain\n';
  const expected = 'Command  | Does\n---------|------\n`a \\| b` | pipes\n`c`      | plain\n';

  assert.equal(formatMarkdown(input, 240), expected);
});

test('reads a leading empty header cell of a table with no leading pipe as a cell, not as indentation', () => {
  const input = '     | SDK | Runtime\n-----|-----|--------\nUsed | A   | B\n';
  const expected = '     | SDK | Runtime\n-----|-----|--------\nUsed | A   | B\n';

  assert.equal(formatMarkdown(input, 240), expected);
});

test('never breaks a line inside a link text at a space', () => {
  const link = '[dynamic inventory](https://example.com/inventory_guide/intro_dynamic_inventory.html)';
  const input = `- Lead words that fill most of the line before the link ${link}.\n`;
  const result = formatMarkdown(input, 80);

  assert.ok(result.includes(link), `link was cut:\n${result}`);
});

test('never splits a sentence inside a link text', () => {
  const link = '[MinIO images gone? Best alternatives](https://example.com/minio-images-gone)';
  const input = `> The story: ${link}, by someone.\n`;

  assert.equal(formatMarkdown(input, 240), input);
});

test('never starts a continuation line on a marker that opens a block', () => {
  // a continuation opening on "- " or "1. " would render as a new list item, and on "#" or ">" as a heading or a quote
  for (const marker of ['-', '+', '*', '1.', '2)', '#', '>']) {
    const input = `${'word '.repeat(10)}${marker} tail words that carry on after it\n`;
    const lines = formatMarkdown(input, 50).trimEnd().split('\n');

    assert.ok(lines.length > 1, `no break for ${marker}`);
    for (const line of lines.slice(1)) {
      assert.ok(!/^\s*(?:[-*+>#]|\d+[.)])(?:\s|$)/.test(line), `continuation opens a block: ${line}`);
    }
    assert.equal(lines.join(' '), input.trimEnd());
  }

  // a sentence opening on a marker stays on the line of the sentence before it
  assert.equal(formatMarkdown('Fill the form. * marks a required field.\n', 240), 'Fill the form. * marks a required field.\n');
  assert.equal(formatMarkdown('Steps follow. 1) Open the file. Then save.\n', 240), 'Steps follow. 1) Open the file.\nThen save.\n');
});

test('keeps a date after a long link on the line of its dash', () => {
  const link = `[${'a'.repeat(30)}](https://example.com/${'b'.repeat(40)})`;
  const input = `- ${link} - June 25, 2019\n`;

  assert.equal(formatMarkdown(input, 60), `- ${link} -\n  June 25, 2019\n`);
});

test('never leaves a continuation line holding nothing but indentation', () => {
  // the next pass would read that line as blank, and a blank line between items makes the list loose
  const input = `- [notes](https://example.com/${'b'.repeat(70)})\n- next\n`;
  const result = formatMarkdown(input, 60);

  assert.equal(result, input);
  assert.equal(formatMarkdown(result, 60), result);
});

test('leaves the content of an HTML comment alone', () => {
  const cases = [
    '<!--\nThe first sentence is here. The second one follows.\n-->\n',
    '<!--\n* item | cell\n-|-\n\nA. B\n-->\n',
    '  <!-- One. Two -->\n',
    `<!--\n${'word '.repeat(40).trim()}\n-->\n`
  ];

  for (const input of cases) {
    assert.equal(formatMarkdown(input, 60), input);
  }
});

test('formats again after an HTML comment is closed', () => {
  assert.equal(formatMarkdown('<!--\nA. B\n\nC. D\n-->\n\nOne. Two\n', 240), '<!--\nA. B\n\nC. D\n-->\n\nOne.\nTwo\n');
  assert.equal(formatMarkdown('<!-- note. Still note -->\nOne. Two\n', 240), '<!-- note. Still note -->\nOne.\nTwo\n');
});

test('leaves an HTML block alone up to the blank line that ends it', () => {
  const iframe = '  <iframe src="https://example.com/embed" title="A player" allow="accelerometer; autoplay; clipboard-write; encrypted-media" allowfullscreen></iframe>\n';
  assert.equal(formatMarkdown(iframe, 80), iframe);

  // the Markdown between the tags of a details element is formatted as usual
  assert.equal(
    formatMarkdown('<details>\n<summary>One. Two</summary>\n\nThree. Four\n\n</details>\n', 240),
    '<details>\n<summary>One. Two</summary>\n\nThree.\nFour\n\n</details>\n'
  );

  // a pre element runs to its closing tag, blank lines included
  const pre = '<pre>\nOne. Two\n\nThree. Four\n</pre>\n';
  assert.equal(formatMarkdown(pre, 240), pre);
});

test('reads an autolink opening a line as text, not as HTML', () => {
  assert.equal(
    formatMarkdown('<https://example.com> is the site. Another one.\n', 240),
    '<https://example.com> is the site.\nAnother one.\n'
  );
});

test('reads an inline tag inside a paragraph as text, while a block tag still opens HTML', () => {
  // only the block level elements of CommonMark interrupt a paragraph, any other tag is inline HTML within it
  assert.equal(
    formatMarkdown('Type this:\n<iframe src="javascript:alert(1)">\nOne. Two\n', 240),
    'Type this:\n<iframe src="javascript:alert(1)">\nOne.\nTwo\n'
  );
  assert.equal(formatMarkdown('Intro.\n<div>\nOne. Two\n</div>\n', 240), 'Intro.\n<div>\nOne. Two\n</div>\n');
});

test('backs up a word or two rather than leave a few characters alone on the last line', () => {
  // a space past the limit, since a line whose overflow is one word is left whole
  const input = 'aaaa '.repeat(12) + 'the end.\n';

  assert.equal(formatMarkdown(input, 60), 'aaaa '.repeat(9).trim() + '\n' + 'aaaa aaaa aaaa the end.\n');
});

test('wraps before inline code or emphasis rather than inside it', () => {
  assert.equal(
    formatMarkdown('Run the command ' + 'x'.repeat(20) + ' then `mysql -h host -P port -u root -p secret` to connect.\n', 60),
    'Run the command ' + 'x'.repeat(20) + ' then\n`mysql -h host -P port -u root -p secret` to connect.\n'
  );
  assert.equal(
    formatMarkdown('Some words that lead to the date written _April 12, 2019_\n', 50),
    'Some words that lead to the date\nwritten _April 12, 2019_\n'
  );
});

test('leaves a line alone when nothing past the limit holds a space, as markdownlint accepts it', () => {
  const input = 'word '.repeat(11) + 'end-of-the-line).\n';

  assert.equal(formatMarkdown(input, 60), input);
});

test('still wraps a line when a space lies past the limit', () => {
  const input = 'word '.repeat(11) + 'end of the line.\n';

  assert.ok(formatMarkdown(input, 60).split('\n').every(line => line.length <= 60));
});

test('breaks at a comma inside parentheses when the line has no boundary outside them', () => {
  const input = '- [x] Topic (`labs/topic`, taught on a cluster with words, a stolen certificate that expires, NFLOG and `xt_set` added to the kernel)\n';
  const [first] = formatMarkdown(input, 110).split('\n');

  assert.ok(first.endsWith('expires,'), `not broken at the comma: ${first}`);
});

test('prefers a boundary outside parentheses to one inside them', () => {
  const input = 'The first clause of this sentence is long enough to need a break, and then (a parenthesis, with a comma) closes it.\n';
  const [first] = formatMarkdown(input, 90).split('\n');

  assert.equal(first, 'The first clause of this sentence is long enough to need a break,');
});
