// MR4 arenaStep: every packed verdict is paired with the MR3 one-way next
// state as verdict * 10 + state. Unlisted op or state is 11. A verdict outside
// 100..199 is read as 106 UNKNOWN and can never come back paired with Active.
import { test } from "node:test";
import { step, expectStep, expectPacked, OP, ST } from "./mr4-harness.mjs";

test("MR4-S1 ok keeps Active", () => {
  expectStep(step(OP.has, ST.active, 100), 100, ST.active, "has ok");
});

test("MR4-S2 failed wipe and UNKNOWN quarantine in the same value", () => {
  expectStep(step(OP.use, ST.active, 117), 117, ST.quarantined, "use 117");
  expectStep(step(OP.use, ST.active, 106), 106, ST.quarantined, "use 106");
});

test("MR4-S3 nested lease refusal keeps Active", () => {
  expectStep(step(OP.lease, ST.active, 151), 151, ST.active, "lease 151");
});

test("MR4-S4 disposed code and dispose op are Disposed", () => {
  expectStep(step(OP.has, ST.active, 141), 141, ST.disposed, "has 141");
  expectStep(step(OP.dispose, ST.active, 100), 100, ST.disposed, "dispose ok");
});

test("MR4-S5 quarantine and partial are never Active again; Disposed is final", () => {
  expectStep(step(OP.has, ST.quarantined, 100), 100, ST.quarantined, "q ok");
  expectStep(step(OP.has, ST.partial, 100), 100, ST.quarantined, "partial ok");
  expectStep(step(OP.has, ST.disposed, 100), 100, ST.disposed, "disposed ok");
});

test("MR4-S6 out-of-range verdicts read as 106 UNKNOWN plus quarantine", () => {
  for (const code of [999, 200, 99, 0, -5]) {
    expectStep(step(OP.has, ST.active, code), 106, ST.quarantined, "code " + code);
  }
});

test("MR4-S7 unknown in-range code quarantines (fail closed)", () => {
  expectStep(step(OP.has, ST.active, 122), 122, ST.quarantined, "code 122");
});

test("MR4-S8 unlisted op or state token is 11", () => {
  expectPacked(step(9, ST.active, 100), 11, "op 9");
  expectPacked(step(-1, ST.active, 100), 11, "op -1");
  expectPacked(step(OP.has, 4, 100), 11, "state 4");
  expectPacked(step(OP.has, -1, 100), 11, "state -1");
});