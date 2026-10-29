// MR3: MR2 1.6 target. The TS reference allows nested same-name leases; the
// .fungi target is exactly one live lease per name.
import { test } from "node:test";
import { leaseOpen, leaseClose, stateAfter, expectPacked, OP, ST } from "./mr3-harness.mjs";

test("MR3 1.6: first lease on a name is admitted", () => {
  expectPacked(leaseOpen({ liveCount: 0 }), 100, "first");
});

test("MR3 1.6: a second live lease on the same name is refused 151", () => {
  const r = leaseOpen({ liveCount: 1 });
  expectPacked(r, 151, "nested");
  expectPacked(stateAfter(OP.lease, ST.active, r.value), ST.active, "refusal keeps Active");
});

test("MR3 1.6: broken live count is 106 and quarantines", () => {
  for (const n of [2, -1]) {
    const r = leaseOpen({ liveCount: n });
    expectPacked(r, 106, "count " + n);
    expectPacked(stateAfter(OP.lease, ST.active, r.value), ST.quarantined, "count " + n);
  }
});

test("MR3 1.6: no lease from Quarantined, Partial or Disposed", () => {
  expectPacked(leaseOpen({ stateToken: 1 }), 106, "quarantined");
  expectPacked(leaseOpen({ stateToken: 3 }), 106, "partial");
  expectPacked(leaseOpen({ stateToken: 2 }), 141, "disposed");
  expectPacked(leaseOpen({ stateToken: 9 }), 111, "unlisted state");
  expectPacked(leaseOpen({ liveClass: 11 }), 111, "unlisted count class");
});

test("MR3 1.6: close needs exactly one live lease", () => {
  expectPacked(leaseClose({ liveCount: 1 }), 100, "close");
  expectPacked(leaseClose({ liveCount: 0 }), 106, "double close");
  expectPacked(leaseClose({ liveCount: 2 }), 106, "broken count");
  expectPacked(leaseClose({ liveClass: 11 }), 111, "unlisted class");
});
