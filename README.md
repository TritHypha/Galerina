# Galerina

**A governance-first programming language and runtime for high-assurance software.**

Galerina is built for organisations where software failure is not acceptable — financial platforms, healthcare systems, government services, and regulated enterprise. Every execution is **declared, verified, and audited** by design, not by convention.

> **New here?** → [**SETUP.md**](SETUP.md) — install · run your first benchmark · Hello World with full governance comments

---

## What Galerina is

Galerina is a **Governed Application Language for High-Assurance Systems**. It is not a systems language, not a scripting language, and not a general-purpose application language — the classification is narrow by design.

| Word | What it means |
|---|---|
| **Governed** | Governance is not a library bolted on top — it is the compiler's primary output. Every flow has a `contract {}` block verified at build time. Effects, capabilities, boundaries, and invariants are declared in source and proven before execution begins. There is no "ungoverned mode". |
| **Application** | Galerina writes application logic — API routes, payment flows, medical record handlers, governed data pipelines, authentication decisions. Not device drivers, kernel modules, or memory allocators. |
| **Language** | `.fungi` is a proper programming language: defined syntax, type system, effect system, value-state checker, and a verified compiler pipeline to GIR → WASM. Not a DSL or policy format. |
| **High-Assurance** | Failure modes are exhaustively declared and fail-closed. The audit trail is cryptographic. Supply-chain provenance is enforced. Security properties are compile-time proofs, not runtime detections. |

**What it is not:** not C/Rust/Zig (no raw pointers, no kernel drivers) · not Python/Ruby/Bash (no REPL, no dynamic execution, no monkey-patching) · not Go/Java/TypeScript (not general-purpose — the right tool for governed, fail-closed, auditable logic in regulated domains) · not OPA/Cedar (full executable logic, not a policy DSL) · not TLA+/Coq (governance contracts verified at compile time, not a theorem prover).

**Closest analogies:** Ada/SPARK (verified, safety-critical, regulated domains) + Rust (no silent failure) + Erlang (structured fault handling) — but targeting modern API/web workloads, shipping to WASM, with K3 ternary governance and first-class supply-chain provenance.

### Who it is for

| Sector | Why Galerina |
|---|---|
| **Financial platforms** | Every payment flow declares and enforces its effects. Audit trail by default. PCI DSS governance built in (`galerina-devtools-pci`). |
| **Healthcare systems** | PII/PHI is typed and tracked. Redaction is enforced at the type level before data reaches any audit sink. |
| **Government / defence** | Designed for air-gapped deployment, no cloud dependency. Governed BitNet CPU inference in early integration. |
| **Enterprise regulated** | OWASP attack vectors blocked at the compiler. Supply-chain provenance via signed manifests (Ed25519 default; opt-in hybrid Ed25519+ML-DSA-65 certified profile). |

---

## The Zero-Trust thesis

Galerina optimises for **compile-time-verified governance and fail-closed Zero-Trust containment**: an ecosystem that trusts **no one by default — not the developer, not the network, not the host OS.** Every boundary is treated as already hostile, and the boundary's contract is verified at compile time (a checked property, not an absolute-security guarantee).

| Boundary | Galerina's mandate | Status |
|---|---|---|
| **Compiler** | Verifies the pre-resolved policy + execution DAG for deterministic, reproducible correctness — the contract is proven at build time. | ✅ shipped |
| **I/O — the OS kernel** | The kernel is assumed hostile. Native capabilities **denied by default**; the host is a dumb byte-mover; authorisation is the fail-closed **`vAnd` Kleene-K3 gate**. | ◑ K3 gate shipped · full kernel bypass = target architecture |
| **Packages** | A **signed admission border** with fail-closed kernel verification: cryptographic manifests, content-addressed hash-pinning, transitive capability masks. | ✅ shipped + decision surfaces execute as signed WASM |
| **Memory** | An actively-governed, hostile physical boundary — network memory is governed directly (TLSTP), never handed to shared host state. | ◑ governed surfaces twinned · residency hardening merged · runtime isolation = target architecture |
| **TLSTP — zero-middleware** | Routes around the OS kernel: raw encrypted packets go straight into WASM linear memory as unparsed bytes; **decryption happens inside the sandbox** — the kernel never sees plaintext. | ◑ all 6 border decision surfaces twinned · admission fold executes as signed WASM · in-sandbox decryption = target architecture (DSS.wasm) |

