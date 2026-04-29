import http from "node:http";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EventBus, JsonlEventStore } from "../../../packages/realtime-stream/src/index.js";
import {
  createId,
  normalizeExperiment,
  normalizeIteration,
  nowIso,
  ok,
  fail
} from "../../../packages/shared-schema/src/index.js";
import {
  appendObservation,
  createAiNote,
  finalizeNote,
  noteToMarkdown
} from "../../../packages/ai-note/src/index.js";
import {
  evaluateIteration,
  recommendNextCandidate
} from "../../../packages/evaluator/src/index.js";
import {
  createScanPlan,
  runDryRunScan
} from "../../../packages/scan-adapter/src/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const webRoot = path.join(repoRoot, "apps", "web");
const dataRoot = process.env.AITERLAB_DATA_ROOT
  ? path.resolve(process.env.AITERLAB_DATA_ROOT)
  : path.join(repoRoot, "data", "experiments");
const port = Number(process.env.AITERLAB_PORT || process.argv.find((arg) => arg.startsWith("--port="))?.split("=")[1] || 4317);

const eventBus = new EventBus({ bufferSize: 5000 });
const eventStore = new JsonlEventStore({ dataRoot });
const sseClients = new Set();

eventBus.subscribe(async (event) => {
  await eventStore.append(event).catch((error) => {
    console.error(JSON.stringify(fail("EVENT_PERSIST_FAILED", error.message)));
  });
  broadcast(event);
});

const server = http.createServer(async (request, response) => {
  try {
    await route(request, response);
  } catch (error) {
    sendJson(response, 500, fail("SERVER_ERROR", error.message));
  }
});

server.listen(port, async () => {
  await mkdir(dataRoot, { recursive: true });
  console.log(`AIterLab running at http://localhost:${port}`);
});

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/health") {
    sendJson(response, 200, ok({ status: "ok", port, time: nowIso() }));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/experiments") {
    sendJson(response, 200, ok(await listExperiments()));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/experiments") {
    const body = await readJson(request);
    const experiment = await createExperiment(body);
    sendJson(response, 201, ok(experiment));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/demo/start") {
    const experiment = await createExperiment({
      name: "AIterLab demo",
      description: "Simulated AI iteration loop with realtime logs, metrics, plan, and AI notes."
    });
    runDemoExperiment(experiment).catch((error) => {
      eventBus.publish({
        type: "system.error",
        experimentId: experiment.id,
        payload: { message: error.message }
      });
    });
    sendJson(response, 202, ok(experiment));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/scans/dry-run") {
    const body = await readJson(request);
    const experiment = await createExperiment({
      name: body.name || "AIterLab scan dry-run",
      description: "Dry-run scan experiment with realtime scan progress and point data."
    });
    runDryRunScanExperiment(experiment, body).catch((error) => {
      eventBus.publish({
        type: "scan.failed",
        experimentId: experiment.id,
        payload: { message: error.message }
      });
    });
    sendJson(response, 202, ok(experiment));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/agent/sessions") {
    const body = await readJson(request);
    const experiment = await createExperiment({
      name: body.name || "Agent collaboration session",
      description: body.description || "Live collaboration stream from Codex, Claude Code, or another AI operator."
    });
    const iteration = await createIteration(experiment, 1);
    const event = eventBus.publish({
      type: "agent.session.started",
      experimentId: experiment.id,
      iterationId: iteration.id,
      source: { kind: "agent", id: body.actor || "agent" },
      payload: {
        actor: body.actor || "agent",
        status: "running",
        phase: body.phase || "session-start",
        message: body.goal || "Agent collaboration session started.",
        goal: body.goal || null
      }
    });
    sendJson(response, 201, ok({
      experiment,
      iteration,
      event,
      url: `http://localhost:${port}/?experimentId=${encodeURIComponent(experiment.id)}`
    }));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/agent/events") {
    const body = await readJson(request);
    const event = eventBus.publish({
      type: body.type || "agent.status",
      experimentId: body.experimentId,
      iterationId: body.iterationId,
      runId: body.runId,
      source: body.source || { kind: "agent", id: body.actor || "agent" },
      payload: {
        actor: body.actor || body.source?.id || "agent",
        status: body.status || "running",
        phase: body.phase || null,
        message: body.message || "",
        files: body.files || [],
        command: body.command || null,
        details: body.details || null
      }
    });
    if (event.type === "agent.session.completed" && event.experimentId) {
      await updateExperimentStatus(event.experimentId, "completed");
    }
    sendJson(response, 201, ok(event));
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/events") {
    const event = eventBus.publish(await readJson(request));
    sendJson(response, 201, ok(event));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/events/stream") {
    openSse(request, response, url);
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/api/experiments/")) {
    const id = decodeURIComponent(url.pathname.split("/")[3] || "");
    sendJson(response, 200, ok(await readExperimentSummary(id)));
    return;
  }

  if (request.method === "GET") {
    await serveStatic(url.pathname, response);
    return;
  }

  sendJson(response, 404, fail("NOT_FOUND", "Route not found"));
}

