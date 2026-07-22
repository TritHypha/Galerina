# Deny-by-default seams: fail-closed decoupling for modular composition

**Disclosure ID:** DP-RD-0515 (landed in `docs/paper/defensive-papers/` 2026-07-22; number = the source RD id, verified free in the canonical index) · **Date:** 2026-07-18 · **Type:** construction paper (prior-art disclosure — NOT a patent claim) · **Provenance:** KB RD-0515 (WASM-middleware / ABI seam-registry adjudication) + the border-safe-runtime-seam R&D; runnable harness `galerina-lego/test.mjs` (project subprojects tree) — **13/13 assertions green** at first verification (2026-07-18); the harness has since been extended and **re-runs 28/28** (2026-07-22) over the same named properties (deny-by-default · min-fold · hash-pin · swap-verify · authority-graph). Honesty lock: the harness verifies the seam **algebra**, not a production component runtime.

## Purpose
Modularity usually trades away safety. When a component can be unplugged, hot-swapped, or is simply absent, the naïve default is to **pass through** (fail-open) — which turns every seam into a bypass. We disclose a construction where the **seam itself is fail-closed**: an absent, unverified, or mismatched component composes to **DENY**, so a system can be decoupled and re-coupled ("Lego blocks") **without ever opening an authority hole.**

## The construction (all machine-checked, 13/13)
- **Unplug → DENY (deny-by-default stub).** A seam with no bound provider does not pass through; it returns the K3 **DENY** verdict. Removing a component can only *remove* capability, never grant it. Checked.
- **Min-fold composition.** A composed pipeline's verdict is the K3 **min** of its seams (the same min as governance): any DENY seam denies the whole; any INDETERMINATE seam holds. Checked — no seam can raise the composite above its weakest member.
- **Hash-pinned interface.** A provider is bound only if its interface hash matches the pin; a drifted or substituted provider fails the pin and the seam denies. Checked — no reach-through to an unpinned implementation.
- **Verify-or-deny hot-swap (differential-swap).** Swapping a provider at runtime requires the new provider's hash + attestation to verify against the pin; a swap that does not verify leaves the seam **DENY**, not an old-or-new ambiguous state. Checked.
- **Authority graph, no ambient reach.** A component's authority is exactly its explicitly-granted edges; there is **no** ambient or transitive reach through a seam. Checked.

## Why it is safe by construction
Because the seam's **default is the governance system's DENY**, decoupling inherits fail-closed *for free* — the **absence of proof** (no provider / no matching hash / no attestation) is treated identically to a denial. This is the K3 **min-identity** (SP-RD-0456) applied to **composition**: the more the composite can prove about a seam (bound + pinned + attested), the more it admits; absent proof, it denies. Modularity and zero-trust stop being in tension.

## Prior art (novelty disclaimed)
Capability-security and deny-by-default (Miller *et al.*), hash-pinned dependencies (Subresource Integrity, lockfile pinning), the WASI Component Model's typed interfaces, and fail-closed design are all established. **No novelty is claimed.** The disclosed *composition* — the seam whose empty binding folds to the governance DENY, the min-fold over seams, verify-or-deny hot-swap, the no-ambient-reach authority graph, and the machine-checked seam-property harness — is recorded as prior art.

## Honest bound
The harness verifies the seam **algebra** (deny-by-default, min-fold, pin-match, swap-verify, authority-graph), not a production component runtime; it proves the composition **law**, not that any given provider's attestation is itself sound (the attestation's cryptography is a separate, injected concern). Retrofitting an existing modular system to be fail-closed still requires wiring each real seam to this discipline.

## Declarations

- **Type / tier:** defensive publication (construction disclosure, novelty disclaimed) — a machine-checked seam algebra + its composition law; not a flagship/workshop novelty claim; no new cryptography, no new science; no performance number is claimed.
- **Authorship & AI assistance:** drafted with AI assistance under human direction; grounded in the KB seam-registry adjudication (RD-0515 line) and the named runnable harness.
- **Funding:** none.
- **Competing interests:** none.
- **Data / artifact availability:** in-repo — `galerina-lego/test.mjs` (project subprojects tree, pre-release; dependency-free; 28/28 on re-run 2026-07-22).
- **Licence:** Apache-2.0.

*Contact hello@trithypha.dev.*
