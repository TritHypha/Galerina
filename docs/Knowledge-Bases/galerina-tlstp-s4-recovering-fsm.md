# TLSTP S4 — Recovering transport FSM above K3

> Build-guide for ONE adopted TLSTP survivor (the 0065 transport/auth cluster). Repo is **READ-ONLY**; all `file:line`
> citations resolve against `C:\wwwprojects\Galerina`. Binding posture: **crypto/KDF/cipher/signature/key bytes stay
> Binary (digital)**; photonics/analog feed ONLY a K3 governance verdict via `vAnd` (degrade-only), never a key.
> **Fail-closed (unknown → DENY).** No perf claim without a named-machine bench. Honest tiering throughout.

---

## 1. What it is + why adopted

**S4 is exactly ONE added *transport* state machine layered strictly *above* the shipped K3 governance trit** —
states `{ Established, Recovering, Closed/Erase }` — where **Recovering denies all data effects** while it holds the
channel, **Established is reachable ONLY via a fresh `+1` (ALLOW) verdict** (never silently), and **Recovering times
out to Closed/Erase** (keys zeroized), never silently to `+1`. It is adopted because it is net-new, in-bounds, and
crypto-on-core-clean: it adds zero crypto and zero new logic primitive — it is a thin wrapper over the shipped
`decideAtBoundary` (`packages-galerina/galerina-tower-citizen/src/three-valued-governance.ts:141-153`) and reuses the
shipped No-Coercion guarantee `e = vAnd(t*, r) ≤ t*` (`packages-galerina/galerina-tower-citizen/src/substrate-model.ts:14-18`).

Source disposition: **0065 §2-S4**
(`C:\wwwprojects\Galerina-R-AND-D\_session-bridge\done\0065-tlstp-trilogic-secure-transport-protocol-digital-core-spec.done.md:82-93`),
WILL-USE row **S4** in the explainer
(`docs/Knowledge-Bases/galerina-transport-auth-research-explained-2026-06-22.md:56`), and net-new item #8 in the
decision-support doc (`docs/Knowledge-Bases/galerina-tlstp-transport-auth-rnd-2026-06-22.md:67`). The critical
constraint — and the reason this design exists at all — is that the owner's note proposed a **parallel `+1/0/−1`
"holding" session trit**, which is **charter-forbidden** as a confusing alias of the governance trit: in K3,
`0 = INDETERMINATE` is **fail-closed-neutral**, NOT "holding"
(`docs/Knowledge-Bases/galerina-tlstp-transport-auth-rnd-2026-06-22.md:77-78`). S4 is the lawful replacement: a
SINGLE transport FSM state that *consumes* K3 verdicts but does not redefine the trit.

---

## 2. The maths, in detail

### 2.1 The two layers — and the strict prohibition against aliasing them

There are TWO distinct algebraic objects. They MUST NOT be merged.

**Layer A — the governance trit (shipped, K3 Kleene).** A `Verdict` is a balanced trit
(`three-valued-governance.ts:33,40-44`):

```
V = { -1, 0, +1 }
  -1 = DENY           (definite refusal)
   0 = INDETERMINATE  (fail-closed-neutral; proof undischarged / evidence incomplete)
  +1 = ALLOW          (proof discharged; may authorize)
```

ordered  `DENY < INDETERMINATE < ALLOW`. The conjunction `vAnd = min` (Kleene ∧, `three-valued-governance.ts:49-51`):

```
        vAnd | -1   0  +1
        -----+-------------
         -1  | -1  -1  -1
          0  | -1   0   0
         +1  | -1   0  +1
```

The boundary collapse (`three-valued-governance.ts:90-97,135`):

```
authorize(v)  ⇔  v = +1
collapse(v) = allow   if v = +1
            = deny     if v ∈ {0, -1}      // INDETERMINATE collapses to DENY, audited SPORE-GOV-3VL-001
```

This is **NOT** the FSM. K3's `0` is terminal-at-the-boundary (collapses to deny); it is **not** a state the
channel "sits in and waits." That distinction is the whole point of S4.

**Layer B — the transport FSM (this build).** A finite-state machine over a DISJOINT label set:

```
S = { Established, Recovering, Closed }
```

Let the FSM configuration be the pair `(s, K)` where `s ∈ S` is the transport state and `K` is the live key material
(the X25519+ML-KEM-768 chain keys held in memory). `K = ∅` denotes zeroized keys.

