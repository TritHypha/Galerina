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

## 2026-10-07 follow-up — operation candidate and residency delta

This dated addendum supersedes the preceding checkpoint's volatile review pin
and pending-review statuses only. It does not replace the original receipts or
their limits. Current Galerina pin is
`f7751c852444285ae74562b1dbf59778817b6117` on
`codex/rd1413-1415-coupled-route-20261004`; local HEAD matched origin and the
checkout was clean at this check.

### Exact-source correction: a real candidate, not yet the protected operation

The API-server bootstrap has a real secret-using operation candidate, so the
older blanket wording “no real secret-consuming operation” is too broad. The
verified symbol is
`packages-ts/galerina-framework-api-server/src/webhook-admission.ts::admitWebhookReplay`.
It uses `input.secret` for HMAC verification and replay identity before accepting
the request; `src/index.ts::handleRequest` passes the configured webhook secret
and dispatches only after admission. These three source/test files have no diff
between `d3f645fe2bb7ff4d0370608f6f4a13123d09fc1d` and current HEAD:
`packages-ts/galerina-framework-api-server/src/webhook-admission.ts`,
`packages-ts/galerina-framework-api-server/src/index.ts`, and
`packages-ts/galerina-framework-api-server/tests/webhook-admission.test.mjs`.
The earlier line-level source review therefore remains applicable at this pin.
This does not
make the candidate a qualifying RD-1413/1414/1415 protected operation: the
interface is an ordinary TypeScript `string | Uint8Array`, and does not bind a
principal, canonical protected object/version, grant issuer/revoker, provider
or key custodian, revocation generation, Fungi-owned lease, or authorized
durable recipient. The optional principal-resolution path is separate and is
not passed to `admitWebhookReplay`; its replay claim orders duplicate admission,
not provider revocation or output release.

The owner-selected `/secure` route shape has no live API-server handler. The
remaining owner choice is concrete: nominate the webhook path for protected
integration, or identify the exact `/secure` handler and protected object by
source path, symbol and commit. Do not substitute `/auth/verify`, a greeting
route or a fixture. Selection alone will not close an RD.

### Residency review delta and adjudication

- Grok.com responses `d68b1303-08a5-4f68-8453-bf678b1d5f60` and
  `970adc83-17ca-4267-adf1-d9664fa8e517` are distinct responses in the existing
  conversation. The latter withdraws the claimed source/test contradiction;
  the model behavior and its test agree. These browser response IDs are
  retained, but no local response-byte digest is recorded here.
- SuperGrok answer `supergrok-residency-wording-grok-astra-delta-20261007-01-answer-01`
  is retained in
  `AGENTS/coordination/model-reviews/supergrok-rd1413-1415-coupled-lifecycle-contract-20261005/reports/residency-wording-grok-astra-delta-supergrok-20261007.md`,
  SHA-256 `30B0F83107462A229AF28E62653E9A5FF3FC09FDA8A6CD56AA95EB03B5271D68`.
- Grok-Bot answer `grok-bot-residency-wording-20261007-answer-01` is retained
  in `AGENTS/coordination/session-exchange/reports/grok-bot-residency-wording-20261007-answer-01.md`,
  SHA-256 `4D95D468B4D1F744015C827B84D119CEEC1ACE1F01B7505694D87226F908323C`.
  It explicitly marks itself stale against `d3f645fe2`; it does not review the
  later HEAD. Do not count delivery as pickup or as a current-pin review.
- Independent Astra adjudication (reviewer task
  `01a11580-1bf1-7342-a04e-8849ef384103`) confirms that refusing disk-backed
  swap is a supportable conservative `no_disk` rule without weakening the
  secret default, and corrects Astra's earlier overstatement that this narrow
  refusal itself needs a new owner choice. The full media contract—including
  non-disk swap/persistence cases—and who may authorize any secret-loosening
  exception remain unresolved. The Astra result's response-byte digest is not
  retained in this repository; do not treat this line as a hash-verified review
  receipt.

The compiler model currently orders `no_disk` below `no_swap` and permits swap
under the former; its tests establish that model's reconciliation behavior, not
the physical storage medium or host enforcement. Disk-backed swap must refuse
for a conservative `no_disk` interpretation; the complete media matrix and
loosen-exception authority still need an explicit contract. The native Windows
focused residency test passed 20/20 in this session; that is bootstrap evidence,
not a runtime/FFI/host or physical-residency proof.

