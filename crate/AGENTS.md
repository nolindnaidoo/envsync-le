# envsync-le (CLI) — engineering standards

This is the source of truth for how code in `crate/` is written, tested,
and reviewed. It applies to every contributor, human or AI-assisted. CI
(`.github/workflows/ci-crate.yml`) enforces the mechanical parts;
reviewers enforce the rest. [SPEC.md](SPEC.md) defines the product
behavior — verdicts, exit codes, the parity scope; this file is how the
code gets there. The extension at the repo root is a separate TypeScript
product with its own `AGENTS.md`.

## What this project is

The command-line and MCP frontend of EnvSync-LE: compare the dotenv
files in a tree and say which keys are missing from which. Nothing is filtered,
rewritten or judged — see SPEC.md, "Non-goals". One product, two
frontends, one repository: the corpus (`fixtures/`) is shared with the VS
Code extension, and CI fails when either side drifts from it.

**This one has a verdict.** The rest of the family extracts and holds no
opinion; this answers a yes-or-no question and the exit code is the
product. There is nothing to grep and nothing to pipe onward.

**Status: released.** All seven extractors, both surfaces and
the test layers below are green. Releases go out through
`release-crate.yml`, which is dispatch-only and refuses a version that
crates.io already carries, has no changelog entry, would ship a tarball
missing its own corpus, or whose corpus the extension no longer
reproduces.

## Layout

```
crate/src/
├── detect/      pure: the dotenv parser, filename heuristics, the
│                comparator. No filesystem, pub(crate).
├── discover.rs  finding the dotenv files in a tree
├── scan.rs      one file end to end — the only path either surface calls
├── cli.rs       the terminal surface
└── mcp/         the agent surface
```

- **`detect/` touches no filesystem.** It takes document text and a
  format and returns values, so the entire extraction layer tests from a
  fixture file — no temp directories, no flake. It carries the **70%
  line coverage floor per module**, enforced by the `coverage` job. A
  `std::fs` call appearing there is a bug, and the `policy` job greps
  for one.
- **`scan.rs` and `discover.rs` are the only modules allowed to touch the
  filesystem.**
- **Both surfaces are one implementation.** `cli.rs` and `mcp/` both call
  `scan.rs`. A surface that grows its own copy of a rule is a bug, and
  a contract test asserts the two return identical reports for the same
  tree.
- **`discover.rs` selects, it does not decide.** Its one rule — a file named
  explicitly is read whatever the ignore rules say — is why intent beats
  configuration.
- Keep modules flat. No layers, registries, managers, or services. No
  trait with a single implementation.

## Decisions already made (do not relitigate)

- **It never reads a value.** A dotenv file is where credentials live, so
  only key names are parsed, compared or reported. This is not a promise
  but a test: the parity script greps the corpus for a value, the crate
  greps its embedded copy, and the contract tests grep stdout and stderr
  of a real run. A flag that offered values would be the one change this
  crate cannot take.
- **The exit code is the product.** 0 in sync, 1 out of sync, 2 could not
  answer. Unlike the extractors, there is no list to pipe onward.
- **No dotenv files is 0, not 1.** A repository with none is not out of
  sync — there is nothing to be out of sync with, and failing a build
  over it would be the tool inventing a problem.
- **Two modes, and the difference is the product.** Without a template
  the reference is the union of all keys and nothing can be extra; with
  one, that file is the contract and a key it lacks *is* extra. Template
  mode is the deploy question and it has no equivalent in a two-file
  diff.
- **A template that is not among the files falls back to the union.**
  Naming a file that is not there is a question about a tree that does
  not exist, and answering with every key is more use than an error.
- **The report carries no timestamp.** The extension's `SyncReport` has
  `lastChecked` so it can decide whether to re-render a status bar; a CLI
  has nothing to re-render, and a timestamp makes every run differ from
  every other, which defeats diffing against a baseline.
- **`--hidden` controls directories, not the dotenv files.** A dotenv
  file is a dotfile by definition, so the walk always sees dotfiles;
  treating this flag the way the sibling crates do would make the default
  find nothing at all.
- **An exclude pattern that will not compile excludes nothing**, rather
  than everything. A typo in a config must not silently hide the files
  this exists to compare.
