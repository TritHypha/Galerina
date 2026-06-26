# Galerina — Fault Tolerance, Stability & the Tri-Pipe

> A grounded reference for how Galerina stays correct and stays up. Every mechanism below is in the
> shipped code and exercised by the suite (53/53 packages · 4,984 tests). The maths is the actual
> closed form used at runtime (`@galerina/substrate-math`, `freivalds.ts`, `three-valued-governance.ts`),
> not an illustration. Distilled from the 2026-06-21 Tri-Pipe fault-tolerance re-R&D (`wpa9c3wqk`:
> 4 pipes mapped, 24 hardenings adversarially verified).

---

## 1. What Galerina is

Galerina is a **governance-first compute language and low-level framework** for software where failure is
unacceptable. You write `flow`s; each carries a `contract {}` that declares its **intent, effects,
capability boundaries, and invariants**. The compiler verifies those at build time, and the runtime
enforces them as part of execution — **governance is part of execution, not a layer wrapped around it.**

Two execution tiers, one source:
- **Stage-A governed tree-walker** — a diagnostic/reference interpreter (the byte-parity oracle). Slow
  by design; not what ships.
- **Stage-B WASM** — the **production** path. The compiler lowers `.spore` → WAT → one signed
  `.wasm` with governance (capability bitmasks, contract gates, audit) **compiled in**.

```galerina
secure flow createOrder(readonly req: Request) -> Result<Response, ApiError>
contract {
  intent  { "Create an order; write it and audit it." }
  effects { database.write  audit.write }          // deny-by-default: nothing else is reachable
  invariant { ensure result is Ok or result is Err } // checked at the single exit, before observable
}
{
  let order = OrdersDB.insert(req.body)?            // database.write — declared, therefore allowed
  AuditLog.write({ event: "OrderCreated", id: order.id })
  return Ok(Response.created(order.id))
}
```

The substrate is **Binary / Hybrid / Photonic ("Tri-Pipe") ready**. **Crypto, governance, K3,
admission, secrets, control-flow and exact arithmetic are Binary-ONLY by invariant** (§7).

---

## 2. The one principle of fault tolerance

> **Binary is the universal floor. Every higher pipe can only *decline down* to it — never corrupt,
> never expand authority.** Worst case == binary == today.

Everything below is a way of failing **down** to that floor:
- **fail-CLOSED** — on uncertainty, *deny / trap* (the binary governance core);
- **fail-SAFE** — on an offload fault, *fall back to the exact digital result* (hybrid/photonic).

Neither path can ever fail **open** (proceed with a wrong/unauthorised result). The rest of the document
shows the mechanisms and proves the floor holds.

---

## 3. The Tri-Pipe

"Tri-Pipe" is two things — don't conflate them:
- the **concept**: the three execution pipes **Binary | Hybrid | Photonic**;
- the **package** `galerina-tri-pipe`: a thin *capstone* that wires them. It **depends on**
  `galerina-tower-citizen` (the governed engine — `createHybridEngine`) + `galerina-hardware-tier`
  (the attested tier selector) + `galerina-ext-photonic-emulator` (router + Freivalds + noise model).
  `createTriPipeEngine()` resolves the `{binary|hybrid|photonic}` tier and composes them. **It did not
  replace tower-citizen; it sits on top of it.**

| Pipe | Role | Fail mode |
|---|---|---|
| **Binary** | default + universal fallback; the whole crypto/governance/admission surface | **fail-CLOSED** (trap / deny) |
| **Hybrid** | binary core + offloaded compute kernels, result cheap-verified | **fail-SAFE to Binary** (commit exact digital on any doubt) |
| **Photonic** | fully-eligible kernels on a photonic/ternary substrate (emulator today) | **fail-SAFE** (tolerance/NMR; K3 dead-zone) |

---

## 4. Binary core — fail-CLOSED mechanisms

### 4.1 K3 three-valued governance (`three-valued-governance.ts`)

Verdicts are **balanced trits**: `−1 = DENY`, `0 = INDETERMINATE`, `+1 = ALLOW`. A request is
**authorized ⇔ the verdict is *exactly* +1.** Composition is Kleene conjunction:

```
vAnd(a, b) = min(a, b)          // over {−1, 0, +1}
authorize(v) ⇔ v == +1
```

