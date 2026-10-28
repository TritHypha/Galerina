// MR3: arenaStateAfter is the one-way arena state machine. Quarantine and
// Disposed are never undone, Partial never returns to Active, and any packed
// code it does not recognise quarantines (fail closed).
import { test } from "node:test";
import { stateAfter, expectPacked, OP, ST } from "./mr3-harness.mjs";

test("MR3 state: quarantining codes from Active", () => {
  for (const code of [106, 117, 121, 139, 140]) {
    expectPacked(stateAfter(OP.use, ST.active, code), ST.quarantined, "code " + code);
  }
});

test("MR3 state: benign codes keep Active", () => {
  for (const code of [100, 101, 102, 114, 123, 147, 150, 151]) {
    expectPacked(stateAfter(OP.use, ST.active, code), ST.active, "code " + code);
  }
});

test("MR3 state: unknown packed code quarantines (fail closed)", () => {
  for (const code of [0, 99, 152, 999, -1]) {
    expectPacked(stateAfter(OP.has, ST.active, code), ST.quarantined, "code " + code);
  }
});

test("MR3 state: quarantine is one-way", () => {
  expectPacked(stateAfter(OP.status, ST.quarantined, 100), ST.quarantined, "ok does not heal");
  expectPacked(stateAfter(OP.has, ST.partial, 100), ST.quarantined, "partial never Active");
});

test("MR3 state: Disposed is final and dispose always disposes", () => {
  expectPacked(stateAfter(OP.has, ST.disposed, 100), ST.disposed, "disposed stays");
  expectPacked(stateAfter(OP.dispose, ST.quarantined, 144), ST.disposed, "dispose from quarantined");
  expectPacked(stateAfter(OP.has, ST.active, 141), ST.disposed, "custodian says disposed");
});

test("MR3 state: unlisted op or state is 11", () => {
  expectPacked(stateAfter(7, ST.active, 100), 11, "op 7");
  expectPacked(stateAfter(-1, ST.active, 100), 11, "op -1");
  expectPacked(stateAfter(OP.has, 4, 100), 11, "state 4");
  expectPacked(stateAfter(OP.has, -1, 100), 11, "state -1");
});
