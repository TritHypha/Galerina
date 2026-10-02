# Independent audit — freivaldsVerify refuses non-finite products

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `freivaldsVerify` does not accept non-finite products as a
match.

- Scan `0f24ca30` compared `Math.abs(ABr[i]-Cr[i]) > tol` only; `NaN-NaN`
  does not exceed `tol`, so Inf/NaN in `C` could return `true`.
- Current: `isSquare` refuses non-finite entries; probe products must be
  finite; Inf/NaN `C` returns `false`. Identity 2×2 still `true`.

Tests: `packages-ts/galerina-ext-photonic-emulator/tests/emulator.test.mjs`
`"hostile: Freivalds refuses non-finite products"` plus E5. Import dist.

Scan `csf_758d92313370e633b8bc394d` is **PARTIAL_THIS_TREE**. Inventory
**82 OPEN / 38 PARTIAL / 4 PATCHED** was recorded as assigned scan
context and matches this tree’s inventory JSON `disposition_counts`.
This is **not** 124-scan closure. Not Astra. Not production admission.

Node v24.18.0, Windows win32 x64 (NT 10.0.19045). This reviewer did not
rebuild. Dist is gitignored (`packages-ts/.gitignore` `dist/`). Tests
import `../dist/index.js`, which re-exports `freivaldsVerify` from
`./freivalds.js`. Dist `freivalds.js` mtime (`2026-09-23T00:53:00.000Z`)
is newer than clean-vs-HEAD `src/freivalds.ts` (`2026-09-22T07:17:33.000Z`).
Dist is **not stale** vs src: both `isSquare` refuse any non-finite
entry; both refuse non-finite probe products before the `abs > tol`
compare.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-ext-photonic-emulator/tests/emulator.test.mjs`
(+10 lines: the named hostile Inf/NaN/`I` case).
`src/freivalds.ts` is **clean vs HEAD** (git blob
`4fc108fdfc289136c646a6bab94f3647415c975c`). Unrelated dirty
`src/index.ts` only adds a `MAX_KERNEL_N` re-export; the Freivalds
export line is unchanged. Dist is untracked (gitignored).

## Source hashes on this tree

Author-named hashes MATCH all three listed files. Independent SHA-256 of
the working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-ext-photonic-emulator/src/freivalds.ts` | `76b837aa6f2714a88679953108065ba59e459205e0db2b52fd436fa1143781a3` |
| `packages-ts/galerina-ext-photonic-emulator/dist/freivalds.js` | `36a28ec30b4f99925c9bbb48dfc9d24f256dc41872c86dc08e3d65008cf4ad1d` |
| `packages-ts/galerina-ext-photonic-emulator/tests/emulator.test.mjs` | `2a693b64e61b70da7c3762708953488bb24cae0ca892be4807d21dd39139b577` |

`dist/index.js` (re-export only; sha256
`cd96c3ac4dc38722dad1e940e3f2b894a98af5e1ba4539b639b38ac5dac121f1`)
exports `freivaldsVerify` from `./freivalds.js`. Dist is not in HEAD.
HEAD test blob `66f23f3274e721d1c8a4820ea29ea39d6d0f20a2` lacks the
hostile non-finite case. Working-tree test blob
`71005948b3c003501ca574fe5f4bff6a09b0b412`.

