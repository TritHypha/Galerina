// dev-key-mode.test.mjs — zero-trust default, owner may revisit: the named all-zero development key is
// refused unless the writer is EXPLICITLY in development mode (`developmentKey: true`).
//
// Before this fix any AuditEgress without strictKey accepted `new Uint8Array(32)`, so a production writer
// that forgot strictKey sealed its audit chain under a public key anyone can recompute. The narrowest
// fail-closed change: the writer refuses the dev key by default (EGR-KEY-001, reused); `developmentKey: true`
// is the explicit opt-in, admits ONLY the exact named 32-byte zero key, and strictKey still wins.
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditEgress, readEgressLedger } from "../dist/audit-egress.js";

const DEV_KEY = new Uint8Array(32);
const dirs = [];
const freshDir = () => { const d = mkdtempSync(join(tmpdir(), "galerina-egress-devkey-")); dirs.push(d); return d; };
after(() => { for (const d of dirs) { try { rmSync(d, { recursive: true, force: true }); } catch { /* best-effort */ } } });

test("the named zero key is refused by default (no development mode declared)", () => {
  assert.throws(() => new AuditEgress({ dir: freshDir(), batchSize: 2, hmacKey: DEV_KEY }), (e) => e.code === "EGR-KEY-001");
});

test("developmentKey: false is not development mode", () => {
  assert.throws(() => new AuditEgress({ dir: freshDir(), batchSize: 2, hmacKey: DEV_KEY, developmentKey: false }), (e) => e.code === "EGR-KEY-001");
});

test("a truthy non-boolean developmentKey is not development mode", () => {
  assert.throws(() => new AuditEgress({ dir: freshDir(), batchSize: 2, hmacKey: DEV_KEY, developmentKey: "yes" }), (e) => e.code === "EGR-KEY-001");
});

test("explicit developmentKey: true admits the named zero key and its chain verifies", () => {
  const dir = freshDir();
  const eg = new AuditEgress({ dir, batchSize: 2, hmacKey: DEV_KEY, developmentKey: true });
  eg.push("d-0"); eg.push("d-1"); eg.flush();
  assert.equal(AuditEgress.verifyChain(readEgressLedger(dir), DEV_KEY), true);
});

test("strictKey wins over developmentKey", () => {
  assert.throws(() => new AuditEgress({ dir: freshDir(), batchSize: 2, hmacKey: DEV_KEY, developmentKey: true, strictKey: true }), (e) => e.code === "EGR-KEY-001");
});

test("development mode admits only the exact named key, not an empty or other all-zero key", () => {
  for (const k of [new Uint8Array(0), new Uint8Array(16), new Uint8Array(64)]) {
    assert.throws(() => new AuditEgress({ dir: freshDir(), batchSize: 2, hmacKey: k, developmentKey: true }), (e) => e.code === "EGR-KEY-001");
  }
});

test("control: a real key needs no development flag", () => {
  assert.doesNotThrow(() => new AuditEgress({ dir: freshDir(), batchSize: 2, hmacKey: new Uint8Array(32).fill(1) }));
});
