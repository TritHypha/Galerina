# Security Policy

## Posture
Galerina is governance-first and zero-trust by construction: deny-by-default effects, fail-closed
(`unknown → deny`), **crypto-on-core** (bit-exact cryptography on a deterministic digital core), and
post-quantum-ready signatures (**hybrid Ed25519 + ML-DSA-65**, NIST FIPS 204).

## Audit status
**Phase 1 audit — COMPLETE (2026-06-16).** All **Critical and High** vulnerabilities from the adversarial
sweep are patched and verified; the codebase is in a fail-closed, deterministic state. The audit ledger lives in
[`docs/Knowledge-Bases/galerina-build-roadmap.md`](docs/Knowledge-Bases/galerina-build-roadmap.md)
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
A signing private key (`8eecf4187ebc9341`) was historically committed (commit `cb5036d`) and is **COMPROMISED**.
It has been rotated to `ab46f4c7e2797b9b` and is formally revoked — see
[`security/revocations/REV-2026-06.md`](security/revocations/REV-2026-06.md). Any signature from the old key
must be distrusted (`-1 Deny`). A git **history scrub was deliberately NOT performed** (it would rebase all
commit SHAs and break the verifiable trust chain); the key lineage is permanently distrusted via the revocation
advisory instead. Remaining: CI secret scan + re-signing of any exclusively-old-key-signed artifacts (#149).

## Reporting a vulnerability
Please report security issues **privately** to the maintainer — `<SET SECURITY CONTACT BEFORE PUBLISHING>` —
and do **not** open a public issue for an unpatched vulnerability. You can expect an acknowledgement and a
remediation timeline.

## Supported versions
Pre-1.0; security fixes land on `main`.
