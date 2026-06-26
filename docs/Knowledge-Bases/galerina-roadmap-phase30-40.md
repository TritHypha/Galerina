# Galerina — Phase 30–40 Roadmap

## State at Phase 29 Completion (2026-06-01)

```
2468 tests · 0 failures
222/222 CEC examples stable
~22,000 lines TypeScript source (~62 source files)
Phase 29 delivered:
  - NaN-boxing tagged integers (tagInt/isTagged/untag/fitsTagged) in interpreter.ts
  - ExecutionGraph fast-path in runFromGraph() — register-VM over pre-compiled ExecNode[]
  - SoANodeArena (structure-of-arrays, cache-friendly parallel typed arrays)
  - FlatTokenStream (stride-4 Int32Array, zero heap allocation per token)
  - FusedPass (single linear source scan → packed 32-bit GIR opcodes)
  - UnifiedAnnotator (single AST pass computes type+value-state+effect+governance)
  - production-check.ts (checkProductionReadiness — PRODUCTION_BLOCKERS set)
  - Package registry scaffold at packages-galerina/galerina-registry/
```

Known gaps entering Phase 30:
- Level-1-Basics: pre-existing errors (BOM in 3 files, missing domain types, top-level binding rules)
- Package registry: hash/signature fields pending `galerina package hash` command
- Import system (11E) needed before domain types resolve in CEC examples
- ExecutionGraph fast-path still guarded behind `{ egraphFastPath: true }` flag
- contractEnforcer/capabilityHost not yet wired into executeFlow() (11C wiring)
- Governed memory (11D) skeleton only — access checks not enforced at runtime

---

## Phase 30 — Performance Foundation

**Theme:** Activate the performance infrastructure built in Phase 29. NaN-boxing,
binding slots, and the unified annotation pass move from opt-in to default. Prove
Galerina arithmetic within 3× of Python on the benchmark suite.

### What it delivers

- **30A — NaN-boxing fully active in ExecutionGraph.**
  The tagged-integer fast-path (`tagInt`/`untag`/`isTagged`) is wired into
  `runFromGraph()` for all BINOP nodes operating on Int+Int pairs. Integer
  arithmetic no longer allocates `{ __tag: "int", value: n }` objects on the hot
  path. The pre-allocated `INT_POOL[0..255]` pool is the primary integer sink.
  The NaN-boxing gate (`egraphFastPath`) is removed; the register-VM executor is
  the default path for all pure flows with complete ExecutionGraphs.

- **30B — Binding slot Int16Array replacing Map<string,GalerinaValue>.**
  `assignSlots()` and `SlottedScope` (Phase 29 stubs) become the primary binding
  store. `executeFlow()` allocates a `Float64Array` for NaN-boxed slots alongside
  a `GalerinaValue[]` side-table for non-integer values. Map-based scope lookups are
  removed from the hot path entirely. `SlottedScope` handles the transition between
  slot-indexed and name-indexed lookup for compatibility with the tree-walker
  fallback.

- **30C — Unified Annotation pass used by default in all checkers.**
  `annotate()` from `unified-annotator.ts` is called once before all checker passes.
  The returned `AnnotationMap` is threaded through `checkEffects`, `checkTypes`,
  `checkValueStates`, and `verifyGovernance` so each checker reads pre-computed
  data rather than re-walking the AST. This eliminates 3–4 redundant tree walks
  per compilation.

- **30D — Benchmark baseline established.**
  `galerina-devtools-benchmarks` runs the benchmark suite and records baseline
  timings for:
  - Pure arithmetic (fib(30), sum 1..10000)
  - Mixed flow (verifyPassword path, no network)
  - WAT compilation round-trip (parse → WAT)
  Target: Galerina arithmetic within 3× of Python 3.12 on the same machine.

### Key milestone

`node dist/cli.js build --production examples/Level-1-Basics` produces 0 errors
for at least 10 of the Level-1 examples. Benchmark report shows Phase 30 target met.

### Primary example proving it

`examples/benchmarks/arithmetic-hot-path.spore` — pure flow computing fib(30)
10,000 times. Benchmark shows < 3× Python time using the register-VM executor.

### Test count target

**2540 tests** (72 new: 30A NaN-boxing active, 30B slot array, 30C unified
annotator wired, 30D benchmark regression harness).

---