So a flow authorizes **iff every clause is +1**; a single `0` (proof undischarged / evidence
incomplete) or `−1` collapses the whole verdict to deny. An **empty clause set is `0` (deny-by-default,
not vacuous allow)**, and `permitted_effects {}` is a hard **deny-all**. Every collapse to deny under a
`0` emits a never-silent `SPORE-GOV-3VL-001` audit.

**Why it cannot fail open (monotonicity).** Because `vAnd = min`:

```
vAnd(ideal, reading) ≤ ideal              for all readings
authorize ⇔ (ideal = +1) ∧ (reading = +1) // EXHAUSTIVE over ideal×reading (tested)
```

Any uncertainty or substrate noise can only push a verdict **toward DENY**, never *fabricate* an ALLOW.
The cost of noise is **availability** (a denied valid op), never **safety** (an allowed invalid op).

`vAnd` truth table (`min`):

| ∧ | −1 | 0 | +1 |
|---|---|---|---|
| **−1** | −1 | −1 | −1 |
| **0**  | −1 | 0 | 0 |
| **+1** | −1 | 0 | +1 |

### 4.2 Checked integer traps (`isCheckedTrap`, interpreter.ts)

i32 **overflow** and **division-by-zero** are strict traps that **propagate out of** bindings,
expression statements, and boolean operands — a trapped value can never silently flow into a result.

```galerina
let total: Int = price * quantity   // if this overflows i32 → TRAP; the flow does not
                                    // complete with a wrapped (wrong) total
```

### 4.3 Design-by-Contract output post-conditions (wat-emitter.ts)

`invariant { ensure <predicate over result> }` lowers to an **atomic WASM single-exit `unreachable`
gate** — the return value is checked *before it is observable*, with no TOCTOU window. A violated
post-condition traps (or, on an early return, declines to the governed interpreter).

### 4.4 Arena memory model (wat-emitter.ts)

Linear memory is **committed**: `minPages == maxPages`, **no `memory.grow`**. An over-budget store
**traps at the boundary** rather than growing the heap. Memory is therefore a fixed
`N × 64 KiB`, so there is **no OOM-by-growth** and the trap is deterministic. Each flow gets a
**per-flow arena reset + secret-zeroing** of reclaimed memory.

### 4.5 The admission / fuse border (`fuse-loader.ts`)

Untrusted/signed code is admitted only through **three fail-closed gates**, deny-by-default:
1. **hash-pin** — `.wasm` sha256 must equal the signed descriptor (tamper → refuse);
2. **signature + revocation** — a valid Ed25519 signature from a **non-revoked** key (the registry is
   self-signed + trust-anchor-pinned, defeating a rogue not-yet-revoked signer);
3. **closed capabilities** — a declared capability with no host shim is a link-time
   `LinkError → CRITICAL_SECURITY_VIOLATION`, never a silent fallthrough.

---

## 5. Hybrid pipe — fail-SAFE to Binary, Freivalds-verified

### 5.1 Eligibility + PartitionDecider

A kernel is offloaded **only** when the `PartitionDecider` proves an **absolute-ns net win**, and
**crypto/control are never eligible** (the eligibility gate is checked first). Default is digital.

### 5.2 Freivalds cheap-verify (`freivalds.ts`)

An offloaded GEMM `C ?= A·B` (n×n) is **verified, not re-executed**. Pick `k` random 0/1 probe
vectors `r`; check `A·(B·r) == C·r` within `tol`, bailing the instant a probe disagrees:

```
P(false-accept of a wrong C) ≤ 2⁻ᵏ
cost:  O(k·n²)   (verify)   vs   O(n³)   (re-execute)
k = 20  ⇒  catch ≥ 1 − 2⁻²⁰ ≈ 0.99999905
```

*Assumptions:* independent probes · a uniformly-random probe vector · a non-adaptive adversary. The
bound is **per verify** (k=20 is the shipped default).

On any **drift / NaN / Inf**, the photonic value is **DENIED** and the **exact digital value is
committed** (tested: `target=digital`, `fellBack=true`, `value == exact`). Worst case = "stayed digital."

### 5.3 `dispatchPlan` total over exceptions (shipped 2026-06-21, `449d8f2`)

