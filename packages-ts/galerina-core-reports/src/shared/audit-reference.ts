// RuntimeAuditReference (TODO pass, Grok 2026-10-05; owner may revisit).

export type RuntimeAuditReferenceType = "proof" | "denial" | "evidence" | "manifest" | "policy";

export const RUNTIME_AUDIT_REFERENCE_TYPES: readonly RuntimeAuditReferenceType[] = Object.freeze(["proof", "denial", "evidence", "manifest", "policy"] as const);

export interface RuntimeAuditReference {
  readonly type: RuntimeAuditReferenceType;
  readonly id: string;
}

export function isRuntimeAuditReference(value: unknown): value is RuntimeAuditReference {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  return Object.keys(r).length === 2 && typeof r.type === "string" && (RUNTIME_AUDIT_REFERENCE_TYPES as readonly string[]).includes(r.type) && isAuditId(r.id);
}

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** Ids: 1..128 chars of [A-Za-z0-9._:-], starting alphanumeric. */
export function isAuditId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

/** ISO-8601 UTC timestamps only ("...Z"), and they must parse. */
export function isAuditTimestamp(value: unknown): value is string {
  return typeof value === "string" && ISO_UTC.test(value) && Number.isFinite(Date.parse(value));
}
