/**
 * three-valued-governance.ts — proved fail-closed governance verdicts (Direction A)
 *
 * A governance verdict is three-valued, encoded as a balanced trit:
 *   +1 = ALLOW          (proof discharged, posture positive — may authorize)
 *   -1 = DENY           (definite refusal)
 *    0 = INDETERMINATE  (proof undischarged / evidence incomplete / substrate 0)
 *
 * The calculus is Kleene strong three-valued logic (K3). It is NOT re-implemented:
 * it reuses the #173/#196 balanced-ternary gates from tpl-simulator.ts, which are
 * already exactly K3 over the trit (DENY < INDETERMINATE < ALLOW):
 *   minTrit = Kleene ∧   ·   maxTrit = Kleene ∨   ·   negTrit = Kleene ¬
 * We import and wrap them with Verdict-typed names so tpl-simulator's semantics
 * (depended on by gate()/tmacVector()/consensusTrit) are never altered here. The
 * exact K3 match is pinned by tests/three-valued-governance.test.mjs — if a future
 * change made the gates diverge from K3, that oracle fails.
 *
 * Verdicts stay three-valued through composition; they collapse to a binary
 * decision ONLY at the trust boundary:
 *   collapse(+1) = allow ;  collapse(0) = deny (audited) ;  collapse(-1) = deny
 *   authorize(v) ⇔ v = +1
 * An INDETERMINATE collapsed to deny emits FUNGI-GOV-3VL-001 — never silent.
 *
 * See ../ZTF-Knowledge-Bases/galerina-three-valued-governance.md for the spec, the
 * fail-closed soundness theorem, and the no-coercion proof.
 */

import { minTrit, maxTrit, negTrit } from "./tpl-simulator.js";

// ── The trit verdict ─────────────────────────────────────────────────────────

/** A governance verdict as a balanced trit. */
export type Verdict = -1 | 0 | 1;

/**
 * Named verdict states. Same numeric encoding as tpl-simulator's TritState
 * (COMMIT/HOLD/REJECT) and core-logic's Tri (TRUE/UNKNOWN/FALSE) — a Verdict IS
 * a trit, so the existing gates operate on it directly.
 */
export const Verdict = {
  DENY: -1,          // definite refusal
  INDETERMINATE: 0,  // fail-closed neutral — undecided
  ALLOW: 1,          // may authorize
} as const;

// ── The blessed Verdict mint — "parse, don't cast" (S0 cast-hygiene, RD 2026-07-18) ──

/**
 * The ONE sanctioned trit→Verdict transition. Every place that turns a COMPUTED trit — a K3 gate result from
 * tpl-simulator's `number`-typed minTrit/maxTrit/negTrit, or a validated tensor element — into a Verdict
 * routes through here, so a bare `x as Verdict` never mints governance authority past the type-checker (the
 * authority-laundering pattern `scripts/audit-cast-hygiene.mjs` forbids). It VALIDATES, it does not assert: a
 * value outside {-1, 0, 1} is a fail-closed hard error, never a silently-minted invalid verdict (the `if`
 * also narrows `number` → Verdict, so the mint itself needs no cast). Do NOT call this on a raw substrate
 * READING — a reading is a measurement, min-folded via `effectiveVerdict`; it can only degrade a verdict,
 * never be authorized on its own.
 */
export function asVerdict(t: number): Verdict {
  if (t === -1 || t === 0 || t === 1) return t;
  throw new Error(`asVerdict: ${t} is not a governance verdict trit (expected -1, 0, or 1) — fail-closed`);
}

// ── Kleene K3 calculus — Verdict-typed aliases of the shipped gates ───────────

/** Kleene ∧ (AND) — the more-cautious verdict wins (fail-closed). Delegates to minTrit. */
export function vAnd(a: Verdict, b: Verdict): Verdict {
  return asVerdict(minTrit(a, b));
}

/** Kleene ∨ (OR) — the more-permissive verdict wins. Delegates to maxTrit. */
export function vOr(a: Verdict, b: Verdict): Verdict {
  return asVerdict(maxTrit(a, b));
}

