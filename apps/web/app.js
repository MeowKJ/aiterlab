const state = {
  currentExperiment: null,
  currentIterationId: null,
  eventCount: 0,
  plan: [],
  logs: [],
  metrics: {
    score: [],
    loss: []
  },
  evaluations: new Map(),
  targetReached: null,
  scan: {
    active: false,
    completedPoints: 0,
    totalPoints: 0,
    current: null,
    maxSignal: null,
    meanSignal: null
  },
  notes: new Map(),
  source: null
};

const els = {
  startDemo: document.querySelector("#startDemo"),
  startScanDryRun: document.querySelector("#startScanDryRun"),
  experiments: document.querySelector("#experiments"),
  currentTitle: document.querySelector("#currentTitle"),
  connectionState: document.querySelector("#connectionState"),
  eventCount: document.querySelector("#eventCount"),
  planList: document.querySelector("#planList"),
  logOutput: document.querySelector("#logOutput"),
  noteOutput: document.querySelector("#noteOutput"),
  scoreOutput: document.querySelector("#scoreOutput"),
  scanOutput: document.querySelector("#scanOutput"),
  metricCanvas: document.querySelector("#metricCanvas")
};

els.startDemo.addEventListener("click", async () => {
  els.startDemo.disabled = true;
  try {
    const result = await postJson("/api/demo/start", {});
    state.currentExperiment = result.data;
    resetLiveState();
    connectStream(state.currentExperiment.id);
    await loadExperiments();
  } finally {
    els.startDemo.disabled = false;
  }
});

els.startScanDryRun.addEventListener("click", async () => {
  els.startScanDryRun.disabled = true;
  try {
    const result = await postJson("/api/scans/dry-run", {
      widthMm: 30,
      heightMm: 20,
      stepMm: 5,
      pointDelayMs: 60
    });
    state.currentExperiment = result.data;
    resetLiveState();
    connectStream(state.currentExperiment.id);
    await loadExperiments();
  } finally {
    els.startScanDryRun.disabled = false;
  }
});

await loadExperiments();
render();

async function loadExperiments() {
  const result = await fetchJson("/api/experiments");
  els.experiments.innerHTML = "";
  for (const experiment of result.data) {
    const card = document.createElement("button");
    card.className = "experiment-card";
    card.innerHTML = `<strong>${escapeHtml(experiment.name)}</strong><p>${escapeHtml(experiment.id)}</p>`;
    card.addEventListener("click", async () => {
      state.currentExperiment = experiment;
      resetLiveState();
      connectStream(experiment.id);
      const summary = await fetchJson(`/api/experiments/${experiment.id}`);
      hydrateSummary(summary.data);
      render();
    });
    els.experiments.append(card);
  }
}

function connectStream(experimentId) {
  if (state.source) state.source.close();
  const source = new EventSource(`/api/events/stream?experimentId=${encodeURIComponent(experimentId)}`);
  state.source = source;
  els.connectionState.textContent = "connecting";

  source.addEventListener("ready", () => {
    els.connectionState.textContent = "live";
  });

  const eventTypes = [
    "experiment.created",
    "iteration.created",
    "run.started",
    "run.completed",
    "run.failed",
    "scan.started",
    "scan.progress",
    "scan.point",
    "scan.completed",
    "scan.failed",
    "runner.log",
    "metric",
    "evaluation.scored",
    "experiment.target_reached",
    "plan.updated",
    "note.observation",
    "note.finalized",
    "system.error"
  ];

  for (const type of eventTypes) {
    source.addEventListener(type, (message) => {
      handleEvent(JSON.parse(message.data));
    });
  }

  source.onerror = () => {
    els.connectionState.textContent = "reconnecting";
  };
}

