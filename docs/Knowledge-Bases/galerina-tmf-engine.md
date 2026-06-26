# The `.tmf` Engine (`@galerina/ext-tmf`)

**Status: IN PROGRESS (Phase 2, roadmap #6).** The `.tmf` (TritMesh Format) engine is being built as a
Galerina **ext** package — `packages-galerina/galerina-ext-tmf` — under the owner decision of 2026-06-16 to
implement it engine-first **inside Galerina** (a new ext package, *not* the gated TritMesh product repo).

This doc is the authoritative in-KB home for the engine. The format specs it implements are vendored into
`packages-galerina/galerina-ext-tmf/spec/` (provenance + R&D upstream pin in that folder's `PROVENANCE` note);
this KB doc is the discoverable, graph-indexed summary. It supersedes the "`.tmf` engine = R&D-only" line
in earlier copies of `galerina-rd-adoption-2026-06-16.md` (now corrected there).

## Where it sits — core vs ext vs R&D

Galerina's long-standing rule is **govern-don't-absorb**: no crypto enters Galerina **core**. That still holds.
The `.tmf` engine is an **ext** package — the thing Galerina *governs* — so building it in-repo does not breach
the core boundary. The boundary is now three-way:

- **Galerina core** — the language + compiler + governance verifier. No crypto. Unchanged.
- **Galerina ext (`galerina-ext-tmf`)** — the deterministic `.tmf` engine. New, in-repo, this doc.
- **R&D (`Galerina-R-AND-D`)** — the authoring/scratch repo for the specs and research. Upstream of `ext`.

## Crypto-on-core (`SPORE-SUBSTRATE-001`) — the hard line

Every primitive runs **bit-exact on a deterministic digital core**: SHAKE256 via `node:crypto`;
ML-DSA-65 / ML-KEM-768 via `@noble/post-quantum` (already a Galerina dependency). **No photonic crypto** —
analog optics (≤~10-bit, error-tolerant) cannot carry an avalanche primitive; SHA-256/SHAKE256 are already
Grover-safe so there is nothing to "speed up" by moving them off-core. See `galerina-substrate-failure-model.md`
and `galerina-quantum-resistance-posture.md`. This was independently re-derived from both the photonic-hashing
and the lattice-crypto literature (see `galerina-rd-adoption-2026-06-16.md` §1).

## The grounded stack

```
INTEGRITY       TMX-256 = 3-ary SHAKE256 XOF tree over coordinate-bound leaves; root binds header_core  (fail-closed)
AUTHENTICITY    ML-DSA-65 (FIPS 204) signs the root — hybrid w/ Ed25519 in transition (no PQ downgrade)
CONFIDENTIALITY ML-KEM-768 (FIPS 203) hybrid X25519 → SHAKE256 KDF → AEAD (default AES-256-GCM), committing
ZERO-TRUST      three-valued verdicts allow / deny / unknown; unknown → deny  (SPORE-GOV-3VL-001)
HARD LINE       crypto/integrity stay on a deterministic core; photonic = bulk math only
```

## TMX-256 (the integrity core)

3-ary Merkle tree over SHAKE256-XOF. Leaves are **coordinate-bound** (`leafHash(kind, modality, coord, payload)`)
with length-prefix domain separation (`lp(b) = LE32(len) ∥ b`) and per-role tags (`TMX-ABSENT / -LEAF / -NODE /
-ROOT-v0`). Internal nodes are arity-3 (`nodeHash(c0,c1,c2)`, `ABSENT` padding); the top always reduces once
(a single leaf → `NODE(L0, ABSENT, ABSENT)`). The root **binds the 24-byte `header_core`** so a container's
integrity root equals its TMX root by construction.

## `.tmf` container (byte layout)

`HEADER(56) ∥ SECTION TABLE(count×56) ∥ PAYLOAD REGION ∥ [SIGNATURE BLOCK]`, all little-endian. `header_core`
= bytes `[0:24)` (magic `89 54 4d 46 0d 0a 1a 0a` ∥ version ∥ profile ∥ flags ∥ count); `integrity_root` =
bytes `[24:56)`. The **§6 fail-closed reader** checks in order: magic → version → profile → reserved-flag →
§2b BigInt-overflow-safe bounds (before any hashing) → per-leaf recompute → root recompute → **signed-reject**.
A signed file is rejected `AuthError` until a vetted verifier is wired (slice 4) — **never a silent downgrade**.
Error taxonomy (§7): `BadMagic · UnsupportedVersion · UnknownProfile · MalformedTable · IntegrityError · AuthError`.

## Build slices

| | Slice | Spec | Status |
|---|---|---|---|
| 1 | TMX-256 integrity core | `tmx-256-construction-v0` | ✅ `src/tmx256.ts`, 9 golden tests |
| 2 | container reader/writer | `tmf-container-v0` (+ `tmf-modalities-v0`) | ✅ `src/container.ts`, 10 golden tests |
| 3 | KEM-DEM confidentiality | `tmf-encryption-v0` | ✅ `src/kemdem.ts`, 14 golden + round-trip tests |
| 4 | hybrid signing over the root (+ M-of-N custody) | `signature-custody-v0`, `threshold-custody-v0` | ⬜ **next** |
| 5 | inclusion proofs + history chain + Trust Capsule | `inclusion-proof-v0`, `tmf-history-chain-v0`, `governed-trust-capsule-v0` | ⬜ |

Slice 4 feeds Galerina **#34** (ML-DSA-65 over the digest, hybrid Ed25519). Conformance is pinned by inline
golden vectors in the package `tests/` (container `89544d46…`, root `43386e64…685212`).

## What Galerina governs (not absorbs)

The engine is the **governed object**; the governance lives in Galerina proper:
- **Verify-before-decrypt key release** — the K3 gate `keyRelease(integrityOk, authenticityOk, govVerdict)`,
  landed as `tests/patterns/pattern-10-verify-before-decrypt-gate.spore` (adoption ledger U1).
- **No cleartext semantic embedding across a trust boundary** — `galerina-privacy-embedding-egress.md` (U2/#204).
- Crypto effect typing + PQ/hybrid requirement — `SPORE-CRYPTO-PQ-001`, `galerina-quantum-resistance-posture.md`.

## See also

`galerina-rd-adoption-2026-06-16.md` (the govern-don't-absorb ledger) · `galerina-build-roadmap.md` (#6 slice
table) · `galerina-substrate-failure-model.md` · `galerina-three-valued-governance.md` ·
`galerina-quantum-resistance-posture.md` · `galerina-tmf-tri-encryption-rd` (memory). Upstream specs +
research: `Galerina-R-AND-D/tmf/` (now mirrored into `rd-absorbed/`; full ledger `galerina-rd-absorption-catalog.md`, quantum roadmap `galerina-quantum-resilience-roadmap.md`).
