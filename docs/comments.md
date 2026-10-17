# Breaking long comments

`neatmd` also breaks comment lines longer than the configured length in source files, and changes nothing else.

> [!IMPORTANT]
> Code, string literals and trailing comments after code are never touched.

## Usage

A source file named on the command line is processed on its own:

```bash
neatmd src/MyApp/Cache.cs
```

A directory run only touches Markdown, unless `--comments` is given:

```bash
neatmd --comments .
neatmd --comments --check .
```

Rules:

- Source files are found in every folder of the tree.
- Generated and vendored code is skipped: `*.min.*`, `*.map`, `node_modules`, `vendor`, `third_party`, `dist`, `build`, `wwwroot/lib`,
  and `bin`, `obj` and `Scripts` when a `.csproj`, `.fsproj`, `.vbproj` or `.sln` sits next to them.
- The `bin` folder of a Node package is source, and is processed.
- Whatever `.gitignore` lists is skipped too, in Markdown runs as well, as long as the folder is inside a git repository and `git` is installed.

## Supported files

Extensions                                                   | Comment forms
-------------------------------------------------------------|-----------------------------
`.cs` `.js` `.mjs` `.cjs` `.ts` `.tsx` `.jsx` `.css` `.scss` | `//`, `///`, `/* ... */`
`.razor` `.cshtml`                                           | the above, and `@* ... *@`
`.sh` `.yml` `.yaml`                                         | `#`, a shebang is left alone

## Line length

The limit is `max_line_length` of the `.editorconfig` section matching the file, 180 when none is set.
Markdown keeps its own default of 240.

The `.editorconfig` files are read from the folder of each file up to the first one with `root = true`, the closest one winning.
The working directory plays no part, so a file gets the same limit wherever the command is run from.

```ini
[*.cs]
max_line_length = 180
```

## How a line is broken

A line is broken at the most natural clause boundary that keeps the first part within the limit.
In order of preference: at the end of a sentence, after `;`, after `:` or a spaced dash, before a conjunction such as `, so`, `, and`, `, but` or `, which`, and after any other `,`.
A full stop closing an abbreviation or an initial, such as `e.g.`, `etc.` or `J.`, does not end a sentence.
The colon of a key and value, such as `enabled: false`, is not a boundary.
A break never falls inside backticks, double quotes, parentheses, an angle bracket tag, or an inline element such as `<c>...</c>`.

Continuation lines keep the prefix of the comment.
In a list item the continuation is indented under the text.
In a Razor `@* ... *@` comment the continuation is indented 3 spaces under `@*`, and `*@` stays on the last line.

A part with no clause boundary is broken at the last word that fits.
A line with no safe break at all, such as a single long URL, is left whole and reported with its line number, to be split by hand.
A commented-out setting that carries its own trailing comment, such as `# key: value   # note`, is code and is left whole.

## Tests

Each language has a pair of fixtures in `tests/fixtures/comments`:
`sample.in.<ext>` is the input, `sample.out.<ext>` the expected result at a limit of 100.
The tests also check that the text of the comments is unchanged, that no line outside a comment changes, and that a second pass changes nothing.
