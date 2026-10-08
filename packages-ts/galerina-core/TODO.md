# Galerina TODO

> Current sequencing: root [work register](../../docs/PRE-FUNGI-WORK-REGISTER-2026-09-22.md)
> (W15 security continuation, CONST constitution discussion draft). This package
> checklist is historical language-core planning.
>
> 2026-10-05 W01 inventory of every open row against the register:
> [galerina-core-todo-w01-inventory-2026-10-05](../../docs/reports/galerina-core-todo-w01-inventory-2026-10-05.md)
> (73 rows are real work no register lane names; listed there with next actions).

This document lists the working TODO items for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

Use this file as a practical checklist while the project moves from concept to documentation, prototype and implementation.

---

## V1 Package Freeze And Core Focus

```text
[x] Freeze non-essential package expansion while core syntax and grammar are defined
    src/v1-scope-contract.ts admitV1CorePackage / V1_POST_DOMAIN_PACKAGES (image, video, search, text_ai, device, flutter_ui refuse as v1-core). SuperGrok 2026-10-08
[x] Keep v1 target scope to CPU and WASM
    src/v1-scope-contract.ts V1_ADMITTED_TARGETS cpu|wasm; admitV1CoreTarget. SuperGrok 2026-10-08
[x] Treat GPU, AI accelerator, photonic, optical I/O and domain packages as post-v1
    src/v1-scope-contract.ts V1_POST_TARGETS; classifyV1Scope returns post_v1. SuperGrok 2026-10-08
[HOLD] Work actively on core syntax, grammar and logic semantics -- SuperGrok 2026-10-08e: standing process row, not a discrete closed case. v1 catalogs continue in src/v1-scope-contract.ts; parser/grammar work stays with core-compiler.
[ ] Commit the hybrid ownership memory-safety model
[x] Finalise Bool, Tri, Decision, Option and Result semantics
    src/v1-scope-contract.ts admitV1CoreLogicType / V1_CORE_LOGIC_TYPES Bool|Tri|Decision|Option|Result (Decimal/Float/Verdict/Int refuse). SuperGrok 2026-10-08b
[x] Add at least 20 real .fungi examples for the v1 syntax subset
[ ] Build parser coverage for those examples
[x] Reject post-v1 syntax with clear diagnostics
    src/v1-scope-contract.ts admitV1SyntaxFamily (cpu|wasm admitted; dart/wavelength/onnx/DOM/gpu/image refuse Galerina_CORE_V1_SYNTAX_POST). SuperGrok 2026-10-08b
[x] Use docs/language-core-maturity-roadmap.md as the maturity checklist before
    claiming production maturity
    src/v1-scope-contract.ts claimProductionMaturity (claimed true always refuses; checklist path must match). SuperGrok 2026-10-08
```

---

## Status Key

```text
[ ] Not started
[/] In progress
[x] Complete
[!] Blocked
[?] Needs decision
```

---

## Immediate TODO

```text
[x] Create README.md
[x] Create ABOUT.md
[x] Create CONCEPT.md
[x] Create LICENCE.md
[x] Create LICENSE
[x] Create REQUIREMENTS.md
[x] Create DESIGN.md
[x] Create TASKS.md
[x] Create TODO.md
[x] Create ROADMAP.md
[x] Create ARCHITECTURE.md
[x] Create SECURITY.md
[x] Create AI-INSTRUCTIONS.md
[x] Create CHANGELOG.md
[x] Create GETTING_STARTED.md
[x] Create DEMO_hello_WORLD.md
[x] Create NOTICE.md
[x] Create CONTRIBUTING.md
[x] Create CODE_OF_CONDUCT.md
[x] Create GIT.md
[x] Create COMPILED_APP_GIT.md
[x] Create SPEC.md
[x] Create GOVERNANCE.md
[x] Create OMNI_LOGIC.md
[x] Create COMPATIBILITY.md
[x] Create docs/legacy-and-compatibility-boundaries.md
[x] Create docs/package-boundaries.md
[x] Create docs/security-risk-feature-ranking.md
[x] Create packages-ts/galerina-framework-api-server README and positioning docs
[x] Create .env.example
[x] Create .gitignore
```

---

## Missing Files to Add

The original requested bundle included:

```text
README.md
ABOUT.md
CONCEPT.md
LICENCE.md
REQUIREMENTS.md
DESIGN.md
TASKS.md
TODO.md
ARCHITECTURE.md
SECURITY.md
AI-INSTRUCTIONS.md
CHANGELOG.md
GETTING_STARTED.md
DEMO_hello_WORLD.md
.env.example
.gitignore
docs/
```

Current syntax/target documentation additions:

