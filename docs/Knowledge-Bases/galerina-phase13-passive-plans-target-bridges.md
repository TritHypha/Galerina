# Galerina Phase 13: Passive Execution Plans and Target Bridges

## Status

```text
Scope: compiler-side architecture and contracts
Runtime impact: none in this document (Stage A runtime intentionally untouched)
Phase: 13 (GIR -> Plan -> Target Bridge)
```

## Rules at a Glance

- Passive plans are derived from checked GIR, never from raw source text.
- Target bridges map plan steps to CPU/GPU/NPU/WASM/Photonic capabilities without changing semantics.
- Governance/effect/audit constraints remain authoritative; bridges cannot widen permission.
- Bridge selection is deterministic under deterministic profile.
- Unsupported bridge ops must degrade to governed CPU path, not bypass checks.
- Hardware trust requirements (attestation, memory safety, enclave policy) are part of target eligibility, not runtime best effort.

---

## Purpose

Phase 13 defines the compile-time path:

```text
AST (checked) -> GIR -> PassiveExecutionPlan -> TargetBridgePlan
```

This path optimizes execution placement while preserving:

- intent
- declared effects
- trust/sensitivity boundaries
- audit/proof obligations

---

## Pipeline Position

Canonical order for this phase:

1. Parse + checker passes
2. `emitGIR(...)`
3. `buildExecutionPlan(...)` (passive plan)
4. `buildTargetBridgePlan(...)` (new bridge layer)
5. Backend/lowering emits target-specific artifacts

---

## Phase 13 Data Contracts

### 1) PassiveExecutionPlan (input to bridges)

Use existing `PassiveExecutionPlan` from `src/runtime/executionPlan.ts` as input contract.

Required invariants for bridge eligibility:

- `planHash` exists and is deterministic
- `approvedCapabilities` is non-empty for effectful flows
- step sequence is canonicalized
- qualifier is one of `pure | guarded | secure | flow`

### 2) TargetBridgePlan (new)

```ts
interface TargetBridgeStep {
  readonly stepIndex: number;
  readonly sourceKind: string;
  readonly bridgeOp: string;
  readonly target: "cpu" | "gpu" | "npu" | "wasm" | "photonic";
  readonly requiresEffects: readonly string[];
  readonly deterministic: boolean;
}

interface TargetBridgePlan {
  readonly flow: string;
  readonly sourcePlanHash: string;
  readonly targetOrder: readonly ("cpu" | "gpu" | "npu" | "wasm" | "photonic")[];
  readonly selectedTarget: "cpu" | "gpu" | "npu" | "wasm" | "photonic";
  readonly fallbackTarget: "cpu" | "wasm" | null;
  readonly steps: readonly TargetBridgeStep[];
  readonly deniedTargets: readonly string[];
  readonly bridgeHash: string;
}
```

### 3) HardwareTrustProfile (new, required for secure/guarded)

```ts
interface HardwareTrustProfile {
  readonly attestation: {
    readonly required: boolean;
    readonly acceptedAlgs: readonly ("ed25519" | "ml-dsa-44" | "ml-dsa-65" | "ml-dsa-87")[];
    readonly minEvidenceVersion: string | null;
  };
  readonly memorySafety: {
    readonly requireMTE: boolean;
    readonly requireCHERI: boolean;
  };
  readonly enclave: {
    readonly requireTEE: boolean;
    readonly acceptedTEE: readonly ("tdx" | "sev-snp" | "cca" | "sgx")[];
  };
}
```

Compiler rule:

- `secure` and policy-marked `guarded` flows must carry a resolved `HardwareTrustProfile`.
- Missing required profile fields is a compile-time governance error.

---

## Target Bridge Semantics

### CPU bridge
- Baseline governed execution target.
- Must support all plan step kinds.
- Default fallback for denied/unsupported target ops.

### WASM bridge
- Preferred for pure deterministic numeric/data-parallel segments.
- No permission widening; effectful operations remain host capability calls.

### GPU bridge
- Eligible for tensor/matrix/vector kernels and bulk transforms.
- Host effect calls (network/db/audit/etc.) never executed inside GPU kernel.

### NPU bridge
- Eligible for inference-style kernels with fixed constraints.
- Must preserve declared effect boundaries and auditing.

### Photonic bridge
- Eligible only for declared photonic-compatible operations and types.
- Control flow and governance checks remain electronic/governed.

---

## Bridge Selection Algorithm (Deterministic)

1. Read flow `compute target` preferences from GIR
2. Filter by denied targets
3. Filter by bridge capability matrix
4. Filter by profile (`deterministic` may deny non-deterministic paths)
5. Filter by hardware trust profile
6. Choose first eligible target from preferred order
7. If none eligible -> fallback target (CPU preferred) if and only if fallback still satisfies trust profile

---

## Capability Matrix (Compiler-owned)

```text
opClass            cpu  wasm  gpu  npu  photonic
------------------------------------------------
scalar_int         Y    Y     N    N    N
scalar_float       Y    Y     N    N    N
tensor_map         Y    Y     Y    Y    Y*
tensor_reduce      Y    Y     Y    Y    Y*
effect_call        Y    host  host host host
audit_write        Y    host  host host host
control_flow       Y    Y     N    N    N
```

`Y*` means only when photonic compatibility predicate is satisfied.

---

## Security and Governance Invariants

1. No undeclared effect execution.
2. No target bridge may remove required audit writes.
3. Protected/redacted behavior unchanged.
4. Fallback path must keep same policy outcome as primary path.
5. Bridge failure is recoverable to governed CPU, not silent success.
6. Attestation algorithm policy is enforced at plan time and verify time.
7. Any hardware trust downgrade is explicit and policy-audited.

---

## Compiler Work Items (Phase 13)

1. Add `buildTargetBridgePlan(...)` module.
2. Add bridge hash generation from canonical plan JSON.
3. Emit bridge diagnostics: `SPORE-TARGET-101` through `SPORE-TARGET-103`.
4. Attach bridge summary to GIR flow metadata.
5. Add deterministic snapshot tests for bridge plans.
6. Add `HardwareTrustProfile` merge logic.
7. Add post-quantum migration checks.

---

## Test Additions

1. Same flow + same profile -> same `bridgeHash`.
2. Denied target in compute block -> deterministic fallback and diagnostic.
3. WASM/GPU/NPU candidate flow preserves effect call boundaries.
4. Bridge split/fallback does not change output or diagnostics.
5. Photonic-eligible op routed to photonic only when compatibility predicate is true.
6. `requireTEE=true` flow denied on non-TEE bridge selection.
7. `requireMTE=true` flow denied when target metadata lacks MTE evidence.
8. `acceptedAlgs=["ml-dsa-65"]` rejects ed25519-only attestation proofs.

---

## External References

- NIST FIPS 204 (ML-DSA): https://csrc.nist.gov/pubs/fips/204/final
- Arm MTE: https://www.kernel.org/doc/html/latest/arch/arm64/memory-tagging-extension.html
- CHERIoT: https://www.microsoft.com/en-us/research/publication/cheriot-complete-memory-safety-for-embedded-devices/
