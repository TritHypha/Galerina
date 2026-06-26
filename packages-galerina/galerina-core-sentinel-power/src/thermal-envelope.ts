import { PowerFault } from "./errors.js";

/**
 * Coarse power/thermal state of the Tower's inference kernel.
 *
 * The states form a strictly-ordered ladder from coolest to hottest:
 *   NOMINAL < THROTTLED < SAFETY < TERMINAL.
 */
export type PowerState = "NOMINAL" | "THROTTLED" | "SAFETY" | "TERMINAL";

/**
 * Inference kernel tier, ordered by power draw (highest → lowest):
 *   native  — full-power host kernel, maximum draw / heat.
 *   simd    — vectorised mid-power kernel.
 *   shadow  — minimal-power deterministic fallback (the "cool" kernel).
 *
 * The governor may only ever *down-tier* (toward `shadow`) as temperature
 * rises — it never grants a hotter kernel than the current band permits.
 */
export type KernelTier = "native" | "simd" | "shadow";

/**
 * Thermal thresholds (degrees Celsius) defining the governor's envelope.
 *
 * Must satisfy `0 < throttleC < safeC < criticalC`.
 *   throttleC — first down-tier point (leave NOMINAL).
 *   safeC     — enter the SAFETY band (shadow kernel only).
 *   criticalC — kill-switch threshold (TERMINAL).
 */
export interface ThermalEnvelope {
  readonly throttleC: number;
  readonly safeC: number;
  readonly criticalC: number;
}

/**
 * Validate that an envelope is well-ordered and physically sane.
 *
 * @throws {PowerFault} `LSP-ENV-001` unless `0 < throttleC < safeC < criticalC`
 *   and all three are finite numbers.
 */
export function validateEnvelope(e: ThermalEnvelope): void {
  const ok =
    Number.isFinite(e.throttleC) &&
    Number.isFinite(e.safeC) &&
    Number.isFinite(e.criticalC) &&
    0 < e.throttleC &&
    e.throttleC < e.safeC &&
    e.safeC < e.criticalC;

  if (!ok) {
    throw new PowerFault(
      "LSP-ENV-001",
      `invalid thermal envelope: require 0 < throttleC < safeC < criticalC, got ` +
        `throttleC=${e.throttleC}, safeC=${e.safeC}, criticalC=${e.criticalC}`,
    );
  }
}

/**
 * A sensible default envelope tuned for aerospace-grade silicon, where the
 * governor must down-tier well before the hardware's own thermal throttle
 * engages so execution cadence stays predictable.
 */
export const AEROSPACE_ENVELOPE: ThermalEnvelope = {
  throttleC: 70,
  safeC: 85,
  criticalC: 95,
};
