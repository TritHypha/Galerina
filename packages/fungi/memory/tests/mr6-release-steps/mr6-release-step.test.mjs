// MR6: arenaReleaseStep / arenaReallocReadStep pair the MR5 verdicts with the
// next arena state. The wipe and read-back run whatever the state is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { releaseStep, reallocStep, release, realloc, stateAfter, value, expectPacked, ST, GEN_MAX_LIVE } from "./mr6-harness.mjs";

test("clean release in Active is 1000", () => {
  expectPacked(releaseStep(), 1000, "clean");
});

test("stale handle release is 1500 and keeps Active", () => {
  expectPacked(releaseStep({ handleGeneration: 2 }), 1500, "stale");
});

test("double release (freed slot) keeps the state", () => {
  const r = value(releaseStep({ freed: 1 }), "double");
  assert.equal(r % 10, ST.active, "state kept on double release");
  assert.notEqual(Math.floor(r / 10), 100, "double release never commits");
});

test("non-zero read-back is 117 and quarantines", () => {
  expectPacked(releaseStep({ readbackNonZero: 1 }), 1171, "residue");
});

test("negative read-back count is 106 UNKNOWN and quarantines", () => {
  expectPacked(releaseStep({ readbackNonZero: -1 }), 1061, "negative");
});

test("exhausted generation is 140 and quarantines", () => {
  expectPacked(releaseStep({ slotGeneration: GEN_MAX_LIVE, handleGeneration: GEN_MAX_LIVE }), 1401, "exhausted");
});

test("release in Quarantined still wipes and stays Quarantined", () => {
  expectPacked(releaseStep({ stateToken: ST.quarantined }), 1001, "quarantined clean");
  expectPacked(releaseStep({ stateToken: ST.quarantined, readbackNonZero: 1 }), 1171, "quarantined residue");
});

test("release in Partial quarantines; Disposed stays final", () => {
  expectPacked(releaseStep({ stateToken: ST.partial }), 1001, "partial");
  expectPacked(releaseStep({ stateToken: ST.disposed }), 1002, "disposed");
});

test("release step verdict equals arenaRelease across a grid", () => {
  const cases = [
    {}, { handleGeneration: 4 }, { freed: 1 }, { wipeClass: 1 }, { wipeToken: 1 },
    { readbackClass: 1 }, { readbackNonZero: 2 }, { slotGeneration: 0, handleGeneration: 0 },
  ];
  for (const c of cases) {
    const v = value(release(c), "release " + JSON.stringify(c));
    const s = value(releaseStep(c), "step " + JSON.stringify(c));
    assert.equal(Math.floor(s / 10), v, "verdict " + JSON.stringify(c));
    expectPacked(stateAfter(7, ST.active, v), s % 10, "next state from the table " + JSON.stringify(c));
    if (v === 100 || v === 150) assert.equal(s % 10, ST.active, "keep " + JSON.stringify(c));
    if (v === 117 || v === 106 || v === 140) assert.equal(s % 10, ST.quarantined, "quarantine " + JSON.stringify(c));
  }
});

test("re-alloc read step: clean 1000, residue 1171, no committed release 1061", () => {
  expectPacked(reallocStep(), 1000, "clean");
  expectPacked(reallocStep({ nonZeroCount: 1 }), 1171, "residue");
  expectPacked(reallocStep({ releaseVerdict: 117 }), 1061, "no commit");
});

test("re-alloc read step: wrong generation keeps state, short read quarantines", () => {
  expectPacked(reallocStep({ slotGeneration: 5 }), 1500, "wrong gen");
  expectPacked(reallocStep({ readLen: 31 }), 1061, "short read");
});

test("re-alloc step verdict equals arenaReallocRead", () => {
  for (const c of [{}, { nonZeroCount: -1 }, { expectedLen: 0, readLen: 0 }, { priorGeneration: 0, slotGeneration: 1 }]) {
    const v = value(realloc(c), "realloc " + JSON.stringify(c));
    const s = value(reallocStep(c), "step " + JSON.stringify(c));
    assert.equal(Math.floor(s / 10), v, "verdict " + JSON.stringify(c));
  }
});
