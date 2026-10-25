/**
 * three-valued-governance.ts — proved fail-closed governance verdicts (Direction A)
 *
 * K3-UNKNOWN-NOT-ZERO (Phillip 2026-10-25 13:15 GMT): trit 0 is NEVER "unknown". A governance verdict is
 * a balanced trit PLUS a distinct typed UNKNOWN sentinel:
 *   +1 = ALLOW        (proof discharged, posture positive — may authorize)
 *    0 = NEUTRAL      (a COMPUTED neutral trit, e.g. K3 AND of ALLOW and NEUTRAL; denies at the boundary)
 *   -1 = DENY         (definite refusal)
 *   K3_UNKNOWN        (undecided: empty fold, consensus split, malformed evidence, garbage confidence).
 *                     A frozen non-number object, never ==/=== any trit, never minted from a number.
 *
 * Calculus: K3 over the trits (reusing tpl-simulator's minTrit/maxTrit/negTrit gates, unaltered), with
 * UNKNOWN INFECTIOUS (weak Kleene): any UNKNOWN operand of vAnd / vOr / vNot yields UNKNOWN, so an
 * undecided clause can never be absorbed by an OR into ALLOW. Rejected: strong Kleene
 * vOr(UNKNOWN, ALLOW) = ALLOW; encoding UNKNOWN as 0, NaN, null or a 4th number (mintable by arithmetic).
 * Every operand is matched explicitly; anything that is neither a trit nor THE sentinel is a hard refusal.
 *
 * Collapse ONLY at the trust boundary:
 *   collapse(+1) = allow ; collapse(0) = deny ; collapse(-1) = deny ; collapse(UNKNOWN) = deny
 *   authorize(v) ⇔ v === +1
 * UNKNOWN (or any non-verdict) collapsed to deny emits FUNGI-GOV-3VL-001 — never silent. NEUTRAL and DENY
 * deny without the 3VL diagnostic (0 is a computed trit, not an undecided one). No new code is minted.
 *
 * See ../ZTF-Knowledge-Bases/galerina-three-valued-governance.md for the spec.
 */

import { minTrit, maxTrit, negTrit } from "./trit-gates.js";

// ── The typed UNKNOWN sentinel ───────────────────────────────────────────────

/** The type of the one UNKNOWN sentinel. Identity is the only valid test (`v === K3_UNKNOWN`). */
export interface K3Unknown {
  readonly kind: "K3_UNKNOWN";
}

/**
 * THE UNKNOWN verdict. Frozen, non-numeric (Number(K3_UNKNOWN) is NaN, never a trit), and compared by
 * identity only: a JSON round-trip, a spread copy or any structurally equal object is NOT the sentinel and
 * is refused by every operation below.
 */
export const K3_UNKNOWN: K3Unknown = Object.freeze({
  kind: "K3_UNKNOWN" as const,
  toString(): string { return "K3_UNKNOWN"; },
});

/** True only for the one real sentinel (identity). */
export function isK3Unknown(v: unknown): v is K3Unknown {
  return v === K3_UNKNOWN;
}

// ── The verdict ──────────────────────────────────────────────────────────────

/** A computed balanced trit. */
export type Trit = -1 | 0 | 1;

/** A governance verdict: a computed trit, or the typed UNKNOWN sentinel. */
export type Verdict = Trit | K3Unknown;

/**
 * Named verdict states. `INDETERMINATE` is kept as a deprecated NAME for UNKNOWN (the sentinel, not 0) so
 * existing "could not decide / abstain" call sites keep their fail-closed, audited meaning; new code uses
 * `UNKNOWN`. A computed 0 is `NEUTRAL`.
 */
export const Verdict = Object.freeze({
  DENY: -1 as const,
  NEUTRAL: 0 as const,
  ALLOW: 1 as const,
  UNKNOWN: K3_UNKNOWN,
  /** @deprecated use Verdict.UNKNOWN; this is the K3_UNKNOWN sentinel, never the trit 0. */
  INDETERMINATE: K3_UNKNOWN,
});

// ── The blessed trit mint — "parse, don't cast" (S0 cast-hygiene, RD 2026-07-18) ──

