# Independent audit — RD-1296 nested contextual record admission HOLD

**Verdict: PASS** (named nested-admission slice). Full RD-1296 ABI stays
**PARTIAL / open**. This is not cyclic-runtime or return-ABI copy closure.

Dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty).
Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. **Not clean-HEAD evidence.** Production
sources and tests were not edited by this reviewer. Nothing was committed,
merged, pushed, or signed. `.fungi` was not touched. Passing tests are **not**
production admission.

Reviewer: Grok independent auditor `01a0d00e-6950` (did not author these
changes). Not Astra.

Named claim: nested `#record` literals are checked against the declared field
schema; opaque `Record` is not validity; `return true` means handled;
adoption is not skipped by type name; return/let/call-arg consumers covered;
plain `check` keeps TYPE-008 advisory; `--strict-types` refuses.

Platform: win32 Node v24.18.0.

## Requirement-to-evidence

| Claim | Status |
|---|---|
| Nested `#record` checked against declared field schema | **CONFIRMED** |
| Opaque inferred `Record` is not field validity | **CONFIRMED** |
| `return true` = handled, including diagnostic failure | **CONFIRMED** |
| Not cached by type name; depth cap 32; cyclic AST revisit refuses | **CONFIRMED** (code) / **PLAUSIBLE** (depth/cycle runtime not parser-executed) |
| Return / let / call-arg consumers | **CONFIRMED** |
| TYPE-008 advisory on plain check; `--strict-types` refuses | **CONFIRMED** |
| TYPE-008 not in `SECURITY_TYPE_CODES` | **CONFIRMED** |
| Full RD-1296 ABI / cyclic runtime / return-ABI copy | **NOT VERIFIABLE** / open PARTIAL |
| Q1 `build()` bypasses `checkTypes` | **CONFIRMED** remaining |

## Locators

- `packages-ts/galerina-core-compiler/src/type-checker.ts`: cap 704;
  `tryRecordLiteralAdoption` 721–825 (recurse 783–796, Record defer 800);
  return ~2204; call-arg ~2417; let ~2638.
- `dist/type-checker.js` matches src recurse (gitignored, rebuilt `tsc` exit 0).
- `galerina.mjs` `SECURITY_TYPE_CODES` 215; check split 1507–1556; build
  folds only security codes 2373–2374.

## RED / GREEN actually run

Rebuild `tsc -p tsconfig.json` → exit 0.

`node --test tests/type-checker-record-adoption.test.mjs` → **29/29**, 0 skip.

Independent `checkTypes`: nested missing `a` → TYPE-008; complete Outer/Sec
clean; later nested Node still TYPE-008 missing `child`.

Independent CLI: plain nested missing exit **0** advisory; `--strict-types`
exit **1** TYPE-008; complete `--strict-types` exit **0**.

Q1 parse→GIR→WAT still emits omitted-inner Node (malformed-input flatten).

## Author hashes (MATCH)

| path | bytes | sha256 |
|---|---|---|
| `src/type-checker.ts` | 194364 | `8ddf014dbc23cbbf7101213f3a4b8a06d15a09cbfd5225be72b950e30c62b152` |
| `dist/type-checker.js` | 200026 | `caf1e18949c50085231175c1b6316e0eef0bcbc1d4db91fcfa76a20fdd47608f` |
| `tests/type-checker-record-adoption.test.mjs` | 15847 | `beb9ab9b3dce12dea6064c41ef846d4c14e976c596b00094a93830106011e1ee` |

## Remaining risk

Dirty tree. Non-literal nested `Record` values still defer. Depth-32 / cyclic
AST refusal not parser-executed. `galerina build` / plain `check` do not
fail-closed on TYPE-008 (do not add to `SECURITY_TYPE_CODES`). Full RD-1296
ABI stays PARTIAL.
