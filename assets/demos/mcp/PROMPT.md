# The kept MCP take

- Recorded: 2026-10-14
- Host: Claude Code 2.1.300, Opus 5.5, medium effort, auto mode
- Server: this repo's `mcp/server.js`, the only one loaded (`--strict-mcp-config`)
- Refused: Bash, Read, WebFetch, WebSearch and sub-agents, so the agent sees key names from the server and never a value
- Prompt: `Use envsync-le to check which .env files here are missing keys, against .env.example. One short line each.`

The model answers differently each run. This is the take that was kept.
