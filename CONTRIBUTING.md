# Contributing

## Local run from the source

Experiment on a local path:

```bash
node bin/cli.js tests/fixtures/wrap.in.md -o tests/fixtures/wrap.res.md
```

## Local run with NPM

Create the NPM dry-run package:

```bash
npm pack --dry-run
```

Test a local path:

```bash
npx . README.md
```

## CI/CD Pipelines

Pipelines are running in GitHub.

NPM package has been configured to use [Trusted publishing with OIDC](https://docs.npmjs.com/trusted-publishers) with GitHub.
