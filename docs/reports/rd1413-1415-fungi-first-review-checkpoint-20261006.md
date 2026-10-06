# RD-1413–1415 Fungi-first review checkpoint — 2026-10-06

Status: **HOLD / NON_AUTHORIZING**. This is a review-state and backlog record,
not a language specification, implementation approval or runtime-security receipt.

## Scope and evidence pin

Review commit: `e26b1e3ea084a1439a4c939edaa29357892a132f`, branch
`codex/rd1413-1415-coupled-route-20261004`. The checkout still matched that HEAD
before this documentation update. No memory code was changed or tested by this
update. Documentation changes after the pin are not part of its review evidence.

The owner correction remains binding: Galerina is a new `.fungi` language whose
memory, allocation, aliasing and effect rules can be designed. TypeScript is
bootstrap/reference evidence, not a ceiling on target-language guarantees.
Proposed semantics must still be implemented across compiler, lowering, runtime,
FFI and the accepted host boundary and supported by coupled end-to-end evidence.

## Review receipts

These are review identities, not security approvals. Full retained answers stay
in the existing review workspace/bridge; do not reconstruct them from this digest.

| Review | Identity | Current disposition |
|---|---|---|
| Initial independent Astra | Agent `01a11051-ae4f-7cf0-88b4-7969e6ababd0` | Complete; target runtime remains NOT_VERIFIABLE |
| Grok.com follow-up | Response `8c77b130-a9d0-43b0-b3c0-361915cfec08` | Complete; advisory, partial source/proposal coverage |
| Astra adjudication of Grok.com only | Submission `01a11061-a486-7ce0-98ce-bfbe2bf69c07` | Complete; distinct from initial Astra review |
| Grok-Bot follow-up | `grok-bot-rd1413-1415-fungi-first-followup-20261006-answer-01` | Received; new claims not yet independently adjudicated |
| SuperGrok follow-up | `codex-supergrok-rd1413-1415-fungi-first-astra-followup-20261006-01` | Delivered; no matching answer in the dedicated outbox at this checkpoint |

Grok-Bot's envelope names the matching assignment
`codex-grok-bot-rd1413-1415-fungi-first-astra-followup-20261006-01` and records
`createdAt: 2026-10-06T08:55:49.417Z`. Its CLOSED status belongs to the answer,
not to the RDs. The received bytes were checked against these SHA-256 hashes:

- Answer envelope: `6ACD96C09F1CD1448EA5B620B883856D66088BDD1BD8BBAEB5137DA54A6F14CE`.
- Full Grok-Bot report: `86DE70C1562AE712E6B0702353B0F985CE5DC61961E7CFBB563916E084C44652`.
- Retained Astra Grok.com-only delta: `7BDAFF52F8E6EEC559D9DE1902FF5C7F83AA2CFC7B3AED774EBE04B17041601F`.

Hash comparisons must state their byte basis. Windows working-tree bytes,
Git blob bytes and normalized review copies are different artifacts; a line-ending
conversion alone must not be mislabeled either a source change or byte identity.

## Adjudicated clarifications, not implemented guarantees

Astra's Grok.com-only delta preserves the candidate design while correcting two
overbroad formulations. An explicitly authorized result may reach its bound
recipient in the agreed representation; this does not authorize an ordinary-value
escape beforehand. A capability minted before invalidation may exist historically
but must be unusable at every later release attempt. An UNKNOWN acknowledgement
permits authenticated reconciliation of that transaction, not automatic replay,
reminting or redisclosure. None of these review conclusions proves enforcement.

## Outstanding work, grouped by responsibility

1. **Review completion:** verify Grok-Bot's distinct checker/declassifier,
   staging-custody and output-mediation claims against the pin; obtain independent
   Astra adjudication before adopting them. Await the existing SuperGrok reply,
   deduplicate overlap and adjudicate only genuinely new material conclusions.
   Reported candidate escapes are not reproduced vulnerabilities in this record.
2. **Engineering:** complete the protected lease/derived-value boundary through
   checking, lowering, runtime/FFI and cleanup. Establish a test-visible ordering
   point spanning actual provider and sink effects, including remote fencing,
   invalidation, stale generations, rollback and recovery. These are engineering
   obligations, not reasons to ask the owner to choose low-level locking code.
3. **Runtime/host evidence:** bind emitted and actually loaded artifacts, accepted
   host/TCB facts, protected allocation/lease behavior, drain/wipe acknowledgements,
   quarantine/reuse accounting and independently observed provider/sink events.
   Include successful authorized operation controls as well as refusal schedules.
   TypeScript tests and model agreement do not satisfy this evidence boundary.
4. **Owner facts:** identify a real non-fixture operation by path, symbol and commit,
   authenticated principal, object/version, issuer/revoker, provider/key custodian
   and recipient/storage sink. Finalize exact accepted deployment/TCB, freshness
   and recovery authority, permitted output/storage obligations, crypto policy
   and workload/capacity bounds. Prior platform directions are not erased; the
   unresolved task is an exact accepted profile and its evidence.

No integrated protected operation was established by the retained reviews within
their inspected kernel/provider/example scope. That is a scope-qualified evidence
gap, not a repository-wide absence theorem. Do not substitute `/auth/verify`, a
greeting route or a fixture for the missing operation and authority manifest.

## Operational continuity

Session housekeeping completed at `2026-10-06T09:04:20.118Z` with
**REFUSED (underlying exit 2)**: the bounded-execution audit reported 800 static
findings (exit 1), then context-cost failed with `Maximum call stack size exceeded`
(exit 2). The later housekeeping inventory was not run. This is not a clean
repository assessment, and no archive/transfer-bundle coverage is claimed.
Disposition for this request is limited to recording findings and preparing
documentation/memory/handoff continuity; implementation and release stay on HOLD.
The retained private housekeeping report is the authority for the diagnostic
output. No bulk source repairs were attempted.

The bridge capacity incident was recovered by archiving only already-CLOSED
envelopes with existing duplicate-ID claims and preserving hashes and guards.
That recovery is not evidence of reviewer pickup. Searches of ignored bridge
runtime directories must explicitly include ignored files or use the canonical
collector. Do not duplicate review delivery because an ignore-filtered search
returns no results.

The current work remains native-Windows-only. No WSL, code implementation,
commit, push, merge, private RD-owner mutation or product clearance occurred in
this documentation reconciliation. The final blocker report remains pending the
bounded review completion above.
