# Non-evidence blocker chapters

**Date:** 2026-09-22
**Parent manifest:** [BLOCKER-MANIFEST-NON-EVIDENCE-2026-09-20.md](BLOCKER-MANIFEST-NON-EVIDENCE-2026-09-20.md)

This document is the full-description companion for the non-evidence blocker
manifest. The manifest table is the navigation index; each `Cxx` link resolves
to exactly one chapter below. These chapters describe implementation or
component-contract work only. They do not authorize queue regeneration,
signing, corpus assurance, production release, or a full `.fungi` build.

## Current review delta — 2026-09-22

The [pre-.fungi work register](PRE-FUNGI-WORK-REGISTER-2026-09-22.md)
connects these issue chapters to the broader current work programme. Chapters
remain the detailed issue owners; the register is not another implementation
receipt. Reopen source locators before each bounded change. Deliberately
excluded features and missing owner contracts are not all evidence blockers.
No chapter is closed by the documentation-only refresh.

The 2026-09-22 review reproduced C17 own-key loss and C21 resolver
disagreement. The bounded follow-up below repairs those two defects with
regression tests. Isolated Tower subpaths still do not admit every frozen
RD-1295 composition. See the
[source-pinned review](reports/rd1295-c17-review-2026-09-22.md)
and [follow-up evidence](reports/rd-1295-q1-q2-follow-up-2026-09-22.md).
Earlier chapter text is slice/history context; it is not proof that every
proposal, admitted feature or project TODO is complete.

Later the same day: Q1/Q2 certified photonic coupon snapshot-before-verify and
cached coupon revalidation landed in the dirty Tower tree
([report](reports/security-q1q2-continuation-2026-09-22.md), work-register W15).
That slice is not a new `Cxx` chapter and does not close C21 composition
admission. The 124-finding scan, independent audit, production `grantedEffects`,
and Q3 work-performed ceilings remain open. The Governed Computing Constitution
discussion draft is not an issue chapter.

## Chapter format

Each chapter records the current status, exact source boundary, failure mode,
required outcome, and evidence boundary. A focused test is evidence for the
behavior it exercises only; it is not evidence of whole-project readiness.

## Cross-block architecture review — Astra Ultra

**Date:** 2026-09-21. **Authority:** review proposal only; owner contract and
fresh implementation evidence are still required.

The strongest feasible re-architecture is an internal front-end boundary, not
a WASM replacement:

1. Introduce one verified expression/decision representation carrying the node
   kind, resolved type, effects, value-state, source span, and unresolved
   obligations. C01, C03, C14, and C19 should consume this same snapshot rather
   than reconstructing partial facts independently.
2. Split lowering from admission. First produce a content-bound execution
   descriptor containing exact bytes/digest, target, effects, limits, and
   provenance; only then admit it to a backend. This gives C04, C09, C11, and
   C12 one binding seam without turning a report into execution authority.
3. Add target legalization before backend lowering. Decimal remains an exact,
   bounded refusal until its representation, rounding, resource, and host ABI
   are owner-frozen; higher-order operations remain refused until a bounded
   capture-free callback ABI exists. QBE, Cranelift, QuickJS, and uBPF are
   research references, not drop-in authority or sandbox replacements.
4. Split C19 into stage-equivalence, governed-JSON, and injected-crypto
   contracts. Each can then be tested and admitted independently instead of
   allowing one broad integration claim to mask a missing boundary.
5. Treat pattern matching as a typed capability rather than a Boolean host
   helper: certify a compile-time pattern against a versioned supported/refused
   profile, carry its work certificate and subject-domain rules through GIR,
   lower only an admitted target operation, and emit a VOK work receipt. Keep
   dynamic patterns and unsupported features as typed refusals; do not broaden
   this into a general regex replacement or capture API.

This proposal deliberately does not close a blocker, regenerate conversion
queues, authorize signing, or permit a corpus/full-`.fungi` assurance run.

**Implementation status — 2026-09-21:** the C16 app-kernel atomic-claim
slice, the C17 fail-closed OpenAPI schema boundary, the C19 TODO/contract
split, and the C20 interpreter-side typed pattern capability are now
implemented in the working tree with focused evidence. The
shared front-end snapshot, lowering/admission descriptor, target legalization,
transport replay/HMAC path, GIR/WAT pattern operation, VOK receipt, Decimal
ABI and bounded callback ABI remain proposal-only or explicitly refused.

<a id="blocker-c01"></a>
## C01 — Broad expression inference

**Status:** CONTRACT FROZEN and implemented for the listed expression matrix.
**2026-09-21 freeze:** `RD-1275` (with `RD-1274` unwrapOr). Undeclared fields
defer; heterogeneous lists/`Array.of` refuse; `Map.entries()` is
`MapEntry<K,V>`; algebraic `map`/`mapErr` reconstruct payloads; nested
`get`/`?` use `parseTypeString`. `Option.zip` and `checkMethodChain` stay out
of this row.  
**Project:** Galerina compiler.  
**RD:** RD-1232; satellites RD-1247, RD-1248, RD-1250, RD-1251, RD-1252,
RD-1253.

**Exact issue:** `packages-ts/galerina-core-compiler/src/type-checker.ts`
contains the broad expression-inference seam at `:1054-1556`, with consumers
at `:1746-1828`, `:1874-1954`, and `:2064-2297`. Deferred fields, nested
generics, `unwrapOr` fallbacks, heterogeneous lists, anonymous map entries,
and callback-wrapper payloads do not yet have one complete, closed inference
matrix.

