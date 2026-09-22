# Known Issues & Limitations — Galerina v1.0-beta

This is the honest front-door for testers. Galerina v1.0-beta is suitable for
development and full-suite testing, but it is **not production authority**.
Production signing custody, platform durability evidence, general source-family
coverage, literal TypeScript retirement, and the source-to-SLIDE bootstrap
fixpoint remain open. Read this before relying on any guarantee. Last
reconciled: 2026-08-09. Security continuation addendum: 2026-09-22.

## What is implemented and tested (bounded evidence, not production authority)

- **Compiler & type system (Stage A)** — parsing, type-checking, effect inference, governance
  verification, GIR and WAT emission. The dated 2026-08-09 checkpoint was
  **100/100 packages · 9,470 tests · 0 fail**; rerun the phase-close gate for
  current evidence.
- **Governance & admission border** — K3 (Kleene three-valued) fail-closed verdicts, value-state
  taint checking, effect/tier floors, signed `.lmanifest` admission, and a revocation registry are
  implemented. Their tests are bounded software evidence, not proof of production custody,
  persistence, or platform composition.
- **Cryptographic signing** — Ed25519 (default) plus opt-in hybrid Ed25519 + ML-DSA-65 (NIST FIPS 204)
  post-quantum manifest signatures are implemented and tested with non-production material. No
  production private-key use or operational public-bundle authority is claimed.

## What is simulated or aspirational (NOT yet real)

- **Legacy DSS.wasm deterministic runtime isolation (#102–106)** — this is no longer one intact
  build target. Reusable `.fungi` decision cores, typed contracts, and tests are being adapted to
  SLIDE/VOK; incompatible Wasmtime-host authority and isolation are not production evidence. Do
  **not** rely on hardware-grade process isolation in this beta.
- **Photonic / ternary substrate (the "Tower")** — the photonic execution path is a physics-faithful
  **emulator** plus a governance layer, **not real silicon**. The governance is real; the substrate
  is emulated.
- **Fungi self-hosting and SLIDE retirement** — seven canonical compiler-stage `.fungi` files are
  authoritative specifications and independent SLIDE executes a bounded checked-Fungi family, but
  TypeScript remains the executing differential/bootstrap layer. Production authority, general
  source families, and literal `.ts` retirement are still open.

## Security continuation — 2026-09-22 (dirty tree; not production authority)

Q1/Q2 certified photonic coupons now snapshot own-data before verify and
recheck coupon revocation on every infer (`packages-ts/galerina-tower-citizen`).
Focused photonic+bridge tests **24/24**. The Codex scan of this HEAD reported
**124** Galerina findings; that set is not closed. Independent audit, KB SHA-pin,
production `grantedEffects`, and Q3 work-performed ceilings remain open.
See `docs/reports/security-q1q2-continuation-2026-09-22.md`. The 2026-08-09
suite counts below stay historical.

## Security disclosures

- **Compromised signing key — rotated + revoked (#149).** A signing *private* key (`8eecf4187ebc9341`)
  is **COMPROMISED**. It has been **rotated** (to `ab46f4c7e2797b9b`), **revoked** (published in
  `security/revocations/REV-2026-06.md` and enforced by the revocation registry — the key evaluates
  to **Deny**), and **no in-tree artifact is signed by it** (the key id appears here only in revocation
  records, never as key material). **Provenance (2026-07-10):** the exposure does **not** resolve to a
  commit in this repository — `cb5036d` is not a valid object here and `.env.galerina-signing` was never
  tracked (git-ignored since the initial commit); the historical exposure is attributed to the separate
  Galerina-Production repository. The revocation stands **unconditionally** regardless. Treat any
  signature from `8eecf4187ebc9341` as permanently distrusted.
- **Trust-root rotated (2026-07-12, RD-0368).** The registry-signing trust root is now the hybrid
  Ed25519 + ML-DSA-65 key `21415420b447e219`. The interim root `ab46f4c7e2797b9b` (which superseded the
  compromised key above) was **lost** — its private half did not survive a workstation rebuild, which had
  frozen the revocation registry — so `governance/revocations.json` was **re-signed under the new root** and
  the trust-anchor pin moved (the `8eecf418…` revocation preserved). The lost root remains only as a public
  verifier for historical signatures; it is **not** revoked (never compromised, only lost).
- **⚠️ OWNER ACTION REQUIRED — revoke `ab46f4c7e2797b9b` in the signed registry.** Per zero-trust policy a
  key whose private half is in unknown custody must be formally revoked (not just superseded). This requires
  the trust-root key `21415420b447e219` to sign the updated `governance/revocations.json`. The dev signing
  key cannot perform this operation — the `trust-anchor.json` pin enforces that only `21415420b447e219` may
  sign the registry. Steps: (1) add `ab46f4c7e2797b9b` to the `revoked[]` array in `governance/revocations.json`,
  (2) run `node governance/sign-revocations.mjs` with the hybrid trust-root key loaded in `.env.galerina-signing`.
- **`FUNGI-VALUESTATE-008` is production-gated.** The boundary-input cleanliness floor (an unmarked bare
  parameter reaching a governed sink) escalates to an *error* only in production builds, and is now
  enforced on the user-facing `galerina build` path under `GALERINA_PROFILE=production` (commit `8d840ca`);
  dev/check remains permissive (warning, a planned follow-up). This is intentional for beta but means
  dev builds do not surface it.
- **`FUNGI-TIER-001` tier floor is production-gated.** The flow-kind tier floor (an under-declared
  secure-tier flow) is enforced only in production builds, and is now enforced on the user-facing
  `galerina build` path under `GALERINA_PROFILE=production` (commit `8d840ca`); dev/check remains permissive
  and does not yet surface it (the dev-mode warning is a planned follow-up).

## Test caveats

- **Known-flaky test:** the `galerina-core-sentinel-egress` ring-buffer audit-drop test can fail
  intermittently under concurrent load (a timing/serialization artifact, not a logic defect). It
  passed across repeated clean full-suite runs but is not yet deterministically isolated.

## Versioning note

- The product version is tracked in `version.json` (currently `1.0.0-beta.2`). All active workspace
  packages plus the root `package.json` now carry `1.0.0-beta.2` (reconciled in commit `15914e0`).
  Pin to the repo commit/tag, not an npm version, for reproducible testing.
