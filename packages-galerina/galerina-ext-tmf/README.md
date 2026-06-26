# `@galerina/ext-tmf`

The **`.tmf` (TritMesh Format) engine** for Galerina — an *ext* package (not core). It provides the
**integrity, authenticity, and confidentiality** layer that Galerina governs: a fail-closed container
whose integrity root is a 3-ary SHAKE256 Merkle tree, signed by the hybrid Ed25519 + ML-DSA-65 signer,
with KEM-DEM confidentiality.

> **Crypto-on-core (`SPORE-SUBSTRATE-001`).** Every primitive here runs **bit-exact on a deterministic
> digital core** — SHAKE256 via `node:crypto`; ML-DSA-65 / ML-KEM-768 via `@noble/post-quantum`. No
> Rust, **no photonic crypto** (analog optics ≤~10-bit cannot carry an avalanche primitive). Photonics,
> if ever used, is bulk math only — never integrity, signing, or key release.

## Architecture (the grounded stack)

```
INTEGRITY       TMX-256 = 3-ary SHAKE256 XOF tree over coordinate-bound leaves; root binds header_core  (fail-closed)
AUTHENTICITY    ML-DSA-65 (FIPS 204) signs the root — hybrid w/ Ed25519 in transition (no PQ downgrade)
CONFIDENTIALITY ML-KEM-768 (FIPS 203) hybrid X25519 → SHAKE256 KDF → AEAD (default AES-256-GCM), committing
ZERO-TRUST      three-valued verdicts allow / deny / unknown; unknown → deny
HARD LINE       crypto/integrity stay on a deterministic core
```

## Build status (slices)

| | Slice | Source | Status |
|---|---|---|---|
| 1 | TMX-256 integrity core | `src/tmx256.ts` | ✅ shipped (9 golden tests) |
| 2 | container reader/writer (§6 fail-closed) | `src/container.ts` | ✅ shipped (10 golden tests) |
| 3 | KEM-DEM confidentiality | `src/kemdem.ts` | ✅ shipped (14 tests: deterministic goldens + hybrid-KEM round-trip/tamper) |
| 4 | hybrid signing over the root (+ M-of-N custody) | `spec/signature-custody-v0.md` (spec only) | ⛔ **Blocked** — needs a vetted FIPS-204 (ML-DSA-65) + Ed25519 lib (§8); `flags.signed` files fail-closed until then |
| 5 | inclusion proofs + history chain + Governed Trust Capsule | `src/history.ts` | 🟡 partial — history chain integrity + order + §5 freshness + §8 pack shipped (16 tests); inclusion proofs + Trust Capsule + head ML-DSA signature still gated (slice 4 / #12) |

The format specs each slice implements are vendored in [`spec/`](spec/) (see [`spec/PROVENANCE.md`](spec/PROVENANCE.md)
for the R&D upstream pin and sync rule). Conformance is pinned by the inline golden vectors in `tests/`.

## Build & test

This ext package has no local `tsc` install — it borrows the compiler's:

```powershell
node ..\galerina-core-compiler\node_modules\typescript\bin\tsc
node --test tests/*.test.mjs
```

The suite is also auto-discovered by the repo runner `scripts/run-all-tests.cjs`.

## Governance boundary

This engine is the thing Galerina **governs**, not part of Galerina core. The governance side (verify-before-decrypt
key release, the K3 gate, data-exposure rules) lives in the compiler + `tests/patterns/`. See the KB doc
`docs/Knowledge-Bases/galerina-tmf-engine.md` and the adoption ledger `galerina-rd-adoption-2026-06-16.md`.

Apache-2.0. No new cryptography by design (defensive-publication posture, not patents).