The per-decision dispatch loop is now **total**: a duck-typed **photonic-port throw** (kernel build or
route) **declines to the digital floor**; a **binary bridge fault / ternary-drift** becomes a governed
`ERR_BRIDGE_DISPATCH_FAULT` `trapFired` receipt. Neither escapes `infer()` as an ungoverned exception —
closing the one live, code-confirmed break of "fail-safe-to-Binary / no system crash."

---

## 6. Photonic pipe — tolerance / NMR / K3 dead-zone

Emulator-only today (every result honestly reports `executedNatively=false`); perf is **projected**,
not measured. The governance, however, is exact.

### 6.1 The noise model (`@galerina/substrate-math`)

```
pFlip  = 0.5·phaseDriftSigma + 0.5·crosstalkCoeff + 0.5·readoutSigma          // survive-but-flip
pBad   = laneFailureProb + (1 − laneFailureProb)·pFlip                        // lane delivers wrong trit
```

`pBad` is monotone non-decreasing in every device knob and always in `[0,1]`.

### 6.2 NMR — von Neumann N-modular redundancy (closed form, no sampling)

```
P_fail(pBad, N) = Σ_{k=⌈N/2⌉}^{N}  C(N,k) · pBad^k · (1 − pBad)^(N−k)     // N odd
```

— the probability that a **majority** of N independent lanes are bad. Strictly **decreasing** in odd N
for `pBad < 0.5`. Worked example, `pBad = 0.05`:

| N | P_fail | vs single lane (5%) |
|---|---|---|
| 1 | 0.05 | — |
| 3 | `3·0.05²·0.95 + 0.05³` = **0.00725** | ~7× better |
| 5 | **≈ 0.00116** | ~43× better |

Redundancy crushes the residual without any sampling — it is the exact binomial tail.

*Assumption:* **lane independence** (`ρ = 0`). Real hardware is correlated (`ρ > 0`); the framework is
unchanged — substitute a correlated-reliability model for the binomial when a measured `ρ` exists.

The `substrate{}` contract block + `verifySubstrate` pass enforce the rules: **crypto on a noisy lane is
ALWAYS an error**, the noise floor is **fixed-in-code** (an author cannot game the tolerance down),
malformed values fail closed, and an absent block is inert.

### 6.3 K3 dead-zone = fail-SAFE only

A **dead lane reads `0` = INDETERMINATE** — it can erase to "unknown" but can **never invent `±1`**. The
effective verdict is `vAnd(ideal, reading)`, which (§4.1) is monotone, so:

```galerina
// ideal = +1 (ALLOW); the lane dies mid-read → reading = 0
effectiveVerdict = vAnd(+1, 0) = 0 = INDETERMINATE → DENY      // fail-SAFE
```

Substrate noise spends **availability**, never **safety**.

---

## 7. The precision wall — why crypto/governance is Binary-only (SPORE-SUBSTRATE-001)

Any analog/noisy lane has a per-operation error `ε = pBad > 0`. Crypto/hashing/signatures require
**bit-exactness** — one flipped bit breaks the digest. Over `m` operations:

```
P(all m correct on a noisy lane) = (1 − ε)^m → 0   as m grows,  for any ε > 0
```

So a noisy lane can **never** be bit-exact. Therefore **crypto · governance · K3 · admission · secrets ·
control-flow · exact-arithmetic = Binary-ONLY by invariant** — the *proven precision wall*. Tolerance
mode (`determinismMode: "tolerance"`) is admitted **only** for eligible compute kernels, and only when
fully pinned: a finite `tolerance` + `pinnedEnvHash` + `backendArtifactHash` + a measured
`ToleranceWitness` with `ε_measured ≤ tolerance` (calibration-as-attestation).

---

## 8. Other stability mechanisms

