import test from "node:test";
import assert from "node:assert/strict";
import { evaluateIteration, gradeFor, recommendNextCandidate } from "../packages/evaluator/src/index.js";

test("gradeFor maps numeric score to ABCD", () => {
  assert.equal(gradeFor(0.91), "A");
  assert.equal(gradeFor(0.78), "B");
  assert.equal(gradeFor(0.61), "C");
  assert.equal(gradeFor(0.2), "D");
});

test("evaluateIteration reaches A for strong stable metrics and complete note", () => {
  const metrics = Array.from({ length: 20 }, (_, index) => ({
    name: index % 2 === 0 ? "score" : "loss",
    value: index % 2 === 0 ? 0.72 + index * 0.012 : 0.18 - index * 0.002
  }));
  const evaluation = evaluateIteration({
    metrics,
    note: {
      hypothesis: "The stronger candidate should improve final score.",
      action: "Run candidate with stable search settings.",
      observation: ["score improved", "loss stayed stable", "final run is reproducible"],
      result: "The run reached the target band.",
      reasoning: "Outcome and trend are both strong enough.",
      nextPlan: "Freeze this candidate for reproduction."
    },
    run: { status: "completed", code: 0 }
  });

  assert.equal(evaluation.grade, "A");
  assert.equal(evaluation.targetReached, true);
});

test("recommendNextCandidate stops after A", () => {
  const next = recommendNextCandidate({
    previousCandidate: 2,
    evaluation: { grade: "A" }
  });
  assert.equal(next.candidate, 2);
  assert.match(next.reason, /Target grade A/);
});
