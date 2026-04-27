import { nowIso } from "../../shared-schema/src/index.js";

export function createAiNote({ id, experimentId, iterationId, hypothesis = "" }) {
  const timestamp = nowIso();
  return {
    id,
    experimentId,
    iterationId,
    createdAt: timestamp,
    updatedAt: timestamp,
    hypothesis,
    action: "",
    observation: [],
    result: "",
    reasoning: "",
    failureAnalysis: null,
    nextPlan: "",
    links: {
      plan: "plan.json",
      metrics: ["metrics.jsonl"],
      logs: ["logs/run.log"],
      figures: [],
      files: []
    },
    tags: [],
    confidence: null,
    status: "draft"
  };
}

export function appendObservation(note, observation) {
  return {
    ...note,
    updatedAt: nowIso(),
    observation: [...note.observation, observation],
    status: "streaming"
  };
}

export function finalizeNote(note, fields = {}) {
  return {
    ...note,
    ...fields,
    updatedAt: nowIso(),
    status: "finalized"
  };
}

export function noteToMarkdown(note) {
  return `# AI Note

## Hypothesis

${note.hypothesis || ""}

## Action

${note.action || ""}

## Observation

${note.observation.map((item) => `- ${item}`).join("\n")}

## Result

${note.result || ""}

## Reasoning

${note.reasoning || ""}

## Failure Analysis

${note.failureAnalysis || ""}

## Next Plan

${note.nextPlan || ""}

## Links

- plan: ${note.links?.plan || ""}
- metrics: ${(note.links?.metrics || []).join(", ")}
- logs: ${(note.links?.logs || []).join(", ")}
- figures: ${(note.links?.figures || []).join(", ")}
- files: ${(note.links?.files || []).join(", ")}
`;
}
