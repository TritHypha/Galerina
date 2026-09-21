# Non-evidence blocker manifest

**Date:** 2026-09-21
**Purpose:** identify the remaining work that can change implementation,
component contracts, compiler behaviour, or generated assets. Evidence-only
holds are deliberately excluded from the active blocker count.

The table below is a navigation index, not the full issue record. Every
blocker row links to one corresponding chapter in
[`BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md`](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md),
where the issue, source boundary, required outcome, and evidence boundary are
recorded in full.

## Verification boundary

This manifest was built from the current owner TODOs and the exact source
locators recorded in `docs/TODO.md` and `docs/TODO-MISSING-RD.md`.

The source heads checked for this manifest are:

| Repository | Branch | HEAD | Working-tree note |
|---|---|---|---|
| Galerina | `main` | `daa2e92b233a2f4a555fefe6d42a604001cd99b1` | Compiler, observability, core-network, and ledger edits are present in the working tree; unrelated dirty paths are retained; no files were reset or pushed. |
| SLIDE/VOK | `codex/v2c-independent-frontend` | `d14e37eb12fc74480c09ae941aa6ea9629e0913b` | Existing security-workflow change preserved. |
| Lyth-Weaver | `main` | `f5a3ffe147b5110216493c92cb7dabd1a5cc47cc` | Existing handover change preserved. |

The RD range control passed its gold suite (`12/12`). A fresh locator-only
range refresh of the private RD sources was refused because tracked RD source
paths in the KB are dirty. Therefore the RD numbers below are linked from the
current public TODO ledgers; this document does not copy private RD bodies or
claim a fresh private-status refresh.

## KB gap adjudication refresh

The private KB now has a non-authorizing cross-record classification at
`RD-1265`, committed at KB head
`8acfdce002168af2f1c8f4f303c331610ea7304b`. It does not remove an active
implementation blocker or admit a design:

- `RD-1231`: bounded named-leaf conversion evidence remains separate from a
  general emitter, whole-program conversion, queue completeness, or SLIDE/VOK
  admission.
- `RD-1008`: remains open theoretical research; §9.2 is queued, with 71/126
  documentary comparisons complete and 55 pending in the cited corpus table.
- `RD-1003`: remains `POST-DRAFT HOLD; NOT PUBLICATION-READY`; the refused
  over-capacity packet was not a completed POST_DRAFT evaluation.
- `RD-0864`: remains historical and superseded by RD-1003; supersession does
  not prove every visual-language claim.

This refresh resolves the classification gap only. It does not authorize
conversion, queue regeneration, corpus assurance, signing, or a full `.fungi`
build. See the [RD-1265 record](../../../../ZTF-Knowledge-Bases/private/research/rd/RD-1265-bounded-kb-gap-adjudication-PRIVATE.md)
for the advisory Gemini/Grok inputs and Astra adjudication.

## Active non-evidence blockers

These are the blocks that require a contract decision followed by ordinary
engineering, tests, or source/asset regeneration. A green focused test does
not close a row when the source contract is still incomplete.

