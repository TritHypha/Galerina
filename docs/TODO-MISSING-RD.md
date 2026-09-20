# Missing R&D TODO

**Status:** active working queue; non-authorizing

**Purpose:** record only the questions that cannot be completed from the current
source, tests, existing R&D, or ordinary engineering deduction. A missing item is
not a stop signal: complete the bounded implementation around it, record the
smallest unresolved question here, and continue.

## Current scope

This queue excludes the following records from the present review:

- `RD-0822`, `RD-0832`, `RD-0836`, `RD-0837`, `RD-0840`, `RD-0855`,
  `RD-0858`, `RD-0873`
- `RD-1231`

It also does not authorize a corpus compile, conversion-queue regeneration,
`.fungi` build, signing or custody action, platform/durability work, or final
assurance. Those remain later gates after the component work is complete.

## Open questions to resolve, not implementation blockers

### M-RD-001 — SLIDE general-backend profile

- **Locator:** `SLIDE/TODO.md:1286-1298` and
  `SLIDE/src/v2c-general-backend-scope.mjs:114-122`
- **Missing decision:** choose the first bounded profile for loop-carried state,
  data-dependent loops, recursion/callbacks, or cross-package effects; define its
  limits and refusal cases.
- **What can proceed now:** preserve the existing bounded backend and prepare a
  narrow registry/test seam. Do not invent a broad general backend.
- **Bridge question:** which single profile gives useful progress without
  changing the existing authority boundary?

### M-RD-002 — SLIDE native-provider descriptor boundary

- **Locator:** `SLIDE/TODO.md:1539-1550`
- **Missing decision:** the exact provider descriptor, admission/refusal vectors,
  and dependency on the selected general-backend profile.
- **What can proceed now:** document and test the boundary shape only; defer
  provider implementation until M-RD-001 is settled.
- **Bridge question:** what is the smallest closed descriptor that can be admitted
  without making provider identity or capability claims on behalf of an owner?

### M-RD-005 — SLIDE publication rollback after parent replacement

- **Bounded closure locator:** `SLIDE/src/checked-fungi-package-file.mjs:159-178`
  validates the retained stage/output directory identities before each owned
  unlink and before directory removal; the `finally` cleanup route is at
  `:307-312`. `SLIDE/src/filesystem-identity.mjs:60-78` remains the identity
  revalidation primitive.
- **Fresh evidence:**
  `SLIDE/tests/checked-fungi-package-file.test.mjs:163-178` now proves the
  parent-swap publication returns `REFUSED` and leaves no owned entries under
  the moved parent. The focused publication/identity route is **41/41 pass**.
- **Remaining production blocker:** this is retained identity-anchor,
  pathname-based reference cleanup, not descriptor-relative `openat` authority.
  Production release still requires an owner-approved descriptor-relative or
  equivalent retained-handle publication/rollback primitive and cross-platform
  evidence. Do not promote the package publisher to production authority from
  this bounded result.

### M-RD-003 — Galerina boundary semantics that are not yet source-defined

- **Locators:** `Galerina/docs/TODO.md:1114-1120`, `1185-1220`,
  `1401-1409`, `1432-1439`, `1464-1505`, and `1594-1617`
- **Missing decision:** none has been proven yet as a new research problem. These
  rows are implementation candidates first: exact own-data decoding, immutable
  snapshots, typed refusal, bounded traversal, and alias-safe reports.
- **What can proceed now:** implement each as a small source/test slice using
  existing fail-closed rules. Promote an item here only if implementation and
  existing R&D leave a specific semantic question unresolved.
- **Bridge question:** identify only the cases where ordinary typed-boundary
  reasoning is insufficient, and state the smallest experiment needed.

**Current Astra disposition:** no new R&D is required for the selected JS report
slice. Exact own-data decoding, bounded arrays, immutable snapshots, and explicit
refusal are ordinary engineering deductions already required by the existing
TODO and R&D. The delivered slice is recorded at `Galerina/docs/TODO.md:1461-1463`
and `Galerina/docs/TODO.md:1510-1513`; the exact source is
`packages-ts/galerina-target-js/src/index.ts:123-695`, with focused regressions
at `packages-ts/galerina-target-js/tests/js-target-contracts.test.mjs:104-220`.

The same disposition applies to the CPU eligibility slice at
`Galerina/docs/TODO.md:1502-1505` and `Galerina/docs/TODO.md:1510-1513`. Its exact source
boundary is `packages-ts/galerina-target-cpu/src/index.ts:78-534`, with focused
regressions at `packages-ts/galerina-target-cpu/tests/cpu-target-contracts.test.mjs:56-158`.
The required result is ordinary fail-closed admission: malformed or unknown
capability evidence yields no selected plan; unknown memory cannot satisfy a
declared limit; and returned capability/plan data is copied and immutable.

### M-RD-004 — JS import-set closure

- **Locator:** `packages-ts/galerina-target-js/src/index.ts:642-648`
- **Current behavior:** every module import must appear in the admitted plan
  import set; this closes the observed module-to-plan leak.
