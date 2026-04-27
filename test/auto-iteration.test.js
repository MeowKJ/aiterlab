import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const repoRoot = new URL("..", import.meta.url);

test("AIterLab auto-iterates until the ABCD evaluator reaches A", async () => {
  const port = 4600 + Math.floor(Math.random() * 1000);
  const server = spawn(process.execPath, ["apps/server/src/index.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AITERLAB_PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  const logs = [];
  server.stdout.on("data", (chunk) => logs.push(String(chunk)));
  server.stderr.on("data", (chunk) => logs.push(String(chunk)));

  try {
    await waitForHealth(port);
    const created = await postJson(port, "/api/demo/start", {});
    assert.equal(created.ok, true);
    assert.match(created.data.id, /^exp_/);

    const summary = await waitForCompletedGradeA(port, created.data.id);
    const iterations = summary.data.iterations;
    const last = iterations.at(-1);

    assert.equal(summary.data.experiment.status, "completed");
    assert.equal(last.evaluation.grade, "A");
    assert.equal(last.evaluation.targetReached, true);
    assert.ok(last.evaluation.numericScore >= 0.85);
    assert.ok(iterations.length <= 5);
  } finally {
    server.kill();
    await waitForExit(server).catch(() => {});
  }

  if (server.exitCode && server.exitCode !== 0 && server.exitCode !== null) {
    assert.fail(`server exited unexpectedly: ${logs.join("\n")}`);
  }
}, { timeout: 60000 });

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

async function waitForCompletedGradeA(port, experimentId) {
  const deadline = Date.now() + 45000;
  let latest = null;

  while (Date.now() < deadline) {
    latest = await getJson(port, `/api/experiments/${experimentId}`);
    const iterations = latest.data?.iterations || [];
    const last = iterations.at(-1);

    if (
      latest.data?.experiment?.status === "completed" &&
      last?.evaluation?.grade === "A" &&
      last?.evaluation?.targetReached === true
    ) {
      return latest;
    }

    await sleep(500);
  }

  throw new Error(`experiment did not reach A: ${JSON.stringify(latest)}`);
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
    setTimeout(resolve, 2000);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
