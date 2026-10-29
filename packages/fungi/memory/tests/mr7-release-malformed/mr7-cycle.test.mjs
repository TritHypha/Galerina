// MR7 through the release cycle. A malformed release is paired under op 7, a
// malformed re-alloc read under op 8; both quarantine. The plain cycle verdict
// is unchanged (MR7 only changes the next state).
import { test } from "node:test";
import { cycle, cycleStep, expectPacked } from "./mr7-harness.mjs";

test("cycle verdict for a malformed read-back is still 110", () => {
  expectPacked(cycle({ readbackClass: 1 }), 110, "cycle read-back 1");
});

test("cycle step with a malformed read-back quarantines (op 7)", () => {
  expectPacked(cycleStep({ readbackClass: 1 }), 1101, "cycle step read-back 1");
});

test("cycle step with a malformed residue class quarantines (op 8)", () => {
  expectPacked(cycleStep({ nonZeroClass: 1 }), 1101, "cycle step non-zero 1");
});

test("cycle step with an unlisted residue class quarantines (op 8)", () => {
  expectPacked(cycleStep({ nonZeroClass: 11 }), 1111, "cycle step non-zero 11");
});

test("clean cycle step still 1000", () => {
  expectPacked(cycleStep(), 1000, "clean cycle step");
});