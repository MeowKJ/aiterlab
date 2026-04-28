import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const repoRoot = new URL("..", import.meta.url);

test("AIterLab can take over a dry-run scan and complete realtime progress", async () => {
  const port = 6600 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, ["apps/server/src/index.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AITERLAB_PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  try {
    await waitForHealth(port);
    const created = await postJson(port, "/api/scans/dry-run", {
      widthMm: 20,
      heightMm: 10,
      stepMm: 5,
      pointDelayMs: 5
    });
    assert.equal(created.ok, true);

    const summary = await waitForCompletedScan(port, created.data.id);
    const last = summary.data.iterations.at(-1);
    assert.equal(summary.data.experiment.status, "completed");
    assert.equal(last.note.status, "finalized");
    assert.equal(last.plan.at(-1).status, "completed");
  } finally {
    server.kill();
    await waitForExit(server);
  }
}, { timeout: 30000 });

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

async function waitForCompletedScan(port, experimentId) {
  const deadline = Date.now() + 20000;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await getJson(port, `/api/experiments/${experimentId}`);
    if (latest.data?.experiment?.status === "completed") {
      return latest;
    }
    await sleep(250);
  }
  throw new Error(`scan did not complete: ${JSON.stringify(latest)}`);
}

async function getJson(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  return response.json();
}

async function postJson(port, path, body) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.once("exit", resolve);
    setTimeout(resolve, 1500);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
