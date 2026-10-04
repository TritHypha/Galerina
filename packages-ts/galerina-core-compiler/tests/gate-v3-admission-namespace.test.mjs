// gate-v3-admission-namespace.test.mjs — the "admission" register.
//
// ★ THIS IS NOT A RENAME GATE, AND THAT IS THE POINT. The G7 exit review
// flagged "admission" naming three unrelated things and queued a rename. The
// rename was RETRACTED once the three were actually read (KTA cycle 0140):
// they are three legitimate concepts at three tiers, and one of them —
// parameter admission — is `.fungi` LANGUAGE SYNTAX (`paramAdmissionDecl`).
// Renaming the function while the syntax keeps the word would make the estate
// less legible, not more.
//
// So the risk was never the word. The risk is a caller reaching for the WRONG
// ONE — picking a plan-tier check when they meant the circuit tier, and
// getting a confident pass to a question they did not ask. That is the same
// failure the exit review found in `verifyAdmissionStatement`, one level up.
//
// This register is the detector for the class: every exported `*Admission*`
// surface is listed with the TIER it serves and the QUESTION it answers. A new
// one cannot appear without landing here, where the author has to say which
// tier it belongs to and read the four already present. A sixth arriving
// silently is exactly how a namespace stops meaning anything.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as compiler from "../dist/index.js";

/** Every admission-named export, its tier, and the question it answers. */
const REGISTER = Object.freeze({
  GATE_V3_ADMISSION_CODES: {
    tier: "gate/G7",
    question: "the GATE-ADMIT-* refusal catalogue for circuit admission",
  },
  buildAdmissionStatement: {
    tier: "gate/G7",
    question: "what does an admission envelope sign over for this circuit? (building is NOT admitting)",
  },
  verifyAdmissionBindings: {
    tier: "gate/G7",
    question: "is this statement ABOUT these exact artifacts? (bindings only — NOT whether anyone signed it)",
  },
  computePlanAdmissionHash: {
    tier: "runtime/execution-plan",
    question: "what admission binding does this plan carry over planHash + generatedAt/maxAgeMs/targetBinding/planSignature? (unkeyed integrity for verifyPlanAdmission to recompute - NOT a signature and NOT an admission decision; RD-0363 P5)",
  },
  verifyPlanAdmission: {
    tier: "runtime/execution-plan",
    question: "is this passive execution plan admissible — hash intact, fresh, target-bound? (K3; a missing signature is INDETERMINATE, never ALLOW)",
  },
  astHasParamAdmission: {
    tier: "language/syntax",
    question: "does any flow carry a `where <predicate>` parameter-admission clause? (used to REFUSE raw-WASM lowering, which would bypass the clause)",
  },
});

test("★ the admission namespace is closed — a new export must be registered here deliberately", () => {
  const live = Object.keys(compiler).filter((k) => /admission/i.test(k)).sort();
  const registered = Object.keys(REGISTER).sort();
  assert.deepEqual(live, registered,
    "an admission-named export appeared or vanished. If new: add it to REGISTER with its TIER and the " +
    "QUESTION it answers, and check it is not a near-duplicate of one already here. If removed: delete " +
    "its row. Either way this is a deliberate act, which is the whole purpose of the register.");
});

test("every registered surface names a distinct tier-and-question, not a synonym", () => {
  // Two entries with the same question at the same tier would mean the estate
  // has grown a duplicate — the condition a rename WOULD be the right answer to.
  const seen = new Set();
  for (const [name, entry] of Object.entries(REGISTER)) {
    const key = `${entry.tier}::${entry.question}`;
    assert.equal(seen.has(key), false, `${name} duplicates another surface's tier-and-question`);
    seen.add(key);
    assert.ok(entry.tier.length > 0 && entry.question.length > 20,
      `${name} needs a real tier and a real question — a blank row registers nothing`);
  }
});

test("the three tiers are genuinely distinct, and that is why no rename is owed", () => {
  const tiers = new Set(Object.values(REGISTER).map((e) => e.tier));
  assert.deepEqual([...tiers].sort(), ["gate/G7", "language/syntax", "runtime/execution-plan"]);
});

test("the gate tier's two verbs stay distinguishable: building is not admitting", () => {
  // The exit review's finding, pinned at the namespace level: these two names
  // must never converge, because one produces an unsigned assertion and the
  // other checks half of what makes it authoritative.
  assert.notEqual(REGISTER.buildAdmissionStatement.question, REGISTER.verifyAdmissionBindings.question);
  assert.match(REGISTER.verifyAdmissionBindings.question, /NOT whether anyone signed/);
  assert.match(REGISTER.buildAdmissionStatement.question, /building is NOT admitting/);
});
