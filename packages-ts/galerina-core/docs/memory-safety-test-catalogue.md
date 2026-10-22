# Fungi memory-safety test catalogue (proposal only)

**Status:** test-design aid only. This is not an adopted memory model, syntax,
compiler/runtime contract, implementation plan, or security guarantee. It must
not be used to mark the ownership-model, memory-checker, or R&D rows complete.

Galerina is designing `.fungi` as a new language. TypeScript bootstrap tests can
show behavior of the current prototype, but do not set a ceiling on the
guarantees Fungi may eventually provide. Conversely, a proposed Fungi guarantee
is not implemented merely because the language can be designed to express it.

## How to use this catalogue

For each case, first get the semantic choice approved by the language owner.
Until then, `UNRESOLVED` means there is no pass/fail oracle to encode. Once a
choice is approved, add a positive control, a discriminating violation, and an
exact evidence owner (checker, lowering, runtime, FFI, host, or composed
operation). Keep those evidence layers separate in test output.

The pairs below are questions a test suite should distinguish, not prescribed
answers. Use abstract values and operations in design review; do not invent
`.fungi` syntax for them. Any first-slice protected-operation probe uses only a
controlled provider, synthetic bytes, and a synthetic sink under the recorded
`POST /auth/verify` constraints in the root owner TODO.

## Candidate semantic cases

| Case | Dimension | Distinguishing situation | Decision status | Evidence needed after a rule is approved |
|---|---|---|---|---|
| MS-OWN-01 | Ownership and move | A value has one owner; compare transfer to a new owner with later use through the old binding. | UNRESOLVED | Type-checker decision plus runtime behavior for the selected representation. |
| MS-ALIAS-01 | Aliasing and mutation | Two paths designate the same allocation; compare read/read with read/write and write/write overlap. | UNRESOLVED | Alias analysis or runtime borrow enforcement, with accepted and rejected controls. |
| MS-BORROW-01 | Borrow escape | Compare a borrow used only during its owner scope with one retained by a return value, closure, task, or callback. | UNRESOLVED | Lifetime/escape checker and any runtime/FFI boundary checks. |
| MS-COPY-01 | Copy and clone | Compare an ordinary value copy with an explicit copy of a protected value; observe every resulting allocation independently. | UNRESOLVED | Copy/clone semantics, allocation identity, and cleanup evidence for every copy. |
| MS-EXIT-01 | Cleanup on exit | Exercise normal return, refusal, error, panic/trap, cancellation, and timeout after allocation. | UNRESOLVED | Cleanup on each supported exit path; timeout must not be treated as proof of wipe. |
| MS-REENTER-01 | Re-entry and revocation | Revoke or invalidate authority during a provider callback, then attempt re-entry, provider-open, or release. | UNRESOLVED | A test-visible ordering point that serializes revocation, open, lease use, and release. |
| MS-ALLOC-01 | Bounds and allocation failure | Probe zero, exact-limit, over-limit, arithmetic overflow, allocation failure, and attempted growth. | UNRESOLVED | Checked extent arithmetic and fail-closed allocation behavior at the enforcing layer. |
| MS-PROV-01 | Pointer provenance and extent | Compare a valid nested record in an active, schema-compatible allocation with an aligned in-range pointer to unstaged, short, stale, or overlapping storage. | UNRESOLVED | Owner-approved allocation/ABI provenance, non-wrapping extent validation before any source load, and tests proving refusal before result publication. |
| MS-REUSE-01 | Reuse and stale aliases | After cleanup or pool reuse, attempt access through a stale reference or a prior operation identity. | UNRESOLVED | Freshness/generation rule, stale-reference refusal, and cross-operation isolation. |
| MS-EFFECT-01 | Effects and sinks | Compare a permitted in-scope operation with logging, persistence, graph publication, network output, and an unapproved sink. | UNRESOLVED | Effect checking plus host/sink enforcement; metadata must be tested separately from payload. |
| MS-FFI-01 | FFI and representation | Cross a Fungi/native boundary with a borrow, copied bytes, malformed length, or unsupported representation. | UNRESOLVED | ABI ownership/layout contract and adversarial boundary tests on each claimed target. |
| MS-HOST-01 | Host trust boundary | Attempt plaintext observation, callback side effects, or result replay from outside the approved verifier boundary. | UNRESOLVED | Exact TCB/attestation profile, authenticated ingress/recipient, and composed host evidence. |
| MS-PARITY-01 | Backend parity | Run the same approved semantic case on the reference interpreter and every claimed backend/profile. | UNRESOLVED | Per-backend parity and admission evidence; selector output alone is insufficient. |

