# Independent audit — WASM host `__range` guest-memory/fuel bound

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: WASM host `__range` no longer allocates a 1e5-element JS array
outside guest memory/fuel. It refuses cardinality above guest linear-memory
word count (default 16384 i32 words when memory is unbound) and debits
`rangeFuel`. Empty ranges when `lo >= hi`.

This is **not** 124-scan closure (`csf_e3409dfe75ff7adda18f556a` remains
`PARTIAL_THIS_TREE`). Not part of GROK-CODING-BATCH-READY Phase A/B
required work. JSON-Decimal, OAuth, durable replay, signing, and `.fungi`
admission were not started.

Node v24.18.0, npm 12.0.2, Windows. Tests import `dist/`.
`dist/wasm-runtime.js` mtime is newer than `src/wasm-runtime.ts` and
contains `rangeFuel` / `UNBOUND_GUEST_WORDS` / `exceeds guest memory`.
This reviewer did not rebuild.

The same dirty `wasm-runtime.ts` also contains unrelated secret-export
wrapping (`wrapAdmittedExports` / `finalizeSecretExportResult`). That
surface is **out of scope** for this claim; the file hash binds it.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | `305ded1ca7877c0590bb64d12e3856e2645ddff798cef12dba09d67270f070f8` |
| `packages-ts/galerina-core-runtime-wasm/tests/wasm-runtime.test.mjs` | `5975f6ff6c70cc004fb18db0abf9fce55dced0efeb9b27eef27028771be427aa` |
| `packages-ts/galerina-core-runtime-wasm/dist/wasm-runtime.js` | `e8b086bf47e182ec105f003594038f7ffde9ae8e72e14c384d2759bdf7f96024` |
| `packages-ts/galerina-core-compiler/tests/wat-host-stdlib-stubs-oracle.test.mjs` | `9773d448a99ddc52b6a2f08478a9876d95a233b2e25be4c595a9717ea540f70c` |

Dirty paths for this slice: `M`
`packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`, `M`
`packages-ts/galerina-core-runtime-wasm/tests/wasm-runtime.test.mjs`.
Passing tests here are **not** production admission.

