# Independent audit — RD-1296 secret-return nested layout copy HOLD

**Verdict: PASS** (named secret-return nested layout copy / wipe /
flat-fallback slice). Full RD-1296 ABI stays **PARTIAL / open**. This is not
production admission, generation reuse, or `MAX_RECORD_COPY_NODES` live
exhaustion.

Dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. **Not clean-HEAD evidence.** Production
sources and tests were not edited by this reviewer. Nothing was committed,
merged, pushed, or signed. `.fungi` was not touched.

Reviewer: Grok independent auditor `01a0d049-36a5` (did not author these
changes). Not Astra.

Named claim: `finalizeSecretExportResult(..., layout?)` with a
`RecordCopyField` layout copies nested guest records as owned inner rows
then wipes; without layout, nested live pointers stay flat tagged i32
words; omitted nested pointers zero; cyclic refuse `FUNGI-WASM-HOST-001`
and wipe; `invokeAdmittedExport` forwards layout; wrapped exports without
layout stay flat; Q1 guest-flatten `[7,99]` unchanged.

Platform: win32 Node v24.18.0.

## Requirement-to-evidence

| Claim | Status |
|---|---|
| OUTER layout → owned `[[7],99]` then wipe | **CONFIRMED** |
| Without layout → `[1024,99]` | **CONFIRMED** |
| Omitted nested ptr zeros `[[0],99]` | **CONFIRMED** |
| Cyclic refuse `FUNGI-WASM-HOST-001` and wipe | **CONFIRMED** |
| `invokeAdmittedExport` forwards layout | **CONFIRMED** |
| Wrapped exports without layout stay flat | **CONFIRMED** |
| Q1 guest-flatten still `[7,99]` | **CONFIRMED** |
| Dist matches src | **CONFIRMED** |
| Generation reuse / node-bound live exhaustion | **NOT VERIFIABLE** / open |

## Locators

- `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`
  `finalizeSecretExportResult` 1114–1169; `invokeAdmittedExport` 1172–1193;
  `copyGuestRecord` 286–317; `wrapAdmittedExports` 1064–1088 (no layout).
- Tests: `packages-ts/galerina-core-compiler/tests/rd-1296-return-copy.test.mjs`
  171–233.

## RED / GREEN actually run

Runtime package `tsc -p tsconfig.json` → exit 0.

`node --test tests/rd-1296-return-copy.test.mjs` → **10/10**, 0 skip.

Q1 `q1-secret-return-value.test.mjs` → **27/27**. Nested flatten `[7,99]`.

Independent probes: layout `[[7],99]` + wipe; no layout `[1024,99]`;
cyclic throw + wipe; wrapped export without layout stays flat.

## Author hashes (MATCH)

| path | bytes | sha256 |
|---|---|---|
| `src/wasm-runtime.ts` | 63323 | `cbd3f545f6f57c0afec1e09311a87232e2ed8234f078fac3e3e5e7fdc170b0fa` |
| `dist/wasm-runtime.js` | 53218 | `2d2cfbd9a2cadf514e4c0493bbf9304c405985cfc0943cf42484e5dec53a155b` |
| `tests/rd-1296-return-copy.test.mjs` | 10212 | `b81582d1261fd1d6ddd648a180dab602f7b0507e7e3011b97e86a4203e65553c` |

## Remaining risk

Dirty tree. Layout path does not consult `__fungi_ret_words_get`.
`wrapAdmittedExports` cannot take a layout. `invokeAdmittedExport` maps a
layout refuse to `{ok:false}` after wipe. `MAX_RECORD_COPY_NODES` not
live-exhausted. Generation reuse stays open. Full RD-1296 remains PARTIAL.
Not production admission.