async function createExperiment(input) {
  const experiment = normalizeExperiment(input);
  const experimentDir = path.join(dataRoot, experiment.id);
  await mkdir(path.join(experimentDir, "iterations"), { recursive: true });
  const stored = {
    ...experiment,
    rootDir: path.relative(repoRoot, experimentDir).replaceAll("\\", "/")
  };
  await writeJson(path.join(experimentDir, "experiment.json"), stored);
  await writeJson(path.join(experimentDir, "index.json"), {
    experimentId: stored.id,
    iterations: [],
    updatedAt: nowIso()
  });
  eventBus.publish({
    type: "experiment.created",
    experimentId: stored.id,
    payload: { experiment: stored }
  });
  return stored;
}

async function createIteration(experiment, index) {
  const iteration = normalizeIteration({
    id: `iter_${String(index).padStart(3, "0")}`,
    experimentId: experiment.id,
    index,
    status: "running"
  });
  const iterationDir = getIterationDir(experiment.id, iteration.id);
  await mkdir(path.join(iterationDir, "logs"), { recursive: true });
  await mkdir(path.join(iterationDir, "figures"), { recursive: true });
  await mkdir(path.join(iterationDir, "results"), { recursive: true });
  await writeJson(path.join(iterationDir, "iteration.json"), iteration);
  await writeJson(path.join(iterationDir, "plan.json"), []);
  eventBus.publish({
    type: "iteration.created",
    experimentId: experiment.id,
    iterationId: iteration.id,
    payload: { iteration }
  });
  return iteration;
}

