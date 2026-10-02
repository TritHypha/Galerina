# Independent audit — admitStorageSubstrate refuses a revoked signer

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `admitStorageSubstrate` does not treat a valid signature
from a revoked signer as attested.

- A revoked `signerKeyId` is refused even with a valid Ed25519 signature.
- Overwrite attestation requires `signerKeyId` and `revocationCheck`
  together.
- Policy vs manifest signer identity mismatch denies.

Tests: `packages-ts/galerina-tower-citizen/tests/substrate-erasure.test.mjs`
import `../dist/index.js`. Dist re-exports `admitStorageSubstrate` from
`./substrate-erasure.js`. The three named revocation cases are in HEAD.

Scan `csf_37a9ad734f2294cf7eddf3e5` is **PARTIAL_THIS_TREE**. Inventory
file `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` independently
recounts **77 OPEN / 43 PARTIAL / 4 PATCHED** (124 unique IDs). This is
**not** 124-scan closure. Not Astra. Not production admission.

Node v24.18.0, Windows win32 x64 (NT 10.0.19045). This reviewer did not
rebuild. Dist is gitignored (`packages-ts/.gitignore` `dist/`). Tests
import `../dist/index.js`, which re-exports from `./substrate-erasure.js`.
Dist `substrate-erasure.js` mtime (`2026-09-23T02:28:03.105Z`) is newer
than clean-vs-HEAD `src/substrate-erasure.ts` (`2026-09-22T08:14:36.559Z`).
Dist is **not stale** vs src: both run revocation after Ed25519 verify;
both pair `signerKeyId` with `revocationCheck`; both refuse overwrite
without a check; both deny identity mismatch; both refuse
`revocationCheck(keyId) === true`.

Dirty slice for this claim vs HEAD `91b4dec0`: **none**.
`src/substrate-erasure.ts` and `tests/substrate-erasure.test.mjs` are
**clean vs HEAD** (git blobs `d6586712e4669b6d6264631e0d32818efea286af`
and `5821c1da2d45ccdd23dbc822e9ea2552d5d71994`). Unrelated dirty in
`galerina-tower-citizen` (`src/hybrid-engine.ts`,
`src/bridge/stub-provider.ts`, other tests) is not this claim. Dist is
untracked (gitignored).

## Source hashes on this tree

