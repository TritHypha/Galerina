// MR6: ops 7 (release) and 8 (re-alloc read) are listed in arenaStateAfter
// and follow the general one-way table. Op 9 is the first unlisted op (11).
import { test } from "node:test";
import { stateAfter, step, expectPacked, OP6, ST } from "./mr6-harness.mjs";

for (const op of [OP6.release, OP6.realloc]) {
  test("op " + op + " committed (100) keeps Active", () => {
    expectPacked(stateAfter(op, ST.active, 100), ST.active, "op " + op + " 100");
  });

  test("op " + op + " malformed reply (111) keeps the state, as in MR3", () => {
    expectPacked(stateAfter(op, ST.active, 111), ST.active, "op " + op + " 111 active");
  });

  test("op " + op + " stale or wrong generation (150) keeps the state", () => {
    expectPacked(stateAfter(op, ST.active, 150), ST.active, "op " + op + " 150 active");
  });

  for (const code of [117, 106, 140]) {
    test("op " + op + " verdict " + code + " quarantines", () => {
      expectPacked(stateAfter(op, ST.active, code), ST.quarantined, "op " + op + " " + code);
    });
  }

  test("op " + op + " Quarantined is one-way (100 does not heal)", () => {
    expectPacked(stateAfter(op, ST.quarantined, 100), ST.quarantined, "op " + op + " q 100");
  });

  test("op " + op + " Partial quarantines", () => {
    expectPacked(stateAfter(op, ST.partial, 100), ST.quarantined, "op " + op + " partial 100");
  });

  test("op " + op + " Disposed is final", () => {
    expectPacked(stateAfter(op, ST.disposed, 100), ST.disposed, "op " + op + " disposed");
  });
}

test("op 9 is the first unlisted op", () => {
  expectPacked(stateAfter(9, ST.active, 100), 11, "op 9");
});

test("op 8 stays listed at the top of the range (op 8 is not 11)", () => {
  expectPacked(step(OP6.realloc, ST.active, 117), 1171, "step op 8 117");
});

test("step op 7 packs verdict and next state", () => {
  expectPacked(step(OP6.release, ST.active, 100), 1000, "step op 7 100");
  expectPacked(step(OP6.release, ST.active, 150), 1500, "step op 7 150");
});
