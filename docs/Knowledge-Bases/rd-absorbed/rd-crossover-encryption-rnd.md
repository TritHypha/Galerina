<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/CROSSOVER-encryption-rnd.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: galerina-tmf-engine.md  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. Curated/integrated view: `galerina-tmf-engine.md`. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# CROSSOVER — Encryption R&D (merged): `.tmf` spec track ⊕ tri-encryption track

> **Status:** Merge / unified entry point. **Date:** 2026-06-16. **Posture:** grounded, cited,
> adversarially verified; honest-core/aspirational split maintained; no performance number without a
> reproducible benchmark + the machine it ran on.
> **Why this exists:** two sessions were doing the *same work* (quantum-resilient, zero-trust, tri-logic
> encryption for the `.tmf` / photonic-Galerina ecosystem) from the **same source notes**. This document
> merges them: one findings set, one hard-path index, one roadmap, one list of open decisions. The
> underlying docs stay where they are — this **indexes and reconciles** them, it does not move them.
> **Off-limits (unchanged):** the `C:\wwwprojects\Galerina-TritMesh` product repo and
> `C:\wwwprojects\Galerina\packages-galerina` production code — R&D only until the owner says otherwise.

---

## 1. The two tracks, and how they relate

| Track | Folder | Emphasis | State |
|---|---|---|---|
| **`.tmf` spec track** | `C:\wwwprojects\Galerina-R-AND-D\tmf\` | Byte-precise **format** + **integrity/authenticity** + reference vectors | spec-complete (signing Blocked on a vetted lib) |
| **tri-encryption track** | `C:\wwwprojects\Galerina-R-AND-D\tri-encription\` | **Confidentiality** design + **measured benchmark** + **runnable `.spore`** governance + threat literature | done; verified 10/10 + `galerina check` clean |

**Same root, complementary growth.** `notes/1.md · 2.md · 3.md` are **byte-identical** across both
folders (md5 match) — both tracks started from the same aspirational source material and corrected it the
same way. The split is purely in the research/spec layers, and it is **complementary, not contradictory**:
the spec track produced the byte-exact container + signature/custody the confidentiality track *refers to*
but doesn't fully specify; the confidentiality track produced the encryption layer the spec track *deferred*,
plus a measured benchmark and a runnable governance clone the spec track only specified on paper.

**Adjacent R&D at the parent** (`C:\wwwprojects\Galerina-R-AND-D\`), referenced but not merged here:
`FFSM\` (governed `ffsim` quantum-sim bridge, task #199 — same attestation idiom), and
`photonic-tri-governance\` (the three-valued K3 / Direction-A governance the tri-encryption `.spore` clone
exercises).

---

## 2. Verification status (cross-checked 2026-06-16)

Both tracks' artifacts were re-run, not trusted:
- **`.tmf` generators** run clean and are **cross-consistent** — the container's `integrity_root`
  `43386e64…685212` equals the TMX root by construction.
- **tri-encryption bench**: `node --test` → **10/10 pass**, real `@noble` primitives (not stubs), byte
  constants match (ct=1088, hybrid=1120, ML-DSA-65 sig=3309, shared=32), perf honestly labelled pure-JS.
- **tri-encryption `.spore`**: `galerina check k3-gate.spore` → **0 errors / 0 warnings**; K3 + verify-before-decrypt
  semantics reproduce on the WASM path.
- **External claims**: vec2text ~92% (Morris et al.), NIST **SP 800-227** (KEMs), **RFC 9180** (HPKE) — all confirmed.
- **One claim corrected by primary-source check:** the tri-encryption doc's "KB contradiction at
  `galerina-hardware-future-substrates.md:63`" was **real when written** and has **already been fixed**
  (file note: *"Corrected 2026-06-16 … (tri-encryption R&D, verdict 2)"*). So that item is **resolved**,
  not phantom — the doc is merely stale on it. (A verification subagent over-called it "refuted"; the
  primary source shows it was a genuine catch, now actioned.)

**Bottom line:** the merged work is **real, reproducible, and honestly labelled.** Two independent
derivations of the same security core is the strongest validation available here.

---

## 3. Consolidated findings (merged)

| # | Finding | Verdict | Track / source |
|---|---|---|---|
| F1 | **Integrity** = TMX-256, a 3-ary SHAKE256 tree XOF over coordinate-bound leaves; root binds the header, never itself | ✅ verified vectors | tmf `spec/tmx-256-construction-v0.md` |
| F2 | **Authenticity** = ML-DSA-65 (FIPS 204) **over the root**; hybrid Ed25519+ML-DSA-65, AND verification | ✅ both, aligned | tmf `spec/signature-custody-v0.md` · tri `quantum-resilient-tri-encryption.md` |
| F3 | **Confidentiality** is genuinely missing in Galerina/`.tmf` → **add KEM-DEM/HPKE**: hybrid X25519+ML-KEM-768 → KDF → AEAD, **under** the TMX+ML-DSA gate, verify-before-decrypt, fail-closed | ✅ designed + benched | tri `SPORE-AMD-024-tmf-confidentiality.md`, `bench/` |
| F4 | **Crypto-on-core** (`SPORE-SUBSTRATE-001`): hashing/keying/signing stay **bit-exact on a deterministic digital core**; photonics confined to QRNG / optical-PUF / optical-LSH, outside the gate, re-verified | ✅ re-derived twice | both tracks; KB `galerina-hardware-future-substrates.md` |
| F5 | **No photonic SHA-256** — analog optics ≤~10 bits, breaks the avalanche; SHA-256 is already Grover-acceptable | ✅ | tri `photonic-sha256-integrity.md` |
| F6 | **Tri-logic belongs in the key-release *gate*** (proven fail-closed, `collapse(0)=deny`), **not the cipher**; the only honest "trit in the crypto" is NTRU/ML-KEM's exact **digital** ternary/small-signed polynomials | ✅ proven runnable | tri `spore/k3-gate.spore` · tmf `research/ternary-in-cryptography.md` |
| F7 | **No in-gate self-heal** — reconstruction inside the trust gate is forbidden; use **Reed-Solomon erasure on ciphertext, outside the gate**, re-verify vs. the signed root, fail-closed | ✅ both, aligned | tri `SPORE-AMD-024…` · tmf `encryption-architecture.md` §5 |
| F8 | **NVFP4 `Vector` codec is real** (9-byte block = 16×E2M1 + 1-byte E4M3), opt-in, **lossy → never integrity bytes**, opaque to TMX | ✅ verified vs NVIDIA source | tmf `spec/nvfp4-codec-v0.md`, `research/external-repos-analysis.md` |
| F9 | **Cleartext semantic attribute layer cannot survive zero-trust** — embeddings invert to ~plaintext (vec2text ~92%). **Encrypt the attribute vector; filter at trusted endpoints.** Kills the notes' "firewalls filter on meaning" feature | ✅ literature confirmed | tri `metadata-confidentiality.md` |
| F10 | **No fictional perf / hardware** — "12.5M RPS / sub-0.01 ms / single clock cycle", in-cache self-heal, "store a 0 in 0 bits", "photonic SHA-256", `galerina-substrate-mytri` — all rejected | ✅ both ledgers | tmf `real-vs-aspirational-ledger.md` · tri §6 |
| F11 | **Galerina dogfooding gaps** (from the `.spore` clone): `governance` reserved word (no hint) **✅ FIXED**; `secure flow main` absent from `--invoke` **⏳ OPEN**; CLI Bool args silently mis-marshal **✅ FIXED** | ✅ reproduced; 2/3 fixed (re-verified 2026-06-16) | tri `spore/galerina-gaps-candidate-issues.md` |

---

## 4. Hard-path index — every R&D document (both tracks)

### `.tmf` spec track — `C:\wwwprojects\Galerina-R-AND-D\tmf\`
**Entry / status**
- `C:\wwwprojects\Galerina-R-AND-D\tmf\README.md` — index of the `.tmf` track.
- `C:\wwwprojects\Galerina-R-AND-D\tmf\STATUS-AND-NEXT-STEPS.md` — decision brief (status snapshot + options + build forks).

**Research**
- `C:\wwwprojects\Galerina-R-AND-D\tmf\research\encryption-architecture.md` — the grounded zero-trust + PQC design (3 jobs, KEM-DEM, threat model, crypto-on-core).
- `C:\wwwprojects\Galerina-R-AND-D\tmf\research\real-vs-aspirational-ledger.md` — claim triage (REAL/ASPIRATIONAL/FICTIONAL).
- `C:\wwwprojects\Galerina-R-AND-D\tmf\research\ternary-in-cryptography.md` — the three "ternaries"; NTRU is the only ternary↔lattice link.
- `C:\wwwprojects\Galerina-R-AND-D\tmf\research\external-repos-analysis.md` — the 8 `C:\wwwprojects\x` repos (NVFP4 verified; photonic noisy).
- `C:\wwwprojects\Galerina-R-AND-D\tmf\research\findings-and-next-intentions.md` — narrative write-up + phased roadmap.
- `C:\wwwprojects\Galerina-R-AND-D\tmf\research\open-questions.md` — decision forks (ratified items resolved at top).

**Spec (byte-precise, verified)**
- `C:\wwwprojects\Galerina-R-AND-D\tmf\spec\tmx-256-construction-v0.md` — TMX-256 integrity core. **SHIP.**
- `C:\wwwprojects\Galerina-R-AND-D\tmf\spec\tmf-container-v0.md` — `.tmf` byte layout + fail-closed reader.
- `C:\wwwprojects\Galerina-R-AND-D\tmf\spec\nvfp4-codec-v0.md` — opt-in `Vector`-modality NVFP4 codec.
- `C:\wwwprojects\Galerina-R-AND-D\tmf\spec\signature-custody-v0.md` — hybrid sig block + key custody (impl Blocked); **TASK 2, #34-ready.**
- `C:\wwwprojects\Galerina-R-AND-D\tmf\spec\inclusion-proof-v0.md` — TMX-256 Merkle-path proof (selective disclosure; Phase 1c).
- `C:\wwwprojects\Galerina-R-AND-D\tmf\spec\tmf-encryption-v0.md` — **the v1 confidentiality layer** (promoted from `SPORE-AMD-024`): 3 orthogonal selectors (`kem_profile`/`aead_suite`/`dem_mode`), SHAKE256 DEM KDF, AAD-committing AEAD, STREAM nonce, fail-closed verify-before-decrypt; resolves the AAD-binding question (Q5).
- `C:\wwwprojects\Galerina-R-AND-D\tmf\spec\_vectors\gen_tmx_vectors.py` · `gen_tmf_container.py` · `gen_nvfp4_block.py` · `gen_sig_block.py` · `gen_inclusion_proof.py` · `gen_tmf_encryption.py` (+ `*.txt` outputs) — **5+ stdlib reference generators** + golden vectors (the cross-language conformance oracle).

**Source**
- `C:\wwwprojects\Galerina-R-AND-D\tmf\notes\1.md · 2.md · 3.md` — original `.tmf` material (discussion-only; ≡ tri-encryption notes).

### tri-encryption track — `C:\wwwprojects\Galerina-R-AND-D\tri-encription\`
**Entry**
- `C:\wwwprojects\Galerina-R-AND-D\tri-encription\FINDINGS-AND-ROADMAP.md` — the track's consolidated checkpoint (5 verdicts + roadmap).

**Research**
- `C:\wwwprojects\Galerina-R-AND-D\tri-encription\research\quantum-resilient-tri-encryption.md` — confidentiality design + KEM-DEM + tri-logic in both layers.
- `C:\wwwprojects\Galerina-R-AND-D\tri-encription\research\photonic-sha256-integrity.md` — "photonic SHA-256?" verdict (no) + honest photonic integrity architecture.
- `C:\wwwprojects\Galerina-R-AND-D\tri-encription\research\metadata-confidentiality.md` — attribute-layer leakage + metadata-minimization.
- `C:\wwwprojects\Galerina-R-AND-D\tri-encription\research\SPORE-AMD-024-tmf-confidentiality.md` — the `.tmf` confidentiality blueprint (container, STREAM, RS self-heal).

**Engineering (runnable, verified)**
- `C:\wwwprojects\Galerina-R-AND-D\tri-encription\bench\` — `bench.mjs`, `tmf-crypto.test.mjs`, `lib\{k3,kemdem,rs,stream,tmx}.mjs`, `README.md` (`npm test` → 10/10; `npm run bench`).
- `C:\wwwprojects\Galerina-R-AND-D\tri-encription\spore\k3-gate.spore` + `spore\README.md` — K3 governance + verify-before-decrypt, `galerina check` clean, runs on WASM.

**Source**
- `C:\wwwprojects\Galerina-R-AND-D\tri-encription\notes\1.md · 2.md · 3.md` — ≡ the `.tmf` notes (identical).

### Adjacent (not merged here)
- `C:\wwwprojects\Galerina-R-AND-D\FFSM\` — governed `ffsim` quantum-sim bridge (task #199).
- `C:\wwwprojects\Galerina-R-AND-D\photonic-tri-governance\` — three-valued K3 / Direction-A governance R&D.
- KB read for grounding: `C:\wwwprojects\Galerina\docs\Knowledge-Bases\galerina-hardware-future-substrates.md` (crypto-on-core; corrected 2026-06-16).

---

## 5. Reconciliation — alignments, divergences, gaps

### Alignments (independently re-derived → high confidence)
ML-KEM-768 hybrid KEM · ML-DSA-65 **over the root** · hybrid Ed25519+ML-DSA-65 (AND) · three-valued
fail-closed key-release gate (`collapse(0)=deny`) · **crypto-on-core** · **no in-gate self-heal** · **no
invented ternary cipher**. No contradictions found between the tracks.

### Divergences to resolve
- **D-A. AEAD cipher (the one real divergence): AES-256-GCM vs Ascon-AEAD128.** *(Corrected 2026-06-16 on
  takeover — primary-source check.)* This is a genuine **cross-track** divergence, **not** an internal
  inconsistency: the tri-encryption track is **AES-256-GCM throughout** (incl. `quantum-resilient-tri-encryption.md`
  §4 and `SPORE-AMD-024`); the `.tmf` spec track is **Ascon-AEAD128** (`encryption-architecture.md`). Both are
  FIPS-standardised and defensible — Ascon (SP 800-232): lightweight, side-channel-friendly, 128-bit, ideal
  for constrained/embedded; AES-256-GCM: 256-bit Grover headroom, AES-NI-ubiquitous (multi-GB/s on the
  deterministic core), suite-consistent with the level-3 ML-KEM-768/ML-DSA-65. **→ Resolve to a crypto-profile
  *registry*; recommended default = AES-256-GCM (`0x01`)** — `.tmf` is a data fabric on commodity/server
  hardware holding presumptively **long-lived** confidential data (harvest-now-decrypt-later wants the 256-bit
  margin; the `.tmf` track's own §2 already flags 256-bit for archival). **Ascon-AEAD128** (`0x02`) = the
  constrained/embedded profile; **ChaCha20-Poly1305** = the no-AES-NI / nonce-misuse-resistant alt. The
  default hinges on the **primary deployment target** (§7 Q1).
- **D-B. KDF (not a real conflict):** both cite a SHAKE256 KDF; KMAC256 is a named alternative.
  **→ Pin SHAKE256 + domain-separation/context strings; KMAC256 as the FIPS-friendly alt; add a
  *committing AEAD*** (bind `H(K_aead)` into AAD) — closes the key-commitment gap.
- **D-C. Self-heal wording (not a conflict):** both reject in-gate convolution and adopt RS-erasure
  outside the gate + re-verify. **→ Unify the wording so "no self-heal" isn't misread as "no availability."**

### Gaps each track fills for the other
- tri-encryption **fills** the confidentiality layer the `.tmf` track deferred, and adds **measured**
  benchmarks + a **runnable** governance clone.
- `.tmf` **fills** the byte-exact container + signature/custody the confidentiality track refers to but
  marks "non-ratified sketch."

---

## 6. Unified roadmap

Status: ✅ done/verified · 🔜 next (R&D folder) · 🚦 gated on owner go · 🔭 later · ⏸ deferred.

### Phase 0 — Foundations  ✅ DONE & VERIFIED
- `.tmf` trust-layer spec (TMX-256, container, NVFP4 codec, sig+custody) — byte-precise, verified vectors, cross-consistent.
- Confidentiality design + validation — KEM-DEM, bench 10/10, runnable K3 `.spore`.

### Phase 1 — Reconcile & complete the spec  🔜 (R&D folder)
- **Adopt the crypto-profile registry** (D-A): Ascon default + AES-256 archival; fix the tri-encryption summary.
- **KDF pin + committing AEAD** (D-B).
- ✅ **1c DONE** — Inclusion-proof (Merkle-path) wire format + verifier + golden vector
  (`tmf/spec/inclusion-proof-v0.md` + `_vectors/gen_inclusion_proof.py`): 133-B proofs reconstruct the
  published root `43386e64…`; tamper / wrong-leaf fail closed. Selective disclosure / streaming verification.
- ✅ **1d DONE** — **Confidentiality layer promoted to a byte-precise, oracle-backed spec**
  (`tmf/spec/tmf-encryption-v0.md` + `_vectors/gen_tmf_encryption.py`), the v1 layer the container deferred.
  Disentangles the `SPORE-AMD-024` `0x01/0x02` overload into 3 orthogonal selector bytes; pins the SHAKE256 DEM
  KDF, AAD-committing AEAD, 36-B AAD context (**resolves Q5**), KEM block layout (1088/1120, X-Wing order),
  and STREAM nonce — all matched to the verified `@noble` bench. Deterministic bytes reproduce in stdlib;
  KEM/AEAD bytes are labelled placeholders. Adversarially verified (4 findings, 3 fixed, 1 dismissed).
- ✅ **1e DONE** — **bench KDF reconciled to SHAKE256.** `tri-encription/bench/lib/kemdem.mjs` now uses the
  spec's SHAKE256 schedule (was HKDF-SHA256); `npm test` still **11/11**, and `bench/oracle-check.mjs` proves
  the JS (`@noble`) and Python (stdlib) DEM key schedules are **byte-identical** (`K_aead 9b4fdce2…`,
  `key_commit bc8eee3b…`) — the conformance oracle is airtight across both implementations.
- **Adopt the metadata-routing kill** (F9): update `.tmf` `encryption-architecture.md` to forbid in-network
  cleartext-attribute filtering; endpoint-side only.
- **Native-WebCrypto AES comparison in `bench/`** — show the AEAD *ceiling* (AES-NI ~GB/s) vs pure-JS floor.
- **Cleanup:** mark the KB `:63` item **resolved** in the tri-encryption docs; flag the AES/Ascon divergence
  in `FINDINGS-AND-ROADMAP.md`; close the "crypto Blocked in `.spore`" claim with a probe `.spore`.
- Confirm the open micro-decisions (§7).

### Phase 2 — Engine build: Rust `libtmf_core`  🚦 (production repo; gated on D3)
Scaffold `libtmf_core` (packed-trit, SHAKE256 via `sha3`, TMX tree, `.tmf` reader/writer) as a
capability-bounded wrapped backend, `lane: digital`; wire **vetted FIPS-204 + Ed25519** (removes the only
Blocked piece — real signing); KEM-DEM confidentiality + RS erasure outside the gate; `.spore` governance
contract in `packages-galerina`. **The Python + `@noble` vectors become the cross-language conformance oracle.**

### Phase 3 — Assurance & profiles  ✅ DONE (2026-06-16)
- ✅ **Level-5 tier** specced + size-grounded against `@noble` (`bench/profile-l5-sizes.mjs`): `kem_profile`
  `0x03` ML-KEM-1024 (ct 1568) / `0x04` hybrid **P-384**+ML-KEM-1024 (ct 1665); signature `{ML-DSA-87 (pk 2592,
  sig 4627), SLH-DSA-SHA2-256s (pk 64, sig 29792)}` AND-verified for long-lived data (Path B). Generators +
  golden vectors updated.
- ✅ **End-to-end section round-trip measurement** (`bench/section-roundtrip.mjs`, composition not RPS, i9-9900K):
  L3 ~27 ms, L5+ML-DSA-87 ~43 ms, L5+SLH-DSA-256s ~5.3 s (SLH-DSA *sign* is the cold-path cost; verify ~13 ms).
- ✅ **Expanded the `.spore` governance clone** (`spore/k3-policy.spore`: `allOf`/`anyOf` + `authorizeRead`/`egressRedact`
  egress seam, `galerina check` clean, `--invoke`-verified; surfaced GAP-4).

### Phase 4 — Storage & query (the DB half)  ✅ DESIGN DONE (2026-06-16)
`tmf/research/storage-and-query-v0.md`: two-zone design — untrusted-safe **mesh-coordinate index** + trusted-zone
**HNSW ANN** (measured recall@10 0.955→0.994 over `ef`, `bench/hnsw-recall.mjs`) + **MeshQL** (grammar→AST→
planner→executor, predicate-pushdown + verify-before-decrypt + the `k3-policy` egress seam). Engine build deferred.

### `+1` append-only history chain  ✅ DONE (2026-06-16)
`tmf/spec/tmf-history-chain-v0.md` + `gen_tmf_history_chain.py` (charter §3.3, was deferred): hash-linked
signed segments (link-leaf binds `prev_root`; `epoch`+`flags` under the signed root), a SHAKE256
**key-erasure ratchet** (forward-secret across appends *if* keys are erased + `CK₀` is FS — honestly scoped,
NOT unqualified FS), and **crypto-erasure** (drop a segment key; chain still verifies). **Rollback/truncation
is explicitly out of the signature's scope** — needs verifier monotone-epoch state or a signed head pointer.
Adversarially reviewed (2 blockers + 3 majors found and fixed before commit: rollback gap, unauthenticated
`erased` flag, FS overclaim, KDF/AAD reuse divergence).

### Phase 5 — `.tmf` rich media & structured data  ✅ DONE (2026-06-16)
`tmf/spec/tmf-modalities-v0.md` + `gen_modality_codecs.py`: modality planes (Image/Audio/Video/Document/
Structured) + a u16 **codec registry** (PNG/JPEG/AVIF · Opus/AAC/FLAC · H.264/HEVC/AV1 · MathML/LaTeX ·
SMILES/InChI/MOL · JSON/XML/CBOR · NVFP4/f32). Large media reuses the STREAM AEAD; **codec-agnostic integrity
proven** (`leaf(SMILES)==leaf(InChI)`; modality relabel changes the leaf). `.tmf` wraps codecs, never replaces them.

### Research / later (labelled, not promised)
FHE for encrypted similarity (digital-only, never line-rate) · photonic ANN benchmark (the *only* earnable
photonic perf claim, outside the gate, behind a reproducible benchmark) · digital-ternary NTRU/ML-KEM
backend (optimization, not a security feature).

### Parallel / deferred
FFSM Phase 1.5/2 (held to R&D by owner) · confidentiality build (Phase 2) · photonic-tri-governance (adjacent).

### Cross-cutting (every phase)
Honest-core/aspirational split · crypto on the deterministic core · fail-closed (`unknown → deny`) · no perf
number without a benchmark + the machine.

---

## 7. Open questions & owner decisions

> **RATIFIED 2026-06-16 (owner-delegated — "continue on auto").** Decisions taken and propagated:
> **Q1** AEAD = crypto-profile registry, **default AES-256-GCM**, Ascon-AEAD128 constrained, ChaCha20-Poly1305 alt;
> **Q2** committing AEAD + SHAKE256/context KDF; **Q3** RS-erasure self-heal outside the gate + re-verify (ratified);
> **Q4** in-network cleartext-attribute routing **dropped** (endpoint-side filtering only); **Q9** keep both folders
> with this crossover as the canonical entry, notes deduped by reference. Q5/Q7 (profile scope / lift R&D-only)
> and Q8 (where to file the 3 Galerina gaps) remain owner calls. The items below are kept for rationale.

**Crypto profile**
1. **AEAD cipher** — adopt the crypto-profile registry? **Recommended default = AES-256-GCM (`0x01`)**;
   Ascon-AEAD128 (`0x02`) for constrained/embedded; ChaCha20-Poly1305 as the no-AES-NI alt. The genuine call
   is the **primary deployment target** — server/data-centre (→ AES-256-GCM default) vs constrained/embedded
   (→ Ascon default); equivalently, whether a **128-bit default** is acceptable for your longest-lived data
   (if not, AES-256-GCM must be the default, not merely an archival add-on).
2. **KDF + committing AEAD** — pin SHAKE256+context, KMAC256 alt, commit the AEAD? *(Recommended; clear answer.)*
3. **Self-heal** — ratify "RS erasure outside the gate + re-verify, fail-closed" wording? *(Already settled.)*
4. **In-network semantic routing** — **drop** cleartext-attribute filtering (security says yes) and re-cast as
   endpoint-side filtering? *(Genuine product call; evidence is one-sided.)*
5. **Profile scope** — ship `0x01`/`0x02` now, or also add the `0x03`/SLH-DSA assurance tier this pass?

**Build & repos**
6. **Engine language** — Rust `libtmf_core` *(ratified D2)*.
7. **Production-repo access** — currently **R&D-only** *(ratified D3)*; FFSM Phase 1.5 held. Lift this when?
8. **Where to file** the remaining Galerina dogfooding finding — `governance` reserved word **✅ FIXED** and Bool
   mis-marshal **✅ FIXED** (re-verified 2026-06-16); only **`secure flow main` not in `--invoke` (GAP-2)**
   remains. Owner picks (TritMesh repo off-limits to me). KB `:63` is already corrected.

**Merge mechanics**
9. **Folder consolidation** — keep the two folders indexed by *this* crossover doc (current state), or
   physically consolidate into one canonical folder? If consolidate: which is canonical, and do we dedup the
   identical `notes/1–3.md`?

---

## 8. Merged honesty ledger (what both tracks rejected)

"12.5M RPS / sub-0.01 ms / single clock cycle" · in-cache self-heal · "store a 0 in 0 bits" vs fixed-width ·
"photonic SHA-256" · `0x6E88` magic (kept the PNG-style 8-byte guard) · mandatory-NVFP4 (kept opt-in) ·
`M·D_root ≡ S (mod q)` ML-DSA equation (corrected to the real FIPS-204 norm-bound + challenge-hash check) ·
"firewalls filter on cleartext meaning" (killed by inversion attacks) · `galerina-substrate-mytri` (fictional pkg).
Full triage: `tmf\research\real-vs-aspirational-ledger.md` and `tri-encription\FINDINGS-AND-ROADMAP.md` §6.

---

## 9. Concrete next merge-actions (proposed; awaiting your go)

1. Apply the **crypto-profile registry** (recommended: **AES-256-GCM `0x01` default** · Ascon-AEAD128 `0x02`
   constrained · ChaCha20-Poly1305 alt — final default per §7 Q1) to both `tmf\spec\tmf-container-v0.md`
   (the `vector_codec`-style discriminator already shows the pattern) and the tri-encryption blueprint.
2. Update `tmf\research\encryption-architecture.md` for the **metadata-routing kill** + the DEM registry.
3. In the tri-encryption docs: mark the **KB `:63` item resolved**, **flag the AES/Ascon divergence**, tighten
   the "92%/32-token" shorthand, and add the **committing-AEAD** task to Next.
4. Add a one-line probe `.spore` to **prove "crypto is Blocked in `.spore`"** (close the unverified claim).
5. Decide folder consolidation (Q9) — I can keep both folders + this index, or consolidate on your word.

*Status 2026-06-16 (on takeover): actions 1–4 **executed** — AEAD registry (AES-256-GCM default) + committing
AEAD + metadata-routing kill propagated into `tmf\research\encryption-architecture.md` §0,
`tri-encription\research\SPORE-AMD-024…` §2.3/§4, and the `tmf\spec\tmf-container-v0.md` §10 v1 note; the
"crypto-Blocked-in-.spore" claim closed with `tri-encription\spore\probe-no-bitwise.spore` (SPORE-PARSE-001 on `^`).
Action 5 (folder consolidation): kept both folders, this doc canonical; physical merge deferred. The 3 Galerina
dogfooding gaps are staged as filing-ready issues in `tri-encription\spore\galerina-gaps-candidate-issues.md`
(owner moves them to the real issues repo; TritMesh off-limits).*

*Status 2026-06-16 (cont.): with TASK 2 frozen and the oracle airtight, the **v1 confidentiality layer was
promoted from the `SPORE-AMD-024` sketch into the byte-precise, oracle-backed spec track** —
`tmf\spec\tmf-encryption-v0.md` + `_vectors\gen_tmf_encryption.py` (the 5th generator). It disentangles the
sketch's `0x01/0x02` axis-overload into 3 orthogonal selectors, pins the SHAKE256 DEM KDF + AAD-committing
AEAD + 36-B AAD context (**resolves Q5**) + STREAM nonce against the verified bench, and was adversarially
verified (4 findings → 3 fixed incl. an XChaCha/ChaCha registry split + a CMT-1 over-claim softened, 1
dismissed). One reconciliation flagged (roadmap 1e): bench `kemdem.mjs` uses HKDF-SHA256; the spec pins
suite-consistent SHAKE256 (bounded, test-preserving). Owner calls unchanged (profile scope `0x03`/SLH-DSA;
lift R&D-only; file the 3 Galerina gaps).*
