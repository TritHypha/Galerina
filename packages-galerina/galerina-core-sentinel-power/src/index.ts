/**
 * @galerina/core-sentinel-power (LSP) — the Tower's Environmental Governor.
 *
 * A deterministic thermal/power policy engine that down-tiers the inference
 * kernel BEFORE the hardware throttles, keeping execution cadence predictable.
 * Pure TypeScript, zero dependencies. Citizen Protocol v1.4.
 */
export { PowerFault } from "./errors.js";
export {
  type PowerState,
  type KernelTier,
  type ThermalEnvelope,
  validateEnvelope,
  AEROSPACE_ENVELOPE,
} from "./thermal-envelope.js";
export { type PowerDecision, PowerGovernor } from "./power-governor.js";
