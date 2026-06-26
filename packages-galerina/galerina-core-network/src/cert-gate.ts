/**
 * cert-gate.ts — TLSTP S1: the K3 cert/channel-validation governance gate.
 *
 * A PURE governance pass. It takes the *outputs* of crypto/TLS validation (already
 * performed by a TLS/PKI library) as four sub-verdicts, folds them with the shipped
 * Kleene-K3 reduce (`allOf` = `vAnd`-reduce = numeric `min` over the trit), and
 * collapses to a single fail-closed `BoundaryDecision` via `decideAtBoundary`.
 *
 * It performs **no** ASN.1 parsing, path-building, signature math, or OCSP/CRL
 * parsing itself — that is the TLS library's job. This module only folds trits.
 *
 * Headline property (the reason S1 exists): a revocation-UNKNOWN sub-verdict (`0`)
 * collapses the whole channel to DENY. That closes the soft-fail hole the public
 * web tolerates (responder-down ⇒ allow). Unknown→DENY is forced by the algebra
 * (`vAnd(0, +1) = 0`; `+1` is the conjunctive identity and contributes nothing
 * toward overriding a `0`), NOT by a configurable flag.
 *
 * Fail-closed seam: in `toSubVerdicts`, the default for every missing / errored /
 * un-provable factor is `0` (INDETERMINATE), never `+1`. Mapping a timed-out or
 * errored factor to ALLOW is exactly the web's soft-fail mistake — it is encoded
 * once here and tested for each of the four factors.
 *
 * Binding posture: crypto / KDF / cipher / signature / key bytes stay Binary
 * (digital). Any photonic / analog signal is a degrade-only extra `vAnd` operand
 * (`withSideSignal`): by No-Coercion (`min(t*, r) ≤ t*`) it can only LOWER the
 * verdict, never lift a `0 → +1`, so it may contribute without ever becoming a key.
 *
 * Build guide: docs/Knowledge-Bases/galerina-tlstp-s1-cert-gate.md
 */

import {
  Verdict,
  allOf,
  vAnd,
  decideAtBoundary,
  type BoundaryDecision,
  type GovernanceDiagnostic,
} from "../../galerina-tower-citizen/dist/index.js";

// Re-export the trit + boundary types so consumers of the cert-gate can interpret
// a verdict / decision without reaching across into @galerina/tower-citizen.
export { Verdict };
export type { BoundaryDecision, GovernanceDiagnostic };

// ── Library-outcome inputs (what a TLS/PKI library reports) ───────────────────

/** The TLS library's certificate-chain path-validation outcome. */
export type ChainValidationOutcome = "valid" | "invalid" | "incomplete";

/** The outcome of a revocation (OCSP / CRL) check. */
export type RevocationOutcome = "good" | "revoked" | "unknown";

/** The four cert sub-verdicts, each a Kleene-K3 trit. */
export interface CertSubVerdicts {
  /** Leaf SPKI/cert digest vs the pinned digest set. */
  readonly pinMatch: Verdict;
  /** The TLS library's path-validation result. */
  readonly chainValid: Verdict;
  /** notBefore ≤ now ≤ notAfter. */
  readonly notExpired: Verdict;
  /** OCSP/CRL says good AND within the freshness window. */
  readonly revocationFresh: Verdict;
}

/**
 * The raw inputs a caller hands the gate — the *outputs* of crypto/TLS validation,
 * plus the host's pin set and a clock. Every field is optional; a missing field
 * maps to `0` (INDETERMINATE), never `+1`. That is the fail-closed seam.
 */
export interface CertGateInput {
  /** Pinned leaf SPKI/cert sha256 digests for this host. Empty/absent ⇒ no pin configured ⇒ pinMatch = 0. */
  readonly pinnedDigests?: readonly string[];
  /** The presented leaf SPKI/cert sha256 digest (hex). Absent ⇒ cannot compare ⇒ 0. */
  readonly presentedDigest?: string;

  /** The TLS library's path-validation outcome. Absent ⇒ "incomplete" ⇒ 0. */
  readonly chainOutcome?: ChainValidationOutcome;

  /** Cert validity window (epoch ms). Either bound absent ⇒ no window ⇒ notExpired = 0. */
  readonly notBefore?: number;
  readonly notAfter?: number;
  /** Current time (epoch ms). Absent ⇒ clock unavailable ⇒ notExpired = 0 (and freshness un-provable). */
  readonly now?: number;

  /** Revocation outcome from a library OCSP/CRL check. Absent ⇒ "unknown" ⇒ revocationFresh = 0. */
  readonly revocation?: RevocationOutcome;
  /** Production time (epoch ms) of the revocation response, for the freshness window. */
  readonly revocationProducedAt?: number;
  /** Freshness window (ms). A "good" older than this — or with no window given — is stale ⇒ 0. */
  readonly revocationFreshnessMs?: number;
  /**
   * A host-injected revocation check (mirrors fuse-loader's predicate shape). If
   * provided it overrides `revocation`; a check that THROWS maps to 0 (never +1),
   * mirroring the fail-closed-on-throw at fuse-loader.ts:537.
   */
  readonly revocationCheck?: () => RevocationOutcome;

