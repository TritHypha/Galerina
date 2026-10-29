// MR7: on ops 7 and 8 a malformed (110) or unlisted (111) reply quarantines.
import { test } from "node:test";
import { stateAfter, step, expectPacked, ST, RELEASE_OPS, MALFORMED, UNLISTED } from "./mr7-harness.mjs";

for (const op of RELEASE_OPS) {
  for (const code of [MALFORMED, UNLISTED]) {
    test("op " + op + " reply " + code + " quarantines Active", () => {
      expectPacked(stateAfter(op, ST.active, code), ST.quarantined, "op " + op + " " + code);
    });

    test("op " + op + " step packs " + code + " with Quarantined", () => {
      expectPacked(step(op, ST.active, code), code * 10 + ST.quarantined, "step op " + op + " " + code);
    });
  }

  test("op " + op + " 110 in Disposed stays Disposed (Disposed is final)", () => {
    expectPacked(stateAfter(op, ST.disposed, MALFORMED), ST.disposed, "op " + op + " disposed 110");
  });
}

test("op 7 committed (100) still keeps Active", () => {
  expectPacked(stateAfter(7, ST.active, 100), ST.active, "op 7 100");
});

test("op 8 stale generation (150) still keeps Active", () => {
  expectPacked(stateAfter(8, ST.active, 150), ST.active, "op 8 150");
});