# Independent audit — Array.range bounds, replay-store capacity, import memo

**Verdict: PASS** (scoped to the three named claims). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claims (three independent mediums):

- **A** `csf_03064225783c475027bf7f5b`: `Array.range` in
  `packages-ts/galerina-core-compiler/src/stdlib.ts` (~2061–2078) rejects
  non-finite/zero step; returns empty on incompatible direction; caps
  cardinality at `MAX_RANGE` 1_000_000 then a count-capped loop.
- **B** `csf_d5bf0279d3fa0e2679371071`: `MemoryReplayStore`
  `DEFAULT_MAX_ENTRIES` 4096, `DEFAULT_MAX_KEY_BYTES` 256,
  `#admitCapacity` prune-then-throw, no eviction of unexpired. This turn
  re-resolves the scope map after `#admitCapacity` so a prune of an empty
  scope cannot drop the new claim.
- **C** `csf_17fa05e63b8f227132fd6669`: `resolveFileImports` `completed`
  Map memo (`get` ~334 / `set` ~450); `MAX_IMPORT_BYTES` 10 MiB.

This reviewer independently re-read the three production files + tests +
dist (B required; A/C because those tests import dist), hashed
working-tree bytes, ran the named suites, and executed an extra probe from
`%TEMP%` (not by trusting the named tests alone). Author-named hashes
were not trusted until `crypto.createHash('sha256')` and `Get-FileHash`
matched them.

Scan rows remain **OPEN_ON_SCAN_SNAPSHOT**. This review does **not**
promote them. Independent recount of
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`: **63 OPEN / 57
PARTIAL / 4 PATCHED** (`OPEN_ON_SCAN_SNAPSHOT` 63, `PARTIAL_THIS_TREE`
57, `PATCHED_AUDIT_PENDING` 4; `n` 124; disposition sum 124). Overall
`INCOMPLETE_NON_AUTHORITATIVE`. This is **not** 124-scan closure. Not
Astra. Not production admission.

Node v24.18.0, npm 12.0.2, Windows win32 x64 (NT 10.0.19045). Named
suites import gitignored `dist/` (`packages-ts/.gitignore` line 5
`dist/`). This reviewer did not rebuild. Dist mtimes are newer than src
and carry the named controls (see hashes).

HEAD subject: `fix(security): enforce host grants and checkpoint bounded
owner decisions` (`2026-09-22 15:27:14 +0100`).

## Dirty slice vs HEAD `91b4dec0`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-core-compiler/src/stdlib.ts` | **M** HEAD blob `25c3c6a4b4` → WT blob `9713b4ef05` (+9 / −1). Dirty hunk is the dangling-`readlinkSync` refuse (~1767). **Array.range 2061–2078 is identical to HEAD.** |
| `packages-ts/galerina-core-compiler/tests/domain-collections.test.mjs` | **M** HEAD blob `ba990af168` → WT blob `acf88d01ba` (+63; five new Array.range hostiles) |
| `packages-ts/galerina-core-compiler/dist/stdlib.js` | gitignored; Array.range 2016–2034 matches src |
| `packages-ts/galerina-framework-api-server/src/replay-store.ts` | **M** HEAD blob `a30579e5e7` → WT blob `c9e5030d31` (+18 / −1). Capacity defaults / prune-then-throw already on HEAD. This-turn named repair: `claim()` re-resolves after `#admitCapacity`. Also adds process-local / empty durable admit-list branding (not the named capacity hash). |
| `packages-ts/galerina-framework-api-server/tests/replay-store.test.mjs` | **M** HEAD blob `ead47955e8` → WT blob `08a0bb382c` (+66 / −1; 7 → 13 tests, including reclaim / no-evict / byte-ceiling hostiles) |
| `packages-ts/galerina-framework-api-server/dist/replay-store.js` | gitignored; rebuilt this turn (`npx tsc`); claim re-resolve present |
| `packages-ts/galerina-core-compiler/src/module-registry.ts` | **clean** (blob `c7582e9f25` = HEAD). `completed` memo + `MAX_IMPORT_BYTES` already on HEAD. |
| `packages-ts/galerina-core-compiler/tests/import-traversal-h38.test.mjs` | **M** HEAD blob `a5322e7441` → WT blob `d4050b522e` (+44; double-import identity + 12-level chain) |
| `packages-ts/galerina-core-compiler/dist/module-registry.js` | gitignored; `completed.get` 246 / `completed.set` 349 |

