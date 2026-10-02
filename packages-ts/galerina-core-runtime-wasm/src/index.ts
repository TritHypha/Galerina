// @galerina/core-runtime-wasm — border-safe WASM trust-computing base (RD-0361 R4 / #143).
// See README for the dependency-direction rule (compiler → here, never here → compiler).

// The record-layout ABI (shared with the WAT emitter).
export { WAT_HEAP_BASE, WAT_REC_FIELD_SIZE } from "./record-abi.js";

// The WASM TCB: attestation-verify-then-instantiate with a closed host import set + host record-marshalling.
// This is the mechanism the kernel/DSS reach WITHOUT importing the compiler; core-runtime's
// createGovernedRuntimeExecutor injects these (never imports them).
export {
  wasmHash, generateRunnerKeypair, signWasm, verifyWasm,
  createHostRuntime, compareUtf16CodeUnits, admitAndInstantiate,
  MAX_WASM_ARRAYS, MAX_WASM_ARRAY_ITEMS, MAX_WASM_STRINGS, MAX_WASM_STRING_CHARS, MAX_WASM_HOST_RECORDS,
  MAX_RECORD_COPY_DEPTH, MAX_RECORD_COPY_NODES,
  finalizeSecretExportResult, invokeAdmittedExport,
} from "./wasm-runtime.js";
export type {
  AdmissionPolicy, RunnerProfile, WasmAttestation, AdmissionVerdict,
  Observer, HostRuntime, AdmissionResult, RecordCopyField,
} from "./wasm-runtime.js";

// The injectable seam adapters — what core-runtime's createGovernedRuntimeExecutor INJECTS (never imports) to
// reach authoritative twin execution across the Hardened Border (RD-0361 R4 / #143; R&D ruling 2026-07-18).
export {
  hashArtifact, serializeAttestation, parseAttestation,
  createWasmAdmissionVerifier, createLowLevelWasmExecutor, createBorderSafeRuntimeDeps,
} from "./seam-adapters.js";

// R6 (rounding audit): the ONE canonical exact Decimal/Money core, shared by the interpreter, stdlib and host.
export {
  DEC_TRAP_KINDS, MONEY_TRAP_KINDS, MAX_DECIMAL_SCALE, MAX_DECIMAL_DIGITS, ROUND_MODES, HOST_MONEY_MINOR_UNITS,
  isRoundMode, isDecTrap, isExactTrapLabel, parseDec, isCanonicalDecimal, formatDec, checkRoundMode,
  decAdd, decSub, decMul, decNeg, decAbs, decCompare, decDiv, decRem, decQuantize, decRescaleExact,
  decScale, decFromInt, decIsZero, admitMoneyAmount,
} from "./decimal-core.js";
export type { DecTrapKind, MoneyTrapKind, DecResult, DecCompare, RoundMode, Dec, DecParse, MoneyAmount } from "./decimal-core.js";
