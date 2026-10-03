# Changelog

The Rust CLI and MCP server. The VS Code extension has its own
[CHANGELOG](../CHANGELOG.md) and its own version — the two products in
this repository release on their own cadence.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.3] - 2026-10-03

### Fixed

- The `compare_env_files` MCP tool's `maxResults` description now matches the
  npm server's word for word ("Cap on returned key mismatches"). CI now fails
  when the two servers' definitions differ.

## [0.2.2] - 2026-09-30

### Fixed

- **Dotted keys are compared.** `spring.datasource.url` and other dotted
  names, which the `dotenv` loader reads, were reported as parse errors
  and left out of every comparison. A key may now contain `.` after its
  first character.
- **Exclude globs read braces and character classes.** `.env.{local,test}`,
  `apps/{web,api}/.env`, `.env.[!p]*` and `.env.[a-c]` were matched as
  literal text, so they excluded nothing. Braces nest, a class never
  matches `/`, and an unclosed `{` or `[` is still read literally.

## [0.2.1] - 2026-08-16

### Fixed

- **A template is matched across either path separator.** `same_file`
  accepted a component boundary only at `/`, so on Windows the typed
  template — an absolute path with backslashes — matched no discovered
  file. It was then treated as an ordinary file, the reference fell back
  to the union, and the mismatch tally moved. Green on Linux and macOS,
  red on Windows, from a rule that reads as platform-neutral.

## [0.2.0] - 2026-08-15

The exit code is this tool's product, and two defects made it answer
wrongly on the layout the README opens with.

### Fixed

- **A git-ignored dotenv file is still compared.** `.env.example`
  committed and `.env*` ignored is the near-universal shape, and the
  walk honoured the ignore rules — so discovery found only the example,
  compared it against nothing, and reported `in sync` at exit 0 while
  production was missing a key. `diagnostics` was empty, so nothing said
  a file had been skipped. The default is now to see them; the
  discovery options still honour the ignore rules when asked, and
  `--no-ignore` is accepted and documented as the default it now is.

  The hazard was already understood one field away: `hidden` carries a
  comment saying `.env` is hidden by definition and that treating it the
  way the sibling crates do would find nothing at all. The same
  reasoning applies to `.gitignore` and had not been carried across.

- **`--template` matches however it is spelled.** It compared the given
  string against the discovered relative path, so `./.env.example`, an
  absolute path, or `sub/.env` all missed a file that was present and
  fell through to union mode — silently, with `"mode":"template"` still
  in the report, `extraKeys` emptied, and the blame inverted onto the
  contract file. A suffix must land on a component boundary, so
  `.env.example` does not answer for `my.env.example`.

- **"N files with mismatches" counts files.** It summed missing and
  extra entries, so one file missing two keys and holding one extra read
  as "3 files with mismatches across 3 files".

## [0.1.3] - 2026-08-15

### Added

- **The crates.io page carries a demo of the CLI.** It had the icon and
  nothing else, because the only recording in the repository was of the
  VS Code extension reading an editor buffer — a clip of something this
  binary does not do. `assets/demo.tape` records the real binary against
  the files in `assets/demo/`, so the clip is reproducible (`cd assets
  && vhs demo.tape`) rather than an artifact nobody can regenerate.

## [0.1.2] - 2026-08-15

### Fixed

- **The crates.io page shows the icon.** It lived only in the repository
  README, and that file is not the one `cargo publish` ships — the
  published README is this directory's. A relative path would not have
  fixed it: the crate is published from `crate/`, so crates.io resolves
  a relative link against `path_in_vcs` and looks for the asset below
  the crate directory rather than beside it. The image is an absolute
  URL, which every surface renders.

  No demo goes with it. `src/assets/images/demo.gif` records the
  extension reading an editor buffer, which is not what this binary
  does; the demo that belongs here is a recording of the CLI, and there
  is not one yet.

## [0.1.1] - 2026-08-14

### Fixed

- **A report from Windows reads the same as a report from anywhere
  else.** Paths came back with backslashes on Windows and forward
  slashes on macOS and Linux, so one workspace described itself two ways
  and a baseline committed on one machine broke on another. Every path
  the report carries now spells its separators forward — including the
  one naming a file that could not be read, which also gave an absolute
  path where everything beside it was relative to the directory you
  asked about.
- **A warning about a file it could not parse no longer quotes that
  file.** `Missing equals sign in "..."` and `Invalid key format "..."`
  printed the line back, and both reach real secret material: the
  continuation lines of a multi-line certificate have no `=` at all, and
  a connection string wrapped onto its own line has one inside its query
  parameters, which made the whole credential the "key" that failed to
  parse. The warnings now give the line number and nothing else. This
  tool reads key names and never values, and this was the way one could
  get out.
