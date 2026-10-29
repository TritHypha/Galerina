// MR7 mutants: each must move a pinned value. Exact source string
// replacements on a flattened copy; the tracked unit is sha256-checked.
import { test } from "node:test";
import assert from "node:assert/strict";
import { withMutant, stateAfter, releaseStep, ST } from "./mr7-harness.mjs";

const GUARD = "  if opCode > 6 {\n    if packedCode == 110 {";
const ARM110 = "    if packedCode == 110 {\n      return 1\n    }\n    if packedCode == 111 {";
const ARM111 = "    if packedCode == 111 {\n      return 1\n    }\n  }";

function killed(needle, next, label, run, original) {
  withMutant(needle, next, label, () => {
    const r = run();
    assert.ok(!r.present || r.value !== original, label + " survived: " + r.text);
  });
}

test("baseline values the mutants must move", () => {
  assert.equal(stateAfter(7, ST.active, 110).value, ST.quarantined);
  assert.equal(stateAfter(8, ST.active, 111).value, ST.quarantined);
  assert.equal(stateAfter(3, ST.active, 111).value, ST.active);
  assert.equal(releaseStep({ readbackClass: 1 }).value, 1101);
});

test("N1 guard switched off (op > 8) is killed", () => {
  killed(GUARD, "  if opCode > 8 {\n    if packedCode == 110 {", "N1", () => stateAfter(7, ST.active, 110), ST.quarantined);
});

test("N2 guard narrowed to op 8 only is killed", () => {
  killed(GUARD, "  if opCode > 7 {\n    if packedCode == 110 {", "N2", () => releaseStep({ readbackClass: 1 }), 1101);
});

test("N3 guard widened to every op is killed", () => {
  killed(GUARD, "  if opCode > -1 {\n    if packedCode == 110 {", "N3", () => stateAfter(3, ST.active, 111), ST.active);
});

test("N4 malformed arm keeping the state is killed", () => {
  killed(ARM110, "    if packedCode == 110 {\n      return 0\n    }\n    if packedCode == 111 {", "N4",
    () => stateAfter(7, ST.active, 110), ST.quarantined);
});

test("N5 unlisted arm keeping the state is killed", () => {
  killed(ARM111, "    if packedCode == 111 {\n      return 0\n    }\n  }", "N5",
    () => stateAfter(8, ST.active, 111), ST.quarantined);
});