## Phase 31 — Package Ecosystem

**Theme:** The package registry goes live. Three governed packages are published
with full capability declarations, signed manifests, and HIPAA/auth semantics.
Import resolution works end-to-end so CEC examples using domain types compile.

### What it delivers

- **31A — Package registry v1.0 live.**
  `packages-galerina/galerina-registry/` becomes a publishable registry service.
  `galerina package hash` command generates SHA-256 content hashes for manifest
  files. `galerina package sign` signs manifests with Ed25519. SPORE-PKG-001..005
  are enforced in all CI runs. A lockfile format (`galerina.lock`) is defined.

- **31B — @galerina/auth published.**
  `packages/@galerina/auth/package.galerina.yaml` gains: hash, Ed25519 signature,
  capability list (`secret.read`, `crypto.verify`, `audit.write`), and a type
  export for `SessionToken`, `AuthResult`. Import resolution wired in 11E (see 31D).

- **31C — @galerina/healthcare and @galerina/ai published.**
  `@galerina/healthcare`: PHI-governed types (`PatientId`, `PHI`, `ClinicalNote`),
  HIPAA capability requirements (`phi.read`, `audit.write`, `database.read`).
  `@galerina/ai`: Tensor inference types (`EmbeddingVector`, `ClassificationResult`),
  NPU capability requirements (`ai.inference`, `audit.write`).

- **31D — `import Email from "@galerina/healthcare-types"` resolves correctly.**
  Phase 11E (import resolver) is completed. `resolveImports()` in `import-resolver.ts`
  resolves cross-module types against `KNOWN_PACKAGE_TYPES` and installed manifests.
  Domain types `Email`, `PatientId`, `CurrencyCode` resolve in CEC Level 8/9 examples.
  CEC stable count jumps from ~108 → ~160+.

- **31E — SPORE-PKG-001..005 enforced in all CI.**
  `galerina check` in CI mode with `--strict-packages` fails on any unsigned, unhashed,
  or capability-expanded package. The registry CI script validates all published packages.

### Key milestone

`import Email from "@galerina/healthcare-types"` compiles in `getPatient.spore` with 0
errors. Package lockfile generated and committed for the three core packages.

### Primary example proving it

`examples/healthcare/getPatient.spore` with the `@galerina/healthcare` import fully
resolved. `verifyGovernance("production")` produces zero governance violations.
PHI protection contract verified by the runtime manifest.

### Test count target

**2650 tests** (110 new: 31A hash/sign commands, 31B auth package types, 31C
healthcare/AI types, 31D import resolver end-to-end, 31E CI enforcement).

---

## Phase 32 — Developer Tooling

**Theme:** Galerina becomes usable in real editors. An LSP server provides syntax
highlighting, error squiggles, and hover type info. `galerina format` and
`galerina explain` reduce friction for new users.

### What it delivers

- **32A — LSP basic implementation.**
  `packages-galerina/galerina-lsp/` created. LSP server implements:
  `textDocument/publishDiagnostics` (from `galerina check` output),
  `textDocument/hover` (type from `AnnotationMap`),
  `textDocument/definition` (symbol resolver result).
  Protocol: JSON-RPC over stdio. Compatible with VS Code, Neovim, Helix.

- **32B — IDE: syntax highlighting, error squiggles, hover type info.**
  VS Code extension `galerina-vscode` (minimal): TextMate grammar for `.spore` files,
  LSP client wired to the LSP server. Error squiggles from publishDiagnostics.
  Hover shows resolved TypeId and effect declarations. No build step required.

- **32C — `galerina format` command.**
  `cli.ts` gains `format` subcommand. Opinionated formatter: consistent indentation
  (2 spaces), contract block alignment, sorted effects list. Uses the existing lexer
  and parser; format is deterministic (same input → same output). SPORE-BUILD-001
  cannot be triggered by format output.

- **32D — `galerina explain <diagnostic>` command.**
  `cli.ts` gains `explain` subcommand. `galerina explain SPORE-EFFECT-005` prints the
  full diagnostic definition: code, name, severity, message, why, suggestedFix,
  and an inline code example showing the problem and fix. All diagnostics in
  `index.ts` gain an optional `example` field.

### Key milestone

A `.spore` file opened in VS Code shows syntax highlighting, and editing to introduce
an `SPORE-EFFECT-005` violation causes a red squiggle within 500 ms. `galerina explain
SPORE-EFFECT-005` prints a complete explanation.

