import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitComments, commentStyleOf } from '../src/index.js';

const LIMIT = 80;

test('splits a long line comment after a semicolon and keeps the prefix', () => {
  const input = '// the cache is cleared before the request starts; a stale entry would otherwise answer with the previous tenant data\n';
  const { content, split } = splitComments(input, LIMIT, 'slash');

  assert.equal(content, '// the cache is cleared before the request starts;\n// a stale entry would otherwise answer with the previous tenant data\n');
  assert.equal(split, 1);
});

test('keeps the indentation and the triple slash of an XML doc comment', () => {
  const input = '    /// <summary>Returns the current tenant, which is read once per request and never cached across requests by design.</summary>\n';
  const { content } = splitComments(input, 100, 'slash');

  assert.equal(
    content,
    '    /// <summary>Returns the current tenant,\n    /// which is read once per request and never cached across requests by design.</summary>\n'
  );
});

test('never breaks inside an inline XML tag, backticks, quotes or parentheses', () => {
  const inline = '// the value is <c>a, so b, and c, but not d</c> and `x, so y, and z` and "p, so q, and r" and (s, so t, and u) end of it here ok\n';
  const { content, stuck } = splitComments(inline, 60, 'slash');

  for (const line of content.split('\n')) {
    assert.ok(!/<c>[^<]*$/.test(line) || /<\/c>/.test(line), `tag split in: ${line}`);
  }
  assert.equal(content.replace(/\n\/\/ /g, ' '), inline);
  assert.ok(Array.isArray(stuck));
});

test('indents the continuation of a list item under its text', () => {
  const input = '// - the first item explains the reason at length; the second half carries the consequence of it\n';
  const { content } = splitComments(input, 60, 'slash');

  assert.equal(content, '// - the first item explains the reason at length;\n//   the second half carries the consequence of it\n');
});

test('continues a block comment with the same star prefix', () => {
  const input = '/*\n * the lock is taken before the write starts; releasing it late would let a second writer in before the first has finished\n */\nint x;\n';
  const { content } = splitComments(input, LIMIT, 'slash');

  assert.equal(
    content,
    '/*\n * the lock is taken before the write starts;\n * releasing it late would let a second writer in before the first has finished\n */\nint x;\n'
  );
});

test('never touches code, even a long line', () => {
  const input = `var message = "this is a string, so it stays whole; ${'x'.repeat(100)}";\n`;
  const { content, split } = splitComments(input, LIMIT, 'slash');

  assert.equal(content, input);
  assert.equal(split, 0);
});

test('reports a comment with no safe break instead of changing it', () => {
  const input = `// ${'word'.repeat(40)}\n`;
  const { content, stuck } = splitComments(input, LIMIT, 'slash');

  assert.equal(content, input);
  assert.equal(stuck.length, 1);
  assert.equal(stuck[0].line, 1);
});

test('splits a single line Razor comment and keeps the closer on the last line', () => {
  const input = '    @* the grid is rendered server side; the client only sorts what it received and never asks again *@\n';
  const { content } = splitComments(input, LIMIT, 'razor');

  assert.equal(
    content,
    '    @* the grid is rendered server side;\n       the client only sorts what it received and never asks again *@\n'
  );
});

test('splits inside a multi line Razor comment', () => {
  const input = '@*\n   the grid is rendered server side; the client only sorts what it received and never asks again\n*@\n<div></div>\n';
  const { content } = splitComments(input, LIMIT, 'razor');

  assert.equal(
    content,
    '@*\n   the grid is rendered server side;\n   the client only sorts what it received and never asks again\n*@\n<div></div>\n'
  );
});

test('uses the hash prefix for shell and YAML, and leaves a shebang alone', () => {
  const input = '#!/bin/bash\n# the token is read from the environment; a flag would leave it in the shell history of the machine\n';
  const { content } = splitComments(input, LIMIT, 'hash');

  assert.equal(
    content,
    '#!/bin/bash\n# the token is read from the environment;\n# a flag would leave it in the shell history of the machine\n'
  );
});

test('does not read a hash as a comment in the slash family', () => {
  const input = `#region ${'a, so b '.repeat(20)}\n`;
  const { content } = splitComments(input, LIMIT, 'slash');

  assert.equal(content, input);
});

test('keeps CRLF line endings', () => {
  const input = '// the cache is cleared before the request starts; a stale entry would otherwise answer with the previous tenant data\r\nint x;\r\n';
  const { content } = splitComments(input, LIMIT, 'slash');

  assert.equal(content, '// the cache is cleared before the request starts;\r\n// a stale entry would otherwise answer with the previous tenant data\r\nint x;\r\n');
});

test('leaves short comments and an already split file unchanged', () => {
  const input = '// short\nint x; // trailing comments after code are not split ' + 'y'.repeat(100) + '\n';
  const { content, split } = splitComments(input, LIMIT, 'slash');

  assert.equal(content, input);
  assert.equal(split, 0);
});

test('picks the comment style from the extension', () => {
  assert.equal(commentStyleOf('a/B.cs'), 'slash');
  assert.equal(commentStyleOf('a/b.ts'), 'slash');
  assert.equal(commentStyleOf('a/b.css'), 'slash');
  assert.equal(commentStyleOf('a/Page.razor'), 'razor');
  assert.equal(commentStyleOf('a/Page.cshtml'), 'razor');
  assert.equal(commentStyleOf('a/run.sh'), 'hash');
  assert.equal(commentStyleOf('a/ci.yml'), 'hash');
  assert.equal(commentStyleOf('a/readme.md'), null);
  assert.equal(commentStyleOf('a/app.min.js'), null);
  assert.equal(commentStyleOf('a/app.js.map'), null);
});

test('splits a single line block comment and keeps the closer on the last line', () => {
  const input = '  /* the grid keeps two columns on a phone, so the cards stay readable; a third column would shrink them below a thumb */\n';
  const { content } = splitComments(input, 80, 'slash');

  assert.equal(
    content,
    '  /* the grid keeps two columns on a phone, so the cards stay readable;\n     a third column would shrink them below a thumb */\n'
  );
});

test('leaves a block comment closed in the middle of code alone', () => {
  const input = `int x = /* ${'a, so b '.repeat(20)} */ 3;\n`;

  assert.equal(splitComments(input, 80, 'slash').content, input);
});
