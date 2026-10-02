# Easy wins then one hard task — 2026-09-22

**Overall:** INCOMPLETE_NON_AUTHORITATIVE. Author-run checks. Independent
review of this batch pending. HEAD `91b4dec08fe4376febc9494a8023bd02912b8695`
dirty. No commit.

Later live inventory (2026-09-23) is **69 OPEN / 51 PARTIAL / 4 PATCHED**.
The 114 OPEN figure in A4 is this packet's batch-time count.

## Phase A

| Item | Changed files | Before → after | Identity | Review | Residual |
|---|---|---|---|---|---|
| A1 JSON UTF-8 budget | `json-encode-budget.test.mjs` (escape-boundary added; encoder preserved) | focused 6/6 → **7/7**; package **40/40** | `json-value.ts` sha256 `d017efe4068aac7b9415448313b63a36de2ba10efb191cbab6dd888f7431eeef` | pending | integer-only v1; not Decimal |
| A2 secrets CLI echo | `io.ts` `promptNoEcho` + `promptNoEchoExclusive`; `cli.ts` REPL; `tests/io-prompt.test.mjs` + `tests/cli-repl-echo.test.mjs` | readline echo of dummy secret → muted `_ttyWrite`; **7/7** | io sha256 `f9071378…` | scoped PASS `01a0cb29` | hardware TTY **NOT VERIFIABLE** |
| A3 three-boundary docs | operator notes; packet SLIDE/Lyth locators | stale expected-FINDING → current PASS; private user path removed | packet + operator | HOLDs retained | historical receipts kept |
| A4 scan `0f6063dd` | `docs/reports/scan-0f6063dd-disposition-2026-09-22.md` + inventory JSON | no per-ID map | **124/124 IDs inventoried**; 114 OPEN_ON_SCAN_SNAPSHOT | findings.json sha256 `07cdbef5…` | closure **not** claimed |

## Phase B

**Invariant:** a secret WASM call owns only `[owner_base, $__fungi_heap)` for
its lifetime. Nested calls snapshot `owner_base` at entry. Cleanup zeros and
reclaims that range only. Host cleanup after copy zeros `[WAT_HEAP_BASE, heap)`,
not the rest of exported memory.

| Item | Changed files | Before → after | Identity | Review | Residual |
|---|---|---|---|---|---|
| Nested secret wipe | `wat-emitter.ts` `$__fungi_owner_base` + owned `memory.fill` | nested fixture **7 ≠ 14** → **14** | emitter sha256 `5677b2285a0ee7c227518b06c3770d023af8473b72b801d39d30ad2498844008` | HOLD `01a0caa2-30dd-7b30-bfed-5a1c2478fda1` | leaf-misclassification if `(call $name` missed remains PLAUSIBLE |
| Host over-wipe | guest `__fungi_wipe_owned` + `copyI32ThenWipeSecretHeap`; heap global is not exported | sentinel `0x11111111` above heap survives; `__fungi_heap` export absent | emitter sha256 `1215d1ece4080d16710a1dc9a5d59a899c2afff6316a98fb5bf91f77d1d192f6` | scoped PASS `01a0caab-4173-7b32-a51b-204d0dfd9632` | `wipeSecretHeapAfterHostCopy` can still wipe without a prior copy; exported `memory` remains host-writable |
| Closed recursive flatten | `flattenClosedRecursivePlan` in `wat-emitter.ts` | 8-hop pad `[0×8,1,7]` and lossy `[0,7]` → **`[0,1,7]`**; omitted child **`[0,0,7]`**; Outer still `[7,99]` | emitter sha256 `377ff5f0912542085bdf620c705f2be24cdd37e921c8bf3a22214b560249522e` | scoped PASS `01a0cb1b-b407-73b2-a16e-de6b3f417ff9` | Deeper than one recursive expansion still drops grandchild secrets; `let leaf = Node { child: leaf }` traps |

Unsupported: genuine host-import exceptions on wasm-standalone; Windows-native FIFO; runtime cycle-walk flatten.

Do not treat this as production admission or 124-scan closure.
