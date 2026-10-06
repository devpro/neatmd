# Breaking long comments

`neatmd` also breaks comment lines longer than the configured length in source files, and changes nothing else.
Code, string literals and trailing comments after code are never touched.

## Usage

A source file named on the command line is processed on its own:

```bash
neatmd src/Cache.cs
```

A directory run only touches Markdown, unless `--comments` is given:

```bash
neatmd --comments .
neatmd --comments --check .
```

Generated and vendored files (`*.min.*`, `*.map`, `node_modules`, `bin`, `obj`, `dist`, `build`) are skipped.

## Supported files

| Extensions                                                      | Comment forms                   |
|-----------------------------------------------------------------|---------------------------------|
| `.cs` `.js` `.mjs` `.cjs` `.ts` `.tsx` `.jsx` `.css` `.scss`   | `//`, `///`, `/* ... */`        |
| `.razor` `.cshtml`                                              | the above, and `@* ... *@`      |
| `.sh` `.yml` `.yaml`                                            | `#`, a shebang is left alone    |

## Line length

The limit is `max_line_length` of the `.editorconfig` section matching the file, 180 when none is set.
Markdown keeps its own default of 240.

```ini
[*.cs]
max_line_length = 180
```

## How a line is broken

A line is broken at the most natural clause boundary that keeps the first part within the limit.
In order of preference: after `; `, after `: `, before a conjunction such as `, so`, `, and`, `, but` or `, which`, and after any other `, `.
A break never falls inside backticks, double quotes, parentheses, an angle bracket tag, or an inline element such as `<c>...</c>`.

Continuation lines keep the prefix of the comment.
In a list item the continuation is indented under the text.
In a Razor `@* ... *@` comment the continuation is indented 3 spaces under `@*`, and `*@` stays on the last line.

A line with no safe break is left whole and reported with its line number, to be split by hand.
