<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/VERIFICATION-FINDINGS-2026-06-16.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: (this archive copy is the primary KB home)  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# Adversarial verification findings — 2026-06-16

> Durable record of the two multi-agent adversarial verification passes run this session (the detailed agent
> reports live only in ephemeral temp files). Each finding is paired with its **resolution** and where the fix
> landed. Severity: **blocker / major / minor / nit**. All confirmed findings were fixed before commit; all
> references re-run green afterwards (existing crypto suite still 11/11).

---

## Pass 1 — Lane A §6.1 baseline + ffsim −6.0 golden (4 agents)

### 1A. Offloadable-fraction attribution — **FLAWED → fixed** (the headline correction)
- **MAJOR — mod-`q` inlined into the butterfly biases `f` upward.** V8 inlines the modular reduction (`% q`)
  into the NTT butterfly leaf (`fft.js:268`, 94% of the `LINEAR` bucket). mod-`q` is the §2 **re-quantization
  checkpoint that must stay digital** after an optical multiply-accumulate, so the raw profiler `f = 37.7%`
  credited digital work to the offloadable bucket. A verifier independently reproduced the 37.7% exactly,
  *then* showed the bias.
  - **Resolution:** added `bench/lane-a-mac-split.mjs` (toggle the `% q` on an identical butterfly) → mod-`q` is
    ~22% of butterfly time ⇒ **true offloadable `f ≈ 28%` (range ~19–38%), Amdahl ceiling ~1.40×** (was
    1.60×). Written into `tmf/research/photonic-lane-A-accelerated-signing.md` §6.5/§0/§8; the attribute script
    now self-discloses the bundling. **The wash verdict is unchanged and strengthened.**
- **minor/nit (Amdahl synthesis, sound):** tightened "wash by Amdahl alone" wording (Amdahl ideal ceiling is
  1.2–1.6×; the re-verify gate + conversion tax push net ≤1×); added the re-verify **asymmetry** note (a digital
  signer trusts its own core and skips re-verify; the photonic path must) and a **scope fence** (latency-only,
  ML-DSA-65, commodity HW — energy/batched/larger-param out of scope, not refuted). The independent end-to-end
  model (net 0.91–0.94× with a finite MVM) confirmed "wash or worse" is conservative.
- **nit (posture, sound):** the harness re-ran and reproduced every headline number byte-faithfully; cross-doc
  consistency confirmed.

### 1B. ffsim −6.0 Hubbard golden — **SOUND** (independently confirmed the true ground state)
The golden was verified **three independent ways**, not just trusted from the worker:
1. the worker self-test reproduced `energy = −6.0` + all 6 governance guards;
2. an **independent dense diagonalization** (`numpy.eigvalsh` over the (1,1) sector) gave the full spectrum
   **[−6, −4, 2, 4]**, min = −6.0 → −6.0 is unambiguously the **lowest** eigenvalue (not a HF/expectation value);
3. a **from-scratch Jordan–Wigner Hamiltonian** (hand-built creation/annihilation ops, own (1,1) projection, no
   ffsim Hamiltonian) reproduced the **identical** spectrum [−6, −4, 2, 4], confirming ffsim's sign conventions
   (−t hopping, −μ chemical potential, periodic-ring double-bond).
- **Determinism:** 6 runs (3 single-thread, 3 four-thread) all within ~1e-14 of −6.0 — robust to thread count.
- **nits fixed:** the worker `_provenance()` reported `ffsim_version: 'unknown'` (ffsim 0.0.80 exposes no
  `__version__`) → now reads `importlib.metadata.version("ffsim")`; the README top recipe pointed at the
  venv path that is blocked here → now points to the working `virtualenv.pyz` path.

---

## Pass 2 — the in-bounds backlog (CMT-1/CTX, 0x04 XChaCha, +1 packaging, MeshQL; 4 agents)

### 2A. `+1` on-wire packaging — **the one real SECURITY finding**
- **MAJOR — off-path segment insertion verifies even under a real head signature.** The reader walked the chain
  backward from the head to genesis but never asserted that **every** table/region segment is *on* that walk.
  A verifier crafted a pack with an extra segment (valid recomputed root, links an existing root, correct
  `chain_id`) — it **verified**, and proved with an HMAC-over-`r_n` stand-in that a genuine ML-DSA signature is
  **byte-identical with and without** the off-path segment (because `r_n` commits only *backward to genesis*,
  never to table/region membership). The reader algorithm's step 7 ("AEAD-open each non-erased segment") would
  then surface **attacker-injected payload** as chain content.
  - **Resolution:** added a **strict-membership** rule — `walked_count == segment_count`, else `IntegrityError`
    (`bench/history-pack.mjs` decodeAndVerify + a new test T8: off-path insertion → orphan). Spec
    `tmf-history-chain-v0.md` §8 reader step **6b** + prose corrected (insertion is caught by membership, *not*
    by the link walk, and *not* by the signature). Forks are also rejected by 6b.
