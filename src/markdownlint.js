import fs from 'node:fs';
import path from 'node:path';

// in a folder, the files of markdownlint win over the ones of markdownlint-cli2
const CONFIG_NAMES = [
  '.markdownlint.jsonc',
  '.markdownlint.json',
  '.markdownlint.yaml',
  '.markdownlint.yml',
  '.markdownlint-cli2.jsonc',
  '.markdownlint-cli2.yaml'
];

const RULE = String.raw`["']?(?:MD013|line-length)["']?[ \t]*:`;
const FLOW_RULE = new RegExp(String.raw`${RULE}\s*\{([^{}]*)\}`, 'i');
const BLOCK_RULE = new RegExp(String.raw`^([ \t]*)${RULE}[ \t]*\n((?:\1[ \t]+.*\n|[ \t]*\n)+)`, 'im');

// reads one number out of JSON or YAML by its shape: a YAML parser would be the first dependency of the package, for a warning
function readLength(configPath) {
  const text = fs.readFileSync(configPath, 'utf-8')
    .replaceAll('\r\n', '\n')
    .replace(/(^|\s)(?:#|\/\/).*$/gm, '$1') + '\n';
  const body = FLOW_RULE.exec(text)?.[1] ?? BLOCK_RULE.exec(text)?.[2] ?? '';
  const length = /(?<!\w)line_length["']?\s*:\s*(\d+)/.exec(body);
  return length ? Number.parseInt(length[1], 10) : null;
}

// finds the length the closest markdownlint configuration gives, up to the root of the repository
// markdownlint never sets the limit, it is only compared with the one of .editorconfig
export function findMarkdownlintLength(dirPath) {
  let dir = path.resolve(dirPath);

  while (true) {
    const name = CONFIG_NAMES.find(candidate => fs.existsSync(path.join(dir, candidate)));
    if (name) {
      const configPath = path.join(dir, name);
      const length = readLength(configPath);
      return length === null ? null : { configPath, length };
    }
    const parent = path.dirname(dir);
    if (parent === dir || fs.existsSync(path.join(dir, '.git'))) return null;
    dir = parent;
  }
}
