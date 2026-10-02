# Independent audit — benchmark kind selection after stripQuotedStrings

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `runProject` selects benchmarks only from main-flow body
after `stripQuotedStrings`. A string literal containing
`runComputeMixThroughputBenchmark(...)` does not select compute-mix. A
real call does. `admitBoundedInt(Infinity/NaN)` falls back; `9999999`
clamps to max.

Scan `csf_106c55f9ca064178e29347d0` is **PARTIAL_THIS_TREE**. This
review does **not** promote that row. Inventory
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json` independently
re-counted here as **66 OPEN / 54 PARTIAL / 4 PATCHED**
(`OPEN_ON_SCAN_SNAPSHOT` 66, `PARTIAL_THIS_TREE` 54,
`PATCHED_AUDIT_PENDING` 4; `n` 124; disposition sum 124). This reviewer
did not re-adjudicate the other 123 IDs. This is **not** 124-scan
closure. Not Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Named
suite `require`s `./galerina.js` (this JS compiler, not a gitignored
`dist/`). This reviewer did not rebuild. `runProject` is module-private;
named tests exercise exported `benchmarkKindFromMainBody` and
`admitBoundedInt`. Independent extra measurement reconstructed
`stripComments` + `extractNamedFlowBody("main")` +
`benchmarkKindFromMainBody` (temp probe under `%TEMP%`, not production).

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-core/compiler/galerina.js` | **M** HEAD blob `e8fecad285` → WT blob `371122123a` (+84 / −12) |
| `packages-ts/galerina-core/compiler/benchmark-kind.test.mjs` | **??** untracked (blob `3b29517a3d`) |

This-claim hunks in `galerina.js`: `runProject` no longer
`/\brunComputeMixThroughputBenchmark\s*\(/.test(mainBody)` (HEAD 5282,
5285, 5288); it calls `benchmarkKindFromMainBody(mainBody)` after
`stripComments` + `extractNamedFlowBody(..., "main")`. New
`stripQuotedStrings` / `benchmarkKindFromMainBody`. `admitBoundedInt`
body is **clean vs HEAD** (HEAD 5454–5457). Shared dirty:
`if (require.main === module) { main(process.argv); }` and
`module.exports` (HEAD ended with unconditional `main(process.argv);`).
Unrelated dirty in the same file (`pathIsSymlink` /
`refuseBuildOutputLinks` / AI-guide write path, `MAX_PROJECT_*`
exports) is **not this claim**. Other worktree dirty was not this claim.

## Source hashes on this tree

