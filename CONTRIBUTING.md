# Contributing

## Run from the source

Experiment on a local path:

```bash
node bin/cli.js tests/fixtures/wrap.in.md -o tests/fixtures/wrap.res.md
```

## Run with local NPM package

Create the NPM dry-run package:

```bash
npm pack --dry-run
```

Test a local path:

```bash
npx . README.md
```

## Run official NPM package

To actually test the published version, from anywhere but the repo:

```bash
cd ~ && npx --prefer-online neatmd@0.1.4 repos/<my-repo>/
```

## CI/CD Pipelines

Pipelines are running in GitHub.

NPM package has been configured to use [Trusted publishing with OIDC](https://docs.npmjs.com/trusted-publishers) with GitHub.
