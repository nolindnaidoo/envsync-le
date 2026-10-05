# envsync-le-mcp

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.envsync-le">
    <img src="https://img.shields.io/badge/Install%20from-VS%20Code-blue?style=for-the-badge&logo=visualstudiocode" alt="Install from VS Code Marketplace" />
  </a>
  <a href="https://open-vsx.org/extension/nolindnaidoo/envsync-le">
    <img src="https://img.shields.io/open-vsx/dt/nolindnaidoo/envsync-le?style=for-the-badge&label=Open%20VSX&color=blue" alt="Open VSX downloads" />
  </a>
  <a href="https://www.npmjs.com/package/envsync-le-mcp">
    <img src="https://img.shields.io/npm/v/envsync-le-mcp?style=for-the-badge&label=MCP%20server&color=blue&logo=npm" alt="envsync-le-mcp on npm" />
  </a>
  <a href="https://letools.dev/tools/envsync-le">
    <img src="https://img.shields.io/badge/LE%20Tools-letools.dev-blue?style=for-the-badge" alt="LE Tools" />
  </a>
</p>

An [MCP](https://modelcontextprotocol.io) server that compares dotenv files and reports
which keys are missing from which — names only, never values — the comparison
engine behind the
[EnvSync-LE](https://letools.dev/tools/envsync-le)
editor extension, exposed as a tool an agent can call.

No dependencies, no network calls, no filesystem access. Content goes in,
structured results come out.

## Use it

Point any MCP host at `npx envsync-le-mcp`.

**Claude Code**

```bash
claude mcp add envsync-le -- npx -y envsync-le-mcp
```

**Anything with a JSON config** — Cursor, Windsurf, Claude Desktop:

```json
{
  "mcpServers": {
    "envsync-le": {
      "command": "npx",
      "args": ["-y", "envsync-le-mcp"]
    }
  }
}
```

**VS Code** needs nothing here. Install the extension instead — it
carries this server and registers it for you:
[VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=nolindnaidoo.envsync-le)
· [Open VSX](https://open-vsx.org/extension/nolindnaidoo/envsync-le)

**No Node?** The same `compare_env_files` tool ships in a static Rust
binary: `cargo install envsync-le`, then `envsync-le mcp`
([crates.io](https://crates.io/crates/envsync-le)). The two servers answer
identically — one fixture corpus runs against both and CI fails if they
diverge. The binary additionally offers `envsync_le_check`, which
discovers the dotenv files in a directory; **this server reads no files**,
which is what lets an agent call it anywhere.

Prefer a global install to `npx` on every launch:

```bash
npm install -g envsync-le-mcp
```

```json
{
  "mcpServers": {
    "envsync-le": { "command": "envsync-le-mcp" }
  }
}
```

No environment variables, no API key, no configuration of its own. To check it
before wiring it into anything:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | npx -y envsync-le-mcp
```

If that prints the tool name, the server works.

## The tool

### `compare_env_files`

| argument | type | |
|---|---|---|
| `files` | object[] | **required.** The dotenv files to compare, each `{ "path": ".env", "content": "…" }`. |
| `mode` | string | `auto` (the default) compares every file against the union of all keys, so nothing can be extra; `template` compares every file against one. |
| `templatePath` | string | Which file is the template. Required when `mode` is `template`. |
| `caseSensitive` | boolean | Compare key names case-sensitively. Default `true`. |
| `maxResults` | number | Default `500`, ceiling `5000`. |

Returns the overall `status` — `in-sync`, `missing-keys`, `extra-keys` or
`parse-error` — each file with its key count, and the keys missing from each
file (and, in `template` mode, extra in it) **by name only**. A value never
leaves the tool. `maxResults` caps the mismatches returned, and
`meta.truncated` says whether any were dropped.

```json
{
  "ok": true,
  "data": {
    "status": "missing-keys",
    "files": [
      {"path": ".env", "type": "base", "keyCount": 2},
      {"path": ".env.example", "type": "example", "keyCount": 1}
    ],
    "missingKeys": [
      {
        "filepath": ".env.example",
        "keys": ["DB_HOST"],
        "reference": ".env"
      }
    ],
    "extraKeys": []
  },
  "diagnostics": [],
  "meta": {
    "tool": "compare_env_files",
    "count": 1,
    "truncated": false
  }
}
```

Extraction is heuristic, and what it deliberately does **not** match is
documented as carefully as what it does — see the
[extension README](https://github.com/nolindnaidoo/envsync-le#readme).

## Also in the MCP registry

`io.github.nolindnaidoo/envsync-le` —
[registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io)

## Nine more like it

One tool each, same shape: content in, structured data out, no network and no
filesystem. Every one is on npm as `<name>-mcp` and in the MCP registry as
`io.github.nolindnaidoo/<name>`.

| Package | Tool | Extracts |
|---|---|---|
| [`urls-le-mcp`](https://www.npmjs.com/package/urls-le-mcp) | `extract_urls` | URLs, with protocol and position |
| [`colors-le-mcp`](https://www.npmjs.com/package/colors-le-mcp) | `extract_colors` | colors from stylesheets and code |
| [`dates-le-mcp`](https://www.npmjs.com/package/dates-le-mcp) | `extract_dates` | dates and timestamps |
| [`paths-le-mcp`](https://www.npmjs.com/package/paths-le-mcp) | `extract_paths` | file and directory paths |
| [`numbers-le-mcp`](https://www.npmjs.com/package/numbers-le-mcp) | `extract_numbers` | numeric values |
| [`string-le-mcp`](https://www.npmjs.com/package/string-le-mcp) | `extract_strings` | string values |
| [`regex-le-mcp`](https://www.npmjs.com/package/regex-le-mcp) | `extract_patterns` | regexes, with a ReDoS verdict |
| [`secrets-le-mcp`](https://www.npmjs.com/package/secrets-le-mcp) | `detect_secrets` | credentials, masked — never the value |
| [`scrape-le-mcp`](https://www.npmjs.com/package/scrape-le-mcp) | `analyze_robots_txt` | whether a path may be crawled |

Every tool in the family, one page: **[letools.dev](https://letools.dev)**

## Built by

**[Nolin Naidoo](https://nolindnaidoo.com)** — Chief Engineer, AI/ML & Platform
Architecture. [nolindnaidoo.com](https://nolindnaidoo.com) ·
[GitHub](https://github.com/nolindnaidoo) ·
[LinkedIn](https://www.linkedin.com/in/nolindnaidoo/)

### Also from the same workshop

Twelve Rust tools built the same way: small, single-purpose, and driven by a
machine rather than a person. pixelcoords and pixelactions make up one loop —
pixelcoords answers *where*, pixelactions *acts* there. The ten LE crates are
the terminal half of the extensions they sit in: the same detection, held to
the extension's own corpus, and an exit code instead of a results editor.

| | | |
|---|---|---|
| **[pixelcoords](https://github.com/nolindnaidoo/pixelcoords)** | Freeze your screen, mark regions, get pixel-exact coordinates and crops | [site](https://pixelcoords.dev) · [crates.io](https://crates.io/crates/pixelcoords) · [docs.rs](https://docs.rs/pixelcoords) |
| **[pixelactions](https://github.com/nolindnaidoo/pixelactions)** | Consume human-verified coordinates, perform the interaction, confirm it landed | [site](https://pixelactions.dev) · [crates.io](https://crates.io/crates/pixelactions) · [docs.rs](https://docs.rs/pixelactions) |
| **[paths-le](https://github.com/nolindnaidoo/paths-le/tree/main/crate)** | Find every path in a codebase and report whether it still points at anything | [crates.io](https://crates.io/crates/paths-le) |
| **[secrets-le](https://github.com/nolindnaidoo/secrets-le/tree/main/crate)** | Find hardcoded credentials, and never print one | [crates.io](https://crates.io/crates/secrets-le) |
| **[urls-le](https://github.com/nolindnaidoo/urls-le/tree/main/crate)** | Extract every URL from a codebase, with its protocol and exact position | [crates.io](https://crates.io/crates/urls-le) |
| **[regex-le](https://github.com/nolindnaidoo/regex-le/tree/main/crate)** | Find every regex in a codebase and report which can be driven into catastrophic backtracking | [crates.io](https://crates.io/crates/regex-le) |
| **[string-le](https://github.com/nolindnaidoo/string-le/tree/main/crate)** | Get every string in a codebase out where a person can read them | [crates.io](https://crates.io/crates/string-le) |
| **[numbers-le](https://github.com/nolindnaidoo/numbers-le/tree/main/crate)** | Find every hardcoded number in a codebase so a person can check them | [crates.io](https://crates.io/crates/numbers-le) |
| **[envsync-le](https://github.com/nolindnaidoo/envsync-le/tree/main/crate)** | Compare the dotenv files in a tree and say which keys are missing from which | [crates.io](https://crates.io/crates/envsync-le) |
| **[colors-le](https://github.com/nolindnaidoo/colors-le/tree/main/crate)** | Find every colour in a codebase, and say which are not in your palette | [crates.io](https://crates.io/crates/colors-le) |
| **[dates-le](https://github.com/nolindnaidoo/dates-le/tree/main/crate)** | Extract every date and timestamp, and the exact instant each one resolves to | [crates.io](https://crates.io/crates/dates-le) |
| **[scrape-le](https://github.com/nolindnaidoo/scrape-le/tree/main/crate)** | Check whether a page is scrapeable before the scraper is written | [crates.io](https://crates.io/crates/scrape-le) |

## Licence

MIT © [Nolin Naidoo](https://nolindnaidoo.com)
