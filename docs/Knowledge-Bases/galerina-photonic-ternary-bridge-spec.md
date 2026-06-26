# Galerina Photonic and Ternary Computing Spec

## Status

```text
Scope: language + compiler contracts for Tri and photonic bridge
Runtime impact: none (Stage A runtime intentionally untouched)
Phase: 13+ (bridge + type/operator enforcement)
```

## Rules at a Glance

- `Tri` is a distinct three-valued type; it is not `Bool`.
- `if` conditions require `Bool`; `Tri` must use `match`.
- `Tri.and/or/not` are explicit operations with defined truth tables.
- Photonic bridge is compute-only; governance/control remains electronic.
- No bridge path may change `Tri` semantics or match exhaustiveness requirements.
- Photonic lowering requires deterministic encoding and calibration evidence before activation.

---

## Purpose

Define a compiler-safe contract for:
1. Ternary logic (`Tri`) in type checking and lowering.
2. Photonic compute bridging for compatible ternary/tensor operations.

---

## Tri Type Model

Canonical `Tri` values: `True`, `False`, `Unknown`

`Tri` is algebraically total and must be handled exhaustively in `match`.

---

## Tri Operations

### `Tri.not(x)`

| x | not(x) |
|---|---|
| True | False |
| False | True |
| Unknown | Unknown |

### `Tri.and(a, b)`

| a\b | True | False | Unknown |
|---|---|---|---|
| True | True | False | Unknown |
| False | False | False | False |
| Unknown | Unknown | False | Unknown |

### `Tri.or(a, b)`

| a\b | True | False | Unknown |
|---|---|---|---|
| True | True | True | True |
| False | True | False | Unknown |
| Unknown | True | Unknown | Unknown |

---

## Tri Match Requirement

```galerina
match decision {
  True    => ...
  False   => ...
  Unknown => ...
}
```

Compiler rule: missing any arm emits non-exhaustive match diagnostic. Wildcard `_` allowed only if policy permits catch-all.

---

## Type System Enforcement

Required checks:
1. `if`, `while` conditions reject `Tri` (must be `Bool`).
2. `Tri.and/or` args must both be `Tri`.
3. `Tri.not` arg must be `Tri`.
4. `Tri` cannot be silently coerced to `Bool`.

Diagnostics:
- `SPORE-TYPE-031` InvalidTriCondition
- `SPORE-TYPE-032` InvalidTriOperand
- `SPORE-TYPE-033` TriBoolImplicitCoercionDenied

---

## GIR and Bridge Metadata

```ts
interface GIRTriInfo {
  readonly usesTri: boolean;
  readonly triOps: readonly ("and" | "or" | "not" | "match")[];
  readonly exhaustiveMatchProven: boolean;
  readonly photonicCandidate: boolean;
}
```

`photonicCandidate=true` only when: operations are compute-compatible, data shape/encoding satisfies bridge constraints, deterministic profile constraints are met.

---

## Photonic Bridge Contract

Photonic bridge MAY lower: pure ternary combinational kernels, tensor operations marked photonic-compatible, deterministic reductions.

Photonic bridge MAY NOT lower: authority checks, effect gating logic, audit emission logic, unresolved dynamic control flow.

### Photonic Eligibility Predicate

All must be true:
1. Operation class is in allowlist (`tensor_map`, `tensor_reduce`, `tri_kernel`).
2. Data encoding explicitly declared (`ternary-balanced`, `fixed-point`, or approved quantized form).
3. Deterministic profile constraints satisfied.
4. Calibration evidence present and fresh for selected device profile.
5. Hardware trust profile accepts selected photonic bridge.

Diagnostics:
- `SPORE-PHOTONIC-001` MissingPhotonicCalibration
- `SPORE-PHOTONIC-002` UnsupportedPhotonicOp
- `SPORE-PHOTONIC-003` DeterminismRisk
- `SPORE-PHOTONIC-004` TrustProfileMismatch

---

## Balanced Ternary Representation (Compiler Internal)

Internal encoding: `-1` = False, `0` = Unknown, `+1` = True. Surface language remains `True/False/Unknown`.

---

## Security and Correctness Invariants

1. Tri operation truth tables are canonical and immutable.
2. Any photonic fallback must preserve result equality.
3. Governance diagnostics unaffected by photonic routing decisions.
4. No implicit Bool conversion from Tri under any target.
5. Exhaustiveness proof is target-independent.
6. Photonic execution must produce attestable evidence equivalent to electronic path.
7. Unknown (`0`) ternary state may not be collapsed to binary without explicit conversion op and policy approval.

---

## Test Additions

1. Truth-table conformance tests for `Tri.and/or/not`.
2. Type errors for `if triValue { ... }`.
3. Exhaustiveness error for `match` missing `Unknown`.
4. GIR includes `GIRTriInfo` when Tri used.
5. Bridge planner routes photonic candidate + deterministic fallback behavior.
6. Cross-target parity: CPU vs bridge outputs identical for Tri kernels.
7. Deterministic replay tests with calibration drift simulation.
8. Negative test: unsupported mixed control-flow kernel must reject photonic lowering.
9. Proof test: photonic execution emits calibration and parity evidence records.

---

## External References

- Integrated Photonic Systems Roadmap (IPSR): https://www.mtl.mit.edu/sites/default/files/media/documents/2025/roadmap-2025-042825.pdf
- Quantum-noise-limited optical neural networks: https://pmc.ncbi.nlm.nih.gov/articles/PMC10635295/
- Balanced ternary architecture (Setun): https://en.wikipedia.org/wiki/Setun

---

## Related Knowledge Base Files

- `galerina-core-logic-tri-decision-bool.md` — runtime TriState/Decision logic contracts (galerina-core-logic package)
- `galerina-core-logic-tristate-developer-guide.md` — developer guide for runtime Tri logic patterns
- `galerina-photonic-distinct-compute-model.md` — photonic as a distinct compute substrate (types, IR, wavelength model)
- `galerina-core-photonic-backend-architecture.md` — governance-first photonic runtime architecture
- `galerina-core-photonic-governance-architecture.md` — photonic governance overlay spec
- `galerina-phase13-passive-plans-target-bridges.md` — Phase 13 TargetBridgePlan and HardwareTrustProfile contracts
- `formal-type-system-spec.md` — authoritative type rules and SPORE-TYPE-* diagnostics
- `mathematics-and-tri-logic.md` — mathematical foundations for Tri
