# R&D — module-wide `contract.invariant{}` (note 45), intuition verdict

> Owner R&D note `notes/45-invariant.md` (2026-06-23), two parts: **Part 1** — promote `invariant{}` from a
> flow-level block to a **module-wide `contract.invariant{}`** the compiler injects into every function's
> prologue/epilogue. **Part 2** — put `contract.invariant` **on Auto**: a runtime that reads the ValueGraph and
> *self-synthesises / tightens / loosens* global invariants ("Self-Healing Adaptive Immune System").
> **Verdict (hub intuition): Part 1 = ADOPT (design-then-build, tiered by provability). Part 2 = REFUTE-and-reframe**
> — its sound core re-derives the shipped monotonic emergency overlay; its net-new framing is fail-open +
> No-Coercion-violating + misplaces trust on the (hostile) host.

## Verify-before-build — what already ships
- **Flow-level `invariant { ensure … }`** (R&D 0040 DbC): parser + governance-verifier (`verifyInvariantBlock`,
  `tryStaticEval`, `SPORE-INV-001/002/003`) + interpreter + wat-emitter; fail-closed at the single exit, all tiers.
- **Monotonic emergency `policy{}` overlay** (DRCM Phase 4): `SPORE-MONO-001/003`, `validateTransitionMonotonicity` —
  a runtime overlay may **escalate** capability restriction on a trigger, **never de-escalate**.
- **`limits{}`** = the committed-arena memory bound (no `memory.grow` → trap). **Taint / info-flow** = the
  value-state checker + `SPORE-SECRET-*` / `SPORE-PRIVACY-002`. **`liability{}`-on-Auto** (C-003) = deterministic
  inference from the breach-risk matrix (NOT a live analog signal). **DWI hard-erase** (I-001/I-003, `step`).

## Part 1 — ADOPT, but TIER it by provability (Deterministic Foresight)
Module-wide `contract.invariant{}` injected into every flow is sound and high-value — it aligns with auto-by-default
+ deny-by-default, and **AI-drift immunity is a real win**: the invariant lives at the contract layer, not the flow
body an AI edits, so an over-optimising agent physically cannot delete it. The note conflates two enforcement
mechanisms, though ("the compiler will block the build" *and* "the injected epilogue check catches it on the next
clock cycle"). Split them — **prove what you can; trap the rest, never guess**:

| Invariant kind | Example (note 45) | Enforcement | Status |
|---|---|---|---|
| **Static info-flow / structural** | `Cardholder_Data never_touches PublicTelemetryLog` | **Compile-time PROOF → block the build** (fail-closed) over the module taint graph | already the taint system (`SPORE-SECRET-*`/`PRIVACY-002`); net-new = the *declarative module-wide* form |
| **Runtime relational over live state** | `Ledger.totalCredits == totalDebits` | **Injected fail-closed `ensure` pre/post check** (the R&D-0040 DbC mechanism) into every flow's epilogue, trap on violation | net-new = the *module-wide injection* + global-relational invariants |
| **Resource bound** | `allocatedBuffers <= 50MB` | **alias to `limits{}`** — do not duplicate the arena bound | already ships |

**Net-new to build:** (a) the module-wide *injection* (wrap every flow, not per-flow); (b) global *relational*
invariants as injected runtime checks; (c) the declarative module-wide *taint-policy* form proven at compile time.
Diagnostics: `SPORE-INV-MODULE-001..` (or extend `SPORE-INV-*`). **Tiering matters for cost:** the static-proof tier
has zero runtime cost; only inject a runtime check where you cannot prove it. (The note's "speeds up compilation"
is true — one global set beats 50 local; the "next clock cycle" is a real *per-boundary runtime* cost the tiering
minimises.)

## Part 2 — REFUTE-and-reframe (the "Auto self-healing immune system")
Three specific refutations, each from a standing invariant:

1. **"Dynamically LOOSEN invariants in low-risk state" → ❌ FAIL-OPEN.** An invariant dropped in "low-risk" mode
   leaves the system least-protected exactly when it is lulled — and an attacker who spoofs the ValueGraph/telemetry
   into "low-risk" *receives the loosened net*. Invariants must be **monotonic: runtime may only TIGHTEN, never
   loosen** — which is precisely the shipped emergency-overlay rule (`SPORE-MONO-001/003`, escalate-never-de-escalate).
2. **"Synthesise the invariant CONDITIONS from live hardware telemetry (HIV voltage/clock variance)" → ❌ guessing +
   analog-as-security-control.** Deciding *whether* a security invariant (e.g. double-entry) is enforced from an
   **analog** signal violates **No-Coercion** (analog may only *degrade a verdict toward DENY*, never *determine* a
   control) and the Deterministic-Foresight thesis (no guessing). The note's analogy to `liability`-on-Auto is false:
   liability auto-infers deterministically from the *declared* breach-risk matrix, not a live analog reading.
3. **Host-side `GalerinaAutoInvariantEngine` (a TS that reads `wasm.exports.readTotalCredits()` and decides) →
   ❌ misplaced trust.** In Absolute Zero-Trust the host is a *hostile byte-mover*; the invariant enforcer must live
   **inside** the governed sandbox (DSS.wasm), not a host-side TS the note trusts to read memory and adjudicate. The
   host-side engine is the Stage-A *simulation*; the real enforcer is in-DSS.wasm (#102–106 gated). `triggerEmergency
   Zeroization` (fill linear memory with 0) is sound but is just the existing **DWI hard-erase** (I-001/I-003).

**The salvage (the sound ~75%):** the shipped emergency `policy{}` overlay *already is* "runtime invariant tightening
on a trigger." The genuine net-new is small and safe: let `contract.invariant{}` **declare escalation TIERS**
(baseline + stricter, statically authored), which the monotonic overlay **activates** on a **degrade-only K3
trigger** (anomaly / tamper / HIV as a `vAnd` operand that can only push toward the stricter tier) — **picking among
pre-declared tiers, never synthesising a new condition from analog telemetry**, enforced **in-DSS.wasm**.

## Recommendation
- **Build Part 1** (module-wide `contract.invariant{}`, tiered: static-proof | injected DbC | alias-to-limits) —
  design-then-build, net-new, high AI-drift-immunity value. Pairs with the §2 Governance-DCE static-analysis family.
- **Do NOT build Part 2 as "self-healing auto-synthesis."** Reframe to: `contract.invariant` declares escalation
  tiers; the shipped monotonic overlay escalates on a degrade-only K3 trigger; enforcement in-DSS.wasm. **Never
  loosen, never synthesise-from-analog, never host-side-trust.**

> Crypto/keys Binary; photonic/HIV = degrade-only operand, projected/emulated. Hub intuition verdict
> (2026-06-23) — open for the R&D session to deepen (e.g. the relational-invariant injection cost model).