```text
[x] Add docs/dart-flutter-target.md
[x] Add docs/sytax/async-dart-flutter.md
[x] Add docs/sytax-examples/async-dart-flutter.md
[x] Implement parser support for async flow
[ ] Implement await-outside-async diagnostics
[HOLD] Implement target dart report/output support
[HOLD] Implement target flutter package report/output support
[HOLD] Implement Bytes to Dart.Uint8List interop checks
[HOLD] Implement Dart type mapping report for Flutter targets
[HOLD] Implement Flutter package/plugin layout generation
[HOLD] Implement platform channel parser/report support
[HOLD] Implement Pigeon-style typed platform API generation or equivalent schema output
[HOLD] Implement permission metadata reports for Flutter package/plugin targets
[HOLD] Implement flutter-ffi target planning and unsupported-platform diagnostics
[HOLD] Implement source maps from generated Dart/native bindings back to .fungi files
[HOLD] Defer Flutter UI component syntax until Dart package, FFI and platform-channel layers are stable
[x] Add docs/javascript-typescript-framework-targets.md
[x] Add docs/sytax/js-ts-framework-targets.md
[x] Add docs/sytax-examples/js-ts-framework-targets.md
[HOLD] Implement target javascript ESM report/output support
[HOLD] Implement TypeScript declaration output for framework-facing exports
[HOLD] Implement target node report/output support
[HOLD] Implement browser/Node WASM bridge reports
[HOLD] Implement client_safe, server_only and worker_safe export markers
[HOLD] Implement client/server split diagnostics for forbidden effects
[HOLD] Implement worker-safe export diagnostics for clone/transfer unsafe data
[HOLD] Implement React adapter manifest/hook/client generator as package output
[HOLD] Implement React Native adapter manifest/hook/client/native-boundary generator as package output
[HOLD] Implement Angular adapter manifest/service/client generator as package output
[HOLD] Implement framework-adapter-manifest.json
[x] Add docs/device-capability-boundaries.md
[x] Add docs/sytax/device-capability-boundaries.md
[x] Add docs/sytax-examples/device-capability-boundaries.md
[HOLD] Implement device permission/effect boundary checks
[HOLD] Implement device-capability-report.json
[HOLD] Implement device-privacy-report.json
[HOLD] Implement native device boundary diagnostics
[HOLD] Implement mobile-native target planning without mobile framework syntax
[x] Keep camera, microphone, Bluetooth, GPS, notifications, media players and mobile UI out of Galerina core
    src/v1-scope-contract.ts EXCLUDED_FROM_CORE; admitV1CorePackage refuses. SuperGrok 2026-10-08
[x] Add docs/text-ai-package-boundaries-and-compute-auto.md
[x] Add docs/sytax/text-ai-package-boundaries.md
[x] Add docs/sytax-examples/text-ai-package-boundaries.md
[HOLD] Define text_policy parser/report support
[HOLD] Define token_policy parser/report support
[HOLD] Define prompt_safety policy report support
[HOLD] Define text_redaction policy report support
[HOLD] Define generated-text-not-executable diagnostics
[HOLD] Define token-report.json schema
[HOLD] Define text-security-report.json schema
[HOLD] Define text-package-target-report.json schema
[x] Keep summarisation, generation, embeddings, moderation, translation and NLP tasks out of Galerina core
    src/v1-scope-contract.ts EXCLUDED_FROM_CORE; admitV1CorePackage refuses. SuperGrok 2026-10-08
[x] Add docs/auth-token-verification-boundaries.md
[x] Add docs/sytax/auth-token-verification.md
[x] Add docs/sytax-examples/auth-token-verification.md
[x] Define auth_policy parser/report support
    src/v1-scope-contract.ts admitV1AuthPolicyFamily bearer|jwt|oauth2|proof_of_possession|capability_tokens|reports; hardware_proof post-v1. SuperGrok 2026-10-08g
[x] Define auth_provider parser/report support
    admitV1AuthProviderType oauth2 only; identity_provider/oidc_provider/login_product excluded. SuperGrok 2026-10-08g
[x] Define JWT verification diagnostics and token report fields
    admitV1JwtAlgorithm RS256|ES256|EdDSA, none denied; admitV1JwtDiagnostic closed set; token_report in admitV1AuthReport. SuperGrok 2026-10-08g
[x] Define bearer-token SecureString and logging diagnostics
    admitV1AuthTokenKind bearer|jwt; admitV1BearerDiagnostic logged|local_storage|client_safe|missing_expiry. SuperGrok 2026-10-08g
[x] Define OAuth issuer, audience, scope, JWKS and PKCE policy checks
    admitV1OauthCheck issuer|audience|scope|jwks|pkce. SuperGrok 2026-10-08g
[x] Define DPoP and mTLS proof-of-possession checks
    admitV1ProofOfPossession dpop|mtls. SuperGrok 2026-10-08g
[x] Define request proof envelope parser/report support
    admitV1ProofConstraint bind_method|bind_path|bind_body|replay_cache|nonce; request_proof_report. SuperGrok 2026-10-08g
[x] Define capability token workflow report support
    admitV1CapabilityConstraint bind_action|bind_resource|bind_request_hash|nonce; capability_token_report. SuperGrok 2026-10-08g
[x] Define nonce/replay-cache diagnostics for sensitive routes
    replay_cache and nonce are admitted proof constraints. SuperGrok 2026-10-08g
[ ] Define post-quantum and hybrid crypto policy report support
[ ] Define experimental hardware proof policy flags
[x] Define auth, token, proof and crypto policy AI guide summaries
    admitV1AuthReport includes ai_guide; crypto_policy_report stays refused with PQ/hardware Open. SuperGrok 2026-10-08g
[x] Keep identity providers, login products, MFA products and new crypto algorithms out of Galerina core
    src/v1-scope-contract.ts EXCLUDED_FROM_CORE; admitV1CorePackage refuses. SuperGrok 2026-10-08
[x] Add docs/api-data-security-and-load-control.md
[x] Add docs/sytax/api-data-security-and-load-control.md
[x] Add docs/sytax-examples/api-data-security-and-load-control.md
[ ] Define api_policy parser/report support
[ ] Define route body policy parser/report support
[ ] Define route limits parser/report support
[ ] Define route memory budget parser/report support
[ ] Define route queue handoff parser/report support
[ ] Define content-type mismatch diagnostics
[ ] Define strict API body decode diagnostics
[ ] Define unknown-field and duplicate-key API diagnostics
[ ] Define unsafe API coercion diagnostics
[ ] Define trusted proxy and X-Forwarded-For diagnostics
[ ] Define request-scoped body reference lifetime diagnostics
[ ] Define large-body streaming diagnostics
[ ] Define route concurrency and connection pool alignment warnings
[ ] Define API security, API memory and load-control report schemas
[ ] Define API data boundary AI guide summaries
[x] Keep web frameworks, load balancers, API gateways, queue backends and rate-limit stores out of Galerina core
    src/v1-scope-contract.ts EXCLUDED_FROM_CORE; admitV1CorePackage refuses. SuperGrok 2026-10-08
[x] Add docs/api-duplicate-detection-and-idempotency.md
[x] Add docs/sytax/api-duplicate-detection-and-idempotency.md
[x] Add docs/sytax-examples/api-duplicate-detection-and-idempotency.md
[ ] Define duplicate route detection diagnostics
[ ] Define duplicate route name diagnostics
[ ] Define duplicate API type shape warnings
[ ] Define intentionally_same_shape_as parser/check support
[ ] Define API manifest output schema
[ ] Define duplicate API report schema
[ ] Define idempotency block parser/report support
[ ] Define idempotency exception parser/report support
[ ] Define effect-based idempotency recommendations
[ ] Define idempotency payload mismatch diagnostics
[ ] Define webhook duplicate event diagnostics
[ ] Define duplicate external_api client diagnostics
[ ] Define outbound duplicate payload warning support
[ ] Define API version conflict diagnostics
[ ] Define API duplicate/idempotency AI guide summaries
[x] Keep fixed routers, controller frameworks, middleware stacks, API gateways and idempotency storage backends out of Galerina core
    src/v1-scope-contract.ts EXCLUDED_FROM_CORE; admitV1CorePackage refuses. SuperGrok 2026-10-08
```

