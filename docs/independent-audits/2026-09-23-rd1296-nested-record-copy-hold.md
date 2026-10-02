# Independent audit — RD-1296 schema-directed nested record copy HOLD

**Verdict: PASS** (named nested-record copy slice). Full RD-1296 ABI stays
**PARTIAL / open**. This is not production admission, generation reuse, or
secret-flow nested-return reachability.

Dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. **Not clean-HEAD evidence.** Production
sources and tests were not edited by this reviewer. Nothing was committed,
merged, pushed, or signed. `.fungi` was not touched.

Reviewer: Grok independent auditor `01a0d03f-69a6` (did not author these
changes). Not Astra.

Named claim: `copyArrayRecordsLayout` copies nested `record` fields as owned
inner rows; omitted nested pointers zero the layout shape; cyclic pointers
and depth > 8 refuse `FUNGI-WASM-HOST-001`; flat `copyArrayRecords` still
returns inner pointers; closed WASM host import set unchanged.

Platform: win32 Node v24.18.0.

## Requirement-to-evidence

| Claim | Status |
|---|---|
| Nested owned rows `[[[7],99]]` not leftover inner pointers | **CONFIRMED** |
| Omitted nested ptr zeros inner layout | **CONFIRMED** |
| Cyclic nested ptr / depth > 8 refuse `FUNGI-WASM-HOST-001` | **CONFIRMED** |
| Flat `copyArrayRecords` still yields inner pointers | **CONFIRMED** |
| Closed host import set unchanged (78 keys) | **CONFIRMED** |
| Dist matches src | **CONFIRMED** |
| Generation reuse / secret-flow nested return | **NOT VERIFIABLE** / open |

## Locators

- `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`
  `RecordCopyField` 247–254; `copyGuestRecord` 286–317;
  `copyArrayRecordsLayout` 953–967.
- Tests: `tests/wasm-runtime.test.mjs` 212–256.

## RED / GREEN actually run

Runtime `tsc -p tsconfig.json` → exit 0.

`node --test tests/wasm-runtime.test.mjs` → **39/39**, 0 skip.

Independent probe: `[[[7],99]]`; mutate inner guest leaves snapshot;
omitted 0/1/1023 zeros; self-cycle refuse; depth 9 refuse; depth 8
allowed; `imports.host` 78 keys, layout method absent from imports.

## Author hashes (MATCH)

| path | bytes | sha256 |
|---|---|---|
| `src/wasm-runtime.ts` | 62869 | `18677841e494214d74a3500310c2878838fceaaace851d98c748d175895470d7` |
| `dist/wasm-runtime.js` | 52727 | `9be023ca9f3bb36d496acacdef4a85b7f4f0b9f38928867ba11ded80fdda1743` |
| `src/index.ts` | 1504 | `af285b0263f51ff8c0f16b1acc4b6712b6e7023ff090f9150afc3d5eefbd74cf` |
| `tests/wasm-runtime.test.mjs` | 15036 | `1cdfbb9fd6bdd2aff7296888ba902b92a2178f124f7501b5370a64829e1a65f2` |

## Remaining risk

Dirty tree. `finalizeSecretExportResult` still copies flat tagged i32
words and does not call `copyArrayRecordsLayout`. Cycle/depth walks are
schema-gated. `MAX_RECORD_COPY_NODES` 4096 not live-exhausted. Generation
reuse stays open (intern/alloc are monotone). Full RD-1296 remains
PARTIAL. Not production admission.