- **Unresolved contract:** whether the reverse direction must also hold—whether
  every plan import must be represented by a module metadata entry. The current
  source and tests do not establish that equality, so adding it would be a
  semantic change rather than a mechanical hardening.
- **Smallest next action:** ask the bridge for the owner contract or existing R&D
  evidence. Until then, retain the one-way fail-closed check and do not widen the
  report claim.

### Astra contract review — 2026-09-20

- **Receipt:** the composed prompt and complete advisory reply are retained in
  the active task review receipt. Prompt SHA-256:
  `C2C3CB3505C071D728C0CD2F91BCB190C6A076CD06C0F7B080F31B95F1CEAA6B`.
  Reply SHA-256:
  `DBBB620D4C09D016B20C23E161627EDC689AA3A9A70ECEFF2A4E9B9309773A39`.
  Reviewer attempt: `01a0bc56-9e9f-7bd0-9ffb-21fd250c2de8`.
- **Independent live recheck:** the observability package passed its bounded
  typecheck/build/test route **43/43**, and the WASM target package passed its
  bounded typecheck/build/test route **4/4**. These results verify the current
  tests only; they do not close unspecified contracts.
- **Disposition:** no TODO was closed and no new RD record was minted. Astra
  found no genuinely new research problem: the logger items are ordinary
  implementation candidates only after an explicit failure/redaction/clock
  contract, while the WASM items remain an admission-authority decision.
- **Exact unresolved logger blockers:**
  `packages-ts/galerina-observability/src/logger.ts:56-63`,
  `JsonLineSink.write`, can propagate a direct writer exception even though
  `LogSink.write` claims non-throwing isolation; the surrounding catch is only
  `:144-175`. Nested redaction and prototype-safe copying remain at
  `:177-181`; failure accounting and clock semantics remain at `:144-175`.
  **Fail closed:** keep these open until owner contract plus direct-call,
  logger-mediated, hostile-property, secondary-failure, and clock tests exist.
- **Exact unresolved WASM blockers:**
  `packages-ts/galerina-target-wasm/src/index.ts:47-80`,
  `validateWasmArtefact`, is compile-time typed rather than a runtime decoder;
  `:84-95`, `createWasmTargetReport`, accepts caller-owned typed input and
  aliases the artefact array. **Fail closed:** no admission claim until the
  owner defines runtime schema/refusal, immutable ownership, path containment,
  trusted bytes-digest binding, import/export authority, diagnostic ownership,
  and migration/rollback evidence.
- **Exact unresolved Photonic schema blockers:** the ingress implementation is
  now closed for the bounded decoder slice at
  `packages-ts/galerina-target-photonic/src/index.ts:237-391`, with validator
  entrypoints at `:396-447` and `:450-518`. It captures own data once and
  refuses inherited/accessor/transparent-proxy/surplus/custom/sparse records,
  overlong text and malformed nested channels. The focused package suite is
  **10/10**, including hostile cases at
  `packages-ts/galerina-target-photonic/tests/photonic-contracts.test.mjs:46-85`
  and `:127-160`; the source commit is
  `83d5d920833adcefa93001f3d97dce201ecef4df`.
  **Fail closed:** the remaining blocker is the owner contract, not raw
  JavaScript ingress: exact binary64 boundary/Option/UTF-16 rules remain
  undefined at the `OpticalChannelLayout` interface
  `packages-ts/galerina-target-photonic/src/index.ts:149-154`, and the
  legacy diagnostic names still require registry ownership at
  `Galerina/docs/TODO.md:1436-1439`. Do not claim Photonic admission until
  those two contracts are resolved and tested.

## Bridge preparation

Grok is temporarily unavailable. When the bridge returns, ask the three questions
above with the exact locators and request a decision, counterexample, or refusal
case—not general commentary. The Astra contract review is recorded above and did
not clear any blocker or mint a new R&D record.

The R&D metadata query remains refused because tracked private RD sources are
dirty. That limits an exhaustive current-coverage claim, but it does not block
source-supported implementation slices. The refreshed Galerina code graph is
exact at source head `83d5d920833adcefa93001f3d97dce201ecef4df` with
`66,437/66,437` nodes and `166,525/166,525` edges, zero skipped files, and an
artifact present. The canonical Myco owner refused a repository-root refresh
with `MYCO-INDEX-TOO-LARGE` after `4,879` files / `2,000,000` term edges;
the previous root snapshot remains a historical locator only. Use a bounded
package-root Myco index if discovery is needed; do not turn the refusal into a
MISS or an absence claim.

If Astra or the bridge produces a genuinely new technical result, create a new
KB-owned `RD-*` record for that issue before relying on it. The record must contain
the question, source/head, evidence or counterexample, decision, and the exact
implementation consequence. Do not create an RD record for a gap already covered
by existing R&D or ordinary engineering deduction.

## Deferred, not forgotten

The following remain visible elsewhere and are intentionally not treated as
missing R&D in this pass:

- Lyth’s five external/non-authorizing handoff holds.
- VOK’s current reference-only component boundary.
- signing, private-key custody, platform/durability, production authority, and
  final assurance gates.
- corpus compilation, conversion queue regeneration, and bulk `.fungi` work.

