# Galerina offline registry-index signing ceremony reference

**LOCKED REFERENCE — DO NOT EXECUTE FROM THIS FILE.**

This file preserves later ceremony commands for engineering review. The only
authoritative owner action is published in
`OFFLINE-KEY-SIGNING-WALKTHROUGH.md`. A command appearing here is not
permission or readiness to run it.

**Status on 2026-07-30: CEREMONY COMPLETE FOR THAT HISTORICAL ARTIFACT — NO
CURRENT SIGNING ACTION FROM THIS LOCKED REFERENCE.**

The completion facts below are bound to the exact 2026-07-30 package bytes and
signed outputs. Later security hardening changed those bytes; the key register
therefore treats this receipt as historical and requires a new owner-controlled
offline ceremony for the final current candidate. This file never authorizes
that ceremony; the owner-facing current boundary is the beta-v1 release-
evidence walkthrough.

The root-to-operational delegation, deterministic artifact hasher, strict
manifest reader and disposable-key dry run are green. The false live auth and
healthcare stubs have been removed. The real `@galerina/auth` bytes and owner
approval remain in an unsigned provenance candidate. Operational hybrid key
`f3172a48372bfb23` has been minted and both public halves were independently
exported and admitted. Cold root `21415420b447e219` signed its serial-1
delegation, which independently passed hybrid signature, serial-floor,
active-window, exact-role, revocation and operational-public-pin checks. The
operational key then hybrid-signed the auth manifest; it independently verified
and is the sole live entry. The public-only builder produced exactly one
unsigned index entry. The returned operational hybrid-signed index independently
verified, matched that rebuild exactly and refused all seven mutation cases.
The live action page authorizes no further signing action for this artifact.

The independently verified public pins are:

- Ed25519: `D27C56FC2E5C7E6BEA5FE7A24BDC318887F1E8FD69FE458DBD4E1FA6B59167D4`;
- ML-DSA-65: `1C97131FB9D8DA2A6081CEEC6D5712251573B4DA22EB0509E7915A2035C427D2`.

These public pins identify bytes; they do not authorize the operational key.
Root delegation remains mandatory.

The extra online private working copy was removed on 2026-07-30 after the two
offline custody copies and both independently exported public halves were
verified. Filesystem deletion is not claimed as physical SSD erasure.

This procedure is for the owner/trust custodian. An automated agent may build
and test the tooling, but must never read, copy, source, print, or use private
key values.

## 0. Exact keys — no substitutions

The earlier selection of `942d6b2726b0a991` was incorrect. A live metadata-only
check on 2026-07-30 confirmed that it has no hybrid algorithm or ML-DSA-65
private half. The repository key register independently classifies it as
legacy Ed25519-only. Never add an algorithm label or new ML-DSA half to that
existing identity.

| Purpose | Exact key ID | Exact private filename | What it may sign |
|---|---|---|---|
| Offline hybrid registry trust root | `21415420b447e219` | `galerina-signing-key-21415420b447e219.env` | The hybrid operational registry delegation only |
| Operational hybrid registry signer | `f3172a48372bfb23` | `env.slide-hybrid-f3172a48372bfb23` | Reviewed package manifests and the registry index |

The tracked public verifier for the root is
`governance/signing-key-21415420b447e219.pub.pem`; its tracked ML-DSA-65
public half is
`governance/signing-key-21415420b447e219.mldsa.pub.b64`.

The following existing files are **not** the registry-v2 operational key:

- `env.galerina-signing-942d6b2726b0a991` — active historical Ed25519
  operational signer, but legacy/classical-only;
- `.env.galerina-signing-53de6be4d53a33b2` — the key register classifies this
  identity as Ed25519-only, so it is ineligible;
- `.galerina-audit-key.env` — audit-domain key, not registry authority;
- `signing-key-21415420b447e219.pub.pem` — public verifier only, never private
  signing material;
- `galerina-signing-key-cd01346961d88e94.env` — superseded development key;
- `.env.galerina-signing-0091172baff1b6b0` — oldest stale/disposable key.

The ceremony tools compare the requested key ID with
`GALERINA_SIGNING_KEY_ID` inside the private file and refuse a mismatch. A
filename match alone is not authority.

The signing chain is:

```text
21415420b447e219 (offline root)
  └─ hybrid-signs one time-bounded delegation for f3172a48372bfb23
       ├─ signs reviewed package manifests
       └─ signs galerina-registry-index/v2
```

Never point `registry-index-cli.mjs` at the root file. Never use the
operational file to sign its own delegation.

The root delegation envelope is itself `Ed25519+ML-DSA-65`; both root
signature halves must verify. An Ed25519-only delegation is a prohibited
downgrade.

## 1. What is being signed

New indexes use `galerina-registry-index/v2` and a Galerina dual-signature
application envelope:

| Property | Required value |
|---|---|
| Classical component | Ed25519 |
| Post-quantum component | ML-DSA-65 (FIPS 204) |
| Canonical form | JCS / RFC 8785 |
| Domain | `galerina.registry.index.sig.v2` |
| Signed preimage | domain, suite, authority key id, canon tag, and canonical unsigned index, separated by NUL bytes |
| Admission rule | both signatures must verify (logical AND) |

This is not an implementation of the still-draft IETF Composite ML-DSA
encoding. Both signatures are explicit fields in a Galerina application
envelope. The ML-DSA call also receives the domain as its FIPS 204 context.
The authority key id and pinned suite metadata are signed facts, not only
unsigned verifier-selection hints.

The historical `galerina-registry-index/v1` Ed25519 verifier remains for old
artifacts. It is verify-only: the normal builder emits v2, the legacy signer
refuses v2, and no missing-PQ or algorithm-downgrade path is accepted.

Primary references:

- NIST FIPS 204, final 2024-08-13, with a minor-errata note posted in 2026:
  <https://csrc.nist.gov/pubs/fips/204/final>
- RFC 8032, Ed25519:
  <https://www.rfc-editor.org/info/rfc8032/>
- RFC 9958, engineering guidance for post-quantum migration:
  <https://www.rfc-editor.org/rfc/rfc9958.html>
- RFC 9964, ML-DSA identifiers and formats for JOSE/COSE:
  <https://www.rfc-editor.org/info/rfc9964/>
- IETF Composite ML-DSA draft, not a final standard:
  <https://datatracker.ietf.org/doc/html/draft-ietf-lamps-pq-composite-sigs>
- NIST CSWP 39upd1, crypto-agility guidance:
  <https://csrc.nist.gov/pubs/cswp/39/upd1/considerations-for-achieving-crypto-agility/final>

## 2. Current readiness ledger

| Gate | Current evidence | State |
|---|---|---|
| v2 hybrid app-kernel envelope and authority chain | 149/149 app-kernel tests; hybrid-root downgrade refusal included | ready |
| Hermetic signer/admission self-test | 20/20, real Ed25519 + ML-DSA-65 | ready |
| Root-to-operational delegation decider | time, role, fingerprint, revocation and rollback checks | ready |
| Deterministic flat-package artifact identity | 10/10 path, byte, topology, symlink and resource-limit checks | ready |
| Authority ceremony and live-builder CLI | 35/35 focused registry tests; 9/9 internal authority checks | ready |
| File-backed sign then public-key verify | disposable ceremony fixture | ready |
| Missing/tampered/downgraded signature refusal | tested | ready |
| Signed revocation-registry check before key use | tested, including known-revoked refusal | ready |
| Live registry manifests | exactly one independently verified hybrid-signed `@galerina/auth` manifest | ready |
| Reviewable package bytes | `@galerina/auth` 18-file digest re-derives; nonexistent healthcare claim removed | ready technical evidence |
| Auth governance approval and manifest signature | unsigned provenance plus independently verified hybrid-signed live manifest | ready |
| Operational registry authority | `f3172a48372bfb23` minted; independent public export matches both admitted repository verifier files; serial-1 root delegation verified | ready |
| Root-signed operational delegation format and verifier | serial-1, 90-day public delegation passes hybrid signature, serial, role, revocation, window and key-pin checks | ready |
| Operational-key custody | two verified encrypted offline copies in separate physical locations owner-confirmed 2026-07-30 | ready |
| Real auth-manifest signing act | verified at `2026-07-30T16:30:19.180Z`; live file SHA-256 `0A1621374BE4CC7E28BF81FEECC19CFC29E2DD5A680417FA7F7E9E145CD60C1C` | ready |
| Public-only live index build | one entry at `2026-07-30T16:33:10.307Z`; SHA-256 `15D531566E9FB71F152E34BD9C4C62D4D6FAE15DB0309CBCFA0834BE2E020383` | ready |
| Real registry-index signing act | verified under `f3172a48372bfb23`; exact tracked SHA-256 `DCF80AA0717DEBF8BEB837584FDC053E24891C0D1224FB4735900E68FC1AAF06`; 7/7 returned-artifact mutations refuse | ready |

