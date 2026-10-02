# Independent audit — Array.range Interpreter stepBudget

**Verdict: PASS** (scoped to the named `executeFlow` Array.range
step-budget claim). Filename is the requested `*-hold.md` path; the
heading is the verdict.

Finding `csf_03064225783c475027bf7f5b` stays **PARTIAL_THIS_TREE**. This
review does **not** promote the inventory row to `PATCHED_AUDIT_PENDING`.
Overall scan remains **INCOMPLETE_NON_AUTHORITATIVE**. Passing tests here
are **not** production admission.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty,
ahead 1 of `origin/main`). Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree. It is **not** clean-HEAD evidence.
Production sources and tests were not edited by this reviewer. Nothing was
committed, merged, pushed, or signed. `.fungi` was not touched. This
receipt is not the author’s packet and is not GPT Astra.

Reviewer: Grok independent auditor (did not author these changes).

Named claim (this slice only):

- `Array.range` now charges Interpreter shared `stepBudget` via
  `StdlibContext.chargeSteps(count)` **before** allocating the list.
- Hostile: `executeFlow` `Array.range(0,100)` with `maxSteps` 20 returns
  `runtimeError` `Compute budget exceeded`.
- Positive: same flow with `maxSteps` 10000 returns length 100.
- Empty: `Array.range(3,3)` with `maxSteps` 50 returns 0.
- Residual named by the author remains live: direct `callStdlib` without
  `chargeSteps` is unmetered; sync fast-path does not call stdlib
  `Array.range`.

Platform this review: win32 Node v24.18.0, npm 12.0.2.

This reviewer independently re-read production + tests + gitignored
compiler `dist/` (named suites import `dist/`), hashed working-tree
bytes, rebuilt `packages-ts/galerina-core-compiler` with `npx tsc -p
tsconfig.json` (exit 0), re-ran the named suites, and executed an extra
probe of `executeFlow` / `callStdlib` / `executeFlowSync` (not by
trusting the named tests alone). Independent `crypto.createHash('sha256')`
and `Get-FileHash` **MATCH** each other on every hashed row
(`MISMATCH_COUNT=0`).

HEAD subject: `docs(roadmap): clarify committed checkpoint and SVG hold`
(`2026-09-23 17:12:12 +0100`).

## Dirty slice vs HEAD `e8f1b682`

The worktree is dirty beyond this slice (app-kernel Tower subpaths,
docs, generated status, other packages). This review binds **only** the
Array.range step-budget files below.

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-core-compiler/src/stdlib.ts` | **M** HEAD blob `1ba00cc6f` → WT blob `84b2856b0`. `StdlibContext.chargeSteps?: (n: number) => void` added. `Array.range` computes `count`, then `ctx.chargeSteps?.(count)`, then allocates. Empty/wrong-direction still returns `[]` before charge. `MAX_RANGE` 1_000_000 and non-finite/zero-step refusals unchanged. |
| `packages-ts/galerina-core-compiler/src/interpreter.ts` | **M** HEAD blob `11e2e58cd` → WT blob `ff30645bd`. `chargeStep()` now delegates to `chargeSteps(1)`. New `chargeSteps(n)` refuses non-safe-integer / negative, no-ops `n === 0`, traps when `n > cap` or `count > cap - n`, then adds `n`. `makeStdlibContext()` wires `chargeSteps: (n) => this.chargeSteps(n)` onto the shared `stepBudget` object. |
| `packages-ts/galerina-core-compiler/tests/interpreter-compute-step-cap.test.mjs` | **M** HEAD blob `5b5acf909` → WT blob `0a70c776c`. Adds describe `Array.range charges Interpreter stepBudget` (positive 10_000 / hostile 20 / empty 50). |
| `packages-ts/galerina-core-compiler/tests/domain-collections.test.mjs` | unchanged HEAD blob `acf88d01ba`. Direct `callStdlib` non-finite ctx still has **no** `chargeSteps`. |
| `packages-ts/galerina-core-compiler/dist/{stdlib,interpreter,index}.js` | gitignored; rebuilt this turn. Dist carries optional `ctx.chargeSteps?.(count)` and `makeStdlibContext` wiring. |

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other).

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-core-compiler/src/stdlib.ts` | 136190 | `349a7d507cef6fcee25196927b55437e7fe2748fd580a0c439257d43d065d0de` | 2026-09-23T17:22:24.903Z |
| `packages-ts/galerina-core-compiler/src/interpreter.ts` | 224715 | `efe4ad4f394bfb62993e87379b2b8887b572ab8bdd03a29c64ad57bb5cee695a` | 2026-09-23T17:22:24.903Z |
| `packages-ts/galerina-core-compiler/tests/interpreter-compute-step-cap.test.mjs` | 5619 | `deb6bedbe0ee52cfb5b52367bd267dbfad585cff768be72d5d094d7b2c8de8f4` | 2026-09-23T17:22:24.893Z |
| `packages-ts/galerina-core-compiler/tests/domain-collections.test.mjs` | 30036 | `e0f521202c1a6ca84809efdd9beff1aac13ec1d1aca9fe6c1168c8290e86b365` | 2026-09-23T07:56:45.843Z |
| `packages-ts/galerina-core-compiler/dist/stdlib.js` | 135626 | `bdc318d0ab511c84a98de46508f226bcbeddfe73b58376d8aa9bf196c7d76dd6` | 2026-09-23T17:25:09.187Z |
| `packages-ts/galerina-core-compiler/dist/interpreter.js` | 223341 | `ce52cc705a05b922121a603d38ec14dcbe7d639264ed68561a3fe0f78ecf3379` | 2026-09-23T17:25:09.352Z |
| `packages-ts/galerina-core-compiler/dist/index.js` | 101545 | `792e964257d53efefa746e9fc3f136212a9ac49b47ff963bd8a2ba01d8e72d85` | 2026-09-23T17:25:09.830Z |