async function runDemoExperiment(experiment) {
  let candidate = 1;
  const maxIterations = 5;

  for (let index = 1; index <= maxIterations; index += 1) {
    const iteration = await createIteration(experiment, index);
    const runId = `run_demo_${String(index).padStart(3, "0")}`;
    const metrics = [];
    const note = createAiNote({
      id: `note_${iteration.id}`,
      experimentId: experiment.id,
      iterationId: iteration.id,
      hypothesis: `Iteration ${index}: test candidate strength ${candidate.toFixed(2)} and observe whether the ABCD grade reaches A.`
    });
    await saveNote(experiment.id, iteration.id, note);

    const plan = [
      makePlanItem(iteration, 1, "Prepare candidate configuration", "completed"),
      makePlanItem(iteration, 2, "Run simulated experiment", "running"),
      makePlanItem(iteration, 3, "Analyze metric trend", "pending"),
      makePlanItem(iteration, 4, "Score with ABCD evaluator", "pending"),
      makePlanItem(iteration, 5, "Write AI note", "pending")
    ];
    await savePlan(experiment.id, iteration.id, plan);
    publishPlan(experiment.id, iteration.id, plan);
    eventBus.publish({
      type: "run.started",
      experimentId: experiment.id,
      iterationId: iteration.id,
      runId,
      source: { kind: "mock-runner", id: runId },
      payload: { command: "mock:ai-iteration" }
    });

    let currentNote = note;
    for (let step = 1; step <= 20; step += 1) {
      const score = Number((0.5 + candidate * 0.12 + Math.sin(step / 3) * 0.025 + step * 0.006).toFixed(4));
      const loss = Number((1.05 - score + Math.cos(step / 4) * 0.018).toFixed(4));
      metrics.push({ name: "score", value: score, step });
      metrics.push({ name: "loss", value: loss, step });

      eventBus.publish({
        type: "runner.log",
        experimentId: experiment.id,
        iterationId: iteration.id,
        runId,
        source: { kind: "mock-runner", id: runId },
        payload: {
          stream: "stdout",
          message: `iteration=${index} step=${step} score=${score} loss=${loss}`
        }
      });
      eventBus.publish({
        type: "metric",
        experimentId: experiment.id,
        iterationId: iteration.id,
        runId,
        source: { kind: "mock-runner", id: runId },
        payload: { name: "score", value: score }
      });
      eventBus.publish({
        type: "metric",
        experimentId: experiment.id,
        iterationId: iteration.id,
        runId,
        source: { kind: "mock-runner", id: runId },
        payload: { name: "loss", value: loss }
      });

      if (step === 8 || step === 16) {
        const observation = `At step ${step}, score=${score}, loss=${loss}; candidate=${candidate.toFixed(2)} is ${score > 0.7 ? "promising" : "still warming up"}.`;
        currentNote = appendObservation(currentNote, observation);
        await saveNote(experiment.id, iteration.id, currentNote);
        eventBus.publish({
          type: "note.observation",
          experimentId: experiment.id,
          iterationId: iteration.id,
          runId,
          payload: { observation }
        });
      }

      await sleep(220);
    }

    plan[1].status = "completed";
    plan[1].endedAt = nowIso();
    plan[2].status = "completed";
    plan[2].startedAt = plan[1].endedAt;
    plan[2].endedAt = nowIso();
    plan[3].status = "completed";
    plan[3].startedAt = plan[2].endedAt;
    plan[3].endedAt = nowIso();
    plan[4].status = "completed";
    plan[4].startedAt = plan[3].endedAt;
    plan[4].endedAt = nowIso();
    await savePlan(experiment.id, iteration.id, plan);
    publishPlan(experiment.id, iteration.id, plan);

    currentNote = finalizeNote(currentNote, {
      action: `Ran simulated candidate strength ${candidate.toFixed(2)}.`,
      result: "Candidate completed and is ready for ABCD evaluation.",
      reasoning: "The evaluator will combine outcome, trend, stability, note quality, and run health before accepting the iteration.",
      nextPlan: "Use the ABCD grade to decide whether to stop or run another candidate.",
      confidence: Math.min(0.95, 0.68 + index * 0.06),
      tags: ["demo", "iteration", "realtime", "abcd-score"]
    });

    const evaluation = evaluateIteration({
      metrics,
      note: currentNote,
      run: { status: "completed", code: 0 }
    });
    const recommendation = recommendNextCandidate({
      previousCandidate: candidate,
      evaluation
    });
    currentNote = finalizeNote(currentNote, {
      result: `ABCD evaluator assigned grade ${evaluation.grade} with score ${evaluation.numericScore}.`,
      reasoning: evaluation.summary,
      nextPlan: recommendation.reason,
      confidence: Math.min(0.98, evaluation.numericScore)
    });
    await saveNote(experiment.id, iteration.id, currentNote);
    await saveEvaluation(experiment.id, iteration.id, {
      ...evaluation,
      candidate,
      recommendation,
      evaluatedAt: nowIso()
    });

    eventBus.publish({
      type: "note.finalized",
      experimentId: experiment.id,
      iterationId: iteration.id,
      runId,
      payload: { note: currentNote }
    });
    eventBus.publish({
      type: "evaluation.scored",
      experimentId: experiment.id,
      iterationId: iteration.id,
      runId,
      source: { kind: "evaluator", id: "abcd" },
      payload: { evaluation: { ...evaluation, candidate, recommendation } }
    });
    eventBus.publish({
      type: "run.completed",
      experimentId: experiment.id,
      iterationId: iteration.id,
      runId,
      source: { kind: "mock-runner", id: runId },
      payload: { code: 0 }
    });

    if (evaluation.targetReached) {
      await updateExperimentStatus(experiment.id, "completed");
      eventBus.publish({
        type: "experiment.target_reached",
        experimentId: experiment.id,
        iterationId: iteration.id,
        runId,
        source: { kind: "evaluator", id: "abcd" },
        payload: {
          target: "A",
          grade: evaluation.grade,
          numericScore: evaluation.numericScore,
          message: "Target grade A reached. Auto-iteration stopped."
        }
      });
      break;
    }

    candidate = recommendation.candidate;
  }
}