Additional recommended files:

```text
LICENSE
NOTICE.md
ROADMAP.md
CONTRIBUTING.md
CODE_OF_CONDUCT.md
GIT.md
COMPILED_APP_GIT.md
TRADEMARKS.md
docs/dependencies.md
docs/glossary.md
docs/pending-additions.md
docs/pending-galerina-additions.md
```

Reason for additions:

| File | Reason |
|---|---|
| `LICENSE` | Required for GitHub to detect Apache-2.0 correctly |
| `NOTICE.md` | Important for Apache-2.0 attribution notices |
| `ROADMAP.md` | Helps explain future project direction |
| `CONTRIBUTING.md` | Helps others contribute correctly |
| `CODE_OF_CONDUCT.md` | Useful for open-source community standards |
| `GIT.md` | Git workflow for the Galerina project itself |
| `COMPILED_APP_GIT.md` | Git/deployment guidance for compiled Galerina apps |
| `TRADEMARKS.md` | Helps protect Galerina name/identity later |
| `docs/dependencies.md` | Tracks third-party dependency licences |
| `docs/glossary.md` | Explains Galerina terminology |

---

## Naming TODO

```text
[x] Decide language short name: Galerina
[x] Decide full meaning: Galerina
[x] Decide file extension: .fungi
[?] Decide whether the entry file should always be boot.fungi
[?] Decide whether main.fungi should be aLOwed as an alternative entry file
[?] Decide whether project config should live inside boot.fungi or Galerina.config
[?] Decide whether command name should be Galerina
[?] Decide whether package namespace should be Galerina/*
[x] Decide that flow remains the function-like behaviour keyword
```

---

## Documentation TODO

```text
[x] Review README.md for repeated sections
[x] Add final project file tree to README.md
[x] Add Apache-2.0 licence notice to README.md
[x] Add JSON-native examples to README.md
[x] Add API-native examples to README.md
[x] Add webhook examples to README.md
[x] Add GPU target explanation to README.md
[x] Add photonic target explanation to README.md
[x] Add AI context explanation to README.md
[x] Add Galerina explain --for-ai explanation to README.md
[x] Add source-map explanation to README.md
[x] Add build-once deploy-many explanation to README.md
[x] Add compiled app Git guidance reference to README.md
[x] Add Omni-logic direction to README.md
[x] Add diagnostics and memory recovery direction to README.md
[x] Add docs/generated-output-and-runtime-ergonomics.md
[x] Add docs/pending-additions.md
[x] Add docs/pending-galerina-additions.md
[x] Add run-mode generated output docs
[x] Check README for prototype status clarity
```

---

## Formal Files TODO

```text
[x] Add SPEC.md
[x] Add GOVERNANCE.md
[x] Add COMPATIBILITY.md
[x] Add docs/ai-token-reduction.md
[x] Add docs/error-codes.md
[x] Add docs/contracts.md
[x] Add docs/modules-and-visibility.md
[x] Add docs/standard-library.md
[x] Add docs/package-use-registry.md
[x] Add docs/package-boundaries.md
[x] Add docs/language-supported-primitives.md
[x] Add docs/language-non-supported-primitives.md
[x] Add docs/search-and-translation-provider-boundaries.md
[x] Add docs/video-package-boundaries-and-compute-auto.md
[x] Add docs/browser-dom-and-web-platform-primitives.md
[x] Add docs/image-ai-package-boundaries-and-compute-auto.md
[x] Add docs/safe-pattern-matching-and-regex.md
[x] Add docs/sytax/README.md
[x] Add docs/sytax/patterns-and-regex.md
[x] Add docs/sytax-examples/README.md
[x] Add docs/sytax-examples/patterns-and-regex.md
[x] Add docs/memory-and-variable-use.md
[x] Add docs/lazy-compact-json.md
[x] Add docs/pure-flow-caching.md
[x] Add docs/memory-pressure-and-disk-spill.md
[x] Add docs/omni-logic.md
[x] Add docs/generated-output-and-runtime-ergonomics.md
[x] Add docs/pending-additions.md
[x] Expand SPEC.md into official language rules
[x] Expand COMPATIBILITY.md with version compatibility policy
```

---

## Development Commands TODO

```text
[x] Document generated outputs in Run Mode and Dev Mode
[x] Document unified Galerina dev command
[x] Document startup validation before main()
[x] Implement Galerina run --generate
[x] Implement Galerina generate
[x] Implement Galerina dev
[x] Implement Galerina dev --watch
```

---

## Omni-Logic and Diagnostics TODO

