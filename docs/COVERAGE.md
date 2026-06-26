# Galerina Documentation Coverage

This document tracks what has been documented, what needs more depth, and what
is still missing across the three primary areas of the language specification,
plus the package documentation status.

```text
✅ Covered — dedicated KB file exists with full specification
⚠️  Partial — touched in a KB file but needs its own dedicated document
❌ Missing — not yet documented, work still required
```

---

## 1. Syntax

Core language constructs, keywords, type system, declaration blocks.

### Keywords and Control Flow

| Topic | Status | KB File |
| --- | --- | --- |
| Core keyword set (flow, fn, let, if, else, match, uses, each, attempt, none, release) | ✅ | `core-syntax-keywords.md` |
| Excluded keywords (switch, case, elseif, for, try/catch, null, async, await) | ✅ | `core-syntax-keywords.md`, `excluded-features.md` |
| flow vs fn distinction | ✅ | `flow-vs-fn-security-model.md` |
| Flat flow style (max depth 2, guard clauses) | ✅ | `flat-flow-style.md` |
| if/match/Optional syntax rules | ✅ | `galerina-syntax-if-match-optional.md` |
| Loop and iteration model | ✅ | `galerina-syntax-loops-iteration.md` |
| Branching model (if/else, match) | ✅ | `branching-model.md` |
| Pattern matching (full) | ✅ | `pattern-matching.md` |
| match catch-all (_ => arm) | ✅ | `match-catch-all-branch.md` |
| task / wait (governed async) | ✅ | `async-task-model.md` |
| release keyword | ✅ | `release-keyword.md` |
| run worker syntax | ✅ | `governed-worker-pools.md`, `core-syntax-keywords.md` |
| each (iteration) | ✅ | `core-syntax-keywords.md` |
| attempt ... else error | ✅ | `core-syntax-keywords.md`, `no-exceptions-result-model.md` |

### Types

| Topic | Status | KB File |
| --- | --- | --- |
| Primitive types (String, Int, Decimal, Float, Bool, None) | ✅ | `core-syntax-keywords.md` |
| Auto — compile-time type inference keyword | ✅ | `auto-type-inference.md` |
| safe / unsafe type qualifiers | ✅ | `safe-unsafe-trust-model.md` |
| Context-specific safe types (safe Email, safe Url, etc.) | ✅ | `safe-unsafe-trust-model.md` |
| Array<T> and string operations | ✅ | `arrays-and-string-operations.md` |
| Standard types: String, Char, Byte, Bytes, SecureString | ✅ | `galerina-core-standard-types-string-char-byte.md` — Unicode boundaries, encoding safety, `SPORE-STRING-001–004`, `SPORE-CHAR-001–004`, `SPORE-BYTE-001–005`; `charLiteral` and `byteLiteral` added to `AstNodeKind` in `galerina-core/src/index.ts` (2026-05-26) |
| Binding keywords: let / mut / readonly; rejection of var / const; method-chain pipelines | ✅ | `galerina-core-syntax-bindings-pipeline.md` — `BindingKind`, `BindingDeclaration`, `MethodChainExpression`/`Call` in `@galerina/core`; `SPORE-SYNTAX-001..002`, `SPORE-BINDING-001..004`, `SPORE-PIPELINE-001..005` constants; `var`/`const` detection live in `validateCoreSyntaxSafety()`; `checkBindingReassignment()`, `checkReadonlyMutation()`, `checkMethodChain()` stubs; `readonlyDecl`, `methodChainExpr` added to `AstNodeKind`; `boot.spore` `const` → `readonly` fixed; 12/12 tests passing (2026-05-26) |
| Typed content blocks: html / dom / script / css heredoc syntax | ✅ | `galerina-core-syntax-typed-content-blocks.md` — `ContentBlockType`, `TypedContentBlockExpression` in `@galerina/core`; `SPORE-BLOCK-001..004` constants, `SPORE_BLOCK_DIAGNOSTICS`; content block state tracking (brace depth suspended inside blocks), `SPORE-BLOCK-001` unknown type, `SPORE-BLOCK-002` unclosed block detection live in `validateCoreSyntaxSafety()`; `validateTypedContentBlock()` stub; `typedContentBlockExpr` added to `AstNodeKind`; 17/17 tests passing (2026-05-26) |
| List<T> operations | ✅ | `list-operations.md` |
| Query type (sql, graphql, mongo, search blocks) | ✅ | `query-type-and-database-access.md` |
| Result<T, E> and typed errors | ✅ | `typed-error-model.md`, `no-exceptions-result-model.md` |
| Tri / Decision / Bool logic types | ✅ | `mathematics-and-tri-logic.md` |
| Formal proof types (axiom, theorem, lemma, proof, assume, given, invariant) | ✅ | `formal-proof-system.md` |
| Type definitions (type Foo { field: Type }) | ✅ | `type-and-enum-declarations.md` |
| Enum syntax (enum Status { Paid, Failed }) | ✅ | `type-and-enum-declarations.md` |
| Generic types (Option<T>, Result<T,E>, Array<T>, Map<K,V>) | ✅ | `generic-types.md` |
| Branded/opaque types (Brand<T,"Name">) | ✅ | `type-and-enum-declarations.md`, `generic-types.md` |
| Primitive obsession design principle | ✅ | `galerina-design-primitive-obsession.md` |
| Postfix type state syntax (String unsafe, Email safe validated) | ✅ | `postfix-type-state-syntax.md` |
| Type manifest (app.type-manifest.json) | ✅ | `type-manifest.md` |
| Money<Currency> and Decimal precision | ✅ | `numeric-and-compute-types.md` |
| Matrix<R,C,T>, Vector<N,T>, Tensor<Shape,T> | ✅ | `numeric-and-compute-types.md` |
| SecureString | ✅ | `numeric-and-compute-types.md` |
| Timestamp, Duration | ✅ | `numeric-and-compute-types.md` |
| Mutation model (let vs mut) | ✅ | `controlled-mutation-model.md`, `explicit-mutation-and-vault-writes.md` |

### Declaration Blocks

| Topic | Status | KB File |
| --- | --- | --- |
| Unified .spore syntax (5 domains: program/runtime/compile/security/effects) | ✅ | `unified-syntax-architecture.md` |
| API declaration (api name { endpoint: "..." }) | ✅ | `runtime-boundary-declarations.md` |
| Route declaration (route GET "/path" { ... }) | ✅ | `runtime-boundary-declarations.md`, `http-method-declarations.md` |
| Database declaration (database name { source: GlobalVault... }) | ✅ | `runtime-boundary-declarations.md` |
| Worker declaration (worker name { max: N, isolation: strict }) | ✅ | `runtime-boundary-declarations.md` |
| Queue declaration (queue name { source: GlobalVault... }) | ✅ | `runtime-boundary-declarations.md` |
| Trigger declaration | ✅ | `triggers.md` |
| Scheduler block syntax | ✅ | `runtime-scheduler.md` |
| Extension point declaration | ✅ | `runtime-extension-points.md` |
| Plugin declaration | ✅ | `plugin-security-architecture.md` |
| Boot / main / runtime / compile / security blocks | ✅ | `boot-main-startup-defaults.md` |
| Import / module system | ✅ | `module-system-and-visibility.md` |
| Visibility (public/private/package/runtime) | ✅ | `module-system-and-visibility.md` |
| Package declaration syntax | ✅ | `package-declaration-syntax.md` |

### Trust Conversion Syntax

| Topic | Status | KB File |
| --- | --- | --- |
| validate.* gate | ✅ | `trust-conversion-model.md` |
| clean.* gate | ✅ | `trust-conversion-model.md` |
| encode.* gate | ✅ | `trust-conversion-model.md` |
| contex: RequestContext | ✅ | `request-context-keyword.md` |
| GlobalVault access syntax | ✅ | `variable-mutation-vault-design.md`, `vault-write-syntax.md` |
| GlobalVault scoped vaults | ✅ | `scoped-vaults.md` |
| Session vault syntax | ✅ | `session-vault.md` |

---

## 2. Logic

How programs reason, branch, handle errors, enforce permissions, and prove correctness.

### Error Handling and Control

| Topic | Status | KB File |
| --- | --- | --- |
| Result<T,E> model (no exceptions) | ✅ | `no-exceptions-result-model.md`, `typed-error-model.md` |
| attempt ... else error pattern | ✅ | `core-syntax-keywords.md` |
| Guard clause pattern | ✅ | `flat-flow-style.md` |
| Branching (if/else, match) | ✅ | `branching-model.md` |
| Pattern matching (full) | ✅ | `pattern-matching.md` |
| match catch-all (_ =>) | ✅ | `match-catch-all-branch.md` |
| Error propagation through call chains | ✅ | `error-propagation-chains.md` |

### Permissions and Authority

| Topic | Status | KB File |
| --- | --- | --- |
| uses declaration | ✅ | `flow-vs-fn-security-model.md`, `developer-friendly-permission-model.md` |
| Permission / capability / actor model | ✅ | `permission-capability-actor-model.md` |
| Developer-friendly permission model | ✅ | `developer-friendly-permission-model.md` |
| Runtime vs compile-time authority | ✅ | `authority-model.md`, `compile-time-vs-runtime-authority.md` |
| How authority propagates through flows | ✅ | `authority-model.md` |
| Audit actor model | ✅ | `audit-actor-model.md` |
| Multi-actor audit events | ✅ | `multi-actor-audit-events.md` |

### Trust and Security Logic

| Topic | Status | KB File |
| --- | --- | --- |
| safe / unsafe trust model | ✅ | `safe-unsafe-trust-model.md` |
| Trust conversion (validate/clean/encode) | ✅ | `trust-conversion-model.md` |
| Data-in-motion security | ✅ | `data-in-motion-security.md` |
| Prompt injection defence | ✅ | `prompt-injection-defense.md` |
| Malicious data and exploit resistance | ✅ | `malicious-data-and-exploit-resistance.md` |
| Boundary safety proofs | ✅ | `boundary-safety-proof.md` |
| Security invariants and policy proof | ✅ | `security-invariants-and-policy-proof.md` |
| Denial-by-default risk features | ✅ | `deny-by-default-risk-features.md` |
| No inheritance / explicit security | ✅ | `no-inheritance-explicit-security.md` |
| What Galerina refuses to become | ✅ | `what-galerina-refuses-to-become.md` |
| Excluded features table | ✅ | `excluded-features.md` |

### Data and Type Logic

| Topic | Status | KB File |
| --- | --- | --- |
| Tri / Decision / Bool boundary rules | ✅ | `mathematics-and-tri-logic.md` |
| Formal proof keywords | ✅ | `formal-proof-system.md` |
| Model security contracts | ✅ | `model-security-contracts.md` |
| Data visibility views | ✅ | `data-visibility-view-terminology.md`, `builtin-view-levels.md`, `standard-view-behaviour.md` |
| Field read rules | ✅ | `field-read-rules.md` |
| Polymorphism approach | ✅ | `polymorphism.md` |
| Encapsulation model | ✅ | `encapsulation-model.md` |
| Logic architecture policy | ✅ | `logic-architecture-policy.md` |

### Concurrency Logic

| Topic | Status | KB File |
| --- | --- | --- |
| task / wait model | ✅ | `async-task-model.md` |
| Controlled parallelism rules | ✅ | `controlled-parallelism.md` |
| Governed worker pools | ✅ | `governed-worker-pools.md` |
| Governed streams | ✅ | `governed-streams.md` |
| Concurrency safety (no shared mutable state) | ✅ | `excluded-features.md`, `controlled-parallelism.md` |
| Cancellation policy modes | ✅ | `async-task-model.md`, `controlled-parallelism.md` |

---

## 3. Runtime

Execution, scheduling, trust verification, identity, memory, hardware targets.

### Runtime Architecture

| Topic | Status | KB File |
| --- | --- | --- |
| LSGR runtime components overview | ✅ | `lsgr-runtime-components.md` |
| Why Galerina's runtime differs | ✅ | `galerina-runtime-rationale.md` |
| Runtime terminology and naming | ✅ | `runtime-terminology-evolution.md` |
| Runtime Command (Director) | ✅ | `governed-execution-director.md` |
| Authority Control (Sheriff) | ✅ | `lsgr-runtime-components.md` |
| Resource Deployment Balancer | ✅ | `compute-balancer.md` |
| Execution Coordination Scheduler | ✅ | `runtime-scheduler.md` |
| Result Assembler | ✅ | `runtime-assembler.md` |
| Runtime trusted core design | ✅ | `runtime-trusted-core-design.md` |
| Neutral Governed IR | ✅ | `neutral-governed-ir.md` |
| Runtime profiles (dev/team/production/enterprise) | ✅ | `runtime-profiles.md` |
| Runtime policy config | ✅ | `runtime-policy-config.md` |
| Securely governed runtime overview | ✅ | `securely-governed-runtime.md` |

### Execution and Scheduling

