# Galerina — High-ROI Architecture Ideas (Reviewed 2026-05-31)

## Status key

```
✅ Implemented
🔶 Partial
📋 Planned (phase assigned)
⏳ Later (architecture stable, not urgent)
```

---

## Compiler / Runtime

### 1. Static Capability Proofs ✅

Prove permissions at compile time. Runtime executes directly without hot-path capability checks.

```galerina
effects {
  database.read
}
```

Compiler proves legality. Runtime executes.

**Status:** `capabilityHost.ts`, `contractEnforcer.ts`, `SPORE-EFFECT-*` series implemented.
Effects declared in contract are verified against capability registry before execution.

---

### 2. Metadata Erasure 📋 (Phase 21A)

Contracts are for compiler, verifier, AI, and governance. Remove unnecessary metadata from production runtime output.

```galerina
intent { "Validate customer email" }
```

Should not exist in emitted production runtime code. Intent guides optimisation — it does not run.

**Status:** Intent is stored in AST and AI graph. Erasure from JS emit is Phase 21A (JS emitter not yet built).

---

### 3. Monomorphisation 📋 (Phase 21B)

Generate specialised versions of generic code:

```galerina
fn add<T>(a: T, b: T) -> T
```

emits internally:

```text
add_Int
add_Float32
add_Decimal
```

Benefits: less branching, better JIT, better WASM, faster execution.

**Status:** Not yet implemented. Phase 21B. Foundation: typed AST nodes, NodeFlags.TensorCandidate.

---

### 4. Typed Tensor Lowering 📋 (Phase 21A — highest priority)

```galerina
Tensor<Float32, [768]>
```

lowers to `Float32Array` (length 768) — NOT `Array<number>`.

Huge win for AI, ML, maths, physics, graphics.

**Status:** Not yet implemented. Phase 21A. See `galerina-tensor-numeric-performance.md`.
NodeFlags.TensorCandidate now marks flows that need this lowering.

---

### 5. Kernel Fusion 📋 (Phase 21C)

Instead of separate `scale`, `add`, `relu` loops → one fused loop:
```text
out[i] = relu(x[i] * scale + bias[i])
```

Benefits: less memory traffic, less allocation, better cache usage.

**Status:** Not yet implemented. Phase 21C. Depends on Typed Tensor Lowering (21A).

---

### 6. Passive Execution Plans ✅

Instead of repeatedly walking ASTs, generate a `PassiveExecutionPlan` once.
All backends (JS, WASM, GPU, NPU, Native) consume the same plan.

```json
{
  "flow": "inferCustomerRisk",
  "inputs": ["customer"],
  "effects": [],
  "contracts": ["financial"],
  "compute": "tensor"
}
```

**Status:** Fully implemented. `executionPlan.ts`, `hashPassivePlan()`, `buildExecutionPlan()`.
Bootstrap determinism tests prove planHash stability. See `galerina-passive-execution-plans.md`.

---

### 7. SemanticGraph ✅

Flow Graph, Type Graph, Effect Graph, Contract Graph, Capability Graph.
Many compiler passes become graph lookups instead of repeated AST traversals.

**Status:** `buildSemanticGraph()`, `buildAiGraph()` in `gir-emitter.ts`.
`@galerina/devtools-graph-algorithms` package provides BFS, DFS, topoSort, fixpoint.
See `galerina-ai-semantic-graph-output.md`.

---

## Lexer

### 8. Integer Token IDs ✅ (Phase 18A)

Instead of string comparisons:
```text
"flow"  "contract"  "effects"
```

internal numeric IDs:
```text
TokenKind.Flow  TokenKind.Contract  TokenKind.Effects
```

Faster parser, lower memory, better WASM compatibility.

**Status:** TokenKindId numeric enum implemented (Phase 18A). V1_ACTIVE_KEYWORDS and V1_FUTURE_RESERVED are split.
Numeric TokenKind enum done. Foundation fully in place.

---

### 9. Zero-Copy Token References ✅

Store `startOffset` / `endOffset` instead of string-slicing repeatedly.
Only build strings for diagnostics, IDE output, error messages.

**Status:** Token interface has `start` (byte offset) and `end` (byte offset after last char).
Phase 18A added slice-based scanning. SourceLocation carries full span fields.
Remaining: parser still builds some strings during identifier/operator scanning.

---

## Parser

### 10. Monomorphic AST Nodes ✅

All nodes shaped consistently:

```ts
{ kind, location, value, children, readableForm, flags }
```

Avoids lots of optional shapes, helps V8 hidden-class optimization.

**Status:** `makeNode()` factory added (Phase 18). NodeFlags bitmask on flow declarations.

---

### 11. Node Flags ✅

