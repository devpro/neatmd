import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { processFile } from '../src/index.js';

const alreadyFormatted = fileURLToPath(new URL('./fixtures/wrap.out.md', import.meta.url));
const needsFormatting = fileURLToPath(new URL('./fixtures/wrap.in.md', import.meta.url));
const cliPath = fileURLToPath(new URL('../bin/cli.js', import.meta.url));

function withTempDir(run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neatmd-'));
  try {
    return run(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('writes the output file even when the source needs no formatting', () => {
  withTempDir(dir => {
    const source = path.join(dir, 'input.md');
    const output = path.join(dir, 'output.md');
    fs.copyFileSync(alreadyFormatted, source);

    processFile(source, { maxLineLength: 240, output });

    assert.equal(fs.existsSync(output), true);
    assert.equal(fs.readFileSync(output, 'utf-8'), fs.readFileSync(source, 'utf-8'));
  });
});

test('leaves the source untouched when an output file is given', () => {
  withTempDir(dir => {
    const source = path.join(dir, 'input.md');
    const output = path.join(dir, 'output.md');
    fs.copyFileSync(needsFormatting, source);
    const original = fs.readFileSync(source, 'utf-8');

    processFile(source, { maxLineLength: 240, output });

    assert.equal(fs.readFileSync(source, 'utf-8'), original);
    assert.equal(fs.readFileSync(output, 'utf-8'), fs.readFileSync(alreadyFormatted, 'utf-8'));
  });
});

test('formats in place when no output file is given', () => {
  withTempDir(dir => {
    const source = path.join(dir, 'input.md');
    fs.copyFileSync(needsFormatting, source);

    const modified = processFile(source, { maxLineLength: 240 });

    assert.equal(modified, true);
    assert.equal(fs.readFileSync(source, 'utf-8'), fs.readFileSync(alreadyFormatted, 'utf-8'));
  });
});

test('leaves an empty file alone', () => {
  withTempDir(dir => {
    const source = path.join(dir, 'empty.md');
    fs.writeFileSync(source, '', 'utf-8');

    const modified = processFile(source, { maxLineLength: 240 });

    assert.equal(modified, false);
    assert.equal(fs.readFileSync(source, 'utf-8'), '');
  });
});

test('check mode reports without writing anything', () => {
  withTempDir(dir => {
    const source = path.join(dir, 'input.md');
    const output = path.join(dir, 'output.md');
    fs.copyFileSync(needsFormatting, source);
    const original = fs.readFileSync(source, 'utf-8');

    const needsWork = processFile(source, { maxLineLength: 240, check: true, output });

    assert.equal(needsWork, true);
    assert.equal(fs.readFileSync(source, 'utf-8'), original);
    assert.equal(fs.existsSync(output), false);
  });
});

test('the command line rejects an output file for a directory target', () => {
  withTempDir(dir => {
    fs.copyFileSync(needsFormatting, path.join(dir, 'first.md'));
    fs.copyFileSync(needsFormatting, path.join(dir, 'second.md'));

    assert.throws(
      () => execFileSync(process.execPath, [cliPath, dir, '--output', path.join(dir, 'out.md')], { stdio: 'pipe' }),
      error => {
        assert.equal(error.status, 1);
        assert.match(error.stderr.toString(), /--output/);
        return true;
      }
    );

    assert.equal(fs.existsSync(path.join(dir, 'out.md')), false);
  });
});

const longComment = '// the cache is cleared before the request starts; a stale entry would otherwise answer with the previous tenant data\n';

test('splits the long comments of a source file named on the command line', () => {
  withTempDir(dir => {
    fs.writeFileSync(path.join(dir, '.editorconfig'), '[*.cs]\nmax_line_length = 80\n');
    const source = path.join(dir, 'Cache.cs');
    fs.writeFileSync(source, longComment + 'int x;\n');

    execFileSync(process.execPath, [cliPath, source], { stdio: 'pipe', cwd: dir });

    assert.equal(
      fs.readFileSync(source, 'utf-8'),
      '// the cache is cleared before the request starts;\n// a stale entry would otherwise answer with the previous tenant data\nint x;\n'
    );
  });
});

test('check mode reports a source file with a long comment and writes nothing', () => {
  withTempDir(dir => {
    fs.writeFileSync(path.join(dir, '.editorconfig'), '[*.cs]\nmax_line_length = 80\n');
    const source = path.join(dir, 'Cache.cs');
    fs.writeFileSync(source, longComment);

    assert.throws(
      () => execFileSync(process.execPath, [cliPath, '--check', source], { stdio: 'pipe', cwd: dir }),
      error => error.status === 1
    );
    assert.equal(fs.readFileSync(source, 'utf-8'), longComment);
  });
});

test('a directory run touches source files only with --comments', () => {
  withTempDir(dir => {
    fs.writeFileSync(path.join(dir, '.editorconfig'), '[*.cs]\nmax_line_length = 80\n');
    const source = path.join(dir, 'Cache.cs');
    fs.writeFileSync(source, longComment);

    execFileSync(process.execPath, [cliPath, dir], { stdio: 'pipe', cwd: dir });
    assert.equal(fs.readFileSync(source, 'utf-8'), longComment);

    execFileSync(process.execPath, [cliPath, dir, '--comments'], { stdio: 'pipe', cwd: dir });
    assert.notEqual(fs.readFileSync(source, 'utf-8'), longComment);
  });
});

test('skips generated and vendored files in a directory run', () => {
  withTempDir(dir => {
    fs.writeFileSync(path.join(dir, '.editorconfig'), '[*]\nmax_line_length = 80\n');
    fs.mkdirSync(path.join(dir, 'node_modules'));
    const minified = path.join(dir, 'app.min.js');
    const vendored = path.join(dir, 'node_modules', 'lib.js');
    fs.writeFileSync(minified, longComment);
    fs.writeFileSync(vendored, longComment);

    execFileSync(process.execPath, [cliPath, dir, '--comments'], { stdio: 'pipe', cwd: dir });

    assert.equal(fs.readFileSync(minified, 'utf-8'), longComment);
    assert.equal(fs.readFileSync(vendored, 'utf-8'), longComment);
  });
});
