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
[!] HOLD a full owner-approved OS/architecture vocabulary and physical
    open/TOCTOU. Consistency checks do not prove native execution.
[x] Define ABI constraint model (`src/index.ts:5,56-60,346-379`; tests
    `tests/native-contracts.test.mjs:55-61,200-213`).
[x] Define native artifact report format (`src/index.ts:21-39,418-509,511-633`;
    tests `tests/native-contracts.test.mjs:91-165,167-280`).
[x] Define machine profile bridge handoff rules (`src/index.ts:292-335,511-633`;
    tests `tests/native-contracts.test.mjs:168-213`).
[ ] Add examples (optional deferred; no contract blocker)
[x] Add tests
[x] Add the bounded fail-closed runtime own-data decoder and detached immutable
    report snapshot; hostile records, arrays and retained-alias controls pass
    in `src/index.ts:103-189`, `:191-290`, `:337-384`, `:511-633` and
    `tests/native-contracts.test.mjs:41-89`, `:167-280`.
[x] Current bounded package verification is **24/24** with clean typecheck/build.
[x] C09 `fungi.native.artifact.v1` binds relative locator, bytes digest, VOK
    subject, ABI/profile (`RD-1281`). Identity tests cover escape locators,
    empty bytes, empty VOK receipt, digest/VOK mismatch, stale VOK, ABI
    mismatch, profile escape/collision, and duplicate digest at
    `tests/native-contracts.test.mjs:91-165`, `:168-222`. Physical open and
    VOK verification remain outside this package.
[!] Legacy `Galerina_NATIVE_*` diagnostics still require owner-approved
    `FUNGI-CATEGORY-NNN` registry ownership before promotion.
```
