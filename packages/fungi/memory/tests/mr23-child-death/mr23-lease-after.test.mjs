// MR23 2.2 "later valid lease refused": the lease opens against the state
// after the child reading, so a dead custodian refuses every later lease.
import { test } from "node:test";
import assert from "node:assert/strict";
import { leaseAfter, leaseOpen, outcome, expectPacked, ST, K3, CUSTODIAN_GONE, RUNNING, DEATHS, label } from "./mr23-harness.mjs";

test("running child leaves arenaLeaseOpen unchanged (100, 151, 106)", () => {
  for (const live of [0, 1, 2]) {
    const want = leaseOpen(ST.active, live);
    assert.equal(want.status, 0);
    expectPacked(leaseAfter({ ...RUNNING, liveCount: live }), want.value, `live ${live}`);
  }
});

test("after any child death a fully valid lease (Active, zero live) is refused 106", () => {
  const quarantined = leaseOpen(ST.quarantined, 0);
  assert.equal(quarantined.value, 106);
  for (const d of DEATHS) {
    expectPacked(leaseAfter({ ...d, liveCount: 0 }), quarantined.value, label(d));
  }
});

test("quarantine is never undone: a running child on the quarantined state still refuses", () => {
  expectPacked(leaseAfter({ ...RUNNING, stateToken: ST.quarantined }), 106, "respawned reading, old state");
  expectPacked(leaseAfter({ ...RUNNING, stateToken: ST.partial }), 106, "partial");
});

test("a disposed arena answers 141 whatever the child reading", () => {
  expectPacked(leaseAfter({ ...RUNNING, stateToken: ST.disposed }), 141, "disposed running");
  expectPacked(leaseAfter({ ...DEATHS[1], stateToken: ST.disposed }), 141, "disposed dead");
});

test("foreign state class, unlisted op or malformed child reading refuse before any lease", () => {
  expectPacked(leaseAfter({ ...RUNNING, stateClass: 99 }), 111, "state class 99");
  expectPacked(leaseAfter({ ...RUNNING, stateClass: 1 }), 110, "state tag 1");
  expectPacked(leaseAfter({ ...RUNNING, stateToken: 4 }), 110, "state 4");
  expectPacked(leaseAfter({ ...RUNNING, op: 9 }), 111, "op 9");
  expectPacked(leaseAfter({ exitKind: 2, detail: 0 }), 106, "signal 0 reading quarantines");
});

test("a receipt for a death is K3 UNKNOWN, never ALLOW and never 0", () => {
  for (const v of [106, CUSTODIAN_GONE]) {
    const r = outcome(v);
    assert.equal(r.status, 0);
    assert.equal(r.value, K3.unknown, `outcome ${v}`);
  }
});
