# Galerina — Effect Checker / Boundary Checker Architecture

## Status

```
Phase 5 baseline:   SPORE-EFFECT-001..004, EFFECT_REGISTRY, EFFECT_CALL_PATTERNS ✅
Phase 18E:          EffectCheckerFlags, FlowEffectSummary bitsets, SPORE-EFFECT-005, EffectCheckerMode ✅
Phase 19+:          Replace EFFECT_CALL_PATTERNS regex with AST/symbol-based inference
Phase 20+:          BoundaryGraph, boundary depth/region proofs
Phase 21+:          Runtime manifest generation from verified effect graph
```

## Principle

```
The effect checker should prove authority once, produce a compact effect graph,
and let runtime execute from a verified manifest.
```

```
Code declares authority.
Compiler proves authority.
Runtime receives a verified manifest.
```

---

## Pipeline Position

```
source
  → Lexer → Parser → AST
  → Effect Checker           ← here
  → EffectGraph + BoundaryGraph
  → Verified Runtime Manifest
```

---

## Architecture

The effect checker answers two questions:

```
EffectGraph:    "What authority does this code require?"
BoundaryGraph:  "Is that authority allowed to cross this boundary?"
```

Separation:
```
What effects exist (EFFECT_REGISTRY, CANONICAL_EFFECTS)
  ↓
Where effects propagate (call graph + topoSort)
  ↓
Where effects are allowed (BoundaryGraph, boundary depth)
  ↓
What runtime may execute (verified manifest)
```

---

## Effect Bitsets

Effects are represented internally as bitsets (`EffectFlags` from type-registry.ts).
Subset check: `(required & declared) === required`.

Keep strings for diagnostics, reports, AI graph, developer output.

Already implemented in type-registry.ts:
- `EffectFlags.DatabaseRead`, `.DatabaseWrite`, `.NetworkOutbound`, `.AuditWrite`, `.AiInference`, etc.
- `effectsToFlags(names)`, `effectsSubset(required, declared)`

`FlowEffectSummary` now carries `declaredEffectsMask`, `inferredEffectsMask`, `missingEffectsMask`.

---

## Effect Checker Flags (EffectCheckerFlags)

Properties proven by the effect checker on individual flows:

```
PureComputeCandidate  — no database, no network, no filesystem, no audit, no mutation
ParallelSafe          — no shared state; can run concurrently
KernelFusionCandidate — pure math operations; can be fused in one pass
EffectFree            — truly no effects at all
ReadyForAPU           — readonly + pure + no I/O → APU shared memory candidate
ReadyForNPU           — pure + no dynamic branch + tensor types → NPU candidate
```

These are distinct from:
- `NodeFlags` (parser-detected structural properties)
- `ComputeCompatibilityFlags` (type-checker-proven compute properties)
- `EffectCheckerFlags` (effect-checker-proven authority properties)

---

## Diagnostic Codes

| Code | Name | Severity | Rule |
|---|---|---|---|
| `SPORE-EFFECT-001` | `MissingEffectDeclaration` | error | Flow uses an effect not declared in contract |
| `SPORE-EFFECT-002` | `PureFlowWithEffect` | error | pure flow declares or infers a prohibited effect |
| `SPORE-EFFECT-003` | `NonCanonicalEffectName` | warning | Effect name not in canonical registry |
| `SPORE-EFFECT-004` | `UnknownEffectOperation` | info | Operation not in EFFECT_REGISTRY |
| `SPORE-EFFECT-005` | `BroadAliasUsed` | warning | Effect name is a broad alias (`network` → use `network.outbound`) |

---

## Regex Demotion Plan (Phase 19)

Current `EFFECT_CALL_PATTERNS` (regex-based):
```typescript
[/\b\w+DB\.insert\b/, "database.write"],
[/\bAuditLog\.write\b/, "audit.write"],
```

Goal (AST-based):
```
callExpr node → resolved symbol → EFFECT_REGISTRY lookup
```

Benefits: accuracy, speed, security, refactor safety, AI repair, self-hosting.

Migration path:
1. Phase 19: add AST-based inference alongside regex
2. Phase 20: regex patterns moved to SUPPRESS list + deprecated comment
3. Phase 21: regex removed, AST path only

---

## Canonical Effect Names

Always use canonical dot-path names:
```
database.read      database.write
network.outbound   network.inbound
filesystem.read    filesystem.write
audit.write
ai.inference
secret.read        secret.write
payment.charge
```

Demote broad aliases (`network`, `database`, `filesystem`) → SPORE-EFFECT-005.

Broad aliases still work but emit a warning and suggest the canonical form.

---

## Pure Flow Optimization Flags

If a flow is proven pure (no database, no network, no audit, no filesystem, no mutation outside scope):

```
PureComputeCandidate → eligible for WASM SIMD / GPU / NPU / APU
ParallelSafe         → can run as parallel task without locking
KernelFusionCandidate → pure math — fuse multiple calls into one loop
```

The effect checker proves these properties. The ExecutionPlanner maps them to hardware targets.

---

## Boundary Depth / Region Proof (Phase 20+)

```
a value/effect from a deeper secure boundary cannot escape into a wider boundary
unless explicitly allowed
```

Boundary properties per flow:
```
boundary depth   — how deep in the secure region
region id        — which security region owns this flow
allowed effects mask — what effects may cross the boundary
```

Prevents:
- Hidden authority crossing
- Unsafe package boundaries
- Private flow exposure
- Unauthorised route access

---

## Production Strictness Modes

```
"development":
  warn/suggest on missing effects
  
"production":
  fail on missing effects, unknown effects, forbidden boundary crossings
```

Use `EffectCheckerMode` constant:
```typescript
type EffectCheckerMode = "development" | "production";
```

Default: `"development"`. CI: `"production"`.

---

## Hardware-Ready Effects

```
effects { ai.inference }     → authority to perform inference
prefer [npu, gpu]            → target preference, not permission
```

The effect checker validates: `ai.inference` is declared.
The target planner selects NPU/GPU later.
Orthogonal concerns — both must be satisfied.

---

## Implementation Status

| Feature | Status |
|---|---|
| SPORE-EFFECT-001..004 | ✅ Phase 5 |
| EFFECT_REGISTRY | ✅ Phase 5 |
| Transitive propagation (call graph + topoSort) | ✅ Phase 5 |
| CANONICAL_EFFECTS + EFFECT_NAME_ALIASES | ✅ Phase 5 |
| PURE_FORBIDDEN_EFFECTS | ✅ Phase 5 |
| EffectFlags bitsets (from type-registry.ts) | ✅ Phase 18D |
| FlowEffectSummary bitset fields | ✅ Phase 18E |
| EffectCheckerFlags (PureComputeCandidate, etc.) | ✅ Phase 18E |
| SPORE-EFFECT-005 BroadAliasUsed | ✅ Phase 18E |
| EffectCheckerMode (development/production) | ✅ Phase 18E |
| Replace regex EFFECT_CALL_PATTERNS with AST | 📋 Phase 19 |
| BoundaryGraph | 📋 Phase 20 |
| Boundary depth/region proof | 📋 Phase 20 |
| Runtime manifest generation | 📋 Phase 21 |
| Full EffectGraph ↔ BoundaryGraph integration | 📋 Phase 21 |
