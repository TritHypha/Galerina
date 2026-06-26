<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/RESEARCH-PHASE-photonic-signing-and-trust-capsule.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: (this archive copy is the primary KB home)  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# R&D Phase — Photonic-Era Signing & the Governed Trust Capsule

> **Status:** research-phase charter (draft, 2026-06-16). **Posture (binding, inherited from
> `ENCRYPTION-RND-FULL-BRIEF.md`):** grounded, cited, adversarially verified; honest-core vs aspirational
> kept strictly separate; **no performance number without a reproducible benchmark + the machine it ran on**;
> **no invented crypto** (FIPS/NIST/RFC/peer-reviewed primitives only); fail-closed (`unknown → deny`).
> **Boundary:** R&D-only; production repo (`Galerina/packages-galerina`) and the product repo
> (`Galerina-TritMesh`) are off-limits unless the owner lifts the gate.
> **Builds on:** `tmf/spec/signature-custody-v0.md` (TASK 2 / #34 hybrid sig), `ENCRYPTION-RND-FULL-BRIEF.md`
> §3 (crypto-on-core), §5.3 (custody), §10 (two crypto paths).
> **REUSE — your own prior output (do not re-derive):** `Galerina-TritMesh/TritMesh/research/encryption-on-photonic-substrates.md`
> already proves the crypto-on-core verdict for the *encryption* sibling: §2.1 (hardware: analog optics ≈4–8 ENOB,
> error-tolerant by design) + §2.2 (crypto: lattice math is exact-modular, fail-closed) + §4 (the per-stage
> analog-eligible? table) + §5.2 (photonics' one honest home = the ANN layer, *outside* the trust gate). Signing
> is the **same two-argument proof applied to ML-DSA instead of ML-KEM** — *cite that note's §2/§4/§5, don't
> rebuild them.* Spend the effort on what's genuinely new here: Lane B (QDS), the Trust Capsule spec, the
> JWT/COSE comparison, and the adversarial fail-open pass.

---

## 0. The driving question, and the honesty line

**"Is there a new way of *signing* using photonics?"**

Answer up front, so the phase doesn't chase a ghost:

- **As the trust primitive that computes the signature: NO.** A digital signature requires bit-exact,
  deterministic, error-free arithmetic (one flipped bit ⇒ a different signature ⇒ verification fails). Analog
  photonics is ~≤10-bit and error-tolerant — the *same precision-wall-vs-avalanche* argument that already
  rejected "photonic SHA-256." A photon does not, and cannot, *be* the signature. Claiming otherwise is the
  "invented crypto" trap (honesty ledger, brief §8).
- **As something *around* signing, or a genuinely different signing model: YES — four real lanes,** ranked by
  feasibility below. The point of this phase is to investigate them honestly and to ship the one near-term
  artifact that actually uses the digital primitive correctly while exploiting photonics where it is real:
  the **Governed Trust Capsule**.

**The bar any "new way of signing" must clear** (this is why the primitive stays digital):
EUF-CMA unforgeability · public verifiability · non-repudiation · no trusted-channel requirement ·
PKI-compatible · bit-exact deterministic verification.

---

## 1. The four research lanes (honest survey + Galerina mapping)

### Lane A — Photonic-*accelerated* lattice signing (the earnable performance angle)
ML-DSA / NTRU signing is dominated by polynomial / matrix arithmetic (NTT, matmul). A photonic matrix-multiply
unit could, in principle, accelerate the **linear** part — *exactly* the LightHash/HeavyHash pattern (offload
the linear matmul, keep the exact/nonlinear part digital). **The result must be re-quantized to exact integers
and the signature re-verified digitally** — photonics is an accelerator behind a deterministic checkpoint, never
the trust boundary.
- **What would make it real:** a reproducible benchmark (with the machine) showing photonic-accelerated signing
  *net* faster than the digital baseline **after** re-quantization + digital re-verify overhead.
- **Honest risk:** re-quantization + error-correction overhead may eat the gain (the LightHash lesson — the
  win is only ever on the bulk linear op). May be a wash for ML-DSA-65 sizes.
- **Galerina role:** governance + the deterministic re-verify gate; the accelerator lives strictly outside it.

### Lane B — Quantum Digital Signatures (QDS / MDI-QDS) — the genuinely photonic signing model
A *different* signing paradigm: information-theoretically-secure signatures from quantum states (photons),
not computational hardness. Real academic field — Gottesman–Chuang (2001), measurement-device-independent QDS,
and fiber/free-space demonstrations.
- **Why it's the honest "photonic signing":** the security comes from quantum mechanics (no-cloning), not from
  a number-theoretic problem — so it's not Shor-breakable and not "invented crypto."
- **Honest blockers (why it's track-not-build):** needs quantum channels / specialized hardware; tiny
  throughput; **no public-key infrastructure** (relies on pre-distributed quantum-correlated key material);
  verification semantics differ (transferability/repudiation bounds, not classical non-repudiation).
- **Galerina role:** a future Tier-B "strong / slow / cold-path" signing lane (brief §10 Path B). **Track the
  literature + define the governance interface; do not build** until hardware + a PKI story exist.

### Lane C — Optical-PUF physical authenticators ("signing by physical possession")
A PUF challenge-response is a form of authentication by an unclonable physical device — a "physical signature."
- **Real + complementary:** binds a Trust Capsule to specific hardware (sender-constrained, non-exportable).
- **What it is NOT:** a digital signature — no public verifiability without an enrollment database, **ML-model
  attacks** mean it is not sole custody, and it gives no classical non-repudiation.
- **Galerina role:** defense-in-depth **hardware binding under** the digital hybrid signature, never replacing it.

### Lane D — QRNG for hedged-signing randomness + key generation
FIPS-204 hedged signing and keygen need entropy; QRNG supplies quantum entropy. Real but peripheral — an
entropy source *outside* the cipher (brief §3). Already in scope; listed for completeness.

**Feasibility ranking:** A (benchmarkable now) > D (already real) > C (real, complementary) > B (track only).

---

## 2. The near-term deliverable — the Governed Trust Capsule (bests JWT/COSE)

A token/credential format that fixes JWT's known flaws using the **digital** primitive, with photonics only
where it is real. Ship it as a **profile of CWT/COSE (RFC 8392/8152)** to inherit ecosystem trust rather than a
from-scratch wire format.

| JWT flaw | Trust Capsule fix (pieces already exist) |
|---|---|
| `alg:none`, RS256↔HS256 alg-confusion | Algorithm fixed by the verifier + bound under the signature; verifier never dispatches on an attacker-controlled `alg` |
| JSON/base64url canonicalization ambiguity | Length-prefixed canonical encoding (`.tmf` `LP()`) |
| No post-quantum | Hybrid Ed25519 + ML-DSA-65 + per-surface FIPS-204 domain-separation context (#34, built) |
| No channel/replay binding | AAD-committing bind of audience ‖ epoch ‖ channel ‖ purpose (`.tmf` 36-byte AAD context) |
| Coarse ambient claims | Capability-scoped, deny-by-default claims (Galerina model); macaroon-style attenuable caveats |
| Whole-token disclosure | TMX inclusion proofs for selective disclosure |
| Silent-accept readers | Fail-closed reader; K3 three-valued verdict (allow/deny/**unknown→deny**) |
| (new) hardware binding | **Optical-PUF** sender-constraint (Lane C, optional, defense-in-depth) |
| (new) entropy | **QRNG** nonces/ephemeral keys (Lane D) |
| (new) fast attribute policy | **Photonic-ANN** attribute matching at the trusted endpoint, post-decrypt+re-verify only |

**Threat model to write:** token theft/replay, alg-confusion, downgrade, PUF-modeling, endpoint compromise,
quantum adversary (harvest-now-forge-later), and the embedding-inversion (vec2text) constraint on any attribute
vector carried in the capsule (encrypt in transit; match only at the trusted end).

---

## 3. Honest ledger — explicitly rejected (do not revisit without new physics)
- A photonic/analog computation that *is* the signature (precision wall vs the unforgeability bar).
- "The photon signs it" framing; any non-vetted/hand-rolled scheme.
- Photonic signing presented with a performance claim and **no** reproducible benchmark + machine.

---

## 4. Acceptance criteria (what makes each lane "real")
- **Lane A:** a runnable bench (with the machine) — photonic-accelerated sign **net** faster than digital after
  re-quantization + a passing digital re-verify; if it's a wash, say so and stop.
- **Lane B:** an honest survey table — security model, hardware assumptions, throughput, PKI gap — + a defined
  Galerina governance interface; no build.
- **Lane C:** a PUF-binding spec sketch + a modeling-attack analysis stating it is defense-in-depth, not sole.
- **Trust Capsule:** a byte-precise spec sketch as a COSE/CWT profile + golden vectors (deterministic parts;
  real-crypto via `@noble` bench) + the JWT/COSE comparison + an adversarial review pass (fail-open hunt).

---

## 5. File map / where this connects
- This doc — the phase charter.
- `Galerina-TritMesh/TritMesh/research/encryption-on-photonic-substrates.md` — **enc-rnd's own** encryption-side
  crypto-on-core proof; the signing case reuses its §2/§4/§5 verbatim-in-spirit (see the REUSE banner above).
- `tmf/spec/signature-custody-v0.md` — the digital hybrid sig the Capsule signs with (#34).
- `tmf/spec/tmf-container-v0.md` / `tmf-encryption-v0.md` — the container + AEAD the Capsule reuses.
- `ENCRYPTION-RND-FULL-BRIEF.md` §3 (crypto-on-core), §5.3 (custody), §10 (two paths).
