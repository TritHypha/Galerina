# Independent audit — pinned revocation admission refuses missing or replaced unsigned registry

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: pinned revocation admission does not treat a missing or
replaced unsigned registry as trusted.

- Scan `0f24ca30`: missing registry always returned `{present:false}` even
  with a pin.
- Current: pin + missing throws; pin + unsigned throws;
  `loadTrustedRevocationSnapshot` refuses a replaced unsigned empty
  registry under a pin.
- Production snapshot on this repo’s `governance/` is pinned and signed.

Tests: `tests/revocation/revocation-registry.test.mjs` (v2 missing/unsigned,
hostile replaced unsigned, production snapshot). Imports
`governance/revocation-registry.mjs` (source).

Scan `csf_ca7eb6675543b7214745b057` is **PARTIAL_THIS_TREE**. Inventory
**82 OPEN / 38 PARTIAL / 4 PATCHED** was recorded as assigned scan
context and was independently read from
`docs/reports/scan-0f6063dd-inventory-2026-09-22.json`
(`disposition_counts`: `OPEN_ON_SCAN_SNAPSHOT` 82,
`PARTIAL_THIS_TREE` 38, `PATCHED_AUDIT_PENDING` 4). This is **not**
124-scan closure. Not Astra. Not production admission.

Node v24.18.0, Windows win32. Tests import source, not dist.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`tests/revocation/revocation-registry.test.mjs` (+12 lines: hostile
replaced unsigned empty under a pin).
`governance/revocation-registry.mjs` is **clean vs HEAD** (git blob
`57644b6ec3d25a187e4942eaf4ac5e09db0fd23e`). Production
`governance/revocations.json` and `governance/trust-anchor.json` are
clean vs HEAD. Unrelated dirty on this worktree was not this claim.

## Source hashes on this tree

Author-named hashes MATCH both listed files. Independent SHA-256 of the
working-tree bytes.

| path | sha256 |
|---|---|
| `governance/revocation-registry.mjs` | `0c6d1dd358d4c363d3b2c9fa843d7dbbd643f988e140904bb83ff8099a6af108` |
| `tests/revocation/revocation-registry.test.mjs` | `2be454c210a212cfe6947db7398ff5a48c14274b6a0b22efb28eb69c5c51a484` |

Supporting production snapshot files (not in the author hash list; clean
vs HEAD):

| path | sha256 |
|---|---|
| `governance/revocations.json` | `b83ba4acaad7503960196451912087cd0916edfca44f6ece8be3f15914b52e42` |
| `governance/trust-anchor.json` | `055b09935fd42b62315179367968c5995a4d68111b3f2d9c83bdb728f64a9115` |

