# neatmd

[![CI](https://github.com/devpro/neatmd/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/devpro/neatmd/actions/workflows/ci.yml)
[![PKG](https://github.com/devpro/neatmd/actions/workflows/pkg.yml/badge.svg?branch=main)](https://github.com/devpro/neatmd/actions/workflows/pkg.yml)
[![npm version](https://img.shields.io/npm/v/neatmd.svg)](https://www.npmjs.com/package/neatmd)
[![license](https://img.shields.io/npm/l/neatmd.svg)](LICENSE)

> A fast Markdown formatter for clean and consistent documentation.

`neatmd` keeps your Markdown files neat, standardizing headings, list indentation, code blocks, and table alignments effortlessly.

## 📦 Installation

Install globally via `npm`:

```bash
npm install -g neatmd
```

Or run it directly without installing using `npx`:

```bash
npx neatmd [files...]
```

## 🚀 Quick Start

### Format a single file

```bash
neatmd README.md
```

### Format all Markdown files in a project

```bash
neatmd "**/*.md"
```

### Check formatting without modifying files (Ideal for CI/CD)

```bash
neatmd --check .
```

## 🛠️ Options & Flags

Flag        | Short | Description                                           | Default
------------|-------|-------------------------------------------------------|--------
`--check`   | `-c`  | Verify formatting and exit with code 1 if unformatted | `false`
`--verbose` | `-v`  | Output detailed progress logs                         | `false`
`--version` | `-V`  | Print current version                                 | —
`--help`    | `-h`  | Display help menu                                     | —

## 🤖 CI Workflow Example

Add `neatmd` to your GitHub Actions workflow to ensure PRs maintain clean docs:

```yaml
name: Lint Docs
on: [push, pull_request]

jobs:
  format-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v6
        with:
          node-version: 22
      - run: npx neatmd --check .
```

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

[MIT](LICENSE) licensed.
