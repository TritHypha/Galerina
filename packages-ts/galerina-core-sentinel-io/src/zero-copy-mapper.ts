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

/** Local mapper lifecycle only; this is not a process-wide memory or erasure receipt. */
export type ZeroCopyMapperStatus = "EMPTY" | "ACTIVE" | "DISPOSED" | "CLEANUP_FAILED";

export class ZeroCopyMapper {
  readonly #shared: boolean;
  // Assigned during map(); exposed read-only via the `buffer` getter.
  #buffer: ArrayBufferLike;
  #status: ZeroCopyMapperStatus = "EMPTY";
  #generation = 0;

  constructor(opts?: { shared?: boolean }) {
    this.#shared = opts?.shared ?? false;
    // Start with an empty buffer of the configured kind; replaced on map().
    this.#buffer = this.#shared ? new SharedArrayBuffer(0) : new ArrayBuffer(0);
  }

  /** The single backing buffer staged by the most recent {@link map} call. */
  get buffer(): ArrayBufferLike {
    return this.#buffer;
  }

  /** Explicit local state; never treat DISPOSED as proof about escaped aliases or process memory. */
  get status(): ZeroCopyMapperStatus {
    return this.#status;
  }

  /**
   * Zero the mapper-owned current backing and invalidate its block handles.
   * A caller that already retained a mutable view or copied bytes remains outside
   * this object's control; this is not a secret-memory erasure guarantee.
   */
  dispose(): void {
    if (this.#status === "DISPOSED") return;

    try {
      new Uint8Array(this.#buffer).fill(0);
    } catch {
      this.#status = "CLEANUP_FAILED";
      this.#generation += 1;
      throw new SecurityTrap(
        "LSIO-MAP-004",
        "mapper backing cleanup failed; the backing remains retained and the mapper is unusable",
      );
    }

    this.#buffer = this.#shared ? new SharedArrayBuffer(0) : new ArrayBuffer(0);
    this.#status = "DISPOSED";
    this.#generation += 1;
  }

  #assertMappingLive(generation: number, backing: ArrayBufferLike): void {
    if (
      this.#status !== "ACTIVE"
      || this.#generation !== generation
      || this.#buffer !== backing
    ) {
      throw new SecurityTrap("LSIO-MAP-003", "mapped block lifetime expired");
    }
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
    if (this.#status === "DISPOSED") {
      throw new SecurityTrap("LSIO-MAP-003", "mapper has been disposed; create a new mapper");
    }
    if (this.#status === "CLEANUP_FAILED") {
      throw new SecurityTrap("LSIO-MAP-004", "mapper cleanup previously failed; mapping is refused");
    }
    if (source.length < manifest.totalBytes) {
      throw new SecurityTrap(
        "LSIO-MAP-001",
        `source length ${source.length} < manifest.totalBytes ${manifest.totalBytes}`,
      );
    }
    if (source.buffer instanceof SharedArrayBuffer) {
      throw new SecurityTrap(
        "LSIO-MAP-002",
        "source SharedArrayBuffer is refused — integrity cannot bind a concurrently mutable view",
      );
    }
    const ownedSource = new Uint8Array(source.byteLength);
    ownedSource.set(source);

    const mapped: MappedBlock[] = [];
    const nextGeneration = this.#generation + 1;
    const mapper = this;
    let backingBytes: Uint8Array | undefined;

    let published = false;
    try {
      const backing: ArrayBufferLike = this.#shared
        ? new SharedArrayBuffer(manifest.totalBytes)
        : new ArrayBuffer(manifest.totalBytes);
      backingBytes = new Uint8Array(backing);

      for (const block of manifest.blocks) {
        const start = block.offset;
        const end = block.offset + block.length;
        const slice = ownedSource.subarray(start, end);

        // INTEGRITY GATE — release nothing until this passes. The digest is over
        // the owned snapshot, which is also the bytes staged into the backing buffer.
        monitor.enforceBlock(slice, block.sha256, block.id);

        backingBytes.set(slice, block.offset);

        const offset = block.offset;
        const length = block.length;
        mapped.push({
          id: block.id,
          offset,
          length,
          // Zero-copy views over the shared backing buffer. No copy on access.
          view(): Uint8Array {
            mapper.#assertMappingLive(nextGeneration, backing);
            return new Uint8Array(backing, offset, length);
          },
          i32(): Int32Array {
            mapper.#assertMappingLive(nextGeneration, backing);
            // Number of complete Int32 elements that fit in this block.
            const count = Math.floor(length / 4);
            return new Int32Array(backing, offset, count);
          },
        });
      }

      // The private verification snapshot is temporary, on both success and
      // refusal. Only the integrity-checked backing buffer is published.
      ownedSource.fill(0);

      // A mapper exposes only its latest generation. Retire that owned backing
      // before replacing it; stale MappedBlock methods are invalidated below.
      if (this.#status === "ACTIVE") {
        try {
          new Uint8Array(this.#buffer).fill(0);
        } catch {
          this.#status = "CLEANUP_FAILED";
          this.#generation += 1;
          throw new SecurityTrap(
            "LSIO-MAP-004",
            "previous mapper backing cleanup failed; replacement mapping is refused",
          );
        }
      }

      this.#buffer = backing;
      this.#generation = nextGeneration;
      this.#status = "ACTIVE";
      published = true;
      return mapped;
    } finally {
      if (!published) {
        // A later block may refuse after earlier blocks were already staged.
        // Clear both private copies before propagating the failure.
        try {
          ownedSource.fill(0);
        } finally {
          backingBytes?.fill(0);
        }
      }
    }
  }
}
