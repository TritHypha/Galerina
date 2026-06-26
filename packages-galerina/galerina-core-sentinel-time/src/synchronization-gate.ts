// synchronization-gate.ts — physical-time ↔ logical-tick boundary guard.
//
// At boot the gate records a single mapping between a host physical timestamp
// (ms) and the logical tick at that instant. Thereafter it can compute, for any
// later physical timestamp and a nominal tick rate, how many ticks SHOULD have
// elapsed, and compare that against how many actually elapsed on the clock. The
// difference is "drift". A clock that drifts beyond its StabilityEnvelope has
// lost determinism relative to the host and is failed deterministically.
//
// The host RTC / hardware-clock that supplies `physicalMs` is a host seam (see
// ARCHITECTURE_ISSUES.md); this gate only consumes the value it is handed.

import type { LogicalClock } from "./logical-clock.js";
import { PrecisionFault } from "./errors.js";

/** Tolerance: how far the clock may diverge from nominal before it is faulted. */
export interface StabilityEnvelope {
  maxDriftTicks: number;
}

/**
 * Maps physical time to logical ticks at boot, then guards drift against a
 * StabilityEnvelope. Stateless apart from the boot mapping recorded by
 * `syncToPhysical`.
 */
export class SynchronizationGate {
  readonly #clock: LogicalClock;
  readonly #envelope: StabilityEnvelope;
  #bootPhysicalMs: number | null = null;
  #bootTick = 0;

  constructor(clock: LogicalClock, envelope: StabilityEnvelope) {
    this.#clock = clock;
    this.#envelope = envelope;
  }

  /** Record the boot mapping: this physical instant corresponds to clock.now(). */
  syncToPhysical(physicalMs: number): void {
    this.#bootPhysicalMs = physicalMs;
    this.#bootTick = this.#clock.now();
  }

  /** Ticks expected since boot given a nominal rate, for a later physical time. */
  expectedTicks(physicalMs: number, ticksPerMs: number): number {
    if (this.#bootPhysicalMs === null) {
      throw new PrecisionFault(
        "LST-SYNC-001",
        "syncToPhysical must be called before expectedTicks",
      );
    }
    return (physicalMs - this.#bootPhysicalMs) * ticksPerMs;
  }

  /** Actual ticks elapsed minus expected ticks. Positive = clock ran fast. */
  driftTicks(physicalMs: number, ticksPerMs: number): number {
    const actual = this.#clock.now() - this.#bootTick;
    return actual - this.expectedTicks(physicalMs, ticksPerMs);
  }

  /** Fault deterministically if |drift| exceeds the envelope. Requires a prior sync. */
  enforceDrift(physicalMs: number, ticksPerMs: number): void {
    if (this.#bootPhysicalMs === null) {
      throw new PrecisionFault(
        "LST-SYNC-001",
        "syncToPhysical must be called before enforceDrift",
      );
    }
    const drift = this.driftTicks(physicalMs, ticksPerMs);
    if (Math.abs(drift) > this.#envelope.maxDriftTicks) {
      throw new PrecisionFault(
        "LST-DRIFT-001",
        `logical clock drift ${drift} ticks exceeds envelope ` +
          `${this.#envelope.maxDriftTicks}`,
      );
    }
  }
}
