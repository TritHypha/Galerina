// MR3: the six MR2 H11 length-exact targets, pinned on the .fungi unit.
// MR2 recorded them as todo against the frozen TS reference (which is lax);
// here each reply verdict is checked AND the one-way state transition that
// follows it, so "UNKNOWN and quarantines" is proven end to end in .fungi.
import { test } from "node:test";
import assert from "node:assert/strict";
import { has, status, epoch, putExact, stateAfter, expectPacked, OP, ST } from "./mr3-harness.mjs";

function quarantines(op, packed, label) {
  const r = stateAfter(op, ST.active, packed);
  expectPacked(r, ST.quarantined, label + " state after");
}

test("MR3 H11 has-long: two data bytes is 106 UNKNOWN and quarantines", () => {
  const r = has({ dataLen: 2 });
  expectPacked(r, 106, "has-long");
  quarantines(OP.has, r.value, "has-long");
});

test("MR3 H11 has-empty: OK with no data byte is 106 and quarantines, never absent", () => {
  const r = has({ dataLen: 0 });
  expectPacked(r, 106, "has-empty");
  assert.notEqual(r.value, 101, "never absent");
  quarantines(OP.has, r.value, "has-empty");
});

for (const [mode, over] of [
  ["status-empty", { dataLen: 0 }],
  ["status-long", { dataLen: 2 }],
  ["status-two", { dataByte: 2 }],
]) {
  test(`MR3 H11 ${mode}: status reads Quarantined (121), never Active`, () => {
    const r = status(over);
    expectPacked(r, 121, mode);
    quarantines(OP.status, r.value, mode);
  });
}

test("MR3 H11 put-extra: OK put reply with trailing bytes is 106 and quarantines", () => {
  const r = putExact({ replyLen: 1 });
  expectPacked(r, 106, "put-extra");
  quarantines(OP.put, r.value, "put-extra");
});

test("MR3 H11 put-negative: negative reply length is 106", () => {
  expectPacked(putExact({ replyLen: -1 }), 106, "put-negative");
});

for (const len of [7, 9, 0]) {
  test(`MR3 H11 epoch-len-${len}: wrong-length epoch frame is 140 and quarantines`, () => {
    const r = epoch({ dataLen: len });
    expectPacked(r, 140, "epoch len " + len);
    quarantines(OP.epoch, r.value, "epoch len " + len);
  });
}

test("MR3 control: exact frames stay ok and Active", () => {
  const h = has();
  expectPacked(h, 100, "has ok");
  expectPacked(stateAfter(OP.has, ST.active, h.value), ST.active, "has keeps Active");
  const s = status();
  expectPacked(s, 100, "status ok");
  expectPacked(stateAfter(OP.status, ST.active, s.value), ST.active, "status keeps Active");
  const e = epoch();
  expectPacked(e, 100, "epoch ok");
  expectPacked(stateAfter(OP.epoch, ST.active, e.value), ST.active, "epoch keeps Active");
  const p = putExact();
  expectPacked(p, 100, "put ok");
  expectPacked(stateAfter(OP.put, ST.active, p.value), ST.active, "put keeps Active");
});