## Exact blocker ledger

These are recorded separately from missing R&D: they are current owner or
architecture gates, not reasons to invent a research record.

**Locator rule (2026-09-20):** every open blocker below must identify the
repository-relative file, the current 1-based line range, the relevant symbol
or contract, the fail-closed condition, and the evidence that would clear it.
After any source change, recheck the exact head and refresh the line range
before treating the entry as current. A TODO description without a source
locator is not sufficient evidence of a blocker or of completion.

- **SLIDE general-backend boundary:** `SLIDE/src/v2c-general-backend-scope.mjs:114-126`,
  symbol `OPEN` as consumed by `deriveGeneralBackendScopeManifest()` at
  `:170-178`, with owner status at `SLIDE/TODO.md:1286-1298`. **Fail closed:**
  general loop bodies and general effects remain outside the bounded contract
  set, so no producer or profile may claim them. **Clearance evidence:** an
  owner-frozen scope/schema plus focused positive and hostile refusal tests at
  one exact source head; the already implemented bounded contracts are not to
  be rebuilt.
- **SLIDE native-provider boundary:** the owner contract is described at
  `SLIDE/docs/DEMAND-ADMITTED-NATIVE-PROVIDERS.md:292-330`, with status at
  `SLIDE/TODO.md:1539-1565`; the implementation admission point is not yet
  source-defined. **Fail closed:** descriptor, semantic/target schema and
  provider admission cannot be inferred from the proposal. **Clearance
  evidence:** frozen descriptor/schema/admission contracts, implementation
  tests for hostile and mismatched providers, and exact owner receipt.
- **SLIDE package-publication rollback:** the bounded moved-parent residual is
  closed at `SLIDE/src/checked-fungi-package-file.mjs:159-178,307-312`; the
  current race test at `SLIDE/tests/checked-fungi-package-file.test.mjs:163-178`
  proves refusal and zero owned entries under the moved parent, with the
  focused route at **41/41 pass**. **Fail closed:** production authority still
  requires an owner-approved descriptor-relative/retained-handle primitive and
  cross-platform evidence; no pathname cleanup or focused test releases it.
- **SLIDE owner evidence and activation:** status is recorded at
  `SLIDE/TODO.md:305-311,313-320,1466-1473`; the source-side activation
  contract is `SLIDE/src/checked-fungi-package-file.mjs:159-178,307-312`.
  **Fail closed:** owner ceremony/receipt, profile ordering, production
  authority and exact per-file package parity are absent; the bounded test
  cannot release them. **Clearance evidence:** owner-supplied ceremony and
  receipt bytes, descriptor-relative/retained-handle authority, and a fresh
  exact-head parity run.
- **Lyth-Weaver handoff:** status is recorded at
  `lyth-weaver/TODO.md:89-91,107-109,133-145`; the local authorizing boundary
  is `lyth-weaver/TODO.md:14-18`. **Fail closed:** process-root, conversion,
  detached-GIR and SLIDE/VOK re-admission evidence is external to Lyth, so its
  laboratory proof cannot mint `ALLOW` or reopen `.fungi`. **Clearance
  evidence:** matching Galerina producer, detached GIR, SLIDE re-derivation
  and VOK receipt at one exact head.
- **AGENTS capability route:** `AGENTS/docs/TODO.md:32-37` records the
  canonical Myco refresh as current at the bounded ledger commit. The last
  fresh graph receipt was at AGENTS head
  `677a0b122993318cf4dd8f6ca9e7ae59d73f1853` with **3,582/3,582 nodes**,
  **6,939/6,939 edges** and zero skipped files. After the AGENTS ledger moved
  to local head `c68276eb54cefb0a37260b60225734841603093d`, both the canonical fast and moderate refresh
  attempts still returned `indexed_head_sha=677a...`; this is an external
  freshness refusal, not current graph evidence. The route also excludes
  `docs`, `tools` and several skill trees and has no shareable artifact.
  Refuse current absence/closure claims; source-origin approval and
  receiving-task installation remain separate owner gates.
- The current bounded route controls were independently refreshed at AGENTS
  HEAD `c68276eb54cefb0a37260b60225734841603093d`: audit-map **5/5 fixtures
  and 9/9 tests**, context-route **30/30**, context-retrieve **12/12**, and
  both effort-governor self-tests **OK**. **Fail closed:** these are routing
  controls, not a fresh graph or PROJECT receipt; they do not clear the Myco
  freshness or source-origin gates.
- **AGENTS mixed-EOL admission:** `AGENTS/tools/bounded-tool-batch.mjs:1264`
  symbol `validateEolEvidence` rejects the live worktree's mixed tracked-file
  EOL evidence, reached through `observeWorktreeAggregate` at `:1452` and the
  self-test snapshot at `:1789`. **Fail closed:** this is a deliberate
  `REPOSITORY_REFUSED` result, not a test to bypass. **Clearance evidence:**
  the owner must decide the mixed-EOL policy and provide exact current
  evidence before this route can be admitted. Do not rewrite line endings
  solely to obtain a green self-test.
