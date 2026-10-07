# Instructions for AI coding assistants

Read [AGENTS.md](AGENTS.md) first — it is the engineering-standards
document for this crate and the source of truth for layout, control-flow
style, the settled decisions, testing requirements, and the definition
of done. [SPEC.md](SPEC.md) defines the product behavior. AGENTS.md wins
on any conflict. The extension at the repo root is a separate product
with its own `CLAUDE.md`.

- Before declaring any change complete, run exactly what CI runs:
  `cargo fmt --all --check`,
  `cargo clippy --all-targets -- -D warnings`,
  `cargo test --locked`. All three must pass — and
  `bun ../scripts/check-detection-parity.ts` when detection changed.
- Never add inline `#[allow(...)]` — CI fails the build on it. Fix the
  lint, or add a commented relaxation to `[lints.clippy]` in
  `Cargo.toml`. One is there already, with its reason.
- New logic goes in `detect/` when it is pure (it must then be
  unit-tested, 70% module coverage floor), and in `discover.rs` /
  `scan.rs` only when it needs the filesystem. A `std::fs` call in
  `detect/` fails a CI job.
- **It never reads a value.** Only key names are parsed, compared or
  reported. Three separate checks enforce it — the parity script, a
  crate test over the embedded corpus, and a contract test over a real
  run's stdout and stderr. A change that made a value reachable is the
  one change this crate cannot take.
- **The exit code is the product.** 0 in sync, 1 out of sync, 2 could not
  answer, and no dotenv files is 0. Do not "improve" that last one into
  a failure.
- **`--hidden` is about directories.** A dotenv file is a dotfile, so
  the walk always sees dotfiles; making this flag behave like the
  sibling crates' would make the default find nothing.
- **Corpus documents are stored with a `dot` prefix.** `cargo package`
  skips dotfiles and fails outright on a corpus of them. The corpus keeps
  the real names because classification reads them; both frontends map
  between the two.
- **The comparator produces the extension's shape**, `filepath` and the
  always-empty `errors` included, because that is what the corpus
  compares. Reshaping belongs in `scan.rs` and `mcp/compare.rs`.
- `fixtures/` is shared with the extension — changing it changes both
  frontends and needs a CHANGELOG entry. **What it holds equal is the
  shared `compare_env_files` MCP tool**, which must answer identically from
  either server; a difference there is a bug. The surfaces themselves
  are IDE-first and terminal-first and are meant to differ —
  the discovery walk, `--strict`, `--exclude`, the exit codes and JSON Lines have no
  editor equivalent and are not drift. SPEC.md's "Deliberate
  divergences" is the bar for a new one.
- Write regression tests for every bug you fix; keep unit tests free of
  clocks, randomness, and the filesystem outside `discover`/`scan`.
- **Run the binary, not only the tests.** The dotfile packaging problem
  was invisible until `cargo package` refused to build.
