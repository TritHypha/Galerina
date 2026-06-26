# Galerina Architecture Layers

## Status

```
Five-layer architecture — authoritative definition
Applies to all Galerina execution from compiler through audit proof
```

---

## Rules at a Glance

- Layer 1 (Source AST) is what the developer writes — governance labels, effects, intent
- Layer 2 (GIR) is what the compiler produces after all checks pass — the verified contract
- Layer 3 (Backend IR) is target-specific — backend owns layout, SIMD, photonic lowering
- Layer 4 (Runtime Report) is what actually ran — effect trace, timing, audit
- Layer 5 (Audit Proof) is the cryptographic evidence chain — proves layers 1-4 agree
- The Adaptive Runtime operates after Layer 2 and before Layer 4 — it cannot modify Layer 2

---

## TL;DR
- Layer 1 (Source AST) = what the developer writes — governance labels, effects, intent
- Layer 2 (GIR) = what the compiler proves — verified governance contract
- Backend owns HOW to execute; source says WHAT is allowed

---

## The Five Layers

```
Layer 1: Galerina Source AST
      ↓  (compiler — passes 1-7)
Layer 2: Governed Execution Plan (GIR)
      ↓  (target bridge — pass 9)
Layer 3: Backend Lowering IR
      ↓  (runtime execution — pass 10)
Layer 4: Runtime Execution Report
      ↓  (proof chain generation)
Layer 5: Audit Proof
```

---

## Layer 1 — Galerina Source AST

**What:** The `.spore` source file as parsed and checked.

**Contains:**
- Governance labels: `protected`, `redacted`, `unsafe`, `safe`
- Effect declarations: `effects [database.write, audit.write]`
- Intent declarations: `intent "Create patient record"`
- Type annotations: `protected Email`, `Money<GBP>`, `Tensor<Float32, [1,768]>`
- Value-state annotations: `unsafe let rawEmail: String`
- Compute target preferences: `compute target best { prefer [npu, gpu] }`

**Owner:** Developer

**Format:** `.spore` files → AST JSON (internal to compiler)

**Key rule:** The source says **WHAT is allowed**. Not how to execute it.

---

## Layer 2 — Governed Execution Plan (GIR)

**What:** The compiler's verified, machine-readable governance contract.
Emitted only when all checker passes produce zero errors.

**Contains:**
- Flow facts: name, qualifier, effects declared/observed, compliance status
- Protected value tracking: which bindings carry governance labels
- Proof obligations: what must be verified at runtime
- Compute preferences: preferred targets and denied targets
- Intent status: satisfied / mismatch / null

**Owner:** Compiler (Pass 8)

**Format:** YAML/JSON per flow — see `galerina-gir-schema.md`

**Key rule:** GIR is fixed after emission. The Adaptive Runtime cannot modify GIR semantics.

---

## Layer 3 — Backend Lowering IR

**What:** Target-specific executable representation derived from GIR.

**Contains (target-specific):**
- CPU: native code or TypeScript (Stage 1)
- GPU: compute kernel (CUDA, WebGPU, Metal)
- NPU: inference graph (ONNX, CoreML, TensorRT)
- WASM: WebAssembly module
- Photonic: photonic circuit description
- Quantum: QIR / OpenQASM

**Owner:** Target bridge (`galerina-target-*` packages)

**Backend owns:**
- Memory layout and alignment
- SIMD / vectorisation decisions
- Photonic wavelength routing
- Quantum circuit compilation
- NPU operator graph optimisation

**Key rule:** Backend decides **HOW to execute**. It cannot change program meaning,
remove effects, skip validation, or alter governance labels.

---

## Layer 4 — Runtime Execution Report

**What:** What actually ran during execution.

**Contains:**
- Effect trace: which effects were observed at runtime
- Timing: start time, end time, duration
- Actor identity: who executed the flow
- Flow identity: which flow name and qualifier ran
- Actual target used: cpu / gpu / npu (may differ from preference)
- Audit entries: AuditLog.write() calls recorded in order

**Owner:** Runtime

**Format:** JSONL audit stream — see `galerina-audit-writer-spec.md`

**Key rule:** The runtime execution report must be consistent with Layer 2 (GIR).
If a declared effect is missing from the trace, that is a governance violation.

---

## Layer 5 — Audit Proof

**What:** Cryptographic evidence chain proving that layers 1-4 agree.

**Contains:**
- manifestSha256: hash of the source manifest (what was declared)
- auditSha256: hash of the JSONL audit log (what was executed)
- evidenceSha256: hash of the evidence record (validation gates fired, redactions applied)
- denialSha256: hash of the denial log (runtime governance rejections)
- artefactSha256: hash of the compiled output

