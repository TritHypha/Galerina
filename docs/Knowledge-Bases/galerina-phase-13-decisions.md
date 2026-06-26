# Galerina Phase 13/14 — Design Decisions

## Status

```
Recorded: 2026-05-30
Applies to: Phase 13 (Semantic Graph + Capability Inference) and Phase 14 (Stage B infrastructure)
```

---

## Decision 1 — SemanticGraph lives inside the monorepo first

```
Phase 13:  packages/galerina-devtools-graph-algorithms/src/SemanticGraph.ts
Later:     C:\laragon\www\SPORE-Graph (standalone) — only after API stabilises
Trigger:   at least two internal packages depend on the same stable graph API
```

Reason: SemanticGraph will change while GIR, contracts, passive execution plans, and runtime
reports are still evolving. A standalone package boundary now freezes the wrong abstractions.

"Move SPORE-Graph into the centre" means: make graph concepts central to compiler/runtime
architecture — not necessarily make the standalone repo the source of truth immediately.

**Canonical plain-data interface:**
```typescript
type SemanticNode = {
  id: string;
  kind: "flow" | "type" | "effect" | "contract" | "event" | "capability";
}

type SemanticEdge = {
  from: string;
  to: string;
  kind: "calls" | "usesType" | "declaresEffect" | "emits" | "requires";
}
```

SemanticGraph must NOT import compiler-private AST classes. Plain data only.

---

## Decision 2 — galerina check is warn-only for missing effects; production fails

```
galerina check              = warn + suggest (developer feedback loop)
galerina check --strict     = missing effects fail
galerina build              = warnings allowed unless configured
galerina build --production = missing effects fail (governance boundary)
```

**Important guardrail:** Security/privacy violations ALWAYS fail in check:
- `protected Email` returned in response without exposes → always error
- `unsafe String` reaching SQL query → always error
- `secret Bytes` compared with `==` → always error

Missing effect declaration is just a suggestion. Governance violations are always enforced.

**SPORE-EFFECT-001 in check mode:**
```text
Warning: Flow uses network.outbound but does not declare it.

Suggested fix:
  contract { effects { network.outbound } }
```

**SPORE-EFFECT-001 in production mode:**
```text
Error: Production builds require explicit effect declarations.
```

**Final rule:** Inference can suggest authority. Only explicit contracts can grant authority.

---

## Decision 3 — CompilerGraph uses static bootstrap, then self-generated

Bootstrap order:
```
1. Stage A compiler builds Stage B compiler.
2. Stage A emits SemanticGraph of Stage B code where possible.
3. A static CompilerGraph (compiler.graph.yaml) describes expected compiler architecture.
4. Stage B compiler runs.
5. Stage B emits SemanticGraph of itself.
6. Generated CompilerGraph compared against static CompilerGraph.
7. Once stable, generated CompilerGraph becomes canonical.
```

**compiler.graph.yaml (bootstrap scaffold):**
```yaml
compiler:
  stages:
    - lexer
    - parser
    - ast
    - semantic_graph
    - type_checker
    - value_state_checker
    - gir_emitter
    - passive_execution_planner

edges:
  - { from: lexer, to: parser }
  - { from: parser, to: ast }
  - { from: ast, to: semantic_graph }
  - { from: semantic_graph, to: type_checker }
```

Static CompilerGraph is the bootstrap scaffold. Self-generated CompilerGraph is the long-term proof.

---

## Decision 4 — Stage B uses V8 GC; arena memory is a future native/WASM target concern

```
Stage B on Node.js: use normal V8 GC + logical boundaries only
Future native/WASM: arena-based memory, governed memory regions, zeroing secrets
```

Stage B only needs logical metadata on values:
```typescript
type GovernedValue = {
  value: unknown;
  type: GalerinaType;
  state: "unsafe" | "protected" | "redacted";
  ownerFlow: string;
}
```

Not real arena allocation. Track ownership logically in GIR/SemanticGraph.
Keep memory API abstract so native/WASM can implement arenas later.

---

## Decision 5 — Deterministic verification uses canonical form hashing

NOT identical bytes (too strict, breaks on source-map/comment ordering changes).
NOT semantically equivalent (too vague without a defined normalisation pipeline).

**Canonical form hash — three levels:**
```
Level 1: Semantic hashes
  SemanticGraph hash
  TypedAST hash
  GIR hash
  PassiveExecutionPlan hash

Level 2: Canonical generated output hash
  strip timestamps
  normalise source maps
  sort object keys
  stable file ordering
  normalise line endings
  then SHA-256

Level 3: Byte-identical (release builds only)
```

**Extended attestation chain:**
```yaml
attestation:
  source_hash: sha256:...
  semantic_graph_hash: sha256:...
  typed_ast_hash: sha256:...
  gir_hash: sha256:...
  passive_execution_plan_hash: sha256:...
  generated_output_canonical_hash: sha256:...
  execution_proof_hash: sha256:...

signature:
  algorithm: Ed25519
  key_id: galerina-build-key
  value: ...
```

Daily verification uses canonical hashes. Release verification may require byte-for-byte.
All verification artifacts become part of the signed attestation chain (existing system).

**Implementer rule:** Implement canonical hashing first. Do not require identical JS bytes yet.
Extend existing SHA-256 proof chain to include generated compiler output canonical hash.

---

## See Also

- `galerina-semantic-graph-system.md` — SemanticGraph full proposal
- `galerina-gradual-capability-inference.md` — dev/CI/production modes
- `galerina-stage-b-root-capability-provider.md` — compiler authority isolation
- `galerina-deterministic-selfhost-verification.md` — full verification proposal
- `galerina-compiler-phase-memory-boundaries.md` — arena memory (future)
- `capability-registry.yaml` — effect ↔ capability mapping
