# Independent audit — admitPhotonicConfig cannot skip signer revocation

**Verdict: PASS** (scoped to this named claim). Filename is the requested
`*-hold.md` path; the heading is the verdict.

This is a dirty-candidate review of
`./.worktrees\rd-0873-native-fungi-bootstrap-implementation`
at HEAD `91b4dec08fe4376febc9494a8023bd02912b8695` (branch `main`, dirty).
It is **not** clean-HEAD evidence. Production sources and tests were not
edited by this reviewer. Nothing was committed, merged, pushed, or signed.
`.fungi` was not touched. This receipt is not the author’s packet and is
not GPT-6 Astra. Passing tests here are **not** production admission.

Named claim: `admitPhotonicConfig` does not let the photonic configuration
skip signer revocation.

- After signature verify, `signerKeyId` and `revocationCheck` must both
  be present; otherwise DENY (`must be supplied together`).
- A valid signature from a REVOKED key is refused.
- Hostile: deleting `policy.revocationCheck` while keeping `signerKeyId`
  still denies.

Tests: `packages-ts/galerina-tower-citizen/tests/photonic-admission.test.mjs`
(13 cases). Import dist.

Scan `csf_d76d15646ea7b5493277f60c` is **PARTIAL_THIS_TREE**. Inventory
**71 OPEN / 49 PARTIAL / 4 PATCHED** was independently re-counted from
this tree’s inventory JSON `findings[]` (124 unique IDs) and matches
`disposition_counts`. This is **not** 124-scan closure. Not Astra. Not
production admission.

Node v24.18.0, Windows win32 x64 (NT 10.0.19045). This reviewer did not
rebuild. Dist is gitignored (`packages-ts/.gitignore` `dist/`). Tests
import `../dist/index.js`, which re-exports `admitPhotonicConfig` from
`./photonic-admission.js`. Dist `photonic-admission.js` mtime
(`2026-09-23T02:28:03.100Z`) is newer than clean-vs-HEAD
`src/photonic-admission.ts` (`2026-09-22T08:14:36.543Z`). Dist is **not
stale** vs src: both require a non-empty `signerKeyId` (policy or
manifest) **and** `typeof revocationCheck === "function"` after Ed25519
verify; both DENY `must be supplied together` when either is missing;
both refuse `revocationCheck(keyId) === true` as `REVOKED`.

Dirty slice for this claim vs HEAD `91b4dec0`: `M`
`packages-ts/galerina-tower-citizen/tests/photonic-admission.test.mjs`
(+12 lines: the named hostile omitted-`revocationCheck` case).
`src/photonic-admission.ts` is **clean vs HEAD** (git blob
`86c54f0cf2596e9e0626414c59877924839f465f`). Dist is untracked
(gitignored). Required-together already landed in HEAD via
`e1bb4a4f4e46597bb122eebec6fa5f01a67c2eba`.

## Source hashes on this tree

Author-named hashes MATCH all three listed files. Independent SHA-256 of
the working-tree bytes.

| path | sha256 |
|---|---|
| `packages-ts/galerina-tower-citizen/src/photonic-admission.ts` | `bb9b9f30cfd09975e79f47325faa802466103e1362a4e1614affcf577240e697` |
| `packages-ts/galerina-tower-citizen/dist/photonic-admission.js` | `124a813b71c326daf3652cc8f868edc89657813b745380c8d3423143f961ae5f` |
| `packages-ts/galerina-tower-citizen/tests/photonic-admission.test.mjs` | `7f33bf8b8044bc0ed7ea0bea5ea41c748e32526998bd38c5af69bac1019ecbfd` |

`dist/index.js` (re-export only; sha256
`a25d2ae0912dd4c68ab363f79fa37124a3c6d991c9a474f44d30259ba26c1d32`)
exports `admitPhotonicConfig` from `./photonic-admission.js`. Dist is
not in HEAD. HEAD test blob `c64518a44133b851c28146be9735b91a85075706`
lacks the hostile omitted-check case. Working-tree test blob
`92e0694774960eccdfe6b40e09c3847e02c5fcc2`.