- **Galerina typed-content validation:**
  `Galerina/packages-ts/galerina-core-compiler/src/index.ts:2555-2575` is
  still a raw-text stub for `validateTypedContentBlock()`; the function accepts
  only `blockType`, `marker`, `content`, `file`, and `startLine`, so it has no
  binding/type environment from which to prove that a `ProtectedSecret` is
  emitted. A bounded source search found no production call site that invokes
  this validator; the only current test reference is the explicit stub contract
  at `packages-ts/galerina-core-compiler/tests/compiler-safety-contracts.test.mjs:394-404`,
  which asserts an empty diagnostic list. The source-preserving parser seam is now implemented at
  `packages-ts/galerina-core-compiler/src/lexer.ts:22-37` and `:358-420`,
  `src/parser.ts:100-108`, `:1616-1643`, and `:2760-2768`, with regressions at
  `tests/typed-content-block-ast.test.mjs:14-49`. The remaining blocker is the
  AST/type-environment validation layer and compiler wiring, not raw content
  capture. The canonical
  contract explicitly records the dependency at
  `ZTF-Knowledge-Bases/reference/galerina/galerina-core-syntax-typed-content-blocks.md:233-250`
  and its implementation-status table at `:266-272` still needs an owner-side
  refresh for the new seam. Do not replace the remaining validation with a
  name-matching regex; the smallest exit is a binding/type-environment seam
  and a negative secret-interpolation test before implementation.
- **Galerina expression type coverage:**
  `Galerina/packages-ts/galerina-core-compiler/TODO.md:38-44` remains open.
  The live checker now has verified bounded assignment/call checks at
  `packages-ts/galerina-core-compiler/src/type-checker.ts:447-531`,
  `:895-907`, `:1230-1241`, `:1565-1630`, `:1676-1724`, and `:1865-1925`,
  including `Option<T>.unwrapOr()` generic payload retention, recursive
  generic payload checks and full generic signature retention. The bounded
  single-spread record-update slice is implemented at
  `packages-ts/galerina-core-compiler/src/type-checker.ts:1142-1155`, with
  hostile/unknown-base coverage at
  `packages-ts/galerina-core-compiler/tests/type-checker-record-update.test.mjs:11-51`;
  the focused and adjacent type-checker evidence is **118/118** at source
  commit `489ef192494d30b32d6efa57df1be88229e80f6c`. Its deferred-work contract
  still requires complete expression-level inference before claiming
  TYPE-002/005-007 done. A bounded match-expression slice is now closed at
  Galerina implementation commit `1b10d5e32c6f1362dfb2df6232fb39d08570c85c`:
  `packages-ts/galerina-core-compiler/src/parser.ts:2776-2778` admits `match`
  in expression position, and
  `packages-ts/galerina-core-compiler/src/type-checker.ts:1476-1527` unwraps
  expression-arm blocks and joins only assignment-compatible numeric arms.
  Regression coverage is
  `packages-ts/galerina-core-compiler/tests/type-checker-phase11-wave2.test.mjs:197-263`,
  with bounded compiler **104/104**, parser/domain **138/138**, and
  interpreter/match **61/61**. The related `Array<Auto>` call-boundary false
  positive is closed at
  `packages-ts/galerina-core-compiler/src/type-checker.ts:472-483`, with its
  regression at
  `packages-ts/galerina-core-compiler/tests/type-checker-generic-assignment.test.mjs:71-85`
  and the SLIDE G4 adapter contract at
  `packages-ts/galerina-core-compiler/src/self-hosted/slide-gfrontend-fixture-adapter.fungi:93-156`;
  the focused combined route is **40/40**. The algebraic-constructor and
  named-alias slice is closed at
  `packages-ts/galerina-core-compiler/src/type-checker.ts:680-697,1156-1168,1197,1393-1411,1721-1747,1766-1785`;
  its focused route is **32/32**, and the last full compiler package run before
  the Set slice was **6,784/6,784** at `e67db0ce0`. A bounded Array list-method
  slice now closes
  `first`/`last` → `Option<T>` and `append` → `Array<T>` at
  `packages-ts/galerina-core-compiler/src/type-checker.ts:1290-1295`, with
  positive/negative coverage at
  `packages-ts/galerina-core-compiler/tests/type-checker-generic-assignment.test.mjs:168-198`
  (**11/11** in-file; **34/34** focused combined route). A bounded Map-method
  slice now closes `Map.empty()` → `Map`, `keys()` →
  `Array<K>`, `values()` → `Array<V>`, and persistent
  `set`/`delete`/`remove`/`merge` → `Map<K,V>` at
  `packages-ts/galerina-core-compiler/src/type-checker.ts:1204-1207,1307-1327`.
  Positive/negative coverage is
  `packages-ts/galerina-core-compiler/tests/type-checker-generic-assignment.test.mjs:200-232`
  (**13/13** in-file; **36/36** focused combined route), with the
  interpreter-backed collection route **115/115**. `entries()` remains
  `Array<Auto>` because its anonymous `{key,value}` record has no admitted
  named schema at this boundary. A bounded Set-method slice now closes
  `Set.empty()`/`Set.from()` → `Set`, type-preserving
  `add`/`remove`/`union`/`intersection`/`difference` → `Set<T>`, and
  `toList`/`toArray` → `Array<T>` at
  `packages-ts/galerina-core-compiler/src/type-checker.ts:1209-1211,1329-1341`.
  Positive/negative coverage is
  `packages-ts/galerina-core-compiler/tests/type-checker-generic-assignment.test.mjs:234-266`
  (**15/15** in-file; **132/132** combined bounded collection route).
  Callback transforms `map`/`filter` remain deferred. Array static constructors
  are now bounded at
  `packages-ts/galerina-core-compiler/src/type-checker.ts:1212-1224`:
  `Array.empty()` → `Array`, homogeneous `Array.of(...)` → `Array<T>`, and
  `Array.range(...)` → `Array<Int>`. Coverage is
  `packages-ts/galerina-core-compiler/tests/type-checker-generic-assignment.test.mjs:268-295`
  (**17/17** in-file; **132/132** combined bounded collection route). Mixed or
  unknown `Array.of` element types remain `Array<Auto>` and defer. The remaining
  expression inference is open at
  `packages-ts/galerina-core-compiler/src/type-checker.ts:1054-1532`
  (`TypeChecker.inferType`), with the return consumer at `:1721-1804`, call
  consumer at `:1850-1930`, and binding consumer at `:2038-2273`. A bounded
  Option/Result sequence-constructor slice is closed at
  `packages-ts/galerina-core-compiler/src/type-checker.ts:1226-1246`:
  `Option.sequence(Array<Option<T>>)` retains `Option<Array<T>>`, and
  `Result.sequence(Array<Result<T,E>>)` retains `Result<Array<T>,E>`, matching
  the runtime combinators at `packages-ts/galerina-core-compiler/src/stdlib.ts:2567-2601`.
  Coverage is
  `packages-ts/galerina-core-compiler/tests/type-checker-generic-assignment.test.mjs:297-327`
  (**19/19** focused and **134/134** combined). Malformed or untyped inputs
  remain bare algebraic types and defer. A bounded
  constructor slice is now
  closed at `packages-ts/galerina-core-compiler/src/type-checker.ts:1156-1168`
  and `:1710-1724,1744-1762`; `Some`, `Ok`, and `Err` retain inferable payloads and
  concrete mismatches are refused. Coverage is
  `packages-ts/galerina-core-compiler/tests/type-checker-generic-assignment.test.mjs:90-165`
  (**32/32** focused tests). Do not mark TYPE-002/005-007 complete from
  these bounded slices.
