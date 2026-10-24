// S10-R1 (X-COMP, CP6): pinned run receipt of the composed RD-1413 -> 1414 -> 1415 route (red first).
// The receipt (S10-R2 generator) must be evidence, not a claim:
//  P1 schema galerina.s10.composed-run-receipt.v1; stages exactly 1413-ingress, 1414-custody, 1415-release in order.
//  P2 bound to bytes: every stage unit and composed-route.fungi carry sha256 equal to the current file, and
//     galerina.mjs sha256 matches; an edited unit or toolchain voids the receipt.
//  P3 replayable: every recorded invocation (file, flow, args) re-run now returns the recorded value; each stage
//     has at least one invocation, and the stage token is derived from its recorded values, not asserted.
//  P4 the composed outcome code equals composeRouteOutcome(stage tokens) re-invoked now, and the outcome name
//     matches it (100 Success, 102 Refused, 106 Indeterminate); Success is never claimed unless the code is 100.
//  P6 (S10-R3) each stage token equals the pinned native classifier re-invoked on the replayed values (kills RM1).
//  P7 (S10-R3) the native stage-token classifiers match an independent zero-trust oracle; N1 no null in evidence.
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
// S10-R3 P6 (kills RM1): each stage token is re-derived now from the replayed invocation values by the pinned
// native classifier in composed-route.fungi; the stage's invocation flows are pinned here, not read from the receipt.
const DERIVE = {
  "1413-ingress": { flows: ["readChunks"], token: "ingressStageToken" },
  "1414-custody": { flows: ["casBegin"], token: "custodyStageToken" },
  "1415-release": { flows: ["reserveReleaseIdempotency", "commitReleaseIdempotency", "reconcileReleaseIdempotency"], token: "releaseStageToken" },
};

test("S10-R3 P6: every stage token is re-derived natively from its replayed invocation values", () => {
  const j = receipt();
  for (const s of j.stages) {
    const d = DERIVE[s.stage];
    assert.ok(d, "unexpected stage " + s.stage);
    assert.deepEqual(s.invocations.map((v) => v.flow), d.flows, s.stage + " invocation flows are pinned");
    const values = s.invocations.map((v) => {
      const r = invoke(join(REPO, v.file), v.flow, v.args);
      assert.equal(r.status, 0, s.stage + " " + v.flow + " status " + r.text);
      assert.equal(r.present, true, s.stage + " " + v.flow + " value absent");
      return r.value;
    });
    const t = invoke(join(SRC, "composed-route.fungi"), d.token, values);
    assert.equal(t.status, 0, d.token + " status " + t.text);
    assert.equal(t.present, true, d.token + " value absent " + t.text);
    assert.equal(s.token, t.value, s.stage + " token must equal " + d.token + "(" + values.join(",") + ")");
  }
});

// S10-R3 P7: native stage-token classifier laws against an independent zero-trust oracle.
const listed = (v) => Number.isInteger(v) && v > 100 && v < 200;
export function ingressOracle(v) { return v === 100 ? 0 : listed(v) ? 1 : 11; }
export function custodyOracle(v) { return v === 100 ? 0 : v === 106 ? 3 : listed(v) ? 1 : 11; }
export function releaseOracle(r, c, k) {
  if (r !== 100) return listed(r) ? 1 : 11;
  if (c === 100) return 0;
  if (c === 102) return 2;
  if (c === 106) return k === 100 ? 0 : listed(k) ? 3 : 11;
  return listed(c) ? 2 : 11;
}
const VALS = [-1, 0, 1, 99, 100, 101, 102, 106, 111, 199, 200];

test("S10-R3 P7: ingress and custody stage-token classifiers match the oracle", () => {
  for (const v of VALS) {
    const a = invoke(join(SRC, "composed-route.fungi"), "ingressStageToken", [v]);
    assert.equal(a.value, ingressOracle(v), "ingressStageToken(" + v + ")");
    const b = invoke(join(SRC, "composed-route.fungi"), "custodyStageToken", [v]);
    assert.equal(b.value, custodyOracle(v), "custodyStageToken(" + v + ")");
  }
});

test("S10-R3 P7: release stage-token classifier matches the oracle", () => {
  const cells = [];
  for (const r of [0, 100, 102, 200]) cells.push([r, 100, 100]);
  for (const c of VALS) cells.push([100, c, 106]);
  for (const k of VALS) cells.push([100, 106, k]);
  for (const [r, c, k] of cells) {
    const t = invoke(join(SRC, "composed-route.fungi"), "releaseStageToken", [r, c, k]);
    assert.equal(t.value, releaseOracle(r, c, k), "releaseStageToken(" + r + "," + c + "," + k + ")");
  }
});

test("S10-R3 N1: no null anywhere in the S10 evidence (typed UNKNOWN only)", () => {
  for (const f of ["closure/S10-composed-run-receipt.json", "closure/S10-rd1296-ae-disposition.json"]) {
    const t = evidence(f);
    assert.notEqual(t, null, f + " missing");
    assert.ok(!/\bnull\b/.test(t), f + " contains null");
  }
});