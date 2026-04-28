#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

main().catch((error) => {
  writeJson({
    ok: false,
    error: {
      code: "CLI_ERROR",
      message: error.message
    }
  });
  process.exitCode = 1;
});

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === "help" || command === "--help" || command === "-h") {
    printHelp();
    return;
  }

  if (command === "health") {
    const port = optionNumber(args, "--port", 4317);
    writeJson(await getJson(port, "/api/health"));
    return;
  }

  if (command === "experiments") {
    const port = optionNumber(args, "--port", 4317);
    writeJson(await getJson(port, "/api/experiments"));
    return;
  }

  if (command === "demo" && args[1] === "start") {
    const port = optionNumber(args, "--port", 4317);
    writeJson(await postJson(port, "/api/demo/start", {}));
    return;
  }

  if (command === "demo" && args[1] === "auto") {
    const port = optionNumber(args, "--port", 4317);
    const timeoutMs = optionNumber(args, "--timeout", 60000);
    const keepServer = args.includes("--keep-server");
    const result = await runAutoDemo({ port, timeoutMs, keepServer });
    writeJson({ ok: true, data: result });
    return;
  }

  if (command === "scan" && args[1] === "dry-run") {
    const port = optionNumber(args, "--port", 4317);
    const body = {
      widthMm: optionNumber(args, "--width-mm", 30),
      heightMm: optionNumber(args, "--height-mm", 20),
      stepMm: optionNumber(args, "--step-mm", 5),
      pointDelayMs: optionNumber(args, "--point-delay-ms", 20)
    };
    writeJson(await postJson(port, "/api/scans/dry-run", body));
    return;
  }

  throw new Error(`Unknown command: ${args.join(" ")}`);
}

async function runAutoDemo({ port, timeoutMs, keepServer }) {
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
    await waitForHealth(port, 10000);
    const created = await postJson(port, "/api/demo/start", {});
    if (!created.ok) {
      throw new Error(`Demo start failed: ${JSON.stringify(created)}`);
    }

    const summary = await waitForGradeA(port, created.data.id, timeoutMs);
    const last = summary.data.iterations.at(-1);
    return {
      experimentId: created.data.id,
      status: summary.data.experiment.status,
      iterationId: last.iteration.id,
      grade: last.evaluation.grade,
      numericScore: last.evaluation.numericScore,
      targetReached: last.evaluation.targetReached,
      url: `http://localhost:${port}`
    };
  } finally {
    if (!keepServer) {
      server.kill();
      await waitForExit(server);
    }
  }
}

async function waitForHealth(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = await getJson(port, "/api/health");
      if (result.ok) return;
    } catch {
      await sleep(200);
    }
  }
  throw new Error("Server did not become healthy");
}

async function waitForGradeA(port, experimentId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let latest = null;
  while (Date.now() < deadline) {
    latest = await getJson(port, `/api/experiments/${experimentId}`);
    const last = latest.data?.iterations?.at(-1);
    if (
      latest.data?.experiment?.status === "completed" &&
      last?.evaluation?.grade === "A" &&
      last?.evaluation?.targetReached === true
    ) {
      return latest;
    }
    await sleep(500);
  }
  throw new Error(`Auto demo did not reach A: ${JSON.stringify(latest)}`);
}

async function getJson(port, pathName) {
  const response = await fetch(`http://127.0.0.1:${port}${pathName}`);
  return response.json();
}

async function postJson(port, pathName, body) {
  const response = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}

function optionNumber(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} expects a number`);
  }
  return value;
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

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printHelp() {
  process.stdout.write(`AIterLab CLI

Commands:
  aiterlab health --port 4317
  aiterlab experiments --port 4317
  aiterlab demo start --port 4317
  aiterlab demo auto --port 4317 --timeout 60000
  aiterlab scan dry-run --port 4317 --width-mm 30 --height-mm 20 --step-mm 5

All commands print JSON.
`);
}
