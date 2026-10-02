# Independent audit — WAT type-directed `length` (P9.4)

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
**not** promoted. Do **not** promote **PATCHED**. The WAT emitter is **not**
complete.

Reviewer: Grok independent auditor (did not author these changes).

Named claim:

- `wat-emitter` now type-directs method `length`.
- Array, List, Array<…>, List<…> lower to `$host___array_length`.
- String (and unknown) lower to `$host___str_length`.
- Hostile: `List<Int>.length()` WAT contains `array_length` and does not
  contain `str_length`.
- Positive: `String.length` → `str_length`; `List.count` → `array_length`.
- Tests `wat-array-length-lowering.test.mjs` **3/3** plus
  `wat-string-methods` and `wat-failclosed-unsupported-stmt` (combined
  **10/10**).
- Do **not** claim the WAT emitter is complete.
- Remaining: Decimal fail-closed (standing stop), C20 `matchesPattern`
  interpreter-only, remaining stmt kinds unreachable trap, HOF
  capture-free only.

Platform this review: win32 Node v24.18.0, npm 12.0.2.

This reviewer independently re-read the named production file + tests +
gitignored `dist/wat-emitter.js`, hashed working-tree bytes, re-ran
`npx tsc -p tsconfig.json` then the named suite, and executed an extra
probe from `%TEMP%` (not by trusting the named tests alone). Independent
`crypto.createHash('sha256')` and `Get-FileHash` **MATCH** each other on
every hashed row (`MISMATCH_COUNT=0`).

HEAD subject: `docs(roadmap): clarify committed checkpoint and SVG hold`.

## Dirty slice vs HEAD `e8f1b682`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | **M** HEAD blob `cd2f4658f6` → WT blob `1ee8bd3a75`. Diff 16 insertions / 6 deletions. HEAD `STDLIB_HOST_MAP` comment treated `length` as a P9.3 shared-sig default to `__str_length` (`Array.length → P9.4`). HEAD method `length()` with a receiver fell through to `STDLIB_HOST_MAP.length` = `$host___str_length`. THIS TURN: `STDLIB_HOST_MAP` comment says P9.3/P9.4 type-directs `length` in `emitWATExpr`. New branch before the map: if `name === "length"` and `realReceiver` is defined, `recvType` `Array` / `List` / `/^(Array\|List)\s*</` → `$host___array_length`, else `$host___str_length`. Map entry `length: "$host___str_length"` with comment `String.length / Array.length (shared sig)` is still present as a fallback when that branch does not fire. |
| `packages-ts/galerina-core-compiler/tests/wat-array-length-lowering.test.mjs` | **??** untracked. THIS TURN: positive `String.length` → `$host___str_length`; positive `List<Int>.count()` → `$host___array_length`; hostile `List<Int>.length()` matches `$host___array_length` and `doesNotMatch` `$host___str_length`. Imports `../dist/index.js`. |
| `packages-ts/galerina-core-compiler/tests/wat-string-methods.test.mjs` | unchanged vs HEAD blob `54a492249c`. Combined suite only. |
| `packages-ts/galerina-core-compiler/tests/wat-failclosed-unsupported-stmt.test.mjs` | unchanged vs HEAD blob `2a4d5a11c2`. Combined suite only. |
| `packages-ts/galerina-core-compiler/dist/wat-emitter.js` | gitignored; rebuilt this review (`tsc`). P9.4 type-directed `length` at 2308–2318 matches src 2483–2494. Dist mtime newer than src. |

HEAD defaulted every method `length` to `__str_length` because both host
imports share `(param i32)(result i32)`. That is a silent wrong answer
for Array/List, not an invalid module. THIS TURN intercepts `.length()`
before the map when a receiver exists.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other). Post-`tsc` dist hashes
below.

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | 293284 | `816b9a993c94e7fc01597a4184882a6b9aeaa35d463059e6b074a175aeca9641` | 2026-09-23T19:07:01.878Z |
| `packages-ts/galerina-core-compiler/tests/wat-array-length-lowering.test.mjs` | 1554 | `59e02de063ccd3d476d74e14178a8b3727209ad549da45010757d17dc88d63df` | 2026-09-23T19:07:01.875Z |
| `packages-ts/galerina-core-compiler/tests/wat-string-methods.test.mjs` | 3653 | `58795dc17aa46c5d4a6cf09a60f93a2ffc66b87a6cfdd59d4dfe9bdcc5549a69` | 2026-09-08T20:31:55.896Z |
| `packages-ts/galerina-core-compiler/tests/wat-failclosed-unsupported-stmt.test.mjs` | 6500 | `ca0ef808c6c790a3bafb61a4f93d3e9b6d6397108bc00e1eb20c823f272984ff` | 2026-09-08T20:31:55.876Z |
| `packages-ts/galerina-core-compiler/dist/wat-emitter.js` | 299345 | `050855c6c73c08e3151dc127d92329b3d58e844ac98b2a4242f377c61ebca77e` | 2026-09-23T19:11:33.649Z |
| `packages-ts/galerina-core-compiler/dist/index.js` | 101545 | `792e964257d53efefa746e9fc3f136212a9ac49b47ff963bd8a2ba01d8e72d85` | 2026-09-23T19:11:33.870Z |

