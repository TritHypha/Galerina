// MR4 leased use: arenaLeaseOpen gates arenaUse, refusal returns before any
// read, and the one opened lease is closed. With the lease admitted the
// verdict matches bare arenaUse exactly (differential check).
import { test } from "node:test";
import assert from "node:assert/strict";
import { leasedUse, leasedUseStep, bareUse, expectPacked, expectStep, ST } from "./mr4-harness.mjs";

test("MR4-L1 admitted lease: verdict equals bare use", () => {
  for (const o of [{}, { wipeToken: 1 }, { abortToken: 1 }, { clock: 0 }]) {
    const a = leasedUse(o);
    const b = bareUse(o);
    assert.equal(a.present && b.present, true, JSON.stringify(o));
    assert.equal(a.value, b.value, "leased == bare for " + JSON.stringify(o));
  }
});

test("MR4-L2 pinned admitted verdicts", () => {
  expectPacked(leasedUse(), 100, "ok");
  expectPacked(leasedUse({ wipeToken: 1 }), 117, "wipe failed");
  expectPacked(leasedUse({ abortToken: 1 }), 116, "abort");
  expectPacked(leasedUse({ clock: 0 }), 122, "clock 0 fails closed");
});

test("MR4-L3 refused lease returns before any read", () => {
  expectPacked(leasedUse({ liveCount: 1 }), 151, "nested lease");
  expectPacked(leasedUse({ liveCount: 1, wipeToken: 1 }), 151, "nested lease, use never runs");
  expectPacked(leasedUse({ liveCount: -1 }), 106, "broken count");
  expectPacked(leasedUse({ liveClass: 1 }), 110, "live count class");
});

test("MR4-L4 state gate", () => {
  expectPacked(leasedUse({ stateToken: ST.quarantined }), 106, "quarantined");
  expectPacked(leasedUse({ stateToken: ST.disposed }), 141, "disposed");
  expectPacked(leasedUse({ stateToken: 9 }), 111, "unlisted");
});

test("MR4-L5 leased use step pairs verdict and next state", () => {
  expectStep(leasedUseStep(), 100, ST.active, "ok");
  expectStep(leasedUseStep({ liveCount: 1 }), 151, ST.active, "nested");
  expectStep(leasedUseStep({ wipeToken: 1 }), 117, ST.quarantined, "wipe failed");
  expectStep(leasedUseStep({ stateToken: ST.disposed }), 141, ST.disposed, "disposed");
});