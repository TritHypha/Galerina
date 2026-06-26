// flight-boot.test.mjs — the aerospace "Flight-time" boot sequence.
//
// Models the two-phase mission boot:
//   PREFLIGHT — all fallible work happens HERE (fail-fast): LSIO integrity-verifies
//               weights, LSM stages them, the pool is flight-LOCKED. Anything that
//               can throw, throws now — never mid-flight.
//   FLIGHT    — pure, deterministic, constant-time: pre-verified weights, NO
//               allocation (pool locked), batched audit (no per-event disk jitter).
//
// These tests assert the determinism guarantees the boot relies on.

import { test } from "node:test";
import assert from "node:assert/strict";
import { StubTernaryBridge, AuditLogger } from "../dist/index.js";
import { StaticMemoryPool, TPLStateBuffer } from "../../galerina-core-sentinel-memory/dist/index.js";
import { buildManifest, IntegrityMonitor, ZeroCopyMapper } from "../../galerina-core-sentinel-io/dist/index.js";

const TRITS = 256;
function makeTrits(n) { const o = []; let r = 0x9e3779b9 >>> 0; for (let i = 0; i < n; i++) { r ^= (r << 13); r >>>= 0; r ^= (r >>> 17); r ^= (r << 5); r >>>= 0; o.push((r % 3) - 1); } return o; }
function caught(fn) { try { fn(); return null; } catch (e) { return e; } }

// PREFLIGHT: stage + verify + lock. Returns the verified weights and the locked pool.
function preflight(trits, sourceOverride) {
  const pool = new StaticMemoryPool({ totalBytes: 4096, blockBytes: 64 });
  const tpl = new TPLStateBuffer(pool, trits.length);
  tpl.loadTrits(trits);
  const packed = pool.u8(tpl.block).slice(0, Math.ceil(trits.length / 16) * 4);
  const manifest = buildManifest("weights", [{ id: "w0", bytes: packed }]);
  const monitor = new IntegrityMonitor();
  const mapper = new ZeroCopyMapper();
  const verified = mapper.map(manifest, sourceOverride ?? packed, monitor)[0].i32(); // integrity gate (throws on tamper)
  pool.lockFlight(); // enter flight: no further allocation permitted
  return { pool, verified };
}

test("preflight FAILS FAST on tampered weights (never reaches flight)", () => {
  const trits = makeTrits(64);
  const pool = new StaticMemoryPool({ totalBytes: 1024, blockBytes: 64 });
  const tpl = new TPLStateBuffer(pool, 64);
  tpl.loadTrits(trits);
  const packed = pool.u8(tpl.block).slice(0, Math.ceil(64 / 16) * 4);
  const tampered = Uint8Array.from(packed); tampered[0] ^= 0xff;
  const err = caught(() => preflight(trits, tampered));
  assert.ok(err, "tampered weights must abort preflight");
  assert.equal(err.name, "HardenedBorderViolation");
});

test("flight phase forbids allocation (pool is flight-locked — deterministic memory)", () => {
  const { pool } = preflight(makeTrits(TRITS));
  assert.equal(pool.isFlightLocked(), true);
  const err = caught(() => pool.allocate(64, "compute"));
  assert.ok(err, "no allocation may occur during flight");
  assert.match(err.code, /LSM-FLIGHT-LOCKED/);
});

test("flight passes are deterministic (constant result on pre-verified weights)", () => {
  const { verified } = preflight(makeTrits(TRITS));
  const acts = Int32Array.from({ length: TRITS }, (_, i) => ((i * 5) % 7) - 3);
  const bridge = new StubTernaryBridge(new AuditLogger(null)); // in-mem audit for the test
  const a = bridge.execute({ opClass: "feedforward", precision: "ternary", correlationId: "f1", weights: verified, activations: acts, count: TRITS, scale: 1, offset: 0 });
  const b = bridge.execute({ opClass: "feedforward", precision: "ternary", correlationId: "f2", weights: verified, activations: acts, count: TRITS, scale: 1, offset: 0 });
  assert.equal(a.value, b.value, "flight is deterministic — same weights → same result");
  assert.equal(a.deterministic, true);
});

test("batched-async durable audit: flight buffers, then flushes durably", () => {
  const dir = "build/audit-log/flight-test";
  const logger = new AuditLogger(dir, { batchSize: 64 });
  for (let i = 0; i < 10; i++) logger.append({ phase: "EXEC", correlationId: "ft" + i, artifactHash: "h", engineId: "e", severity: "INFO", category: "AUDIT_TRAIL", details: { i }, governancePass: true });
  assert.equal(logger.pendingCount(), 10, "events buffered, not yet flushed (no per-event jitter)");
  assert.equal(logger.query({ correlationId: "ft0" }).length, 1, "query still works from memory during flight");
  logger.flush();
  assert.equal(logger.pendingCount(), 0, "flush makes the batch durable");
});