- **minor:** the chain-header reserved-16 was silently repurposed (`MUST be 0` → carries `chain_id`) → flagged
  in §1 as a **v1.1 wire change** (a packed segment's reserved-16 is non-zero by design; interpretation is
  context-selected).
- Positive: `chain_id`, `epoch`, `flags(erased)` confirmed under the signed root; byte layout (48-B header,
  56-B entry) matches the reference; bounds checks run before hashing; the §5 rollback caveat is honest.

### 2B. MeshQL — two functional executor bugs (fail-closed, but real defects)
- **MAJOR — `<=`/`>=` advertised in the grammar but unhandled** in `evalCmp` (fell through to `false` ⇒ matched
  zero rows). **Resolution:** added the branches + a test.
- **MAJOR — pushed-down opaque `OR` mis-evaluated:** `IndexScan` used `evalCmp` (cmp-only) instead of `evalPred`,
  so `(x=3 OR x=7)` returned zero rows. **Resolution:** `IndexScan` now uses `evalPred` + a test.
- Both are fail-closed (drop rows, **no leak**). **The security property held under every adversarial query:** the
  verifier tried 14+ crafted queries (semantic field in nested/parenthesized ORs, zone-mixing ORs, deep nesting)
  — in *all* cases the semantic field stayed in the post-Gate residual; `leaksBeforeGate == 0`. Egress redaction
  of semantic fields to untrusted destinations also held (incl. `SELECT *`).
- **minor:** §4.4(3) said semantic emit "iff `authorizeRead == ALLOW`" but the reference only checks
  destination-trust → wording softened (the reference *abstracts* the `k3-policy.spore` policy call).

### 2C. CMT-1 / CTX — sound, with an untested claim
- **MAJOR — the anti-downgrade claim was real but untested.** The reference used a bare random AAD, never the
  36-byte `aead_context` with `commit_mode` at offset 29, so the "cannot strip CTX to 00 without failing the
  tag" claim was asserted, not exercised. **Resolution:** added test T-CMT-7 (build the real `aead_context` with
  `commit_mode=01`, seal, try to open with `commit_mode=00` → fails). The verifier confirmed the binding is real
  in the protocol.
- **minor:** the reference retains the base tag `T` on the wire (`C‖T‖commit_tag`) vs textbook CTX (which
  discards `T`). It is **≥ textbook** (only adds an equality constraint), but undocumented → §8.5 now has a
  "variant note" (+16 B vs textbook; exposing `T` is harmless — it's the standard public AEAD tag).
- Positive: citations verified real (Chan–Rogaway 2022/1260, Bellare–Hoang 2022/268); CTX is genuinely CMT-4;
  the SHAKE256 collision-resistance reduction is correct.

### 2D. `aead_suite=0x04` XChaCha — sound, two normative gaps closed
- **minor — `index ≥ 2⁶³` silently wraps the BE-u64 → nonce reuse** (catastrophic for AEAD); the bound was
  asserted but unguarded. **Resolution:** `streamNonce24` now rejects it + a normative `MUST-reject`
  (`MalformedCrypto`) in §6.1/§7.1.
- **minor — anti-truncation is a *reader obligation*:** the `last=1` terminator only catches a dropped final
  chunk **if the reader requires a terminator**; a naive reader reading every chunk as non-final misses it.
  **Resolution:** normative reader rule in §6/§7 (STREAM decrypt MUST fail-closed without a valid `last=1`
  terminator) + a positive test.
- Positive: @noble's XChaCha validated **byte-for-byte against draft-irtf-cfrg-xchacha Appendix A.3.1**; the
  `(index<<1)|last` map is collision-free; CTX composes over `0x04` unchanged.

---

## Lessons (reusable)
1. **Profiler self-time on a JIT'd pure-JS lib silently bundles inlined ops** — always cross-check a hot fraction
   with a toggle microbench (mod-`q` bias, 1A).
2. **A head-only signature does not cover container/table membership** — append-log/Merkle packs need an explicit
   *strict-membership / no-orphans* check; the signature commits only along the hash-linked path (2A). This is the
   most important and reusable finding.
3. **"Bound in principle" ≠ "tested"** — claims about AAD/downgrade binding must be exercised with the *real*
   structured AAD, not a random stand-in (2C, and the analogous untested suite-binding in 0x04).
4. **Anti-truncation / terminator guarantees are reader obligations** — state them normatively, don't assume the
   reader enforces them (2D).
5. Adversarial verification paid for itself both passes: it caught a genuine signature-bypass and two silent
   query bugs that the happy-path tests missed.
