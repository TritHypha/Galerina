// Quantum target refusal (O1 post-v1 parked). Non-executing: no planner, estimator,
// or runtime. The token is refused wherever a target/capability/effect name is
// validated or a selector would otherwise pick it. Owner may revisit after v1.

import type { ComputeDiagnostic } from "../index.js";

/** Exact closed token. Not a RuntimeTarget / ComputeTarget. Never selected. */
export const QUANTUM_TARGET_TOKEN = "quantum";

export const COMPUTE_QUANTUM_TARGET_REFUSED = "Galerina_COMPUTE_QUANTUM_TARGET_REFUSED";

export const COMPUTE_QUANTUM_TARGET_REFUSED_MESSAGE =
  "Quantum is not an active v1 runtime target and is refused.";

export function isQuantumTargetToken(value: unknown): boolean {
  return value === QUANTUM_TARGET_TOKEN;
}

export function quantumTargetRefusalDiagnostic(path?: string): ComputeDiagnostic {
  return Object.freeze({
    code: COMPUTE_QUANTUM_TARGET_REFUSED,
    severity: "error" as const,
    message: COMPUTE_QUANTUM_TARGET_REFUSED_MESSAGE,
    ...(path === undefined ? {} : { path }),
  });
}