| Project | Blocker and exact source locator | Full chapter | RD linkage | Expected outcome |
|---|---|---|---|---|
| Galerina compiler | Broad expression inference is still fail-closed/partial at `packages-ts/galerina-core-compiler/src/type-checker.ts:1054-1556`, consumed at `:1746-1828`, `:1874-1954`, and `:2064-2297`. The unresolved cases include deferred fields, nested generics, `unwrapOr` fallbacks, heterogeneous lists, anonymous map entries, and callback wrapper payloads. | [C01](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c01) | `RD-1232`; satellites `RD-1247`, `RD-1248`, `RD-1250`, `RD-1251`, `RD-1252`, `RD-1253` (`docs/TODO.md:267-377`). | Freeze the deferred-inference and diagnostic contract; implement a complete expression-kind matrix; add positive and hostile consumer tests; preserve refusal for genuinely unknown forms. |
| Galerina compiler | WAT lowering intentionally refuses Decimal and higher-order collection operations at `packages-ts/galerina-core-compiler/src/wat-emitter.ts:1611-1617,2020-2045`, with fallback at `:4503-4534`; unsupported method calls now trap at `:2115-2122`. | [C02](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c02) | `RD-1233` (`docs/TODO.md:379-392`). | Freeze the Decimal representation/ABI, rounding and resource limits, and a bounded capture-free callback ABI; implement only those admitted cases; prove interpreter/WAT parity and keep unsupported cases trapped. |
| Galerina compiler / TriRegex / SLIDE-VOK | The interpreter now consumes a certificate-bearing `PatternCapability` and bounded refusal-on-truncation `findAll` at `packages-ts/galerina-tri-regex/src/index.ts`; the WAT method map still has no `matchesPattern` operation at `packages-ts/galerina-core-compiler/src/wat-emitter.ts:1233-1268`, and the fallback traps at `:2115-2122`. TriRegex v0.1.1 still refuses `\\b`/`\\B` and has no capture boundary. | [C20](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c20) | Existing `RD-0795`; related source adjudication `docs/superpowers/specs/2026-08-12-slices-47-49-regex-boundary-adjudication.md`. | Keep the typed interpreter capability bounded; still freeze the exact source/profile semantics, GIR/WAT operation, typed refusal/result and SLIDE/VOK work receipt; either prove word boundaries or retain the affected conversion as refused. |
| Galerina compiler | `checkMethodChain()` is an empty seam at `packages-ts/galerina-core-compiler/src/index.ts:3081-3100`; its current inputs cannot evaluate receiver type, arguments, Result consumption, effects, bindings, readonly mutation, or stage locations. | [C03](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c03) | `RD-1234` (`docs/TODO.md:394-408`). | Replace the stub with a context-rich `callExpr`-integrated checker for `FUNGI-PIPELINE-001..005`, with positive/negative controls and correct preservation of persistent `push`/`append` transforms. |
| Galerina WASM target | `WasmArtefact` and its report decoder at `packages-ts/galerina-target-wasm/src/index.ts:8-18,68-199,201-272` lack module bytes/digest/attestation, section-bound identity, sandbox/effect/limit evidence, physical binding, and an owned cross-package schema. | [C04](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c04) | `RD-1236` (`docs/TODO-MISSING-RD.md:22-48`). | Freeze a versioned schema and report/refusal rules; bind selected artefacts to exact bytes, digest, target and evidence; migrate diagnostics; add missing/forged/mismatched/duplicate/malformed/refused tests. |
| Galerina observability | `JsonLineSink.write()` now isolates an injected writer exception at `packages-ts/galerina-observability/src/logger.ts:61-69`, but the owner has not yet confirmed the swallow-and-void direct-loss semantics. | [C05](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c05) | `RD-1237` (`docs/TODO-MISSING-RD.md:50-75`). | Confirm the direct-sink contract and retain the minimal guard/test; do not invent retry, buffering, delivery, durability or outer-counter semantics. |
| Galerina observability | Logger failure accounting and clock fallback at `packages-ts/galerina-observability/src/logger.ts:190-227` conflates aggregate failures, does not count clock faults, and uses fallback `0` without provenance. | [C06](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c06) | `RD-1238` (`docs/TODO-MISSING-RD.md:79-105`). | Freeze aggregate/cause counter meaning, timestamp fallback/provenance, and serialization-degradation rules; implement the chosen contract; pass the complete clock, redaction, repeated-failure, and combined-failure matrix. |
| Galerina AI accelerator | Report construction at `packages-ts/galerina-target-ai-accelerator/src/index.ts:703-764` lacks an exact report decoder, closed diagnostic validation, and selection-to-report binding; warnings reread caller data at `:715-718`. | [C08](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c08) | `RD-1240` (`docs/TODO-MISSING-RD.md:141-172`). | Freeze the report schema and severity vocabulary; decode once into an immutable snapshot; bind it to the selected capability/plan; add hostile caller-input and false-safe/negative controls. |
| Galerina native target | Artifact admission at `packages-ts/galerina-target-native/src/index.ts:340-367` checks only non-empty text; root containment, file identity, replacement/race policy, digest/VOK binding, and target/ABI/profile binding are absent. | [C09](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c09) | `RD-1241` (`docs/TODO-MISSING-RD.md:174-205`). | Freeze the root/path and identity model; implement canonical containment and binding; add dot-segment, alternate-separator, race, digest, profile, and VOK mismatch refusals. |
| Galerina photonic | Core and target disagree on `PhotonicDiagnostic` shape and amplitude rules at `packages-ts/galerina-core-photonic/src/index.ts:40-47,110-120` and `packages-ts/galerina-target-photonic/src/index.ts:192-196,466-472`. | [C10](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c10) | `RD-1242` (`docs/TODO-MISSING-RD.md:207-245`). | Freeze shared diagnostic meaning, redaction/path/severity semantics, amplitude/presence/signed-zero rules, version and code ownership; then reconcile adapters and add signed-zero regressions. |
| Galerina test/runtime paths | Workspace-root selection and containment at `packages-ts/galerina-test/src/paths.ts:20-27,41-44,55-58` accept roots/targets without the required marker and containment checks. | [C11](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c11) | `RD-1243` (`docs/TODO-MISSING-RD.md:246-272`). | Freeze marker attestation, lexical versus physical containment, Windows namespace/reparse policy, and refusal identity; implement the bounded policy and hostile path fixtures. |
| Galerina compiler/test evidence producer | Build evidence framing at `packages-ts/galerina-core-compiler/scripts/write-build-evidence.mjs:37-48` and `packages-ts/galerina-test/src/runners.ts:94-133` can collide distinct contents under the same path list and accept duplicate JSON key spellings. | [C12](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c12) | `RD-1244` (`docs/TODO-MISSING-RD.md:274-299`). | Adopt a versioned framing/schema that binds compile inputs, configuration, toolchain, consumed outputs, containment and digests; keep duplicate-key refusal and add producer/verifier snapshot tests. |
| Galerina JS target | Import-set validation at `packages-ts/galerina-target-js/src/index.ts:630-650` enforces module-to-plan inclusion but leaves unused plan entries admitted. | [C13](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c13) | `RD-1245` (`docs/TODO-MISSING-RD.md:376-398`). | Owner-select exact set, bag, allowlist, or split-schema semantics; implement the chosen relation and add unused-entry, missing-import, duplicate, and server-only diagnostic controls. |