/**
 * The ONE sanctioned number→trit transition. It VALIDATES, it does not assert: a value outside {-1, 0, 1}
 * (including the UNKNOWN sentinel and any forged copy of it) is a fail-closed hard error. asVerdict(0) is
 * NEUTRAL, never UNKNOWN: UNKNOWN is never minted from a number.
 */
export function asVerdict(t: number): Trit {
  if (t === -1 || t === 0 || t === 1) return t;
  throw new Error(`asVerdict: ${describe(t)} is not a governance verdict trit (expected -1, 0, or 1) — fail-closed`);
}

function describe(v: unknown): string {
  try { return typeof v === "string" ? JSON.stringify(v) : String(v); } catch { return typeof v; }
}

/** Explicit operand match: UNKNOWN sentinel | trit | _ => hard refusal (fail-closed). */
function operand(v: unknown, where: string): Verdict {
  if (v === K3_UNKNOWN) return K3_UNKNOWN;
  if (v === -1 || v === 0 || v === 1) return v;
  throw new Error(`${where}: ${describe(v)} is neither a trit nor the K3_UNKNOWN sentinel — fail-closed`);
}

// ── K3 calculus with infectious UNKNOWN ──────────────────────────────────────

/** K3 ∧ on trits (more-cautious wins); any UNKNOWN operand → UNKNOWN; junk → hard refusal. */
export function vAnd(a: Verdict, b: Verdict): Verdict {
  const x = operand(a, "vAnd");
  const y = operand(b, "vAnd");
  if (x === K3_UNKNOWN || y === K3_UNKNOWN) return K3_UNKNOWN;
  return asVerdict(minTrit(x, y));
}

/** K3 ∨ on trits (more-permissive wins); any UNKNOWN operand → UNKNOWN (never ALLOW); junk → refusal. */
export function vOr(a: Verdict, b: Verdict): Verdict {
  const x = operand(a, "vOr");
  const y = operand(b, "vOr");
  if (x === K3_UNKNOWN || y === K3_UNKNOWN) return K3_UNKNOWN;
  return asVerdict(maxTrit(x, y));
}

/** K3 ¬: ALLOW ↔ DENY, NEUTRAL ↦ NEUTRAL, UNKNOWN ↦ UNKNOWN; junk → refusal. */
export function vNot(a: Verdict): Verdict {
  const x = operand(a, "vNot");
  if (x === K3_UNKNOWN) return K3_UNKNOWN;
  return asVerdict(negTrit(x));
}

// ── Composition (deny-by-default empty handling) ──────────────────────────────

/**
 * Conjunctive composition. An empty clause set is UNKNOWN (no clause decided anything), never the
 * vacuous-truth ALLOW and never the trit 0. Non-empty sets reduce without a seed.
 */
export function allOf(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.length === 0) return K3_UNKNOWN;
  return verdicts.reduce((acc, v) => vAnd(acc, v));
}

/** Disjunctive composition. Empty → UNKNOWN, mirroring allOf. */
export function anyOf(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.length === 0) return K3_UNKNOWN;
  return verdicts.reduce((acc, v) => vOr(acc, v));
}

// ── The collapse rule + authorization (the trust boundary) ────────────────────

/** Collapse to a binary decision: only ALLOW allows; NEUTRAL, DENY, UNKNOWN and junk deny. */
export function collapse(v: Verdict): "allow" | "deny" {
  return v === Verdict.ALLOW ? "allow" : "deny";
}

/** Fail-closed soundness: a verdict authorizes IFF it is exactly ALLOW (+1). */
export function authorize(v: Verdict): boolean {
  return v === Verdict.ALLOW;
}

// ── Audited boundary decision — FUNGI-GOV-3VL-001 ───────────────────────────────

/** The diagnostic code for an UNKNOWN verdict collapsed to deny at a boundary. */
export const GOV_3VL_DIAGNOSTIC = "FUNGI-GOV-3VL-001" as const;

