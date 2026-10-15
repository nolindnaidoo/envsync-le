# envsync-le, the MCP server: an agent asks it which .env files miss keys.
#   from letools-site: bun run record:demo ../envsync-le mcp
# Claude Code on the logged-in account, in a temp copy, with only this tool's
# server loaded and its tools pre-approved. Read is not allowed, so the agent
# answers from key names and never sees a value. PROMPT.md records the take.

Set Shell "bash"
Set FontSize 28
Set Width 1600
Set Height 1000
Set Padding 32
Set TypingSpeed 45ms
Set Theme "Catppuccin Mocha"

Hide
# The recording starts inside another Claude Code session; its markers would
# put that session's warnings on screen.
Type `unset CLAUDECODE CLAUDE_CODE_CHILD_SESSION CLAUDE_CODE_ENTRYPOINT CLAUDE_CODE_EXECPATH CLAUDE_CODE_MESSAGING_SOCKET CLAUDE_CODE_MESSAGING_TOKEN CLAUDE_CODE_SESSION_ATTENDED CLAUDE_CODE_SESSION_ID CLAUDE_EFFORT CLAUDE_PID`
Enter
Type `D=$PWD; cd "$(mktemp -d /tmp/envsync-le.XXXX)" && cp -R "$D/../cli/input/." . && for f in env.*; do mv "$f" ".$f"; done && printf '{"mcpServers":{"envsync-le":{"command":"node","args":["%s"]}}}' "$D/../../../mcp/server.js" > mcp.json && PS1="$ " && clear`
Enter
Type `clear && claude --mcp-config mcp.json --strict-mcp-config --allowedTools "mcp__envsync-le" --disallowedTools Bash Read WebFetch WebSearch Agent`
Enter
Sleep 6s
# The folder-trust prompt opens on "No, exit".
Down
Enter
Sleep 5s
Show
Sleep 1s
Type "Use envsync-le to check which .env files here are missing keys, against .env.example. One short line each."
Sleep 500ms
Enter
Sleep 24s
