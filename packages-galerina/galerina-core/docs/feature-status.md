# Galerina Feature Status

This document defines standard status labels for Galerina features.

The goal is to make the project clear as it grows, so readers can distinguish current prototype behaviour from draft design, planned compiler work and future research.

---

## Status Labels

Use these labels consistently:

| Status | Meaning |
|---|---|
| `Implemented` | Works in the current prototype or repository as described |
| `Prototype` | Partially working; useful for experiments but not production-ready |
| `Draft` | Documented design direction, syntax or policy may still change |
| `Planned` | Intended future work, not implemented yet |
| `Research` | Exploratory idea, hardware/backend-dependent or uncertain |
| `Blocked` | Cannot progress until another feature or decision is completed |

Recommended rule:

```text
Every major Galerina feature should be labelled Implemented, Prototype, Draft, Planned, Research or Blocked.
```

---

## Current Feature Matrix

| Feature | Status | Notes |
|---|---|---|
| Lexer | Prototype | Implemented in the Node.js prototype |
| Parser | Prototype | Supports the current documented subset |
| Formatter | Prototype | Supports current examples |
| Type checker | Prototype | Handles declared types, generics and match coverage checks |
| `Galerina run` | Prototype | Runs simple checked scripts |
| `Galerina check` | Prototype | Runs parser/check diagnostics |
| `Galerina build` | Prototype | Emits placeholder outputs and reports |
| `Galerina generate` | Prototype | Generates development reports/docs |
| `Galerina dev` | Prototype | Runs one checked generate/run cycle |
| `Galerina dev --watch` | Prototype | Re-runs the checked generate/run cycle when `.spore` files change |
| Startup validation | Draft | Project validation before `main()` documented, full startup contract pending |
| Source maps | Prototype | Emitted in reports and build outputs |
| Security reports | Prototype | Basic project/security diagnostics exist |
| Ransomware-resistant design | Draft | Security policy model documented; compiler/runtime checks pending |
| Auth, token and verification boundaries | Draft | JWT, bearer token, OAuth, DPoP, mTLS, request proof, capability token, hardware proof and post-quantum policy model documented; parser/runtime enforcement pending |
| API data security and load control | Draft | Typed request contracts, content-type validation, strict body decoding, route memory budgets, rate limits, concurrency limits, queue handoff, backpressure and load-control reports documented; parser/runtime enforcement pending |
| API duplicate detection and idempotency | Draft | Duplicate route checks, duplicate schema warnings, API manifests, idempotency declarations, webhook replay protection, duplicate external API warnings and source-mapped reports documented; parser/runtime enforcement pending |
| galerina-framework-api-server | Draft | Built-in HTTP API server package documented; implementation pending; delegates validation, auth and typed execution to Galerina App Kernel |
| Memory reports | Prototype | Memory pressure and clone/mutation diagnostics exist |
| AI context and AI guide | Prototype | Generated from checked/build output |
| OpenAPI/schema output | Prototype | Works for current API examples |
| Strict comments | Prototype | Extracted and checked for basic mismatches |
| Strict Global Registry | Prototype | Parsed and reported with secret redaction |
| Safe pattern matching and regex | Draft | Pattern, UnsafeRegex, pattern policy, pattern sets, streaming scans and reports documented; parser/runtime engine support pending |
| Omni-logic planning | Draft | Prototype emits planning/simulation artefacts |
| Ternary simulation | Draft | Planning/simulation output, not hardware execution |
| CPU/native output | Prototype | CPU-compatible placeholder output |
| WebAssembly output | Prototype | Placeholder output; real frontend WASM is planned |
| GPU target | Research | Planning/report target only |
| Photonic target | Research | Future hardware/backend-dependent |
| Wavelength compute | Research | Hybrid analogue photonic compute model documented, no backend support |
| Hardware feature detection and reporting | Research | Modern CPU/GPU speed and security feature planning documented, no host/backend support |
| Backend compute support targets | Draft | Vendor-neutral compute auto, CPU/GPU/AI accelerator/photonic candidate, memory/interconnect, precision, fallback, plugin/deployment-profile boundary and report model documented; discovery/report support pending |
| Browser target | Prototype | Syntax parses and server-only import blocking has initial checks |
| JavaScript/TypeScript framework targets | Draft | ESM, TypeScript declarations, Node/browser/WASM bridge, worker-safe exports and framework adapter boundaries documented; generator pending |
| React adapter output | Draft | Hook/client/schema adapter output documented as generator/package work, not core component syntax |
| React Native adapter output | Draft | Mobile hook/client/schema/native-boundary adapter output documented as generator/package work, not core component syntax |
| Angular adapter output | Draft | Service/client/form/signal-friendly adapter output documented as generator/package work, not core component syntax |
| Node target | Draft | ESM, worker-compatible modules and WASM loader target direction documented; compiler output pending |
| Dart target | Draft | Generated Dart library/package output documented; compiler output pending |
| Flutter target | Draft | Layered Dart/Flutter package support documented; Galerina remains a language/toolchain, not a Flutter framework |
| Flutter package/plugin output | Draft | Flutter-compatible package/plugin layouts, permission reports and source maps documented; generator pending |
| Flutter platform-channel generator | Draft | Typed platform-channel/Pigeon-style boundary model documented; parser/generator pending |
| Flutter FFI target | Draft | Native library plus Dart FFI binding target documented; platform support checks pending |
| Flutter UI component syntax | Research | Optional later-stage widget mapping direction documented; not part of first Flutter support target |
| Capability block | Prototype | `aLOw`/`block` syntax parses and blocked capabilities can reject imports |
| Package Use Registry | Draft | `import` vs `use`, package approval and package report model documented |
| Search and translation provider boundaries | Draft | Boundary model documented; search, translation, vector search, image search and provider-specific engines remain package/framework/external-service areas |
| Text AI package boundaries and compute auto | Draft | Text AI, NLP, LLM, document AI, prompt safety, token policy, redaction and compute-auto boundary model documented; package/report/runtime enforcement pending |
| Image AI package boundaries and compute auto | Draft | Image AI, vision model, decoder, generation, search and compute-auto boundary model documented; package/report/runtime enforcement pending |
| Video package boundaries and compute auto | Draft | Video package/provider/privacy/compute boundary model documented; video engines, codecs, AI tasks and camera/screen APIs remain package/runtime/framework areas |
| Frontend JavaScript output | Planned | Design documented, compiler output pending |
| Browser JavaScript placeholder output | Prototype | Browser target builds can emit a placeholder `app.browser.js` |
| Browser, DOM and web platform primitives | Draft | Safe HTML, DOM, browser effects, permissions, storage, push/service worker and report model documented; parser/runtime enforcement pending |
| Device capability boundaries | Draft | Phone/device features classified as package/platform/framework areas; Galerina core provides safe types, streams, buffers, permissions, compute targets, FFI and reports |
| Debug console | Draft | Safe console syntax and redaction rules documented |
| Hybrid JavaScript + WebAssembly | Planned | Depends on browser target and WASM wrapper support |
| Framework boundary markers | Draft | `client_safe`, `server_only` and `worker_safe` export markers documented; parser/checker support pending |
| Vector model | Draft | Security-first model documented, parser support pending |
| Vectorised dataset syntax | Draft | `vectorize rows` syntax documented, parser/report support pending |
| Simple vector syntax and compute auto | Draft | Friendly vector/compute auto model documented; `pure vector flow` and `pure vector required flow` parser support exists; target selection and runtime hardware detection remain pending |
| Async Dart/Flutter syntax | Draft | Explicit `async flow` parser support exists; `await` restrictions, Dart `Future` lowering and `Bytes`/`Uint8List` backend support pending |
| Offload nodes | Draft | Design documented, runtime scheduler pending |
| Graph ownership | Planned | Design direction documented, syntax/checking pending |
| Draft vs secure mode | Planned | Design direction documented |
| Trusted modules | Planned | Design direction documented |
| FFI/interoperability generator | Planned | Design direction documented |
| Kernel/driver development | Blocked | Last-stage only, requires explicit maintainer or project permission |

---

## Documentation Rule

When adding a major new Galerina concept, update:

```text
docs/feature-status.md
docs/pending-additions.md
docs/sytax/ when syntax is added or changed
docs/sytax-examples/ when syntax examples are added or changed
TODO.md
CHANGELOG.md
```

If a feature has examples that the current parser cannot compile, keep those examples in documentation or future-syntax areas until parser support exists.

---

## Final Rule

```text
Do not make planned or research features look implemented.
Label the status clearly.
```