The unsigned candidate records provenance and does not create authority. The
separate live manifest is authoritative only because its package bytes,
governance facts, complete delegation chain and both hybrid signatures verify.

## 3. Non-negotiable custody rules

1. Keep private material outside every repository, including gitignored
   locations. Gitignore is a backstop, not custody.
2. Use a full-disk-encrypted, offline signing machine. Disable networking
   before private material is mounted.
3. Use a dedicated operational hybrid key for registry indexes. The cold root
   should authorize that key and return to offline storage.
4. Maintain at least two encrypted offline custody copies in separate physical
   locations. Verify each copy is readable before destroying a working copy.
5. Commit only public halves, identifiers, delegation/revocation records, and
   signed public artifacts.
6. Never paste a private value into a shell command, terminal transcript,
   issue, commit message, chat, or build log.
7. A revoked key is terminally denied even if its cryptographic signature is
   valid.
8. Keep old public keys and old verifiers for historical validation. Rotation
   stops new signing; it does not erase history.

On Windows, restrict the private file ACL to the owner and use an encrypted
volume. `cipher /w:` cannot guarantee physical SSD erasure because of
wear-levelling. On Linux/macOS, use owner-only permissions and encrypted media;
filesystem deletion alone is not proof of SSD erasure.

## 4. Engineering gates before the owner is called

All of the following must be true at one reviewed commit:

- Every registry entry points to real, immutable package bytes.
- `hash` is `sha256:` plus the digest computed from those exact bytes.
- The package manifest signature is real and independently verified.
- `governance.reviewed` is exactly `true`; `reviewedBy` and `reviewedAt` are
  present and correspond to a recorded review.
- Capabilities, effects, publisher, package key id, certification level, and
  risk rating are reviewed facts.
- No install script is present.
- The live tree passes the unsigned build gate. One bad entry must poison the
  whole signing act; entries are never skipped.
- A dedicated operational registry key has both public halves in the public
  authority inventory.
- The cold root has authorized that operational key through a format the
  runtime actually verifies. A prose statement is not delegation.
- The operational key is absent from the trusted revocation ledger.
- The last accepted `issuedAt` floor is recorded and the new timestamp is
  strictly newer.

The nonexistent healthcare claim has been removed. The auth candidate satisfies
the engineering byte/hash review but remains outside the live tree until the
owner verifies its powers/risk facts, records governance approval, and signs
the complete manifest through the valid delegated operational key.

## 5. Owner preflight on the offline machine

Use placeholders; do not put private values in commands.

```powershell
Set-Location <clean-galerina-checkout>
git status --short
git rev-parse HEAD
npm.cmd --prefix packages-ts/galerina-framework-app-kernel test
npm.cmd --prefix packages-ts/galerina-registry test
node scripts/registry-index-cli.mjs --self-test
node scripts/registry-index-cli.mjs build `
  --registry-dir packages-ts/galerina-registry/packages `
  --workspace-packages-dir packages-ts `
  --delegation <offline-staging>/registry-delegation-v1.json `
  --root-pubkey governance/signing-key-21415420b447e219.pub.pem `
  --root-mldsa65-pubkey governance/signing-key-21415420b447e219.mldsa.pub.b64 `
  --root-key-id 21415420b447e219 `
  --operational-ed25519-pubkey <offline-staging>/signing-key-f3172a48372bfb23.pub.pem `
  --operational-mldsa65-pubkey <offline-staging>/signing-key-f3172a48372bfb23.mldsa.pub.b64 `
  --authority-at <canonical-verification-utc-iso-with-milliseconds> `
  --min-delegation-serial <last-accepted-serial-floor> `
  --issued-at <strictly-newer-utc-iso> `
  --out <offline-staging>/unsigned-index.json
```

