# RD-0873 pre-translation progress — 2026-09-13

The bounded gate-closure work is active at Galerina `e716fc677d3ca609b016cf76d7f994b67fd36466`, tree `80aa41e53fd9cacd608bf0ba392b1d8f2c005e0a`. Translation remains paused. TypeScript shadows remain the consumer and rollback path. The completed 2,720-file corpus assurance was not rerun.

## Evidence completed in this pass

- Exact head and tree were re-read with the approved local Git 2.55.0.windows.2 executable (digest `22fead...05a`). Node is v24.18.0, npm 12.0.2, and TypeScript 5.9.3. `wat2wasm` is not available in PATH.
- The working-tree RD-0361 verifier reports `29/29`, `allClean=true`, but the committed ledger at the same head still records the older `secret-gate` digest `ce662c...3c36`; the dirty ledger records `f0622171...9166`. This is `HOLD_TOOLCHAIN_DRIFT`, not permission to repin.
- Checked-snapshot/GIR suites passed 15/15 with no skips.
- The sandbox suite passed 79/80. The failing discovery assertion expects a physical String-parameter refusal that was not present in the first ten discovered scopes; this is retained as a test/environment defect, not treated as a green gate.
- RD-0873 first-native-slice tests passed 3/3. Governance algebra self-test passed 169/169.
- The RD-0873 audit-map test first refused missing owner/Git inputs; with the explicit owner root and approved pinned Git executable it completed its bounded run at **30/30**, 0 failed, 0 skipped. This is a local audit-map result, not an admission or production-authority receipt.

## Advisory reviews

- Grok returned `REVIEW_OUTCOME: HOLD`. It identified exact-head identity, source/snapshot/GIR/SLIDE/VOK preimage, route confusion, crash/restart, caller/shadow, profile, quota and semantic-drift red vectors. It classified local fixtures separately from platform evidence and new owner/R&D decisions. Receipt: `docs/independent-audits/2026-09-13-rd0873-grok-pretranslation-gap-review.json`.
- GPT-6 Astra returned `HOLD`. It found the committed-versus-dirty ledger contradiction, a circular envelope design, insufficient restart evidence, and a signing sequence that would mutate signed bytes. The plan was corrected to use an acyclic subject→receipt→terminal bundle, separate TypeScript and Fungi identities, explicit stale-lock/reconciliation evidence, and a detached owner admission. Receipt: `docs/independent-audits/2026-09-13-rd0873-astra-pretranslation-gate-review.json`.

## What can proceed locally

1. Freeze a reviewed implementation revision and reproduce the compiler/toolchain without the dirty ledger.
2. Add the acyclic identity envelope and substitution/refusal fixtures.
3. Extend journal recovery tests for stale locks, torn tails, crash-before-seal and publication reconciliation.
4. Add caller-route/shadow-bake and profile-label fixtures.
5. Validate a non-empty, four-symbol, scalar-1 manifest without signing or authorizing it.

## What cannot be closed by local work alone

- Owner signature/admission over the exact manifest bytes.
- Independent physical SLIDE/VOK re-derivation and production authority.
- Profiles 64/256, cross-platform durability, hardware custody, or crash/power-loss receipts.
- Any decision to couple RD-0361 secret-gate closure to translation, open a consumer switch, retire TypeScript, or start bulk `.fungi` authoring.

## R&D search terms if implementation evidence remains unavailable

`immutable build-point succession`; `transitive input custody`; `acyclic execution attestation`; `crash reconciliation and stale-lock ownership`; `caller-route mismatch rejection`; `bounded shadow-bake criteria`; `detached owner admission`; `semantic-versus-physical profile binding`.

## Follow-up review and completed local run

- Astra follow-up reviewed corrected plan SHA `a67d30d954d131a35244cd5470ca2b786e4f443ab05fe132c0cf088876937651` and returned **HOLD**. The four corrections are adequate as control design, but the review still requires a new implementation-freeze revision, transitive tool-byte pinning, captured-byte execution, schema-route refusal, caller/shadow bake evidence, and a versioned slice-auditor contract. Owner admission and physical durability remain outside local proof.
- Grok follow-up returned **HOLD**. It agrees the corrections improve fail-closed design but says exact-head live binding, String-v2/scalar-v1 route separation, RD-0361 rehash, compiler provenance, physical SLIDE/VOK/profile receipts, and owner admission remain unverified. The exact follow-up prompt is retained beside the Grok receipt.
- The approved pinned Git run of the RD-0873 audit-map suite completed **30/30**, 0 failed, 0 skipped. This is bounded local audit-map evidence; it does not override the committed-versus-dirty RD-0361 ledger contradiction or authorize translation.

## Current disposition

The plan and four-symbol manifest are now ready for local implementation work, but the manifest remains a non-authorizing proposal. Local work can add refusal and recovery fixtures and reconcile the implementation on a fresh freeze. The owner still must provide an exact-head admission decision, and independent SLIDE/VOK/platform evidence is required for physical or production claims. New R&D is only needed for unsupported semantics, profiles 64/256, or an owner decision to couple RD-0361 to translation.


## Traceable artifacts

- Non-authorizing manifest SHA-256: `9b707d9ed46845078c570ff8839eb2e649ece159879aaabb249a98c54f6618e8`.
- Toolchain reproduction receipt SHA-256: `476b65561f72de2cce79d0979e4d3c3d056a1d5cc8639aadf442038464044019`.
- Corrected plan SHA-256: `a67d30d954d131a35244cd5470ca2b786e4f443ab05fe132c0cf088876937651`.
