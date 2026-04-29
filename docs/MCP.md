# AIterLab MCP Server

AIterLab provides a local MCP server so Codex, Claude Code, Claude Desktop, Cursor, and other MCP clients can treat the experiment platform as a native Agent tool surface.

The MCP server talks to the local AIterLab Core API and exposes tools for:

- Creating experiments.
- Creating live Agent collaboration sessions.
- Emitting Codex or Claude status updates.
- Sending raw realtime events.
- Listing and reading experiment history.
- Starting the non-hardware scan dry-run adapter.
- Returning readonly dashboard URLs.

## Start AIterLab Core

```powershell
pnpm start
```

Or without pnpm:

```powershell
node apps/server/src/index.js
```

By default the Core API runs at:

```text
http://127.0.0.1:4317
```

## Run The MCP Server

```powershell
pnpm mcp
```

Or:

```powershell
node packages/mcp-server/src/index.js
```

The MCP server uses stdio. Do not print normal logs to stdout from this process; stdout is reserved for JSON-RPC frames.

To point the MCP server at another AIterLab Core:

```powershell
$env:AITERLAB_URL="http://127.0.0.1:4317"
node packages/mcp-server/src/index.js
```

## Example MCP Client Config

Use the absolute path for your local checkout:

```json
{
  "mcpServers": {
    "aiterlab": {
      "command": "node",
      "args": [
        "C:/Users/ijink/Documents/New project/aiterlab/packages/mcp-server/src/index.js"
      ],
      "env": {
        "AITERLAB_URL": "http://127.0.0.1:4317"
      }
    }
  }
}
```

## Tools

```text
aiterlab.health
aiterlab.create_experiment
aiterlab.create_agent_session
aiterlab.emit_agent_event
aiterlab.emit_event
aiterlab.list_experiments
aiterlab.get_experiment_summary
aiterlab.start_scan_dry_run
aiterlab.dashboard_url
```

## Agent Collaboration Pattern

1. Call `aiterlab.create_agent_session` when Codex or Claude starts work.
2. Call `aiterlab.emit_agent_event` whenever the Agent changes phase, edits files, runs a command, hits a blocker, or completes.
3. Open the returned dashboard URL to view the readonly collaboration stream.
4. Use `aiterlab.get_experiment_summary` to recover the historical event trail.

This makes AIterLab a realtime Agent experiment coordination layer, not just a web dashboard.
