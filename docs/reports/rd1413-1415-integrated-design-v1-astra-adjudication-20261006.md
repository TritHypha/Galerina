# Astra adjudication — coupled RD-1413–1415 design v1.0

Publication note: machine-local artifact references and links have been normalized to repository-relative or local-task locators. Recorded review-input hashes retain their historical meaning; review conclusions are unchanged.

**Disposition:** design-level constraints may remain in a non-authorizing draft;
product lifecycle is NOT_VERIFIABLE and evidence integration is PARTIAL. Correct
the mapper source-hash transcription, version-bound the next citations, and
clarify the output authority transition. All three RDs remain HOLD /
NON_AUTHORIZING.

## Review custody and pins

- Reviewer agent: `01a10e4c-1cee-7232-80d5-2d5a4ecb9b48` (`gpt-6-astra`, High).
- Prompt: `docs/reports/rd1413-1415-integrated-design-v1-astra-review-prompt-20261005.md`,
  SHA-256 `56E0777447FFB9D71CC4F12EC27DEA79C422DD9734EA43BBC2B897D54D37003B`.
- Reviewed design v1.0: SHA-256
  `3C7CAE5E976596C891B1E7E375127AC82D8B3BF7074725F17FCA49A1330A2C11`.
- The mapper report bytes Astra reviewed are preserved exactly as
  `docs/reports/rd1414-zero-copy-mapper-review-input-20261005.md`, SHA-256
  `06B8F517078F8AA9AA3BAA960C431CCAAF324FBDB313F90CA28B9BABD40E32C8`.
  The corrected current report is
  `docs/reports/rd1414-zero-copy-mapper-current-state-20261005.md`, SHA-256
  `4754BE0EF2437DA29F41B49FF910B55306988D01BAB39F118994FC2C20B9A39B`.
- Supporting evidence hashes were checked as listed in the complete reply
  below. The reply arrived in the reviewer task; no separate response artifact
  hash was supplied. The complete reply is preserved below with machine-local links normalized for publication.

## Codex adjudication

| Review vector | Astra result | Codex disposition |
|---|---|---|
| Coupled lifecycle and ordering | NOT_VERIFIABLE at product/runtime scope | **UPHELD.** The draft now states the required terminal-effect serialization and race-test contract, but no selected Fungi runtime/ABI or sink proves it. Add explicit separation between retiring the input lease and retaining only grant-limited output authority. |
| Evidence/adoption boundary | PARTIAL | **UPHELD, then corrected:** Astra correctly found that the printed mapper source SHA was malformed. Codex recalculated the actual file SHA as `4176C253BCE7BE488CB74091A67F3F2EE02DBFF660C093F880C1D38C76E721E6`. The package test was freshly rerun after source-hash capture; its result is recorded in the mapper report. This does not prove runtime/product integration. |

The historical v0.8 reply retains its original wording, including its old line-number
links. Those links point to the prior design version; the current design uses
versioned headings and citations in this adjudication. Astra's mapper-report
input was also preserved byte-for-byte after its source-hash transcription was
found defective; the corrected current-state report is a separate artifact.
Astra correctly noted that a matching report digest alone does not validate
the claims or embedded source hashes in that report.

## Complete Astra reply

