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
  experiments: document.querySelector("#experiments"),
  experimentHint: document.querySelector("#experimentHint"),
  currentTitle: document.querySelector("#currentTitle"),
  currentMeta: document.querySelector("#currentMeta"),
  connectionState: document.querySelector("#connectionState"),
  eventCount: document.querySelector("#eventCount"),
  planList: document.querySelector("#planList"),
  logOutput: document.querySelector("#logOutput"),
  noteOutput: document.querySelector("#noteOutput"),
  scoreOutput: document.querySelector("#scoreOutput"),
  scanOutput: document.querySelector("#scanOutput"),
  metricCanvas: document.querySelector("#metricCanvas")
};

await loadExperiments();
const initialExperimentId = new URL(window.location.href).searchParams.get("experimentId");
if (initialExperimentId) {
  await loadExperimentById(initialExperimentId);
} else {
  render();
}

async function loadExperiments() {
  const result = await fetchJson("/api/experiments");
  const allExperiments = result.data || [];
  const visibleExperiments = allExperiments.filter((experiment) => !isUtilityExperiment(experiment));
  const hiddenCount = allExperiments.length - visibleExperiments.length;
  const experiments = visibleExperiments.slice(0, 6);
  els.experiments.innerHTML = "";
  els.experimentHint.textContent = hiddenCount
    ? `正式 ${visibleExperiments.length} 个 / 已折叠 ${hiddenCount} 个`
    : `共 ${visibleExperiments.length} 个`;

  if (!experiments.length) {
    els.experiments.innerHTML = `
      <p class="empty">暂无正式实验。开发验证记录已折叠，不再占满列表。</p>
      ${hiddenCount ? `<p class="utility-summary">已折叠 ${hiddenCount} 个开发验证实验。</p>` : ""}
    `;
    return;
  }

  for (const experiment of experiments) {
    const card = document.createElement("article");
    card.className = "experiment-card";
    card.tabIndex = 0;
    card.innerHTML = `
      <strong>${escapeHtml(localizeExperimentName(experiment.name))}</strong>
      <span class="experiment-status ${escapeHtml(experiment.status || "unknown")}">${escapeHtml(localizeStatus(experiment.status))}</span>
      <p>${formatDateTime(experiment.createdAt)} · ${formatRelativeTime(experiment.createdAt)}</p>
      <small>耗时 ${formatDurationBetween(experiment.createdAt, experiment.updatedAt)}</small>
    `;
    card.addEventListener("click", async () => {
      await loadExperimentById(experiment.id);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter") card.click();
    });
    els.experiments.append(card);
  }
}

async function loadExperimentById(experimentId) {
  const summary = await fetchJson(`/api/experiments/${encodeURIComponent(experimentId)}`);
  state.currentExperiment = summary.data.experiment;
  resetLiveState();
  connectStream(experimentId);
  hydrateSummary(summary.data);
  render();
}