Author-named hashes MATCH both listed files. Independent SHA-256 of the
working-tree bytes (`Get-FileHash` and `crypto.createHash('sha256')`
MATCH).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-core/compiler/galerina.js` | 226735 | `3033b39234b0ac8017b4d07f054b6953d6952bd68182a8b1d6b8379ca38fd2df` |
| `packages-ts/galerina-core/compiler/benchmark-kind.test.mjs` | 1159 | `f67e4960bdf8df27307e2d7d19eb471a7e170d69d243ec160c13148a189f47d7` |

HEAD `galerina.js` blob `e8fecad285bee13b78cd6cc17191e4fbdba0b25b`
(sha256 `1bc2da430ef01390d5b32674e658500ac7f2f4d479471955d507db9e4ed1bb9f`,
224845 bytes). HEAD has **no** `stripQuotedStrings` /
`benchmarkKindFromMainBody`. Inventory sha256
`7e6f03dd16d4615998ecb76464b109c42b15074df2826c1a7d901ac75c7eba4c`
(`findings.json` sha256
`07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`).
CSF row `csf_106c55f9ca064178e29347d0` (`occ_a051d4c688b48cbb455277c7`,
medium, path `packages-ts/galerina-core/compiler/galerina.js`,
scan-era `start_line` 5195, title “Raw source-text matching selects
unbounded benchmark execution”, note “benchmarkKindFromMainBody strips
quoted strings; admitBoundedInt clamps Infinity/oversize; string
literal cannot select compute-mix”).

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `runProject` selects from **main** body only | WT 5309–5321: `stripComments` then `extractNamedFlowBody(content, "main")` then `benchmarkKindFromMainBody(mainBody)`. Independent reconstruction: real call in `flow other()` + `print(1)` in `main` → `kind=null`; real call in `main` → `compute-mix` |
| Kind regex runs **after** `stripQuotedStrings` | WT 5503–5508 `const searchable = stripQuotedStrings(mainBody)`; `runProjectRawRegexOnMainBody=false` |
| Real `runComputeMixThroughputBenchmark(...)` selects compute-mix | named test; independent `realCall="compute-mix"`; reconstructed fungi main → `compute-mix` |
| Double-quoted string literal does **not** select | named hostile; independent `stringDouble=null`; reconstructed fungi `print("runComputeMixThroughputBenchmark(999999999, 1, 1)")` in main → `kind=null` |
| Single-quoted `guessFourDigitCode` string does **not** select | named hostile; independent `stringSingle=null` |
| HEAD raw `.test(mainBody)` **would** match that string | independent `headWouldMatchString=true`; HEAD 5282 |
| `admitBoundedInt(Infinity, 1000, 1, 5000)` → 1000 | named test; independent `inf=1000`; `Number.isSafeInteger(Infinity)=false` |
| `admitBoundedInt(NaN, 1000, 1, 5000)` → 1000 | named test; independent `nan=1000`; `Number.isSafeInteger(NaN)=false` |
| `admitBoundedInt(9999999, 1000, 1, 5000)` → 5000 | named test; independent `over=5000`; `isSafeInteger(9999999)=true` then `Math.min(9999999, 5000)` |
| In-range integer is kept | named `admitBoundedInt(3,…)=3`; independent `ok=3`, `mineq=1`, `maxeq=5000` |
| Template literals are **not** stripped | named residual; independent `templateKind="compute-mix"`, `templateStillHasCall=true`, `stripQuotedBacktickLiteral=false` |
| Regex on stripped body is not a full AST | named residual; `stripQuotedStrings` is a quote walker, not an AST; `extractComputeMixBenchmarkConfig` still first-matches unstripped `content` |
| 124-finding scan / production admission | **not this claim** |

## Command receipts

1. `node --test --test-timeout=60000 packages-ts/galerina-core/compiler/benchmark-kind.test.mjs`
   → **3/3 pass**, 0 fail, 0 skipped, `duration_ms 136.1097`.
   - `a real main-body benchmark call is selected` — **green** (0.8233ms)
   - `hostile: a string literal cannot select unbounded benchmark execution` — **green** (0.2094ms)
   - `hostile: non-finite and oversized iteration counts clamp to the admitted ceiling` — **green** (0.1401ms)

Independent extra measurement (eval only; `%TEMP%\benchmark-kind-independent-probe.mjs` and
`…probe2.mjs`; `require` of working-tree `galerina.js`; no production
write):

- `realCall="compute-mix"`; `stringDouble=null`; `stringSingle=null`
- `arithReal="arithmetic-threshold"`; `arithString=null`
- `fourReal="four-digit"`; `fourString=null`
- `inf=1000`; `nan=1000`; `over=5000`; `ok=3`; `negInf=1000`; `float=1000`; `strNum=1000`
- reconstructed `runProject` path: string-in-main `kind=null`; real-in-main `compute-mix`; real-in-other `kind=null`; `//` line-comment `kind=null`; block-comment `kind="compute-mix"`; template `kind="compute-mix"`
- HEAD `headTestsMainBodyDirectly=true`; `headHasStripQuoted=false`; `headHasBenchmarkKindFromMainBody=false`; `headAdmitBoundedInt=true`

## Challenge 1 — can a string literal still select compute-mix?

**No. CONFIRMED refused** on `'` / `"` literals. Locator: WT
`stripQuotedStrings` 5485–5501, `benchmarkKindFromMainBody` 5503–5508,
`runProject` 5312–5314.

Independent: `'{ print("runComputeMixThroughputBenchmark(999999999, 1, 1)") }'`
→ `null`. After strip, searchable is `{ print() }`. HEAD
`/\brunComputeMixThroughputBenchmark\s*\(/.test(mainBody)` on the same
bytes is **true**. Detector can go red on HEAD and green on working-tree
quoted-string bytes.

## Challenge 2 — does a real main-body call still select?

