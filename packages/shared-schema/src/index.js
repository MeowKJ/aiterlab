export const experimentStatuses = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "paused"
];

export const planStatuses = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
  "paused",
  "scheduled",
  "skipped"
];

export const eventTypes = [
  "experiment.created",
  "iteration.created",
  "run.started",
  "run.heartbeat",
  "run.completed",
  "run.failed",
  "run.cancelled",
  "runner.log",
  "scan.started",
  "scan.progress",
  "scan.point",
  "scan.completed",
  "scan.failed",
  "metric",
  "waveform.chunk",
  "file.created",
  "figure.created",
  "plan.updated",
  "evaluation.scored",
  "experiment.target_reached",
  "note.observation",
  "note.finalized",
  "layout.updated",
  "system.warning",
  "system.error"
];

export function nowIso() {
  return new Date().toISOString();
}

export function createId(prefix) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${stamp}_${random}`;
}

export function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

export function normalizeExperiment(input = {}) {
  assertObject(input, "experiment");
  const id = input.id || createId("exp");
  const createdAt = input.createdAt || nowIso();

  return {
    id,
    name: String(input.name || "Untitled experiment"),
    description: String(input.description || ""),
    status: experimentStatuses.includes(input.status) ? input.status : "running",
    createdAt,
    updatedAt: input.updatedAt || createdAt,
    rootDir: input.rootDir || `data/experiments/${id}`
  };
}

export function normalizeIteration(input = {}) {
  assertObject(input, "iteration");
  const id = input.id || createId("iter");
  const startedAt = input.startedAt || nowIso();

  return {
    id,
    experimentId: String(input.experimentId),
    index: Number(input.index || 1),
    status: experimentStatuses.includes(input.status) ? input.status : "running",
    startedAt,
    endedAt: input.endedAt || null,
    durationMs: Number(input.durationMs || 0)
  };
}

export function normalizeEvent(input = {}) {
  assertObject(input, "event");
  const type = String(input.type || "system.warning");
  if (!eventTypes.includes(type)) {
    throw new Error(`unsupported event type: ${type}`);
  }

  return {
    id: input.id || createId("evt"),
    type,
    experimentId: input.experimentId ? String(input.experimentId) : null,
    iterationId: input.iterationId ? String(input.iterationId) : null,
    runId: input.runId ? String(input.runId) : null,
    timestamp: input.timestamp || nowIso(),
    receivedAt: nowIso(),
    source: input.source || { kind: "system", id: "aiterlab" },
    sequence: Number(input.sequence || 0),
    payload: input.payload || {}
  };
}

export function ok(data, warnings = []) {
  return { ok: true, data, warnings };
}

export function fail(code, message, details = {}) {
  return {
    ok: false,
    error: {
      code,
      message,
      details
    }
  };
}