### Remaining work at this pin

1. Obtain the operation selection above and bind the full authority chain:
   authenticated principal; object and version; issuer and revoker; provider/key
   custodian; recipient or storage sink.
2. Implement the selected Fungi memory/ownership/aliasing/allocation/effect
   rules across the compiler, lowering, loaded runtime, FFI and accepted host;
   prove provider-open versus revocation and sink/release ordering at the actual
   effect boundary, plus cleanup, copy/alias accounting, quarantine and reuse.
3. Obtain the exact measured host/TCB and freshness authority; define output,
   storage/recovery, crypto and finite workload contracts; run discriminating
   end-to-end tests on the admitted profile. A bootstrap test or model review is
   not substitute evidence.
4. Reconcile current owner evidence in SLIDE/VOK, Lyth-Weaver and relevant KB
   research. That cross-repository reconciliation was not performed by this
   addendum.

RD-1413/1414/1415 remain **HOLD / NON_AUTHORIZING** until the selected real
operation has the required end-to-end evidence and owner adjudication. No RD
disposition, private owner file or product-clearance status changed here.

## 2026-10-07 follow-up — native WSL verification and cross-repository evidence

This addendum records focused local verification and current source findings.
It does not replace the earlier code pin, establish Fungi runtime guarantees,
or change any RD disposition. The Galerina checkout is on
`codex/rd1413-1415-coupled-route-20261004` at HEAD
`2a4ae02600d71ae7fdae4f6898199eee5fef9079`, matching its upstream branch and
clean before this documentation-only addition. The previously recorded source
pin remains `f7751c852444285ae74562b1dbf59778817b6117`; do not conflate that
source pin with the later documentation HEAD.

### Focused local tests (not Git CI)

- In WSL, `npm run typecheck`, `npm run build`, and
  `node --test tests/webhook-admission.test.mjs tests/api-server.test.mjs`
  passed in `packages-ts/galerina-framework-api-server` (21/21 tests). This
  checks the bootstrap API's HMAC/replay admission and dispatch behavior. It
  does not demonstrate a production `/secure` operation, a Fungi authority
  chain, or secret-byte custody at a Fungi/FFI/host boundary.
- In WSL, `cargo test --locked --offline --manifest-path
  packages-ts/galerina-core-runtime/native/vok-authority/Cargo.toml --
  --include-ignored` passed (33 unit tests, 2 integration tests, 15 doctests;
  50 total). The suite includes
  `secret_arena_owned_copy_survives_arena_cleanup`: a copied secret survives
  arena cleanup. This is a useful counterexample for copy accounting, not a
  Fungi integration result or a claim that cleanup is complete. The build also
  reports `with_bytes_mut` as unused in the Rust library build, so these tests
  do not establish a production caller for that primitive.
- In WSL, SLIDE's focused dirty-delta tests
  `tests/tri-pipe-alternative-admission.test.mjs`,
  `tests/tri-pipe-alternative-vok.test.mjs`, and
  `tests/vok-live-gate-profile.test.mjs` passed (69/69). The existing owner
  delta adds process-local admission provenance/reservation and fail-closed
  terminal handling for post-sink receipt or revocation failures, with
  re-entry, duplicate-evaluation, lease-reuse and receipt-publication tests.
  These tests concern Tri-Pipe/VOK admission and ordering; they do not prove
  secret-memory custody or Galerina Fungi integration. The six modified SLIDE
  source/test files were pre-existing owner changes and were preserved, not
  staged or committed by this review.

### Cross-project boundary checks

- SLIDE's `contracts/v2/25-V2-D-SAFE-VALUE-MEMORY-INCREMENT.md` describes a
  bounded semantic-memory model. It explicitly does not establish native
  allocation, optimized wiping, FFI/host-call effects, or protected secret
  memory. Do not treat that plan as the RD-1413/1414/1415 implementation.
- Lyth-Weaver is clean at `main` / `origin/main`, HEAD
  `c5c8c67dc51619c1439f7dc287b3e06c732ee420`. Current TODO source records
  owner decision OD-1733 unblocking previously held memory rows for completion;
  that is not evidence that all Lyth TODOs are complete. Reconcile and verify
  the specific relevant rows rather than relying on historical handover text.
