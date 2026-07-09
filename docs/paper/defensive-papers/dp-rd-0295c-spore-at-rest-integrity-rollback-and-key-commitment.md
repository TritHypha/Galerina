# Defensive Publication — At-rest integrity for an encrypted database file: monotone-epoch rollback resistance + key-committing partitioning-oracle resistance + suite pinning

**Disclosure ID:** DP-RD-0295c · **Date:** 2026-07-09 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Stage:** **DESIGN-STAGE DISCLOSURE** — specified in KB RD-0294 (n/o/p) / RD-0295c/h. The container's
key-committing AEAD (CMT-4) and Merkle-over-ciphertext are shipped in the `.spore` engine; the **monotone-epoch
rollback binding is not yet implemented, and ML-DSA-65 origin signing is DEFERRED** — see §3, the honest
gating dependency.

## 1. What is disclosed

Three composed at-rest-integrity mechanisms for an **encrypted database file format** (Galerina `.spore`:
KEM-DEM hybrid X25519+ML-KEM-768 → AES-256-GCM, TMX-256 Merkle over ciphertext):

1. **Monotone-epoch rollback resistance.** A monotonic epoch/version counter + freshness nonce is bound into
   the (to-be-signed) file header and covered by the Merkle transcript; the **authoritative "latest valid
   epoch" is anchored *outside* the file** — a TPM NV monotonic counter, a transparency-log head, or a WORM
   object-lock on the canonical copy. On load, a file whose epoch is **older than the external anchor** is
   rejected. This defeats swapping in an older, still-validly-sealed container (a since-revoked secret or stale
   ACL that verifies perfectly in isolation).
2. **Key-committing partitioning-oracle resistance.** The AEAD is **key-committing (CMT-4)**: the commitment
   binds the *full* key + algorithm-suite + header, and is covered by the Merkle root, so no `(key,
   ciphertext)` pair can be made to decrypt validly under two keys — foreclosing the partitioning-oracle that
   would otherwise let a decrypt endpoint bulk-test candidate keys/passphrases.
3. **Suite pinning (anti-downgrade).** The algorithm suite is pinned to the **format version** (a single
   enumerated constant) and folded into the AEAD AAD + Merkle transcript; there is **no in-band algorithm
   negotiation**, so `alg=none`, cipher-list downgrade, or forcing the classical-only KEM leg are
   unrepresentable (any such change alters the commitment and fails closed). Envelope/DEK binding to the file
   identity (AAD = Merkle root / file-UUID + epoch) prevents wrapped-DEK relocation.

## 2. What it prevents

Rollback/replay of a stale-but-validly-sealed database file (CWE-294); partitioning-oracle / key-multiplicity
bulk key-testing (Len–Grubbs–Ristenpart class); algorithm-downgrade / suite-confusion and `alg=none` at the
container header (CWE-757/CWE-347); wrapped-DEK ↔ ciphertext relocation/confusion (CWE-345).

## 3. Honest scope and bounds

- **Rollback resistance needs an EXTERNAL monotonic anchor.** In-format, the epoch makes rollback *detectable*
  (refuse epoch < last-seen); it is **not unrepresentable without the external anchor** (TPM-NV /
  transparency-log / WORM) — that residual is stated, not hidden.
- **Integrity ≠ origin, and v0 is UNSIGNED.** While ML-DSA-65 signing is deferred, the header (and its epoch)
  is *encrypted+integrity-protected but not origin-signed*; anyone holding the DEM key / acting as a valid KEM
  recipient can author a fresh valid container. **Until signing lands, rollback resistance and origin are
  advisory** — this DP's mechanisms reach full strength only once the signed root ships (the honest gating
  dependency; files must be marked "integrity-authenticated, origin-UNVERIFIED" in the interim).
- **Confidentiality vs availability.** These bind integrity/freshness, not availability — a ransomware operator
  who encrypts/deletes the file is a separate (operational, backup/WORM) concern.
- **No new cryptography.** CMT-4, monotonic counters, and suite-pinning are established; the contribution is
  the composition and its application to a database file format.

## 4. Prior art acknowledged (novelty disclaimed)

TPM monotonic counters / measured-boot freshness nonces; Sigstore **Rekor** transparency logs and cosign
sign-by-digest; restic / S3-Object-Lock WORM immutable backups; **key-committing AEAD** (CMT-4;
Len–Grubbs–Ristenpart 2021 "partitioning-oracle attacks"); AEAD suite-pinning / algorithm-agility hazards and
the `alg=none`/algorithm-confusion literature (JWT); AWS-KMS encryption-context / envelope AAD binding. The
disclosed composition — *monotone-epoch-in-signed-header + external monotonic anchor + CMT-4 key-commitment
covered by the container Merkle root + version-pinned suite in AAD, applied to an encrypted **database file
format*** — is published to establish prior art; novelty is disclaimed for every constituent.

## 5. Declarations

- **Type/tier:** defensive-pub (design-stage; CMT-4 + Merkle-over-ciphertext shipped, epoch-binding + signing
  pending).
- **Authorship & AI assistance:** drafted with AI assistance (Claude) under human direction, grounded in KB
  RD-0294 (n/o/p) / RD-0295, the shipped `.spore`/`.env.spore` engine, and the cited crypto prior art.
- **Funding:** none. **Competing interests:** none declared.
- **Data / artifact availability:** design source KB `galerina-rd-0294…`/`…-0295…`; shipped constituents in
  the `.spore` engine (`galerina-ext-spore`, KEM-DEM, TMX-256, CMT-4). Epoch-binding + ML-DSA signing unbuilt.
- **Licence:** Apache-2.0.