HEAD `claim()` still did
`(scopeEntries ?? this.#newScope(scope)).set(key, nextExpiry)` after
`#admitCapacity`. `pruneExpired` can `#claims.delete(scope)` when a
scope is emptied, leaving that local Map detached so the new claim never
lands. WT re-reads `this.#claims.get(scope)` after admission.

## Source hashes on this tree

Author-named hashes MATCH the listed working-tree files. Independent
SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH).

| path | bytes | sha256 |
|---|---|---|
| `packages-ts/galerina-core-compiler/src/stdlib.ts` | 135369 | `80e3cc6b81c6cff00dbbf19d74deadc8000c4ca32ed26711897837f5a8788110` |
| `packages-ts/galerina-core-compiler/dist/stdlib.js` | 134911 | `2376fbdf975d9ef59e05a8d37057548da62b64eac8f0d65f4eb9adb2f8d0741d` |
| `packages-ts/galerina-core-compiler/dist/index.js` | 101365 | `aa1d0a517aaa298ee40d5c32f18146cd875b68477b3f846c3e1ac0017eecfe5f` |
| `packages-ts/galerina-core-compiler/tests/domain-collections.test.mjs` | 30036 | `e0f521202c1a6ca84809efdd9beff1aac13ec1d1aca9fe6c1168c8290e86b365` |
| `packages-ts/galerina-framework-api-server/src/replay-store.ts` | 5990 | `b1fd94a12565877553459955578ba4a40ae77b311a6f1aebd01297c502eb0b76` |
| `packages-ts/galerina-framework-api-server/dist/replay-store.js` | 5553 | `af5337cbd3679b783fbdb366b6ec801d67ca52d94f3ad1597750477eacc74b7c` |
| `packages-ts/galerina-framework-api-server/dist/index.js` | 28929 | `8350cef55d27af722e59bd25c343eb74270d10a73661823eb2cd261cf37e5dbf` |
| `packages-ts/galerina-framework-api-server/tests/replay-store.test.mjs` | 6019 | `b9d88c309950054f7f04346338fcbecf89ae6385a026c1013fb810d0b5a38223` |
| `packages-ts/galerina-core-compiler/src/module-registry.ts` | 26174 | `b52dcc05b91a780dab8e50e8b61b41d11b654bbe1e5ad4d6f95da6134449635b` |
| `packages-ts/galerina-core-compiler/dist/module-registry.js` | 24526 | `60a844b9e35340b22e02ffced343d04901a8b0e30918c89ac12568845e3e1684` |
| `packages-ts/galerina-core-compiler/tests/import-traversal-h38.test.mjs` | 6716 | `0a791084a7f9117ae08d4e6d77898898f0fa996d296f66d4dda7c3daf4bb4efe` |

Author-named MATCH: A src `80e3cc6b…8788110`; B src `b1fd94a1…eb0b76`
and dist `af5337cb…c74b7c`; C src `b52dcc05…4449635b`.

Dist mtimes (UTC): compiler `stdlib.js` / `index.js` /
`module-registry.js` `2026-09-23T01:44:16Z` (src `stdlib.ts`
`2026-09-23T00:03:45Z`, `module-registry.ts` `2026-09-22T08:25:38Z`);
api-server `replay-store.js` `2026-09-23T07:58:15Z` (src
`2026-09-23T07:58:01Z`). All named dist files are newer than their src.

Inventory file sha256 `29538880ffe26c3739833b320eabb3f252ae9d2b07e8c72a71b24b9076ca2d6b`.
`findings_json_sha256` pin `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`.

CSF rows (all still `OPEN_ON_SCAN_SNAPSHOT`, medium):

- `csf_03064225783c475027bf7f5b` (`occ_c9454a6baf88192e9e11d614`,
  path `packages-ts/galerina-core-compiler/src/stdlib.ts`, scan-era
  `start_line` 2026, title “Array.range permits non-progressing loops
  outside interpreter budgets”)
- `csf_d5bf0279d3fa0e2679371071` (`occ_d06fc9d00d0b30fb2cdb618b`,
  path `packages-ts/galerina-framework-api-server/src/replay-store.ts`,
  scan-era `start_line` 42, title “The webhook replay store retains an
  unbounded number of attacker-selected keys”)
- `csf_17fa05e63b8f227132fd6669` (`occ_d412407745a89d1aa2d162fb`,
  path `packages-ts/galerina-core-compiler/src/module-registry.ts`,
  scan-era `start_line` 273, title “Acyclic import graphs cause
  exponential repeated resolution”)

