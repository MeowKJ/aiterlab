import { spawn } from "node:child_process";
import readline from "node:readline";
import { createId, nowIso } from "../../shared-schema/src/index.js";

export class ExperimentRunner {
  constructor({ eventBus }) {
    this.eventBus = eventBus;
    this.runs = new Map();
  }

  run(command, { experimentId, iterationId, cwd, timeoutMs = 0 } = {}) {
    const runId = createId("run");
    const startedAt = nowIso();
    const child = spawn(command, {
      cwd,
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const runState = {
      runId,
      command,
      experimentId,
      iterationId,
      pid: child.pid,
      status: "running",
      startedAt,
      endedAt: null
    };
    this.runs.set(runId, { child, state: runState });

    this.eventBus.publish({
      type: "run.started",
      experimentId,
      iterationId,
      runId,
      source: { kind: "runner", id: runId, pid: child.pid },
      payload: { command, pid: child.pid }
    });

    this.pipeStream(child.stdout, "stdout", runState);
    this.pipeStream(child.stderr, "stderr", runState);

    let timeout = null;
    if (timeoutMs > 0) {
      timeout = setTimeout(() => {
        this.cancel(runId, "timeout");
      }, timeoutMs);
    }

    child.on("exit", (code, signal) => {
      if (timeout) clearTimeout(timeout);
      runState.status = code === 0 ? "completed" : "failed";
      runState.endedAt = nowIso();
      this.eventBus.publish({
        type: code === 0 ? "run.completed" : "run.failed",
        experimentId,
        iterationId,
        runId,
        source: { kind: "runner", id: runId, pid: child.pid },
        payload: { code, signal }
      });
    });

    return runState;
  }

  pipeStream(stream, streamName, runState) {
    const reader = readline.createInterface({ input: stream });
    reader.on("line", (line) => {
      const parsed = parseJsonLine(line);
      if (parsed?.type) {
        this.eventBus.publish({
          ...parsed,
          experimentId: parsed.experimentId || runState.experimentId,
          iterationId: parsed.iterationId || runState.iterationId,
          runId: parsed.runId || runState.runId,
          source: {
            kind: "runner",
            id: runState.runId,
            pid: runState.pid,
            stream: streamName
          }
        });
        return;
      }

      this.eventBus.publish({
        type: "runner.log",
        experimentId: runState.experimentId,
        iterationId: runState.iterationId,
        runId: runState.runId,
        source: {
          kind: "runner",
          id: runState.runId,
          pid: runState.pid,
          stream: streamName
        },
        payload: { stream: streamName, message: line }
      });
    });
  }

  status(runId) {
    return this.runs.get(runId)?.state || null;
  }

  cancel(runId, reason = "cancelled") {
    const run = this.runs.get(runId);
    if (!run) return false;
    run.state.status = "cancelled";
    run.state.endedAt = nowIso();
    run.child.kill();
    this.eventBus.publish({
      type: "run.cancelled",
      experimentId: run.state.experimentId,
      iterationId: run.state.iterationId,
      runId,
      source: { kind: "runner", id: runId, pid: run.state.pid },
      payload: { reason }
    });
    return true;
  }
}

function parseJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}
