# Independent audit — owner-release gate for linked registry publication

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: linked registry publication cannot use an admit-only
durability profile; it requires `isReleasedRegistryDurabilityProfile`
(owner-release via `activateRegistryDurabilityProfile`).
`publishRegistryGenerationWithLinkedHost` throws TypeError
`/not owner-released/` on the admit-only candidate. Production rotation
`registryDurabilityProfileMatchesRotation` also requires
`isReleasedRegistryDurabilityProfile`. The hostile assertion lives in
`packages-ts/galerina-framework-app-kernel/tests/registry-generation.test.mjs`
inside `"statically linked production generation seam"`.

Scan `csf_4531c31d96dd7d2291a4d57c` is **PARTIAL_THIS_TREE**. Inventory
**90 OPEN / 30 PARTIAL / 4 PATCHED** was recorded as assigned scan
context and was **not** independently re-counted here. This is **not**
124-scan closure.

Node v24.18.0, npm 12.0.2, Windows. Tests import `../dist/index.js`.
`dist/` for this package is **untracked**. Dist mtimes
(`2026-09-22 17:25:37`) are newer than the two src files. This reviewer
did not rebuild dist. Dist was hashed and inspected for the `isReleased`
check because that is what the tests actually import.

## Source hashes on this tree

| path | sha256 |
|---|---|
| `packages-ts/galerina-framework-app-kernel/tests/registry-generation.test.mjs` | `a06784fa302642d5f77a4b692b1bb247c0ad36b31038065ede4c15eee2774136` |
| `packages-ts/galerina-framework-app-kernel/src/registry-generation-store.ts` | `fcdcfa5f0903b199e09d3a99b7caf535da3813c3c59cfd9d3f74a3d27a956842` |
| `packages-ts/galerina-framework-app-kernel/src/registry-durability-production-admission.ts` | `a6ceb96872c265dd308d4dae5145465e7745e0ceb77a7d3d342401c580bd558f` |
| `packages-ts/galerina-framework-app-kernel/dist/registry-generation-store.js` | `00a86808a443f0dc2b3ad836efdc66bbcbf8f922d13d7e7817e564a12524c36f` |
| `packages-ts/galerina-framework-app-kernel/dist/registry-durability-production-admission.js` | `8979b4579d51270de7c9bc51c7bf3a49205facf7c6c8b3a0b57b325a4bf9e472` |
| `packages-ts/galerina-framework-app-kernel/dist/index.js` | `e9b4541e997e514b763dd762310e833fc95cffda9f615b233ccfabe37d0bfb9d` |

Author hash for the test file **matches**. `registry-durability-production-admission.ts`
is **clean vs HEAD**. Dirty paths for this slice:

- `M` `src/registry-generation-store.ts` — FIFO/`O_NONBLOCK` on
  `readBoundedRegularFile` only. The owner-release throw is already in
  HEAD; the dirty hunk does not touch it.
- `M` `tests/registry-generation.test.mjs` — adds the hostile
  admit-only `assert.rejects(..., /not owner-released/)`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Linked publish refuses admit-only profiles | src `registry-generation-store.ts` 659–662; dist `registry-generation-store.js` 389–391; TypeError `"linked registry durability profile is not owner-released"` |