### Primary example proving it

`examples/auth-service/verifyPassword.spore` opened in VS Code LSP mode. Hover over
`crypto.verify` shows: `Effect: crypto.verify · Requires: crypto.verify capability`.
Removing the effect from the contract produces a squiggle on the `Crypto.verify`
call immediately.

### Test count target

**2730 tests** (80 new: 32A LSP protocol, 32B grammar, 32C format determinism,
32D explain output for all SPORE-* codes).

---

## Phase 33 — Cloud Deployment

**Theme:** Galerina programs run on Deno Deploy and Cloudflare Workers. The WASM
bundle story is proven end-to-end. Edge deployment of the auth service is live.

### What it delivers

- **33A — Deno Deploy target working.**
  `galerina build --target=deno-deploy` emits a `main.ts` Deno entrypoint:
  - HTTP server using `Deno.serve()`
  - Route dispatch from `RouteRegistry`
  - Capability host backed by Deno APIs (`Deno.env`, `Deno.kv`)
  - Audit writer emitting to `console.log` (structured JSON for log aggregation)
  `verifyPassword` deploys to Deno Deploy with governed execution proven by
  the runtime manifest in every response header (`X-SPORE-Proof`).

- **33B — Cloudflare Workers target working.**
  `galerina build --target=cf-worker` emits a `worker.js` with:
  - `fetch` handler from `RouteRegistry`
  - Capability host backed by Workers KV and Secrets
  - WASM binary inlined as a base64 asset (auto-assembled by `assembleWAT`)
  - `wrangler.toml` generated from `package.galerina.yaml`
  SPORE-NET-001/002 network destination policy enforced in the Workers capability
  host (no dynamic host construction).

- **33C — Edge deployment of auth service.**
  `examples/auth-service/` gains `deno-deploy/` and `cf-worker/` sub-targets.
  `verifyPassword` and `createSession` both deploy. End-to-end test: HTTP POST
  to the deployed edge function, response includes `X-SPORE-Proof` hash.
  Audit log verifiable by replaying the proof chain.

- **33D — WASM bundle story proven.**
  `galerina build --target=wasm-bundle` emits a self-contained `.wasm` that can be
  loaded by any WASM runtime (wasmtime, Deno, CF Workers, browser). The WASM
  import table is populated with host stubs for all declared effects. The binary
  is deterministic (hash-stable across repeated builds). SPORE-BUILD-001 cannot fire.

### Key milestone

`verifyPassword.spore` deployed to Deno Deploy. `curl -X POST https://<deploy-url>/verify`
returns a governed JSON response with `X-SPORE-Proof` header. The proof chain
verifies against the published GIR hash.

### Primary example proving it

`examples/auth-service/verifyPassword.spore` built with `--target=deno-deploy`, deployed,
executed, and verified. Runtime manifest published to `build/wasm/manifest.json`.

### Test count target

**2830 tests** (100 new: 33A Deno emit, 33B CF Workers emit, 33C edge round-trip,
33D WASM bundle determinism).

---

## Phase 34 — Advanced Governance

**Theme:** Governance moves from per-flow declarations to composable runtime
policies. Multiple policies compose. Multi-tenant capability isolation is real.
Rate limiting from Phase 11C is fully wired.

### What it delivers

- **34A — Policy federation (multiple runtime policies composing).**
  `runtime/contractEnforcer.ts` gains `composePolicy(policyA, policyB)`:
  - Combined effect allowlist = intersection of both
  - Combined rate limit = min of both
  - Combined memory arena = min of both
  - Deny-wins: if either policy denies a capability call, it is denied
  A service can load a base policy (from `@galerina/auth`) and a domain policy
  (from `@galerina/healthcare`) and have them compose without manual merging.

- **34B — Multi-tenant capability isolation.**
  `capabilityHost.ts` gains a tenant ID parameter. Each tenant gets its own
  `FlowCallCounters` instance. A tenant that exceeds its rate limit cannot
  affect another tenant's counter. The runtime report includes `tenantId` in
  every audit event. SPORE-GOV-013 (BoundaryViolation) fires if a flow attempts
  to access a capability not granted to its tenant.

