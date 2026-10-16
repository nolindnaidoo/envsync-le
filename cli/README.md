# envsync-le

Compare the dotenv files in a tree and say which keys are missing from which,
before a deploy finds out for you.

```bash
npx envsync-le
npx envsync-le --template .env.example
npx envsync-le --file .env --file .env.production
```

This is the same command line as the Rust crate
[`envsync-le`](https://crates.io/crates/envsync-le), and it behaves
identically: same flags, same walk, same output, same exit codes. Install
whichever toolchain you already have.

## What it reads

Key names, and nothing else. A dotenv file is where credentials live and the
answer does not need them, so no value is parsed, compared or reported, and a
line that cannot be parsed is named by its line number rather than quoted.

`.env`, `.env.*` and `*.env` files are found anywhere under the directory,
including the git-ignored ones: a dotenv file is ignored by design, and a walk
that honoured that would compare `.env.example` against nothing and call it
in sync. Hidden directories are skipped unless you pass `--hidden`.

## Two questions

Without a template the reference is the union of every key found, so a key
present anywhere must be present everywhere. With `--template`, that file is
the contract and a key it does not have is extra, which is the question a
deploy asks.

## Output

stdout carries one JSON report for the whole run whenever it is piped or
redirected, and nothing when it is a terminal. stderr carries the human
summary.

```text
$ envsync-le --template .env.example
.env: missing DB_PORT (in .env.example)
.env: extra DEBUG (not in .env.example)
out of sync — 1 file with mismatches across 3 files
```

```json
{"status":"missing-keys","mode":"template","files":[{"path":".env","type":"base","keys":3},{"path":".env.example","type":"example","keys":3},{"path":".env.production","type":"production","keys":3}],"missingKeys":[{"filepath":".env","keys":["DB_PORT"],"reference":".env.example"}],"extraKeys":[{"filepath":".env","keys":["DEBUG"],"reference":".env.example"}],"diagnostics":[],"summary":{"files":3,"missing":1,"extra":1}}
```

## Exit codes

- **0**: in sync, or no dotenv files at all, since there is nothing to be out
  of sync with.
- **1**: out of sync.
- **2**: the question was malformed, or `--strict` and a file could not be
  read.

## For agents

`envsync-le mcp` serves the Model Context Protocol on stdio with two tools:
`compare_env_files` for file contents and `envsync_le_check` for a directory.
Hosts that want the server alone can install
[`envsync-le-mcp`](https://www.npmjs.com/package/envsync-le-mcp).

`envsync-le --help` lists every option.

MIT licensed. Part of [letools](https://letools.dev/tools/envsync-le).
