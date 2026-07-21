# Defensive Publication — A compiler-enforced, fail-closed memory-residency ceiling: making "a secret spilled past its tier" unrepresentable, auto-derived from type and effect

**Disclosure ID:** DP-RD-0358 · **Date:** 2026-07-12 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Stage:** **DESIGN-STAGE DISCLOSURE** — the governed-residency capability is specified in KB RD-0358 (Row A) and extends a shipped physical-hardening contract surface, a shipped secret-aware code-emission path, and a shipped crypto-erase directive lineage. The residency clause and its auto-derivation are design-stage.

## 1. What is disclosed

A **governed memory-residency capability**: a value's *maximum* memory tier is a **declared, compiler-enforced, deny-by-default** property, expressed as a small hardening clause and — for the common case — **auto-derived from the value's type and effects**, so the developer writes nothing.

1. **A residency ceiling as a type property.** A value may declare a ceiling over the ordered memory hierarchy — `register-only < no-dram-spill < no-swap < no-disk` — plus `erase: on-exit` (zeroize when the value leaves scope) and `timing: constant` (no secret-dependent access or branch). The ceiling is a **maximum tier**, deny-by-default: anything below it is forbidden.
2. **Fail-closed by construction.** If the compiler/target cannot *prove* the value stays within its ceiling — e.g. the register allocator would have to spill it — that is a **compile REJECT or an explicit, governed downgrade**, never a silent spill. Making-illegal-states-unrepresentable, applied to *physical memory placement*: "a secret spilled past its tier" is not a runtime event to detect, it is a program that does not compile.
3. **A spill re-types the value.** Where a governed downgrade is permitted, the value's **epistemic type-state is lowered to `Refuted`** (contagiously), so the hygiene failure is carried in the type, not lost.
4. **Auto-derived, secure-by-default, attested.** A value carrying a secrecy/taint type or a `secret.read`-class effect **automatically** receives the strictest ceiling (no-swap + erase-on-exit + constant-time + pinned to the digital substrate). The derivation is a **deterministic pure function of type and effect**, performed **inside the build/attestation boundary before signing**, and is **inspectable** (a `--show-derived`-style view / a manifest field). The injector's authority is *tighten-only*: it can never derive weaker-than-implied, and a *loosen* is developer-authored, visible, and governed — never auto-injected. Because the derivation is deterministic, a continuous-integration re-derivation reproduces byte-identical hardening, so a weakened or post-signature injection fails a differential/hash check by construction.

**Models adopted for reasoning (framing, not new theorems).** *Exposure as a residency integral:* a value's memory-attack exposure ≈ Σ over tiers of (attackability-weight × time-resident); a `register-only` ceiling forces the DRAM/swap terms — the highest-weight ones — to zero. *Cold-boot:* DRAM data-remanence persists for a window after power-off (Halderman et al. 2008); a value that never resides in DRAM does not present that channel. *The constant-time condition:* moving a secret into cache lowers DRAM exposure but can raise a timing channel; net-safety holds **iff** execution is constant-time (mutual information I(secret; timing) ≈ 0), which is *why* `timing: constant` is non-optional in the derived set for secrets.

## 2. What it prevents

- **Silent secret spill by the optimizer.** A register allocator or optimizer can no longer place a secret "wherever is fastest" and leak it to DRAM/swap/disk — that placement is unrepresentable for a hardened value.
- **A residency guarantee that is a hope, not a check.** Where ordinary systems offer residency as an *unenforced flag* (a call the developer may forget, an `mlock` that may silently no-op), this makes it a compile-time obligation that fails closed.
- **The "into the cache is automatically safer" fallacy.** By binding `timing: constant` into the derived set, it refuses the trade that swaps a DRAM-remanence channel for a cache-timing channel — the safety claim is only made where it is provable.
- **Unauditable auto-hardening.** "The developer never writes it" does not degrade to "no one can verify it": the derived hardening is inside the signature and inspectable.

## 3. Honest scope and bounds