The command now succeeds and must produce exactly one entry. The independently
reproduced fixed build uses `issuedAt` `2026-07-30T16:33:10.307Z` and has
SHA-256
`15D531566E9FB71F152E34BD9C4C62D4D6FAE15DB0309CBCFA0834BE2E020383`.
Reconcile that entry against the reviewed package record before exposing any
private key.

Confirm the private-key directory is not a repository:

```powershell
Set-Location <offline-key-directory>
git rev-parse --show-toplevel
```

That command must fail with “not a git repository”.

Confirm the public halves and authority records are the reviewed bytes. Record
their SHA-256 digests in the offline ceremony log. The log contains public
pins only.

### 5.1 Exact authority-delegation procedure

This subsection records the completed authority-delegation procedure. The
serial-1 delegation independently verifies; operational-key custody is
owner-confirmed, the public export matches the admitted repository verifiers,
and the extra online private working copy is removed. Do not repeat this
procedure for the current act. The live action page now authorizes only the
fixed registry-index signature.

The dedicated operational hybrid key has already been minted as
`f3172a48372bfb23`. Do not run `keygen --hybrid` again unless intentionally
abandoning this identity and restarting the ceremony with a newly reviewed
key. The historical minting command was:

```powershell
Set-Location <new-empty-offline-ceremony-directory>
node <clean-galerina-tools>\galerina.mjs keygen --hybrid
```

For the selected ceremony, that command printed `f3172a48372bfb23` and
created:

- `.env.galerina-signing` containing both private halves;
- `governance\signing-key-f3172a48372bfb23.pub.pem`;
- `governance\signing-key-f3172a48372bfb23.mldsa.pub.b64`.

Copy the private file to encrypted offline custody as
`env.slide-hybrid-f3172a48372bfb23`, verify the copy is readable,
and retain the generated public files. Do not destroy the working copy until
both required custody copies have been verified.

Use the new private file to independently re-derive public material:

```powershell
$env:GALERINA_REGISTRY_SIGNING_ENV_PATH = "<offline-key-directory>\env.slide-hybrid-f3172a48372bfb23"

node scripts/registry-authority-cli.mjs export-public `
  --operational-key-id f3172a48372bfb23 `
  --ed25519-out <offline-staging>\signing-key-f3172a48372bfb23.pub.pem `
  --mldsa65-out <offline-staging>\signing-key-f3172a48372bfb23.mldsa.pub.b64

Remove-Item Env:GALERINA_REGISTRY_SIGNING_ENV_PATH
```

Inspect and record the SHA-256 hashes of both public files. Then create the
unsigned delegation draft. Serial `1` is correct only if no earlier accepted
delegation exists; otherwise use a value strictly greater than the recorded
serial floor.

```powershell
node scripts/registry-authority-cli.mjs draft `
  --root-key-id 21415420b447e219 `
  --operational-key-id f3172a48372bfb23 `
  --ed25519-pubkey <offline-staging>\signing-key-f3172a48372bfb23.pub.pem `
  --mldsa65-pubkey <offline-staging>\signing-key-f3172a48372bfb23.mldsa.pub.b64 `
  --serial <strictly-newer-positive-integer> `
  --issued-at <canonical-utc-iso-with-milliseconds> `
  --not-before <canonical-utc-iso-with-milliseconds> `
  --not-after <canonical-utc-iso-with-milliseconds> `
  --out <offline-staging>\registry-delegation-v1.unsigned.json
```

Review the draft. It must name only the roles `package-manifest.sign` and
`registry-index.sign`. It must pin both public-key fingerprints.

Only now mount the offline root file
`galerina-signing-key-21415420b447e219.env`. The root signs the delegation and
nothing else:

```powershell
$env:GALERINA_ROOT_SIGNING_ENV_PATH = "<offline-key-directory>\galerina-signing-key-21415420b447e219.env"

node scripts/registry-authority-cli.mjs sign `
  --in <offline-staging>\registry-delegation-v1.unsigned.json `
  --out <offline-staging>\registry-delegation-v1.json `
  --root-key-id 21415420b447e219

Remove-Item Env:GALERINA_ROOT_SIGNING_ENV_PATH
```

Unmount the root material before restoring network access. Independently
verify the public delegation against the tracked root verifier:

```powershell
node scripts/registry-authority-cli.mjs verify `
  --in <offline-staging>\registry-delegation-v1.json `
  --root-pubkey governance\signing-key-21415420b447e219.pub.pem `
  --root-mldsa65-pubkey governance\signing-key-21415420b447e219.mldsa.pub.b64 `
  --root-key-id 21415420b447e219 `
  --at <instant-inside-the-delegation-window> `
  --min-serial <previous-accepted-serial>
