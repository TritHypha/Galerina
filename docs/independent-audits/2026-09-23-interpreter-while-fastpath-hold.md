# Independent audit — interpreter `tryWhileFastPath` Int counted loops

**Verdict: PASS** (scoped to the named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty,
ahead 1 of `origin/main`). Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree (`Test-Path` False). It is **not**
clean-HEAD evidence. Production sources and tests were not edited by this
reviewer. Nothing was committed, merged, pushed, or signed. `.fungi` was
not touched. This receipt is not the author’s packet and is not GPT Astra.
Passing tests here are **not** production admission. Finding inventory was
**not** promoted. Do **not** promote **PATCHED**. The runtime interpreter
is **not** complete.

Reviewer: Grok independent auditor (did not author these changes).

Named claim:

- `tryWhileFastPath` no longer stubs `false`.
- Eligible `while` loops are `identifier op intLiteral` with only Int
  `assignStmt` bodies (`lit` / `copy` / `+ - *` literal).
- Uses `i32AddChecked` / `i32SubChecked` / `i32MulChecked`.
- Charges `charge(n)` per condition and assign.
- Exceeding `maxIterations` throws `Loop exceeded maximum iteration count`.
- `Interpreter.whileStmt` snapshots Int bindings, runs the fast path,
  writes back on `true`.
- Ineligible loops fall through to the async walker.
- Hostile: body with extra non-assign is ineligible and does not mutate.
- Positive: `while i < 10 { i = i + 1 }` returns `10`.
- Do **not** claim the runtime interpreter is complete.
- Remaining: Decimal `/` and `%` unsupported (rounding policy);
  `SyncInterpreter` still defers stdlib; bytecode/cache do not model
  traps/`require`.

Platform this review: win32 Node v24.18.0, npm 12.0.2.

This reviewer independently re-read the named production file + tests +
gitignored `dist/interpreter.js` / `dist/index.js` (named suites import
`dist/`), hashed working-tree bytes, re-ran `npx tsc -p tsconfig.json`
then the named suites, and executed an extra probe from `%TEMP%` (not by
trusting the named tests alone). Independent `crypto.createHash('sha256')`
and `Get-FileHash` **MATCH** each other on every hashed row
(`MISMATCH_COUNT=0`).

HEAD subject: `docs(roadmap): clarify committed checkpoint and SVG hold`
(`2026-09-23 17:12:12 +0100`).

## Dirty slice vs HEAD `e8f1b682`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-core-compiler/src/interpreter.ts` | **M** HEAD blob `11e2e58cd9` (219826 bytes) → WT blob `e90265c740`. Diff +207 / −7. HEAD `tryWhileFastPath` ignored its args and `return false` with comment `Stub — detection and native-JS execution not yet implemented`. THIS TURN: parses cond as identifier compare-op intLiteral; body as only Int `assignStmt` (`lit` / `copy` / `+|-|*` literal); runs a native loop; `applyFastWhileOp` calls `i32AddChecked` / `i32SubChecked` / `i32MulChecked`; `charge(1)` per condition eval and per assign; cap throws `Loop exceeded maximum iteration count (${maxIterations}) — fail-closed`. `Interpreter.whileStmt` (2210–2231) snapshots Int bindings via `snapshotIntScopeForWhile`, calls `tryWhileFastPath(..., chargeSteps, MAX_ITERATIONS)`, writes snapshot back only when the fast path returns `true`. Ineligible snapshot (`undefined`) or `false` falls through to the async walker. `SyncInterpreter.whileStmt` (780–800) is unchanged and does **not** call this path. |
| `packages-ts/galerina-core-compiler/src/index.ts` | **M** HEAD blob `8101134b3` → WT blob `76e4c4c0c`. Comment only: `Optimization B: while loop fast-path stub` → `while loop Int counted-loop fast-path`. Re-export of `tryWhileFastPath` already existed on HEAD. File also carries unrelated dirty-tree edits vs a clean tree. |
| `packages-ts/galerina-core-compiler/tests/interpreter-while-fastpath.test.mjs` | **??** untracked. THIS TURN: positive `while i < 10 { i = i + 1 }` returns 10; direct eligible mutate; hostile extra `log.info` ineligible and does not mutate; hostile iteration cap throws `/maximum iteration count/`. Imports `../dist/index.js`. |
| `packages-ts/galerina-core-compiler/tests/interpreter-compute-step-cap.test.mjs` | **M** HEAD blob `5b5acf909` → WT blob `0a70c776c` (+34). Array.range step-budget cases from a prior dirty slice; **not** this named claim. Re-run only. |
| `packages-ts/galerina-core-compiler/dist/interpreter.js` | gitignored; rebuilt this review (`tsc`). `snapshotIntScopeForWhile` + non-stub `tryWhileFastPath` at 4253 / 4291. Dist mtime newer than src. |
| `packages-ts/galerina-core-compiler/dist/index.js` | gitignored; rebuilt this review (`tsc`). Re-exports `tryWhileFastPath`. |

