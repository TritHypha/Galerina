// sentinel-integration.test.mjs — the "Triple-Lock" end-to-end.
//
// Proves the three Sentinel layers compose into one governed ternary op:
//   LSIO (Sentinel I/O)     — manifest + HMAC/SHA-256 integrity gate on the weights
//   LSM  (Sentinel Memory)  — fixed-block, 128-bit-aligned, segmented TPL staging
//   Tower Brawn (bridge)    — the BitNet T-MAC over the staged, verified trits
//
// Critically, LSM's TPLStateBuffer packs trits in the SAME BitNet I2_S layout the
// StubTernaryBridge decodes — so the staged buffer is consumed zero-copy by the
// Brawn with no reformatting. Imports siblings via relative dist paths (no
// package.json dependency needed for an integration check).

import { test } from "node:test";
import assert from "node:assert/strict";
import { StubTernaryBridge } from "../dist/index.js";
import { StaticMemoryPool, TPLStateBuffer, SegmentationController } from "../../galerina-core-sentinel-memory/dist/index.js";
import { buildManifest, IntegrityMonitor, ZeroCopyMapper } from "../../galerina-core-sentinel-io/dist/index.js";

const TRITS = 256;
const ticat = (s) => `SENT-${s}-${process.pid}-${Math.random().toString(36).slice(2, 7)}`;

function makeTrits(n) {
  const out = [];
  let r = 0x9e3779b9 >>> 0;
  for (let i = 0; i < n; i++) { r ^= (r << 13); r >>>= 0; r ^= (r >>> 17); r ^= (r << 5); r >>>= 0; out.push((r % 3) - 1); }
  return out;
}

function caught(fn) { try { fn(); return null; } catch (e) { return e; } }

test("Triple-Lock: LSM-staged + LSIO-verified weights run through the Brawn", () => {
  const trits = makeTrits(TRITS);

  // ── LSM: stage trits in a pooled, 128-bit-aligned COMPUTE-segment TPL buffer ──
  const pool = new StaticMemoryPool({ totalBytes: 4096, blockBytes: 64 });
  const seg = new SegmentationController(pool);
  const tpl = new TPLStateBuffer(pool, TRITS);
  tpl.loadTrits(trits);
  assert.equal(tpl.block.ptr % 16, 0, "TPL staging buffer must be 128-bit aligned");
  seg.assertAccess(tpl.block.ptr, "compute"); // staging lives in the compute segment
  const packedBytes = pool.u8(tpl.block).slice(0, Math.ceil(TRITS / 16) * 4);

  // ── LSIO: manifest + integrity gate + zero-copy map of the staged weights ──
  const manifest = buildManifest("ternary-weights", [{ id: "w0", bytes: packedBytes }]);
  const monitor = new IntegrityMonitor();
  const mapper = new ZeroCopyMapper();
  const [mapped] = mapper.map(manifest, packedBytes, monitor); // throws if integrity fails
  const verified = mapped.i32(); // zero-copy view over verified weights

  // ── Brawn: T-MAC over the verified, staged trits ──
  const acts = Int32Array.from({ length: TRITS }, (_, i) => ((i * 5) % 7) - 3);
  const bridge = new StubTernaryBridge();
  const r = bridge.execute({ opClass: "feedforward", precision: "ternary", correlationId: ticat("ok"), weights: verified, activations: acts, count: TRITS, scale: 1, offset: 0 });

  assert.equal(r.deterministic, true, "ternary path must be deterministic (Citizen Standard 1)");
  assert.equal(r.technique, "ternary");
  assert.equal(typeof r.value, "number");

  // Equivalence: staging through the Sentinels must not change the math vs. feeding
  // the same packed trits directly.
  const direct = bridge.execute({ opClass: "feedforward", precision: "ternary", correlationId: ticat("direct"), weights: pool.i32(tpl.block), activations: acts, count: TRITS, scale: 1, offset: 0 });
  assert.equal(r.value, direct.value, "Sentinel-staged result must equal the direct result");
});

test("Hardened Border: a tampered weight block is rejected by LSIO before the Brawn sees it", () => {
  const trits = makeTrits(64);
  const pool = new StaticMemoryPool({ totalBytes: 1024, blockBytes: 64 });
  const tpl = new TPLStateBuffer(pool, 64);
  tpl.loadTrits(trits);
  const packed = pool.u8(tpl.block).slice(0, Math.ceil(64 / 16) * 4);

  const manifest = buildManifest("ternary-weights", [{ id: "w0", bytes: packed }]);
  const monitor = new IntegrityMonitor();
  const mapper = new ZeroCopyMapper();

  // Flip a byte AFTER the manifest was built → integrity mismatch.
  const tampered = Uint8Array.from(packed);
  tampered[0] ^= 0xff;

  const err = caught(() => mapper.map(manifest, tampered, monitor));
  assert.ok(err, "tampered weights must not map");
  assert.equal(err.name, "HardenedBorderViolation");
  assert.match(err.code, /LSIO-INTEGRITY/);
});

test("Segmentation: a compute pointer is rejected from the governance segment", () => {
  const pool = new StaticMemoryPool({ totalBytes: 4096, blockBytes: 64, computeRatio: 0.5 });
  const seg = new SegmentationController(pool);
  const compute = seg.computeAlloc(64);
  const err = caught(() => seg.assertAccess(compute.ptr, "governance"));
  assert.ok(err, "compute ptr must not pass a governance-segment assertion");
  assert.match(err.code, /LSM-SEGV/);
});