- **34C — Rate limiting enforcement (Phase 11C complete).**
  `limitPolicy.ts` is fully wired into `executeFlow()`. A flow that exceeds
  `maxNetworkRequests` from its contract receives an `Err("RateLimitExceeded")`
  immediately. `timeoutPolicy.ts` aborts flows that exceed their declared timeout
  using `AbortSignal`. `retryPolicy.ts` retries capability calls with exponential
  back-off up to `maxRetries`. All three are connected, not skeletons.

- **34D — SPORE-NET-001/002 enforced in production.**
  Network destination policy (`parseNetworkDestinationPolicy`) is wired into
  the capability host's `network.outbound` handler. In production mode, any
  call to a host not in `allowedHosts` emits SPORE-NET-001 and the call is denied.
  DNS rebinding defence: private IP ranges are checked after DNS resolution
  (`PRIVATE_IP_RANGES` from `security-policy.ts`). SPORE-NET-002 fires on
  private IP access without explicit `allowPrivateNetwork: true`.

### Key milestone

A multi-tenant auth service processes 100 concurrent tenants with per-tenant rate
limits and isolated audit logs. Policy federation verified: healthcare policy
+ auth policy compose correctly, denying cross-tenant PHI access.

### Primary example proving it

`examples/auth-service/multi-tenant-verify.spore` — two tenants with different rate
limits share one service instance. Tenant A hitting rate limit does not affect
tenant B. Each tenant's audit log is separate and hash-verifiable.

### Test count target

**2950 tests** (120 new: 34A policy composition, 34B tenant isolation, 34C rate
limiting enforcement, 34D network destination enforcement).

---

## Phase 35 — Healthcare/Finance Compliance

**Theme:** Galerina has HIPAA and PCI-DSS governance templates that organisations
can use directly. PHI protection is end-to-end proven by the audit chain.
Third-party auditors can verify the chain without the source code.

### What it delivers

- **35A — HIPAA governance template.**
  `packages/@galerina/healthcare/hipaa-template.spore` — a contract set that any
  Galerina service can `use HipaaBaseContract`:
  - Requires `audit.write` with retention duration declared
  - Requires `phi.read` effect for any PHI field access
  - Requires `deny protected PatientId to response.body` in all routes
  - Requires redaction before any audit write that touches PHI
  - Emits `SPORE-GOV-HIPAA-001` if any PHI escapes the audit boundary
  The template is enforced at compile time by `verifyGovernance("production")`.

- **35B — PCI-DSS flow patterns.**
  `packages/@galerina/finance/pci-dss-template.spore` — a contract set for payment
  flows:
  - `CardNumber` is always `protected` and never logged
  - `CVV` is `redacted` after initial validation — irreversibly
  - `PaymentResult` cannot include raw card data in `response.body`
  - Scope: CHD (cardholder data) never enters an insecure effect chain
  Enforced at compile time. SPORE-GOV-PCI-001 fires on any CHD exposure.

- **35C — PHI protection end-to-end proven.**
  `examples/healthcare/getPatient.spore` with the HIPAA template applied.
  Full proof chain: `buildProofChain()` produces a chain that includes:
  - Source hash of the flow
  - GIR hash of the compiled flow
  - Runtime manifest hash
  - Audit record hash per execution
  A third-party auditor can verify compliance without source access.

- **35D — Audit chain verifiable by third parties.**
  `galerina audit verify <chain-file>` command. Given a proof chain JSON file,
  verifies all hashes are internally consistent and the attestation signature
  matches the declared public key. Output: `PASS` or `FAIL` with specific
  failure reason. No Galerina installation required — pure hash + signature
  verification using Ed25519.

### Key milestone

A `getPatient.spore` execution produces an audit chain that `galerina audit verify`
confirms as PASS. The chain is self-contained: no source code needed to verify
PHI was not leaked. Third-party auditor tool confirmed working.

### Primary example proving it

`examples/healthcare/getPatient.spore` compiled with `--hipaa`, executed against
a mock database, audit chain written to `audit/2026-06-01-getPatient.chain.json`.
`galerina audit verify audit/2026-06-01-getPatient.chain.json` → PASS.

### Test count target

**3080 tests** (130 new: 35A HIPAA template compile-time enforcement, 35B PCI-DSS
patterns, 35C proof chain completeness, 35D audit verify command).

---

## Phase 36 — AI/ML Full Stack

