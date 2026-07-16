# The Galerina automated governance floor — what the compiler enforces that you cannot write

This is the companion to [contract-authoring-model.md](contract-authoring-model.md). That document covers what the
**developer writes** (standard) or **may write** (optional). This one documents the **fixed floor** — the
governance the compiler and runtime apply that a contract can neither add, configure, nor override. It is
**reference, not authoring**: you cannot opt out of any of it, but you should understand what runs beneath you.

Everything here corresponds to Table 3 of the authoring model, expanded with the "what" for each mechanism.

---

## 1. The K3 verdict calculus

The three-valued (Kleene-K3) governance algebra. Every gate produces a **trit**, and verdicts compose by it. It is
**not re-implemented** — it reuses the balanced-ternary gates (`minTrit`/`maxTrit`/`negTrit`) from `tpl-simulator.ts`
under `Verdict`-typed names, and the exact K3 match is pinned by `three-valued-governance.test.mjs`.

| Concept | Value / rule |
|---|---|
| Trits | `-1` DENY · `0` INDETERMINATE · `+1` ALLOW (a total order: DENY < INDETERMINATE < ALLOW) |
| `vAnd(a, b)` | `min` — Kleene ∧. `+1` identity, `-1` annihilator, `0` the fail-closed floor |
| `vOr(a, b)` | `max` — Kleene ∨ (the more-permissive verdict wins) |
| `vNot(a)` | Kleene ¬ — ALLOW ↔ DENY; INDETERMINATE ↦ INDETERMINATE (indeterminacy preserved) |
| `allOf([…])` | `vAnd`-reduce — `+1` iff every element is `+1`; `-1` iff any is `-1`; else `0`. **Empty → INDETERMINATE** (deny-by-default, never a vacuous ALLOW) |
| `anyOf([…])` | `vOr`-reduce — same deny-by-default empty → INDETERMINATE |
| `authorize(v)` | admit **iff** `v == +1` |
| `decideAtBoundary(v)` | the audited collapse: `+1` → allow · `-1` → deny (silent, ordinary policy) · `0` → deny **+ `FUNGI-GOV-3VL-001`** (it is structurally impossible to drop a `0` silently) |

**No-Coercion is structural, not a convention.** A side-signal folds into a verdict ONLY as a `vAnd`/`min` conjunct,
so it can only ever *lower* the result — and the same law holds for the tensor fold (`vAndTensor`), the N-vote
consensus (`consensusTritN`, where a tie collapses to INDETERMINATE), and the continuous confidence vector
(`collapseConfidence`, where an ambiguous or low-confidence score fails safe to INDETERMINATE). None can manufacture
an ALLOW or become a key.

A contract cannot redefine this algebra — it is what ALLOW/DENY/INDETERMINATE *mean*.

## 2. Fail-closed boundary collapse

At any trust boundary an `INDETERMINATE` (`0`) collapses to **DENY**, and emits `FUNGI-GOV-3VL-001`. A lone `+1`
can never lift a `0`. This is the deny-by-default invariant: a factor that cannot be *proven* ALLOW is treated as
DENY (e.g. a revocation-*unknown* closes the channel — no configurable "soft-fail").

## 3. No-Coercion

A degrade-only side-signal folded via `vAnd` can only ever **lower** a verdict (`+1→0`, `+1→-1`, `0→-1`) and can
**never lift** one (`0→+1`, `-1→+1`). A measurement, telemetry reading, or photonic/analog lane may contribute to
a channel verdict but can never manufacture an ALLOW or become a key.

## 4. The `#105` admission gate

No package or kernel unit executes until it passes, fail-closed, every gate — none contract-configurable:

| Gate | Check |
|---|---|
| Hash-pin | content-address of the artifact matches the pinned digest |
| Signature | attestation-first signature verifies against the trust anchor |
| Revocation | the signing key is not revoked (revocation-unknown → DENY) |
| Capability mask | the unit's declared effect/capability set is within what policy grants |
| Registry | the unit is admitted through the signed registry index |

## 5. Cryptographic floor

Hybrid **Ed25519 + ML-DSA-65** (NIST FIPS 204) signing on the attestation, proof-graph, and bridge surfaces — both
halves required, no post-quantum downgrade. Under `GALERINA_MANIFEST_PROFILE=certified` the hybrid signature is
*mandated* (fail-closed: `FUNGI-MANIFEST-PQ-REQUIRED`). Crypto ops run bit-exact on the deterministic core, never
on a noisy/analog lane.

## 6. Epilogue receipts + append-only audit trail

> **Full detail** — the receipt fields, `onFailure` modes, and the four strategies: [reference/receipts.md](reference/receipts.md).
> (Receipts are automated — emitted regardless of the contract — so their reference lives on this floor doc, not the authoring doc.)

Every governed execution emits an **Epilogue Receipt**; the strategy is fixed by profile, not by the contract:

| Strategy | Status |
|---|---|
| `sha256_seal` (and `auto`, which resolves to it) | implemented — SHA-256 of source + contract hash |
| `zk_snark_receipt` | explicit stub — prover backend not yet integrated (admissible in a certified profile only with a real, non-placeholder circuit) |
| `none` | receipt suppressed (non-certified) |

Every security trap additionally appends an `AuditEvent` (CBOR Tag 410) to an append-only log.

## 7. Execution model

- **Compile-time proof, runtime enforcement.** Governance is verified by the compiler; the contract declares
  intent, the compiler lowers it to WASM. There is no runtime surprise.
- **Host-as-byte-mover.** The host OS is assumed hostile; native capabilities are denied by default; authorisation
  is the fail-closed `vAnd` K3 gate, never OS-level I/O injected into a `main`.
- **DSS supervision (V_DPM register).** The Governed Tower tracks the Virtual Dynamic Posture Matrix — every
  capability use is a bitmask check, every trap a structured `AuditEvent`. *(Stage-A TypeScript simulation today;
  the real `DSS.wasm` deterministic-isolation TCB is #102–106, post-P9.)*

---

## Net

These are the guarantees the platform **exists** to enforce. You build **on** them; you do not configure them. An
attempt to weaken any of them is not a policy setting — it is a compile error or a fail-closed DENY. Together with
the developer-written contract (Table 1) and the auto-derived floor (Table 2), they make a flow *born governed*:
under-specified is safe, and the fixed invariants hold whether or not the contract asks for them.