## Review delta: nested-pointer provenance (2026-10-09)

This is a source-pinned adjudication of the current bootstrap test, not an
adopted Fungi rule. The current working-file pins for `wat-emitter.ts`,
`wasm-runtime.ts`, and `q1-secret-return-value.test.mjs` were independently
matched during Astra's review at Galerina HEAD
`9a26c71e60e491766ef351d0efe0405b0739c1b6`.

- **Confirmed, bounded gap:** the WAT return flattener rejects nonzero low
  pointers but follows nested pointers at or above `WAT_HEAP_BASE`; the
  host-side `allocRecord` stager tracks only a bump address and bounds-checks
  its writes. It records no allocation identity, layout, generation, or
  pointer-field provenance. The current Q1 regression plants an in-range
  nested pointer to unstaged bytes, and the supplied WSL run reports that the
  expected `RuntimeError` does not occur.
- **Evidence limit:** `allocRecord` is documented as test/differential-only.
  This supports a missing provenance check in the bootstrap/test ABI. It does
  not establish a production-wired protected operation, hostile-host
  containment, native Fungi behavior, or an RD-wide failure. Astra did not
  rerun the earlier test receipt; Codex reran the focused case and full Q1 file
  in WSL after improving the diagnostic assertions and adding a signed/admitted
  helper probe. The initial file run reported 36/37, with this case as the
  sole failure.
  Astra then identified that the admitted helper returns `err.message`, not an
  exception-class name. The test oracle was corrected to require a callable
  `echo` export and the helper's `trap during 'echo': ` refusal prefix. The
  signed/admitted case now compares fresh equivalent instances with matching
  staging histories (eight filler records, then a child slot, then the root):
  a staged root/child positive control returns `[2, 1, 0]`; a staged root whose
  child points to the foreign in-range address is still accepted. A separate
  in-range unstaged-root case pointing to a valid staged child is also
  accepted. The root case checks guest-heap cleanup and preserves both
  host-owned records; the nested case preserves the foreign sentinel and now
  also checks its staged root and unused child slot. The tests assert the
  allocation bases (`child=1088`, `root=1096`) and prove that the 8-byte
  foreign extents at 4096/8192 are outside host staging, inside linear memory,
  and outside the post-call guest heap extent.
  corrected working-test SHA-256 is
  `AD7887C45D96EB5CD38FEF596D83B610207A8466A5490CC27A2615393228844F`; the
  latest WSL run reports 36/38, with the nested-child and separate root
  refusal expectations as the only failures.
  No runtime implementation was changed.