S maps to the K3 trit by a **total, non-injective output function** `μ : S → V` — the FSM *reads* the trit, it does
not *become* a trit:

```
μ(Established) = (gated on +1)     // only entered by a fresh +1 verdict
μ(Recovering)  = data effects DENIED (hold)
μ(Closed)      = -1 (Erase)
```

The forbidden alias would be a bijection `S ≅ V` with `Recovering ↦ 0`-as-"holding". We **reject** that: `0` is
fail-closed-neutral, so a "holding" `0` would have to be treated as "wait, maybe allow later" — which is exactly the
indeterminate-as-allow hazard K3 exists to forbid. Instead, `μ` is many-to-one and the FSM is a SEPARATE channel.

### 2.2 The transition relation

Let the per-event governance verdict be `g ∈ V`, produced by `decideAtBoundary` over the re-validation inputs
(cert/channel re-check, FEC budget, rekey status). Let `Δt` be wall-clock time spent in `Recovering`, and `τ > 0` a
declared (static) recovery timeout. Define the event alphabet:

```
fault       — a transient channel fault (FEC budget exhausted · rekey pending · cert re-validation transiently unknown)
reverify(g) — a fresh boundary decision producing verdict g ∈ {-1, 0, +1}
tick(Δt)    — time advances while Recovering
fatal       — an unrecoverable error / explicit teardown
```

The transition relation `δ : (S × Event) → S`, with the key-effect on `K` annotated:

```
δ( Established, fault )         = Recovering            ; K unchanged (held)
δ( Established, reverify(-1) )  = Closed                ; K := ∅  (erase)
δ( Recovering,  reverify(+1) )  = Established           ; K unchanged (resume)        ← the ONLY entry to Established
δ( Recovering,  reverify(0)  )  = Recovering            ; K held   (0 ≠ resume; stay)
δ( Recovering,  reverify(-1) )  = Closed                ; K := ∅  (erase)
δ( Recovering,  tick(Δt) ) with cumulative Δt ≥ τ = Closed ; K := ∅ (timeout → erase)
δ( any,         fatal )        = Closed                 ; K := ∅  (erase)
δ( Closed,      * )            = Closed                 ; K = ∅   (absorbing)
```

`Established` has NO incoming "default" edge — there is no edge `δ(_, _) = Established` other than `reverify(+1)`
from `Recovering` (or the initial handshake `+1`). This encodes the invariant.

### 2.3 Transition table (compact)

| From \\ Event | `fault` | `reverify(+1)` | `reverify(0)` | `reverify(-1)` | `tick`, Δt ≥ τ | `fatal` |
|---|---|---|---|---|---|---|
| **Established** | → Recovering (hold K) | (stay) | → Recovering (hold K) | → Closed (K:=∅) | n/a | → Closed (K:=∅) |
| **Recovering** | (stay, hold K) | **→ Established (resume K)** | → Recovering (hold K) | → Closed (K:=∅) | → Closed (K:=∅) | → Closed (K:=∅) |
| **Closed** | (stay, K=∅) | (stay, K=∅) | (stay, K=∅) | (stay, K=∅) | (stay, K=∅) | (stay, K=∅) |

Note the asymmetry that carries the safety property: every cell that leaves `Recovering` toward MORE privilege is
the SINGLE cell `reverify(+1)`. Every other escape from `Recovering` is toward `Closed/Erase`. A `0` (indeterminate)
keeps you in `Recovering` (it does NOT resume), because `0` is not `+1`.

### 2.4 The invariants, stated and proved

**Define the data-effect predicate** `permit_data(s) ⇔ s = Established`. Then:

**INV-1 (Recovering denies all data effects).**
`s = Recovering ⇒ ¬permit_data(s)`.
*Proof:* by definition `permit_data(s) ⇔ s = Established`; `Recovering ≠ Established`. ∎
This is total over the FSM: only `Established` permits payload egress. `Recovering` and `Closed` both deny.

**INV-2 (Established is reachable ONLY via a fresh `+1`; never silently).**
For all events `e`, if `δ(s, e) = Established` and `s ≠ Established`, then `e = reverify(+1)`.
*Proof:* inspect the transition relation §2.2. The only production whose right-hand side is `Established` with a
left-hand `s ≠ Established` is `δ(Recovering, reverify(+1)) = Established`. No `fault`, `reverify(0)`, `tick`, or
`fatal` edge targets `Established`. ∎
Corollary (no silent resume): there is no edge `δ(Recovering, ε) = Established` for any non-verdict event `ε`. In
particular a timeout (`tick`, Δt ≥ τ) goes to `Closed`, never `Established`.

