# Galerina — Phase 16–20 Implementation Roadmap

## Status

| Item | Value |
|---|---|
| Current phase | Phase 16 (active) |
| Last completed | Phase 15 |
| Test suite | 1670 tests, 0 failures |
| Stage A progress | ~87% |
| Stage B progress | ~20% |

---

## Phase 16 — Canonical Hashing + Plan Execution

### Canonical Hashing Module

The canonical hashing module produces a deterministic, stable hash from any
Galerina compiler output. Its purpose is to enable the `galerina verify-selfhost`
command to compare two independent builds and prove they are identical.

Rules applied before hashing:

- Strip timestamps from output (build date, run date, proof-chain wall-clock
  fields) before the hash is computed
- Sort object keys alphabetically so key insertion order does not affect the
  digest
- Normalize line endings (CRLF → LF) so the result is platform-independent
- Apply stable file ordering (sort by canonical path, not filesystem enumeration
  order)

Result: `canonical_hash(source)` always produces the same output for the same
source input, regardless of build host, OS, or timing.

### galerina verify-selfhost (Full Implementation)

The `galerina verify-selfhost` command provides a formal proof that the compiler
can reproduce itself:

1. Build B1 — compile the compiler source with the current binary; compute
   `canonical_hash(B1)`
2. Build B2 — compile the compiler source with B1; compute `canonical_hash(B2)`
3. Compare: if `canonical_hash(B1) == canonical_hash(B2)` → emit `PASS`
4. On mismatch → emit diagnostic `SPORE-BUILD-001` with a diff of the diverging
   output sections

### executePlan() — Real Implementation (Secure/Guarded Flows Only)

`executePlan()` becomes the primary execution path for governed flows. Pure
flows continue to use AST-walking (no governance overhead is needed when effects
are structurally absent).

Behaviour changes:

- The passive execution plan replaces direct AST-walking for `secure` and
  `guarded` flows
- Each step in the plan is validated against the declared capability set before
  execution
- The runtime report includes an `executed_steps` field showing the plan steps
  that ran, in order
- The attestation chain includes a `plan_hash` field — the SHA-256 of the
  serialised execution plan — so any plan modification is detectable in the
  proof record

### Phase 16 Targets

- 1720+ tests passing
- `galerina verify-selfhost` passes against the compiler source tree (B1 == B2)
- `executePlan()` drives all secure/guarded flow execution in the test suite

---

## Phase 17 — Package System (11E Completion)

### Real Package Manifests

Galerina currently resolves names within a single source file. Phase 17 extends
resolution to the package level.

- `package.galerina.yaml` files are scanned from disk at compile time
- `import Email from "@galerina/healthcare-types"` resolves by looking up the
  manifest for `@galerina/healthcare-types` and locating the `Email` export
- Cross-module type sharing: a type declared in one package is usable in
  another with full type-checker support
- `SPORE-NAME-003`: cross-module shadow detection — a local name that shadows an
  imported name from another package emits a diagnostic

### Impact on CEC Coverage

The Canonical Example Corpus currently has 189/222 examples stable. Package
resolution is a blocker for the remaining cross-module examples. Phase 17 is
expected to raise the stable count from 189 to 200+.

---

## Phase 18 — type-checker.spore (Stage B Milestone 4)

### Writing the Type Checker in Galerina

Phase 18 is the fourth Stage B milestone: the Galerina type checker is written
in Galerina.

Implementation path:

- `type-checker.spore` v0 consumes the token stream and AST produced by
  `lexer.spore` and `parser.spore`
- v0 checks: known types, call arity, basic type inference (let binding types)
- v0 does not attempt full inference across call graphs — that is a later pass
- The output of `type-checker.spore` is compared against the TypeScript reference
  implementation on the same corpus; any divergence is a bug in the Galerina
  implementation

This milestone proves that the Galerina type system is expressive enough to
describe itself.

---

## Phase 19 — Incremental Parser + IDE Foundation

### Tree-Sitter Style Incremental Parsing

Incremental parsing allows the compiler to update only the changed regions of
a parse tree rather than re-parsing the entire file on every keystroke. This
is the prerequisite for real IDE integration.

- Relex and reparse only the changed text region (bounded by the nearest
  enclosing syntactic scope)
- Stable node IDs: each AST node receives a content-addressed ID so the editor
  can track which nodes have changed
- Parser depth limits: maximum nested brace depth and maximum generic type
  depth are enforced as parser-level limits (not post-parse checks)
- `SPORE-PARSE-DEPTH-001` — new diagnostic emitted when nesting exceeds the
  declared limit

### Language Server Protocol (LSP) Skeleton

The `galerina lsp` CLI command starts a JSON-RPC server implementing a minimal
subset of LSP:

| LSP capability | Description |
|---|---|
| `textDocument/hover` | Returns type and effect information for the token under the cursor |
| `textDocument/diagnostics` | Streams all SPORE-* diagnostics for the open file |
| Governance-aware completions | Contract section names and effect names are offered as completions |

The LSP implementation is intentionally minimal in Phase 19 — the goal is to
prove the architecture works, not to produce a full IDE experience.

---

## Phase 20 — Stage B Complete

### Definition of Done

Stage B is complete when all of the following hold:

| Criterion | Description |
|---|---|
| `lexer.spore` full parity | All token types produced by the TypeScript lexer are also produced by `lexer.spore` on the same input |
| `parser.spore` completeness | Handles expressions, statements, and match arms — not just flow headers |
| `type-checker.spore` completeness | Handles all SPORE-TYPE-001 through SPORE-TYPE-022 error codes |
| `galerina build src/ --self-hosted` | The TypeScript bootstrap layer is not used; the Galerina compiler compiles itself end-to-end |
| `verify-selfhost PASS` | Three independent builds B1, B2, B3 all produce the same canonical hash |

### What Stage B Completion Means

When Stage B is complete, Galerina is self-hosted: the language proves its own
governance model by enforcing it on the compiler that enforces it. The
TypeScript layer becomes a reference implementation and is no longer the
production path.

---

## After Stage B

### Stage A Remains the Production Baseline

The TypeScript runtime (Stage A) is not deprecated after Stage B completes. It
remains the primary runtime for users until the Galerina-native runtime has
sufficient test coverage and performance verification to replace it. Stage A
and Stage B run in parallel for a validation period.

### Ongoing Work After Stage B

- Expand `package.galerina.yaml` registry to support versioned package graphs
- Add `galerina-compliance` reporting layer (enterprise, post-v1)
- Stable benchmarks comparing TypeScript runtime vs Galerina-native runtime
- Start backend lowering IR: AST → native CPU binary for x86-64 and ARM

---

## Phase 21 — Passive Execution Plans Full + WASM Target

### Passive Execution Plans — Full Runtime

Phase 16 introduces `executePlan()` for secure/guarded flows. Phase 21
completes the implementation:

- All flow qualifiers use plan-driven execution (pure flows gain lightweight
  plan tracking without governance overhead)
- Plan steps include resource pre-checks: capabilities are validated before
  execution begins, not during
- Multi-target plan selection: the planner chooses between CPU and WASM
  execution based on declared target affinity hints in the GIR

### WASM Target Bridge

The WASM target bridge is the first non-CPU execution path:

- GIR → WASM module compilation
- Browser, edge, and serverless WASM runtimes supported
- Capability-based sandboxing inside the WASM module boundary
- Audit records written from inside WASM, transmitted to the host

---

## Phase 22 — GPU and NPU Target Bridges

### GPU Target Bridge

- GIR tensor metadata → WGSL compute shader (WebGPU)
- CUDA / ROCm backend for data-centre GPU targets
- Tensor shape and dtype declared in Galerina source; the backend validates
  shapes before dispatch

### NPU Target Bridge

- Intel NPU, Qualcomm Hexagon, Apple Neural Engine
- Declared target affinity `target: npu` selects this bridge
- Fallback chain: NPU → GPU → CPU if the declared target is unavailable at
  runtime
- Capability authority required: `compute.npu` must be declared in the flow's
  capability set

---

## Phase 23 — CHERI Capability Hardware Mapping

### CHERI Integration

CHERI (Capability Hardware Enhanced RISC Instructions) is a hardware
architecture that enforces capability-based memory safety at the CPU level.
Phase 23 maps Galerina's software capability model onto CHERI hardware
capabilities.

- `borrow` declarations map to bounded CHERI capabilities (fat pointer +
  permission bits)
- `move` ownership transfers map to CHERI capability revocation
- `pinned` memory maps to CHERI sealed capabilities
- The Galerina compiler emits CHERI-annotated lowering IR when targeting a CHERI
  platform
- `SPORE-CHERI-001`: diagnostic emitted when a Galerina source pattern cannot be
  safely lowered to a CHERI capability (e.g., pointer arithmetic outside an
  `unsafe` block)

### ML-DSA Attestation

Phase 23 also completes post-quantum attestation:

- Ed25519 attestation (Phase 12) is supplemented with ML-DSA (NIST FIPS 204)
  signing
- The proof chain can carry both signature types; verifiers select the
  strongest algorithm they support
- `galerina verify-attestation --pq` verifies ML-DSA signatures
- ARM MTE (Memory Tagging Extension) integration: heap allocations carry tags
  that the runtime checks at capability boundaries

---

*This roadmap reflects the implementation plan as of Phase 15 completion
(1670 tests, 0 failures). Phases are sequential within each stage but Stage A
and Stage B work proceeds in parallel.*