/** Kleene ¬ (NOT) — ALLOW ↔ DENY; INDETERMINATE ↦ INDETERMINATE (indeterminacy preserved). */
export function vNot(a: Verdict): Verdict {
  return asVerdict(negTrit(a));
}

// ── Composition (deny-by-default empty handling) ──────────────────────────────

/**
 * Conjunctive composition — "authorize only if EVERY clause allows."
 *
 * Deny-by-default: an empty clause set is INDETERMINATE (no clause granted
 * anything → no positive evidence → collapses to deny), NOT the vacuous-truth
 * ALLOW that a bare ∧-fold identity would give. Non-empty sets reduce WITHOUT an
 * ALLOW seed, so a single ALLOW clause is preserved (allOf([+1]) === ALLOW).
 */
export function allOf(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.length === 0) return Verdict.INDETERMINATE;
  return verdicts.reduce((acc, v) => vAnd(acc, v));
}

/**
 * Disjunctive composition — "authorize if SOME clause allows."
 * Deny-by-default empty handling mirrors allOf: [] → INDETERMINATE → deny.
 */
export function anyOf(verdicts: readonly Verdict[]): Verdict {
  if (verdicts.length === 0) return Verdict.INDETERMINATE;
  return verdicts.reduce((acc, v) => vOr(acc, v));
}

// ── The collapse rule + authorization (the trust boundary) ────────────────────

/** Collapse a three-valued verdict to a binary decision. INDETERMINATE and DENY both deny. */
export function collapse(v: Verdict): "allow" | "deny" {
  return v === Verdict.ALLOW ? "allow" : "deny";
}

/** Fail-closed soundness: a verdict authorizes IFF it is exactly ALLOW (+1). */
export function authorize(v: Verdict): boolean {
  return v === Verdict.ALLOW;
}

// ── Audited boundary decision — FUNGI-GOV-3VL-001 ───────────────────────────────

/** The diagnostic code for an indeterminate verdict collapsed to deny at a boundary. */
export const GOV_3VL_DIAGNOSTIC = "FUNGI-GOV-3VL-001" as const;

/** Structured diagnostic record (shape compatible with the LogicDiagnostic family). */
export interface GovernanceDiagnostic {
  readonly code: typeof GOV_3VL_DIAGNOSTIC;
  readonly name: "INDETERMINATE_COLLAPSED_TO_DENY";
  readonly severity: "warning";
  readonly message: string;
}

/** Result of resolving a verdict at the trust boundary. */
export interface BoundaryDecision {
  readonly verdict: Verdict;
  readonly decision: "allow" | "deny";
  readonly authorized: boolean;
  /** Non-null IFF an INDETERMINATE verdict was collapsed to deny (FUNGI-GOV-3VL-001). */
  readonly diagnostic: GovernanceDiagnostic | null;
}

function indeterminateDiagnostic(): GovernanceDiagnostic {
  return {
    code: GOV_3VL_DIAGNOSTIC,
    name: "INDETERMINATE_COLLAPSED_TO_DENY",
    severity: "warning",
    message: "indeterminate governance verdict reached a trust boundary → collapsed to deny",
  };
}

/**
 * Resolve a verdict at the trust boundary, fail-closed and audited.
 *
 * - ALLOW (+1)         → authorized, decision "allow", no diagnostic.
 * - DENY (-1)          → not authorized, decision "deny", no diagnostic (ordinary policy denial).
 * - INDETERMINATE (0)  → not authorized, decision "deny", diagnostic FUNGI-GOV-3VL-001.
 *
 * The diagnostic is returned IN the result whenever a 0 is collapsed — it is
 * structurally impossible to drop an indeterminate verdict silently. The optional
 * sink lets a caller forward it to the AuditLogger egress.
 */