**Owner:** Audit system (spore-graph `ExecutionProofChain`)

**Format:** Proof chain YAML — see `galerina-proof-chain-spec.md`

**Key rule:** The proof chain proves: declared = executed = audited.
Any discrepancy between the hashes indicates tampering or governance failure.

---

## Adaptive Runtime Placement

The Adaptive Runtime (see `galerina-adaptive-runtime-profiles.md`) operates
between Layer 2 and Layer 4:

```
Layer 2: GIR  →  Adaptive Runtime  →  Layer 3: Backend IR  →  Layer 4: Report
                 (learns scheduling,
                  selects targets,
                  adjusts batching)
```

The Adaptive Runtime:
- **May** influence: target selection, request batching, model warmup, scheduling
- **May not** modify: GIR semantics, effects, governance labels, validation requirements

---

## Key Principle

```
Galerina source says WHAT is allowed.
Backend decides HOW to execute it.
Runtime proves WHAT happened.
Audit chain verifies all three agree.
```

---

---

## Architectural Decisions (Recorded)

### Decimal Precision — Stage 1 vs Stage 2

**Decision:** Decimal is string-backed in Stage 1. `parseFloat()` is used only for prototype arithmetic and is clearly marked experimental.

```text
Stage 1:
  Decimal stored as string.
  parseFloat allowed only for prototype arithmetic.
  Docs say not exact. Money examples allowed at type-rule level only.

Stage 2:
  Integrate arbitrary-precision decimal.
  Money<C> * Decimal becomes production-valid.
  Tests cover rounding, scale, currency, VAT/tax.
```

**Rule:** Decimal must be exact before Money<C> arithmetic ships as canonical.

---

### Async Interpreter — Phase 8

**Decision:** Make `executeFlow` async in Phase 8. Do not use blocking HTTP as the production direction.

```text
Phase 8:
  executeFlow returns Promise<FlowExecutionResult>
  effectful host calls return Promise<Result<T,E>>
  network stubs become real async operations
  pure flow remains logically non-async / no-await

Flow qualifier rules for async:
  pure flow    = no await, no effects
  guarded flow = may await effectful operations
  secure flow  = may await effectful operations with governance checks
  fn           = no effects, no await
```

Sync HTTP allowed only as a dev/test mock adapter — never documented as canonical.

---

### fn at Top Level — Permanently Invalid

**Decision:** Top-level `fn` declarations remain invalid (SPORE-SYNTAX-005). Use `pure flow` for standalone utilities.

```text
Top-level utility = pure flow
Local helper = fn (inside a flow body only)
```

Future option: top-level `fn` may be allowed as package-private pure-only utilities in a later phase, but only once the compiler can enforce: no effects, no await, no authority, no route exposure, package-private only.

---

### Stage B Self-Hosting — Lexer + Parser First

**Decision:** Stage B proves self-hosting by rewriting the lexer and parser in Galerina first. Full compiler rewrite is a later long-term milestone.

```text
Stage B1: lexer in Galerina
Stage B2: parser in Galerina
Stage B3: AST + diagnostics from Galerina parser
Stage B4: compare output against Stage A compiler
Stage B5: type checker in Galerina (later)
```

Success criterion: same `.spore` input → Stage A and Stage B outputs match.

---

### Phase 8A Type Inference — Literal-Only First

**Decision:** Phase 8A implements literal-only type inference. Full bottom-up expression inference is Phase 8B/8C.

```text
Phase 8A: literal inference enables SPORE-TYPE-002/004/006/007/008
Phase 8B: expression-level inference enables all remaining type codes
```

Reason: full inference touches operators, calls, returns, generics, match arms, Auto, Tensor, Money, Result/Option — too much risk for 8A.

---

## See Also

- `docs/Knowledge-Bases/neutral-governed-ir.md` — GIR philosophy
- `docs/Knowledge-Bases/galerina-gir-schema.md` — GIR schema
- `docs/Knowledge-Bases/galerina-ast-to-gir.md` — Layer 1 → Layer 2 transformation
- `docs/Knowledge-Bases/galerina-audit-writer-spec.md` — Layer 4 format
- `docs/Knowledge-Bases/galerina-proof-chain-spec.md` — Layer 5 generation
- `docs/Knowledge-Bases/galerina-adaptive-runtime-profiles.md` — Adaptive Runtime
- `docs/Knowledge-Bases/galerina-compiler-pipeline.md` — compiler passes