| Topic | Status | KB File |
| --- | --- | --- |
| Triggers | ✅ | `triggers.md` |
| Scheduler (job timing, retry, overlap) | ✅ | `runtime-scheduler.md` |
| Scheduled actions | ✅ | `scheduled-actions.md` |
| Scheduled chain blocks | ✅ | `scheduled-chain-blocks.md` |
| Governed event-driven execution | ✅ | `governed-event-driven-execution.md` |
| Critical and deferred compute paths | ✅ | `critical-and-deferred-compute-paths.md` |
| Verified fast paths (VPI) | ✅ | `verified-fast-paths.md` |
| Context-tagged execution cache | ✅ | `context-tagged-verified-execution-cache.md` |
| Generative runtime mapper | ✅ | `generative-runtime-mapper.md` |

### Trust and Identity

| Topic | Status | KB File |
| --- | --- | --- |
| Automated runtime trust strategy | ✅ | `automated-runtime-trust-strategy.md` |
| Trust Capsule | ✅ | `automated-runtime-trust-strategy.md` |
| Runtime identity model | ✅ | `runtime-identity-model.md` |
| Secure channels and portals | ✅ | `secure-channels-and-portals.md` |
| Data-in-motion security | ✅ | `data-in-motion-security.md` |
| Runtime extension points | ✅ | `runtime-extension-points.md` |
| Plugin security architecture | ✅ | `plugin-security-architecture.md` |
| Certified package registry | ✅ | `certified-package-registry.md` |
| Package resolver | ✅ | `package-resolver.md` |
| Package declaration syntax | ✅ | `package-declaration-syntax.md` |
| Runtime package structure | ✅ | `runtime-package-structure.md` |

### Memory and Cleanup

| Topic | Status | KB File |
| --- | --- | --- |
| Flow finalizer and GC strategy | ✅ | `flow-finalizer-and-cleanup.md` |
| release keyword | ✅ | `release-keyword.md` |
| Memory pressure security | ✅ | `memory-pressure-security.md` |
| Trusted boot preload graph | ✅ | `trusted-boot-preload-graph.md` |

### Startup and Performance

| Topic | Status | KB File |
| --- | --- | --- |
| Boot / main startup | ✅ | `boot-main-startup-defaults.md`, `startup-and-boot-warmup.md` |
| Preplanned startup and fast response | ✅ | `preplanned-startup-and-fast-response.md` |
| Fast response and keep-alive | ✅ | `fast-response-and-keep-alive.md` |
| Production scaling model | ✅ | `production-scaling-model.md` |
| Runtime boundary declarations (API/DB/worker/queue) | ✅ | `runtime-boundary-declarations.md` |
| Authority model (compile-time + runtime) | ✅ | `authority-model.md` |
| Controlled parallelism | ✅ | `controlled-parallelism.md` |

### Compute and Hardware

| Topic | Status | KB File |
| --- | --- | --- |
| AI compute plan | ✅ | `ai-compute-plan.md` |
| Specialist AI hardware compute targets | ✅ | `specialist-ai-hardware-compute-targets.md` |
| AI linear algebra accelerator support | ✅ | `ai-linear-algebra-accelerator-support.md` |
| Hybrid electronic-optical compute | ✅ | `hybrid-electronic-optical-compute.md` |
| Native photonic compute future | ✅ | `native-photonic-compute-future.md` |
| Photonic resolution boundary | ✅ | `photonic-resolution-boundary.md` |
| Quantum readiness | ✅ | `quantum-readiness.md` |

### Bootstrap, Build, and Observability

| Topic | Status | KB File |
| --- | --- | --- |
| Node.js bootstrap runtime roadmap | ✅ | `node-hosted-runtime-roadmap.md` |
| Bootstrap plan stages (Node → IR → Rust/WASM → self-hosting) | ✅ | `bootstrap-runtime-roadmap.md` |
| Compiler diagnostics and error codes | ✅ | `compiler-diagnostics.md` |
| Observability and monitoring | ✅ | `observability-and-monitoring.md` |
| Build system and galerina build / galerina deploy CLI | ✅ | `build-system-and-cli.md` |
| Deployment model (build-once, deploy-many) | ✅ | `build-system-and-cli.md` |
| Good-taste architecture principles | ✅ | `architecture-good-taste-principles.md` |
| CI/CD integration (OIDC, SLSA provenance, attestation) | ✅ | `cicd-integration-and-provenance.md` |
| Runtime audit log format | ✅ | `runtime-audit-log-format.md` — schemaVersion resolved: `"lln.runtime.audit.v1"` canonical; `ExecutionProofHashes` field names confirmed (`manifestSha256`, `auditSha256`, `evidenceSha256`, `denialSha256`, `artefactSha256`); `JsonlAuditWriter` interface + 7-rule contract added; `ExecutionProofV1`/`V2`, `ExecutionProofSection`, `upgradeExecutionProofV1ToV2()` added; `RuntimeAuditEvent` extended with `category` and `message` fields; `DenialReport.schemaVersion` → `"spore.denial.report.v1"` (2026-05-26) |
| Effect checker and boundary checker | ✅ | `effect-checker-and-boundary-checker.md` |
| Formal type system specification — all built-in types, generic arity, null policy, 22 SPORE-TYPE-* diagnostic codes, 14-step checker execution order | ✅ | `formal-type-system-spec.md` — Phase 5 prerequisite; nominal typing, value-state interaction, SecureString restrictions, pipeline order (symbol resolution → type checker → value-state checker → effect checker → governance verifier) (2026-05-28) |
| Value-state annotation grammar and checker — unsafe/safe/validated/tainted/secret/protected; gate functions; SPORE-VALUESTATE-001..005; SPORE-SECRET-001..003 | ✅ | `value-state-annotations.md` + `value-state-checker.md` — Phase 5 prerequisite; EBNF grammar, state machine, taint propagation, audit proof format (2026-05-28) |
| Operator precedence and Pratt parser — binding power table, INFIX/PREFIX tables, governance implications, SPORE-EXPR-001..007 | ✅ | `operator-precedence.md` — Phase 5 prerequisite; table-driven Pratt decision, precedence examples, no ++ / --, no operator overloading, pipeline operator reserved (2026-05-28) |
| Parser error recovery — sync tokens, errorNode, Phase 4 existing implementation | ✅ | `parser-error-recovery.md` — Phase 5 prerequisite (2026-05-28) |
| Governed compute chain — `compute target cpu/gpu/npu/best` syntax, tensor transfer, AI inference chain, `intent LocalPrivateInference`, audit proof format | ✅ | `governed-compute-chain.md` — post-v1 runtime feature; design spec; AST node `ComputeTargetBlock` (2026-05-28) |
| IHSA (Infrequent Hard Storage Access) storage policy — `storage.read.infrequent` effect, streaming-first, memory pressure policy, SPORE-STORAGE-001 | ✅ | `ihsa-storage-policy.md` — post-v1 runtime enforcement; `spill.enabled false` default; governance policy block syntax (2026-05-28) |
| @state() lifecycle system — Layer C runtime orchestration, session/gpu/context/distributed categories, lifecycle phases, SPORE-STATE-001..006 | ✅ | `lifecycle-state-system.md` — **Phase 6+ / Layer C only — do not implement in v1**; design intent preserved; reactivity, state dependency graph, mutation policies (2026-05-28) |
| Compile-time vs runtime authority boundary | ✅ | `compile-time-vs-runtime-authority.md` |
| Package completion status and implementation order | ✅ | `package-completion-status.md` |
| CLI build / verify / deploy / explain / plan (governance) | ✅ | `galerina-core-cli-deploy-explain-plan.md` |
| API boundary architecture (request flow, manifest, routes) | ✅ | `galerina-api-boundary-architecture.md` |
| GPU / photonic / WASM / compatibility backends | ✅ | `galerina-core-compute-gpu-and-photonic-backends.md` |
| v1 Memory model — borrow/move/copy/escape, bounds checks, SPORE-MEMORY-001–008, unsafe FFI boundary | ✅ | `galerina-core-memory-model.md` — hybrid ownership model decision; binding hierarchy (let/mut/readonly/move/borrow/copy); one-mutable-borrow rule; escape rules; bounds-check behaviour (always on in v1); SPORE-MEMORY-001..008 diagnostic codes; unsafe block v1 allowed list vs post-v1; FFI native interface syntax; GPU/zero-copy implications; v1 implementation checklist (2026-05-26) |
| Runtime-owned single-instance resources — Galerina's replacement for OOP singletons | ✅ | `galerina-core-runtime-resources.md` — `readonly resource`/`resource` syntax; `scope runtime`/`request`; `uses` declaration; `concurrency` modes; lifecycle model (declared→ready→closed); `ResourceDeclaration`/`RuntimeResourceRegistry`/`ResourceScopeContext` type shapes; `ResourceManifest`/resource report schemas; SPORE-RESOURCE-001..010 diagnostics; examples (AppConfig, Database, AuditWriter, SecretVault, RequestContext, FeatureFlags, test overrides); AstNodeKind additions implemented (`resourceDecl`, `resourceScopeDecl`, `resourceInitBlock`, `resourceShutdownBlock`, `usesDecl` added to `@galerina/core`); v1 checklist (2026-05-26) |
| Core package dependency graph + runtime data flow (Mermaid) | ✅ | `galerina-core-package-architecture.md` — package dependency graph (10 `galerina-core*` packages, logical relationships), runtime data flow (HTTP → Node → APIServer → Config/Security/Runtime → Response), compile-time 14-pass pipeline, diagnostic code namespace table, test coverage summary (2286 tests, all passing, 2026-05-31) |
| Lexer improvements — endLine/endColumn spans, unicode escapes | ✅ | `galerina-lexer-spore.md` — SPORE-LEX-001 (invalid escape), SPORE-LEX-002 (unterminated string), SPORE-LEX-003 (unexpected char); endLine/endColumn position spans on all tokens; Lexer now at 99% Stage A (2026-05-31) |
| Phase 14 — Root capability provider | ✅ | `galerina-static-capability-proofs.md` — root capability provider isolates compiler authority from user program authority; `compiler.capabilities.spore` declares compiler's own capabilities in Galerina source; SPORE-BUILD-001 NON_DETERMINISTIC_BUILD diagnostic (2026-05-31) |
| Phase 15 — Passive execution plans | ✅ | `galerina-passive-execution-plans.md` — type + builder + attestation integration; plan-based executor converts AST-walking interpreter into auditable, cacheable execution plans; passive plan type system and builder fully specified (2026-05-31) |
| Phase 16-17 — NodeFlags and ValueStateFlags | ✅ | `galerina-roadmap.md` — NodeFlags bitmask for AST node properties; ValueStateFlags bitmask for value state tracking (unsafe/safe/validated/tainted/secret/protected); integrated into compiler pipeline (2026-05-31) |
| Phase 18 — GovernanceFlags and EffectCheckerFlags | ✅ | `governance-verifier-architecture.md`, `effect-checker-architecture.md` — GovernanceFlags bitmask for policy enforcement; EffectCheckerFlags for effect analysis passes; new architecture KB docs added (2026-05-31) |
| Phase 19 — TypeId and EffectFlags | ✅ | `type-checker-architecture.md` — TypeId stable numeric identifiers for all built-in and user-defined types; EffectFlags bitmask for effect declaration and propagation (2026-05-31) |
| Phase 20 — RuntimeManifest and WAT emitter skeleton | ✅ | `gir-emitter-architecture.md`, `runtime-interpreter-roadmap.md` — RuntimeManifest v0.3 with typed section arrays; WAT (WebAssembly Text) emitter skeleton; `wat-emitter.ts` added to workspace (2026-05-31) |
| Phase 21 — TypedArray lowering plans and GPU/NPU/APU plans | ✅ | `value-state-checker-architecture.md` — TypedArray lowering plans (`lowering-plan.ts`); GPU/NPU/APU execution plans (`gpu-plan.ts`); typed tensor paths for compute targets (2026-05-31) |
| Phase 22 — Register VM types | ✅ | `runtime-interpreter-roadmap.md` — Register-based VM type definitions (`register-vm.ts`); instruction set planning for Galerina bytecode execution (2026-05-31) |
| Phase 23 — StringView / BytesView / TensorView | ✅ | `explicitness-principles.md`, `stdlib-registry.md` — StringView/BytesView/TensorView zero-copy slice types (`views.ts`); BoundaryGraph for cross-boundary data flow (`boundary-graph.ts`); stdlib registry (`stdlib-registry.ts`); package-resolver-architecture and architecture-high-roi-ideas KB docs added (2026-05-31) |
| Omni logic (multi-valued reasoning) | ✅ | `galerina-core-logic-omni-logic.md` |
| Effect and boundary checker (expanded) | ✅ | `effect-checker-and-boundary-checker.md` (extended boundary types, runtime manifest JSON, foundational context) |
| Tri / Decision / Bool logic systems | ✅ | `galerina-core-logic-tri-decision-bool.md` |
| Environment config and secret reference model | ✅ | `galerina-core-config-environment-secrets.md` |
| .env trust model (source vs trust level; security levels; compiler warnings) | ✅ | `galerina-core-config-dotenv-trust-model.md` |
| Config Vault (typed non-secret shared config; SPORE-VAULT-001–005; vault global block) | ✅ | `galerina-core-config-vault.md` |
| Flow Trace API (FlowTraceEvent; governed trace; JSONL; SPORE-TRACE-001–005; redaction) | ✅ | `galerina-core-flow-trace.md` |
| Intent, safety levels, effects, flow tracing, runtime manifests | ✅ | `galerina-core-intent-safety-effects.md` — `SafetyLevel`, `IntentDeclaration`, `EffectReference`, `FlowDeclarationMetadata`, `FlowTraceEvent` in `@galerina/core`; `IntentCheckResult`, `IntentMismatch`, `SPORE-INTENT-001–005`, `validateIntentEffects()` stub in `@galerina/core-compiler`; `IntentReport`, `SafetyReport`, `FlowTraceReport`, `RuntimeFlowManifest` in `@galerina/core-reports`; 8 new `AstNodeKind` values; 3 new tests (2026-05-26) |
| Network governance model | ✅ | `galerina-core-network-governance.md` |
| Effect checker — v0.2 formal spec | ✅ | `galerina-core-effect-checker-v02.md` |
| Manifest generation — v0.2 formal spec | ✅ | `galerina-core-manifest-generation-v02.md` |
| CLI commands — v0.2 formal spec | ✅ | `galerina-core-cli-v02.md` |
| Reports/audit — v0.2 formal spec | ✅ | `galerina-core-reports-v02.md` |
| Compute backends — v0.2 formal spec | ✅ | `galerina-core-compute-v02.md` |
| Config — v0.2 formal spec | ✅ | `galerina-core-config-v02.md` |
| Network governance — v0.2 formal spec | ⚠️ | `galerina-core-network-v02.md` ⚠️ **Update status: superseded** — uses `sharedSecret` field, `ws/wss` protocols, `ReplayStore {has/store}` without `IdempotencyRecord`; superseded by `galerina-core-network-webhook.md` canonical names |
| API server — v0.2 formal spec | ✅ | `galerina-framework-api-server-v02.md` |
| Compiler manifest generation — pass 14 | ✅ | `galerina-core-compiler-manifest-generation-pass-14.md` |
| Online Safety Act age assurance policy | ✅ | `galerina-core-policy-online-safety-act.md` |
| Security secret reference model — architecture spec | ✅ | `galerina-core-security-secret-reference-model.md` |
| Photonic governance architecture | ✅ | `galerina-core-photonic-governance-architecture.md` |
| Photonic backend architecture | ⚠️ | `galerina-core-photonic-backend-architecture.md` ⚠️ **Update status: legacy/historical** — contains prior 3-value OpticalTransportMode string union and original SPORE-PHOTONIC-001–006 meanings; use as historical context only until galerina-core-photonic reconciles the canonical enum and diagnostic table across all specs |
| Logic types — v0.2 formal spec | ⚠️ | `galerina-core-logic-v02.md` ⚠️ **Update status: formal spec (type: discriminant, 3-state Decision)** — superseded for runtime-facing docs by package README and `galerina-core-logic-tri-decision-bool.md`; current canonical uses kind: discriminant and 4-state Decision (allow\|deny\|review\|unknown) |
| Security — v0.2 formal spec | ✅ | `galerina-core-security-v02.md` **Update status: conflict resolved (2026-05-26)** — canonical public API is `unwrapForApprovedSink(sink)`; `revealUnsafeForRuntimeOnly()` is private internal only; KB updated to match |
| Signed Attestation — Ed25519 artifact signing | ✅ | `galerina-signed-attestation.md` — attestation pipeline, YAML format, key_id rotation, Stage 2 post-quantum ML-DSA/SLH-DSA plan (2026-05-30) |
| Governed Memory Blocks — runtime integrity | ✅ | `galerina-governed-memory-blocks.md` — GMB structure, three-layer enforcement, ARM MTE/CHERI future hardware, contract rules syntax (2026-05-30) |
| Flow Contract Full Model — canonical section reference | ✅ | `galerina-contract-full-model.md` — all 16 sections incl. errors/timeouts/retries/limits/privacy/observability, named result types, canonical order (2026-05-30) |
| Contract errors {} section | ✅ | `galerina-contract-errors.md` — error mapping, expose/redact/audit, connection to Result<T,E> (2026-05-30) |
| Contract operational constraints — timeouts/retries/limits | ✅ | `galerina-contract-operational-constraints.md` — deadline, retry policy, resource limits, unlimited prohibition (2026-05-30) |
| Contract privacy and observability sections | ✅ | `galerina-contract-privacy-observability.md` — PII rules, retention, deny patterns, observability sees execution not data (2026-05-30) |
| Naming conventions — request not req, rawX for unsafe, FlowNameResult | ✅ | `galerina-naming-conventions.md` — accepted style direction, full param names, local binding rules (2026-05-30) |
| Phase 11 design decisions — loops, mut, CEC CI, graph module, result-of, contract runtime | ✅ | `galerina-phase-11-decisions.md` — 6 recorded decisions with rationale (2026-05-30) |
| Phase 10 Roadmap — 10A/10B/10C plan | ✅ | `galerina-phase-10-roadmap.md` — attestation module, governance enforcement, governed memory blocks (2026-05-30) |
| Photonic — v0.2 formal spec | ⚠️ | `galerina-core-photonic-v02.md` ⚠️ **Update status: not implementation-ready** — OpticalTransportMode enum (Waveguide\|Coherent\|Mesh\|FreeSpace\|Hybrid\|Experimental) conflicts with governance spec (DIRECT\|WAVELENGTH\|PACKETIZED\|HYBRID\|EMULATED\|SIMULATED) and vector spec (electrical\|hybrid\|photonic\|waveguide\|plasmonic\|coherent); reconciliation required before any implementation |
| Tri Logic developer guide — v0.2 | ⚠️ | `galerina-core-logic-tristate-developer-guide.md` ⚠️ **Update status: predates current v0.2 shape** — Decision shown as 3-state (allow/deny/unknown), BoolBoundaryResult lacks diagnostics[]; use package README and `galerina-core-logic-tri-decision-bool.md` as canonical; kind: discriminant is standard |
| API server full implementation spec | ⚠️ | `galerina-framework-api-server-implementation.md` ⚠️ **Update status: adapter-level names** — `ReplayStore.exists()/save()` are adapter-level; canonical network contract is `has()/put(ttlSeconds)` from `galerina-core-network-webhook.md`; mapping or name adoption required before implementation |
| Vector photonic governance (proposed) | ⚠️ | `galerina-core-vector-photonic-governance.md` ⚠️ **Update status: proposal/reference note only** — galerina-core-photonic owns final definitions after reconciliation |