  /**
   * Degrade-only side-signals (e.g. TamperTrust, substrate availability). Each is
   * folded as an extra `vAnd` operand — by No-Coercion it can only lower the
   * verdict, never lift it. Never a key/KDF/cipher byte.
   */
  readonly sideSignals?: readonly Verdict[];
}

// ── Per-factor mappers — each fail-closed (anything not provably positive ⇒ 0/−1) ─

/**
 * pinMatch:
 *  - pinned digest present AND matches → +1
 *  - pinned digest present AND mismatches → −1 (hard DENY / annihilator — the MITM-with-valid-cert case)
 *  - no pin configured, or nothing presented to compare → 0
 *
 * NOTE the gotcha: pin *mismatch* is −1; pin *absent* is 0. They are different —
 * conflating them either bricks un-pinned hosts (−1) or weakens pinned ones (+1).
 */
function pinMatchVerdict(
  pinned: readonly string[] | undefined,
  presented: string | undefined,
): Verdict {
  if (pinned === undefined || pinned.length === 0) return Verdict.INDETERMINATE; // no pin configured
  if (presented === undefined || presented.length === 0) return Verdict.INDETERMINATE; // can't compare
  const p = presented.toLowerCase();
  return pinned.some((d) => d.toLowerCase() === p) ? Verdict.ALLOW : Verdict.DENY;
}

/** chainValid: library "valid" → +1, "invalid" → −1, "incomplete"/absent → 0. */
function chainValidVerdict(outcome: ChainValidationOutcome | undefined): Verdict {
  if (outcome === "valid") return Verdict.ALLOW;
  if (outcome === "invalid") return Verdict.DENY;
  return Verdict.INDETERMINATE; // "incomplete" or undefined
}

/** notExpired: inside the window → +1, outside → −1, no window / no clock / non-finite → 0. */
function notExpiredVerdict(
  notBefore: number | undefined,
  notAfter: number | undefined,
  now: number | undefined,
): Verdict {
  if (notBefore === undefined || notAfter === undefined || now === undefined) {
    return Verdict.INDETERMINATE;
  }
  if (!Number.isFinite(notBefore) || !Number.isFinite(notAfter) || !Number.isFinite(now)) {
    return Verdict.INDETERMINATE;
  }
  if (now < notBefore || now > notAfter) return Verdict.DENY;
  return Verdict.ALLOW;
}

/**
 * revocationFresh — the headline factor:
 *  - "good" AND within the freshness window → +1
 *  - "revoked" → −1
 *  - "unknown" / unreachable / STALE / no freshness data / check THROWS → 0
 *
 * A *stale* "good" (older than the freshness window, or future-dated, or with no
 * window/clock supplied) is treated identically to "no response": 0. Freshness is
 * a required part of +1 — a replayed old "good" must not authorize.
 */
