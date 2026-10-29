// MR6: arenaReleaseCycle derives the release verdict and the new generation
// itself, so the re-alloc read cannot be fed a made-up commit or generation.
import { test } from "node:test";
import assert from "node:assert/strict";
import { cycle, cycleStep, release, nextGeneration, realloc, value, expectPacked, ST, GEN_MAX_LIVE } from "./mr6-harness.mjs";

test("clean release then zero re-alloc read is 100", () => {
  expectPacked(cycle(), 100, "clean");
});

test("residue in the new slot is 117", () => {
  expectPacked(cycle({ nonZeroCount: 1 }), 117, "residue");
});

test("short or negative re-alloc read is 106", () => {
  expectPacked(cycle({ readLen: 31 }), 106, "short");
  expectPacked(cycle({ nonZeroCount: -1 }), 106, "negative");
});

test("a refused release is returned as is and no re-alloc read runs", () => {
  expectPacked(cycle({ handleGeneration: 2, nonZeroCount: 1 }), 150, "stale wins over residue");
  expectPacked(cycle({ readbackNonZero: 1 }), 117, "read-back residue");
  expectPacked(cycle({ readbackNonZero: -1 }), 106, "read-back negative");
});

test("exhausted generation is 140, never a wrapped re-alloc", () => {
  expectPacked(cycle({ slotGeneration: GEN_MAX_LIVE, handleGeneration: GEN_MAX_LIVE }), 140, "exhausted");
});

test("cycle equals the manual MR5 composition across a grid", () => {
  const cases = [
    {}, { nonZeroCount: 1 }, { readLen: 0 }, { handleGeneration: 4 }, { freed: 1 },
    { wipeClass: 1 }, { wipeToken: 1 }, { readbackClass: 1 }, { slotGeneration: 7, handleGeneration: 7 },
  ];
  for (const c of cases) {
    const rv = value(release(c), "release " + JSON.stringify(c));
    let expected = rv;
    if (rv === 100) {
      const gen = value(nextGeneration(c), "gen " + JSON.stringify(c));
      assert.equal(gen, (c.slotGeneration ?? 3) + 1, "bump by one " + JSON.stringify(c));
      expected = value(realloc({ ...c, releaseVerdict: rv, priorGeneration: c.slotGeneration ?? 3, slotGeneration: gen }), "realloc " + JSON.stringify(c));
    }
    expectPacked(cycle(c), expected, "cycle " + JSON.stringify(c));
  }
});

test("cycle step: clean 1000, residue 1171, stale 1500", () => {
  expectPacked(cycleStep(), 1000, "clean");
  expectPacked(cycleStep({ nonZeroCount: 1 }), 1171, "residue");
  expectPacked(cycleStep({ handleGeneration: 2 }), 1500, "stale");
});

test("cycle step respects the one-way state", () => {
  expectPacked(cycleStep({ stateToken: ST.quarantined }), 1001, "quarantined");
  expectPacked(cycleStep({ stateToken: ST.disposed, nonZeroCount: 1 }), 1172, "disposed final");
});