---

## 4. Package Documentation Coverage

Status of documentation for `galerina-core` and the `galerina-core-*` family of packages.

```text
✅ README complete — scope, contracts, boundary and usage documented
⚠️  README partial — exists but missing contracts, scope or examples
❌ README missing — file does not exist or is a placeholder only
```

### galerina-core (Language Specification)

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Full language overview, quickstart, feature table |
| syntax.md | ✅ | Canonical syntax reference — all keywords, types, patterns |
| type-system.md | ✅ | Type system — primitives, Auto, Option, Result, Tri, generics |
| security-model.md | ✅ | Trust model, postfix state, SecureString, webhook, API security |
| language-rules.md | ✅ | Strict rules — no null, no truthy/falsy, exhaustive match |
| memory-safety.md | ✅ | Ownership, lifecycle, resource scopes |
| json-native-design.md | ✅ | JSON decode/encode, typed access, policy |
| strict-comments.md | ✅ | `///` doc comments and `@tag` annotations |
| ARCHITECTURE.md | ✅ | Package architecture overview |
| DESIGN.md | ✅ | Design decisions and rationale |
| SECURITY.md | ✅ | Security design and threat model |
| REQUIREMENTS.md | ✅ | Formal requirements (REQ-*) |
| ROADMAP.md | ✅ | Version roadmap 0.1.x → 1.0.0 |
| AI-INSTRUCTIONS.md | ✅ | AI coding assistant guidance |
| docs/syntax.md | ✅ | Mirror of syntax.md in docs/ |
| docs/type-system.md | ✅ | Mirror of type-system.md in docs/ |
| docs/security-model.md | ✅ | Mirror of security-model.md in docs/ |
| docs/language-rules.md | ✅ | Mirror of language-rules.md in docs/ |
| docs/memory-safety.md | ✅ | Mirror of memory-safety.md in docs/ |
| docs/polymorphism.md | ✅ | Polymorphism model |
| docs/syntax-logic-status.md | ✅ | Syntax feature status table |
| docs/language-core-maturity-roadmap.md | ✅ | Language core maturity checklist |
| docs/tri-logic.md | ✅ | Tri / Bool / Decision logic in depth — ownership note: older examples are language-explanatory only; `galerina-core-logic` README and `galerina-core-logic-tri-decision-bool.md` are canonical |
| docs/omni-logic.md | ✅ | Ownership note: semantics owned by `galerina-core-logic`; uncertain Omni states must map to review() |
| docs/webhooks.md | ✅ | Current Canonical Package Contract section added — canonical names: `WebhookVerificationConfig.secret: string\|Uint8Array`, `ReplayStore.has(key)`, `ReplayStore.put(key, ttlSeconds)`, `IdempotencyStore.get(key)`, `IdempotencyStore.put(IdempotencyRecord, ttlSeconds?)` |
| docs/package-boundaries.md | ✅ | Note: if COVERAGE.md records conflicting public contract shapes, do not treat conflict as implementable until resolved |
| docs/README.md | ✅ | Coverage Update Status section added — canonical owners: `galerina-core-logic` (v0.2 TriState/Decision/BoolBoundaryResult/Omni); `galerina-core-network` (webhook HMAC/replay/idempotency); `galerina-core-security` (protected secret); `galerina-core-photonic` (photonic runtime target — ownership/diagnostic-code conflicts unresolved) |
| docs/backend-compute-support-targets.md | ✅ | Ownership note: compute planning in `galerina-core-compute`, target selection in `galerina-target-cpu/native/gpu/photonic` |
| ARCHITECTURE.md | ✅ | References COVERAGE.md as workspace conflict register; names photonic enum and logic discriminant as unresolved conflicts; as-documented conflicts must not be implemented until reconciled |
| examples/ | ✅ | hello, option, result, decision, payment-webhook, benchmarks |
| compiler/galerina.js | ✅ | **Stage 1 runtime foundation** — plain JavaScript file, runs directly in Node.js with no build step; parser, type checker, formatter prototype; the model for all Stage 1 runtime additions |
| src/index.ts | ✅ | **Shared type contracts** — `BaseDiagnostic` (minimal `{code,name,severity,message}` shape; all package diagnostics are structurally compatible), `CompilerDiagnostic extends BaseDiagnostic` (adds `location?`, `suggestedFix?`), `DiagnosticSeverity`, `SourceLocation`, `TokenKind`, `Token`, `LexResult`; `ContentBlockType`, `CONTENT_BLOCK_TYPES`, `TypedContentBlockExpression`; `BindingKind`, `BindingDeclaration`, `MethodChainCall`, `MethodChainExpression`; `SafetyLevel`, `IntentDeclaration`, `EffectReference`, `FlowDeclarationMetadata`; `FlowTraceStage`, `FlowTraceStatus`, `FlowTraceDecision`, `FlowTraceEvent`; `AstNodeKind` (includes `charLiteral`, `byteLiteral`, `readonlyDecl`, `methodChainExpr`, `typedContentBlockExpr`, `guardedFlowDecl`, `privilegedFlowDecl`, `unsafeFlowDecl`, `experimentalFlowDecl`, `unsafeBlock`, `intentDecl`, `requiresCapabilityDecl`, `fallbackDecl`, `resourceDecl`, `resourceScopeDecl`, `resourceInitBlock`, `resourceShutdownBlock`, `usesDecl` — 2026-05-26), `AstNode`, `ParseResult`, `BuildOutputKind`, `BuildOutput`, `BuildManifest`; `createCompilerDiagnostic()`, `hasErrors()`, `filterBySeverity()` helpers. Note: `EnvironmentMode` is **not** here — canonical owner is `@galerina/core-config`. |
| tests/ | ✅ | 9 contract tests (2026-05-26) — `createCompilerDiagnostic` shape, optional fields, `hasErrors`, `filterBySeverity`, `CONTENT_BLOCK_TYPES`; `npm test` chains SPORE compiler examples (42 pass) + Node contract suite (9 pass) |

### galerina-core-runtime

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope, execution model, philosophy, contracts, phases documented |
| TODO.md | ✅ | Work tracking |
| src/ | ⚠️ | Implementation stubs — runtime contracts defined, not yet executed |
| tests/ | ✅ | 2286 tests passing (2026-05-31, total workspace) — `validateRuntimeContext`, `createRuntimeContext` (throws on invalid), `okRuntimeResult`/`errorRuntimeResult`, `decideRuntimeEffect` (default + custom policy, all effect kinds), `DEFAULT_RUNTIME_EFFECT_POLICY` constants, `createRuntimeReport` |
| Execution contract model | ✅ | Documented — request → planning → verification → execution → audit |
| Effect dispatch | ✅ | Listed in README scope |
| Resilient flow supervision | ✅ | Listed in README scope |
| Checkpoint / resume hooks | ✅ | Listed in README scope |
| Node-hosted adapter contracts | ✅ | Listed in README scope |
| Verified boot-profile loading | ✅ | Listed in README scope |
| AI compute plan execution hooks | ✅ | Listed in README scope |
| Runtime reports | ✅ | Listed in README scope |

