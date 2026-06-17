# LogicN

**A governance-first programming language and runtime for high-assurance software.**

LogicN is built for organisations where software failure is not acceptable — financial platforms, healthcare systems, government services, and regulated enterprise. Every execution is **declared, verified, and audited** by design, not by convention.

> **Maturity (honest status, 2026-06-17).** LogicN is an **advanced prototype with several hardened zero-trust subsystems** — *not* yet a production-complete platform. The **compiler, security, and governance core are production-grade** (49/49 packages, 4,518 tests, fail-closed border check). The **app/API/framework layer is still templates**, Stage-B self-hosting is in progress, and the "Tower" compute layer is a **governed software simulator + bridge-attestation runtime, not real photonic-CPU virtualisation**. See [the 2026-06-17 senior-developer audit](notes/2026-06-17-zero-trust-senior-developer-project-audit.md) and [the roadmap](docs/Knowledge-Bases/logicn-build-roadmap.md).

---

## What LogicN does

**Declares governance in source code.** Every flow declares its intent, effects, capability boundaries, and invariants in a `contract {}` block. The compiler verifies these at build time. There is no runtime surprise.

**Enforces at runtime via the Governed Tower.** The DSS supervisor tracks the V_DPM (Virtual Dynamic Posture Matrix) register — every capability use is a bitmask check, every trap produces a structured AuditEvent, and rollback is clean (`unreachable` fires before the next instruction). *Today this runs as the Stage-A TypeScript simulation; the real `DSS.wasm` component is Post-P9 (#102–106).*

**Produces a cryptographic audit trail.** Every governed execution generates an Epilogue Receipt (sha256_seal or zk_snark). Every security trap appends to an append-only audit log (CBOR Tag 410 AuditEvent). **Hybrid Ed25519 + ML-DSA-65 (NIST FIPS 204) signing is shipped** on the attestation, proof-graph, and bridge surfaces (both halves required — no post-quantum downgrade; certified mode *mandates* the ML-DSA key). The `.lmanifest` itself is still **Ed25519-only**, with the hybrid upgrade gated on production key custody (#34/#149).

**Compiles to WebAssembly.** Governance is verified by the compiler at build time and enforced on the Stage-A runtime today. **WASM is the production execution path** — independently benchmarked as native-class (see Benchmarks). Full in-WASM self-hosting (P9) is *in progress*: the self-hosted `lexer.lln` `tokenize` reaches **byte-for-byte Stage-A == Stage-B real-WASM parity** (#143); extending that to the parser/type-checker/governance-verifier flows is the remaining gate.

---

## Who it is for

| Sector | Why LogicN |
|---|---|
| **Financial platforms** | Every payment flow declares and enforces its effects. Audit trail by default. PCI DSS governance built in (`logicn-devtools-pci`). |
| **Healthcare systems** | PII/PHI is typed and tracked. Redaction is enforced at the type level before data reaches any audit sink. |
| **Government / defence** | Designed for air-gapped deployment, no cloud dependency. Governed BitNet CPU inference is in early integration (Inference Tower ~12%). |
| **Enterprise regulated** | OWASP attack vectors blocked at the compiler. Supply-chain provenance via signed manifests (Ed25519 today; hybrid ML-DSA-65 on the attestation/bridge surfaces). |

> **New here?** → [**SETUP.md**](SETUP.md) — install · run your first benchmark · Hello World with full governance comments

---

## Benchmarks (measured 2026-06-17 — honest numbers)

Run on an **Intel i9-9900K (8C/16T) + NVIDIA RTX 2060**, across Rust (native, generic + AVX2), Node.js (V8), Python (CPython), LogicN's WASM output, the Stage-A interpreter tiers, and real GPU (Deno WebGPU). 23 benchmarks; harness at `packages-logicn/logicn-devtools-benchmarks`.

**The honest hierarchy on hot compute:** native/JIT (Rust ≈ LogicN-as-WASM ≈ Node) cluster within ~3× (0.1–4 B ops/s) → **Python** (100–1,000× back) → **the Stage-A TypeScript tree-walker** (the slowest tier, below Python on numeric loops — it allocates a boxed value per AST node).

- **LogicN's *production* path (WASM) is native-class** — it wins or ties Rust and Node on several benchmarks (arithmetic-threshold, six-digit-guess, record-allocation, tri-logic, low-memory).
- **The Stage-A interpreter is a diagnostic/reference tier, not the product** — its slowness is by design (it is the WASM byte-parity oracle).
- **Governance overhead is low** (~1.6×: governed ≈ manifest) — the cost is tree-walk dispatch, which WASM eliminates.
- **GPU** runs real dispatch on the RTX 2060 but is overhead-bound below ~500K elements (these kernels are too small); LogicN's own GPU backend is a Phase-38 stub.

---

## Build Progress

| Layer | % | Note |
|---|---|---|
| **Specification / KB** | 100% | 450+ documents |
| **Lexer / Parser / Governance Verifier / Contract blocks / Value-state checker** | 100% | full pipeline |
| **DRCM Phases 1–7 (Governed Tower — Stage-A simulation)** | 100% | real `DSS.wasm` is Post-P9 (#102–106) |
| **CBOR Manifests (RFC 8949)** | 100% | |
| **Tests — full suite** | 100% | **49/49 packages · 4,518 tests · 0 failures** |
| **Type checker / Effect checker** | ~90% | |
| **WAT emitter** | ~88% | #128(a) fail-closed fix landed (unhandled stmt → `unreachable` trap, no silent no-op); `forEachStmt` lowering open |
| **Runtime interpreter** | ~87% | diagnostic tier (see Benchmarks) |
| **Stage-B self-hosting — interpreter parity** | 100% | R6 corpus: Stage-A == Stage-B |
| **Stage-B self-hosting — WASM execution (P9)** | in progress | `tokenize` byte-parity achieved (#143); parser/checker/verifier flows remain |
| **Post-Quantum & Hardware Security** | ~38% | hybrid Ed25519+ML-DSA-65 shipped on attestation/proof/bridge; `.lmanifest` hybrid gated on key custody (#34/#149) |
| **`.tmf` trust engine (`logicn-ext-tmf`)** | slices 1–3 done | TMX-256 + container + KEM-DEM golden-verified; slice 4 (file-format signing / verify-before-read) next |
| **Passive Execution Plans & Target Bridges** | ~22% | |
| **AI Inference Tower (BitNet / GroqCloud / NVFP4)** | ~12% | default bridges are governed dev stubs/simulators |
| **Photonic / Ternary Computing** | ~3% | software simulation only (not hardware) |
| **App / API / Framework layer** | templates | `logicn-framework-*` are TODO/template-level — not a complete app yet |

> **Full roadmap** → [docs/Knowledge-Bases/logicn-build-roadmap.md](docs/Knowledge-Bases/logicn-build-roadmap.md)
>
> **Recent (2026-06-17)** → senior-developer zero-trust audit (advanced-prototype verdict; P0s: history-scrub of rotated signing key, denied `groq-inference-v1` placeholder hash, repo-wide typecheck reproducibility) · third-party license audit CLEAN + [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md) shipped (all deps permissive/free) · benchmark unit-bug fixed + corrected numbers · #128(a) WAT fail-closed fix · notes 37/38/39 + tri-pipe/nested-quantum/partial-governance dispatched to R&D.

---

```text
intent  →  governed execution plan  →  coordinated compute  →  audit proof
```

**[Intent](docs/Knowledge-Bases/logicn-concept-intent.md)** — what a flow is *for*: purpose, allowed effects, boundaries. Intent guides optimisation; authority is granted through `contract.effects` and capability declarations.
**[Governed Execution Plan](docs/Knowledge-Bases/logicn-concept-governed-execution-plan.md)** — the compiler-generated operational contract: capabilities granted, effects allowed, targets approved, behaviours denied.
**[Coordinated Compute](docs/Knowledge-Bases/logicn-concept-coordinated-compute.md)** — runtime orchestration across CPU/GPU/NPU/WASM and future targets, within declared authority.
**[Audit Proof](docs/Knowledge-Bases/logicn-concept-audit-proof.md)** — structured, cryptographically signed runtime evidence that execution stayed within declared authority.

---

## What makes it different

| Traditional | LogicN |
|---|---|
| Errors as exceptions | Explicit `Result<T, E>` — no silent failure |
| Mutation is silent | `let` = immutable · `mut` = explicit · `readonly` = view |
| Side-effects hidden | Effects declared: `contract { effects { database.write } }` |
| Boundary data silently typed | `unsafe let raw` — untrusted until gated |
| AI guesses at structure | Machine-readable ProofGraph + intent manifests |
| Security checked at runtime | Compile-time: taint, secrets, PCI DSS, governance proofs |
| Fixed hardware | Declared targets: CPU · WASM · GPU · NPU · Photonic |

---

## Code Examples

> **Three-block structure:** `flow name(params) -> ReturnType` (signature) · `contract { ... }` (compile-time governance, *outside* the body) · optional `policy { ... }` (runtime monotonic overlay) · `{ body }`. `contract {}` and `policy {}` are separate blocks, not nested.

```logicn
// ── Governed secure flow: PII handling ───────────────────────────────────────
secure flow createPatient(readonly request: Request) -> CreatePatientResult
contract {
  types   { type CreatePatientResult = Result<Response, ApiError> }
  intent  { "Create a patient record with protected PII handling." }
  effects { database.write  audit.write }
  privacy { contains PII  require redaction before audit.write }
}
{
  unsafe let rawEmail: String = request.body.email
  let email: protected Email  = validate.email(rawEmail)?
  let saved = PatientsDB.insert({ email: email })?
  AuditLog.write({ event: "PatientCreated", patientId: saved.id, email: redact(email) })
  return Ok(Response.created(saved.id))
}

// ── Pure flow: zero side effects, compiler-proved ────────────────────────────
pure flow calculateVat(price: Money<GBP>) -> Money<GBP>
contract { intent { "Calculate 20% VAT on a GBP price." } }
{
  return price * Decimal("0.20")
}

// ── Match: exhaustive by default ─────────────────────────────────────────────
pure flow describeStatus(s: Status) -> String
contract { intent { "Map a status enum to a display string." } }
{
  match s {
    Active    => { return "live" }
    Suspended => { return "paused" }
    Deleted   => { return "removed" }
  }
}
```

---

## Architecture Patterns

Nine canonical patterns. Patterns 1–6 compile today (`drcm_stable_v0`); 7–9 require DRCM phases (`drcm_core_v1`). Each has a verified `.lln` example in `tests/patterns/`.

| # | Pattern | Profile | When to use |
|---|---|---|---|
| 1 | Pure Transform | stable | Math, string transforms — no I/O |
| 2 | Governed API Route | stable | HTTP routes, webhooks — external ingress |
| 3 | High-Trust Mutation | stable | Payments, medical, government data |
| 4 | Cross-Boundary Workflow | stable | External APIs — `security.interim` until `step` ships |
| 5 | Secret-Using Flow | stable | Reads a credential — `secrets {}` + taint guards |
| 6 | Multi-Tier Service | stable | API → business → data, three governed flows |
| 7 | Governed WASM Module | `drcm_core_v1` | DRCM Phase 5 — DSS supervision, DWI isolates |
| 8 | Emergency Policy Overlay | `drcm_core_v1` | DRCM Phase 4 — auto-tightening `policy {}` |
| 9 | .lmanifest Compliance | `drcm_core_v1` | DRCM Phase 3 — PCI DSS / SOC 2 artifact |

> Full reference: [`docs/Knowledge-Bases/logicn-architecture-patterns.md`](docs/Knowledge-Bases/logicn-architecture-patterns.md)

---

## Architecture

### Compiler pipeline
```
.lln source
  ↓ lexer          — tokenise, LLN-LEX-001..006
  ↓ parser         — AST: flow/contract/match/record/for/import
  ↓ symbol resolver — LLN-NAME-001..003
  ↓ type checker   — LLN-TYPE-001..023
  ↓ value-state    — LLN-VALUESTATE/SECRET/TAINT/GATE
  ↓ effect checker — LLN-EFFECT-001..005
  ↓ governance     — LLN-GOV-001..020, LLN-TERM-001, ProofGraph
  ↓ GIR emitter    — Governed Intermediate Representation
  ↓ tiered runtime — cache · bytecode VM · sync · WASM · tree-walker
```

### Package layout (status-labelled)
```
packages-logicn/
├── logicn-core-compiler/     ACTIVE — full pipeline, 3,459 tests
├── logicn-core-security/     ACTIVE — taint profiles, redaction, OWASP boundaries
├── logicn-core-economics/    ACTIVE — CostGraph, ValueGraph, breach-risk matrix
├── logicn-core-logic/        ACTIVE — Tri, Decision, RiskLevel
├── logicn-tower-citizen/     ACTIVE — governed ternary/BitNet simulator + K3 + bridge attestation (183 tests)
├── logicn-ext-tmf/           ACTIVE — .tmf trust engine: TMX-256 + container + KEM-DEM (slices 1–3)
├── logicn-ext-bridge-quantum/ ACTIVE — governed ffsim bridge (Phase 1.5; real exec deferred to Phase 2)
├── logicn-devtools-security/ ACTIVE — runSecurityAudit, PCI DSS 4.0.1
├── logicn-devtools-pci/      ACTIVE — PCI DSS 4.0.1 (LLN-PCI-001..010)
├── logicn-devtools-benchmarks/ ACTIVE — 23 benchmarks across all runtimes
├── logicn-framework-*/       TEMPLATE — api-server / example-app / app-kernel (not yet complete apps)
└── logicn-target-*, data/db/web/registry  PLANNED/PARTIAL — several documentation-only

examples/auth-service/        31 governed flows (verifyPassword, charge, sovereign...)
docs/Knowledge-Bases/         450+ specification documents
```

### Five-layer execution stack
```
Layer 1: LogicN Source (.lln)         — what the developer writes
       ↓ compiler pipeline
Layer 2: Governed IR (GIR)            — verified governance contract
       ↓ target bridge
Layer 3: WASM / bytecode / native     — compiled execution (WASM = production path)
       ↓ runtime
Layer 4: RunResult                    — retVal + auditLog (observable effects)
       ↓ governance
Layer 5: ProofGraph + .lmanifest      — cryptographic audit proof (Ed25519; hybrid ML-DSA-65 on attestation/bridge)
```

---

## Running the Tools

```bash
# Tests — core suite (4 packages, 3,583 tests) / full suite (49 packages, 4,518 tests)
node scripts/run-all-tests.cjs --core
npm test

# Full benchmark suite (~5–10 min) on this machine, then compare
cd packages-logicn/logicn-devtools-benchmarks && npm run run && npm run compare

# Compile a .lln program to WASM and run it
logicn build examples/auth-service/sovereignTransaction.lln
logicn run   examples/auth-service/verifyPassword.lln --invoke verifyPassword
logicn check examples/auth-service/verifyPassword.lln

# Run a .wasm binary without Node.js
wasmtime --invoke main build/benchmark.wasm

# Plugin border check (fail-closed admission)
node logicn.mjs border-check

# Security + PCI audit sweep
node packages-logicn/logicn-devtools-security/dist/cli.js audit examples/auth-service/verifyPassword.lln
node packages-logicn/logicn-devtools-pci/dist/cli.js audit examples/auth-service/
```

---

## Key Documents

| Document | What it covers |
|---|---|
| [SETUP.md](SETUP.md) | Install on Windows / Linux / macOS, benchmarks, Hello World |
| [`docs/Knowledge-Bases/KNOWLEDGE-BASE-INDEX.md`](docs/Knowledge-Bases/KNOWLEDGE-BASE-INDEX.md) | Master navigation — 4-layer KB hierarchy, conflict resolution |
| [`docs/Knowledge-Bases/logicn-build-roadmap.md`](docs/Knowledge-Bases/logicn-build-roadmap.md) | Forward roadmap, P9 critical path, audit remediation |
| `docs/Knowledge-Bases/logicn-governance-rules.md` | Numbered rule registry — LLN codes, enforce status, examples |
| `docs/Knowledge-Bases/logicn-architecture-patterns.md` | 9 canonical patterns with feature gates |
| `docs/Knowledge-Bases/logicn-zero-trust-engine.md` | "LogicN as a zero-trust engine" — the 4 border mandates + status |
| `docs/Knowledge-Bases/logicn-engineering-goals.md` | 3 architectural goals — native speed, single-cycle bitmask, no system crash |
| `docs/Knowledge-Bases/logicn-deterministic-runtime-containment.md` | DRCM — DSS, DWI, V_DPM, `.lmanifest`, 7-module architecture |
| [notes/2026-06-17-zero-trust-senior-developer-project-audit.md](notes/2026-06-17-zero-trust-senior-developer-project-audit.md) | Latest independent audit (advanced-prototype verdict) |

---

## Licence

LogicN is licensed under the Apache License 2.0. See [`LICENSE`](LICENSE), [`LICENCE.md`](LICENCE.md), [`NOTICE.md`](packages-logicn/logicn-core/NOTICE.md), and [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) (all third-party dependencies are permissively licensed and free for commercial use).
