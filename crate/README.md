<p align="center">
  <img src="https://raw.githubusercontent.com/nolindnaidoo/envsync-le/main/src/assets/images/icon.png" alt="envsync-le logo" width="96" height="96"/>
</p>

<h1 align="center">envsync-le</h1>

<p align="center">
  <b>Compare the dotenv files in a tree and say which keys are missing from which</b><br/>
  <i>only key names — never a value</i>
</p>

<p align="center">
  <a href="https://crates.io/crates/envsync-le">
    <img src="https://img.shields.io/crates/v/envsync-le.svg" alt="envsync-le on crates.io" />
  </a>
  <a href="https://crates.io/crates/envsync-le">
    <img src="https://img.shields.io/crates/d/envsync-le.svg" alt="crates.io downloads" />
  </a>
  <a href="https://github.com/nolindnaidoo/envsync-le/actions/workflows/ci-crate.yml">
    <img src="https://github.com/nolindnaidoo/envsync-le/actions/workflows/ci-crate.yml/badge.svg" alt="Build Status" />
  </a>
  <img src="https://img.shields.io/badge/rustc-1.88+-93450a.svg" alt="MSRV: Rust 1.88+" />
  <a href="https://github.com/nolindnaidoo/envsync-le/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT" />
  </a>
  <a href="https://letools.dev/tools/envsync-le">
    <img src="https://img.shields.io/badge/web-letools.dev-00A0FF.svg" alt="letools.dev" />
  </a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/nolindnaidoo/envsync-le/main/assets/demo.gif" alt="envsync-le demo — the real binary, recorded by assets/demo.tape" width="100%"/>
</p>

