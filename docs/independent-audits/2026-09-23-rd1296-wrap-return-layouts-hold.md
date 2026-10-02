# Independent audit — RD-1296 wrapAdmittedExports optional returnLayouts HOLD

**Verdict: PASS** (named wrap `returnLayouts` slice). Full RD-1296 ABI stays
**PARTIAL / open**. This is not production admission or generation reuse.

Dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. **Not clean-HEAD evidence.** Production
sources and tests were not edited by this reviewer. Nothing was committed,
merged, pushed, or signed. `.fungi` was not touched.

Reviewer: Grok independent auditor `01a0d059-f944` (did not author these
changes). Not Astra.

Named claim: `admitAndInstantiate({ returnLayouts })` passes per-export
layouts into `wrapAdmittedExports`; wrapped `h()` with OUTER layout
returns owned `[[7],99]` then wipes; omitting `returnLayouts` still
returns `[1024,99]`; closed import set unchanged.

Platform: win32 Node v24.18.0.

## Requirement-to-evidence

| Claim | Status |
|---|---|
| `returnLayouts` forwarded into wrap | **CONFIRMED** |
| Wrapped `h()` + OUTER → `[[7],99]` then wipe | **CONFIRMED** |
| Omit `returnLayouts` → `[1024,99]` | **CONFIRMED** |
| Closed host import set 78 keys, wrap not a host import | **CONFIRMED** |
| Q1 admit without layout unchanged | **CONFIRMED** |
| Dist matches src | **CONFIRMED** |
| Generation reuse | **NOT VERIFIABLE** / open |

## Locators

- `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`
  `admitAndInstantiate` 1023–1024, 1055; `wrapAdmittedExports` 1066–1098.
- Tests: `packages-ts/galerina-core-compiler/tests/rd-1296-host-registry.test.mjs`
  99–112.

## RED / GREEN actually run

Runtime package `tsc -p tsconfig.json` → exit 0.

`node --test tests/rd-1296-host-registry.test.mjs` → **4/4**, 0 skip.

Q1 admitAndInstantiate → **1/1**. Independent probe: layout wrap frozen
`[[7],99]` + wipe; omit layouts `[1024,99]`.

## Author hashes (MATCH)

| path | bytes | sha256 |
|---|---|---|
| `src/wasm-runtime.ts` | 63696 | `c073a506d878ee237587a58bb5b7370a46793c089cc6ec2d139f22ff0c8368a0` |
| `dist/wasm-runtime.js` | 53325 | `4aac0304f814dc0583cf8bde7bc4817b5f32f948a7b33c802922b482bfdcfd4c` |
| `tests/rd-1296-host-registry.test.mjs` | 4826 | `c0b15777c1071bfdc1aed50ccf01b63d979be89e3ab51dd25f0889c0351c10da` |

## Remaining risk

Dirty tree. Layout copy is opt-in per export name; default wrap still
returns flat tagged words. Intern/alloc remain monotone — generation
reuse stays open. Full RD-1296 remains PARTIAL. Not production admission.
