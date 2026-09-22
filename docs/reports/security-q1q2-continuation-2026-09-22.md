# Galerina security continuation — Q1/Q2 verify-then-repair

**Disposition:** INCOMPLETE_NON_AUTHORITATIVE. Implemented, independent audit pending.
**Claim labels:** CONFIRMED / PLAUSIBLE / NOT VERIFIABLE.

This is an implementation-session handover, not independent security clearance
and not a claim that the 124-finding Galerina scan (or the earlier 141-finding
set) is closed.

## Source identity

| Field | Value |
|---|---|
| Worktree | `Galerina/.worktrees/rd-0873-native-fungi-bootstrap-implementation` |
| Branch | `main` tracking `origin/main` **ahead 3** |
| HEAD | `0f24ca30ef3f173c43a60c914c18b161327f2227` (2026-09-21 21:07:05 +0100 `feat(tower): add governance entry for compiler cli-check`) |
| Unpushed commits | `705c80369` C20/C12; `61c6d6628` fidelity consumer; `0f24ca30` Tower cli-check governance. These are **not** the security patches. |
| Working tree | Dirty. Security repairs remain uncommitted. No staged set recorded for this slice. |
| Codex push receipt | **NOT VERIFIABLE.** `backup-snapshot.json` records the same HEAD. No receipt was found that a security commit was pushed. Announced commit/push is not assumed. |
| Scan snapshot | Codex plugin `0.1.24`, scan id `0f6063dd-cf7c-409d-852a-0aca46df30cc`, revision `0f24ca30…`, snapshot `codex-security-snapshot/v1:sha256:57f45438eabe616142ed43d84990cca9a2029fd14b6f8bafef024347db958d2d`. Reportable Galerina findings: **124** (high 4 / medium 68 / low 52). The checkout changed concurrently at that HEAD. |

Exclusive write for this slice: continuation of the existing dirty-tree security
lane on `hybrid-engine.ts` and `photonic-certified-admission.test.mjs`. No
`docs/WORKTREES.md` lock file. No commit, push, merge, signing, or `.fungi` work.

## Test receipt (this slice)

| Command | Cwd | Exit | Result |
|---|---|---|---|
| `npx tsc -p tsconfig.json` | `packages-ts/galerina-tower-citizen` | 0 | compile after `BridgeManifest` import |
| `node --test tests/photonic-certified-admission.test.mjs tests/bridge-attestation.test.mjs` | same | 0 | **24/24 pass, 0 fail, 0 skip**, 555 ms |

Tested source digests (SHA-256, byte length):

| Path | sha256 | bytes |
|---|---|---|
| `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts` | `aec9d5aae2c784c87234ac00b811a6c42ffb0e15703afbc09d8374f4580495ed` | 72915 |
| `packages-ts/galerina-tower-citizen/tests/photonic-certified-admission.test.mjs` | `cc8474ce4a8e5651be13b6234357aefd9a92227bfc78b3c2f8e428102741b8fb` | 17385 |
| `packages-ts/galerina-tower-citizen/src/bridge-attestation.ts` | `c291c01a66e821b3bc9434a929b6fa9b15b0c38d51bf2b0f99c9bcf9f144662a` | 14810 |
| `packages-ts/galerina-tower-citizen/src/capability-grant.ts` | `dc9ed42a590a5ea11bfc872c680a209cef1b5d64edb1e97ab7bb360685347676` | 7369 |
| `packages-ts/galerina-tower-citizen/src/photonic-admission.ts` | `bb9b9f30cfd09975e79f47325faa802466103e1362a4e1614affcf577240e697` | 9813 |
| `packages-ts/galerina-tower-citizen/src/substrate-erasure.ts` | `ce8faaf502934125cd27cd43d6ca98b6e9f9020e910ef9ac0cd7a3c7c08166f6` | 15984 |
| `governance/revocation-registry.mjs` | `0c6d1dd358d4c363d3b2c9fa843d7dbbd643f988e140904bb83ff8099a6af108` | 9982 |