**Why it matters:** an incomplete inference result can be accepted by one
consumer and refused or misdiagnosed by another. The fail-closed rule must
distinguish a proven type from an unknown form; it must not coerce `UNKNOWN`
into a convenient inferred type.

**Required outcome:** freeze the deferred-inference and diagnostic contract;
implement every admitted expression kind; add positive, negative, nested,
heterogeneous, and callback-consumer tests; preserve explicit refusal for
genuinely unknown forms.

**Evidence boundary:** current characterization tests show selected cases,
not complete language coverage. No `.fungi` generation or corpus evidence
follows from this chapter.

<a id="blocker-c02"></a>
## C02 — Decimal and higher-order WAT lowering

**Status:** CONTRACT FROZEN; divide/remainder, capture-free reduce, and
instantiate parity added in `RD-1277`. Bare Decimal `/` stays trapped.
**2026-09-21 freeze:** `RD-1276` + `RD-1277`.  
**Project:** Galerina compiler/WAT target.  
**RD:** RD-1233.

**Exact issue:** `packages-ts/galerina-core-compiler/src/wat-emitter.ts:1611-1617,2020-2045`
intentionally refuses Decimal and higher-order collection operations; the
fallback/refusal surface is at `:4503-4534`. An adjacent unsupported-method
escape was narrowed on 2026-09-21: `:2115-2122` now emits an explicit trap
instead of an undefined WAT callee. This does not authorize Decimal or HOF
lowering.

**Why it matters:** emitting an apparently valid WAT fragment without a frozen
Decimal representation, rounding rule, capture policy, or resource bound
would create a target that disagrees with the interpreter and may hide an
unsupported operation behind a successful compile.

**Required outcome:** freeze Decimal representation/ABI, rounding and limit
rules, and a bounded capture-free callback ABI. Implement only admitted cases;
prove interpreter/WAT parity; retain typed traps for unsupported cases.

**Evidence boundary:** current refusal is safer than speculative lowering.
The focused refusal regression is
`packages-ts/galerina-core-compiler/tests/wat-phase25-arithmetic.test.mjs`;
benchmark or legacy WASM results do not authorize a new lowering path.

<a id="blocker-c03"></a>
## C03 — Method-chain checker

**Status:** CONTRACT FROZEN and implemented (`RD-1278`). The stub no longer
returns empty for unknown methods.
**2026-09-21 freeze:** `FUNGI-PIPELINE-001..005` fire from
`method-chain-checker.ts`, wired on outermost method chains.  
**Project:** Galerina compiler.  
**RD:** RD-1234.

**Exact issue:** `packages-ts/galerina-core-compiler/src/index.ts:3081-3100`
contains the empty `checkMethodChain()` seam. Its current inputs cannot check
receiver type, arguments, Result consumption, effects, bindings, readonly
mutation, or stage locations.

**Why it matters:** a fluent chain can appear syntactically valid while
violating ownership, effect, or persistent-transform rules. The checker must
operate on the same typed expression context as the actual call expression.

**Required outcome:** replace the stub with a context-rich,
`callExpr`-integrated checker for `FUNGI-PIPELINE-001..005`; add positive and
negative controls; prove persistent `push`/`append` behavior and correct
stage-local diagnostics.

**Evidence boundary:** no caller-side workaround is a substitute for the
checker contract. Do not close the row from parser or runtime tests alone.

<a id="blocker-c04"></a>
## C04 — WASM artefact admission

**Status:** CONTRACT FROZEN and implemented for `fungi.wasm.artefact.v1`
(`RD-1279`). Signature verification and physical TOCTOU remain outside this
package.
**2026-09-21 freeze:** admitted artefacts bind bytes, digest, attestation,
section identity, limits and effects. Failed artefacts are refused, not
listed as admitted.  
**Project:** Galerina WASM target.  
**RD:** RD-1236.

**Exact issue:** `packages-ts/galerina-target-wasm/src/index.ts:8-18,68-199,201-272`
has no complete module-bytes/digest/attestation contract, section-bound
import/export identity, sandbox/effect/limit evidence, physical-file binding,
or owned cross-package schema.

**Why it matters:** a typed report without exact bytes and execution-bound
evidence can describe a different module from the one admitted or executed.
The report must not turn a diagnostic observation into authority.

**Required outcome:** freeze a versioned artefact/report schema and refusal
rules; bind selected artefacts to exact bytes, digest, target, section
identity, and evidence; migrate diagnostics; add missing, forged, mismatched,
duplicate, malformed, and refused tests.

**Evidence boundary:** current decoder tests are bounded schema evidence only.
They do not prove sandboxing, physical durability, or production execution.

<a id="blocker-c05"></a>
## C05 — Direct logger writer failure

**Status:** CONTRACT FROZEN for the direct sink; residual durability hold unchanged.
**2026-09-21 freeze:** swallow-and-void, no retry, no mediated counter.
See `RD-1269`.  
**Project:** Galerina observability.  
**RD:** RD-1237.

**Exact issue:** `packages-ts/galerina-observability/src/logger.ts:31-34,56-69`
previously allowed an injected `JsonLineSink` writer exception to escape.
The minimal local guard now isolates that exception at `:61-69`.