HEAD `__range` used `MAX_RANGE = 1_000_000` and threw on `to < from`.
`range(0, 100000)` would have allocated a 1e5 JS array on that producer
(`100000 < 1000000`).

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Unbound default is 16384 i32 words (one WASM page) | source `wasm-runtime.ts` 313–316 `UNBOUND_GUEST_WORDS`; dist same; independent `range(0,16384)` length 16384, `range(0,16385)` throws guest memory |
| Cardinality above guest word count refuses before allocate | source 588–593 throw, 598–601 allocate-after-admit; suite hostile 1e5 + 1-page 20000 |
| Debits `rangeFuel` | source 594–597; suite second 10000; independent exact `Array.range: fuel exhausted` |
| Empty when `lo >= hi` | source 582–586 `to <= from` pushes `[]`; compiler oracle 106–110; independent `range(5,5)` and `range(7,2)` are `[]` |
| `__range(2,7)` exclusive interval | suite + compiler oracle + JS host + guest import `[2,3,4,5,6]` |
| Hostile: `range(0, 100000)` throws guest memory/fuel | suite `/guest memory\|fuel/`; independent exact `cardinality exceeds guest memory`; no 1e5 handle stored |
| Hostile: second 10000 after first 10000 throws fuel | suite + independent `fuel exhausted` |
| Hostile: 1-page memory refuses 20000 | suite + JS host + guest import, exact guest-memory message |
| Guest import path (not only JS handle) | independent 1-page module `import "host" "__range"`; `go(0,100000)` and `go(0,20000)` throw guest memory |
| Detector can go red | HEAD `MAX_RANGE=1_000_000` would admit 1e5; current refuse is the red. Raw JS `1e5` alloc still succeeds in 1 ms |
| Host still stores admitted ranges in JS `arrays[]` | source 299 / 598–601; residual, named |
| Other host collections unchanged | `internArray` and `__array_append` still stored 100000 items; residual, named |
| 124-finding scan | **not this claim** (`csf_e3409dfe75ff7adda18f556a` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=30000 packages-ts/galerina-core-runtime-wasm/tests/wasm-runtime.test.mjs`
   → **9/9 pass**, `fail 0`, `duration_ms 142.2158`.
   Range tests: `__range(2,7)`; hostile 1e5; second 10000 fuel; 1-page 20000.
2. `node --test --test-timeout=30000 --test-name-pattern="range" packages-ts/galerina-core-compiler/tests/wat-host-stdlib-stubs-oracle.test.mjs`
   → **3/3 pass**, `fail 0`, `duration_ms 338.7236`.
   - `range(2,7) → [2,3,4,5,6]`
   - `empty when lo >= hi`
   - name-existence test also matched the pattern (`redact/range`)

Independent extra probes (eval + `%TEMP%\galerina-wasm-range-guest-probe.mjs`; not production):

- JS host `range(0,100000)` → `Array.range: cardinality exceeds guest memory`.
  `readArray(0)` is `undefined` — no handle was stored.
- First `range(0,10000)` length 10000; second → `Array.range: fuel exhausted`.
- `bindMemory(Memory{initial:1})` then `range(0,20000)` → guest memory;
  `range(0,3)` still `[0,1,2]`.
- Unbound `range(0,16384)` length 16384; `range(0,16385)` → guest memory.
  Empty ranges first do **not** consume that 16384 budget.
- `range(5,5)` and `range(7,2)` → `[]`.
- `internArray` of 100000 stored in 6 ms; `__array_append` 100000 stored in
  3 ms; raw JS 1e5 alloc in 1 ms (detector can still go red on those paths).
- `bindMemory` after a 10000 debit **resets** fuel; a second 10000 then
  succeeds.
- Guest 1-page module importing `host.__range`: `go(2,7)=[2,3,4,5,6]`;
  `go(0,100000)` and `go(0,20000)` throw guest memory; after the 1e5
  refuse, handle 0 is still `[2,3,4,5,6]` and `go(0,3)` is handle 1.

## Challenge 1 — does `__range(0, 100000)` still allocate a 1e5 host array?

**No on this Node host+dist path. CONFIRMED refused before `arrays.push`.**

Locators: `wasm-runtime.ts` 588–593 throw, 598–601 allocate-after-admit.
Independent JS host: throw, `readArray(0)` undefined. Guest import: throw,
handle 0 remains the earlier 5-element range. HEAD `MAX_RANGE = 1_000_000`
would have admitted 1e5.

## Challenge 2 — is the second 10000 a fuel refuse (not a vacuous guest-memory OR)?

**Yes. CONFIRMED.** Independent message is exactly `Array.range: fuel exhausted`.
Unbound `guestWords` remains 16384, so 10000 passes the memory check and
fails fuel (`16384 - 10000 = 6384`). The suite regex `/fuel|guest memory/`
is looser than the live discriminator.

## Challenge 3 — does 1-page guest memory refuse 20000?

**Yes. CONFIRMED.** `WebAssembly.Memory({ initial: 1 })` is 65536 bytes =
16384 i32 words. `count=20000 > 16384` throws guest memory on JS host and
on the guest import. `range(0,3)` still succeeds after the refuse (fuel
not consumed on throw).

## Residuals (not findings against the named claim)

- Admitted ranges still live in host JS `arrays[]`, not guest linear memory
  (`wasm-runtime.ts` 299, 598–601).
- Other host collections are unchanged: independent `internArray` of 100000
  and `__array_append` 100000 both stored. Strings/decimals were not part
  of this bound.
- `bindMemory` **resets** `rangeFuel` to current word count (736–739), so a
  prior 10000 debit is restored. Independent: after 10000 then bind 1-page,
  a second 10000 succeeds. Production `admitAndInstantiate` binds once.
- Empty ranges still push `[]` handles without debiting fuel. Handle-table
  growth is not word-metered.
- `Number.isSafeInteger` after `lo | 0` is dead for WASM i32 arguments.
- Source-derived, not executed here: a memory whose word count is `> 100000`
  would admit `range(0,100000)` under the named guest-word rule.
- Scan `0f6063dd` finding `csf_e3409dfe75ff7adda18f556a` stays
  `PARTIAL_THIS_TREE` (inventory note: host `__range` refuses cardinality
  above guest words and debits host range fuel). Sibling interpreter
  finding `csf_03064225783c475027bf7f5b` (`stdlib.ts` `Array.range`) remains
  `OPEN_ON_SCAN_SNAPSHOT`. Inventory `findings.json` sha256
  `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`
  is unchanged by this review. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named claim. Detector is not invalid: HEAD
`MAX_RANGE=1_000_000` would still allocate 1e5, and the current refuse
messages discriminate memory vs fuel. Evidence is sufficient for Node
`createHostRuntime().__range` plus a 1-page guest import on this dirty
tree; insufficient for storing ranges in guest linear memory, bounding
`internArray`/`__array_append`, and scan closure.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
