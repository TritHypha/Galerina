# Independent audit — HybridInferenceEngine does not plan attacker-chosen opClasses before admission

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `HybridInferenceEngine` does not plan attacker-chosen
`opClasses` before admission.

- `#admitOpClasses` refuses length outside
  `1..STANDARD_INFERENCE_OPS.length` (6) or ops not in the STANDARD set.
- `infer()` calls `planFor` on request ops only after `govTrap` is null.
- Oversized `Array(32).fill("feedforward")` and `["not-an-admitted-op"]`
  trap `ERR_PLAN_NOT_PREFLIGHTED`.

Tests: `packages-ts/galerina-tower-citizen/tests/plan-memoization.test.mjs`
`"hostile: oversized or unknown opClasses are refused without in-flight
planning"` plus the four existing memo/seal cases. Import dist.

Scan `csf_ae1e06eae125bbb82c0c332a` is **PARTIAL_THIS_TREE**. Inventory
**80 OPEN / 40 PARTIAL / 4 PATCHED** was independently re-counted from
this tree’s inventory JSON `disposition_counts` (124 finding rows / 124
unique IDs). This is **not** 124-scan closure. Not Astra. Not production
admission.

Node v24.18.0, Windows win32 x64 (NT 10.0.19045). This reviewer did not
rebuild. Dist is gitignored (`packages-ts/.gitignore` `dist/`). Tests
import `../dist/index.js`, which re-exports `createHybridEngine` /
`HybridInferenceEngine` from `./hybrid-engine.js`. Dist
`hybrid-engine.js` mtime (`2026-09-23T02:28:03.002Z`) is newer than dirty
`src/hybrid-engine.ts` (`2026-09-23T02:27:50.185Z`). Dist is **not stale**
vs src for this claim: both `#admitOpClasses` refuse length outside 1..6
and non-STANDARD members; both set `govTrap` from `ops === null ||
!planPreflighted` **before** `planFor(ops)`; both trap receipts call
`planFor(STANDARD_INFERENCE_OPS)`.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-tower-citizen/tests/plan-memoization.test.mjs`
(+21 lines: the named hostile oversized/unknown case).
Production `#admitOpClasses` and the `govTrap`-before-`planFor(ops)`
order are **already in HEAD** (git blob
`a6ef58f690eb7ca02cac338b679de497332f08a6`; landed in ancestor
`e1bb4a4f4e46597bb122eebec6fa5f01a67c2eba`). Dirty `src/hybrid-engine.ts`
(+12 lines) only adds `#bridgeAttestationInFlight` / `#runBridgeAttestation`
coalescing. That does **not** change admit/plan order and is not this
claim. Dist is untracked (gitignored) and also carries the unrelated
in-flight field.

## Source hashes on this tree

Author-named hashes MATCH all three listed files. Independent SHA-256 of
the working-tree bytes (`crypto.createHash('sha256')`).

| path | sha256 |
|---|---|
| `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts` | `ed1f4c23be89bb6e535e743bbf255d55950d2e02c7906cf059b5ea4da56599cc` |
| `packages-ts/galerina-tower-citizen/dist/hybrid-engine.js` | `8ae47a33425382573eb67a44307fc2828a818cddf2ddf365a23a48977f55501f` |
| `packages-ts/galerina-tower-citizen/tests/plan-memoization.test.mjs` | `07cb47886cfa0dc025d208ca25775ffe3af324a51d9adb019a29c0dffbe2b714` |

`dist/index.js` (re-export only; sha256
`a25d2ae0912dd4c68ab363f79fa37124a3c6d991c9a474f44d30259ba26c1d32`)
exports `HybridInferenceEngine` / `createHybridEngine` from
`./hybrid-engine.js`. Dist is not in HEAD.

HEAD src blob `a6ef58f690eb7ca02cac338b679de497332f08a6` (sha256
`04e12188e361ac514dd175e65ea868d739797e6df84431740e407270c7bd754a`)
already contains `#admitOpClasses`. Working-tree src blob
`1ba8b9923967c322c6d52004f601288c59003748` differs only by the unrelated
attestation in-flight coalescing. HEAD test blob
`b86e5a48e8b2aa2ab882b997022e5fc8716e85e7` (sha256
`7dd40d3f41b38cfb0250bb668c72f648d4e4104b4b7154b15c0b42b93ff64e27`)
lacks the hostile oversized/unknown case. Working-tree test blob
`bf5de74cb904dabe9272f50452080c68ad27a8b8`.

