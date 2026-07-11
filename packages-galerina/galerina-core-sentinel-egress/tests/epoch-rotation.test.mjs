/**
 * epoch-rotation.test.mjs — epoch-aware ledger verification (#28/D2 step 4).
 *
 * The write-side switch (adoptEpoch) + the read-side epoch-keyed verifier
 * (verifyChainEpochAware). Old epochs' batches verify forever; revoked/unknown
 * epochs are refused; the epoch is MAC-bound (relabelling fails); legacy
 * single-key behavior is untouched.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditEgress, readEgressLedger } from "../dist/index.js";

// Kernel-unique scratch dir per test (mkdtemp), removed on exit — matches the
// package's existing test idiom.
const dirs = [];
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), "galerina-egress-epoch-"));
  dirs.push(dir);
  return dir;
}
process.on("exit", () => {
  for (const d of dirs) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

const KEY_1 = new Uint8Array(32).fill(1);
const KEY_2 = new Uint8Array(32).fill(2);
const keyForEpoch = (id) => (id === 1 ? KEY_1 : id === 2 ? KEY_2 : null);

/** Build a two-epoch ledger: 2 batches under epoch 1, adoptEpoch(2), 2 more. */
function twoEpochLedger(dir) {
  const eg = new AuditEgress({ dir, batchSize: 2, hmacKey: KEY_1, epochId: 1, strictKey: true });
  eg.push("e1-a"); eg.push("e1-b");       // flush #0 (epoch 1)
  eg.push("e1-c"); eg.push("e1-d");       // flush #1 (epoch 1)
  eg.adoptEpoch(2, KEY_2);                // THE SWITCH (flushes staged first — nothing straddles)
  eg.push("e2-a"); eg.push("e2-b");       // flush #2 (epoch 2)
  eg.push("e2-c"); eg.push("e2-d");       // flush #3 (epoch 2)
  return readEgressLedger(dir);
}

describe("epoch-aware ledger — the switch and the epoch-keyed verify", () => {
  it("a rotated ledger verifies end-to-end with per-epoch keys; continuity spans the seam", () => {
    const batches = twoEpochLedger(scratch());
    assert.equal(batches.length, 4);
    assert.deepEqual(batches.map((b) => b.epochId), [1, 1, 2, 2]);
    // The first epoch-2 batch chains onto the last epoch-1 hash — no gap, no fork (ADR V3).
    assert.equal(batches[2].prevHash, batches[1].batchHash);
    assert.equal(AuditEgress.verifyChainEpochAware(batches, keyForEpoch), true);
  });

  it("old epochs verify FOREVER (epoch-1 prefix alone verifies under its retained key)", () => {
    const batches = twoEpochLedger(scratch());
    assert.equal(AuditEgress.verifyChainEpochAware(batches.slice(0, 2), keyForEpoch), true);
  });

  it("the single legacy key can no longer verify the whole rotated ledger (the keys really rotated)", () => {
    const batches = twoEpochLedger(scratch());
    assert.equal(AuditEgress.verifyChain(batches, KEY_1), false);
    assert.equal(AuditEgress.verifyChain(batches, KEY_2), false);
  });

  it("epoch relabelling is MAC-bound: rewriting a batch's epochId fails verification", () => {
    const batches = twoEpochLedger(scratch());
    const forged = batches.map((b, i) => (i === 0 ? { ...b, epochId: 2 } : b));
    assert.equal(AuditEgress.verifyChainEpochAware(forged, keyForEpoch), false);
  });

  it("unknown/revoked epoch (keyForEpoch → null) is REFUSED even if the MAC would be valid", () => {
    const batches = twoEpochLedger(scratch());
    const revokedEpoch1 = (id) => (id === 1 ? null : keyForEpoch(id));
    assert.equal(AuditEgress.verifyChainEpochAware(batches, revokedEpoch1), false);
  });

  it("a legacy (epoch-less) batch inside an epoch-aware ledger is a refusal, not a fallback", () => {
    const batches = twoEpochLedger(scratch());
    const stripped = batches.map((b, i) => {
      if (i !== 1) return b;
      const { epochId, ...rest } = b;
      return rest;
    });
    assert.equal(AuditEgress.verifyChainEpochAware(stripped, keyForEpoch), false);
  });

  it("epoch REGRESSION along the chain (2 then 1) is a rollback → false", () => {
    const batches = twoEpochLedger(scratch());
    const reversed = [batches[2], batches[3], batches[0], batches[1]]
      .map((b, i) => ({ ...b, seq: i })); // even with seq re-stamped, the epoch regression is refused
    assert.equal(AuditEgress.verifyChainEpochAware(reversed, keyForEpoch), false);
  });

  it("a crashing or weak-key lookup is a refusal (fail-closed seam)", () => {
    const batches = twoEpochLedger(scratch());
    assert.equal(AuditEgress.verifyChainEpochAware(batches, () => { throw new Error("custody down"); }), false);
    assert.equal(AuditEgress.verifyChainEpochAware(batches, () => new Uint8Array(32)), false);
  });
});

describe("adoptEpoch — the write-side switch is fail-closed and forward-only", () => {
  it("epoch must strictly increase: same/lower epoch throws", () => {
    const eg = new AuditEgress({ dir: scratch(), batchSize: 8, hmacKey: KEY_1, epochId: 3 });
    assert.throws(() => eg.adoptEpoch(3, KEY_2), /greater/i);
    assert.throws(() => eg.adoptEpoch(2, KEY_2), /greater/i);
  });
  it("rotating TO a weak key is denied regardless of strictKey", () => {
    const eg = new AuditEgress({ dir: scratch(), batchSize: 8, hmacKey: KEY_1, epochId: 1 });
    assert.throws(() => eg.adoptEpoch(2, new Uint8Array(32)), /non-zero/i);
  });
  it("adoptEpoch flushes staged records under the OLD key first (nothing straddles the seam)", () => {
    const dir = scratch();
    const eg = new AuditEgress({ dir, batchSize: 10, hmacKey: KEY_1, epochId: 1 });
    eg.push("staged-under-epoch-1"); // below batchSize — still staged
    eg.adoptEpoch(2, KEY_2);
    const batches = readEgressLedger(dir);
    assert.equal(batches.length, 1);
    assert.equal(batches[0].epochId, 1); // sealed under the old epoch, not the new
    assert.equal(AuditEgress.verifyChainEpochAware(batches, keyForEpoch), true);
  });
  it("constructor rejects a non-positive epochId", () => {
    assert.throws(() => new AuditEgress({ dir: scratch(), batchSize: 4, hmacKey: KEY_1, epochId: 0 }), /positive integer/i);
  });
});

describe("legacy behavior is untouched", () => {
  it("an epoch-less ledger still verifies with the classic single-key verifyChain", () => {
    const dir = scratch();
    const eg = new AuditEgress({ dir, batchSize: 2, hmacKey: KEY_1 });
    eg.push("a"); eg.push("b");
    eg.push("c"); eg.push("d");
    const batches = readEgressLedger(dir);
    assert.equal(batches.length, 2);
    assert.equal(batches[0].epochId, undefined);
    assert.equal(AuditEgress.verifyChain(batches, KEY_1), true);
  });
});