- **External-review disposition:** Grok.com response
  `8f7f2a92-618f-4e3d-ace5-d2f5ad79a39b` is advisory; its UI exposed no report
  hash or exact timestamp. Astra's independent adjudication is recorded in
  review thread `01a11642-55bd-7c23-9ccc-587f10444bf9`, turn
  `01a11f9d-99ff-7620-bae0-2224a02e5f0d`, message
  `msg_0617df87b65142c5016ac89b0dcc8087d2a281987661331029`. The existing
  SuperGrok dispatch `codex-supergrok-galerina-wat-nested-pointer-provenance-20261009-01`
  remains OPEN; no answer is inferred from delivery. Astra's same-thread
  signed/admitted runtime-path delta `01a11fa9-4af9-7db3-b217-fca561c63d7c`
  completed with oracle correction accepted and provenance remediation held.
  Astra specifically requires a valid admitted-root/child positive control;
  that control passes. A further fresh-instance comparison and separate
  unstaged-root probe were reviewed in the same Astra thread: it confirmed
  PASS for distinguishing the two bounded bootstrap gaps and HOLD for
  remediation. The follow-up noted that matching allocation histories make
  the comparison stricter; they now match. Grok.com response
  `ace38a60-b611-4b85-9c79-a332d7ee120d` could not inspect the uncommitted
  test revision and made overlap concerns conditional; the current test now
  records/asserts the relevant host and guest extents. Independent Astra
  adjudication of that response confirmed the extent concern is addressed, but
  found that two new memory-capacity checks multiplied `Int32Array.byteLength`
  by four even though it is already bytes. The checks now compare against
  `byteLength` directly. The focused WSL rerun remains 36/38 with only the two
  expected provenance refusals failing. A fresh replay on 2026-10-09 against
  test SHA-256 `AD7887C45D96EB5CD38FEF596D83B610207A8466A5490CC27A2615393228844F`
  and emitter SHA-256 `A8CEA968C83356843F73AC96DDDEBC26A91CDD61310DA1E7DFCA3BE30B28D375`
  used `node --test tests/q1-secret-return-value.test.mjs` under WSL with
  `GIT_DIR` and `GIT_WORK_TREE` unset; it reproduced the same two acceptances
  (36/38). This remains bootstrap-path evidence only. Astra's narrow source recheck passed
  in turn `01a11fb3-d5b0-7cb1-959a-1ee2db1a1765`, message
  `msg_0617df87b65142c5016ac8a0c04e4087d292c1e6e7faa440ea`; it verified the
  latest test hash but did not rerun tests. This closes only the assertion-unit
  issue; the provenance refusals remain unresolved.
- **Ledger versus handles:** a registry of base/extent alone is insufficient.
  Any ledger design also needs complete mediation of allocation and access,
  protected metadata, checked extent arithmetic, exact type/layout and
  operation authority, lifetime bound to the reference (including reuse), and
  protection against mutation between validation and use. A generation-bound
  opaque handle can strengthen liveness but does not contain a host that can
  read or write the underlying linear memory directly.
- **Current generated-WAT allocator boundary (2026-10-09):** at Galerina
  working-copy HEAD `9a26c71e60e491766ef351d0efe0405b0739c1b6`,
  `wat-emitter.ts` SHA-256
  `A8CEA968C83356843F73AC96DDDEBC26A91CDD61310DA1E7DFCA3BE30B28D375`
  initializes one mutable `$__fungi_heap` cursor at `WAT_HEAP_BASE` and advances
  it at the observed record-allocation sites; arena-reset paths rebase that
  cursor. The return flattener at lines 341–391 rejects nonzero pointers below
  `WAT_HEAP_BASE`, while recursive loads rely on WAT's memory bounds. Neither
  mechanism validates that an in-range root or nested pointer names an active
  allocation with the expected layout and lifetime. Consequently, ordinary
  linear-memory bounds checks do not reject the two current foreign-address
  probes. The host `allocRecord` test stager is a
  separate, test/differential-only mechanism and cannot supply production
  allocation provenance. The exact regression file
  `q1-secret-return-value.test.mjs` has SHA-256
  `AD7887C45D96EB5CD38FEF596D83B610207A8466A5490CC27A2615393228844F`; a
  focused WSL run on that file passed 36/38, with the nested-pointer and
  out-of-staging-root refusal expectations failing. This is a reproducible
  bootstrap behavior, not an adopted Fungi rule or proof of a production
  protected-operation path.
- **Design decision still required:** before implementing a provenance rule,
  the language/runtime owners must choose which allocations are valid roots,
  whether nested fields may designate shared/interior/cyclic objects, how
  arena reset and reuse invalidate references, how host-provided inputs enter
  the allocation authority, and where provenance metadata lives so that the
  host cannot forge it. The enforcing path must validate identity, complete
  extent, layout, and liveness before the first source load, with no result
  publication on refusal. Until that contract is approved, retain the failing
  probes as evidence and keep `MS-PROV-01` unresolved; do not patch the
  expected results or invent an allocator ABI.