### Recently bounded, retained for traceability

This row is no longer counted as an active implementation blocker. Its chapter
records the completed bounded change and the residual authority hold so the
former TODO remains auditable.

| Project | Blocker | Full chapter | Current state |
|---|---|---|---|
| Galerina observability/kernel | `metricsAuditSink` previously projected lossy method/path/status data into the full-event audit contract. | [C07](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c07) | Bounded implementation committed in `daa2e92b233a2f4a555fefe6d42a604001cd99b1`; observability package tests are `58/58` pass. Production receipt/durability remains an excluded authority hold. |

## Source TODOs with no RD linkage in the current ledger

These are real implementation or contract blocks, but the current TODO ledger
does not attach an RD number. They are listed rather than silently treated as
resolved. Before implementation, either link an existing RD or create the
smallest owner-approved RD record.

| Project | Blocker and exact source locator | Full chapter | RD linkage | Expected outcome |
|---|---|---|---|---|
| Galerina compiler | Typed-content validation remains a raw-text stub at `packages-ts/galerina-core-compiler/src/index.ts:2555-2575`; the source-preserving parser seam exists, but the validator is not wired to an AST/type environment. | [C14](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c14) | No RD linked in `docs/TODO-MISSING-RD.md:566-585`. | Add the binding/type-environment seam and compiler wiring; prove that protected-secret interpolation is rejected without falling back to name matching. |
| Galerina core-config | The v0.1 `EnvironmentConfig` source at `packages-ts/galerina-core-config/src/index.ts:97-101,1142-1179` conflicts with the v0.2 README contract at `README.md:209-260`. | [C15](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c15) | No RD linked in `docs/TODO-MISSING-RD.md:712-724`. | Freeze one v0.2 schema, source/category vocabulary, and disjoint diagnostic ownership; then update implementation and tests as one contract. |
| Galerina API server/network | Canonical store interfaces and a bounded process-local `MemoryReplayStore` now exist, and app-kernel idempotency now uses explicit atomic `IdempotencyStore.claim(scope,key,ttl) -> claimed \| duplicate` admission after pre-handler refusal gates. The transport still has no replay/HMAC wiring or durable/shared authority. | [C16](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c16) | No RD linked; the live bounded range query was **REFUSED** because tracked RD source paths are dirty. No number was invented. | Retain the explicit atomic claim seam and separate replay/idempotency namespaces; inject replay storage, define durability/multi-process and retry authority, and prove expiry, duplicate handling, HMAC-before-handler ordering, and handler non-execution on refusal. |
| Galerina documentation generator | Placeholder request/response schemas are now refused. `packages-ts/galerina-docs/src/types.ts` defines the versioned `ContractSchemaExport`, and `src/openapi.ts` requires it, validates it, and stamps source/type/version provenance; the real compiler `types {}` export adapter is still absent. | [C17](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c17) | No RD linked in `docs/TODO-MISSING-RD.md:979-986`. | Wire the compiler's governed `types {}` export to `ContractSchemaExport`, then prove source-head and runtime-validator parity with an integration fixture. |
| Galerina conversion overlays | Two source/asset bindings are stale: the 5,000 ms overlay versus the 120,000 ms owner value and retired `packages-galerina` runner paths; see `docs/TODO-MISSING-RD.md:921-938`. | [C18](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c18) | No RD linked; generation-dependent. | Freeze the threshold/path contract after non-`.fungi` work, then regenerate the owning overlays and prove exact source/asset/interpretation parity. |
| Galerina compiler architecture | Stage-B parity, governed JSON codec, and crypto-provider relocation remain open, but are now split into C19-A/C19-B/C19-C at `packages-ts/galerina-core-compiler/TODO.md:207-235`. | [C19](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c19) | No RD linked in `docs/TODO-MISSING-RD.md:987-990`. | Implement and independently verify each bounded owner/contract/test row; do not treat the split as implementation clearance. |

