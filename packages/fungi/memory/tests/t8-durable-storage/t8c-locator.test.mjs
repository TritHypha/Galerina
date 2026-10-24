// T8-R3 (RD-1415-T8, Q11 Merkle-bound locators). Synthetic data only. NON_AUTHORIZING.
// verifyLocator(rootClass, rootRelation, proofClass, proofResult)
// rootRelation: 0 CURRENT 1 RETAINED_PRIOR 2 UNKNOWN_ROOT 3 DROPPED_PRIOR else Unlisted.
// proofResult: 0 FAILED 1 VERIFIED 2 NOT_CHECKED else Unlisted.
// packed: 100 LOCATOR_OK only for root 0/1 with proof 1; 21 LOCATOR_REFUSED otherwise; 4 raw; 11 unlisted.
// Laws: L1 a proof that does not verify, or was not checked, refuses; L2 a root that is not current or
// retained refuses even with a verified proof; L3 foreign Ints go through c-boundary.
import { test } from "node:test";
import assert from "node:assert/strict";
import { flatten, withUnit, invoke } from "./harness.mjs";

const UNITS = ["c-boundary", "adapter-profile", "durable-store"];

function grid(flow, fn) {
  return withUnit(flatten(UNITS), (file) => fn((args) => {
    const r = invoke(file, flow, args);
    assert.equal(r.status, 0, flow + "(" + args.join(",") + ") status " + r.text);
    assert.equal(r.present, true, flow + "(" + args.join(",") + ") value absent " + r.text);
    return r.value;
  }));
}
test("T8-R3 L1/L2: locator accepted only with a verified proof against a current or retained root", () => {
  grid("verifyLocator", (call) => {
    for (const r of [0, 1, 2, 3]) {
      for (const p of [0, 1, 2]) {
        const want = (r === 0 || r === 1) && p === 1 ? 100 : 21;
        assert.equal(call([0, r, 0, p]), want, "root " + r + " proof " + p);
      }
    }
  });
});

test("T8-R3 L3: raw class tags refuse 4, unlisted refuses 11", () => {
  grid("verifyLocator", (call) => {
    for (const [a, want] of [
      [[2, 0, 0, 1], 4], [[0, 0, 5, 1], 4], [[11, 0, 0, 1], 11], [[0, 0, 12, 1], 11],
      [[0, 4, 0, 1], 11], [[0, -1, 0, 1], 11], [[0, 0, 0, 3], 11], [[0, 0, 0, -1], 11],
    ]) {
      assert.equal(call(a), want, "verifyLocator(" + a.join(",") + ")");
    }
  });
});