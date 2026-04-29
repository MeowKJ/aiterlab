import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const repoRoot = new URL("..", import.meta.url);

test("AIterLab MCP server exposes experiment and Agent tools", async () => {
  const port = 8600 + Math.floor(Math.random() * 1000);
  const dataRoot = await mkdtemp(path.join(tmpdir(), "aiterlab-mcp-test-"));
  const core = spawn(process.execPath, ["apps/server/src/index.js"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      AITERLAB_PORT: String(port),
      AITERLAB_DATA_ROOT: dataRoot
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });

  let mcp = null;
  try {
    await waitForHealth(port);
    mcp = spawn(process.execPath, ["packages/mcp-server/src/index.js"], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AITERLAB_URL: `http://127.0.0.1:${port}`
      },
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true
    });

    const client = createMcpClient(mcp);
    const initialized = await client.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "aiterlab-test", version: "0.1.0" }
    });
    assert.equal(initialized.serverInfo.name, "aiterlab-mcp");

    const listed = await client.request("tools/list", {});
    const names = listed.tools.map((tool) => tool.name);
    assert.ok(names.includes("aiterlab.create_agent_session"));
    assert.ok(names.includes("aiterlab.emit_agent_event"));

    const health = await client.request("tools/call", {
      name: "aiterlab.health",
      arguments: {}
    });
    assert.equal(health.structuredContent.ok, true);

    const session = await client.request("tools/call", {
      name: "aiterlab.create_agent_session",
      arguments: {
        actor: "codex",
        name: "MCP test Agent session",
        goal: "Verify MCP can create live Agent collaboration sessions."
      }
    });
    assert.equal(session.structuredContent.ok, true);
    assert.match(session.structuredContent.data.experiment.id, /^exp_/);
    assert.match(session.structuredContent.data.url, /experimentId=exp_/);
  } finally {
    if (mcp) mcp.kill();
    core.kill();
    await waitForExit(core);
  }
}, { timeout: 30000 });

function createMcpClient(child) {
  let nextId = 1;
  let buffer = Buffer.alloc(0);
  const pending = new Map();

  child.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (const message of takeMessages()) {
      const deferred = pending.get(message.id);
      if (!deferred) continue;
      pending.delete(message.id);
      if (message.error) deferred.reject(new Error(message.error.message));
      else deferred.resolve(message.result);
    }
  });

  function takeMessages() {
    const messages = [];
    while (buffer.length) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) break;
      const header = buffer.slice(0, headerEnd).toString("utf8");
      const match = header.match(/content-length:\s*(\d+)/i);
      assert.ok(match, `missing content length in ${header}`);
      const length = Number(match[1]);
      const start = headerEnd + 4;
      const end = start + length;
      if (buffer.length < end) break;
      messages.push(JSON.parse(buffer.slice(start, end).toString("utf8")));
      buffer = buffer.slice(end);
    }
    return messages;
  }

  return {
    request(method, params) {
      const id = nextId;
      nextId += 1;
      const message = { jsonrpc: "2.0", id, method, params };
      const json = JSON.stringify(message);
      const frame = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n${json}`;
      child.stdin.write(frame);
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        setTimeout(() => {
          if (pending.has(id)) {
            pending.delete(id);
            reject(new Error(`MCP request timed out: ${method}`));
          }
        }, 10000);
      });
    }
  };
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
    setTimeout(resolve, 2000);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
