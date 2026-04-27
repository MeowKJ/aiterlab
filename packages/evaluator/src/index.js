export const gradeThresholds = {
  A: 0.85,
  B: 0.7,
  C: 0.55,
  D: 0
};

export const scoringWeights = {
  outcome: 0.4,
  trend: 0.25,
  stability: 0.15,
  noteQuality: 0.1,
  runHealth: 0.1
};

export function evaluateIteration({ metrics = [], note = {}, run = {} } = {}) {
  const scoreValues = valuesFor(metrics, "score");
  const lossValues = valuesFor(metrics, "loss");
  const finalScore = last(scoreValues) ?? 0;
  const finalLoss = last(lossValues) ?? 1;

  const criteria = {
    outcome: outcomeScore(finalScore, finalLoss),
    trend: trendScore(scoreValues),
    stability: stabilityScore(lossValues),
    noteQuality: noteQualityScore(note),
    runHealth: runHealthScore(run)
  };
  const numericScore = round01(
    criteria.outcome * scoringWeights.outcome +
      criteria.trend * scoringWeights.trend +
      criteria.stability * scoringWeights.stability +
      criteria.noteQuality * scoringWeights.noteQuality +
      criteria.runHealth * scoringWeights.runHealth
  );
  const grade = gradeFor(numericScore);

  return {
    numericScore,
    grade,
    targetReached: grade === "A",
    criteria,
    summary: summarizeGrade(grade, numericScore, criteria),
    nextAction: nextActionFor(grade, criteria),
    thresholds: gradeThresholds,
    weights: scoringWeights
  };
}

export function gradeFor(score) {
  if (score >= gradeThresholds.A) return "A";
  if (score >= gradeThresholds.B) return "B";
  if (score >= gradeThresholds.C) return "C";
  return "D";
}

export function recommendNextCandidate({ previousCandidate = 1, evaluation } = {}) {
  const grade = evaluation?.grade || "D";
  const base = Number(previousCandidate || 1);
  const step =
    grade === "A" ? 0 :
    grade === "B" ? 0.35 :
    grade === "C" ? 0.6 :
    0.9;

  return {
    candidate: Number((base + step).toFixed(2)),
    reason: step === 0
      ? "Target grade A reached; freeze candidate for reproduction."
      : `Grade ${grade} needs another iteration; increase candidate strength by ${step}.`
  };
}

function valuesFor(metrics, name) {
  return metrics
    .filter((metric) => metric.name === name)
    .map((metric) => Number(metric.value))
    .filter((value) => Number.isFinite(value));
}

function outcomeScore(finalScore, finalLoss) {
  const scorePart = clamp01(finalScore);
  const lossPart = clamp01(1 - finalLoss);
  return round01(scorePart * 0.75 + lossPart * 0.25);
}

function trendScore(values) {
  if (values.length < 2) return 0;
  const improvement = last(values) - values[0];
  return clamp01(0.5 + improvement * 1.8);
}

function stabilityScore(values) {
  if (values.length < 3) return 0.7;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  const deviation = Math.sqrt(variance);
  return clamp01(1 - deviation * 4);
}

function noteQualityScore(note) {
  const fields = [
    note.hypothesis,
    note.action,
    note.result,
    note.reasoning,
    note.nextPlan
  ];
  const filled = fields.filter((field) => String(field || "").trim().length >= 12).length;
  const observationCount = Array.isArray(note.observation) ? note.observation.length : 0;
  return clamp01(filled / fields.length * 0.75 + Math.min(observationCount, 3) / 3 * 0.25);
}

function runHealthScore(run) {
  if (run.status === "completed" || run.code === 0) return 1;
  if (run.status === "running") return 0.5;
  return 0;
}

function summarizeGrade(grade, numericScore, criteria) {
  return `Grade ${grade} (${numericScore.toFixed(3)}): outcome=${criteria.outcome.toFixed(2)}, trend=${criteria.trend.toFixed(2)}, stability=${criteria.stability.toFixed(2)}, note=${criteria.noteQuality.toFixed(2)}, health=${criteria.runHealth.toFixed(2)}.`;
}

function nextActionFor(grade, criteria) {
  if (grade === "A") return "Stop iteration and mark this experiment as reproducible.";
  if (criteria.outcome < 0.75) return "Prioritize higher final score and lower final loss.";
  if (criteria.trend < 0.7) return "Search for a stronger improvement trend in the next candidate.";
  if (criteria.stability < 0.7) return "Reduce volatility before increasing candidate strength.";
  if (criteria.noteQuality < 0.7) return "Improve AI note completeness before accepting the run.";
  return "Run one more iteration with a slightly stronger candidate.";
}

function last(values) {
  return values.length ? values[values.length - 1] : undefined;
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function round01(value) {
  return Number(clamp01(value).toFixed(4));
}
