// MR5 handle-gated leased use (gap 2.5 / H8): a stale, freed or invalid
// handle is refused before any lease opens or byte is read; a live handle
// gets exactly arenaLeasedUse (differential).
import { test } from "node:test";
import assert from "node:assert/strict";
import { handleUse, handleUseStep, leasedUse, expectPacked, expectStep, ST, GEN_MAX_LIVE } from "./mr5-harness.mjs";

test("MR5-H1 live handle: verdict equals leased use", () => {
  for (const o of [{}, { wipeToken: 1 }, { abortToken: 1 }, { clock: 0 }, { liveCount: 1 }, { stateToken: ST.disposed }]) {
    const a = handleUse(o);
    const b = leasedUse(o);
    assert.equal(a.present && b.present, true, JSON.stringify(o));
    assert.equal(a.value, b.value, "handle == leased for " + JSON.stringify(o));
  }
});

test("MR5-H2 use after release refused before lease or read", () => {
  expectPacked(handleUse({ freed: 1 }), 150, "freed");
  expectPacked(handleUse({ freed: 1, wipeToken: 1 }), 150, "freed: use never runs");
  expectPacked(handleUse({ freed: 1, liveCount: 1 }), 150, "freed: lease never opens");
  expectPacked(handleUse({ slotGeneration: 4, handleGeneration: 3 }), 150, "stale handle");
  expectPacked(handleUse({ slotGeneration: 4, handleGeneration: 3, clock: 0 }), 150, "stale handle before clock");
});

test("MR5-H3 invalid or unlisted handle", () => {
  expectPacked(handleUse({ slotGeneration: 0, handleGeneration: 0 }), 140, "generation 0");
  expectPacked(handleUse({ slotGeneration: GEN_MAX_LIVE + 1, handleGeneration: GEN_MAX_LIVE + 1 }), 140, "Int max");
  expectPacked(handleUse({ freed: 3 }), 111, "unlisted freed");
});

test("MR5-H4 step: stale keeps state, invalid quarantines", () => {
  expectStep(handleUseStep(), 100, ST.active, "ok");
  expectStep(handleUseStep({ freed: 1 }), 150, ST.active, "stale keeps Active");
  expectStep(handleUseStep({ slotGeneration: 0, handleGeneration: 0 }), 140, ST.quarantined, "invalid quarantines");
  expectStep(handleUseStep({ wipeToken: 1 }), 117, ST.quarantined, "wipe failed");
});