> **Honest line — shipped vs. target architecture.** The compiler, the K3 authorisation gate, signed package admission (hash-pin · signature · revocation · closed capabilities), and the S1 cert/channel gate are **shipped and tested today**. On the execution-cutover ladder, **9 governed decision surfaces are now authoritative as signed, admission-gated WASM** (their TypeScript originals demoted to differential shadows) **and 20 more are differential-proven** (the WASM verdict equals the reference verdict over the full corpus). The **DSS decision core is proven on the real Wasmtime TCB** — a 386-point three-way differential (interpreter ≡ Node-WASM ≡ wasmtime) with the governance laws asserted directly on wasmtime outputs. The full **kernel-bypass / in-sandbox isolation** (the host as pure byte-mover, decryption inside a real sandbox) is the **target architecture** — the embedder build is in progress, not a shipped runtime property. *(Status date: 2026-07-22.)*

---

## What makes it different

| Traditional | Galerina |
|---|---|
| Errors as exceptions | Explicit `Result<T, E>` — no silent failure |
| Mutation is silent | `let` = immutable · `mut` = explicit · `readonly` = view |
| Side-effects hidden | Effects declared: `contract { effects { database.write } }` |
| Boundary data silently typed | `unsafe let raw` — untrusted until gated |
| AI guesses at structure | Machine-readable ProofGraph + intent manifests |
| Security checked at runtime | Compile-time: taint, secrets, PCI DSS, governance proofs |
| Dependencies trusted by import | **Signed admission border** — hash-pin · signature · revocation · capability mask before a package runs |
| Fixed hardware | Declared targets: CPU · WASM · GPU · NPU · Photonic |

## Native properties

Properties of the **language itself** — not libraries, not middleware, not configuration. Enforced by the compiler and runtime for every flow, not opted into.

| Property | What it means |
|---|---|
| **Fail-Closed by Default** | Every unhandled case **denies** — `match` requires an exhaustive arm or explicit wildcard (`FUNGI-MATCH-001`), unhandled `Result` propagates as an error, every unhandled fault trap fires `halt`. There is no path to silent pass. |
| **Declared Authority** | Effects, capabilities, and boundaries are declared in `contract {}` and **verified at compile time**. A flow without authority cannot acquire it. |
| **Zero-Trust Boundaries** | Every boundary is hostile at compile time — plugin inputs require `Border.validate()`, untrusted data is `unsafe let raw` until gated, and the K3 lattice (`ALLOW / INDETERMINATE / DENY`) can only be lowered by an unknown input, never raised. |
| **Structured Fault Handling** | No exceptions. Faults surface as explicit `Result<T, E>` with `?` propagation, or as audited `fault` channel entries. The fault channel is append-only and cryptographically sealed. |
| **Deterministic Execution** | Same source → same verified contract → same cryptographic receipt. The pre-resolved policy DAG is deterministic by construction; no runtime configuration changes what a flow may do. |
| **Supply-Chain Provenance** | Dependencies enter only through the **signed admission border** — hash-pin · Ed25519 signature · revocation check · closed capability mask — before a single instruction runs. |
| **Post-Quantum Ready** | Hybrid **Ed25519 + ML-DSA-65** (NIST FIPS 204) signing shipped on attestation, proof-graph, and bridge surfaces. Certified mode **mandates** both halves — no post-quantum downgrade path. |
| **Data Security** | PII/PHI types tracked end-to-end; `redact()` enforced at the type level **before** data reaches any audit sink. Taint, secret isolation, and OWASP guards are compile-time checks. |
| **Reproducibility** | The signed `.lmanifest` is the machine-readable proof that a given WASM binary came from a given source under a given policy. The ProofGraph captures the full decision DAG and authority chain. |
| **Auditing** | Every governed execution emits an **Epilogue Receipt** (sha256_seal or zk_snark) and appends a structured AuditEvent (CBOR Tag 410) to an append-only log. |

---

## Honest scope — what it can and cannot do