**Theme:** `Tensor<Float32,[768]>` lowers to `Float32Array` in real WAT. WASM SIMD
ops (`f32x4_add`, `f32x4_mul`) are emitted for vectorised tensor ops. NPU dispatch
via EDA (child-process isolation, DataHandle, Component Model ABI) is operational.
An AI inference example is deployed and audited.

### What it delivers

- **36A — `Tensor<Float32,[768]>` lowers to `Float32Array` in WAT.**
  `buildTypedArrayLoweringPlan()` (Phase 21A) is wired into `buildWATModuleFromGIR()`.
  Tensor parameters become `(param $embeddings i32) ;; Float32Array pointer` in WAT.
  `ELEMENT_TYPE_TO_TYPED_ARRAY["Float32"] = "Float32Array"` is used in body emission.
  The WAT body includes load/store ops against the linear memory region.

- **36B — WASM SIMD for f32x4 ops.**
  `WAT_SIMD_OPS` (Phase 27D) is used in real body emission. The kernel fusion
  emitter detects adjacent `f32.add` / `f32.mul` ops on the same tensor and
  replaces them with `f32x4.add` / `f32x4.mul` SIMD instructions.
  `WASMSIMDCapability` is set to `true` in the WAT module when SIMD ops are emitted.
  `v128.load` / `v128.store` used for 128-bit vector loads from `Float32Array` data.

- **36C — NPU dispatch with EDA (native Tensor.dot).**
  `examples/ai-inference/Tensor.dot.native-spec.json` (Phase 27B) is operative.
  `NativeCapabilityId.NpuInference` maps through `EFFECT_TO_NATIVE_CAPABILITY` to
  a real EDA child-process call in the capability host. DataHandle arena (32 MB)
  is allocated per request. Component Model ABI `galerina-hardware-npu:execute-dot`
  invoked. Fallback to CPU SIMD path when NPU process is unavailable.

- **36D — AI inference example deployed and audited.**
  `examples/ai-inference/classifyMessage.spore` built with `--target=deno-deploy`,
  deployed to an edge function. Input: user message string. Output: classification
  result + confidence score. Audit: PII declared in privacy contract, PII redacted
  before audit write. Governance: `ai.inference` + `audit.write` effects declared
  and enforced. Runtime manifest proves NPU dispatch or CPU fallback path taken.

### Key milestone

`classifyMessage.spore` deployed to Deno Deploy. WASM binary uses `f32x4.add` SIMD
ops for the embedding dot product. NPU dispatch path exercised in CI (mocked EDA
process). Audit chain proves PII was not logged.

### Primary example proving it

`examples/ai-inference/classifyMessage.spore` WAT output contains `v128.load`,
`f32x4.mul`, `v128.store`. The proof chain includes: source hash + GIR hash +
runtime manifest (npu→cpu fallback recorded) + audit record (PII redacted).

### Test count target

**3200 tests** (120 new: 36A typed array lowering, 36B SIMD emission, 36C EDA
dispatch, 36D AI inference audit chain).

---

## Phase 37 — Post-Quantum Security

**Theme:** ML-DSA (FIPS 204) replaces Ed25519 for attestation. CHERI capability
mapping is defined. ARM MTE integration is specified. TEE execution mode is
scaffolded, enabling high-security Galerina deployments.

### What it delivers

- **37A — ML-DSA attestation integrated.**
  `attestation.ts` gains `signAttestationMLDSA()` and `verifyAttestationMLDSA()`
  alongside the existing Ed25519 functions. `AttestationKeyPair` gains a `algorithm`
  field: `"ed25519"` | `"ml-dsa-65"`. `generateAttestationKey({ algorithm: "ml-dsa-65" })`
  produces a FIPS 204 keypair using the `@noble/post-quantum` library.
  `galerina audit verify` supports both Ed25519 and ML-DSA signatures automatically.

- **37B — CHERI capability mapping defined.**
  `docs/Knowledge-Bases/cheri-capability-mapping.md` documents the 1:1 mapping
  between Galerina governance qualifiers and CHERI hardware capabilities:
  - `protected Email` → CHERI capability with read-only permission + provenance tag
  - `redacted PHI` → CHERI capability zeroed after first use (no revive)
  - `secret.read` effect → CHERI capability granted only to the specific flow
  The mapping is a specification; implementation targets ARM Morello or CHERI RISC-V.
  `SPORE_CHERI_001` diagnostic: accessing a CHERI-mapped value without the right
  capability permission.