- **Galerina core-config v0.2 contract:**
  `Galerina/packages-ts/galerina-core-config/TODO.md:41-72` is explicitly
  blocked because the source `src/index.ts:97-101` still exposes the v0.1
  `EnvironmentConfig`, while `README.md:209-218` requires a v0.2 schema and
  policy shape. The source secret contract at `src/index.ts:1142-1179`
  conflicts with the README source/category contract at `README.md:221-243`,
  and the loader diagnostics at `README.md:246-260` collide with the existing
  `resolveEnvironmentMode` ownership at `src/index.ts:218-255`. **Fail closed:**
  do not add implementation or split internal directories until the owner/KB
  publishes one schema version, one source/category vocabulary and disjoint
  diagnostic ownership. The live package currently passes typecheck and
  **54/54** tests, but that evidence covers only the existing v0.1/config-vault
  surface.
- **Galerina native-target residual admission:** the bounded decoder and
  immutable snapshot are implemented at
  `Galerina/packages-ts/galerina-target-native/src/index.ts:85-165`,
  `:173-277`, `:369-443`, and `:445-484`, with **12/12** focused tests at
  `Galerina/packages-ts/galerina-target-native/tests/native-contracts.test.mjs:42-67`
  and `:102-157`. The remaining blocker is the artifact path check at
  `:340-367`: it proves only non-empty text; canonical containment and binding
  of selected ABI/profile to the exact artifact, target, digest and VOK
  evidence are not source-defined. This remains an owner/architecture gate,
  not a reason to invent an R&D result or promote native validation.
- **Galerina observability route authority fix (closed):**
  `packages-ts/galerina-observability/src/observability.ts:52-95,112-113`
  now admits only the exact inert route-option data schema, rejects unknown
  keys/symbols/accessors/hostile prototypes and invalid scalar values, and
  injects the trusted registry and metrics instances last. Hostile override
  vectors are covered at
  `packages-ts/galerina-observability/tests/kernel-integration.test.mjs:200-225`;
  the package evidence is **46/46** with clean typecheck/build. This closes
  the authority replacement blocker; the following health/logger items remain
  separate.