Scan-era `0f24ca30ef3f173c43a60c914c18b161327f2227` is an ancestor of
this HEAD. That blob of `src/freivalds.ts` had no `isSquare`, no `n`/`k`
bounds, and compared only `Math.abs(ABr[i]! - Cr[i]!) > tol`. The
finite-entry / finite-product refuse landed in
`eb1645a4fd6aedec3fabb646ec5c84001aa30ff1`
(`fix(security): checkpoint runtime and tooling hardening`).

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| `isSquare` refuses non-finite matrix entries | src 56–64 / dist 63–75: every `Float64Array` cell must `Number.isFinite`. `freivaldsVerify` src 37 / dist 41 returns `false` unless A, B, and C all pass |
| probe products must be finite | src 49 / dist 55–56: `!Number.isFinite(left) \|\| !Number.isFinite(right)` → `false` **before** `Math.abs` |
| Inf/NaN `C` returns `false` | named hostile; independent `infC_*` / `nanC_*` / `nInfC_rng01` all `false` |
| identity 2×2 still `true` | named hostile `freivaldsVerify(I,I,I,…)=true`; independent `I_I_I_rng01` and `I_I_I_rng09` both `true` |
| Dist `isFinite` checks not stale vs src | **CONFIRMED** same `isSquare` loop, same product `isFinite`, same `abs > tol` after the finite gate, same rng-bit `isFinite` |
| Scan-era abs-only would accept NaN `C` | reconstructed `0f24ca30` loop: `nanC_rng01=true` and `nanC_rng09=true`. IEEE: `Math.abs(NaN-0) > 1e-9 === false`, `Math.abs(NaN-NaN) > 1e-9 === false` |
| Named node tests | **2/2 pass** under the assigned name pattern, `duration_ms 184.2803` |
| 124-finding scan | **not this claim** (`csf_758d92313370e633b8bc394d` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=60000 --test-name-pattern "Freivalds|non-finite" packages-ts/galerina-ext-photonic-emulator/tests/emulator.test.mjs`
   → **2/2 pass**, 0 fail, `duration_ms 184.2803`.
   - `E5: Freivalds catches out-of-tolerance product (≥1−2⁻ᵏ), verify cheaper than the op` — **green** (53.465ms)
   - `hostile: Freivalds refuses non-finite products` — **green** (0.1902ms)

Independent extra probes (eval only; temp
`%TEMP%\freivalds-nonfinite-probe.mjs`, not production; imports the same
gitignored `dist/index.js`). `n=2`, `k=4`, `tol=1e-9`. Printed
`PROBE_OK`. Node v24.18.0.

Current dist (`rng01` = constant `0.1` → all-zero 0/1 probe; `rng09` =
constant `0.9` → all-one probe):

- `freivaldsVerify(I,I,I)` → `true` (`rng01` and `rng09`)
- Inf `C` → `false` (`rng01` and `rng09`)
- −Inf `C` → `false`
- NaN `C` → `false` (`rng01` and `rng09`)
- Inf `A` / Inf `B` → `false`
- IEEE: `Number.isFinite(NaN/Inf/-Inf)` all `false`

Scan-shaped abs-only reconstruction of `0f24ca30` (no `isSquare`, no
product `isFinite`, only `Math.abs(ABr[i]-Cr[i]) > tol`):

- identity still `true`
- NaN `C` → **`true`** (`rng01` and `rng09`)
- Inf `C` + all-zero probe (`rng01`) → **`true`** (`Inf*0` is `NaN`;
  `Math.abs(0-NaN) > tol` is `false`)
- Inf `C` + all-one probe (`rng09`) → `false` (`Math.abs(1-Inf) > tol`
  is `true`)

That is the scan-era match: NaN in `C` cannot exceed `tol` under
abs-only, so the verifier returned `true`. Current dist refuses those
matrices in `isSquare` and never reaches the abs compare.

## Challenge 1 — does identity 2×2 still verify?

**Yes. CONFIRMED.** Named hostile `assert.equal(..., true)` and
independent `I_I_I_rng01` / `I_I_I_rng09` both `true`. Detector can go
green on the honest product.

## Challenge 2 — does Inf `C` still match?

**No. CONFIRMED refused.** `isSquare` sees `Number.POSITIVE_INFINITY`
and returns `false`. Named hostile and independent `infC_rng01` /
`infC_rng09` are `false`. Scan-shaped abs-only with the named test’s
`rng=()=>0.1` would have returned `true`.

## Challenge 3 — does NaN `C` still match?

**No. CONFIRMED refused.** Named hostile and independent `nanC_rng01` /
`nanC_rng09` are `false`. Scan-shaped abs-only returns `true` for both
probes because `Math.abs(NaN - x) > tol` is `false`. Detector can go
red.

## Challenge 4 — are dist `isFinite` checks stale vs src?

**No. CONFIRMED not stale.** Dist mtime is newer than src. Src blob
equals HEAD. Dist `isSquare` (63–75) and product finite gate (55–56)
are the same predicates as src 56–64 and 49. Tests import that dist
re-export.

## Residuals (not findings against the named non-finite-refuse claim)

- Finite-but-wrong `C` still has the Freivalds **2⁻ᵏ** false-accept
  (algorithm). E5 bounds catch rate at `k=20`; this review does not
  close that bound as a cryptographic guarantee.
- A constant `rng < 0.5` yields the all-zero probe. Independent
  `zeros_as_C_rng01=true` on current dist: any finite `C` matches
  `I·I` under the zero vector. The named hostile test uses that rng;
  Inf/NaN still fail `isSquare` first. Honest uniform rng is assumed
  by the algorithm, not proved here.
- Overflowed-but-finite-entry products fail closed: independent
  `1e308+1e308` Inf `C` is `false`; a finite wrong `C` is `false` on
  the all-one probe (`overflow_wrong_finite_C_rng09=false`) because
  the `ABr` product is non-finite. Same wrong `C` is `true` on the
  zero probe (`overflow_wrong_finite_C_rng01=true`) — the rng residual
  above, not a non-finite accept.
- This is emulator software, not photonic hardware.
- Scan ID `csf_758d92313370e633b8bc394d`
  (`Freivalds verifier accepts non-finite products without detecting mismatch`,
  medium, `packages-ts/galerina-ext-photonic-emulator/src/freivalds.ts`)
  stays `PARTIAL_THIS_TREE`. Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `4e978e7de1aa3fc5d896ad55818187659ac6adf047f89f8a51cdde56960dde4d`
  `disposition_counts` are **82 OPEN / 38 PARTIAL / 4 PATCHED**. This
  review did not re-adjudicate the other 123 IDs. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named Inf/NaN-refuse / identity-still-true
claim. Detector is not invalid. Evidence is sufficient for those
bullets; insufficient for Freivalds false-accept probability, rng
quality, scan closure, photonic hardware, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
