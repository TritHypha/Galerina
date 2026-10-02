# Resolution continuation — 2026-09-22

Status: INCOMPLETE_NON_AUTHORITATIVE. Candidate is a dirty worktree on
`91b4dec08fe4376febc9494a8023bd02912b8695`; this is not clean-head evidence,
independent clearance, or production admission. No commit/push, signing,
conversion queue, corpus build or `.fungi` edits were performed in this slice.

## JSON v1 encoding work bound

Owner: `packages-ts/galerina-data-json/src/json-value.ts`, `encodeJsonValue`
and `encodeNode`; public compiler consumer is `src/stdlib.ts` in
`packages-ts/galerina-core-compiler`. Existing contract owner: RD-1289.
No fractional/Decimal semantics were widened.

The old encoder only checked final UTF-16 string length; its `remaining`
budget was never debited. A string of 524,288 `é` characters was accepted
although its quoted UTF-8 representation is 1,048,578 bytes, above 1 MiB.
Aggregate over-budget input also continued to visit later child values.

The repair charges one shared budget before constructing output fragments,
including strings, escapes, keys, scalar text and structural punctuation.
It retains a final UTF-8 byte guard. Positive exact-boundary controls and
ordinary escaping/taint behavior remain admitted.

Tests: `packages-ts/galerina-data-json/tests/json-encode-budget.test.mjs`.
Before repair: 2 positive controls passed, 3 adversarial controls failed.
After repair: 6/6 focused; full data-json package 39/39, zero skips.
Typecheck and build exited 0. A review-found diagnostic regression was also
fixed: duplicate keys are checked before budget accounting, preserving
`FUNGI-JSON-003` rather than returning the budget error. These are author-run
development checks.
Independent candidate review remains pending.

Source/test/config input-set SHA-256:
`049e5634ae60bdb2f391c57b5041ae31480a140eec281ddc73d2733353a9538f`.
The local task receipt set is `resolution-json-receipts/` (inputs, validated
audit map, result and logs). It is not a repository-wide assurance receipt.

## Independent review remains open

Actual Astra Ultra reviewer `01a0c9ed-234a-7c91-bb2f-732374aa4c93`
reported two Q1 defects before its service interrupted the review:

- `packages-ts/galerina-core-compiler/src/wat-emitter.ts:836`: nested secret
  return cleanup can erase live caller allocations; reported independent
  fixture expected 14 and returned 7.
- `packages-ts/galerina-core-compiler/src/wat-emitter.ts:698`: host cleanup
  fills to the end of exported memory, including unrelated memory beyond
  the active heap.

Reviewed emitter SHA-256:
`d92045ca648945d09bcbf736bb458b54413131e59fd5e8deb24ec5b5c681400a`.
These are reviewer-reported reproductions; the parent has inspected the
source but has not independently rerun those fixtures or repaired this
boundary. Do not represent the interrupted review as completed approval.

## Estate reconciliation

Scan `0f6063dd-cf7c-409d-852a-0aca46df30cc` reports 124 findings (4 high,
68 medium, 52 low). The inventory worker found cluster-level closure
reports, not a complete per-finding closure mapping. Current status totals
therefore remain NOT_VERIFIABLE; neither all-open nor all-closed is justified.
The next reconciliation must preserve finding IDs and connect each to
current source, tests, receipts and any remaining engineering dependency.

The constitution remains a discussion draft. Its custody/version/amendment
and guarantee-register metadata were clarified in the KB; it was not adopted.
Settled owner decisions are not reopened by these engineering findings.