Author-named hashes MATCH both listed files. Independent SHA-256 of
the working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-tower-citizen/src/substrate-erasure.ts` | `ce8faaf502934125cd27cd43d6ca98b6e9f9020e910ef9ac0cd7a3c7c08166f6` |
| `packages-ts/galerina-tower-citizen/dist/substrate-erasure.js` | `435770a177ca607dd7f218de833b68000e2b32ed4a3fa864b10a743826a75a0b` |
| `packages-ts/galerina-tower-citizen/tests/substrate-erasure.test.mjs` | `7d043b096cfdb51a30c5156db4ce145ad2795cd80f8ca3feca5e8bdfb9707800` |

`dist/index.js` (re-export only; sha256
`a25d2ae0912dd4c68ab363f79fa37124a3c6d991c9a474f44d30259ba26c1d32`)
exports `admitStorageSubstrate` from `./substrate-erasure.js`. Dist is
not in HEAD. Working-tree src/test git hashes equal HEAD blobs.

Scan-era `0f24ca30ef3f173c43a60c914c18b161327f2227` is an ancestor of
this HEAD. That blob checked revocation only when
`m.signerKeyId !== undefined && policy.revocationCheck !== undefined`
(AND). Omitting `signerKeyId` skipped revocation after a valid
signature, including for `overwrite`. The pair / overwrite-requires-check
/ identity-mismatch repair landed in
`e1bb4a4f4e46597bb122eebec6fa5f01a67c2eba`
(`feat(tower): checkpoint product profiles and attestation hardening`).

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| Revocation runs after a valid Ed25519 signature | src 220–258 / dist 108–146: block 1 `edVerify` then block 2 identity/pair/overwrite/revoked. Named REVOKED test signs with the policy public key then refuses |
| Revoked `signerKeyId` is not attested | src 257 / dist 144–145: `if (revoked) return reject(..., \`signing key '${keyId}' is REVOKED\`)`. Named test + independent `revoked_overwrite.attested=false`, write of cleartext secret denied |
| Overwrite requires `signerKeyId` and `revocationCheck` together | src 244–248 / dist 130–135: XOR of `keyId` vs `hasCheck` denies; `eraseModel === "overwrite" && !hasCheck` denies. Named omitted-identity test; independent omit-both / key-no-check / omit-id-with-check all `attested=false` |
| Policy vs manifest identity mismatch denies | src 239–240 / dist 125–126. Named mismatch test; independent `identity_mismatch` reason `manifest 'k-left' != policy 'k-right'` |
| Dist revocation not stale vs src | **CONFIRMED** same pair XOR, same overwrite-requires-check, same `=== true` revoke, same mismatch string, same post-verify order |
| Crypto-only may omit revocation when neither id nor check is supplied | **CONFIRMED residual** (allowed). Independent `crypto_omit_both.attested=true`, `effectiveEraseModel=crypto-only`, cleartext write still `false`. Overwrite cannot take this path |
| Named node tests | **22/22 pass**, 0 fail, `duration_ms 204.2066` |
| 124-finding scan | **not this claim** (`csf_37a9ad734f2294cf7eddf3e5` `PARTIAL_THIS_TREE`) |

## Command receipts

1. `node --test --test-timeout=60000 packages-ts/galerina-tower-citizen/tests/substrate-erasure.test.mjs`
   → **22/22 pass**, 0 fail, `duration_ms 204.2066`.
   - `admitStorageSubstrate: a REVOKED signer key is refused even with a valid signature` — **green** (0.4259ms)
   - `admitStorageSubstrate: omitted signer identity cannot skip revocation for overwrite` — **green** (0.6237ms)
   - `admitStorageSubstrate: policy and manifest signer identities must match` — **green** (0.6243ms)

Independent extra probes (eval only; temp
`%TEMP%\substrate-revocation-probe.mjs`, not production; imports the same
gitignored `dist/index.js`). Printed `PROBE_OK`. Node v24.18.0.

Current dist:

- valid overwrite + revoked `k1` → `attested=false`, reason `signing key 'k1' is REVOKED`, cleartext write `false`
- policy `k-right` vs manifest `k-left` → `attested=false`, `signer identity mismatch`
- overwrite omit id with check / omit both / key without check → all `attested=false`
- crypto-only omit both → `attested=true`, model `crypto-only`, cleartext write `false` (allowed residual)
- crypto-only with only key or only check → pair deny
- crypto-only + revoked `k1` → `attested=false`
- `revocationCheck` throw `registry-down` → fail-closed, not attested
- empty-string key ids treated as omitted; overwrite still denied
- happy overwrite with pair + `revocationCheck=() => false` → `attested=true`, cleartext write `true`
- policy-only or manifest-only key id is enough to consult the check; revoked still refused

Scan-era AND (`signerKeyId && revocationCheck`) would have attested an
overwrite signed with a still-valid PEM after omitting `signerKeyId`.
Current overwrite omit-both hits `overwrite attestation requires a
revocation check`.

## Challenge 1 — does a valid signature from a revoked signer attest?

**No. CONFIRMED refused.** Named REVOKED test and independent
`revoked_overwrite` / `crypto_revoked` / `manifest_only_revoked` /
`policy_only_revoked` are `attested=false` with `/REVOKED/`. Detector
can go red.

## Challenge 2 — can overwrite skip revocation by omitting identity?

**No. CONFIRMED refused.** Named omitted-identity test matches
`/signerKeyId and revocationCheck must be supplied together|requires a revocation check/`.
Independent omit-both hits the overwrite-requires-check reason; omit-id
with check and key-without-check hit the pair reason.

## Challenge 3 — does a policy/manifest signer mismatch still attest?

**No. CONFIRMED refused.** Named mismatch test and independent
`identity_mismatch` deny before the revoke predicate runs.

## Challenge 4 — is dist revocation stale vs src?

**No. CONFIRMED not stale.** Dist mtime is newer than src. Src blob
equals HEAD. Dist 121–146 is the same pair / overwrite / `=== true` /
mismatch control flow as src 235–258. Tests import that dist re-export.

## Residuals (not findings against the named revocation-refuse claim)

- Crypto-only attested path may omit revocation when **neither** key id
  nor check is supplied. Independent `crypto_omit_both.attested=true`.
  Overwrite cannot. Cleartext secret write is still denied because
  `effectiveEraseModel` stays `crypto-only`. Named allowed residual.
- Host `revocationCheck` is admitted as revoked only on **`=== true`**.
  Independent `revoked_truthy_one` / `revoked_truthy_string` (return `1`
  / `"REVOKED"`) still attested overwrite. Typed contract is
  `(keyId: string) => boolean`; a non-boolean host is outside the named
  claim.
- Empty-string `signerKeyId` is treated as omitted (`length > 0`). For
  overwrite this still fail-closes (pair or overwrite-requires-check).
- Revocation is host-injected; there is no built-in registry in this
  module. A missing check on overwrite is a deny, not a silent skip.
- Scan ID `csf_37a9ad734f2294cf7eddf3e5`
  (`Storage substrate attestation can bypass signer revocation`,
  medium, `packages-ts/galerina-tower-citizen/src/substrate-erasure.ts`)
  stays `PARTIAL_THIS_TREE`. Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `b235866d1c82b630ddc05285395c86dc2841640d12a3896a50505ed7af855d77`
  independently recounts **77 OPEN / 43 PARTIAL / 4 PATCHED** (124/124
  unique IDs). This review did not re-adjudicate the other 123 IDs. Not
  124-scan closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named revoked-signer-refuse / overwrite-
requires-pair / identity-mismatch claim. Detector is not invalid.
Evidence is sufficient for those bullets; insufficient for host
predicate non-boolean behavior, built-in revocation registry, scan
closure, and production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