**Yes. CONFIRMED selected.** Named fixture
`{ runComputeMixThroughputBenchmark(20_000, 2_000, 100_000) }` →
`"compute-mix"`. Reconstructed fungi `flow main()` with that call →
`"compute-mix"`. Whitespace before `(` still matches (`wsParen`). A
prefixed identifier `xrunComputeMixThroughputBenchmark(` does not
(`prefix=null`). A call only in `flow other()` is not selected.

## Challenge 3 — do Infinity / NaN / 9999999 escape the integer ceiling?

**No. CONFIRMED fallback / clamp.** Locator: WT 5511–5514 (same body as
HEAD 5454–5457).

```5511:5514:packages-ts/galerina-core/compiler/galerina.js
function admitBoundedInt(value, fallback, min, max) {
  if (!Number.isSafeInteger(value) || value < min) return fallback;
  return Math.min(value, max);
}
```

`Number.isSafeInteger` is false for `Infinity`, `-Infinity`, `NaN`,
floats, `undefined`, `null`, and numeric strings, so those take
`fallback`. `9999999` is a safe integer `>= min`, so `Math.min` clamps
to `max` (named 5000). Compute-mix `extractComputeMixBenchmarkConfig`
feeds `targetMs` through this ceiling (`max` 5000, `batchSize` max
10000). Spurious kind selection therefore still does **not** run
unbounded iteration.

## Challenge 4 — is this a full AST, and are template literals stripped?

**No. Named residual CONFIRMED.** `stripQuotedStrings` walks `"` and
`'` only (`templateCharHandled=false`). Independent
`` { print(`runComputeMixThroughputBenchmark(999999999, 1, 1)`) } ``
→ `"compute-mix"` (`templateStillHasCall=true`). Same for arithmetic
and four-digit template needles. Block comments also survive
`stripComments` (`//.*$` only) and still select via the reconstructed
`runProject` path. Config extraction still first-matches unstripped
`content`, so a string-then-real body can parse the string’s digits;
those digits still clamp.

## Challenge 5 — is this live `runProject` / 124-scan closure?

**No.** Named tests `require` the two helpers. `runProject` is not
exported. Wiring is source-shape (WT 5309–5321) plus reconstructed
`stripComments` + `extractNamedFlowBody`. This receipt does not spawn
the prototype runner, does not time a 5000ms mix, and does not
reclassify the inventory row. **Not** production admission. **Not**
Astra. **Not** 124-scan closure.

## Residuals (not findings against the named quoted-string + clamp claim)

- Template literals are not stripped; they still select kind. Named
  residual.
- Regex on stripped main body is not a full AST. Named residual.
- `stripComments` removes only `//` line comments. `/* runComputeMixThroughputBenchmark(...) */` in `flow main()` still selects compute-mix on the reconstructed path. Same residual family.
- `extractComputeMixBenchmarkConfig` / four-digit / arithmetic extractors still regex-match unstripped `content` after kind is selected. First match can be a quoted or template needle; values still `admitBoundedInt`.
- Named tests do not call `runProject`, do not compile `.fungi`, and do not assert runner elapsed-ms ceilings at runtime.
- `admitBoundedInt` already existed on HEAD; the dirty change is kind selection, not the clamp helper.
- Unterminated `"` eats the rest of the body (independent `unterminatedKind=null`). Not the named hostile.
- Dirty `galerina.js` also contains AI-guide `refuseBuildOutputLinks` and ingest `MAX_*` exports. Not audited here.
- Inventory still lists `csf_106c55f9ca064178e29347d0` as `PARTIAL_THIS_TREE`. This receipt does not reclassify it. 66 OPEN / 54 PARTIAL / 4 PATCHED remain. Overall **INCOMPLETE_NON_AUTHORITATIVE**.

## Classification

No `CONFIRMED_FINDING` on the named quoted-string selection +
`admitBoundedInt` clamp claim. Detector is not invalid: HEAD still
`.test(mainBody)` on unstripped text and matches a string literal;
working-tree `stripQuotedStrings` makes that literal `null` while a
real call remains `"compute-mix"`; Infinity/NaN fall back; `9999999`
clamps. Evidence is sufficient for those bullets; insufficient for
template/block-comment non-selection, a full AST, live runner
unboundedness beyond the integer ceiling, scan closure, and production
admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
