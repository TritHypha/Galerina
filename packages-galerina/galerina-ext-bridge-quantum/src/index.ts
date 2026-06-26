// @galerina/ext-bridge-quantum — governed out-of-process bridge for IBM ffsim.
// Phase 1: pure-TS governance core (contract + pre-spawn limit gate + env-detect +
// manifest + env-absent stub backend). Phase 2 adds the real hashed Python worker.
export * from "./quantum-contract.js";
export { binomial, subspaceDim, stateVectorBytes } from "./subspace.js";
export { checkJobLimits, type LimitVerdict } from "./limits.js";
export { detectFfsim, type FfsimEnv } from "./env-detect.js";
export { buildFfsimManifest, validateFfsimManifest, type FfsimManifestInputs } from "./manifest.js";
export { attestFfsimManifest, verifyFfsimAdmission } from "./attestation.js";
export { FfsimBackend } from "./ffsim-backend.js";

import { FfsimBackend } from "./ffsim-backend.js";
import type { QuantumSimBackend, QuantumBridgeRegistry } from "./quantum-contract.js";

/** The default backend — env-detected; `available:false` (honest stub) when python/ffsim absent. */
export function selectQuantumBackend(): QuantumSimBackend {
  return new FfsimBackend();
}

/** Registry keyed by backendId (mirrors createCppBridgeRegistry). */
export function createQuantumBridgeRegistry(): QuantumBridgeRegistry {
  const b = selectQuantumBackend();
  return new Map([[b.backendId, b]]) as QuantumBridgeRegistry;
}