function connectStream(experimentId) {
  if (state.source) state.source.close();
  const source = new EventSource(`/api/events/stream?experimentId=${encodeURIComponent(experimentId)}`);
  state.source = source;
  els.connectionState.textContent = "连接中";

  source.addEventListener("ready", () => {
    els.connectionState.textContent = "实时";
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
    els.connectionState.textContent = "重连中";
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
  if (state.currentExperiment) {
    els.currentTitle.textContent = localizeExperimentName(state.currentExperiment.name);
    els.currentMeta.textContent = [
      state.currentIterationId ? `迭代 ${state.currentIterationId}` : "等待迭代",
      `创建 ${formatDateTime(state.currentExperiment.createdAt)}`,
      `更新 ${formatRelativeTime(state.currentExperiment.updatedAt)}`
    ].join(" · ");
  } else {
    els.currentTitle.textContent = "暂无运行中的实验";
    els.currentMeta.textContent = "等待 AI、CLI、API 或外部实验进程接管后写入实时数据。";
  }
  els.eventCount.textContent = `${state.eventCount} 条事件`;
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
    els.planList.innerHTML = `<p class="empty">实验被 AI 或外部进程接管后，这里会显示当前运行、已经完成、未来计划和时间。</p>`;
    return;
  }
  const groups = [
    ["running", "当前运行"],
    ["completed", "已经完成"],
    ["pending", "未来计划"]
  ];

  for (const [status, title] of groups) {
    const items = state.plan.filter((item) => item.status === status);
    if (!items.length) continue;
    const group = document.createElement("section");
    group.className = "plan-group";
    group.innerHTML = `<h4>${title}</h4>`;
    for (const item of items) {
      const row = document.createElement("div");
      row.className = `plan-item ${item.status}`;
      row.innerHTML = `
        <strong>${escapeHtml(localizePlanTitle(item.title))}</strong>
        <span>${escapeHtml(localizeStatus(item.status))}${item.startedAt ? ` · ${formatTime(item.startedAt)}` : ""}${item.endedAt ? ` · 耗时 ${formatDurationBetween(item.startedAt, item.endedAt)}` : ""}</span>
      `;
      group.append(row);
    }
    els.planList.append(group);
  }
}

function renderLogs() {
  els.logOutput.textContent = state.logs.length
    ? state.logs.join("\n")
    : "等待运行日志...";
  els.logOutput.scrollTop = els.logOutput.scrollHeight;
}

function renderNote() {
  const note = state.notes.get(state.currentIterationId);
  if (!note) {
    els.noteOutput.innerHTML = "<p>AI 记录会随着实验观察自动生成。</p>";
    return;
  }
  els.noteOutput.innerHTML = `
    <h4>假设</h4>
    <p>${escapeHtml(note.hypothesis || "")}</p>
    <h4>观察</h4>
    <ul>${(note.observation || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    <h4>结果</h4>
    <p>${escapeHtml(note.result || "等待最终结果...")}</p>
    <h4>下一步</h4>
    <p>${escapeHtml(note.nextPlan || "等待下一步计划...")}</p>
  `;
}

function renderScore() {
  const evaluation = state.evaluations.get(state.currentIterationId);
  if (!evaluation) {
    els.scoreOutput.innerHTML = "<p>等待 ABCD 评分器...</p>";
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
    ${evaluation.targetReached || state.targetReached ? '<div class="target">已达到 A 级目标</div>' : ""}
  `;
}

function renderScan() {
  const total = state.scan.totalPoints || 0;
  const completed = state.scan.completedPoints || 0;
  const progress = total ? Math.round((completed / total) * 100) : 0;
  const current = state.scan.current;

  if (!total) {
    els.scanOutput.innerHTML = "<p>扫描任务接管后，这里会显示网格进度和实时点位数据。</p>";
    return;
  }

  els.scanOutput.innerHTML = `
    <div class="progress-track"><span style="width:${progress}%"></span></div>
    <div class="scan-kpis">
      <div><span>Progress</span><strong>${completed}/${total}</strong></div>
      <div><span>Status</span><strong>${state.scan.active ? "运行中" : "完成"}</strong></div>
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
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function formatRelativeTime(value) {
  if (!value) return "时间未知";
  const diffMs = Date.now() - new Date(value).getTime();
  if (Number.isNaN(diffMs)) return "时间未知";
  const absMs = Math.abs(diffMs);
  const units = [
    ["day", 86400000],
    ["hour", 3600000],
    ["minute", 60000],
    ["second", 1000]
  ];
  const formatter = new Intl.RelativeTimeFormat("zh-CN", { numeric: "auto" });
  for (const [unit, ms] of units) {
    if (absMs >= ms || unit === "second") {
      return formatter.format(Math.round(-diffMs / ms), unit);
    }
  }
  return "刚刚";
}

function formatDurationBetween(start, end) {
  if (!start || !end) return "-";
  const durationMs = Math.max(0, new Date(end).getTime() - new Date(start).getTime());
  if (!Number.isFinite(durationMs)) return "-";
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = Math.round(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${restSeconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

function localizeStatus(status) {
  return {
    running: "运行中",
    completed: "已完成",
    pending: "待执行",
    failed: "失败"
  }[status] || "未知";
}

function localizeExperimentName(name) {
  return {
    "AIterLab demo": "开发验证记录",
    "AIterLab scan dry-run": "扫描 dry-run"
  }[name] || name || "未命名实验";
}

function isUtilityExperiment(experiment) {
  return [
    "AIterLab demo",
    "AIterLab scan dry-run"
  ].includes(experiment.name);
}

function localizePlanTitle(title) {
  return {
    "Prepare candidate configuration": "准备候选配置",
    "Run simulated experiment": "运行模拟实验",
    "Analyze metric trend": "分析指标趋势",
    "Score with ABCD evaluator": "ABCD 评分",
    "Write AI note": "写入 AI 记录",
    "Create scan grid": "创建扫描网格",
    "Stream scan points": "推送扫描点流",
    "Summarize scan signal": "汇总扫描信号",
    "Write AI scan note": "写入扫描 AI 记录"
  }[title] || title || "未命名步骤";
}