- **DRCM containment** — the DSS supervisor on a minimal **Wasmtime TCB**; **fuel exhaustion as a
  trap**, V_DPM **monotonic** capability revocation (bits only *clear*, never set — SPORE-MONO-001),
  on-tamper zeroize. *(Real `DSS.wasm` is DRCM Phase 5, gated on #102-106 — see §9.)*
- **The Sentinels** (`galerina-core-sentinel-{memory,io,time,power,state,egress}`) — deterministic
  governors: fixed-block pool, HMAC integrity gate, logical clock + drift monitor, thermal
  down-tiering, HMAC-verified snapshots, tamper-evident audit egress.
- **Hardware-tier resolution** (`galerina-hardware-tier`) — tier resolved **once at boot** from an
  **attested** manifest; **strict-boolean zero-trust**: `attestationVerified !== true ⇒ binary`,
  `UNKNOWN ⇒ K3 INDETERMINATE ⇒ binary`. Pure + total; hashes into the plan.
- **Resilience-inference** (`resilience-inference.ts`) — `on_*_fault` handlers; `halt` = fail-closed
  default; `retry` forbidden on non-idempotent effects (`database.write`, `gateway.charge`) unless
  declared idempotent.

---

## 9. Honest weakest links + status

- **WEAKEST LINK — runtime crash-containment (Goal C, "no system crash") is asserted, not
  demonstrated.** The `T-008` test is a placeholder (`assert.ok(true)`), and `galerina diagnostic` only
  counts trap *declarations* at compile time — it never injects a real fault or confirms a trap *fires*.
  The full cross-instance isolation (4 MB shared-nothing DWI isolates, guard pages, fuel-as-trap) lives
  in **unbuilt DRCM Phase 5** (#40/#41, gated on the Wasmtime component model #102-106).
  *Owner-directed (2026-06-21): build the interim same-process supervisor harness now + relabel the
  diagnostic counts; the full isolation stays Phase-5-gated.*
- **Ranked hardening status** (from the re-R&D):
  1. ✅ **BUILT** (`449d8f2`) — `dispatchPlan` total over exceptions (§5.3).
  2. ✅ **BUILT (2026-06-22)** — split the receipt's truth channels: analog photonic values no longer fold
     into the bit-exact `ternaryChecksum`; a new `valuesReproducible` receipt flag goes false when one
     contributed (`hybrid-engine.ts`; tower-citizen 206/206; suite 53/53 · 4989).
  3. ✅ **BUILT (2026-06-22)** — Pin **SPORE-MONO-001** at the parser: `parseEmergencyBlock` surfaces an
     emergency-block `allow`/`grant` as an `allow:` node so the verifier's `EMERGENCY_EXPANDS_CAPABILITY`
     error fires (was silently swallowed → fail-silent permission widening). +5 tests; suite 53/53 · 4989.
  4. ✅ **BUILT (2026-06-22)** — both fail-open holes shut: certified-mode photonic admission bound to a
     verified signed manifest (`7a58a26`) + `maxTolerance` band clamp (already done); the caller-independent
     **`N_MAX` vote-count clamp** now built (`tmacVoted` bounds N to `[1, 1024]` via `clampVotes` — a
     non-finite/enormous caller N was an infinite-loop / resource-exhaustion fail-open). suite 53/53 · 4993.

**Recovery & the invariant gate (`SPORE-FAULT-005`, designed — enforcement gated).** Fault recovery is the
shipped `resilience { on_*_fault <action> }` block (R&D 0017, core `621fbda`) — *not* a new `recover {}`
block. The rule **`recover ⊨ invariant`**: a recovered result (a retry that succeeds, a `fallback` flow's
return) must still satisfy the flow's `invariant { ensure result }` post-condition, else `halt` (fail-closed).
Recovery is thus sandwiched — bounded **below** by `effects {}` (the capability floor: idempotency-gated
retry, `SPORE-FAULT-001` no-retry-past-deny, `SPORE-FAULT-002` fallback-effects-⊆-parent, monotone) and **above**
by `invariant {}` (the output gate). *Honest status:* the **retry** case is already structurally safe (the
single-exit `ensure result` gate gates every return); the **fallback** case is gated on the deferred
fallback-resolution (0017). So `SPORE-FAULT-005` enforcement ships **with** the fault-handler runtime / the
interim crash-containment harness — it is documented here, not claimed as a standalone shipped rule. Full
design: R&D 0059.

---

## 10. Summary — the invariant table

| Mechanism | Pipe | Fail mode | Key maths | Source |
|---|---|---|---|---|
| K3 governance | Binary | fail-CLOSED | `vAnd=min`; `vAnd(ideal,r) ≤ ideal` | `three-valued-governance.ts` |
| Integer traps | Binary | fail-CLOSED | overflow/÷0 propagate out | `interpreter.ts` (`isCheckedTrap`) |
| DbC post-conditions | Binary | fail-CLOSED | single-exit `unreachable` gate | `wat-emitter.ts` |
| Committed arena | Binary | fail-CLOSED | `minPages=maxPages`, no grow | `wat-emitter.ts` |
| Fuse border | Binary | fail-CLOSED | hash-pin · Ed25519+revoke · closed caps | `fuse-loader.ts` |
| Freivalds verify | Hybrid | fail-SAFE | `P(false-accept) ≤ 2⁻ᵏ`, `O(k·n²)` | `freivalds.ts` |
| dispatch totality | Hybrid | fail-SAFE | throw → decline/trap, no escape | `hybrid-engine.ts` |
| NMR redundancy | Photonic | fail-SAFE | `Σ C(N,k)pBad^k(1−pBad)^{N−k}` | `substrate-math/index.ts` |
| K3 dead-zone | Photonic | fail-SAFE | `vAnd(+1,0)=0` → deny | `substrate-model.ts` |
| Precision wall | — (invariant) | — | `(1−ε)^m → 0` ⇒ Binary-only crypto | `SPORE-SUBSTRATE-001` |

**Bottom line:** uncertainty in the Binary core **denies/traps** (fail-closed); a fault in an offloaded
kernel **falls back to the exact digital result** (fail-safe). The only path *up* — fabricating an
allow or a wrong-but-accepted value — is closed by `vAnd` monotonicity, Freivalds verification, and the
precision wall. The honest gap is *demonstrating* whole-process crash-containment (Goal C / DRCM Phase 5).

---

## 11. Formal structure (proved · tested · assumed)

The mechanisms above are meant to **compose** into a single claim. The proof program for this is tracked
in R&D `0059`, building on the existing formal-verification direction (note 40 / tasks 0024, 0040, 0014)
— the upgrade is *proofs that compose*, not new mechanisms.

**Global Safety Theorem (target).** For every execution `e`:
```
observable(e)  ⇒  Binary(e) ∨ Fallback(Binary(e))
```
— every observable result is produced by the Binary core or a Binary-approved fallback. Everything else
is a lemma: K3 monotonicity, Freivalds detection, the NMR residual, the precision wall, and dispatch
totality each discharge one obligation.

**The Tri-Pipe is a refinement chain.** Define `A ≤ B` ≝ "B is at least as safe as A". Then
`Photonic ≤ Hybrid ≤ Binary`, so `Photonic ≤ Binary` follows for free. A higher pipe may only *decline*
to a lower one; it can never exceed Binary's authority — §2 as an order relation.

**Authority is monotone.** With `Authority(DENY) = Authority(INDETERMINATE) = 0`, `Authority(ALLOW) = 1`,
`vAnd = min` gives `Authority(vAnd(a,b)) ≤ Authority(a)` — composition never *raises* authority.

**Fault taxonomy.** `{crash, omission, timing, Byzantine}`. The Binary core handles a **Byzantine**
(adversarial / systematically-drifting) component the same way it handles noise — **by DENY**, not by a
`3f+1` majority vote. Deny-by-default is strictly stronger than crash-only reasoning and avoids the cost
of a Byzantine quorum.

**Proved vs tested vs assumed** (the honest separation):

| Property | Status | Basis |
|---|---|---|
| K3 no-coercion / `vAnd` monotonicity | **proved** (depth ≤ 3 enumerated; unbounded = R&D 0059/0024) | `three-valued-governance.ts` |
| Freivalds false-accept ≤ 2⁻ᵏ | **proved** (standard) — *assumes* independent probes · random vector · non-adaptive adversary | `freivalds.ts` |
| NMR residual = binomial tail | **proved** (exact closed form) — *assumes* lane independence `ρ=0` | `substrate-math` |
| precision wall `(1−ε)^m → 0` | **proved** | §7 |
| dispatch totality (no escape) | **tested** (4 cases) | `dispatch-failsafe.test.mjs` |
| Stage-A ≡ Stage-B equivalence | **tested** (R6 corpus parity) → proof = R&D 0059/0014 | `tests/r6-corpus` |
| whole-process crash-containment (Goal C) | **asserted** (interim harness in progress; full isolation = DRCM Phase 5) | §9 |

The research-grade upgrade is to turn the **tested** rows into **proved** ones and machine-check the
Global Safety Theorem — *not* to add another fallback mechanism.
