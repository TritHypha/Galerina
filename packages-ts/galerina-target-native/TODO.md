# Galerina Target Native TODO

Current sequencing: [pre-.fungi work register](../../docs/PRE-FUNGI-WORK-REGISTER-2026-09-22.md),
W02/W10. Platform mapping decisions, graph declaration repair and physical
loading/durability evidence are separate obligations.

## Graph integration follow-up — 2026-09-22

- [x] Admitted `node:crypto` on the boundary because `src/index.ts` already
      loads it. Live `--check` PASS. Exact-specifier hostility retained.

```text
[x] Create /packages-ts/galerina-target-native
[x] Document package boundary
[x] Add package metadata
[x] Add initial typed exports
[x] Define native target metadata (`src/index.ts:7-13,191-226,337-379`; hostile
    target tests at `tests/native-contracts.test.mjs:41-89`).
[x] Bounded triple/os/architecture consistency: triple has ≥3 hyphen tokens,
    architecture equals the first token, os is a later token
    (`src/index.ts` `validateDecodedNativeTarget`). This is metadata
    rejection, not a physical loader or complete OS/ABI map.
[x] Package-side PROPOSED OS/arch vocabulary in
    `src/proposed-os-arch-vocabulary.ts` (arch: aarch64, x86_64; os: linux,
    windows). Helper `proposedNativeVocabularyDiagnostics` stays UNWIRED from
    `validateNativeTarget`. Tests:
    `tests/proposed-os-arch-vocabulary.test.mjs`. (SuperGrok 2026-10-08.)
[x] Package-side physical open/TOCTOU: `prepareNativeOpenRequest` emits
    REQUESTED_NOT_OPENED; `openNativeArtifact` always
    `NT_PHYSICAL_OPEN_FORBIDDEN`. This package never loads `node:fs`.
    tests/native-hold-pin.test.mjs. (SuperGrok 2026-10-08.)
[!] HOLD a full owner-approved OS/architecture vocabulary and physical
    open/TOCTOU. Consistency checks do not prove native execution.
    Kept HOLD: owner Phillip approves the vocabulary; a TOCTOU-safe open
    whose bytes match the bound digest plus a current VOK receipt is not
    this package. SuperGrok's side is the UNWIRED helper plus the typed
    refuse. (SuperGrok pin 2026-10-08.)
[x] Define ABI constraint model (`src/index.ts:5,56-60,346-379`; tests
    `tests/native-contracts.test.mjs:55-61,200-213`).
[x] Define native artifact report format (`src/index.ts:21-39,418-509,511-633`;
    tests `tests/native-contracts.test.mjs:91-165,167-280`).
[x] Define machine profile bridge handoff rules (`src/index.ts:292-335,511-633`;
    tests `tests/native-contracts.test.mjs:168-213`).
[x] Add examples: `examples/target.example.json`,
    `examples/artifact.example.json` (real SHA-256 of its bytes, VOK subject
    bound) and `examples/report-input.example.json`, validated by
    `tests/native-examples.test.mjs` through `validateNativeTarget`,
    `validateNativeArtifact` and `createNativeTargetReport`, with tamper
    refusals. The examples are illustrative: `vok-receipt-example` is not a real
    VOK receipt (2026-09-29, Grok Bot, owner-approved; AGENTS session-exchange
    grok-bot-pkg-todo-work-20260929/LEDGER.md).
[x] Add tests
[x] Add the bounded fail-closed runtime own-data decoder and detached immutable
    report snapshot; hostile records, arrays and retained-alias controls pass
    in `src/index.ts:103-189`, `:191-290`, `:337-384`, `:511-633` and
    `tests/native-contracts.test.mjs:41-89`, `:167-280`.
[x] Current bounded package verification is **46/46** with clean typecheck/build
    (24 contract + 4 example + 5 closed-set + 6 proposed-vocab + 7 hold-pin,
    2026-10-08).
[x] C09 `fungi.native.artifact.v1` binds relative locator, bytes digest, VOK
    subject, ABI/profile (`RD-1281`). Identity tests cover escape locators,
    empty bytes, empty VOK receipt, digest/VOK mismatch, stale VOK, ABI
    mismatch, profile escape/collision, and duplicate digest at
    `tests/native-contracts.test.mjs:91-165`, `:168-222`. Physical open and
    VOK verification remain outside this package.
[x] Inventory of current legacy `Galerina_NATIVE_*` codes at pin `df7f2fb5`:
    21 codes in `src/index.ts`, exported as `NATIVE_DIAGNOSTIC_REGISTRY` /
    `NATIVE_DIAGNOSTIC_CODES` (first-emission order). Closed-set tests in
    `tests/native-diagnostic-closed-set.test.mjs` pin the set, refuse unknown
    and `FUNGI-NATIVE-*` names, require every code to be emitted, and check
    determinism. Source still emits the legacy names.
[x] Package-side FUNGI mapping frozen as PROPOSED_NOT_ADMITTED in
    `src/proposed-fungi-native-mapping.ts` (21 rows, first-emission order).
    `promoteNativeDiagnosticsToFungi` always
    `NT_FUNGI_NATIVE_PROMOTION_FORBIDDEN`. Closed-set still refuses
    `FUNGI-NATIVE-*` names. tests/native-hold-pin.test.mjs.
    (SuperGrok 2026-10-08.)
[!] Legacy `Galerina_NATIVE_*` diagnostics still require owner-approved
    `FUNGI-CATEGORY-NNN` registry ownership before promotion. A PROPOSED
    `FUNGI-NATIVE-001`..`021` mapping is recorded in the SuperGrok 2026-10-07
    answer.md and is not claimed final.
    Kept HOLD: registry ownership is not this package. SuperGrok's side is
    the frozen catalog plus the typed refuse. (SuperGrok pin 2026-10-08.)
```