`dist/index.js` (compiler) re-exports `callStdlib` from
`./stdlib.js` (line 464). Named domain-collections tests import that
barrel. Import-traversal tests import `../dist/module-registry.js`.
Replay-store tests import `../dist/index.js`, which re-exports
`MemoryReplayStore` from `./replay-store.js`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| A reject non-finite / zero step | src 2066–2068 / dist 2021–2023 `!Number.isFinite(from\|to\|step) \|\| step === 0` throws `finite non-zero` |
| A empty on incompatible direction | src 2069–2071 / dist 2024–2026 `(step > 0 && from >= to) \|\| (step < 0 && from <= to)` → empty list |
| A cap cardinality at 1_000_000 then count-capped loop | src 2065, 2072–2078 / dist 2020, 2027–2034 `count > MAX_RANGE` throws; loop `n < count` |
| A five new hostiles | WT tests 399–458 (zero step, negative empty, negative finite, cardinality, non-finite); HEAD had none of these five |
| B DEFAULT_MAX_ENTRIES 4096 / DEFAULT_MAX_KEY_BYTES 256 | src 23–24 / dist 8–9; constructor 52–53 / dist 33–34 |
| B `#admitCapacity` prune-then-throw; no live eviction | src 141–148 / dist 121–129; named test “does not evict unexpired claims to make room” |
| B `claim()` re-resolves after admit | src 91–93 / dist 72–74 `this.#claims.get(scope) ?? this.#newScope(scope)`; HEAD still used the pre-admit `scopeEntries` local |
| B hostile reclaim lands | named test “reclaims expired entries on the next admit without dropping live keys”; extra probe mixed live+expired |
| C `completed` memo get/set | src get 334–338 / set 450; dist get 246–250 / set 349 |
| C `MAX_IMPORT_BYTES` 10 MiB | src 225 `10 * 1024 * 1024`; dist 149 |
| C double-import identity + 12-level chain | WT tests 91–133; extra probe same-object identity |
| Dist not stale for named bodies | hashes + same order in src/dist; dist mtimes newer; named tests imported dist and passed |
| Inventory 63/57/4 | independent recount of 124 `findings` |
| Production admission / 124-scan closure | **not these claims** |

## Command receipts

1. `node --test tests/domain-collections.test.mjs` in
   `packages-ts/galerina-core-compiler`
   → **69/69 pass**, 0 fail, 0 skip, `duration_ms 424.566`.
   Five new Array.range hostiles all green (zero step 0.561ms; negative
   empty 0.3483ms; negative finite 0.3346ms; cardinality 0.427ms;
   non-finite 0.611ms).

2. `node --test tests/replay-store.test.mjs` in
   `packages-ts/galerina-framework-api-server`
   → **13/13 pass**, 0 fail, 0 skip, `duration_ms 258.209`.
   Reclaim / no-evict / capacity / byte-ceiling hostiles green.

3. `node --test tests/import-traversal-h38.test.mjs` in
   `packages-ts/galerina-core-compiler`
   → **11/11 pass**, 0 fail, 0 skip, `duration_ms 217.3898`.
   Double-import identity 8.0595ms; 12-level chain 49.8318ms.

Independent extra (`%TEMP%\zt-range-replay-import-probe\probe.mjs`;
cwd `%TEMP%`; `file://` import of working-tree dist barrels; no
production write):

| probe | result |
|---|---|
| `callStdlib("Array.range", …, [0,1,0])` | throw `/finite non-zero/i` |
| inf step | throw `/finite non-zero/i` |
| `Array.range(0,5,-1)` | empty list |
| `Array.range(5,0,-1)` | length 5 |
| `Array.range(0,1000001)` | throw `/cardinality exceeds the host bound/i` |
| `Array.range(0,3)` | `0,1,2` |
| dist Array.range body vs `stepBudget` / `chargeStep` | **absent** |
| `MemoryReplayStore({maxEntries:1})` 2nd key | throw `/capacity/i`; live key still `duplicate` |
| expire-then-reclaim (maxEntries 1) | new key `claimed` then `duplicate` (lands) |
| mixed live+expired (maxEntries 2) | live stays `duplicate`; new lands |
| `admitWebhookReplay` at capacity | `{ok:false, reason:"malformed"}` |
| `webhook-admission.ts` / `index.ts` `pruneExpired` | **absent** |
| `await admitWebhookReplay` vs `await kernel.handle` | claim **before** handle (src 807 vs 834; dist 543 vs 569) |
| `resolveFileImports` double `./mid.fungi` | `mods[0] === mods[1]` |
| nested double-import of `leaf` | `leaf` symbol count **2** (duplicated push) |

