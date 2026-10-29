// MR4 killing mutants: each weakening of a new wiring rule must turn a pinned
// verdict red. The tracked source is never edited (sha256 checked).
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMutant, step, hasStep, statusStep, epochStep, putStep, leasedUse, leasedUseStep, OP, ST } from "./mr4-harness.mjs";

function killed(r, survivorValue, label) {
  assert.equal(r.present, true, label + " ran " + r.text);
  assert.notEqual(r.value, survivorValue, label + " mutant must change the verdict");
}

test("MR4-M1 verdict above 199 paired with Active", () => {
  const r = withMutant("    return 1060 + nextState\n  }\n  let scaled", "    return 1000 + nextState\n  }\n  let scaled", "M1", () => step(OP.has, ST.active, 250));
  killed(r, 1061, "M1");
});

test("MR4-M2 verdict below 100 passed through", () => {
  const r = withMutant("  if packedCode < 100 {\n    return 1060 + nextState", "  if packedCode < -999 {\n    return 1060 + nextState", "M2", () => step(OP.has, ST.active, 99));
  killed(r, 1061, "M2");
});

test("MR4-M3 unlisted op no longer 11", () => {
  const r = withMutant("  if nextState == 11 {\n    return 11\n  }\n  if nextState < 0 {\n    return 11\n  }\n  if nextState > 3 {\n    return 11\n  }\n", "", "M3", () => step(9, ST.active, 100));
  killed(r, 11, "M3");
});

test("MR4-M4 lease refusal ignored: use runs under a nested lease", () => {
  const r = withMutant("  if opened != 100 {\n    return opened", "  if opened > 999 {\n    return opened", "M4", () => leasedUse({ liveCount: 1, wipeToken: 1 }));
  killed(r, 151, "M4");
});

test("MR4-M5 close accounts for the wrong lease count", () => {
  const r = withMutant("  let held: Int = liveCount + 1", "  let held: Int = liveCount + 2", "M5", () => leasedUse());
  killed(r, 100, "M5");
});

test("MR4-M6 put wired to the wrong op", () => {
  const r = withMutant("  return arenaStep(4, stateToken, packed)", "  return arenaStep(5, stateToken, packed)", "M6", () => putStep());
  killed(r, 1000, "M6");
});

test("MR4-M7 leased use wired to the wrong op", () => {
  const r = withMutant("  return arenaStep(3, stateToken, packed)", "  return arenaStep(5, stateToken, packed)", "M7", () => leasedUseStep());
  killed(r, 1000, "M7");
});

test("MR4-M8 has wired to the wrong op", () => {
  const r = withMutant("  return arenaStep(0, stateToken, packed)", "  return arenaStep(5, stateToken, packed)", "M8", () => hasStep());
  killed(r, 1000, "M8");
});

test("MR4-M9 status wired to the wrong op", () => {
  const r = withMutant("  return arenaStep(1, stateToken, packed)", "  return arenaStep(5, stateToken, packed)", "M9", () => statusStep());
  killed(r, 1000, "M9");
});

test("MR4-M10 epoch wired to the wrong op", () => {
  const r = withMutant("  return arenaStep(2, stateToken, packed)", "  return arenaStep(5, stateToken, packed)", "M10", () => epochStep());
  killed(r, 1000, "M10");
});