import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { format } from '../src/index.js';

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

  const result = format(input, options.maxLineLength);

  assert.equal(result, expected);
});
