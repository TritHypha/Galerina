// S10-S13: composed run, independent adjudication + drift, Phillip's per-PR merge yes, HOLD lift.
import { test } from "node:test";
import assert from "node:assert/strict";
import { red, evidence, readRepo } from "./harness.mjs";

test("S10: pinned composed RD-1413 -> 1414 -> 1415 run receipt of the loaded artifact", red("S10", "composed run + pins"), () => {
  const t = evidence("closure/S10-composed-run.json");
  assert.notEqual(t, null, "evidence/closure/S10-composed-run.json missing");
  const j = JSON.parse(t);
  for (const k of ["sourceSha", "buildSha256", "runtimePin", "route"]) assert.ok(j[k], k);
  assert.equal(j.route, "POST /auth/verify");
  assert.deepEqual(j.chain, ["RD-1413", "RD-1414", "RD-1415"]);
});

test("S10: every RD-1296 A-E obligation is satisfied, unresolved or retired", red("S10", "RD-1296 A-E disposition"), () => {
  const t = evidence("closure/S10-a-e-disposition.md");
  assert.notEqual(t, null, "evidence/closure/S10-a-e-disposition.md missing");
  for (const k of ["A", "B", "C", "D", "E"]) {
    assert.match(t, new RegExp("^\\| " + k + " \\|[^\\n]*\\b(SATISFIED|UNRESOLVED|RETIRED)\\b", "m"), "row " + k);
  }
});

test("S11: independent adjudication PASS with a drift sha and 0 MISSING/STALE/DUPLICATE on sources", red("S11", "adjudication + drift"), () => {
  const t = evidence("closure/S11-adjudication.md");
  assert.notEqual(t, null, "evidence/closure/S11-adjudication.md missing");
  assert.match(t, /^Verdict: PASS\b/m);
  assert.match(t, /drift sha256 [0-9a-f]{64}/);
  assert.match(t, /MISSING_FILE 0\b/);
  assert.match(t, /STALE_COUNT 0\b/);
  assert.match(t, /DUPLICATE_BLOCK 0\b/);
});

test("S12: Phillip's written per-PR merge yes is recorded", red("S12", "NEEDS-PHILLIP per-PR merge yes"), () => {
  const t = evidence("closure/S12-merge-yes.md");
  assert.notEqual(t, null, "evidence/closure/S12-merge-yes.md missing");
  assert.match(t, /^Approved by: Phillip\b/m);
  assert.match(t, /PR #\d+/);
});

test("S13: docs/TODO.md no longer carries an open HOLD box for RD-1413/1414/1415 and the lift cites S11", red("S13", "HOLD gate lifted citing S11"), () => {
  const t = readRepo("docs/TODO.md");
  assert.notEqual(t, null);
  const open = t.split("\n").filter((l) => /\[!\]/.test(l) && /RD-141[345]/.test(l));
  assert.deepEqual(open, [], "open HOLD boxes: " + open.length);
  assert.match(t, /RD-141[345][^\n]*S11/, "lift cites S11");
});