**Why it matters:** silently swallowing or retrying the direct failure would
change delivery and accounting semantics. The implementation must not invent
buffering, retry, durability, or a typed public failure signal before the owner
chooses those contracts.

**Required outcome:** confirm the swallow-and-void direct-sink decision with
the owner; retain the smallest local guard and regression test; keep mediated
logger failures distinguishable from direct writer failures. The direct path
does not claim delivery, retry, buffering, durability, or visibility through
`Logger.sinkFailures()`.

**Evidence boundary:** the focused package route is **59/59** and the direct
writer regression is at
`packages-ts/galerina-observability/tests/logger.test.mjs:178-186`. This is an
implementation slice only; owner confirmation and the separate RD-1238
counter/clock contract remain open.

<a id="blocker-c06"></a>
## C06 — Logger failure accounting and clock provenance

**Status:** CONTRACT FROZEN and implemented for split counters plus labelled timestamps.
**2026-09-21 freeze:** `RD-1270`. Durability is still excluded.  
**Project:** Galerina observability.  
**RD:** RD-1238.

**Exact issue:** `packages-ts/galerina-observability/src/logger.ts:190-227`
counts some aggregate failures, does not count clock faults, and maps a bad
clock to fallback `0` without provenance.

**Why it matters:** one aggregate count cannot answer whether a failure was a
sink fault, serialization fault, redaction fault, clock fault, delivery loss,
or durability failure. Fallback `0` can also collide with a genuine epoch
timestamp.

**Required outcome:** freeze aggregate/cause counter meaning, timestamp
fallback/provenance, signed-zero and non-finite rules, and serialization
degradation; implement the chosen contract; pass the complete clock,
redaction, repeated-failure, and combined-failure matrix.

**Evidence boundary:** package tests prove current behavior, not the missing
owner decision. Do not close this row by adding an unapproved counter.

<a id="blocker-c07"></a>
## C07 — Metrics audit authority boundary

**Status:** BOUNDED IMPLEMENTATION COMPLETE; residual production receipt and
durability hold is excluded from the active source-blocker count.  
**Project:** Galerina observability/kernel.  
**RD:** RD-1239.

**Exact issue and repair:** the bounded repair is committed as `daa2e92b2`.
`packages-ts/galerina-observability/src/kernel-integration.ts:38-99` now
refuses mandatory evidence capacity without an explicit receipt-preserving
primary, forwards the complete event before observing it when a primary is
present, keeps wrapper reservations affine, attempts one cancellation after
commit failure, and isolates observer failure. `observability.ts:26-31,123-139`
wires `receiptSink`.

**Why it matters:** metrics counts are not a full audit receipt. The kernel
requires synchronous full-event admission and returns `503 audit_unavailable`
when mandatory capacity or commit fails.

**Required outcome:** retain the bounded compatibility behavior, supply an
owner-approved production receipt sink, and separately prove physical custody
and durability before production authority.

**Evidence boundary:** the observability package passes 58/58, but that is not
durability or production deployment evidence. The benchmark suite's
`DEFERRED_NO_SLIDE_LANE` status is unrelated and remains intentional.

<a id="blocker-c08"></a>
## C08 — AI accelerator report admission

**Status:** CONTRACT FROZEN and implemented (`RD-1280`).
**2026-09-21 freeze:** `fungi.ai.accelerator.report.v1` decodes once, closes
severity, and admits `safe:true` only when bound to a decoded capability.  
**Project:** Galerina AI accelerator target.  
**RD:** RD-1240.

**Exact issue:** `packages-ts/galerina-target-ai-accelerator/src/index.ts:703-764`
lacks an exact runtime report decoder, closed diagnostic validation, and
selection-to-report binding; warning construction rereads caller data at
`:715-718`.

**Why it matters:** caller-owned mutable data can diverge from the admitted
selection or capability snapshot, producing a report that looks safe but does
not describe the selected plan.

**Required outcome:** freeze the report schema and severity vocabulary; decode
once into an immutable snapshot; bind it to the selected capability/plan; add
hostile caller-input and false-safe/negative controls.

**Evidence boundary:** a typed report object is not a decision-binding receipt
without the snapshot and binding rules.

<a id="blocker-c09"></a>
## C09 — Native artefact admission

**Status:** CONTRACT FROZEN and implemented (`RD-1281`).
**2026-09-21 freeze:** `fungi.native.artifact.v1` binds a relative locator,
SHA-256 of exact `bytesHex`, VOK `{receiptId,subjectDigest,state:current}`
with `subjectDigest === digest`, and ABI/profile. Path is not identity.
Legacy `{path,target,format}` is refused.  
**Project:** Galerina native target.  
**RD:** RD-1241.

**Exact issue:** `packages-ts/galerina-target-native/src/index.ts:340-367`
previously checked only non-empty text. Root containment, file identity,
replacement/race policy, digest/VOK binding, and target/ABI/profile binding
were absent.

**Why it matters:** a path can resolve to a different file between validation
and use, or an admitted binary can mismatch the selected ABI/profile. Text
non-emptiness is not artefact identity.

**Required outcome:** freeze root/path and identity semantics; implement
canonical containment and binding; add dot-segment, alternate-separator,
reparse/race, digest, profile, and VOK mismatch refusals.

**Evidence boundary:** focused package tests are **22/22**. Physical open,
inode race, and VOK receipt verification remain outside this package.
Platform-specific syscall evidence cannot prove production durability.

