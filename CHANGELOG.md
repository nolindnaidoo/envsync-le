# Changelog

All notable changes to EnvSync-LE will be documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

This file covers the **VS Code extension**. The Rust CLI in `crate/` is a
separate product on its own cadence and keeps its own
[CHANGELOG](crate/CHANGELOG.md).

## [Unreleased]

### Added

- A rating prompt. On the 3rd successful use, one notification asks whether
  you would rate the extension, with *Rate*, *Later* and *Don't Ask Again*.
  *Rate* opens the registry your copy was installed from: the VS Code
  Marketplace or Open VSX. *Later*, or dismissing it, asks once more on the
  20th use; that second ask is the last. It never appears on activation or
  after a failed run, and it is never shown if you have set
  `notificationsLevel` to `important` or `silent` yourself. The answer
  follows you through Settings Sync. Translated into all 12 locales.
### Changed

- No command is bound to a key by default any more. The one default this
  extension shipped sat on a key the editor, the system or another LE
  extension already used. Every command can still be given a key under
  Keyboard Shortcuts.

## [2.2.9] - 2026-10-04

### Added

- `scripts/check-mcp-definition.ts`, run in CI after the differential: it fails
  when the two servers define the shared MCP tool differently — its
  description or any part of its schema. Six of the ten had drifted.
- The npm README test also checks that every value an argument offers is
  named in that argument's row.
### Fixed

- The Open VSX links and the Open VSX downloads badge in the README, the npm
  README and the Help command pointed at a namespace the listing has left, so
  they led nowhere. The listing is under `nolindnaidoo` now, and so are they.

### Removed

- The Zed extension in `zed/`, with the CI job that built it and the workflow
  that synced it. It was never listed in Zed's registry.

## [2.2.8] - 2026-10-03

### Fixed

- **The npm README described a URL extractor.** Its opening line, its argument
  table, what the tool returns and its example were all copied from `urls-le-mcp`
  when the package was created. It now documents `compare_env_files` as the code defines
  it, and the example is an answer the server actually gives.
- The npm README's list of the family's Rust tools left out `dates-le`.

### Added

- `src/mcp/readme.test.ts` holds the npm README to the tool it documents: the
  heading names the tool, the argument table lists exactly the schema's
  arguments, the required ones are marked, the example is this tool's answer,
  and the opening sentence names what the tool works on.

## [2.2.7] - 2026-09-30

### Fixed

- **Dotted keys are compared.** `spring.datasource.url` and other dotted
  names, which the `dotenv` loader reads, were reported as parse errors
  and left out of every comparison. A key may now contain `.` after its
  first character.
- **Exclude globs read braces and character classes.** `.env.{local,test}`,
  `apps/{web,api}/.env`, `.env.[!p]*` and `.env.[a-c]` were matched as
  literal text, so they excluded nothing. Braces nest, a class never
  matches `/`, and an unclosed `{` or `[` is still read literally.

## [2.2.6] - 2026-08-16

### Changed

- **New icon artwork.** A new drawing in the style the family is moving
  to, framed like the rest of the set.

### Fixed

- **The agent-files check no longer times out on Windows.** A test-only
  fix; nothing a user of the extension can observe.

## [2.2.5] - 2026-08-14

### Fixed

- **A warning about a file it could not parse no longer quotes that
  file.** `Missing equals sign in "..."` and `Invalid key format "..."`
  printed the line back, and both reach real secret material: the
  continuation lines of a multi-line certificate have no `=` at all, and
  a connection string wrapped onto its own line has one inside its query
  parameters, which made the whole credential the "key" that failed to
  parse. The warnings now give the line number and nothing else. This
  extension reads key names and never values, and this was the way one
  could get out.

### Added