async function runDryRunScanExperiment(experiment, options = {}) {
  const iteration = await createIteration(experiment, 1);
  const runId = createId("run_scan");
  const scanPlan = createScanPlan({
    widthMm: Number(options.widthMm || 30),
    heightMm: Number(options.heightMm || 20),
    stepMm: Number(options.stepMm || 5),
    xStartMm: Number(options.xStartMm || 0),
    yStartMm: Number(options.yStartMm || 0),
    mode: options.mode || "serpentine"
  });
  const note = createAiNote({
    id: `note_${iteration.id}`,
    experimentId: experiment.id,
    iterationId: iteration.id,
    hypothesis: "Dry-run the scan control loop and verify realtime progress, point data, and signal metrics before hardware takeover."
  });
  await saveNote(experiment.id, iteration.id, note);

  const plan = [
    makePlanItem(iteration, 1, "Create scan grid", "completed"),
    makePlanItem(iteration, 2, "Stream scan points", "running"),
    makePlanItem(iteration, 3, "Summarize scan signal", "pending"),
    makePlanItem(iteration, 4, "Write AI scan note", "pending")
  ];
  await savePlan(experiment.id, iteration.id, plan);
  publishPlan(experiment.id, iteration.id, plan);

  eventBus.publish({
    type: "run.started",
    experimentId: experiment.id,
    iterationId: iteration.id,
    runId,
    source: { kind: "scan-adapter", id: "dry-run" },
    payload: { command: "scan:dry-run", scan: scanPlan }
  });

  const summary = await runDryRunScan({
    eventBus,
    experimentId: experiment.id,
    iterationId: iteration.id,
    runId,
    plan: scanPlan,
    pointDelayMs: Number(options.pointDelayMs || 80)
  });

  plan[1].status = "completed";
  plan[1].endedAt = nowIso();
  plan[2].status = "completed";
  plan[2].startedAt = plan[1].endedAt;
  plan[2].endedAt = nowIso();
  plan[3].status = "completed";
  plan[3].startedAt = plan[2].endedAt;
  plan[3].endedAt = nowIso();
  await savePlan(experiment.id, iteration.id, plan);
  publishPlan(experiment.id, iteration.id, plan);

  const finalNote = finalizeNote(note, {
    action: `Executed dry-run scan grid ${scanPlan.nx}x${scanPlan.ny} (${scanPlan.totalPoints} points).`,
    observation: [
      `Max simulated signal=${summary.maxSignal}.`,
      `Mean simulated signal=${summary.meanSignal}.`,
      "Realtime scan.progress and scan.point events were emitted."
    ],
    result: "Scan dry-run completed without touching hardware.",
    reasoning: "The event pipeline is ready to receive real scan progress from 24G/60G runner output or a scan SDK adapter.",
    nextPlan: "After explicit hardware confirmation, connect the real scan command through the runner with serial ports and safety preflight.",
    confidence: 0.88,
    tags: ["scan", "dry-run", "realtime"]
  });
  await saveNote(experiment.id, iteration.id, finalNote);

  eventBus.publish({
    type: "note.finalized",
    experimentId: experiment.id,
    iterationId: iteration.id,
    runId,
    payload: { note: finalNote }
  });
  eventBus.publish({
    type: "run.completed",
    experimentId: experiment.id,
    iterationId: iteration.id,
    runId,
    source: { kind: "scan-adapter", id: "dry-run" },
    payload: { code: 0, summary }
  });
  await updateExperimentStatus(experiment.id, "completed");
}

async function updateExperimentStatus(experimentId, status) {
  const experimentPath = path.join(dataRoot, experimentId, "experiment.json");
  const experiment = await readJsonFile(experimentPath);
  const updated = {
    ...experiment,
    status,
    updatedAt: nowIso()
  };
  await writeJson(experimentPath, updated);
  return updated;
}

function makePlanItem(iteration, order, title, status) {
  const timestamp = nowIso();
  return {
    id: `plan_${iteration.id}_${order}`,
    experimentId: iteration.experimentId,
    iterationId: iteration.id,
    title,
    status,
    startedAt: status === "pending" ? null : timestamp,
    endedAt: status === "completed" ? timestamp : null,
    durationMs: 0,
    order
  };
}

