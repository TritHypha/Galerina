# What Galerina Adopts from the `.tmf` / tri-encryption R&D (2026-06-16)

A **govern-don't-absorb** review of the two R&D tracks. Separates *achievements* from what Galerina's
**production repo can USE NOW** vs what stays **R&D-only / gated**. Sources: memory `[[galerina-tmf-tri-encryption-rd]]`,
`Galerina-R-AND-D/{tmf,tri-encription}/`. **No crypto and no `.tmf` engine enter Galerina core.**

> **UPDATE 2026-06-16 (post-review).** The owner then authorized building the `.tmf` engine **in-repo as an
> _ext_ package** — `packages-galerina/galerina-ext-tmf` (slices 1–2 shipped). This does **not** breach the
> core boundary (ext ≠ core; Galerina core still takes no crypto). The engine's authoritative KB doc is now
> [`galerina-tmf-engine.md`](galerina-tmf-engine.md), and its implemented-slice specs are vendored into
> `packages-galerina/galerina-ext-tmf/spec/` (pinned to R&D `fb68d06`). The "`.tmf` engine — R&D-only" line in
> §3 below is **superseded for the engine package**; the other R&D-only items (NVFP4 codec, MeshQL/DB,
> FFSM Phase 2, the tri-encryption confidentiality *build*) still stand.

## 1. Achievements (what the R&D established + adversarially verified)

- **`.tmf` trust layer SPEC-COMPLETE + executable-verified:** TMX-256 integrity core, `.tmf` container
  (container root == TMX root by construction), NVFP4 codec; adversarial review found **no critical defect**.
  Signature/custody spec (Ed25519+ML-DSA-65, correct FIPS-204) in progress; real signing Blocked (no vetted PQC lib).
- **Tri-encryption — 5 adversarially-verified verdicts:** (1) confidentiality genuinely MISSING → add KEM-DEM
  (ML-KEM-768 hybrid X25519 → AES-256-GCM); (2) **NO photonic SHA-256** (analog ≤~10-bit; SHA-256 already
  Grover-safe); (3) **tri-logic belongs in the governance/key-release gate, not the cipher**; (4) self-heal =
  Reed-Solomon *outside* the gate + re-verify the signed root; (5) **cleartext-semantic-routing KILLED**
  (vec2text ~92% recovery → "sharing embeddings ≈ sharing the documents").
- **Crypto-on-core (`SPORE-SUBSTRATE-001`) INDEPENDENTLY RE-DERIVED** from both the photonic-hashing *and* the
  lattice/encryption literature.
- **Measured `@noble` benchmark (10/10 green)** + a **runnable `.spore` K3 governance gate** (`galerina check` clean,
  executes on the compile→WASM path).

## 2. USABLE in Galerina NOW (govern-don't-absorb — no crypto, no engine)

| # | What | Concrete Galerina action | Value |
|---|---|---|---|
| **U1** ✅ **LANDED** | **Verify-before-decrypt key-release PATTERN.** The K3 `keyRelease(integrityOk, authenticityOk, govVerdict)` gate: release **only if** integrity AND authenticity pass AND the governance verdict collapses to Allow — any failure → Deny (fail-closed). Proven runnable `.spore`, built on the **already-shipped** 3-valued governance (`SPORE-GOV-3VL-001`). | ✅ Landed 2026-06-16 as **`tests/patterns/pattern-10-verify-before-decrypt-gate.spore`** — `galerina check` clean + runs on WASM (#203). Galerina governs the confidentiality pipeline; the crypto stays engine-side. | **HIGH** — the "Galerina governs the engine" story, runnable, zero new crypto |
| **U2** | **"No cleartext semantic embedding across a trust boundary"** (verdict 5) — a real, enforceable governance principle. | Candidate **data-exposure diagnostic** (`SPORE-PRIVACY-*`): an unencrypted embedding/attribute vector crossing an egress/wire boundary is a violation → encrypt-in-payload, filter at trusted endpoints. | **MED** — a genuine new governance rule |
| **U3** | **Crypto-on-core EVIDENCE** (analog optics ≤~10-bit breaks avalanche; SHA-256 Grover-safe). | ✅ Already fixed the `future-substrates` "Encryption → Photonic" contradiction. Strengthen the `SPORE-SUBSTRATE-001` substrate KB with the evidence; extend the rule wording to **"encryption/hashing/signatures,"** not just Hash/Sign effects. | LOW-MED — hardens an existing rule |
| **U4** | **NVFP4 verified byte facts** (16×E2M1 4-bit + 1-byte E4M3 scale = 9 bytes/block; lossy; *not* ternary, *not* crypto). | Ground the `fp4_block` `PrecisionTechnique` / `TECHNIQUE_BITS` comments (the #201 lane). | LOW — doc accuracy |

## 3. R&D-ONLY / GATED (NOT usable now — do NOT pull into Galerina)

- ~~**`.tmf` engine** (Rust `libtmf_core`, `lane: digital`) — gated on owner go (R&D-only).~~ **SUPERSEDED 2026-06-16:** now built **in-repo** as the ext package `galerina-ext-tmf` (TypeScript on a deterministic core — **not** Rust). See [`galerina-tmf-engine.md`](galerina-tmf-engine.md).
- **KEM-DEM crypto impl** + TMX-256 / container / NVFP4 codec specs — TritMesh/R&D; crypto/integrity stay the deterministic engine layer.
- **ML-DSA-65 hybrid signature + key-custody spec** (TASK 2, in progress) — feeds Galerina **#34** (ML-DSA-65 over the SHA-256 digest, hybrid Ed25519) **when it lands**; not yet.
- **FFSM Phase 2** (real ffsim worker), **confidentiality build**, **DB/query layer** (MeshQL) — gated / deferred on a real requirement.

## 4. The boundary (re-confirmed and sharpened)

`.tmf` / TMX / encryption = **R&D / TritMesh**; **Galerina = the governance gate** (verify-before-decrypt,
key-release, data-exposure). Crypto-on-core holds. The K3-gate dogfooding **proves Galerina can express exactly
this layer today** — which is why U1 is adoptable now with no new crypto.

> Dogfooding by-products (separate): #1 reserved-keyword-param diagnostic ✅ fixed; #2 `secure flow main`
> not in the WASM `--invoke` surface; #3 CLI Bool args silently mis-marshal (safety) — both open.