- **A `.env` saved with a byte-order mark is read the way the editor
  reads it.** Those three invisible bytes — what Notepad, Excel and a
  PowerShell redirect all add — are whitespace to the extension and were
  not to this crate, so the same file yielded different keys depending
  on which one looked at it, and a quoted value opened in one and not
  the other.
- **A run that names a pipe ends.** `--file` pointing at a FIFO waited
  forever for a writer; it is now reported as a file that could not be
  read, like any other.

### Added

- **Six CI jobs**, each pinning a class of bug that reached a release
  once: `hazards` (byte-order marks, undecodable files, FIFOs, symlink
  loops, 260-character paths, on all three platforms), `platform` (path
  separators, `TZ` independence, case-folding filesystems, reserved
  Windows names, stdin closed early), `differential` (generated documents
  through both MCP servers), `fuzz` (sixty seconds against the parser,
  asserting no value ever leaves), `budget` (a wall-clock ceiling and a
  linearity check), and `coverage-matrix` (every name the corpus
  classifies, opened and typed by the real binary).

## [0.1.0] - 2026-08-11

First release. The extension's detection engine, ported and pinned
against a shared corpus, over a tree instead of a pair of buffers.

### Added

- **The dotenv parser**, reproducing the extension's keys and parse
  errors for every case in `fixtures/` — including a quoted value that
  spans lines, and an unterminated quote swallowing the rest of the file
  the way dotenv itself does.
- **Filename classification** on segments rather than substrings, so
  `.env.production` is production and `app.device.env` is not
  development, with local winning when several segments match.
- **Both comparison modes.** Without a template the reference is the
  union of all keys and nothing can be extra; with one, that file is the
  contract and a key it lacks *is* extra — the question a deploy asks,
  and the one with no equivalent in a two-file diff.
- **Discovery** over a tree, `.gitignore` honoured, with glob excludes.
  `--hidden` controls directories: a dotenv file is a dotfile, so the
  walk always sees dotfiles.
- **The CLI**: one JSON report on stdout, a human summary on stderr, and
  exit codes — 0 in sync, 1 out of sync, 2 malformed question. No dotenv
  files at all is 0.
- **The MCP server** (`envsync-le mcp`) with two tools:
  `compare_env_files`, shared byte-for-byte with the npm server, and
  `envsync_le_check`.

### The shape of it

**It never reads a value.** A dotenv file is where credentials live, so
only key names are parsed, compared or reported. Three checks enforce it
rather than a promise: the parity script greps the corpus, a crate test
greps its embedded copy, and a contract test greps stdout and stderr of a
real run.

**The report carries no timestamp.** The extension's has one so it can
decide whether to re-render a status bar. A CLI has nothing to re-render,
and a timestamp makes every run differ from every other — which defeats
diffing a report against a baseline.

**Corpus documents are stored without their leading dot.**
`cargo package` skips dotfiles, so a corpus of `.env` files ships a crate
that cannot run its own tests. The corpus keeps the real names, because
classification reads them.


### Fixed

- **A leading byte-order mark is no longer part of the document.** Three
  invisible bytes, added by Notepad, Excel and a PowerShell redirect, and
  stripped by VS Code before the extension ever sees a file — so the two
  frontends read the same file differently. It shifted every column on
  line one, and before a `{` it made a structured parser reject the whole
  document, which is indistinguishable from a file with no keys in it.

- **A file that cannot be read no longer fails the run.** Every
  repository has a PNG, a zip and something the runner lacks permission
  for. Exiting 2 on those made the tool unusable in CI, which is the one
  place it is most worth running. Such a file is now named on stderr and
  carried in the report with a `skipped` diagnostic, and the exit code
  reflects what was found. `--strict` restores the old behaviour for a
  pipeline that wants zero tolerance.

- **A file that is not text is named rather than dropped.** It used to
  vanish from the report entirely, which reads to whoever ran it as
  "that file was clean".

[0.2.3]: https://crates.io/crates/envsync-le/0.2.3
[0.2.2]: https://crates.io/crates/envsync-le/0.2.2
[0.2.0]: https://crates.io/crates/envsync-le/0.2.0
[0.1.3]: https://crates.io/crates/envsync-le/0.1.3
[0.1.2]: https://crates.io/crates/envsync-le/0.1.2
[0.1.1]: https://crates.io/crates/envsync-le/0.1.1
[0.1.0]: https://crates.io/crates/envsync-le/0.1.0