| Gate is `isReleasedRegistryDurabilityProfile` | both src and dist call it before any other linked-publish work besides `sizeBound` |
| Owner-release is `activateRegistryDurabilityProfile` | src 504–563 adds the new frozen object to module-local `releasedProfiles`; admit 395–497 brands `productionProfiles` only and sets `authorityReleased: false` |
| Throws **before** native host work | src 659–662 then 663–678 (generation verify/id/identity) then 680 `loadNode()` / 701 `linkedProductionBinding`. Dist same order: 389 then 406 `loadNode` / 423 binding |
| Hostile test on admit-only candidate | `registry-generation.test.mjs` 527 describe, 612–624 `durabilityProfile: candidate` → `/not owner-released/` **before** the test installs `_galerinaLinkedBinding` |
| Success path uses `activateRegistryDurabilityProfile` | same test 661–690 |
| Named node test | **1/1 pass**, `duration_ms 709.6862` |
| Independent probe: admit-only `isReleased === false` | **CONFIRMED** |
| Independent probe: activate then `isReleased === true` | **CONFIRMED** |
| Production rotation also requires released brand | src 595–599 / dist 395–396; probe `rotation_admit_only=false`, `rotation_released=true` |
| Dist matches src for the `isReleased` check | **CONFIRMED** (same predicate, same throw, same `loadNode` after the gate) |
| 124-finding scan | **not this claim** (`csf_4531c31d96dd7d2291a4d57c` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=120000 --test-name-pattern "statically linked production" packages-ts/galerina-framework-app-kernel/tests/registry-generation.test.mjs`
   → **1/1 pass**, 0 fail, `duration_ms 709.6862`.
   Test: `binds the exact running host, consumes its native brand once, and reopens exact bytes` (`494.6765ms`).
   That case includes the hostile admit-only reject and the later
   activate-then-publish path.

Independent extra probe (temp `%TEMP%\owner-release-gate-probe.mjs`, not
production; imports the same untracked `dist/index.js`):

- admit-only: `isProduction=true`, `isReleased=false`,
  `authorityReleased=false`, `productionAuthorizing=false`.
- after `activateRegistryDurabilityProfile`: `isReleased=true`,
  `authorityReleased=true`, `productionAuthorizing=true`.
  (`isProduction=false` on the released object: activate brands a **new**
  object into `releasedProfiles` only.)
- `publishRegistryGenerationWithLinkedHost` with admit-only, a relative
  directory, a bogus generation, and **no** `_galerinaLinkedBinding`:
  throws `TypeError` `"linked registry durability profile is not owner-released"`.
  Not a directory error, not a generation-verify error, not
  `"statically linked registry host is unavailable"`.
- Copied released object `{ ...released }` still has
  `authorityReleased=true` on the field, but `isReleased=false`.
  Publish of the copy throws the same owner-released TypeError.
- `new Proxy(released, {})` and a forged freeze with both flags set:
  `isReleased=false`; publish of the forge throws the same TypeError.
- `registryDurabilityProfileMatchesRotation`: released `true`,
  admit-only `false`, copied released `false`.
- Probe printed `PROBE_OK`. Node v24.18.0.

## Challenge 1 — can linked publish use an admit-only profile?

**No. CONFIRMED.** The first linked-publish check after `sizeBound` is
`isReleasedRegistryDurabilityProfile`. Admit brands `productionProfiles`
and returns `authorityReleased: false`. The hostile suite assertion and
the independent probe both throw TypeError `/not owner-released/` on that
candidate. The test installs the fake native binding **after** that
reject.

## Challenge 2 — is the refuse before native host work?

**Yes. CONFIRMED in source, dist, the named test, and the probe.**
`loadNode`, executable digest, and `linkedProductionBinding` all follow
the owner-release throw. The probe used a relative path and a bogus
generation with no linked binding and still received only the
owner-released TypeError.

## Challenge 3 — does rotation also require the released brand?

**Yes. CONFIRMED.** `registryDurabilityProfileMatchesRotation` returns
`false` unless `isReleasedRegistryDurabilityProfile(identity.profile)`.
Admit-only and copied released profiles fail that predicate.

## Residuals (not findings against the named claim)

- `isReleasedRegistryDurabilityProfile` is **WeakSet identity only**
  (`releasedProfiles.has(value)`). It does not re-check
  `authorityReleased`, owner signature, or field shape. A copied or
  forged object with `authorityReleased: true` is not released. That is
  fail-closed for the named publish/rotation seams, but the brand remains
  the only runtime gate.
- Dist is untracked. Tests import dist. Dist was inspected and hashed;
  it matches src for this check. This is not a dist-rebuild receipt.
- Dirty `registry-generation-store.ts` FIFO/`O_NONBLOCK` work is
  **orthogonal** and was not re-audited here.
- Suite and probe root/owner verifiers are stubs. They prove the
  process-local brand split, not cryptographic owner-release.
- Scan `csf_4531c31d96dd7d2291a4d57c` stays `PARTIAL_THIS_TREE`.
  Inventory 90 OPEN / 30 PARTIAL / 4 PATCHED. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.
