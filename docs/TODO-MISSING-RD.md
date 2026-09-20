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

- **SLIDE general-backend boundary:** `SLIDE/TODO.md:1286-1298` and
  `SLIDE/src/v2c-general-backend-scope.mjs:114-126`. The open families are
  general loop bodies and general effects; the bounded contracts already
  implemented were independently checked and are not to be rebuilt.
- **SLIDE native-provider boundary:** `SLIDE/TODO.md:1539-1565` and
  `SLIDE/docs/DEMAND-ADMITTED-NATIVE-PROVIDERS.md:292-330`. The descriptor,
  semantic/target schema and admission contract are intentionally unbuilt
  until the general-backend dependency is frozen.
- **SLIDE owner evidence and activation:** `SLIDE/TODO.md:305-311`,
  `SLIDE/TODO.md:313-320`, and `SLIDE/TODO.md:1466-1473`. These require owner
  ceremony/receipt evidence, profile ordering, production authority and exact
  per-file package parity; they are not implementation TODOs for this pass.
- **Lyth-Weaver handoff:** `lyth-weaver/TODO.md:89-91`, `107-109`, and
  `133-145`. These are cross-repository process-root, conversion and
  re-admission gates. Lyth's owned rows are DONE, REFUSED or HOLD at
  `lyth-weaver/TODO.md:14-18`; no qualifying component TODO is open.
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
- **AGENTS mixed-EOL admission:** `AGENTS/tools/bounded-tool-batch.mjs:1264`
  rejects the live worktree's mixed tracked-file EOL evidence, reached through
  `observeWorktreeAggregate` at `:1452` and the self-test snapshot at `:1789`.
  This is a deliberate `REPOSITORY_REFUSED` result, not a test to bypass: the
  owner must decide the mixed-EOL policy and provide exact evidence before this
  route can be admitted. Do not rewrite line endings solely to obtain a green
  self-test.
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
  TYPE-002/005-007 done. Do not mark the rows complete from this bounded slice.
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
- **Galerina observability residuals:** direct writer failure still escapes
  `JsonLineSink.write()` at `Galerina/packages-ts/galerina-observability/src/logger.ts:56-63`,
  while the outer logger catch is only `:144-166`; the exact direct-sink
  failure/isolation contract is unresolved. Nested redaction remains shallow at
  `:177-181`, failure classes and clock policy are combined at `:144-175`,
  and prototype-safe copying is not established at `:177-181`. The former
  `safeStringify` totality gap is closed at `:203-223` with focused negative
  coverage at `Galerina/packages-ts/galerina-observability/tests/logger.test.mjs:126-133`.
  The remaining entries are exact implementation/design blockers; do not close
  them by silently swallowing writer errors or by claiming shallow redaction is
  complete.
- **Galerina WASM-target admission:** the current API is compile-time typed at
  `Galerina/packages-ts/galerina-target-wasm/src/index.ts:47`, while
  `createWasmTargetReport()` accepts typed caller-owned input at `:84` and
  aliases the artefact array into its report at `:91-95`. A runtime decoder,
  immutable snapshot, module containment/bytes-digest/import-export authority,
  diagnostic migration, and cross-package schema owner are not defined by the
  current contract. The unresolved ledger is
  `Galerina/docs/TODO.md:1369-1371`; do not invent a decoder or call this slice
  complete without that contract.
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
- **Galerina benchmark report border:** the bounded config validator now rejects
  malformed/accessor records, missing/surplus keys, non-finite budgets and
  invalid target/privacy literals at
  `packages-ts/galerina-tools-benchmark/src/index.ts:76-425`, with **12/12**
  focused contract tests at
  `packages-ts/galerina-tools-benchmark/tests/benchmark-contracts.test.mjs:45-158`.
  The remaining blocker is the report contract: the public type makes
  `scores.opticalIo` optional at
  `packages-ts/galerina-tools-benchmark/src/index.ts:151-158`, while the example
  writes explicit `null` at
  `packages-ts/galerina-tools-benchmark/examples/benchmark-report.example.json:37`;
  no runtime report decoder currently resolves absent versus null or validates
  the full report's finite numbers, exact literals and surplus fields. The
  shareability gate now binds `privacy.shareable === true` at
  `packages-ts/galerina-tools-benchmark/src/index.ts:428-443`, but that is not a
  substitute for a complete report decoder. **Fail closed:** owner/contract
  decision plus negative report vectors are required before report admission is
  claimed.
- **Galerina API-server/network contract:**
  `packages-ts/galerina-framework-api-server/TODO.md:3-8` is open because the
  API-server adapter still documents `ReplayStore.exists/save`, while the
  canonical network contract is `ReplayStore.has/put` at
  `packages-ts/galerina-core-network/README.md:360-367`. The same mismatch is
  stated in the API-server README at `README.md:18-31` and repeated by its
  scaffold contract at `README.md:1528-1537`. **Fail closed:** do not implement
  or mark the adapter complete until the owner chooses the canonical names or
  publishes an explicit adapter mapping, then supplies matching source and
  tests for replay expiry and idempotency behavior.
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