### galerina-core-security

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope, boundary, contracts fully documented — Architecture Depth section added; **Coverage Reconciliation Status**: ProtectedSecret<T> conflict **resolved (2026-05-26)** — canonical `unwrapForApprovedSink(sink)`; SecretSource canonical names updated (`env\|vault\|kms\|runtime\|oauth\|token`) |
| TODO.md | ✅ | Work tracking — all v0.2 items added; **first item checked off**: ProtectedSecret<T> unwrap API resolved (2026-05-26); SecretSource item updated to canonical names |
| src/ | ⚠️ | Implementation stubs |
| tests/ | ✅ | 14 tests passing (2026-05-26) — `createSecureStringReference` (label, classification, fingerprint, no value), redact bearer tokens + credentials, permission deny-by-default, wildcard deny priority, duplicate grant detection, empty resource rejection, redact non-sensitive content unchanged, `validatePermissionModel`, `validateCryptographicPolicy`, `validateRedactionRule`, `createSecurityReport` |
| SecureString / Secret<T> | ✅ | Contracts documented |
| Redaction primitives | ✅ | Contracts documented |
| Permission model types | ✅ | Contracts documented |
| Secret reference model | ⚠️ | Fully specified in README and `galerina-core-security-secret-reference-model.md`; not yet implemented |
| Capability lease and attenuation | ✅ | Contracts documented |
| Crypto policy and post-quantum planning | ✅ | Contracts documented |
| Security diagnostics / reports | ✅ | Contracts documented |
| Taint-flow and safe-sink diagnostics | ✅ | Contracts documented (SecretTaint discriminated union, combineTaint()) |

### galerina-core-compiler

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — Architecture Depth section added (RuntimeManifest v0.2 sub-types, Effect interface, EffectCategory, CheckedFunction/EffectGraph, Boundary types, ComputeDeviceProfile, internal file layout) |
| TODO.md | ✅ | Work tracking — all v0.2 items added |
| src/ | ⚠️ | Implementation stubs — compiler pipeline defined but not complete; `SPORE-STRING-001–004`, `SPORE-CHAR-001–004`, `SPORE-BYTE-001–005` diagnostic constants + arrays added (2026-05-26); `SPORE-MEMORY-001–008` memory diagnostics added (`USE_AFTER_MOVE`, `BORROW_AFTER_MOVE`, `BORROW_ESCAPES_SCOPE`, `READONLY_MUTATION`, `MUTABLE_ALIAS`, `BOUNDS_VIOLATION`, `UNCHECKED_ACCESS_OUTSIDE_UNSAFE`, `UNSAFE_MEMORY_REQUIRES_FALLBACK` — all `"error"`, 2026-05-26); `validateIntentEffects` stub returns correct `IntentCheckResult` shape |
| Lexer | ✅ | Implemented prototype in galerina-core/compiler/ |
| Parser | ✅ | Implemented prototype in galerina-core/compiler/ |
| Type checker | ✅ | Implemented prototype in galerina-core/compiler/ |
| Formatter | ✅ | Implemented prototype in galerina-core/compiler/ |
| AST / source map | ✅ | Implemented prototype in galerina-core/compiler/ |
| Effect checker | ⚠️ | Fully specified (Effect interface, EffectCategory, CheckedFunction, EffectGraphNode, EffectGraph, inferExpressionEffects, propagateEffects, SPORE-EFFECT-001–004); not yet implemented |
| Boundary checker | ⚠️ | Fully specified (Boundary, BoundaryRequirement, BoundaryEdge, BoundaryGraph, CheckedCallExpression, SPORE-BOUNDARY-001–004); not yet implemented |
| Compiler pass pipeline | ✅ | 14-pass pipeline — pass 14 (Runtime manifest generator) added |
| Manifest generation (pass 14) | ⚠️ | Fully specified v0.2 + pass-14 updates (RuntimeManifest with permissions[], reports[], ManifestIntegrity 5-hash type, serializeManifestStable()); not yet implemented |
| tests/ | ✅ | 21 tests passing (2026-05-26) — syntax safety suite (17 original) + `validateIntentEffects` stub shape (returns correct flowName/safetyLevel/intent/effects/mismatches/diagnostics fields; omits `intent` key when `undefined`); `String/Char/Byte diagnostic constants` (SPORE-STRING-001–004, SPORE-CHAR-001–004, SPORE-BYTE-001–005: codes, names, severities, array lengths/prefixes); `Memory diagnostic constants` (SPORE-MEMORY-001–008: codes, names, all errors, array length 8, prefix check) |

### galerina-core-cli

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — Architecture Depth section added (all command types, exit codes 0–7, CLI report files table, CLI dir layout) |
| TODO.md | ✅ | Work tracking — all v0.2 items added |
| dist/ | ⚠️ | Compiled output present |
| src/ | ⚠️ | 10 TypeScript files present — CLI framework operational (`types.ts`, `cli.ts`, `commands.ts`); check and fmt working; build/verify/deploy/explain/plan command bodies are the remaining implementation gaps |
| galerina check | ✅ | Prototype implemented |
| galerina build | ⚠️ | Partial — artefact generation not complete; fully specified (BuildArtefact, BuildResult, buildWorkspace, 14-pass pipeline, SPORE-BUILD-001–005) |
| galerina fmt | ✅ | Prototype implemented |
| galerina verify | ⚠️ | Partial — hash checks only; fully specified (VerifiedArtefact, VerificationResult, verifyHash, SPORE-VERIFY-001–005) |
| galerina deploy | ⚠️ | Not yet implemented — fully specified (DeploymentTarget 7 values, DeploymentResult, ValidateEffectsInput, validateEffects, exit codes 0–7, SPORE-DEPLOY-001–005) |
| galerina explain | ⚠️ | Not yet implemented — fully specified (ExplainTrace, ExplainResult, buildTrace, SPORE-EXPLAIN-001–004) |
| galerina plan | ⚠️ | Not yet implemented — fully specified (ComputePlan with GpuPlan/OpticalPlan/CompatibilityReport, estimateTarget, SPORE-PLAN-001–004) |

### galerina-core-logic

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | **Coverage Reconciliation Status at top**: canonical shape = kind: discriminant (not type:), 4-state Decision (allow\|deny\|review\|unknown), evidence arrays, fail-closed Bool, uncertain Omni → review(); Architecture Depth section updated for all v0.2 types |
| TODO.md | ✅ | Work tracking — KB alignment item checked off; all v0.2 implementation items corrected to canonical README shapes: `kind:` discriminant with `value` fields, `UnknownReason` object, 4-state Decision with `review` + `evidence[]`, correct `CapabilityRequest`/`PolicyContext` fields, `deny>review>unknown>allow` priority, correct `BoolBoundaryResult`, `OmniState` as snake_case string literal union (2026-05-26) |
| src/ | ✅ | Root `index.ts` — v0.1 numeric implementation (Tri, LogicState, LogicDefinition, TruthTableRow, OmniLogicDefinition); sub-paths (`/tri`, `/decision`, `/bool-boundary`, `/omni`) — v0.2 discriminated union implementation fully complete (2026-05-26) |
| Tri logic operations | ✅ | v0.2 implemented in `src/tri/` — `TriState` discriminated union, `TRI_STATE_TRUE/FALSE`, `triUnknown`, `triUnknownFromReasons`, `triStateNot/And/Or/Nor`, `combineUnknownReasons`, `deduplicateUnknownReasons`, `SPORE-TRI-001–005` diagnostics; 13 tests passing (2026-05-26) |
| Decision logic | ✅ | v0.2 implemented in `src/decision/` — 4-state `Decision`, `allow/deny/review/unknownDecision` constructors, `decisionToRuntimeBool`, `combineDecisions` (deny>review>unknown>allow), `evaluateCapability`, `SPORE-DECISION-001–005` diagnostics; 2286 tests passing (2026-05-31, total workspace) |
| Bool boundary rules | ✅ | v0.2 implemented in `src/bool-boundary/` — `validateBoolBoundary` (TriState + Decision inputs, fail-closed on unknown/review), `BoolBoundaryResult`, `BoolBoundaryContext`, `SPORE-BOOL-BOUNDARY-001–005` diagnostics; 8 tests passing (2026-05-26) |
| Omni logic | ✅ | v0.2 implemented in `src/omni/` — `OmniState` 8-value snake_case union, `OMNI_STATES`, `OMNI_UNCERTAIN_STATES`, `isOmniState`, `isOmniUncertain`, `omniToDecision` (uncertain→review, confidence threshold 0.8), `SPORE-OMNI-001–005` diagnostics; 10 tests passing (2026-05-26) |

### galerina-core-compute

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — Architecture Depth section added (RuntimeTarget 11 values, GpuSuitability/GpuPlan v0.2, OpticalNeed/OpticalPlan, WasmTarget extended with runtime type+forbiddenEffects, CompatibilityLevel/Result/Report, shared types ComputeWorkload/DataShape) |
| TODO.md | ✅ | Work tracking — all v0.2 items added |
| src/ | ⚠️ | Implementation stubs |
| Compute block model | ✅ | Documented in galerina-core docs |
| Compute effects and capabilities | ✅ | Specified in `galerina-core-compute-gpu-and-photonic-backends.md` |
| GPU plan output | ⚠️ | Fully specified (GpuPlan v0.2 with schemaVersion, GpuSuitability, estimateGpuSuitability score-based, buildGpuPlan, gpu/ dir); not implemented |
| Photonic / optical plan output | ⚠️ | Fully specified (OpticalNeed, OpticalFallbackPlan, OpticalPlan with recommendedMode, estimateOpticalNeed, buildOpticalPlan, photonic/ dir); not implemented |
| GPU fallback rules | ✅ | Specified — all fallback paths documented with audit events |
| Scheduler and planner | ✅ | Specified — responsibilities, inputs, and audit events documented |
| WASM target | ⚠️ | Fully specified (WasmTarget extended with runtime type + forbiddenEffects[], DEFAULT_WASM_FORBIDDEN_EFFECTS, BROWSER_WASM_FORBIDDEN_EFFECTS, validateWasmEffect, validateWasmTarget, wasm/ dir, SPORE-WASM-001–004); not yet implemented |
| Target compatibility report | ⚠️ | Fully specified (CompatibilityLevel, CompatibilityResult extended, TargetProfile, CompatibilityReport, buildCompatibilityReport, compatibility/ dir, SPORE-COMPAT-001–004); not yet implemented |

### galerina-core-config

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — Architecture Depth section added (ConfigValue discriminated union 6 kinds, EnvironmentPolicy, defaultEnvironmentPolicy() per mode, EnvironmentConfig v0.2 with schemaVersion, SecretEnvironmentReference v0.2, SecretConfigSource discriminated union, LoadEnvironmentConfigInput, loadEnvironmentConfig(), EnvironmentConfigReport, SecretReportValue, internal file layout) |
| TODO.md | ✅ | Work tracking — 4 implemented items checked off: `EnvironmentMode` closed type, `ProductionStrictnessPolicy` enforcement, `RuntimeConfigHandoff` type + constructor, host package manifest boundary diagnostic; **diagnostic rename complete (2026-05-26)**: all codes now SPORE-CONFIG-001…027 with `{code, name, message}` metadata; SecretConfigSource updated to canonical `env\|vault\|kms\|runtime` |
| src/ | ⚠️ | Substantially implemented — `ProjectConfig`, `EnvironmentConfig`, `RuntimeConfigHandoff`, `ProductionStrictnessPolicy`, `DEFAULT_PRODUCTION_STRICTNESS_POLICY`, `loadConfigFromObjects`, `validateHostPackageManifestBoundary` present; diagnostic codes renamed SPORE-CONFIG-001…027 with `{code, name, message}` metadata (2026-05-26); v0.2 secret config surface (`SecretConfigSource`, `SecretEnvironmentReference`, `loadEnvironmentConfig`, `EnvironmentConfigReport`) not yet implemented — **naming conflict resolved**: canonical `env\|vault\|kms\|runtime` |
| tests/ | ✅ | 17 tests passing (2026-05-26) — all original config tests + `GALERINA_ENVIRONMENT_MODES` (4 modes), `isEnvironmentMode`, `defaultEnvironmentPolicy` (production/staging strict, development/test permissive), `getVaultEntry` (typed retrieval, missing key), `SPORE_VAULT_001–005` constants, all 5 vault diagnostic constructors (correct codes, error severity, key in message/path) |
| Environment config model | ⚠️ | Fully specified (EnvironmentConfig v0.2, EnvironmentMode, EnvironmentPolicy, defaultEnvironmentPolicy(), loadEnvironmentConfig(), EnvironmentConfigReport, SPORE-CONFIG-001–010); not yet implemented |
| Secret reference model | ⚠️ | Fully specified (SecretEnvironmentReference v0.2, SecretConfigSource discriminated union, SecretReportValue); ownership in galerina-core-security |
| Runtime policy config | ✅ | Documented in KB — `runtime-policy-config.md` |