```text
Vector 1: **NOT_VERIFIABLE**. Vector 2: **PARTIAL**, with a confirmed malformed mapper source hash. v1.0 can remain a **non-authorizing draft with these findings attached**; its mapper evidence must not be accepted as fully source-pinned.

**CONFIRMED — artifact verification.** All four SHA-256 values specified in the prompt matched direct file-byte calculations before review and again afterward:

| Artifact | Verified SHA-256 |
|---|---|
| Design v1.0 | `3C7CAE5E976596C891B1E7E375127AC82D8B3BF7074725F17FCA49A1330A2C11` |
| Re-entry adjudication | `E6E4F616B1AD22E9BA6F8B98C1F6C2F95ECC3982BB8460C4FAC26C6C31551781` |
| Astra delta adjudication | `C2877ED68A135778B2C9285ED7D84626AD5170ED6A7E6761037419B664FDEA27` |
| Mapper report | `06B8F517078F8AA9AA3BAA960C431CCAAF324FBDB313F90CA28B9BABD40E32C8` |

The four re-entry source/test pins, mapper test pin, and two prior review-prompt pins also matched. Matching a report’s hash does not validate the claims or hashes inside it.

1. **Coupled lifecycle and ordering — NOT_VERIFIABLE**

   **CONFIRMED — document-level constraint.** Stages 7–10 require effect-boundary serialization, input/scratch cleanup before release, recipient-bound commit, and output cleanup before reuse. Invariant 11 explicitly invalidates queued work that has not yet linearized and preserves truthful accounting for earlier effects. This addresses the prior review’s stated ordering omission. See [design, “Coupled lifecycle,” stages 7–10](../superpowers/specs/2026-10-05-coupled-rd-1413-1415-design.md), [invariant 11](../superpowers/specs/2026-10-05-coupled-rd-1413-1415-design.md), and [delta report, “Codex adjudication”](rd1413-1415-reentry-design-delta-astra-adjudication-20261005.md).

   **PLAUSIBLE — smallest counterexample to an incomplete implementation:** validate live operation → enqueue storage write → terminal refusal invalidates the runtime operation → storage commits using the earlier authorization. The draft forbids this sequence, but the packet establishes no mechanism preventing it. This is a hypothetical implementation failure, not an observed protected-runtime bypass.

   **NOT_VERIFIABLE — missing observable and owner binding.** No selected runtime/ABI and sink mechanism demonstrates a shared ordering point between terminal invalidation and irreversible commit. The required same-operation/generation paused-commit test and allowed-order control are specified, not executed. See [design, “Required evidence and test plan,” release row](../superpowers/specs/2026-10-05-coupled-rd-1413-1415-design.md) and [delta report, missing negative test](rd1413-1415-reentry-design-delta-astra-adjudication-20261005.md).

   **Bounded next action:** document the runtime-to-sink terminal/commit transition and responsible enforcement owner, including how stage 8’s input-lease retirement preserves only the intended output authority. Attach the existing race-test observables; leave mechanism selection and execution pending owner decisions.

2. **Evidence and adoption boundary — PARTIAL**

   **CONFIRMED — source-pin defect.** The [mapper report, “Exact source and execution”](rd1414-zero-copy-mapper-current-state-20261005.md) and [design provenance table](../superpowers/specs/2026-10-05-coupled-rd-1413-1415-design.md) both print this **63-character** mapper source hash:

   `4176C253BCE7E488CB74091A67F3F2EE02DBFF660C093F880C1D38C76E721E6`

   Two direct calculations instead returned:

   `4176C253BCE7BE488CB74091A67F3F2EE02DBFF660C093F880C1D38C76E721E6`

   **NOT_VERIFIABLE:** the claimed historical execution-to-source binding cannot be established from that malformed pin. A transcription error is plausible, but not proven.

   **CONFIRMED — representation is appropriately bounded.** The design accurately carries forward the report’s snapshot/backing cleanup, surviving independent copies, mutable views/backing access, absent shared-user quiescence, and scoped absence of app-kernel runtime calls. Neither document establishes physical erasure, complete alias cleanup, protected Fungi custody, or route integration. See [design, “Adjacent ZeroCopyMapper evidence”](../superpowers/specs/2026-10-05-coupled-rd-1413-1415-design.md) and [mapper report, “Confirmed local behavior and limits”](rd1414-zero-copy-mapper-current-state-20261005.md).

   **CONFIRMED — recorded counterexample:** the report records original bytes becoming `[0,0,0]` while a retained copy remains `[65,66,67]`. This defeats any inference from disposal to complete erasure. The 48/48 tests and observation remain attributed report evidence; I did not rerun them.

   **CONFIRMED — citation drift.** The preserved v0.8 reply cites lifecycle at line 144 and evidence at line 179; those sections now begin at lines 177 and 223. Its historical citations target the mutable design file. See [delta report, preserved reply](rd1413-1415-reentry-design-delta-astra-adjudication-20261005.md).

   **Bounded next action:** reconcile the malformed source pin against the original run evidence, add version-bound historical citation targets, and repin the amended packet. Merely inserting the missing character would not establish historical execution provenance.

No files were edited, shell commands or tests run, or private RD bodies inspected. RD-1413, RD-1414, and RD-1415 remain **HOLD / NON_AUTHORIZING**. No product or runtime closure is established.
```
