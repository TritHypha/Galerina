// MR6 mutants: each one must change a pinned value. Mutants are exact source
// string replacements on a flattened copy; the tracked unit is sha256-checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMutant, releaseStep, cycle, cycleStep, value, ST } from "./mr6-harness.mjs";

function killed(needle, next, label, run, original) {
  withMutant(needle, next, label, () => {
    const r = run();
    assert.ok(!r.present || r.value !== original, label + " survived: " + r.text);
  });
}

test("baseline values the mutants must move", () => {
  assert.equal(value(releaseStep(), "rs"), 1000);
  assert.equal(value(releaseStep({ stateToken: ST.quarantined }), "rsq"), 1001);
  assert.equal(value(cycle(), "c"), 100);
  assert.equal(value(cycleStep({ nonZeroCount: 1 }), "cs"), 1171);
});

test("M1 op range back to 0-6 is killed", () => {
  killed("  if opCode > 8 {", "  if opCode > 6 {", "M1", () => releaseStep(), 1000);
});

test("M2 release step ignoring the state token is killed", () => {
  killed("  return arenaStep(7, stateToken, releasePacked)", "  return arenaStep(7, 0, releasePacked)", "M2",
    () => releaseStep({ stateToken: ST.quarantined }), 1001);
});

test("M3 release step wired as dispose (op 5) is killed", () => {
  killed("  return arenaStep(7, stateToken, releasePacked)", "  return arenaStep(5, stateToken, releasePacked)", "M3",
    () => releaseStep(), 1000);
});

test("M4 cycle re-alloc read against the old generation is killed", () => {
  killed("slotGeneration, cycleGeneration, lenClass", "slotGeneration, slotGeneration, lenClass", "M4",
    () => cycle(), 100);
});

test("M5 cycle step pairing the release instead of the re-alloc read is killed", () => {
  killed("  return arenaStep(8, stateToken, cyclePacked)", "  return arenaStep(8, stateToken, stepRelease)", "M5",
    () => cycleStep({ nonZeroCount: 1 }), 1171);
});

test("M6 cycle skipping the release verdict check is killed", () => {
  killed("  if cycleRelease != 100 {\n    return cycleRelease", "  if cycleRelease > 999 {\n    return cycleRelease", "M6",
    () => cycle({ readbackNonZero: 1 }), 117);
});

// Passing 100 instead of cycleRelease to the re-alloc read is an equivalent
// mutant (cycleRelease is always 100 there) and is not listed as a kill.
