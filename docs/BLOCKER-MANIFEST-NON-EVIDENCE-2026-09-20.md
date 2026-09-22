# Non-evidence blocker manifest

**Date:** 2026-09-22
**Purpose:** identify the remaining work that can change implementation,
component contracts, compiler behaviour, or generated assets. Evidence-only
holds are deliberately excluded from the active blocker count.

The table below is a navigation index, not the full issue record. Every
blocker row links to one corresponding chapter in
[`BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md`](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md),
where the issue, source boundary, required outcome, and evidence boundary are
recorded in full.

<a id="current-action-queue"></a>
## Current action queue — 2026-09-22

The broader [pre-.fungi work register](PRE-FUNGI-WORK-REGISTER-2026-09-22.md)
adds compiler, schema/API, target, downstream-verification and integration
lanes that must not disappear behind this short queue. It separates actual
implementation work, missing owner decisions, deliberate deferrals and
evidence-only holds. Its lane count is not a blocker count. No new completion
or fresh whole-estate test/graph claim is made by the documentation refresh.

The older C01–C20 tables below are a contract-slice catalogue, not a count of
currently unresolved implementation defects. Do not infer a total from their
row count. This reconciliation does not claim all repository TODOs complete.

| Owner | Remaining issue | Full description and expected outcome | RD |
|---|---|---|---|
| Package graph owners | REPAIRED: 16 declaration refusals admitted against live imports; `productAssets` records foreign fungi products. | [C22](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c22): `package-graph-generator.mjs --check` is 100 packages / 201 outputs. Semantic-assurance dirty provenance remains a separate hold. | Package integration follow-up; RD-1295 relevant to Tower, no new RD assigned. |
| Tower | REPAIRED: original conditional-export/self-reference false-green cases. | [C21](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c21): independent runtime-target and wrong-allow-list controls now pass; broader composition admission remains separate. | RD-1295 |
| Compiler/docs | REPAIRED: original __proto__ field/type loss. | [C17](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c17): own keys survive serialization; docs explicitly refuses reserved names. | RD-1287 |
| Tower | Full frozen profile/composition mapping is not established by subpaths alone. | [C21](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c21): explicit manifest/admission and forbidden-composition coverage. Package-dependency removal is a separate architectural decision. | RD-1295 |
| API | Durable multi-process replay is outside the process-local implementation. | [C16](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c16): select the storage contract/owner and implement before claiming durability. | RD-1286 |
| Compiler | Option.zip named typing/schema remains deferred. | [C01](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c01): admitted type contract, then implementation and hostile tests. | RD-1275 |
| Compiler/patterns | Captures, word boundaries and executable target matcher remain outside the closed profile. | [C20](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c20): retain refusal unless a new contract and implementation are admitted. | RD-1292 |
| JSON/compiler | Fractional JSON-to-Decimal mapping remains refused. | [C19](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c19): admitted numeric contract and parity controls before widening the codec. | RD-1289 |
| Tower / security | Q1/Q2 photonic coupon identity is patched in the dirty tree; 124-finding scan remains open. | [W15](PRE-FUNGI-WORK-REGISTER-2026-09-22.md) / [report](reports/security-q1q2-continuation-2026-09-22.md): next Q3 work-performed ceilings; independent audit pending. Constitution discussion draft is not a blocker chapter. | RD-0236, RD-0118, RD-0129 |

The original Tower resolver and C17 defect groups are now repaired and
independently rechecked; they are retained for traceability, not active debt.
The graph row records additional integration findings. Other rows retain
their own contract/deferred status; this table is not a newly authorized
implementation scope. Evidence-only and owner-paused holds remain below.
The [review](reports/rd1295-c17-review-2026-09-22.md) records the original
85-test run and subsequent 93-test rerun, original probes and new source pins.
Larger suite counts below are reported
implementation evidence, not a fresh estate-wide audit.

## Verification boundary

This manifest was built from the current owner TODOs and the exact source
locators recorded in `docs/TODO.md` and `docs/TODO-MISSING-RD.md`.

The source heads checked for this manifest are:

| Repository | Branch | HEAD | Working-tree note |
|---|---|---|---|
| Galerina implementation worktree | `main` | `0f24ca30ef3f173c43a60c914c18b161327f2227` | Mixed working-tree implementation and documentation edits remain; no clean-head or independent-completion claim. |
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
build. See KB record `RD-1265` through the private KB owner
for the advisory Gemini/Grok inputs and Astra adjudication.

## 2026-09-21 bounded implementation session

