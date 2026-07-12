/**
 * epistemic-type-state.ts — the trust trit, lifted from the verdict layer to the value layer (RD-0337).
 *
 * The shipped `three-valued-governance.ts` gives a GOVERNANCE VERDICT a first-class
 * epistemic trit (ALLOW / DENY / INDETERMINATE). RD-0337's flagship move is to lift
 * that same trit UP into the type-state layer, so a *value* carries its own epistemic
 * status: `proven` / `unknown` / `refuted`. This is the tri-native safety element that
 * a 2-valued (Rust/alethic) type system cannot express:
 *
 *   Binary safety is the safety of ELIMINATED uncertainty (prove everything, or reject).
 *   Ternary safety is the safety of REPRESENTED uncertainty — carry "unknown" as a
 *   first-class, CONTAGIOUS, FAIL-CLOSED value. The unique element is *provable safety
 *   under partial knowledge*: safe not because we know everything, but because we
 *   correctly, algebraically fail-close on what we do not know.
 *
 * Everything here is a THIN, PROVEN lift over `three-valued-governance.ts` — the trit,
 * the Kleene folds (vAnd/allOf/anyOf = min/…), No-Coercion (an unknown operand can only
 * LOWER a verdict, never lift it), deny-by-default empty, and the audited boundary
 * collapse (FUNGI-GOV-3VL-001). No new logic is invented; the novelty is *where the trit
 * lives*. The compile-time type-state (`Trusted<T>` vs `Unverified<T>`) is ergonomic help;
 * the RUNTIME boundary check is the real guarantee and holds even if the types are bypassed.
 *
 * This module packages the four RD-0337 Part-C primitives + the 3-axis type model:
 *   1. epistemic type-state   — Trusted<T> / Unverified<T> / Refuted<T> + discharge + boundary
 *   2. abstaining K3 contract — ALLOW / DENY / ABSTAIN that COMPOSES (allOf/anyOf) + enforcement modes
 *   3. tri-schema             — field = present / unknown-pending / forbidden; operate on the known parts
 *   4. optimistic-then-verify — an approximate value typed UNKNOWN until an exact oracle discharges it
 *   +  3-axis type            — ⟨what × whether-proven × classification⟩, fail-closed via allOf at the boundary
 *
 * ── ZERO-TRUST INVARIANTS (owner-ratified 2026-07-10) ────────────────────────
 * K3 ABSTAIN is the OPPOSITE of C++26 `observe`: observe = detect + PROCEED
 * (fail-OPEN); ABSTAIN = defer + DENY at the boundary (fail-CLOSED). The
 * abstaining contract is zero-trust safe IFF ALL FOUR invariants hold — miss any
 * one and it fails open:
 *   I1  Only +1 authorizes. ABSTAIN and DENY both deny at a boundary. The moment
 *       anything reads "not a DENY ⇒ proceed", it is fail-open.
 *   I2  No-Coercion in composition. allOf: an abstention is contagious-down
 *       (allOf([ALLOW, ABSTAIN]) = ABSTAIN → deny). anyOf: an abstention can
 *       defer but never upgrade to allow. Abstention only lowers or defers.
 *   I3  Abstention is LOUD. Every ABSTAIN→deny emits FUNGI-GOV-3VL-001, and the
 *       audit sink fires in EVERY enforcement mode — a mode gates `proceed`,
 *       NEVER the audit. "Denied by policy" (DENY, no diagnostic) is always
 *       distinguishable from "denied because a check could not run" (ABSTAIN,
 *       diagnostic). A silently-swallowed abstain is a latent fail-open.
 *   I4  An abstention is never cached/persisted as a grant. Authorization is
 *       read ONLY from the explicit `authorized`/`proceed` booleans — "has a
 *       verdict ⇒ go" is fail-open. (House rule #194: memoize the compiled
 *       evaluator, never the decision.)
 * Accepted hazard (named, conscious): an adversary who can force abstention
 * (crash a verifier, feed ambiguous input) turns ALLOWs into ABSTAINs and
 * everything denies — a decision-DoS. That is fail-CLOSED (availability
 * sacrificed to integrity/confidentiality), the correct zero-trust tradeoff; an
 * ABSTAIN spike is an anomaly SIGNAL, not noise. The observe/ignore modes exist
 * for functional-safety surfaces (where stopping is worse) and are NEVER valid
 * at a trust boundary — requireTrusted/releaseTo take no mode and always fail
 * closed.
 *
 * ── The two governed axes propagate by DIFFERENT algebras, each in its own safe
 * direction (and both fail-close independently from one combine):
 *   axis 2 proven  (trust trit)  : min-trit (vAnd)  — LEAST-trusted wins   · unlabeled → UNKNOWN → deny
 *   axis 3 class   (sensitivity) : join ⊔ (max)     — MOST-restrictive wins · unlabeled → SECRET
 * JIF flow rule (§103): safe to REDUCE access, illegal to EXPAND. secret→public
 * sink = DENY; the only way DOWN the lattice is the explicit audited
 * {@link declassify} gate (an encode/redact step — RD-0327 …⇒encoder / RD-0323
 * encode-on-egress), exactly as the only way UP the trust axis is {@link discharge}.
 *
 * Spec: ../../../ZTF-Knowledge-Bases/galerina-rd-0337-beyond-rust-tri-typesafety-and-a-ternary-native-safety-primitive.md
 * Honesty: this is Kleene/Łukasiewicz 3-valued CLASSICAL logic (epistemic "we-don't-know"), NOT a qubit.
 */

