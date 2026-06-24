# RD-0126 — photonic-crypto bridge · alpha-sorting PDF · virtualized-binary-chip · "-1 = recheck later"

**Date:** 2026-06-24 · **Method:** 4 parallel R&D agents grounding every claim against shipped source + an adversarial synthesizer that re-checked for overclaim (workflow `wv2sta77f`).
**Posture:** verify-before-confirm · Govern-Don't-Absorb · crypto-on-core (LLN-SUBSTRATE-001) · honesty bar (separate sound-principle from aspirational-hardware).

> Four owner R&D threads. The consistent finding: **your intuitions are correct, and LogicN mostly already ships them — at the governance/decision layer. The hardware half is aspirational/HW-gated, and several confident claims (mostly from pasted prose / the PDF) are overclaims that the code refutes.**

---

## Thread A — the photonic-crypto hardware bridge — CONFIRMS-SHIPPED + 2 net-new

**Owner thesis:** crypto needs bit-perfect binary; it can't run natively on a noisy photonic lane without an error-correction collapse; so you need a **hardware bridge** (silicon runs the K3 gate + ML-DSA-65 verify, then hands authenticated plaintext to the photonic substrate) — **not** a virtual binary chip simulated in light.

**Verdict: the thesis is sound and largely already law in LogicN — at the software/governance layer.** Grounded:
- *"Crypto requires bit-exact binary"* = **LLN-SUBSTRATE-001**, enforced: `substrate-inference.ts:234` (`CRYPTO_EFFECT` regex on a noisy/photonic lane → hard error); restated in the quantum-resistance posture ("a PQ signature is worthless if computed on a non-bit-exact substrate").
- *The co-processing / signed-handoff model* = **Govern-Don't-Absorb, shipped**: `partition-decider.ts:111-113` (crypto/control-flow → digital), `execution-router.ts` (fail-closed compose, binary is the structural floor), `photonic-admission.ts` `admitPhotonicConfig` (the reprogram matrix admitted as a **signed** artifact — hash-pin + Ed25519 + revocation + capability — on binary silicon *before* the PPU reprograms), `hardware-directive.ts:46` (fail-closed to binary on any unattested target).
- *"Virtual binary chip in light = trap"* = **correct** (RD-0110): emulating a bit-exact gate in light needs unbounded error-correction (destroys the analog advantage), and a dense N×N map is Θ(N²) work on any substrate — there is no free "O(1) binary chip in light."

**The honest correction:** it is all **DORMANT**. `admitPhotonicConfig` / `admitStorageSubstrate` / `ExecutionRouter` have **no live consumer** (grep: only their own defs + barrel re-exports + tests); per-op photonic latencies are labelled *"CONSERVATIVE ASPIRATIONAL ENVELOPES"*; the PPU/gateway **hardware does not exist**. LogicN ships the **signed admission + fail-closed dispatch contract** around such a bridge — it does **not** ship the gateway chip, and the honest verb is **"designs/encodes," never "routes plaintext to photonic at speed."**