**1) The governance `contract {}` block** *(shipped, production-grade)* — declares a flow's intent, effects, capability boundaries, and invariants; the compiler proves them at build time. Strongest for: fail-closed authorisation (the K3 gate — an unknown input can only *lower* a verdict, never manufacture an ALLOW) · effect & capability control (everything denied by default) · intelligent API routing (`+1` allow / `0` step-up / `-1` deny) · PII/PHI safety · supply-chain provenance · regulated audit.

**2) Governed tolerant compute** *(real, but emulated today)* — Galerina can govern a deny-by-default, untrusted **compute-only numeric lane** (a CPU photonic **emulator** today, cheap-verified, degrade-only) while every decision stays bit-exact on the digital core. Fits the tolerant-MAC half of: weather-model surrogates · covariance MVM in finance · tolerant render/physics · similarity/embedding inner-products · MD non-bonded forces · low-precision GEMM. **Honest fence:** the optics is a precision-limited analog accelerator (~8-bit), latency ≠ work (~1.9× emulated, never "instant/free/O(1)"), and the analog lane can only **False-DENY, never False-ALLOW**.

**3) The hard boundary** *(by design)* — bit-exact maths never runs on the analog lane (number theory, symbolic algebra, DFT cores stay digital) · crypto on a noisy/photonic lane is denied (`FUNGI-SUBSTRATE-001`) no matter how much voting is stacked · AI may *propose* but can never *lift* a security verdict · "instant optical compute" is refuted (light transit is N-independent in latency; the work is still Θ(N²)). **Roadmap, not "cannot":** real photonic hardware, the self-hosting authority cutover, and real in-sandbox DSS.wasm isolation.

---

## Code examples

> **Three-block structure:** `flow name(params) -> ReturnType` (signature) · `contract { ... }` (compile-time governance, *outside* the body) · optional `policy { ... }` (runtime monotonic overlay) · `{ body }`.

```galerina
// ── Governed secure flow: PII handling ───────────────────────────────────────
;; Creates a patient record with protected PII — email is validated, stored, then REDACTED
;; before it can reach the audit log; raw PII never crosses the audit boundary.
;; V_DPM capability required: database.write, audit.write
// @cause  [HTTP route POST /patients] -> clinician submits the new-patient form.
// @effect [Patients DB + audit log] -> new patient row; PII-redacted audit event appended.
secure flow createPatient(readonly request: CreatePatientRequest) -> CreatePatientResult
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
;; Computes 20% GBP VAT — a pure calculation with no runtime authority.
pure flow calculateVat(price: Money<GBP>) -> Money<GBP>
contract { intent { "Calculate 20% VAT on a GBP price." } }
{
  return price * Decimal("0.20")
}

// ── Match: exhaustive by default ─────────────────────────────────────────────
;; Maps a Status enum to a display string — the wildcard is fail-closed.
pure flow describeStatus(s: Status) -> String
contract { intent { "Map a status enum to a display string." } }
{
  match s {
    Active    => { return "live" }
    Suspended => { return "paused" }
    Deleted   => { return "removed" }
    _         => { return "unknown" }   // compulsory wildcard — FUNGI-MATCH-001
  }
}
```

> **Comments carry governance.** `;;` lines are **govComments** — preserved into the signed `.lmanifest` as the security record. `//` and `/* */` are ordinary notes, discarded after parse — including the structured GSCM tags (`// @cause`, `// @effect`, `// @todo`) that document trigger and outcome for humans and AI without entering the signed record. Full language reference: [`docs/language/fungi/`](docs/language/fungi/README.md) · [`docs/language/gate/`](docs/language/gate/README.md).

---

## Architecture

### Compiler pipeline
```
.fungi source
  ↓ lexer          — tokenise, FUNGI-LEX-001..006
  ↓ parser         — AST: flow/contract/match/record/for/import
  ↓ symbol resolver — FUNGI-NAME-001..003
  ↓ type checker   — FUNGI-TYPE-001..023
  ↓ value-state    — FUNGI-VALUESTATE/SECRET/TAINT/GATE
  ↓ effect checker — FUNGI-EFFECT-001..005
  ↓ governance     — FUNGI-GOV-001..020, FUNGI-TERM-001, ProofGraph
  ↓ GIR emitter    — Governed Intermediate Representation
  ↓ tiered runtime — cache · bytecode VM · sync · WASM · tree-walker
```

