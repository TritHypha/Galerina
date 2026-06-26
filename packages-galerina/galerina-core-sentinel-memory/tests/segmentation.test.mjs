// segmentation.test.mjs — SegmentationController cross-segment guard.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  StaticMemoryPool,
  SegmentationController,
  SecurityTrap,
} from "../dist/index.js";
import { caught } from "./_helpers.mjs";

const mk = () => {
  const pool = new StaticMemoryPool({ totalBytes: 256, blockBytes: 16, computeRatio: 0.5 });
  return { pool, seg: new SegmentationController(pool) };
};

test("computeAlloc ptr lands in the compute region", () => {
  const { pool, seg } = mk();
  const b = seg.computeAlloc(16);
  assert.equal(pool.segmentOf(b.ptr), "compute");
  assert.equal(b.segment, "compute");
});

test("governanceAlloc ptr lands in the governance region", () => {
  const { pool, seg } = mk();
  const b = seg.governanceAlloc(16);
  assert.equal(pool.segmentOf(b.ptr), "governance");
  assert.equal(b.segment, "governance");
});

test("assertAccess(computePtr,'governance') throws LSM-SEGV-001", () => {
  const { seg } = mk();
  const c = seg.computeAlloc(16);
  const err = caught(() => seg.assertAccess(c.ptr, "governance"));
  assert.ok(err instanceof SecurityTrap);
  assert.equal(err.code, "LSM-SEGV-001");
});

test("assertAccess(governancePtr,'compute') throws LSM-SEGV-001 (reverse)", () => {
  const { seg } = mk();
  const g = seg.governanceAlloc(16);
  const err = caught(() => seg.assertAccess(g.ptr, "compute"));
  assert.ok(err instanceof SecurityTrap);
  assert.equal(err.code, "LSM-SEGV-001");
});

test("assertAccess succeeds when the segment matches", () => {
  const { seg } = mk();
  const c = seg.computeAlloc(16);
  const g = seg.governanceAlloc(16);
  assert.doesNotThrow(() => seg.assertAccess(c.ptr, "compute"));
  assert.doesNotThrow(() => seg.assertAccess(g.ptr, "governance"));
});