- **A parse failure is a warning, not an exit 2.** The keys that did
  parse are still evidence about the half that parsed.
- **Corpus documents are stored without their leading dot.**
  `cargo package` skips dotfiles, so a corpus of `.env` files ships a
  crate that cannot run its own tests — `cargo package` fails outright,
  which is how this was found. The corpus keeps the real names, because
  classification reads them; only the files on disk carry a `dot`
  prefix, and both frontends map between the two.
- **The comparator produces the extension's shape**, `filepath` and a
  vestigial always-empty `errors` included, because that is what the
  corpus compares. The CLI and the MCP tool reshape on top of it — the
  npm server counts a file's keys as `keyCount` and carries no `errors`.
- **One crate, self-contained.** No published `-core`, no shared crate,
  and nothing holding this code equal to the similar files in the
  sibling repos.
- **stdout is one report for the whole run**, not one line per file,
  because the answer is about the set of files.
- **Parity scope is detection** — `src/detection/**`.

## Control-flow style

Flat over nested, guards over branches — the same rules as pixelcoords,
pixelactions and scrape-le:

- **No statement-position `else`.** Guard clauses and early `return`
  (`if !ok { return ... }` / `let Some(x) = ... else { return }`), then
  fall through to the happy path.
- **Value-position `if/else` is fine** — `let x = if cond { a } else
  { b }` is Rust's ternary.
- **`match` is fine and preferred** over any chain of condition tests on
  the same value; use match guards instead of `if/else` inside arms.
- Prefer combinators where they read cleanly: `bool::then_some`,
  `Option::map/filter/is_some_and`, `?`.
- No nesting deeper than two levels inside a function; extract a named
  helper instead.

## Hard rules

- **No inline `#[allow(...)]`** — CI greps and fails the build. Either
  fix the lint or add a visible, commented relaxation to
  `[lints.clippy]` in `Cargo.toml`.
- **Clippy pedantic, deny warnings.** `cargo clippy --all-targets --
  -D warnings` must pass exactly as CI runs it.
- **No async runtime.** This tool reads files and asks the filesystem
  about them. There is nothing to await.
- **`unsafe` is forbidden crate-wide** (`[lints.rust]`).
- **Dependencies are a cost.** Five format parsers is already more than
  most tools carry, and every one is justified by a comment in
  `Cargo.toml`. Justify any addition; prefer the standard library;
  prefer what is already in the tree.
- **No network, ever.**
- **Nothing writes, and nothing judges.** No `--fix`, no verdicts, no
  filtering.
- **Strict parsing, never silent defaults** — for flags. An unrecognised
  flag or an input that does not exist is an error with an actionable
  message. A format that does not resolve is the documented exception
  above: it falls back. A typo'd `--stict` that silently did
  nothing would report a clean audit that never ran the check asked for.
- **Refuse rather than guess.** A file that cannot be read is reported
  as unexamined and the run exits 2 — never a clean result that quietly
  skipped it. Never report coverage you did not achieve.
- **Refusals speak the caller's vocabulary.** An MCP caller has no
  command line; no message aimed at one mentions `--dedupe` or any other
  flag. A test asserts no MCP output contains `--`.
- **`compare_env_files` belongs to both servers.** The npm server
  (`src/mcp/tools.ts`) and this one offer the same tool: same schema,
  same envelope, byte-identical output — **key names,
  never values**. `fixtures/mcp-compare-env-files.json` runs
  against both, so changing one without the other fails a build.
  Every tool here returns that envelope — `{ ok, data, diagnostics,
  meta }` — where `ok` means the check ran, never that the answer was
  yes.

## The corpus contract

`fixtures/` lives inside this crate so the published package is
self-contained — `cargo package` cannot reach above its own directory.
The corpus is **not** needed to build the binary; that was checked
rather than assumed, by deleting it from an unpacked tarball and
building. It is needed to *verify*: `cargo test` on the published crate
runs every corpus case, so a consumer can check the parity claims
instead of trusting them. That is why it ships, and the release workflow
asserts it is in the tarball. It is still shared ground: the extension
reads the same files.
`../scripts/check-detection-parity.ts` (the `parity` job in
`ci-crate.yml`) fails when the extension drifts. Changing a document or
an expectation is a behavior change for **both** frontends and needs a
CHANGELOG entry.

