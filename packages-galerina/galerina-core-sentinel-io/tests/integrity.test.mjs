import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  IntegrityMonitor,
  HardenedBorderViolation,
} from "../dist/index.js";

const enc = (s) => new TextEncoder().encode(s);

test("digest is stable for the same bytes (plain SHA-256)", () => {
  const mon = new IntegrityMonitor();
  const bytes = enc("deterministic");
  const d1 = mon.digest(bytes);
  const d2 = mon.digest(bytes);
  assert.equal(d1, d2);
  // Matches node:crypto SHA-256.
  assert.equal(d1, createHash("sha256").update(bytes).digest("hex"));
});

test("verifyBlock ok=true for matching hash, ok=false for tampered", () => {
  const mon = new IntegrityMonitor();
  const bytes = enc("payload");
  const good = mon.digest(bytes);

  const okRes = mon.verifyBlock(bytes, good, "blk");
  assert.equal(okRes.ok, true);
  assert.equal(okRes.blockId, "blk");
  assert.equal(okRes.expected, good);
  assert.equal(okRes.actual, good);

  const tampered = enc("payloaX");
  const badRes = mon.verifyBlock(tampered, good, "blk");
  assert.equal(badRes.ok, false);
  assert.notEqual(badRes.actual, badRes.expected);
});

test("enforceBlock throws HardenedBorderViolation on mismatch", () => {
  const mon = new IntegrityMonitor();
  const bytes = enc("payload");
  const good = mon.digest(bytes);
  // Matching: no throw.
  mon.enforceBlock(bytes, good, "blk");
  // Mismatch: throws with the integrity code.
  assert.throws(
    () => mon.enforceBlock(enc("other"), good, "blk"),
    (e) =>
      e instanceof HardenedBorderViolation && e.code === "LSIO-INTEGRITY-001",
  );
});

test("with an hmacKey, digest differs from plain SHA-256 (keyed)", () => {
  const bytes = enc("same-bytes");
  const plain = new IntegrityMonitor();
  const keyed = new IntegrityMonitor({ hmacKey: enc("super-secret-key") });

  const plainDigest = plain.digest(bytes);
  const keyedDigest = keyed.digest(bytes);

  assert.equal(plain.keyed, false);
  assert.equal(keyed.keyed, true);
  assert.notEqual(plainDigest, keyedDigest);

  // Keyed digest verifies against itself.
  assert.equal(keyed.verifyBlock(bytes, keyedDigest, "k").ok, true);
  // Plain hash does NOT satisfy the keyed monitor.
  assert.equal(keyed.verifyBlock(bytes, plainDigest, "k").ok, false);
});
