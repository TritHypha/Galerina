# Security Policy

## Posture
Galerina is governance-first and zero-trust by construction: deny-by-default effects, fail-closed
(`unknown → deny`), **crypto-on-core** (bit-exact cryptography on a deterministic digital core), and
post-quantum-ready signatures (**hybrid Ed25519 + ML-DSA-65**, NIST FIPS 204).

## Audit status
**Phase 1 audit — COMPLETE (2026-06-16).** All **Critical and High** vulnerabilities from the adversarial
sweep are patched and verified; the codebase is in a fail-closed, deterministic state. The audit ledger lives in
the internal engineering KB
(see "Phase 1 Security Audit — COMPLETE").

**Senior-developer zero-trust audit (2026-06-17).** Independent full-repo review:
[`notes/2026-06-17-zero-trust-senior-developer-project-audit.md`](notes/2026-06-17-zero-trust-senior-developer-project-audit.md).
Verdict: an **advanced prototype with hardened zero-trust subsystems — not yet production-complete**. Open
P0 items: historical signing-key remediation (see Key management below), the `groq-inference-v1` plugin denied
by the fail-closed border (placeholder source hash), and repo-wide typecheck reproducibility.

**Verified state (2026-06-17):** 49/49 packages, 4,518 tests, 0 failures; `border-check` fail-closed
(0 admitted, 1 denied). Counts are auto-generated from the test runner (`run-all-tests.cjs --emit-counts`)
to keep this evidence in sync with the executable state.

## Key management
A signing private key (`8eecf4187ebc9341`) is **COMPROMISED** and must be distrusted. It has been rotated to
`ab46f4c7e2797b9b` and is formally revoked — see
[`security/revocations/REV-2026-06.md`](security/revocations/REV-2026-06.md); the revocation registry evaluates
any signature from the old key to `-1 Deny`, and **no in-tree artifact is signed by it** (the key id appears in
this repository only in revocation/distrust records, never as key material).

**Provenance (corrected 2026-07-10).** An earlier version of this advisory attributed the exposure to commit
`cb5036d` in *this* repository's history. That commit does **not** resolve in this repository, and the private
key file (`.env.galerina-signing`) was **never tracked here** (git-ignored since the initial commit,
`.gitignore:16`). The historical exposure is attributed to the separate **Galerina-Production** repository. The
compromise is treated as real and the revocation stands **unconditionally** and fail-closed, regardless of the
repository in which the key was exposed — so no git history scrub is required in this repository. Remaining: CI
secret scan + re-signing of any exclusively-old-key-signed artifacts (#149).

## Reporting a vulnerability
Please report security issues **privately** to the maintainer, Phillip Booth <security@trithypha.dev>,
and do **not** open a public issue for an unpatched vulnerability. You can expect an acknowledgement and a
remediation timeline.

## Supported versions
Pre-1.0; security fixes land on `main`.
