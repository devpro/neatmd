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