/** Structured diagnostic record (shape compatible with the LogicDiagnostic family). */
export interface GovernanceDiagnostic {
  readonly code: typeof GOV_3VL_DIAGNOSTIC;
  readonly name: "INDETERMINATE_COLLAPSED_TO_DENY";
  readonly severity: "warning";
  readonly message: string;
}

/** Closed tagged diagnostic: NONE or PRESENT. Never null/undefined. */
export type BoundaryDiagnostic =
  | { readonly kind: "NONE" }
  | ({ readonly kind: "PRESENT" } & GovernanceDiagnostic);

/** Result of resolving a verdict at the trust boundary. */
export interface BoundaryDecision {
  readonly verdict: Verdict;
  readonly decision: "allow" | "deny";
  readonly authorized: boolean;
  /** PRESENT IFF an UNKNOWN (or non-verdict) value was collapsed to deny (FUNGI-GOV-3VL-001). */
  readonly diagnostic: BoundaryDiagnostic;
}

function unknownDiagnostic(): GovernanceDiagnostic {
  return {
    code: GOV_3VL_DIAGNOSTIC,
    name: "INDETERMINATE_COLLAPSED_TO_DENY",
    severity: "warning",
    message: "UNKNOWN governance verdict reached a trust boundary → collapsed to deny",
  };
}

/**
 * Resolve a verdict at the trust boundary, fail-closed and audited.
 *  - ALLOW (+1)          → authorized, "allow", no diagnostic.
 *  - DENY (-1)           → "deny", no diagnostic (ordinary policy denial).
 *  - NEUTRAL (0)         → "deny", no diagnostic (a computed trit, not undecided).
 *  - UNKNOWN / _ (junk)  → "deny", FUNGI-GOV-3VL-001 (never silent).
 */
export function decideAtBoundary(
  v: Verdict,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): BoundaryDecision {
  const isTrit = v === -1 || v === 0 || v === 1;
  const diagnostic: BoundaryDiagnostic = isTrit
    ? { kind: "NONE" }
    : { kind: "PRESENT", ...unknownDiagnostic() };
  if (diagnostic.kind === "PRESENT" && onDiagnostic) {
    onDiagnostic({
      code: diagnostic.code,
      name: diagnostic.name,
      severity: diagnostic.severity,
      message: diagnostic.message,
    });
  }
  return {
    verdict: v,
    decision: collapse(v),
    authorized: authorize(v),
    diagnostic,
  };
}
// ── Tensorized No-Coercion (notes/62 net-new, owner-approved 2026-06-25) ──────
//
// vAndTensor is a deny-by-default ARITY wrapper over the proven scalar vAnd: it folds an untrusted
// operand tensor into a core verdict tensor element-wise, so an untrusted/substrate signal can only
// ever LOWER each verdict, never lift it (No-Coercion holds per index: min(t*, r) ≤ t*). It is a
// VERDICT-SHAPER ONLY — it shapes a verdict tensor and stores no value; it is NOT a query/RBAC/SQL
// engine (per the R&D guardrail). O(N), not O(1): the cost is one minTrit per element.

/**
 * Element-wise Kleene ∧ over two trit tensors: `out[k] = vAnd(vCore[k], tSub[k])`.
 *
 * Fail-closed by construction:
 *  - a length mismatch is a HARD error (never a silent pad/truncate — that would invent or drop
 *    verdicts at the tail);
 *  - every element is validated as a balanced trit {-1,0,+1} (a non-trit is a hard error, never
 *    coerced) — so a garbage operand cannot smuggle a value through.
 * No-Coercion: the untrusted `tSub` operand can only lower `vCore` toward DENY, never manufacture
 * an ALLOW the core did not already hold.
 */
export function vAndTensor(vCore: Int8Array, tSub: Int8Array): Int8Array {
  if (vCore.length !== tSub.length) {
    throw new Error(
      `vAndTensor: length mismatch (${vCore.length} vs ${tSub.length}) — fail-closed, no pad/truncate`,
    );
  }
  const out = new Int8Array(vCore.length);
  for (let k = 0; k < vCore.length; k++) {
    const a = vCore[k]!;
    const b = tSub[k]!;
    if ((a !== -1 && a !== 0 && a !== 1) || (b !== -1 && b !== 0 && b !== 1)) {
      throw new Error(`vAndTensor: non-trit element at index ${k} (${a}, ${b}) — fail-closed`);
    }
    out[k] = asVerdict(minTrit(a, b));
  }
  return out;
}

