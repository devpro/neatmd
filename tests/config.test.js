import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, findConfigFiles } from '../src/index.js';

function withConfig(content, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neatmd-'));
  try {
    const file = path.join(dir, '.editorconfig');
    fs.writeFileSync(file, content);
    return run(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const sample = `root = true

[*]
max_line_length = 100

[*.{js,json,tf*,yml,yaml}]
max_line_length = 180

[*.md]
max_line_length = 240

[*.cs]
max_line_length = 160
`;

test('reads the Markdown length when no file is given', () => {
  withConfig(sample, file => {
    assert.equal(loadConfig(file).maxLineLength, 240);
  });
});

test('reads the length of the section matching the file', () => {
  withConfig(sample, file => {
    assert.equal(loadConfig(file, 'src/Cache.cs').maxLineLength, 160);
    assert.equal(loadConfig(file, 'web/app.js').maxLineLength, 180);
    assert.equal(loadConfig(file, 'ci.yml').maxLineLength, 180);
    assert.equal(loadConfig(file, 'run.sh').maxLineLength, 100);
  });
});

test('falls back to 180 for a source file and 240 for Markdown without a setting', () => {
  assert.equal(loadConfig(undefined, 'a.cs').maxLineLength, 180);
  assert.equal(loadConfig(undefined).maxLineLength, 240);
  assert.equal(loadConfig(undefined, 'a.md').maxLineLength, 240);
});

function withTree(files, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neatmd-'));
  try {
    for (const [name, content] of Object.entries(files)) {
      const full = path.join(dir, name);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('finds every .editorconfig from the folder of a file up to the one marked root', () => {
  withTree({
    'outer/.editorconfig': '[*]\nmax_line_length = 40\n',
    'outer/repo/.editorconfig': 'root = true\n[*]\nmax_line_length = 120\n',
    'outer/repo/sub/.editorconfig': '[*.cs]\nmax_line_length = 90\n',
    'outer/repo/sub/deep/keep': ''
  }, dir => {
    assert.deepEqual(findConfigFiles(path.join(dir, 'outer/repo/sub/deep')), [
      path.join(dir, 'outer/repo/.editorconfig'),
      path.join(dir, 'outer/repo/sub/.editorconfig')
    ]);
  });
});

test('lets the closest .editorconfig win, and ignores the ones above root', () => {
  withTree({
    'outer/.editorconfig': '[*]\nmax_line_length = 40\n',
    'outer/repo/.editorconfig': 'root = true\n[*.md]\nmax_line_length = 120\n',
    'outer/repo/sub/.editorconfig': '[*.cs]\nmax_line_length = 90\n',
    'outer/plain/.editorconfig': '[*.cs]\nmax_line_length = 90\n'
  }, dir => {
    const repo = findConfigFiles(path.join(dir, 'outer/repo/sub'));
    assert.equal(loadConfig(repo, 'a.cs').maxLineLength, 90);
    assert.equal(loadConfig(repo, 'a.md').maxLineLength, 120);
    assert.equal(loadConfig(repo, 'a.js').maxLineLength, 180);

    // without a root marker the outer settings still apply where nothing closer overrides them
    const plain = findConfigFiles(path.join(dir, 'outer/plain'));
    assert.equal(loadConfig(plain, 'a.cs').maxLineLength, 90);
    assert.equal(loadConfig(plain, 'a.js').maxLineLength, 40);
  });
});