- **Test follow-through:** keep MS-PROV-01 unresolved pending the language/ABI
  owner decision. A stronger proposal-only suite should pair a valid registered
  nested record with foreign, short, unaligned, interior, stale, wrong-layout,
  overlapping, shared, and cyclic cases; separately prove refusal before
  result publication and cleanup behavior through the guarded executor. The
  current regression captures raw-export and signed/admitted-helper outcomes,
  return values and sentinel independently. Both paths return
  `[2, 324508639, 0]` (the middle value is the planted sentinel). The admitted
  helper also checks a valid post-call heap end, zeroes the guest-owned heap
  extent, and preserves the staged root/child and foreign sentinel. At the
  earlier reviewed pin, the raw arm had no explicit guest-heap-end or
  zero-range assertion; the follow-up below adds a successful-path check. The
  raw arm calls the export before `finalizeSecretExportResult`, so a trap in
  the export would bypass that finalizer; the fixture observes a successful
  export and copied result. These cases exercise `invokeAdmittedExport` and the raw
  finalizer, not proof that the selected protected operation is wired to the
  helper. They do not choose Fungi's sharing, cycle, copy, or null semantics.

### 2026-10-09 evidence correction: cleanup assertions by arm

- Exact Galerina working-tree identity: HEAD
  `9a26c71e60e491766ef351d0efe0405b0739c1b6`; test
  `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs`
  SHA-256 `815E311779AE668683061509AD0E8453FBDD0D74BEB0D86D54E7EBB4D51BEB21`;
  emitter `wat-emitter.ts` SHA-256
  `A8CEA968C83356843F73AC96DDDEBC26A91CDD61310DA1E7DFCA3BE30B28D375`;
  runtime `wasm-runtime.ts` SHA-256
  `B681D5BD0E7CDFF69801EDFD7C016251AFBF8CFD1D4153CC07EC711213C95295`.
- Fresh WSL run, from the compiler package with `GIT_DIR` and `GIT_WORK_TREE`
  unset: `node --test tests/q1-secret-return-value.test.mjs` -> **36/38**.
  The two failures remain the accepted unstaged nested pointer (raw and
  signed/admitted arms, observed return `[2,324508639,0]`) and accepted
  in-range unstaged root (observed return `[2,1,0]`). This is current
  bootstrap evidence only.
- Astra's independent source adjudication is in thread
  `01a11642-55bd-7c23-9ccc-587f10444bf9`, turn
  `01a11fde-8412-7023-8e73-7ec481083f6d`, message
  `msg_0617df87b65142c5016ac8abf5f3e087d2b01dc7c4bad36048`. It verified all
  three pins. For the root case, fillers occupy `[1024,1088)`, the staged
  child `[1088,1096)`, and the directly written root `[4096,4104)`; no later
  host staging occurs. The post-call guest heap end is at most 4096, the
  reported guest range is zero, and root/child bytes remain unchanged. For
  the nested case, host staging is disjoint from the foreign `[8192,8200)`
  extent. Its admitted arm checks guest cleanup and preserves the staged
  records and sentinel; its raw arm checks the successful returned copy and
  sentinel but does not assert guest heap end or zeroing. Astra classifies the
  two acceptances as bounded bootstrap provenance counterexamples; production
  reachability, adopted Fungi semantics, hostile-host protection and RD
  closure remain NOT VERIFIABLE.
- At this reviewed pin, the raw test did not independently assert cleanup.
  This supersedes the earlier generic sentence that described cleanup as
  independently captured on both arms. In particular, successful copy of
  the foreign sentinel does not itself prove raw-arm cleanup; the source
  finalizer attempts cleanup on that successful path, but this test arm does
  not assert its result. Keep the raw cleanup claim unproved until a targeted
  assertion checks a non-empty guest-owned range and preserved foreign bytes.
- SuperGrok messages -01 through -04 were OPEN in the dedicated bucket at
  this review point; no
  response/pickup is inferred. Message -04 is only a bounded challenge about
  raw-arm cleanup evidence and admitted-arm assertion non-vacuity, not a
  semantic or TODO sign-off.

### 2026-10-09 raw-arm successful-finalizer assertion follow-up

