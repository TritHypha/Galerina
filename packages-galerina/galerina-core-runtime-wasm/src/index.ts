// @galerina/core-runtime-wasm — border-safe WASM trust-computing base (RD-0361 R4 / #143).
// See README for the dependency-direction rule (compiler → here, never here → compiler).

// The record-layout ABI (shared with the WAT emitter).
export { WAT_HEAP_BASE, WAT_REC_FIELD_SIZE } from "./record-abi.js";

// The WASM TCB: attestation-verify-then-instantiate with a closed host import set + host record-marshalling.
// This is the mechanism the kernel/DSS reach WITHOUT importing the compiler; core-runtime's
// createGovernedRuntimeExecutor injects these (never imports them).
export {
  wasmHash, generateRunnerKeypair, signWasm, verifyWasm,
  createHostRuntime, admitAndInstantiate,
} from "./wasm-runtime.js";
export type {
  AdmissionPolicy, RunnerProfile, WasmAttestation, AdmissionVerdict,
  Observer, HostRuntime, AdmissionResult,
} from "./wasm-runtime.js";

// The injectable seam adapters — what core-runtime's createGovernedRuntimeExecutor INJECTS (never imports) to
// reach authoritative twin execution across the Hardened Border (RD-0361 R4 / #143; R&D ruling 2026-07-18).
export {
  hashArtifact, serializeAttestation, parseAttestation,
  createWasmAdmissionVerifier, createLowLevelWasmExecutor, createBorderSafeRuntimeDeps,
} from "./seam-adapters.js";