```text
[x] Add OMNI_LOGIC.md
[x] Add docs/omni-logic.md
[x] Add docs/logic-widths.md
[x] Add docs/logic-targets.md
[x] Add docs/hybrid-logic-and-wavelength-compute.md
[x] Add docs/memory-error-correction.md
[x] Add docs/warnings-and-diagnostics.md
[x] Add docs/system-health-warnings.md
[x] Add docs/disk-memory-and-cache-warnings.md
[x] Add docs/error-codes.md
[x] Define standard warning/error/fatal diagnostic code format in schemas
[x] Add memory pressure warning examples to compiler output
[x] Add disk spill warning examples to compiler output
[x] Add bad memory / memory integrity failure examples
[x] Add target fallback warning examples
[x] Add logic-width target compatibility checks
[x] Add Omni-logic simulation target planning
```

---

## Concept TODO

```text
[x] Define strict types as core concept
[x] Define memory safety as core concept
[x] Define security-first defaults as core concept
[x] Define JSON-native design
[x] Define API-native design
[x] Define webhook optimisation
[x] Define GPU as first-class target concept
[x] Define photonic plan target
[x] Define ternary simulation target
[x] Define source maps
[x] Define AI context files
[x] Define Galerina explain --for-ai
[x] Define .env outside compiled output
[x] Define build-once deploy-many
[x] Refine exact difference between Decision and Tri
[x] Refine exact difference between api, webhook and service blocks
[x] Refine exact compute block restrictions
[x] Refine first practical implementation target
```

---

## Syntax TODO

```text
[x] Decide comment syntax
[x] Define strict comment syntax with `/// @tag value`
[x] Extract strict comments into AI context
[x] Warn on obvious strict comment mismatches
[x] Decide import vs use direction
[x] Decide final import syntax
[HOLD] Decide module syntax
    Owner/Codex language-contract decision remains open. Visibility catalog private|module|package|public pinned by admitV1Visibility. SuperGrok 2026-10-08c
[/] Decide package syntax
[x] Decide type syntax
[x] Decide enum syntax
[x] Decide flow syntax
[x] Decide secure flow syntax
[x] Decide pure flow syntax
[x] Decide effects syntax
[x] Start per-feature syntax files under docs/sytax
[x] Document Pattern and UnsafeRegex syntax in docs/sytax
[x] Start per-feature syntax example files under docs/sytax-examples
[x] Document Pattern and UnsafeRegex good/bad examples in docs/sytax-examples
[x] Add docs/sytax examples for existing syntax features
    src/v1-scope-contract.ts admitV1SyntaxExampleFile catalogs the ten files in docs/syntax-examples/README.md; admitV1SyntaxDocsDir admits live docs/syntax and docs/syntax-examples and refuses historical docs/sytax spelling. SuperGrok 2026-10-08f
[HOLD] Define Pattern parser support
[HOLD] Define pattern_policy parser support
[HOLD] Define unsafe regex parser support
[HOLD] Define pattern_set parser support
[HOLD] Define denied regex feature diagnostics
[HOLD] Define regex compile-inside-loop warning
[HOLD] Define pattern report schema
[HOLD] Define pattern map-manifest entries
[x] Define UnsafeRegex production gates
    src/v1-scope-contract.ts admitV1PatternFamily refuses UnsafeRegex and javascript_regexp (Galerina_CORE_V1_PATTERN_UNSAFE). SuperGrok 2026-10-08c
[x] Decide map syntax (pattern matching)
[x] Decide if syntax
[x] Decide loop syntax
[x] Decide for syntax
[x] Decide while syntax
[x] Decide wait until syntax
[x] Decide await syntax
[x] Decide parallel block syntax
[x] Decide channel syntax
[x] Decide worker syntax
[x] Decide rollback syntax
[x] Decide checkpoint syntax
[x] Decide compute block syntax
[x] Decide api block syntax
[x] Decide webhook block syntax
[x] Decide client block syntax
[x] Decide transform block syntax
[x] Decide security block syntax
[x] Decide permissions block syntax
[x] Decide json_policy block syntax
```

---

## Type System TODO

```text
[x] Define primitive types
[x] Define Int sizes
[x] Define Float sizes
[x] Define Decimal behaviour
[x] Define Money<Currency>
[x] Define String
[x] Define SecureString
[x] Define Bytes
[x] Define Bool
[x] Define Option<T>
[x] Define Result<T, E>
[x] Define Decision
[x] Define Tri
[x] Define Json
[x] Define JsonObject
[x] Define JsonArray
[x] Define Timestamp
[x] Define Duration
[x] Define Array<T>
[x] Define Map<K, V>
[x] Define Set<T>
[x] Define Vector<N, T>
[x] Define Matrix<R, C, T>
[x] Define Tensor<Shape, T>
[x] Define explicit conversion rules
[x] Define rejected implicit conversion rules
[x] Define type inference boundaries
[x] Define compile-time shape checking
[x] Define exhaustive map checks
```

---

## Memory Safety TODO

```text
[x] Choose ownership model
[x] Choose borrowing model
[x] Define immutable by default
[x] Define explicit mutability
[x] Define safe references
[x] Add docs/memory-and-variable-use.md
[x] Document no hidden large copies and read-only borrowing
[x] Document explicit clone and copy-on-write memory model
[x] Define borrow escape checks
[x] Define read-only mutation checks
[x] Define large clone warnings
[x] Define collection bounds checking
[x] Define buffer safety rules
[x] Define string memory safety rules
[x] Define SecureString memory rules
[x] Define runtime memory pressure block
[x] Define runtime spill aLOw/deny policy
[x] Define memory pressure ladder and cache bypass behaviour
[x] Define conservative storage-aware performance and cache rules
[x] Define Strict Global Registry
[x] Define data race prevention
[x] Define thread/task sharing rules
[x] Define lifetime checking approach
[x] Define garbage collection policy, if any
[x] Define unsafe code policy
[x] Define native binding safety rules
```

---

## Security TODO

```text
[x] Define default security profile
[x] Define strict security profile
[x] Define development security profile
[x] Define security block syntax
[x] Define permissions block syntax
[x] Define package permission checks
[x] Document Package Use Registry
[x] Define packages registry parser support
[x] Define file-level use parser support
[x] Define package approval checks
[x] Define unregistered package use diagnostics
[x] Define unused package warning
[x] Define package loading modes
[x] Define package lock hash checks
[x] Define package use report
[x] Document search and translation provider boundaries
[x] Document image AI package boundaries and compute auto
[x] Document video package boundaries and compute auto
[HOLD] Define package-defined effect registration for provider packages
[HOLD] Define image package effect registration
[HOLD] Define image policy and validation schema
[HOLD] Define image decoder sandbox policy schema
[HOLD] Define image memory report schema
[HOLD] Define image security report schema
[HOLD] Define image package target and precision report schemas
[HOLD] Define image package map-manifest entries
[HOLD] Define AI guide image package summary output
[HOLD] Add image package examples after package parser support exists
[HOLD] Define video package effect registration
[HOLD] Define camera/screen/media runtime permission policy schema
[HOLD] Define video privacy report schema
[HOLD] Define video memory report schema
[HOLD] Define video package target-stage report schema
[HOLD] Define video package map-manifest entries
[HOLD] Define AI guide video package summary output
[HOLD] Add video package examples after package parser support exists
[HOLD] Define search provider package report schema
[HOLD] Define translation provider package report schema
[HOLD] Define provider redaction policy schema
[HOLD] Define provider rate-limit policy schema
[HOLD] Define AI guide provider-boundary summary output
[HOLD] Add search/translation provider examples after package parser support exists
[x] Define secret handling
[x] Define SecureString restrictions
[x] Define safe logging rules
[x] Define redaction rules
[x] Define file access permissions
[x] Define network access permissions
[x] Define environment access permissions
[x] Define native binding permissions
[x] Define webhook security defaults
[x] Define HMAC verification rules
[x] Define replay protection rules
[x] Define idempotency rules
[x] Document auth, token and verification boundaries
[x] Define auth report schema
    admitV1AuthReport auth_report. SuperGrok 2026-10-08g