function publishPlan(experimentId, iterationId, plan) {
  eventBus.publish({
    type: "plan.updated",
    experimentId,
    iterationId,
    payload: { plan }
  });
}

async function listExperiments() {
  await mkdir(dataRoot, { recursive: true });
  const entries = await readdir(dataRoot, { withFileTypes: true });
  const experiments = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    try {
      experiments.push(await readJsonFile(path.join(dataRoot, entry.name, "experiment.json")));
    } catch {
      // Ignore incomplete folders so hand-created experiments do not break the list.
    }
  }
  return experiments.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function readExperimentSummary(experimentId) {
  const experimentDir = path.join(dataRoot, experimentId);
  const experiment = await readJsonFile(path.join(experimentDir, "experiment.json"));
  const iterationsDir = path.join(experimentDir, "iterations");
  const entries = await readdir(iterationsDir, { withFileTypes: true }).catch(() => []);
  const iterations = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const iterationDir = path.join(iterationsDir, entry.name);
    const iteration = await readJsonFile(path.join(iterationDir, "iteration.json")).catch(() => null);
    const note = await readJsonFile(path.join(iterationDir, "ai_note.json")).catch(() => null);
    const plan = await readJsonFile(path.join(iterationDir, "plan.json")).catch(() => []);
    const evaluation = await readJsonFile(path.join(iterationDir, "evaluation.json")).catch(() => null);
    const events = await readJsonlFile(path.join(iterationDir, "events.jsonl")).catch(() => []);
    iterations.push({ iteration, note, plan, evaluation, events });
  }

  const events = iterations
    .flatMap((item) => item.events || [])
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
    .slice(-500);

  return { experiment, iterations, events };
}

async function savePlan(experimentId, iterationId, plan) {
  await writeJson(path.join(getIterationDir(experimentId, iterationId), "plan.json"), plan);
}

async function saveNote(experimentId, iterationId, note) {
  const iterationDir = getIterationDir(experimentId, iterationId);
  await writeJson(path.join(iterationDir, "ai_note.json"), note);
  await writeFile(path.join(iterationDir, "ai_note.md"), noteToMarkdown(note), "utf8");
}

async function saveEvaluation(experimentId, iterationId, evaluation) {
  await writeJson(path.join(getIterationDir(experimentId, iterationId), "evaluation.json"), evaluation);
}

function getIterationDir(experimentId, iterationId) {
  return path.join(dataRoot, experimentId, "iterations", iterationId);
}

function openSse(request, response, url) {
  const client = {
    response,
    experimentId: url.searchParams.get("experimentId"),
    iterationId: url.searchParams.get("iterationId"),
    runId: url.searchParams.get("runId")
  };
  response.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*"
  });
  response.write(`event: ready\ndata: ${JSON.stringify({ ok: true, time: nowIso() })}\n\n`);
  for (const event of eventBus.recent({ since: url.searchParams.get("since") })) {
    if (matchesClient(client, event)) sendSse(client, event);
  }
  sseClients.add(client);
  request.on("close", () => sseClients.delete(client));
}

function broadcast(event) {
  for (const client of sseClients) {
    if (matchesClient(client, event)) sendSse(client, event);
  }
}

function matchesClient(client, event) {
  if (client.experimentId && event.experimentId !== client.experimentId) return false;
  if (client.iterationId && event.iterationId !== client.iterationId) return false;
  if (client.runId && event.runId !== client.runId) return false;
  return true;
}

function sendSse(client, event) {
  client.response.write(`id: ${event.id}\n`);
  client.response.write(`event: ${event.type}\n`);
  client.response.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function serveStatic(urlPath, response) {
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = path.join(webRoot, decodeURIComponent(requested));
  if (!filePath.startsWith(webRoot)) {
    sendJson(response, 403, fail("FORBIDDEN", "Invalid path"));
    return;
  }

  const body = await readFile(filePath).catch(() => null);
  if (!body) {
    sendJson(response, 404, fail("NOT_FOUND", "File not found"));
    return;
  }
  response.writeHead(200, { "Content-Type": contentType(filePath) });
  response.end(body);
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function readJsonFile(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readJsonlFile(filePath) {
  const text = await readFile(filePath, "utf8");
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

async function writeJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function sendJson(response, status, data) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(data));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
