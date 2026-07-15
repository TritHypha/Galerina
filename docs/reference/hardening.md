# Reference — the `hardening { … }` block

The memory-residency, erase, timing, and substrate ceilings a value may carry. This is the detail page behind the
`hardening { … }` table in [contract-authoring-model.md](../contract-authoring-model.md). Hardening is the flagship
**Table 2 (auto-derived)** feature: you almost never write it — the compiler derives the safe floor from the value's
type — and when you do write it, an explicit value may only ever **tighten** that floor.

**Source of truth:** `packages-galerina/galerina-core-compiler/src/hardening-residency.ts` (RD-0358). **Verified
against source 2026-07-15.** Two things the overview table doesn't show, documented here: a **4th dimension
`substrate`**, and a **5th residency tier `unrestricted`** (the non-secret default / top of the lattice).

> **Honest scope (from the module header — do not overstate):** this is a governed, fail-closed **derivation +
> reconciliation** core. The *derivation* is proven; the actual `mlock` / register-pin / zeroize **execution** is
> host + `#143`-switch territory — checker-verified shadows today, not yet build-wired. `timing constant` is
> **honestly partial**: constant-time is undecidable in general, so the checker flags a checkable subset and does not
> *prove* constant-time. Hardening **shrinks and governs** a memory-attack surface; it never zeroes it.

---

## A. How hardening works (the shared slots)

- **What (in general)** — a value's maximum **memory-residency tier** (plus erase / timing / substrate) is a
  governed property. The threat model treats memory as hostile (DRAM spill, swap-to-disk, cold-boot, NVLeak-class
  side-channels), so how far a value may travel down the memory hierarchy is a first-class, fail-closed contract.
- **Where — authored** — `contract { hardening { residency: … erase: … timing: … substrate: … host: … } }`. Any
  dimension may be omitted. The `audited_loosen` token appears here when an explicit value deliberately weakens a
  secret's floor.
- **Where — enforced** — `hardening-residency.ts`: `deriveAuto` (derive the floor) → `reconcileExplicit` (merge an
  explicit block, tighten-only) → `resolveHost` + `canHonour` (is the ceiling physically deliverable?). Diagnostics
  `FUNGI-HARDEN-001..007`.
- **How — the tighten-only law** — an explicit value stricter than the derived floor is always adopted (provenance
  `explicit-tighten`). An explicit value **weaker** than a *secret's* floor is a **loosen**: it requires the
  `audited_loosen` opt-out (which governance may still refuse); without the token it is a `FUNGI-HARDEN-004`
  rejection and the **stricter derived value is kept** (fail-closed — never silently weaker). A non-secret setting
  its own looser ceiling is fine (it had no floor to loosen).
- **How — the host seam** — a residency ceiling is only real if the declared host provides the primitive. An
  **undeclared or incapable host fails closed**: the ceiling is unhonourable (`FUNGI-HARDEN-005`) and the value is
  **rejected, never silently spilled**.
- **If omitted** — `deriveAuto` supplies the floor from what the type system already knows: a `Secret<T>`,
  `Tainted<T>`, or a `secret.read` effect → the **secret floor** (`no_swap` · `on_exit` · `constant` · `binary`);
  anything else → **no hardening** (`unrestricted` · `none` · `unconstrained` · `any`). The common case needs **zero
  developer annotation**.
- **Result — guarantee** — the derived (or reconciled) hardening is the value's injected contract. A value that
  **provably spills past its ceiling** is re-typed `REFUTED` (sticky + contagious) — `FUNGI-HARDEN-007` — so it can
  no longer be released at a trust boundary and anything derived from it inherits the refutation. That is the *loud
  governed downgrade*, not a silent leak. `--show-derived` exposes exactly what was injected; a deterministic
  fingerprint (FNV-1a over the canonical form) makes the CI differential a total detector of a weakened injection.

### Diagnostics