[x] Define token report schema
    admitV1AuthReport token_report. SuperGrok 2026-10-08g
[x] Define proof report schema
    admitV1AuthReport proof_report. SuperGrok 2026-10-08g
[x] Define JWT unsafe algorithm diagnostics
    admitV1JwtAlgorithm none -> Galerina_CORE_V1_JWT_ALG_NONE; admitV1JwtDiagnostic alg_none. SuperGrok 2026-10-08g
[x] Define unverified JWT claim-use diagnostics
    admitV1JwtDiagnostic unverified_claim_use. SuperGrok 2026-10-08g
[x] Define bearer-token unsafe storage diagnostics
    admitV1BearerDiagnostic local_storage|logged|client_safe. SuperGrok 2026-10-08g
[x] Define DPoP/mTLS required-route enforcement
    admitV1ProofOfPossession dpop|mtls catalog; kernel/runtime enforcement stays core-security. SuperGrok 2026-10-08g
[x] Define capability token request/body/resource binding diagnostics
    admitV1CapabilityConstraint bind_action|bind_resource|bind_request_hash. SuperGrok 2026-10-08g
[x] Define request proof replay-cache enforcement
    admitV1ProofConstraint replay_cache. SuperGrok 2026-10-08g
[ ] Define post-quantum crypto policy warnings
[x] Define security report schema
[x] Define security linter rules
[x] Add docs/ransomware-resistant-design.md
```

---

## JSON TODO

```text
[x] Define JSON grammar interaction
[x] Define typed JSON decode syntax
[x] Define raw JSON syntax
[x] Define Json.path
[x] Define json.pick<T>
[x] Define json.decode<T>
[x] Define json.encode
[x] Define json.stream<T>
[x] Define jsonl.read<T>
[x] Define JSON transform syntax
[x] Define JSON schema generation
[x] Define OpenAPI schema generation
[x] Define JSON error messages
[x] Define max body size rule
[x] Define max depth rule
[x] Define duplicate key rule
[x] Define unknown fields rule
[x] Define null fields rule
[x] Define canonical JSON output
[x] Define safe JSON redaction
[x] Add docs/lazy-compact-json.md
[x] Document repeated node shape detection for dataset-style JSON
[x] Define Lazy Compact JSON compiler/linter checks
[x] Add Lazy Compact JSON memory report schema
```

---

## API and Webhook TODO

```text
[x] Define service block syntax
[x] Define listen syntax
[x] Define route syntax
[x] Define api block syntax
[x] Define request type binding
[x] Define response type binding
[x] Define route params
[x] Define query params
[x] Define middleware model
[x] Define authentication hooks
[x] Define webhook block syntax
[x] Define webhook security block
[x] Define HMAC header syntax
[x] Define webhook secret syntax
[x] Define replay protection
[x] Define idempotency key
[x] Document API duplicate detection and idempotency
[ ] Define duplicate API route check
[ ] Define duplicate API route-name check
[ ] Define duplicate API schema-shape warning
[ ] Define API manifest generation
[ ] Define duplicate-api-report.json schema
[ ] Define idempotency-report.json schema
[ ] Define side-effect idempotency recommendations
[ ] Define duplicate external API client warnings
[ ] Define duplicate outbound API call warnings
[x] Define payload size limit
[x] Define API timeout rules
[x] Define retry rules
[x] Define circuit breaker rules
[x] Define rate limit rules
[x] Document API data security and load control
[ ] Define API body policy parser support
[ ] Define content-type validation checks
[ ] Define request body streaming policy checks
[ ] Define route memory budget checks
[ ] Define API concurrency limit checks
[ ] Define backpressure policy checks
[ ] Define queue handoff report entries
[ ] Define load-control report schema
[ ] Define API memory report schema
[ ] Define client identity trusted proxy checks
[x] Define API report output
[x] Define OpenAPI output
[x] Define generated client SDK scope
```

---

## Concurrency TODO

```text
[x] Define async task syntax
[x] Define await behaviour
[x] Define Structured Await syntax and policy direction
[x] Define await all behaviour
[x] Define await race behaviour
[x] Define await stream behaviour
[x] Define await queue handoff direction
[x] Define structured concurrency rules
[x] Define cancellation behaviour
[x] Define timeout behaviour
[x] Define parallel block behaviour
[x] Add primary lane and offload nodes documentation
[x] Define offload node syntax
[x] Define offload CPU budget checks
[x] Define offload memory budget checks
[x] Define offload failure report schema
[x] Define channel type
[x] Define channel buffer limits
[x] Define channel overflow behaviour
[x] Define worker syntax
[x] Define worker pool behaviour
[x] Define dead-letter queues
[x] Define backpressure rules
[x] Define safe shared state
[x] Define data race prevention checks
```

---

## Compute / Accelerator TODO

```text
[x] Add docs/backend-compute-support-targets.md
[x] Refactor backend compute target docs around vendor-neutral core targets and plugin/deployment-profile mappings
[x] Add docs/sytax/backend-compute-targets.md
[x] Add docs/sytax-examples/backend-compute-targets.md
[x] Define compute target best
[x] Define prefer photonic
[x] Define fallback gpu
[x] Define fallback cpu
[x] Define CPU target syntax/report contract
    src/v1-scope-contract.ts admitV1CpuTargetContract / V1_CPU_TARGET_CONTRACT_SCHEMA. SuperGrok 2026-10-08d
