# The logic of Galerina — three values, not two

> The one idea under everything. Galerina's **decision logic is three-valued, not boolean** — the third
> value is **"unknown," and it is first-class.** Every governance verdict, trust check, and the `Tri` type
> carries it. Verified from source (`three-valued-governance.ts` · `epistemic-type-state.ts` ·
> `type-registry.ts`).

## 1. Boolean vs. Galerina

Ordinary values can still be **`Bool`** (true/false) — arithmetic and plain logic are unchanged. But every
**decision** — *may this be admitted? is this trusted? may this cross the boundary?* — is a **balanced trit**:
**`+1`, `0`, `-1`**. The middle value, **`0`, is "unknown"** (INDETERMINATE). It is **not** an error, **not** a
null — it is a legitimate answer: *"I could not prove this."*

| | `-1` | `0` | `+1` |
|---|---|---|---|
| **Governance verdict** | DENY | **INDETERMINATE (unknown)** | ALLOW |
| **Trust (a value's status)** | REFUTED (proven-bad) | **UNKNOWN (not yet proven)** | PROVEN |
| **Order** | | `DENY < UNKNOWN < ALLOW` | |

Boolean forces two answers; Galerina allows the honest third: *I don't know.* And "I don't know" **defaults to no.**

## 2. Why three, not two (the zero-trust reason)

- **Binary safety** = the safety of *eliminated* uncertainty: prove everything, or reject. Real systems can't
  prove everything — so binary forces a **guess**, and a guess **fails open** (the classic hole: "not a
  definite no ⇒ proceed").
- **Three-valued safety** = the safety of *represented* uncertainty: carry "unknown" as a first-class,
  contagious, fail-closed value. You are safe **not** because you know everything, but because you
  **correctly, algebraically fail-close on what you don't.**

The one-liner: **"unknown" is a valid, safe answer — and it collapses to DENY.**

## 3. The four laws (how the trit behaves)

1. **Only `+1` authorizes.** At a trust boundary, admit **iff** the value is exactly `+1`. Both `-1` (deny)
   **and** `0` (unknown) deny. (`authorize(v) ⇔ v == +1`)
2. **Fail-closed collapse.** At a boundary, `0` (unknown) collapses to **DENY**, and it is **loud** — it emits
   `FUNGI-GOV-3VL-001`, never silent. A lone `+1` can never lift a `0`.
3. **Deny-by-default.** The empty case (no evidence) is `0` (unknown), **not** a vacuous "yes."
   (`allOf([]) = INDETERMINATE`)
4. **No-Coercion.** Verdicts compose by the **minimum** (`vAnd = min`). An unknown or hostile input can only
   ever **lower** the result, never raise it — a measurement, a sensor, a side-signal can **never manufacture
   an ALLOW.**

## 4. Where the trit lives (it is everywhere)

- **The verdict** — every governance gate outputs a trit; gates compose by `min` (`vAnd`). *(`three-valued-governance.ts`)*
- **The trust-trit** — a *value* carries its own epistemic status: `PROVEN` / `UNKNOWN` / `REFUTED`
  (`Trusted<T>` / `Unverified<T>` / `Refuted<T>`). The same trit, lifted from the verdict layer up to the type
  layer. A value releases across a boundary **iff** it is `PROVEN`; the **only** way `UNKNOWN → PROVEN` is
  passing an actual verifier (`discharge`), and `REFUTED` is **sticky** (can never be resurrected).
  *(`epistemic-type-state.ts`; see [trust-trit.md](trust-trit.md))*
- **The `Tri` type** — the three-valued native type in the type system (`Bool` is 2-valued; `Tri` is
  3-valued). *(`type-registry.ts`; see [types.md](types.md))*
- **The classification axis** — a *different* trit-lattice (`public ⊑ internal ⊑ secret`) that composes by
  **MAX** (most-restrictive wins; unknown → `secret`). Trust composes by min, sensitivity by max — each fails
  safe in its own direction. *(see [value-states.md](value-states.md))*
- **NOT the execution lanes** — `HOT / STANDARD / OFFLOAD / DENIED` is a *placement* label; it must **never**
  be read as a trust trit. Keep the lane, the verdict, and the classification distinct.

## 5. The honesty guard (say this every time)

This is **classical Kleene / Łukasiewicz three-valued logic** — an epistemic *"we don't know."* It is **NOT a
qubit, NOT quantum, NOT superposition.** The three values are discrete (`-1` / `0` / `+1`). Never let
"three-valued" be sold as "quantum" — that overclaim is exactly what the claim-hygiene gate
(`scripts/audit-claim-hygiene.mjs`) forbids.

## 6. The mental model

- A gate doesn't return true/false — it returns a **trit**, and **unknown is a real outcome**.
- Compose with `vAnd` (**min**): the least-trusted input wins, contagiously.
- At the boundary, **only `+1` passes**; `0` and `-1` both deny — and `0` is **audited**.
- A value you haven't proven is **`UNKNOWN`, and `UNKNOWN` cannot cross a trust boundary.**
- This is why Galerina **fails closed by construction**: the logic itself refuses to guess. Everything else —
  the `#105` admission gate, hardening, the HotPath triple lock — is this one trit, composed.

---

*Provenance (verified from source 2026-07-15): `galerina-tower-citizen/src/three-valued-governance.ts`
(`Verdict` = DENY/INDETERMINATE/ALLOW = `-1`/`0`/`+1` at the enum; `vAnd` = min; `allOf([]) = INDETERMINATE`;
`authorize` = `+1` only; `decideAtBoundary` → `FUNGI-GOV-3VL-001` on a `0`; Kleene `vNot` preserves
indeterminacy) · `epistemic-type-state.ts` (`Trust` = REFUTED/UNKNOWN/PROVEN; `discharge`/`requireTrusted`) ·
`type-registry.ts` (`Bool` vs `Tri`). Classical K3, not a qubit.*
