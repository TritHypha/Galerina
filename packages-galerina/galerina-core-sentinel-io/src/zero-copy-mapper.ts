/**
 * Zero-copy mapper — stages verified manifest blocks into ONE backing buffer.
 *
 * "Zero-copy" here is a guarantee about ACCESS, not about staging:
 *
 *  - At {@link ZeroCopyMapper.map} time the bytes for each block are copied ONCE
 *    from the (untrusted) `source` into a single backing buffer of exactly
 *    `manifest.totalBytes`, but only AFTER the block passes the integrity gate
 *    (`monitor.enforceBlock`). Staging-after-verification is what makes the
 *    border "hardened": tampered bytes never reach the backing buffer.
 *
 *  - After that, every access is zero-copy: `view()` and `i32()` return typed-
 *    array *views* over the shared backing buffer. They allocate no new bytes and
 *    never re-copy. Repeated calls return views over the SAME underlying buffer
 *    (`view().buffer === mapper.buffer`), so downstream consumers (and a future
 *    WASM linear-memory host) can read in place.
 *
 * The backing buffer is a `SharedArrayBuffer` when `{ shared: true }` is passed
 * (WASM-linear-memory-compatible / cross-thread), else a plain `ArrayBuffer`.
 */

import type { IoManifest } from "./manifest.js";
import type { IntegrityMonitor } from "./integrity-monitor.js";
import { SecurityTrap } from "./errors.js";

export interface MappedBlock {
  readonly id: string;
  readonly offset: number;
  readonly length: number;
  view(): Uint8Array;
  i32(): Int32Array;
}

export class ZeroCopyMapper {
  readonly #shared: boolean;
  // Assigned during map(); exposed read-only via the `buffer` getter.
  #buffer: ArrayBufferLike;

  constructor(opts?: { shared?: boolean }) {
    this.#shared = opts?.shared ?? false;
    // Start with an empty buffer of the configured kind; replaced on map().
    this.#buffer = this.#shared ? new SharedArrayBuffer(0) : new ArrayBuffer(0);
  }

  /** The single backing buffer staged by the most recent {@link map} call. */
  get buffer(): ArrayBufferLike {
    return this.#buffer;
  }

  /**
   * Allocate one backing buffer of `manifest.totalBytes`, then for each block:
   * slice the bytes from `source` at [offset, offset+length), run the integrity
   * gate BEFORE release, copy the bytes into the backing buffer ONCE at offset,
   * and produce a {@link MappedBlock} whose `view()` / `i32()` are zero-copy
   * views over the backing buffer.
   *
   * Throws {@link SecurityTrap} ("LSIO-MAP-001") if `source` is shorter than
   * `manifest.totalBytes`. Throws {@link HardenedBorderViolation} (via the
   * monitor) if any block fails integrity — in which case nothing is released.
   */
  map(
    manifest: IoManifest,
    source: Uint8Array,
    monitor: IntegrityMonitor,
  ): MappedBlock[] {
    if (source.length < manifest.totalBytes) {
      throw new SecurityTrap(
        "LSIO-MAP-001",
        `source length ${source.length} < manifest.totalBytes ${manifest.totalBytes}`,
      );
    }

    const backing: ArrayBufferLike = this.#shared
      ? new SharedArrayBuffer(manifest.totalBytes)
      : new ArrayBuffer(manifest.totalBytes);
    const backingBytes = new Uint8Array(backing);

    const mapped: MappedBlock[] = [];

    for (const block of manifest.blocks) {
      const start = block.offset;
      const end = block.offset + block.length;
      // subarray = zero-copy view into the source for the integrity check.
      const slice = source.subarray(start, end);

      // INTEGRITY GATE — release nothing until this passes. The manifest's
      // `sha256` field is the expected digest in whatever mode the monitor runs.
      monitor.enforceBlock(slice, block.sha256, block.id);

      // Stage ONCE into the backing buffer after the gate passes.
      backingBytes.set(slice, block.offset);

      const offset = block.offset;
      const length = block.length;
      mapped.push({
        id: block.id,
        offset,
        length,
        // Zero-copy views over the shared backing buffer. No copy on access.
        view(): Uint8Array {
          return new Uint8Array(backing, offset, length);
        },
        i32(): Int32Array {
          // Number of complete Int32 elements that fit in this block.
          const count = Math.floor(length / 4);
          return new Int32Array(backing, offset, count);
        },
      });
    }

    this.#buffer = backing;
    return mapped;
  }
}
