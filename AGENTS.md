# neatmd: agent context

Guidance for working in this repository.

## Writing style

These rules apply to Markdown, code comments, commit messages, and any prose in scripts.

**One sentence per line.**
A line break only ever happens at the end of a sentence.
Never wrap a sentence across two lines.
Act as if there is no maximum line length: screens are wide, and the 80 character convention is not used here.
Wrapping is handled by the editor, not by hard newlines.

**Never use the em dash (`—`) or the en dash (`–`).**
Use a colon when introducing an explanation, a comma when joining clauses, or a full stop and a new sentence.
This applies to prose, code comments, table cells, and error message strings.

**Never use the second person.**
No "you", no "your", not even in placeholders such as `<your-token>`, which should read `<token>`.
The documentation describes the repository, it does not address a reader.
Write "the working tree", not "your working tree".
Write "a contribution is planned", not "are you willing to contribute".

**Other conventions.**
Use `ini` as the fence language for `.properties` blocks, never `properties`.
Prefer `>` over `→` when describing UI navigation, for example **Project Settings > Quality Gate**.

## Repository conventions

Shell scripts are named in `snake_case`, which is the standard for bash.
`sonar_bootstrap.sh`, not `sonar-bootstrap.sh`.

Scripts must be committed with the executable bit set.
A script committed as `100644` fails on a fresh clone even though it works locally:

```bash
git update-index --chmod=+x path/to/script.sh
```

The root `README.md` stays as short as possible.
Shared content lives in `docs/` and is linked, never copied.
Contributor-facing material lives in `CONTRIBUTING.md` at the repository root and must only provide guided steps to be up and running.

Target platform is Linux, including WSL2, and `bash`.

## Hard rules

**Never run a third party container image on this workstation.**
No `docker run` and no `docker pull` of any image not published by Docker or by GitHub.
This covers scanners, linters and helper images alike, including `semgrep/semgrep`, `bearer/bearer` and `pipelinecomponents/yamllint`.
Security scanners are invoked as locally installed binaries, and the required binary is installed rather than containerised.
When a tool has no local install path, it is left unwired and recorded in `docs/backlog.md`, never run from an image as a workaround.

**Never run linters.**
No `markdownlint`, no `yamllint`, no formatter, no `npx` invocation of any of them.
Linting is run by the repository owner, outside of agent sessions.
Write to the conventions in this file and leave verification to the owner.

**Only GitHub Actions published by `github` or `docker` are allowed in workflows.**
Reusable actions owned by this account, in `../github-workflow-parts`, are also allowed.
Anything else is replaced by an explicit command that downloads the official release binary and verifies its SHA256 checksum.
`actions/checkout` and `actions/setup-node` are fine, `arduino/setup-task` is not.

**The harness is Node.js and bash only.**
Python scripts or code is not allowed.

**Test before code when applicable.**
Test driven development must be the default behavior when implementating a code change.
