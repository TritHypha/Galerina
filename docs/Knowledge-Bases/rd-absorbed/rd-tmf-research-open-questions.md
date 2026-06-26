<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tmf/research/open-questions.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-tmf-engine.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-tmf-engine.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Open questions & decision forks — `.tmf` encryption R&D

Grounded, answerable questions that block (or shape) a buildable v0. Each has a **recommended
default** so work can proceed; flag any you want to overrule. Ordered by leverage.

## ✅ Ratified 2026-06-15 (resolved — no longer open)
- **#11 crypto-on-deterministic-core → RESOLVED, and it is *shipped*, not a proposal.** Galerina's
  `verifySubstrate()` already fires `SPORE-SUBSTRATE-001` when a `Crypto`/`Hash`/`Sign` effect sits on
  `lane: noisy`. `.tmf` crypto (TMX-256, ML-DSA, ML-KEM, Ascon) is declared `lane: digital` and inherits
  the check for free. *Provenance integrity (the signed digest) ≠ value reproducibility.*
- **#13 engine placement → RESOLVED: mirror the FFSM bridge pattern.** `.tmf`/TritMesh DB are
  capability-bounded backends wrapped *outside* the runtime; pure-TS/`.spore` governance contract in
  `packages-galerina/`; heavy byte/Keccak/lattice work via a vetted library in an isolated execution layer;
  declared `lane: digital`. *Govern it, don't absorb it.*
- **Confidentiality (#1 ML-KEM param, #5 KDF, #6 ZK) → DEFERRED.** Integrity + Authenticity ship first
  (TMX-256 root + `BridgeManifest` Ed25519→ML-DSA-65). ML-KEM-768 / Ascon / ZK are inactive placeholders
  until an enterprise multi-tenant-confidentiality requirement demands them.
- **#3 key custody → reuse the shared idiom:** `BridgeManifest`/`BridgeAttestation` + Ed25519→ML-DSA-65,
  custody gated on Galerina #34/#107-109. One signing mechanism across `.tmf` and FFSM, not two.

The items below remain genuinely open (format/encoding + validation refinements).

## Crypto / PQC

1. **ML-KEM parameter set.** ML-KEM-512 / 768 / 1024 trade size vs. margin.
   → *Default:* **ML-KEM-768** (NIST Level 3), hybrid with **X25519**. Matches ML-DSA-65's level.
2. **Signature transition shape.** Pure ML-DSA-65 vs. **hybrid Ed25519 + ML-DSA-65**.
   → *Default:* **hybrid** until the FIPS-204 library is vetted and key custody is solved; secure
   if either half holds. Mirrors Galerina's posture.
3. **Where do keys live (custody)?** This is Galerina's actual blocker (#34) and ours too: signing
   keys, ML-KEM recipient keys, key rotation, revocation.
   → *Default:* keys **outside** any `.tmf`; reference by `key_id`; rotate per period
   (`tmf-key-YYYY-MM`); publish public keys via the Trust Capsule / a keys endpoint. **No private
   key ever in the container or repo.** Needs a written custody spec before signing ships.
4. **FIPS scope.** FIPS-certifiable only, or allow non-FIPS speed primitives (KT256/BLAKE3) as
   opt-in profiles?
   → *Default:* **FIPS default (SHAKE256/ML-KEM/ML-DSA/Ascon) + non-FIPS opt-in profiles**,
   never implied faster without a benchmark.
5. **KDF choice.** SHAKE256-as-KDF vs. **KMAC256** (SP 800-185) vs. HKDF-SHA-256.
   → *Default:* **KMAC256** (purpose-built keyed KDF, FIPS-approved, domain-separated).
6. **Is ZK-SNARK in scope for v0?** Groth16 (per-circuit trusted setup, tiny proofs) vs. Plonk
   (universal setup) vs. defer.
   → *Default:* **defer to opt-in**; it's a privacy add-on, not core integrity, and carries
   trusted-setup + proving-cost baggage. Revisit if blind-query is a hard requirement.

## Format / encoding

7. **Trit packing density.** 2-bit/trit (4 trits/byte, fast random access, 25% waste) vs. **5
   trits/byte** (`3⁵=243`, ≈1% waste, needs divmod to index).
   → *Default:* support **both as encodings**; pick per modality. Don't bake one into the container.
8. **Payload codec coupling.** The notes hard-code 9-byte NVFP4 micro-blocks. Should the
   container mandate NVFP4?
   → *Default:* **No.** TMX hashes opaque payload bytes; modality selects a codec (NVFP4 is one
   option among many). Keeps the format general and the integrity layer codec-agnostic.
9. **Fixed 1 KB wire cells** (`3.md`) vs. variable length-prefixed sections.
   → *Default:* variable, length-prefixed for storage; a fixed-cell *wire* profile can be a
   transport optimization later (it trades padding waste for branch-free parsing).
10. **TVCID canonical encoding.** `[X,Y,T]` as three `i32`? a 16-byte 64-trit address? signed
    ranges? This affects coordinate-range queries and the leaf bytes.
    → *Default:* opaque length-prefixed bytes in TMX; pick a canonical TVCID codec in a separate
    data-model note so leaf vectors stay stable.

## Substrate / honesty guardrails

11. **The crypto-on-deterministic-core rule** — adopt as a hard, enforced contract
    (`Crypto`/`Hash`/`Sign` effect ⇒ `lane: digital`)?
    → *Default:* **Yes, binding.** It's the one durable insight; it keeps the aspirational
    photonic track from ever weakening the trust gate.
12. **Self-healing** — keep at all?
    → *Default:* only as an **availability** feature for **non-trust** data, strictly outside the
    verification gate, and any repaired byte must re-verify against the signed root or be rejected.
13. **Implementation language.** A `.tmf`/crypto engine needs byte buffers + a Keccak permutation
    + lattice math. The Galerina issues record this is **not expressible in `.spore` today** (no byte
    buffers / bitwise / crypto effect). So: where does the engine live?
    → *Open fork for you.* Options: (a) Rust/`libtmf_core` engine governed by `.spore` (the boundary
    notes' original intent); (b) wait on Galerina gaining a `bytes`/`crypto` capability and keep the
    engine spec-only/Blocked; (c) some FFI/`compute{}` boundary. This is a real decision — I did
    not assume it. (Recorded because it gates any executable v0.)

## Validation / proof

14. **Cross-language conformance vectors.** Beyond the TMX vectors shipped, do we want KEM-DEM and
    signature test vectors too?
    → *Default:* yes once a vetted lib is chosen — generate KAT-style vectors so independent
    implementations can interoperate.
15. **Formal property to prove first.** Candidate: "no substrate failure mode and no `unknown`
    verdict can produce an `allow`" (already proved in Galerina's K3 model) — restate it for the
    `.tmf` verifier as the headline guarantee.
    → *Default:* adopt that as the v0 security theorem.

---

*If you answer nothing, I proceed on the defaults above for anything I build next. The only one I
will not silently default is #13 (engine language) — that's yours to call.*
