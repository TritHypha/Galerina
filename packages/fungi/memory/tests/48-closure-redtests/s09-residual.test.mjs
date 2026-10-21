// S9 (1414-KG02/04/08, 1415-KG10): residual carried UNKNOWNs.
// KG-04 (Q9): MB-15 constant-time evidence is a three-part package: Binsec/Rel bounded check on the
//   intrinsic's final native code, ctgrind-style poisoned-secret run, dudect campaign over the full
//   guest-to-host path. Any positive finding aborts the claim; a leaky control must be caught.
// KG-10 (Q12): PQ signature unavailable, so ML-DSA (hybrid) seals report UNKNOWN, never Assured.
import { test } from "node:test";
import assert from "node:assert/strict";
import { red, flatten, withUnit, invoke, evidence, readRepo } from "./harness.mjs";

test("S9 KG-10: a hybrid ML-DSA-65+Ed25519 seal with host-reported pqAvailable=1 classifies UNKNOWN (101), not Assured", red("S9", "ML-DSA reports UNKNOWN"), () => {
  withUnit(flatten(["c-boundary", "release-commit-point", "signet-grant-seal"]), (f) => {
    const r = invoke(f, "classifySeal", [0, 1, 0, 0, 0, 0, 0, 1]);
    assert.equal(r.status, 0);
    assert.equal(r.value, 101, "hybrid seal gave " + r.value);
  });
});

test("S9 guard (green today): classical-only and PQ-missing seals are never Assured", () => {
  withUnit(flatten(["c-boundary", "release-commit-point", "signet-grant-seal"]), (f) => {
    assert.equal(invoke(f, "classifySeal", [0, 1, 0, 0, 0, 1, 0, 1]).value, 101, "classical-only");
    assert.equal(invoke(f, "classifySeal", [0, 1, 0, 0, 0, 0, 0, 0]).value, 101, "pq missing");
  });
});

test("S9 KG-04: MB-15 CT evidence harness is wired to dudect and ctgrind with leaky controls", red("S9", "MB-15 CT evidence harness wired to dudect/ctgrind"), () => {
  const j = evidence("closure/S9-mb15-ct.json");
  assert.notEqual(j, null, "evidence/closure/S9-mb15-ct.json missing");
  const e = JSON.parse(j);
  assert.equal(e.target, "MB-15 constant-time compare intrinsic (32-byte, synthetic)");
  assert.equal(e.dudect.subject, "NO_LEAKAGE_EVIDENCE");
  assert.equal(e.dudect.leakyControl, "LEAKAGE_FOUND");
  assert.ok(e.dudect.measurements >= 1000000, "dudect measurements");
  assert.equal(e.dudect.path, "guest-to-host");
  assert.equal(e.ctgrind.subjectErrors, 0);
  assert.ok(e.ctgrind.leakyControlErrors >= 1, "ctgrind leaky control caught");
  assert.ok(["PASS", "PENDING"].includes(e.binsecRel.status), "binsec/rel status typed");
  assert.equal(e.residual, "UNKNOWN_MICROARCHITECTURAL");
});

test("S9 KG-04: the compiler exposes a sealed native MB-15 constant-time compare intrinsic", red("S9", "MB-15 intrinsic exists"), () => {
  const reg = readRepo("packages/fungi/memory/memory-fungi.manifest.json") || "";
  assert.match(reg, /MB-15|constantTimeEqual/i, "manifest names the MB-15 intrinsic");
});

test("S9: signed disposition list for KG-02, KG-04, KG-08 and KG-10 (closed, or accepted by Phillip as typed non-blocking UNKNOWN)", red("S9", "residual UNKNOWNs signed"), () => {
  const t = evidence("closure/S9-residual-unknowns.md");
  assert.notEqual(t, null, "evidence/closure/S9-residual-unknowns.md missing");
  for (const k of ["KG-02", "KG-04", "KG-08", "KG-10"]) {
    const row = t.split("\n").find((l) => l.includes(k));
    assert.ok(row, k + " row");
    assert.match(row, /(CLOSED|ACCEPTED_NON_BLOCKING_UNKNOWN)/, k + " disposition");
  }
  assert.match(t, /Accepted by: Phillip/);
});