[x] Define WASM target syntax/report contract
    src/v1-scope-contract.ts admitV1WasmTargetContract / V1_WASM_TARGET_CONTRACT_SCHEMA. SuperGrok 2026-10-08b
[HOLD] Define compute auto parser support
    Parser stays in core-compiler. v1 selector policy is admitV1ComputeSelector (cpu|wasm; auto/best/accelerators post-v1). SuperGrok 2026-10-08d
[HOLD] Define generic compute target category parser support
[x] Define target plugin boundary schema contract
    admitV1TargetPluginBoundary admits only galerina.core.v1-target-plugin-none.v1. SuperGrok 2026-10-08d
[HOLD] Define runtime compute capability map schema contract
[HOLD] Define fallback report schema contract
[HOLD] Define cloud deployment profile mapping report
[HOLD] Define backend compute target catalogue parser support
[HOLD] Define AI accelerator target syntax/report contract
[HOLD] Define memory/interconnect target syntax/report contract
[HOLD] Define photonic variant target discovery report contract
[HOLD] Define CPU/GPU/AI/photonic capability map report contract
[HOLD] Define data movement cost reporting contract
[HOLD] Define target calibration and health reporting contract
[HOLD] Define precision/tolerance report contract for backend compute targets
[x] Define GPU plan output contract
[x] Define photonic plan output contract
[x] Document wavelength compute planning
[x] Define ternary simulation output
[x] Define compute purity rules
[x] Define aLOwed compute operations
[x] Define rejected compute operations
[x] Define matrix operation syntax/report contract
[x] Define vector operation syntax/report contract
[x] Define tensor operation syntax/report contract
[x] Define model inference support
[HOLD] Define ONNX import possibility
[x] Define target compatibility report contract
[HOLD] Expand target compatibility report contract for backend compute support targets
```

---

## Vector Model TODO

```text
[x] Add hybrid scalar + vector model documentation
[x] Add vectorised dataset syntax documentation
[x] Add simple vector syntax and compute auto documentation
[x] Define vector block syntax
[x] Define vector optimisation modes
[ ] Define vectorize parser support
[x] Define pure vector flow parser support
[x] Define pure vector required flow parser support
[x] Define scalar fallback lowering
[x] Define vector purity checks
[x] Define vector side-effect blocking
[x] Define vector secret-access blocking
[x] Define vector order preservation rules
    src/v1-scope-contract.ts admitV1VectorOrder / V1_ADMITTED_VECTOR_ORDER preserve_order|unordered; V1_DEFAULT_VECTOR_ORDER preserve_order (docs/vector-model.md Order Rules). SuperGrok 2026-10-08e
[ ] Define vector memory and chunking checks
[x] Define vector report output
[x] Define vector report schema
[x] Define AI guide vector section
[ ] Define vector suggestion command
[x] Add vector examples after parser support exists
[x] Add vector parser tests
```

---

## Hybrid Logic and Wavelength TODO

```text
[x] Add hybrid logic and wavelength compute documentation
[HOLD] Define wavelength target syntax
[HOLD] Define wavelength target capability report fields
[HOLD] Define analogue precision policy schema
[HOLD] Define wavelength CPU-reference verification checks
[HOLD] Define wavelength fallback diagnostics
[HOLD] Define blocked side-effect diagnostics for wavelength compute
[HOLD] Define AI guide hybrid compute section
[HOLD] Define target report hybridCompute section
[HOLD] Add wavelength examples after parser support exists
```

---

## Frontend Compilation TODO

```text
[x] Add frontend JavaScript/WebAssembly target documentation
[x] Add browser DOM and web platform primitives documentation
[x] Define browser target syntax
[x] Define browser-safe imports
[HOLD] Define browser security report schema
[/] Define JavaScript output target
[x] Add compiled browser-safe example
[HOLD] Define WebAssembly frontend wrapper output
[HOLD] Define hybrid JavaScript + WebAssembly output
[HOLD] Define frontend source-map output
[HOLD] Define SafeHtml and safe HTML policy schema
[HOLD] Define dom.read/dom.write effect checking
[HOLD] Define browser permission policy schema
[HOLD] Define browser fetch/storage/cookie policy schemas
[HOLD] Define DOM event syntax
[HOLD] Define form validation syntax
[HOLD] Define push notification and service worker report schemas
[HOLD] Define browser map-manifest entries
[HOLD] Define AI guide browser summary output
[HOLD] Define browser fetch/http rules
[x] Define server-only import blocking for browser target
```

---

## Debug Console TODO

```text
[x] Add debug console documentation
[HOLD] Define console.log/info/warn/error/debug syntax
[HOLD] Define console.here source-map output
[x] Define console.scope and console.vars safety rules
[x] Define console.dump size limits
[x] Define SecureString redaction for console output
[x] Define large JSON console summaries
[x] Define production console policy
[x] Define console report schema
[HOLD] Add console diagnostics to compiler prototype
```

---

## Target and Capability Model TODO

```text
[x] Add target and capability model documentation
[x] Add status labels for implemented, draft, planned and research features
[x] Define target browser syntax
[HOLD] Define target server syntax
[HOLD] Define target native syntax
[x] Define target wasm syntax
    V1_ADMITTED_TARGETS wasm + admitV1WasmTargetContract. SuperGrok 2026-10-08b