### Five-layer execution stack
```
Layer 1: Galerina Source (.fungi)     — what the developer writes
Layer 2: Governed IR (GIR)            — verified governance contract
Layer 3: WASM / bytecode / native     — compiled execution (WASM = production path)
Layer 4: RunResult                    — retVal + auditLog (observable effects)
Layer 5: ProofGraph + .lmanifest      — cryptographic audit proof (Ed25519; certified profile = hybrid +ML-DSA-65)
```

```text
intent  →  governed execution plan  →  coordinated compute  →  audit proof
```

### Package architecture

94 package directories organised into **families by prefix**, with two hard rules at the boundaries.

| Family | Role | Trust |
|---|---|---|
| `galerina-core-*` | Governance/compiler/runtime **core** — compiler, security, network (TLSTP), economics, logic. | **TCB** |
| `galerina-tower-citizen` | The **governed runtime** — K3 verdict algebra, bridge attestation, revocation, substrate model. | **TCB** |
| `galerina-framework-*` | The **application layer** — app-kernel admission/fusion border, api-server adapter, example app. | governed host |
| `galerina-ext-*` | **Govern-Don't-Absorb border extensions** — the `.spore` trust engine, secrets vault, native bridges (BitNet · quantum · C++). | governed at the border |
| `galerina-devtools-*` | Dev/audit **tooling** — security + PCI auditors, benchmarks, graph generators. | host-side tools |
| `galerina-target-*` | **Target adapters** — cpu · wasm · gpu · native · js, each deny-by-default capability-gated. | governed contracts |
| `galerina-data-*` · `-db-*` · `-web-*` · `-registry` | Data engine, database adapters, web governance, signed package registry. | data/db/web shipped · registry planned |

**Two rules hold it together:**

1. **Govern-Don't-Absorb.** The core **governs**; the `ext` packages do the heavy lifting (cryptography, native compute, file formats) *at the border* — never absorbed into the TCB. A bridge or codec is a governed participant, not part of the trusted base.
2. **Self-contained packages, explicit boundaries.** No npm workspaces — every package installs and builds independently via `file:../` deps, and a package enters an app **only across the signed admission border**, never by ambient import.

> **Licensing model (planned):** `core` = Apache-2.0 (free forever); an enterprise tier under BSL for compliance/reporting packages. A recorded design decision, not yet a physical split.

### Architecture patterns

Nine canonical patterns; 1–6 compile today (`drcm_stable_v0`), 7–9 require DRCM phases (`drcm_core_v1`). Each has a verified `.fungi` example in `tests/patterns/`.

| # | Pattern | Profile | When to use |
|---|---|---|---|
| 1 | Pure Transform | stable | Math, string transforms — no I/O |
| 2 | Governed API Route | stable | HTTP routes, webhooks — external ingress |
| 3 | High-Trust Mutation | stable | Payments, medical, government data |
| 4 | Cross-Boundary Workflow | stable | External APIs |
| 5 | Secret-Using Flow | stable | Reads a credential — `secrets {}` + taint guards |
| 6 | Multi-Tier Service | stable | API → business → data, three governed flows |
| 7 | Governed WASM Module | `drcm_core_v1` | DSS supervision, DWI isolates |
| 8 | Emergency Policy Overlay | `drcm_core_v1` | Auto-tightening `policy {}` |
| 9 | .lmanifest Compliance | `drcm_core_v1` | PCI DSS / SOC 2 artifact |

> In-repo pattern examples: [`docs/patterns/`](docs/patterns/) + `tests/patterns/`

### Building an application

A Galerina app is **compile-time conventions + signed governed packages fused at declared seams — not runtime middleware.** Scaffold with `galerina new app`:

```text
my-orders-app/
├── App.fungi        composition-root flow (the app entry)
├── App.manifest     declarative descriptor → folded into the SIGNED build/App.lmanifest
├── flows/           your governed business logic
├── deps/            signed governed components admitted at the fuse border
├── proofs/          contract-driven generated tests
└── .gitignore       build/ output + .env secrets are never committed
```