- **Galerina substrate NMR numerical/termination bound (closed):** the shared
  recurrence now exports `MAX_NMR_N = 1019` at
  `packages-ts/galerina-substrate-math/src/index.ts:45`, rejects larger/even/
  non-positive values at `:63-69`, and refuses any non-finite accumulated result
  at `:100-113`. The compiler re-export is
  `packages-ts/galerina-core-compiler/src/substrate-math.ts:12-16`; the
  Tower-Citizen wrapper preserves `SubstrateParamError` at
  `packages-ts/galerina-tower-citizen/src/substrate-model.ts:83-89`.
  Boundary vectors, including `N=1021` and `N=1023`, are covered by
  `packages-ts/galerina-substrate-math/tests/substrate-math.test.mjs:52-66`
  and `packages-ts/galerina-tower-citizen/tests/substrate-model.test.mjs:238-245`;
  bounded evidence is substrate math **7/7** and Tower-Citizen substrate
  **21/21** with clean typecheck/build. The independently owned
  photonic-emulator mirror now applies the same bounded closed-form envelope:
  `PhotonicEmulatorMathError` and `MAX_NMR_N=1019` are defined at
  `packages-ts/galerina-ext-photonic-emulator/src/emulator.ts:177-210`, exact
  own-data capture is at `:215-243`, and the guarded public paths are at
  `:245-267`. The export surface is `src/index.ts:16`, and the hostile ingress
  and envelope vectors are `tests/emulator.test.mjs:134-152`. The package
  route is **61/61 pass** with clean build/typecheck. The shared
  `flipProbability` ingress is fail-closed at
  `packages-ts/galerina-substrate-math/src/index.ts:22-121`: exact plain
  own-data fields are captured once, accessors/surplus fields/proxies and
  non-finite values refuse with typed codes, and Tower-Citizen projects its
  seeded record into that exact math shape at
  `packages-ts/galerina-tower-citizen/src/substrate-model.ts:76-113,177-189`.
  Hostile coverage is `packages-ts/galerina-substrate-math/tests/substrate-math.test.mjs:47-70`.
  The copied emulator host-ingress gap is closed for the bounded numerical
  slice; the separate R&D/physical calibration posture remains unchanged.
- **Galerina AI-accelerator selection ingress (partial):** the runtime decoder
  at `packages-ts/galerina-target-ai-accelerator/src/index.ts:272-590`
  exact-decodes model/tensor/capability/preference records, rejects
  proxy/accessor/surplus/sparse collections and rogue vocabularies, and copies
  bounded tensor dimensions. Compatibility at `:719-752` now treats missing
  model-format/operator/dynamic-shape evidence, insufficient on-device policy,
  memory overflow and adapter mismatch as incompatible. The focused package is
  **7/7** at
  `packages-ts/galerina-target-ai-accelerator/tests/ai-accelerator-contracts.test.mjs:101-191`
  with clean typecheck/build. Declared fallback selection now refuses absent
  compatible capability evidence at `src/index.ts:673-687` with
  `Galerina_AI_ACCELERATOR_FALLBACK_CAPABILITY_REQUIRED`; report construction
  now detaches/freezes known collections at `src/index.ts:703-769`, with
  alias-mutation coverage at the test's `:102-146` slice. **Remaining
  blockers:** the report constructor still has no exact runtime decoder for
  caller-owned input, does not validate diagnostic severity/shape, and does not
  bind a selection decision to the report snapshot. **Fail closed:** clearance
  requires the owner-approved report schema, hostile report-input vectors,
  diagnostic-severity refusal and a decision-binding receipt.
- **Galerina GPU target ingress/snapshot (partial):** the GPU target now
  exact-decodes bounded plain capability/plan records and arrays, refuses
  accessors, proxies, symbols, surplus/sparse fields and control text, bounds
  each collection to 1024 entries, and returns detached frozen report arrays at
  `packages-ts/galerina-target-gpu/src/index.ts:71-217,271-315`. Plan/backend/
  operation validation is at `:219-266`, with **6/6** focused tests at
  `packages-ts/galerina-target-gpu/tests/gpu-contracts.test.mjs:46-74`.
  **Remaining blockers:** legacy `Galerina_GPU_*` diagnostics still need
  governed `FUNGI-CATEGORY-NNN` registry ownership, and no physical GPU
  capability or production admission is established. Those gates are not
  inferred from the passive plan-only package.
- **Galerina WASM target ingress/snapshot (partial):** the runtime decoder at
  `packages-ts/galerina-target-wasm/src/index.ts:68-199` exact-decodes bounded
  target/artefact records and dense arrays, rejects accessors/proxies/symbols/
  surplus/sparse fields and control text, and `:241-272` returns detached
  frozen report arrays. Focused coverage is **5/5** at
  `packages-ts/galerina-target-wasm/tests/wasm-contracts.test.mjs:34-59`.
  **Remaining blockers:** the current `WasmArtefact` interface has no admitted
  module bytes/digest, import/export identity, sandbox/effect evidence or
  schema owner; legacy `Galerina_WASM_*` diagnostics are also not registry
  migrated. Clearance requires those source-defined contracts and tests before
  any execution or physical-target authority claim.