**INV-3 (Recovering → Closed/Erase on timeout; keys zeroized).**
If `s = Recovering` and cumulative `Δt ≥ τ`, then `δ(s, tick) = Closed` and `K := ∅`.
*Proof:* direct from the `tick(Δt), Δt ≥ τ` row. The erase action `K := ∅` is part of every edge into `Closed`. ∎

**INV-4 (Closed is absorbing + erased).**
`s = Closed ⇒ ∀e. δ(s, e) = Closed ∧ K = ∅`.
*Proof:* the `Closed` row of §2.2/§2.3 maps every event to `Closed` with `K = ∅`. ∎

**INV-5 (the FSM cannot manufacture authority — it inherits K3 No-Coercion).**
The FSM never UPGRADES a verdict. Resume happens iff `reverify(+1)`; and `reverify` is computed by the shipped
`decideAtBoundary` over `vAnd`-folded sub-verdicts. By the shipped No-Coercion theorem
(`substrate-model.ts:14-18,200-206`):

```
e = vAnd(t*, r) ≤ t*           (Kleene ∧ = min; any side-reading r can only DEGRADE the ideal t*)
```

so no side-signal (telemetry, substrate, photonic tamper) can turn a `0`/`−1` into `+1`. Therefore the FSM's
`Recovering → Established` edge can fire only when the GOVERNANCE layer independently produced a genuine `+1`. The
FSM adds availability semantics (hold, time out) but contributes **zero** new path to ALLOW. ∎