<a id="blocker-c10"></a>
## C10 — Photonic diagnostic contract

**Status:** CONTRACT FROZEN and implemented (`RD-1273` amplitude, `RD-1282` shape).
**2026-09-21 freeze:** both packages emit and decode
`fungi.photonic.diagnostic.v1` as
`{schema,code,severity,message,path?,suggestedFix?}`. `message` is redacted
(the former `safeMessage` meaning). Legacy `{code,safeMessage}` is refused,
not aliased. Amplitude remains finite `[0,1]` excluding IEEE `-0`.  
**Project:** Galerina photonic target.  
**RD:** RD-1242.

**Exact issue:** `packages-ts/galerina-core-photonic/src/index.ts:40-47,110-120`
and `packages-ts/galerina-target-photonic/src/index.ts:192-196,466-472`
previously disagreed on `PhotonicDiagnostic` shape and amplitude rules.

**Why it matters:** adapters can disagree about presence, signed zero,
redaction, path, or severity while both satisfy local type checks.

**Required outcome:** freeze shared diagnostic meaning, redaction/path/severity
semantics, amplitude/presence/signed-zero rules, versioning, and code
ownership; reconcile adapters and add signed-zero and malformed-value
regressions.

**Evidence boundary:** core tests **8/8**, target tests **16/16**. Registry
`FUNGI-PHOTONIC-001..006` migration and physical hardware remain outside this
freeze. Cross-package type compatibility is not photonic execution authority.

<a id="blocker-c11"></a>
## C11 — Test/runtime workspace containment

**Status:** CONTRACT FROZEN and implemented for `@galerina/test` paths.
**2026-09-21 freeze:** marker attestation, lexical/physical containment, device-namespace refusal.
See `RD-1272`. Native-artefact C09 planning identity is `RD-1281`; physical
open remains separate.  
**Project:** Galerina test/runtime paths.  
**RD:** RD-1243.

**Exact issue:** `packages-ts/galerina-test/src/paths.ts:20-27,41-44,55-58`
accepts roots and targets without the required marker and containment checks.

**Why it matters:** tests or runtime helpers can operate outside the intended
workspace, especially across Windows namespace, separator, junction, and
reparse-point variants.

**Required outcome:** freeze marker attestation, lexical versus physical
containment, Windows namespace/reparse policy, and refusal identity; implement
the bounded policy and hostile path fixtures.

**Evidence boundary:** a passing test on one local root does not prove the
containment policy for alternate path forms.

<a id="blocker-c12"></a>
## C12 — Build-evidence framing

**Status:** CONTRACT FROZEN and implemented (`RD-1283`).
**2026-09-21 freeze:** `fungi.compiler.build-evidence.v1` uses length-prefixed
set digests, binds tsconfig/`src/**/*.ts`, node+typescript pins, and consumed
`dist/index.js` plus `dist/governance-mode.js`. Legacy
`galerina.compiler-build-evidence.v1` is refused. Duplicate keys remain
pre-parse refusals.  
**Project:** Galerina compiler/test evidence producer.  
**RD:** RD-1244.

**Exact issue:** `packages-ts/galerina-core-compiler/scripts/write-build-evidence.mjs:37-48`
and `packages-ts/galerina-test/src/runners.ts:94-133` previously hashed
`path || NUL || bytes || NUL`, which collided distinct same-path contents, and
inspected JSON keys only after `JSON.parse`.

**Why it matters:** an evidence digest can appear stable while the framed
inputs, configuration, toolchain, outputs, or duplicate-key interpretation
changed.

**Required outcome:** adopt a versioned framing/schema binding compile inputs,
configuration, toolchain, consumed outputs, containment, and digests; retain
duplicate-key refusal; add producer/verifier snapshot and mutation tests.

**Evidence boundary:** focused producer tests **7/7** and the harness route
including runners **43/43**. After `RD-1293` index-accounting of the
C01–C20 compiler `src/`/`tests/` files, the live producer wrote 867
inputs and `verifyBuildEvidence` returned ok. Untracked-input refusal is
unchanged. This is not commit-head freshness. Physical
durability and `.fungi` overlay regeneration remain excluded.
The residual custody and assurance decision is recorded in private `RD-1291`.

<a id="blocker-c13"></a>
## C13 — JavaScript import-set closure

**Status:** OWNER SEMANTICS SELECTED as exact set and implemented at plan-time.
**2026-09-21 freeze:** `RD-1271` (`FUNGI-JS-016` duplicate, `FUNGI-JS-017` unused).
Compiler-derived plans remain future work.  
**Project:** Galerina JavaScript target.  
**RD:** RD-1245.

**Exact issue:** `packages-ts/galerina-target-js/src/index.ts:630-650`
enforces module-to-plan inclusion but leaves unused plan entries admitted.

**Why it matters:** the target may accept a plan containing capabilities or
modules not justified by the selected import set, weakening exact admission
and diagnostic provenance.

**Required outcome:** choose exact-set, bag, allowlist, or split-schema
semantics; implement the relation; add unused-entry, missing-import,
duplicate, and server-only diagnostic controls.

**Evidence boundary:** current inclusion checks do not prove closure in the
opposite direction.

<a id="blocker-c14"></a>
## C14 — Typed-content validation