Hostile tests added this slice: getter coupon refused; mutated CPU coupon after
signing refused; coupon revocation after cached certified admission keeps
photonic off. Positive control (verified bound coupon) still admits.

## Q1 identity (CONFIRMED)

Can Tower authenticate one object and execute another?

- Registry substitution after admission is refused. `dispatchPlan` uses
  `#admittedBridges` (`hybrid-engine.ts` execute/init/shutdown bound at
  admission). Test: `a substituted registry entry cannot inherit a previously
  admitted attestation`.
- `attestBridge` / `attestBridgeHybrid` freeze identity and bound methods
  (`bridge-attestation.ts` `freezeAttestedBridge`).
- Capability grants copy `engineId` / `capabilityMask` / `grantId` before
  verify and adopt `res.capabilityMask` (`capability-grant.ts:86-138`).
- Hybrid ML-DSA verifies a shallow-frozen `{manifest,signature,mlDsaSignature}`
  (`verifyAttestationHybrid`).
- **Residual found and repaired this slice:** certified photonic re-read
  `signed.manifest.certificationProfile` / `hardwareIdentity` / `bridgeId`
  after verify. A getter or post-sign mutation could authenticate one coupon
  and bind another. Repair: `snapshotOwnPlainData` at
  `hybrid-engine.ts:333` copies own enumerable data (getters refused) **before**
  verify; binding and coupon identity use that snapshot
  (`#photonicCouponIdentity`).

Smallest hostile counterexample now refused: a getter manifest, or a CPU
coupon mutated to photonic fields after signing.

## Q2 lifecycle (CONFIRMED)

Can missing/replaced revocation or cached admission leave later revocation
unenforced?

- `signerKeyId` and `revocationCheck` are a pair
  (`evaluateSignerRevocation`, photonic, substrate overwrite).
- Certified admission requires a revocation check.
- Cached bridge attestation re-runs `evaluateSignerRevocation` on every infer
  (`revalidateCachedRevocation`, test `revocation after a cached admission
  denies the next inference`).
- Pinned trust-anchor + missing `revocations.json` throws
  (`loadRevokedKeyIds` / `assertRegistryObjectTrustworthy`).
- Production snapshot API `loadTrustedRevocationSnapshot` requires pinned,
  signed, append-only v1.
- Unsigned registry without a pin remains legacy v1 (OWNER_DECISION: whether
  production may use that path).
- **Residual found and repaired this slice:** certified photonic coupon
  revocation ran only on first verify (`photonicCertifiedChecked`). Repair:
  `revalidateCachedPhotonicCoupon` (`hybrid-engine.ts:733`) on every certified
  infer against the snapshot identity.

Unsigned grant opt-in remains non-certified only. Certified photonic still
keeps the lane off (does not trap the whole infer) when a coupon is revoked;
key revocation still traps `ERR_BRIDGE_UNATTESTED`.

## Deduplicated finding table (live-source statuses)

Statuses: PATCHED_AUDIT_PENDING / OPEN_IMPLEMENTABLE / OWNER_DECISION /
DEFERRED_SCOPE / NOT_VERIFIABLE.

Rows below are the Q1/Q2 cluster plus the remaining owner/deferred items that
block claiming the scan closed. Other Galerina mediums from prior dirty-tree
repairs are PATCHED_AUDIT_PENDING as a **PLAUSIBLE** class unless reopened
this slice.