[x] Define capability block syntax
[x] Define browser-safe import list
[x] Define server-only import list
[x] Define compute-safe import list
[x] Implement browser target import blocking
[x] Generate target/capability report
[HOLD] Expand target/capability report for backend compute support targets
[HOLD] Add parser tests for compute auto target catalogue syntax
[x] Add v0.1 browser target parser tests
```

---

## Memory Safety / Developer Friction TODO

```text
[x] Add memory-safety and developer-experience design documentation
[ ] Define graph ownership syntax
[ ] Define graph node/edge syntax
[ ] Define graph cycle report schema
[ ] Define readonly/owned/shared ownership mode syntax
[ ] Define recursion limit syntax
[ ] Define recursion report schema
[ ] Define draft mode behavior
[ ] Define secure mode behavior
[ ] Define trusted module syntax
[ ] Define trusted module audit report
[ ] Define FFI declaration syntax
[ ] Define FFI ownership/nullability rules
```

---

## Compiler TODO

```text
[x] Choose compiler implementation language
    src/v1-scope-contract.ts admitV1CompilerImplementationLanguage admits typescript_contracts and cjs_prototype (src/index.ts contracts + compiler/ CJS prototype). SuperGrok 2026-10-08f
[x] Define compiler folder structure
    src/v1-scope-contract.ts admitV1CompilerFolder admits compiler, src, tests, grammar, schemas, docs, examples. SuperGrok 2026-10-08f
[x] Create lexer
[ ] Create parser
[ ] Create AST
[ ] Create symbol table
[x] Create type checker
[ ] Create memory checker
[ ] Create security checker
[ ] Create effect checker
[ ] Create JSON/API checker
[ ] Create IR format
[ ] Create optimiser
[ ] Create linker
[ ] Create CPU output prototype
[ ] Create WASM output prototype
[x] Create GPU plan generator
[x] Create photonic plan generator
[x] Create ternary simulation generator
[x] Create source-map generator
[ ] Create report generator
[x] Create AI context generator
```

---

## Build TODO

```text
[x] Define debug build mode
[x] Define release build mode
[x] Define build folder layout
[x] Define build manifest schema
[x] Define map manifest schema
[x] Define docs manifest schema
[x] Define deterministic build rules
[x] Define source hashing
[x] Define dependency hashing
[x] Define output hashing
[x] Define artefact verification
[x] Generate map manifest
[x] Generate API guide documentation
[x] Generate AI guide after successful build
[x] Generate runtime report
[x] Generate runtime guide documentation
[x] Generate memory report and memory pressure guide
[x] Generate global report and global registry guide
[x] Generate docs manifest
[HOLD] Define build signing possibility
[x] Define source-map output rules
[x] Define generated file naming
[x] Define generated file cleanup
```

---

## Security-First Build System TODO

```text
[x] Add security-first build system documentation
[x] Add startup validation documentation
[HOLD] Define startup block syntax
[x] Define startup report schema
[x] Validate required env variables before main()
[x] Validate required secrets before main()
[x] Validate security.api_methods against routes
[x] Validate inbound ports against server.listen()
[x] Validate route handlers before main()
[x] Validate webhook HMAC/replay/idempotency requirements before main()
[x] Validate packages registry before main()
[ ] Validate memory/vector/json policies before main()
[x] Define Galerina build --with-tests
[x] Define Galerina build --security
[x] Define Galerina build --strict
[HOLD] Define compiler block syntax
[x] Define fail_on_warning behavior
[x] Define fail_on_test_failure behavior
[x] Define app.test-report.json
[x] Define app.ai-suggestions.md
[x] Define app.ai-suggestions.json
[ ] Integrate vector/offload safety checks into build pipeline
[ ] Integrate target/capability import checks into build pipeline
```

---

## CLI TODO

```text
[x] Galerina init
[x] Galerina run
[x] Galerina serve --dev planning report
[x] Galerina build
[x] Galerina check
[x] Galerina tokens
[x] Galerina fmt
[x] Galerina test
[x] Galerina fmt
[ ] Galerina lint
[x] Galerina explain
[x] Galerina explain --for-ai
[x] Galerina verify
[x] Galerina targets
[x] Galerina ai-context
[x] Galerina schema
[x] Galerina openapi
[HOLD] Galerina deploy
```

---

## AI-Friendly TODO

```text
[x] Create AI-INSTRUCTIONS.md
[x] Define app.ai-context.json
[x] Define app.ai-context.md
[x] Define Galerina ai-context command
[x] Define Galerina explain --for-ai command
[x] Define token-efficient error reports
[x] Define AI-safe project summaries
[x] Define route summary output
[x] Define type summary output
[x] Define changed file summary output
[x] Define security summary output
[x] Define target summary output
[x] Define suggested next actions output
```

---

## Source Map TODO

```text
[x] Define app.source-map.json format
[x] Map binary errors to .fungi files
[x] Map WASM errors to .fungi files
[x] Map GPU plan errors to .fungi files
[x] Map photonic plan errors to .fungi files
[x] Include original file
[x] Include original line
[x] Include original column
[x] Include flow/function name
[x] Include build stage
[x] Include target
[x] Include suggested fix
[x] Integrate source maps with Galerina explain
[x] Integrate source maps with Galerina explain --for-ai
```

---

## Deployment TODO

```text
[HOLD] Define build-once deploy-many workflow
[HOLD] Define .env handling
[HOLD] Define .env.example
[HOLD] Define secrets manager guidance
[HOLD] Define container deployment guidance
[HOLD] Define server deployment guidance
[x] Define build manifest verification
[HOLD] Define artefact rollback
[HOLD] Define health check model
[HOLD] Define multi-server deployment model
[HOLD] Define source maps in production
[HOLD] Define compiled app Git workflow
```

---

## Testing TODO

```text
[x] Define test syntax
    src/v1-scope-contract.ts admitV1TestKind / admitV1TestAssertion from docs/testing.md. SuperGrok 2026-10-08e