import {
  Verdict,
  vAnd,
  allOf,
  anyOf,
  decideAtBoundary,
  type GovernanceDiagnostic,
  type BoundaryDecision,
} from "./three-valued-governance.js";

// ════════════════════════════════════════════════════════════════════════════
// 1. Epistemic type-state — the trust trit
// ════════════════════════════════════════════════════════════════════════════

/**
 * Epistemic trust as a balanced trit — the SAME encoding as {@link Verdict}, so the
 * shipped Kleene folds operate on it directly:
 *   +1 PROVEN   — proof discharged; trusted for use here
 *    0 UNKNOWN   — not yet proven; the FAIL-CLOSED default
 *   -1 REFUTED  — proven-bad / verification failed; a sticky hard negative
 */
export type Trust = Verdict;

export const Trust = {
  REFUTED: Verdict.DENY, //         -1 : proven-bad — sticky (No-Coercion downward)
  UNKNOWN: Verdict.INDETERMINATE, //  0 : not yet proven — fail-closed default
  PROVEN: Verdict.ALLOW, //          +1 : proof discharged
} as const;

/**
 * A value bound to a first-class epistemic trit + an audit trail of how the trit got
 * where it is. `K` is the literal-typed trit, so `Trusted<T>` (K=1) is NOT assignable
 * to a slot wanting a general value and vice-versa — the trit field IS the brand.
 */
export interface Epistemic<T, K extends Trust = Trust> {
  readonly value: T;
  readonly trust: K;
  readonly provenance: readonly string[];
}

/** A value whose proof has been discharged (K=PROVEN). */
export type Trusted<T> = Epistemic<T, typeof Trust.PROVEN>;
/** A value not yet proven — the fail-closed default (K=UNKNOWN). */
export type Unverified<T> = Epistemic<T, typeof Trust.UNKNOWN>;
/** A value proven-bad — a sticky hard negative (K=REFUTED). */
export type Refuted<T> = Epistemic<T, typeof Trust.REFUTED>;

// ── Constructors (all fail-closed) ───────────────────────────────────────────

/**
 * Enter a raw / external / untrusted value into the epistemic system.
 * FAIL-CLOSED: the default trit is UNKNOWN — a value that merely *exists* is never
 * trusted. This is the antidote to "parsed ⇒ verified".
 */
export function unverified<T>(value: T, reason = "unverified-input"): Unverified<T> {
  return { value, trust: Trust.UNKNOWN, provenance: [reason] };
}

