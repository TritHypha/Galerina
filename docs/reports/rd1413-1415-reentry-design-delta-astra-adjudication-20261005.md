# Astra adjudication: RD-1413–1415 re-entry design delta

Publication note: machine-local artifact references and links have been normalized to repository-relative or local-task locators. Recorded review-input hashes retain their historical meaning; review conclusions are unchanged.

**Adjudication:** PARTIAL. The v0.8 delta is safe to retain as a proposed
constraint, but its lifecycle ordering proof is incomplete. The complete
design remains DRAFT FOR OWNER REVIEW / NON_AUTHORIZING. No RD or product state
changes.

## Attempt and exact pins

- Reviewer agent: `01a10e47-24d1-7682-a574-9a243bf5750e` (`gpt-6-astra`, High).
- Prompt: `docs/reports/rd1413-1415-reentry-design-delta-astra-review-prompt-20261005.md`,
  SHA-256 `737CA5D5C8C9986DD367DFDE53EAABB5A08C5E853DB774E68DE9C4048C286B33`.
- Reviewed design v0.8: SHA-256
  `7ECC78BD97956C18A6FEE9A4ECFE89BC73F2EAD2B8D73B91E37ED1B2B1D1C4B1`.
- Re-entry adjudication report: SHA-256
  `E6E4F616B1AD22E9BA6F8B98C1F6C2F95ECC3982BB8460C4FAC26C6C31551781`.
- Astra verified those two artifact hashes and all four source/test pins in
  the adjudication report. The response arrived in the reviewer task and was
  not supplied as a separately hashed response artifact; the full reply is
  preserved below.

## Codex adjudication

| Vector | Astra result | Codex disposition |
|---|---|---|
| Trust boundary and lifecycle | PARTIAL | **UPHELD** that the proposal addresses the already-disclosed-copy path only if complete mediation holds. **UPHELD** missing serialization/linearization between terminal invalidation and already admitted or queued effects. |
| Proof and integration | PARTIAL; product integration NOT_VERIFIABLE | **UPHELD.** Add a same-operation/generation race test at the irreversible commit boundary, with both a terminal-invalidation refusal case and an allowed-order control. Do not infer product proof from HTTP status or callback fixtures. |

The queued-effect scenario is a plausible failure mode for a future incomplete
runtime, not an observed bypass in current protected Fungi code; no such
protected runtime was established. The next design delta must specify how
terminal failure serializes against in-flight and queued secret-dependent
effects, release/commit, and borrower drain. Earlier completed effects must be
reported truthfully and cannot be represented as erased or rolled back.

## Complete Astra reply

```text
**Overall: PARTIAL. The delta is safe to retain as a proposed constraint**, with the lifecycle/proof clarification below. The complete design remains **DRAFT FOR OWNER REVIEW / NON_AUTHORIZING**.

**Artifact verification — CONFIRMED.** SHA-256 hashes calculated directly from file bytes match:

| Artifact | Verified SHA-256 |
|---|---|
| Design v0.8 | `7ECC78BD97956C18A6FEE9A4ECFE89BC73F2EAD2B8D73B91E37ED1B2B1D1C4B1` |
| Adjudication report | `E6E4F616B1AD22E9BA6F8B98C1F6C2F95ECC3982BB8460C4FAC26C6C31551781` |

All four source/test hashes also match the pins in the report’s [“Scope and custody,” lines 19–26](rd1413-1415-secret-access-reentry-adjudication-20261005.md).

1. **Trust boundary and lifecycle — PARTIAL**

   **CONFIRMED — document consistency.** The [design’s “Source-pinned re-entry adjudication,” lines 50–67](../superpowers/specs/2026-10-05-coupled-rd-1413-1415-design.md) correctly addresses the recorded residual by prohibiting the initial unrestricted plaintext handoff and requiring protected-runtime mediation. It explicitly rejects retrospective revocation through a TypeScript token, cleanup, or HTTP 500.

   The report’s [“Findings,” lines 37–45](rd1413-1415-secret-access-reentry-adjudication-20261005.md) records the discriminating sequence: receive bytes → catch nested refusal → copy bytes → HTTP 500, one provider acquisition, original wiped, copy survives. **CONFIRMED** here means that the pinned report records this result and the inspected source is consistent with it; I did not reproduce execution.

   **PLAUSIBLE — proposed mitigation.** An opaque, object/version-bound operation can eliminate this particular host-callback copying path **if complete mediation actually holds**. Opacity alone is insufficient.

   **Missing lifecycle proof:** terminal invalidation must serialize with already admitted or queued secret-dependent work, including the final effect/commit boundary. The [“Coupled lifecycle,” stages 7–10, and invariants 5–10](../superpowers/specs/2026-10-05-coupled-rd-1413-1415-design.md) contain the relevant containment, cleanup, ordering, and reuse requirements, but no selected runtime mechanism establishes their composition.

   **PLAUSIBLE counterexample to an incomplete implementation:** work checks a live handle and queues an effect; nested access then makes the operation terminal; the queued effect commits using its earlier authorization. This would violate the proposed constraint—it is not a demonstrated bypass of an implemented protected runtime.

   **Bounded next step:** specify where terminal invalidation linearizes against in-flight effects and release, and how queued work and borrowers are cancelled or drained. Preserve truthful accounting for effects that completed earlier.

2. **Proof and integration — PARTIAL; product integration NOT_VERIFIABLE**

   **CONFIRMED — useful but incomplete discrimination.** The [“Required evidence and test plan,” lines 179–193](../superpowers/specs/2026-10-05-coupled-rd-1413-1415-design.md) distinguishes protected consumption, terminal refusal, release suppression, cleanup acknowledgements, and fresh-generation reuse.

   The pinned candidate tests distinguish timing: the [pending-delivery case](../../packages-ts/galerina-framework-app-kernel/tests/secret-gate.test.mjs#L700) asserts zero consumer calls; the [during-consumption case](../../packages-ts/galerina-framework-app-kernel/tests/secret-gate.test.mjs#L654) asserts HTTP 500 and call counts but does not assert post-refusal copying. Consequently, those assertions cannot establish containment after disclosure.

   **Single most important missing negative test:** pause an admitted secret-dependent effect immediately before its irreversible commit, force terminal nested-access refusal, then resume it. Observe the actual effect/sink boundary and establish **zero commits after terminal invalidation**, bound to the same operation and generation. Pair it with an allowed-order control so a disconnected or always-zero observer cannot pass. HTTP status alone is inadequate.

   The existing copied-byte sequence should remain a candidate-level discriminating control; the protected-runtime test must additionally establish that host code never receives that raw view in the first place.

   **NOT_VERIFIABLE:** a loaded governed `/secure` route; real object/version and provider/key-owner binding; selected Fungi runtime/ABI and host boundary; complete alias/transfer mediation; actual release suppression; comprehensive cleanup and safe reuse. These gaps are explicitly identified in the report’s [“Findings,” lines 47–53, and “Design disposition and next step”](rd1413-1415-secret-access-reentry-adjudication-20261005.md).

   **Bounded next step:** refine the acceptance specification with that ordering test and its observables, pending the concrete runtime/ABI plan and owner review.

**Limits:** Read-only file inspection and in-process hashing only; no shell commands, tests, source execution, edits, or private RD-body inspection. Branch/head identity was supplied by the artifacts, not independently checked with Git. Reported historical test results remain attributed evidence. This review establishes no product, Fungi, runtime, host, implementation-readiness, or RD closure.
```
