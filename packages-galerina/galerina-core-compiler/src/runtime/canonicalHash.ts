// =============================================================================
// Galerina Phase 16A — Canonical Hashing Module
//
// Provides deterministic, stable hashing of compiler artifacts:
//   - canonicalHash(obj)     — SHA-256 of sorted, normalized JSON
//   - stripNonDeterministic  — remove timestamp-like fields
//   - hashSource             — hash raw source text
//   - hashGIR                — hash a GIR object (strips generatedAt)
//   - hashPassivePlan        — hash a PassiveExecutionPlan (strips generatedAt)
//
// Design rules:
//   1. Object keys are sorted recursively (stable key order)
//   2. Numbers are normalized: Infinity and NaN become null
//   3. ISO 8601 timestamp strings are replaced with "TIMESTAMP"
//   4. Primitive arrays are sorted; structured arrays (e.g. AST children) are NOT
//   5. All output is prefixed "sha256:"
// =============================================================================

import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** SHA-256 a UTF-8 string and return the hex digest (no prefix). */
function sha256hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * ISO 8601 date/timestamp pattern.
 * Matches strings like: "2024-01-01T00:00:00.000Z", "2024-01-01"
 */
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

/**
 * Returns true when a string looks like an ISO date or datetime.
 */
function isTimestampString(s: string): boolean {
  return ISO_DATE_RE.test(s);
}

/**
 * Recursively serialize obj to a canonical JSON value — this is not the full
 * JSON string yet, just the value-level normalised representation used by
 * JSON.stringify. We return a "JSON-safe" unknown (no undefined, no function,
 * no Infinity, no NaN, no circular refs assumed).
 *
 * Rules:
 *   - Objects → keys sorted, values recursed
 *   - Arrays  → elements recursed; if ALL elements are primitives (string/number)
 *               the array is ALSO sorted for stability. Structured arrays (mixed
 *               or object elements) are kept in original order (AST children etc.)
 *   - Strings → ISO timestamps replaced with "TIMESTAMP"
 *   - Numbers → Infinity / NaN → null
 *   - null / boolean → as-is
 */
function toCanonical(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    // #55 / SPORE-FLOAT-NAN-001: a non-finite number (NaN / ±Inf) MUST NOT be laundered to null and signed —
    // that collapses NaN, +Inf, -Inf and null to ONE indistinguishable fingerprint (a hash collision) and
    // signs a wrong-but-plausible value into the proof-graph / CFG. Fail CLOSED, matching manifest-generator
    // (RFC 8785). A non-finite reaching the canonical hasher is itself a red flag — Galerina floats can no
    // longer be non-finite (mkFloat traps), so this only fires on a TS-layer leak.
    if (!isFinite(value)) {
      throw new Error("RFC 8785: non-finite numbers not allowed in a canonical hash (NaN/±Inf — SPORE-FLOAT-NAN-001)");
    }
    return value;
  }

  if (typeof value === "string") {
    return isTimestampString(value) ? "TIMESTAMP" : value;
  }

  if (Array.isArray(value)) {
    const canonical = value.map(toCanonical);

    // Sort only when all elements are primitives (string/number)
    const allPrimitive = canonical.every(
      (el) => typeof el === "string" || typeof el === "number" || el === null,
    );
    if (allPrimitive) {
      return [...canonical].sort((a, b) => {
        const sa = String(a ?? "null");
        const sb = String(b ?? "null");
        return sa < sb ? -1 : sa > sb ? 1 : 0;
      });
    }

    return canonical;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      sorted[key] = toCanonical(obj[key]);
    }
    return sorted;
  }

  // functions, symbols, bigint → null
  return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compute a deterministic SHA-256 hash of any value.
 *
 * Serialization rules:
 *   - Object keys sorted recursively
 *   - Numbers: Infinity / NaN → null
 *   - Strings: ISO timestamps → "TIMESTAMP"
 *   - Primitive arrays: sorted for stability
 *   - Structured arrays (contain objects): kept in original order
 *
 * Returns "sha256:" + hexdigest.
 */
export function canonicalHash(obj: unknown): string {
  const canonical = toCanonical(obj);
  const json = JSON.stringify(canonical);
  return "sha256:" + sha256hex(json);
}

/** Keys that are considered non-deterministic timestamp fields. */
const TIMESTAMP_KEYS = new Set([
  "timestamp",
  "generatedAt",
  "createdAt",
  "updatedAt",
  "date",
]);

/**
 * Recursively strip timestamp-like keys from an object tree.
 *
 * For each key in TIMESTAMP_KEYS found in any object, the value is replaced
 * with "REDACTED_TIMESTAMP". Arrays are recursed element-by-element.
 */
export function stripNonDeterministic(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(stripNonDeterministic);
  }

  const out: Record<string, unknown> = {};
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (TIMESTAMP_KEYS.has(key)) {
      out[key] = "REDACTED_TIMESTAMP";
    } else {
      out[key] = stripNonDeterministic(record[key]);
    }
  }
  return out;
}

/**
 * Hash raw source text without any normalization.
 * Uses plain SHA-256 — no key sorting, no timestamp stripping.
 * Returns "sha256:" + hexdigest.
 */
export function hashSource(sourceText: string): string {
  return "sha256:" + sha256hex(sourceText);
}

/**
 * Hash a GIR object.
 *
 * Strips the "generatedAt" field (if present) before hashing so that
 * two GIR objects produced at different times from the same source are equal.
 */
export function hashGIR(gir: object): string {
  const stripped = stripNonDeterministic(gir);
  return canonicalHash(stripped);
}

/**
 * Hash a PassiveExecutionPlan.
 *
 * Strips "generatedAt" (non-deterministic). The "planHash" field is already
 * a hash of the plan content — it is included as-is so the outer hash covers
 * the inner hash, giving a stable two-level commitment.
 *
 * Returns "sha256:" + hexdigest.
 */
export function hashPassivePlan(plan: object): string {
  const stripped = stripNonDeterministic(plan);
  return canonicalHash(stripped);
}