function handleEvent(event) {
  state.eventCount += 1;
  state.currentIterationId = event.iterationId || state.currentIterationId;

  if (event.type === "plan.updated") {
    state.plan = event.payload.plan || [];
  }

  if (event.type === "runner.log") {
    const line = `[${event.timestamp}] ${event.payload.message}`;
    state.logs.push(line);
    state.logs = state.logs.slice(-240);
  }

  if (event.type === "metric") {
    const { name, value } = event.payload;
    if (!state.metrics[name]) state.metrics[name] = [];
    state.metrics[name].push({ time: event.timestamp, value });
    state.metrics[name] = state.metrics[name].slice(-120);
  }

  if (event.type === "scan.started") {
    state.scan = {
      active: true,
      completedPoints: 0,
      totalPoints: event.payload.scan.totalPoints,
      current: null,
      maxSignal: null,
      meanSignal: null
    };
  }

  if (event.type === "scan.progress") {
    state.scan.active = true;
    state.scan.completedPoints = event.payload.completedPoints;
    state.scan.totalPoints = event.payload.totalPoints;
    state.scan.current = event.payload.current;
  }

  if (event.type === "scan.point") {
    const signal = event.payload.signal;
    state.scan.current = event.payload;
    state.scan.maxSignal = Math.max(state.scan.maxSignal ?? signal, signal);
  }

  if (event.type === "scan.completed") {
    state.scan.active = false;
    state.scan.maxSignal = event.payload.maxSignal;
    state.scan.meanSignal = event.payload.meanSignal;
  }

  if (event.type === "evaluation.scored") {
    state.evaluations.set(event.iterationId, event.payload.evaluation);
  }

  if (event.type === "experiment.target_reached") {
    state.targetReached = event.payload;
  }

  if (event.type === "note.observation") {
    const note = state.notes.get(event.iterationId) || { observation: [] };
    note.observation = [...(note.observation || []), event.payload.observation];
    state.notes.set(event.iterationId, note);
  }

  if (event.type === "note.finalized") {
    state.notes.set(event.iterationId, event.payload.note);
  }

  render();
}

function hydrateSummary(summary) {
  const latest = [...summary.iterations].reverse().find((item) => item.iteration);
  if (!latest) return;
  state.currentIterationId = latest.iteration.id;
  state.plan = latest.plan || [];
  for (const item of summary.iterations) {
    if (item.note && item.iteration) state.notes.set(item.iteration.id, item.note);
    if (item.evaluation && item.iteration) state.evaluations.set(item.iteration.id, item.evaluation);
  }
}

function resetLiveState() {
  state.eventCount = 0;
  state.currentIterationId = null;
  state.plan = [];
  state.logs = [];
  state.metrics = { score: [], loss: [] };
  state.evaluations = new Map();
  state.targetReached = null;
  state.scan = {
    active: false,
    completedPoints: 0,
    totalPoints: 0,
    current: null,
    maxSignal: null,
    meanSignal: null
  };
  state.notes = new Map();
  render();
}

function render() {
  els.currentTitle.textContent = state.currentExperiment
    ? `${state.currentExperiment.name} ${state.currentIterationId ? `/${state.currentIterationId}` : ""}`
    : "No experiment running";
  els.eventCount.textContent = `${state.eventCount} events`;
  renderPlan();
  renderLogs();
  renderNote();
  renderScore();
  renderScan();
  renderChart();
}

function renderPlan() {
  els.planList.innerHTML = "";
  if (!state.plan.length) {
    els.planList.innerHTML = `<p class="empty">Start a demo loop to see the live AI plan.</p>`;
    return;
  }
  for (const item of state.plan) {
    const row = document.createElement("div");
    row.className = `plan-item ${item.status}`;
    row.innerHTML = `<strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.status)}${item.startedAt ? ` · ${formatTime(item.startedAt)}` : ""}</span>`;
    els.planList.append(row);
  }
}

function renderLogs() {
  els.logOutput.textContent = state.logs.length
    ? state.logs.join("\n")
    : "Waiting for runner logs...";
  els.logOutput.scrollTop = els.logOutput.scrollHeight;
}

