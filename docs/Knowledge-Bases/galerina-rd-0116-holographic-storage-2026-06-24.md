# R&D 0116 — Holographic "O(1)-read petabyte" storage: worth more R&D? + the sound-erasure finding

**Date:** 2026-06-24 · **Workflow:** `w0qh5u5jl` (8 agents, adversarial-verified) · **Status:** R&D record + one net-new normative invariant (`SPORE-RETAIN-001`, build gated on a storage-substrate path)
**Posture:** grounded, cited, fail-closed, crypto-on-core (SPORE-SUBSTRATE-001). Builds on `RD-0110`, `RD-0111-C12`, `RD-0114-G2`.
**Companion docs:** [`galerina-rd-0111-photonic-3d-brief-rigorous-2026-06-24.md`](galerina-rd-0111-photonic-3d-brief-rigorous-2026-06-24.md) · [`galerina-rd-0114-tmf-vs-db-comparison-2026-06-24.md`](galerina-rd-0114-tmf-vs-db-comparison-2026-06-24.md) · [`galerina-rd-reference-index.md`](galerina-rd-reference-index.md)

> Owner ask: "is it worth doing any more R&D into this — 'holographic O(1)-read petabyte storage — research-stage (~9.6 GB/cm³ demonstrated, not PB; random page access isn't O(1))'?"

---

## 1) DIRECT ANSWER  `[RD-0116-O1]`

**REFUTE-AND-PARK the storage claim (no further SOTA R&D) + BUILD exactly one small net-new governance artifact (`SPORE-RETAIN-001`, §4).**

The "O(1)-read petabyte" claim is settled-false and already encoded as a guardrail (`RD-0114-G2`), so re-litigating the physics has zero marginal value — but the adversarial pass surfaced **one genuine net-new wrinkle**: you cannot crypto-shred a write-once/fixed hologram by overwriting it, which silently breaks Galerina's overwrite-based erasure invariant. Closing that is a tiny, crypto-reusing obligation worth writing down.

- **REFUTE-AND-PARK** — "holographic O(1)-read petabyte storage." Already nailed by `RD-0111-C12` + `RD-0114-G2`. No new refutation R&D warranted; the physics hasn't moved (still ~1% of the 1/λ³ limit, TB-not-PB, Bragg-search-not-O(1)). The newest result (Tan group, *Optica* 2026, DOI 10.1364/OPTICA.586593) raises *per-page bits* but **publishes no GB/cm³ or capacity number** — moves no Galerina conclusion.
- **TRACK** (one ledger line, annual OFC/Optica skim) — revisit only on a *single-medium PB* demo or *true O(1) addressing*; neither on the horizon.
- **BUILD** — `SPORE-RETAIN-001` sound-erasure obligation (§4).

## 2) The honest SOTA picture  `[RD-0116-O2]`

| Axis | Demonstrated (lab) | Projected / theoretical |
|---|---|---|
| Volumetric density | **~9.6 GB/cm³** net (Fe:LiNbO₃, 90° angle-multiplex @532 nm; *exact 9.6 single-lineage; ~1–10 GB/cm³ order solid*) | ~40 GB/cm³ practical ceiling (~5% of 1/λ³); 1-bit-per-λ³ figures are **arithmetic, not measured** |
| Single-medium capacity | **MB-to-low-GB per crystal** (~50 MB in the 9.6 GB/cm³ demo) | Petabyte = **media-stacking/rack extrapolation, never demonstrated** |
| Access model | **Page-parallel** read (~10⁶ bits / one diffraction exposure) | Movement-free cross-zone addressing = **explicitly unsolved** (Microsoft HSD open problem) |
| Maturity | **Lab/research only**; needs 1–2 OoM energy improvement | InPhase (only product attempt) **bankrupt 2011**; no shipping store in 2026 |

