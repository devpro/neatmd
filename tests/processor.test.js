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

function writeTree(dir, files) {
  for (const [name, content] of Object.entries(files)) {
    const full = path.join(dir, name);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

test('a directory run reaches source files in any folder and skips vendored code', () => {
  withTempDir(dir => {
    writeTree(dir, {
      '.editorconfig': '[*]\nmax_line_length = 80\n',
      'src/a.js': longComment,
      'wwwroot/js/site.js': longComment,
      'wwwroot/lib/jquery/jquery.js': longComment,
      'vendor/x.js': longComment,
      'third_party/y.js': longComment
    });

    execFileSync(process.execPath, [cliPath, dir, '--comments'], { stdio: 'pipe', cwd: dir });

    assert.notEqual(fs.readFileSync(path.join(dir, 'src/a.js'), 'utf-8'), longComment);
    assert.notEqual(fs.readFileSync(path.join(dir, 'wwwroot/js/site.js'), 'utf-8'), longComment);
    assert.equal(fs.readFileSync(path.join(dir, 'wwwroot/lib/jquery/jquery.js'), 'utf-8'), longComment);
    assert.equal(fs.readFileSync(path.join(dir, 'vendor/x.js'), 'utf-8'), longComment);
    assert.equal(fs.readFileSync(path.join(dir, 'third_party/y.js'), 'utf-8'), longComment);
  });
});

test('bin is source in a Node project and build output next to a .NET project', () => {
  withTempDir(dir => {
    writeTree(dir, {
      '.editorconfig': '[*]\nmax_line_length = 80\n',
      'node/package.json': '{}',
      'node/bin/cli.js': longComment,
      'dotnet/App.csproj': '<Project/>',
      'dotnet/bin/Debug/gen.cs': longComment,
      'dotnet/obj/gen.cs': longComment
    });

    execFileSync(process.execPath, [cliPath, dir, '--comments'], { stdio: 'pipe', cwd: dir });

    assert.notEqual(fs.readFileSync(path.join(dir, 'node/bin/cli.js'), 'utf-8'), longComment);
    assert.equal(fs.readFileSync(path.join(dir, 'dotnet/bin/Debug/gen.cs'), 'utf-8'), longComment);
    assert.equal(fs.readFileSync(path.join(dir, 'dotnet/obj/gen.cs'), 'utf-8'), longComment);
  });
});

test('a directory run skips what .gitignore lists, and still processes tracked files', () => {
  withTempDir(dir => {
    writeTree(dir, {
      '.editorconfig': '[*]\nmax_line_length = 80\n',
      '.gitignore': 'generated/\n*.bundle.js\n',
      'src/a.js': longComment,
      'generated/b.js': longComment,
      'src/app.bundle.js': longComment,
      'generated/notes.md': fs.readFileSync(needsFormatting, 'utf-8')
    });
    execFileSync('git', ['init', '-q'], { cwd: dir });

    execFileSync(process.execPath, [cliPath, dir, '--comments'], { stdio: 'pipe', cwd: dir });

    assert.notEqual(fs.readFileSync(path.join(dir, 'src/a.js'), 'utf-8'), longComment);
    assert.equal(fs.readFileSync(path.join(dir, 'generated/b.js'), 'utf-8'), longComment);
    assert.equal(fs.readFileSync(path.join(dir, 'src/app.bundle.js'), 'utf-8'), longComment);
    assert.equal(
      fs.readFileSync(path.join(dir, 'generated/notes.md'), 'utf-8'),
      fs.readFileSync(needsFormatting, 'utf-8')
    );
  });
});

test('a directory outside a git repository has nothing ignored', () => {
  withTempDir(dir => {
    writeTree(dir, {
      '.editorconfig': '[*]\nmax_line_length = 80\n',
      '.gitignore': 'generated/\n',
      'generated/b.js': longComment
    });

    execFileSync(process.execPath, [cliPath, dir, '--comments'], { stdio: 'pipe', cwd: dir });

    assert.notEqual(fs.readFileSync(path.join(dir, 'generated/b.js'), 'utf-8'), longComment);
  });
});

test('formats every file given as an argument', () => {
  withTempDir(dir => {
    const names = ['a.md', 'b.md', 'c.md'];
    names.forEach(name => fs.writeFileSync(path.join(dir, name), 'One sentence. Another sentence.\n'));

    execFileSync(process.execPath, [cliPath, ...names], { stdio: 'pipe', cwd: dir });

    for (const name of names) {
      assert.equal(fs.readFileSync(path.join(dir, name), 'utf-8'), 'One sentence.\nAnother sentence.\n');
    }
  });
});

test('--check fails when any of several files needs formatting', () => {
  withTempDir(dir => {
    fs.writeFileSync(path.join(dir, 'neat.md'), 'One sentence.\n');
    fs.writeFileSync(path.join(dir, 'messy.md'), 'One sentence. Another sentence.\n');

    assert.throws(
      () => execFileSync(process.execPath, [cliPath, '--check', 'neat.md', 'messy.md'], { stdio: 'pipe', cwd: dir }),
      error => error.status === 1 && error.stdout.toString().includes('messy.md')
    );
  });
});

test('reports a missing path among several arguments and exits non-zero', () => {
  withTempDir(dir => {
    fs.writeFileSync(path.join(dir, 'a.md'), 'One sentence.\n');

    assert.throws(
      () => execFileSync(process.execPath, [cliPath, 'a.md', 'missing.md'], { stdio: 'pipe', cwd: dir }),
      error => error.status === 1 && error.stderr.toString().includes('missing.md')
    );
  });
});

test('--output refuses several files', () => {
  withTempDir(dir => {
    fs.writeFileSync(path.join(dir, 'a.md'), 'One sentence.\n');
    fs.writeFileSync(path.join(dir, 'b.md'), 'One sentence.\n');

    assert.throws(
      () => execFileSync(process.execPath, [cliPath, 'a.md', 'b.md', '-o', 'out.md'], { stdio: 'pipe', cwd: dir }),
      error => error.status === 1
    );
  });
});

const longSentence = 'This sentence is long enough to need a break somewhere, and the clause boundary is the natural place to put it.\n';

test('a file argument takes the .editorconfig above it, whatever the working directory', () => {
  withTempDir(dir => {
    writeTree(dir, {
      'repo/.editorconfig': 'root = true\n[*.md]\nmax_line_length = 80\n',
      'repo/docs/deep/a.md': longSentence,
      'elsewhere/.editorconfig': 'root = true\n[*.md]\nmax_line_length = 240\n'
    });

    execFileSync(process.execPath, [cliPath, path.join(dir, 'repo/docs/deep/a.md')], { stdio: 'pipe', cwd: path.join(dir, 'elsewhere') });

    assert.notEqual(fs.readFileSync(path.join(dir, 'repo/docs/deep/a.md'), 'utf-8'), longSentence);
  });
});

test('a directory run applies a nested .editorconfig to its own folder only', () => {
  withTempDir(dir => {
    writeTree(dir, {
      '.editorconfig': 'root = true\n[*.md]\nmax_line_length = 240\n',
      'a.md': longSentence,
      'sub/.editorconfig': '[*.md]\nmax_line_length = 80\n',
      'sub/b.md': longSentence
    });

    execFileSync(process.execPath, [cliPath, dir], { stdio: 'pipe', cwd: dir });

    assert.equal(fs.readFileSync(path.join(dir, 'a.md'), 'utf-8'), longSentence);
    assert.notEqual(fs.readFileSync(path.join(dir, 'sub/b.md'), 'utf-8'), longSentence);
  });
});
