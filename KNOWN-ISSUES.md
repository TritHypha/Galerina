# Known Issues & Limitations — LogicN v1.0-beta

This is the honest front-door for testers. LogicN v1.0-beta is **ready for full testing**: the core
is production-grade, but some advertised layers are simulated/aspirational and a few residuals are
disclosed below. Read this before relying on any guarantee. Last reconciled: 2026-06-24.

## What is production-grade (real, tested)

- **Compiler & type system (Stage A)** — parsing, type-checking, effect inference, governance
  verification, WASM codegen. Full suite: **60/60 packages · 5,248 tests · 0 fail**.
- **Governance & admission border** — K3 (Kleene three-valued) fail-closed verdicts, value-state
  taint checking, effect/tier floors, signed `.lmanifest` admission, an enforced revocation registry.
- **Cryptographic signing** — Ed25519 (default) plus opt-in hybrid Ed25519 + ML-DSA-65 (NIST FIPS 204)
  post-quantum manifest signatures; tamper-evident and fail-closed.

## What is simulated or aspirational (NOT yet real)

- **DSS.wasm deterministic runtime isolation (#102–106)** — the DRCM containment model is *simulated*
  in the Stage-A TypeScript interpreter. The real in-WASM DSS / kernel-bypass isolation is not yet
  built. Do **not** rely on hardware-grade process isolation in this beta.
- **Photonic / ternary substrate (the "Tower")** — the photonic execution path is a physics-faithful
  **emulator** plus a governance layer, **not real silicon**. The governance is real; the substrate
  is emulated.
- **Stage-B self-hosting** — the self-hosted compiler achieves byte-for-byte WASM parity for
  `tokenize` only. Parser / type-checker / governance-verifier WASM parity is still in progress; the
  authoritative compiler is the Stage-A TypeScript implementation.

## Security disclosures

- **Compromised signing key in git history (#149).** A signing *private* key (`8eecf4187ebc9341`)
  was committed early in history (commit `cb5036d`) and **remains in the public git history**. It has
  been **rotated** (to `ab46f4c7e2797b9b`), **revoked** (published in
  `security/revocations/REV-2026-06.md` and enforced by the revocation registry — the key evaluates
  to **Deny**), and **no in-tree artifact is signed by it**. A history rewrite was deliberately
  avoided because it would rebase every commit SHA and break the verifiable trust chain. Treat any
  signature from `8eecf4187ebc9341` as permanently distrusted.
- **`LLN-VALUESTATE-008` is production-gated.** The boundary-input cleanliness floor (an unmarked bare
  parameter reaching a governed sink) escalates to an *error* only in production builds, and is now
  enforced on the user-facing `logicn build` path under `LOGICN_PROFILE=production` (commit `8d840ca`);
  dev/check remains permissive (warning, a planned follow-up). This is intentional for beta but means
  dev builds do not surface it.
- **`LLN-TIER-001` tier floor is production-gated.** The flow-kind tier floor (an under-declared
  secure-tier flow) is enforced only in production builds, and is now enforced on the user-facing
  `logicn build` path under `LOGICN_PROFILE=production` (commit `8d840ca`); dev/check remains permissive
  and does not yet surface it (the dev-mode warning is a planned follow-up).

## Test caveats

- **Known-flaky test:** the `logicn-core-sentinel-egress` ring-buffer audit-drop test can fail
  intermittently under concurrent load (a timing/serialization artifact, not a logic defect). It
  passed across repeated clean full-suite runs but is not yet deterministically isolated.

## Versioning note

- The product version is tracked in `version.json` (currently `1.0.0-beta.2`). All active workspace
  packages plus the root `package.json` now carry `1.0.0-beta.2` (reconciled in commit `15914e0`).
  Pin to the repo commit/tag, not an npm version, for reproducible testing.