- The test now separates the raw export result from finalization and captures
  `__fungi_heap_get()` immediately after the export. After
  `finalizeSecretExportResult`, it requires a non-empty guest-owned extent,
  bounded below the foreign pointer, all words in that extent zero, and the
  foreign sentinel unchanged. This directly tests the successful
  export-then-finalize path; it does not prove cleanup when the export itself
  traps before the host finalizer is called.
- The admitted nested-pointer and separate-root cleanup assertions now reject
  a heap watermark equal to `HEAP_BASE` before evaluating `.every(...)`; this
  prevents an empty-range check from passing vacuously. It does not prove that
  the reported trap reason uniquely identifies provenance refusal.
- Current test SHA-256:
  `1DC2D88205646835D7A824A1594CA2944DA7054F651EA2EABAD07FB0F1618E2B`.
  Galerina working-tree HEAD remains `9a26c71e60e491766ef351d0efe0405b0739c1b6`.
- In WSL, with `GIT_DIR` and `GIT_WORK_TREE` unset, TypeScript compilation
  completed for `galerina-core-runtime-wasm` and `galerina-core-compiler`, then
  `node --test tests/q1-secret-return-value.test.mjs` reported 36/38. The new
  raw and non-vacuous admitted cleanup assertions passed; the only failures
  remain acceptance of the unstaged nested pointer and the separate unstaged
  root. No CI ran.
- This is a test-coverage improvement on the TS/WAT bootstrap path only. It
  does not establish adopted `.fungi` semantics, production wiring, general
  trap cleanup, hostile-host containment, profile admission, or RD closure.

**Disposition:** safe non-authorizing test-design work may proceed; the
catalogue and memory-safety TODO remain open. No production fix or general
Fungi ownership guarantee is adopted by this review.

### 2026-10-09 full-range refusal-oracle correction

- The current working test SHA-256 is
  `E94A319E4EEF02209729DE82454C4DE0767FB4E0D7787E4DC58A53DEF76E6DDE`;
  the emitter is `A8CEA968C83356843F73AC96DDDEBC26A91CDD61310DA1E7DFCA3BE30B28D375`
  and the runtime is `B681D5BD0E7CDFF69801EDFD7C016251AFBF8CFD1D4153CC07EC711213C95295`.
  Galerina HEAD remains `9a26c71e60e491766ef351d0efe0405b0739c1b6`; these are dirty
  working-copy pins, not committed-source claims.
- The refusal oracle now snapshots the independently derived 20-byte candidate
  output range `[1024,1044)`, covering the 8-byte `Node` allocation and 12-byte
  flattened return. For an empty guest watermark it accepts only a wholly
  unchanged or wholly zero range; for a non-empty extent it requires the
  owned prefix zero and the unowned tail unchanged. A mutation control dirties
  words at offsets 8 and 16 while leaving the base word alone; the oracle
  detects both. This closes the earlier one-word-sentinel weakness for this
  fixed fixture, not arbitrary allocation-history or rewind behavior.
- Fresh WSL execution of `node --test tests/q1-secret-return-value.test.mjs`
  with `GIT_DIR` and `GIT_WORK_TREE` unset reports **37/39**. The two failing
  test cases remain the bounded provenance counterexamples: raw and admitted
  execution follow an unstaged nested pointer at 8192 and return
  `[2,324508639,0]`; admitted execution follows the unstaged root at 4096 and
  returns `[2,1,0]`. The mutation control, positive staged cases, low-pointer
  refusals, and separate post-allocation trap-wipe regression pass. This is
  bootstrap evidence only; no production/Fungi/RD guarantee follows.
- Grok.com response `f29c0fa0-f701-4fc1-96c7-d94913a36816` reviewed the prior
  one-word oracle and identified cursor-rewind/dirty-tail counterexamples.
  The full-range control above addresses those cases in this fixture. Its
  separate architecture response `8f7f2a92-618f-4e3d-ace5-d2f5ad79a39b`
  recommends complete allocation provenance before the first root and nested
  load; that remains advisory. Astra adjudication of that architecture delta
  is pending in existing thread `01a11642-55bd-7c23-9ccc-587f10444bf9`.
  SuperGrok's pointer-provenance messages `-01` through `-05` and `-07`
  remain OPEN; delivery is not pickup. The `-06` arena question is out of
  scope for this bucket per its routing correction and is not counted as a
  pointer-provenance review.