[x] Define unit test model
    V1_ADMITTED_TEST_KINDS unit. SuperGrok 2026-10-08e
[x] Define integration test model
    V1_ADMITTED_TEST_KINDS integration. SuperGrok 2026-10-08e
[x] Define API test model
    V1_ADMITTED_TEST_KINDS api. SuperGrok 2026-10-08e
[x] Define webhook test model
    V1_ADMITTED_TEST_KINDS webhook. SuperGrok 2026-10-08e
[x] Define JSON validation tests
    V1_ADMITTED_TEST_KINDS json_validation. SuperGrok 2026-10-08e
[x] Define security tests
    V1_ADMITTED_TEST_KINDS security (kind catalog only; checker stays core-security). SuperGrok 2026-10-08e
[ ] Define memory-safety tests
[x] Define type checker tests
[x] Define source-map tests
[x] Define compiler report tests
    V1_ADMITTED_TEST_KINDS compiler_report. SuperGrok 2026-10-08e
[x] Define target report tests
[x] Define AI context tests
```

---

## Example TODO

```text
[x] examples/hello.fungi
[x] examples/strict-types.fungi
[x] examples/option.fungi
[x] examples/result.fungi
[x] examples/decision.fungi
[x] examples/json-decode.fungi
[x] examples/api-orders.fungi
[x] examples/payment-webhook.fungi
[x] examples/parallel-api-calls.fungi
[x] examples/workers.fungi
[x] examples/rollback.fungi
[x] examples/compute-block.fungi
[x] examples/gpu-plan.fungi
[x] examples/photonic-plan.fungi
[x] examples/ternary-sim.fungi
[x] examples/source-map-error.fungi
[x] examples/ai-context.fungi
[x] examples/logic-review-scale.fungi
```

---

## Git TODO

```text
[x] Create GIT.md
[x] Define branch strategy
[x] Define feature branch naming
[x] Define commit message format
[x] Define pull request template
[x] Define issue templates
[x] Define release tags
[x] Define changelog update process
[x] Define generated file policy
[x] Define docs-only change policy
[x] Define main branch protection policy
```

---

## Compiled App Git TODO

```text
[x] Create COMPILED_APP_GIT.md
[x] Define what Galerina app files should be committed
[x] Define what build files should not be committed
[x] Define when build artefacts may be stored
[x] Define source-map handling
[x] Define .env handling
[x] Define .env.example handling
[x] Define build manifest handling
[x] Define release artefact storage
[x] Define CI/CD deployment tags
[x] Define rollback tags
[x] Define multi-server deployment records
```

---

## Version 0.1 TODO

```text
[HOLD] Finish documentation set -- SuperGrok 2026-10-08e: unbounded; docs/ already holds the language-core set. Owner names a closed remaining-docs list before this row can complete.
[x] Add Apache-2.0 LICENSE
[x] Add NOTICE.md
[x] Add .gitignore
[x] Add .env.example
[x] Create examples folder
[x] Add hello.fungi example
[x] Add boot.fungi example
[x] Draft grammar
[x] Draft AST schema
[x] Draft source-map schema
[x] Draft compiler report schemas
[x] Draft AI context schema
```

---

## Version 0.2 TODO

```text
[x] Create repository scaffold
    package.json, src/, tests/, compiler/, docs/, examples/ present on this package HEAD. SuperGrok 2026-10-08e
[x] Choose prototype language
[x] Build lexer prototype
[x] Build parser prototype
[x] Parse hello.fungi
[x] Parse boot.fungi
[x] Output AST JSON
[x] Output syntax errors with file and line
[x] Add basic formatter prototype
```

---

## Version 0.3 TODO

```text
[x] Add type checker prototype
[x] Add no-undefined checks
[x] Add no-silent-null checks
[x] Add no-truthy/falsy checks
[x] Add basic Option handling
[x] Add basic Result handling
[x] Add exhaustive map checks
[x] Add failure report output
```

---

## Version 0.4 TODO

```text
[x] Add JSON decode syntax
[x] Add API block parsing
[x] Add webhook block parsing
[x] Add OpenAPI output draft
[x] Add JSON schema output draft
[x] Add API report output
[x] Add webhook security warnings
```

---

## Version 0.5 TODO

```text
[x] Add compute block parsing
[x] Add target compatibility checker
[x] Add GPU plan output
[x] Add photonic plan output
[x] Add ternary simulation output
[x] Add target report output
[x] Add Galerina explain --for-ai output
[x] Add Galerina ai-context output
```

---

## Blocked / Later TODO

```text
[!] Real photonic backend requires hardware access or vendor SDK
[!] Real GPU backend requires backend decision
[!] Native binary compiler requires backend decision
[!] Hardware feature detection and reporting requires host capability probing and backend policy decisions
[!] Kernel and driver development must be last-stage work and requires explicit maintainer permission
[!] Full memory model requires deeper compiler design
[!] Package manager should wait until syntax stabilises
[!] Formal verification should wait until core language model is stable
```

---

## Final TODO Principle

Every TODO item should support at least one of these aims:

```text
make Galerina safer
make Galerina stricter
make Galerina easier to debug
make Galerina better for JSON/API systems
make Galerina better for AI coding assistants
make Galerina easier to deploy
make Galerina ready for multi-target compilation
make Galerina useful before future hardware arrives
```
