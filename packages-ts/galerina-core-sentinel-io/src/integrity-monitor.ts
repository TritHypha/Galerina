/**
 * Per-block integrity verification — the hardened border's gate.
 *
 * {@link IntegrityMonitor} computes a digest over a block's bytes and compares it
 * against the expected hex carried by the manifest. Two modes:
 *
 *  - plain SHA-256 (default), or
 *  - keyed HMAC-SHA256 when an `hmacKey` is supplied to the constructor.
 *
 * NOTE: when an `hmacKey` is configured, the manifest's per-block `sha256` field
 * is REINTERPRETED as the expected HMAC-SHA256 hex. The field name is kept
 * (`sha256`) for schema stability, but the *monitor's mode* decides which
 * algorithm is actually run. A manifest built for plain-SHA verification and a
 * manifest built for HMAC verification therefore carry different hex in the same
 * `sha256` slot; pairing a manifest with the wrong-mode monitor will (correctly)
 * fail integrity.
 */

import { createHash, createHmac } from "node:crypto";
import { HardenedBorderViolation } from "./errors.js";
import { SecurityTrap } from "./errors.js";

export interface IntegrityResult {
  readonly blockId: string;
  readonly ok: boolean;
  readonly expected: string;
  readonly actual: string;
}

export class IntegrityMonitor {
  readonly #hmacKey: Uint8Array | undefined;

  constructor(opts?: { hmacKey?: Uint8Array }) {
    // Store the mode. Presence of a key => keyed HMAC-SHA256; absence => SHA-256.
    // Zero-trust default (owner may revisit): a key an attacker can reproduce (empty / all-zero) is refused,
    // because a keyed gate under it lets a tampered block be re-MAC'd to pass.
    const key = opts?.hmacKey;
    if (key !== undefined && (!(key instanceof Uint8Array) || key.length === 0 || key.every((b) => b === 0))) {
      throw new SecurityTrap(
        "LSIO-KEY-001",
        "IntegrityMonitor hmacKey must be a non-empty, non-zero Uint8Array",
      );
    }
    this.#hmacKey = key;
  }

  /** True when this monitor verifies with keyed HMAC-SHA256. */
  get keyed(): boolean {
    return this.#hmacKey !== undefined;
  }

  /**
   * Hex digest using the configured mode: HMAC-SHA256 if a key was supplied,
   * else plain SHA-256. Uses `node:crypto`.
   */
  digest(bytes: Uint8Array): string {
    if (this.#hmacKey !== undefined) {
      return createHmac("sha256", this.#hmacKey).update(bytes).digest("hex");
    }
    return createHash("sha256").update(bytes).digest("hex");
  }

  /**
   * Compute the digest and compare against `expectedHex`. Returns the result;
   * does NOT throw on mismatch.
   */
  verifyBlock(
    bytes: Uint8Array,
    expectedHex: string,
    blockId: string,
  ): IntegrityResult {
    const actual = this.digest(bytes);
    return {
      blockId,
      ok: actual === expectedHex,
      expected: expectedHex,
      actual,
    };
  }

  /**
   * Verify and enforce: on mismatch throws {@link HardenedBorderViolation}
   * ("LSIO-INTEGRITY-001"). This is the gate to call before releasing a block.
   */
  enforceBlock(bytes: Uint8Array, expectedHex: string, blockId: string): void {
    const result = this.verifyBlock(bytes, expectedHex, blockId);
    if (!result.ok) {
      throw new HardenedBorderViolation(
        "LSIO-INTEGRITY-001",
        `block ${blockId}: integrity check failed`,
      );
    }
  }
}