**Status:** CONTRACT FROZEN and implemented (`RD-1284`).
**2026-09-21 freeze:** `validateTypedContentBlock` takes a binding/type
environment. `{{ identifier }}` interpolations are resolved by type.
`FUNGI-BLOCK-004` refuses `protected …` / `Secret` / `ProtectedSecret`.
A binding named `secret` of type `String` is admitted. Unbound or unclosed
interpolations are `FUNGI-BLOCK-005`. `checkTypes` wires the seam.  
**Project:** Galerina compiler.  
**RD:** RD-1284.

**Exact issue:** `packages-ts/galerina-core-compiler/src/index.ts:2555-2575`
previously contained a source-preserving parser seam, but typed-content
validation was not wired to an AST/type environment.

**Why it matters:** name matching cannot prove that protected-secret
interpolation or typed content is valid in the actual expression context.

**Required outcome:** add the binding/type-environment seam and compiler
integration; prove protected-secret interpolation is rejected without falling
back to name matching.

**Evidence boundary:** focused tests **44/44**. HTML/DOM/CSS structure and JS
syntax validation remain Stage 2. This is not `.fungi` or SLIDE/VOK admission.

<a id="blocker-c15"></a>
## C15 — EnvironmentConfig contract split

**Status:** CONTRACT FROZEN and implemented (`RD-1285`).
**2026-09-21 freeze:** `EnvironmentConfigV2` is
`galerina.config.environment.v2`. Handoff `EnvironmentConfig` stays the
unversioned snapshot. Secret sources are `env|vault|kms|runtime`; categories
are hyphenated. `loadEnvironmentConfig` owns `FUNGI-CONFIG-028/029/030`.
`resolveEnvironmentMode` keeps `001/002`.  
**Project:** Galerina core-config.  
**RD:** RD-1285.

**Exact issue:** `packages-ts/galerina-core-config/src/index.ts:97-101,1142-1179`
previously conflicted with the v0.2 README contract at `README.md:209-260`.

**Why it matters:** configuration producers and consumers can validate
different fields, categories, or diagnostics while both appear versioned.

**Required outcome:** freeze one v0.2 schema, source/category vocabulary, and
disjoint diagnostic ownership; update implementation and tests as one
contract.

**Evidence boundary:** package tests **59/59**. Vault/KMS resolution and
directory split remain outside this freeze. No `.fungi` or SLIDE/VOK
admission.

<a id="blocker-c16"></a>
## C16 — API replay-store contract

**Status:** CONTRACT FROZEN and implemented for HMAC-then-atomic-replay (`RD-1286`).
**2026-09-21 freeze:** optional `webhook` gate on the API transport runs
`channel auth → HMAC(raw body) → claim("replay", eventId, ttl)` before
`kernel.handle`. Invalid HMAC never claims, decodes, or dispatches.
`MemoryReplayStore.claim` is the process-local atomic seam; `has/put` is not
admission. Durable/multi-process storage remains excluded.  
**Project:** Galerina API server/network.  
**RD:** RD-1286. Durable/multi-process assignment remains a residual hold.

**KB freshness recheck — 2026-09-21:** a clean detached KB worktree at
`8acfdce002168af2f1c8f4f303c331610ea7304b` passed the metadata-index self-test
and produced a temporary metadata rebuild, but the range query still returned
`STALE`. The existing `research/RD-TODO-MAP.md` pins older KB/product build
points, while the current product TODO heads differ; the canonical map refresh
itself refuses the dirty product TODOs. This is an index freshness hold, not
evidence that the C16 RD is missing.

**Adjacent-RD check:** the currently untracked KB records `RD-1254` (Fungi
probe/harness patterns), `RD-1255` (external assurance patterns), and `RD-1256`
(generic inference/diagnostic precedents) are explicitly non-authorizing and do
not define the C16 atomic replay/idempotency contract. They are not reused as
C16 linkage.

**Exact issue:** canonical `ReplayStore.has/put` and
`IdempotencyStore.get/put` are exported by
`packages-ts/galerina-core-network/src/index.ts` and documented at
`packages-ts/galerina-core-network/README.md:373-380`, but
`packages-ts/galerina-framework-api-server/src/replay-store.ts:1-70` now
contains only the process-local replay adapter; the transport at
`src/index.ts:624-721` has no replay/idempotency wiring or ordering enforcement.
The app-kernel now owns an explicit atomic
`IdempotencyStore.claim(scope, key, ttlSeconds) -> claimed | duplicate` gate;
the compatibility `seen` method is not part of the admission interface and
delegates to `claim` at
`packages-ts/galerina-framework-app-kernel/src/kernel.ts:97-156`.

**Why it matters:** an unwired store cannot protect the handler, and absent
runtime ordering can bypass expiry, idempotency, or HMAC-before-handler
guarantees even when each local component compiles.

**Required outcome:** select canonical names or an explicit mapping; define an
atomic admission contract; then implement and test replay expiry, idempotency,
and HMAC-before-handler ordering. Do not clear this blocker by adapting
`get/put` to `seen` through a read-then-write sequence.