`galerina build App.fungi` produces **one signed `build/App.wasm` + `build/App.lmanifest`**. A host **App Kernel** admits that wasm at a deny-by-default **fuse border** — three fail-closed gates — before it runs a single instruction:

1. **hash-pin** — the `.wasm` sha256 must equal the signed descriptor.
2. **signature + revocation** — a valid Ed25519 signature from a non-revoked key.
3. **closed capabilities** — a declared capability with no host shim is refused (link-time `LinkError → CRITICAL_SECURITY_VIOLATION`).

At runtime the app reaches the world **only** through the deny-by-default **Capability Host** (network · db · secrets), with governance compiled *into* the wasm rather than wrapped around it. `.env` secrets are injected at runtime, never compiled in.

> Framework designs: [`docs/framework/`](docs/framework/)

---

## Where the project is (2026-07-22)

**v1.0.0-beta.2 · full suite 95/95 packages · 7,672 tests · 0 failures.**

| Layer | Status | Note |
|---|---|---|
| **Compiler pipeline** (lexer → parser → checkers → governance → GIR) | ✅ complete | full pipeline, fail-closed diagnostics |
| **Type / effect checkers** | ✅ complete | full TYPE/EFFECT diagnostic charter, twin-parity verified |
| **WAT / WASM backend** | ✅ complete | lowering audit `VIOLATIONS: 0`; Decimal (bignum) + higher-order closures are deliberate fail-closed feature-flags |
| **Tests** | ✅ green | 95/95 · 7,672 · 0 fail |
| **Stage-B self-hosting** (the compiler rewritten in `.fungi`) | ◑ parity proven | **all 7 stages proven byte-identical** to the reference compiler as signed, admission-gated WASM (R3); the authority cutover to `.fungi`-as-decider is staged behind the flip ladder |
| **Execution cutover** (governed decision surfaces → signed WASM) | ◑ in progress | **9 authoritative** (reference implementations demoted to differential shadows) · **20 differential-proven** · 0 unproven |
| **DSS.wasm supervisor** (real Wasmtime TCB) | ◑ in progress | decision core **proven on real wasmtime** — 386-point three-way differential (interpreter ≡ Node-WASM ≡ wasmtime) + governance laws asserted on wasmtime outputs; embedder build underway |
| **Post-quantum signing** | ◑ shipped surfaces | hybrid Ed25519+ML-DSA-65 on attestation/proof/bridge; opt-in certified `.lmanifest` profile (both halves required, fail-closed) |
| **`.spore` trust-capsule format** | ◑ slices 1–3 | TMX-256 + container + KEM-DEM golden-verified; ML-DSA root signing next. `env.spore` sealed secrets shipped |
| **Application framework** (app-kernel · api-server · scaffolder) | ◑ building | admission/fusion border + scaffolder + governed resolver real + tested; servable api-server the remaining gap |
| **B8 governed HTTP transport (TLSTP)** | ◑ building | S1 cert gate + admission fold execution-proven; raw-byte shim · recovering-FSM · ECH/OHTTP · in-sandbox isolation remain |
| **Passive execution plans · AI inference tower** | ◑ building | decision surfaces authored in `.fungi` and executing through admission; host wiring increments remain |
| **Photonic / ternary computing** | early | software simulation only (not hardware) |

**Benchmarks (honest numbers).** WASM is the production path. Certified cross-runtime lanes measure **WASM at 30–59% of native Rust, memory ~0 B/op** (2026-07-18 refresh); WASM won 3 workloads outright in the last full truth-audited run (binary-trees · hardware-targets · fibonacci, 2026-07-12); governance tax measured at ~27.7% on the governed-flow view. Interpreter tiers are diagnostic (the WASM parity oracle), excluded from winning by the scoreboard standard. Lanes without work-equivalence carry **no** cross-runtime ratio. Canonical view: `npm run compare` §1.5 in `packages-galerina/galerina-devtools-benchmarks`.