### galerina-core-network

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | **Coverage Reconciliation Status at top**: canonical v0.2 names confirmed — has/put, get/put(IdempotencyRecord); Architecture Depth updated (NetworkProtocol 7 values incl. tcp/udp, NetworkPolicy redesigned, productionNetworkPolicy SSRF-safe, GovernedNetworkRuntime, WebhookVerificationConfig v0.2, IdempotencyRecord with status field, all typed Input/Result structs) |
| TODO.md | ✅ | Work tracking — all v0.2 items; legacy audit item checked off; `ReplayStore` corrected to `has/put(key,ttlSeconds)`, `IdempotencyStore` corrected to `get(key)/put(record,ttlSeconds?)` (2026-05-26) |
| src/ | ⚠️ | Implementation stubs |
| tests/ | ✅ | 2286 tests passing (2026-05-31, total workspace) — `defineNetworkPolicy`, `validateNetworkPolicy` (deny-by-default, plaintext HTTP, raw sockets, invalid ports, empty name, default-allow, timeout/backpressure warnings), `selectNetworkBackend` (prefer list, fallback, unsatisfied), `createNetworkReport` (ports, hosts, backend selection), `DEFAULT_TLS_POLICY`/`DEFAULT_NETWORK_PRIVACY_POLICY` constants, example JSON |
| Network boundary policy | ✅ | Documented in KB — `network-boundary-policy.md` |
| Rate limiting | ✅ | Documented in KB — `layered-rate-limits.md` |
| API boundary contracts | ✅ | Documented in KB — `runtime-boundary-declarations.md` |
| Governance model | ⚠️ | Fully specified v0.2 (NetworkProtocol 7 values incl. tcp/udp, NetworkPolicy with default/allowDestinations/denyDestinations, productionNetworkPolicy SSRF deny list, GovernedNetworkRuntime, safeHttpRequest, AiProviderNetworkPolicy, SPORE-NETWORK-001–008); not yet implemented |
| Webhook HMAC / replay / idempotency | ✅ | Fully specified v0.2 in `galerina-core-network-webhook.md` — canonical names: `secret: string\|Uint8Array`, `ReplayStore.has/put`, `IdempotencyStore.get/put(IdempotencyRecord)`; not yet implemented |

### galerina-core-reports

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — Architecture Depth section added (RuntimeAuditStatus v0.2, RuntimeAuditEvent v0.2, ExecutionProofHashes 5 SHA256 fields, DenialReport v0.2, all evidence types v0.2, validateAuditSafety, shared/ dir, output layout) |
| TODO.md | ✅ | Work tracking — all v0.2 items added |
| src/ | ⚠️ | Implementation stubs |
| tests/ | ✅ | 15 tests passing (2026-05-26) — all original reports + `createProcessingReport` (totalItems/success/fail/retry/quarantine/stopped/failureTypes), `createBuildCacheReport` (hits/misses/maxSizeBytes, default denied data classes including SecureString + authorization_decisions), `serializeReportJson` (round-trips to JSON with correct fields), `summarizeDiagnostics` (severity counts + status), `validateLoReport` accepts all 14 canonical kinds |
| Security report contracts | ✅ | Defined in galerina-core-security scope |
| AI context report | ✅ | Documented in galerina-core (app.ai-context.json) |
| Build / deployment reports | ✅ | Documented in `build-system-and-cli.md` |
| Runtime audit log format (JSONL) | ⚠️ | **Conflict resolved (2026-05-26)** — `runtime-audit-log-format.md` updated: schemaVersion canonical `"lln.runtime.audit.v1"`, `ExecutionProofHashes` field names confirmed, `JsonlAuditWriter` + 7-rule contract added, `category`/`message` fields added to `RuntimeAuditEvent`, `DenialReport.schemaVersion` → `"spore.denial.report.v1"`. Specified but not yet implemented — `JsonlAuditWriter.append`, `serializeAuditEvent`, `validateAuditSafety` remain stubs |
| Execution proof format | ⚠️ | **Updated (2026-05-26)** — `ExecutionProofV1` (schemaVersion `"spore.execution.proof.v1"`, fixed 5 hashes), `ExecutionProofV2` (extensible sections), `ExecutionProofSection`, `upgradeExecutionProofV1ToV2()` all added to `runtime-audit-log-format.md`. Specified but not yet implemented |
| Denial report | ⚠️ | Fully specified v0.2 (DenialReport schemaVersion "galerina.denial.v1", 6-category union, denials/ dir, SPORE-DENIAL-001–004); not yet implemented |
| Capability / effect / runtime evidence | ⚠️ | Fully specified v0.2 (CapabilityEvidence, EffectEvidence with declared/inferred/transitive fields, RuntimeEvidence with arrays, buildRuntimeEvidence async, evidence/ dir, SPORE-EVIDENCE-001–004); not yet implemented |

### galerina-core-tasks

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented |
| TODO.md | ✅ | Work tracking |
| dist/ | ⚠️ | Compiled output present |
| Task / wait model | ✅ | Documented in KB — `async-task-model.md` |
| Worker pool contracts | ✅ | Documented in KB — `governed-worker-pools.md` |
| Cancellation policy | ✅ | Documented in KB — `controlled-parallelism.md` |

### galerina-core-vector

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — Boundary conflict note and **Coverage Reconciliation Status** added: vector does not own photonic runtime target semantics; those belong in galerina-core-photonic once ownership reconciled |
| TODO.md | ✅ | Work tracking; **first item**: "Treat vector photonic governance notes as proposal-only until galerina-core-photonic reconciles ownership" |
| src/ | ⚠️ | Implementation stubs |
| Vector<N,T> / Matrix<R,C,T> | ✅ | Documented in KB — `numeric-and-compute-types.md` |
| pure vector flow model | ✅ | Documented in galerina-core docs |
| Photonic governance (proposed) | ⚠️ | Specified in `galerina-core-vector-photonic-governance.md` — BOUNDARY CONFLICT: existing README says photonic belongs in galerina-core-photonic; must resolve before implementation |

### galerina-core-photonic

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Governance-First Architecture section added; v0.2 Architecture Depth section added; **Coverage Reconciliation Status**: unresolved conflicts — OpticalTransportMode enum (3 incompatible 6-value variants), SPORE-PHOTONIC-001–006 diagnostic table (prior vs v0.2 meanings differ), boundary overlap with galerina-core-vector/galerina-core-compute/galerina-target-photonic; do not implement until all three conflicts resolved |
| TODO.md | ✅ | All governance types, functions, diagnostic codes, planned sub-packages added; **first three items**: "Reconcile canonical OpticalTransportMode enum", "Reconcile canonical SPORE-PHOTONIC-001–006 diagnostic table", "Confirm photonic ownership before implementation" |
| src/ | ⚠️ | Implementation stubs — planning layer only |
| Photonic compute plan | ✅ | Documented in KB — `native-photonic-compute-future.md` |
| Photonic resolution boundary | ✅ | Documented in KB — `photonic-resolution-boundary.md` |
| Governance architecture (prior KB) | ⚠️ | Specified in `galerina-core-photonic-backend-architecture.md` (OpticalTransportMode prior meanings, SPORE-PHOTONIC-001–006 prior meanings); not yet implemented |
| Governance architecture (v0.2 formal spec) | ⚠️ | Specified in `galerina-core-photonic-v02.md` (OpticalTransportMode 6-value enum, all validation functions, PhotonicCapability, topologies, SPORE-PHOTONIC-001–006 v0.2 meanings); not yet implemented |
| Real photonic backend | ❌ | Not yet — planning only until hardware available |

### galerina-framework-api-server

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Updated with v0.2 implementation spec (section 30) — all types, 10-step pipeline, security rules, HTTP status contract, may/must-not rules; **Coverage Reconciliation Status**: webhook HMAC, replay, and idempotency semantics must map to `galerina-core-network-webhook.md` v0.2 canonical; `ReplayStore.exists()/save()` are adapter-level names — canonical is `has()/put(ttlSeconds)` |
| TODO.md | ✅ | Architecture Depth items marked complete; full implementation items added for all 13 src files; **first two items**: "Map API-server ReplayStore.exists/save adapter names to galerina-core-network has/put", "Align webhook/idempotency implementation docs with galerina-core-network-webhook.md" |
| src/ | ❌ | Not yet implemented |
| API manifest schema | ✅ | v0.2: `LogicnApiManifest {schemaVersion:"galerina.api.manifest.v2", api, version, generatedAt, routes[]}` |
| Route manifest | ✅ | v0.2: `LogicnRouteManifest {id, handler, requestType?, responseType, policies:RoutePolicy[], body:BodyPolicy, limits:RouteLimits, reports:RouteReportPolicy, webhook?}` |
| Request handling pipeline | ✅ | v0.2 10-step pipeline: route match → reject unknown → body limit → normalize → webhook HMAC → kernel policies → decode → execute → map response |
| Webhook HMAC verification | ✅ | Fully specified: verifyHmacSha256Webhook, timingSafeHexEqual, extractSignature, assertWebhookVerified, assertWebhookNotReplayed; HMAC checked BEFORE JSON decoding |
| OpenAPI export | ✅ | `exportOpenApi(manifest)` → OpenAPI 3.1.0; bearerAuth/apiKeyAuth security schemes; :param path parameters; standard response codes |
| Error mapping | ✅ | `LogicnHttpError(status,code,message,safeDetails?)` — development includes safeDetails; production returns publicMessageForStatus(status) only; 17 HTTP status codes |
| Implementation spec | ✅ | Fully specified in `galerina-framework-api-server-implementation.md` (all types, all src files, 10-step pipeline, security rules) |

### galerina-framework-app-kernel

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — optional runtime enforcement layer; route-first/contract-first; request validation, security policy, rate-limiting, typed action routing, memory control, error containment, report generation; must not become a full web framework or MVC controller layer |
| src/ | ⚠️ | Boundary contracts defined; implementation not yet started |
| Position | ✅ | Documented: sits between Galerina Core and full frameworks; enforces language-described safety boundaries at runtime |
| Route contract enforcement | ✅ | Route declarations → typed actions/handlers → policies → effects → route reports |
| Response policy | ✅ | Status/body contracts, content types, cache rules, security header profiles, safe errors, safe cookies, safe redirects |

### galerina-ai

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — AI inference contracts, compute plans, model metadata, safety policy, AI review/report contracts, passive LLM cache policy, embedding cache policy, provider-neutral generation contracts; see `ai-compute-plan.md` KB |
| src/ | ⚠️ | Boundary contracts; implementation not started |
| AI compute plan | ✅ | Typed governed compute plans declaring input/output type, model class, data sensitivity, precision, latency target, compute target, memory needs, allowed tools, audit needs |
| Safety boundary | ✅ | AI output is untrusted by default; AI must not grant capabilities to itself or bypass policy/type/effect checks; AI review is advisory only |
| Passive LLM cache policy | ✅ | Provider-neutral cache policy, key material, typed output validation; must not own cache store implementation or secret scanning |

### galerina-ai-lowbit

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — low-bit AI inference contracts: 1-bit, 1.58-bit, 2-bit, 3-bit, 4-bit model references, ternary model weight declarations, BitNet backend compatibility, CPU reference fallback contracts, inference reports, safety diagnostics |
| src/ | ⚠️ | Boundary contracts; implementation not started |
| Backend role | ✅ | Declares intent via `compute target low_bit_ai` / `ternary_ai`; runtime selects backend (bitnet, cpu_reference); does not own model runtime or GPU backend |

### galerina-ai-agent

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — supervised AI agent contracts: `AgentDefinition`, `AgentToolPermission`, `AgentVisibilityScope`, `AgentMessageSchema`, `AgentDataExchangePolicy`, `AgentSecretPolicy`, `AgentMemoryPolicy`, `AgentCachePolicy`, `AgentSandboxPolicy`, `AgentLimits`, `AgentTaskGroupPlan`, `AgentResult`, `AgentMergePolicy`, `AgentReport` |
| src/ | ⚠️ | Boundary contracts; implementation not started |
| Multi-agent model | ✅ | Agents are untrusted workers by default; no direct access to files, env, secrets, databases, network, terminal, Git, other agents, deployment tools or LLM memory |

### galerina-ai-neural

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — neural network model contracts: `Model`, `Layer`, `Activation`, `LossFunction`, `Optimizer`, `Gradient`, `Embedding`, `InferenceResult`, `TrainingResult`, neural model reports, training/inference limits |
| src/ | ⚠️ | Boundary contracts; implementation not started |
| Dependencies | ✅ | Consumes vector/matrix/tensor from `galerina-core-vector`, compute planning from `galerina-core-compute`, AI safety from `galerina-ai`, low-bit references from `galerina-ai-lowbit` |

### galerina-ai-neuromorphic

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — neuromorphic and spiking event model contracts: `Spike`, `SpikeTrain`, `EventSignal<T>`, `SpikingModel`, `NeuromorphicPlan`, neuromorphic reports, event-driven inference plans |
| src/ | ⚠️ | Boundary contracts; implementation not started |
| Distinction | ✅ | Separate from neural networks: `galerina-ai-neural` = tensors/weights/layers/inference/training; `galerina-ai-neuromorphic` = spikes/events/event-driven spiking models |