Independent MATCH (Get-FileHash ↔ crypto) on every hashed row.
`MISMATCH_COUNT=0`. Dist mtimes are newer than matching src after this
review’s `tsc`. Named suite imports dist (`packages-ts/.gitignore`
`dist/`).

## Requirement-to-evidence

| claim | evidence | result |
|---|---|---|
| Array / List / `Array<…>` / `List<…>` `.length()` → `$host___array_length` | `wat-emitter.ts` 2486–2491: `recvType === "Array" \|\| recvType === "List" \|\| /^(Array\|List)\s*</` | **held** in source |
| String (and unknown) `.length()` → `$host___str_length` | same block 2493: else `$host___str_length` | **held** in source |
| Hostile `List<Int>.length()` contains `array_length`, not `str_length` | named test + TEMP probe | **held** |
| Positive `String.length` → `str_length`; `List.count` → `array_length` | named tests; `count` still `STDLIB_HOST_MAP` → `$host___array_length` (1638) | **held** |
| Named tests 3/3 + combined 10/10 | `node --test` 3 + 3 + 4 = 10 pass, 0 fail | **held** |
| WAT emitter complete | not claimed; residuals below remain | **not claimed** |

`STDLIB_HOST_MAP.length` is still `"$host___str_length"` with a stale
`String.length / Array.length (shared sig)` comment (1617). That entry is
not the method-form path when `realReceiver` is defined. It remains the
fallback if the P9.4 branch does not fire. Comment drift only; not a
named-claim miss.

Named tests cover `List<Int>.length` / `.count` and `String.length`, not
bare `Array` / `Array<Int>`. Independent TEMP probe compiled
`Array<Int>.length()` → `$host___array_length` only.

## Commands re-run this review

From `packages-ts/galerina-core-compiler`:

```
npx tsc -p tsconfig.json
```

Exit 0.

```
node --test tests/wat-array-length-lowering.test.mjs tests/wat-string-methods.test.mjs tests/wat-failclosed-unsupported-stmt.test.mjs
```

```
ℹ tests 10
ℹ suites 4
ℹ pass 10
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
```

Breakdown: `wat-array-length-lowering.test.mjs` **3/3**;
`wat-string-methods.test.mjs` **3/3**;
`wat-failclosed-unsupported-stmt.test.mjs` **4/4**. Combined **10/10**.

Independent `%TEMP%` probe (`wat-array-length-independent-probe.mjs`,
imports gitignored `dist/index.js` via `file://`):

| case | `$host___str_length` | `$host___array_length` |
|---|---|---|
| `s: String` `.length()` | present | absent |
| `xs: List<Int>` `.count()` | absent | present |
| `xs: List<Int>` `.length()` (hostile) | absent | present |
| `xs: Array<Int>` `.length()` (extra) | absent | present |

`PROBE_PASS`.

## Residuals (WAT emitter is not complete)

These are standing, not closed by this slice:

1. **Decimal fail-closed (standing stop).** File header still lists exact
   Decimal arithmetic as a separate gate (26–29). Mixed Decimal ops trap
   (`Decimal '${op}' is not in the C02 host ABI` / mixed not admitted).
   Inexact Decimal record fields remain an early fail-closed refusal
   (`assertLowerableRecordFields`, 4675–4676). Decimal is excluded from
   the Float64 Option ABI (1345, 4637–4638). `Decimal.toString` now routes
   to `$host___decimal_to_str` (2461–2462) despite a nearby comment that
   still says Decimal is “explicitly refused rather than being narrowed
   to f64” (2457–2458). That comment is stale; the standing stop is the
   inexact-field / mixed-op / Option-ABI refusal, not toString.
2. **C20 `matchesPattern` interpreter-only.** 2565–2572: string-literal
   and dynamic forms emit `(unreachable)` — “WAT ABI is not admitted;
   compile-time PatternCapability is interpreter-only”.
3. **Remaining stmt kinds unreachable trap.** `emitBlockStatements`
   `default` (3777–3790) still emits
   `(unreachable) ;; unsupported-in-WASM: ${stmt.kind}`. `forEachStmt`
   is lowered; other unhandled kinds still trap.
4. **HOF capture-free only.** `map`/`filter` require a named unary flow
   else `(unreachable) (; C02: '${name}' requires a capture-free named
   unary flow ;)` (2544–2552). `reduce` requires a named binary flow
   (2554–2562). Closures / capturing lambdas are not lowered.

Also not in scope: effectful/admission-bearing flows, legacy hash-only
entry point, Array.slice type-directed follow-on (1627), unknown methods
C03/RD-1234 (2575–2581).

## Scope limits

- Dirty main at `e8f1b682`, not a clean commit.
- This reviewer did not edit `wat-emitter.ts` or tests.
- No commit, push, signing, or `.fungi` authoring.
- Combined 10/10 is not a full compiler WAT suite and is not production
  admission.
- Do **not** label the WAT emitter complete.