Where the two must disagree, the disagreement is written down in
SPEC.md and a test asserts what each side actually answers. There is no
other sanctioned way to differ.

## Testing

The bar, enforced by review:

- **`detect/`: 70% line coverage floor per module.** Everything in it
  is pure; if something is hard to test there, the design is wrong. Per
  module rather than the crate total, because a total lets one module
  slide while the others carry it.
- **The parity corpus is embedded.** Every `fixtures/` case runs as a
  unit test; the expected values are the extension's answers.
- **Exit codes belong in `tests/contracts.rs`.** They are the API —
  callers branch on them — so they are pinned by tests that drive the
  built binary against a temporary tree: no network, no privileged
  operation, so they run everywhere on every push. A new refusal adds
  its case there.
- **Anything needing a document larger than an editor opens is
  `tests/scenarios.rs`** — gated behind `ENVSYNC_LE_SCENARIOS` and run by
  CI on all three OSes. A skipped scenario is never reported as a pass; each one says
  plainly that it did not run.
- **Six more layers, one per class of bug that reached a release.** Each
  has its own CI job and its own file:
  - `tests/hazards.rs` — inputs a real repository holds and a fixture
    directory cannot: a byte-order mark, an undecodable file, a FIFO, a
    symlink loop, a 260-character path. Built at runtime, because
    Windows cannot check half of it into git, and every case the
    platform cannot express is skipped **by name**.
  - `tests/platform.rs` — path separators, `TZ` independence, a
    case-folding filesystem, reserved Windows names, stdin closed early.
  - `../scripts/check-differential.ts` — generated documents through
    **both** MCP servers. Scoped to the shared tool; see SPEC.md,
    "Deliberate divergences", for what the two surfaces may differ on.
  - `tests/fuzz.rs` — time-boxed against the parser through
    `compare_env_files`, so the target is the pure layer and not the
    walk. Its first property is that no value ever leaves.
  - `tests/budget.rs` — a wall-clock ceiling, and four times the tree
    costing at most six times the clock.
  - `tests/coverage_matrix.rs` — every name the shared corpus
    classifies, written to disk and opened by the real binary. A name
    that classifies correctly in a unit test but that the walk never
    reaches is a crate that opens fewer files than it claims.
- **Every bug fix ships with a regression test** that fails before the
  fix. Three divergences got through a green suite here and were caught
  the first time the corpus and then the binary actually ran: rust-ini
  resolving `\U` as an escape, the fallback regex matching across
  newlines where JavaScript's `.` cannot, and a bare key in an INI file
  taking every value in that file down with it. Run the binary, not only
  the tests.
- Tests are deterministic: no clocks, no randomness, and **no filesystem
  in `detect/` tests** — everything there runs from the corpus.

## Verification — the definition of done

All of it, exactly as CI runs it, before every push:

```bash
cargo fmt --all --check
cargo clippy --all-targets -- -D warnings
cargo test --locked
bun ../scripts/check-detection-parity.ts   # when extraction changed
```

CI additionally builds on macOS, Windows and Linux, checks the Rust 1.88
minimum version, runs `cargo audit`, the no-inline-`#[allow]` and
no-filesystem-in-`detect/` policy jobs, the per-module coverage floor,
the gated scenarios, and parity — including on extension-side edits to
`src/detection/**`, so neither frontend can drift green. A change is
not done because it compiles; it is done when it is tested, linted,
documented where behavior changed (README / CHANGELOG / SPEC / this
file), and honest — claims in docs must match the code.

## Commits and pull requests

The repo root's convention applies unchanged (root `AGENTS.md`):
conventional prefix, imperative subject, body carrying the *why* —
enforced by the `commit-msg` hook and the `Commit messages` CI job.
One concern per change; if docs describe the thing you changed, update
them in the same commit. Release tags are `crate-v*`, and a release
goes out by dispatching `release-crate.yml` with its publish opt-in —
never by pushing a tag, because a crates.io version can never be
reused.