/**
 * A TRUSTED ROOT — the sanctioned escape hatch for an axiomatic root of trust (a
 * compile-time constant, a hardware root). Requires an explicit reason so it is
 * auditable. Prefer {@link discharge}: reaching PROVEN through a verifier is safer than
 * asserting it.
 */
export function trustedRoot<T>(value: T, reason: string): Trusted<T> {
  return { value, trust: Trust.PROVEN, provenance: [`trusted-root:${reason}`] };
}

/** Mark a value as REFUTED (proven-bad). Sticky: {@link discharge} can never lift it. */
export function refute<T>(value: T, reason: string): Refuted<T> {
  return { value, trust: Trust.REFUTED, provenance: [`refuted:${reason}`] };
}

// ── Discharge — the ONLY sanctioned lift path ────────────────────────────────

/**
 * The verification step — the ONLY way UNKNOWN rises to PROVEN.
 *
 *   REFUTED input       → stays REFUTED (a refutation is sticky; re-verification cannot
 *                         resurrect a hard negative — fail-closed / No-Coercion downward).
 *   verify(value)===true → PROVEN  (proof discharged)
 *   verify(value)===false → REFUTED (you checked; it failed; it is now proven-bad)
 *   verify throws        → UNKNOWN  (inconclusive — absence of evidence, not evidence of
 *                         badness; a re-verified PROVEN that throws DROPS to UNKNOWN)
 *
 * No-Coercion holds: the trit only ever rises through an actual passing verifier; nothing
 * else lifts it. A throwing verifier can never yield PROVEN.
 */
export function discharge<T>(e: Epistemic<T>, verify: (v: T) => boolean, reason: string): Epistemic<T> {
  if (e.trust === Trust.REFUTED) {
    return { value: e.value, trust: Trust.REFUTED, provenance: [...e.provenance, `discharge-skipped(refuted):${reason}`] };
  }
  let ok = false;
  let threw = false;
  try {
    ok = verify(e.value) === true;
  } catch {
    threw = true; // fail-closed: an errored verifier never proves anything
  }
  const trust: Trust = ok ? Trust.PROVEN : threw ? Trust.UNKNOWN : Trust.REFUTED;
  const tag = ok ? `discharged:${reason}` : threw ? `discharge-inconclusive:${reason}` : `discharge-failed:${reason}`;
  return { value: e.value, trust, provenance: [...e.provenance, tag] };
}

// ── Structure-preserving operations ──────────────────────────────────────────

/** Transform the payload; the trit is PRESERVED (a pure transform adds no trust and removes none). */
export function map<T, U>(e: Epistemic<T>, f: (v: T) => U): Epistemic<U> {
  return { value: f(e.value), trust: e.trust, provenance: [...e.provenance, "map"] };
}

/**
 * Combine two epistemic values — CONTAGIOUS: the result trit is `vAnd` (min) of the
 * inputs. Trusted+Unverified → Unverified; anything+Refuted → Refuted. An untrusted
 * operand can only LOWER the result (No-Coercion), never manufacture trust.
 */
export function combine<A, B, C>(a: Epistemic<A>, b: Epistemic<B>, f: (a: A, b: B) => C): Epistemic<C> {
  return {
    value: f(a.value, b.value),
    trust: vAnd(a.trust, b.trust),
    provenance: [...a.provenance, ...b.provenance, "combine"],
  };
}

/**
 * Fold N epistemic values into an array payload — trit = `allOf` (min-fold).
 * Deny-by-default: the EMPTY set is UNKNOWN (no positive evidence), never a vacuous PROVEN.
 */
export function combineAll<T>(es: readonly Epistemic<T>[]): Epistemic<T[]> {
  const trust = allOf(es.map((e) => e.trust));
  const provenance = es.length === 0 ? ["combineAll:empty→unknown"] : [...es.flatMap((e) => e.provenance), "combineAll"];
  return { value: es.map((e) => e.value), trust, provenance };
}

// ── Type guards ──────────────────────────────────────────────────────────────

