# Galerina — GIR Emitter Architecture

## Principle

```
GIR should be the compact, deterministic, verified bridge between Galerina governance
and target execution.
```

GIR represents only **verified program facts** — it does not re-decide security.

## Status

```
Phase 8 baseline:    GIRFlow, GIRProgram, emitGIR(), buildSemanticGraph() ✅
Phase 15:            PassiveExecutionPlan in GIRFlow ✅
Phase 18G:           Expanded tensor metadata, sourceHash, entryPoints,
                     effectsMask/capabilitiesMask in GIRFlow ✅
Phase 21+:           Binary GIR format, WASM/WASI lowering
Phase 22+:           Typed expression-level IR for codegen
```

## Pipeline Position

```
Parser
  → Type checker
  → Value-state checker
  → Effect checker
  → Governance verifier
  → GIR emitter         ← here
  → PassiveExecutionPlan
  → RuntimeManifest
  → WASM / Native / GPU / NPU backend
```

---

## GIRProgram Structure (Phase 18G)

```typescript
GIRProgram {
  schemaVersion: "lln.gir.v1"
  sourceHash: string              // SHA-256 of source text (deterministic)
  generatedAt: string             // ISO timestamp (stripped in canonical hash)
  girHash?: string                // SHA-256 of canonical GIR (post-emission)
  flows: GIRFlow[]
  entryPoints: string[]           // names of flows that are route/API entry points
}
```

---

## GIRFlow Structure (extended in Phase 18G)

```typescript
GIRFlow {
  name: string
  qualifier: "flow" | "pure" | "guarded" | "secure"
  effects: GIREffect              // declared, observed, status
  intent: GIRIntent               // declared string, satisfied/mismatch/null
  protected_values: GIRProtectedValue[]
  audit: GIRAudit                 // protected_values_redacted
  execution: GIRExecution        // preferred targets, denied, fallback
  proofs: GIRProof[]
  tensors: GIRTensorInfo[]       // expanded in Phase 18G
  target_affinity?: GIRTargetAffinity
  executionPlan?: PassiveExecutionPlan
  capabilities: Map<string, string>  // effect → host.capability
  contract?: GIRContract
  allowedEffectsMask: number      // EffectFlags bitset (Phase 18G)
  requiredCapabilitiesMask: number // future — CapabilityFlags bitset
}
```

---

## GIRTensorInfo — Expanded (Phase 18G)

```typescript
GIRTensorInfo {
  name: string
  type: string                    // full annotation "Tensor<Float32, [768]>"
  elementType: string             // "Float32"
  shape: string                   // "[768]" or "[Batch, 768]"
  photonic_compatible: boolean    // Float16/Float32, no Int8 without dequantize
  // Phase 18G additions:
  wasmSimdCompatible: boolean     // element-wise ops compatible with WASM SIMD
  gpuCompatible: boolean          // shader-compatible element type + static shape
  npuCompatible: boolean          // deterministic, fixed shape, Float32/Int8
  apuSharedMemoryCandidate: boolean  // readonly + pure + fixed shape
  fixedShape: boolean             // no dynamic dimensions (Batch, Seq, etc.)
  quantized: boolean              // Int8 element type — requires dequantize for mix
}
```

---

## Numeric Internal IDs (Phase 21+)

Keep human-readable JSON for audit/AI/debugging. Add compact numeric IDs for runtime:

```
FlowId    — numeric ID for fast plan lookup
EffectId  — numeric ID (see EffectFlags in type-registry.ts, already done)
TypeId    — numeric ID (see TypeId in type-registry.ts, already done)
CapabilityId — numeric ID for capability host dispatch
TargetId  — numeric ID for compute target selection
```

TypeId and EffectFlags are already implemented in Phase 18D. GIR will carry them in Phase 21.

---

## Binary GIR Format (Phase 21+)

```
gir.json   — human/audit/AI readable (current)
gir.bin    — compact binary for fast runtime loading
```

The binary format uses:
- Int32Array for numeric IDs
- Compact effect masks
- No string allocation in hot path
- WASM-compatible layout

---

## WASM/WASI Lowering (Phase 21+)

GIR should emit enough data for WASM:
```
allowedImports    — which host functions may be called
memoryLimits      — max allocation per flow
effectMask        — what effects the WASM module may produce
entryPoints       — exported function names
auditProofMeta    — hash of verified GIR to include in WASM custom section
```

---

## RuntimeManifest from GIR (Phase 20+)

GIR feeds RuntimeManifest generation:
```
allowedEffectsMask        → runtime fast-path check
requiredCapabilitiesMask  → host import verification
deniedTargetsMask         → compute target policy
privacyPolicyMask         → PII/redaction enforcement
```

---

## Linear Memory Planning Metadata (Phase 22+)

For WASM/APU/GPU:
```
readonly inputs     → zero-copy shared memory candidate
owned buffers       → explicit allocation/deallocation
tensor shapes       → static layout (Float32Array size = product of dims)
temporary allocs    → scratchpad lifetime = one call
redacted outputs    → zeroed after return
```

---

## Legacy to Demote

Current string parsing in GIR for protected values and tensors:
```typescript
parseBindingValue(declaration.value ?? "")  // parsing "unsafe email: Email" as string
```

Phase 19: replace with:
- `NodeFlags` (structural, parser-detected)
- `ValueStateFlags` (value-state-checker-proven)
- `TypeId` (type-registry numeric ID)
- `TensorTypeInfo` from `parseTensorType()`

---

## Deterministic GIR Hash

Already implemented: `hashGIR()` strips `generatedAt` and sorts keys before SHA-256.

Extended in Phase 18G: `GIRProgram.sourceHash` carries the source text hash so the full determinism chain is:

```
sourceHash → girHash → planHash → attestationHash → proofChain
```

---

## GIR and Canonical Contract Format

GIR should only be generated from flows using canonical syntax:
```galerina
contract {
  effects {
    database.write
    audit.write
  }
}
```

Not legacy:
```galerina
with effects [database.write]  ← SPORE-SYNTAX-LEGACY-001 warning, GIR still emits
```

---

## Implementation Status

| Feature | Status |
|---|---|
| GIRFlow (effects, intent, protected_values, audit, execution, proofs) | ✅ Phase 8 |
| GIRTensorInfo (name, type, elementType, shape, photonic_compatible) | ✅ Phase 8 |
| PassiveExecutionPlan in GIRFlow | ✅ Phase 15 |
| girHash (canonical SHA-256) | ✅ Phase 16A |
| SemanticGraph emission | ✅ Phase 8 |
| sourceHash in GIRProgram | ✅ Phase 18G |
| entryPoints[] in GIRProgram | ✅ Phase 18G |
| Expanded tensor metadata (wasmSimd, gpu, npu, apu, fixedShape, quantized) | ✅ Phase 18G |
| allowedEffectsMask in GIRFlow | ✅ Phase 18G |
| Binary GIR format | 📋 Phase 21 |
| WASM/WASI lowering metadata | 📋 Phase 21 |
| Numeric internal IDs in GIR | 📋 Phase 21 |
| Linear memory planning metadata | 📋 Phase 22 |
| Typed expression-level IR | 📋 Phase 22 |