| ID | Owner | Live file:line | Threat | Status | Regression test | RD |
|---|---|---|---|---|---|---|
| GAL-H1..H4 | galerina | prior dirty-tree repairs (`rebuild-fusable-packages.mjs`, kernel, fuse-loader, api-server) | Highs from frozen scan | PATCHED_AUDIT_PENDING (PLAUSIBLE this slice; not re-executed) | package/kernel tests from prior sessions | — |
| GAL-5 | galerina | `hybrid-engine.ts` `#admittedBridges`; `bridge-attestation.ts:178` | Authenticate one bridge, execute another | PATCHED_AUDIT_PENDING | `bridge-attestation.test.mjs` substitution | RD-0236 |
| GAL-21 | galerina | `hybrid-engine.ts:575` `revalidateCachedRevocation` | Cached attestation ignores later key revocation | PATCHED_AUDIT_PENDING | `revocation after a cached admission…` | RD-0236 |
| GAL-PHOTON-Q1 | galerina | `hybrid-engine.ts:333` snapshot; `:629` frozen verify | Certified photonic binds mutated coupon after verify | PATCHED_AUDIT_PENDING | Q1 getter + mutated CPU coupon tests | RD-0129 / RD-0236 |
| GAL-PHOTON-Q2 | galerina | `hybrid-engine.ts:733` | Cached certified coupon ignores later device revocation | PATCHED_AUDIT_PENDING | Q2 coupon revocation after cached admission | RD-0118 |
| GAL-CAP-GRANT | galerina | `capability-grant.ts:86` | Mutable grant after signature | PATCHED_AUDIT_PENDING | certified photonic grant path (hybrid grant) | RD-0236 #1 |
| GAL-PHOTO-ADMIT | galerina | `photonic-admission.ts:156` | Reprogram without signer+revocation pair | PATCHED_AUDIT_PENDING | photonic admission tests | R&D 0108 |
| GAL-STORAGE | galerina | `substrate-erasure.ts:235` | Overwrite attestation skips revocation | PATCHED_AUDIT_PENDING | substrate-erasure tests | R&D 0116/0118 |
| GAL-REVOKE-PIN | galerina | `governance/revocation-registry.mjs:57,148,198` | Missing/replaced registry treated as trusted | PATCHED_AUDIT_PENDING | `tests/revocation/revocation-registry.test.mjs` | Gap B |
| GAL-24 | galerina | `runtime.ts:66,290`; `capabilityHost.ts:219` | Source-declared effects as runtime authorization unless host passes `grantedEffects` | OWNER_DECISION | capability-host tests cover intersection when grant set is present | — |
| GAL-UNSIGNED-REG | galerina | `revocation-registry.mjs:157-160` | Unsigned registry without pin still enforced | OWNER_DECISION | pin-required path already throws | — |
| GAL-Q3-REMAIN | galerina | various resource/parser bounds | Work-performed vs stored-result ceilings | OPEN_IMPLEMENTABLE (next) | per-package focused tests | — |
| GAL-AUDIT | galerina | dirty tree | Independent completion audit | OWNER_DECISION | — | ZT independent-audit |
| SLIDE-1..11 | slide | see SLIDE inventory | Resource/identity in publication and graphs | DEFERRED_SCOPE this prompt | SLIDE tests in that repo | — |
| LYTH-1..4 | lyth | see Lyth inventory | CBOR encode / graph / fuel / strand JSON | DEFERRED_SCOPE this prompt | `kat-interp.ts`, `kat-differential.ts` | — |
| KB-1 | kb | `scripts/check-do-not-publish.ps1:21-46` | Publication guard success on uninspected files | DEFERRED_SCOPE / OWNER_DECISION | — | — |
| KB-2 | kb | `.github/workflows/kb-guards.yml:70-74` | Floating Galerina checkout in private CI | OWNER_DECISION | — | — |

## Q3 / Q4 (bounded this slice)

Q3: not fully re-inventoried. CONFIRMED already in tree from prior dirty
repairs: `loadProject` file/byte/depth caps; indexer `FUNGI-INTEL-003`;
lexer token budget; import memoisation; spore `referenced > payloadRegionLen`
overlap refusal (`container.ts:141-145`). Remaining OPEN_IMPLEMENTABLE is
any bound that limits stored results but not work performed (reopen exact
consumers before the next slice).

Q4: CONFIRMED prior repairs for snapshot filename/HMAC, AtomicWriter
LSS-LINK-001, cold-boot LSS-ROLLBACK-001, `promptNoEcho` exclusive stdin,
handle `chmod` before link, released-profile publication. Process-local
tests do not prove physical durability (NOT VERIFIABLE).