HEAD test blob `f5cc652dc7b5451ae96874088377df57b8be8056` lacks the
hostile replaced-unsigned case. Working-tree test git blob
`2c7d265408ce19c2d2e6fa3a7489f1640ffaaf2c`.

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| pin + missing throws | `assertRegistryObjectTrustworthy` 150–154; `loadRevokedKeyIds` 60–65; named test `v2: pinned root + MISSING registry → fail closed`; independent `pin_missing_*` |
| pin + unsigned throws | `assertRegistryObjectTrustworthy` 157–160; named test `v2: pinned root + UNSIGNED registry → fail closed`; independent `pin_unsigned_empty_assert` / `_snapshot` |
| `loadTrustedRevocationSnapshot` refuses replaced unsigned empty under a pin | 198–211: after `assertRegistryObjectTrustworthy`, requires `present/signed/valid/pinned` plus `schemaVersion === 1` and `appendOnly === true`. Unsigned+pin throws at 159 before the generic snapshot error. Named hostile test; independent `pin_unsigned_empty_snapshot` |
| production snapshot on this repo’s `governance/` is pinned and signed | `trust-anchor.json` pin `21415420b447e219`; `revocations.json` signature `keyId` same; named production snapshot test; independent `production_snapshot` / `production_assert` |
| Scan 0f24ca30 missing-always-present:false is no longer the pinned path | CONFIRMED for pin present. Legacy **no** `trust-anchor.json` still returns `{present:false}` (assigned residual) |
| 124-finding scan | **not this claim** (`csf_ca7eb6675543b7214745b057` stays `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=30000 --test-name-pattern "pinned root|production snapshot|UNSIGNED|replaced unsigned" tests/revocation/revocation-registry.test.mjs`
   → **5/5 pass**, 0 fail, `duration_ms 146.5443`.
   - `production snapshot is pinned, signed, immutable, and read-once admitted` — **green** (4.1021ms)
   - `v2: pinned root + MISSING registry → fail closed` — **green** (3.4141ms)
   - `v2: pinned root + UNSIGNED registry → fail closed` — **green** (3.7372ms)
   - `hostile: production snapshot refuses a replaced unsigned empty registry under a pin` — **green** (3.3772ms)
   - `production snapshot rejects a signed registry with duplicate authority records` — **green** (9.5665ms)

Independent extra probes (eval only; temp
`%TEMP%\revocation-pin-missing-probe.mjs`, not production; dynamic
`file://` import of this tree’s `governance/revocation-registry.mjs`):

- pin + no `revocations.json`:
  `assertRegistryTrustworthy`, `loadRevokedKeyIds`, and
  `loadTrustedRevocationSnapshot` all throw
  `revocation registry is MISSING, but trust anchor rootkey is pinned — a pinned deployment requires a signed registry`
- pin + unsigned empty `{schemaVersion:1, appendOnly:true, revoked:[]}`:
  `assertRegistryTrustworthy` and `loadTrustedRevocationSnapshot` throw
  `revocation registry is UNSIGNED, but trust anchor rootkey is pinned — a pinned deployment requires a signed registry`
- no `trust-anchor.json` + missing registry:
  `assertRegistryTrustworthy` returns `{present:false, signed:false, valid:false}`;
  `loadRevokedKeyIds` returns empty `Set`;
  `loadTrustedRevocationSnapshot` throws
  `revocation registry is not a pinned, signed, append-only v1 snapshot`
- no pin + unsigned empty: `assertRegistryTrustworthy` returns
  `{present:true, signed:false, valid:false}`; snapshot still throws
  the generic not-pinned error
- this repo’s `governance/` snapshot: `signerKeyId=21415420b447e219`,
  frozen object and `keyIds`, `isRevoked("8eecf4187ebc9341")=true`;
  `assertRegistryTrustworthy` returns
  `{present:true, signed:true, valid:true, keyId:"21415420b447e219", pinned:true}`
- Probe printed `PROBE_OK`. Node v24.18.0.

## Challenge 1 — does a pin + missing registry still return `{present:false}`?

**No. CONFIRMED throw.** Locator: `assertRegistryObjectTrustworthy`
150–154 and `loadRevokedKeyIds` 60–65. Named missing test and independent
`pin_missing_assert` / `pin_missing_loadRevoked` / `pin_missing_snapshot`
all throw `MISSING` / `pinned deployment requires a signed registry`.
Scan-`0f24ca30` missing-always-present:false is not the current pinned
path.

## Challenge 2 — does a pin + unsigned registry still admit?

**No for admission / snapshot. CONFIRMED throw.** Locator: 157–160.
Named UNSIGNED test and independent `pin_unsigned_empty_assert` /
`pin_unsigned_empty_snapshot` throw `UNSIGNED` /
`pinned deployment requires a signed registry`.
`loadTrustedRevocationSnapshot` never reaches a trusted empty revoke set
for that input.

## Challenge 3 — does `loadTrustedRevocationSnapshot` require pinned signed append-only?

**Yes. CONFIRMED.** Locator: 198–211. After the object trust check it
still requires `trust.present/signed/valid/pinned === true`,
`schemaVersion === 1`, and `appendOnly === true`. Named production
snapshot test admits this repo’s signed pinned file. Named hostile
unsigned empty is refused. Independent production load matches pin
`21415420b447e219`.

## Challenge 4 — is this repo’s production `governance/` snapshot pinned and signed?

**Yes. CONFIRMED.** `trust-anchor.json` `registrySigningRootKeyId` is
`21415420b447e219`. `revocations.json` `signature.keyId` is the same.
`signing-key-21415420b447e219.pub.pem` is present. Independent
`loadTrustedRevocationSnapshot(ROOT)` succeeds and freezes
`["8eecf4187ebc9341"]`.

## Residuals (not findings against the named pin-admission claim)

- **No `trust-anchor.json` still returns `{present:false}` / empty revoke
  set (legacy).** Independent `legacy_missing_assert` /
  `legacy_missing_loadRevoked`. Assigned residual. This is why
  `csf_ca7eb6675543b7214745b057` stays **PARTIAL_THIS_TREE**, not PATCHED.
- `loadRevokedKeyIds` / `isKeyRevoked` still **do not throw** on pin +
  unsigned empty. Independent `pin_unsigned_empty_loadRevoked`
  `threw=false` (empty Set). Admission APIs refuse; the enforce-unsigned
  Set loader does not. Callers that skip
  `assertRegistryTrustworthy` / `loadTrustedRevocationSnapshot` can still
  treat a replaced unsigned empty file as “no revocations”.
- Stale comment at 125–131 still documents missing registry as
  `{present:false}` without the pin throw. Code at 150–154 is the
  observable.
- `galerina.mjs` production fuse / `productionOrDevRevocation` use
  `loadTrustedRevocationSnapshot`. Some other paths still pair
  `assertRegistryTrustworthy` then later `isKeyRevoked` (re-read), and
  the sign fail-safe around `galerina.mjs:2575` calls `isKeyRevoked`
  without a preceding trust check (outside this named admission claim).
- Scan ID `csf_ca7eb6675543b7214745b057`
  (`Legacy admission treats missing or replaced revocation state as trusted`,
  medium, `governance/revocation-registry.mjs`) stays
  `PARTIAL_THIS_TREE`. Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `4e978e7de1aa3fc5d896ad55818187659ac6adf047f89f8a51cdde56960dde4d`
  is unchanged by this review. Assigned inventory totals **82 OPEN /
  38 PARTIAL / 4 PATCHED** were read from `disposition_counts`, not
  re-derived from 124 finding rows. Not 124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named pin + missing throw / pin + unsigned
throw / snapshot refuse replaced unsigned empty / production snapshot
pinned-and-signed claim. Detector is not invalid. Evidence is sufficient
for those four admission bullets; insufficient for legacy no-pin
present:false, `loadRevokedKeyIds` unsigned-under-pin, scan closure, and
production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
