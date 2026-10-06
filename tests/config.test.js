import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/index.js';

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
