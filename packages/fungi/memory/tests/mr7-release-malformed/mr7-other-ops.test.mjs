// MR7 is scoped to ops 7 and 8. Ops 0-6 keep the MR3 table, where 110 and 111
// are benign (state kept); a table-wide change is left for a later row.
import { test } from "node:test";
import { stateAfter, expectPacked, ST, KEEP_OPS, MALFORMED, UNLISTED } from "./mr7-harness.mjs";

for (const op of KEEP_OPS) {
  test("op " + op + " unlisted (111) keeps Active, as in MR3", () => {
    expectPacked(stateAfter(op, ST.active, UNLISTED), ST.active, "op " + op + " 111");
  });
}

test("op 3 use malformed (110) keeps Active, as in MR3", () => {
  expectPacked(stateAfter(3, ST.active, MALFORMED), ST.active, "op 3 110");
});

test("op 5 dispose of a 110 reply is still Disposed", () => {
  expectPacked(stateAfter(5, ST.active, MALFORMED), ST.disposed, "op 5 110");
});

test("op 9 is still the first unlisted op", () => {
  expectPacked(stateAfter(9, ST.active, UNLISTED), 11, "op 9 111");
});