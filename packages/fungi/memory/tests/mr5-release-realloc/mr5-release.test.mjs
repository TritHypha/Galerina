// MR5 release (gap 2.4 / 2.5 / H6 caller side): slot check before any wipe,
// wipe read-back must be zero, generation bump only on a committed release,
// never wrapped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { release, nextGeneration, slotCheck, expectPacked, GEN_MAX_LIVE } from "./mr5-harness.mjs";

test("MR5-R1 clean release is 100", () => {
  expectPacked(release(), 100, "clean release");
  expectPacked(release({ slotGeneration: 1, handleGeneration: 1 }), 100, "first generation");
});

test("MR5-R2 double release refuses 150 before any wipe", () => {
  expectPacked(release({ freed: 1 }), 150, "freed slot");
  expectPacked(release({ freed: 1, wipeToken: 1 }), 150, "freed slot: wipe never runs, so its failure is not seen");
  expectPacked(release({ freed: 2 }), 111, "unlisted freed token");
});

test("MR5-R3 stale handle cannot release (or wipe) a re-allocated slot", () => {
  expectPacked(release({ slotGeneration: 4, handleGeneration: 3 }), 150, "older handle");
  expectPacked(release({ slotGeneration: 4, handleGeneration: 3, wipeToken: 1 }), 150, "older handle, wipe not reached");
  expectPacked(release({ slotGeneration: 3, handleGeneration: 4 }), 150, "newer (forged) handle");
});

test("MR5-R4 wipe failure wins", () => {
  expectPacked(release({ wipeToken: 1 }), 117, "wipe failed");
  expectPacked(release({ wipeToken: 2 }), 106, "wipe unknown");
  expectPacked(release({ wipeToken: 7 }), 111, "wipe unlisted");
  expectPacked(release({ wipeToken: 1, readbackNonZero: 5 }), 117, "wipe failure before read-back");
});

test("MR5-R5 read-back after wipe must be all zero", () => {
  expectPacked(release({ readbackNonZero: 1 }), 117, "one residue byte");
  expectPacked(release({ readbackNonZero: 2147483647 }), 117, "all residue");
  expectPacked(release({ readbackNonZero: -1 }), 106, "negative count");
  expectPacked(release({ readbackClass: 9 }), 110, "unlisted read-back class");
});

test("MR5-R6 generation exhaustion: wiped but 140, never wrapped", () => {
  expectPacked(release({ slotGeneration: GEN_MAX_LIVE, handleGeneration: GEN_MAX_LIVE }), 140, "cannot bump");
  expectPacked(release({ slotGeneration: GEN_MAX_LIVE, handleGeneration: GEN_MAX_LIVE, wipeToken: 1 }), 117, "wipe failure wins over exhaustion");
  expectPacked(release({ slotGeneration: GEN_MAX_LIVE - 1, handleGeneration: GEN_MAX_LIVE - 1 }), 100, "last bumpable");
  expectPacked(release({ slotGeneration: 0, handleGeneration: 0 }), 140, "generation 0");
  expectPacked(release({ slotGeneration: -5, handleGeneration: -5 }), 140, "negative generation");
});

test("MR5-R7 next generation is +1 only after a committed release", () => {
  expectPacked(nextGeneration(), 4, "3 -> 4");
  expectPacked(nextGeneration({ slotGeneration: GEN_MAX_LIVE - 1, handleGeneration: GEN_MAX_LIVE - 1 }), GEN_MAX_LIVE, "last bump");
  for (const o of [{ freed: 1 }, { handleGeneration: 2 }, { wipeToken: 1 }, { readbackNonZero: 1 }, { slotGeneration: GEN_MAX_LIVE, handleGeneration: GEN_MAX_LIVE }]) {
    expectPacked(nextGeneration(o), 0, "refused release gives 0 for " + JSON.stringify(o));
  }
});

test("MR5-R8 a failed release's generation 0 fails closed at the slot check", () => {
  const g = nextGeneration({ wipeToken: 1 });
  assert.equal(g.value, 0);
  expectPacked(slotCheck(g.value, 3), 140, "generation 0 slot");
  expectPacked(slotCheck(g.value, g.value), 140, "generation 0 handle and slot");
});
