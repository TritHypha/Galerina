// T8-R1 (RD-1415-T8, Q11 commit-then-publish). Synthetic data only. NON_AUTHORIZING.
// publishAfterCommit(commitClass, commitState, publishClass, publishReq) in durable-store.fungi.
// commitState: 0 NOT_COMMITTED 1 COMMITTED_DURABLE 2 COMMIT_DELIVERY_UNKNOWN else Unlisted.
// publishReq: 0 NONE 1 PUBLISH else Unlisted.
// packed: 100 PUBLISHED, 20 PUBLISH_BEFORE_COMMIT_REFUSED, 106 Indeterminate (not published), 8 NOOP,
//         4 RAW_VALUE_REFUSED (class tag 1..10), 11 Unlisted.
// Laws: P1 publish only after a durable commit; P2 publish before commit refuses 20; P3 a commit whose
// durability is DELIVERY_UNKNOWN never publishes (106, never 100); P4 foreign Ints go through c-boundary.
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
test("T8-R1 P1/P2/P3: publish only after a durable commit", () => {
  grid("publishAfterCommit", (call) => {
    for (const c of [0, 1, 2]) {
      for (const p of [0, 1]) {
        const want = p === 0 ? 8 : (c === 1 ? 100 : (c === 0 ? 20 : 106));
        assert.equal(call([0, c, 0, p]), want, "commit " + c + " publish " + p);
      }
    }
  });
});

test("T8-R1 P4: raw class tags refuse 4, unlisted refuses 11, never 100", () => {
  grid("publishAfterCommit", (call) => {
    for (const [a, want] of [
      [[1, 1, 0, 1], 4], [[0, 1, 3, 1], 4], [[10, 1, 0, 1], 4],
      [[11, 1, 0, 1], 11], [[0, 1, -1, 1], 11], [[0, 3, 0, 1], 11], [[0, -1, 0, 1], 11],
      [[0, 1, 0, 2], 11], [[0, 1, 0, -1], 11],
    ]) {
      assert.equal(call(a), want, "publishAfterCommit(" + a.join(",") + ")");
    }
  });
});