**Feasible re-architecture:** keep `galerina-core-network` as the owner of the
canonical policy and value contracts; keep sockets, clocks, storage and
handlers in the API-server layer. Add one storage-authority operation with an
explicit atomicity guarantee, for example
`claim(scope, key, ttl) -> claimed | duplicate`, and keep lifecycle
`get/put` records separate from admission claims. Use distinct replay and
idempotency namespaces. The app-kernel's `seen` operation can remain the
atomic seam only if the host can provide that guarantee; otherwise replace it
with the canonical `claim` contract and validate malformed/refused outcomes.
The host should inject verifier and storage dependencies. The fixed guarded
path should be explicit and tested as
`auth -> HMAC over authenticated raw bytes -> atomic replay claim -> existing
decode -> atomic idempotency claim -> remaining gates -> handler`, with audit
reservation and mutation ownership placed consistently in the chosen layer.
**Implementation slice — 2026-09-21, working-tree head
`daa2e92b233a2f4a555fefe6d42a604001cd99b1`:** the proposed atomic boundary is
now published as `AtomicAdmissionStore` plus `AtomicClaimResult` in
`packages-ts/galerina-core-network/src/index.ts`. The app-kernel's in-memory
adapter implements the same explicit result, rejects empty scope/key,
non-finite or non-positive TTL, and refuses malformed claim results. The
kernel now claims only after rate, memory, concurrency, secret and handler
admission gates have passed, so those refusals do not consume a key. Fresh
focused evidence is **195/195** core-network, **236/236** app-kernel and
**29/29** API-server tests, including one-claim concurrent duplicates, exact
expiry, capacity/oversized-key refusal, rate-refusal non-consumption and
malformed-result non-dispatch.

The interface boundary and process-local replay adapter are therefore
implemented for this narrow idempotency slice; API transport replay/HMAC
wiring, durable or cross-process storage, retry/lifecycle policy, and the
remaining mandatory negative ordering matrix remain open. This slice does not
close C16 or authorize corpus/`.fungi` assurance.

**Astra Ultra cross-examination — 2026-09-21:** two concurrent callers can
both observe an absent key under `get/put` or `has/put`, then both write and
proceed. A local mutex cannot establish a cross-process guarantee. The network
record also carries provider/lifecycle/expiry information that the kernel's
route-scoped admission claim does not define. The kernel now defers its claim
until rate, resource, concurrency, secret and handler-admission gates pass;
handler-failure, timeout, expiry, lifecycle and cross-process durability
semantics remain owner-contract decisions, not safe implementation details.

**Mandatory negative evidence before clearance:** barrier-synchronised
duplicates with exactly one claim; invalid or missing HMAC with no replay,
decode, idempotency or handler activity; store refusal and malformed-result
fail-closed behavior; exact expiry boundaries and non-renewal; namespace
isolation; capacity exhaustion; and same-key retries after rate-limit,
resource, handler-failure, timeout and expiry outcomes. The owner must also
choose HMAC freshness, identity scope, failed-attempt consumption,
retry/lifecycle semantics, and durability across processes/restarts.

**Evidence boundary:** do not claim runtime replay or idempotency readiness
from the type declarations or process-local adapter; require the atomic claim
contract, pipeline expiry, duplicate, atomic-idempotency, HMAC-ordering, and
handler-nonexecution tests, plus an explicit durability/multi-process owner
decision.

<a id="blocker-c17"></a>
## C17 — OpenAPI schema ownership

**Status:** bounded export implemented; own-key preservation repaired
(2026-09-22 follow-up, `RD-1287`). `__proto__` names are own enumerable
keys. Docs still refuse them as reserved OpenAPI components.
**2026-09-21 freeze:** compiler `exportContractSchemasFromSource` emits
`galerina.contract-types.v1` from `record` declarations with SHA-256 source
identity. Docs `generateOpenApi` consumes that export. Decimal is refused.
**Project:** Galerina documentation generator.  
**RD:** RD-1287.

**Exact issue:** `packages-ts/galerina-docs/src/openapi.ts` previously converted a
route type name into a placeholder object. The docs package now has an explicit
`ContractSchemaExport` boundary in `packages-ts/galerina-docs/src/types.ts`, but
the compiler export adapter and its docs integration now exist. The current
residual is in `packages-ts/galerina-core-compiler/src/contract-schema-export.ts`
at lines 63, 90, 145 and 150: ordinary object dictionaries lose accepted
__proto__ field/record names while returning success. This produces missing
own properties or a dangling `#/types/__proto__` definition reference.

**Why it matters:** generated API documentation can drift from compiler and
kernel contracts, or imply validation that the runtime does not perform.

**Implementation slice — 2026-09-21:** `generateOpenApi` now requires a
versioned `contractSchemas` export whenever a route references
`requestType`/`responseType`. It validates the schema version and source
identity, refuses missing/empty/non-finite definitions, refuses sanitized
component-name collisions, deep-copies the supplied JSON value, and stamps
the emitted component with source/type/version provenance. Positive and hostile
coverage is in `packages-ts/galerina-docs/tests/generate.test.mjs`; the package
route passed **30/30** on 2026-09-21 (typecheck, build, and both
generation/validation test files).

**Current outcome:** same-source nested records and Array<T> are implemented;
Option/Result/Decimal still refuse. Own-key preservation uses `defineOwn` so
`__proto__` field/record names survive `JSON.stringify`. Compiler export **6/6**;
nested docs **12/12**. Docs OpenAPI refuses reserved component/property names
closed rather than dropping them.

**Required outcome:** preserve admitted own names safely or refuse explicitly;
add field/type-name regression tests, ordinary-name controls, serialized
reference-closure checks and docs-consumer integration. No global prototype
pollution claim is made.

