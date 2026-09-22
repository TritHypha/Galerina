// photonic-bridge-interface.ts — PBI seam for a future optical memory bus.
//
// The Sentinel Memory is designed to one day sit behind a Photonic RAM / optical
// memory bus. That host is not present in this build, so the abstract seam is
// defined here and only the LocalSramBus (in-WASM-linear-memory) implementation
// is provided. Any attempt to attach a real external photonic bus trips a
// HardenedBorderViolation — the border is sealed on purpose until the host
// function exists.

import { HardenedBorderViolation } from "./errors.js";
import { MemoryValidator } from "./memory-validator.js";
import type { StaticMemoryPool } from "./static-memory-pool.js";

export interface MemoryChannel {
  readonly id: number;
  read(offset: number, length: number): Int32Array;
  write(offset: number, data: Int32Array): void;
}

export abstract class PhotonicBridgeInterface {
  abstract attachExternalBus(busId: string): void;
  abstract channel(id: number): MemoryChannel;
  abstract validateBusIntegrity(): boolean;
}

/** The local 2KiB-strided in-memory bus over a StaticMemoryPool. */
const CHANNEL_STRIDE = 2048;

export class LocalSramBus extends PhotonicBridgeInterface {
  private readonly stride = CHANNEL_STRIDE;

  constructor(private readonly pool: StaticMemoryPool) {
    super();
  }

  attachExternalBus(busId: string): void {
    if (busId !== "local") {
      throw new HardenedBorderViolation(
        "LSM-PBI-001",
        "external photonic bus not attached in this build",
      );
    }
    // "local" is already attached — no-op.
  }

  channel(id: number): MemoryChannel {
    if (!Number.isSafeInteger(id) || id < 0) {
      throw new HardenedBorderViolation("LSM-PBI-002", "channel id must be a non-negative safe integer");
    }
    const maxInts = this.stride / 4;
    const base = id * this.stride;
    MemoryValidator.assertInBounds(base, this.stride, this.pool.capacityBytes);
    const pool = this.pool;
    const stride = this.stride;
    return {
      id,
      read(offset: number, length: number): Int32Array {
        if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length < 0) {
          throw new HardenedBorderViolation("LSM-PBI-003", "channel offset/length must be non-negative safe integers");
        }
        if (offset > maxInts || length > maxInts - offset) {
          throw new HardenedBorderViolation("LSM-PBI-003", "channel access exceeds stride");
        }
        const byteOffset = base + offset * 4;
        MemoryValidator.assertInBounds(byteOffset, length * 4, base + stride);
        const src = new Int32Array(pool.buffer, byteOffset, length);
        return src.slice(); // detached copy: reads do not alias the buffer
      },
      write(offset: number, data: Int32Array): void {
        if (!Number.isSafeInteger(offset) || offset < 0 || !(data instanceof Int32Array)) {
          throw new HardenedBorderViolation("LSM-PBI-003", "channel write requires a non-negative offset and Int32Array");
        }
        if (offset > maxInts || data.length > maxInts - offset) {
          throw new HardenedBorderViolation("LSM-PBI-003", "channel access exceeds stride");
        }
        const byteOffset = base + offset * 4;
        MemoryValidator.assertInBounds(byteOffset, data.length * 4, base + stride);
        const dst = new Int32Array(pool.buffer, byteOffset, data.length);
        dst.set(data);
      },
    };
  }

  validateBusIntegrity(): boolean {
    // Local linear memory is always coherent.
    return true;
  }
}