Keyword encyclopedia: `RD-1268`. Per-issue records: `RD-1269` (C05),
`RD-1270` (C06), `RD-1271` (C13), `RD-1272` (C11), `RD-1273` (C10 amplitude),
`RD-1274` (C01 unwrapOr slice), `RD-1275` (C01 expression matrix),
`RD-1276`/`RD-1277` (C02 Decimal/HOF WAT ABI), `RD-1278` (C03 method chain),
`RD-1279` (C04 WASM artefact admission), `RD-1280` (C08 AI report binding),
`RD-1281` (C09 native path/digest/VOK), `RD-1282` (C10 photonic diagnostic),
`RD-1283` (C12 build-evidence framing), `RD-1284` (C14 typed-content),
`RD-1285` (C15 EnvironmentConfig v2), `RD-1286` (C16 API replay/HMAC),
`RD-1287` (C17 contract schema export),
`RD-1288` (C19-A Stage-B type-code identity),
`RD-1289` (C19-B governed JsonValue codec),
`RD-1290` (C19-C injected CryptoProvider),
`RD-1292` (C20 compile-time PatternCapability / WAT trap),
`RD-1293` (C12 live build-evidence after index accounting),
`RD-1294` (C18 overlay threshold and path parity),
`RD-1295` (Tower Citizen modular product-line).
None of these authorize `.fungi`
generation, queue regeneration, signing, or SLIDE/VOK admission. Chapter
statuses were refreshed in `BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md`.

The residual review is recorded in `RD-1291`. The 123-fail compiler
package claim is stale: a fresh compiler `node --test` of
`tests/*.test.mjs` plus the package subdir globs is **7291/7291**.
`galerina-test` is **236/236** with skipped **0**. Tower RD-1295
isolation+products is **71/71**. The
signed example-app fixture remains **3** unsigned-fuse failures. C12 has a
fresh index-plus-working-tree producer receipt; C18 source/twin parity is
**4/4**. The registry candidate digest mismatch was repaired as an unsigned
candidate-only change; no live signing or admission occurred.

## C01–C13 bounded contract catalogue and residuals

These are the blocks that require a contract decision followed by ordinary
engineering, tests, or source/asset regeneration. A green focused test does
not close a row when the source contract is still incomplete.

| Project | Blocker and exact source locator | Full chapter | RD linkage | Expected outcome |
|---|---|---|---|---|
| Galerina compiler | C01 expression matrix is frozen in `RD-1275`. Residual: `Option.zip` has no named schema. | [C01](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c01) | `RD-1232` + `RD-1275`; satellites `RD-1247`–`RD-1253`. | Retain the frozen matrix; do not invent an `Option.zip` schema. |
| Galerina compiler | C02 Decimal host ABI plus divide/remainder, capture-free `map`/`filter`/`reduce`, and instantiate parity (`RD-1276`/`RD-1277`). Bare `/` stays trapped. | [C02](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c02) | `RD-1233` + `RD-1276` + `RD-1277`. | Keep traps for bare Decimal `/`. |
| Galerina compiler / TriRegex / SLIDE-VOK | C20 compile-time `fungi.pattern.capability.v1` (`RD-1292`) admits patterns with a SHA-256 digest and a closed refused profile. WAT `matchesPattern` emits a named unreachable, not an undefined callee. Word boundaries and captures stay refused. | [C20](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c20) | Existing `RD-0795` + `RD-1292`. | `findAll`, captures, word boundaries, executable GIR/WAT matcher, and SLIDE/VOK remain outside. |
| Galerina compiler | C03 `checkMethodChain` implemented (`RD-1278`). Unknown methods fire `FUNGI-PIPELINE-001`; persistent `append` is not mutation. | [C03](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c03) | `RD-1234` + `RD-1278`. | Domain methods outside the stdlib catalog still 001 until registered. |
| Galerina WASM target | C04 `fungi.wasm.artefact.v1` binds bytes/digest/attestation/sections/limits (`RD-1279`). Error artefacts are refused, not admitted. | [C04](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c04) | `RD-1236` + `RD-1279`. | Signature verification and physical TOCTOU stay with the runtime TCB. |
| Galerina observability | C05 swallow-and-void direct sink is frozen (`RD-1269`). Direct writer loss is not a mediated counter. | [C05](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c05) | `RD-1237` + `RD-1269`. | Retain the guard; no retry/durability. |
| Galerina observability | C06 split counters and labelled `atSource` are implemented (`RD-1270`). | [C06](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c06) | `RD-1238` + `RD-1270`. | No retry/durability. |
| Galerina AI accelerator | C08 report schema `fungi.ai.accelerator.report.v1` decodes once and refuses unbound `safe:true` selections (`RD-1280`). | [C08](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c08) | `RD-1240` + `RD-1280`. | Observational `safe:false` fallbacks remain listed; execution authority is not granted. |
| Galerina native target | C09 `fungi.native.artifact.v1` binds relative locator, bytes digest, VOK subject, and ABI/profile (`RD-1281`). Path is not identity; omitted bytes refuse. | [C09](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c09) | `RD-1241` + `RD-1281`. | Physical open, inode race, and VOK receipt verification remain outside this package. |
| Galerina photonic | C10 `fungi.photonic.diagnostic.v1` is shared (`RD-1282`); amplitude `[0,1]` excluding `-0` (`RD-1273`). Legacy `safeMessage` is refused. | [C10](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c10) | `RD-1242` + `RD-1273` + `RD-1282`. | Registry `FUNGI-PHOTONIC-001..006` migration and hardware remain outside this freeze. |
| Galerina test/runtime paths | C11 marker attestation and containment implemented (`RD-1272`). | [C11](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c11) | `RD-1243` + `RD-1272`. | C09 planning identity is `RD-1281`; physical native open remains separate. |
| Galerina compiler/test evidence producer | C12 `fungi.compiler.build-evidence.v1` (`RD-1283`). After index-accounting (`RD-1293`), live producer wrote 867 inputs and verifier returned ok. Untracked inputs still refuse. | [C12](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c12) | `RD-1244` + `RD-1283` + `RD-1293`. | Not commit-head freshness. The runner twin now uses the current schema string; queue and exact-head assurance remain held. |
| Galerina JS target | C13 exact-set implemented (`RD-1271`, `FUNGI-JS-016`/`017`). | [C13](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c13) | `RD-1245` + `RD-1271`. | Compiler-derived plans remain future work. |

