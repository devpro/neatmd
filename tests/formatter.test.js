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

test('stops a table at the first line that opens another block', () => {
  const table = 'Key | Value\n----|------\na   | b\n';

  // a table is broken by the beginning of another block level structure, so these lines are never table rows
  const interrupters = [
    '- item with a | pipe',
    '1. item with a | pipe',
    '# Heading with a | pipe',
    '> quote with a | pipe',
    '```text | fence'
  ];

  for (const interrupter of interrupters) {
    const result = formatMarkdown(table + interrupter + '\n', 240);
    assert.equal(result, table + interrupter + '\n');
  }
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