function renderNote() {
  const note = state.notes.get(state.currentIterationId);
  if (!note) {
    els.noteOutput.innerHTML = "<p>AI note will appear as the iteration produces observations.</p>";
    return;
  }
  els.noteOutput.innerHTML = `
    <h4>Hypothesis</h4>
    <p>${escapeHtml(note.hypothesis || "")}</p>
    <h4>Observations</h4>
    <ul>${(note.observation || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h4>Result</h4>
    <p>${escapeHtml(note.result || "Waiting for final result...")}</p>
    <h4>Next Plan</h4>
    <p>${escapeHtml(note.nextPlan || "Waiting for next plan...")}</p>
  `;
}

function renderScore() {
  const evaluation = state.evaluations.get(state.currentIterationId);
  if (!evaluation) {
    els.scoreOutput.innerHTML = "<p>Waiting for ABCD evaluator...</p>";
    return;
  }

  const criteria = evaluation.criteria || {};
  const rows = Object.entries(criteria)
    .map(([name, value]) => `
      <div class="criterion">
        <span>${escapeHtml(name)}</span>
        <div class="bar"><span style="width:${Math.round(value * 100)}%"></span></div>
        <strong>${Math.round(value * 100)}</strong>
      </div>
    `)
    .join("");

  els.scoreOutput.innerHTML = `
    <div class="grade">${escapeHtml(evaluation.grade)}</div>
    <div>
      <div class="numeric">${Number(evaluation.numericScore).toFixed(3)}</div>
      <p>${escapeHtml(evaluation.summary || "")}</p>
    </div>
    <div class="criteria">${rows}</div>
    ${evaluation.targetReached || state.targetReached ? '<div class="target">Target A reached</div>' : ""}
  `;
}

function renderScan() {
  const total = state.scan.totalPoints || 0;
  const completed = state.scan.completedPoints || 0;
  const progress = total ? Math.round((completed / total) * 100) : 0;
  const current = state.scan.current;

  if (!total) {
    els.scanOutput.innerHTML = "<p>Start a scan dry-run to see grid progress and point data.</p>";
    return;
  }

  els.scanOutput.innerHTML = `
    <div class="progress-track"><span style="width:${progress}%"></span></div>
    <div class="scan-kpis">
      <div><span>Progress</span><strong>${completed}/${total}</strong></div>
      <div><span>Status</span><strong>${state.scan.active ? "running" : "done"}</strong></div>
      <div><span>X/Y</span><strong>${current ? `${current.xMm}, ${current.yMm}` : "-"}</strong></div>
      <div><span>Signal</span><strong>${current?.signal ?? state.scan.maxSignal ?? "-"}</strong></div>
    </div>
    <p>max=${state.scan.maxSignal ?? "-"} mean=${state.scan.meanSignal ?? "-"}</p>
  `;
}

function renderChart() {
  const canvas = els.metricCanvas;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  drawGrid(context, width, height);
  drawSeries(context, state.metrics.score, "#0f766e", width, height);
  drawSeries(context, state.metrics.loss, "#c2410c", width, height);
}

function drawGrid(context, width, height) {
  context.strokeStyle = "#e3e8e2";
  context.lineWidth = 1;
  for (let index = 1; index < 5; index += 1) {
    const y = (height / 5) * index;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
}

function drawSeries(context, points, color, width, height) {
  if (!points.length) return;
  const values = points.map((point) => point.value);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const span = max - min || 1;
  context.strokeStyle = color;
  context.lineWidth = 3;
  context.beginPath();
  points.forEach((point, index) => {
    const x = points.length === 1 ? 0 : (index / (points.length - 1)) * width;
    const y = height - ((point.value - min) / span) * (height - 24) - 12;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.stroke();
}

async function fetchJson(url) {
  const response = await fetch(url);
  return response.json();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return response.json();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString();
}
