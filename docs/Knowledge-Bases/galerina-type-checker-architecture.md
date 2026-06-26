# Galerina — Type Checker Architecture

## Status

```
Phase 6 baseline:   SPORE-TYPE-001..009, SPORE-TYPE-020..022 ✅
Phase 9A-2:         SPORE-TYPE-003 branded types ✅
Phase 11:           SPORE-TYPE-010..019 formal spec canonical mapping ✅
Phase 18D:          TypeId, EffectFlags, ComputeCompatibilityFlags, SPORE-TYPE-030/031 ✅
Phase 19+:          Stop regex re-parsing, TypeRegistry, full inference
Phase 21+:          Iterative graph checking, structural fingerprints
```

## Principle

```
The Galerina type checker should prove types, effects, privacy boundaries, and
compute compatibility from structured compiler data — not from raw source text.
```

## Pipeline Position

```
Lexer → Parser → AST
                  ↓
            Symbol Resolver
                  ↓
            Type Checker       ← here
                  ↓
            Value-State Checker
                  ↓
            Effect Checker
                  ↓
            Governance Verifier
```

---

## Top Priorities

```
1. Stop regex re-parsing (Phase 19)
2. TypeId registry (Phase 18D stub → Phase 19 full)
3. Practical bidirectional inference (already done ✅)
4. Protected/redacted as type qualifiers (partially done ✅, SPORE-VALUESTATE-006/007)
5. Tensor shape checking (Phase 18D: SPORE-TYPE-030/031 → Phase 21A full)
6. Effect/capability bitsets (Phase 18D: EffectFlags ✅)
```

---

## 1. Stop Regex Re-Parsing (Phase 19)

**Current state:** The type checker re-parses raw source strings using regex to extract type information (flow names, match patterns, typed lets, parameters).

**Goal state:**
```
Lexer → Parser → AST → Type Checker
```

The type checker should only read `AstNode` fields (`kind`, `value`, `children`). No raw source scanning, no regex on type names, no string splitting on `:`.

**Benefits:** correctness, speed, determinism, future self-hosting, AI repair accuracy.

---

## 2. TypeId Numeric Registry

Instead of checking types as strings in `Set<string>` / `Map<string, ...>`, use numeric IDs:

```typescript
const TypeId = {
  Unknown: 0, Void: 1, Int: 2, Float32: 3, Float64: 4, Decimal: 5,
  String: 6, Bool: 7, Tri: 8, Char: 9, Byte: 10, Bytes: 11,
  SecureString: 12, Result: 13, Array: 14, Tensor: 15, Json: 16,
  Email: 17, Uuid: 18,
  // Custom/generic types start at 100
} as const;
```

Benefits:
- Faster comparison (`=== 2` vs `=== "Int"`)
- Less memory (one shared number vs duplicated string)
- Canonical hashing (number sorts stably)
- Better PassiveExecutionPlan output

Phase 18D: the `TypeId` constant object is exported. The type checker still uses string names internally — migration happens in Phase 19.

---

## 3. Flat Type Registry (Phase 19+)

```typescript
interface TypeRegistryEntry {
  readonly id: TypeId;
  readonly name: string;
  readonly kind: "primitive" | "generic" | "branded" | "domain" | "computed";
  readonly arity: number;      // generic arity (0 for non-generic)
  readonly flags: number;      // compute/privacy flags
  readonly shape?: readonly number[];  // tensor shape if applicable
}
```

Every checker pass refers to `TypeId`. String names are only used for diagnostics.

---

## 4. Effect / Capability Bitsets

For common effects, use bitsets:

```typescript
const EffectFlags = {
  None:            0,
  DatabaseRead:    1 << 0,
  DatabaseWrite:   1 << 1,
  NetworkOutbound: 1 << 2,
  AuditWrite:      1 << 3,
  AiInference:     1 << 4,
  NetworkInbound:  1 << 5,
  FileSystemRead:  1 << 6,
  FileSystemWrite: 1 << 7,
  CryptoVerify:    1 << 8,
} as const;
```

Effect subset check becomes: `requiredEffects ⊆ declaredEffects` as `(required & declared) === required`.

Phase 18D: exported as constants. Phase 19: effect checker uses bitsets for hot checks.

---

## 5. Compute Compatibility Flags

Attach these flags when type-checking a flow:

```typescript
const ComputeCompatibilityFlags = {
  None:             0,
  TensorCompilable: 1 << 0,  // all ops are tensor ops, no dynamic shapes
  PureMath:         1 << 1,  // only mathematical operations, no I/O
  FixedShape:       1 << 2,  // tensor shapes statically known
  NoDynamicBranch:  1 << 3,  // no runtime-dependent control flow
  ReadonlyInputs:   1 << 4,  // all parameters are readonly
  SIMDCompatible:   1 << 5,  // operations can use SIMD
} as const;
```