## Challenge 1 — can Array.range still hang on zero / inverted / huge cardinality?

**No. CONFIRMED closed for the named host constructor.** Zero and
non-finite step throw before the loop. Incompatible direction returns
empty. `count > 1_000_000` throws before allocation. Named tests and
the `%TEMP%` `callStdlib` probe observed those throws / empty /
finite negative range on **dist**. Construction still does **not**
charge Interpreter `stepBudget` (residual below, not a miss of the
named cap).

Scan-era object `0f24ca30…:packages-ts/galerina-core-compiler/src/stdlib.ts`
is **not** in this worktree. The WT/HEAD body is the bounded form.
Inventory still lists the row OPEN; this receipt does not recategorize it.

## Challenge 2 — does prune-then-admit drop the new claim when the scope map is deleted?

**No on this dirty tree. CONFIRMED closed for the named `claim()`
re-resolve.** WT src 93 / dist 74 re-get the scope after
`#admitCapacity`. Extra probe: after the sole live key expired,
the next key claimed and the second claim returned `duplicate`. Mixed
live+expired kept the live key. HEAD still writes through the pre-admit
`scopeEntries` local; this reviewer did not execute HEAD dist.

Capacity prune-then-throw and no live eviction were already on HEAD
(defaults 4096 / 256). This turn’s named repair is the re-resolve.
Branding helpers are extra dirty surface, not the capacity claim.

## Challenge 3 — is dist stale, or is this 124-scan closure?

**Dist not stale for the named bodies. Not 124-scan closure.** Compiler
dist Array.range / `completed` memo match src; api-server dist claim
re-resolve matches src; all named dist mtimes are newer than src.
Named suites imported those dist files and passed. All three CSF rows
remain `OPEN_ON_SCAN_SNAPSHOT`. Independent recount: **4**
`PATCHED_AUDIT_PENDING`, **57** `PARTIAL_THIS_TREE`, **63**
`OPEN_ON_SCAN_SNAPSHOT`. This review does not recategorize the rows.

## Residuals (not findings against the named bounds / re-resolve / memo)

- **A.** `Array.range` construction does not charge Interpreter
  `stepBudget`. `chargeStep` lives on the interpreter (src
  `interpreter.ts` 1171–1176) and is not referenced from
  `callStdlib` / the Array.range body. A single stdlib call may
  allocate up to 1_000_000 ints as one step. Extra probe: dist range
  slice has no `stepBudget` / `chargeStep`.
- **B.** `admitWebhookReplay` does not call `pruneExpired` itself
  (store prunes only when `#admitCapacity` hits the live ceiling).
  Webhook `claim()` runs in `index.ts` 807 **before**
  `kernel.handle` 834, so before the kernel rate gate (kernel step 8,
  `kernel.ts` ~579). No aggregate-byte store limit (only entry count
  + per-key UTF-8 bytes). Capacity `RangeError` is caught in
  `webhook-admission.ts` 92–93 as `"malformed"`; `index.ts` 820
  / dist 556 maps non-hmac non-replay to **500**. Extra probe reproduced
  the malformed mapping at capacity.
- **C.** Nested `symbols.push(...nestedMod.symbols)` (src 439 / dist
  340) still duplicates on double-import: extra probe saw `leaf` ×2
  when a file imported `./leaf.fungi` twice. Memo stops re-parse /
  re-walk; it does not unique the propagated symbol array. No
  distinct-module / edge / depth / propagated-symbol aggregate caps
  (only per-file `MAX_IMPORT_BYTES`).
- Named tests import gitignored dist, not src. Dist was confirmed
  non-stale for the named bodies; this receipt did not rebuild.
- Inventory still lists all three IDs as `OPEN_ON_SCAN_SNAPSHOT`.
  This receipt does not reclassify them. 63 OPEN / 57 PARTIAL / 4
  PATCHED remain. Worktree remains dirty HEAD `91b4dec0…`,
  **INCOMPLETE_NON_AUTHORITATIVE** for production admission. Not Astra.
  Not 124-scan closure.

## Classification

No `CONFIRMED_FINDING` on the three named claims. Detectors are not
invalid against unbounded / stale-map / unmemoized scan-era shapes;
this dirty tree has the named bounds, re-resolve, and memo, with
executed red-capable evidence on dist. Residuals above remain outside
those bullets. Evidence is sufficient for those bullets; insufficient
for scan recategorization and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
