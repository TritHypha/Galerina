// key-length.test.mjs — zero-trust default, owner may revisit: egress HMAC keys are at least 256 bits.
//
// isWeakKey only refused empty / all-zero keys, so a 1-byte or 16-byte key was a "real" key: accepted by
// the constructor, by strictKey, by adoptEpoch (EGR-EPOCH-003) and by verifyChainEpochAware. An HMAC key
// that short is brute-forceable, so the tamper-evident chain proves nothing. Same 256-bit floor as
// core-sentinel-state (LSS-KEY-001). Reuses EGR-KEY-001 / EGR-EPOCH-003.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditEgress, readEgressLedger } from "../dist/audit-egress.js";

const STRONG = new Uint8Array(32).fill(0x42);
const SHORT_KEYS = [["1-byte", Uint8Array.of(9)], ["16-byte", new Uint8Array(16).fill(9)], ["31-byte", new Uint8Array(31).fill(9)]];
const dirs = [];
const freshDir = () => { const d = mkdtempSync(join(tmpdir(), "galerina-egress-keylen-")); dirs.push(d); return d; };
after(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } } });

for (const [label, key] of SHORT_KEYS) {
  test(`constructor refuses a ${label} key with EGR-KEY-001 (strictKey off)`, () => {
    assert.throws(() => new AuditEgress({ dir: freshDir(), batchSize: 2, hmacKey: key }), (e) => e.code === "EGR-KEY-001");
  });
  test(`constructor refuses a ${label} key with EGR-KEY-001 (strictKey on)`, () => {
    assert.throws(() => new AuditEgress({ dir: freshDir(), batchSize: 2, hmacKey: key, strictKey: true }), (e) => e.code === "EGR-KEY-001");
  });
  test(`adoptEpoch refuses rotating to a ${label} key with EGR-EPOCH-003`, () => {
    const eg = new AuditEgress({ dir: freshDir(), batchSize: 4, hmacKey: STRONG, epochId: 1 });
    assert.throws(() => eg.adoptEpoch(2, key), (e) => e.code === "EGR-EPOCH-003");
    assert.equal(eg.epochId, 1);
  });
  test(`verifyChainEpochAware refuses an epoch that resolves to a ${label} key`, () => {
    const dir = freshDir();
    const eg = new AuditEgress({ dir, batchSize: 2, hmacKey: STRONG, epochId: 1 });
    eg.push("a"); eg.push("b"); eg.flush();
    const batches = readEgressLedger(dir);
    assert.equal(AuditEgress.verifyChainEpochAware(batches, () => STRONG), true);
    assert.equal(AuditEgress.verifyChainEpochAware(batches, () => key), false);
  });
  test(`legacy verifyChain refuses a ${label} verification key`, () => {
    assert.equal(AuditEgress.verifyChain([], key), false);
  });
}

test("control: a 32-byte non-zero key is accepted everywhere", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 2, hmacKey: STRONG, strictKey: true, epochId: 1 });
  eg.push("x"); eg.push("y");
  eg.adoptEpoch(2, new Uint8Array(32).fill(0x43));
  eg.push("z"); eg.flush();
  const batches = readEgressLedger(dir);
  assert.equal(AuditEgress.verifyChainEpochAware(batches, (id) => (id === 1 ? STRONG : new Uint8Array(32).fill(0x43))), true);
  assert.equal(AuditEgress.verifyChain([], STRONG), true);
});

test("a non-Uint8Array key is refused with EGR-KEY-001", () => {
  assert.throws(() => new AuditEgress({ dir: freshDir(), batchSize: 2, hmacKey: "0".repeat(64) }), (e) => e.code === "EGR-KEY-001");
});