**Evidence boundary:** the generated document is no longer allowed to claim a
contract schema from a name alone. It remains non-authoritative until the real
compiler export is correct and source head, validation owner and runtime
validator are bound. See [the reviewed source hashes and probes](reports/rd1295-c17-review-2026-09-22.md).

<a id="blocker-c18"></a>
## C18 — Conversion-overlay freshness

**Status:** CONTRACT FROZEN for the two stale bindings (`RD-1294`).  
**Project:** Galerina conversion overlays.  
**RD:** `RD-1294`.

**Exact issue:** `docs/TODO-MISSING-RD.md:921-938` records stale source/asset
bindings, including a 5,000 ms overlay versus the 120,000 ms owner value and
retired `packages-galerina` runner paths.

**Why it matters:** regenerating overlays before component contracts settle can
bind generated assets to stale assumptions and force a false green conversion
queue.

**Required outcome:** freeze the threshold/path contract after non-`.fungi`
work; regenerate the owning overlays; prove exact source/asset/interpretation
parity.

**Implementation slice — 2026-09-21:** `RD-1294` updates only the two
stale twins. `myco-search-time-budget-ms.fungi` returns `120000` matching
`SEARCH_TIME_BUDGET_MS = 120_000`. `runner-constants.fungi` returns
`packages-ts/...` paths and `fungi.compiler.build-evidence.v1`.
`FUNGI_LEGACY_PATH_ALIASES` is removed. Overlay primitives **2/2**;
runner-constants **2/2**. The other 39 overlay primitives were already
in parity and were not rewritten.

**Evidence boundary:** this is exact source/asset/interpretation parity
for those two bindings only. It is not a conversion queue, SLIDE overlay
wave, corpus run, or `.fungi` assurance.

<a id="blocker-c19"></a>
## C19 — Compiler architecture TODO split

**Status:** CONTRACT FROZEN for C19-A/B/C as three independent rows
(`RD-1288`, `RD-1289`, `RD-1290`). WASM byte-parity remains outside C19-A.  
**Project:** Galerina compiler architecture.  
**RD:** `RD-1288` (C19-A); `RD-1289` (C19-B); `RD-1290` (C19-C).

**Exact issue:** the former combined Stage-B parity, governed JSON codec, and
crypto-provider relocation. The live TODO splits them into C19-A, C19-B
and C19-C at `packages-ts/galerina-core-compiler/TODO.md`.

**Why it matters:** one umbrella item cannot establish which ABI, owner, tests,
or refusal semantics close each independent architecture change.

**Required outcome:** implement and independently verify each row against its
own contract and test route. Do not treat the split as one combined task.

**Implementation slice — 2026-09-21:** C19-A (`RD-1288`) freezes
`fungi.compiler.stage-b-parity.v1` unique type-code identity.
C19-B (`RD-1289`) freezes `fungi.json.value.v1`.
C19-C (`RD-1290`) freezes `fungi.security.crypto-provider.v1`:
Password/BCrypt/Argon2 use an injected provider. Absent, throwing,
malformed, and wrong-schema providers refuse closed. Compiler stdlib
does not import `bcryptjs` or `argon2`. core-security **19/19**;
compiler injection **4/4**.

**Evidence boundary:** each row is evidence only for its own contract.
WASM byte-parity is not C19-A. JSON fractions are not Decimal. Native
KDF loads only when a host invokes `createNodePasswordKdfProvider`.
The example verifyPassword HTTP serve is still blocked by
`FUNGI-PIPELINE-001`.

<a id="blocker-c20"></a>
## C20 — TriRegex-backed typed pattern boundary

**Status:** OPEN — compile-time PatternCapability identity is frozen
(`RD-1292`); executable WAT/SLIDE/VOK matching remains incomplete.  
**Project:** Galerina compiler, TriRegex, and the SLIDE/VOK boundary.  
**RD:** Existing `RD-0795`; bounded compiler identity `RD-1292`. No
duplicate is created for the missing `findAll`/word-boundary research
question.

**Exact issue:** the interpreter path in
`packages-ts/galerina-core-compiler/src/stdlib.ts:457-471` uses TriRegex with a
bounded subject, pattern length and certified-work limit. The standalone
TriRegex API and certificate are at
`packages-ts/galerina-tri-regex/src/index.ts:12-80` and its documented
supported/refused profile is in `packages-ts/galerina-tri-regex/README.md:53-66`.
The WAT method map at
`packages-ts/galerina-core-compiler/src/wat-emitter.ts:1233-1268` has no
`matchesPattern` operation; the current fallback at `:2115-2122` now emits an
explicit fail-closed trap rather than an undefined callee.

TriRegex still refuses `\\b`/`\\B` and has no capture contract, but the
bounded API now publishes a certificate-bearing `PatternCapability` and a
refusal-on-truncation `findAll` operation. TLL integration, captures and the
Fungi/SLIDE/VOK target contract remain proposed rather than implemented.
The existing Slice 47-49 adjudication therefore remains valid, but its former
wording that WAT emits an undefined `$matchesPattern` callee is historical and
must not be used as current evidence.

**Why it matters:** a checker-visible `matchesPattern` call and a safe
interpreter result do not prove executable Fungi, GIR, WAT, SLIDE, or VOK
parity. A host-computed Boolean would move the decision back into TypeScript;
silently narrowing JavaScript text or anchor semantics would change the source
contract.

