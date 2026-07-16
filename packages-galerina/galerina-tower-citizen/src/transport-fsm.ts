// transport-fsm.ts — TLSTP S4: the Recovering transport FSM, layered STRICTLY ABOVE the shipped K3
// governance trit (RD galerina-tlstp-s4-recovering-fsm). Buildable-now digital tier: a pure wrapper
// over decideAtBoundary/vAnd with ZERO new crypto and ZERO new trit operation.
//
// TWO disjoint algebraic objects, never aliased (the charter trap):
//   Layer A — the governance trit `Verdict ∈ {-1,0,+1}` (shipped, three-valued-governance.ts).
//   Layer B — this FSM over `TransportState = {Established, Recovering, Closed}`.
// The FSM READS verdicts; it never BECOMES a trit. `Recovering` is NOT the trit's `0`: `0` is
// fail-closed-neutral (collapses to deny), while `Recovering` is a channel that HOLDS while denying
// data effects. Connecting them only through `reverify(g)` keeps K3's collapse semantics intact.
//
// The safety invariants (proved in the RD, pinned by the test):
//   INV-1  Recovering (and Closed) deny ALL data effects — only Established permits payload egress.
//   INV-2  Established is reachable from a non-Established state ONLY via reverify(+1) — never silently.
//   INV-3  Recovering times out to Closed with key erasure once cumulative Δt ≥ τ.
//   INV-4  Closed is absorbing and keys stay ∅.
//   INV-5  the FSM never manufactures authority — resume rides a genuine K3 +1 (No-Coercion).
//   INV-6  fail-closed: a 0 keeps Recovering (eventually Closed), never resumes.
import { Verdict, allOf, authorize, decideAtBoundary } from "./three-valued-governance.js";
import type { GovernanceDiagnostic, BoundaryDecision } from "./three-valued-governance.js";

export type TransportState = "Established" | "Recovering" | "Closed";

/** Opaque channel key material (the X25519+ML-KEM chain keys). The FSM only holds/erases it. */
export interface ChannelKeys { readonly [k: string]: unknown }

/** Static, declared recovery timeout τ (deny-by-default config — NOT runtime-mutable). */
export interface RecoveryConfig { readonly timeoutMs: number }

export interface FsmContext {
  readonly state: TransportState;
  /** nowMs when Recovering was entered; null outside Recovering. Drives the τ timeout. */
  readonly enteredRecoveringAt: number | null;
  /** live key material; null once erased (on any → Closed edge). */
  readonly keys: ChannelKeys | null;
}

/** The event alphabet. Time is INJECTED (never read from the wall clock) so `step` is pure/reproducible. */
export type FsmEvent =
  | { readonly kind: "fault"; readonly nowMs: number }
  | { readonly kind: "reverify"; readonly subVerdicts: readonly Verdict[]; readonly nowMs: number }
  | { readonly kind: "tick"; readonly nowMs: number }
  | { readonly kind: "fatal" };

export interface StepResult {
  readonly next: FsmContext;
  /** the audited BoundaryDecision on a `reverify` (carries FUNGI-GOV-3VL-001 on a 0); null otherwise. */
  readonly decision: BoundaryDecision | null;
  /** true iff this edge erased keys (a → Closed transition that held live keys). */
  readonly erased: boolean;
}

/** INV-1 chokepoint: data/payload egress is permitted IFF the channel is Established. */
export function permitData(ctx: FsmContext): boolean {
  return ctx.state === "Established";
}

export function initialContext(keys: ChannelKeys): FsmContext {
  return { state: "Established", enteredRecoveringAt: null, keys };
}

// Every → Closed edge erases: run the injected best-effort zeroize seam (kemdem pattern lives in the
// adapter), THEN null the reference. Returns the erased context + whether an erase actually happened.
function toClosed(ctx: FsmContext, onErase?: (k: ChannelKeys) => void): { next: FsmContext; erased: boolean } {
  const hadKeys = ctx.keys !== null;
  if (hadKeys && onErase) onErase(ctx.keys as ChannelKeys);
  return { next: { state: "Closed", enteredRecoveringAt: null, keys: null }, erased: hadKeys };
}

/**
 * The pure S4 transition function δ (RD §2.2/§2.3). Resume depends on `=== ALLOW`, NEVER on `!== DENY`
 * (the subtle silent-resume bug) — enforced via `authorize(g)`.
 */
export function step(
  ctx: FsmContext,
  event: FsmEvent,
  config: RecoveryConfig,
  onDiagnostic?: (d: GovernanceDiagnostic) => void,
  onErase?: (k: ChannelKeys) => void,
): StepResult {
  const stay = (): StepResult => ({ next: ctx, decision: null, erased: false });
  const closed = (): StepResult => { const { next, erased } = toClosed(ctx, onErase); return { next, decision: null, erased }; };

  // Closed is absorbing (INV-4): every event stays Closed, keys already ∅.
  if (ctx.state === "Closed") return stay();

  // `fatal` from any live state → Closed/Erase.
  if (event.kind === "fatal") return closed();

  // `reverify` — the ONLY event that consults the governance layer. Resume gates on a fresh +1.
  if (event.kind === "reverify") {
    const decision = decideAtBoundary(allOf(event.subVerdicts), onDiagnostic);
    const g = decision.verdict;
    if (g === Verdict.DENY) { const { next, erased } = toClosed(ctx, onErase); return { next, decision, erased }; }
    if (authorize(g)) {
      // g === ALLOW (+1): the ONLY path to Established (INV-2). Keys held (resume), clock cleared.
      return { next: { state: "Established", enteredRecoveringAt: null, keys: ctx.keys }, decision, erased: false };
    }
    // g === INDETERMINATE (0): NOT a resume (INV-6). From Established this degrades to Recovering;
    // from Recovering it stays. Either way the channel holds and denies data effects.
    const enteredAt = ctx.state === "Recovering" ? ctx.enteredRecoveringAt : event.nowMs;
    return { next: { state: "Recovering", enteredRecoveringAt: enteredAt, keys: ctx.keys }, decision, erased: false };
  }

  // `fault` — a transient channel fault. Established → Recovering (start the τ clock); Recovering stays
  // (cumulative Δt not reset — a fault mid-recovery does not extend the window).
  if (event.kind === "fault") {
    if (ctx.state === "Established") return { next: { state: "Recovering", enteredRecoveringAt: event.nowMs, keys: ctx.keys }, decision: null, erased: false };
    return stay(); // already Recovering
  }

  // `tick(nowMs)` — time advances. Only meaningful in Recovering: at cumulative Δt ≥ τ → Closed/Erase (INV-3).
  // A tick in Established is a no-op (Established does not track recovery time).
  if (ctx.state === "Recovering" && ctx.enteredRecoveringAt !== null) {
    const elapsed = event.nowMs - ctx.enteredRecoveringAt;
    if (elapsed >= config.timeoutMs) return closed();
  }
  return stay();
}
