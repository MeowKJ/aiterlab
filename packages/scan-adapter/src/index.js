import { createId } from "../../shared-schema/src/index.js";

export function createScanPlan({
  widthMm = 20,
  heightMm = 20,
  stepMm = 5,
  xStartMm = 0,
  yStartMm = 0,
  mode = "raster"
} = {}) {
  if (stepMm <= 0) {
    throw new Error("stepMm must be positive");
  }

  const nx = Math.floor(widthMm / stepMm) + 1;
  const ny = Math.floor(heightMm / stepMm) + 1;
  const points = [];

  for (let yIndex = 0; yIndex < ny; yIndex += 1) {
    const xRange = mode === "serpentine" && yIndex % 2 === 1
      ? range(nx - 1, -1, -1)
      : range(0, nx, 1);

    for (const xIndex of xRange) {
      points.push({
        index: points.length + 1,
        xIndex,
        yIndex,
        xMm: Number((xStartMm + xIndex * stepMm).toFixed(3)),
        yMm: Number((yStartMm + yIndex * stepMm).toFixed(3))
      });
    }
  }

  return {
    id: createId("scan"),
    mode,
    widthMm,
    heightMm,
    stepMm,
    xStartMm,
    yStartMm,
    nx,
    ny,
    totalPoints: points.length,
    points
  };
}

export async function runDryRunScan({
  eventBus,
  experimentId,
  iterationId,
  runId = createId("run_scan"),
  plan = createScanPlan(),
  pointDelayMs = 80
}) {
  eventBus.publish({
    type: "scan.started",
    experimentId,
    iterationId,
    runId,
    source: { kind: "scan-adapter", id: "dry-run" },
    payload: { scan: summarizePlan(plan), dryRun: true }
  });

  const signals = [];
  for (const point of plan.points) {
    const signal = simulateSignal(point, plan);
    signals.push(signal);
    const progress = point.index / plan.totalPoints;

    eventBus.publish({
      type: "scan.point",
      experimentId,
      iterationId,
      runId,
      source: { kind: "scan-adapter", id: "dry-run" },
      payload: {
        ...point,
        signal,
        progress,
        totalPoints: plan.totalPoints
      }
    });

    eventBus.publish({
      type: "scan.progress",
      experimentId,
      iterationId,
      runId,
      source: { kind: "scan-adapter", id: "dry-run" },
      payload: {
        completedPoints: point.index,
        totalPoints: plan.totalPoints,
        progress,
        current: point
      }
    });

    eventBus.publish({
      type: "metric",
      experimentId,
      iterationId,
      runId,
      source: { kind: "scan-adapter", id: "dry-run" },
      payload: { name: "scan_signal", value: signal }
    });

    await sleep(pointDelayMs);
  }

  const summary = {
    scan: summarizePlan(plan),
    maxSignal: Math.max(...signals),
    meanSignal: Number((signals.reduce((sum, value) => sum + value, 0) / signals.length).toFixed(4)),
    dryRun: true
  };

  eventBus.publish({
    type: "scan.completed",
    experimentId,
    iterationId,
    runId,
    source: { kind: "scan-adapter", id: "dry-run" },
    payload: summary
  });

  return summary;
}

export function build60gScanCommand({
  cliPort,
  motorPort,
  config = ".\\60g\\configs\\sar_near_range.cfg",
  outputPrefix = "captures\\aiterlab_scan",
  widthMm = 20,
  heightMm = 20,
  stepMm = 10,
  z0Mm = 200
} = {}) {
  if (!cliPort || !motorPort) {
    throw new Error("cliPort and motorPort are required for real 60G scans");
  }

  return [
    ".\\.venv\\Scripts\\python.exe",
    ".\\60g\\sar_scan_60g.py",
    "scan",
    "--cli-port", cliPort,
    "--motor-port", motorPort,
    "--config", config,
    "--output-prefix", outputPrefix,
    "--width-mm", String(widthMm),
    "--height-mm", String(heightMm),
    "--step-mm", String(stepMm),
    "--z0-mm", String(z0Mm)
  ];
}

function summarizePlan(plan) {
  return {
    id: plan.id,
    mode: plan.mode,
    widthMm: plan.widthMm,
    heightMm: plan.heightMm,
    stepMm: plan.stepMm,
    nx: plan.nx,
    ny: plan.ny,
    totalPoints: plan.totalPoints
  };
}

function simulateSignal(point, plan) {
  const centerX = (plan.nx - 1) / 2;
  const centerY = (plan.ny - 1) / 2;
  const dx = point.xIndex - centerX;
  const dy = point.yIndex - centerY;
  const radius = Math.sqrt(dx * dx + dy * dy);
  const peak = Math.exp(-(radius * radius) / Math.max(1, plan.nx * plan.ny * 0.08));
  const ripple = Math.sin(point.index * 0.73) * 0.04;
  return Number((0.18 + peak * 0.78 + ripple).toFixed(4));
}

function range(start, stop, step) {
  const values = [];
  if (step > 0) {
    for (let value = start; value < stop; value += step) values.push(value);
  } else {
    for (let value = start; value > stop; value += step) values.push(value);
  }
  return values;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