The type checker proves these properties. The SemanticGraph and ExecutionPlanner decide hardware targets. No hardware planning in the type checker.

---

## 6. Tensor Shape Checking

**Phase 18D (constants):** SPORE-TYPE-030 (TensorElementTypeMismatch), SPORE-TYPE-031 (TensorDimensionMismatch)

**Phase 21A (full):** Verify for `Tensor<ElementType, [d1, d2, ...]>`:
- Element type compatibility (Float32 ≠ Int8 without explicit conversion)
- Shape dimension count matches
- Static dimensions are equal; dynamic (Batch, Seq, etc.) are compatible

```text
Tensor<Float32, [768]>   ✓  compatible with  Tensor<Float32, [768]>
Tensor<Float32, [768]>   ✗  incompatible with Tensor<Int8, [768]>  → SPORE-TYPE-030
Tensor<Float32, [768]>   ✗  incompatible with Tensor<Float32, [Batch, 768]>  → SPORE-TYPE-031
```

---

## 7. Protected/Redacted as Type Qualifiers

```galerina
protected Email
redacted Email
secret protected SecureString
```

This is already a static type error (SPORE-VALUESTATE-006/007 in the value-state checker):
```galerina
let plain: Email = protectedEmail  // → SPORE-VALUESTATE-006
```

Phase 19: migrate to type checker as `SPORE-TYPE-018b` variant, keeping value-state for taint propagation.

---

## 8. Structural Fingerprints (Phase 21+)

For record/domain types, compute a stable shape fingerprint:
```
PatientProfile = canonicalHash({fields: [...sorted by name...], qualifiers: [...]})
```

Useful for: fast compatibility checks, canonical hashing, AI graph output, package boundary checks.

---

## 9. Iterative Graph Checking (Phase 21+)

Replace deep recursive type walks with:
```
work queue → process node → enqueue dependencies → repeat until stable
visited set → prevent cycles
```

Prevents stack overflow on large files. Required before Galerina can type-check itself.

---

## 10. Ternary/Photonic via Domain Types (Phase 22+)

Not in the core type checker. Use:
```galerina
type TriState = enum { Negative Neutral Positive }
```

Type checker enforces exhaustive match (SPORE-TYPE-021 already handles this).
The semanatic/backend layer interprets TriState for photonic/ternary targets.

---

## Diagnostic Code Table

| Code | Name | Rule |
|---|---|---|
| `SPORE-TYPE-001` | `UnknownType` | Type name not in scope |
| `SPORE-TYPE-003` | `InvalidNominalConversion` | raw String → branded type without gate |
| `SPORE-TYPE-004` | `InvalidBinaryOperation` | operator not valid for types |
| `SPORE-TYPE-008` | `SilentNullDenied` | null/undefined as value |
| `SPORE-TYPE-009` | `InvalidGenericInstantiation` | wrong generic arity |
| `SPORE-TYPE-010` | `UnsatisfiedGenericConstraint` | type does not satisfy constraint |
| `SPORE-TYPE-011` | `InvalidCollectionElement` | Array<T> element type mismatch |
| `SPORE-TYPE-016` | `TensorShapeMismatch` | tensor shapes incompatible |
| `SPORE-TYPE-017` | `QuantizedPrecisionMismatch` | Int8/Float32 mix without dequantize |
| `SPORE-TYPE-020` | `ShadowedBinding` | binding shadows outer scope (warning) |
| `SPORE-TYPE-021` | `NonExhaustiveMatch` | match missing arm |
| `SPORE-TYPE-022` | `UnreachablePattern` | arm after wildcard |
| `SPORE-TYPE-030` | `TensorElementTypeMismatch` | wrong element type for tensor operation |
| `SPORE-TYPE-031` | `TensorDimensionMismatch` | dimension count mismatch |

---

## Implementation Status

| Feature | Status |
|---|---|
| SPORE-TYPE-001..009 | ✅ Phase 6 |
| SPORE-TYPE-010..019 (formal spec) | ✅ Phase 11 |
| SPORE-TYPE-020..022 (shadow/match/unreachable) | ✅ Phase 11 |
| TypeId numeric registry (stub) | ✅ Phase 18D |
| EffectFlags bitset | ✅ Phase 18D |
| ComputeCompatibilityFlags bitset | ✅ Phase 18D |
| SPORE-TYPE-030/031 (tensor element/dimension) | ✅ Phase 18D |
| Stop regex re-parsing | 📋 Phase 19 |
| Full TypeRegistry | 📋 Phase 19 |
| Bidirectional inference | ✅ practical form done |
| Protected/redacted in type checker | 📋 Phase 19 (currently in value-state checker) |
| Tensor shape checking (full) | 📋 Phase 21A |
| Structural fingerprints | ⏳ Phase 21+ |
| Iterative graph checking | ⏳ Phase 21+ |
