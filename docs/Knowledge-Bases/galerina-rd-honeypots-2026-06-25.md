# Honeypots / deception R&D — do they fit deny-by-default zero-trust? (2026-06-25)

Owner asked: should we add honeypots to strengthen security? Workflow `wf_fc443018-a6d` (4 lenses + synth;
3 lens agents hit a transient rate-limit, but the decisive **ZT-fit** lens + the synthesis completed with a clear
verdict).

> **Verdict: selective-yes — ship at most a thin PASSIVE canary; explicitly DON'T build any interactive lure.**
> A passive tripwire fits deny-by-default *perfectly*; an interactive decoy is a direct *contradiction* of it.
> The honest caveat: even the passive form is a **small marginal gain** over the K3 degrade loop + tamper-evident
> TRAP ledger Galerina already has.

## The deciding line: "does the decoy respond?"

- **Interactive lure → CONFLICTS, refuse.** A convincing fake endpoint/credential must be *reachable* and must
  *respond* to engage an attacker — a live listener (net-new inbound/egress surface), believable fake state,
  accepted interaction. Every one of those violates "deny unless proven," and it's the only form that carries
  entrapment/inducement legal risk.
- **Passive canary → COMPLEMENTS, by construction.** A canary is a record/section/capability-name governed by the
  *exact same* deny-by-default rules as everything else: it stays sealed/denied, returns nothing useful, and the
  tripwire is **the act of asking for it**, not a response granted to it. **Zero new reachable surface.**

## Why the passive form is sound (not just asserted)

It must reuse the **existing** wire: feed a `canaryTripped` boolean into `telemetryToSideSignal()`
(`galerina-core-network/src/admission-feedback.ts`) and fold via `withSideSignal`/`certGate`. The module invariant
`min(t*, r) ≤ t*` (No-Coercion) guarantees the signal can only throttle **ALLOW→INDETERMINATE** (opt-in →DENY via
`denyThreshold`) and can **never lift a verdict**. Therefore a **forged or spoofed canary trip is
harmless-by-construction**: worst case it self-denies a channel (fail-closed), never opens one — the same safety
envelope as `health=DOWN` / `anomalyScore=1.0`. A canary is not a hole in deny-by-default; it's one more
conjunctive degrade operand, algebraically indistinguishable from telemetry.

## Where (if built) — thin layer only

| Seam | Canary idea | ZT-safe? |
|---|---|---|
| Secrets (`ext-secrets-tmf` `open()`/`openValue()`) | a sealed decoy section (`__canary_*` name convention); a request for it → **deny + TRAP audit** (phase=TRAP, severity=CRITICAL) + degrade signal | ✅ sealed like any secret; legit flows never name it → ~0 false positives |
| K3 wire | feed `canaryTripped` into `telemetryToSideSignal()` — **add nothing to the algebra** | ✅ proven No-Coercion |
| Admission (`app-kernel` registry-index) | a capability name **no** real flow declares; a request = a probe → TRAP + degrade | ✅ |
| Network (`egress`/`inbound-guard`) | a never-legitimately-dialed marker host kept **DENY-listed** (tripwire, not a reachable lure) | ✅ |

**Ship only the secrets canary + the K3 wire** as a thin layer; the others are cheap follow-ons. Build **nothing**
that requires a live fake responder.

## Honest risks (mostly redundancy, not danger)

- **Marginal gain:** the degrade-only loop + the HMAC-chained TRAP ledger (`audit-logger.ts`) already produce a
  CRITICAL/denied record when an attacker trips *any* existing guard (SSRF deny, revoked key, indeterminate
  verdict, inbound deny-default). A canary mainly adds a **higher-confidence** signal (near-zero benign
  explanation), which is real but incremental.
- **False positives from internal tooling:** `listSecrets()`, backups, graph scanners enumerating sections would
  trip a canary — they **must be exempted**, or each scan self-degrades a channel.
- **Invariant rot:** canary names must be kept out of *every* legitimate flow forever — a cross-cutting invariant
  that tends to decay; needs a lint.
- **The decoy itself:** must reuse `withSideSignal` (never a bespoke path that could lift a verdict); a sealed
  canary section is still bytes in the env.tmf container, so the `open()` path must not leak its existence.

**Bottom line:** build the thin passive canary or build nothing — never the interactive lure. The ZT-preserving
design is a degrade-only No-Coercion signal, which Galerina can already express today.

*Source: workflow `wf_fc443018-a6d` (2026-06-25).*