## Deferred technical work, not counted as evidence blockers

The following is real work but is deliberately later in the dependency order:

- The stale Fungi conversion overlays above must be regenerated only after the
  non-`.fungi` component contracts are settled.
- The full Galerina, SLIDE, VOK, and Lyth `.fungi` generation and corpus run
  remain the final assurance wave. No corpus run or full `.fungi` build was
  performed for this manifest.

## Excluded evidence and authority holds

These remain tracked, but they are not counted as implementation blockers in
this document because they require receipts, owner custody, or final assurance
rather than a source/component change:

- `RD-1246` producer/GIR handoff and cross-repository re-admission.
- Lyth P7 checked-Fungi removal/rollback admission and the standing `.fungi`
  pause.
- SLIDE/VOK profile activation, producer receipts, lifecycle/authority release,
  platform/durability evidence, signing, and queue regeneration.
- Owner private-key custody or signing ceremony.
- `RD-1231`, the large unresolved R&D corpus inventory, which remains outside
  this implementation-blocker count; `RD-1265` resolves classification only.
- Full corpus compilation/build, final assurance bundle, and any claim based on
  platform or durability evidence.
- Git branch/working-tree cleanup and CI transport. These are custody and
  backup activities, not implementation blockers for this manifest.

## Exit condition for this manifest

An active row is complete only when its contract is frozen, the source change
is implemented, focused positive and hostile tests pass, the exact source
locator is refreshed, and the row is marked complete in the owning TODO/RD
ledger. Only after the active rows and their generation-dependent prerequisites
are closed should the owner authorize queue regeneration, corpus assurance,
signing, or the full `.fungi` build.

## Search keywords for external research

These are intentionally phrased as real-world research terms suitable for
Google, YouTube, academic repositories, and open-source code search. They are
search prompts, not project authority:

### Current KB-gap review keywords

- bounded source-to-source conversion evidence matrix
- source shadow independent re-derivation compiler
- no general emitter translation existence gap
- one-symbol wave composition congruence proof
- AST GIR source target digest binding
- dependency queue completeness compiler conversion
- parser compiler GIR semantic preservation audit
- conversion manual boundary negative specification
- K3 UNKNOWN non-coercion independent checker
- adaptive interval refinement budget exhaustion incomplete result
- interval enclosure composition theorem modular arithmetic
- cache key semantic dependency graph hash rounding mode
- non-authorizing planner independent verifier provenance
- inverse quantizer interval witness source binding
- exact rational interval endpoint admission proof
- refused packet file ceiling post-draft admission
- evidence packet capacity chunked admission hash chain
- authenticated source forward quantizer inverse quantizer binding
- RD corpus documentary review pending queue
- visual semantic node canonical representation projection
- `.fungi` conversion pilot non-authoritative evidence

