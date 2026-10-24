// S10-R1 (X-COMP, CP6): pinned run receipt of the composed RD-1413 -> 1414 -> 1415 route (red first).
// The receipt (S10-R2 generator) must be evidence, not a claim:
//  P1 schema galerina.s10.composed-run-receipt.v1; stages exactly 1413-ingress, 1414-custody, 1415-release in order.
//  P2 bound to bytes: every stage unit and composed-route.fungi carry sha256 equal to the current file, and
//     galerina.mjs sha256 matches; an edited unit or toolchain voids the receipt.
//  P3 replayable: every recorded invocation (file, flow, args) re-run now returns the recorded value; each stage
//     has at least one invocation, and the stage token is derived from its recorded values, not asserted.
//  P4 the composed outcome code equals composeRouteOutcome(stage tokens) re-invoked now, and the outcome name
//     matches it (100 Success, 102 Refused, 106 Indeterminate); Success is never claimed unless the code is 100.
//  P5 honesty: the receipt is NON_AUTHORIZING, names the synthetic SecretsProvider, and does not claim a real
//     credential or production clearance (the real POST /auth/verify credential is the owner's open question).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO, SRC, GALERINA, invoke, evidence } from "./harness.mjs";

const STAGES = ["1413-ingress", "1414-custody", "1415-release"];
const OUTCOME = { 100: "Success", 102: "Refused", 106: "Indeterminate" };

function sha(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}

function receipt() {
  const t = evidence("closure/S10-composed-run-receipt.json");
  assert.notEqual(t, null, "evidence/closure/S10-composed-run-receipt.json missing");
  return JSON.parse(t);
}

test("S10-R1 P1: receipt schema and stage order", () => {
  const j = receipt();
  assert.equal(j.schema, "galerina.s10.composed-run-receipt.v1");
  assert.deepEqual(j.stages.map((s) => s.stage), STAGES);
});

test("S10-R1 P2: receipt is bound to the exact unit and toolchain bytes", () => {
  const j = receipt();
  assert.equal(j.toolchain && j.toolchain.galerinaSha256, sha(GALERINA), "galerina.mjs sha256");
  assert.equal(j.composedUnit && j.composedUnit.path, "packages/fungi/memory/src/composed-route.fungi");
  assert.equal(j.composedUnit.sha256, sha(join(REPO, j.composedUnit.path)), "composed-route.fungi sha256");
  for (const s of j.stages) {
    assert.ok(Array.isArray(s.units) && s.units.length > 0, s.stage + " units");
    for (const u of s.units) {
      const p = join(REPO, u.path);
      assert.ok(u.path.startsWith("packages/fungi/memory/src/") && existsSync(p), s.stage + " unit path " + u.path);
      assert.equal(u.sha256, sha(p), s.stage + " " + u.path + " sha256");
    }
  }
});

test("S10-R1 P3: every recorded invocation replays to its recorded value", () => {
  const j = receipt();
  for (const s of j.stages) {
    assert.ok(Array.isArray(s.invocations) && s.invocations.length > 0, s.stage + " invocations");
    assert.ok(Number.isInteger(s.token) && s.token >= 0 && s.token <= 5, s.stage + " token");
    for (const v of s.invocations) {
      assert.ok(s.units.some((u) => u.path === v.file), s.stage + " invocation file must be a pinned unit: " + v.file);
      const r = invoke(join(REPO, v.file), v.flow, v.args);
      assert.equal(r.status, 0, s.stage + " " + v.flow + " status " + r.text);
      assert.equal(r.present, true, s.stage + " " + v.flow + " value absent");
      assert.equal(r.value, v.value, s.stage + " " + v.flow + "(" + v.args.join(",") + ") replay");
    }
  }
});

test("S10-R1 P4: composed outcome is re-derived, never asserted", () => {
  const j = receipt();
  const tokens = j.stages.map((s) => s.token);
  const r = invoke(join(SRC, "composed-route.fungi"), "composeRouteOutcome", tokens);
  assert.equal(r.status, 0, "composeRouteOutcome status " + r.text);
  assert.equal(j.composed.outcomeCode, r.value, "composed outcome code must equal re-invoked composeRouteOutcome");
  assert.equal(j.composed.outcome, OUTCOME[r.value] || "Refused", "outcome name");
  if (j.composed.outcome === "Success") assert.equal(r.value, 100, "Success only at 100");
});

test("S10-R1 P5: receipt is honest about scope (synthetic provider, no clearance)", () => {
  const j = receipt();
  assert.equal(j.authorizing, false, "NON_AUTHORIZING");
  assert.equal(j.secretsProvider, "synthetic", "synthetic SecretsProvider only");
  assert.equal(j.realCredential, "UNKNOWN", "real POST /auth/verify credential stays the owner's open question");
  assert.equal(j.productionClearance, false, "no production clearance claim");
});