# Checking files

`--check` writes nothing, and exits with code 1 when a file needs formatting.

## What would change

Each file that needs formatting is followed by the unified diff of the change, so that a CI log is enough to fix it:

```diff
✖ Needs formatting: docs/commands.md
--- docs/commands.md	original
+++ docs/commands.md	formatted
@@ -1,3 +1,3 @@
 Name   | Does
--------|---
+-------|------
 second | pipes
```

A Markdown file with CRLF line endings is named as such, and its diff only shows the lines whose text changes.

## Lines over the limit

The limit is `max_line_length` of `.editorconfig`, the same one lines are cut at, 240 when none is set.

Some lines have no right place to be cut, such as a heading or a table row, and aligning a table can push its rows past the limit.
Those still over it after formatting are reported:

```txt
⚠ Line too long: docs/commands.md:4: 312 characters, limit 280 (after formatting)
```

The line number is the one of the formatted file.
The text is never shortened: a table too wide is for its author to rewrite.
The report does not fail the check, since formatting the file would not fix the line.

Front matter, fenced code, lines holding only a link, and lines whose overflow holds no space, such as a long URL or a table separator, are not reported.

## Agreement with markdownlint

`.editorconfig` is the only source of the limit, and the `MD013` length of markdownlint is expected to be the same.
A different one is shown as a warning, with or without `--check`, and changes nothing else:

```txt
⚠ Line length differs: 240 in .editorconfig, 280 in /repo/.markdownlint-cli2.yaml
```

The length is read from the JSON or YAML configuration of markdownlint or markdownlint-cli2 in the closest folder, up to the root of the repository.
A configuration that gives no length is not compared.
