import assert from "node:assert/strict";
import { test } from "node:test";
import { pack, packedLen, prefilterBatch } from "../dist/index.js";

test("pack refuses a non-array and an oversize trit list", () => {
  assert.throws(() => pack({ length: 8 }), /array/);
  assert.throws(() => pack(new Array(4097).fill(0)), /lenTrits/);
  assert.equal(pack([1, 0, -1]).length, packedLen(3));
});

test("prefilterBatch refuses n that exceeds packed subject bytes", () => {
  const row = pack([1, 0, 1, 0]);
  assert.throws(() => prefilterBatch(row, row, 4, 8), /batch subjects/);
  assert.equal(prefilterBatch(row, row, 4, 1).length, 1);
});
