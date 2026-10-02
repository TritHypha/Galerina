# Independent audit — Node password KDF bcrypt rounds 10..12 (async)

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed. This receipt is not the
author’s packet and is not GPT-6 Astra.

Named claim: Node password KDF provider refuses bcrypt rounds outside
10..12 and hashes/verifies asynchronously (no `hashSync`/`compareSync`).
Dummy password only (`dummy-password-value`).

Argon2 time params remain unbounded in this adapter. This is **not**
124-scan closure (`csf_7a6508dbb21c910a7648d293` remains
`PARTIAL_THIS_TREE`). JSON-Decimal, OAuth, durable replay, signing, and
`.fungi` admission were not started.

Node v24.18.0. Tests import `dist/crypto-provider-node.js` (gitignored).
`dist` mtime is newer than the dirty source and contains the same
10..12 `RangeError` gate plus callback `hash`/`compare` wrappers. This
reviewer did not rebuild.

Committed HEAD already refused rounds outside 10..12 via
`hashSync`/`compareSync`. The dirty slice replaces those with
`bcryptHashAsync` / `bcryptCompareAsync` and exports
`BCRYPT_MIN_ROUNDS=10` / `BCRYPT_MAX_ROUNDS=12`.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-core-compiler/src/crypto-provider-node.ts` | `f07a80fd8fe5af5c74b31cf53c707fdcc3fd328a7ab11d5e5ef914b8da40ad8e` |
| `packages-ts/galerina-core-compiler/dist/crypto-provider-node.js` | `66da82f1c7c3067466e6ef4f30c81b2328752d7dfb0e66cd4f19dfec9893357a` |
| `packages-ts/galerina-core-compiler/tests/bcrypt-rounds-bound.test.mjs` | `39f1665206456d3406ea25f34009f033f9d772d3d8b28e8a5c0707f57dc9bae3` |

Dirty paths for this slice: `M`
`packages-ts/galerina-core-compiler/src/crypto-provider-node.ts`;
untracked
`packages-ts/galerina-core-compiler/tests/bcrypt-rounds-bound.test.mjs`.
Passing tests here are **not** production admission.

Byte-search of src, dist, and the named test: `hashSync=false`,
`compareSync=false`. Local type `BcryptJs` exposes only callback
`hash`/`compare`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| bcrypt hash rounds outside 10..12 refuse | source `crypto-provider-node.ts` 24–25 / 58–61; executed hostile tests + independent probe |
| rounds 13 refuse | executed `BCRYPT_MAX_ROUNDS + 1`; independent `rounds: 13` → `RangeError` `/10..12/` |
| `Infinity` refuse | executed + independent; `Number.isSafeInteger(Infinity)` is false |
| rounds 4 refuse | executed + independent `RangeError` `/10..12/` |
| rounds 10 hash + verify (dummy only) | executed first test; independent `$2b$10$` hash, `matches: true` |
| no `hashSync` / `compareSync` in this adapter | src/dist/test byte-search; wrappers call `bcrypt.hash` / `bcrypt.compare` |
| argon2 time/memory/parallelism clamp | **absent** (`argon2.hash(plaintext, { type: argon2.argon2id })`) |
| 124-finding scan | **not this claim** (`csf_7a6508dbb21c910a7648d293` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=60000 packages-ts/galerina-core-compiler/tests/bcrypt-rounds-bound.test.mjs`
   → **3/3 pass**, 0 fail, `duration_ms 260.1426`.
   - `bcrypt hash at admitted rounds verifies` (129.03ms) — **green**
   - `hostile: source-controlled rounds above 12 are refused` — **green**
     (`13` and `Number.POSITIVE_INFINITY`)
   - `hostile: cheap rounds below 10 are refused` — **green** (`4`)

Independent extra probes (eval only; dummy password; not production):

- Direct `invoke` refuse: `13`, `Infinity`, `4`, `NaN`, `12.5` all
  `RangeError: bcrypt rounds must be a safe integer in 10..12`.
- Direct `invoke` rounds 10: `ok` hash `$2b$10$` length 60; verify
  `matches: true`.
- Direct `invoke` rounds 12: `ok` hash `$2b$12$` (max admitted; not in
  the named suite).
- Installed `bcryptjs` still exports `hashSync`/`compareSync`; this
  adapter does not call them. `hash()` is the async path (`nextTick` /
  100 ms `_hash` slices), not `hashSync`.

## Challenge 1 — do rounds 13 / Infinity / 4 still hash?

**No. CONFIRMED refused** at the provider before `bcrypt.hash`.
Locator: `crypto-provider-node.ts` 58–61. `invokeCryptoProvider` would
map the thrown `RangeError` to `FUNGI-CRYPTO-002`; the named tests
exercise the provider throw directly.

## Challenge 2 — can the rounds detector go red?

**Yes. CONFIRMED.** The hostile tests `assert.rejects` on 13, Infinity,
and 4. Those tests passed. A happy-path-only hash would not satisfy
this axis.

## Challenge 3 — does the adapter still call `hashSync` / `compareSync`?

**No in this source and dist. CONFIRMED for the named files.**
Committed HEAD used `bcrypt.hashSync` / `bcrypt.compareSync`. Dirty
src/dist call callback `hash`/`compare` only. Installed bcryptjs still
contains the Sync APIs; other compiler tests still use `hashSync` as
fixture generators (`phase34-verify-password-service.test.mjs`,
`phase35-39-features.test.mjs`). Those are not this adapter.

## Residuals (not findings against the named claim)

- Argon2 hash still passes only `{ type: argon2.argon2id }`. No
  `timeCost` / `memoryCost` / `parallelism` pin or ceiling. Library
  defaults apply. Scan ID `csf_7a6508dbb21c910a7648d293` stays
  `PARTIAL_THIS_TREE`.
- bcryptjs `hash`/`compare` still run on the JS thread in ~100 ms
  slices. The claim is “not Sync APIs”, not off-thread KDF.
- Verify does not re-check cost of an existing hash (`$2a$04$…` can
  still verify). Named claim is hash-time rounds.
- Named suite couples “13” to `BCRYPT_MAX_ROUNDS + 1` and “10” to
  `BCRYPT_MIN_ROUNDS`. On this tree those are 13 and 10. Independent
  probe used the literals.
- Omitted `rounds` defaults to 10 (source-inspected; not executed).
- `stdlib.ts` `bcryptModule` also refuses rounds outside 10..12 before
  `invokeKdf`. That bound is on committed HEAD, not this dirty
  bcrypt slice. Unrelated dirty `stdlib.ts` (dangling-symlink write
  refuse) was not part of this claim.
- Inventory `findings.json` sha256
  `07cdbef5fec585543467c24db568174dcb60e2631c5dd84c9637c493f4532dd2`
  is unchanged by this review. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named claim. Detector is not invalid.
Evidence is sufficient for provider-level 10..12 refuse, dummy
hash+verify at 10, and absence of `hashSync`/`compareSync` in this
adapter; insufficient for argon2 cost clamp, scan closure, and
production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
