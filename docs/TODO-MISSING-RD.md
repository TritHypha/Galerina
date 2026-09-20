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

- **Locator:** `SLIDE/TODO.md:1267-1272` and
  `SLIDE/src/v2c-general-backend-scope.mjs:114-122`
- **Missing decision:** choose the first bounded profile for loop-carried state,
  data-dependent loops, recursion/callbacks, or cross-package effects; define its
  limits and refusal cases.
- **What can proceed now:** preserve the existing bounded backend and prepare a
  narrow registry/test seam. Do not invent a broad general backend.
- **Bridge question:** which single profile gives useful progress without
  changing the existing authority boundary?

### M-RD-002 — SLIDE native-provider descriptor boundary

- **Locator:** `SLIDE/TODO.md:1520-1545`
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
TODO and R&D. The delivered slice is recorded at `Galerina/docs/TODO.md:1432`
and `Galerina/docs/TODO.md:1473`; the exact source is
`packages-ts/galerina-target-js/src/index.ts:123-695`, with focused regressions
at `packages-ts/galerina-target-js/tests/js-target-contracts.test.mjs:104-220`.

The same disposition applies to the CPU eligibility slice at
`Galerina/docs/TODO.md:1466` and `Galerina/docs/TODO.md:1511`. Its exact source
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

## Bridge preparation

Grok is temporarily unavailable. When the bridge returns, ask the three questions
above with the exact locators and request a decision, counterexample, or refusal
case—not general commentary. Astra is being used now to compute the same gaps from
the live source.

The R&D metadata query remains refused because tracked private RD sources are
dirty. That limits an exhaustive current-coverage claim, but it does not block
source-supported implementation slices. The code graph was refreshed at the
current Galerina head before the JS slice was selected.

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

- **SLIDE general-backend boundary:** `SLIDE/TODO.md:1267-1279` and
  `SLIDE/src/v2c-general-backend-scope.mjs:114-126`. The open families are
  general loop bodies and general effects; the bounded contracts already
  implemented were independently checked and are not to be rebuilt.
- **SLIDE native-provider boundary:** `SLIDE/TODO.md:1520-1557` and
  `SLIDE/docs/DEMAND-ADMITTED-NATIVE-PROVIDERS.md:292-330`. The descriptor,
  semantic/target schema and admission contract are intentionally unbuilt
  until the general-backend dependency is frozen.
- **SLIDE owner evidence and activation:** `SLIDE/TODO.md:289-292`,
  `SLIDE/TODO.md:307-311`, and `SLIDE/TODO.md:1447-1454`. These require owner
  ceremony/receipt evidence, profile ordering, production authority and exact
  per-file package parity; they are not implementation TODOs for this pass.
- **Lyth-Weaver handoff:** `lyth-weaver/TODO.md:89-91`, `107-109`, and
  `133-145`. These are cross-repository process-root, conversion and
  re-admission gates. Lyth's owned rows are DONE, REFUSED or HOLD at
  `lyth-weaver/TODO.md:14-18`; no qualifying component TODO is open.
- **AGENTS capability route:** `AGENTS/docs/TODO.md:16-20`, `39-47`, and
  `88-89`. The tracked Myco index is stale and may only be refreshed by its
  canonical owner; source-origin approval, exact graph refresh and receiving
  task installation evidence remain outstanding. `AGENTS/docs/TODO.md:108-112`
  separately holds the clean-candidate graph and integration gate.
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
  emitted. The source-preserving parser seam is now implemented at
  `packages-ts/galerina-core-compiler/src/lexer.ts:22-37` and `:358-420`,
  `src/parser.ts:100-108`, `:1616-1643`, and `:2760-2768`, with regressions at
  `tests/typed-content-block-ast.test.mjs:14-49`. The remaining blocker is the
  AST/type-environment validation layer, not raw content capture. The canonical
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
  generic payload checks and full generic signature retention.
  Its deferred-work contract at `:28-35` still requires complete
  expression-level inference before claiming TYPE-002/005-007 done. Do not
  mark the rows complete from the bounded literal/known-type cases alone.
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
  prototype-safe copying is not established at `:177-181`, and the declared
  `string` result of `safeStringify` remains unresolved at `:204-225`. These
  are exact implementation/design blockers; do not close them by silently
  swallowing writer errors or by claiming shallow redaction is complete.
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
