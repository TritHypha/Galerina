# Galerina backup checkpoint — 2026-09-22

Disposition: **IMPLEMENTED, INDEPENDENT AUDIT PENDING**. This backup checkpoint
does not close the security scan, admit a producer, authorise signing, or grant
PROJECT READY, conversion, corpus, SLIDE/VOK, or production clearance.

The owner confirmed that the concurrent Grok writer had stopped and authorised
explicit-path commits and a push of Galerina main. No branches or worktrees were
created or merged. Other repositories are outside this publication operation.

## Source checkpoints

| Commit | Bounded backup slice | Paths |
|---|---|---:|
| `e1bb4a4f4e46597bb122eebec6fa5f01a67c2eba` | Tower product profiles, attestation and Tri-Pipe | 96 |
| `0f949c4060830da1722a301df37a508ea20d69b4` | Compiler, typed contracts and target admission | 68 |
| `eb1645a4fd6aedec3fabb646ec5c84001aa30ff1` | Runtime, API, C22 and tooling hardening | 113 |
| `c8ed507c23d4a6267381a53e4d45c9b43da56244` | TODOs, roadmap, ledger and dated reports | 24 |

Git's commit path lists are the authoritative manifests. Each staged set was
matched against an explicit file-and-digest manifest before commit and checked
against the resulting commit afterward. Private KB filename references in two
public documents were replaced by RD-number references; no private KB body was
copied into this repository.

## Bounded verification

Before staging, the source snapshot based on
`0f24ca30ef3f173c43a60c914c18b161327f2227` had manifest SHA-256
`99a1861178199efba7437c96ba0ae6e13e807f2023c2b453261859e943857d71`.
Source hashes were rechecked after the focused tests and before each commit.
The only subsequent source-document edits were the private-locator redactions.

- 41 affected TypeScript package builds: exit 0.
- 29 changed-test groups: 781 tests passed, zero failures and zero skips.
- Rebuild-helper, status-ledger and revocation checks: 25 tests passed,
  zero failures and zero skips.
- Admitted JavaScript/MJS syntax subset: 83 files passed. The initial broader
  syntax check failed on the excluded file described below.
- Every staged batch passed the staged-growth gate and staged path-leak check.
  The private-document guard reported zero violations in its inspected tracked
  text set; binary files are outside that text guard.
- These are bounded checks, not the full package test sentinel chain, corpus,
  independent security audit, or proof that every security finding is resolved.

## Package-boundary refresh

At source checkpoint `c8ed507c23d4a6267381a53e4d45c9b43da56244`, the owning
package-graph scanner, graph builder and boundary gate were run on the 100
previously changed package reports. **99 passed; one failed.** Only the passing
reports were freshly reproduced for the separate graph-documentation commit.
Existing boundary policies were not automatically widened.

## Excluded work and exact next actions

| Held surface | Finding or reason | Required next action |
|---|---|---|
| `scripts/verify-artifacts.mjs:170` and `:173` | Two newly added `continue` statements occur in a callback with no enclosing loop; `node --check` reports SyntaxError. The working-tree patch is retained, not committed. | Repair the invalid-path control flow while retaining an explicit refusal and complete traversal of legitimate children. Add hostile path tests; rerun syntax and focused behavior checks. |
| `packages-ts/galerina-tools-myco/.graph/BOUNDARY.md` | Current boundary check fails on unlisted `node:crypto`. The generated report is not fresh PASS evidence. | Review the actual crypto import and the package-owned boundary policy. Declare the dependency only if the source and contract justify it, then rerun the hostile controls and live boundary check. |
| 18 previously changed `build/` reports/provenance files | Not freshly reproduced for this source checkpoint. | Refresh through their owning tools when the outstanding prerequisites permit; do not relabel old evidence as current. |
| Two C18 `.fungi` edits and their two paired tests in `galerina-test` | Preserved separately under the existing conversion hold. | Owner-account and verify this slice separately; no bulk regeneration is implied. |

No excluded path was reset, deleted or silently incorporated. Existing security
policy questions and findings in the security continuation report remain open
unless separately verified and adjudicated.

## Publication and graph freshness

This document records the local checkpoint, not a prediction that a network
push will succeed. The publication receipt must compare the actual remote main
SHA with the final local commit after pushing. Post-commit code-index freshness
is a separate receipt and must not be inferred from these package reports.
