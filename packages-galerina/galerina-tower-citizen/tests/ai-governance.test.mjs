// ai-governance — hallucination-proof AI action admission (No-Coercion made a headline guarantee).
// The promise: an AI proposal can NEVER cause an action the core rules deny. An action executes IFF
// min(core, ai) = ALLOW, so the AI picks WITHIN the core-allowed set and can never expand it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { governAiProposal, Verdict } from "../dist/index.js";

const { ALLOW, DENY, INDETERMINATE } = Verdict;

test("THE HEADLINE: a hallucinating agent cannot execute a core-denied action", () => {
  // An autonomous agent proposes four actions; it WANTS all of them (ai = ALLOW, max confidence).
  const r = governAiProposal([
    { action: "orders.read",        coreVerdict: ALLOW, aiVerdict: ALLOW }, // legit
    { action: "database.delete:prod", coreVerdict: DENY,  aiVerdict: ALLOW }, // hallucination
    { action: "email.send:receipt", coreVerdict: ALLOW, aiVerdict: ALLOW }, // legit
    { action: "funds.wire:external", coreVerdict: DENY,  aiVerdict: ALLOW }, // hallucination
  ]);
  assert.deepEqual([...r.admitted], ["orders.read", "email.send:receipt"]);
  assert.deepEqual([...r.blockedHallucinations], ["database.delete:prod", "funds.wire:external"]);
  assert.equal(r.containmentHeld, true);
  assert.equal(r.noCoercionHeld, true);
});

test("Theorem 1 — admitted ⊆ core-allowed (the AI never EXPANDS the allowed set)", () => {
  // exhaustive over all 9 (core, ai) verdict combinations
  const V = [DENY, INDETERMINATE, ALLOW];
  const proposals = [];
  for (const core of V) for (const ai of V) proposals.push({ action: `c${core}_a${ai}`, coreVerdict: core, aiVerdict: ai });
  const r = governAiProposal(proposals);
  for (const d of r.decisions) {
    if (d.admitted) assert.equal(d.core, ALLOW, `admitted ${d.action} but core was not ALLOW`);
  }
  assert.equal(r.containmentHeld, true);
});

test("Theorem 2 — effective ≤ core for every action (No-Coercion: the AI can only LOWER)", () => {
  const V = [DENY, INDETERMINATE, ALLOW];
  const proposals = [];
  for (const core of V) for (const ai of V) proposals.push({ action: "x", coreVerdict: core, aiVerdict: ai });
  const r = governAiProposal(proposals);
  for (const d of r.decisions) assert.ok(d.effective <= d.core, `effective ${d.effective} > core ${d.core}`);
  assert.equal(r.noCoercionHeld, true);
});

test("an action executes ONLY when BOTH core and ai are ALLOW (deny-by-default)", () => {
  const r = governAiProposal([
    { action: "both-allow",  coreVerdict: ALLOW, aiVerdict: ALLOW },         // admit
    { action: "ai-declines", coreVerdict: ALLOW, aiVerdict: DENY },          // AI narrows → no
    { action: "ai-unsure",   coreVerdict: ALLOW, aiVerdict: INDETERMINATE }, // no affirmative proposal → no
    { action: "core-denies", coreVerdict: DENY,  aiVerdict: ALLOW },         // hallucination → no
  ]);
  assert.deepEqual([...r.admitted], ["both-allow"]);
});

test("a malformed AI verdict fails CLOSED to DENY (unparseable output can never admit)", () => {
  const r = governAiProposal([
    { action: "garbage-ai", coreVerdict: ALLOW, aiVerdict: 7 },        // not a trit
    { action: "garbage-ai2", coreVerdict: ALLOW, aiVerdict: "yes" },   // not a trit
    { action: "ok",          coreVerdict: ALLOW, aiVerdict: ALLOW },
  ]);
  assert.deepEqual([...r.admitted], ["ok"]);
  assert.equal(r.decisions[0].malformed, true);
  assert.equal(r.decisions[0].admitted, false);
});

test("a non-array batch admits nothing (deny-by-default)", () => {
  const r = governAiProposal(null);
  assert.deepEqual([...r.admitted], []);
});

test("blockedHallucinations lists exactly the AI-wanted, core-refused actions (audit evidence)", () => {
  const r = governAiProposal([
    { action: "a", coreVerdict: DENY,          aiVerdict: ALLOW },         // wanted, refused → blocked
    { action: "b", coreVerdict: INDETERMINATE, aiVerdict: ALLOW },         // wanted, not allowed → blocked
    { action: "c", coreVerdict: ALLOW,         aiVerdict: DENY  },         // not wanted → not a hallucination
    { action: "d", coreVerdict: ALLOW,         aiVerdict: ALLOW },         // wanted + allowed → admitted, not blocked
  ]);
  assert.deepEqual([...r.blockedHallucinations], ["a", "b"]);
});