Scan-era `0f24ca30ef3f173c43a60c914c18b161327f2227` is an ancestor of
this HEAD. That blob of `src/hybrid-engine.ts` had **no**
`#admitOpClasses`. Unsealed `infer()` did
`const ops = request.opClasses ?? STANDARD_INFERENCE_OPS` then
`const plan = planPreflighted ? this.planFor(ops) : this.planFor(STANDARD_INFERENCE_OPS)`
**before** `tower.load` / the governance gate. Unsealed
`planPreflighted` is true, so attacker `opClasses` were planned and
persisted in `planCache` before admission.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `#admitOpClasses` refuses length outside 1..6 | src 808–812 / dist 592–596: `!Array.isArray` or `length < 1` or `length > STANDARD_INFERENCE_OPS.length` → `null`. `STANDARD_INFERENCE_OPS` is 6 strings (src 48–54 / dist 36–43) |
| `#admitOpClasses` refuses ops not in STANDARD | src 813–819 / dist 597–604: `typeof op !== "string" \|\| !allowed.has(op)` → `null` |
| `infer()` plans request ops only after `govTrap` is null | src 826–867 / dist 610–647: `#admitOpClasses` then `govTrap` (`ops === null \|\| !planPreflighted` → `ERR_PLAN_NOT_PREFLIGHTED`); `const plan = this.planFor(ops ?? STANDARD_INFERENCE_OPS)` is **after** the `if (govTrap)` return |
| Oversized `Array(32).fill("feedforward")` traps `ERR_PLAN_NOT_PREFLIGHTED` | named hostile; independent `oversized_trap true ERR_PLAN_NOT_PREFLIGHTED`; `planCache.has(32-feedforward-key) === false` |
| Unknown `["not-an-admitted-op"]` traps `ERR_PLAN_NOT_PREFLIGHTED` | named hostile; independent `unknown_trap true ERR_PLAN_NOT_PREFLIGHTED`; `planCache.has("not-an-admitted-op") === false` |
| Dist admit/plan order not stale vs src | **CONFIRMED** same length/membership refuse, same `govTrap` before `planFor(ops)`, same trap-receipt `planFor(STANDARD_INFERENCE_OPS)` |
| Trap receipt still `planFor(STANDARD)` | src 864 / dist 645; independent oversized/unknown receipts have 6 STANDARD opClasses. Residual, not a named-claim fail |
| Named node tests | **5/5 pass** under the assigned file, `duration_ms 188.6158` |
| 124-finding scan | **not this claim** (`csf_ae1e06eae125bbb82c0c332a` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=60000 packages-ts/galerina-tower-citizen/tests/plan-memoization.test.mjs`
   → **5/5 pass**, 0 fail, `duration_ms 188.6158`.
   - `the plan is memoized — repeated infers reuse one plan, identical result` — **green** (13.1131ms)
   - `seal() preflights the standard plan and reports it` — **green** (0.5076ms)
   - `a sealed deployment DENIES an op-set that was never preflighted` — **green** (1.1542ms)
   - `hostile: oversized or unknown opClasses are refused without in-flight planning` — **green** (1.9195ms)
   - `a sealed deployment PERMITS a preflighted op-set` — **green** (2.4029ms)

Independent extra probes (eval only; temp
`%TEMP%\inference-plan-admit-probe.mjs`, not production; imports the same
gitignored `dist/index.js`). Printed `PROBE_OK`. Node v24.18.0.

Current dist (`createHybridEngine` with unattested/unsigned opt-ins; TS
`private planCache` is runtime-visible):

- `Array(32).fill("feedforward")` → trap `ERR_PLAN_NOT_PREFLIGHTED`;
  receipt `plan.decisions` are the 6 STANDARD classes; cache size 1;
  cache key is only
  `embedding,attention,normalization,feedforward,kv_cache,output_head`;
  32-`feedforward` key **absent**.
- `["not-an-admitted-op"]` → trap `ERR_PLAN_NOT_PREFLIGHTED`; receipt
  plan is STANDARD; `"not-an-admitted-op"` cache key **absent**.
- `[]` → trap `ERR_PLAN_NOT_PREFLIGHTED`; empty-string cache key
  **absent**.
- `Array(7).fill("feedforward")` → trap; 7-`feedforward` key **absent**.
- `Array(6).fill("feedforward")` → **admitted** (`trapFired false`);
  plan is six `feedforward`; that key **is** cached (after admission).

Scan-shaped reconstruction of `0f24ca30` (no `#admitOpClasses`; unsealed
`planFor(ops)` before load) via current `planHybridInference`:

- `Array(32).fill("feedforward")` → **32** decisions
  (`scan_shaped_huge_len 32`).
- `["not-an-admitted-op"]` → **1** decision, `fp16` floor
  (`scan_shaped_unknown_len 1`).

That is the scan-era match: untrusted `opClasses` were planned and
would persist in `planCache` before any membership/length gate. Current
dist refuses those arrays in `#admitOpClasses` and never
`planFor`s them.

## Challenge 1 — does oversized `Array(32).fill("feedforward")` still get planned before admission?

**No. CONFIRMED refused.** Length 32 fails `#admitOpClasses` before any
iteration of the 32 names. Named hostile and independent
`oversized_cache_has_huge=false`. Receipt plan is STANDARD (6), not 32
`feedforward`. Scan-shaped `planHybridInference` of the same array is
length 32.

## Challenge 2 — does `["not-an-admitted-op"]` still get planned?

**No. CONFIRMED refused.** Membership fail → `null` →
`ERR_PLAN_NOT_PREFLIGHTED` before `planFor(ops)`. Independent
`unknown_cache_has_unknown=false`. Scan-shaped `planHybridInference`
still emits one `fp16` decision for that string.

## Challenge 3 — are dist admit/plan-order checks stale vs src?

**No. CONFIRMED not stale.** Dist mtime is newer than src. Dist
`#admitOpClasses` (592–606) and `govTrap` / `planFor(ops)` (610–647) are
the same predicates and the same order as src 808–821 and 826–867. Tests
import that dist re-export. Dirty src vs HEAD does not touch this path.

## Challenge 4 — does the trap path still `planFor(STANDARD_INFERENCE_OPS)`?

**Yes. CONFIRMED residual.** Src 864 / dist 645 build the trap receipt
with `this.planFor(STANDARD_INFERENCE_OPS)`. Independent oversized and
unknown receipts carry the 6 STANDARD opClasses; `initialize()` has
already cached that key, so the trap call is a cache hit of STANDARD,
not of the attacker array. Named claim does not require this residual
to fail.

## Residuals (not findings against the named admit-before-plan claim)

- Trap receipts still `planFor(STANDARD_INFERENCE_OPS)` (src 864 / dist
  645). That allocates/persists the **standard** plan, not the refused
  attacker `opClasses`. First `infer()` also `initialize()`s, which
  plans STANDARD before request admission.
- Repeats of **allowed** names within length 6 are admitted and then
  planned: independent `Array(6).fill("feedforward")` is
  `trapFired false` and caches that key. The named refuse is length
  outside 1..6 or ops not in STANDARD, not uniqueness inside STANDARD.
- `planHybridInference` itself still has no length/membership gate.
  Direct callers (and scan-era `infer`) can still map an unbounded
  attacker array. `infer()` no longer does that.
- Scan ID `csf_ae1e06eae125bbb82c0c332a`
  (`Untrusted inference plans allocate and persist before admission or input bounds`,
  medium, `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts`)
  stays `PARTIAL_THIS_TREE`. Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `76431095cf9305eb88482a87a062f5f95b9eb6229d4fa6ce5fa73ea00a505a91`
  `disposition_counts` are **80 OPEN / 40 PARTIAL / 4 PATCHED**
  (independently counted: 124 rows / 124 unique `finding_id`s). This
  review did not re-adjudicate the other 123 IDs. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named oversized/unknown-refuse /
`planFor(ops)`-only-after-`govTrap`-null claim. Detector is not
invalid. Evidence is sufficient for those bullets; insufficient for
uniqueness-inside-STANDARD, trap-receipt STANDARD planning, scan
closure, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