Demonstrated density sits at ~1% of the 1/λ³ first-order limit (Optica *Opt. Lett.* 26(7):444, 2001) — a gap persisting ~20 years. **Conflation guards:** Microsoft **Project Silica** (~4.8 TB glass, WORM, ~10k-yr) is *femtosecond-voxel*, **not holography**; the "petabit disc" headline (Zhao et al., *Nature* 626:772, 2024) is *STED-voxel ODS*, not multiplexed-page holography, and its 1.6 Pb is a **calculated extrapolation** (wrong category *and* a projection). **Correction carried in:** Microsoft HSD's Dec-2024 ACM ToS paper is *not* "an explicitly negative conclusion" → it documents two unresolved challenges (energy efficiency; movement-free multiplexing) with a 1.8× density gain.

## 3) The "O(1)-read petabyte" verdict  `[RD-0116-O3]`

Two independent, separately-falsifiable claims; both false as stated, each with a weaker true survivor. **All three adversarial-verify verdicts returned `refuted: false, confidence: high`** — the refutations held against the strongest counterexamples (laser-deflection page-select; the Zhao petabit disc).

- **"O(1) read" — FALSE as random access.** Read latency is O(1) in *page size* (a whole page reconstructs in one exposure), but addressing an arbitrary page is a **Bragg-condition search over the multiplex dimension** (angle/wavelength/phase tune + SLM/CCD settle). → **Survivor:** *high parallel read BANDWIDTH*, not O(1) random access. (= the latency-vs-cost distinction of `RD-0110-O1`.)
- **"petabyte" — FALSE as single-medium demonstrated.** Demonstrated single-medium is MB-to-low-GB; PB is a rack extrapolation against a ~40 GB/cm³ ceiling that is itself ~2 OoM below theory. Density and clean-fast-readout trade off directly. → **Survivor:** *high volumetric DENSITY (~10 GB/cm³ demonstrated, research-stage)*, not petabyte single-medium.

**Integrity-anchor question (the one that matters for Galerina):** *no* exotic medium (holographic, Silica, Cerabyte, DNA, tape) replaces a digital content-id/signature as the integrity anchor — structurally. Every one separates **durability/ECC** (corrects random decay; unkeyed, no authenticity) from **authenticity** (always a separate digital checksum/signature over the digitized readback). None offers information-theoretic integrity at rest. The avalanche argument of SPORE-SUBSTRATE-001 applies unchanged: the anchor must be computed on bit-exact digital silicon *after* readback. **Govern, Don't Absorb** holds — any medium is a storage *backend* for .tmf blobs; the content-id stays SHA-256/SHAKE256.

## 4) The net-new finding + the build  `[RD-0116-O4]` → `SPORE-RETAIN-001`

**Admission is ~fully covered, one descriptor widening.** A holographic store is just another HW-gated substrate; `admitPhotonicConfig` (`galerina-tower-citizen/src/photonic-admission.ts`) already admits it fail-closed (hash-pin + Ed25519 + revocation + deny-by-default capability → K3). The only structural gap: the capability is hard-bound to `PHOTONIC_REPROGRAM_CAP = "photonic.reprogram"` (compute). Mounting a storage volume ≠ reprogramming a PPU (least-authority) → the rail needs a **capability-axis split** (`photonic.reprogram` | `storage.mount`/`holo.volume.admit`). Descriptor widening, hours — not a new primitive. Bulk-page readout as a declassification surface reuses the existing taint lattice (SPORE-PRIVACY-002 SealTaint) as a new tainted source — a wiring obligation.

**Threat-model change — the genuine net-new wrinkle (crypto-shred / data-remanence).** Galerina's secret-erasure today is **overwrite-based** (zero the arena page / derived-secret buffer; B2/B2b in `wat-emitter.ts`). That assumption is **silently false** on volumetric/WORM media:
- **Thermally-fixed Fe:LiNbO₃ holograms cannot be erased optically** — the only erase path is re-heating to >170 °C for ~30 min (USPTO 5,648,856; IOP *J. Phys.: Condens. Matter* 3(28), 1991; *Opt. Lett.* 20(11):1334, 1995). There is **no in-place `memset` analog**.
- **WORM glass (Project Silica) is physically immutable** — overwrite is impossible.
- **Unfixed photorefractive holograms have destructive/decaying readout** — residual gratings = **data remanence**.

