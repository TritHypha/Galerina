// T8-R2 (RD-1415-T8, Q11 recovery). Synthetic data only. NON_AUTHORIZING.
// recoverRecord(recordClass, recordState): 0 COMMITTED_PUBLISHED 1 COMMITTED_UNPUBLISHED 2 TORN
//   3 MISSING 4 PUBLISHED_WITHOUT_COMMIT else Unlisted. packed: 100 only for 0; 106 for 1..4; 4 raw; 11 unlisted.
// recoveryAggregate(published, unpublished, torn, missing): 100 only when unpublished+torn+missing == 0;
//   any of them > 0 is 106 Indeterminate; any negative count is 11.
// Laws: G1 a crash or missing record is UNKNOWN (106), never success; G2 committed-but-unpublished is
// Indeterminate, never silently published; G3 one bad record makes the whole scan Indeterminate.
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
test("T8-R2 G1/G2: only committed-and-published recovers as 100", () => {
  grid("recoverRecord", (call) => {
    assert.equal(call([0, 0]), 100);
    for (const s of [1, 2, 3, 4]) {
      assert.equal(call([0, s]), 106, "state " + s);
    }
    for (const [a, want] of [[[1, 0], 4], [[10, 0], 4], [[11, 0], 11], [[0, 5], 11], [[0, -1], 11]]) {
      assert.equal(call(a), want, "recoverRecord(" + a.join(",") + ")");
    }
  });
});

test("T8-R2 G3: one unpublished, torn or missing record makes the scan Indeterminate", () => {
  grid("recoveryAggregate", (call) => {
    assert.equal(call([0, 0, 0, 0]), 100);
    assert.equal(call([7, 0, 0, 0]), 100);
    for (const a of [[7, 1, 0, 0], [7, 0, 1, 0], [7, 0, 0, 1], [0, 3, 2, 1]]) {
      assert.equal(call(a), 106, "recoveryAggregate(" + a.join(",") + ")");
    }
    for (const a of [[-1, 0, 0, 0], [0, -1, 0, 0], [0, 0, -1, 0], [0, 0, 0, -1]]) {
      assert.equal(call(a), 11, "recoveryAggregate(" + a.join(",") + ")");
    }
  });
});