```

Any ID mismatch, public-key fingerprint mismatch, invalid window, stale serial,
revocation, tamper, missing role, or non-literal verifier success is a terminal
refusal.

## 6. Signing act

Do this only after every gate in section 4 is green and the project report says
`READY FOR OWNER SIGNING`.

The private input is the hybrid `.env.galerina-signing` produced by
`galerina keygen --hybrid`. The CLI accepts its path; it does not source it and
does not print its values.

```powershell
Set-Location <clean-galerina-checkout>
$env:GALERINA_SIGNING_KEY_ID = "f3172a48372bfb23"
$env:GALERINA_REGISTRY_SIGNING_ENV_PATH = "<offline-key-directory>\env.slide-hybrid-f3172a48372bfb23"

node scripts/registry-authority-cli.mjs sign-manifest `
  --in packages-ts\galerina-registry\candidates\@galerina\auth\package.galerina.yaml `
  --out <offline-staging>\auth.package.galerina.yaml `
  --workspace-packages-dir packages-ts `
  --delegation governance\registry-delegation-f3172a48372bfb23-v1.json `
  --root-pubkey governance\signing-key-21415420b447e219.pub.pem `
  --root-mldsa65-pubkey governance\signing-key-21415420b447e219.mldsa.pub.b64 `
  --root-key-id 21415420b447e219 `
  --operational-ed25519-pubkey governance\signing-key-f3172a48372bfb23.pub.pem `
  --operational-mldsa65-pubkey governance\signing-key-f3172a48372bfb23.mldsa.pub.b64 `
  --operational-key-id f3172a48372bfb23 `
  --authority-at <instant-inside-the-delegation-window> `
  --min-delegation-serial <previous-accepted-serial>

node scripts/registry-authority-cli.mjs verify-manifest `
  --in <offline-staging>\auth.package.galerina.yaml `
  --workspace-packages-dir packages-ts `
  --delegation governance\registry-delegation-f3172a48372bfb23-v1.json `
  --root-pubkey governance\signing-key-21415420b447e219.pub.pem `
  --root-mldsa65-pubkey governance\signing-key-21415420b447e219.mldsa.pub.b64 `
  --root-key-id 21415420b447e219 `
  --operational-ed25519-pubkey governance\signing-key-f3172a48372bfb23.pub.pem `
  --operational-mldsa65-pubkey governance\signing-key-f3172a48372bfb23.mldsa.pub.b64 `
  --operational-key-id f3172a48372bfb23 `
  --authority-at <same-instant-inside-the-delegation-window> `
  --min-delegation-serial <previous-accepted-serial>

New-Item `
  -ItemType Directory `
  -Force `
  -Path packages-ts\galerina-registry\packages\@galerina\auth |
  Out-Null
Copy-Item `
  -LiteralPath <offline-staging>\auth.package.galerina.yaml `
  -Destination packages-ts\galerina-registry\packages\@galerina\auth\package.galerina.yaml

node scripts/registry-index-cli.mjs sign `
  --registry-dir packages-ts/galerina-registry/packages `
  --workspace-packages-dir packages-ts `
  --registry "https://registry.galerina.dev" `
  --delegation <offline-staging>\registry-delegation-v1.json `
  --root-pubkey governance\signing-key-21415420b447e219.pub.pem `
  --root-mldsa65-pubkey governance\signing-key-21415420b447e219.mldsa.pub.b64 `
  --root-key-id 21415420b447e219 `
  --operational-ed25519-pubkey <offline-staging>\signing-key-f3172a48372bfb23.pub.pem `
  --operational-mldsa65-pubkey <offline-staging>\signing-key-f3172a48372bfb23.mldsa.pub.b64 `
  --authority-at <instant-inside-the-delegation-window> `
  --min-delegation-serial <previous-accepted-serial> `
  --issued-at <strictly-newer-utc-iso> `
  --out <offline-staging>/registry-index-v2.json

Remove-Item Env:GALERINA_REGISTRY_SIGNING_ENV_PATH
Remove-Item Env:GALERINA_SIGNING_KEY_ID
```