- No compiler/runtime behavior changed in this delta. The catalogue remains
  proposal-only, and the provenance test failures remain open; do not close a
  TODO or RD from these results.

### 2026-10-09 Astra adjudication of provenance architecture

- Astra's independent review of Grok.com response
  `8f7f2a92-618f-4e3d-ace5-d2f5ad79a39b` is in thread
  `01a11642-55bd-7c23-9ccc-587f10444bf9`, turn
  `01a1201e-52c1-7710-aa0a-d3d509eee728`, message
  `msg_0617df87b65142c5016ac8bc22959087d2b0564f6f27c73e42`. It verified the
  current working-copy pins and did not rerun tests; the 37/39 result above is
  Codex-executed evidence.
- **Source finding UPHELD:** `emitWATExpr` member loads occur before return
  flattening; `emitFlattenChecks` loads nested pointer words before checking
  only low-address/cutoff conditions; `copyGuestRecord` checks shape and
  bounds but not live allocation authority. The two counterexamples remain
  bounded bootstrap failures, not production reachability or adopted Fungi
  semantics.
- **Architecture PARTIAL:** host prevalidation plus controlled copy-in is the
  smallest ingress-only measure, but does not secure arbitrary guest-created
  pointers or hostile direct loads. An imported host allocation/access gate
  with protected metadata is the smallest plausible comprehensive route for
  trusted generated code only if every relevant load/store/copy-out is
  mediated. Opaque handles are stronger for hostile guest code only if they
  do not resolve to raw addresses that remain directly accessible in guest
  memory. Split arenas help ownership/accounting but do not prove provenance;
  a guest-writable registry alone is bypassable and is not a hostile-guest
  security boundary.
- The current host `recordBump` and generated guest `$__fungi_heap` both begin
  at `WAT_HEAP_BASE` and advance independently. A registry that merely records
  both cursors would not prevent overlapping claims; allocation authority
  must be unified or made disjoint before registrations can prove ownership.
  The current module also exports linear memory, so host-side metadata cannot
  constrain a hostile host that controls the runtime and memory.
- **Fungi semantics remain unresolved:** choose tree/shared-graph/cycle
  behavior, exact-base versus interior references, generation-bound borrow
  and reuse rules, secret-copy accounting, mutation/re-entry behavior, and
  the trusted-generated-code versus hostile-guest boundary before selecting
  syntax or enforcement. Compiler capabilities do not validate host-planted
  words without a corresponding runtime/FFI admission boundary.
- Minimum discriminating proof after an owner decision: valid host and guest
  allocations; current 4096/8192 refusal before first unauthorized load;
  short/overflowing/interior/wrong-layout extents; stale generation and
  cross-instance references; re-entry mutation; overlap/forged registration;
  direct-load bypass control; and partial-allocation trap/cleanup accounting.
  No selected architecture is implemented by this catalogue entry.

## First-slice constraints are not general language semantics

The root owner TODO records the first protected operation, authority and
revocation roles, permitted result, status-only recovery, synthetic-data limit,
and provisional workload bounds. Those choices constrain that operation. They
do not, by themselves, settle general Fungi ownership, aliasing, allocation,
effects, or every generic TypeScript security-package API.

For that operation, retain explicit probes for the owner-stated no-escaping
borrow rule, one-time authenticated result acknowledgement, revoked or
consumed-lease re-entry, cleanup deadline expiry, and refusal/quarantine when
cleanup is unproven. Keep all proposed expectations labelled until mapped to
the exact approved language/runtime/host contract.

## Completion boundary

This catalogue can support test-design work only. It does not close the open
`Define memory-safety tests` TODO, adopt any candidate semantics, authorize the
held generic secret subsystem, prove a wipe, prove a Fungi runtime/host path,
admit a SLIDE/VOK profile, or close RD-1413/1414/1415. Closure needs the
specific owner decision, implementation at the enforcing layer, discriminating
tests, and any required composed end-to-end evidence and independent
adjudication.

## Rewound-cursor oracle follow-up (2026-10-09)

