// state-serializer.ts — the cryptographic core of LSS.
//
// A Snapshot is a self-describing, self-verifying record of governed state at a
// single logical tick. Two independent integrity layers guard it:
//
//   xorChecksum — a cheap 32-bit XOR-fold of the payload bytes. Catches bit-rot
//                 / truncation fast, before the (more expensive) MAC.
//   hmac        — HMAC-SHA256 over the canonical header+payload string. This is
//                 the authenticity gate: only a holder of the GovernanceKey can
//                 produce a valid MAC, so a tampered or forged snapshot fails.
//
// Verification is timing-safe (crypto.timingSafeEqual) to avoid leaking how much
// of a forged MAC matched.

import { createHmac, timingSafeEqual } from "node:crypto";
import { SecurityTrap } from "./errors.js";

/** A self-verifying, point-in-time record of governed state. */
export interface Snapshot {
  readonly version: string;
  readonly logicalTick: number;
  readonly payloadJson: string;
  readonly xorChecksum: number;
  readonly hmac: string;
}

const SNAPSHOT_VERSION = "1.5";

/**
 * A fixed all-zero development key. Using this in production is a security
 * defect: any party can forge snapshots. The integrating session MUST inject a
 * real rotating GovernanceKey via { hmacKey } (see ARCHITECTURE_ISSUES.md).
 */
const DEV_ZERO_KEY = new Uint8Array(32);

/** XOR-fold UTF-8 bytes of a string into an unsigned 32-bit integer. */
function xorFold32(bytes: Uint8Array): number {
  let acc = 0;
  for (let i = 0; i < bytes.length; i++) {
    // Rotate the byte into one of four lanes so position matters, then XOR.
    const lane = (i & 3) << 3;
    acc ^= bytes[i]! << lane;
  }
  return acc >>> 0;
}

/** True if a key is missing or all bytes are zero (the non-secret dev key). */
function isWeakKey(key: Uint8Array | undefined): boolean {
  if (!key || key.length === 0) return true;
  for (const b of key) if (b !== 0) return false;
  return true;
}

export class StateSerializer {
  readonly #hmacKey: Uint8Array;

  constructor(opts?: { hmacKey?: Uint8Array; strictKey?: boolean }) {
    // Certified/P9 strictness: fail closed on the all-zero development key.
    if (opts?.strictKey && isWeakKey(opts?.hmacKey)) {
      throw new SecurityTrap(
        "LSS-KEY-001",
        "StateSerializer strictKey: a real (non-zero) GovernanceKey is required — the all-zero development key is a certification blocker",
      );
    }
    // exactOptionalPropertyTypes: read defensively, never assign undefined.
    this.#hmacKey = opts?.hmacKey ?? DEV_ZERO_KEY;
  }

  /** Canonical MAC pre-image: header fields then raw payload, pipe-delimited. */
  #macInput(version: string, logicalTick: number, xorChecksum: number, payloadJson: string): string {
    return `${version}|${logicalTick}|${xorChecksum}|${payloadJson}`;
  }

  #computeHmac(version: string, logicalTick: number, xorChecksum: number, payloadJson: string): string {
    return createHmac("sha256", this.#hmacKey)
      .update(this.#macInput(version, logicalTick, xorChecksum, payloadJson), "utf8")
      .digest("hex");
  }

  /** Serialise a governed payload into a signed, checksummed Snapshot. */
  serialize(payload: unknown, logicalTick: number): Snapshot {
    const payloadJson = JSON.stringify(payload);
    const xorChecksum = xorFold32(Buffer.from(payloadJson, "utf8"));
    const hmac = this.#computeHmac(SNAPSHOT_VERSION, logicalTick, xorChecksum, payloadJson);
    return { version: SNAPSHOT_VERSION, logicalTick, payloadJson, xorChecksum, hmac };
  }

  /** True iff BOTH the checksum and the HMAC recompute to the recorded values. */
  verify(snap: Snapshot): boolean {
    const expectedChecksum = xorFold32(Buffer.from(snap.payloadJson, "utf8"));
    if (expectedChecksum !== snap.xorChecksum) return false;

    const expectedHmac = this.#computeHmac(
      snap.version,
      snap.logicalTick,
      snap.xorChecksum,
      snap.payloadJson,
    );
    const a = Buffer.from(expectedHmac, "hex");
    const b = Buffer.from(snap.hmac, "hex");
    // timingSafeEqual requires equal length; unequal length is already a mismatch.
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  /** Verify-then-parse. Throws SecurityTrap on any integrity failure. */
  deserialize(snap: Snapshot): unknown {
    if (!this.verify(snap)) {
      throw new SecurityTrap(
        "LSS-INTEGRITY-001",
        "snapshot integrity check failed — checksum or HMAC mismatch (tamper, corruption, or wrong GovernanceKey)",
      );
    }
    return JSON.parse(snap.payloadJson);
  }
}
