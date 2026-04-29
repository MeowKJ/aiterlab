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

  if (command === "agent" && args[1] === "start") {
    const port = optionNumber(args, "--port", 4317);
    const body = {
      actor: optionString(args, "--actor", "codex"),
      name: optionString(args, "--name", "Agent collaboration session"),
      goal: optionString(args, "--goal", "Realtime Agent collaboration session.")
    };
    writeJson(await postJson(port, "/api/agent/sessions", body));
    return;
  }

  if (command === "agent" && args[1] === "emit") {
    const port = optionNumber(args, "--port", 4317);
    const body = {
      type: optionString(args, "--type", "agent.status"),
      experimentId: optionString(args, "--experiment-id", ""),
      iterationId: optionString(args, "--iteration-id", ""),
      actor: optionString(args, "--actor", "codex"),
      status: optionString(args, "--status", "running"),
      phase: optionString(args, "--phase", "working"),
      message: optionString(args, "--message", ""),
      command: optionString(args, "--command", ""),
      files: optionValues(args, "--file")
    };
    if (!body.experimentId) throw new Error("--experiment-id is required");
    if (!body.iterationId) throw new Error("--iteration-id is required");
    writeJson(await postJson(port, "/api/agent/events", body));
    return;
  }

  if (command === "agent" && args[1] === "demo") {
    const port = optionNumber(args, "--port", 4317);
    const result = await runAgentDemo({ port });
    writeJson({ ok: true, data: result });
    return;
  }

  throw new Error(`Unknown command: ${args.join(" ")}`);
}

async function runAgentDemo({ port }) {
  const started = await postJson(port, "/api/agent/sessions", {
    actor: "codex",
    name: "Codex realtime collaboration demo",
    goal: "Show live Agent collaboration events alongside experiment state."
  });
  if (!started.ok) throw new Error(`Agent session start failed: ${JSON.stringify(started)}`);

  const { experiment, iteration, url } = started.data;
  const timeline = [
    {
      type: "agent.status",
      status: "running",
      phase: "inspect",
      message: "Codex 正在检查实验接口、事件流和 UI 布局。",
      command: "Get-Content apps/web/app.js",
      files: ["apps/web/app.js"]
    },
    {
      type: "agent.plan_delta",
      status: "running",
      phase: "plan",
      message: "Codex 将补齐 Agent 协作层：状态、命令、文件、阻塞点和完成事件。",
      files: ["apps/server/src/index.js", "apps/cli/src/index.js"]
    },
    {
      type: "agent.file_changed",
      status: "running",
      phase: "edit",
      message: "Codex 正在修改看板，让 Agent 工作过程成为实时事件。",
      files: ["apps/web/index.html", "apps/web/app.js", "apps/web/styles.css"]
    },
    {
      type: "agent.command",
      status: "running",
      phase: "verify",
      message: "Codex 正在运行自动测试验证协作事件流。",
      command: "node scripts/check-js.js && node --test"
    },
    {
      type: "agent.session.completed",
      status: "completed",
      phase: "done",
      message: "Codex 协作 demo 完成：实时状态、命令和文件变化已经可见。"
    }
  ];

  for (const item of timeline) {
    await postJson(port, "/api/agent/events", {
      ...item,
      experimentId: experiment.id,
      iterationId: iteration.id,
      actor: "codex"
    });
    await sleep(450);
  }

  return {
    experimentId: experiment.id,
    iterationId: iteration.id,
    url,
    events: timeline.length
  };
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

function optionString(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (value === undefined) {
    throw new Error(`${name} expects a value`);
  }
  return value;
}

function optionValues(args, name) {
  const values = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === name) {
      const value = args[index + 1];
      if (value === undefined) throw new Error(`${name} expects a value`);
      values.push(value);
    }
  }
  return values;
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
  aiterlab agent start --port 4317 --actor codex --goal "..."
  aiterlab agent emit --port 4317 --experiment-id exp_x --iteration-id iter_001 --message "..."
  aiterlab agent demo --port 4317

All commands print JSON.
`);
}
