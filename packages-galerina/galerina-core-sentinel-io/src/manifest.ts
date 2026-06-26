/**
 * The io-manifest schema + loader/validator.
 *
 * An {@link IoManifest} is the deterministic, signable description of a byte
 * source: a logical source name, a total byte count, and an ordered list of
 * contiguous {@link IoBlock}s, each carrying the hex digest of its own bytes.
 *
 * The manifest is the *governed contract* for an ingest: nothing is mapped or
 * released to a Tower citizen unless the bytes presented match the manifest the
 * citizen agreed to. {@link ManifestLoader} performs strict structural validation
 * so a malformed manifest can never reach the integrity / mapping stages.
 */

import { createHash } from "node:crypto";
import { SecurityTrap } from "./errors.js";

export interface IoBlock {
  readonly id: string;
  readonly offset: number;
  readonly length: number;
  readonly sha256: string; /* hex digest of the block bytes */
}

export interface IoManifest {
  readonly version: string;
  readonly source: string; /* logical source name */
  readonly totalBytes: number;
  readonly blocks: readonly IoBlock[];
}

const HEX_RE = /^[0-9a-f]+$/;

function isNonNegInt(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0;
}

function trap(message: string): never {
  throw new SecurityTrap("LSIO-MANIFEST-001", message);
}

export class ManifestLoader {
  /**
   * Parse a manifest from a JSON string. `JSON.parse` + full structural
   * validation. Throws {@link SecurityTrap} ("LSIO-MANIFEST-001") on any
   * malformed manifest.
   */
  static parse(json: string): IoManifest {
    let obj: unknown;
    try {
      obj = JSON.parse(json);
    } catch (e) {
      trap(`manifest is not valid JSON: ${(e as Error).message}`);
    }
    return ManifestLoader.fromObject(obj);
  }

  /**
   * Validate a manifest from an already-parsed object. Same rules as
   * {@link parse}. Every block is validated; blocks must be contiguous,
   * in-range, non-negative, and non-overlapping.
   */
  static fromObject(obj: unknown): IoManifest {
    if (obj === null || typeof obj !== "object") {
      trap("manifest must be an object");
    }
    const m = obj as Record<string, unknown>;

    if (typeof m["version"] !== "string" || m["version"].length === 0) {
      trap("manifest.version must be a non-empty string");
    }
    if (typeof m["source"] !== "string" || m["source"].length === 0) {
      trap("manifest.source must be a non-empty string");
    }
    if (!isNonNegInt(m["totalBytes"])) {
      trap("manifest.totalBytes must be a non-negative integer");
    }
    if (!Array.isArray(m["blocks"])) {
      trap("manifest.blocks must be an array");
    }

    const version = m["version"] as string;
    const source = m["source"] as string;
    const totalBytes = m["totalBytes"] as number;
    const rawBlocks = m["blocks"] as unknown[];

    const blocks: IoBlock[] = [];
    let prevEnd = 0;
    for (let i = 0; i < rawBlocks.length; i++) {
      const rb = rawBlocks[i];
      if (rb === null || typeof rb !== "object") {
        trap(`manifest.blocks[${i}] must be an object`);
      }
      const b = rb as Record<string, unknown>;

      if (typeof b["id"] !== "string" || b["id"].length === 0) {
        trap(`manifest.blocks[${i}].id must be a non-empty string`);
      }
      if (!isNonNegInt(b["offset"])) {
        trap(`manifest.blocks[${i}].offset must be a non-negative integer`);
      }
      if (!isNonNegInt(b["length"])) {
        trap(`manifest.blocks[${i}].length must be a non-negative integer`);
      }
      if (
        typeof b["sha256"] !== "string" ||
        b["sha256"].length === 0 ||
        !HEX_RE.test(b["sha256"])
      ) {
        trap(`manifest.blocks[${i}].sha256 must be a non-empty hex string`);
      }

      const id = b["id"] as string;
      const offset = b["offset"] as number;
      const length = b["length"] as number;
      const sha256 = b["sha256"] as string;

      if (offset + length > totalBytes) {
        trap(
          `manifest.blocks[${i}] (${id}) extends beyond totalBytes ` +
            `(${offset}+${length} > ${totalBytes})`,
        );
      }
      // Blocks are laid out contiguously and must not overlap. We require
      // ascending, non-overlapping ranges.
      if (offset < prevEnd) {
        trap(
          `manifest.blocks[${i}] (${id}) overlaps previous block ` +
            `(offset ${offset} < previous end ${prevEnd})`,
        );
      }
      prevEnd = offset + length;

      blocks.push({ id, offset, length, sha256 });
    }

    return { version, source, totalBytes, blocks };
  }
}

/**
 * Convenience builder. Lays the supplied blocks out contiguously (in argument
 * order), computes each block's SHA-256 hex digest via `node:crypto`, and fills
 * in offsets / lengths / totalBytes. Returns a manifest guaranteed to pass
 * {@link ManifestLoader.fromObject}.
 */
export function buildManifest(
  source: string,
  blocks: { id: string; bytes: Uint8Array }[],
): IoManifest {
  const ioBlocks: IoBlock[] = [];
  let offset = 0;
  for (const { id, bytes } of blocks) {
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    ioBlocks.push({ id, offset, length: bytes.length, sha256 });
    offset += bytes.length;
  }
  return {
    version: "1.1",
    source,
    totalBytes: offset,
    blocks: ioBlocks,
  };
}