function revocationVerdict(
  outcome: RevocationOutcome | undefined,
  producedAt: number | undefined,
  now: number | undefined,
  freshnessMs: number | undefined,
  check: (() => RevocationOutcome) | undefined,
): Verdict {
  let resolved = outcome;
  if (check !== undefined) {
    try {
      resolved = check();
    } catch {
      return Verdict.INDETERMINATE; // throwing check ⇒ unknown ⇒ 0 (fuse-loader.ts:537)
    }
  }

  if (resolved === "revoked") return Verdict.DENY;
  if (resolved !== "good") return Verdict.INDETERMINATE; // "unknown" or undefined

  // resolved === "good": it must ALSO be provably fresh.
  if (
    producedAt === undefined ||
    now === undefined ||
    freshnessMs === undefined ||
    !Number.isFinite(producedAt) ||
    !Number.isFinite(now) ||
    !Number.isFinite(freshnessMs)
  ) {
    return Verdict.INDETERMINATE; // cannot prove freshness ⇒ 0
  }
  const age = now - producedAt;
  if (age < 0 || age > freshnessMs) return Verdict.INDETERMINATE; // future-dated or stale ⇒ 0
  return Verdict.ALLOW;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Map raw library outputs to the four K3 sub-verdicts. Every missing / errored /
 * un-provable factor defaults to `0` — this is the fail-closed seam.
 */
export function toSubVerdicts(input: CertGateInput): CertSubVerdicts {
  return {
    pinMatch: pinMatchVerdict(input.pinnedDigests, input.presentedDigest),
    chainValid: chainValidVerdict(input.chainOutcome),
    notExpired: notExpiredVerdict(input.notBefore, input.notAfter, input.now),
    revocationFresh: revocationVerdict(
      input.revocation,
      input.revocationProducedAt,
      input.now,
      input.revocationFreshnessMs,
      input.revocationCheck,
    ),
  };
}

/**
 * Fold the four sub-verdicts into one cert verdict with the shipped K3 reduce.
 *
 *   cert_verdict = allOf([pinMatch, chainValid, notExpired, revocationFresh])
 *                = min{ pinMatch, chainValid, notExpired, revocationFresh }
 *
 * `+1` ⟺ all four are `+1`; `−1` ⟺ any is `−1`; otherwise `0`. (Fold order is
 * irrelevant — `vAnd` is commutative & associative.) We reuse `allOf` verbatim so
 * the K3-conformance oracle keeps covering this gate; we never hand-roll `min`.
 */
export function certVerdict(subs: CertSubVerdicts): Verdict {
  return allOf([subs.pinMatch, subs.chainValid, subs.notExpired, subs.revocationFresh]);
}

/**
 * Fold a degrade-only side-signal into a verdict. By No-Coercion (`vAnd = min`) it
 * can only lower the verdict (`+1→0`, `+1→−1`, `0→−1`) — it can NEVER lift a
 * `0 → +1` or `−1 → +1`. This is why a photonic/analog measurement may contribute
 * to the channel verdict without ever becoming a key or coercing an ALLOW.
 */
export function withSideSignal(verdict: Verdict, sideSignal: Verdict): Verdict {
  return vAnd(verdict, sideSignal);
}

/**
 * The end-to-end gate: map → fold → fold any degrade-only side-signals → collapse
 * at the trust boundary. The channel opens IFF `decision.authorized === true`
 * IFF the composed verdict is exactly `+1` IFF all four sub-verdicts are `+1`
 * (and every side-signal is `+1`).
 *
 * `onDiagnostic` receives SPORE-GOV-3VL-001 whenever an INDETERMINATE (`0`) verdict
 * is collapsed to deny — it is structurally impossible to drop that silently
 * (the diagnostic is also returned in `decision.diagnostic`).
 */
export function certGate(
  input: CertGateInput,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
): BoundaryDecision {
  const base = certVerdict(toSubVerdicts(input));
  const folded = (input.sideSignals ?? []).reduce<Verdict>((acc, r) => vAnd(acc, r), base);
  return decideAtBoundary(folded, onDiagnostic);
}

// ── Mid-stream revocation re-check cadence (config + pure helper, NOT a protocol) ─ (TRACK c)
//
// A long-lived governed stream cannot rely on its OPENING revocation check forever: a
// signing key may be revoked mid-session. This knob declares HOW OFTEN such a stream
// re-runs its revocation re-check (the S4 reverify step, which folds the revocation
// verdict via vAnd/decideAtBoundary, so unknown/revoked still collapses to DENY). This
// module only answers "is a re-check DUE now?"; it never authorizes, so it cannot weaken
// unknown->DENY — at worst it forces MORE re-checks. Fail-closed: the default is
// chunk_boundary, and ANY absent/invalid config degrades to chunk_boundary (re-check
// every chunk). There is deliberately NO encoding meaning "never". See
// docs/Knowledge-Bases/galerina-tlstp-s4-recovering-fsm.md + galerina-b8-governed-transport.md.

/**
 * How often a long-lived governed stream re-runs its signing-key/revocation re-check.
 *  - `chunk_boundary` — re-check at every chunk/frame boundary (the fail-closed floor).
 *  - `poll` — re-check once elapsed reaches `everyMs` (and ALSO at every chunk boundary).
 *    A non-finite or ≤0 `everyMs` is invalid and degrades to the floor.
 */
export type RevocationCadence =
  | { readonly mode: "chunk_boundary" }
  | { readonly mode: "poll"; readonly everyMs: number };

/** The fail-closed default: re-check at every chunk boundary. */
export const DEFAULT_REVOCATION_CADENCE: RevocationCadence = { mode: "chunk_boundary" };

/** The stream's progress since the last revocation re-check, supplied by the caller. */
export interface RecheckState {
  /** True iff the stream is at a chunk/frame boundary (a re-check opportunity). */
  readonly atChunkBoundary: boolean;
  /** ms elapsed since the last completed re-check (injected, never read here). */
  readonly msSinceLastCheck: number;
}

function isValidPollIntervalMs(everyMs: number): boolean {
  return Number.isFinite(everyMs) && everyMs > 0;
}

/**
 * Pure, deterministic: given the cadence + the stream's progress, is a re-check DUE?
 * Fail-closed totality: absent / not-an-object / unknown mode ⇒ chunk_boundary floor;
 * `poll` with an invalid everyMs ⇒ floor; `poll` valid ⇒ due iff the interval elapsed
 * OR at a chunk boundary (a non-finite elapsed is treated as due — a broken clock must
 * not skip a re-check). No input yields "never": a re-check is always due at a boundary.
 */
export function revocationRecheckDue(
  cadence: RevocationCadence | undefined,
  state: RecheckState,
): boolean {
  const atBoundary = state.atChunkBoundary === true;
  if (cadence === undefined || cadence === null || typeof cadence !== "object") {
    return atBoundary;
  }
  if (cadence.mode === "poll") {
    if (!isValidPollIntervalMs(cadence.everyMs)) {
      return atBoundary; // invalid interval ⇒ degrade to the floor, never "never"
    }
    const intervalElapsed =
      !Number.isFinite(state.msSinceLastCheck) || state.msSinceLastCheck >= cadence.everyMs;
    return intervalElapsed || atBoundary;
  }
  return atBoundary; // chunk_boundary (and any unrecognized mode) ⇒ the floor
}
