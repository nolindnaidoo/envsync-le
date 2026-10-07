# envsync-le — Rust specification

A port of the [EnvSync-LE](https://github.com/nolindnaidoo/envsync-le)
VS Code extension to a Rust CLI and MCP server: compare the dotenv files
in a tree and say which keys are missing from which.

**One answer is held equal; the surfaces are not.** The shared
`compare_env_files` MCP tool must return the same keys, mismatches, and the order of both
from either server — a difference there is a bug. Everything else is
IDE-first in the extension and terminal-first here, and is meant to
differ. See "Deliberate divergences".

## The one question

**Will this deploy break because a key is missing?**

Asked over a whole tree rather than a pair of open buffers, answered with
an exit code a CI step can fail on.

## This one has a verdict

The other crates in this family extract; they report what is there and
hold no opinion. **This one answers a yes-or-no question**, and the exit
code is the product:

- **0** — in sync.
- **1** — out of sync: a key is missing, or extra against a template.
- **2** — the question was malformed.

That is why `envsync-le .` in a pipeline is the whole point. There is
nothing to grep and nothing to pipe onward — the number is the answer.

## Not dotenv-linter

`dotenv-linter` is the tool people will name, and it is a different one.
Its fourteen checks are style lints on a single file — duplicated key,
blank lines, incorrect delimiter, lowercase key, unordered key,
trailing whitespace — with a `compare` command that diffs keys between
two named files.

This does not lint style at all. It **discovers** the dotenv files in a
tree and answers one question about the set of them, with two modes that
mean different things:

- **auto** — the reference is the union of every key in every file, so
  nothing can be *extra*; a key present anywhere must be present
  everywhere.
- **template** — one named file is the contract. Every other file is
  measured against it, and a key it does not have **is** extra.

Template mode is the one a deploy cares about, and it has no equivalent
in a two-file diff.

## Shape

**One crate.** Self-contained: no published `-core`, no shared crate
with the family, and nothing holding this code equal to the similar
files in the sibling repos.

```
crate/
├── src/
│   ├── detect/     pure: the dotenv parser, filename heuristics, the
│   │               comparator. No filesystem, pub(crate).
│   ├── discover.rs finding the dotenv files in a tree
│   ├── scan.rs     one comparison end to end — the only path either
│   │               surface calls
│   ├── cli.rs      the terminal surface
│   └── mcp/        the agent surface
└── fixtures/       the shared corpus, read by both frontends
```

**`detect/` touches no filesystem** and carries the **70% line coverage
floor per module**.

## Parsing — parity scope

Only key **names** are read. A dotenv file is where credentials live and
the answer does not need the values, so the parser never keeps one.

Ported from `parser.ts`, including the parts that look like bugs and are
not:

- A key must match `^[a-zA-Z_][a-zA-Z0-9_-]*$`. Anything else to the left
  of `=` is a parse error naming that line **by number, never by
  quoting it** — a line with no `=` is often the continuation of a
  multi-line certificate, and a line with one inside a query string is
  often a whole connection URL.
- A leading `export ` is accepted and stripped.
- A duplicate key counts once — dotenv itself keeps one occurrence.
- **A quoted value may span lines**, and its continuation lines must be
  consumed rather than read as malformed entries. Double, single and
  backtick quotes all open one.
- **An unterminated quote swallows the rest of the file** and is
  reported. That is dotenv's own behaviour and it is why one broken
  quote can make a file look nearly empty.

### Which files are dotenv files

`isEnvFileName`: `.env`, anything starting `.env.`, anything ending
`.env`.

`detectFileType` classifies on **segments of the basename, not
substrings**: `.env.production` is production, and `app.device.env` is
**not** development — substring matching used to say it was. Suffix-style
names like `foo.env` are always `base`. When several segments match, the
priority is local > example > production > development > test, so
`.env.production.local` is a local override.

## Comparing — parity scope

- **auto mode**: reference is the union of all keys. Extra keys are
  impossible by construction and the report says so by carrying none.
- **template mode**: reference is the named file's keys. A template that
  is not among the files falls back to the union rather than failing.
- **Case sensitivity is on by default.** Off, keys are compared
  lowercased.
- A mismatch names the file, the keys, and **a reference file that has
  them** — or the literal `other files` when no single file does.

### The report has no timestamp

The extension's `SyncReport` carries `lastChecked: Date.now()`. This
does not. A report is a thing to diff between runs and against a
baseline, and a timestamp makes every run differ from every other. The
extension needs it to decide whether to re-render a status bar; a CLI
has nothing to re-render.

## Output contract

**stdout is protocol, stderr is human.** One JSON report for the whole
run — unlike the extractor crates, which write one line per file,
because the answer here is about the *set* of files.

```json
{
  "status": "missing-keys",
  "mode": "template",
  "files": [
    { "path": ".env.example", "type": "example", "keys": 4 },
    { "path": ".env", "type": "base", "keys": 3 }
  ],
  "missingKeys": [
    { "file": ".env", "keys": ["SENTRY_DSN"], "reference": ".env.example" }
  ],
  "extraKeys": [],
  "diagnostics": [],
  "summary": { "files": 2, "missing": 1, "extra": 0 }
}
```

`keys` is a **count**, not a list. The names appear only where they are
the finding.

## The CLI surface

```
usage: envsync-le [options] [dir]
       envsync-le [options] --file <path>...
       envsync-le mcp
       envsync-le --version | --help

Options:
  --template <path>    compare every file against this one; a key it
                       does not have is extra
  --file <path>        compare exactly these files instead of discovering
  --ignore-case        compare key names case-insensitively
  --exclude <glob>     skip files matching this pattern; repeatable
  --hidden             walk hidden directories too
  --no-ignore          walk files that .gitignore excludes
```

A dotenv file is hidden by definition, so `--hidden` here controls
**directories**, not the `.env` files themselves. Getting that wrong
would make the default find nothing.

## The MCP surface

- **`compare_env_files` belongs to both servers**: same schema, same
  envelope, byte-identical output. It takes file *contents* directly and
  touches no filesystem. `fixtures/mcp-compare-env-files.json` runs
  against both.
- **`envsync_le_check` is this server's own**: a directory in, the
  discovery and the same report the CLI writes.

## Deliberate divergences

The extension is **IDE-first**: one workspace, a person reading results
in an editor. The CLI is **terminal-first**: whole trees, exit codes,
piping, automation. Each works the way its own use case expects, so the
list below is design rather than drift.

- **Discovery.** The CLI walks a tree and honours `.gitignore`; the
  extension answers about the workspace the editor already has open.
- **`--template`, `--strict`, `--exclude`, `--hidden`, `--no-ignore`**
  and the exit codes are terminal-side only. There is nothing for an
  editor to branch on.
- **The report has no timestamp**, for the reason above.
- **Corpus documents are stored with a `dot` prefix** on disk, because
  `cargo package` skips dotfiles; both frontends map between the two.

What may **never** differ:

- **`compare_env_files` is one tool, not two similar ones.** Same
  schema, same envelope, same answer, whichever server an agent reaches.
  `fixtures/mcp-compare-env-files.json` pins hand-written cases and
  `scripts/check-differential.ts` generates the rest.
- **No value ever leaves, on either surface, under any input.** Not in a
  report, not in a diagnostic, not in a refusal.
- **The unterminated-quote behaviour.** If one side swallowed the rest
  of the file and the other did not, the two would silently disagree
  about how much of a document was read.

### Whitespace is JavaScript's, not Rust's

The parser trims exactly the characters `String.prototype.trim` removes,
which is **not** `char::is_whitespace`. Two characters differ and both
showed up as the two frontends disagreeing about a real file: **U+FEFF**,
a byte-order mark anywhere but the first byte, which JavaScript trims and
Rust does not; and **U+0085**, NEL, which Rust trims and JavaScript does
not. `export\s+` is stripped against the same set.

## Non-goals

- **It does not lint style.** Ordering, quoting, blank lines and
  delimiters are `dotenv-linter`'s job and it does them well.
- **It never reads a value**, and never writes to a scanned file.
- **It does not fix anything.** No `--write`, no key insertion — the
  right value for a missing key is not something a tool can know.
- **No network, ever.**

## Not in v1

- **A baseline file** for accepting known mismatches.
- **Value comparison** — same key, different shape. That is a different
  question and it would need to read the values this deliberately does
  not.

## Files that cannot be read

Exit 2 means the *question* was malformed — an unknown flag, an
unreadable format name, a path that does not exist. It does not mean one
file in fifty thousand was a PNG.

A file that is not UTF-8 text, or that cannot be opened, is:

- named on stderr,
- carried in the JSON report with a `skipped` diagnostic saying why,
- and left out of the exit code.

`--strict` turns any skipped file back into exit 2, for a pipeline that
wants zero tolerance. What is never allowed is the third option: a file
that silently vanishes from the report, which reads to whoever ran it as
a file that was clean.

## The byte-order mark

A leading BOM is stripped before extraction. It is three invisible bytes
that Notepad, Excel and a PowerShell redirect all add, and that VS Code
removes before the extension sees a document — so leaving it in means
the two frontends read the same file differently. It shifts every column
on the first line, and in a structured format it can lose the document
entirely.

A BOM anywhere other than the start is a zero-width no-break space and
belongs to the text.