**Live status tools:** `node scripts/status.mjs` · `node scripts/component-health.mjs --table` (per-component readiness, Tests row sourced from `version.json`) · in-repo audit: [component-readiness-honest-audit-2026-07-10.md](docs/architecture/component-readiness-honest-audit-2026-07-10.md).

---

## Diagrams

<table align="center">
  <tr>
    <td align="center" width="100%"><a href="docs/diagrams/galerina-mechanics.svg"><img src="docs/diagrams/galerina-mechanics.svg" alt="Galerina — governance-first compute pipeline" width="100%"></a><br><sub><b>Galerina — governance-first compute pipeline</b></sub></td>
  </tr>
  <tr>
    <td align="center" width="100%"><a href="docs/diagrams/galerina-k3-verdict-lattice.svg"><img src="docs/diagrams/galerina-k3-verdict-lattice.svg" alt="Galerina — the K3 verdict lattice" width="100%"></a><br><sub><b>The K3 verdict lattice (deny-by-default, No-Coercion min)</b></sub></td>
  </tr>
  <tr>
    <td align="center" width="100%"><a href="docs/diagrams/galerina-ungoverned-vs-governed-breach.svg"><img src="docs/diagrams/galerina-ungoverned-vs-governed-breach.svg" alt="Galerina — the breach that can't compile" width="100%"></a><br><sub><b>The breach that can't compile (ungoverned vs governed)</b></sub></td>
  </tr>
</table>

> **18 more** — capability radars (security/governance · performance · DevX · web/API · databasing · data science · AI/ML · language/type-system vs Rust/TS/Python …) and concept maps (trust-state lifecycle · govern-don't-absorb · privacy-cut authoring · governed healthcare + payment lanes) — in [`docs/diagrams/`](docs/diagrams/).

---

## Running the tools

```bash
# Tests — core suite (4 packages) / full suite (95 packages)
node scripts/run-all-tests.cjs --core
npm test

# Scaffold a new governed app (deny-by-default)
galerina new app my-orders-app

# Compile a .fungi program to WASM and run it
galerina build examples/auth-service/sovereignTransaction.fungi
galerina run   examples/auth-service/verifyPassword.fungi --invoke verifyPassword
galerina check examples/auth-service/verifyPassword.fungi

# Run a .wasm binary without Node.js
wasmtime --invoke main build/benchmark.wasm

# Benchmarks (~5–10 min), then the canonical comparison
cd packages-galerina/galerina-devtools-benchmarks && npm run run && npm run compare

# Plugin border check (fail-closed admission)
node galerina.mjs border-check

# Security + PCI audit sweep
node packages-galerina/galerina-devtools-security/dist/cli.js audit examples/auth-service/verifyPassword.fungi
node packages-galerina/galerina-devtools-pci/dist/cli.js audit examples/auth-service/
```

---

## Key documents

| Document | What it covers |
|---|---|
| [SETUP.md](SETUP.md) | Install on Windows / Linux / macOS, benchmarks, Hello World |
| [`docs/paper/`](docs/paper/) | Publishing standard (defensive-pub + measured-negative only, no flagship by design) — **43 defensive-publication notes + 8 scientific papers** + UK/US/EU compliance checklist |
| [`AGENTS.md`](AGENTS.md) | The AI-agent entry point — authoritative sources, package map, conventions |
| [component-readiness-honest-audit](docs/architecture/component-readiness-honest-audit-2026-07-10.md) | Per-component readiness — the in-repo honest status view |
| [`docs/rules/`](docs/rules/) | Design principles, boundary safety, governance doctrine, non-negotiables |
| [`docs/framework/`](docs/framework/) | App kernel, HTTP transport, MCP/AI tool boundaries |
| [`docs/security/`](docs/security/) | Security passes + runbooks — key ceremony, MCP tool-poisoning, SLSA/BOLA |
| Internal engineering KB *(separate private repository, ~1,550 docs)* | Master index · roadmaps + % audits · concept specs · numbered FUNGI rule registry · fail-open taxonomy · DRCM · architecture patterns |

---

## Licence

Galerina is licensed under the Apache License 2.0. See [`LICENSE`](LICENSE), [`NOTICE.md`](packages-galerina/galerina-core/NOTICE.md), and [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md) (all third-party dependencies are permissively licensed and free for commercial use).