- **Galerina observability logger residuals:** direct writer failure still escapes
  `JsonLineSink.write()` at `Galerina/packages-ts/galerina-observability/src/logger.ts:56-63`,
  while the outer logger catch is only `:195-217`; the exact direct-sink
  failure/isolation and separate failure-accounting contract remains unresolved
  at `:195-227`. Nested redaction and prototype-safe copying are now closed by
  the bounded descriptor-only clone at `:74-126,228-246`, with negative vectors
  at `Galerina/packages-ts/galerina-observability/tests/logger.test.mjs:84-115`.
  The former `safeStringify` totality gap is closed at `:268-288` with focused
  negative coverage at `:149-164`. **Fail closed:** do not close the remaining
  sink/accounting blocker by silently swallowing writer errors; it requires an
  owner-approved typed failure signal and direct counter-separation vectors.
- **Galerina metrics-audit authority boundary:**
  `Galerina/packages-ts/galerina-observability/src/kernel-integration.ts:38-80`
  maps only method/path/status into `metricsAuditSink`, while
  `Galerina/packages-ts/galerina-observability/src/observability.ts:44-49,121-139`
  exposes that lossy object as the kernel `AuditSink`. The mandatory runtime
  evidence consumer at
  `Galerina/packages-ts/galerina-framework-app-kernel/src/kernel.ts:746-795`
  synchronously reserves/commits the full request event and returns 503 when
  reservation or commit fails. **Blocker:** a metrics-only sink must not be
  mistaken for receipt-preserving mandatory evidence, and the source comment's
  "off the critical path/can never delay" claim is false for required commit.
  **Fail closed:** clearance requires an owner-approved non-authorizing observer
  or tee behind a real evidence sink, plus a required-runtime-report vector that
  preserves requestId/errorCode/defaults/relaxations/posture and proves the
  metrics observer cannot replace a response with a false success.
- **Galerina observability public-health boundary:** public liveness/readiness/
  health handlers now project only `{ status: "UP" | "DOWN" }` (combined health
  includes status-only liveness/readiness children) at
  `Galerina/packages-ts/galerina-observability/src/kernel-integration.ts:178-194,225-240`;
  `failSafe` uses the same tagged body at `:273-277`. The direct secret-detail
  and fault vectors are
  `Galerina/packages-ts/galerina-observability/tests/kernel-integration.test.mjs:73-108`,
  and the package route is **48/48** with clean typecheck/build. **Residual
  blocker:** no owner-approved authenticated/redacted diagnostic-detail route
  exists. **Fail closed:** keep `HealthReport.components[*].detail` internal;
  clearance requires a separately authenticated route contract, an explicit
  redaction vocabulary, and negative vectors proving public responses cannot
  carry component detail. Do not reopen the public body to satisfy diagnostics.
- **Galerina WASM-target admission:** the bounded runtime decoder and detached
  report snapshot are present at
  `Galerina/packages-ts/galerina-target-wasm/src/index.ts:68-199,201-272`,
  with current package evidence **5/5**. The remaining admission blocker is
  contract-level: `WasmArtefact` still has no module bytes/digest,
  import/export identity, sandbox/effect evidence or cross-package schema
  owner, and legacy `Galerina_WASM_*` diagnostics are not registry-migrated.
  Do not claim execution or physical-target authority until those exact fields,
  refusal rules and owner evidence exist.
- **Galerina pipeline checker:**
  `packages-ts/galerina-core-compiler/src/index.ts:3081-3098` is an empty
  `checkMethodChain()` seam. Its input carries only a receiver name, method
  names, and a location; it lacks the type, effect, Result-handling, and
  readonly environments required by PIPELINE-001..005. The existing test
  records the stub at `tests/compiler-safety-contracts.test.mjs:298-300`.
- **Galerina residual WAT lowering:**
  `packages-ts/galerina-core-compiler/TODO.md:63-65` remains open. The emitter
  intentionally fails closed at `src/wat-emitter.ts:2035-2045` for Decimal and
  higher-order collection operations because exact bignum and closure/HOF
  semantics are not supplied; the Phase-19 fallback is explicitly marked at
  `src/wat-emitter.ts:4528-4534`. Do not turn these into successful output by
  deleting the trap or by treating a stub module as a real implementation.
- **Galerina test-package conversion-overlay drift:** the bounded TypeScript
  harness work is green, but its package-wide Fungi overlay checks still expose
  two stale source/asset bindings. The primitive check at
  `packages-ts/galerina-test/tests/conversion-overlay-primitives-fungi.test.mjs:30`
  requires `SEARCH_TIME_BUDGET_MS = 5_000`, while the current owner source
  `packages-ts/galerina-tools-myco/src/query/regex-guard.ts:32-35` exports
  `120_000`; the existing overlay still returns `5000` at
  `packages-ts/galerina-test/src/self-hosted/conversion-overlays/myco-search-time-budget-ms.fungi:7-9`.
  Separately, the runner-constant check expects current `packages-ts` paths at
  `packages-ts/galerina-test/tests/runner-constants-fungi-conversion.test.mjs:32-35`,
  while the package-owned Fungi asset still returns the retired
  `packages-galerina` paths at
  `packages-ts/galerina-test/src/self-hosted/runner-constants.fungi:24-45`;
  the live TypeScript constants are `packages-ts/galerina-test/src/runners.ts:38-45`.
  **Fail closed:** do not rebuild or rewrite these `.fungi` assets now. The
  owner must first settle the current threshold/path contract; clearance is a
  later bounded asset regeneration with exact source/asset/interpretation
  receipts after the non-`.fungi` TODOs are complete. The wave-40 formatting
  anchor was repaired separately at
  `packages-ts/galerina-test/tests/conversion-overlay-source-decisions-wave-40-fungi.test.mjs:11`
  and its focused check is **3/3**.
