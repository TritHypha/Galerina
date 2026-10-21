# Q43 parity: cleanup-evidence.fungi (ts_oracle: NONE)

ts_oracle: NONE. No TypeScript source is converted. Rules encoded from RD-0778 Addendum D (cleanup-evidence binding enforcement) and RD-1414 (byte custody, aliases, cleanup on every exit, quarantine), cited by path and sha only.

Workbench capsule REFUSE `REFUSED` / `evidence:DECODER_UNAVAILABLE`. HOST/FUNGI views typed UNKNOWN. C2 applied under Q31-05 ruling. PROPOSED never permission.
CN-1: import the frozen helper and CALL it. check 0; build FUNGI-NAME-001; run WAT callee neither defined nor imported. Tests flatten helper body plus this unit for invoke.

RD-0778 object cite only: path `ZTF-Knowledge-Bases/private/research/rd/RD-0778-atomic-hostcall-reply-adjudication-PRIVATE.md`, sha256 `9a752d97a761b5b1e44aa620be7ea21ce3091a829fc9e7784d63a014e99dc61a`, kbCommit `f86212ce95db15451739c9c8eb8bc361c1a5d6d4`.
c-boundary.fungi git blob `cfec32c93d0cf611010042cb6843d5af5ba6a78a` (q32 ACK base; differs from q31 `a92a3271`; not reconciled).

| rule | fungi_ref | verdict | obligation id | probe |
|---|---|---|---|---|
| sealed {opId, generation, obligationSetDigest, status} | mintCleanup + mintedToken | NEEDS_LANGUAGE | UNFORGEABLE_CAPABILITY | constructor seal missing; unminted mintedToken 0 -> 109 |
| status closed sum DONE/NOT_REQUIRED/PENDING/FAILED/UNKNOWN | evStatus 0..4 else 11 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | unlisted status 111 |
| admitCleanup DONE all three equal | admitCleanup evStatus 0 | PRESERVED | CLEANUP_EVIDENCE_BINDING | bound DONE 100 |
| admitCleanup NOT_REQUIRED listed empty class | emptyObligationClass 0/1 | PRESERVED | CLEANUP_EVIDENCE_BINDING | opClass 0/1 -> 101 |
| NOT_REQUIRED nonempty | emptyObligationClass 2/3 | PRESERVED | CLEANUP_EVIDENCE_BINDING | opClass 2/3 -> 108 |
| unlisted opClass every status | unlistedOpClassRefuseOn before status arms | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | opClass 9 and 2147483647 -> 111 |
| opId mismatch unique code | opIdMismatchCode 2 | PRESERVED | CLEANUP_EVIDENCE_BINDING | 102; op A vs B |
| generation mismatch unique code | generationMismatchCode 3 | PRESERVED | CLEANUP_EVIDENCE_BINDING | 103; gen N vs N+1 |
| digest mismatch unique code | digestMismatchCode 4 | PRESERVED | CLEANUP_EVIDENCE_BINDING | 104 |
| status PENDING unique code | pendingRefuseOn | PRESERVED | CLEANUP_EVIDENCE_BINDING | 105 before begin REFUSE |
| status FAILED unique code before begin | evStatus 3 | PRESERVED | CLEANUP_EVIDENCE_BINDING | 106 before begin REFUSE |
| status UNKNOWN unique code before begin | unknownRefuseOn | PRESERVED | CLEANUP_EVIDENCE_BINDING | 107 before begin REFUSE |
| unminted unique code | mintedCheckOn | PRESERVED | CLEANUP_EVIDENCE_BINDING | 109 |
| after-begin PENDING/FAILED/UNKNOWN -> QUARANTINED + DELIVERY_UNKNOWN | afterBeginPending/Failed/UnknownCode 6 | PRESERVED | TOTAL_EFFECT_OUTCOME | 106 never 102 never 100; resource 121 |
| after-begin DONE/NOT_REQUIRED -> DELIVERY_UNKNOWN | afterBeginDone/NotRequiredCode 6 | PRESERVED | TOTAL_EFFECT_OUTCOME | 106 never 100; resource 121 (no binding inputs) |
| after-begin phaseToken 0 own code | phaseBeforeBeginCode 12 | PRESERVED | EXHAUSTIVE_FAIL_CLOSED | 112, not 111 |
| QUARANTINED reuse/release refuse; wipe then destroy | resourceTransition | PRESERVED | TOTAL_EFFECT_OUTCOME | 114/115; wipe 122; destroy-without-wipe 116; destroy 123 |
| free is not wipe | freeStep action 0 | PRESERVED | LINEAR_SECRET | 117; explicit wipe 118 wipe-step-reported |
| digest equality, not constant time | digestEqual | NEEDS_LANGUAGE | LINEAR_SECRET | CONSTANT_TIME_COMPARE native intrinsic missing |
| every foreign value through helper | readForeignSafeInteger CALL | PRESERVED | NO_NULL_NAN | classTag 3 -> 110; unlisted 11 -> 111 on opId/gen/digest pairs |
| COMMITTED unreachable after begin | afterBegin DONE 106 | INTENDED_DIVERGENCE | TOTAL_EFFECT_OUTCOME | W1 policy; never 100 after begin |
| WIPED reuse/release refuse | wipedReuseRefuseOn / wipedReleaseRefuseOn | PRESERVED | TOTAL_EFFECT_OUTCOME | 114 / 115 |
| no clock | no time construct | PRESERVED | MONOTONIC_TYPED_TIME | MONOTONIC_TYPED_TIME CARRIED_UNKNOWN |
| HOST_ADAPTER_PRESENCE | host maps tags | CARRIED_UNKNOWN | HOST_ADAPTER_PRESENCE | Q44 not on this base |
| import CALL link | classTag gate kept | NEEDS_LANGUAGE | NO_NULL_NAN | B5 check 0 / build FUNGI-NAME-001 / run WAT undefined callee |

Counts: PRESERVED 20, INTENDED_DIVERGENCE 1, UNKNOWN 0, NEEDS_LANGUAGE 3, CARRIED_UNKNOWN 1 in the table (MONOTONIC/HOST also carried in receipts). Unlisted verdict refuses.

## Notes

N1. Constructor sealing is NEEDS_LANGUAGE. mintedToken 1 is the mint path observation; a host can still forge it. admitCleanup refuses mintedToken 0 with code 9.

N2. CONSTANT_TIME_COMPARE is NEEDS_LANGUAGE. digestEqual is host-mapped Int equality. crypto.timingSafeEqual is not a mechanism.

N3. Astra W1/W3/W5: COMMITTED unreachable after begin (policy). UNKNOWN is never success, zero-effect proof, or retry. No automatic retry after DELIVERY_UNKNOWN.

N4. Do not rebase onto fc7db4db. c-boundary blob on this base is cfec32c9.

N5. WebAssembly zeroing is best effort; no erase claim (MB-11/MB-14).
