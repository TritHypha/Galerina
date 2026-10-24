// S10-R1 (X-COMP, 1415-T9, CP6): composed RD-1413 -> RD-1414 -> RD-1415 route outcome (red first).
// Unit under test (S10-R2): packages/fungi/memory/src/composed-route.fungi composeRouteOutcome(ingress, custody, release).
// Stage token: 0 Success 1 Refused(before begin) 2 Failed(after begin) 3 Indeterminate 4 MissingRecord 5 NotRun; else unlisted.
// Packed outcome (existing listed codes only, no new code): 100 Success, 102 Refused, 106 Indeterminate, 111 Unlisted/inconsistent.
// Zero-trust laws:
//  K1 100 only when every stage is Success (0,0,0); a crash or missing record is never success.
//  K2 the earliest non-Success stage decides; every later stage must be NotRun (5). A later stage that ran
//     after a non-Success stage (e.g. release after refused ingress) is a breach and refuses 111.
//  K3 Refused before begin -> 102. Failed after begin, Indeterminate and MissingRecord -> 106: at the composed
//     level a post-begin failure cannot prove no partial effect (rejected: a separate Failed code, which would
//     claim knowledge the composition lacks and add an unregistered code).
//  K4 NotRun with no earlier non-Success stage (a skipped stage) refuses 111; any token outside 0..5 refuses 111.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { SRC, invoke } from "./harness.mjs";

const UNIT = join(SRC, "composed-route.fungi");

export function oracle(s) {
  for (const t of s) {
    if (!Number.isInteger(t) || t < 0 || t > 5) return 111;
  }
  let i = 0;
  while (i < 3) {
    const t = s[i];
    if (t === 0) { i = i + 1; continue; }
    if (t === 5) return 111;
    for (let j = i + 1; j < 3; j = j + 1) {
      if (s[j] !== 5) return 111;
    }
    return t === 1 ? 102 : 106;
  }
  return 100;
}

function call(args) {
  const r = invoke(UNIT, "composeRouteOutcome", args);
  assert.equal(r.status, 0, "composeRouteOutcome(" + args.join(",") + ") status " + r.text);
  assert.equal(r.present, true, "composeRouteOutcome(" + args.join(",") + ") value absent " + r.text);
  return r.value;
}

test("S10-R1 K0: composed-route.fungi exists in packages/fungi/memory/src", () => {
  assert.ok(existsSync(UNIT), "src/composed-route.fungi missing");
});

test("S10-R1 K1-K3 named cases", () => {
  assert.equal(call([0, 0, 0]), 100, "all stages Success");
  assert.equal(call([1, 5, 5]), 102, "ingress refused, nothing else ran");
  assert.equal(call([0, 1, 5]), 102, "custody refused before begin");
  assert.equal(call([0, 0, 1]), 102, "release refused before begin");
  assert.equal(call([0, 0, 3]), 106, "release Indeterminate (post-dispatch spent is UNKNOWN)");
  assert.equal(call([0, 0, 4]), 106, "missing release record is UNKNOWN, never success");
  assert.equal(call([0, 0, 2]), 106, "post-begin failure is Indeterminate at the composed level");
  assert.equal(call([0, 4, 5]), 106, "missing custody record");
  assert.equal(call([1, 0, 0]), 111, "release after refused ingress is a breach");
  assert.equal(call([0, 3, 0]), 111, "release after Indeterminate custody is a breach");
  assert.equal(call([0, 5, 0]), 111, "skipped custody stage");
  assert.equal(call([5, 5, 5]), 111, "nothing ran");
});

test("S10-R1 K4: unlisted tokens refuse 111", () => {
  for (const a of [[-1, 0, 0], [6, 5, 5], [0, -1, 5], [0, 0, 6], [0, 0, 99]]) {
    assert.equal(call(a), 111, "composeRouteOutcome(" + a.join(",") + ")");
  }
});

test("S10-R1 full grid 6x6x6 matches the zero-trust oracle; 100 only at (0,0,0)", () => {
  for (let a = 0; a < 6; a = a + 1) {
    for (let b = 0; b < 6; b = b + 1) {
      for (let c = 0; c < 6; c = c + 1) {
        const v = call([a, b, c]);
        assert.equal(v, oracle([a, b, c]), "composeRouteOutcome(" + a + "," + b + "," + c + ")");
      }
    }
  }
});