| Code | Meaning | Severity |
|---|---|---|
| `FUNGI-HARDEN-001` | `residency` is not a recognised tier | error |
| `FUNGI-HARDEN-002` | `erase` is not a recognised mode | error |
| `FUNGI-HARDEN-003` | `timing` is not a recognised discipline | error |
| `FUNGI-HARDEN-004` | a secret's derived default was **loosened** without `audited_loosen` | error |
| `FUNGI-HARDEN-005` | the declared host **cannot honour** the residency ceiling → reject | error |
| `FUNGI-HARDEN-006` | a secret-dependent branch/index under `timing constant` (checkable subset only) | warning |
| `FUNGI-HARDEN-007` | a **proven spill** re-types the value `REFUTED` (sticky + contagious) | error |

---

## B. The fields

### `residency`  · [Auto-derived]
**What** — the loosest memory tier a value's storage may reach. A total-order lattice (strictest first); the derived
secret default is `no_swap`.
**Legal values** —

| Ceiling | Rank | Guarantee | Host primitive needed |
|---|---|---|---|
| `register_only` | 0 (strictest) | registers only — never L-cache/DRAM/swap/disk | register-pin (TRESOR-class) |
| `no_dram_spill` | 1 | registers + on-package SRAM/cache — never DRAM | on-package pinning |
| `no_swap` | 2 | may touch DRAM but **never** swap/disk — **the derived secret default** | `mlock` |
| `no_disk` | 3 | may swap but never persist to disk | no-persist |
| `unrestricted` | 4 (top) | no ceiling — **the non-secret default** | none |

`unrestricted` is the internal non-secret default; the user-facing "valid ceilings" list (`FUNGI-HARDEN-001`) is the
four bounded tiers.
**If omitted** — `no_swap` for a secret, `unrestricted` otherwise.
**Result** — an explicit ceiling may only tighten (lower the rank); loosening a secret needs `audited_loosen`
(`FUNGI-HARDEN-004`). A ceiling the host can't deliver is rejected (`FUNGI-HARDEN-005`); a proven crossing re-types
`REFUTED` (`FUNGI-HARDEN-007`). The deny-only `memory.spill` effect is the *effect-side* mirror of this ceiling —
declaring a spill can never buy admission.
**Example** — `hardening { residency: register_only }` on an in-register-only session key.

### `erase`  · [Auto-derived]
**What** — whether the value's storage is zeroed when it leaves scope. `on_exit` scrubs the backing memory; `none`
leaves it (the non-secret default).
**Legal values** — `on_exit` · `none`. Derived secret default: `on_exit`.
**If omitted** — `on_exit` for a secret, `none` otherwise.
**Result** — `on_exit` is the strict pole; downgrading a secret from `on_exit` to `none` is a loosen (needs
`audited_loosen`, else `FUNGI-HARDEN-002` for a bad value / `FUNGI-HARDEN-004` for an unaudited loosen).

### `timing`  · [Auto-derived]
**What** — whether the value's use must avoid secret-dependent timing. `constant` obliges branch/index paths not to
depend on the secret; `unconstrained` does not.
**Legal values** — `constant` · `unconstrained`. Derived secret default: `constant`.
**If omitted** — `constant` for a secret, `unconstrained` otherwise.
**Result** — **honestly partial:** constant-time is undecidable in general, so `FUNGI-HARDEN-006` flags the
*checkable subset* (a secret-dependent branch or index found under a `timing constant` obligation) as a warning and
explicitly does **not** prove constant-time. The real proof is out of scope for the checker.

### `substrate`  · [Auto-derived]  *(not in the overview table — documented here)*
**What** — which execution substrate the value may run on. `binary` pins it to the **deterministic binary core**;
`any` allows a noisy/analog lane. This is why crypto and secret material never touch the photonic/analog lane — a
secret's derived substrate is `binary`.
**Legal values** — `binary` · `any`. Derived secret default: `binary`.
**If omitted** — `binary` for a secret, `any` otherwise.
**Result** — the strict pole is `binary`; loosening a secret to `any` is an audited loosen. This composes with
No-Coercion: an analog lane may move a value's *data* but its result is never a verdict or a key.

