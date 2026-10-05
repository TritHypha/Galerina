// RuntimeAuditStatus (TODO pass, Grok 2026-10-05; owner may revisit).

/** v0.2 canonical form. */
export type RuntimeAuditStatus = "allowed" | "denied" | "warning" | "error" | "executed" | "verified";

export const RUNTIME_AUDIT_STATUSES: readonly RuntimeAuditStatus[] = Object.freeze(["allowed", "denied", "warning", "error", "executed", "verified"] as const);

/**
 * v0.1 form. It stays ACTIVE until the owner reconciles the two vocabularies
 * (devtools-project-graph `reporting/event-dag.ts` still emits it). Nothing here maps
 * v0.1 to v0.2 implicitly.
 */
export type RuntimeAuditStatusV01 = "started" | "running" | "completed" | "denied" | "failed" | "fallback" | "deferred";

export const RUNTIME_AUDIT_STATUSES_V01: readonly RuntimeAuditStatusV01[] = Object.freeze(["started", "running", "completed", "denied", "failed", "fallback", "deferred"] as const);