- **37C — ARM MTE integration spec.**
  `docs/Knowledge-Bases/arm-mte-integration.md` documents how ARM Memory Tagging
  Extension (MTE) tags align with `governedMemory.ts`:
  - `protected` values allocated in MTE-tagged regions
  - Tag mismatch → hardware trap → Galerina `SPORE-RUNTIME-005` audit event
  - `GovernedValueTag` maps to an MTE tag byte
  Scaffold: `governedMemory.ts` gains `mteTag?: number` on `GovernedValueTag`.
  Runtime: stub for MTE tag allocation (real MTE requires native ARM runtime).

- **37D — TEE execution mode.**
  `galerina build --target=tee` emits a TEE-ready binary:
  - Attestation signed with ML-DSA
  - Runtime manifest includes TEE measurement (MRENCLAVE placeholder)
  - Capability host in TEE mode denies all network effects by default
  - `galerina tee verify <report>` command verifies TEE attestation
  Scaffold: TEE measurement is a placeholder hash; real Intel SGX / AMD SEV
  integration deferred to Phase 40.

### Key milestone

`verifyPassword.spore` built with `--target=tee --attestation=ml-dsa-65`. The
resulting attestation is verifiable by `galerina audit verify` using the ML-DSA
public key. CHERI mapping document published to `docs/Knowledge-Bases/`.

### Primary example proving it

`examples/auth-service/verifyPassword.spore` attestation produced with ML-DSA-65
key. `galerina audit verify --algorithm=ml-dsa-65 auth-service.chain.json` → PASS.
`galerina explain SPORE-CHERI-001` prints the CHERI capability mapping explanation.

### Test count target

**3320 tests** (120 new: 37A ML-DSA sign/verify, 37B CHERI mapping validation,
37C MTE tag scaffold, 37D TEE build target).

---

## Phase 38 — Distributed Governance

**Theme:** Governance crosses service boundaries. Service A can trust service B's
contracts. Capability delegation is expressed in Galerina. Distributed audit chains
link across service boundaries. Federated policy evaluation is operational.

### What it delivers

- **38A — Multi-service governance.**
  A Galerina service can declare `trusts "@galerina/auth" version "^1.0"` in its
  `package.galerina.yaml`. The governance verifier checks that the trusted service's
  runtime manifest is signed and its capabilities are a subset of what is granted.
  SPORE-GOV-FEDERATED-001: cross-service trust without a signed manifest.
  `verifyGovernance("production")` spans service boundaries.

- **38B — Cross-boundary capability delegation.**
  `capabilityHost.ts` gains `delegateCapability(capability, toServiceId, expiresAt)`.
  A delegation token is signed with the service's attestation key (Ed25519 or ML-DSA).
  The receiving service validates the delegation before exercising the capability.
  Delegations are time-bounded and scoped (cannot grant more than the delegator has).
  SPORE-GOV-FEDERATED-002: exercising a capability without valid delegation.

- **38C — Distributed audit chain.**
  `buildProofChain()` gains a `parentChainHash` field. When service B processes a
  request forwarded from service A, B's audit chain references A's chain hash.
  The resulting chain is a linked structure: each service's audit is verifiable
  independently and as a composite. `galerina audit verify --follow-chain` traverses
  all linked chains.

- **38D — Federated policy evaluation.**
  A `PolicyFederation` type is introduced:
  - Each participant service declares its policy in `package.galerina.yaml`
  - A federation coordinator combines policies using `composePolicy()` (Phase 34A)
  - The composed policy is published as a signed manifest
  - All participant services validate requests against the composed manifest
  Use case: a healthcare platform where the auth service, patient API, and
  audit service each have policies that compose to a HIPAA-compliant federation.

### Key milestone

A two-service example: `auth-service` delegates `database.read` to `patient-api`
for a time-bounded request. The patient-api produces an audit chain that references
the auth-service chain. `galerina audit verify --follow-chain` validates both.

### Primary example proving it

`examples/distributed/auth-patient-federation/`:
- `auth-service.spore` delegates `database.read` to `patient-api`
- `patient-api.spore` exercises the delegated capability
- Combined audit chain: `galerina audit verify --follow-chain combined.chain.json` → PASS

