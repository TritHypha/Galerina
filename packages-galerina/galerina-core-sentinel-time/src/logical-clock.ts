// logical-clock.ts — the Tower's deterministic Logical Clock.
//
// Wall-clock time is non-deterministic: OS scheduling jitter, NTP steps, and
// RTC skew make a timestamp irreproducible across replays. The LogicalClock
// replaces it with a monotonic integer counter. Each scheduled execution unit
// / audit event advances the clock by exactly one tick, so an audit trail
// stamped with logical ticks replays identically regardless of host timing.

import { PrecisionFault } from "./errors.js";

/** Guard: `v` must be a finite, non-negative integer. */
function assertNonNegInt(v: number, code: string, label: string): void {
  if (!Number.isInteger(v) || v < 0) {
    throw new PrecisionFault(code, `${label} must be a non-negative integer, got ${v}`);
  }
}

/**
 * Deterministic monotonic counter. The single source of "now" for governed,
 * replayable timing. Never goes backwards except via an explicit `reset`.
 */
export class LogicalClock {
  #tick: number;
  #startTick: number;

  constructor(startTick = 0) {
    assertNonNegInt(startTick, "LST-INIT-001", "startTick");
    this.#startTick = startTick;
    this.#tick = startTick;
  }

  /** Increment by 1 and return the NEW tick. One call per execution unit / event. */
  tick(): number {
    this.#tick += 1;
    return this.#tick;
  }

  /** Current tick WITHOUT incrementing. */
  now(): number {
    return this.#tick;
  }

  /** Increment by `n` (non-negative integer) and return the new tick. */
  advance(n: number): number {
    assertNonNegInt(n, "LST-ADV-001", "advance amount");
    this.#tick += n;
    return this.#tick;
  }

  /** Reset the clock to `start` (non-negative integer). Re-anchors startTick. */
  reset(start = 0): void {
    assertNonNegInt(start, "LST-INIT-001", "startTick");
    this.#startTick = start;
    this.#tick = start;
  }

  /** The tick the clock was anchored at (construction or last reset). */
  get startTick(): number {
    return this.#startTick;
  }
}
