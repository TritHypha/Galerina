// compose.ts — conjunctive fold of factors + the (preview-only) boundary interpretation.
import assert from "node:assert/strict";
import { test } from "node:test";
import { Verdict, composeAuthVerdict, previewAdmission } from "../dist/index.js";

test("all factors ALLOW → ALLOW (+1)", () => {
  assert.equal(composeAuthVerdict([Verdict.ALLOW, Verdict.ALLOW, Verdict.ALLOW]), Verdict.ALLOW);
});

test("any INDETERMINATE pulls the composite to UNKNOWN (typed, never 0)", () => {
  assert.equal(composeAuthVerdict([Verdict.ALLOW, Verdict.UNKNOWN, Verdict.ALLOW]), Verdict.UNKNOWN);
});

test("DENY without UNKNOWN annihilates → DENY (−1); DENY ∧ UNKNOWN is UNKNOWN (infectious K3 vAnd) and still refused", () => {
  assert.equal(composeAuthVerdict([Verdict.ALLOW, Verdict.DENY, Verdict.ALLOW]), Verdict.DENY);
  assert.equal(composeAuthVerdict([Verdict.ALLOW, Verdict.DENY, Verdict.NEUTRAL]), Verdict.DENY);
  const mixed = composeAuthVerdict([Verdict.ALLOW, Verdict.DENY, Verdict.UNKNOWN]);
  assert.equal(mixed, Verdict.UNKNOWN);
  assert.equal(previewAdmission(mixed).authorized, false);
});

test("empty factor set → UNKNOWN (typed, never 0) — deny-by-default, not vacuous ALLOW", () => {
  assert.equal(composeAuthVerdict([]), Verdict.UNKNOWN);
});

test("a single ALLOW factor is preserved", () => {
  assert.equal(composeAuthVerdict([Verdict.ALLOW]), Verdict.ALLOW);
});

// previewAdmission is interpretation only — it mirrors what the kernel WILL decide.
test("previewAdmission(ALLOW) → authorized, decision allow, no diagnostic", () => {
  const d = previewAdmission(Verdict.ALLOW);
  assert.equal(d.authorized, true);
  assert.equal(d.decision, "allow");
  assert.deepEqual(d.diagnostic, { kind: "NONE" });
});

test("previewAdmission(INDETERMINATE) → deny + FUNGI-GOV-3VL-001 diagnostic", () => {
  const seen = [];
  const d = previewAdmission(Verdict.UNKNOWN, (x) => seen.push(x));
  assert.equal(d.authorized, false);
  assert.equal(d.decision, "deny");
  assert.equal(d.diagnostic?.code, "FUNGI-GOV-3VL-001");
  assert.equal(seen.length, 1);
});

test("previewAdmission(DENY) → deny, no diagnostic (ordinary policy denial)", () => {
  const d = previewAdmission(Verdict.DENY);
  assert.equal(d.authorized, false);
  assert.equal(d.decision, "deny");
  assert.deepEqual(d.diagnostic, { kind: "NONE" });
});