### galerina-data

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Umbrella package — coordinates galerina-data-html, galerina-data-search, galerina-data-archive, galerina-data-json, galerina-data-database, galerina-data-pipeline, galerina-data-reports; shared data-processing vocabulary, pipeline policy, security boundaries, memory limits, archive integrity references, report index contracts |
| Boundary | ✅ | Must not become a browser engine, database engine, search engine, object storage implementation or scraping framework |

### galerina-data-db

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — umbrella typed database boundary contracts: database model flow contracts, typed query/command boundaries, safe response mapping, parameterised access policy, raw SQL denial policy, model permission integration, database archive references, report index contracts |
| Boundary | ✅ | Must not implement a database engine, ORM, migration tool or provider adapter |

### galerina-data-model

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: typed data model contracts consumed by database and query packages |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-data-query

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: typed query contracts consumed by database adapters (`galerina-db-*`) |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-data-response

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: safe response mapping contracts consumed by database adapters |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-data-html

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: `SafeHtml` contracts, HTML sanitization, unsafe HTML reports; consumed by `galerina-web` packages |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-data-search

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: typed search contracts; consumed by `galerina-db-opensearch` and similar |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-data-archive

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: archive integrity references and archive policy contracts |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-data-json

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: JSON validation and decoding contracts; owns typed JSON access and decode policy; consumed by `galerina-web` packages |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-data-database

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: database orchestration contracts that compose galerina-data-db, galerina-data-model, galerina-data-query and galerina-data-response |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-data-pipeline

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: data pipeline policy and streaming pipeline contracts |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-data-reports

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: data-layer report index and report shape contracts |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-web

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Umbrella — browser-safe Galerina web contracts: browser runtime profile boundaries, typed rendering pipeline ownership, shared web package policy, browser-safe imports and effects; coordinates galerina-web-render, -state, -components, -router, -events |
| Core rule | ✅ | Data received by the browser must be validated before it becomes UI; validate → type → sanitise → diff → render → report |
| Boundary | ✅ | Must not become a browser engine, JavaScript framework clone, CMS, admin UI, page builder or mandatory frontend framework |

### galerina-web-render

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: typed safe browser rendering contracts |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-web-state

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: client state, diff and hydration contracts |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-web-components

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: component boundary and prop contracts |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-web-router

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: browser route, navigation and link contracts |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-web-events

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: typed browser event contracts |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-db-postgres

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: future PostgreSQL adapter contract — must consume galerina-data-db, galerina-data-model, galerina-data-query and galerina-data-response; must not bypass typed models, validation, parameterisation, permissions, safe response mapping or reports |
| src/ | ❌ | Not yet implemented — future adapter |

### galerina-db-mysql

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: future MySQL adapter contract; same constraints as galerina-db-postgres |
| src/ | ❌ | Not yet implemented — future adapter |

### galerina-db-sqlite

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: future SQLite adapter contract |
| src/ | ❌ | Not yet implemented — future adapter |

### galerina-db-opensearch

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: future OpenSearch adapter contract; consumes galerina-data-search contracts |
| src/ | ❌ | Not yet implemented — future adapter |

### galerina-db-firestore

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: future Firestore adapter contract |
| src/ | ❌ | Not yet implemented — future adapter |

### galerina-target-cpu

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — CPU capability and fallback planning: architecture detection, x86-64/ARM64 capability descriptions, SIMD feature reports, threading policy, memory limits, CPU fallback reports, CPU AI inference target planning |
| src/ | ⚠️ | Boundary contracts; implementation not started |
| Boundary | ✅ | Does not implement kernels directly; optimized CPU kernel descriptions belong in `galerina-cpu-kernels`; AI model adapters belong in `galerina-ai` and `galerina-ai-lowbit` |

### galerina-cpu-kernels

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — optimized CPU kernel contracts: GEMM/GEMV kernel descriptions, vector dot product plans, matrix multiplication plans, low-bit operation contracts, ternary operation contracts, threading/tiling plans, cache-aware block sizes, embedding quantization planning, kernel benchmark reports |
| src/ | ⚠️ | Boundary contracts; implementation not started |
| Boundary | ✅ | Describes CPU kernels and constraints; does not own AI model metadata, target selection policy or Galerina language syntax |

### galerina-target-native

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: native target metadata, native artifact planning, platform triples, ABI requirements, native executable report format, native target constraints |
| src/ | ❌ | Not a v1 milestone; planning only — v1 milestone is the secure web runtime and `galerina serve` |

### galerina-target-js

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope: JavaScript/Node.js output target planning contracts; browser and edge runtime target metadata; output artefact planning |
| src/ | ⚠️ | Boundary contracts; implementation not started |

### galerina-target-wasm

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — WebAssembly target planning and output contracts: WASM target metadata, WASM module output planning, browser and edge runtime constraints, WASM import/export contracts, WASM target reports, fallback reports; consumes checked compiler/compute output |
| src/ | ⚠️ | Boundary contracts; WasmTarget extended contract specified in `galerina-core-compute` KB; implementation not started |

### galerina-target-gpu

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — GPU target planning and output contracts: GPU target metadata, GPU plan output, kernel mapping plans, precision/tolerance reports, data movement reports, GPU fallback reports, future CUDA/ROCm/WebGPU/Vulkan planning |
| src/ | ⚠️ | Boundary contracts; GpuPlan contract specified in `galerina-core-compute` KB; implementation not started |
| Boundary | ✅ | Consumes compute plans from `galerina-core-compute`; does not own vector semantics, compute target selection or application runtime policy |

### galerina-target-ai-accelerator

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — NPU, TPU, VPU, FPGA, AI ASIC and related accelerator target planning: capability reports, passive accelerator backend profiles, framework adapter planning, precision support, memory limit, HBM and multi-card topology reports, model operation mapping plans, fallback reports |
| src/ | ⚠️ | Boundary contracts; implementation not started |
| Terminology | ✅ | Vendor-neutral target classes preferred: `ai_accelerator`, `npu`, `tpu`, `vpu`, `fpga`, `asic` rather than vendor names |

### galerina-target-photonic

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — compiler target package for photonic hardware, photonic simulators, optical I/O interconnect planning: photonic backend plans, target capabilities, logic-to-photonic lowering plans, photonic simulation targets, photonic target/execution plan reports, optical I/O interconnect plans, data movement reports, topology-aware placement hints, remote memory safety reports, hardware mapping files, optical channel layout, matrix operation mapping |
| src/ | ⚠️ | Early scaffold — TypeScript boundary contracts only; no real photonic hardware backend |
| Status | ⚠️ | Boundary conflict with `galerina-core-photonic` (owns governance) and `galerina-core-vector` (proposed photonic contracts); see photonic ownership conflict in Version Conflict Notes |

### galerina-tools-benchmark

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — development and diagnostics package for testing Galerina logic, compute targets and runtime behaviour across machine profiles: Bool/Tri/Decision logic, Result/Option handling, CPU scalar/SIMD execution, GPU, low-bit AI, future accelerator targets, optical I/O interconnect targets |
| src/ | ⚠️ | Boundary contracts; implementation not started |
| Goal | ✅ | Not to find the fastest computer — to understand how Galerina behaves correctly and predictably across execution targets |

### galerina-devtools-project-graph

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — Galerina project knowledge graph contracts: project graph nodes, relationships, package ownership maps, document and decision links, policy and unsafe feature classification, report output manifests, AI assistant map files, graph query/path/explain request contracts, backend selection policy, workspace package/doc scanner, Markdown report and AI map rendering |
| dist/ | ✅ | CLI compiled and functional — generates `build/graph/Galerina_GRAPH_REPORT.md` |
| Graph CLI | ✅ | `galerina graph --out build/graph` generates graph report; stable Galerina surface: `Galerina graph`, project graph nodes and edges |

### galerina-framework-example-app

| Area | Status | Notes |
| --- | --- | --- |
| README.md | ✅ | Scope documented — bespoke application package: app entry files, routes, modules, tests, build configuration, app-specific source code |
| Boundary | ✅ | Must not contain Galerina language documentation, package design notes or reusable framework features |

---

## Summary: Remaining Gaps

### Priority 1 — Core Syntax (resolved)

```text
✅ Import / module system syntax — module-system-and-visibility.md
✅ Visibility (public / private) — module-system-and-visibility.md
```

### Priority 2 — Logic (resolved)

```text
✅ Error propagation through call chains — error-propagation-chains.md
```

### Priority 3 — Runtime (resolved)

```text
✅ CI/CD integration (OIDC, SLSA provenance, attestation workflow) — cicd-integration-and-provenance.md
✅ Runtime audit log format — runtime-audit-log-format.md
✅ Effect checker and boundary checker — effect-checker-and-boundary-checker.md
✅ Compile-time vs runtime authority — compile-time-vs-runtime-authority.md
```

### Priority 4 — Package Implementation (key gaps remaining)

Each entry below lists the KB references, the package status, and any blocking conflicts.

KB references in this section are under `docs/Knowledge-Bases/`. Manual source
check performed against the referenced KB files plus package README/TODO files
on 2026-05-25. Where package docs and KB files disagree, the entry calls that
out before implementation.

#### Remaining Action Index

| Package area | Next action | Blocking conflict |
| --- | --- | --- |
| `galerina-core-compiler` effect/boundary | Reconcile effect/boundary model and diagnostic-code meanings before implementation | README/TODO and KB specs use different effect/boundary shapes and code ranges |
| `galerina-core-compiler` manifest pass 14 | Bring package README/TODO up to pass-14 integrity/stable-serialization contract, then implement | `ManifestIntegrity`, `serializeManifestStable()`, and `buildManifestIntegrity()` are in pass-14 KB, not package README/TODO |
| `galerina-core-cli` build/verify/deploy/explain/plan | Finish build/verify and implement deploy/explain/plan command paths | None documented |
| `galerina-core-reports` audit/proof/denial/evidence/trace | Finalise package contracts and implementation for report schemas; add FlowTraceEvent contract and JSONL writer (SPORE-TRACE-001–005) | None documented |
| `galerina-core-compute` GPU/photonic/WASM/compat | Keep as planning until backend and target compatibility implementation starts | Photonic ownership and enum conflicts affect photonic plan output |
| `galerina-core-logic` Tri/Decision/Bool/Omni | Implement v0.2 canonical runtime contracts — TODO items corrected to canonical README shapes (2026-05-26) | KB alignment complete; v0.2 TODO items now use `kind:` discriminant, `value` fields, `UnknownReason`, 4-state Decision + evidence, correct OmniState snake_case literals |
| `galerina-core-config` environment/secrets/vault | Implement EnvironmentConfig v0.2, SecretEnvironmentReference loading/reporting, ConfigVault (SPORE-VAULT-001–005) — SecretConfigSource naming resolved (2026-05-26) | Canonical `SecretConfigSource`: `env\|vault\|kms\|runtime`; Config Vault and .env trust model KBs added |
| `galerina-core-security` secret/taint | Implement v0.2 secret reference model — ProtectedSecret unwrap API resolved (2026-05-26) | Canonical: `unwrapForApprovedSink(sink)`; `private revealUnsafeForRuntimeOnly()` internal only |
| `galerina-core-network` governance/webhook | Implement v0.2 contracts — legacy name audit complete (2026-05-26) | TODO corrected: `ReplayStore.insertOnce()` → `has/put(key,ttlSeconds)`, `IdempotencyStore.getOrSet()` → `get(key)/put(record,ttlSeconds?)` |
| `galerina-core-photonic` governance | Reconcile enum, diagnostic table and ownership before implementation | Three incompatible `OpticalTransportMode` forms and diagnostic tables |
| `galerina-core-vector` photonic proposal | Keep proposal-only until photonic ownership is resolved | Boundary conflict with `galerina-core-photonic` |
| `galerina-framework-api-server` implementation | Map adapter replay/idempotency names to network canonical contracts | `exists()/save()` differs from network `has()/put()` |

---

**galerina-core-compiler: effect checker and boundary checker**

- KB: `effect-checker-and-boundary-checker.md`, `galerina-core-effect-checker-v02.md`
- README/KB: Effect/CheckedFunction/EffectGraphNode/EffectGraph and boundary
  types are specified, but not yet reconciled into a single canonical checker
  model.
- Manual check: package README/TODO use the newer `EffectCategory` model
  (`network|database|filesystem|shell|process|secret|ai|gpu|native|custom`) and
  an expanded boundary model; `galerina-core-effect-checker-v02.md` still uses the
  older `Effect` enum and 5-value `BoundaryType`. The canonical KB
  `effect-checker-and-boundary-checker.md` also records fuller
  `EffectReference`/`BoundaryGraph` contracts and code meanings.
- Status: ⚠️ specified across sources, but implementation should first reconcile
  the checker model and diagnostic-code meanings into one package contract.

**galerina-core-compiler: manifest generation (pass 14)**

- KB: `galerina-core-manifest-generation-v02.md`, `galerina-core-compiler-manifest-generation-pass-14.md`
- README/KB: README covers RuntimeManifest v0.2 with RouteManifest/
  FunctionManifest/EffectManifest/BoundaryManifest; pass-14 KB adds
  ManifestIntegrity 5-hash type, serializeManifestStable(), and
  buildManifestIntegrity().
