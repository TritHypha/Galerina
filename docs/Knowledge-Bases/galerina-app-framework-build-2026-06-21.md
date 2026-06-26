# App-Framework Build (B1–B6) — outcome 2026-06-21

Owner greenlit the app-framework build (master prompt `MASTER-PROMPT-zero-trust-ecosystem-build.md`,
items B1–B8), full-auto, review at the end. Decisions taken at the start: B1 first; app layout
`App.spore + App.manifest + flows/ deps/ proofs/`; B2 canonical schema = the compiler ontology
(see below). Verify-before-build governed throughout — the master prompt's "BUILD THIS — NEW" list
overlapped heavily with shipped work, so most B-items were verified, not re-derived.

## Outcome per item

| Item | State | Evidence |
|---|---|---|
| **B1 — app-layout scaffolder** | **BUILT** (`2c9a441`) | `galerina new app <dir>` mode added to `scripts/galerina-new.mjs`: emits `App.spore` (governed composition-root) + `App.manifest` (deny-by-default descriptor → folded into the signed `.lmanifest` at build) + `flows/ deps/ proofs/` + README + .gitignore. Verified end-to-end (scaffold → `galerina build App.spore` → signed `build/App.wasm` + Ed25519 `.lmanifest`; `run --invoke main` → 0). +6 tests (`galerina-core-cli`). |
| **B2 — unify the two admission gates** | **BUILT** (`d3b698c`) | Found THREE divergent capability vocabularies (border-check plugin allow-list; compiler `KNOWN_CAPABILITIES` wired to V_DPM bits; runtime fusion registry). Made the **compiler ontology canonical** (owner decision); added `CAPABILITY_ALIASES` + `ADMISSION_CAPABILITIES` + `normalizeCapability`/`isAdmissibleCapability` in `capability-types.ts` (purely additive — no renames, no bit changes, no caps dropped). `border-check` now validates against it (alias-aware); the fusion gate is bound by a kernel drift-check. +9 tests. |
| **B3 — inter-module code-routing linker** | **VERIFIED SHIPPED** | `planComposition`/`fusePackages` (`fuse-loader.ts`): set-signed (one unsigned member refuses the whole set, `SPORE-FUSE-SET-UNSIGNED`), acyclic (`SPORE-FUSE-SET-CYCLE`), provider-before-consumer ordering, ambiguity/self-provide refusal, deny-by-default over the `capabilityRegistry` hook. Tested in `fuse-compose.test.mjs` (kernel 60/60). |
| **B4 — enforced revocation at admit/fuse** | **VERIFIED SHIPPED** | `galerina fuse` injects `revocationCheck = isKeyRevoked` + `assertRegistryTrustworthy` (fail-closed); fuse-loader Gate 2b refuses a validly-signed-but-revoked key (`SPORE-FUSE-KEY-REVOKED`); `governance/revocations.json` carries the real revoked key `8eecf4…`. Tested: `tests/revocation/` (22/22) + `fuse-loader.test.mjs` 5b. The earlier "markdown-only, nothing denies" note is now STALE. |
| **B5 — live package registry/resolver** | **MOSTLY SHIPPED** | `package-resolver.ts` governs `hash` (content-address), `signature` (Ed25519), `registry` (auditable origin), `installScript:"deny"`; SPORE-PKG-001..005 (capability-non-expansion, untrusted-registry, provenance, install-deny). Tested in `governed-resolver.test.mjs`. **Genuine NEW residual:** a *signed central registry index* (the "live registry" the memory flagged as new) + wiring **revocation into resolution** (defense-in-depth; resolver doesn't yet check signing-key revocation). |
| **B6 — populate example app + api-server** | **MOSTLY SHIPPED** | `examples/fuse-demo/my-custom-api-rest` (a built, fused, signed example) + `galerina-api-protocol-rest` (the shipped reference REST adapter, e2e). No `galerina-framework-example-app` *package*, but a new TritMesh worked-app conflicts with "TritMesh not active." Residual: a richer worked example if desired. |
| B7 / B8 | **DROPPED / GATED** | B7 (cross-tier BSL contamination lint) DROPPED — BSL reversed, all Apache-2.0. B8 (SPSC ring-buffer) gated on isolation (#102-104). |

## Genuinely-new work BUILT vs verified
- **Built (the real gaps):** B1 scaffolder, B2 admission-vocabulary unification — both with tests, pushed.
- **Verified already shipped (no re-derivation):** B3, B4, and the core of B5 + B6.

## Residual NEW slices
1. **B5a — signed central registry index** + a verifying resolver entry (hash + signature + revocation BEFORE admission). The one item flagged genuinely-new. *(Owner to direct — not yet built.)*
2. **Revocation into more gates** — ✅ **BUILT** (`fdb3f3e`, owner-directed). Signing-key revocation now enforced at the **package resolver** (`SPORE-PKG-006`, `checkPackageProvenance`/`getResolverReport` take a fail-closed `{ isRevoked }` predicate; `signerKeyId` added to the manifest schema — forward-ready) and the **bridge-attestation gate** (`AttestationPolicy.signerKeyId` + `revocationCheck`; `verifyAttestation` refuses a validly-signed-but-revoked key, covering the hybrid path). New CLI `galerina bridge-attest verify … [--keyid <id>]` injects the real registry (fail-closed via `assertRegistryTrustworthy`). Verified e2e: real revoked key `8eecf4…` → DENIED. `border-check` intentionally excluded (plugins use `sourceHash`, not signer keyIds). +7 tests; full suite 53/53 · 4980.
3. **B6 — a richer worked example** (within the TritMesh-as-example-only constraint). *(Owner to direct — not yet built.)*

## Decisions recorded
- B2 canonical schema = **compiler ontology** (border-check's was the least load-bearing; taking it literally would have broken V_DPM/governance/.spore and dropped `shell.execute`/`native.call`).
- All Apache-2.0; B7 + folder-level BSL dropped.
