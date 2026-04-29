import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = new URL("..", import.meta.url);

test("AIterLab records and replays Agent collaboration events", async () => {
  const port = 7600 + Math.floor(Math.random() * 1000);
  const dataRoot = await mkdtemp(path.join(tmpdir(), "aiterlab-agent-test-"));
  const server = spawn(process.execPath, ["apps/server/src/index.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AITERLAB_PORT: String(port),
      AITERLAB_DATA_ROOT: dataRoot
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  try {
    await waitForHealth(port);
    const result = await runCli([
      "agent",
      "demo",
      "--port",
      String(port)
    ]);
    assert.equal(result.ok, true);
    assert.match(result.data.experimentId, /^exp_/);

    const summary = await getJson(port, `/api/experiments/${result.data.experimentId}`);
    const agentEvents = summary.data.events.filter((event) => event.type.startsWith("agent."));
    assert.equal(summary.ok, true);
    assert.equal(summary.data.experiment.status, "completed");
    assert.ok(agentEvents.length >= 6);
    assert.equal(agentEvents.at(-1).type, "agent.session.completed");
    assert.equal(agentEvents.at(-1).payload.status, "completed");
  } finally {
    server.kill();
    await waitForExit(server);
  }
}, { timeout: 30000 });

async function runCli(args) {
  const child = spawn(process.execPath, ["apps/cli/src/index.js", ...args], {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
  const code = await waitForExit(child);
  assert.equal(code, 0, stderr.join(""));
  return JSON.parse(stdout.join(""));
}

async function waitForHealth(port) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    try {
      const health = await getJson(port, "/api/health");
      if (health.ok) return;
    } catch {
      await sleep(200);
    }
  }
  throw new Error("server did not become healthy");
}

async function getJson(port, pathName) {
  const response = await fetch(`http://127.0.0.1:${port}${pathName}`);
  return response.json();
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.once("exit", resolve);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