### `host`  · [Standard, when a ceiling is declared]
**What** — names the host seam that must provide the residency primitive. Not a ceiling itself — the *evidence* that
a ceiling is deliverable.
**Legal values** — `register_pinned` (honours every ceiling; design-stage) · `mlock_posix` (`no_swap` + `no_disk`
only) · any undeclared name → `UNKNOWN_HOST`.
**If omitted** — `UNKNOWN_HOST` — **fail-closed**: nothing is guaranteed, so any non-`unrestricted` ceiling is
unhonourable and rejected (`FUNGI-HARDEN-005`).
**Result** — the ceiling is only as real as the host that backs it; declaring a ceiling without a capable host is a
rejection, not a silent best-effort.

### `audited_loosen`  · [Standard opt-out]
**What** — the explicit token that turns a secret-weakening directive from a hard rejection into a **visible,
audited, deny-by-default act**. It does not force the loosen — governance may still refuse it — it makes the loosen
*declarable and logged*.
**If omitted** — any secret loosen is a `FUNGI-HARDEN-004` rejection and the strict derived value is kept.
**Result** — with the token, provenance becomes `audited-loosen` and the weaker value is recorded as a deliberate,
auditable exception rather than an accident.

### Provenance (tracked, not written)

Every derived hardening carries a **provenance** stamp: `auto-derived` (the floor, untouched) · `explicit-tighten`
(the developer tightened it) · `audited-loosen` (a logged, deliberate weakening) · `none` (non-secret, no hardening).
`--show-derived` prints it so a reviewer sees exactly why each value carries the ceiling it does.

### Threat-model grounding — why "assume memory is hostile" (RD-0369)

The residency ceiling is not defensive theatre. Off-chip and persistent memory is a **live, software-reachable
side-channel surface**, and the mitigations map one-to-one onto the tiers here:

- **Off-chip / NVM caches leak.** Non-volatile memory modules carry their own internal caches; a purely-software
  strided-timing attack reverse-engineers their structure and reads a co-resident victim through it — demonstrated
  in the literature as a database-operation fingerprint (which SQL ran → full-DB leakage) and, most sharply, a
  **crypto-key recovery** (a flush+reload on shared crypto code recovers private-key bits). The **`register_only` /
  `no_dram_spill` / `no_swap`** residency tiers are exactly the "keys and secrets never touch a spillable,
  co-resident memory device" rule that defends that key-recovery case; **`erase: on_exit`** closes the
  leave-behind; **`timing: constant`** closes the timing channel.
- **Pooled / fabric memory (CXL) is cross-tenant.** Disaggregated memory shared across hosts is a co-residency +
  side-channel problem — its own design literature insists a granted region be root-of-trust-mediated and isolated
  from other guests. The same posture applies: treat shared/persistent memory as an **untrusted substrate,
  deny-by-default**, which is what the `substrate` dimension expresses.

**Honest tier.** This is *design grounding*, not a shipped mitigation of a specific attack: it is why the ceiling
exists and why its execution (`mlock` / zeroize, `#143`-gated) matters. The specific product exposures stay in the
internal threat model (they are not published). The paired **bounded-memory governance pattern** — prefer a
declared, fixed-size memory envelope over an unbounded cache on any governed path (DoS-resistant, predictable,
auditable) — is the AI/resource-tier analogue of this same fail-closed instinct.

---

*Provenance: `hardening-residency.ts` (`ResidencyTier`, `EraseMode`, `TimingDiscipline`, `Substrate`, `deriveAuto`,
`reconcileExplicit`, `resolveHost`/`canHonour`, `HARDENING_DIAGNOSTICS`); RD-0358. Execution (`mlock`/zeroize) is
`#143`-gated. Verified against source 2026-07-15.*
