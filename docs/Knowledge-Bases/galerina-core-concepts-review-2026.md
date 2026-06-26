# Galerina Core Concepts Review — 2026

**Version: 1.0 — 2026-06-01**
**Status: Development team working document — Phase 33-37 prioritisation**
**Prepared against: Phases 25-32 complete, 2,715 tests passing, 0 failures**

---

## Purpose

This document is a concrete improvement audit across five areas: Security, Speed, AI Understanding, Passive Hardware Compatibility, and Governance Completeness. Each suggestion names the specific gap, explains why it matters, and gives a concrete implementation approach tied to a roadmap phase.

The intent is to help the team prioritise Phase 33-37 work before Phase 34 introduces the first live HTTP endpoint.

---

## 1. Security

### 1.1 HTTP Header Injection — Not in the Taint Catalogue

**What is missing.**
The taint catalogue (`galerina-taint-catalogue.md`) covers SQL, HTML, shell, file path, URL component, log lines, CSV, XML, LDAP, and regex. It does not include HTTP response headers as an injection sink. The route dispatcher (`src/route-dispatcher.ts`) accepts inbound `req.headers` and exposes them directly in the hydrated request record as plain `GalerinaValue` strings. Any flow that mirrors an inbound header value into an outbound `res.setHeader()` call — for example, echoing a `Location` header in a redirect — has no taint barrier.

**Why it matters.**
Header injection allows an attacker to embed CRLF sequences to split an HTTP response into two, inject a `Set-Cookie` or `Content-Security-Policy` header of their choosing, or trigger reflected XSS in browsers that apply script-src from response headers. This is a pre-exploitation primitive for session fixation and policy bypass. Phase 34 is the first live HTTP endpoint, making this the exact window where the attack surface opens.

**Implementation approach.**
1. Add `"HttpHeaderValue"` to the `SinkContext` union in `src/taint-checker.ts` alongside the existing closed set.
2. Add an untaint boundary `Http.encodeHeaderValue(value)` that strips CR (`\r`), LF (`\n`), and null bytes and produces `SafeFor<HttpHeaderValue, String>`.
3. Register `Http.setHeader` and any future `Response.header` stdlib call in `INJECTION_SINKS` in `src/taint-checker.ts`.
4. Add `SPORE-TAINT-005` diagnostic for raw `Tainted<T>` reaching a header sink.
5. In `src/route-dispatcher.ts`, mark all values extracted from `req.headers` as taint sources (they already are via the `TAINT_SOURCES` set matching `"headers"`, but verify the hydrated record propagates this tag through `jsObjectToGalerina`).

**Phase:** 33 (pre-HTTP endpoint hardening).

---

### 1.2 SSRF — Allowlist Enforcement Is Typed but Not Runtime-Verified

**What is missing.**
`Url.parseAndAllowlist(value, policy)` exists in the taint catalogue and produces `SafeFor<SafeUrl, String>`. The type is defined in `src/taint-checker.ts`. However, the actual allowlist policy argument is not currently evaluated at compile time — the checker verifies that `parseAndAllowlist` was called (clearing taint), but does not inspect the policy parameter to confirm it excludes private-IP ranges (RFC 1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16, 127.0.0.0/8) or requires a scheme allowlist (rejecting `file://`, `gopher://`, `dict://`).

**Why it matters.**
SSRF is the most consequential attack class for a governance platform. An attacker who can make the Galerina runtime issue an outbound HTTP request to `http://169.254.169.254/latest/meta-data/` (AWS IMDSv1) or `http://10.0.0.1/admin` defeats the entire network governance model. The current taint system provides a false sense of closure: a developer calls `Url.parseAndAllowlist(url, {})` with an empty policy, gets `SafeFor<SafeUrl>`, and the compiler accepts it.

**Implementation approach.**
1. Define a `UrlAllowlistPolicy` record type in the stdlib that requires at minimum `{ schemes: string[], blockPrivateIp: boolean }`.
2. In the taint checker, when `Url.parseAndAllowlist` is detected, extract the second argument. If it is a literal record, verify that `blockPrivateIp` is `true` and `schemes` does not contain `file`, `gopher`, or `dict`. Emit `SPORE-TAINT-006 SsrfPolicyInsufficient` as a warning if missing.
3. In the runtime stdlib implementation (`src/stdlib.ts`), enforce the policy at execution time — `Url.parseAndAllowlist` must reject private IP ranges regardless of what the policy declares, as defence-in-depth.
4. Add `SPORE-NET-003 SsrfBlockPrivateIpRequired` as a compile-time governance diagnostic: any flow that declares `network.outbound` and calls user-controlled URL construction must prove `blockPrivateIp: true` is in the policy.

**Phase:** 33 (pre-HTTP endpoint).

---

### 1.3 Timing Attack Surface on `SecureString` Comparison

**What is missing.**
`SPORE-SECRET-002` (`SecretComparisonDenied`) blocks `==` comparisons on `SecureString` values. The value-state checker (`src/value-state-checker.ts`) enforces this. However, the check operates at the AST level and only catches direct `==` and `!=` operators. It does not prevent timing-unsafe comparisons through:
- Stdlib string functions called on secure values (e.g. `String.startsWith`, `String.includes`, `String.indexOf`)
- Custom gate functions that receive a `SecureString` and perform character-by-character equality internally
- Record-literal equality checks where a secure field is inside a record compared with `==`

Additionally, there is no positive path: developers who need to compare a password or HMAC have no `SecureString.timingSafeEqual(a, b)` boundary that documents the constant-time requirement.

