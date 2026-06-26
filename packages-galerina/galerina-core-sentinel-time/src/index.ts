// index.ts — public surface of Galerina Sentinel Time (LST).
//
// Citizen Protocol v1.3. Pure TypeScript, no dependencies. The Tower's "Logical
// Clock": a deterministic monotonic counter that replaces wall-clock time so
// audit trails and governance are replayable regardless of OS jitter. The host
// RTC drift source is a documented host seam — see ARCHITECTURE_ISSUES.md.

export { PrecisionFault } from "./errors.js";
export { LogicalClock } from "./logical-clock.js";
export {
  SynchronizationGate,
  type StabilityEnvelope,
} from "./synchronization-gate.js";