The tool:

1. strictly parses each reviewed manifest and re-hashes its exact declared
   flat-package bytes;
2. verifies the root delegation, both public-key fingerprints and both
   package-manifest signatures;
3. rebuilds from those verified manifests rather than signing an arbitrary
   file;
4. validates the signed revocation registry and checks the key id before
   loading private material;
5. requires both private halves and the pinned algorithm;
6. signs the domain-separated canonical preimage;
7. derives both public halves and verifies both signatures;
8. writes only after successful self-verification.

There is no `--force` or Ed25519-only production mode.

## 7. Independent public verification

Move only the signed index and public artifacts to a separate verification
environment. Do not move private material.

```powershell
node scripts/registry-index-cli.mjs verify `
  --in <public-staging>/registry-index-v2.json `
  --ed25519-pubkey <public-authority>/signing-key-f3172a48372bfb23.pub.pem `
  --mldsa65-pubkey <public-authority>/signing-key-f3172a48372bfb23.mldsa.pub.b64 `
  --key-id f3172a48372bfb23 `
  --min-issued-at <previous-accepted-issued-at>

Get-FileHash <public-staging>/registry-index-v2.json -Algorithm SHA256
```

Record:

- source commit;
- schema, registry id, entry count, and `issuedAt`;
- operational key id;
- both public-key SHA-256 pins;
- signed-index SHA-256 pin;
- reviewer identities and review record references;
- independent verification result.

Before publication, deliberately test a copy with one entry changed, each
signature half changed or removed, the context changed, and the algorithm
downgraded. Every case must refuse. Never mutate the candidate that will be
published.

## 8. Public artifacts returned to the repository

Only these classes of data return:

- `registry-index-v2.json`;
- Ed25519 public half;
- ML-DSA-65 public half;
- root-authorized operational delegation record;
- append-only revocation/rotation records;
- ceremony evidence containing identifiers and public hashes, never secrets.

Before committing, run the private-material and path-leak gates. Review the
staged diff byte by byte. A public artifact must not contain a private field,
offline local path, environment dump, or terminal transcript.

## 9. Rotation, revocation, rollback, and incident response

**Routine rotation:** mint a new operational hybrid key offline; root-authorize
it; publish both public halves; overlap verification; sign a strictly newer
index; then mark the prior operational key verify-only/retired for new
production acts. Keep its public material.

**Suspected compromise:** stop publication; append a revocation; distribute the
revocation state through the pinned trust path; mint and authorize a new key;
re-review and re-sign the current index. A valid signature by a revoked key is
still denied.

**Lost private key:** do not fabricate continuity. Revoke/retire the lost key,
mint and authorize a replacement, and sign a new index. Historical artifacts
remain verifiable through the old public key.

**Bad index publication:** retain the last known-good index, but never lower
the accepted `issuedAt` floor or trust requirements. Publish a corrected,
strictly newer index. “Rollback” means restoring service from known-good facts,
not accepting an older or weaker trust state.

**Broken root/delegation path:** stop. Do not use an unanchored operational key
and do not touch the cold root until the authority format and recovery plan are
reviewed.

## 10. Exact notification threshold

Tell the owner **“READY FOR OWNER SIGNING”** only when:

- the auth candidate's powers, risk and certification facts have owner
  approval and the complete manifest is hybrid-signed;
- the unsigned live-index build succeeds without exceptions;
- the operational public bundle and root-signed delegation are independently
  verified;
- two encrypted offline operational-key custody copies in separate physical
  locations have been read-back verified;
- all disposable-key positive, tamper, downgrade, rollback, and revocation
  tests pass;
- public artifact paths and the previous `issuedAt` floor are recorded;
- the source commit is clean and all terminal project gates are green.

Until then, report **“NOT READY”** with the failing gates. Those signing
preconditions were satisfied on 2026-07-30. The returned hybrid index now
independently verifies, matches the exact public-only rebuild, has tracked
SHA-256
`DCF80AA0717DEBF8BEB837584FDC053E24891C0D1224FB4735900E68FC1AAF06`,
and refuses all seven returned-artifact mutations. Report **“PRODUCTION
REGISTRY SIGNING COMPLETE”** and authorize no repeat signing act.