**Why it matters.**
Timing attacks against password comparison and HMAC verification are exploitable in ~microsecond resolution on local networks. In an aerospace or medical context, leaked authentication timing information is a governance breach even if no plaintext is revealed. The current system blocks the naive case but leaves the sophisticated cases open.

**Implementation approach.**
1. Extend `SPORE-SECRET-002` in `src/value-state-checker.ts` to also detect `SecureString` passed as an argument to any string intrinsic (pattern: call to `String.*` where an argument is of type `SecureString`). Emit the same diagnostic.
2. Add `SecureString.timingSafeEqual(a, b)` to the stdlib registry (`src/stdlib-registry.ts`) as the one permitted comparison path. It must be implemented using Node.js `crypto.timingSafeEqual` in the host runtime.
3. Add `SPORE-SECRET-004 SecureStringInRecordComparison`: if a record containing a `secure` field appears in a `==` expression, emit an error.
4. Update the diagnostics documentation with the positive path so developers know what to use instead.

**Phase:** 33.

---

### 1.4 The HTTP Dispatcher Bypasses the Taint and Governance Pipeline

**What is missing.**
`src/route-dispatcher.ts` calls `executeFlow(match.route.flowName, args, ast, flows)` directly. The `hydrateRequest` function builds the inbound request record but does not mark it as tainted — it creates plain `{ __tag: "string", value }` objects, not `Tainted<String>` wrappers. The taint checker operates at compile time on AST identifiers; at runtime, inbound HTTP values are clean `GalerinaValue` strings with no runtime taint tag. The compile-time taint analysis therefore depends entirely on the flow's parameter names matching the `TAINT_SOURCES` set (currently `"request"`, `"req"`, `"input"`, `"params"`, `"query"`, `"body"`, `"headers"`, `"env"`, `"stdin"`, `"argv"`).

This means if a developer names their parameter `incomingData` instead of `request`, taint analysis is silently skipped for that parameter.

**Why it matters.**
Parameter naming is not a security invariant. A refactor can silently remove taint coverage. For Phase 34, this is the primary inbound data surface.

**Implementation approach.**
1. Add a compile-time check in the governance verifier: any flow registered as a route handler via `route` declaration must have its first parameter in the `TAINT_SOURCES` set, or emit `SPORE-GOV-014 RouteHandlerParameterNotTaintSource` as a warning.
2. For longer-term correctness (Phase 35+), introduce a `RouteRequest` type alias in the stdlib that is structurally equivalent to the hydrated record but carries a type-level taint annotation, so the type checker enforces taint regardless of parameter name.
3. In `src/route-dispatcher.ts`, add a header-count limit (recommend 100) and per-header-value length limit (recommend 8 KB) before hydration to prevent header-flooding attacks.

**Phase:** 33 (items 1 and 3), Phase 35 (item 2).

---

### 1.5 Missing: `contract.safety` Requirements Are Not Cross-Checked Against `contract.value`

**What is missing.**
`SPORE-VAL-001` requires `audit.write` for `safety_critical` flows. `SPORE-VAL-002` requires `deterministic_execution` in `contract.safety` for `safety_critical` flows. These two checks are implemented. However, the following cross-checks do not exist:

- A flow with `classification medical` is not required to declare `contract.privacy { pii { ... } }`. It can have medical classification with no privacy protection.
- A flow with `classification national_security` has no requirement for `contract.authority { require elevated_clearance }`.
- A flow with `classification financial` has no requirement for `contract.economics { max_compute_budget }` (unbounded cost for financial operations is a governance risk).
- `contract.safety { require bounded_runtime }` is declared by the parser but never checked against `contract.limits { request_time ... }`. A flow can declare `bounded_runtime` and have no actual time limit.

**Why it matters.**
Classification without enforcement is documentation. For aerospace and medical deployments, regulators (DO-178C, IEC 62304) require that safety classification has mechanically verifiable consequences — not just labels.

**Implementation approach.**
In `src/governance-verifier.ts`, extend the `verifyFlow` method (around line 734) with cross-classification checks using the existing `extractValueClassification` and `extractSafetyRequirements` helpers:
1. If `classification === "medical"` and no `contract.privacy` block exists, emit `SPORE-VAL-004 MedicalClassificationMissingPrivacy` (error).
2. If `classification === "national_security"` and no `contract.authority` block exists, emit `SPORE-VAL-005 NationalSecurityMissingAuthority` (error).
3. If safety requirements include `bounded_runtime` but `extractArenaLimitMB` returns undefined and no `contract.limits { request_time }` is found, emit `SPORE-VAL-006 BoundedRuntimeRequirementNotEnforced` (warning).
4. Add `SPORE-VAL-007 FinancialClassificationUnboundedCost` (warning) if `classification === "financial"` and no `contract.economics` block is present.

**Phase:** 34.

---

## 2. Speed

### 2.1 NaN Boxing / Tagged Integer Representation

**What is missing.**
`GalerinaValue` is a tagged-union object: `{ __tag: "int", value: number }`. Every integer arithmetic operation in the tree-walker path allocates a new JS object on the heap. The INT_POOL in `src/interpreter.ts` covers [0, 255] (256 pre-allocated values). Operations producing integers outside this range — which is every loop counter above 255, every computed offset, every financial calculation — allocate. The bytecode VM (`src/bytecode-vm.ts`) avoids this for pure integer flows. The tree-walker and execution graph still pay allocation cost for any non-pure flow that touches integers.

**Why it matters.**
Object allocation is the main GC pressure source in the interpreter. V8's minor GC triggers when the young generation fills. For a governed flow processing a batch of 1,000 records (each with integer fields), this is ~3,000 avoidable allocations per call. Phase 34 (first HTTP endpoint) and Phase 36 (self-hosting at 25%) amplify this.