### Research leads reviewed after the initial manifest

The following primary-source leads were reviewed in the requested order. Each
surviving technique is recorded as conditional, non-authorizing R&D; none is a
drop-in fix or a clearance of an active blocker:

| Order | Lead | Surviving technique | RD |
|---|---|---|---|
| 1 | Monarch + LEGaTO | Explicit ownership, supervision, checkpoint, and recovery boundaries; preserve `UNKNOWN` instead of silently converting recovery to approval. | `RD-1257` |
| 2 | JxPlatform3 | Flow-sensitive CFG/PDG/SDG slicing for bounded dependency closure and missing-edge queries, guarded by freshness. | `RD-1258` |
| 3 | Neptune/Triton + KWasm | Independent semantics plus deterministic proof/replay gates for bounded WASM and Tri-Fuse characterization. | `RD-1259` |
| 4 | PUG/GProM | Why/why-not provenance graphs for explaining missing TODO/RD edges without treating index absence as proof. | `RD-1260` |
| 5 | CompCert + bag-nabit | Staged semantic-preservation receipts, explicit refusal, input-change invalidation, and custody-separated signing. | `RD-1261` |

Interpretation note: `Legato` was matched to the LEGaTO heterogeneous-computing
project, and `Neptune` to the Neptune/Triton VM proof stack. The reviewed
sources do not establish a direct Galerina or Tri-Fuse implementation.

### 2026-09-21 implementation and benchmark keywords

- full-event audit receipt preserving observer adapter
- mandatory audit capacity reserve before dispatch
- non-authorizing metrics tee full event
- affine audit reservation commit cancel
- audit observer failure isolation
- logger direct writer exception isolation
- logger failure accounting clock provenance
- K3 unknown generic type inference
- deferred generic fallback unwrapOr type checking
- WebAssembly artefact digest attestation section identity
- WebAssembly Decimal lowering ABI rounding
- closure-free higher-order collection lowering
- compiler method-chain effect ownership checker
- native artifact path containment race digest binding
- JSON evidence canonical framing duplicate keys
- exact import set closure compiler target
- SLIDE production lane admission work equivalence
- benchmark uncertified comparison fail closed
- historical WASM non-production benchmark control
- Galerina observability receipt sink durability

### Existing component and compiler search keywords

- WebAssembly module admission validation digest attestation
- WebAssembly import export section identity verification
- WebAssembly sandbox effect capability limits
- WebAssembly Decimal arithmetic lowering f64 bignum ABI
- WebAssembly higher order functions closure conversion map reduce filter
- compiler expression type inference heterogeneous arrays records generics
- type inference anonymous record map entries structural typing
- Option unwrapOr generic fallback type checking
- Result map callback type inference effect typing
- compiler pipeline method chain static analysis dataflow
- fluent API pipeline checker readonly mutation Result consumption
- JSON Lines logger writer failure isolation
- structured logging failure accounting monotonic clock fallback
- logging timestamp provenance signed zero non-finite values
- audit sink receipt preservation metrics adapter
- observer tee versus authoritative audit log
- immutable report snapshot decision binding capability selection
- AI accelerator capability report validation
- native artifact path containment race condition digest binding
- Windows path canonicalization reparse point containment security
- photonic diagnostic schema amplitude signed zero validation
- cross-package schema reconciliation versioned diagnostics
- compiler build evidence reproducible hashing framing
- JSON duplicate key detection canonical parser security
- JavaScript import set closure exact set versus allowlist
- workspace root marker attestation path traversal defense
- source-to-source compiler generated asset parity
- reproducible builds toolchain input output digest closure
- fail-closed compiler security negative testing
- three-valued logic K3 compiler semantics
- typed refusal algebraic data types compiler design