**Net-new (CPU-only, genuine gaps — BUILD):**
1. **Affirmative transitive crypto-pin invariant.** Today LLN-SUBSTRATE-001 is *reactive* (`substrate-inference.ts:214` checks `hasCrypto` on the *same* flow's declared effects only). It does **not** catch crypto reached *transitively* (caller declares `lane: photonic`, a callee signs) nor affirmatively pin a crypto-bearing flow to binary. A verifier pass over the transitive crypto footprint → pin-to-binary or deny, independent of the author's lane.
2. **Derive `isCrypto` from the effect-checker, not the caller.** `partition-decider.ts:36` trusts a caller-supplied `isCrypto?: boolean`; a mis-wired/hostile caller passing `isCrypto:false` on a crypto kernel defeats the crypto→digital gate. Derive it authoritatively from `declaredEffects` (the `CRYPTO_EFFECT` regex already exists). Removes an attacker-controlled flag from the routing TCB. *(Build #1+#2 together — same boundary, compile-time + route-time.)*

**Track (HW-gated):** the `PhotonicOffloadPort` that actually calls the admission rail, a live `ExecutionRouter` consumer, a degrade-on-overrun latch — all #102-106-gated; building them speculatively is primitive-with-no-caller.

---

## Thread B — the alpha-sorting PDF (`notes/tritmesh-rd-alpha-sorting.pdf`) — TRACK, re-scope hard

**Content:** AlphaDev-style fixed-length branchless sorting networks (Sort-3/4/5 via compare-and-swap), emitted with WASM `select`, to accelerate three paths (K3 capability intersection, Result.Masked compaction, .tmf DAG edge sort). Header: *"RD-0117 / APPROVED FOR BUILD."*

**Verdict: the one sound LogicN-side idea is the security principle; the rest is ~60–70% TritMesh-DB R&D wearing a LogicN label.** Grounded:
- **Sound:** AlphaDev sorting networks are real CS and **data-oblivious → constant-time** (fixed compare-swap schedule, input-independent control flow) — they genuinely close a timing side-channel, which aligns with LogicN's constant-traversal posture. The PDF correctly cites LLN-SUBSTRATE-001 (keep the sort digital).
- **Overclaims/refuted (code-checked):** the emitter emits **zero WASM `select`** (it uses `(if`/`br_if`); capability intersection is a **set-membership** check over string effect-paths (not a sorted integer array — the "60% / O(1)" figures have no LogicN basis); **Result.Masked is a per-field object shaper** (`partial-return.ts`, no SoA array to compact); the `.tmf`/MeshQL/TLSTP framing is **off-limits TritMesh-side**. The *"APPROVED FOR BUILD"* header is **not** a LogicN approval.

**Net-new (TRACK, do not build now):** a fixed-length branchless compare-swap macro via WASM `select` is buildable, but has **no consumer** (no array-sort builtin; set-based intersection gains nothing; Masked has no array). Gate any build on a concrete LogicN flow that sorts a small bounded numeric array; if built, emit `select`-only (or the constant-time property is void) and **sell on determinism / reproducible signed builds, never on the PDF's speed/O(1) claims.** A genuinely LogicN-aligned angle worth its own note: deterministic ordering → byte-reproducible WASM artifacts for signed-build attestation.

---

## Thread C — virtualize a binary chip — CONFIRMS-SHIPPED (reshaped) + DO-NOT-BUILD a hypervisor

**Owner idea:** virtualize a binary chip (a software-defined "perfect chip" — Type-1 hypervisor + virtual ISA over cores/clocks) to isolate execution, define what cores do, and add capabilities a standard CPU lacks.

**Verdict: the core intuition is already realized as the shipped WASM admission gate — but as a bytecode VM, not a hypervisor over silicon.** Grounded:
- **Shipped = your virtual chip:** `wasm-runtime.ts` is an **attestation-first, fail-closed admission gate** (verifyWasm rejects on no-attestation / hash-mismatch / unpinned / bad-sig / profile-shortfall) with a **closed host import set** (a disallowed import → `CRITICAL_SECURITY_VIOLATION` before instantiation). WASM = the virtual ISA; the closed host import object = the capability pin-out; linear memory = the isolated address space; V_DPM = a virtual capability register; `memory.fill` arena reset = zero-on-eviction.
- **Corrections (must not repeat):** *"tower-citizen IS the virtual chip"* is the **wrong analogy** — `three-valued-governance.ts` is the **K3 verdict algebra** (a decision calculus), not a CPU virtualizer. **Physical core-pinning / cache-clear (clflush/wbinvd) are ABSENT** (grep: zero source hits). `memory.fill` is shipped but is **O(arena-size)**, not "O(1)" (one instruction, linear work). DSS.wasm/V_DPM supervisor is design-expressed-in-`.lln`, #102-106-gated (effectful flows lower to `unreachable`).
- **The hypervisor-attack-surface / TCB-growth / Spectre-class-escape concern is VALID and argues AGAINST a heavy virtual CPU.** A virtual ISA can add *governance* semantics for free (bounds-checked memory, closed capability set, trap-on-violation) but **cannot software-synthesize physical guarantees** (constant-time, core isolation, Spectre-freedom) the silicon lacks.

**Build: nothing bespoke.** Delegate the hypervisor role to Wasmtime + WASI Preview 2 when it lands (DRCM Phase-4, #102-106). **DO-NOT-BUILD** a homegrown VMM / core-pinning / cache-clear — it grows the TCB, can't beat Spectre on a leaky core, and violates Govern-Don't-Absorb. Optional: a doc "virtual-chip lens" that *names* the already-shipped pieces (zero new TCB).

---

## Thread E — "-1 means recheck later (re-evaluate at the end)" — REFUTE-the-build / TRACK-one-residual

**Owner idea (explore, not necessarily implement):** Boolean 0/1, but a third value -1 means *recheck at the end of the logic* rather than an immediate verdict.

**Verdict: the safe reading is already shipped as K3; the unsafe reading is a fail-open; do not build a new construct.** Grounded:
- **Safe form** — *"hold, run nothing now, collapse once at a governed boundary, unknown→deny"* — **is exactly** `decideAtBoundary` (`three-valued-governance.ts`; `collapse(0)=deny` + `LLN-GOV-3VL-001`). Bounded "recheck later" rails already ship: **TTL capability leases** (`lease.ts`, clock-free, malformed→INDETERMINATE) and **revocation cadence** (`cert-gate.ts` `revocationRecheckDue`, chunk-boundary floor, never-authorizes invariant). Both re-check *without letting denied work run first*.
- **Framing correction (load-bearing):** the held/"recheck" state is the trit **0 (INDETERMINATE)**, **not -1** — in K3 **-1 is definite DENY**. Mapping "recheck later" onto -1 would **destroy the `LLN-GOV-3VL-001` "denied-because-undecided" audit signal.**
- **Unsafe form** — *"proceed now, recheck at the end"* — is a **genuine fail-open / speculative-side-effect window** (the body commits its effect before the late recheck can deny it). This is exactly the `deliverAsync` / 2-valued-guard anti-pattern that **RD-0125 already formalizes and measures** (P6 leaks the denied side-effect; P9 fails open on INDETERMINATE). **REFUTE building it.**

**Net-new: NONE for the safe form** (shipped end-to-end). The only TRACK residual is the disclosed **mid-flight revocation gap** (RD-0125 HOLE-2): a policy revoked *during* a long `compute()` isn't observed until the body finishes. `revocationRecheckDue` supplies the *when*; the missing piece is the body-side **cooperative-cancellation + lease-rebinding** seam (plumbing, gated on a real long/streaming consumer) — **not** a new logic value. The standing net-new in this lineage remains the on-demand `toleranceWitness` admission rail (RD-0122/0125).

---

## Overclaims caught (re-verified against source — so they are not repeated)

| # | Claim (owner prose / PDF) | Reality |
|---|---|---|
| A | "LogicN routes authenticated plaintext to a photonic substrate at speed" | FALSE — no live photonic path, no measured speed; envelopes labelled aspirational. Honest verb: *designs/encodes*. |
| B | PDF "maps the logic to WASM `select`" | FALSE — emitter emits zero `select` (uses `if`/`br_if`). |
| C | PDF "O(1) instruction count" sort / "60% faster admission" | Overclaim — fixed-count-for-bounded-N isn't algorithmic O(1); 60% is a TritMesh-DB figure with no LogicN basis. |
| D | PDF "Result.Masked = SoA flat-array compaction" | REFUTED — it is a per-field object shaper. |
| E | "memory.fill arena wipe is O(1)" | Overclaim — one instruction, O(arena-size) work. |
| F | "physical core-pinning + cache-clear shipped" | FALSE — grep: zero hits for setaffinity/clflush/wbinvd. |
| G | "tower-citizen IS the virtual chip" | Wrong analogy — it's the K3 verdict algebra; the virtual ISA is `wasm-runtime.ts`. |
| H | "a virtual chip can do MORE than the hardware" | Half-true — adds governance semantics for free; cannot synthesize physical guarantees the silicon lacks. |
| I | "-1 = recheck later" | Would corrupt the K3 audit signal — the held state is trit 0, not -1. |

*Process note:* the adversarial synthesizer flagged that one agent (Thread E) claimed to have *run* the `rd-0125` prototype "10/10 EXIT=0", but the agents searched only the `LogicN` repo, where the script is absent. The script **does** exist in the sibling **`LogicN-R-AND-D`** repo (`scripts/rd-0125-resolution-delivery-model.mjs`, committed `d023375`) and was run 10/10 there earlier this session — so the conclusion holds; the agents simply didn't scan the sibling repo. A good catch that correctly stayed skeptical of an unverifiable in-context claim.

## Build queue from this batch
- **BUILD now (CPU-only, most-secure):** A-1 transitive crypto-pin invariant + A-2 derive `isCrypto` from effects (same boundary; remove a self-reported security flag from the routing TCB and close the transitive crypto-on-non-binary path).
- **TRACK (no consumer / HW-gated):** the photonic offload port + router consumer + degrade-latch; the branchless `select` sort macro; the mid-flight-revocation cancellation seam; the "virtual-chip lens" doc.
- **REFUTE / DO-NOT-BUILD:** a bespoke Type-1 hypervisor / core-pinning / cache-clear; a "-1 = recheck-later" language construct; importing the PDF's TritMesh-DB Vectors A/B/C.