### Recently bounded, retained for traceability

This row is no longer counted as an active implementation blocker. Its chapter
records the completed bounded change and the residual authority hold so the
former TODO remains auditable.

| Project | Blocker | Full chapter | Current state |
|---|---|---|---|
| Galerina observability/kernel | `metricsAuditSink` previously projected lossy method/path/status data into the full-event audit contract. | [C07](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c07) | Bounded implementation committed in `daa2e92b233a2f4a555fefe6d42a604001cd99b1`; observability package tests are `58/58` pass. Production receipt/durability remains an excluded authority hold. |

## C14–C19 contract catalogue — RD linkage now present

The former six unlinked rows now have the RD owners shown below.
An RD link or bounded slice does not close a residual contract or defect.

| Project | Blocker and exact source locator | Full chapter | RD linkage | Expected outcome |
|---|---|---|---|---|
| Galerina compiler | C14 `validateTypedContentBlock` uses a binding/type environment; `FUNGI-BLOCK-004` refuses `protected`/`Secret` interpolations by type (`RD-1284`). A `String` binding named `secret` is admitted. | [C14](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c14) | `RD-1284`. | HTML/DOM/CSS structure and JS syntax checks remain Stage 2. |
| Galerina core-config | C15 freezes `EnvironmentConfigV2` / `galerina.config.environment.v2` (`RD-1285`). Loader uses `FUNGI-CONFIG-028/029`; mode keeps `001/002`. Live sources are `env\|vault\|kms\|runtime`; categories are hyphenated. | [C15](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c15) | `RD-1285`. | Handoff snapshot stays unversioned `EnvironmentConfig`. No directory split. |
| Galerina API server/network | C16 wires HMAC-then-`claim(scope=replay)` before kernel decode/handler (`RD-1286`). Invalid HMAC does not claim, decode, or dispatch. Process-local only. | [C16](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c16) | `RD-1286`. | Durable/multi-process storage and retry/lifecycle remain outside this freeze. |
| Galerina documentation generator | C17 source-bound export supports same-source nested records and arrays; own-key schema preservation has a reproduced defect. | [C17](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c17) | `RD-1287`. | Fix special-name loss; Option/Result/Decimal remain refused. |
| Galerina conversion overlays | C18 twins now match live TypeScript (`RD-1294`): search budget `120_000` and `packages-ts` runner paths / `fungi.compiler.build-evidence.v1`. Legacy aliases removed. | [C18](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c18) | `RD-1294`. | Not a conversion-queue or SLIDE overlay-wave regeneration. |
| Galerina compiler architecture | C19-A (`RD-1288`), C19-B (`RD-1289`), and C19-C (`RD-1290`) are frozen as separate contracts. WASM byte-parity remains outside C19-A. | [C19](BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md#blocker-c19) | `RD-1288` / `RD-1289` / `RD-1290`. | Do not treat C19 as one combined task. |

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

### Current implementation review keywords

- Node.js ESM conditional exports object property order
- Node.js package self-reference resolution nested node_modules
- static module load graph runtime resolution equivalence
- closed-world module allowlist false negative
- package dependency allowlist governance entrypoint reachability graph
- cross-package asset ownership path containment manifest
- JavaScript __proto__ own property dictionary Object.create(null)
- JSON Schema required properties reference closure serialization
- product-line dependency closure composition admission negative testing
- durable replay atomic claim multi-process crash recovery

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