export function isTrusted<T>(e: Epistemic<T>): e is Trusted<T> {
  return e.trust === Trust.PROVEN;
}
export function isUnverified<T>(e: Epistemic<T>): e is Unverified<T> {
  return e.trust === Trust.UNKNOWN;
}
export function isRefuted<T>(e: Epistemic<T>): e is Refuted<T> {
  return e.trust === Trust.REFUTED;
}
export function trustOf<T>(e: Epistemic<T>): Trust {
  return e.trust;
}

// ── The trust boundary — fail-closed extraction ──────────────────────────────

/** Result of resolving an epistemic value at a trust boundary. */
export interface TrustBoundaryResult<T> {
  readonly authorized: boolean;
  /** The payload IFF PROVEN — otherwise `null`. You cannot extract a value from a non-trusted wrapper. */
  readonly value: T | null;
  readonly decision: "allow" | "deny";
  readonly trust: Trust;
  /** Non-null IFF an UNKNOWN trit was collapsed to deny (FUNGI-GOV-3VL-001) — never silent. */
  readonly diagnostic: GovernanceDiagnostic | null;
  readonly provenance: readonly string[];
}

/**
 * The trust boundary: release the payload IFF it is PROVEN. UNKNOWN and REFUTED both deny.
 * Reuses `decideAtBoundary`, so an UNKNOWN collapse is audited FUNGI-GOV-3VL-001. This is
 * the fail-closed guarantee that holds even when the compile-time type-state was bypassed.
 */
