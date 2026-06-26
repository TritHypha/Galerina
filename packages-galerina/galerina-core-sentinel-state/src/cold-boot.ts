// cold-boot.ts — the checkpoint/restore lifecycle orchestrator.
//
// Ties the cryptographic core (StateSerializer) to durable storage
// (AtomicWriter) into the three operations a cold-boot recovery needs:
//
//   checkpoint — capture governed state at a logical tick, durably + atomically.
//   restore    — reconstruct state on boot; fail closed if absent (border
//                violation) or tampered (security trap).
//   scrub      — hard-erase a checkpoint (zero-overwrite then unlink) so a
//                decommissioned snapshot leaves no recoverable residue.

import { writeFileSync, statSync, rmSync } from "node:fs";
import { HardenedBorderViolation } from "./errors.js";
import { StateSerializer, type Snapshot } from "./state-serializer.js";
import { AtomicWriter } from "./atomic-writer.js";

export class ColdBootOrchestrator {
  readonly #serializer: StateSerializer;
  readonly #writer: AtomicWriter;

  constructor(serializer: StateSerializer, writer: AtomicWriter) {
    this.#serializer = serializer;
    this.#writer = writer;
  }

  /** Serialise + durably persist a checkpoint; returns the snapshot written. */
  checkpoint(name: string, payload: unknown, logicalTick: number): Snapshot {
    const snap = this.#serializer.serialize(payload, logicalTick);
    this.#writer.write(name, snap);
    return snap;
  }

  /**
   * Restore a checkpoint on cold boot.
   * @throws HardenedBorderViolation if no snapshot exists (LSS-NOSNAP-001).
   * @throws SecurityTrap if the snapshot fails integrity (LSS-INTEGRITY-001).
   */
  restore(name: string): { payload: unknown; logicalTick: number } {
    const snap = this.#writer.read(name);
    if (snap === null) {
      throw new HardenedBorderViolation(
        "LSS-NOSNAP-001",
        `cold-boot restore requires a snapshot "${name}", but none exists`,
      );
    }
    const payload = this.#serializer.deserialize(snap); // throws SecurityTrap on tamper
    return { payload, logicalTick: snap.logicalTick };
  }

  /** Hard-erase a checkpoint: zero-overwrite the bytes, then unlink. No-op if absent. */
  scrub(name: string): void {
    // The AtomicWriter owns the on-disk layout; ask it for the live path.
    const live = this.#writer.livePath(name);
    let size: number;
    try {
      size = statSync(live).size;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return; // nothing to scrub
      throw err;
    }
    writeFileSync(live, Buffer.alloc(size, 0)); // overwrite contents with zeros
    rmSync(live, { force: true }); // then unlink
  }
}