- Manual check: package README/TODO include `RuntimeManifest`, route/function/
  effect/boundary manifests, `buildManifest()`, and `validateManifest()`.
  `ManifestIntegrity`, `serializeManifestStable()`, and
  `buildManifestIntegrity()` are present in
  `galerina-core-compiler-manifest-generation-pass-14.md`, not in the package
  README/TODO yet.
- Status: ⚠️ fully specified in KB v0.2/pass-14 docs, but package README/TODO
  still need the integrity and stable-serialization contract before
  implementation.

**galerina-core-cli: galerina build, verify, deploy, explain, plan**

- KB: `galerina-core-cli-deploy-explain-plan.md`, `galerina-core-cli-v02.md`
- README: BuildArtefact/BuildResult/buildWorkspace, VerifiedArtefact/VerificationResult/verifyHash, DeploymentTarget 7 values, ExplainTrace/ExplainResult/buildTrace, ComputePlan/estimateTarget, exit codes 0–7
- Manual check: package README and TODO both cover build/verify/deploy/explain/
  plan; TODO items remain unchecked for completing build/verify and implementing
  deploy/explain/plan paths.
- Status: ⚠️ fully specified v0.2; build and verify partial, others not yet implemented

**galerina-core-reports: runtime audit log / execution proof / denials / evidence**

- KB: `runtime-audit-log-format.md`, `galerina-core-reports-v02.md`
- README: RuntimeAuditStatus v0.2, RuntimeAuditEvent v0.2, ExecutionProofHashes 5 hashes, DenialReport v0.2, all evidence types v0.2, validateAuditSafety
- Manual check: package README contains v0.2 report contracts, but still marks
  the current `ExecutionProof` form as v0.1 active until v0.2 is finalised; TODO
  keeps the v0.2 upgrades open.
- Status: ⚠️ fully specified v0.2, not yet finalised in package

**galerina-core-compute: GPU / photonic backends; WASM target; target compatibility**

- KB: `galerina-core-compute-gpu-and-photonic-backends.md`, `galerina-core-compute-v02.md`
- README: GpuSuitability/GpuPlan v0.2, OpticalNeed/OpticalPlan, WasmTarget extended with runtime+forbiddenEffects, CompatibilityLevel/Blockers/Warnings, TargetProfile, CompatibilityReport, shared ComputeWorkload/DataShape types
- Manual check: package README/TODO and both KBs match the broad v0.2 planning
  scope. TODO keeps the V1 freeze as CPU target selection plus compute planning
  only.
- Status: ⚠️ fully specified v0.2, planning only (v0.1 = CPU + compute planner only)

**galerina-core-logic: Tri logic, Decision logic, Bool boundary rules, Omni logic**

- KB (canonical): `galerina-core-logic-tri-decision-bool.md`, `galerina-core-logic-omni-logic.md`
- KB (superseded): `galerina-core-logic-v02.md` — ⚠️ Update status: type: discriminant, 3-state Decision; use package README as canonical
- KB (superseded): `galerina-core-logic-tristate-developer-guide.md` — ⚠️ Update status: predates v0.2; Decision shown as 3-state; use package README as canonical
- README: TriState v0.2 with value field + UnknownReason, Decision 4-state with review kind + DecisionEvidence, BoolBoundaryResult with diagnostics[] + reason, OmniState snake_case + OmniEvidence, omniToDecision→review; Coverage Reconciliation Status at top
- TODO first item: "Align older v0.2 KB/developer-guide examples with current README canonical kind/evidence/review shape"
- Manual check: canonical README and KBs align on 4-state Decision/review and
  evidence arrays, but the developer guide and later TODO items still include
  older examples such as `triUnknown(reason?)`, `{kind:"unknown", reason?}`,
  and older BoolBoundaryResult wording.
- Status: ⚠️ fully specified v0.2 (with breaking changes); v0.1 implementation = none

**galerina-core-config: environment config model; secret reference model**

- KB: `galerina-core-config-environment-secrets.md`, `galerina-core-config-v02.md`
- README: ConfigValue discriminated union, EnvironmentPolicy, defaultEnvironmentPolicy(), EnvironmentConfig v0.2 with schemaVersion, SecretEnvironmentReference v0.2, SecretConfigSource discriminated union, LoadEnvironmentConfigInput, loadEnvironmentConfig(), EnvironmentConfigReport, SecretReportValue
- Manual check (2026-05-26): SecretConfigSource naming conflict resolved — canonical `env|vault|kms|runtime`; `galerina-core-config-environment-secrets.md` updated; TODO updated. ConfigDiagnostic `name` field added to KB and implementation. Diagnostic codes renamed from `Galerina_CONFIG_*` to `SPORE-CONFIG-001…027` with `{code, name, message}` metadata. Config keeps `ProtectedSecret` as a simple interface; `galerina-core-security` owns the full class.
- Status: ✅ SecretConfigSource conflict resolved; implementation unblocked for EnvironmentConfig v0.2 and SecretEnvironmentReference loading/reporting

**galerina-core-security: secret reference model with taint tracking**

- KB (canonical): `galerina-core-security-secret-reference-model.md`
- KB (updated): `galerina-core-security-v02.md` — ✅ **conflict resolved (2026-05-26)** — `unwrapForApprovedSink(sink)` canonical; `private revealUnsafeForRuntimeOnly()` internal only; SecretSource renamed from `environment/file/secretStore/runtimeInjected` to `env/vault/kms/runtime|oauth|token`
- README: SecretSource discriminated union (env|vault|kms|runtime|oauth|token), SecretCategory 13 values, SecretRedactionPolicy, SecretReference v0.2, ProtectedSecret<T> full impl with unwrapForApprovedSink(sink), SecretSafeSink extended, SecretTaint, safeLog, buildAuthorizationHeader; Coverage Reconciliation Status updated to resolved
- TODO first item: checked off — ProtectedSecret API resolved (2026-05-26)
- Manual check (2026-05-26): all files aligned on `unwrapForApprovedSink(sink)` as the single public API; `revealUnsafeForRuntimeOnly()` marked private throughout.
- Status: ✅ ProtectedSecret conflict resolved; fully specified v0.2; implementation unblocked

**galerina-core-network: governance model**

- KB (canonical): `galerina-core-network-governance.md`, `galerina-core-network-webhook.md`
- KB (superseded): `galerina-core-network-v02.md` — uses sharedSecret field and has()/store(); superseded by webhook KB canonical names
- README: NetworkProtocol 7 values, NetworkPolicy with allowDestinations/denyDestinations/default, productionNetworkPolicy SSRF-safe, AiProviderNetworkPolicy/OPENAI_POLICY, GovernedNetworkRuntime, WebhookVerificationConfig v0.2, IdempotencyRecord with status field; Coverage Reconciliation Status at top
- TODO first item: "Audit docs for legacy ws/wss, sharedSecret, exists/save and has/store wording"; remaining TODO items still reference old names — must be updated during implementation
- Manual check: package README and `galerina-core-network-webhook.md` agree on
  `ReplayStore.has/put` and `IdempotencyStore.get/put(IdempotencyRecord)`.
  `galerina-core-network-v02.md` still uses legacy protocol/secret/store names,
  and `galerina-core-network-governance.md` also differs from the webhook KB for
  idempotency (`has/put(key)` instead of `get/put(record)`). Package TODO still
  contains older `insertOnce()/has()` and `getOrSet()` wording.
- Status: ⚠️ fully specified v0.2 (with breaking protocol changes), not yet implemented

**galerina-core-photonic: governance architecture**

- KB (legacy/historical): `galerina-core-photonic-backend-architecture.md` — ⚠️ Update status: prior 3-value OpticalTransportMode and original SPORE-PHOTONIC-001–006 meanings; historical context only
- KB (conflicting v0.2): `galerina-core-photonic-v02.md` — ⚠️ Update status: not implementation-ready; OpticalTransportMode 6-value enum conflicts with governance spec and vector spec; reconciliation required
- KB (governance spec): `galerina-core-photonic-governance-architecture.md` — DIRECT|WAVELENGTH|PACKETIZED|HYBRID|EMULATED|SIMULATED — also conflicts; see version conflict notes
- README: v0.2 Architecture Depth section added; Coverage Reconciliation Status (unresolved: enum, diagnostic table, package boundary)
- TODO first three items: "Reconcile canonical OpticalTransportMode enum", "Reconcile canonical SPORE-PHOTONIC-001–006 table", "Confirm ownership before implementation"
- Manual check: package README/TODO still contain both the prior 3-value
  `OpticalTransportMode` and a proposed v0.2 6-value enum after the warning
  block. Treat later implementation snippets as historical/proposed until the
  first three reconciliation TODOs are resolved.
- Status: ⚠️ prior and v0.2 both fully specified; NOT implementation-ready — 3 unresolved conflicts

**galerina-core-vector: photonic governance proposal**

- KB: `galerina-core-vector-photonic-governance.md` — OpticalTransportMode prior 3-value + v0.2 6-value "electrical"|"hybrid"|"photonic"|"waveguide"|"plasmonic"|"coherent", PhotonicCapability 6-value, PhotonicTopology 6-value, PhotonicRuntimeTarget/PhotonicExecutionPlan v0.2, all validation functions, SPORE-PHOTONIC-001–006 prior+v0.2, deny-by-default fallback, BOUNDARY CONFLICT documented
- ⚠️ Update status: proposal/reference note only — galerina-core-photonic owns final definitions after reconciliation
- README: Boundary conflict note + Coverage Reconciliation Status; vector does not own photonic runtime target semantics
- TODO first item: "Treat vector photonic governance notes as proposal-only until ownership reconciled"
- Manual check: package README still lists proposed photonic runtime contracts
  after the boundary warning. They remain proposal-only and must not be treated
  as owned implementation contracts for vector.
- Status: ⚠️ fully specified (both prior + v0.2); BOUNDARY CONFLICT must be resolved before implementation

**galerina-framework-api-server: full API server implementation**

- KB (prior): `galerina-api-boundary-architecture.md`
- KB (v0.2 formal spec): `galerina-framework-api-server-v02.md` (ReplayStore {exists/save} — differs from network package)
- KB (full impl spec): `galerina-framework-api-server-implementation.md` — ⚠️ Update status: ReplayStore.exists()/save() are adapter-level names; canonical contract is galerina-core-network has()/put(ttlSeconds)
- README: v0.2 implementation spec (section 30) with all types, 10-step pipeline, security rules, HTTP status contract; Coverage Reconciliation Status added
- TODO first two items: "Map API-server ReplayStore.exists/save adapter names to galerina-core-network has/put", "Align webhook/idempotency implementation docs with galerina-core-network-webhook.md"
- Manual check: package README, TODO, and full implementation KB still contain
  `ReplayStore.exists/save` in the implementation section after the warning.
  Those names are adapter-level until mapped or renamed to the network canonical
  `has/put` contract.
- Status: ⚠️ fully specified with complete implementation guide; not yet implemented; ReplayStore name mapping required before implementation

---

See `package-completion-status.md` for the full implementation order (Phase 1–4).

---

## 5. Implementation Build Scope

### Implementation Language and Bootstrap Strategy

**Two-stage bootstrap:**

**Stage 1 — Bootstrap runtime (current):** Plain JavaScript (`.js` files running directly
in Node.js, no build step, no compilation). The execution engine — parser, type checker,
interpreter, runtime kernel — is implemented as JavaScript. `galerina-core/compiler/galerina.js`
is the existing foundation and the correct shape for this stage. Stage 1 packages extend
that pattern: `.js` files that Node.js can `require` or `import` directly.

**Stage 2 — Self-hosted runtime:** Once the Stage 1 JavaScript runtime can compile and
execute Galerina programs, the runtime itself will be rewritten in Galerina's own
language/syntax. This is the self-hosting milestone.

See `bootstrap-runtime-roadmap.md` and `node-hosted-runtime-roadmap.md` for the full
stage plan (Node.js bootstrap → Neutral IR → Rust/WASM → Galerina self-hosted).

**Existing TypeScript files:** `galerina-core-cli`, `galerina-core-config` and
`galerina-core-logic` contain TypeScript files from earlier contract and tooling work. These
are the tooling and contract layer — not the runtime engine itself. They remain where they
are for now; the Stage 1 runtime engine grows from `compiler/galerina.js` outward. Whether
the tooling layer migrates to plain JavaScript or stays as TypeScript is a separate
decision made per package when implementation begins.

### Phase 1 Package Build Selection

Stage 1 runtime files are plain `.js` files that run directly in Node.js. No build step.
No compilation. `galerina-core/compiler/galerina.js` is the existing foundation and the model
for all Stage 1 runtime additions.