NIST SP 800-88 Rev. 1 already names **cryptographic erase = the "Purge" technique for media you cannot reliably overwrite.** So the threat-model delta is concrete and bounded:

> **If a secret (or its ciphertext) is ever allowed to land on a write-once/fixed medium, Galerina's overwrite-based erasure invariant is silently violated and the secret is unrecoverable-by-deletion. The ONLY sound erasure is destroying the key — so the secret must have been KEM-DEM-sealed before it touched the substrate, and the key must live on a substrate that CAN be overwritten (digital silicon). Crypto-shred replaces media-shred.**

### `SPORE-RETAIN-001` (proposed) — "Sound-erasure obligation for non-overwritable substrates"

A normative invariant (KB + Guardrail `RD-0114-G3`):
1. Any substrate admitted via the storage capability whose media is write-once/fixed is flagged `eraseModel: "crypto-only"` (vs `"overwrite"`).
2. On a `crypto-only` substrate, **only KEM-DEM ciphertext may be written** — a cleartext-secret-tainted value reaching it is a **fail-closed** compile/admission error (extends SPORE-SECRET-002 / SPORE-PRIVACY-002 taint to a new sink class).
3. The DEK lives on overwritable digital silicon; "deletion" = key destruction (NIST SP 800-88 Purge), never media overwrite.
4. Erasure emits a **crypto-erase WITNESS** (key-destruction attestation), since no read-back-verify of the medium is possible.

**Buildable surface (tiny, reuses everything; gated on a real storage-substrate path):** (i) the capability-axis split in `photonic-admission.ts` carrying an `eraseModel` manifest field; (ii) one taint-sink rule marking a `crypto-only` substrate as a sink that rejects cleartext-secret-tainted values (reuses SealTaint); (iii) this doc as the normative anchor. **No new crypto, no new science** → consistent with 0-patents / defensive-pub. The *obligation* is recorded now so it cannot be silently violated; the *code* lands when a storage-admission path is actually needed (HW-gated, #102-106).

## 5) Reference ledger

- `RD-0111-C12` + refs 51–53 (holographic refutation lineage). Coufal–Psaltis–Sincerbox 2000; Optica *Opt. Lett.* 26(7):444 (2001, ~1% of limit); ACM ToS 2024 DOI 10.1145/3708993 (Microsoft HSD, 1.8× density, two open challenges); Tan group *Optica* 2026 DOI 10.1364/OPTICA.586593 (per-page bits, no capacity number).
- Erasure physics: USPTO 5,648,856; IOP *J. Phys.: Condens. Matter* 3(28) (1991); *Opt. Lett.* 20(11):1334 (1995); **NIST SP 800-88 Rev. 1** (cryptographic erase = Purge).
- Foils: Project Silica (*Nature* 2025 via secondary reporting; ~4.8 TB/platter WORM); Cerabyte (iPRES 2024, media-only; 100 PB/rack is **roadmap**); DNA (RS/fountain coding, ScienceDirect 2024; arXiv:2311.07106); LTO-9/10 (LTO.org; shipping product).
- **Asserted-not-verified:** exact "9.6 GB/cm³" (single-source order-of-magnitude); exact >170 °C / ~30 min erase figures (material-dependent, order solid); Cerabyte/DNA roadmap + cost numbers; Project Silica 4.84 TB/platter (secondary reporting).

## 6) Paper / defensive-pub note

No paper on the storage claim (settled-negative, already covered). The `SPORE-RETAIN-001` finding is **defensive-pub-worthy** as a small governance note: *"overwrite-based secret-erasure is unsound on write-once/fixed substrates; the sound discipline is seal-before-write + crypto-erase (key destruction) with a destruction witness."* Reuses KEM-DEM + key custody; no new crypto → 0 patents, consistent with the standing strategy.

**Key files:** `galerina-tower-citizen/src/photonic-admission.ts` (the rail to widen) · `galerina-ext-tmf/src/kemdem.ts` (the seal) · `wat-emitter.ts` B2/B2b (the overwrite-erase that's unsound on WORM) · `docs/Knowledge-Bases/galerina-rd-0114-...md` (Guardrail B, where `RD-0114-G3` lands).