**INV-6 (fail-closed default).** Any verdict the FSM cannot resolve to `+1` is treated as non-resume: `reverify(0)`
stays in `Recovering` (eventually timing out to `Closed`), and an unknown/error verdict is mapped to `0` BEFORE the
FSM sees it (it is `decideAtBoundary`'s job, `three-valued-governance.ts:135`), so unknown → `0` → not-`+1` → no
resume → eventual `Closed/Erase`. ∎

### 2.5 Why this is ONE state above K3, not a parallel trit (the algebra of the distinction)

A parallel-trit design would set `S = V` and define resume on the trit's own `0`. The defect is provable: if
`Recovering = 0` and `0` were "holding (maybe-allow)", then `collapse(0) = allow-later` contradicts the shipped
`collapse(0) = deny` (`three-valued-governance.ts:90-97,135`). The two readings of `0` are inconsistent. S4 avoids
the contradiction by keeping `S` and `V` disjoint and connecting them only through the total output map `μ` and the
input `reverify(g)` — so K3's `collapse` semantics are never overridden. `Recovering` carries the "wait" semantics;
the trit's `0` keeps its single fail-closed meaning. This is the charter Architectural-Stability requirement
(`docs/Knowledge-Bases/galerina-tlstp-transport-auth-rnd-2026-06-22.md:77`).

---

## 3. Worked examples

Symbols: `s` = transport state, `K` = key material (`held` / `∅`), `g` = verdict from `decideAtBoundary`,
`τ` = recovery timeout (declared static), `Δt` = time in `Recovering`. We use `τ = 5000 ms`.

### Example A — transient fault → Recovering → re-verify `+1` → Established (RESUME)

A live channel hits a transient cert re-validation hiccup, then re-validates cleanly.

| step | event | input verdict folding | `g = decideAtBoundary` | `δ` | new `s` | `K` | data effects |
|---|---|---|---|---|---|---|---|
| 0 | (steady) | — | `+1` | — | Established | held | **permitted** |
| 1 | `fault` (cert re-check transiently unknown) | — | — | `δ(Established, fault)` | **Recovering** | held | **DENIED** (INV-1) |
| 2 | `tick(1200 ms)` | — | — | Δt=1200 < τ | Recovering | held | DENIED |
| 3 | `reverify` — chain re-validates | `pin_match=+1, chain_valid=+1, not_expired=+1, revocation_fresh=+1` → `vAnd(+1,+1,+1,+1)=+1` | `+1` (`authorized=true`) | `δ(Recovering, reverify(+1))` | **Established** (INV-2) | held (resume) | **permitted** again |

Outcome: the channel survived the blip WITHOUT exposing any data while degraded, and resumed only on a genuine
fresh `+1`. Keys were never erased.

### Example B (DENY/FAILURE) — Recovering → timeout → Closed/Erase (keys zeroized)

Same start, but the peer never produces a fresh `+1` within `τ`.

| step | event | input verdict folding | `g` | `δ` | new `s` | `K` | data effects |
|---|---|---|---|---|---|---|---|
| 0 | (steady) | — | `+1` | — | Established | held | permitted |
| 1 | `fault` (FEC budget exhausted) | — | — | `δ(Established, fault)` | Recovering | held | **DENIED** |
| 2 | `reverify` — revocation status unreachable | `pin_match=+1, chain_valid=+1, not_expired=+1, revocation_fresh=`**`unknown→0`** → `vAnd(+1,+1,+1,0)=0` | `0` (`SPORE-GOV-3VL-001`, `authorized=false`) | `δ(Recovering, reverify(0))` | **Recovering** (stay; `0 ≠ +1`) | held | DENIED |
| 3 | `tick(2000 ms)` | — | — | Δt=2000 < τ | Recovering | held | DENIED |
| 4 | `reverify` — still unknown | `vAnd(+1,+1,+1,0)=0` | `0` | `δ(Recovering, reverify(0))` | Recovering | held | DENIED |
| 5 | `tick(3500 ms)` | — | — | **Δt=5500 ≥ τ** | `δ(Recovering, tick)` | **Closed** | **∅ (ERASE)** (INV-3) | DENIED permanently |
| 6 | any further event | — | — | absorbing | Closed | ∅ | DENIED |

Outcome (the deny case): a persistently INDETERMINATE channel **never silently resumes**. The unknown revocation
status folds to `0` via `vAnd` (the soft-fail hole is closed — unknown is NOT treated as fresh), `0` is not `+1` so
the FSM stays in `Recovering`, and at `Δt ≥ τ` it transitions to `Closed` with key zeroization. Contrast with a
naive "holding" trit that might have resumed on the `0` — INV-2 forbids it.

### Example C — Recovering → re-verify `−1` → Closed/Erase (hard deny, no timeout needed)

A re-validation returns a hard refusal (e.g., the peer presents a revoked key mid-session).

| step | event | input verdict folding | `g` | `δ` | new `s` | `K` |
|---|---|---|---|---|---|---|
| 0 | (steady) | — | `+1` | — | Established | held |
| 1 | `fault` (rekey pending) | — | — | `δ(Established, fault)` | Recovering | held |
| 2 | `reverify` — key now on revocation list | `revocation_fresh=`**`revoked→−1`** → `vAnd(+1,+1,+1,−1)=−1` | `−1` | `δ(Recovering, reverify(−1))` | **Closed** | **∅ (ERASE)** |

Outcome: a hard `−1` takes the channel straight to `Closed/Erase` — no waiting out the timeout. Note `vAnd` with
any `−1` operand yields `−1` (the conjunction's absorbing element), matching the truth table in §2.1.

---

## 4. The hard build path

**Owner gate.** B8 (`galerina-framework-api-server`) is **UNLOCKED** (owner, 2026-06-22), and S4 is in the greenlit
build order (security core, after S1 cert-gate)
(`docs/Knowledge-Bases/galerina-transport-auth-research-explained-2026-06-22.md:88`). "Owner-gated means ASK, don't
park" — S4 is a directed/adopted survivor, so it is GO. Build S1 (the K3 cert-gate) first; S4 consumes its verdicts.

### Ordered steps

1. **Place the module.** New file in the transport-adapter package that 0066 designs (B8 host plumbing), e.g.
   `packages-galerina/galerina-tower-citizen/src/transport-fsm.ts` (co-located with the K3 calculus it wraps so the
   import is in-package), OR in the B8 adapter package once it exists. Do NOT put FSM logic inside
   `three-valued-governance.ts` — keep Layer A (the trit) and Layer B (the FSM) in separate modules; that physical
   separation is what prevents the forbidden alias from creeping back in.

2. **Define the state + config types.**
   - `type TransportState = "Established" | "Recovering" | "Closed";`
   - `interface RecoveryConfig { timeoutMs: number; /* τ, static/declared */ }`
   - `interface FsmContext { state: TransportState; enteredRecoveringAt: number | null; keys: ChannelKeys | null; }`
   The timeout `τ` MUST be a **declared static** value (deny-by-default config), not runtime-mutable.

3. **Reuse `decideAtBoundary` UNCHANGED for the verdict.** Import
   `{ Verdict, vAnd, decideAtBoundary }` from
   `packages-galerina/galerina-tower-citizen/src/three-valued-governance.ts` (`:49-51`, `:141-153`). Produce `g` by
   folding the re-validation sub-verdicts with `vAnd` (this is the S1 cert-gate's
   `cert_verdict = vAnd(pin_match, chain_valid, not_expired, revocation_fresh)` —
   `0065 done §2-S1:48-50`). **Inputs:** the sub-verdicts (`Verdict[]`) + the current `FsmContext` + the event.
   **Outputs:** the next `FsmContext` (with possibly-erased keys) + the `BoundaryDecision` (so the
   `SPORE-GOV-3VL-001` diagnostic is propagated to audit, never dropped).

4. **Implement `step(ctx, event): { next: FsmContext; decision: BoundaryDecision | null }`** as a pure function
   over the §2.2 relation. The function must:
   - compute `g = decideAtBoundary(allOf(subVerdicts)).verdict` on a `reverify` event (forwarding the diagnostic);
   - apply the transition table exactly (§2.3);
   - perform key erasure on EVERY edge into `Closed`.

5. **Wire key erasure to the shipped zeroize path.** On any `→ Closed` edge, zeroize `ctx.keys` using the same
   best-effort secure-delete used by KEM-DEM (`packages-galerina/galerina-ext-tmf/src/kemdem.ts:185`,
   zeroize-in-finally). Set `ctx.keys = null` AFTER zeroizing the buffers.

6. **Gate data egress on `permit_data`.** The transport adapter (0066) must call `permit_data(ctx.state)` (i.e.
   `state === "Established"`) before any payload egress. Wire this as the single chokepoint so INV-1 is structurally
   enforced, not sprinkled.

7. **Pair with 0069 (DTM → degrade-only telemetry).** A Dynamic-Trust-Mesh-induced `0` (a telemetry threshold
   crossing discretized to `{−1,0}`, folded via `vAnd`, codomain never `+1` —
   `docs/Knowledge-Bases/galerina-transport-auth-research-explained-2026-06-22.md:60`) becomes a `fault`/`reverify(0)`
   input that drives `Established → Recovering`. **Critical:** the DTM signal can only DEGRADE (push toward
   `Recovering`/`Closed`); by No-Coercion it can NEVER drive `Recovering → Established`. Resume is gated on a fresh
   independent `+1`, not on telemetry "recovering."

### Inputs / outputs (contract)

- **Input:** an event (`fault | reverify(subVerdicts: Verdict[]) | tick(nowMs) | fatal`) + `FsmContext`.
- **Output:** next `FsmContext` (state transition + possible key erasure) + the `BoundaryDecision`
  (carrying the audited diagnostic on a `0`).
- **Side effect (only on `→ Closed`):** key zeroization.

### Tests to write

- `step(Established, fault) → Recovering`, keys held.
- `step(Recovering, reverify([+1,+1,+1,+1])) → Established` (the ONLY resume; assert `decision.authorized`).
- `step(Recovering, reverify([+1,+1,+1,0])) → Recovering` (stays; assert NO resume; assert `SPORE-GOV-3VL-001`
  diagnostic emitted, not dropped) — the Example B `0`-does-not-resume guard.
- `step(Recovering, reverify([+1,+1,+1,-1])) → Closed`, **keys == ∅** — Example C.
- `step(Recovering, tick)` with `Δt ≥ τ` `→ Closed`, **keys == ∅** — Example B timeout (INV-3).
- `step(Recovering, tick)` with `Δt < τ` `→ Recovering` (no premature close).
- **INV-2 property test:** for every event `e` and every `s ≠ Established`, `δ(s,e) = Established ⇒ e = reverify(+1)`
  (exhaustive over the finite alphabet × states) — proves "never silently to +1".
- **INV-4:** `Closed` is absorbing and keys stay `∅` for all events.
- **No-Coercion regression:** a degrade-only side-input (any `r ∈ {−1,0}`) folded via `vAnd` can never produce a
  resume — assert `vAnd(ideal, r) ≤ ideal` holds for the resume path (mirror `substrate-model.ts` No-Coercion test).
- **Alias-forbidden guard (charter):** assert there is no code path where the trit's `0` is read as "resume" — i.e.
  resume depends ONLY on `g === Verdict.ALLOW`, never on `g === Verdict.INDETERMINATE`.

### HARD PARTS / gotchas (called out)

- **(HARDEST — the charter trap) Do NOT alias the FSM state to the trit.** It is tempting to model the FSM as a trit
  with `Recovering ↦ 0`. That re-introduces the **charter-forbidden** confusing alias (`0 = INDETERMINATE` is
  fail-closed-neutral, NOT "holding") and creates the provable `collapse(0)` contradiction in §2.5. Keep `S` and `V`
  as **disjoint types**; connect them only through `reverify(g)` and the output map `μ`. If a reviewer can point at
  one line where the channel "resumes on a 0," the build has failed.
- **(SUBTLE) Resume must depend on `=== +1`, never on `≠ −1`.** A common bug is `if (g !== Verdict.DENY) resume`,
  which silently resumes on `0`. The condition MUST be `if (g === Verdict.ALLOW)` (mirror
  `authorize()`, `three-valued-governance.ts:95`). This is the INV-2 / INV-6 line.
- **(SUBTLE) Timeout goes to `Closed`, NOT to a retry-into-Established.** No edge from `tick` may target
  `Established`. A "soft retry that resumes" is the silent-resume hazard.
- **(EASY-TO-GET-WRONG) Erase on EVERY `→ Closed` edge, and erase BEFORE nulling.** `reverify(−1)`, `tick`-timeout,
  and `fatal` all erase. Zeroize the buffer contents (`kemdem.ts:185` pattern) and only then set `keys = null` — if
  you null-then-GC, the bytes may linger. Honest tier: TS/GC zeroization is **best-effort**; hardware-grade
  cold-boot-proof wipe is **aspirational-HW** (#102-106) — do not assert it as a guarantee.
- **(DETERMINISM) Time must be injected, not read from the wall clock inside `step`.** Pass `nowMs` in `tick(nowMs)`
  so the FSM is a pure, reproducible function (matches the substrate-model determinism discipline,
  `substrate-model.ts:20-22`). A wall-clock read inside `step` makes the FSM non-deterministic and untestable.
- **(AUDIT) Never drop the `SPORE-GOV-3VL-001` diagnostic.** `decideAtBoundary` returns it in the result on a `0`
  (`three-valued-governance.ts:145-151`); forward it to the AuditLogger sink. A `0` that silently keeps the channel
  in `Recovering` without an audit record is an observability hole.
- **(SCOPE) Do NOT re-implement K3, `vAnd`, or the boundary collapse.** They ship and are pinned by
  `tests/three-valued-governance.test.mjs`. S4 is a *wrapper*; importing and composing is the whole job. Adding a
  new trit operation is out of scope and risks diverging from the K3 oracle.

### Tiering (honest)

- **Buildable now (digital):** the FSM wrapper, the `vAnd`-fold of sub-verdicts, the erase-on-Closed, the egress
  chokepoint, and the 0069 telemetry pairing — all reuse shipped primitives.
- **Substrate-gated (#102-106):** the in-sandbox isolation *guarantee* of the transport adapter the FSM rides on
  (DRCM/DSS.wasm is a 115-byte stub). The FSM's correctness does NOT depend on that — it is pure logic over the
  verdict.
- **Aspirational-HW:** any photonic/optical tamper input is a degrade-only K3 `cnf`-row signal under the digital
  signature (0070), feeding the FSM only as a `fault`/`0` — never a key, never a resume.

---

*Sources: 0065 done §2-S4 (`...\_session-bridge\done\0065-...done.md:82-93`); explainer
`docs/Knowledge-Bases/galerina-transport-auth-research-explained-2026-06-22.md:56,60,88`; decision-support
`docs/Knowledge-Bases/galerina-tlstp-transport-auth-rnd-2026-06-22.md:67,77-78`; absorbed cluster
`docs/Knowledge-Bases/rd-absorbed/rd-tlstp-transport-auth-cluster-2026-06-22.md:30`. Shipped rails:
`three-valued-governance.ts:33,40-44,49-51,73-85,90-97,135,141-153`; `substrate-model.ts:14-18,200-206`;
`kemdem.ts:185`.*