- **Galerina benchmark report border:** the bounded config and full report
  validators now reject malformed/accessor/proxy records, missing/surplus keys,
  non-finite numbers, sparse/oversized test arrays, invalid target/privacy
  literals and explicit `null` scores at
  `packages-ts/galerina-tools-benchmark/src/index.ts:72-431`; the example no
  longer emits `opticalIo:null`. `captureBenchmarkReport` now returns a
  detached immutable snapshot at
  `packages-ts/galerina-tools-benchmark/src/index.ts:436-491`, and the
  shareability gate binds its decision to that snapshot at `:655-672`. The
  focused package route is **14/14** at
  `packages-ts/galerina-tools-benchmark/tests/benchmark-contracts.test.mjs:45-188`.
  Absence of optional `scores.opticalIo` remains valid; explicit `null` is
  refused. `privacy.shareable === true` remains required. **Closed for this
  boundary:** downstream consumers now have an explicit capture result and
  must use its detached snapshot rather than retain caller-owned input. This
  does not authorize platform/durability or submission work.
- **Galerina API-server/network contract:**
  `packages-ts/galerina-framework-api-server/TODO.md:3-8` is open because the
  API-server adapter still documents `ReplayStore.exists/save`, while the
  canonical network contract is `ReplayStore.has/put` at
  `packages-ts/galerina-core-network/README.md:360-367`. The same mismatch is
  stated in the API-server README at `README.md:18-31` and repeated by its
  scaffold contract at `README.md:1528-1537`. The checked-out runtime does not
  yet contain that contract: `packages-ts/galerina-framework-api-server/src/index.ts:1-40`
  declares a deliberately thin transport with no policy, routing, webhook or
  replay authority, and its live request path is only body buffering,
  channel/principal resolution, kernel dispatch and response writing at
  `src/index.ts:624-721`. The current focused evidence is transport-only at
  `tests/api-server.test.mjs:98-256` and TLS/certificate admission at
  `tests/api-server-tls.test.mjs:112-257`; neither proves replay expiry,
  idempotency or webhook ordering. **Fail closed:** do not implement the stale
  multi-file scaffold piecemeal or mark the adapter complete until the owner
  chooses the canonical `has/put` names or publishes an explicit
  `exists/save` adapter mapping, and the package source/tests then define and
  prove replay expiry, idempotency and HMAC-before-handler behavior. Clearance
  requires that owner contract plus matching source and negative tests; no
  `.fungi` or corpus action is implied.
- **Galerina docs contract-type expansion:**
  `packages-ts/galerina-docs/TODO.md:12-18` leaves request/response component
  schemas as placeholders because the generator's `contractTypePlaceholder()`
  at `packages-ts/galerina-docs/src/openapi.ts:91-99` has no governed
  `types {}` export to consume. **Fail closed:** do not infer schemas from type
  names or hand-author a route model; clear this only when the compiler/app
  kernel publishes an owned contract-type export and the docs package adds
  source-backed schema and negative validation tests.
- **Galerina compiler architecture items:**
  The remaining Stage-B parity, governed JSON codec, and crypto-provider move
  are tracked at `packages-ts/galerina-core-compiler/TODO.md:67-79`; they need
  cross-package contracts and are not bounded edits in the current pass.
- **Galerina runner evidence residual:** the typed process-provenance slice is
  now implemented and focused-tested: `packages-ts/galerina-test/src/types.ts:35-39`
  defines `SpawnInvocation`, `packages-ts/galerina-test/src/spawn.ts:54-60`
  captures the exact executable/argv/cwd and `src/runners.ts:208-407` carries
  invocations through the five result lanes. The remaining blocker is exact
  corpus/content provenance and aggregation semantics: the runner still emits
  display-only summaries at `packages-ts/galerina-test/src/runners.ts:206`,
  `:261`, `:292`, `:354`, and `:406`; those summaries do not identify the
  exact content digest or a per-child outcome for every missing/failed e2e
  entry. Freshness framing also remains incomplete at
  `packages-ts/galerina-test/src/runners.ts:321-335`, where prerequisite
  refusal has no child invocation because no process was launched. **Fail
  closed:** do not treat the typed argv slice or a display string as complete
  corpus provenance; clearance requires an owner-approved result schema,
  per-child content/source receipts, and focused missing/failed aggregation
  vectors.

No VOK-specific unchecked logic item was found separate from the SLIDE
reference-only and owner-gated boundaries above.

## Exit rule

For each item, either:

1. implement and focused-test it from existing evidence;
2. record the smallest unresolved question here and continue with independent
   work; or
3. create a new RD record when genuinely new research is required.

No item is marked complete from an unverified claim, a skipped check, or an
unavailable bridge response.
