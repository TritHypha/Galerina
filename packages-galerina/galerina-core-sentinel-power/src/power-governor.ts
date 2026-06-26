import { PowerFault } from "./errors.js";
import {
  type KernelTier,
  type PowerState,
  type ThermalEnvelope,
  validateEnvelope,
} from "./thermal-envelope.js";

/**
 * The governor's verdict for the current temperature reading.
 */
export interface PowerDecision {
  readonly state: PowerState;
  readonly kernel: KernelTier;
  readonly tempC: number;
  readonly reason: string;
}

/**
 * Power draw ordering of kernels, hottest first. Lower index = more power /
 * heat. Used to decide whether a requested kernel is "cooler-or-equal" to the
 * one the current band permits (down-tiering is allowed, up-tiering is not).
 */
const KERNEL_POWER_ORDER: readonly KernelTier[] = ["native", "simd", "shadow"];

function powerRank(k: KernelTier): number {
  return KERNEL_POWER_ORDER.indexOf(k);
}

/**
 * Deterministic kernel permitted at each power state (the *maximum* power the
 * band allows; the governor may always run something cooler).
 */
function kernelForState(state: PowerState): KernelTier {
  switch (state) {
    case "NOMINAL":
      return "native";
    case "THROTTLED":
      return "simd";
    case "SAFETY":
      return "shadow";
    case "TERMINAL":
      return "shadow";
  }
}

/**
 * PowerGovernor — the Tower's Environmental Governor.
 *
 * A pure, deterministic state machine. Given a temperature (from an injected
 * sensor or a manual reading) it maps the value onto a {@link PowerState} and
 * the kernel tier that band permits, down-tiering the inference kernel BEFORE
 * the hardware's own thermal throttle would engage. Holding the band one step
 * ahead of the silicon keeps execution cadence predictable.
 */
export class PowerGovernor {
  private readonly envelope: ThermalEnvelope;
  private readonly sensor?: () => number;
  private lastReading = 0;

  constructor(envelope: ThermalEnvelope, opts?: { sensor?: () => number }) {
    validateEnvelope(envelope);
    this.envelope = envelope;
    // exactOptionalPropertyTypes: only assign when actually provided.
    if (opts && opts.sensor !== undefined) {
      this.sensor = opts.sensor;
    }
  }

  /** Set the latest temperature manually (for tests / no-sensor operation). */
  setReading(tempC: number): void {
    this.lastReading = tempC;
  }

  /** Current temperature: the injected sensor if present, else the last set reading. */
  read(): number {
    return this.sensor !== undefined ? this.sensor() : this.lastReading;
  }

  /** Map the current temperature onto its {@link PowerState}. */
  private stateFor(tempC: number): PowerState {
    const { throttleC, safeC, criticalC } = this.envelope;
    if (tempC >= criticalC) return "TERMINAL";
    if (tempC >= safeC) return "SAFETY";
    if (tempC >= throttleC) return "THROTTLED";
    return "NOMINAL";
  }

  /**
   * Deterministically evaluate the current reading into a full decision:
   *   tempC < throttleC          → NOMINAL   / native
   *   throttleC <= tempC < safeC → THROTTLED / simd
   *   safeC <= tempC < criticalC → SAFETY    / shadow
   *   tempC >= criticalC         → TERMINAL  / shadow (kill-switch warranted)
   */
  evaluate(): PowerDecision {
    const tempC = this.read();
    const state = this.stateFor(tempC);
    const kernel = kernelForState(state);

    let reason: string;
    switch (state) {
      case "NOMINAL":
        reason = `tempC=${tempC} below throttle ${this.envelope.throttleC}C: full-power native kernel`;
        break;
      case "THROTTLED":
        reason = `tempC=${tempC} in [${this.envelope.throttleC},${this.envelope.safeC})C: down-tiered to simd kernel`;
        break;
      case "SAFETY":
        reason = `tempC=${tempC} in [${this.envelope.safeC},${this.envelope.criticalC})C: safety band, shadow kernel only`;
        break;
      case "TERMINAL":
        reason = `tempC=${tempC} at/above critical ${this.envelope.criticalC}C: TERMINAL — kill-switch warranted`;
        break;
    }

    return { state, kernel, tempC, reason };
  }

  /**
   * Request to run a specific kernel tier. Granted only when the request is
   * cooler-or-equal to the kernel the current band permits — you may always
   * down-tier, but never request a higher-power kernel than the band allows.
   *
   * @example at SAFETY (88C): requestAdjustment("native") is denied with
   *   allowed="shadow"; requestAdjustment("shadow") is granted.
   */
  requestAdjustment(targetKernel: KernelTier): {
    granted: boolean;
    allowed: KernelTier;
    reason: string;
  } {
    const decision = this.evaluate();
    const permitted = decision.kernel; // max power this band allows

    // Granted iff the target draws no more power than the band permits
    // (i.e. target is at the same or a cooler rank).
    const granted = powerRank(targetKernel) >= powerRank(permitted);

    if (granted) {
      return {
        granted: true,
        allowed: targetKernel,
        reason: `granted: ${targetKernel} is permitted at ${decision.state} (band ceiling: ${permitted})`,
      };
    }

    return {
      granted: false,
      allowed: permitted,
      reason: `denied: ${targetKernel} exceeds the power ceiling at ${decision.state}; clamped to ${permitted}`,
    };
  }

  /**
   * Kill-switch assertion.
   *
   * @throws {PowerFault} `LSP-CRITICAL-001` when the current reading is at or
   *   above the critical threshold (TERMINAL). Does not throw otherwise.
   */
  assertWithinEnvelope(): void {
    const decision = this.evaluate();
    if (decision.state === "TERMINAL") {
      throw new PowerFault(
        "LSP-CRITICAL-001",
        `thermal kill-switch: ${decision.reason}`,
      );
    }
  }
}
