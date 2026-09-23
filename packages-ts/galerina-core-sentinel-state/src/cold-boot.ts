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

import { HardenedBorderViolation } from "./errors.js";
import { StateSerializer, type Snapshot } from "./state-serializer.js";
import { AtomicWriter } from "./atomic-writer.js";

export const RESTORE_VERDICT_PACKAGE_IDENTITY = "@galerina/core-sentinel-state" as const;
export const RESTORE_VERDICT_EXPORT_NAME = "restoreVerdict" as const;
export const ROLLBACK_FLOOR_NAME = "rollback-floor" as const;

export interface RestoreVerdictAuthority {
  readonly packageIdentity: typeof RESTORE_VERDICT_PACKAGE_IDENTITY;
  readonly exportName: typeof RESTORE_VERDICT_EXPORT_NAME;
  restoreVerdict(snapshotPresent: boolean, integrityOk: boolean): unknown;
}

function authorityRefusal(reason: string): HardenedBorderViolation {
  return new HardenedBorderViolation(
    "LSS-RESTORE-AUTHORITY-001",
    `cold-boot restore authority refused: ${reason}`,
  );
}

export class ColdBootOrchestrator {
  readonly #serializer: StateSerializer;
  readonly #writer: AtomicWriter;
  readonly #restoreAuthority: RestoreVerdictAuthority;
  #minLogicalTick: number;

  constructor(
    serializer: StateSerializer,
    writer: AtomicWriter,
    restoreAuthority: RestoreVerdictAuthority,
    minLogicalTick = 0,
  ) {
    if (
      restoreAuthority === null
      || typeof restoreAuthority !== "object"
      || restoreAuthority.packageIdentity !== RESTORE_VERDICT_PACKAGE_IDENTITY
      || restoreAuthority.exportName !== RESTORE_VERDICT_EXPORT_NAME
      || typeof restoreAuthority.restoreVerdict !== "function"
    ) {
      throw authorityRefusal("missing or incorrectly identified decision port");
    }
    if (!Number.isSafeInteger(minLogicalTick) || minLogicalTick < 0) {
      throw authorityRefusal("rollback floor is not a non-negative safe integer");
    }
    this.#serializer = serializer;
    this.#writer = writer;
    this.#restoreAuthority = restoreAuthority;
    this.#minLogicalTick = minLogicalTick;
  }

  /** Serialise + durably persist a checkpoint; returns the snapshot written. */
  checkpoint(name: string, payload: unknown, logicalTick: number): Snapshot {
    if (name === ROLLBACK_FLOOR_NAME) {
      throw new HardenedBorderViolation(
        "LSS-ROLLBACK-001",
        `snapshot name "${ROLLBACK_FLOOR_NAME}" is reserved for the durable rollback floor`,
      );
    }
    if (!Number.isSafeInteger(logicalTick) || logicalTick < this.#minLogicalTick) {
      throw new HardenedBorderViolation(
        "LSS-ROLLBACK-001",
        `checkpoint logicalTick ${String(logicalTick)} is below the rollback floor ${String(this.#minLogicalTick)}`,
      );
    }
    this.#persistRollbackFloor(logicalTick);
    const snap = this.#serializer.serialize(payload, logicalTick);
    this.#writer.write(name, snap);
    this.#minLogicalTick = logicalTick;
    return snap;
  }

  /**
   * Restore a checkpoint on cold boot.
   * @throws HardenedBorderViolation if no snapshot exists (LSS-NOSNAP-001).
   * @throws SecurityTrap if the snapshot fails integrity (LSS-INTEGRITY-001).
   */
  restore(name: string): { payload: unknown; logicalTick: number } {
    if (name === ROLLBACK_FLOOR_NAME) {
      throw this.#rollbackRefuse(
        `snapshot name "${ROLLBACK_FLOOR_NAME}" is reserved for the durable rollback floor`,
      );
    }
    const snap = this.#writer.read(name);
    if (snap === null) {
      this.#requireRestoreVerdict(false, false);
      throw new HardenedBorderViolation(
        "LSS-NOSNAP-001",
        `cold-boot restore requires a snapshot "${name}", but none exists`,
      );
    }

