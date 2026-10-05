// Secret-material detection for audit artefacts (TODO pass, Grok 2026-10-05; owner may revisit).
// Audit logs store hashes, status flags, presence checks and capability names only.

const SECRET_PATTERNS: readonly RegExp[] = Object.freeze([
  /sk_(?:live|test)_[A-Za-z0-9]/,
  /\bBearer\s+[A-Za-z0-9._~+/-]{8,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
]);

const MAX_DEPTH = 16;

/** True when any string reachable in `value` (keys included) looks like secret material. Over-deep or cyclic input counts as unsafe. */
export function containsSecretMaterial(value: unknown, depth = 0, seen: WeakSet<object> = new WeakSet()): boolean {
  if (typeof value === "string") return SECRET_PATTERNS.some((p) => p.test(value));
  if (typeof value !== "object" || value === null) return false;
  if (depth >= MAX_DEPTH || seen.has(value)) return true;
  seen.add(value);
  const items: readonly unknown[] = Array.isArray(value) ? value : Object.entries(value).flat();
  return items.some((item) => containsSecretMaterial(item, depth + 1, seen));
}

export const AUDIT_REDACTED = "[REDACTED]";

/** Returns the string, or the redaction marker when it carries secret material. */
export function redactAuditText(text: string): string {
  return containsSecretMaterial(text) ? AUDIT_REDACTED : text;
}
