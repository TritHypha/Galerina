<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tri-encription/FINDINGS-AND-ROADMAP.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-tmf-engine.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-tmf-engine.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Tri-Encryption R&D — Findings to Date & Roadmap

> **Status:** Consolidated checkpoint. **Date:** 2026-06-16. **Posture:** grounded, cited, adversarially
> verified; honest-core/aspirational split maintained; no performance number without a reproducible
> benchmark + the machine it ran on.
> **Scope:** quantum-resilient, zero-trust, tri-logic **encryption (confidentiality)** for the `.tmf` /
> photonic-Galerina ecosystem. This is R&D scratch (`C:\wwwprojects\Galerina-R-AND-D\tri-encription\`), not a
> production repo and not the Galerina/TritMesh monorepos.
> **How to read:** §1 is the one-screen summary; §2 lists the artifacts; §3–6 are the findings; §7 is the
> roadmap; §8 is the decisions that are the owner's to make.

---

## 1. Executive summary

The question driving this work: *given the Galerina governance lessons, what can encryption actually look like
on a photonic/ternary substrate for `.tmf`, and is the ecosystem's design honest?*

The through-line across every finding is **crypto-on-core** (`SPORE-SUBSTRATE-001`): cryptography must run
**bit-exact on a deterministic digital core**; photonics and tri-logic have real but *bounded* roles around
it, never inside it. Five verdicts, all adversarially stress-tested:

| # | Finding | Verdict | Doc |
|---|---|---|---|
| 1 | **Confidentiality is genuinely missing** — Galerina/`.tmf` sign + integrity-check but do **not** encrypt. | **ADD** KEM-DEM/HPKE: ML-KEM-768 (hybrid X25519+ML-KEM during transition) → SHAKE/HKDF → AES-256-GCM / streaming AEAD, layered **under** the TMX-256 + ML-DSA-65 gate, verify-before-decrypt, fail-closed. | [research/quantum-resilient-tri-encryption.md](research/quantum-resilient-tri-encryption.md) |
| 2 | **Is there a "photonic SHA-256"?** | **No, and there shouldn't be.** Analog optics is ≤~10 bits / error-tolerant; hashing needs zero-error bit-exactness. Digest stays digital; photonics = QRNG (entropy), optical-PUF (device root-of-trust), optical-LSH (addressing) — all *outside* the hash, re-verified. SHA-256 is already Grover-safe. | [research/photonic-sha256-integrity.md](research/photonic-sha256-integrity.md) |
| 3 | **Where does tri-logic belong?** | **The governance / key-release gate** (proven fail-closed, `collapse(0)=deny`), never the cipher. The only honest "trit in the crypto" is adopting **NTRU/ML-KEM**, whose polynomials are already balanced-ternary — computed exactly and digitally. Do **not** invent an analog-trit cipher. | both docs above |
| 4 | **"Self-healing" under zero-trust** | **Erasure coding (Reed-Solomon) outside the gate + re-verify against the signed root, fail-closed** — never the notes' in-cache convolution (which fabricates unsigned data and is an in-gate attacker target). | [research/SPORE-AMD-024-tmf-confidentiality.md](research/SPORE-AMD-024-tmf-confidentiality.md) |
| 5 | **Can routers filter on the semantic attribute layer without leaking content?** | **No.** A cleartext embedding on the wire ≈ shipping the plaintext (vec2text recovers ~92% of short text exactly). No leak-free in-network semantic routing exists. **Metadata minimization** (encrypt the attribute vector, filter at trusted endpoints) is the answer — this **kills the notes' "firewalls filter on meaning" headline feature**. | [research/metadata-confidentiality.md](research/metadata-confidentiality.md) |

These were validated two ways beyond the literature: a **measured TypeScript benchmark + test suite**
([`bench/`](bench)) over the real `@noble` PQ primitives, and a **runnable Galerina clone** of the governance
gate ([`spore/`](spore)) that type-checks and executes on the real compile→WASM path.

---

## 2. The artifacts

| Artifact | What it is | State |
|---|---|---|
| `research/quantum-resilient-tri-encryption.md` | The confidentiality design + KEM-DEM rationale + tri-logic-in-both-layers | **Done** |
| `research/photonic-sha256-integrity.md` | The "photonic SHA-256?" verdict (no) + the honest photonic integrity architecture | **Done** |
| `research/metadata-confidentiality.md` | The attribute-layer leakage verdict + metadata-minimization recommendation | **Done** |
| `research/SPORE-AMD-024-tmf-confidentiality.md` | The ratified `.tmf` confidentiality blueprint (container, pipeline, STREAM, erasure self-heal) | **Done; now promoted to the byte-precise oracle spec `../tmf/spec/tmf-encryption-v0.md`** |
| `bench/` | TS reference benchmark + 10 correctness tests over `@noble` ML-KEM/ML-DSA/AES/SHA/RS + TMX/K3 reference impls | **Done; runs, 10/10 green** |
| `spore/k3-gate.spore` (+ `spore/README.md`) | The K3 governance + verify-before-decrypt **decision** layer in real Galerina | **Done; `galerina check` clean, runs on WASM** |
| This file | Consolidated findings + roadmap | **Done** |

---

## 3. Findings in detail

### 3.1 Confidentiality is missing — add KEM-DEM (verdict 1)
Galerina ships **hashing (SHA-256/512) + signing (Ed25519 today, ML-DSA-65 planned)** and a strong key-custody
model (HSM/KMS, `KeyHandle`/`ProtectedSecret`, constant-time, scoped vaults), but **no working encryption**;
the `.tmf` notes likewise specify integrity (TMX-256) + authenticity (ML-DSA-65) and **no confidentiality
primitive**. The fix is the standards-only **KEM-DEM / HPKE** stack (NIST SP 800-227, RFC 9180): **ML-KEM-768**
(NIST level-3, matching ML-DSA-65), hybrid **X25519+ML-KEM-768** during the PQC transition, → **HKDF/SHAKE256**
→ **AES-256-GCM** (single-shot) / **segmented STREAM AEAD** (media), with append-only `+1` history via
per-epoch key rotation and crypto-erasure. Quantum risk is correctly scoped to **harvest-now-decrypt-later** →
PQ KEM from day one.

### 3.2 No photonic SHA-256 (verdict 2)
Four readings, all tested: **analog optical** hashing is impossible (precision wall vs avalanche);
**digital-optical** is possible in principle but exotic with no advantage; **"optical hashes"/PUFs** are
physical/approximate, not collision-resistant (some provably learnable); the real artifact (**LightHash/
HeavyHash**) keeps Keccak digital and only offloads the linear matmul. SHA-256 is already Grover-acceptable, so
a photonic hash buys nothing. The honest "photonic version" of integrity is an **architecture**: digital
digest + ML-DSA-65 signature, with photonics confined to **QRNG entropy**, **optical-PUF device root-of-trust**,
and **optical-LSH non-trust addressing** — outside the hash, re-verified.

### 3.3 Tri-logic in both layers (verdict 3)
- **Governance/key-release (the earned home):** Galerina's strong-Kleene K3 calculus is *proven* fail-closed
  (`authorize(v) ⇔ v=+1`, No-Coercion theorem); the gate decides *whether* a key releases. Cloned and running
  in `.spore` (§5).
- **Trit-native crypto (research track):** balanced ternary already lives inside PQ crypto (NTRU's ternary
  polynomials; Kyber's small signed CBD noise) — but computed **exactly and digitally**. An analog-trit cipher
  would be unvetted, crypto-on-core-violating, and "inventing crypto" — rejected.

### 3.4 Self-heal reconciled (verdict 4)
The notes' neighbourhood-convolution self-heal **fabricates unsigned data, can't apply to ciphertext, and is
an in-gate attacker target.** Replaced by **Reed-Solomon erasure coding on ciphertext, outside the trust gate,
with mandatory re-verification against the ML-DSA-65-signed TMX root** — mismatch ⇒ verdict `0` ⇒ fail closed.
Validated by the `bench/` self-heal test (recover → re-verify → forged-repair-fails-closed).

### 3.5 Metadata confidentiality (verdict 5) — the sharpest one
The `.tmf`/TUFC "routers filter on the cleartext semantic attribute layer" feature **does not survive a
zero-trust review.** Cleartext embeddings are reconstructable to near-plaintext (vec2text ~92% exact;
ZSinvert 2025: *"sharing embeddings ≈ sharing the documents"*); every encrypted-search alternative
(SSE/OPE/encrypted-ANN) leaks and isn't line-rate; FHE/FE/PIR are 4–9 orders too slow *and* invert zero-trust.
The established pattern (ECH/OHTTP/Tor/RFC 6973) is the opposite — route on opaque transport, filter at
trusted endpoints. **Recommendation: encrypt the attribute vector inside the payload; expose only
integrity/authenticity metadata; filter at trusted endpoints.** (Resolves SPORE-AMD-024 Open Question #2.)

---

## 4. Engineering validation (`bench/`) — measured

Audited pure-JS `@noble` stack (the same `@noble/post-quantum` the Galerina compiler depends on), on **Intel
i9-9900K @ 3.6 GHz, Node v24, win32 x64**. **All 10 correctness tests pass** (KEM-DEM round-trip, tamper/AAD
fail-closed, STREAM truncation/reorder/tamper fail-closed, K3 tables, TMX position-binding, RS exhaustive
recovery over 1,471 erasure patterns, self-heal re-verify, verify-before-decrypt ordering).

Selected measured numbers (pure-JS reference, **not** native/WASM, **not** a `.tmf` engine, **not** photonic):
ML-KEM-768 keygen/encaps/decaps ≈ 2,500 / 2,100 / 1,700 ops/s; ML-DSA-65 sign/verify ≈ 114 / 505 ops/s;
SHA-256 ≈ 210 MB/s; AES-256-GCM ≈ 38 MB/s (a pure-JS *floor*; **measured native AES-NI = 1,273 MB/s, 34×**, same machine); RS encode/recover
≈ 159 / 248 MB/s. **Byte constants validated at runtime** (corroborating SPORE-AMD-024): ML-KEM-768 ct = 1088 B,
hybrid ct = 1120 B, ML-DSA-65 sig = 3309 B, shared secret = 32 B.

Two honesty issues self-caught: the strict test found a `negTrit(0)` → `-0` bug (fixed); and a first
benchmark line that mislabelled ~49 KB of work as 1 MiB (TMX "284 MB/s") was corrected to the honest 21 MB/s.

---

## 5. Galerina dogfooding (`spore/`) — runs on WASM

The **K3 governance gate + verify-before-decrypt decision** is cloned in real `.spore`, **`galerina check` →
0 errors / 0 warnings**, and **executes on the compile→WASM path** with correct outputs across the battery
(`collapse(0)=-1`; `keyRelease(1,1,1)=1`; `(1,1,0)/(0,1,1)/(1,0,1) = -1` fail-closed; Kleene min/max/neg; TMR
median). The **crypto math is honestly Blocked** in `.spore` (no byte buffers / bitwise / crypto — galerina-issues
0002/0003); it stays the engine layer. *Galerina governs; the engine computes.*

**Three dogfooding findings** (candidate `galerina-issues`, staged in `spore/galerina-gaps-candidate-issues.md`, not
filed into the off-limits TritMesh repo): (1) `governance` is a reserved word and can't be a parameter name
(diagnostic doesn't say why); (2) `secure flow main` (with `console.log`) isn't in the WASM `--invoke` surface;
(3) CLI Bool args silently mis-marshal — `true`/`false` strings become `false`, so a wrong-but-plausible
argument silently fails closed instead of erroring. **Status (re-verified 2026-06-16): (1) ✅ FIXED** (clear
reserved-keyword diagnostic shipped) · **(3) ✅ FIXED** (`true`/`false` now marshal correctly) · **(2) ⏳ OPEN**.

---

## 6. Cross-cutting

- **Crypto-on-core (`SPORE-SUBSTRATE-001`) independently re-derived** from both the photonic-hashing literature
  and the lattice/encryption literature — it's what the physics and the real systems both confirm.
- **Honest-no-overreach maintained throughout.** Flagged and rejected: "12.5M RPS / sub-0.01 ms / single
  clock cycle," in-cache self-heal, NVFP4-payload-in-a-"ternary"-file incoherence, "store a 0 in 0 bits" vs
  fixed-width contradiction, "photonic SHA-256," and `galerina-substrate-mytri` (a rejected/fictional package).
- **One KB contradiction found — now corrected (2026-06-16):** `galerina-hardware-future-substrates.md`'s
  "Encryption → Photonic matrix operations" line contradicted `SPORE-SUBSTRATE-001`; it now reads "Always CPU
  (deterministic core)" with a note crediting this track's verdict 2 (verified at the primary source). I did
  not edit the Galerina repo myself.
- **Recon of `C:\wwwprojects\x`** (8 cloned repos): none contain photonic crypto/hashing/PUF; they corroborate
  the precision-limits evidence (esp. McMahon-lab single-photon NN) but don't advance the integrity question.

---

## 7. Roadmap

Status labels: **Pending** (awaiting owner go) · **Next** (queued, high value) · **Mid** · **Research/Later**.

### Pending (awaiting your decision)
- **Fold the metadata amendment into SPORE-AMD-024** — mark §2's attribute layer *encrypted-in-payload*, add the
  option matrix (a/b/c/d), and the cleartext-metadata-minimization note. *(Resolves Open Question #2.)*
- ✅ **DONE — `galerina-hardware-future-substrates.md` corrected** (2026-06-16): the "Encryption → Photonic"
  line is now "Always CPU (deterministic core)," crediting this track's verdict 2. Verified at the primary source.
- **File the remaining Galerina dogfooding finding** (§5) as a `galerina-issue` — GAP-1 + GAP-3 fixed (re-verified
  2026-06-16); only **GAP-2** (`secure flow main` not in `--invoke`) remains. Owner chooses where (TritMesh repo
  is off-limits to me).

### Next (queued, high value)
- ✅ **DONE — Confidentiality layer promoted to a byte-precise oracle spec** (`../tmf/spec/tmf-encryption-v0.md`
  + `gen_tmf_encryption.py`): 3 orthogonal selectors, SHAKE256 DEM KDF, AAD-committing AEAD (binds `H(K_aead)`
  — closes the SPORE-AMD-024 §4 key-commitment gap), 36-B AAD context (resolves Q5), STREAM nonce; adversarially
  verified. Honest scoping caught: AAD-binding is substitution-hardening, **not** a full CMT-1 proof for GCM.
- ✅ **DONE — Bench KDF reconciled to SHAKE256** (was HKDF-SHA256): `bench/lib/kemdem.mjs` now matches the
  spec; `npm test` still 11/11, and `bench/oracle-check.mjs` confirms the JS (`@noble`) and Python (stdlib) DEM
  key schedules are **byte-identical** (`K_aead 9b4fdce2…`, `key_commit bc8eee3b…`) — oracle airtight across both.
- ✅ **DONE — Native-WebCrypto AES comparison** (`bench/aes-native-vs-purejs.mjs`): native AES-NI AES-256-GCM
  = **1,273 MB/s vs 37 MB/s pure-JS (34×)** on the i9-9900K — confirms the AEAD is not a system bottleneck and
  grounds the AES-256-GCM-default decision.
- **Metadata-minimization design** (if in-network routing is pursued at all): coarse-tag bit-budget /
  k-anonymity floor / keying cadence / padding, **plus** a measured endpoint-filtering throughput cost so the
  trade-off is explicit.

### Mid
- ✅ **DONE — Higher-assurance + fallback profiles (Phase 3):** `0x03` ML-KEM-1024 / `0x04` hybrid P-384+
  ML-KEM-1024 + sig {ML-DSA-87, SLH-DSA-256s}, sizes runtime-measured (`bench/profile-l5-sizes.mjs`); specced in
  `tmf/spec/tmf-encryption-v0.md` §2.1 + `signature-custody-v0.md` §3/§5.
- ✅ **DONE — End-to-end `.tmf` section round-trip measurement** (`bench/section-roundtrip.mjs`, composition not
  "RPS"): L3 ~27 ms, L5+ML-DSA-87 ~43 ms, L5+SLH-DSA-256s ~5.3 s (cold-path sign).
- ✅ **DONE — Phase 4 (Storage & query) design** (`../tmf/research/storage-and-query-v0.md`) + measured HNSW recall
  (`bench/hnsw-recall.mjs`); **Phase 5 (rich-media codecs)** (`../tmf/spec/tmf-modalities-v0.md`).
- ✅ **DONE — Expanded the `.spore` governance clone** (`spore/k3-policy.spore`): `allOf`/`anyOf` Kleene policy
  composition (empty → unknown, no vacuous allow) + the `authorizeRead`/`egressRedact` egress seam encoding
  verdict 5 as runnable `.spore`; `galerina check` clean, every flow `--invoke`-verified on WASM. Surfaced GAP-4
  (CLI marshals `List<Int>` as a scalar) and confirmed GAP-1/GAP-3 fixed, GAP-2 improved.
- **Hybrid-KEM packaging** in the fixed-width `.tmf` layout (SPORE-AMD-024 open question).

### Research / Later (labelled, not promised)
- **FHE for encrypted similarity** over attribute vectors — digital research track only; never line-rate.
- **Photonic ANN benchmark** — the *only* place a photonic perf claim could be earned (outside the trust gate),
  gated behind a reproducible benchmark + the machine.
- **Digital-ternary NTRU/ML-KEM backend** — an optimization, not a security feature.

---

## 8. Open decisions for the owner (forks I should not make unilaterally)

1. **In-network semantic routing: keep it or drop it?** The metadata verdict (verdict 5) says a cleartext
   embedding can't stay. Either drop in-network semantic filtering (filter at trusted endpoints — the safe
   default) or accept a *measured* confidentiality loss via a coarse keyed routing tag. This is a product call.
2. **Apply the SPORE-AMD-024 metadata amendment now**, or hold it pending the routing decision above.
3. **Where to file** the Galerina dogfooding findings and the `future-substrates:63` correction (both touch
   repos that are off-limits to me).
4. **Profile scope:** ship only `0x01`/`0x02` now, or add the `0x03`/SLH-DSA assurance tier in this pass.

---

## 9. Artifact index

- Research: [`research/quantum-resilient-tri-encryption.md`](research/quantum-resilient-tri-encryption.md) ·
  [`research/photonic-sha256-integrity.md`](research/photonic-sha256-integrity.md) ·
  [`research/metadata-confidentiality.md`](research/metadata-confidentiality.md)
- Blueprint: [`research/SPORE-AMD-024-tmf-confidentiality.md`](research/SPORE-AMD-024-tmf-confidentiality.md)
- Engineering: [`bench/`](bench) (`npm install && npm test && npm run bench`) · [`bench/README.md`](bench/README.md)
- Galerina clone: [`spore/k3-gate.spore`](spore/k3-gate.spore) · [`spore/README.md`](spore/README.md)
- Adjacent context (not in this folder): the companion `encryption-on-photonic-substrates.md` in the
  Galerina-TritMesh repo; the FFSM workstream (`Galerina-R-AND-D/FFSM/`, task #199) whose "sign `sha256(output)` on
  the deterministic core" mechanism is consistent with verdict 2.