    const integrityOk = this.#serializer.verify(snap);
    this.#requireRestoreVerdict(true, integrityOk);
    const floor = this.#durableRollbackFloor();
    if (!Number.isSafeInteger(snap.logicalTick) || snap.logicalTick < floor) {
      throw new HardenedBorderViolation(
        "LSS-ROLLBACK-001",
        `snapshot logicalTick ${String(snap.logicalTick)} is below the rollback floor ${String(floor)}`,
      );
    }
    if (!integrityOk) {
      // Keep StateSerializer as the single owner of the integrity trap. If a
      // future defect ever makes deserialize accept an input that verify
      // refused, the explicit refusal below still prevents restoration.
      this.#serializer.deserialize(snap);
      throw authorityRefusal("serializer contradicted its integrity verdict");
    }

    // Re-verification in deserialize is intentional: the authority decision
    // never replaces the serializer's own integrity gate.
    const payload = this.#serializer.deserialize(snap);
    return { payload, logicalTick: snap.logicalTick };
  }

  #rollbackRefuse(reason: string): HardenedBorderViolation {
    return new HardenedBorderViolation("LSS-ROLLBACK-001", reason);
  }

  #persistRollbackFloor(logicalTick: number): void {
    const next = Math.max(this.#minLogicalTick, logicalTick, this.#readPersistedFloor() ?? 0);
    this.#writer.write(
      ROLLBACK_FLOOR_NAME,
      this.#serializer.serialize({ minLogicalTick: next }, next),
    );
    this.#minLogicalTick = next;
  }

  #readPersistedFloor(): number | null {
    const floorSnap = this.#writer.read(ROLLBACK_FLOOR_NAME);
    if (floorSnap === null) return null;
    if (!this.#serializer.verify(floorSnap)) {
      this.#serializer.deserialize(floorSnap);
      throw this.#rollbackRefuse("durable rollback floor failed integrity verification");
    }
    if (!Number.isSafeInteger(floorSnap.logicalTick) || floorSnap.logicalTick < 0) {
      throw this.#rollbackRefuse("durable rollback floor tick is not a non-negative safe integer");
    }
    const payload = this.#serializer.deserialize(floorSnap);
    if (
      payload === null
      || typeof payload !== "object"
      || Array.isArray(payload)
      || !("minLogicalTick" in payload)
      || payload.minLogicalTick !== floorSnap.logicalTick
    ) {
      throw this.#rollbackRefuse("durable rollback floor payload does not bind its tick");
    }
    return floorSnap.logicalTick;
  }

  #durableRollbackFloor(): number {
    const persisted = this.#readPersistedFloor();
    if (persisted === null) {
      throw this.#rollbackRefuse("durable rollback floor is missing");
    }
    return Math.max(this.#minLogicalTick, persisted);
  }

  #requireRestoreVerdict(snapshotPresent: boolean, integrityOk: boolean): 1 | -1 {
    let verdict: unknown;
    try {
      verdict = this.#restoreAuthority.restoreVerdict(snapshotPresent, integrityOk);
    } catch {
      throw authorityRefusal("decision execution failed");
    }
    if (verdict !== 1 && verdict !== -1) {
      throw authorityRefusal("decision was not exact allow or refuse");
    }
    const expected = snapshotPresent && integrityOk ? 1 : -1;
    if (verdict !== expected) {
      throw authorityRefusal("decision disagreed with locally verified facts");
    }
    return verdict;
  }

  /** Hard-erase a checkpoint: zero-overwrite the admitted regular file, then unlink. No-op if absent. */
  scrub(name: string): void {
    this.#writer.scrub(name);
  }
}
