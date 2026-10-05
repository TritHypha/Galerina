// FUNGI-COMPAT diagnostic registry (TODO pass, Grok 2026-10-05; owner may revisit).

export const FUNGI_COMPAT_FORBIDDEN_EFFECT = "FUNGI-COMPAT-001";
export const FUNGI_COMPAT_UNSUPPORTED_EFFECT = "FUNGI-COMPAT-002";
export const FUNGI_COMPAT_MISSING_CAPABILITY = "FUNGI-COMPAT-003";
export const FUNGI_COMPAT_MEMORY_LIMIT = "FUNGI-COMPAT-004";
export const FUNGI_COMPAT_SENSITIVE_DATA = "FUNGI-COMPAT-005";

export interface CompatDiagnosticEntry {
  readonly code: string;
  readonly kind: "blocker" | "blocker-or-warning";
  readonly meaning: string;
}

export const COMPAT_DIAGNOSTIC_REGISTRY: readonly CompatDiagnosticEntry[] = Object.freeze([
  Object.freeze({ code: FUNGI_COMPAT_FORBIDDEN_EFFECT, kind: "blocker" as const, meaning: "Workload effect is forbidden on the target (for example storage.read in browser WASM)." }),
  Object.freeze({ code: FUNGI_COMPAT_UNSUPPORTED_EFFECT, kind: "blocker" as const, meaning: "Workload effect is not in the target's supported allowlist; unknown effects fail closed." }),
  Object.freeze({ code: FUNGI_COMPAT_MISSING_CAPABILITY, kind: "blocker" as const, meaning: "Target requires a capability the workload did not declare." }),
  Object.freeze({ code: FUNGI_COMPAT_MEMORY_LIMIT, kind: "blocker-or-warning" as const, meaning: "Workload memory exceeds the target limit (blocker), or the target declares no limit so it cannot be verified (warning)." }),
  Object.freeze({ code: FUNGI_COMPAT_SENSITIVE_DATA, kind: "blocker" as const, meaning: "Sensitive data on a target that does not allow sensitive data." }),
]);
