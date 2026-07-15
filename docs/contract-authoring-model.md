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
