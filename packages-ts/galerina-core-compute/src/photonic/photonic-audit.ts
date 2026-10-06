// Photonic planning audit vocabulary (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit. Closed category tokens for future
// compute audit event shapes — no event schema inventing and no I/O.

/** Closed photonic planning audit category tokens. */
export const PHOTONIC_AUDIT_CATEGORIES = Object.freeze([
  "optical_plan",
  "optical_fallback",
  "optical_need",
  "optical_transport_refused",
] as const);

export type PhotonicAuditCategory = (typeof PHOTONIC_AUDIT_CATEGORIES)[number];

export function isPhotonicAuditCategory(value: unknown): value is PhotonicAuditCategory {
  return typeof value === "string" && (PHOTONIC_AUDIT_CATEGORIES as readonly string[]).includes(value);
}