// rd0361-audit-egress.real-ts.mjs: RD-0361 S6b real-.ts adapters for the audit-egress frozen set.
// Drives the REAL shipped AuditEgress (constructor, adoptEpoch, verifyChain, verifyChainEpochAware) over
// REAL ledgers written to throwaway temp dirs and read back with readEgressLedger. A false flag is realised
// by tampering one field of the second batch (or verifying under a different / weak key). Tampering can
// also break the MAC, so the realisation is verdict-faithful (any false flag must DENY), not
// flag-isolating. HMAC keys are fixed non-secret test patterns. NON_AUTHORIZING.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditEgress, readEgressLedger } from "../../dist/index.js";

export const source = "packages-ts/galerina-core-sentinel-egress/src/audit-egress.ts";
const KEY = new Uint8Array(32).fill(0x5a);
const OTHER = new Uint8Array(32).fill(0x6b);
const WEAK = new Uint8Array(32);

function inTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "rd0361-egress-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
// Two real batches: plain (no epochs), or epoch-aware under epochs 2 then 3.
function realBatches(epochAware) {
  return inTempDir((dir) => {
    const e = new AuditEgress({ dir, batchSize: 1, hmacKey: KEY, ...(epochAware ? { epochId: 2 } : {}) });
    e.push("a");
    if (epochAware) e.adoptEpoch(3, OTHER);
    e.push("b");
    const batches = readEgressLedger(dir);
    if (batches.length !== 2) throw new Error(`expected 2 real batches, got ${batches.length}`);
    return batches;
  });
}
const refuses = (fn) => { try { fn(); return 1; } catch { return -1; } };

export const adapters = {
  chainLinkVerdict: {
    covers: () => true,
    run: (ph, sq, cn, mac) => {
      const [b0, b1] = realBatches(false);
      const t = { ...b1 };
      if (!ph) t.prevHash = "f".repeat(64);
      if (!sq) t.seq = 7;
      if (!cn) t.count = t.records.length + 1;
      return AuditEgress.verifyChain([b0, t], mac ? KEY : OTHER) ? 1 : -1;
    },
  },
  // baseLink is the chain-link trit; the real verifier is boolean, so only -1 / +1 are realisable.
  epochLinkVerdict: {
    covers: (ev, nd, ku, base) => base === -1 || base === 1,
    run: (ev, nd, ku, base) => {
      const [b0, b1] = realBatches(true);
      let t = { ...b1 };
      if (!nd) t.epochId = 1;
      if (!ev) { const { epochId: _dropped, ...rest } = t; t = rest; }
      if (base === -1) t.count = t.records.length + 1;
      const keyForEpoch = (ep) => (ep === 2 ? KEY : ku ? OTHER : WEAK);
      return AuditEgress.verifyChainEpochAware([b0, t], keyForEpoch) ? 1 : -1;
    },
  },
  epochAdoptVerdict: {
    covers: () => true,
    run: (gt, real) => inTempDir((dir) => {
      const e = new AuditEgress({ dir, batchSize: 1, hmacKey: KEY, epochId: 2 });
      return refuses(() => e.adoptEpoch(gt ? 3 : 2, real ? OTHER : WEAK));
    }),
  },
  configVerdict: {
    covers: () => true,
    run: (bs, sk, ep) => inTempDir((dir) => refuses(() => new AuditEgress({
      dir, batchSize: bs ? 1 : 0, hmacKey: sk ? KEY : WEAK, strictKey: true, epochId: ep ? 1 : 0,
    }))),
  },
};
export const uncovered = {};
export const gaps = ["epochLinkVerdict: baseLink = 0 has no counterpart (the real chain-link check is boolean)"];