## SLIDE / Lyth / KB (read-only)

Write scope excluded. Next slices, not implemented here.

**SLIDE** HEAD `d14e37eb12fc74480c09ae941aa6ea9629e0913b` (scan dirty). Proposed next slices:

| Finding | Locator | Next slice |
|---|---|---|
| Hostile typed-array iterators | `src/exact-fixed-typed-array.mjs:43` own `Symbol.iterator` already refused; reopen remaining iterator traps | Confirm every copy path uses prototype getters only |
| File intake identity | `src/physical-slide-file-boundary.mjs:30` `readStableRegularFile`; publication `publishExclusiveVerified:80` | Re-admit opened inode before `readFile` on remaining loaders |
| Benchmark Git helpers | `src/v2g-benchmark-integrity.mjs` | Refuse dash-prefixed helper configuration |
| Publication parent substitution | `publishExclusiveVerified` parent re-lstat | Keep parent identity across link |
| Loop-back cycle exemption | graph validation in `research/shape-lab/src/shape-lab.mjs` (`GRAPH_LIMIT_CEILINGS` 32-36) | Do not exempt non-control cycles |
| Caller-controlled array methods | post-validation emit | Snapshot arrays before emit |
| Production-gate count | `src/security-closure.mjs` | Empty or >64 already refused in prior Galerina note; reopen live |

**Lyth** HEAD `f5a3ffe147b5110216493c92cb7dabd1a5cc47cc`:

| Finding | Locator | Next slice |
|---|---|---|
| CBOR encode after allocation | `tools/cbor/definite.ts` encode path | Charge remaining bytes before child concat |
| Result serialization | `tools/weaver-lab/interp.ts:48-51,57` `canonical()` already charges depth/nodes/collection | Keep as-is; do not weaken |
| Strand-exec JSON after capture | `tools/weaver-lab/strand-exec.ts:159` `captureStrandValue` then later stringify | Canonicalize/charge before JSON |
| Isolated fuel | trusted rope vs isolated host | Prior KAT `overFuelReceipt`; reopen isolated worker |

**KB** HEAD `b35c8285889537acdd3fedb823f5cb922a55dceb`:

- Publication guard: `scripts/check-do-not-publish.ps1:21-46` — treat uninspected files as incomplete, not success.
- Floating checkout: `.github/workflows/kb-guards.yml:70-74` checks out TritHypha/Galerina **without `ref`**. `persist-credentials: false` is already set.
- **Do not pin current dirty HEAD `0f24ca30`.** Proposed reviewed SHAs already used by SLIDE CI (provenance: `SLIDE/.github/workflows/slide-security.yml:31,40`): Galerina `1cdeb8a0ab91a34af9e9c52141c426472b989828`; Lyth `a68eeb5ced8a522b3ab140422c1e7ce84ec887fa`. Owner must confirm those SHAs are the intended KB pins before editing the workflow.

## Changed paths this slice

- `packages-ts/galerina-tower-citizen/src/hybrid-engine.ts`
- `packages-ts/galerina-tower-citizen/tests/photonic-certified-admission.test.mjs`
- this report; TODO / pre-Fungi register / roadmap / ledger append-only notes

## Remaining HOLDs

Independent audit of the dirty tree; KB SHA-pin; conversion-queue/signing;
native Linux FIFO publication; WAT secret-heap wipe; provenance/PCI comment
certification; production `grantedEffects` policy; unsigned-registry-without-pin
policy; physical durability.

## Next implementable Galerina row

Q1/Q2 admission/attestation/revocation cluster is patched pending audit.
Next OPEN_IMPLEMENTABLE: Q3 work-performed ceilings that remain after stored-result
caps (reopen the exact consumer; do not assume prior overlap/file-count patches
cover hashing/parse work). Skip GAL-24 until the owner chooses whether production
must pass `grantedEffects`.

Never claim all security fixes complete while confirmed findings remain open.