export function decideAtBoundary(
  v: Verdict,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): BoundaryDecision {
  const diagnostic = v === Verdict.INDETERMINATE ? indeterminateDiagnostic() : null;
  if (diagnostic && onDiagnostic) onDiagnostic(diagnostic);
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
    out[k] = vAnd(asVerdict(a), asVerdict(b));
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

// ── Variadic ternary consensus (notes/62 §3, owner-approved 2026-06-25) ──────
//
// consensusTritN generalises the 3-input `consensusTrit` (tpl-simulator) to N votes: the consensus is
// the sign of the sum, with a TIE (or empty) collapsing to INDETERMINATE — fail-closed, never a guessed
// ALLOW. It is re-implemented inline here (not imported from substrate-model's `majorityVote`) because
// substrate-model already imports FROM this module — importing back would be a cycle. The no-divergence
// oracle in the tests pins consensusTritN([a,b,c]) === consensusTrit(a,b,c) over all 27 triples, so the
// two can never drift. Useful for NMR/redundancy:N folds where the 3-input kernel is too narrow.

/** Sign-of-sum consensus over N Verdict votes; a tie (and the empty set) → INDETERMINATE (fail-closed). */
export function consensusTritN(votes: readonly Verdict[]): Verdict {
  let sum = 0;
  for (const v of votes) {
    if (v !== -1 && v !== 0 && v !== 1) {
      throw new Error(`consensusTritN: non-trit vote ${v} — fail-closed`);
    }
    sum += v;
  }
  return (sum > 0 ? Verdict.ALLOW : sum < 0 ? Verdict.DENY : Verdict.INDETERMINATE);
}

// ── Continuous-ternary ConfidenceVerdict (notes/62 §1, owner-approved 2026-06-25) ──
//
// A ConfidenceVerdict is a probability vector p=[pDeny, pUnknown, pAllow] (components in [0,1], summing
// to ~1). It is a TRIAGE signal — NOT a new authority. It MUST fail-safe collapse to the shipped discrete
// Verdict before any decision: `collapseConfidence` authorises ALLOW only when pAllow is a CONFIDENT
// strict argmax (≥ threshold and strictly greater than the others); anything ambiguous, low-confidence,
// non-normalised, or out-of-range collapses to INDETERMINATE (→ deny at the boundary). A confidence
// score can therefore only ever LOWER the outcome toward deny — it can never manufacture an ALLOW the
// discrete gate would not (No-Coercion preserved).

/** A continuous-ternary confidence vector p=[pDeny, pUnknown, pAllow], components in [0,1], Σ≈1. */
export interface ConfidenceVerdict {
  readonly pDeny: number;
  readonly pUnknown: number;
  readonly pAllow: number;
}

/**
 * Fail-safe collapse of a ConfidenceVerdict to a discrete Verdict.
 *  - garbage (NaN / out of [0,1]) or a non-normalised vector (Σ ≠ 1) → INDETERMINATE (fail-safe);
 *  - ALLOW iff pAllow ≥ `allowThreshold` AND strictly greater than both other components;
 *  - DENY iff pDeny is the (≥-tie) dominant component;
 *  - otherwise (ambiguous / low-confidence) → INDETERMINATE.
 * INDETERMINATE and DENY both deny at the boundary, so the ONLY path to authorisation is a confident,
 * unambiguous allow — a confidence vector cannot lift a verdict, only lower it.
 */
export function collapseConfidence(p: ConfidenceVerdict, allowThreshold = 0.5): Verdict {
  const { pDeny, pUnknown, pAllow } = p;
  const inRange = (x: number) => Number.isFinite(x) && x >= 0 && x <= 1;
  if (!inRange(pDeny) || !inRange(pUnknown) || !inRange(pAllow)) return Verdict.INDETERMINATE;
  if (Math.abs(pDeny + pUnknown + pAllow - 1) > 1e-6) return Verdict.INDETERMINATE; // not a probability vector
  if (pAllow >= allowThreshold && pAllow > pDeny && pAllow > pUnknown) return Verdict.ALLOW;
  if (pDeny > pAllow && pDeny >= pUnknown) return Verdict.DENY;
  return Verdict.INDETERMINATE; // ambiguous / low-confidence → fail-safe deny
}