Scan-era `0f24ca30ef3f173c43a60c914c18b161327f2227` is an ancestor of
this HEAD (src blob `3ea32bee310a9bcb3eb2c6d23bbe66c466bee7a2`). That
revocation gate was
`if (m.signerKeyId !== undefined && policy.revocationCheck !== undefined)`
— omitting either skipped the check and continued to capability/ALLOW.
Required-together landed in `e1bb4a4f4` (same src blob as HEAD).

## Requirement-to-evidence matrix

| requirement | evidence |
|---|---|
| After signature verify, `signerKeyId` and `revocationCheck` must both be present | src 156–166 / dist 90–100: `keyId = policyKey ?? manifestKey`; `hasCheck = typeof policy.revocationCheck === "function"`; `if (!hasCheck \|\| keyId === undefined)` DENY `must be supplied together`. Runs **after** Ed25519 (src 141–154 / dist 77–89) |
| Empty / non-string key ids are not “present” | src 157–158 / dist 91–92: only `typeof === "string" && length > 0` counts. Independent `empty_manifest_and_policy_key` DENY together |
| Hostile: delete `policy.revocationCheck`, keep `signerKeyId` | named hostile; independent `hostile_omit_check_keep_key` DENY together (`admitted=false`) |
| Omit signer identity, keep check | HEAD test `"deny: omitted signer identity cannot skip revocation"`; independent `omit_key_keep_check` DENY together |
| Valid signature from a REVOKED key is refused | named `"deny: a valid signature from a REVOKED key is refused"`; independent `revoked` reason `signing key 'feedfacecafe0001' is REVOKED` |
| Throwing registry fail-closes | named throwing-registry test; independent `throwing_registry` DENY `could not be determined` |
| Honest pair still admits | named admit + SOUNDNESS baseline; independent `happy_both` `admitted=true` |
| Dist required-together not stale vs src | **CONFIRMED** same `policyKey`/`manifestKey` length>0 gate, same `typeof === "function"`, same together DENY string, same `=== true` REVOKED |
| Scan-era optional pair would skip | `0f24ca30` src: both fields had to be defined **to run** the check; omit check with a key id continued to ALLOW |

## Command receipts

1. `node --test --test-timeout=60000 packages-ts/galerina-tower-citizen/tests/photonic-admission.test.mjs`
   → **13/13 pass**, 0 fail, `duration_ms 212.8694`.
   - `admit: a correctly-signed config blob with the granted capability is ADMITTED` — **green** (13.1452ms)
   - `deny: hash mismatch — a tampered blob is refused (the signed manifest pins the exact T)` — **green** (0.565ms)
   - `deny: a tampered manifest field breaks the signature` — **green** (0.6281ms)
   - `deny: signature from the wrong key fails verification` — **green** (0.7382ms)
   - `indeterminate: no attestation is undischarged (FUNGI-GOV-3VL-001), not admitted` — **green** (0.4726ms)
   - `deny: a valid signature from a REVOKED key is refused` — **green** (0.6439ms)
   - `deny: a throwing revocation registry is fail-closed` — **green** (0.6832ms)
   - `deny-by-default: capability not granted to the caller` — **green** (0.5855ms)
   - `deny: manifest declaring the wrong capability` — **green** (0.8317ms)
   - `pin set: only an allow-listed config hash is admitted` — **green** (0.664ms)
   - `deny: omitted signer identity cannot skip revocation` — **green** (0.7096ms)
   - `hostile: omitting revocationCheck cannot skip revocation even with signerKeyId` — **green** (0.5384ms)
   - `SOUNDNESS: across mutations of blob/sig/cap, admission requires ALL gates` — **green** (0.6592ms)

Independent extra probes (eval only; temp
`%TEMP%\photonic-admission-revocation-probe.mjs`, not production; imports
the same gitignored `dist/index.js`). Printed `PROBE_OK`. Node v24.18.0.

Current dist:

- `happy_both` (manifest `signerKeyId` + `revocationCheck: () => false`) → `admitted`
- `revoked` (`revocationCheck` true for that id) → DENY `REVOKED`
- `hostile_omit_check_keep_key` → DENY `must be supplied together`
- `omit_key_keep_check` / `omit_both` / `empty_manifest_and_policy_key` → DENY together
- `nonfunction_check` (`revocationCheck: true`) → DENY together
- `throwing_registry` → DENY fail-closed
- `mismatch_keys` → DENY `signer identity mismatch`
- `host_injected_always_false` / `policy_key_only` → `admitted` (host supplied the pair)

Scan-shaped reconstruction of `0f24ca30` (optional
`if (m.signerKeyId !== undefined && policy.revocationCheck !== undefined)`):
omitting the check while keeping a key id **skipped** revocation and
reached capability/ALLOW. Current dist refuses that path before
capability.

## Challenge 1 — does omitting `revocationCheck` with `signerKeyId` still deny?

**Yes. CONFIRMED.** Named hostile `assert.equal(..., false)` +
`must be supplied together`. Independent `hostile_omit_check_keep_key`
same DENY. Detector can go red. Scan-era optional pair would have
admitted.

## Challenge 2 — does a valid signature from a REVOKED key still admit?

**No. CONFIRMED refused.** Named REVOKED test and independent `revoked`
reason `signing key 'feedfacecafe0001' is REVOKED`, `admitted=false`.

## Challenge 3 — does omitted signer identity skip revocation?

**No. CONFIRMED refused.** HEAD test `"deny: omitted signer identity
cannot skip revocation"` and independent `omit_key_keep_check` DENY
together. Empty-string ids are treated as omitted (src length>0) and
also DENY together when no non-empty id remains.

## Challenge 4 — are dist required-together checks stale vs src?

**No. CONFIRMED not stale.** Dist mtime is newer than src. Src blob
equals HEAD. Dist 90–109 and src 156–173 are the same predicates
(`length > 0`, `typeof === "function"`, together DENY, `=== true`
REVOKED, throw fail-closed). Tests import that dist re-export.

## Residuals (not findings against the named skip-revoke claim)

- `revocationCheck` is **host-injected**. Independent
  `host_injected_always_false` admits: a host that supplies
  `() => false` satisfies the together-gate without a real registry.
  Signature verify uses `policy.publicKeyPem`; `signerKeyId` is a
  separate label. Binding that label to the verified key is a host
  policy duty, not proved here.
- Empty-string key ids are treated as omitted (`length > 0`). That is
  fail-closed (together DENY) when no other non-empty id remains.
  Independent `empty_policy_key_real_manifest` still admits because the
  manifest id is used. Whitespace `" "` is **not** omitted
  (`whitespace_key` admitted with a false check).
- This is software admission of T, not photonic hardware apply.
- Scan ID `csf_d76d15646ea7b5493277f60c`
  (`Photonic configuration controls whether its signer is checked for revocation`,
  medium, `packages-ts/galerina-tower-citizen/src/photonic-admission.ts`
  start_line 156) stays `PARTIAL_THIS_TREE`. Inventory file
  `docs/reports/scan-0f6063dd-inventory-2026-09-22.json` sha256
  `2280b8ef2c3a9058a927969b73c77179885d0bd6782c8fec5b593d40463794da`
  independently re-counted **71 OPEN_ON_SCAN_SNAPSHOT / 49
  PARTIAL_THIS_TREE / 4 PATCHED_AUDIT_PENDING** over 124 unique IDs.
  This review did not re-adjudicate the other 123 IDs. Not 124-scan
  closure.
- Overall disposition stays **INCOMPLETE_NON_AUTHORITATIVE** for
  production admission.

## Classification

No `CONFIRMED_FINDING` on the named required-together / REVOKED-refuse /
hostile-omit-check claim. Detector is not invalid. Evidence is
sufficient for those bullets; insufficient for host-registry honesty,
keyId-to-publicKey binding, scan closure, photonic hardware, and
production admission.

**PASS scoped.** Not production admission. Not Astra. Not 124-scan closure.
**Not clean-HEAD evidence.**