The exact working-copy test at the current pinned HEAD is
`packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs`
(SHA-256 `E94A319E4EEF02209729DE82454C4DE0767FB4E0D7787E4DC58A53DEF76E6DDE`).
Its `refusalOutputRangeViolations` helper compares the complete five-word
candidate range `[1024,1044)`. With the heap watermark at the start, it accepts
only the unchanged prefill or an all-zero range; mutation controls at words 2
and 4 prove a dirty tail is rejected even if the first word is unchanged. For
a nonempty extent, it requires the owned prefix to be zero and the unowned
suffix unchanged.

Fresh WSL evidence on this working tree: the focused oracle test passes 1/1;
the complete `q1-secret-return-value.test.mjs` run is 37/39. The remaining two
failures are the expected missing-provenance refusals: the raw and admitted
nested-pointer paths return `[2,324508639,0]`, and the in-range unregistered
root returns `[2,1,0]`. `GIT_DIR` and `GIT_WORK_TREE` were unset for the WSL
run; no GitHub CI ran.

Grok.com raised the cursor-rewind concern in response
`response-96d94397-18fe-4bcc-a0f0-959336556d84`. Independent Astra follow-up
`01a12024-724e-7bf3-8630-6d620c947c87`, final message
`msg_0617df87b65142c5016ac8bda8079487d2a723d71f2cd53d67`, returned PASS for
the bounded full-range oracle and raw/admitted cleanup distinction. Astra
verified the supplied HEAD and file hashes but did not rerun tests; the WSL
results above are this session's fresh execution evidence. This is a
final-memory-state oracle, not proof against transient writes or arbitrary
raw-export trap cleanup. The admitted post-allocation trap control remains a
separate narrow check.

The SuperGrok message ending `-07` remains OPEN and was pinned to an older test
hash; delivery does not prove pickup. No duplicate dispatch was made. The
provenance failures and architecture/design decisions above remain open, and
none of this follow-up closes a TODO or RD or establishes Fungi/production
memory guarantees.

## 2026-10-09 superseding oracle adjudication

This entry supersedes the earlier wording above that said an empty reported
extent accepts either an unchanged or wholly-zero candidate range. The current
`refusalOutputRangeViolations` predicate accepts an empty extent only when the
entire fixed candidate range is unchanged. For a nonempty reported extent, it
requires the owned prefix to be zero and the remaining candidate suffix to be
unchanged. The assertion text now says “empty reported extent”; the watermark
is `HEAP_BASE` (1024), not zero.

After that assertion-message-only edit, WSL reran the exact Q1 file with
`GIT_DIR` and `GIT_WORK_TREE` unset: **37/39**. The current test SHA-256 is
`A3F5337F7250C65273888DC98FAF883ED764A1E73515A39414F6B042D5E807D9`; current
emitter SHA-256 is
`A8CEA968C83356843F73AC96DDDEBC26A91CDD61310DA1E7DFCA3BE30B28D375`; runtime
SHA-256 is
`125C7B087D620BB5C2DE4EECB48278EA5B02EC4C18A83EFF5DA9FD499DEF8411`. The same
two unregistered-pointer acceptance cases remain the only failures.

Astra's independent adjudication is in thread
`01a11642-55bd-7c23-9ccc-587f10444bf9`, turn
`01a1207b-4140-7963-a672-c5656a1260a7`, message
`msg_0617df87b65142c5016ac8d3db97bc87d2ac444ae31948e8c1`. It verified the
preceding test hash `C4434830D1C922B07A40CC90AF39545515ED4F2B038021CF3C138A5018C7E57B`
and current emitter/runtime hashes, but did not rerun tests. Its PASS is limited
to the fixed, aligned, nonzero-patterned final-memory cases; the fresh 37/39
receipt and the A3F hash above are Codex-verified after a text-only test change.
Same-value writes and transient writes restored before observation are
undetectable. A wipe followed by cursor reset may fail this predicate without
proving a leak. The two provenance failures remain source-supported,
execution-reported bootstrap findings. No production reachability, Fungi
semantic rule, TODO/RD closure, or broader security approval follows.