- A **Rust CLI and MCP server**, in [`crate/`](crate/README.md), to be
  published to crates.io as `envsync-le`. It runs the same comparison over
  a whole tree with an exit code a CI step can fail on — 0 in sync, 1 out
  of sync, 2 malformed question — so a missing key stops the build rather
  than the deploy.

  The extension stays the reference implementation and `crate/fixtures/`
  is the contract. That corpus is also checked for leaked values on every
  run: only key names may appear in it, on either side.

### Changed

- **New icon artwork.** All sixteen tools were redrawn in one style, so
  the family reads as one set wherever the listings sit side by side —
  the Marketplace, Open VSX and letools.dev. The framing is unchanged:
  the drawing fills 65.8% of an 800×800 canvas, and every smaller size
  is derived from that one file rather than drawn again.

## [2.2.4] - 2026-08-07

### Changed

- Documentation only — no behaviour change.

  The cross-references now point at each tool's own page on letools.dev rather
  than its VS Code Marketplace listing. The Marketplace listing shows one of
  the four channels a tool ships through; the detail page shows all of them,
  which is what a reader following a link from another tool is looking for.
  Install instructions are untouched, and the rating links now lead with Open
  VSX — where the audience these READMEs reach actually installs from.

- `homepage` in the extension and MCP manifests, and `websiteUrl` in the
  registry entry, resolve to the same detail page.

## [2.2.3] - 2026-08-05

### Changed

- Documentation and packaging metadata only — no behaviour change.

  The MCP server's source now explains its decisions rather than restating its
  code: why MCP's stdio transport is line-delimited and what happens to a client
  if you copy LSP's framing, why a tool failure is a result carrying `isError`
  rather than a JSON-RPC error and what each does to a model's next move, why
  the result cap is measured in context windows rather than milliseconds, and
  why `truncated` matters more than the cap itself.

- The npm package declares `publishConfig.provenance`, so a release published
  from CI carries a Sigstore attestation binding the tarball to the commit and
  workflow that built it. A consumer can verify it with `npm audit signatures`.

- The registry entry names its registry (`registryBaseUrl`) and how to run the
  package (`runtimeHint`), rather than leaving a client to infer both.

- Package metadata points at the author's site, and the npm page links the rest
  of the family, the Rust tools and their crates.

## [2.2.2] - 2026-08-05

### Changed

- Documentation only — no behaviour change.

  The README described a keyboard shortcut and little else. 2.2.1 added an MCP
  server that VS Code registers with agent mode, published it to npm and to the
  official MCP registry, and submitted a Zed extension — and a reader could
  discover none of it from this page. There is now a section for calling the
  tool from an agent, including the JSON config for hosts that use one and a
  one-line check that the server answers before you wire it into anything.

  The privacy section previously spoke only for the extension. It covers the
  server too, which is the part an agent actually runs.

  The registry listing gains a display name, an icon and a link to letools.dev;
  the npm page gains the badges and links it was missing. Every surface now
  points at the others.

## [2.2.1] - 2026-08-05

### Changed

- **VS Code 1.101 is now the minimum.** `engines.vscode` moves from `^1.90.0`
  to `^1.101.0` and `@types/vscode` is pinned exactly to the new floor, per the
  rule that the declared floor and the type surface must match. 1.101 is the
  first stable release carrying `registerMcpServerDefinitionProvider`, which
  the MCP integration needs — declaring the contribution point against an older
  floor would be a claim the code could not honour. Cursor and VSCodium track
  well past this; Cursor 3.6.21 reports 1.105.1.

### Added

- An MCP server, shipped inside the VSIX as `dist/mcp-server.js`. It exposes
  `compare_env_files` over stdio, so an agent can pull every file out of a document
  with its 1-based position.

  It imports the extraction engine and nothing from `vscode` —
  `check:mcp-bundle` fails the build if that stops being true, because the
  server has to run in Zed, in Claude Code, and from `npx`.

