# AIterLab Production Plan

This document turns AIterLab from a planning repository into a production repository.

The production rule is simple:

```text
Every meaningful change must be automatically tested by the computer.
The auto-iteration demo must reach Grade A.
```

## 1. Current Production Target

v0.1 production target:

- Start the local AIterLab server.
- Open the realtime workspace.
- Trigger an AI iteration experiment.
- Stream logs and metrics.
- Write AI notes.
- Score every iteration with ABCD evaluator.
- Auto-iterate until Grade A.
- Persist experiment history.
- Verify the whole loop with an automated test.

## 2. Quality Gates

### Gate 1: Syntax

Command:

```bash
pnpm run test:syntax
```

Requirement:

```text
All JavaScript files pass node --check.
```

### Gate 2: Unit Tests

Command:

```bash
pnpm test
```

Requirement:

```text
Evaluator tests pass.
```

### Gate 3: Auto-Iteration Integration

Command:

```bash
pnpm run test:auto
```

Requirement:

```text
Computer starts the server, runs the demo, waits for Grade A, and verifies completed status.
```

### Gate 4: Full Verification

Command:

```bash
pnpm run verify
```

Requirement:

```text
Syntax check + unit tests + auto-iteration integration all pass.
```

## 3. Production Milestones

### M1: Local Auto-Iteration Platform

Status: in progress

Acceptance:

- `GET /api/health` works.
- `POST /api/demo/start` starts a full loop.
- Auto-iteration reaches A.
- `evaluation.json` is written.
- `experiment.target_reached` is emitted.
- `pnpm run verify` passes.

### M2: Real Runner Integration

Acceptance:

- Python scripts run without pop-up windows.
- stdout/stderr stream into AIterLab.
- timeout/cancel works.
- failed runs produce structured errors.
- runner tests pass on Windows.

### M3: Agent-Friendly CLI

Acceptance:

- `aiterlab experiment create --json`
- `aiterlab run --jsonl`
- `aiterlab event stream --jsonl`
- `aiterlab note append --json`
- all commands return stable exit codes.

### M4: MCP Integration

Acceptance:

- Codex can call AIterLab through MCP.
- Claude Code can call AIterLab through MCP.
- experiments, runs, notes, events, and scores are exposed as MCP tools/resources.

### M5: Production Web Workspace

Acceptance:

- Realtime UI handles reconnect.
- Score panel supports ABCD history.
- Experiment browser loads historical runs.
- AI note panel shows current and past notes.
- Layout state can be saved and restored.

## 4. Auto-Iteration Contract

The demo must stop only when one of these is true:

- Grade A reached.
- maximum iteration count reached.
- runner failed.
- timeout reached.

For v0.1, Grade A is required for the integration test.

Expected final state:

```json
{
  "status": "completed",
  "grade": "A",
  "targetReached": true
}
```

## 5. Release Checklist

Before a release:

- `pnpm run verify`
- README quick start works.
- `LICENSE` is GPL-3.0-only.
- demo reaches A locally.
- GitHub Actions pass.
- no generated experiment data is committed.
- docs reflect current behavior.

## 6. Production Backlog

Priority order:

1. Stabilize automated local verification.
2. Add real Python runner tests.
3. Add CLI.
4. Add MCP server.
5. Add persisted index and query layer.
6. Replace demo chart with production chart component.
7. Add layout schema and UI editing.
8. Add desktop wrapper after web/server is stable.
