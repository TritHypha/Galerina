// segmentation-controller.ts — Compute/Governance isolation guard.
//
// The Governed Tower keeps untrusted Compute state physically separate from the
// Governance state that authorizes it. This controller is the cross-segment
// guard: a Compute operation that tries to read or write a Governance pointer
// (or vice versa) trips LSM-SEGV-001 BEFORE the access happens. It is a thin,
// auditable wrapper over the pool's region map.

import { SecurityTrap } from "./errors.js";
import type { Block, Segment, StaticMemoryPool } from "./static-memory-pool.js";

export class SegmentationController {
  constructor(private readonly pool: StaticMemoryPool) {}

  computeAlloc(bytes: number): Block {
    return this.pool.allocate(bytes, "compute");
  }

  governanceAlloc(bytes: number): Block {
    return this.pool.allocate(bytes, "governance");
  }

  /** Trap if `ptr` does not belong to the `intended` segment. */
  assertAccess(ptr: number, intended: Segment): void {
    const actual = this.pool.segmentOf(ptr);
    if (actual !== intended) {
      const direction =
        intended === "governance"
          ? "compute op attempted to access governance segment"
          : "governance op attempted to access compute segment";
      throw new SecurityTrap("LSM-SEGV-001", direction);
    }
  }
}