- The extension now offers that server to VS Code's agent mode, so installing
  it adds `compare_env_files` to the agent's tools alongside the existing commands.
  Nothing is downloaded at runtime: the server is the copy inside the VSIX.
  The registration is skipped on editors that do not implement the API, which
  is not an error — an editor without agent mode is not a broken install.

- The server is on npm as [`envsync-le-mcp`](https://www.npmjs.com/package/envsync-le-mcp),
  so `npx envsync-le-mcp` gives the same tool to Claude Code, Cursor, Windsurf or
  anything else that speaks MCP. It is the same build the VSIX carries, and its
  version is written from this manifest rather than maintained separately.

- A **Zed extension**, under `zed/`. Zed's extension API has no way to read the
  active buffer or register a command, so this extension could never be ported
  there in any language; a context server is the surface that fits. The crate
  is a launcher — it installs `envsync-le-mcp` and starts it with Zed's Node — so
  there is no second implementation to keep in agreement with the goldens.

  **Values never leave this server.** A dotenv file is where credentials live,
  and the question this extension answers is about key *names* — which are
  missing, which are extra. Returning values would send a production secret to
  whatever cloud model called the tool for no gain, so the parser's key list is
  the only thing that crosses the boundary, and the bundle gates assert that a
  known value is absent from the response.

  `ok` reports whether the comparison ran, not whether the files agreed. Files
  being out of sync is the finding, not a failure to produce one; only a file
  that could not be parsed makes the answer untrustworthy.

  The tool takes file contents rather than paths, so it needs no filesystem
  adapter and cannot be pointed at a file the caller was not already holding.

### Fixed

- The coverage gate could pass against a stale summary. `coverage-readme.js`
  reads `coverage/coverage-summary.json` rather than running coverage, so when
  that file was older than the code both modes lied — the rewrite reproduced
  stale numbers and `--check` then compared the README against the same stale
  file and reported it current. Both modes now refuse a summary older than
  `src/`.

- The manifest placeholder gate only inspected `contributes.commands`, so a
  `%key%` on any other contribution point could ship as literal text. It now
  walks the whole `contributes` tree.

## [2.1.0] - 2026-08-05

### Added

- Runtime strings are localized, and this time they render. All 6 of them —
  notifications, status bar, quick-picks and prompts — go through
  `vscode.l10n` and ship as twelve translated bundles in `l10n/`. The v1.x
  line carried manifest catalogues that worked and runtime catalogues that
  never reached the screen: `vscode-nls` was configured without
  `__filename`, so every runtime string fell back to English while the VSIX
  looked correct.
- An integration test covering both localization mechanisms — manifest
  substitution, key parity across all thirteen catalogues, and placeholder
  integrity in every translation. A translation that silently drops `{0}`
  now fails the build instead of shipping a message with the value missing.

- Dependency review on pull requests, failing on a high-severity addition
  before Dependabot's auto-merge can act.

### Fixed

- Twenty-four user-facing strings were never localized. This repo routes
  notifications through a `UserInterface` port rather than the notifier the
  other nine use, so `ui.showWarningMessage(...)` was a channel no earlier
  localization pass inspected; the status-bar tooltips and the missing-key,
  extra-key and parse-error message builders were missed for the same reason.
  Runtime localization now covers the whole surface — 6 strings before this
  release, 24 after.

### Fixed

- Eight more user-facing strings were never localized — error messages and a
  confirmation prompt built as template literals, which no property-based pass
  reaches. This repo routes notifications through a `UserInterface` port
  rather than the notifier the other nine use, which is why they were missed
  twice.
- The initial sync check in `activate` carried an unreachable error handler.
  `checkSync` resolves with an error report rather than rejecting — it catches
  internally and routes failures through `handleSyncCheckError`, which already
  notifies the user and honours `notificationLevel` — so the handler could not
  fire, and if it ever had it would have reported the same failure a second
  time behind its own duplicate level check.

### Changed

- Every `else` block is gone (7 of them; an eighth match was prose in a
  comment). The glob translator's four nested branches are now one
  `translateGlobToken` function with ordered guards, longest form first.
- `VSCodeCommandAdapter` is a factory function returning a frozen object. It
  was the only class in the fleet; nothing inherited from it and nothing needed
  an instance identity.
- `detection/detector.ts` held the detector factory plus all of file discovery,
  parsing and filtering in 526 lines. Discovery moved to
  `detection/discovery.ts`, leaving 290 and 247.

- Test coverage raised from 73.27% to 84.59% of branches (82.27% to 90.25% of
  statements). Five files sat below one of the repo's own floors; none do now.
  The gap was the three workspace commands — each a chain of file discovery, a
  quick pick and a comparison, where every step is reachable only by answering
  the one before it — and the file watcher, whose debounce, in-flight guard and
  error handling were never exercised because the suite registered it and
  never fired an event. The commands take their VS Code surface through ports,
  so they are driven with fakes rather than global mock state.


- CI gains fleet-wide checks that no single repo can perform: shared config is
  compared across all ten extensions, and every README link is verified —
  including Open VSX links, which are checked against the API because
  open-vsx.org answers HTTP 200 for extensions that do not exist.

## [2.0.1] - 2026-08-04

### Changed

- Marketplace categories re-targeted for discovery. `Other` is dropped
  (65,992 extensions, no discovery value); each extension now sits in
  categories matching how it is actually used.
- Search keywords widened to 30, targeting the terms users actually type
  rather than internal vocabulary.
- Toolchain moved to current: TypeScript 7, vitest 4, Biome 2.5.7,
  @types/node 26. `@types/vscode` is now pinned exactly to the
  `engines.vscode` floor — the caret had let the type surface drift 15
  minors ahead of the version actually supported.
- Runtime dependencies updated across majors where present: csv-parse 7,
  ini 7, js-yaml 5. Extraction output is unchanged, verified against the
  characterization goldens.
- Packaging no longer walks the npm tree (`vsce package --no-dependencies`).
  The bundle is self-contained, so the walk served no purpose and failed
  after any dependency change. Scrape-LE keeps it, since it genuinely
  ships `playwright-core`.
- Documentation claims corrected against the code. Removed: Numbers-LE
  "with statistics", EnvSync-LE "visual diffs", Regex-LE "live feedback",
  String-LE "and validation" — none of those features exist.

### Added

- Rating links in the in-extension help output, for both the VS Code
  Marketplace and Open VSX. Acquisitions exceed listing page views, so most
  users never see the listing's rating control; help is the surface they do
  reach.
- README now carries measured Performance and Testing sections, both
  generated rather than written — from `scripts/benchmark.ts` and from the
  coverage summary. CI fails if the coverage numbers drift from a real run.
- Coverage thresholds enforced at 75 lines / 80 functions / 60 branches /
  75 statements.
- CodeQL scanning, Dependabot with grouped weekly updates, and auto-merge
  limited to patch and minor devDependency bumps that pass CI.

## [2.0.0] - 2026-07-29

Full rehabilitation release. The headline: **v1.x VSIXes built from this
repo could not activate** — the build had no bundler while the package
excluded `node_modules`, so the extension crashed on load with
`Cannot find module 'vscode-nls'`. 2.0.0 ships a self-contained esbuild
bundle, verified by a packaging gate and a real extension-host
integration suite on every CI run.

### Fixed

- **Packaging**: `dist/extension.js` is now a single self-contained
  bundle (VSIX: 59 files → 21, no more stray `.claude/` settings in the
  package). A bundle gate (static require scan + loading the bundle
  with `vscode` stubbed) blocks any regression.
- **Context menu**: a file named exactly `.env` matched neither half of
  the when-clause (`resourceExtname == .env` — dotfiles have no
  extension — nor `/^\.env\./`), so the right-click menu never appeared
  on the primary file. Now one `resourceFilename` regex covering
  `.env`, `.env.*`, and `*.env` — and no longer `.envrc`.
- **Status bar**: the adapter was constructed without its configuration
  and read a hardcoded stub — `statusBar.enabled` had no effect at all.
  It now reads real config and reacts to changes without reload.
- **Watcher**: config was snapshotted once at activation; changes to
  `watchPatterns`, `excludePatterns`, `debounceMs`, or
  `notificationLevel` did nothing until a window reload.
- **Exclude patterns**: globs were anchored against the whole relative
  path, so `.env.*.local` never matched files in subdirectories.
  Patterns without `/` now match the basename (gitignore-style).
- **Config**: code fallbacks now provably match manifest defaults
  (asserted by a parity test) — `excludePatterns` silently disagreed;
  a non-numeric `debounceMs` no longer produces a `NaN` debounce; the
  string `"yes"` no longer reads as boolean `true`; the never-declared
  `notificationsLevel` typo key is no longer consulted.
- **Multi-select Quick Pick**: `Compare Selected` from the palette
  always behaved as cancelled — the adapter read `.label` off the
  returned *array*. Multi-pick now resolves to the picked values.
- **Compare Selected**: parse errors were silently discarded via an
  unreachable branch; they now appear in the report like everywhere else.
- **Keybinding docs**: help claimed `Ctrl+Alt+E`; the actual binding is
  `Ctrl+Alt+S`.

### Changed — detection output

- **`export KEY=value` now parses** (was an "Invalid key format" error).
- **Quoted values spanning lines** (`"`, `'`, or backtick) are consumed;
  their continuation lines were previously reported as "Missing equals
  sign" errors. An unterminated quote is now reported.
- **Duplicate keys count once** (were emitted twice, inflating counts).
- **File-type classification is segment-based**: `app.device.env` is no
  longer "development", `foo.test.env` no longer "test"; Windows paths
  classify correctly.
- **Extra keys are real in template mode**: files with keys the template
  lacks now produce the `extra-keys` status, count in the status bar,
  and notify at `notificationLevel: all` — all previously dead paths.
  In auto mode extras don't exist (the reference is the union).
- **`caseSensitive` is actually wired**: `false` now compares keys
  case-insensitively (it was declared and read but never used).
- Keys are extracted best-effort: a file with one malformed line still
  contributes its parseable keys alongside the errors.

### Removed

- 18 settings that were never read by any code path (`safety.*`,
  `performance.*`, `keyboard.*`, `presets.*`, `ignoreComments`).
  12 real settings remain, each with a live consumer.
- The runtime `vscode-nls` layer (it never worked — no bundles were
  ever generated; users saw inline English in every locale). Manifest
  translations (13 locales) are unaffected and now in exact key parity.
- 1,300+ lines of never-imported code (`utils/errorHandling.ts`,
  `utils/performance.ts`, `utils/safety.ts`, workspace adapter, unused
  mocks and fixtures), the unused `dotenv` dependency, `docs/` (its
  performance tables and governance documents did not correspond to
  this codebase), and `.cursorrules`.

### Added

- esbuild toolchain with bundle gate; tsc as typechecker covering tests.
- Characterization goldens pinning parser/classifier/glob/comparator
  output.
- Stateful vscode mock and a 127-test unit suite (85% line coverage,
  thresholds enforced) plus a real extension-host integration suite.
- CI on ubuntu/macos/windows and a manual release workflow
  (Marketplace + Open VSX).
- Error messages redact home directories and credential-shaped
  fragments.

## [1.8.1] and earlier - 2025

Historical releases, condensed: initial public release (1.7.0),
README/marketplace-link updates (1.8.0, 1.8.1). Their feature claims
did not all hold against the code — none of the packaged VSIXes could
activate (see 2.0.0), extra-key detection and several documented
settings were inert, and the published performance metrics documents
had no corresponding benchmark code. 2.0.0 is the first verifiable
release.
