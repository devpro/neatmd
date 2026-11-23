import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { formatMarkdown } from '../src/index.js';

const cliPath = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

// writes the files in a temporary folder, runs the command line there, and proves that --check wrote nothing
function check(files, args = ['doc.md']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neatmd-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), content);
    }
    const result = spawnSync(process.execPath, [cliPath, '--check', ...args], { cwd: dir, encoding: 'utf-8' });
    for (const [name, content] of Object.entries(files)) {
      assert.equal(fs.readFileSync(path.join(dir, name), 'utf-8'), content);
    }
    return { status: result.status, stdout: result.stdout.replaceAll(dir + path.sep, ''), stderr: result.stderr.replaceAll(dir + path.sep, '') };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const cell = length => 'word '.repeat(length).slice(0, length - 1) + 'x';

// every raw line fits in 280 characters, and aligning pads the rows past it
// the separator grows too, with no space past the limit
const growing = [
  'Name | What | Why',
  '-----|------|----',
  `${cell(120)} | short | ${cell(100)}`,
  `a | ${cell(150)} | ${cell(100)}`,
  ''
].join('\n');
const neatGrowing = formatMarkdown(growing, 280);

const tooLong = result => result.stderr.split('\n').filter(line => line.startsWith('⚠ Line too long'));
const grownLines = [
  '⚠ Line too long: doc.md:3: 376 characters, limit 280 (after formatting)',
  '⚠ Line too long: doc.md:4: 376 characters, limit 280 (after formatting)'
];

test('the growing table fits before alignment and not after', () => {
  assert.ok(growing.split('\n').every(line => line.length <= 280));
  assert.deepEqual(neatGrowing.trimEnd().split('\n').map(line => line.length > 280), [false, true, true, true]);
  assert.equal(formatMarkdown(neatGrowing, 280), neatGrowing);
});

const limit = length => `root = true\n[*.md]\nmax_line_length = ${length}\n`;

test('reports the lines alignment pushes past max_line_length', () => {
  const result = check({ 'doc.md': growing, '.editorconfig': limit(280) });

  assert.equal(result.status, 1);
  assert.deepEqual(tooLong(result), grownLines);
});

test('reports a neat file whose lines are over the limit without failing, since formatting would not fix it', () => {
  const result = check({ 'doc.md': neatGrowing, '.editorconfig': limit(280) });

  assert.equal(result.status, 0);
  assert.deepEqual(tooLong(result), grownLines.map(line => line.replace(' (after formatting)', '')));
  assert.doesNotMatch(result.stdout, /Needs formatting|@@/);
});

test('reports nothing when every line fits', () => {
  assert.deepEqual(tooLong(check({ 'doc.md': growing, '.editorconfig': limit(400) })), []);
});

test('reports against the default limit without an .editorconfig', () => {
  assert.match(tooLong(check({ 'doc.md': neatGrowing, '.editorconfig': 'root = true\n' }))[0], /limit 240/);
});

test('reports a long heading, and neither front matter, code, link lines nor an overflow holding no space', () => {
  const long = cell(100);
  const result = check({
    'doc.md': `---\ntitle: ${long}\n---\n\n# ${long}\n\n\`\`\`text\n${long}\n\`\`\`\n\n[${long}](https://example.com)\n\nhttps://example.com/${'a'.repeat(100)}\n`,
    '.editorconfig': limit(80)
  });

  assert.equal(result.status, 0);
  assert.deepEqual(tooLong(result), ['⚠ Line too long: doc.md:5: 102 characters, limit 80']);
});

const diffs = {
  'a separator shorter than its widest cell': [
    'Name   | Does\n-------|---\nsecond | pipes\n',
    '@@ -1,3 +1,3 @@\n Name   | Does\n--------|---\n+-------|------\n second | pipes\n'
  ],
  'extra padding': [
    'Name     | Does\n-------|------\nsecond | pipes\n',
    '@@ -1,3 +1,3 @@\n-Name     | Does\n+Name   | Does\n -------|------\n second | pipes\n'
  ],
  'a table not aligned': [
    'Name | Does\n-|-\nsecond | pipes\n',
    '@@ -1,3 +1,3 @@\n-Name | Does\n--|-\n+Name   | Does\n+-------|------\n second | pipes\n'
  ],
  'several sentences on a line': [
    'Title\n\nOne sentence. Another sentence.\n',
    '@@ -1,3 +1,4 @@\n Title\n \n-One sentence. Another sentence.\n+One sentence.\n+Another sentence.\n'
  ],
  'an escaped pipe, counted as two characters': [
    'Command | Does\n-|-\n`a \\| b` | pipes\n',
    '@@ -1,3 +1,3 @@\n-Command | Does\n--|-\n+Command  | Does\n+---------|------\n `a \\| b` | pipes\n'
  ],
  'a missing final newline': ['One.', '@@ -1,1 +1,1 @@\n-One.\n\\ No newline at end of file\n+One.\n'],
  'blank lines at the end': ['One.\n\n\n', '@@ -1,3 +1,1 @@\n One.\n-\n-\n'],
  'a document of blank lines': ['\n', '@@ -1,1 +0,0 @@\n-\n']
};

