# Independent audit — AuditEgress.verifyChain omitted hmacKey HOLD

**Verdict: PASS** (scoped to the named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7` (branch `main`, dirty,
ahead 1 of `origin/main`). Verified `git worktree list` entry
`./.worktrees/rd-0873-native-fungi-bootstrap-implementation e8f1b6823 [main]`.
`Galerina.worktrees` is not this tree (`Test-Path` False for
`<GALERINA_WORKTREES_ROOT>` and
`./Galerina.worktrees`). It is
**not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or
signed. `.fungi` was not touched. This receipt is not the author’s
packet and is not GPT Astra. Passing tests here are **not** production
admission. Finding inventory was **not** promoted.
`csf_0f748088754ddb920ceb641f` stays **PARTIAL_THIS_TREE**. Do **not**
promote **PATCHED**.

Reviewer: Grok independent auditor (did not author these changes).

Named claim:

- `AuditEgress.verifyChain(batches)` with `hmacKey` omitted now returns
  `false` and does not authenticate using `ZERO_KEY`.
- Hostile: a ZERO_KEY-sealed ledger fails omitted `verifyChain` and
  passes with explicit `new Uint8Array(32)`.
- Positive: injected non-zero key still verifies.
- Tests: `packages-ts/galerina-core-sentinel-egress` hmac-chain +
  never-drop **10/10**.
- Finding `csf_0f748088754ddb920ceb641f` stays
  **PARTIAL_THIS_TREE**. Do **not** promote **PATCHED**.
- Residual: constructor still defaults omitted writer `hmacKey` to
  `ZERO_KEY`.
- Do **not** treat full-sentinel-flight `LSS-KEY-001` as part of this
  claim (pre-existing `StateSerializer`).

Platform this review: win32 Node v24.18.0, npm 12.0.2.

This reviewer independently re-read the named production files + tests +
gitignored `dist/audit-egress.js`, hashed working-tree bytes, re-ran
`npx tsc -p tsconfig.json` then the named suite, and executed an extra
probe from `%TEMP%\verifychain-omitted-key-probe.mjs` (not by trusting
the named tests alone). Independent `crypto.createHash('sha256')` and
`Get-FileHash` **MATCH** each other on every hashed row
(`MISMATCH_COUNT=0`).

HEAD subject: `docs(roadmap): clarify committed checkpoint and SVG hold`.

## Dirty slice vs HEAD `e8f1b682`

| path | vs HEAD |
|---|---|
| `packages-ts/galerina-core-sentinel-egress/src/audit-egress.ts` | **M** HEAD blob `27f8cad99d` → WT blob `7baa712011`. HEAD `verifyChain` was `const key = hmacKey ?? ZERO_KEY`. THIS TURN: `if (hmacKey === undefined) return false;` then `const key = hmacKey`. Constructor still `this.#hmacKey = opts.hmacKey ?? ZERO_KEY` (unchanged). |
| `packages-ts/galerina-core-sentinel-egress/tests/hmac-chain.test.mjs` | **M** HEAD blob `b4dcff41df` → WT blob `fe584281ba`. THIS TURN: `DEV_KEY = new Uint8Array(32)`; intact-chain asserts pass `DEV_KEY`; new hostile omitted-key test; injected non-zero test still expects omitted `verifyChain` `false`. |
| `packages-ts/galerina-core-sentinel-egress/tests/never-drop.test.mjs` | **M** HEAD blob `847df942a9` → WT blob `5a5821331c`. THIS TURN: never-drop chain assert supplies `new Uint8Array(32)` instead of omitting the key. |
| `packages-ts/galerina-core-sentinel-egress/dist/audit-egress.js` | gitignored; rebuilt this review (`tsc` exit 0); `verifyChain` 179–183 matches src (`hmacKey === undefined` → `false`); constructor 79 still `opts.hmacKey ?? ZERO_KEY`. |

Unrelated dirty on this worktree was not this claim. Inventory
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json` already records
this finding as `PARTIAL_THIS_TREE` with a note about omitted
`verifyChain`; this reviewer did not edit it.

## Source hashes on this tree

Independent SHA-256 of the working-tree bytes (`Get-FileHash` and
`crypto.createHash('sha256')` MATCH each other). Post-`tsc` dist hashes
below.

| path | bytes | sha256 | mtime UTC |
|---|---|---|---|
| `packages-ts/galerina-core-sentinel-egress/src/audit-egress.ts` | 13730 | `89ceae6e57ec4b8e0de3c3f0b30898bf2cbf165a40a20e8fa6b93171f8447fb3` | 2026-09-23T18:45:36.432Z |
| `packages-ts/galerina-core-sentinel-egress/tests/hmac-chain.test.mjs` | 4709 | `1090b9b63761cf557296ec5e416482349c9aaa2eacff0aa54f5dff8be5150da4` | 2026-09-23T18:45:36.446Z |
| `packages-ts/galerina-core-sentinel-egress/tests/never-drop.test.mjs` | 2412 | `450080811d5998edbfa7f56ab575c12f357b260b2683773cba31268dac32889e` | 2026-09-23T18:45:36.432Z |
| `packages-ts/galerina-core-sentinel-egress/dist/audit-egress.js` | 11604 | `5670376cf668aa9accf311f4d877b75505719d8c329fe7056fda0deee199faeb` | 2026-09-23T18:48:24.846Z |
| `packages-ts/galerina-core-sentinel-egress/dist/index.js` | 542 | `2451627c7898e12d4dd653b701f0f744a19509b8bc304aa8736fc76379b4f7ef` | 2026-09-23T18:48:24.850Z |
| `packages-ts/galerina-core-sentinel-egress/src/index.ts` | 575 | `c3d0c36fe60a12cd6aab0e898f4b81b03faa8701f7076b01ad69a03527ae40b2` | 2026-09-08T20:31:56.012Z |

`dist/` is gitignored (`packages-ts/.gitignore` `dist/`). Tests import
`../dist/audit-egress.js`. Dist `verifyChain` / constructor match src.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Omitted `hmacKey` does not authenticate with `ZERO_KEY` | src 260–264 / dist 179–183: `if (hmacKey === undefined) return false;` HEAD was `hmacKey ?? ZERO_KEY`. Independent probe `omitted_ctor_omitted_verify=false`, `zero_sealed_omitted_verify=false`. Named hostile test. |
| ZERO_KEY-sealed ledger fails omitted `verifyChain` | Named `"hostile: omitted hmacKey does not authenticate a ZERO_KEY ledger"`; independent `zero_sealed_omitted_verify=false` and constructor-omitted writer `omitted_ctor_omitted_verify=false`. |
| Same ledger passes with explicit `new Uint8Array(32)` | Named hostile `verifyChain(batches, DEV_KEY) === true`; never-drop supplies `new Uint8Array(32)`; independent `zero_sealed_explicit_zero=true`, `omitted_ctor_explicit_zero=true`. |
| Injected non-zero key still verifies | Named `"chain verifies under an injected (non-zero) HMAC key"` (`fill(42)`); independent `real_sealed_with_real=true`, `real_sealed_omitted=false`, `real_sealed_with_zero=false`. |
| Constructor omitted writer key still `ZERO_KEY` | **RESIDUAL CONFIRMED.** src 146 / dist 79: `this.#hmacKey = opts.hmacKey ?? ZERO_KEY`. Independent: omitted-ctor ledger verifies under explicit zeros and fails under `fill(42)`; `ctor_omitted_threw=false`. `strictKey: true` still throws `EGR-KEY-001`. |
| Dist matches src | **CONFIRMED** same omitted-key gate, same constructor default |
| Named node tests | **10/10 pass**, `duration_ms 170.9484`, 0 fail |
| full-sentinel-flight `LSS-KEY-001` / `StateSerializer` | **not this claim** (pre-existing; out of scope) |
| 124-finding scan | **not this claim** (`csf_0f748088754ddb920ceb641f` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `npx tsc -p tsconfig.json` in
   `packages-ts/galerina-core-sentinel-egress`
   → **exit 0**.
2. `node --test tests/hmac-chain.test.mjs tests/never-drop.test.mjs`
   → **10/10 pass**, 0 fail, `duration_ms 170.9484`.
   - `readEgressLedger after several batches -> verifyChain === true` — **green**
   - `mutating one record in one batch -> verifyChain === false` — **green**
   - `breaking a prevHash link -> verifyChain === false` — **green**
   - `a wrong HMAC key -> verifyChain === false` — **green**
   - `merging newline-containing records cannot preserve the MAC` — **green**
   - `splitting one record into two cannot preserve the MAC` — **green**
   - `chain verifies under an injected (non-zero) HMAC key` — **green**
   - `hostile: omitted hmacKey does not authenticate a ZERO_KEY ledger` — **green**
   - `pushing more than ringCapacity records never drops an audit record` — **green**
   - `ringCapacity defaults to batchSize*4 and still loses nothing` — **green**

Independent extra probes (eval only; temp
`%TEMP%\verifychain-omitted-key-probe.mjs`, not production; imports the
same gitignored `dist/index.js`):

- Constructor omitted `hmacKey` still admits; sealed ledger:
  omitted `verifyChain` **false**; explicit `new Uint8Array(32)`
  **true**; `fill(42)` **false**.
- Explicit `hmacKey: new Uint8Array(32)` writer: omitted verify
  **false**; explicit zeros **true**; `fill(42)` **false**.
- Injected `fill(42)` writer: that key **true**; omitted **false**;
  zeros **false**.
- Empty batches: omitted **false**; with any supplied key **true**
  (vacuous chain).
- Tamper with explicit ZERO_KEY **false**; omitted tamper also
  **false** (omitted gate).
- Merge of newline-joined records with explicit ZERO_KEY **false**.
- `verifyChain(..., null)` throws `ERR_INVALID_ARG_TYPE` (Node
  `createHmac`), not a boolean false.
- `verifyChain(..., new Uint8Array(0))` returned **true** on a
  ZERO_KEY-sealed ledger (HMAC-SHA256 zero-pads short keys to the
  64-byte block; empty and 32-zero are MAC-equivalent). Residual,
  not the named omitted-`undefined` claim.
- `strictKey: true` omitted writer key → `EGR-KEY-001`.
- Probe named-claim bullets matched. Residual empty-array MAC
  equivalence noted. Node v24.18.0.

## Challenge 1 — does omitted `verifyChain(batches)` still authenticate with `ZERO_KEY`?

**No. CONFIRMED refused.** Locator: src 260–264 / dist 179–183. HEAD
`hmacKey ?? ZERO_KEY` is gone from `verifyChain`. Named hostile test and
independent omitted-ctor / explicit-ZERO_KEY-writer probes all return
`false` when the second argument is omitted.

## Challenge 2 — does a ZERO_KEY-sealed ledger pass with explicit `new Uint8Array(32)`?

**Yes. CONFIRMED.** Named hostile `DEV_KEY` and never-drop
`new Uint8Array(32)`. Independent `zero_sealed_explicit_zero=true` and
`omitted_ctor_explicit_zero=true`.

## Challenge 3 — does an injected non-zero key still verify?

**Yes. CONFIRMED.** Named `fill(42)` test. Independent
`real_sealed_with_real=true`, and that ledger is **false** under omitted
key and under ZERO_KEY.

## Challenge 4 — does the constructor still default omitted writer `hmacKey` to `ZERO_KEY`?

**Yes. RESIDUAL CONFIRMED.** src 146 / dist 79 unchanged vs HEAD.
Independent omitted-ctor construction does not throw; the ledger
authenticates only under explicit zeros. `strictKey` remains the
opt-in constructor refuse (`EGR-KEY-001`).

## Residuals (not findings against the named omitted-`verifyChain` claim)

- Constructor still defaults omitted writer `hmacKey` to `ZERO_KEY`
  (src 146). A ledger can still be sealed under the public all-zero
  development key without `strictKey`. That is the named residual.
  Do **not** promote **PATCHED**.
- `verifyChain` does not call `isWeakKey`. An empty `Uint8Array` is
  not `undefined`, so it bypasses the omitted-key gate. Independent
  probe: `verifyChain(zeroSealed, new Uint8Array(0)) === true` because
  HMAC-SHA256 zero-pads keys shorter than one SHA-256 block.
  `null` throws `ERR_INVALID_ARG_TYPE` instead of returning `false`.
- Several hmac-chain tamper / merge / split asserts now call
  `verifyChain(mutated)` with the key omitted, so they are
  tautological under the new gate (always `false` even if the MAC
  were intact). Tamper detection with an explicit key is still
  proven by the independent probe (`tamper_with_zero=false`,
  `merge_with_zero=false`) and by `"a wrong HMAC key"`.
- `verifyChain` JSDoc still describes chain integrity only; it does
  not document the omitted-key fail-closed return.
- `full-sentinel-flight.test.mjs` `new StateSerializer()` /
  `LSS-KEY-001` is **out of scope** for this claim (pre-existing
  StateSerializer). That file’s egress asserts were not re-run here.
- Scan ID `csf_0f748088754ddb920ceb641f`
  (`Audit-chain MAC does not bind record boundaries`, medium,
  `packages-ts/galerina-core-sentinel-egress/src/audit-egress.ts`)
  stays `PARTIAL_THIS_TREE`. Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `b99cfd31cf3ad19ba1b46fea9caadfa1268775b5a84189b808894cd9e32b34fb`
  was not edited by this review. Assigned inventory totals **0 OPEN /
  120 PARTIAL / 4 PATCHED** were not re-counted. Not 124-scan
  closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named omitted-`verifyChain` /
explicit-ZERO_KEY-pass / injected-non-zero-pass claim. Detector is
not invalid. Evidence is sufficient for those three bullets plus the
named constructor residual; insufficient for writer-key custody,
HMAC short-key padding, scan closure, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan
closure. **Not clean-HEAD evidence.** **Not PATCHED.**
