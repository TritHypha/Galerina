# Astra review prompt: coupled RD-1413–1415 design v0.1

## Role
You are an independent, adversarial architecture reviewer. Read the exact Galerina working-tree design and source files specified below. Do not assume prior reviewer conclusions are correct.

## Intended use
This is a read-only review of the proposed written contract before owner approval and before an implementation plan. Your output is advisory. It must not claim product integration, RD closure, physical erasure, or production clearance.

## Scope
Review `docs/superpowers/specs/2026-10-05-coupled-rd-1413-1415-design.md` against the exact current Galerina branch, dirty source, the three private RD owner records, and the cited model-review evidence. Do not modify files, run broad tests, refresh indexes, contact owners, commit, or push.

## Constraints
- Verify current branch, HEAD, dirty status, and SHA-256 of each cited source/owner artifact before evaluating its claims. If bytes differ from the design's pins, report drift and evaluate the current bytes separately.
- Treat source/index results as locators. Open exact owner source before confirming a code claim. Treat graphs, fixtures, TypeScript tests, model consensus, and design prose as non-authorizing.
- Keep private RD bodies in their owning KB; report only the minimum status/locator needed, not copied private prose.
- Separate directly confirmed facts, inference, recommendation, and unknowns. Do not invent an operation, object/version, principal, Signet issuer/revoker, provider/key custodian, recipient, bound, supported host profile, or TCB.
- The design's `POST /auth/verify` candidate and governed `/secure` route must not be upgraded into a real protected operation absent direct source evidence.

## Established facts to verify
- The design is version 0.1, draft/non-authorizing, based on branch `codex/rd1413-1415-coupled-route-20261004` at `e1c2496f3f36d154a445ba9c302401ccaaf74bae`, with a dirty tree.
- The current kernel imports a TypeScript secret gate; `secret-gate.fungi` is a host-presence fold, not a secret-byte runtime.
- `verifyPasswordService.fungi` uses a hard-coded fixture hash; the separate `verifyPassword.fungi` calls `Secrets.get` but is not the loaded protected route. The Deno adapter returns 503 for `/auth/verify` while the execution bridge is pending.
- Private owner states remain: RD-1413 `HOLD_REAL_OPERATION / SYNTHETIC_INPUT_HANDOFF_ACCEPTED`; RD-1414 `HOLD_REAL_OPERATION_AND_PRODUCT_ADOPTION / PRODUCT_NON_AUTHORIZING`; RD-1415 `HOLD_REAL_RELEASE_AND_STORAGE / NON_AUTHORIZING`.
- Owner-selected principles include Fungi-owned authorization and protected byte custody, no TypeScript authorization decision or plaintext custody, Amazon Linux as primary server target, Windows 10 remote-only, `/secure` as an intended governed route shape, and ECC/RAS only as a reliability layer alongside one bounded protected staging-and-verification region (not a second plaintext copy).

## Questions

1. **Coupled lifecycle and threat-model completeness:** Falsify the spec's shared RD-1413/1414/1415 state machine. Look for missing or contradictory authority/custody transitions, Signet binding, acquire/revoke/open/release linearization, hidden aliases/scratch/borrowers, graph tampering, ECC/RAS fault provenance, bounded accounting, cleanup acknowledgement, generation reuse, audit/recovery, and fail-closed exits. Give the smallest concrete counterexample for each material flaw and the direct observable that would expose it.

2. **Source fidelity and implementation readiness:** Compare every source-specific statement and pinned hash to the current checkout and owner states. Determine whether the spec's host/guest-kernel/TCB statement, Fungi/TypeScript boundary, route description, revocation mechanism, and acceptance tests are accurate and implementable without inventing facts. Identify any requirement that needs an owner decision or a platform/runtime capability before a plan can be written. Distinguish `NOT_VERIFIABLE` from negative proof.

## Required inspection and proof map
For each question, cite repository-relative path plus exact line/symbol or owner-state field, and report its current SHA-256. The spec/source diff itself is not evidence that a requirement is implemented.

| Target | Direct observable | Weaker proxy that cannot pass |
|---|---|---|
| Complete coupled lifecycle | One consistent authority-to-bytes-to-recipient-to-cleanup state sequence with refusal outcomes and explicit owner boundaries | Diagram prose, graph edges, model agreement |
| Real protected operation | Loaded handler plus direct six-link source chain and named object/version/provider/recipient | Route name, fixture, CLI, framework seam, census alone |
| Revocation/open/release order | Source-backed linearization primitive and deterministic event ordering | Final revocation read followed by open/write |
| Cleanup/reuse | All mediated regions/borrowers accounted; positive wipe acknowledgements; retirement then fresh generation | `finally` call, zero graph rows, synthetic test |
| Host/TEE boundary | Selected target profile and measured evidence bind the stated TCB and key-release refusal | Amazon Linux label or untrusted host health Boolean |

If direct evidence is missing, mark the relevant claim `NOT_VERIFIABLE` and name the smallest source or owner decision needed. Do not solve missing facts by proposing invented identifiers as if they exist.

## Output contract
Return:
1. `PASS`, `PARTIAL`, or `NOT_VERIFIABLE` for each of the two questions.
2. A ranked table of findings: severity, confidence, exact spec location, contradicted invariant/source, smallest correction, and whether it blocks owner approval or only implementation.
3. A concise exact-head/source-pin receipt and whether every cited hash matched.
4. The minimum owner-decision register before implementation, separating already approved policy from open product/platform facts.
5. One smallest next action. No edits or implementation.

## Exclusions
Do not redesign the project from scratch, add another route as evidence, select owner identities, lower the zero-trust boundary, treat ECC as malicious-writer protection, or claim any RD is closed.

## Self-rejection
Mark the review `PARTIAL` or `NOT_VERIFIABLE` if you cannot inspect the exact current source and owner states, any material pin differs, the spec's real operation is not found, or any conclusion relies only on the report, index, fixture, test, or model opinion. A green test or clean document lint is not product proof.
