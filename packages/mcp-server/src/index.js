#!/usr/bin/env node

const serverInfo = {
  name: "aiterlab-mcp",
  version: "0.1.0"
};

const protocolVersion = "2025-06-18";
const coreUrl = (process.env.AITERLAB_URL || "http://127.0.0.1:4317").replace(/\/$/, "");

const tools = [
  {
    name: "aiterlab.health",
    title: "AIterLab health",
    description: "Check whether the local AIterLab Core API is reachable.",
    inputSchema: objectSchema({})
  },
  {
    name: "aiterlab.create_experiment",
    title: "Create experiment",
    description: "Create a new AIterLab experiment record.",
    inputSchema: objectSchema({
      name: { type: "string", description: "Experiment name." },
      description: { type: "string", description: "Experiment description." }
    }, ["name"])
  },
  {
    name: "aiterlab.create_agent_session",
    title: "Create Agent session",
    description: "Create a live Agent collaboration session visible in the dashboard.",
    inputSchema: objectSchema({
      actor: { type: "string", description: "Agent name, for example codex or claude-code." },
      name: { type: "string", description: "Session name." },
      goal: { type: "string", description: "What the Agent is trying to accomplish." },
      phase: { type: "string", description: "Initial phase." }
    })
  },
  {
    name: "aiterlab.emit_agent_event",
    title: "Emit Agent event",
    description: "Send a Codex/Claude Code collaboration update into AIterLab.",
    inputSchema: objectSchema({
      experimentId: { type: "string" },
      iterationId: { type: "string" },
      actor: { type: "string" },
      type: {
        type: "string",
        enum: [
          "agent.status",
          "agent.plan_delta",
          "agent.file_changed",
          "agent.command",
          "agent.blocked",
          "agent.session.completed"
        ]
      },
      status: { type: "string", enum: ["running", "blocked", "completed", "failed"] },
      phase: { type: "string" },
      message: { type: "string" },
      command: { type: "string" },
      files: { type: "array", items: { type: "string" } },
      details: { type: "object" }
    }, ["experimentId", "iterationId", "message"])
  },
  {
    name: "aiterlab.emit_event",
    title: "Emit raw event",
    description: "Send a normalized event into the AIterLab realtime stream.",
    inputSchema: objectSchema({
      type: { type: "string" },
      experimentId: { type: "string" },
      iterationId: { type: "string" },
      runId: { type: "string" },
      source: { type: "object" },
      payload: { type: "object" }
    }, ["type", "experimentId", "payload"])
  },
  {
    name: "aiterlab.list_experiments",
    title: "List experiments",
    description: "List recent experiments known to AIterLab.",
    inputSchema: objectSchema({})
  },
  {
    name: "aiterlab.get_experiment_summary",
    title: "Get experiment summary",
    description: "Fetch an experiment with iterations, notes, evaluations, and replayable events.",
    inputSchema: objectSchema({
      experimentId: { type: "string" }
    }, ["experimentId"])
  },
  {
    name: "aiterlab.start_scan_dry_run",
    title: "Start scan dry-run",
    description: "Start the non-hardware scan dry-run adapter and stream scan progress.",
    inputSchema: objectSchema({
      name: { type: "string" },
      widthMm: { type: "number" },
      heightMm: { type: "number" },
      stepMm: { type: "number" },
      pointDelayMs: { type: "number" }
    })
  },
  {
    name: "aiterlab.dashboard_url",
    title: "Dashboard URL",
    description: "Return the dashboard URL for an experiment without opening a browser.",
    inputSchema: objectSchema({
      experimentId: { type: "string" }
    })
  }
];