- **It shrinks and governs a surface; it does not close it.** No claim of "unhackable." The compiler and the host platform remain a trusted computing base; this minimises and attests the memory-attack surface, it does not eliminate it.
- **Constant-time verification is undecidable in general.** A checker can flag a decidable subset (e.g. a secret-indexed memory access) but cannot *prove* constant-time for arbitrary code — this is a general limit of the problem, stated plainly, not a guarantee.
- **A host primitive is a trust boundary made explicit.** Reliance on an OS/hardware primitive such as no-swap pinning is a declared capability that fails closed when absent — the mechanism *demands and verifies or refuses*; it cannot prove the silicon honoured the request.
- **Auto-hardening is only as complete as the labelling.** A value that *should* be secret but is not typed/tainted as such receives no automatic hardening; the fix is upstream (taint-source completeness), and no claim of "all secrets hardened" is made.
- **It costs some speed on secret paths only** (constant-time forbids the fastest shortcuts); normal code is untouched.

## 4. Prior art acknowledged (novelty disclaimed)

Register-resident / never-to-RAM key handling (TRESOR and the cold-boot-defence line; Halderman et al. 2008 on DRAM remanence); memory pinning / no-swap (`mlock`) and zeroize-on-free hygiene; constant-time programming and secret-independent control/data flow (the side-channel and Spectre/Prime+Probe literature); cache-partition/colouring isolation (a sibling disclosure); units/effects as types and effect systems; make-illegal-states-unrepresentable (Minsky) and refinement typing; deterministic/reproducible builds and signed-artifact attestation (SLSA, reproducible-builds); the memory-hierarchy and roofline/operational-intensity models (Williams et al. 2009) and activation-recompute memory–compute trade (Chen et al. 2016). The disclosed composition — *a deny-by-default residency ceiling over the memory hierarchy, auto-derived as a deterministic pure function of a value's type and effect, enforced fail-closed at compile time so a spill-past-ceiling is unrepresentable (REJECT or a governed downgrade that re-types the value REFUTED), the derivation performed inside the attestation boundary before signing and made inspectable, with a mandatory constant-time condition bound into the derived set for secrets* — is published to establish prior art; novelty is disclaimed for every constituent.

## 5. Declarations

- **Type/tier:** defensive-pub. Originally filed as design-stage; **updated 2026-07 to reflect shipped
  construction**: H-1 (auto-derivation), H-2 (residency lattice + fail-closed honour check), H-3
  (reconcile explicit vs auto), H-4 (constant-time check — honestly partial, undecidable in general),
  H-5 (host-seam capability contract), H-6 (`memory.spill` deny-only effect), H-7 (only-tightens +
  `audited_loosen` opt-out), and the RD-0337 `spillRetype()` composition (spill re-types a value
  `Refuted`, sticky + contagious) are **all integrated and merged to main** (f7ff18df, task #52).
  Remaining design-stage items: H-5 signed FuseDescriptor re-sign + `#143` execution enforcement
  (mlock syscalls, zeroize — compiler ceiling is proven, runtime placement enforcement awaits the
  `#143` authority flip). H-4 constant-time check remains honestly partial (the decidable subset only).
- **Authorship & AI assistance:** drafted with AI assistance (Claude) under human direction, grounded in KB RD-0358 (Row A and the adopted models M1–M3/M6), and the shipped physical-hardening contract, secret-aware emission, and crypto-erase-directive constituents. Galerina-internal threat-model tables and implementation-status residuals are deliberately **not** reproduced here (out of scope for a construction disclosure).
- **Funding:** none. **Competing interests:** none declared.
- **Data / artifact availability:** design source KB `galerina-rd-0358…`; shipped constituents in
  `packages-galerina/galerina-core-compiler/src/hardening-residency.ts` (H-1..H-7 + RD-0337
  composition) and `packages-galerina/galerina-tower-citizen/src/epistemic-type-state.ts` (runtime
  trit). Trit-conformance gate 6/6 green (`tests/hardening-trit-conformance.test.mjs`).
- **Licence:** Apache-2.0.
