/**
 * partial-return.ts — K3 ternary partial-return / `Masked` per-field response shaper.
 *
 * TritMesh R&D 2026-06-23 net-new mechanic #2 (R&D 0108). Shipped masking is BINARY-only:
 * the governance-verifier rejects a leak (redact/seal/remove-field) and `view(cap1|cap2)`
 * yields a whole masked pointer — there is no THREE-valued, per-field partial return that
 * DENIES one field while RETURNING the rest. This adds it: each field of a response record
 * is admitted by its OWN K3 verdict (`decideAtBoundary`, fail-closed); authorized fields
 * pass through unchanged, and DENY / INDETERMINATE fields become a typed `Masked` sentinel
 * carrying the verdict + SPORE-GOV-3VL-001 — keep-the-rest.
 *
 * Invariants (inherited verbatim from the K3 algebra in three-valued-governance.ts — NOT
 * re-proved here):
 *  - **Deny-by-default.** A field with NO verdict (`undefined`) or an EMPTY cap set folds to
 *    INDETERMINATE → withheld. A field is RETURNED iff its folded verdict is exactly ALLOW
 *    (`authorize` ⇔ +1). There is no path by which a non-allowed field leaks.
 *  - **Per-field vAnd fold.** Multiple actor caps on a field fold via `allOf` (Kleene ∧ = the
 *    most-cautious verdict wins); this can only LOWER a field, never lift it.
 *  - **Never silent.** An INDETERMINATE collapse carries SPORE-GOV-3VL-001 in the `Masked`
 *    sentinel and to the optional `onDiagnostic` sink. This shapes GOVERNANCE only — it never
 *    transforms a value or touches crypto; an admitted value is returned byte-identical.
 */

import {
  Verdict,
  allOf,
  decideAtBoundary,
  type GovernanceDiagnostic,
} from "./three-valued-governance.js";

/** The typed sentinel that replaces a field whose K3 verdict withheld it. Never carries a value. */
export interface Masked {
  readonly masked: true;
  /** The collapsed verdict that withheld the field: 0 (INDETERMINATE) or -1 (DENY). Never +1. */
  readonly verdict: Verdict;
  readonly reason: "denied" | "indeterminate";
  /** SPORE-GOV-3VL-001 IFF the field was withheld by an INDETERMINATE collapse; else null. */
  readonly diagnostic: GovernanceDiagnostic | null;
}

/** Type guard: is this a withheld-field sentinel (NOT real data)? Use before reading a shaped field. */
export function isMasked(v: unknown): v is Masked {
  return typeof v === "object" && v !== null && (v as { masked?: unknown }).masked === true;
}

/**
 * A per-field verdict source:
 *  - a single `Verdict`,
 *  - a list of actor caps to fold via `allOf` (the per-field vAnd fold; `[]` ⇒ INDETERMINATE), or
 *  - `undefined` ⇒ deny-by-default (INDETERMINATE).
 */
export type FieldVerdict = Verdict | readonly Verdict[] | undefined;

function foldField(fv: FieldVerdict): Verdict {
  if (fv === undefined) return Verdict.INDETERMINATE; // deny-by-default
  if (Array.isArray(fv)) return allOf(fv as readonly Verdict[]); // per-field vAnd fold ([] → INDETERMINATE)
  return fv as Verdict;
}

/**
 * Mask a single value by its verdict. Returns `null` when AUTHORIZED (caller keeps the value),
 * or a `Masked` sentinel when withheld. The optional sink receives SPORE-GOV-3VL-001 on an
 * INDETERMINATE collapse.
 */
export function maskByVerdict(
  fv: FieldVerdict,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): Masked | null {
  const decision = decideAtBoundary(foldField(fv), onDiagnostic);
  if (decision.authorized) return null;
  return {
    masked: true,
    verdict: decision.verdict,
    reason: decision.verdict === Verdict.DENY ? "denied" : "indeterminate",
    diagnostic: decision.diagnostic,
  };
}

/** The outcome of shaping a record into a K3 partial return. */
export interface PartialReturn<T> {
  /** The shaped record: authorized fields unchanged; withheld fields replaced by a `Masked` sentinel. */
  readonly shaped: { [K in keyof T]: T[K] | Masked };
  /** Names of the fields that were withheld. */
  readonly maskedFields: readonly string[];
  /** True IFF the record had ≥1 field and EVERY field was withheld (a fully-masked response). */
  readonly allMasked: boolean;
  /** SPORE-GOV-3VL-001 diagnostics — one per field withheld by an INDETERMINATE collapse. */
  readonly diagnostics: readonly { readonly field: string; readonly diagnostic: GovernanceDiagnostic }[];
}

/**
 * Shape a response record into a K3 partial return — fail-closed, keep-the-rest.
 *
 * For each own enumerable field, `verdictOf(field, value)` supplies its governance verdict (a
 * single `Verdict`, a list of actor caps folded via `allOf`, or `undefined` = deny-by-default).
 * The field is RETURNED iff its folded verdict is exactly ALLOW; otherwise it is replaced by a
 * typed `Masked` sentinel. Deny-by-default: any field `verdictOf` does not positively allow is
 * withheld. Crypto/values are untouched — admitted fields are returned byte-identical.
 */
export function partialReturn<T extends Record<string, unknown>>(
  record: T,
  verdictOf: (field: string, value: T[keyof T]) => FieldVerdict,
  onDiagnostic?: (field: string, d: GovernanceDiagnostic) => void,
): PartialReturn<T> {
  const shaped = {} as { [K in keyof T]: T[K] | Masked };
  const maskedFields: string[] = [];
  const diagnostics: { field: string; diagnostic: GovernanceDiagnostic }[] = [];

  const keys = Object.keys(record) as (keyof T & string)[];
  for (const key of keys) {
    const fv = verdictOf(key, record[key]);
    const mask = maskByVerdict(fv, (d) => {
      diagnostics.push({ field: key, diagnostic: d });
      if (onDiagnostic) onDiagnostic(key, d);
    });
    if (mask === null) {
      shaped[key] = record[key];
    } else {
      shaped[key] = mask;
      maskedFields.push(key);
    }
  }

  return {
    shaped,
    maskedFields,
    allMasked: keys.length > 0 && maskedFields.length === keys.length,
    diagnostics,
  };
}