export function requireTrusted<T>(
  e: Epistemic<T>,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): TrustBoundaryResult<T> {
  const bd: BoundaryDecision = decideAtBoundary(e.trust, onDiagnostic);
  return {
    authorized: bd.authorized,
    value: bd.authorized ? e.value : null,
    decision: bd.decision,
    trust: e.trust,
    diagnostic: bd.diagnostic,
    provenance: e.provenance,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 4. Optimistic-then-verify (RD-0337 C4 / RD-0338 tensor lane) — a special case of §1
// ════════════════════════════════════════════════════════════════════════════

/**
 * Take an APPROXIMATE result now, typed UNKNOWN, so it can be operated on but can NEVER
 * be mistaken for a verified result. The approximation is fail-closed at every boundary
 * until {@link reconcile} discharges it against the exact oracle. (An approximate
 * photonic/noisy-lane result is INDETERMINATE until the digital verify discharges it.)
 */
export function optimistic<T>(approx: T, reason = "optimistic-approximation"): Unverified<T> {
  return { value: approx, trust: Trust.UNKNOWN, provenance: [`optimistic:${reason}`] };
}

/** Reconcile an optimistic value against the exact oracle — discharges the trit (true→PROVEN, false→REFUTED). */
export function reconcile<T>(e: Epistemic<T>, exact: (v: T) => boolean, reason = "reconcile"): Epistemic<T> {
  return discharge(e, exact, reason);
}

// ════════════════════════════════════════════════════════════════════════════
// 2. Abstaining K3 contract — ALLOW / DENY / ABSTAIN that COMPOSES
// ════════════════════════════════════════════════════════════════════════════

/**
 * A K3 contract clause: maps a value to a {@link Verdict}. ABSTAIN (=INDETERMINATE) is a
 * first-class result that COMPOSES safely — unlike a binary pass/fail contract, it does
 * not force a wrong guess. C++26's ignore/observe/enforce is an ad-hoc glimpse of this;
 * here the composition is algebraic (allOf/anyOf).
 */
export type Contract<T> = (value: T) => Verdict;

/** Conjunctive contract — ALL clauses must ALLOW; a single ABSTAIN keeps the whole INDETERMINATE (safe); any DENY fails. Empty → INDETERMINATE (deny-by-default). */
export function allContracts<T>(clauses: readonly Contract<T>[]): Contract<T> {
  return (v: T) => allOf(clauses.map((c) => c(v)));
}

/** Disjunctive contract — SOME clause allows; mirrors anyOf. Empty → INDETERMINATE (deny-by-default). */
export function anyContract<T>(clauses: readonly Contract<T>[]): Contract<T> {
  return (v: T) => anyOf(clauses.map((c) => c(v)));
}

/** How a contract violation is handled at the boundary (C++26 §105 semantics, made algebraic over the trit). */
export type EnforcementMode = "ignore" | "observe" | "enforce";

export interface ContractOutcome {
  readonly verdict: Verdict;
  readonly mode: EnforcementMode;
  /** May the caller proceed? enforce: only on ALLOW. observe/ignore: always. */
  readonly proceed: boolean;
  /** Was the contract not-ALLOW (DENY or ABSTAIN)? Surfaced even under observe/ignore — never silent. */
  readonly violated: boolean;
  readonly diagnostic: GovernanceDiagnostic | null;
}

/**
 * Evaluate a contract under an enforcement mode:
 *   enforce → proceed IFF ALLOW; ABSTAIN and DENY both stop (fail-closed); ABSTAIN audited.
 *   observe → detect + record the violation, but PROCEED (functional-safety: stopping is worse).
 *   ignore  → proceed regardless (the escape hatch) — the verdict is still reported.
 *
 * Invariant I3 — the mode gates `proceed`, NEVER the audit: the diagnostic sink fires in
 * EVERY mode (a silently-swallowed abstain is a latent fail-open — someone later "cleans
 * up the noise" by defaulting it to allow). ABSTAIN never forces a wrong guess: it
 * fail-closes under enforce, is recorded under observe/ignore, and composes via
 * allOf/anyOf. observe/ignore are for FUNCTIONAL-SAFETY surfaces only — never valid at a
 * trust boundary (requireTrusted/releaseTo take no mode).
 */
export function evaluateContract<T>(
  value: T,
  contract: Contract<T>,
  mode: EnforcementMode = "enforce",
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): ContractOutcome {
  const verdict = contract(value);
  // I3: the sink is forwarded UNCONDITIONALLY — no mode may silence the audit trail.
  const bd = decideAtBoundary(verdict, onDiagnostic);
  const violated = verdict !== Verdict.ALLOW;
  const proceed = mode === "enforce" ? bd.authorized : true;
  return { verdict, mode, proceed, violated, diagnostic: bd.diagnostic };
}

// ════════════════════════════════════════════════════════════════════════════
// 3. Tri-schema — field = present / unknown-pending / forbidden
// ════════════════════════════════════════════════════════════════════════════

/** A field's declared state in a tri-schema. */
export type FieldRequirement = "required" | "optional-pending" | "forbidden";

export interface TriFieldSpec<T> {
  readonly requirement: FieldRequirement;
  /** Structural check for a present value; its ABSENCE means the field cannot be proven ⇒ UNKNOWN, never assumed. */
  readonly verify?: (v: unknown) => v is T;
}

export type TriSchema<R> = { readonly [K in keyof R]: TriFieldSpec<R[K]> };

export interface TriFieldResult {
  readonly present: boolean;
  readonly trust: Trust;
  readonly note: string;
}

export interface TriSchemaResult<R> {
  readonly fields: { readonly [K in keyof R]: TriFieldResult };
  /** allOf over the field trits — the record's fail-closed trust. */
  readonly verdict: Verdict;
  /** ONLY the PROVEN fields — safe to operate on while the unknown/refuted parts stay deny-collapsed. */
  readonly known: Partial<R>;
  readonly diagnostic: GovernanceDiagnostic | null;
}

/**
 * Validate a record against a tri-schema. A partially-known record is a FIRST-CLASS, SAFE
 * value: each field gets its own trit, the record verdict is `allOf` (fail-closes if any
 * field is UNKNOWN/REFUTED), and `known` exposes only the PROVEN fields. Binary schema
 * forces reject-whole-record OR default-the-field (both fail-open); this carries the
 * uncertainty safely.
 *
 * Per-field rule (fail-closed throughout):
 *   forbidden:        absent → PROVEN (correctly absent) ; present → REFUTED (a forbidden field appeared)
 *   required:         absent → REFUTED ; present+verify✓ → PROVEN ; present+verify✗ → REFUTED ; present+no-verifier → UNKNOWN
 *   optional-pending: absent → UNKNOWN (legitimately not-yet-known) ; present+verify✓ → PROVEN ; present+verify✗ → REFUTED ; present+no-verifier → UNKNOWN
 */
export function validateTriSchema<R extends Record<string, unknown>>(
  record: Partial<Record<keyof R, unknown>>,
  schema: TriSchema<R>,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): TriSchemaResult<R> {
  const fields = {} as { [K in keyof R]: TriFieldResult };
  const known: Partial<R> = {};
  const trits: Trust[] = [];

  for (const key of Object.keys(schema) as (keyof R)[]) {
    const spec = schema[key];
    const present = Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined;
    const raw = record[key];
    let trust: Trust;
    let note: string;

    if (spec.requirement === "forbidden") {
      trust = present ? Trust.REFUTED : Trust.PROVEN;
      note = present ? "forbidden-field-present" : "correctly-absent";
    } else if (!present) {
      // required missing is a definite violation; optional-pending missing is legitimately UNKNOWN.
      trust = spec.requirement === "required" ? Trust.REFUTED : Trust.UNKNOWN;
      note = spec.requirement === "required" ? "required-field-missing" : "optional-pending-absent";
    } else if (!spec.verify) {
      trust = Trust.UNKNOWN; // present but no way to prove its shape → fail-closed to unknown
      note = "present-unverified";
    } else if (spec.verify(raw)) {
      trust = Trust.PROVEN;
      note = "present-verified";
      known[key] = raw as R[keyof R];
    } else {
      trust = Trust.REFUTED;
      note = "present-verify-failed";
    }

    fields[key] = { present, trust, note };
    trits.push(trust);
  }

  const verdict = allOf(trits);
  // The record verdict is a governance verdict — audit an INDETERMINATE collapse.
  const bd = decideAtBoundary(verdict, onDiagnostic);
  return { fields, verdict, known, diagnostic: bd.diagnostic };
}

// ════════════════════════════════════════════════════════════════════════════
// + 3-axis type ⟨what × whether-proven × classification⟩ (RD-0337 Part B / rec 2)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Axis 3 — the security classification, a trit-lattice `public ⊑ internal ⊑ secret`.
 * JIF rule (§103): safe to REDUCE access (value ≤ sink), illegal to EXPAND it. An unknown
 * classification is treated as the most-restrictive (SECRET) — the sensitivity axis's
 * deny-by-default.
 */
export type Classification = "public" | "internal" | "secret";

const CLASS_ORDER: Record<Classification, number> = { public: 0, internal: 1, secret: 2 };

/**
 * The lattice JOIN ⊔ (least upper bound = max = most-restrictive wins) — combining
 * classifications is contagious UPWARD: mix any secret in, the result is secret. This is
 * axis 3's own algebra (join/max), deliberately the mirror of axis 2's min-trit — each
 * axis propagates in its own safe direction.
 */
export function classJoin(a: Classification, b: Classification): Classification {
  return CLASS_ORDER[a] >= CLASS_ORDER[b] ? a : b;
}

/**
 * A value carrying all three safety axes:
 *   Axis 1 (WHAT)  — the payload type `T` (the classical/alethic type; the only axis Rust natively has)
 *   Axis 2 (PROVEN)— the epistemic trust trit
 *   Axis 3 (CLASS) — the classification label
 * The composite is fail-closed via `allOf` at the boundary — a value can be a known Email
 * (Axis 1) that is unverified (Axis 2) and secret (Axis 3); the composite deny-collapses.
 */
export interface TriTyped<T> {
  readonly value: T;
  readonly proven: Trust;
  readonly classification: Classification;
  readonly provenance: readonly string[];
}

/** Construct a 3-axis value — both governed axes default FAIL-CLOSED (proven=UNKNOWN, class=secret). */
export function triTyped<T>(
  value: T,
  opts?: { proven?: Trust; classification?: Classification; reason?: string },
): TriTyped<T> {
  return {
    value,
    proven: opts?.proven ?? Trust.UNKNOWN,
    classification: opts?.classification ?? "secret",
    provenance: [opts?.reason ?? "tri-typed"],
  };
}

/**
 * Combine two 3-axis values — contagious on BOTH governed axes, each by its own algebra:
 * proven via vAnd (min — least-trusted wins), class via classJoin (⊔/max — most-restrictive
 * wins). One combine, two independent fail-closes.
 */
export function combineTriTyped<A, B, C>(
  a: TriTyped<A>,
  b: TriTyped<B>,
  f: (a: A, b: B) => C,
): TriTyped<C> {
  return {
    value: f(a.value, b.value),
    proven: vAnd(a.proven, b.proven),
    classification: classJoin(a.classification, b.classification),
    provenance: [...a.provenance, ...b.provenance, "combine-3axis"],
  };
}

/**
 * The ONLY sanctioned way DOWN the classification lattice — the axis-3 counterpart of
 * {@link discharge} (axis-2's only way up). Declassification (e.g. secret→public) is legal
 * only through this explicit, audited gate, and it REQUIRES an encode/redact transform
 * (RD-0327 …⇒encoder / RD-0323 encode-on-egress): the payload that leaves is the ENCODED
 * one, never the original. Trust (axis 2) rides along unchanged — the axes stay orthogonal,
 * each with its own gate in its own safe direction.
 *
 * Fail-closed: a non-lowering target is a HARD error (raising is classJoin's job — calling
 * it "declassify" would mislabel an escalation); a throwing encoder aborts the
 * declassification entirely (nothing is released).
 */
export function declassify<T, U>(
  v: TriTyped<T>,
  to: Classification,
  encode: (value: T) => U,
  reason: string,
): TriTyped<U> {
  if (CLASS_ORDER[to] >= CLASS_ORDER[v.classification]) {
    throw new Error(
      `declassify: target "${to}" is not below "${v.classification}" — not a declassification (fail-closed; raising is classJoin's job)`,
    );
  }
  const value = encode(v.value); // a throw here propagates — nothing is released
  return {
    value,
    proven: v.proven,
    classification: to,
    provenance: [...v.provenance, `declassified:${v.classification}→${to}:${reason}`],
  };
}

export interface ReleaseResult<T> {
  readonly authorized: boolean;
  readonly value: T | null;
  readonly decision: "allow" | "deny";
  /** allOf([proven, classVerdict]) — the fail-closed composite over Axes 2 & 3. */
  readonly composite: Verdict;
  /** ALLOW iff value.classification ≤ sinkClearance (safe to reduce, illegal to expand). */
  readonly classVerdict: Verdict;
  readonly proven: Trust;
  readonly diagnostic: GovernanceDiagnostic | null;
  readonly provenance: readonly string[];
}

/**
 * Release a 3-axis value to a sink of the given clearance. Authorized IFF BOTH governed
 * axes clear: the value is PROVEN (Axis 2) AND its classification ≤ the sink's clearance
 * (Axis 3 — releasing `secret` to a `public` sink is a leak → DENY). The composite is
 * `allOf` (min), so either axis can only lower the outcome; an INDETERMINATE composite is
 * audited FUNGI-GOV-3VL-001.
 */
export function releaseTo<T>(
  v: TriTyped<T>,
  sinkClearance: Classification,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): ReleaseResult<T> {
  const classOk = CLASS_ORDER[v.classification] <= CLASS_ORDER[sinkClearance];
  const classVerdict: Verdict = classOk ? Verdict.ALLOW : Verdict.DENY;
  const composite = allOf([v.proven, classVerdict]);
  const bd = decideAtBoundary(composite, onDiagnostic);
  return {
    authorized: bd.authorized,
    value: bd.authorized ? v.value : null,
    decision: bd.decision,
    composite,
    classVerdict,
    proven: v.proven,
    diagnostic: bd.diagnostic,
    provenance: v.provenance,
  };
}