HEAD defaulted every while to the tree-walker because the exported helper
always returned `false`. THIS TURN implements the Int counted-loop subset
and wires it into the async `Interpreter` only.

Named `executeFlow` tests pass **no** `pureFastPath` option, so they take
the governed async interpreter (bytecode / sync / cache tiers are behind
`pureFastPath === true`). That is the path that contains the new
`whileStmt` snapshot + writeback.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other). Post-`tsc` dist hashes
below.

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-core-compiler/src/interpreter.ts` | 231898 | `958c6b746dede5922341f281147220cab0a2fc981be90c5d2c80146cad0a51e7` | 2026-09-23T19:20:01.971Z |
| `packages-ts/galerina-core-compiler/src/index.ts` | 124560 | `93c864d0ae25b27009525f79ed8419fc9892adf2f0a8bac0734a39d2733537f4` | 2026-09-23T19:20:01.961Z |
| `packages-ts/galerina-core-compiler/tests/interpreter-while-fastpath.test.mjs` | 2928 | `0676b12f4fe81ba7d8043208f2063eca3ebd5cc84678b965d4ff12beb1b68e14` | 2026-09-23T19:20:01.971Z |
| `packages-ts/galerina-core-compiler/tests/interpreter-compute-step-cap.test.mjs` | 5619 | `deb6bedbe0ee52cfb5b52367bd267dbfad585cff768be72d5d094d7b2c8de8f4` | 2026-09-23T17:22:24.892Z |
| `packages-ts/galerina-core-compiler/dist/interpreter.js` | 230237 | `70966ed43c01c3ff5995b53275b68f01e0b540ee39c44b982d083df10015f69d` | 2026-09-23T19:26:30.194Z |
| `packages-ts/galerina-core-compiler/dist/index.js` | 101557 | `761a5c36559c4688fdd4bea850fc11501b0c8a2a56776251b6e8141214dd9115` | 2026-09-23T19:26:30.666Z |

Independent MATCH (Get-FileHash ↔ crypto) on every hashed row.
`MISMATCH_COUNT=0`. Dist mtimes are newer than matching src after this
review’s `tsc`. Named suites import dist (`packages-ts/.gitignore`
`dist/`).

## Requirement-to-evidence

| claim | evidence | result |
|---|---|---|
| `tryWhileFastPath` no longer stubs `false` | HEAD always `return false`. WT 4571–4620 parses and runs; eligible returns `true` | **held** |
| Eligible: identifier op intLiteral; Int assign bodies lit/copy/`+` `-` `*` literal | `parseFastWhileCond` 4453–4464 (`WHILE_COMPARE_OPS`); `parseFastWhileAssign` 4471–4496 kinds `lit`/`copy`/`binop` with `+`/`-`/`*` and intLiteral | **held** |
| Uses `i32Add`/`Sub`/`MulChecked` | `applyFastWhileOp` 4525–4528; trap via `isI32Trap` then `throw new Error(next)` | **held** |
| `charge(n)` per condition and assign | 4596 `charge(1)` before cond; 4603 `charge(1)` per assign. `whileStmt` passes `(n) => this.chargeSteps(n)` | **held** |
| Cap throws `Loop exceeded maximum iteration count` | 4593–4594; named test `/maximum iteration count/` with `maxIterations=8` | **held** |
| `whileStmt` snapshots, runs, writes back on `true` | 2218–2230: `snapshotIntScopeForWhile` → `tryWhileFastPath` → `this.assign` iff `ran` | **held** |
| Ineligible falls through to async walker | snapshot `undefined` skips fast path; `ran === false` does not write back; walker `while (true)` follows | **held** |
| Hostile extra non-assign ineligible, no mutate | named test `log.info("x")`; probe: `tryWhileFastPath` false, `i` stays 0 | **held** |
| Positive `while i < 10 { i = i + 1 }` returns 10 | named test + TEMP probe `POSITIVE_COUNT=10` | **held** |
| Runtime interpreter complete | not claimed; residuals below remain | **not claimed** |

## Commands this review

```
cd packages-ts/galerina-core-compiler
npx tsc -p tsconfig.json          # TSC_EXIT=0
node --test tests/interpreter-while-fastpath.test.mjs tests/interpreter-compute-step-cap.test.mjs
```

Test counts: **13 pass / 0 fail / 0 skipped / 0 todo** (4 suites,
357.5 ms). Named while-fastpath file **4/4**. Combined compute-step-cap
file **9/9** (re-run only; includes prior Array.range cases).

TEMP probe (`%TEMP%\grok-while-fastpath-probe.mjs`, import
`dist/index.js` via `file://`): `POSITIVE_COUNT=10`;
`ELIGIBLE_TRUE_CHARGED_7` (4 cond evals + 3 assigns for `i < 3`);
`HOSTILE_NONASSIGN_INELIGIBLE_NO_MUTATE`;
`HOSTILE_ID_PLUS_ID_FALLTHROUGH_WALKER_10` (`n = n + i` ineligible,
walker still returns 10); `ITER_CAP_THROWS`;
`I32_ADD_CHECKED_TRAPS_NO_WRAP:IntegerOverflow` (INT_MAX + 1, binding
unchanged); `LIT_COPY_SUB_MUL_ELIGIBLE`; `DIV_INELIGIBLE`; `PROBE_OK`.