### Test count target

**3460 tests** (140 new: 38A cross-service trust, 38B delegation tokens,
38C linked audit chains, 38D federation composition).

---

## Phase 39 — Enterprise Deployment Toolkit

**Theme:** Galerina services deploy to Kubernetes with governance as a sidecar.
Runtime policy is a Kubernetes CRD. A governance dashboard shows live policy
status. Compliance reports are generated automatically.

### What it delivers

- **39A — Kubernetes deployment with governance sidecar.**
  `galerina build --target=kubernetes` emits:
  - `Dockerfile` (from `service {}` declaration)
  - `deployment.yaml` (Kubernetes Deployment with governance sidecar container)
  - `service.yaml` (Kubernetes Service)
  - `configmap.yaml` (runtime policy from `package.galerina.yaml`)
  Governance sidecar: a minimal Galerina runtime that intercepts capability calls
  and enforces the runtime policy without modifying the main service container.

- **39B — Runtime policy as Kubernetes CRD.**
  A `GalerinaPolicy` CRD (Custom Resource Definition) is defined. Fields mirror
  the `RuntimeManifest` type: `allowedEffects`, `maxNetworkRequests`,
  `maxMemoryMb`, `requiresAudit`, `auditRetentionDays`, `allowedHosts`.
  The governance sidecar watches the CRD and reloads policy on change without
  restarting the main container. SPORE-K8S-001: policy CRD spec mismatch with
  the service manifest.

- **39C — Governance dashboard.**
  `packages-galerina/galerina-dashboard/` — a minimal web dashboard (HTML + fetch):
  - Per-service: current policy, live capability call counts, recent denials
  - Per-tenant: request counts, rate limit status, last audit event
  - Proof chain browser: expand any execution to see source hash → GIR hash →
    runtime manifest hash → audit record
  Uses the structured JSON audit log from Phase 33. No backend framework — reads
  logs from a configured path.

- **39D — Compliance report generation.**
  `galerina report --format=hipaa > compliance-report.html` generates an HTML
  compliance report:
  - All flows with PHI effects listed with their contracts
  - Audit retention policy per flow
  - Any SPORE-GOV-HIPAA-* violations in the last build
  - Signed attestation key fingerprint
  `galerina report --format=pci-dss` generates the equivalent for PCI-DSS flows.
  Reports are deterministic (same build → same report hash).

### Key milestone

`examples/healthcare/getPatient.spore` deployed to a local Kubernetes cluster using
`galerina build --target=kubernetes`. The governance sidecar enforces the HIPAA
policy. `galerina report --format=hipaa` produces a passing compliance report.

### Primary example proving it

`examples/healthcare/k8s/` directory:
- `galerina build --target=kubernetes` output committed
- Local cluster deployment verified with `kubectl apply -f k8s/`
- `galerina report --format=hipaa` → `compliance-report.html` shows 0 violations

### Test count target

**3600 tests** (140 new: 39A Kubernetes emit, 39B CRD schema, 39C dashboard
data format, 39D report generation determinism).

---

## Phase 40 — Galerina 1.0

**Theme:** Galerina 1.0 ships. All 222 CEC examples run stably in
`--production --deterministic`. The compiler compiles itself (Stage B). Ten or more
certified packages are published. Three real organisations run Galerina in production.
Performance is within 10× of Node.js for pure governed flows.

### What it delivers

- **40A — All 222 CEC examples stable in `--production --deterministic`.**
  Every CEC example (Levels 1–9) compiles with 0 errors under
  `galerina build --production --deterministic`. This requires:
  - Phase 31D import resolver fully working (domain types resolve)
  - Phase 30 BOM cleanup for Level-1 files
  - All remaining Level 8/9 examples (Tensor, AI) governed correctly
  - `SPORE-BUILD-001` never fires on any CEC example
  CEC stable count: 222/222.

- **40B — Stage B: Galerina compiler compiles itself.**
  `galerina build src/ --self-hosted` runs without errors. The self-hosted
  compiler produces a binary that compiles the `greet.spore` hello-world example
  identically to the TypeScript bootstrap.
  `verify-selfhost` command: B1 (TypeScript) → B2 (self-hosted round 1) →
  B3 (self-hosted round 2). B2 and B3 output hashes match.
  `PARITY_ACHIEVED = true` for all four Stage B milestone files (already true
  for lexer.spore, parser.spore, type-checker.spore, compiler.capabilities.spore).

