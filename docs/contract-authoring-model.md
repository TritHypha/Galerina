# The Galerina contract-authoring model — "born governed"

In Galerina, every flow declares its governance in source, inside a `contract {}` block, and the compiler
**supplies the floor** for anything the developer leaves unstated. The result is a system where a contract can
be *under-specified* but never *under-governed*: an omitted residency ceiling is auto-derived to the safe floor,
an omitted trust-trit is tracked automatically, and the fixed invariants (the K3 calculus, fail-closed collapse,
the admission border) cannot be opted out of at all.

This document splits governance into three tiers:

1. what the developer **adds as standard** (mandatory — it will not compile / it fails the tier floor without it),
2. what the developer **may add but is automated** if they don't (an optional override of an auto-derived floor),
3. what is **automated and the developer cannot add or override** (the fixed floor).

---

## 1. What the developer adds in contracts as standard

Mandatory. The flow will not compile, or will fail the production tier floor, without these.

| Element | Form | Enforced by |
|---|---|---|
| Flow intent | `contract { intent { "…" } }` per flow | tier floor `FUNGI-TIER-001` + the `;;` govComment / GSCM gate |
| Declared effects | `effects { domain.verb }` (e.g. `database.write`, `network.send`) | `CANONICAL_EFFECTS` registry + `effect-canonicality` audit |
| Typed boundary | typed params/returns; `unsafe let raw` for untrusted boundary input | value-state checker (Tainted/Secret) |
| Invariants | `invariant { … }` blocks the flow asserts | governance-verifier |
| Capability boundary | the declared effect set **is** the closed capability surface | `#105` admission capability mask |

## 2. What the developer can optionally add, but is automated if they do not

The developer may refine any of these; if they omit it, the compiler derives the safe floor. An explicit value
can only ever **tighten** the auto-derived floor (loosening is audited and logged).

| Element | If omitted → auto | Mechanism |
|---|---|---|
| Memory residency ceiling | derived from the Secret/Tainted type (`register_only` / `no_disk`) | RD-0358 `deriveAuto` → `reconcileExplicit` (explicit only tightens; audited-loosen is logged) |
| Effect-set precision | inferred and validated against the body; under-declaration flagged | `checkEffects` |
| Trust-trit assertions | PROVEN / UNKNOWN / REFUTED tracked automatically | epistemic trust-trit (runtime + compiler mirror) |
| Value-state redaction | Tainted / Secret values propagate and gate at sinks automatically | value-state + sink-canonicality |
| Audit obligations | an Epilogue Receipt (`sha256_seal`) is emitted regardless | tower-citizen audit lifecycle |

## 3. What is automated that the developer cannot add or override

The fixed floor. A contract can neither weaken nor bypass these — they are the governance guarantees the
platform exists to enforce.

| Element | Why it is fixed |
|---|---|
| The K3 verdict calculus (`vAnd` = min, `allOf`, `authorize`) | the governance algebra itself — a contract cannot redefine ALLOW / DENY / INDETERMINATE |
| Fail-closed boundary collapse (INDETERMINATE → DENY; `FUNGI-GOV-3VL-001`) | the deny-by-default invariant; a lone `+1` can never lift a `0` |
| No-Coercion (a side-signal may only *lower* a verdict) | prevents a measurement / side-channel from manufacturing an ALLOW |
| The `#105` admission gate (hash-pin · signature · revocation · capability mask) | the package / kernel trust border; not contract-configurable |
| Hybrid Ed25519 + ML-DSA-65 signing / attestation | the cryptographic floor (certified mode mandates both halves) |
| WASM lowering + host-as-byte-mover posture | the execution model; the contract declares intent, the compiler lowers it |

---

## Net

A developer **writes Table 1**, *optionally* refines **Table 2**, and can neither weaken nor bypass **Table 3**.
An under-specified contract is auto-hardened to the floor (Table 2) and can never escape the fixed invariants
(Table 3). That is what "born governed" means: the safe default is not a convention the developer must remember —
it is the compiler's floor, applied whether or not the contract asks for it.

---

## Legal vocabularies — what can be written for each closed field

Fields with a **closed vocabulary** accept only the values below; anything else is a compile error. Fields that
are **open** (free text / expressions) are noted as such. The effect set is the single source of truth
`CANONICAL_EFFECTS` (in `effect-checker.ts`), kept drift-free by `scripts/audit-effect-canonicality.mjs` — this
list is verified against it; regenerate from source if in doubt.

### `effects { … }` — the declarable effect vocabulary (grouped by domain)

| Domain | Legal `domain.verb` effects |
|---|---|
| Data / storage | `database.read` · `database.write` · `cache.read` · `cache.write` · `storage.read` · `storage.write` · `state.read` · `state.write` · `ledger.mutate` |
| Network / messaging | `network.outbound` · `network.inbound` · `network.external` · `network.internal` · `email.send` · `message.publish` |
| Secrets & crypto | `secret.read` · `secret.write` · `crypto.verify` · `crypto.sign` · `crypto.encrypt` · `crypto.decrypt` · `crypto.seal` · `crypto.sign.ed25519` · `crypto.sign.mldsa65` · `crypto.sign.slhdsa` · `crypto.sign.hybrid` · `random.generate` |
| Compute & AI | `compute.cpu` · `compute.gpu` · `compute.npu` · `ai.inference` · `ai.train` · `native.call` |
| System / lifecycle | `process.spawn` · `worker.spawn` · `event.schedule` · `shell.execute` · `clock.read` · `telemetry.read` · `desktop.user.read` |
| Sensitive data | `pii.read` · `phi.read` · `phi.write` · `payment.charge` |
| Audit | `audit.write` |

- **Aliases:** call-site–friendly names resolve to the canonical effect above — e.g. `http.get`/`https.post` → `network.outbound`, `database.find` → `database.read`, `Crypto.sign` → `crypto.sign`, `Secrets.get` → `secret.read`. Declare either form; the checker canonicalises.
- **DENY-ONLY (recognised but NEVER grantable — declaring one is a hard error, `FUNGI-EFFECT-006`):** `eval.execute` · `memory.spill`. They exist in the vocabulary only so an author gets the real reason, never a typo hint.

### `hardening { … }` — the residency / erase / timing ceilings

| Field | Legal values (strictest → loosest) | Omitted → |
|---|---|---|
| `residency` | `register_only` · `no_dram_spill` · `no_swap` · `no_disk` | auto-derived from the Secret/Tainted type |
| `erase` | `on_exit` · `none` | auto-derived |
| `timing` | `constant` · `unconstrained` | auto-derived |

Explicit values may only ever **tighten** the auto-derived floor; loosening requires the audited opt-out (`FUNGI-HARDEN-004`).

### Epistemic trust-trit (RD-0337) — tracked automatically, asserts only these

`PROVEN` · `UNKNOWN` · `REFUTED`. The developer does not usually write these; the type-state tracks them and a proven spill re-types a value `REFUTED` contagiously.

### Value-states — the boundary-data lattice

`Unsafe` (untrusted boundary input) · `Safe` · `Validated` (a checked subset of Safe) · `Tainted` (derived from Unsafe through a non-gate) · `Secret` (`SecureString`, approved ops only), with `Protected` / `Redacted` sensitivity qualifiers. The **only** declassifier is `seal()` / `encrypt()`. Enforced by `FUNGI-SECRET-001..003` + `FUNGI-VALUESTATE-004`.

### Open fields (no closed vocabulary)

- `intent { "…" }` — free text (a human-readable purpose; required, but any string).
- `invariant { … }` — boolean expressions over the flow's values (open, but must type-check).