Named-test comment drift (not a claim miss): the case titled
`hostile: a call in the body is ineligible and still executes on the
walker` first runs `n = n + i` (identifier + identifier, ineligible)
via `executeFlow`, then separately asserts `log.info` ineligibility.
Both are ineligible fallthrough; only the second is a call.

## Residuals (interpreter is not complete)

These are standing holds, not a miss of this slice:

1. **Decimal `/` and `%` unsupported (rounding policy).**
   `BINARY_DISPATCH` 472–473: `/` and `%` stay unsupported because exact
   decimal division needs a rounding policy → fail-closed trap. Method
   forms `#53/#54` (`Decimal.divide` / `remainder`) remain the
   obligation-carrying path (3070+). Fast-path body parser rejects `/`
   and `%` (`DIV_INELIGIBLE` in the probe); that is eligibility, not a
   decimal rounding implementation.

2. **`SyncInterpreter` still defers stdlib.** Coverage comment 640:
   intra-module calls only — stdlib calls fall back to async. Identifier
   848–850 throws `SyncNotSupported(\`stdlib call: ${name}\`)`.
   `callExpr` 912–917 throws for non-pure / external. `trapDecl` /
   `requireStmt` 802–809 also defer. Sync `whileStmt` does **not** call
   `tryWhileFastPath`.

3. **Bytecode / cache do not model traps / `require`.**
   `executeFlow` 4116–4118: invariants, admissions, and named traps must
   take the governed exit; bytecode/sync/cache cannot bypass control they
   do not yet model. `flowRequiresGovernedPath` includes `trapDecl`,
   `requirementExpr`, `requireStmt`. Bytecode `compileStmt` default
   throws `BytecodeUnsupported` for those kinds (215–216). Pure-flow
   cache stores values, not trap/`require` enforcement.

Additional observations, **not** named-claim misses:

- Literal assign uses `assign.lit | 0` (4606), not a checked i32 admit.
  Binops are the checked path.
- Fast path does not call `enforcer?.checkDeadline()` (walker still does
  at 2242). Step budget is charged instead.
- Condition must be `identifier op literal`, not swapped (`10 > i`) and
  not identifier-vs-identifier (`i < n`). Nested compute-step-cap loops
  use `i < n` and therefore stay on the walker, which is why that re-run
  still exercises `chargeSteps` in `evalExpr`.

## Verdict

**PASS** on the named `tryWhileFastPath` slice. Hashes **MATCH**.
Tests **13/13**. The runtime interpreter is **not** complete. Decimal `/`
and `%`, SyncInterpreter stdlib deferral, and bytecode/cache trap/`require`
modeling remain open. Not production admission. No commit, push, signing,
or `.fungi` write.
