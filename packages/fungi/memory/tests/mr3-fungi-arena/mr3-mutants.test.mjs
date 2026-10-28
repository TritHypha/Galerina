// MR3 killing mutants: each weakening of a new rule must turn a pinned
// verdict red. The tracked source is never edited (sha256 checked).
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMutant, putExact, stateAfter, leaseOpen, leaseClose, OP, ST } from "./mr3-harness.mjs";

function killed(r, survivorValue, label) {
  assert.equal(r.present, true, label + " ran " + r.text);
  assert.notEqual(r.value, survivorValue, label + " mutant must change the verdict");
}

test("MR3-M1 put reply length check removed: put-extra would read ok", () => {
  const r = withMutant("  if replyLen != 0 {\n    if replyWiped == 117 {", "  if replyLen == -99 {\n    if replyWiped == 117 {", "M1", () => putExact({ replyLen: 1 }));
  killed(r, 106, "M1");
});

test("MR3-M2 reply wipe ignored: failed reply wipe would read ok", () => {
  const r = withMutant("  let replyWipeWin: Int = wipeWins(replyWiped)", "  let replyWipeWin: Int = 100", "M2", () => putExact({ replyWipeToken: 1 }));
  killed(r, 117, "M2");
});

test("MR3-M3 epoch 140 no longer quarantines", () => {
  const r = withMutant("  if packedCode == 140 {\n    return 1\n  }", "  if packedCode == 140 {\n    return 0\n  }", "M3", () => stateAfter(OP.epoch, ST.active, 140));
  killed(r, ST.quarantined, "M3");
});

test("MR3-M4 unknown packed code keeps Active (fail open)", () => {
  const r = withMutant("    return 0\n  }\n  return 1\n}", "    return 0\n  }\n  return 0\n}", "M4", () => stateAfter(OP.has, ST.active, 999));
  killed(r, ST.quarantined, "M4");
});

test("MR3-M5 nested same-name lease admitted", () => {
  const r = withMutant("  if liveCount == 1 {\n    return finish(51, true)", "  if liveCount == 1 {\n    return finish(0, true)", "M5", () => leaseOpen({ liveCount: 1 }));
  killed(r, 151, "M5");
});

test("MR3-M6 double close accepted", () => {
  const r = withMutant("  if liveCount != 1 {\n    return finish(6, true)\n  }\n  return finish(0, true)\n}\n", "  if liveCount > 1 {\n    return finish(6, true)\n  }\n  return finish(0, true)\n}\n", "M6", () => leaseClose({ liveCount: 0 }));
  killed(r, 106, "M6");
});

test("MR3-M7 quarantine healed by an ok reply", () => {
  const r = withMutant("  if stateToken == 1 {\n    return 1\n  }\n  if packedCode == 106", "  if stateToken == 1 {\n    return 0\n  }\n  if packedCode == 106", "M7", () => stateAfter(OP.status, ST.quarantined, 100));
  killed(r, ST.quarantined, "M7");
});