Independent MATCH (Get-FileHash ↔ crypto) on every hashed row.
`MISMATCH_COUNT=0`. Compiler dist mtimes are newer than matching src
(rebuild this turn). Named suites import `../dist/index.js`.

## Requirement-to-evidence

| claim | requirement | source | executed | extra probe | gap |
|---|---|---|---|---|---|
| Charge before allocate | `ctx.chargeSteps?.(count)` precedes `items` allocation | `stdlib.ts` 2079–2097 | n/a (read) | dist `stdlib.js` contains `ctx.chargeSteps?.(count)` | optional `?.` — see residual |
| Interpreter shared budget | `makeStdlibContext` supplies `chargeSteps` → private `chargeSteps(n)` on shared `stepBudget` | `interpreter.ts` 1174–1193, 1300–1303 | n/a (read) | dist wires `chargeSteps: (n) => this.chargeSteps(n)` | none on this wiring |
| Hostile maxSteps 20 | `executeFlow` `Array.range(0,100)` traps `Compute budget exceeded` | test `runSpan(20)` | suite PASS | independent probe: `__tag=runtimeError`, message includes `Compute budget exceeded (20 steps)`, `executionTier=tree` | none on named `executeFlow` path |
| Positive maxSteps 10000 | same flow returns length 100 | test uses `10_000` | suite PASS | independent probe with **10000**: `__tag=int`, `value=100`, `executionTier=tree` | none on named path |
| Empty range maxSteps 50 | `Array.range(3,3)` length 0, no false trap | test empty flow | suite PASS | independent probe: `__tag=int`, `value=0` | empty returns **before** charge (by design) |
| Residual: direct `callStdlib` unmetered | ctx without `chargeSteps` still allocates | `chargeSteps?` optional; domain-collections ctx has no charge | domain-collections non-finite cases still PASS | independent `callStdlib("Array.range", …, [0,100], ctxNoCharge)` → list length **100** | **live residual** |
| Residual: sync fast-path | SyncInterpreter does not call stdlib `Array.range` | `evalExprS` identifier `Array` throws `SyncNotSupported("stdlib call: …")`; `callExpr` intra-module only | n/a | `executeFlowSync("span", …)` returns **null** (fallback) | **live residual** — sync never meters this allocation because it never runs it |

## Commands this review

```text
cd packages-ts/galerina-core-compiler
npx tsc -p tsconfig.json          # exit 0
node --test tests/interpreter-compute-step-cap.test.mjs tests/domain-collections.test.mjs
```

Focused `node --test` result: **78/78 pass, 0 fail, 0 skipped**
(`duration_ms` 403.367).

| file | tests | pass | fail |
|---|---|---|---|
| `tests/interpreter-compute-step-cap.test.mjs` | 9 | 9 | 0 |
| `tests/domain-collections.test.mjs` | 69 | 69 | 0 |
| combined | 78 | 78 | 0 |

