# Reference — the epistemic trust-trit (RD-0337)

The three-valued **trust status a value carries** — `PROVEN` / `UNKNOWN` / `REFUTED` — and the small set of audited
gates that move it. This is the detail page behind the "Epistemic trust-trit" row in
[contract-authoring-model.md](../contract-authoring-model.md). It is a **Table 2 (auto-derived / tracked)** element:
the type-state tracks the trit for you; your only levers are the explicit gates below, and the underlying algebra is
**Table 3 (fixed)** — you cannot redefine how trust composes.

**Source of truth:** runtime `packages-galerina/galerina-tower-citizen/src/epistemic-type-state.ts`; the compiler
carries a lock-step mirror in `galerina-core-compiler/src/hardening-residency.ts` (`CompilerTrust`). **Verified
against source 2026-07-15.**

> **Honesty (from the source):** this is Kleene/Łukasiewicz **three-valued classical logic** — epistemic
> "we-don't-know" — **not a qubit**. The unique element over a 2-valued (Rust/alethic) type system is *represented*
> uncertainty: `UNKNOWN` is a first-class, contagious, fail-closed value, so a program is safe **not** because it
> knows everything but because it algebraically fail-closes on what it does not.

---

## A. The trit and its type-states

The trit uses the **same balanced encoding as the governance `Verdict`**, so the shipped Kleene folds operate on it
directly:

| Trit | Value | Type-state | Meaning |
|---|---|---|---|
| `PROVEN` | `+1` (= `Verdict.ALLOW`) | `Trusted<T>` | proof discharged — trusted for use here |
| `UNKNOWN` | `0` (= `Verdict.INDETERMINATE`) | `Unverified<T>` | not yet proven — **the fail-closed default** |
| `REFUTED` | `−1` (= `Verdict.DENY`) | `Refuted<T>` | proven-bad / verification failed — a **sticky** hard negative |

A value's trit **is** its brand: `Trusted<T>` (K=+1) is not assignable where a general value is wanted, and vice
versa. The compile-time type-state is ergonomic help; the **runtime boundary check is the real guarantee** and holds
even if the types are bypassed.

## B. How the trit moves (the only gates)

- **Enter** — `unverified(v)` admits a raw/external value at `UNKNOWN`. Fail-closed: a value that merely *exists* is
  never trusted (the antidote to "parsed ⇒ verified").
- **Lift** — `discharge(e, verify)` is the **only** sanctioned way `UNKNOWN → PROVEN`: it rises only through an
  actually-passing verifier. `verify → true` = `PROVEN`; `verify → false` = `REFUTED` (you checked; it failed); a
  verifier that **throws** = `UNKNOWN` (absence of evidence, not evidence of badness — and a previously-`PROVEN`
  value that throws on re-check **drops** to `UNKNOWN`).
- **Sticky refutation** — `REFUTED` is permanent: `discharge` can never resurrect it (No-Coercion downward). `refute(v, reason)`
  marks a value proven-bad.
- **Trusted root** — `trustedRoot(v, reason)` is the audited escape hatch for an axiomatic root (a compile-time
  constant, a hardware root); it requires a reason so it is logged. Prefer `discharge` — reaching `PROVEN` through a
  verifier is safer than asserting it.
- **Compose** — `combine(a, b)` sets the result trit to `vAnd` (min): least-trusted operand wins, contagiously
  (`Trusted + Unverified → Unverified`; `anything + Refuted → Refuted`). An untrusted operand can only **lower** the
  result, never manufacture trust. `combineAll([])` of the **empty** set is `UNKNOWN`, never a vacuous `PROVEN`
  (deny-by-default).
- **Preserve** — `map(e, f)` transforms the payload and keeps the trit (a pure transform adds and removes no trust).

## C. The trust boundary (fail-closed extraction)

`requireTrusted(e)` releases the payload **iff** it is `PROVEN`; both `UNKNOWN` and `REFUTED` deny and return `null`
— you cannot extract a value from a non-trusted wrapper. An `UNKNOWN` collapse is audited `FUNGI-GOV-3VL-001` (never
silent), reusing the same `decideAtBoundary` as the governance floor. This is the guarantee that holds even when the
compile-time type-state was bypassed.

**Optimistic-then-verify** (the photonic/analog tie-in): `optimistic(approx)` takes an approximate result *now*,
typed `UNKNOWN`, so it can be operated on but never mistaken for verified; `reconcile(e, exact)` discharges it
against the exact oracle. An approximate photonic/noisy-lane result is `INDETERMINATE` until the digital verify
discharges it — the trit-level statement of No-Coercion.

## D. The three axes (where the trit sits)

RD-0337 lifts the trit into a **3-axis value** `⟨what × whether-proven × classification⟩`:

- **Axis 1 (what)** — the payload type `T` (the only axis a 2-valued type system has).
- **Axis 2 (proven)** — this trust-trit; composes by `vAnd` (min); unlabeled → `UNKNOWN` → deny.
- **Axis 3 (classification)** — `public ⊑ internal ⊑ secret`; composes by **join / max** (most-restrictive wins);
  unlabeled → `secret` (deny-by-default). The two governed axes are deliberate mirrors — each propagates in its own
  safe direction from one `combine`.

The only way **up** axis 2 is `discharge` (a verifier); the only way **down** axis 3 is `declassify` — an explicit,
audited gate that **requires an encode/redact transform** (the payload that leaves is the encoded one, never the
original). `releaseTo(v, sinkClearance)` authorises **iff both** axes clear: `PROVEN` **and** classification ≤ the
sink's clearance (releasing `secret` to a `public` sink is a leak → DENY). This axis-3 story is documented from the
value's side in [value-states.md](value-states.md).

## E. The compiler mirror and the spill downgrade

The compiler is upstream of the runtime (it must not depend on `tower-citizen`), so it carries its **own** mirror of
the trit — `CompilerTrust` (`PROVEN`/`UNKNOWN`/`REFUTED`, names `Trusted`/`Unverified`/`Refuted`) in
`hardening-residency.ts`. The two are held **byte-identical by a mandatory fail-closed conformance gate**
(`compiler-trit ≡ runtime-trit`); without it the compiler could rule a value `Trusted` that the runtime would
`Refute`. The most important compile-time use: a **proven memory spill** past a residency ceiling re-types the value
`REFUTED` (`FUNGI-HARDEN-007`) — sticky and contagious, so it can no longer cross a boundary. See
[hardening.md](hardening.md).

---

*Provenance: `epistemic-type-state.ts` (`Trust`, `Epistemic`/`Trusted`/`Unverified`/`Refuted`, `discharge`,
`combine`/`combineAll`, `requireTrusted`, `optimistic`/`reconcile`, the 3-axis `TriTyped`/`declassify`/`releaseTo`);
`hardening-residency.ts` (`CompilerTrust`, conformance gate); RD-0337. Verified against source 2026-07-15.*