/**
 * Strided 2-D view of `vAndTensor`: fold an untrusted `tSub` tensor into an `rows × cols` core
 * verdict matrix (row-major), returning the shaped matrix flattened the same way. Same fail-closed
 * contract as `vAndTensor` (shape mismatch / non-trit → hard error). Useful for a per-row × per-column
 * verdict fold (e.g. a result-set classification) — still a verdict-shaper, never a data engine.
 */
export function vAndTensor2D(vCore: Int8Array, tSub: Int8Array, rows: number, cols: number): Int8Array {
  if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows < 0 || cols < 0) {
    throw new Error(`vAndTensor2D: invalid shape (${rows}×${cols}) — fail-closed`);
  }
  if (vCore.length !== rows * cols) {
    throw new Error(`vAndTensor2D: vCore length ${vCore.length} ≠ rows*cols ${rows * cols} — fail-closed`);
  }
  return vAndTensor(vCore, tSub); // element-wise; the 2-D shape is the caller's row-major interpretation
}

// ── Variadic ternary consensus (notes/62 §3, owner-approved 2026-06-25; K3U2 2026-10-25) ──
//
// Sign-of-sum over N votes, but an undecided outcome is UNKNOWN, never the trit 0:
//  - any UNKNOWN vote → UNKNOWN (infectious);
//  - empty → UNKNOWN; a split that sums to 0 → UNKNOWN; only UNANIMOUS 0 votes → NEUTRAL;
//  - a non-trit, non-sentinel vote → hard refusal.
// (tpl-simulator's 3-input consensusTrit still returns 0 on a tie; it is a later copies unit.)

/** Sign-of-sum consensus over N votes; tie / empty / UNKNOWN vote → K3_UNKNOWN (fail-closed). */
export function consensusTritN(votes: readonly Verdict[]): Verdict {
  let sum = 0;
  let unknown = false;
  let nonZero = false;
  for (const raw of votes) {
    const v = operand(raw, "consensusTritN");
    if (v === K3_UNKNOWN) { unknown = true; continue; }
    if (v !== 0) nonZero = true;
    sum += v;
  }
  if (unknown || votes.length === 0) return K3_UNKNOWN;
  if (sum > 0) return Verdict.ALLOW;
  if (sum < 0) return Verdict.DENY;
  return nonZero ? K3_UNKNOWN : Verdict.NEUTRAL;
}

// ── Continuous-ternary ConfidenceVerdict (notes/62 §1, owner-approved 2026-06-25) ──
//
// A TRIAGE signal, never a new authority. Garbage, non-normalised, ambiguous or low-confidence vectors
// collapse to UNKNOWN (→ audited deny), never to the trit 0. Only a confident strict-argmax pAllow allows.

/** A continuous-ternary confidence vector p=[pDeny, pUnknown, pAllow], components in [0,1], Σ≈1. */
export interface ConfidenceVerdict {
  readonly pDeny: number;
  readonly pUnknown: number;
  readonly pAllow: number;
}

/** Fail-safe collapse of a ConfidenceVerdict: ALLOW / DENY only when clear; everything else UNKNOWN. */
export function collapseConfidence(p: ConfidenceVerdict, allowThreshold = 0.5): Verdict {
  const { pDeny, pUnknown, pAllow } = p;
  const inRange = (x: number) => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
  if (!inRange(pDeny) || !inRange(pUnknown) || !inRange(pAllow)) return K3_UNKNOWN;
  if (Math.abs(pDeny + pUnknown + pAllow - 1) > 1e-6) return K3_UNKNOWN; // not a probability vector
  if (pAllow >= allowThreshold && pAllow > pDeny && pAllow > pUnknown) return Verdict.ALLOW;
  if (pDeny > pAllow && pDeny >= pUnknown) return Verdict.DENY;
  return K3_UNKNOWN; // ambiguous / low-confidence → UNKNOWN → audited deny
}