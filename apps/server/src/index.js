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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");
const webRoot = path.join(repoRoot, "apps", "web");
const dataRoot = path.join(repoRoot, "data", "experiments");
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
  for (let index = 1; index <= 3; index += 1) {
    const iteration = await createIteration(experiment, index);
    const runId = `run_demo_${String(index).padStart(3, "0")}`;
    const note = createAiNote({
      id: `note_${iteration.id}`,
      experimentId: experiment.id,
      iterationId: iteration.id,
      hypothesis: `Iteration ${index}: adjust candidate parameters and observe whether score improves.`
    });
    await saveNote(experiment.id, iteration.id, note);

    const plan = [
      makePlanItem(iteration, 1, "Prepare candidate configuration", "completed"),
      makePlanItem(iteration, 2, "Run simulated experiment", "running"),
      makePlanItem(iteration, 3, "Analyze metric trend", "pending"),
      makePlanItem(iteration, 4, "Write AI note", "pending")
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
      const score = Number((0.52 + index * 0.08 + Math.sin(step / 3) * 0.03 + step * 0.006).toFixed(4));
      const loss = Number((1.1 - score + Math.cos(step / 4) * 0.02).toFixed(4));

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
        const observation = `At step ${step}, score=${score}, loss=${loss}; trend is ${score > 0.7 ? "promising" : "still warming up"}.`;
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
    await savePlan(experiment.id, iteration.id, plan);
    publishPlan(experiment.id, iteration.id, plan);

    currentNote = finalizeNote(currentNote, {
      action: `Ran simulated candidate ${index}.`,
      result: `Candidate ${index} completed with a stable improvement trend.`,
      reasoning: "The score improved across the run while loss stayed bounded, so the next iteration can push the candidate slightly further.",
      nextPlan: index < 3 ? `Use candidate ${index + 1} with a more aggressive search step.` : "Promote the best candidate into a reproducible experiment.",
      confidence: 0.72 + index * 0.05,
      tags: ["demo", "iteration", "realtime"]
    });
    await saveNote(experiment.id, iteration.id, currentNote);

    eventBus.publish({
      type: "note.finalized",
      experimentId: experiment.id,
      iterationId: iteration.id,
      runId,
      payload: { note: currentNote }
    });
    eventBus.publish({
      type: "run.completed",
      experimentId: experiment.id,
      iterationId: iteration.id,
      runId,
      source: { kind: "mock-runner", id: runId },
      payload: { code: 0 }
    });
  }
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
    iterations.push({ iteration, note, plan });
  }

  return { experiment, iterations };
}

async function savePlan(experimentId, iterationId, plan) {
  await writeJson(path.join(getIterationDir(experimentId, iterationId), "plan.json"), plan);
}

async function saveNote(experimentId, iterationId, note) {
  const iterationDir = getIterationDir(experimentId, iterationId);
  await writeJson(path.join(iterationDir, "ai_note.json"), note);
  await writeFile(path.join(iterationDir, "ai_note.md"), noteToMarkdown(note), "utf8");
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
