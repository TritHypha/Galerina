# Galerina #34 — offline governance-key ceremony runbook

**What this is:** the operator procedure for minting the Galerina governance **signing trust
root** — a hybrid **Ed25519 + ML-DSA-65** (NIST FIPS 204, post-quantum) keypair — and holding
its private half in offline custody. Referenced by `galerina keygen --hybrid`
([galerina.mjs](../../galerina.mjs) `command === "keygen"`).

**Who runs it:** the owner / trust-root custodian, **not an automated agent**. Whoever holds the
private key file *is* the Galerina trust root: they can sign any manifest as authoritative. An
agent must never generate, hold, or commit this key.

---

## 1. What the ceremony produces

`galerina keygen --hybrid` (or `--pq`) generates one keypair and writes **two kinds of output**:

| Output | Path | Commit? | Custody |
|---|---|---|---|
| Ed25519 public key | `governance/signing-key-<id>.pub.pem` | **YES** — safe to commit | public trust anchor |
| ML-DSA-65 public key | `governance/signing-key-<id>.mldsa.pub.b64` | **YES** — safe to commit | public trust anchor |
| **Private keys (both halves)** | `.env.galerina-signing` | **NEVER** | **your offline secret** |

`.env.galerina-signing` (mode `0600`, header literally "NEVER COMMIT THIS FILE") contains:

```
GALERINA_SIGNING_KEY_ID=<id>
GALERINA_SIGNING_ALGORITHM=Ed25519+ML-DSA-65
GALERINA_SIGNING_KEY_CREATED=<iso8601>
GALERINA_SIGNING_PRIVATE_KEY_B64=<ed25519 private, base64>
GALERINA_SIGNING_MLDSA_PRIVATE_KEY_B64=<ml-dsa-65 private, base64>
```

**That file is the answer to "do I get a key to keep safe?" — yes, this is it.**

---

## 2. The ceremony (air-gapped)

1. **Prepare an air-gapped host** — no network, trusted OS, full-disk-encrypted. Check out the
   repo (or just a `galerina` build) onto it.
2. **Confirm `.env.galerina-signing` is gitignored** (it is, repo root `.gitignore`) — verify with
   `git check-ignore .env.galerina-signing`. Never disable that ignore.
3. **Mint the key:**  `galerina keygen --hybrid`
4. **Custody the private key — COPY first, destroy second (in that order):** the private key has
   no backup. **Copy** `.env.galerina-signing` into offline secret storage (hardware token /
   encrypted offline media / a secrets manager), **verify the copy is readable**, and only THEN
   shred the working-tree file. A destroy-only step (`Remove-Item` + `cipher /w`) **without a
   prior copy loses the key permanently** — you would have to regenerate a new `<id>` and re-pin.
   On Windows the `0600` is best-effort — restrict the NTFS ACL to your user
   (`icacls .env.galerina-signing /inheritance:r /grant:r "$($env:USERNAME):F"`) on **both** the
   working copy and the custody copy, and prefer an encrypted/offline volume over a plain folder.
5. **Publish BOTH public halves:** `governance/signing-key-<id>.pub.pem` **and**
   `governance/signing-key-<id>.mldsa.pub.b64` are the committed trust anchor.
   The `.pub.pem` is caught by the dev-pubkey ignore in `.gitignore`, so **first un-ignore this
   anchor** by adding a negation line next to the existing ones:
   `!**/governance/signing-key-<id>.pub.pem` (the `.mldsa.pub.b64` is never ignored). Then:
   ```
   git add governance/signing-key-<id>.pub.pem governance/signing-key-<id>.mldsa.pub.b64 .gitignore
   git commit -m "governance: signing key <id> (Ed25519 + ML-DSA-65) — public anchor
   pin pub.pem sha256:<sha256 of the .pub.pem>
   pin mldsa  sha256:<sha256 of the .mldsa.pub.b64>"
   ```
   Record the **key-id and both SHA-256 pins** so verifiers pin the bytes, not just the id.
   *(Quick path without editing `.gitignore`: `git add -f` the two files — but the negation line
   is preferred so the anchor stays committable on later touches.)*

## 3. Signing with the key

On the signing host (private key present in the environment):

```
export GALERINA_SIGNING_KEY_ID=<id>
source .env.galerina-signing          # or inject the two *_PRIVATE_KEY_B64 vars from your vault
GALERINA_MANIFEST_PROFILE=certified galerina build <file.fungi>
```

The build signs the manifest **hybrid** — both Ed25519 AND ML-DSA-65 (logical AND at verify time,
**no silent downgrade**: a `certified`/`v2` manifest with a missing ML-DSA public key is a hard
deny, `FUNGI-MANIFEST-PQ-REQUIRED`). Verification pins the algorithm — it is not `alg`-driven.

## 4. Zero-trust invariants (non-negotiable)

- **Never commit** `.env.galerina-signing` or any `*_PRIVATE_KEY_B64` value. The audit
  (`scripts/audit-path-leak.mjs` + the never-track structural pass) and `.gitignore` are the
  backstops; custody discipline is the control.
- **Air-gapped mint.** The private key should never exist on a networked host.
- **Pin the public key.** Verifiers must pin the committed public key / key-id, not trust an
  `alg` field in the manifest.
- **Rotation:** minting a new key produces a new `<id>`; keep old public keys committed so
  historically-signed artifacts still verify. Revocation = remove/mark the public key + re-sign
  live artifacts under the new key.
- **Loss of the private key = loss of the trust root.** Treat it like a root CA key.

## 5. Coupling to the `.spore` v1 ceremony (roadmap note)

Per the owner-gated ceremony (work-state gate #7), the ML-DSA signing act is intended to land
**coupled** with the **F10 file-id AAD fold + `.spore` v1 bump** (one additive v1 change; v0 golden
vectors stay byte-identical). The *signing code* is implemented and green (attestation.ts,
`hybrid-pq-signature`/`lmanifest-hybrid-verifier` suites, 53 tests). What remains is: (a) **this
key op** (owner custody), and (b) the F10 AAD fold in `kemdem.ts` (frozen wire format — build
carefully behind v1, new golden vectors, round-trip + tamper tests). (b) is owner-gated and
should not be applied on a blanket unlock.

*Written 2026-07-10 to close the referenced-but-missing-doc gap at galerina.mjs:390.*
