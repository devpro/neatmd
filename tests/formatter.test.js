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
