import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { splitComments, commentStyleOf } from '../src/index.js';

const folder = fileURLToPath(new URL('./fixtures/comments/', import.meta.url));
const LIMIT = 100;

const samples = fs.readdirSync(folder).filter(name => name.includes('.in.'));

// strips the comment markers and the whitespace, which is all a split may change
const text = source => source.replace(/^\s*(\/\/\/?|\*|#|@\*|\/\*)\s?/gm, '').replace(/\*\/|\*@/g, '').replace(/\s+/g, '');

for (const name of samples) {
  const file = folder + name;
  const style = commentStyleOf(file);
  const input = fs.readFileSync(file, 'utf-8');
  const expected = fs.readFileSync(file.replace('.in.', '.out.'), 'utf-8');

  test(`${name} is split as expected`, () => {
    assert.equal(splitComments(input, LIMIT, style).content, expected);
  });

  test(`${name} keeps its text and a second pass changes nothing`, () => {
    const { content } = splitComments(input, LIMIT, style);

    assert.equal(text(content), text(input));
    assert.equal(splitComments(content, LIMIT, style).content, content);
  });

  test(`${name} keeps every line that is not a comment`, () => {
    // lines inside a block comment may carry no marker, so it is followed from its opener to its closer
    const code = source => {
      let inBlock = false;
      return source.split('\n').filter(line => {
        const wasInBlock = inBlock;
        if (/^\s*(\/\*|@\*)/.test(line) && !/(\*\/|\*@)\s*$/.test(line)) inBlock = true;
        else if (/(\*\/|\*@)\s*$/.test(line)) inBlock = false;
        return !(wasInBlock || /^\s*(\/\/|\*|\/\*|#|@\*)/.test(line));
      });
    };

    assert.deepEqual(code(splitComments(input, LIMIT, style).content), code(input));
  });
}