**Feasible smallest architecture:**

1. Admit only compile-time pattern specifications for the first conversion
   slice. Produce a typed `PatternCapability` containing the pattern digest,
   supported/refused feature profile, subject-domain profile, and TriRegex cost
   certificate. Dynamic patterns remain interpreter-only or refuse.
2. Carry that capability through one GIR node and target-legalization step.
   Lower to a versioned bounded pattern operation that returns a typed
   `MATCH`/`NO_MATCH`/`REFUSED` result with the refusal reason preserved; do not
   cast the numeric TriRegex result to the governance `Verdict3`.
3. Bind the subject length/encoding, pattern profile, target ABI and certified
   work to the same execution descriptor, then issue a VOK receipt. This is
   the admission seam; it is not a general host regex import.
4. Either add and prove word-boundary support with exact code-point/class
   semantics, or keep Slice 49 explicitly refused. Captures and `findAll` are
   separate future contracts and are not prerequisites for a bounded Boolean
   slice unless an owning conversion requires them.

**Required outcome:** owner-freeze the supported pattern profile, source text
domain, typed refusal/result schema, GIR/WAT operation, SLIDE/VOK receipt
fields, and the word-boundary decision. Then add positive, hostile, chunked,
Unicode, budget and target-mismatch tests at one exact source head before
reopening any regex-dependent conversion.

**Implementation slice — 2026-09-21:** `RD-1292` freezes
`fungi.pattern.capability.v1` in
`packages-ts/galerina-core-compiler/src/pattern-capability.ts`.
`admitPatternCapability` binds SHA-256 of exact pattern bytes, engine
version, certificate bounds, and a closed profile
`{wordBoundary: refused, captures: refused, findAll: interpreter-only,
wat: trap}`. Interpreter `matchesPattern` admits through that function.
WAT emits a named `(unreachable)` for literal and dynamic
`matchesPattern` and does not emit `$matchesPattern`. Focused tests
**5/5**.

These changes do not implement an executable WAT matcher, GIR pattern
node, VOK work receipt, captures, word boundaries, TLL integration or
SLIDE/VOK parity. Existing `RD-0795` remains open. No consumer switch,
queue regeneration, corpus run, signing, or `.fungi` generation.

<a id="blocker-c21"></a>
## C21 — Tower runtime-resolution parity and composition closure

**Status:** resolver parity repaired (2026-09-22 follow-up); composition
admission for every frozen RD-1295 union remains OPEN. Existing RD-1295 owner.
Seven subpaths, named certified/dev factories and kernel graph controls exist.
Tower isolation/products after the resolver repair: **75/75**, no skips.

**Exact boundary:** `packages-ts/galerina-tower-citizen/src/load-graph.ts`
`pickEsmExport` walks own export keys in insertion order against the ESM
condition set. `findInstalledPackage` checks PACKAGE_SELF before nested
`node_modules`. Require-only exports refuse `unsupported-esm-export`.

**Failure mode (repaired):** the previous walker used a fixed
`import`-first condition list and searched `node_modules` before PACKAGE_SELF.
Conditional-export and self-reference fixtures could pass closed-set checks
while omitting Node's runtime target.

**Required outcome (resolver):** done — Node `import.meta.resolve` is the
oracle; allow-lists that omit the runtime target fail. Remaining: map every
frozen profile/composition to a combined admission/refusal test before
claiming full RD-1295 closure.

**Evidence boundary:** /governance is kernel-free cli-check; the frozen
tower.governance.v1 includes kernel. Core-network still installs Tower;
installation alone is not runtime loading. Removing that dependency is a
separate architectural decision, not the fix for this resolver.
Independent completion audit and production/signing receipts remain open.
Source hashes and reproduction detail are in the
[review](reports/rd1295-c17-review-2026-09-22.md).

<a id="blocker-c22"></a>
## C22 — Package graph declaration integration

**Status:** declaration slice repaired 2026-09-22 (live scan 16/16 PASS).
Foreign fungi products use `packageGraph.productAssets` (`tree` + `path`
under the repository root). `loadedAssets` still refuse `../`.
Semantic-assurance dirty provenance and withheld generated roadmap remain
separate EVIDENCE_OR_OWNER_HOLD items.

**Exact boundary:** `scripts/package-graph-generator.mjs:127-156`;
each package's `.graph/boundary-policy.json` and package.json packageGraph
declarations. The [complete refusal table](reports/graph-todo-ledger-refresh-2026-09-22.md#package-refusals-and-next-action)
names every package and refused surface.

**Required outcome:** compare each actual import/entrypoint/asset to its
owner contract, repair the admitted declaration or source seam, and rerun
positive and hostile graph controls. Preserve package containment and exact
load-set closure; do not treat every refusal as permission to widen a policy.
Tower work relates to RD-1295; no new research number is invented here.

**Evidence boundary:** project/KB graphs passing does not close package
policy refusals. Semantic assurance separately refuses dirty retirement
evidence; the generated roadmap was withheld. That custody hold is not
counted as a new source defect or silently cleared by staging.

## Non-blocker benchmark and authority notes

The devtools benchmark contract suite currently passes 113/113. Its
`DEFERRED_NO_SLIDE_LANE`, uncertified comparisons, internal-only governance
rows, and historical-WASM labels are intentional fail-closed states. They are
not implementation blockers to patch in this manifest and must not be changed
to make a report appear green.