| Package | Decision | Stage 1 notes |
| --- | --- | --- |
| `galerina-core` | **Runtime foundation** | `compiler/galerina.js` is the Stage 1 root — parser, type checker, formatter prototype already in JavaScript; runtime engine grows from here; no `src/` directory needed |
| `galerina-core-cli` | **Include** | CLI tooling layer — 10 TypeScript files present from earlier contract work; `check` and `fmt` working; `build`, `verify`, `deploy`, `explain`, `plan` command bodies are the remaining gaps; language decision (keep TypeScript or migrate to `.js`) made when those commands are implemented |
| `galerina-core-config` | **Include (scope-limited)** | Config and policy layer — TypeScript implemented (`ProjectConfig`/`EnvironmentConfig`/`RuntimeConfigHandoff`/`ProductionStrictnessPolicy`/`loadConfigFromObjects`/`validateHostPackageManifestBoundary`); diagnostic codes renamed to SPORE-CONFIG-001…027; SecretConfigSource conflict resolved (2026-05-26) — v0.2 secret config surface now unblocked |
| `galerina-core-logic` | **Include (v0.1 extensions)** | Runtime logic layer — 418 lines TypeScript v0.1 numeric Tri (`Tri = -1\|0\|1`, `TriBoolPolicy`, generic `LogicState<N>`/`LogicDefinition<N>` framework); extend v0.1 with missing operations; v0.2 discriminated union rewrite is a separate milestone after self-hosting is achievable |
| `galerina-core-network` | **Add** | Runtime network layer — canonical v0.2 contracts in `galerina-core-network-webhook.md` are clean and unblocked (`WebhookRequest`/`WebhookResponse`, `IdempotencyRecord`, `ReplayStore.has/put`, `IdempotencyStore.get/put(IdempotencyRecord)`); high-value dependency for `galerina-framework-api-server`; no blocking conflicts |

### Surfaces Deferred from Phase 1

| Surface | Package | Reason |
| --- | --- | --- |
| `SecretConfigSource` / `SecretEnvironmentReference` / `loadEnvironmentConfig` | `galerina-core-config` | **Resolved (2026-05-26)** — canonical: `env\|vault\|kms\|runtime`; KB and TODO updated; implementation unblocked |
| `ProtectedSecret<T>` unwrap API | `galerina-core-security` | **Resolved (2026-05-26)** — canonical: `unwrapForApprovedSink(sink)`; `private revealUnsafeForRuntimeOnly()` internal only; KB and TODO updated |
| `OpticalTransportMode` / SPORE-PHOTONIC diagnostic codes | `galerina-core-photonic` | Three incompatible 6-value enums; diagnostic code meanings differ across prior KB, v0.2 formal and vector spec |
| v0.2 `TriState` / `Decision` / `BoolBoundaryResult` / `OmniState` discriminated unions | `galerina-core-logic` | Phase 1 ships v0.1 extensions; v0.2 rewrite is a separate milestone |
| `ReplayStore.exists/save` adapter name mapping | `galerina-framework-api-server` | Must be mapped to canonical `has/put(ttlSeconds)` before implementation can proceed |
| `src/` contracts | `galerina-core` | No `src/` directory; no shared base contracts defined; deferred to a later pass |

---

## Knowledge Base File Count

Total KB files: ~222 (CEC examples) | 312 KB documents (13 marked superseded, 13 marked future/aspirational)

Phase 18-23 complete: NodeFlags, ValueStateFlags, GovernanceFlags, EffectCheckerFlags, TypeId, EffectFlags, RuntimeManifest, WAT emitter skeleton, TypedArray lowering plans, GPU/NPU/APU plans, Register VM types, StringView/BytesView/TensorView. New architecture KB docs added (2026-05-31): stdlib-registry, runtime-interpreter-roadmap, gir-emitter-architecture, explicitness-principles, type-checker-architecture, effect-checker-architecture, value-state-checker-architecture, governance-verifier-architecture, package-resolver-architecture, architecture-high-roi-ideas. New implementation files: stdlib-registry.ts, wat-emitter.ts, lowering-plan.ts, gpu-plan.ts, register-vm.ts, views.ts, boundary-graph.ts.

Workspace graph stats (build/graph/Galerina_GRAPH_REPORT.md, generated 2026-05-25T20:05:39Z):
Packages: 54 | Documents: 708 | Types/interfaces: 376 | Functions: 154 | Relationships: 2176

| Area | Files | Coverage |
| --- | --- | --- |
| Syntax | ~33 core files | Strong — module/visibility, if/match/Optional rules, loop/iteration model, primitive obsession design principle |
| Logic | ~39 core files | Strong — error propagation covered; Tri/Decision/Bool v0.2 discriminated unions (UnknownReason, 4-state Decision, DecisionEvidence); Omni logic (OmniEvidence); developer guide |
| Runtime | ~75 core files | Strong — CI/CD, audit log v0.2 (JSONL + execution proof + denials + evidence), effects, boundaries; v0.2 formal spec KBs + pass-14 manifest update (ManifestIntegrity, permissions[], serializeManifestStable); Phase 18-23 complete (NodeFlags, ValueStateFlags, GovernanceFlags, EffectCheckerFlags, TypeId, EffectFlags, RuntimeManifest, WAT emitter, TypedArray lowering, GPU/NPU/APU plans, Register VM, StringView/BytesView/TensorView) |
| AI/Compute | ~19 files | Strong — GPU/photonic/WASM/compatibility v0.2 architecture; PhotonicPlan explicit type; photonic governance architecture spec |
| Cross-cutting | ~39 files | Strong — CLI v0.2, config v0.2, network v0.2 (tcp/udp, NetworkPolicy redesign), security v0.2, API boundary architecture; online safety act policy, security secret ref model, api server implementation spec; network webhook KB + vector photonic governance KB |
| Architecture | ~4 files | Strong |

---

## Version Conflict Notes

The following conflicts are documented as unresolved. Do not implement the conflicting items until the conflict is decided.

**OpticalTransportMode**

```text
prior KB        = "photonic"|"electrical"|"hybrid"                                     (3-value string union)
v0.2 (x10)      = Waveguide|Coherent|Mesh|FreeSpace|Hybrid|Experimental               (6-value enum)
governance (x16) = DIRECT|WAVELENGTH|PACKETIZED|HYBRID|EMULATED|SIMULATED              (6-value enum, different names)
vector (28.txt)  = "electrical"|"hybrid"|"photonic"|"waveguide"|"plasmonic"|"coherent" (6-value, different again)

UNRESOLVED: three incompatible 6-value enums; must be reconciled before implementation
```

**SPORE-PHOTONIC diagnostic codes**

```text
prior KB = 001 unavailable, 002 denied by policy, 003 scheduler unavailable,
           004 fallback occurred, 005 unsupported target, 006 invalid graph
v0.2     = 001 isolation missing, 002 propagation exceeded, 003 experimental prohibited,
           004 invalid topology, 005 non-deterministic, 006 unsafe hybrid
28.txt   = 001 invalid transport mode, 002 invalid capability, 003 invalid topology,
           004 target validation failed, 005 plan validation failed, 006 deterministic violation
```

**Photonic package ownership**

```text
galerina-core-vector README says photonic belongs in galerina-core-photonic
28.txt proposes OpticalTransportMode/PhotonicRuntimeTarget/PhotonicExecutionPlan in galerina-core-vector

BOUNDARY CONFLICT — unresolved
```

**TriState discriminant**

```text
x6 (v0.2 runtime spec) = type:"TRI_TRUE"/"TRI_FALSE"/"TRI_UNKNOWN"
x12 (developer guide)  = kind:"true"/"false"/"unknown"
downloaded update       = kind:"true"|"false"|"unknown" with value: true/false  ← canonical
```

**Decision state count**

```text
x6/x12         = 3-state (allow/deny/unknown)
downloaded update = 4-state (allow/deny/review/unknown) — review is a breaking addition  ← canonical
```

**WebhookVerificationConfig**

```text
network package (x9) = sharedSecret field
api server (x11/x17) = secret field
24.txt/28.txt v0.2   = secret: string | Uint8Array  ← canonical (galerina-core-network-webhook.md)
```

**ReplayStore**

```text
network package (x9) = has()/store()
api server (x11/x17) = exists()/save()
24.txt/28.txt v0.2   = has()/put(key, ttlSeconds)  ← canonical (galerina-core-network-webhook.md)
```

**IdempotencyStore**

```text
network package (x9) = has()/put() with no IdempotencyRecord
24.txt/28.txt v0.2   = get()/put(IdempotencyRecord) with status field  ← canonical
```

**ProtectedSecret** ✅ resolved (2026-05-26)

```text
Canonical: class ProtectedSecret<T> with unwrapForApprovedSink(sink)
           private revealUnsafeForRuntimeOnly() — internal runtime use only

galerina-core-security-v02.md     updated — unwrapForApprovedSink(sink) canonical
galerina-core-security/README.md  updated — Coverage Reconciliation Status resolved
galerina-core-security/TODO.md    updated — decision item checked off
```

**SecretSource / SecretConfigSource** ✅ resolved (2026-05-26)

```text
Canonical SecretConfigSource (galerina-core-config):
    "env" | "vault" | "kms" | "runtime"                                        (4 values)

Canonical SecretSource (galerina-core-security adds auth-layer sources):
    "env" | "vault" | "kms" | "runtime" | "oauth" | "token"                   (6 values)

galerina-core-config-environment-secrets.md  updated — SecretConfigSource env|vault|kms|runtime
galerina-core-config/TODO.md                 updated — SecretConfigSource line corrected
galerina-core-security-v02.md               updated — "environment" renamed to "env"; file/secretStore/runtimeInjected removed
galerina-core-security/README.md             updated — SecretSource canonical names
galerina-core-security/TODO.md               updated — SecretSource item corrected
```

**NetworkProtocol**

```text
v02 KB (x9)        = http/https/ws/wss/grpc/quic                               (6 values)
downloaded update  = http/https/tcp/udp/grpc/websocket/quic                    (7 values — ws/wss→websocket, adds tcp/udp)  ← canonical
```

---

## Documentation Update Pass (2026-05-25)

### Package docs updated

- `packages-galerina/galerina-core/docs/README.md`
- `packages-galerina/galerina-core/docs/package-boundaries.md`
- `packages-galerina/galerina-core/docs/webhooks.md`
- `packages-galerina/galerina-core/docs/tri-logic.md`
- `packages-galerina/galerina-core/docs/omni-logic.md`
- `packages-galerina/galerina-core/docs/backend-compute-support-targets.md`
- `packages-galerina/galerina-core-photonic/README.md`
- `packages-galerina/galerina-core-vector/README.md`
- `packages-galerina/galerina-core-logic/README.md`
- `packages-galerina/galerina-core-network/README.md`
- `packages-galerina/galerina-framework-api-server/README.md`
- `packages-galerina/galerina-core-security/README.md`
- `packages-galerina/galerina-core-photonic/TODO.md`
- `packages-galerina/galerina-core-vector/TODO.md`
- `packages-galerina/galerina-core-logic/TODO.md`
- `packages-galerina/galerina-core-network/TODO.md`
- `packages-galerina/galerina-framework-api-server/TODO.md`
- `packages-galerina/galerina-core-security/TODO.md`

### Workspace docs updated

- `docs/ARCHITECTURE.md` — references COVERAGE.md as conflict register; names photonic/logic as unresolved
- `docs/REQUIREMENTS.md`
- `docs/TASKS.md`
- `docs/CHANGELOG.md` — [Unreleased] entry: coverage-driven documentation reconciliation

### KB files annotated with ⚠️ Update status

- `galerina-core-network-v02.md` — superseded; uses sharedSecret/ws/wss/has()/store(); replaced by galerina-core-network-webhook.md canonical names
- `galerina-core-logic-v02.md` — formal spec (type: discriminant); superseded by package README
- `galerina-core-logic-tristate-developer-guide.md` — predates v0.2 kind: form; use package README as canonical
- `galerina-core-photonic-v02.md` — not implementation-ready; OpticalTransportMode conflict
- `galerina-core-photonic-backend-architecture.md` — legacy/historical; prior 3-value enum + prior diagnostic codes
- `galerina-core-vector-photonic-governance.md` — proposal/reference note; galerina-core-photonic owns final definitions
- `galerina-core-security-v02.md` — **updated (2026-05-26)**: canonical `unwrapForApprovedSink(sink)`; SecretSource canonical names; no longer stale
- `galerina-framework-api-server-implementation.md` — adapter-level ReplayStore names; canonical is network has/put

### Summary of changes

- Added coverage reconciliation status to 6 package READMEs and 6 package TODOs.
- Added ⚠️ Update status annotations to 8 KB files with conflicting or outdated content (including galerina-core-network-v02.md as superseded).
- Added galerina-core/docs/* ownership and canonical-contract sections (6 files).
- ARCHITECTURE.md now references COVERAGE.md as workspace conflict register.
- Marked photonic enum/diagnostic/ownership conflicts as not implementation-ready.
- Marked galerina-core-logic README and tri-decision-bool KB as current runtime-facing canonical shape.
- Marked network webhook v0.2 as canonical for webhook/replay/idempotency.
- Marked ProtectedSecret reveal/unwrap API as unresolved — do not implement until decided. (**Resolved 2026-05-26**: canonical `unwrapForApprovedSink(sink)`; see Version Conflict Notes.)
- Added follow-up TODO items for all 6 packages with unresolved conflicts.

### Workspace stats (build/graph/Galerina_GRAPH_REPORT.md, generated 2026-05-25)

```text
Packages: 54 | Documents: 708 | Types/interfaces: 376 | Functions: 154 | Relationships: 2176
```