> **Useful?** A star is how other developers find it —
> [★ GitHub](https://github.com/nolindnaidoo/envsync-le) ·
> [letools.dev/tools/envsync-le](https://letools.dev/tools/envsync-le)

The deploy fails at three in the morning because production never got
`SENTRY_DSN`. It was added to `.env` months ago and nobody added it to
`.env.example`, so nobody added it anywhere else.

```bash
envsync-le --template .env.example .
```

```
.env: missing STRIPE_KEY, SENTRY_DSN (in .env.example)
.env.production: missing SENTRY_DSN (in .env.example)
.env: extra DEBUG (not in .env.example)
out of sync — 3 files with mismatches across 3 files
```

Exit code 1. The build stops before the deploy does.

## This one has a verdict

The other tools in this family extract; they report what is there and
hold no opinion. This one answers a yes-or-no question and **the exit
code is the product**:

- **0** — in sync. Also 0 when there are no dotenv files at all: nothing
  to be out of sync with, and failing a build over that would be the
  tool inventing a problem.
- **1** — out of sync.
- **2** — the question was malformed.

There is nothing to grep and nothing to pipe onward. `envsync-le .` in a
pipeline is the whole point.

## Two modes that mean different things

**Without a template**, the reference is the union of every key in every
file. A key present anywhere must be present everywhere, and nothing can
be *extra* by construction. This is the "these environments have
drifted" question.

**With a template**, that file is the contract. Every other file is
measured against it, and a key it does not have **is** extra. This is
the "will this deploy break" question, and it is the one you want in CI.

## It never reads a value

A dotenv file is where credentials live. Only key **names** are parsed,
compared or reported — the parser does not keep a value, the report has
no field for one, and no flag can ask for one.

That is not a promise, it is a test: the shared corpus is scanned for a
value on every run of the parity check, and the crate carries the same
check against its embedded copy. If a `postgres://` URL ever appeared in
an answer, the build would fail.

## Not dotenv-linter

`dotenv-linter` is the tool people will name, and it is a different one.
Its checks are style lints on a single file — duplicated key, blank
lines, incorrect delimiter, lowercase key, unordered key — with a
`compare` command that diffs keys between two named files.

This does not lint style at all. It **discovers** the dotenv files in a
tree and answers one question about the set of them. Template mode has
no equivalent in a two-file diff, and template mode is what a deploy
cares about.

Use both. They are not competing for the same job.

## Install

| Route | Command | Worth knowing |
|---|---|---|
| **cargo** | `cargo install envsync-le` | Any platform, needs **Rust 1.88+**. |
| **From source** | `git clone https://github.com/nolindnaidoo/envsync-le`<br>`cd envsync-le/crate && cargo build --release` | The same build CI runs. |

No runtime, no network, nothing written.

## Parsing, including the awkward parts

Ported from the extension, which is the reference implementation:

- A key must match `^[a-zA-Z_][a-zA-Z0-9_-]*$`. Anything else to the left
  of `=` is a parse error naming that line.
- `export FOO=bar` is accepted; the prefix is stripped.
- A duplicate key counts once — dotenv itself keeps one occurrence.
- **A quoted value may span lines**, and its continuation lines are
  consumed rather than read as malformed entries. A certificate in a
  `.env` is the ordinary case for this.
- **An unterminated quote swallows the rest of the file** and is
  reported. That is dotenv's own behaviour, and it is why one stray
  quote can make a file look nearly empty.

A file that does not parse cleanly is a **warning naming it**, not a
failed run. The keys that did parse are still evidence about the half
that parsed, and the reader can see it was only half.

## Which files, and what kind

`.env`, anything starting `.env.`, anything ending `.env`.

The type comes from **segments of the name, not substrings**:
`.env.production` is production, and `app.device.env` is **not**
development — substring matching used to say it was. When several
segments match, local wins, so `.env.production.local` is a local
override.

**`--hidden` is about directories.** A dotenv file is hidden by
definition, so treating this flag the way the sibling tools do would
make the default find nothing at all.

## Options

```
--template <path>    compare every file against this one
--file <path>        compare exactly these files instead of discovering
--ignore-case        compare key names case-insensitively
--exclude <glob>     skip files matching this pattern; repeatable
--hidden             descend hidden directories too
--no-ignore          walk files that .gitignore excludes
--strict             exit 2 if any file could not be read, rather than
                     naming it and comparing the rest
```

An exclude pattern that will not compile excludes **nothing**, rather
than everything — a typo in a config should not silently hide the files
this exists to compare.

## As an MCP server

```bash
envsync-le mcp
```

Two tools, both returning `{ ok, data, diagnostics, meta }`:

- **`compare_env_files`** — file contents in, mismatches out. Touches no
  filesystem. The npm server ships the same tool with byte-identical
  output; one corpus runs against both.
- **`envsync_le_check`** — a directory in, the discovery and the same
  report the CLI writes.

## The other four ways to run it

| Where | What you get | Install |
|---|---|---|
| **VS Code** | The same comparison, live, in your editor | [Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.envsync-le) |
| **Cursor, VSCodium, Windsurf** | The same extension | [Open VSX](https://open-vsx.org/extension/nolindnaidoo/envsync-le) |
| **Any MCP agent, via Node** | `compare_env_files` over stdio | `npx envsync-le-mcp` · [npm](https://www.npmjs.com/package/envsync-le-mcp) |

All sixteen LE tools are on **[letools.dev](https://letools.dev)**.

## Documentation

| What | Where |
|---|---|
| What this tool is allowed to say — scope, output contract, refusals, non-goals | [SPEC.md](https://github.com/nolindnaidoo/envsync-le/blob/main/crate/SPEC.md) |
| How the code is written and held together — architecture, invariants, the gates | [AGENTS.md](https://github.com/nolindnaidoo/envsync-le/blob/main/crate/AGENTS.md) |
| The VS Code extension this shares its extraction with | [README.md](https://github.com/nolindnaidoo/envsync-le/blob/main/README.md) |
| What changed | [CHANGELOG.md](https://github.com/nolindnaidoo/envsync-le/blob/main/crate/CHANGELOG.md) |
| The tool's page, and the other fifteen | [letools.dev/tools/envsync-le](https://letools.dev/tools/envsync-le) |

## More from the LE family

Sixteen single-purpose tools for the work in front of every model. Each ships
a Rust CLI and an MCP server. One page: **[letools.dev](https://letools.dev)**

**Get it out**

- **[String-LE](https://letools.dev/tools/string-le)** — Extract every string in a codebase, so a person can read them
- **[Numbers-LE](https://letools.dev/tools/numbers-le)** — Extract every hardcoded number in a codebase, so a person can check them
- **[Units-LE](https://letools.dev/tools/units-le)** — Extract every quantity with its unit, normalized, and refuse the ambiguous ones by name
- **[Dates-LE](https://letools.dev/tools/dates-le)** — Extract every date and timestamp, and the exact instant each one resolves to
- **[IDs-LE](https://letools.dev/tools/ids-le)** — Extract every UUID, ULID, NanoID, ObjectId and Snowflake, and decode the time inside
- **[IPs-LE](https://letools.dev/tools/ips-le)** — Extract every IP address, CIDR block and MAC, normalized and classified by scope
- **[URLs-LE](https://letools.dev/tools/urls-le)** — Extract every URL in a codebase, with its protocol and exact position
- **[Paths-LE](https://letools.dev/tools/paths-le)** — Extract every file path in a codebase, and say whether it still points at anything
- **[Colors-LE](https://letools.dev/tools/colors-le)** — Extract every color in a codebase, and say which ones are not in your palette

**Check it**

- **[Regex-LE](https://letools.dev/tools/regex-le)** — Find every regex in a codebase, and report which can be driven into catastrophic backtracking
- **[Versions-LE](https://letools.dev/tools/versions-le)** — Find where one dependency is constrained differently across a repository's manifests
- **[i18n-LE](https://letools.dev/tools/i18n-le)** — Identify the i18n library a project uses, then audit its catalogs by that library's rules
- **[Scrape-LE](https://letools.dev/tools/scrape-le)** — Check whether a page is scrapeable before the scraper is written, and say when it cannot tell

**Guard it**

- **[Secrets-LE](https://letools.dev/tools/secrets-le)** — Find hardcoded credentials in a codebase, and never print one into the report
- **[EnvSync-LE](https://letools.dev/tools/envsync-le)** — Compare the dotenv files in a tree, and say which keys are missing from which
- **[Unicode-LE](https://letools.dev/tools/unicode-le)** — Find the Unicode that hides meaning — bidi controls, invisibles, homoglyphs, mixed scripts

Each stands on its own: no shared crate, no published core. Where two of them
agree, it is because the same answer was right twice.

**Contact** — [nolindnaidoo.com](https://nolindnaidoo.com) · [GitHub](https://github.com/nolindnaidoo) · [LinkedIn](https://www.linkedin.com/in/nolindnaidoo/)

## Also by nolindnaidoo

**Rust** — pixelcoords and pixelactions are one loop: pixelcoords answers
*where*, pixelactions *acts* there. Their own tools, their own voice — not
part of the LE family.

- **[pixelcoords](https://github.com/nolindnaidoo/pixelcoords)** — Freeze your screen, mark regions, get pixel-exact coordinates and crops
  [pixelcoords.dev](https://pixelcoords.dev) · [crates.io](https://crates.io/crates/pixelcoords) · [docs.rs](https://docs.rs/pixelcoords)
- **[pixelactions](https://github.com/nolindnaidoo/pixelactions)** — Consume human-verified coordinates, perform the interaction, confirm it landed
  [pixelactions.dev](https://pixelactions.dev) · [crates.io](https://crates.io/crates/pixelactions) · [docs.rs](https://docs.rs/pixelactions)

## License

MIT — see [LICENSE](https://github.com/nolindnaidoo/envsync-le/blob/main/LICENSE).