`interpreter-compute-step-cap.test.mjs` split: 3 nested-loop cap + 3
shared call-tree cap + 3 Array.range stepBudget. The new Array.range
describe is 3/3.

`npx tsc -p tsconfig.json`: exit 0.

## Independent extra probe (not the named tests)

From this worktree, importing rebuilt `dist/index.js`:

- Hostile `executeFlow("span", …, { maxSteps: 20 })` →
  `runtimeError` `[Flow 'span'] Compute budget exceeded (20 steps) — fail-closed …`,
  `executionTier: "tree"`.
- Positive `maxSteps: 10000` → int 100, `executionTier: "tree"`.
- Empty `Array.range(3,3)` `maxSteps: 50` → int 0.
- Direct `callStdlib("Array.range", undefined, [int 0, int 100], ctx)`
  with **no** `chargeSteps` → `{ __tag: "list", items.length: 100 }`
  (unmetered allocation).
- `executeFlowSync` of the same `span` flow → `null` (sync declines;
  stdlib `Array` is unsupported on that path).

Default `executeFlow` (no `pureFastPath`, no `egraphFastPath`) used the
async tree-walker, which is the path that wires `chargeSteps`.

## Inventory (not promoted)

Independent recount of untracked
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`:
**0 OPEN / 120 PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 0,
`PARTIAL_THIS_TREE` 120, `PATCHED_AUDIT_PENDING` 4; `n` 124; findings
length 124; declared counts match actual). `overall`
`INCOMPLETE_NON_AUTHORITATIVE`. Inventory `worktree_head` still binds
`91b4dec08fe4376febc9494a8023bd02912b8695`, not this HEAD. This reviewer
did **not** edit that JSON.

Live row `csf_03064225783c475027bf7f5b` (`occ_c9454a6baf88192e9e11d614`):

- title: `Array.range permits non-progressing loops outside interpreter budgets`
- path: `packages-ts/galerina-core-compiler/src/stdlib.ts`
- `start_line`: **2026** (stale vs live `Array.range` at **2079** on this
  tree)
- disposition: **PARTIAL_THIS_TREE**
- note (verbatim): `PARTIAL 2026-09-23: Array.range rejects non-finite/zero step, empty on wrong direction, MAX_RANGE 1e6; interpreter chargeSteps(count) before allocate. domain-collections + compute-step-cap hostiles. Residual: direct callStdlib without chargeSteps is unmetered; sync fast-path does not call stdlib Array.range. Not PATCHED.Budget`

This review **agrees** with PARTIAL. Do **not** promote to PATCHED.

## Residuals (keep PARTIAL)

1. **Direct `callStdlib` without `chargeSteps` is unmetered.**
   `StdlibContext.chargeSteps` is optional. `ctx.chargeSteps?.(count)`
   no-ops when absent. Independent probe allocated `Array.range(0,100)`
   as a 100-element list with no interpreter budget. Domain-collections
   non-finite tests still construct a ctx without `chargeSteps`. Host
   `MAX_RANGE` 1_000_000 remains the only cap on that entry.

2. **Sync fast-path does not call stdlib `Array.range`.**
   `SyncInterpreter.evalExprS` throws `SyncNotSupported("stdlib call: Array")`
   on the `Array` identifier. `callExpr` is intra-module pure flows only.
   `executeFlowSync` of the named span flow returns null and defers.
   Bytecode / `pureFastPath` / egraph were **not** the named `executeFlow`
   path (probe `executionTier=tree`). Those other tiers still do not
   implement stdlib `Array.range` charging.

3. Inventory locator `start_line` 2026 is stale; live constructor is
   2079. Note suffix `Not PATCHED.Budget` is truncated author text. Not
   repaired here.

4. Worktree is dirty with unrelated packages and untracked docs. This
   PASS is **not** a whole-tree or scan-closure verdict.

## Non-claims

- Not production admission.
- Not PATCHED.
- Not 124-scan closure.
- Not a commit, merge, push, signature, or `.fungi` change.
- Not a review of app-kernel / Tower / other dirty files on this HEAD.
- `Galerina.worktrees` was not used.

**Verdict: PASS** on the named `executeFlow` Array.range charge-before-
allocate claim. Hashes **MATCH**. Tests **78/78**. Finding
`csf_03064225783c475027bf7f5b` remains **PARTIAL_THIS_TREE**.