```ts
NodeFlags.HasContract
NodeFlags.HasEffects
NodeFlags.HasPrivacy
NodeFlags.HasCompute
NodeFlags.IsPure
NodeFlags.IsSecure
NodeFlags.TensorCandidate
NodeFlags.ReadonlyInputs
```

Useful for SemanticGraph, AI graphs, compiler passes, execution planning.

**Status:** All 8 flags implemented. Set on every flow declaration node.
See `tests/parser/node-flags.test.mjs`.

---

### 12. Better Error Recovery ✅

Continue parsing after errors. Recover on `}`, `;`, `flow`, `contract`.
Critical for IDEs, AI-generated code, large files.

**Status:** `recoverToStatement()`, `recoverToBlock()`, `recoverToContractSection()` added (Phase 18).
`skipToNextDeclaration()` and `skipTopLevelStatement()` also in place.

---

## Memory

### 13. Arena Structures ⏳ (Phase 23+)

Not for Stage B. Great later for:

```text
AST Arena → SemanticGraph Arena → ExecutionPlan Arena → discard
```

Reduces GC pressure. Example flow: parse file → build AST Arena → build SemanticGraph → discard AST Arena.

**Status:** Not yet planned concretely. Phase 23+. Do not implement until grammar is stable.

---

## AI-Specific

### 14. AI Graph Output ✅

Generate `galerina.ai.json` containing flows, contracts, types, effects, capabilities, diagnostics, entry points.
Massively reduces AI token usage.

**Status:** `buildAiGraph()` returns `GalerinaAiGraph` with flows, governance, diagnostics.
**AI_SUMMARY** files per KB level, `docs/AI/` primers, `docs/patterns/` library.
See `galerina-ai-semantic-graph-output.md`.

---

### 15. Example Manifest ✅

```json
{
  "id": "email-validation",
  "concepts": ["Result", "Email", "protected"],
  "status": "stable"
}
```

AI can understand the entire example corpus without reading hundreds of files.

**Status:** `docs/Examples/examples.manifest.json` — 222 examples indexed.
CEC (Canonical Example Corpus) with CI integration.

---

## Future Hardware

### 16. Hardware Hints ✅ (Parser)

Parser recognises:

```galerina
prefer [gpu]
prefer [npu]
prefer [apu]
```

and preserves them as AST nodes. Does NOT do hardware planning.
Hints pass into SemanticGraph → ExecutionPlan → Backend.

**Status:** `prefer` keyword parsed as `preferHint` AST node (Phase 18).
NodeFlags.HasCompute set when `compute { }` block present.
`TensorCandidate` flag set when Tensor<> types detected.

---

## The 10 Highest-ROI Ideas (Status)

| # | Idea | Status |
|---|------|--------|
| 1 | Static Capability Proofs | ✅ |
| 2 | Metadata Erasure | 📋 Phase 21A |
| 3 | Monomorphisation | 📋 Phase 21B |
| 4 | Typed Tensor Lowering | 📋 Phase 21A |
| 5 | Kernel Fusion | 📋 Phase 21C |
| 6 | Passive Execution Plans | ✅ |
| 7 | SemanticGraph | ✅ |
| 8 | Integer Token IDs | ✅ Phase 18A |
| 9 | AI Graph Output | ✅ |
| 10 | Arena Structures | ⏳ Phase 23+ |
| — | Zero-Copy Token References | ✅ |
| — | Node Flags | ✅ |
| — | Better Error Recovery | ✅ |
| — | STDLIB_CAPABILITY_MAP | ✅ Phase 18H |
| — | SPORE-STDLIB-001 enforcement | ✅ Phase 19A |
| — | WAT emitter skeleton | ✅ Phase 19B |
| — | BoundaryGraph types | ✅ Phase 20B |
| — | TypedArray lowering plan | ✅ Phase 21A stub |
| — | Monomorphisation plan | ✅ Phase 21B stub |
| — | Kernel fusion plan | ✅ Phase 21C stub |
| — | Register VM types | ✅ Phase 23C stub |
| — | StringView/BytesView/TensorView | ✅ Phase 23D stub |

Six of the top 10 are already implemented. Remaining four are sequenced correctly: Tensor Lowering before Kernel Fusion, Monomorphisation depends on stable typed AST.

## Principle

```
The Galerina architecture separates concerns cleanly:
  Parser  → structure, flags, spans, recovery
  SemanticGraph → type, effect, capability, boundary analysis
  ExecutionPlan → pre-verified, hashable, multi-target
  Backend → JS, WASM, GPU, NPU, Photonic

No hardware planning in the parser.
No governance in the backend.
Each layer consumes the layer above via a stable, hashable, verifiable plan.
```
