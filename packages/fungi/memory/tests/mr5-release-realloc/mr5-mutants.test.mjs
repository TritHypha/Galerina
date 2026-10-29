// MR5 killing mutants: each weakening of a new release / re-alloc / handle
// rule must change a pinned verdict. The tracked source is never edited
// (sha256 checked by withMutant).
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMutant, release, nextGeneration, realloc, handleUse, GEN_MAX_LIVE } from "./mr5-harness.mjs";

function killed(r, survivorValue, label) {
  assert.equal(r.present, true, label + " ran " + r.text);
  assert.notEqual(r.value, survivorValue, label + " mutant must change the verdict");
}

test("MR5-M1 release skips the slot check: stale handle reaches the wipe", () => {
  const r = withMutant("  if releaseSlot != 100 {\n    return releaseSlot", "  if releaseSlot > 999 {\n    return releaseSlot", "M1", () => release({ slotGeneration: 4, handleGeneration: 3, wipeToken: 1 }));
  killed(r, 150, "M1");
});

test("MR5-M2 release ignores the wipe verdict", () => {
  const r = withMutant("  if releaseWipe != 100 {\n    return releaseWipe", "  if releaseWipe > 999 {\n    return releaseWipe", "M2", () => release({ wipeToken: 1 }));
  killed(r, 117, "M2");
});

test("MR5-M3 release ignores read-back residue", () => {
  const r = withMutant("  if readbackNonZero > 0 {\n    return finish(17, true)", "  if readbackNonZero > 2147483647 {\n    return finish(17, true)", "M3", () => release({ readbackNonZero: 1 }));
  killed(r, 117, "M3");
});

test("MR5-M4 release allows a wrapping bump", () => {
  const r = withMutant("  if slotGeneration > 2147483645 {\n    return finish(40, true)\n  }\n  return finish(0, true)", "  return finish(0, true)", "M4", () => release({ slotGeneration: GEN_MAX_LIVE, handleGeneration: GEN_MAX_LIVE }));
  killed(r, 140, "M4");
});

test("MR5-M5 next generation does not bump", () => {
  const r = withMutant("  let bumped: Int = slotGeneration + 1", "  let bumped: Int = slotGeneration + 0", "M5", () => nextGeneration());
  killed(r, 4, "M5");
});

test("MR5-M6 next generation leaks the old generation on failure", () => {
  const r = withMutant("  if releasedVerdict != 100 {\n    return 0", "  if releasedVerdict != 100 {\n    return slotGeneration", "M6", () => nextGeneration({ wipeToken: 1 }));
  killed(r, 0, "M6");
});

test("MR5-M7 re-alloc accepts an uncommitted release", () => {
  const r = withMutant("  if releaseVerdict != 100 {\n    return finish(6, true)", "  if releaseVerdict > 999 {\n    return finish(6, true)", "M7", () => realloc({ releaseVerdict: 117 }));
  killed(r, 106, "M7");
});

test("MR5-M8 re-alloc skips the generation step check", () => {
  const r = withMutant("  if slotGeneration != expectedGeneration {", "  if slotGeneration < -1 {", "M8", () => realloc({ priorGeneration: 3, slotGeneration: 3 }));
  killed(r, 150, "M8");
});

test("MR5-M9 re-alloc ignores residue", () => {
  const r = withMutant("  if nonZeroCount > 0 {\n    return finish(17, true)", "  if nonZeroCount > 2147483647 {\n    return finish(17, true)", "M9", () => realloc({ nonZeroCount: 1 }));
  killed(r, 117, "M9");
});

test("MR5-M10 re-alloc accepts a short read", () => {
  const r = withMutant("  if readLen != expectedLen {", "  if readLen > expectedLen {", "M10", () => realloc({ readLen: 1 }));
  killed(r, 106, "M10");
});

test("MR5-M11 handle use drops the slot gate", () => {
  const r = withMutant("  if useSlot != 100 {\n    return useSlot", "  if useSlot > 999 {\n    return useSlot", "M11", () => handleUse({ freed: 1 }));
  killed(r, 150, "M11");
});