for (const [title, [content, hunk]] of Object.entries(diffs)) {
  test(`--check shows the diff of ${title}`, () => {
    const result = check({ 'doc.md': content });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, `✖ Needs formatting: doc.md\n--- doc.md\toriginal\n+++ doc.md\tformatted\n${hunk}`);
  });
}

test('--check shows distant changes in separate hunks with their line numbers', () => {
  const lines = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`);
  lines[4] = 'One. Two.';
  lines[24] = '* item';
  const { stdout } = check({ 'doc.md': lines.join('\n') + '\n' });

  assert.deepEqual(stdout.match(/^@@.*@@$/gm), ['@@ -2,7 +2,8 @@', '@@ -22,7 +23,7 @@']);
});

test('--check names CRLF line endings rather than showing every line as changed', () => {
  const result = check({ 'doc.md': 'One.\r\nTwo. Three.\r\n' });

  assert.match(result.stdout, /Line endings: CRLF/);
  assert.match(result.stdout, /^@@ -1,2 \+1,3 @@\n One\.\n-Two\. Three\.\n\+Two\.\n\+Three\.\n$/m);
  assert.doesNotMatch(check({ 'doc.md': 'One.\r\n' }).stdout, /@@/);
});

test('--check shows the diff of a source file', () => {
  const comment = '// the cache is cleared before the request starts; a stale entry would otherwise answer with the previous tenant data\n';
  const { stdout } = check({ '.editorconfig': '[*.cs]\nmax_line_length = 80\n', 'Cache.cs': comment }, ['Cache.cs']);

  assert.match(stdout, /^\+\/\/ a stale entry/m);
});

test('--check shows only the changed lines of a source file that keeps its CRLF line endings', () => {
  const comment = 'int x;\r\n// the cache is cleared before the request starts; a stale entry would otherwise answer with the previous tenant data\r\n';
  const { stdout } = check({ '.editorconfig': '[*.cs]\nmax_line_length = 80\n', 'Cache.cs': comment }, ['Cache.cs']);

  assert.doesNotMatch(stdout, /Line endings|^-int x/m);
  assert.match(stdout, /^ int x;$/m);
});

const mismatches = result => result.stderr.split('\n').filter(line => line.startsWith('⚠ Line length differs'));

const markdownlintConfigs = {
  'block YAML': ['.markdownlint-cli2.yaml', 'config:\n  default: true\n  # MD013: { line_length: 5 }\n  MD013:\n    heading_line_length: 90\n    line_length: 280 # wide\n  MD025: false\n'],
  'flow YAML': ['.markdownlint.yaml', 'MD013: { tables: true, line_length: 280 }\n'],
  'the rule alias': ['.markdownlint.yml', 'line-length:\n  line_length: 280\n'],
  'JSON': ['.markdownlint.json', '{ "default": true, "MD013": { "line_length": 280 } }'],
  'JSON with comments': ['.markdownlint-cli2.jsonc', '{ "config": {\n  // "MD013": { "line_length": 5 }\n  "MD013": {\n    "line_length": 280\n  }\n} }']
};

for (const [title, [name, content]] of Object.entries(markdownlintConfigs)) {
  test(`warns once when the markdownlint length differs from the one of .editorconfig, read from ${title}`, () => {
    const files = { 'a.md': 'One.\n', 'sub/b.md': 'One.\n', [name]: content };

    const result = check({ ...files, '.editorconfig': limit(240) }, ['.']);
    assert.equal(result.status, 0);
    assert.deepEqual(mismatches(result), [`⚠ Line length differs: 240 in .editorconfig, 280 in ${name}`]);

    assert.deepEqual(mismatches(check({ ...files, '.editorconfig': limit(280) }, ['.'])), []);
  });
}

test('never warns about a markdownlint configuration that gives no length of its own', () => {
  for (const content of ['MD013: false\nMD007:\n  line_length: 5\n', 'MD013:\n  tables: false\nother:\n  line_length: 5\n', 'default: true\n']) {
    assert.deepEqual(mismatches(check({ 'doc.md': 'One.\n', '.editorconfig': limit(240), '.markdownlint.yaml': content })), []);
  }
});

test('reads the closest markdownlint configuration, and none above the repository', () => {
  const files = { '.editorconfig': limit(240), '.markdownlint.json': '{ "MD013": { "line_length": 280 } }', 'a/doc.md': 'One.\n' };

  assert.equal(mismatches(check(files, ['a'])).length, 1);
  assert.deepEqual(mismatches(check({ ...files, 'a/.markdownlint.json': '{ "MD013": { "line_length": 240 } }' }, ['a'])), []);
  assert.deepEqual(mismatches(check({ ...files, 'a/.git': '' }, ['a'])), []);
});