- The exact protected `/secure` handler/object remains absent from the inspected
  API-server source. `admitWebhookReplay` remains a real secret-using bootstrap
  candidate, but it still lacks the bound principal, object/version,
  grant-issuer/revoker, provider/key-custodian, Fungi lease and authorized sink
  required to qualify as the protected operation. The owner must either
  nominate this candidate for protected integration or identify the actual
  `/secure` handler and object by path, symbol and source commit.
- Current-head call-site check at `2a4ae02600d71ae7fdae4f6898199eee5fef9079`:
  among non-test source under `packages-ts`, the only `createApiServer(...)`
  construction found is `packages-ts/galerina-framework-example-app/host/server.ts:165`,
  and it passes no `webhook` option. The API-server's webhook path is real and
  conditionally wired in `src/index.ts`, but this repository does not currently
  show a non-test caller configuring it. This narrows the finding: there is a
  concrete secret-using implementation candidate, but no demonstrated
  first-party configured protected operation at this pin.
- This pass did not refresh or mutate Myco/KB indexes, change SLIDE owner files,
  or reconcile the relevant KB and all cross-project TODO/RD owners. Those
  remain explicit work, not inferred absence or completion.

No Git CI was run. Local WSL test results are bounded to the named packages and
fixtures. They provide implementation evidence for the tested bootstrap
components only; design intent, compiler enforcement, loaded runtime/FFI/host
enforcement, physical residency and end-to-end protected-operation evidence
remain separate proof obligations. RD-1413/1414/1415 remain **HOLD /
NON_AUTHORIZING**; no RD disposition or private owner file changed.

## 2026-10-07 follow-up — source-pinned Fungi ownership and Wasm boundary

Rechecked the live Galerina checkout at HEAD
`2a4ae02600d71ae7fdae4f6898199eee5fef9079` (branch
`codex/rd1413-1415-coupled-route-20261004`). The source evidence narrows an
important design/implementation gap:

- `packages-ts/galerina-core-compiler/src/parser.ts` labels
  `parseResourceDecl()` as structural capture and explicitly says Phase 17
  semantics/enforcement are deferred (around lines 6106-6111). The matching
  `tests/resource-decl.test.mjs` asserts that a `resourceDecl` AST node and its
  child blocks are parsed. This proves syntax/AST capture only; it does not
  prove affine ownership, alias prevention, mandatory cleanup, or lowering into
  runtime obligations.
- `packages-ts/galerina-core-compiler/src/wat-emitter.ts` unconditionally emits
  `(export "memory" (memory 0))` for the current module (around line 805).
  `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` binds the
  instance's exported `WebAssembly.Memory` to the host (around lines 1004-1008)
  and `snapshotMemory()` returns a new byte-array copy of the complete buffer
  (around lines 937-939). Thus this current ordinary-Wasm-memory route cannot
  substantiate a claim that protected bytes in that memory are inaccessible to
  the host or that copies are accounted for. The snapshot is documented for a
  trap observer; whether/when it is invoked is a separate question and this
  finding does not claim every normal run snapshots memory.
- On WSL and native Windows, the focused local command
  `node --test tests/resource-decl.test.mjs tests/wat-memory-runtime-bounds.test.mjs`
  passed 14/14 on each platform. The assertions cover resource lexing/AST
  capture and ordinary arena bounds/handle lifetime; they do not assert affine
  ownership, mandatory cleanup, protected-memory isolation, or complete copy
  tracking. These were local test runs, not Git CI.
- The source search for the supplied
  `memory-rd-owner-context-20261006.md` filename and for RD-1413/1414/1415 text
  in Markdown, text and JSON under `D:\moving` returned no matches. This is a
  scoped search result, not proof that no equivalent exists in another format
  or under another root/name. The owner-pasted part-1 inventory remains
  unverified discovery context; no private RD body was copied into this report.

This establishes a concrete compiler/runtime proof gap, not a limit on what
Fungi may guarantee. To close it, the language/compiler needs an owner-approved
protected-memory representation and ownership/effect contract, and the selected
runtime/FFI/host profile must enforce it. The current resource AST node and
exported-memory bootstrap are not that implementation. No syntax, ABI, or
enforcement rule is selected by this note; the existing design decision remains
open. No tests, source code, RD status, or private owner files were changed in
this follow-up.
