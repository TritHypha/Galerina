// FUNGI-COMPUTE-001..007 diagnostic codes (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit. Codes are planning/advisory under the
// v1 freeze: nothing here admits a live GPU backend.

export const FUNGI_COMPUTE_CODES = Object.freeze({
  /** GPU backend is not admitted for execution under the v1 freeze. */
  "FUNGI-COMPUTE-001": "GPU backend not admitted under v1 freeze",
  /** Workload failed structural validation before GPU planning. */
  "FUNGI-COMPUTE-002": "Workload invalid for GPU planning",
  /** Declared GPU requirements cannot be satisfied under the current freeze. */
  "FUNGI-COMPUTE-003": "GPU requirements unsatisfiable under v1 freeze",
  /** Sensitive data refused on a GPU planning path without attested isolation. */
  "FUNGI-COMPUTE-004": "Sensitive data refused on GPU planning path",
  /** Explicit CPU fallback required because GPU is not executable. */
  "FUNGI-COMPUTE-005": "CPU fallback required (GPU not executable)",
  /** Workload shape is below the advisory GPU-interest threshold. */
  "FUNGI-COMPUTE-006": "Workload below GPU advisory threshold",
  /** Precision is unknown or unsupported for GPU planning. */
  "FUNGI-COMPUTE-007": "Unsupported or unknown GPU precision",
} as const);

export type FungiComputeCode = keyof typeof FUNGI_COMPUTE_CODES;

export const FUNGI_COMPUTE_CODE_LIST = Object.freeze(
  Object.keys(FUNGI_COMPUTE_CODES) as FungiComputeCode[],
);

export function isFungiComputeCode(value: unknown): value is FungiComputeCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(FUNGI_COMPUTE_CODES, value);
}
