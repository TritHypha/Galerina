// S8-R2 (1415-T7 RETRY, Q3): reserve/commit idempotency with uncertain reconciliation. Synthetic tokens only.
// keyState: 0 ABSENT 1 RESERVED 2 TERMINAL (stored result) 3 INDETERMINATE else 111 Unlisted.
// Zero-trust laws pinned here:
//  L1 a reserved key never returns to ABSENT (no replay door): only ABSENT+present+no-digest reserves (100);
//  L2 a crash or missing durable record is Indeterminate 106, never success;
//  L3 a stored terminal result is reissued 107, never re-executed; reuse with a different request digest is fenced 102;
//  L4 no stranded key: reconcile of an expired RESERVED key always lands terminal (100/102) or Indeterminate (106);
//  L5 only the reservation owner commits; commit without a reservation is 105; Indeterminate stays 106;
//  L6 every token is range-checked first; anything unlisted refuses 111.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { SRC, invoke } from "./harness.mjs";

const RCP = join(SRC, "release-idempotency.fungi");

function call(flow, args) {
  const r = invoke(RCP, flow, args);
  assert.equal(r.status, 0, flow + "(" + args.join(",") + ") status " + r.text);
  assert.equal(r.present, true, flow + "(" + args.join(",") + ") value absent " + r.text);
  return r.value;
}

function expect(flow, args, want) {
  assert.equal(call(flow, args), want, flow + "(" + args.join(",") + ")");
}

test("S8-R2 reserveReleaseIdempotency: only an ABSENT key reserves; in-flight 103, stored terminal 107, digest mismatch 102, Indeterminate 106, missing key 105", () => {
  expect("reserveReleaseIdempotency", [1, 0, 0], 100);
  expect("reserveReleaseIdempotency", [0, 0, 0], 105);
  expect("reserveReleaseIdempotency", [1, 1, 1], 103);
  expect("reserveReleaseIdempotency", [1, 1, 0], 102);
  expect("reserveReleaseIdempotency", [1, 2, 1], 107);
  expect("reserveReleaseIdempotency", [1, 2, 0], 102);
  expect("reserveReleaseIdempotency", [1, 3, 1], 106);
  expect("reserveReleaseIdempotency", [1, 3, 0], 102);
});

test("S8-R2 reserveReleaseIdempotency L6: unlisted or inconsistent tokens refuse 111", () => {
  for (const a of [[2, 0, 0], [-1, 0, 0], [1, 4, 0], [1, -1, 0], [1, 2, 2], [1, 0, 1], [0, 1, 0], [0, 0, 1]]) {
    expect("reserveReleaseIdempotency", a, 111);
  }
});

test("S8-R2 reserveReleaseIdempotency L1 grid: 100 only for present ABSENT key with no stored digest", () => {
  for (const kp of [0, 1]) {
    for (const ks of [0, 1, 2, 3]) {
      for (const dm of [0, 1]) {
        const v = call("reserveReleaseIdempotency", [kp, ks, dm]);
        if (kp === 1 && ks === 0 && dm === 0) {
          assert.equal(v, 100);
        } else {
          assert.notEqual(v, 100, "reserve(" + kp + "," + ks + "," + dm + ") must not reserve");
        }
      }
    }
  }
});

test("S8-R2 commitReleaseIdempotency: owner commits Success 100 / Refused-before-begin 102 / Indeterminate 106; non-owner 102; no reservation 105; replay 103", () => {
  expect("commitReleaseIdempotency", [1, 1, 0], 100);
  expect("commitReleaseIdempotency", [1, 1, 1], 102);
  expect("commitReleaseIdempotency", [1, 1, 2], 106);
  expect("commitReleaseIdempotency", [1, 0, 0], 102);
  expect("commitReleaseIdempotency", [0, 1, 0], 105);
  expect("commitReleaseIdempotency", [2, 1, 0], 103);
  expect("commitReleaseIdempotency", [3, 1, 0], 106);
  for (const a of [[4, 1, 0], [-1, 1, 0], [1, 2, 0], [1, 1, 3], [1, 1, -1]]) {
    expect("commitReleaseIdempotency", a, 111);
  }
});

test("S8-R2 reconcileReleaseIdempotency L2/L4: expired reservation with no durable record is 106 (never success); records settle 100/102; in-flight 103", () => {
  expect("reconcileReleaseIdempotency", [1, 1, 0], 106);
  expect("reconcileReleaseIdempotency", [1, 1, 1], 100);
  expect("reconcileReleaseIdempotency", [1, 1, 2], 102);
  expect("reconcileReleaseIdempotency", [1, 0, 0], 103);
  expect("reconcileReleaseIdempotency", [2, 1, 1], 108);
  expect("reconcileReleaseIdempotency", [3, 1, 0], 106);
  expect("reconcileReleaseIdempotency", [0, 1, 0], 105);
  for (const a of [[5, 1, 0], [-1, 1, 0], [1, 2, 0], [1, 1, 3], [1, 1, -1]]) {
    expect("reconcileReleaseIdempotency", a, 111);
  }
});

test("S8-R2 reconcileReleaseIdempotency L4 grid: an expired RESERVED key never stays in flight and never reads as reserved-free", () => {
  for (const rec of [0, 1, 2]) {
    const v = call("reconcileReleaseIdempotency", [1, 1, rec]);
    assert.ok([100, 102, 106].includes(v), "reconcile(1,1," + rec + ")=" + v);
  }
});