- **40C — Package registry with 10+ certified packages.**
  The Galerina registry publishes certified packages with Ed25519 or ML-DSA
  signatures, content hashes, and capability declarations reviewed by the
  Galerina governance committee. Certified packages:
  `@galerina/auth`, `@galerina/healthcare`, `@galerina/ai`, `@galerina/finance`,
  `@galerina/observability`, `@galerina/vault`, `@galerina/messaging`,
  `@galerina/identity`, `@galerina/audit`, `@galerina/compliance` (10 packages).
  All packages enforce SPORE-PKG-001..005 in CI.

- **40D — Production deployment at 3 real organisations.**
  Three external organisations run Galerina services in production:
  1. A healthcare provider: `getPatient` + HIPAA compliance reports
  2. A fintech startup: payment processing with PCI-DSS template
  3. An AI company: classification inference with NPU dispatch + audit chain
  Each organisation has signed attestation keys and governance dashboards.
  Case studies published to `docs/case-studies/`.

- **40E — Performance: Galerina governed within 10× of Node.js for pure flows.**
  Benchmark: pure arithmetic flow (fib(30) × 10,000) with governance overhead.
  Target: Galerina 1.0 is within 10× of vanilla Node.js for the same computation.
  This is achieved through:
  - Phase 30 register-VM executor (NaN-boxing + binding slots)
  - Phase 36 WASM SIMD for tensor ops
  - Phase 33 WASM bundle (no interpreter overhead for pure flows)
  Benchmark results published to `packages-galerina/galerina-devtools-benchmarks/results/`.

### Key milestone

`galerina build --self-hosted` succeeds. `verify-selfhost` PASS. 222/222 CEC stable.
10 certified packages published. 3 production deployments confirmed.

### Primary example proving it

The Galerina compiler itself (`src/`) is compiled by Galerina. The resulting binary
compiles `examples/auth-service/verifyPassword.spore` with identical output to the
TypeScript bootstrap (verified by hash comparison).

### Test count target

**4000 tests** (400 new: 40A CEC full stability suite, 40B self-hosting verification,
40C registry certification, 40D deployment smoke tests, 40E benchmark regression).

---

## Summary Table

| Phase | Theme | Key Milestone | New Tests | Cumulative |
|-------|-------|---------------|-----------|------------|
| 30 | Performance Foundation | Arithmetic within 3× Python | 72 | 2540 |
| 31 | Package Ecosystem | `import Email` resolves in CEC | 110 | 2650 |
| 32 | Developer Tooling | VS Code LSP squiggles working | 80 | 2730 |
| 33 | Cloud Deployment | verifyPassword on Deno Deploy | 100 | 2830 |
| 34 | Advanced Governance | Multi-tenant rate limiting live | 120 | 2950 |
| 35 | Healthcare/Finance Compliance | HIPAA audit chain → PASS | 130 | 3080 |
| 36 | AI/ML Full Stack | classifyMessage with SIMD WAT | 120 | 3200 |
| 37 | Post-Quantum Security | ML-DSA attestation verified | 120 | 3320 |
| 38 | Distributed Governance | Cross-service delegation chain | 140 | 3460 |
| 39 | Enterprise Deployment | Kubernetes + compliance report | 140 | 3600 |
| 40 | Galerina 1.0 | Compiler compiles itself | 400 | 4000 |

---

## Deferred Items Carried Forward from Phase 29

These items must be resolved before Phase 40 milestones are reachable:

| Item | Blocking | Target Phase |
|------|----------|-------------|
| Level-1-Basics BOM cleanup | 40A CEC full stable | 30 |
| Phase 11C: contractEnforcer wired | 34C rate limiting | 34 |
| Phase 11D: governed memory access checks | 37C ARM MTE | 37 |
| Phase 11E: import resolver complete | 31D domain types | 31 |
| Lexer.spore Gaps 2–5 (strings, chars, comments) | 40B Stage B | 35 |

---

## Key Principles (unchanged through Phase 40)

```
Interpreter for correctness.
Execution plan for speed.
Capability host for security.
Runtime report for proof.

Governance remains above every target.
Source stays stable.
Targets evolve.

Every phase ships at least one production-grade example alongside the compiler work.
```