const toolHandlers = {
  "aiterlab.health": async () => requestCore("GET", "/api/health"),
  "aiterlab.create_experiment": async (args) => requestCore("POST", "/api/experiments", args),
  "aiterlab.create_agent_session": async (args) => requestCore("POST", "/api/agent/sessions", args),
  "aiterlab.emit_agent_event": async (args) => requestCore("POST", "/api/agent/events", args),
  "aiterlab.emit_event": async (args) => requestCore("POST", "/api/events", args),
  "aiterlab.list_experiments": async () => requestCore("GET", "/api/experiments"),
  "aiterlab.get_experiment_summary": async (args) => {
    requireString(args.experimentId, "experimentId");
    return requestCore("GET", `/api/experiments/${encodeURIComponent(args.experimentId)}`);
  },
  "aiterlab.start_scan_dry_run": async (args) => requestCore("POST", "/api/scans/dry-run", args),
  "aiterlab.dashboard_url": async (args) => ({
    ok: true,
    data: {
      url: args.experimentId
        ? `${coreUrl}/?experimentId=${encodeURIComponent(args.experimentId)}`
        : `${coreUrl}/`
    },
    warnings: []
  })
};

let inputBuffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  inputBuffer = Buffer.concat([inputBuffer, chunk]);
  for (const message of takeMessages()) {
    handleMessage(message).catch((error) => {
      if (message?.id !== undefined) {
        sendError(message.id, -32603, error.message);
      }
    });
  }
});

process.stdin.on("end", () => {
  process.exit(0);
});

function takeMessages() {
  const messages = [];
  while (inputBuffer.length) {
    const headerEnd = inputBuffer.indexOf("\r\n\r\n");
    if (headerEnd >= 0) {
      const header = inputBuffer.slice(0, headerEnd).toString("utf8");
      const match = header.match(/content-length:\s*(\d+)/i);
      if (!match) {
        inputBuffer = Buffer.alloc(0);
        break;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (inputBuffer.length < bodyEnd) break;
      const body = inputBuffer.slice(bodyStart, bodyEnd).toString("utf8");
      inputBuffer = inputBuffer.slice(bodyEnd);
      messages.push(JSON.parse(body));
      continue;
    }

    const newline = inputBuffer.indexOf("\n");
    if (newline < 0) break;
    const line = inputBuffer.slice(0, newline).toString("utf8").trim();
    inputBuffer = inputBuffer.slice(newline + 1);
    if (line) messages.push(JSON.parse(line));
  }
  return messages;
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== "2.0") {
    sendError(message?.id ?? null, -32600, "Invalid JSON-RPC message");
    return;
  }

  if (message.method === "notifications/initialized") return;
  if (message.id === undefined) return;

  if (message.method === "initialize") {
    sendResult(message.id, {
      protocolVersion: message.params?.protocolVersion || protocolVersion,
      capabilities: {
        tools: {}
      },
      serverInfo
    });
    return;
  }

  if (message.method === "ping") {
    sendResult(message.id, {});
    return;
  }

  if (message.method === "tools/list") {
    sendResult(message.id, { tools });
    return;
  }

  if (message.method === "tools/call") {
    const name = message.params?.name;
    const args = message.params?.arguments || {};
    const handler = toolHandlers[name];
    if (!handler) {
      sendError(message.id, -32602, `Unknown tool: ${name}`);
      return;
    }
    const result = await handler(args);
    sendResult(message.id, toolResult(result));
    return;
  }

  sendError(message.id, -32601, `Method not found: ${message.method}`);
}

function toolResult(value) {
  const text = JSON.stringify(value, null, 2);
  return {
    content: [{ type: "text", text }],
    structuredContent: value,
    isError: value?.ok === false
  };
}

async function requestCore(method, pathName, body) {
  const response = await fetch(`${coreUrl}${pathName}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json().catch(() => ({
    ok: false,
    error: {
      code: "INVALID_RESPONSE",
      message: `AIterLab Core returned HTTP ${response.status}`
    }
  }));
  return payload;
}

function sendResult(id, result) {
  writeMessage({ jsonrpc: "2.0", id, result });
}

function sendError(id, code, message) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message }
  });
}

function writeMessage(message) {
  const json = JSON.stringify(message);
  const length = Buffer.byteLength(json, "utf8");
  process.stdout.write(`Content-Length: ${length}\r\n\r\n${json}`);
}

function objectSchema(properties, required = []) {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}

function requireString(value, name) {
  if (!value || typeof value !== "string") {
    throw new Error(`${name} is required`);
  }
}
