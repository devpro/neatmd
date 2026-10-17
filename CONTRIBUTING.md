# Contributing

## Tasks

> [!TIP]
> Common workflows are defined in [`Taskfile.yml`](Taskfile.yml), run with [Task](https://taskfile.dev) 3.x.

List available tasks:

```bash
task --list
```

Run the unit tests:

```bash
task test
```

Run what CI runs, unit tests then the format check of the repository's own Markdown:

```bash
task check
```

Bump the package version, since `pkg.yml` publishes on every push to `main`:

```bash
task dev:bump
```

[IstarCI](https://github.com/devpro/istarci) runs the CI pipeline of every commit locally:

```bash
task ci:setup   # registers this repository and installs the pre-push hook
task ci         # the runs of the recent commits
task ci:logs    # the output of the last run
```

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
