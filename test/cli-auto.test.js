import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = new URL("..", import.meta.url);

test("aiterlab CLI can run the auto demo to Grade A", async () => {
  const port = 5600 + Math.floor(Math.random() * 1000);
  const dataRoot = await mkdtemp(path.join(tmpdir(), "aiterlab-test-"));
  const child = spawn(process.execPath, [
    "apps/cli/src/index.js",
    "demo",
    "auto",
    "--port",
    String(port),
    "--timeout",
    "60000"
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AITERLAB_DATA_ROOT: dataRoot
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(String(chunk)));

  const code = await waitForExit(child);
  assert.equal(code, 0, stderr.join(""));

  const result = JSON.parse(stdout.join(""));
  assert.equal(result.ok, true);
  assert.equal(result.data.grade, "A");
  assert.equal(result.data.targetReached, true);
  assert.equal(result.data.status, "completed");
}, { timeout: 70000 });

function waitForExit(child) {
  return new Promise((resolve) => {
    child.once("exit", resolve);
  });
}
