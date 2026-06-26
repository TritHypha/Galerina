// tpl.test.mjs — TPLStateBuffer ternary pack/unpack (the tri-logic core).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  StaticMemoryPool,
  TPLStateBuffer,
  SecurityTrap,
} from "../dist/index.js";
import { caught } from "./_helpers.mjs";

const mkPool = () =>
  new StaticMemoryPool({ totalBytes: 1024, blockBytes: 16, computeRatio: 1 });

test("setTrit / getTrit round-trips -1, 0, +1", () => {
  const tpl = new TPLStateBuffer(mkPool(), 3);
  tpl.setTrit(0, -1);
  tpl.setTrit(1, 0);
  tpl.setTrit(2, 1);
  assert.equal(tpl.getTrit(0), -1);
  assert.equal(tpl.getTrit(1), 0);
  assert.equal(tpl.getTrit(2), 1);
});

test("loadTrits + toArray round-trips a 40-trit vector across word boundaries", () => {
  const tpl = new TPLStateBuffer(mkPool(), 40); // spans 3 i32 words (16,16,8)
  const vec = [];
  for (let i = 0; i < 40; i++) vec.push((i % 3) - 1); // -1,0,1,-1,0,1,...
  tpl.loadTrits(vec);
  assert.deepEqual(tpl.toArray(), vec);
  assert.equal(tpl.tritCount, 40);
});

test("setTrit with an out-of-domain value throws LSM-TRIT-RANGE", () => {
  const tpl = new TPLStateBuffer(mkPool(), 4);
  const err = caught(() => tpl.setTrit(0, 2));
  assert.ok(err instanceof SecurityTrap);
  assert.equal(err.code, "LSM-TRIT-RANGE");
});

test("getTrit out of index throws LSM-TRIT-INDEX", () => {
  const tpl = new TPLStateBuffer(mkPool(), 4);
  const err = caught(() => tpl.getTrit(4));
  assert.ok(err instanceof SecurityTrap);
  assert.equal(err.code, "LSM-TRIT-INDEX");
  assert.equal(caught(() => tpl.setTrit(-1, 0)).code, "LSM-TRIT-INDEX");
});

test("byteLength + block reflect the allocated compute block", () => {
  const pool = mkPool();
  const tpl = new TPLStateBuffer(pool, 17); // 2 words -> 8 bytes -> 16 aligned
  assert.equal(tpl.byteLength, 16);
  assert.equal(tpl.block.segment, "compute");
  assert.equal(pool.segmentOf(tpl.block.ptr), "compute");
});

test("corruption sentinel (enc=3) read trips LSM-TRIT-CORRUPT", () => {
  const pool = mkPool();
  const tpl = new TPLStateBuffer(pool, 4);
  // Tamper directly: write the 0b11 sentinel into trit 0's slot.
  const view = pool.i32(tpl.block);
  // trit 0: shift = byteIdx*8 + (3-pos)*2 = 0*8 + 3*2 = 6
  view[0] = 0x3 << 6;
  const err = caught(() => tpl.getTrit(0));
  assert.ok(err instanceof SecurityTrap);
  assert.equal(err.code, "LSM-TRIT-CORRUPT");
});