**Implementation approach.**
Use NaN-boxing: represent `GalerinaValue` as a 64-bit float where integer values are stored in the payload bits of a NaN, and non-integer values are heap pointers encoded as NaN payloads. This is the V8/SpiderMonkey technique. For Galerina's TypeScript interpreter, a lighter approach works:

1. Add a fast-path branch in `executeNode` (the main dispatch function in `src/interpreter.ts`) for integer operands: before creating a `GalerinaValue` object, check if both operands are plain JS numbers stored in an `int` tag and directly compute the result as a number, then call `intVal()` which already pools [0,255].
2. Extend the INT_POOL from 256 to 65,536 entries (covering the full uint16 range). Memory cost: ~524 KB (8 bytes per JS object × 65,536). This eliminates allocation for loop indices, array indices, and most counter patterns.
3. For the execution graph path (`src/execution-graph.ts`), the `slots` array already uses `GalerinaValue`. Replace it with a parallel `intSlots: Float64Array` where slot type is known to be integer (statically inferred from the flow's type annotation). Integer-typed slots never touch the GC heap.

**Phase:** 33 (pool extension), 35 (intSlots fast path).

---

### 2.2 Flow Compilation Caching: Disk-Persisted ExecutionGraph Is Not Invalidated on Policy Change

**What is missing.**
`src/execution-graph.ts` persists compiled ExecutionGraphs to `build/.spore-cache/<hash>.egraph.json`. The cache key is `flowName + ":" + sourceHash`. This invalidates correctly when source changes. It does not invalidate when:
- The runtime policy configuration changes (a flow compiled under `profile: dev` may be served from cache in `profile: production`)
- The governance verifier produces different ProofGraph output for the same source (different deployment context)
- A capability is revoked at the runtime policy level — the cached graph still contains the pre-revocation dispatch plan

**Why it matters.**
A cached ExecutionGraph for a flow compiled in `dev` profile (where `SPORE-GOV-002` is `info` severity rather than `warning`) could be loaded in a production server. Governance decisions that differ by profile would be silently skipped. This is the kind of bug that only appears in production.

**Implementation approach.**
1. Change the disk cache key from `flowName:sourceHash` to `flowName:sourceHash:profileHash` where `profileHash = canonicalHash({ profile, runtimePolicyDigest })`.
2. Add `profileHash` to the `ExecutionGraph` interface as a `readonly profileHash: string` field.
3. In `getOrLoadGraph` (`src/execution-graph.ts`), after deserialising a cached graph, verify `cached.profileHash === currentProfileHash`. If they differ, treat as cache miss and recompile.
4. Expose `runtimePolicyDigest()` from `src/security-policy.ts` as a stable hash of the active policy constants (capability gates, denied targets, effect flags).

**Phase:** 33.

---

### 2.3 Specialised Dispatch for Record Field Access

**What is missing.**
Record field access (`record.fields.get(key)`) in the interpreter dispatches through the general `executeNode` path. The `record` `GalerinaValue` uses a `ReadonlyMap<string, GalerinaValue>`. Map lookup for string keys in V8 involves a hash computation and bucket traversal. For small records (2-8 fields), which is the typical governance-annotated record, a flat linear scan over a `readonly [string, GalerinaValue][]` array would be faster because it avoids the hash overhead and has better cache locality.

Additionally, the execution graph's `CALL` opcode dispatches via `callName: string` which is looked up by a string match in the interpreter's `callStdlib` path every execution. There is no specialised fast path for the 10 most common stdlib calls (e.g. `AuditLog.write`, `validate`, `redact`, `Url.parseAndAllowlist`).

**Why it matters.**
Record access is the dominant operation in governance-annotated flows — every capability check, every PII field check, every response construction accesses record fields. The stdlib dispatch overhead appears on every governed execution.

**Implementation approach.**
1. For records with 8 or fewer fields (the common case), store fields as a plain `readonly (readonly [string, GalerinaValue])[]` array instead of a `ReadonlyMap`. Add a threshold: if `fields.size <= 8`, use array storage. Access becomes a `for` loop scan, which is faster for small N in V8.
2. In `src/stdlib.ts`, create a `STDLIB_FAST_DISPATCH: Map<string, (args: GalerinaValue[]) => GalerinaValue>` pre-built map for the 20 most-called stdlib functions. In `callStdlib`, check this map first before the general dispatch chain.
3. In the execution graph compiler (`src/execution-graph.ts`), add a dedicated `RECORD_GET` opcode (ExecOp 13) that takes a slot and a constant string key and performs direct field access, bypassing the general CALL path.

**Phase:** 34.

---

## 3. AI Understanding

### 3.1 No Machine-Readable Governance Summary Format

**What is missing.**
When an AI tool (GitHub Copilot, Claude, a code review agent) reads a Galerina source file, it sees the contract syntax but has no structured way to understand what the contract *means* from a governance perspective. The `GovernanceVerifyResult` and `ProofGraph` types in `src/proof-graph.ts` contain rich governance metadata, but they are only produced at compile time and only output as TypeScript objects — not as a stable, AI-readable JSON schema.

**Why it matters.**
Phase 34+ involves the runtime being partially written in Galerina. AI-assisted development of Galerina-in-Galerina code requires the AI to understand what contracts are valid, what effects are legal, and what capabilities are held. Without a structured output, AI tools hallucinate valid-looking contracts that fail compilation. The compliance document (`galerina-compliance.md`) shows the audit JSON format for runtime records, but there is no equivalent for pre-execution governance summaries.

**Implementation approach.**
1. Define a `GovernanceSummary` JSON schema at `docs/schemas/spore-governance-summary.v1.json`. Fields: `flowName`, `qualifier`, `effects`, `capabilities`, `privacyClasses`, `valueClassification`, `safetyRequirements`, `proofObligations`, `verified`, `proofLevel`, `hardwareTargets`, `auditRequired`. This is derivable directly from the existing `GovernanceVerifyResult` and `ProofGraph` structs.
2. Add a `galerina governance-summary --json <file>` CLI command in `src/cli.ts` that compiles a file, runs the governance verifier, and outputs one `GovernanceSummary` object per flow as a JSON array.
3. Add `galerina ast-export --json <file>` that outputs the AST as a JSON tree with node kinds, values, and source locations. This is the primary input an AI needs to reason about code structure.
4. Add an `intent` field to the `GovernanceSummary` schema: the free-text intent string from the `intent { "..." }` declaration. This is the single most useful signal for an AI to understand *purpose*. It is already parsed and stored in `GovernanceVerifyResult.intentStatus` but not exported.

**Phase:** 34.

---

### 3.2 ProofGraph Is Not Human-Attestable Without Compiler Context

**What is missing.**
The `ProofGraph` interface (`src/proof-graph.ts`) stores `ProofEvidence` entries with `sourceHash`, `girHash`, and `checkerPassed: boolean`. The human- and AI-readable story of *why* a proof obligation was satisfied is a boolean (`checkerPassed`) — it does not include the checker name, the specific contract clause that satisfied it, or the diagnostic codes that were checked and passed. An AI reading a proof file cannot determine *which* contract clause satisfied the `capability` obligation without re-running the compiler.

**Why it matters.**
Phase 39 plans `galerina-verify proof.json --key spore-gov-2026-01` as a self-contained proof verifier. For this to be independently verifiable by AI tools and external auditors, the proof must be self-describing. A proof that says "checkerPassed: true" without naming the checker is a compliance gap: it satisfies the structure of a proof without containing the substance.

**Implementation approach.**
1. Extend `ProofEvidence` in `src/proof-graph.ts` with:
   - `checkerName: string` — e.g. `"EffectChecker"`, `"TaintChecker"`, `"ValueStateChecker"`
   - `contractClause: string` — the specific contract syntax that satisfied this obligation, e.g. `"contract.effects { audit.write }"`
   - `satisfiedByDiagnosticCodes: readonly string[]` — the diagnostic codes that were verified as not-fired (e.g. `["SPORE-EFFECT-001", "SPORE-GOV-002"]`)
2. Populate these fields in `buildProofGraph` and `buildProofGraphCached` in `src/proof-graph.ts`. The information is available from the `obligations` array (`satisfiedBy` field) and from the effect checker result.
3. Add a `narrative: string` field to `ProofObligation` — a one-sentence plain-English statement of what was proven (e.g. `"database.write is declared in effects and is permitted by runtime policy"`). This is the primary AI comprehension aid.

**Phase:** 34.

---

### 3.3 Intent System Is Not Linked to Effect Declarations

**What is missing.**
The `intent` declaration is parsed and stored. `SPORE-GOV-010` fires if a secure flow has no intent. But intent content is not currently checked against declared effects. A flow can declare `intent { "Read-only customer lookup" }` while also declaring `database.write` — this is a contradiction that no diagnostic catches. More importantly for AI understanding, the intent string is not used to generate suggested contract completions or to validate that the contract reflects the intent.

**Why it matters.**
The intent system's value proposition is that it makes Galerina codebases self-documenting for humans and AI alike. If intent and effects are not linked, the intent becomes a comment — not a governance artefact. For AI tools, a linked intent-effect model enables checking "does this intent imply capabilities the contract hasn't declared?" — a powerful AI-assisted review.

**Implementation approach.**
1. Define an intent vocabulary mapping in `src/governance-verifier.ts`: a map from intent keywords (e.g. `"read"`, `"lookup"`, `"fetch"`, `"query"`) to implied-read-only effects, and from keywords (e.g. `"create"`, `"write"`, `"update"`, `"delete"`, `"send"`) to implied-write effects. This is a simple `Map<string, EffectCategory>`.
2. In `verifyFlow`, extract the intent string and tokenise it. If intent keywords imply read-only but `database.write` is declared, emit `SPORE-GOV-001 IntentBehaviourMismatch` — this diagnostic is currently deferred (listed as "deferred" in the governance-verifier header comment). This is the implementation.
3. Export the intent vocabulary map as part of the `GovernanceSummary` JSON schema so AI tools can use it for contract completion suggestions.

**Phase:** 35.

---

## 4. Passive Hardware Compatibility

### 4.1 ARM SVE2 — No Minimum Host-Import Interface Defined

**What is missing.**
The hardware catalogue (`galerina-hardware-compute-fabric.md`) classifies ARM SVE2 and SME2 as `ExecutionPlane` targets with `determinism: full` and `observability: full`. The architecture document (`galerina-master-architecture.md`) lists ARM SVE2 as a named hardware target. However, there is no defined `HostImport` interface shape that a WASM module running in a Wasmtime/WasmEdge host with ARM SVE2 would call to request vectorised execution.

The two-tier design (WASM governs, native accelerates) requires the WASM module to declare what native capabilities it wants to use, and the host to provide them. Without a concrete import interface, SVE2 acceleration is nominal — it exists in the classification but cannot be wired up.

**Why it matters.**
Phase 33-34 targets Node.js (Wasmtime behind the scenes for WASM execution). ARM SVE2 is the dominant high-performance instruction set on AWS Graviton3, Apple M-series, and Ampere Altra. Without a host-import interface, all WASM execution on these machines runs as scalar WASM, leaving the most commonly deployed accelerator unused.

**Implementation approach.**
Define the minimum host-import interface in a new file `src/host-imports.ts`:
```typescript
export interface VectorHostImport {
  // Request batch integer arithmetic on a 256-element chunk
  // Host maps to SVE2 SADDV / SMULLB etc. on ARM, or AVX-512 on x86
  vecIntAddI32(aPtr: number, bPtr: number, outPtr: number, len: number): void;
  vecIntMulI32(aPtr: number, bPtr: number, outPtr: number, len: number): void;
  // Hash batch: SHA-256 of n contiguous 64-byte blocks (for InputSeal pipeline)
  hashBatchSha256(dataPtr: number, blockCount: number, outPtr: number): void;
}
```
The WASM module calls these imports only for `TensorCandidate`-flagged flow nodes (the `NodeFlags.TensorCandidate` flag already exists in `src/parser.ts`). The governance rule: the WASM module calls the import with *pre-sealed* input buffers only; the host may not observe the governance structures in WASM linear memory.

This satisfies the Accelerator Sovereignty Rule: the SVE2 host import calculates, it does not govern.

**Phase:** 35.

---

### 4.2 Apple Neural Engine — Input/Output Seal Pipeline Is Not Defined for On-Device Inference

**What is missing.**
The `ImmutableInputSeal` interface in `src/proof-graph.ts` correctly defines `targetId: string`, `inputSeal: string (sha256)`, and `outputSeal: string`. The architecture requires these seals to be applied by the CPU (GovernancePlane) before dispatch to any AcceleratorPlane target. The Apple Neural Engine (ANE) is classified as `ExecutionPlane` with `observability: partial`.

The gap: there is no defined protocol for how the WASM-based GovernancePlane computes the `inputSeal` *before* the ANE receives the tensor buffer in Apple's Core ML / ANE framework. On Apple Silicon, Core ML dispatches to the ANE through the OS, bypassing the application. The GovernancePlane cannot instrument the ANE call without either using Core ML's prediction log API or implementing a host shim.

**Why it matters.**
For a medical or aerospace deployment using an Apple M-series device for on-device AI inference (e.g. medical image classification), the `ImmutableInputSeal` is the only proof that what entered the model was what governance approved. Without a concrete seal protocol, the governance guarantee for ANE is architectural aspiration rather than implementation.

**Implementation approach.**
1. Define an `AneHostImport` interface in `src/host-imports.ts`:
```typescript
export interface AneHostImport {
  // Called by WASM governance plane BEFORE dispatching to Core ML
  // Returns the SHA-256 hex of the serialised input tensor buffer
  sealInputTensor(modelId: string, inputPtr: number, inputLen: number): string;
  // Called AFTER Core ML returns. Returns SHA-256 of output tensor.
  sealOutputTensor(modelId: string, outputPtr: number, outputLen: number): string;
}
```
2. The WASM governance plane calls `sealInputTensor`, stores the result as `ImmutableInputSeal.inputSeal` in the ProofGraph, dispatches to ANE via host import, then calls `sealOutputTensor` and stores as `ImmutableInputSeal.outputSeal`.
3. The host-side implementation of `sealInputTensor` / `sealOutputTensor` hashes the buffer using `CryptoKit.SHA256` (available on all Apple platforms) before and after Core ML dispatch. This is a thin shim — the governance logic remains in WASM.
4. Add `"ane"` as a named target in `HARDWARE_TRUST_PROFILES` in `src/type-registry.ts` with `proofLevel: ProofLevel.Sealed` and `requiresInputSeal: true`.

**Phase:** 38 (Apple Silicon target), but the interface shape should be locked in Phase 35 to avoid breaking WASM isolation.

---

### 4.3 Nvidia Blackwell — No Governance Plane Separation for Multi-Tenant GPU

**What is missing.**
The hardware catalogue classifies GPU as `ExecutionPlane` with `determinism: full` and `observability: full`. Nvidia Blackwell (GB200 NVL72) introduces NVLink Switch fabric and confidential computing (NVIDIA H100/H200 already have Hopper Confidential Compute; Blackwell extends this). The governance concern is new: Blackwell's NVLink Switch allows direct GPU-to-GPU communication that bypasses the CPU. In a multi-tenant cluster, GPU A can DMA-transfer to GPU B without the CPU GovernancePlane seeing the data.

The `INVARIANT: GovernancePlane is always CPU or WASM` in `galerina-hardware-compute-fabric.md` assumes that GPU-to-CPU is the only path data takes. Blackwell's inter-GPU DMA breaks this assumption.

**Why it matters.**
For aerospace or financial deployments running Galerina on Blackwell clusters, inter-GPU DMA creates a data path that is invisible to the GovernancePlane. Lineage tracking breaks: the `LineageGraph` records what the CPU approves, but the actual data movement may never pass through the CPU.

**Implementation approach.**
1. Add a `multiTenantGpuDmaBreach` property to the `HardwareSealedDispatch` interface in `src/proof-graph.ts`: `readonly gpuDirectEnabled: boolean`. This is set by the host runtime when Blackwell NVLink Direct is in use.
2. Add `SPORE-HW-004 GpuDirectRequiresEscalatedProof` diagnostic: if `contract.hardware { target gpu }` is declared and `gpuDirectEnabled: true` is signalled by the host runtime, escalate from `ProofLevel.Sealed` to `ProofLevel.Escalated` (equivalent to AcceleratorPlane requirements). Emit this as a warning so operators are aware the governance plane cannot observe inter-GPU DMA.
3. Document that Galerina's invariant holds *for the workloads dispatched from the GovernancePlane* — inter-GPU DMA between pre-approved sealed buffers is still governed (the seals are applied before dispatch). The gap is only for *unsanctioned* DMA that a compromised GPU kernel could initiate.

**Phase:** 40 (Blackwell support), but the diagnostic hook should be added in Phase 35 so it exists when Blackwell deployments appear.

---

### 4.4 Google TPU — The `ComputeSeal` Protocol for TPU Pod Topology Is Undefined

**What is missing.**
The hardware catalogue lists Google TPU as `ExecutionPlane` with `observability: partial`. The `ImmutableInputSeal` protocol applies. However, Google TPU v4/v5 pods operate as a distributed mesh of 4,096 TPU chips connected by ICI (Inter-Chip Interconnect). When a Galerina flow dispatches to a TPU pod, the `inputSeal` is computed over the *host-side tensor representation* before the tensor is sharded across chips. The actual computation happens on shards; the output is reassembled on the host. The `outputSeal` in the current design covers the reassembled output — it does not cover whether the sharding/reassembly was faithful to the input seal.

**Why it matters.**
If the TPU driver or host software corrupts a shard boundary during scatter-gather, the `outputSeal` will differ from what you would get if the same computation ran on a single chip. This is a correctness gap, not a security gap per se, but for safety-critical classification (`classification: safety_critical`) the reproducibility requirement means you need shard-boundary integrity, not just end-to-end hash equality.

**Implementation approach.**
1. Add `shardCount: number` and `shardSeals: readonly string[]` to the `ImmutableInputSeal` interface as optional fields. When `shardCount > 1`, the GovernancePlane computes a seal over each input shard before dispatch.
2. In `buildProofGraph`, when a TPU target with `shardCount > 1` is declared, add a `ProofObligation` of kind `"target"` with claim `"TPU shard integrity verified"`.
3. At runtime (host side), compute per-shard input hashes using the same `sha256` algorithm before scatter. Record in `ImmutableInputSeal.shardSeals`. On reassembly, verify output shard hashes match. This is the host's responsibility — the WASM governance plane initiates and records, the host implements.

**Phase:** 40 (Google TPU support), interface design should be included in Phase 35 host-import specification.

---

## 5. Governance Completeness

### 5.1 ProofGraph Hashes Are Placeholder Values — No Cryptographic Chain Exists Yet

**What is missing.**
`ProofEvidence` stores `sourceHash` and `girHash` as `string` fields (type: `string`, not `CryptographicHash`). In `buildProofGraph` and `buildProofGraphCached` (`src/proof-graph.ts`), these fields are populated by callers — but the actual values passed in from the governance verifier (`src/governance-verifier.ts`) are derived from `canonicalHash()` in `src/runtime/canonicalHash.ts`, which is a deterministic but non-cryptographic hash (it uses `JSON.stringify` + a simple hash function, not SHA-256).

The `GovernanceSignature` field on `ProofGraph` is typed and structured but is never populated — `buildProofGraph` does not produce a signature, and there is no signing infrastructure. The `GovernanceSignature` is marked as Phase 39.

**Why it matters.**
The compliance document promises: "Here is the cryptographic proof." If `canonicalHash` is not SHA-256 or BLAKE3, the proof is not cryptographic — it is a fingerprint. For DO-178C (aerospace, DAL A) or IEC 62304 (medical, Class C), "cryptographic proof" has a specific meaning: a hash algorithm with collision resistance of at least 2^128. A fingerprint-collision attack against `canonicalHash` could produce a fraudulent ProofGraph that verifies as identical to a legitimate one.

**Implementation approach.**
1. In `src/runtime/canonicalHash.ts`, replace the existing implementation with a call to Node.js `crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex')`. For WASM execution (no Node.js), add a `sha256` import from the host (`hashSha256(dataPtr, len): string` in `VectorHostImport`).
2. Add a type alias `type CryptoHash = string & { readonly __cryptoHash: true }` and annotate `ProofEvidence.sourceHash` and `ProofEvidence.girHash` with this type to make it clear these are cryptographic hashes not arbitrary strings.
3. For Phase 35 (pre-Phase 39), add a `GovernanceCertificate` struct (not a full ML-DSA signature yet) that includes `compilerId: string`, `compilerVersion: string`, and `certificateHash: CryptoHash` = SHA-256 of the full ProofGraph JSON. This provides integrity without requiring key infrastructure.
4. Phase 39: replace `GovernanceCertificate` with full ML-DSA-44 (CRYSTALS-Dilithium) signature using the `spore-gov-sig.v1` algorithm already defined in the `governanceSignature` interface.

**Phase:** 33 (SHA-256 for `canonicalHash`), 35 (`GovernanceCertificate`), 39 (ML-DSA signing).

---

### 5.2 `contract.safety` Requirements Are Parsed but Not Enforced Beyond Two Checks

**What is missing.**
`extractSafetyRequirements()` in `src/governance-verifier.ts` (around line 532) parses the `contract.safety` block and returns a `Set<string>`. Only two requirements have enforcement:
- `deterministic_execution` — checked by `SPORE-VAL-002`
- (none others)

The following requirements can be declared in a contract and are silently accepted without any verification:
- `bounded_runtime` — parsed, not cross-checked against `contract.limits`
- `fault_tolerant` — parsed, no verification
- `redundant_execution` — parsed, no verification  
- `verified_arithmetic` — parsed, no verification (would require checking that no floating-point operations are used in safety_critical flows)
- `no_dynamic_allocation` — parsed, no verification (would require checking against the memory arena constraint)

**Why it matters.**
For aerospace (DO-178C DAL A) and medical (IEC 62304 Class C), each safety requirement must have a corresponding mechanically verified property. If `bounded_runtime` can be declared without a corresponding `contract.limits { request_time }`, the governance certificate is incomplete. An auditor checking the ProofGraph would see `safetyRequirements: ["bounded_runtime"]` and assume it has been verified — it has not.

**Implementation approach.**
In `src/governance-verifier.ts`, after extracting safety requirements in `verifyFlow`, add enforcement for each named requirement:

1. `bounded_runtime`: verify that `contract.limits { request_time }` is present (call `parseTimeoutConfig` from `src/runtime/timeoutPolicy.ts` on the contract node and check `deadlineMs !== undefined`). If missing, emit `SPORE-VAL-006` (error in production profile, warning in dev).

2. `verified_arithmetic`: for `safety_critical` flows that declare this requirement, scan the flow body for any `float` literals or `Float.` stdlib calls. If found, emit `SPORE-VAL-008 VerifiedArithmeticViolation` (error) — safety-critical arithmetic must use the `decimal` type, not IEEE 754 float.

3. `no_dynamic_allocation`: verify that `contract.memory { arena }` is declared (call `extractArenaLimitMB`). If missing, emit `SPORE-VAL-009 NoDynamicAllocationRequiresArena` (error).

4. `fault_tolerant` and `redundant_execution`: these require runtime infrastructure that does not yet exist. Emit `SPORE-VAL-010 SafetyRequirementNotYetEnforceable` (info) to document that the requirement was declared but enforcement is pending.

**Phase:** 34.

---

### 5.3 GovernanceSignature Is Not Implemented — Phase 39 Is Too Late for Phase 34 HTTP Endpoint

**What is missing.**
`GovernanceSignature` is typed in `ProofGraph` as an optional field and planned for Phase 39. Phase 34 introduces the first live HTTP endpoint. If an external system calls that endpoint and receives a governance proof in the response (or if the proof is recorded in the AuditGraph for a regulated deployment), the proof has no cryptographic integrity guarantee until Phase 39. A motivated attacker who can write to the AuditGraph store between Phase 34 and Phase 39 can forge ProofGraph records.

**Why it matters.**
Phase 34 is the first point where Galerina executes in a potentially adversarial environment (public HTTP). Phase 39 is when the proof becomes cryptographically signed. This creates a window of ~5 phases where the governance proof is integrity-protected only by the correctness of the runtime, not by cryptography. For a governance-first platform, this is the most critical timeline gap.

**Implementation approach.**
Implement a Phase 35 intermediate: `GovernanceCertificate` (distinct from the full Phase 39 ML-DSA `GovernanceSignature`):

1. In `src/proof-graph.ts`, add `governanceCertificate?: GovernanceCertificate` to `ProofGraph`:
```typescript
export interface GovernanceCertificate {
  readonly algorithm: "sha256-hmac-v1";  // symmetric, not asymmetric — adequate for Phase 35
  readonly compilerId: string;           // e.g. "spore-compiler-0.32.0"
  readonly certificateHash: string;      // SHA-256 of canonical ProofGraph JSON (excluding this field)
  readonly issuedAt: string;             // ISO timestamp
}
```
2. In `buildProofGraph` and `buildProofGraphCached`, compute `certificateHash` as `sha256(JSON.stringify({ schemaVersion, flowName, obligations, evidence, verified, signatureHash }))`.
3. This is not a signature (no private key), but it is an integrity check: anyone who modifies the ProofGraph record will produce a different `certificateHash`, detectable by running `galerina-verify`.
4. Phase 39 upgrades `GovernanceCertificate` to `GovernanceSignature` with ML-DSA-44, replacing the HMAC with an asymmetric signature.

**Phase:** 35.

---

### 5.4 `contract.value` Classification Does Not Drive Capability Requirements

**What is missing.**
The `contract.value { classification safety_critical }` block is checked for the presence of `audit.write` (SPORE-VAL-001) and `deterministic_execution` (SPORE-VAL-002). The `classification` field is validated against the `RECOGNISED_VALUE_CLASSIFICATIONS` set (SPORE-VAL-003). But classification does not currently drive *capability* requirements.

A flow can declare `classification: aerospace` (wait — `aerospace` is not even in `RECOGNISED_VALUE_CLASSIFICATIONS`, which is a separate gap) or `classification: safety_critical` and never declare a capability like `safety.write` or `flight_control.command`. The governance model allows `safety_critical` work to proceed with zero capability declarations.

Additionally, `contract.value` exposes a `safety` block in the architecture documents but it is not parsed or enforced anywhere — `extractSafetyRequirements` reads from `contract.safety`, not `contract.value.safety`.

**Why it matters.**
For a real aerospace deployment under DO-178C, every safety-critical function must have explicit authority: the concept of Design Assurance Level (DAL) maps directly to which capabilities must be declared before a function may execute. Without capability requirements driven by classification, a junior developer can write `classification: safety_critical` on an untested utility function and it will satisfy the classification checks without any of the governance substance required at DAL A.

**Implementation approach.**
1. In `src/governance-verifier.ts`, add a `CLASSIFICATION_REQUIRED_CAPABILITIES` map:
```typescript
const CLASSIFICATION_REQUIRED_CAPABILITIES: ReadonlyMap<string, readonly string[]> = new Map([
  ["safety_critical",    ["safety.write", "audit.write"]],
  ["mission_critical",   ["audit.write"]],
  ["medical",            ["medical.read", "audit.write"]],
  ["financial",          ["financial.read"]],
  ["national_security",  ["authority.elevated"]],
]);
```
2. In `verifyFlow`, after extracting the classification, check that each required capability appears in the flow's declared capabilities (from `CapabilityGraph` / effect declarations). Emit `SPORE-VAL-011 ClassificationRequiresCapability` (error in production, warning in dev) for each missing required capability.
3. Add `"aerospace"` and `"defence"` to `RECOGNISED_VALUE_CLASSIFICATIONS` in `src/governance-verifier.ts` — these are obvious omissions given the master architecture document's target domains.

**Phase:** 34.

---

### 5.5 AuditGraph Is Append-Only by Convention, Not by Architecture

**What is missing.**
The compliance document (`galerina-compliance.md`) states: "`AuditGraph` is append-only and immutable — cannot be altered post-execution." The current implementation in `src/audit-writer.ts` writes audit records to a log. However, nothing in the type system or runtime prevents a flow from declaring `audit.write` and then writing *incorrect* audit records — for example, a flow could call `AuditLog.write({ event: "read_only_access" })` while actually performing a `database.write`. The audit trail would be present but misleading.

Additionally, the audit writer does not cryptographically chain records (each record's hash includes the previous record's hash, making tampering detectable). Without a hash chain, individual records can be deleted or reordered.

**Why it matters.**
For SEC Rule 17a-4 (financial records authenticity) and EU AI Act Article 12 (untampered event logging), the append-only and unalterable requirements are hard legal requirements. "Append-only by convention" does not satisfy them. A hash chain (each record includes `hash(previous_record_hash || current_record_content)`) makes tamper detection automatic.

**Implementation approach.**
1. In `src/audit-writer.ts`, add a `chainHash` field to the audit record structure: `chainHash = sha256(previousChainHash || JSON.stringify(currentRecord))`. The first record uses a well-known genesis hash (all-zeros SHA-256).
2. Add an `AuditChainVerifier` function that reads the audit log and verifies the chain in O(n). Expose as `galerina audit verify <logfile>` in `src/cli.ts`.
3. For the compile-time side: add `SPORE-GOV-015 AuditEventMismatchesEffect` diagnostic. In `verifyFlow`, check that the `event` field of `AuditLog.write(...)` call arguments matches the declared effects. If a flow declares `database.write` but the audit event string does not contain any of `["write", "create", "update", "delete", "insert"]`, emit a warning. This prevents misleading audit trails.
4. The value-state checker should also prevent `secure` values from appearing in audit event descriptions — `SPORE-SECRET-001` covers `AuditLog.write` for protected values, but should be extended to cover `audit.write` effect declarations that use `SecureString` as the event payload.

**Phase:** 35.

---

## Summary: Phase Allocation

| # | Suggestion | Phase |
|---|---|---|
| 1.1 | HTTP header injection sink in taint catalogue | 33 |
| 1.2 | SSRF allowlist enforcement (compile-time + runtime) | 33 |
| 1.3 | Timing-safe comparison path for SecureString | 33 |
| 1.4 | Route dispatcher taint surface + header limits | 33 |
| 1.5 | Cross-check contract.value vs contract.safety | 34 |
| 2.1 | INT_POOL expansion + intSlots fast path | 33 / 35 |
| 2.2 | Execution graph cache invalidation on profile change | 33 |
| 2.3 | Record field access optimisation + stdlib fast dispatch | 34 |
| 3.1 | GovernanceSummary JSON schema + CLI export | 34 |
| 3.2 | ProofEvidence checkerName + contractClause + narrative | 34 |
| 3.3 | Intent-to-effect linkage (SPORE-GOV-001 implementation) | 35 |
| 4.1 | ARM SVE2 minimum host-import interface | 35 |
| 4.2 | Apple Neural Engine ImmutableInputSeal protocol | 35 / 38 |
| 4.3 | Nvidia Blackwell GPU-Direct governance diagnostic | 35 / 40 |
| 4.4 | Google TPU shard-boundary seal protocol | 35 / 40 |
| 5.1 | SHA-256 for canonicalHash + GovernanceCertificate | 33 / 35 / 39 |
| 5.2 | contract.safety requirement enforcement (beyond 2 checks) | 34 |
| 5.3 | GovernanceCertificate intermediate (before Phase 39 ML-DSA) | 35 |
| 5.4 | Classification-driven capability requirements | 34 |
| 5.5 | AuditGraph hash chain + AuditEventMismatch diagnostic | 35 |

**Phase 33 critical path (pre-HTTP endpoint):** 1.1, 1.2, 1.3, 1.4, 2.1 (pool), 2.2, 5.1 (SHA-256).

These seven items close the attack surface that opens when Phase 34 introduces the first live HTTP endpoint. Everything else is important but not blocking for Phase 34 launch.

---

## See Also

- `galerina-master-architecture.md` — The four-way separation (governance, proof, economics, hardware)
- `galerina-governance-hierarchy.md` — The inviolable stack
- `galerina-hardware-compute-fabric.md` — ComputeFabricGraph and governance classes
- `galerina-taint-catalogue.md` — OWASP-aligned taint system
- `galerina-compliance.md` — Regulatory compliance mapping
- `src/proof-graph.ts` — ProofGraph, ExecutionSignature, ImmutableInputSeal
- `src/governance-verifier.ts` — Governance verification implementation
- `src/taint-checker.ts` — Taint analysis implementation
- `src/route-dispatcher.ts` — HTTP endpoint (Phase 34 target)
