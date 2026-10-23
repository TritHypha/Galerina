# Git Worktree Custody

This is a dated consolidation record, not live Git authority. Before integration or
retirement, reopen the named checkout, its HEAD, index, working files and recovery
receipt. A lock is a preservation notice, not proof of an active worker or a merge.

## Live consolidation snapshot — 2026-10-13

### Read-only recount — 2026-10-13 20:36 UTC

- Fresh local view (no fetch): the integration checkout remains `main` at
  `823c8bc30c34a354e033f597f6477d258e0de488`, two commits ahead of the locally
  observed `origin/main` ref `8a51ecbfec5d6e4911717c6fb09a1f76fad1c01c`.
  Its 145 porcelain paths are 7 staged additions, 118 unstaged tracked paths,
  and 20 untracked paths. No files were staged, copied, or retired.
- Live topology is 18 registered worktrees, 33 local branches, and 27
  `origin/*` tracking refs. This replaces the earlier 16:28 count of 31 remote
  refs; branch/worktree counts are not a retirement disposition.
- `memory-consolidation-20261007` remains at
  `16fb71a21c41c66de13a0167606feb58a8b63951`, with 7 commits unique to its
  history versus local `main`; `git cherry` found no patch-equivalent copies in
  `main`. Its dirty overlay still has 48 paths (46 unstaged, 2 staged plus
  working-tree modifications), and 10,849 ignored entries were reported in an
  earlier count; ignored contents were not opened. Of the 48 dirty working
  files, 11 currently match the integration checkout byte-for-byte and 37
  differ. Sixteen shared staged-index entries have identical Git blob IDs.
  These comparisons do not establish that either committed history or the
  differing overlay is integrated; keep the donor and its ignored data.
- The prior `memory-current-main-20261008` count of 49 dirty paths remains a
  dated observation, not a fresh comparison in this recount. No donor has been
  retired and no merge or publication was performed.

### Read-only recount — 2026-10-13 16:28 UTC

- A fresh status recount supersedes the earlier 127-path figure in this snapshot:
  integration `main` is still at `823c8bc30c34a354e033f597f6477d258e0de488`,
  with the locally observed `origin/main` ref still at
  `8a51ecbfec5d6e4911717c6fb09a1f76fad1c01c` (no fetch). Porcelain status has
  **137 paths**: 7 staged additions, 112 unstaged tracked paths, and 18
  untracked paths. Topology remains 18 registered worktrees, 33 local branches,
  and 31 remote-tracking refs. No paths were staged, copied, or retired.
- Rechecked the two memory donors. `memory-current-main-20261008` has 49
  porcelain paths (43 staged, 8 unstaged, 2 untracked; 4 staged/unstaged
  overlaps) and 5,502 ignored entries. `memory-consolidation-20261007` has 48
  paths (2 staged/unstaged overlaps, 46 unstaged, no ordinary untracked paths)
  and 10,849 ignored entries. Credential-bearing ignored material is present;
  its contents were not read or copied. These counts do not make either donor
  safe to retire: committed history, staged blobs, working files, and ignored
  data still require separate reconciliation.

- Rechecked the integration checkout: branch `main`, HEAD
  `823c8bc30c34a354e033f597f6477d258e0de488`, two commits ahead of the locally observed
  `origin/main` ref (`8a51ecbfec5d6e4911717c6fb09a1f76fad1c01c`; no fetch in this check).
  It has 127 unique porcelain paths:
  7 staged, 108 unstaged tracked, and 12 untracked. One current-turn evidence
  report is local to this checkout; its two disposable test copies were removed
  after independent review. No donor files were copied or worktrees retired.
  The checkout remains
  unsuitable for a broad merge or bulk staging.
- Live topology is 18 registered worktrees, 33 local branches, and 27
  remote-tracking refs. This count does not classify a checkout as safe to retire;
  reopen its lock, ignored data and source custody before any retirement.
- Open draft PR #169 (`grok/core-runtime-bounded-native-floor-refusal`) is a
  separate small candidate: clean checkout at `246494403ac4d48c0e44a73aae72aeacde738c49`,
  three unique commits and 178 commits behind integration `main`; GitHub reports
  `DIRTY`, no review decision and no checks. Its five-path change adds a
  fail-closed, non-executing TypeScript transfer validator plus proposed L47/L48
  checklists; it does not implement W^X, hostile-memory isolation or erasure.
  The two focused test files passed 12/12 on Windows and WSL against the
  checkout's existing `dist`, but `npm test` stopped at typecheck because the
  global `tsc` target is missing. Thus source build/typecheck is still unverified;
  do not merge this draft or count its proposed checklists as resolving the rows.
- `memory-consolidation-20261007` is at `16fb71a21c41c66de13a0167606feb58a8b63951`;
  its branch is 67 ahead/6 behind its own upstream. Relative to this local `main`,
  it has 7 unique commits and `main` has 90 unique commits. Its checkout has 48
  changed paths (2 staged paths, 48 tracked unstaged paths with 2 overlaps, no
  ordinary untracked paths) and 10,849 ignored untracked files. Fourteen paths
  are changed in both this donor and the integration checkout; all 14 working
  copies differ byte-for-byte. No ignored content was opened or exported; preserve
  it pending a name/path-level purpose audit, especially any credential-bearing
  material. Its retained report
  `docs/reports/memory-native-consolidation-20261007.md` records a frozen T14 digest
  mismatch and a classical-CLI positive-control failure; those historical results
  require current revalidation, not assumed clearance.
- `memory-current-main-20261008` is at `34b419057de49b6437d0b3b9423f3f2bfb205970`,
  107 behind `origin/main` and with no commits beyond this local `main`. Its checkout
  has 49 changed paths (43 staged, 8 unstaged, 2 untracked, with 4 staged/unstaged
  overlaps). Thirteen changed paths overlap the integration checkout: 11 working
  copies differ, while the two WAMR probe fixtures are byte-identical. Identical
  fixtures still need only one copy, but do not establish integration of the donor's
  other staged or working changes.
- Re-ran `scripts/tests/run-rd1413-wamr-context-probe.sh` in WSL against the pinned
  WAMR 2.4.5 SDK; both headers, `libiwasm.a`, GCC 15.2.0 and `wat2wasm` 1.0.36
  matched their recorded pins. The probe passed import allowlisting/signature,
  unsupported-result, instance-context, size-bound and init/cleanup-failure cases.
  This validates the tested WAMR ABI seam only; it does not prove Fungi semantics,
  secret erasure, provider custody or the composed `/auth/verify` path.
- Disposition: neither memory donor is safe for wholesale merge, copy, or retirement.
  Reconcile committed history, each staged layer, each working layer and required
  ignored material path-by-path. No branch or worktree was removed.

## Live consolidation snapshot — 2026-10-12

- Revalidated the reused integration checkout: branch `main`, HEAD
  `8a51ecbfec5d6e4911717c6fb09a1f76fad1c01c`, equal to `origin/main`. Live Galerina
  topology is 18 registered worktrees, 34 local branches and 31 remote-tracking refs.
  This snapshot supersedes older recorded main/remote commit counts as of this check;
  it does not rewrite their history.
- Audited donor `memory-current-main-20261008`: HEAD
  `34b419057de49b6437d0b3b9423f3f2bfb205970`, 107 commits behind and zero ahead of
  `origin/main`; 49 porcelain entries (43 staged, 8 unstaged, 2 untracked, 4
  staged/unstaged overlaps). A final-working-bytes comparison of its 49 changed paths
  against the integration checkout found 7 exact matches and 42 differing files, with
  no missing counterpart path. This is a byte comparison, not a semantic integration
  decision; preserve the donor until its differing layers are individually reconciled.
- The donor's two untracked WAMR WAT fixtures are byte-identical to the integration
  checkout copies and need no second copy. The donor also has ignored build/dependency
  directories; their contents were not compared or changed. No donor bytes were copied,
  and no branch or worktree was retired.

## Runtime alias review delta — 2026-10-12

- In the reused integration checkout, `main` is at
  `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6`, one commit ahead of the last-read
  `origin/main` at `44a26cb22a362638a6cf106d05bd9d09e57f6821`. The checkout is
  substantially dirty; this review does not authorize staging or integrating its
  wider compiler/runtime changes.
- Independent Astra review `01a12d62-5f4b-7af3-b41c-e3c5f4d44462`, submission
  `01a12d90-c056-7470-b7b4-2149f1406bfc`, passed the reviewed inherited-instance
  alias fix. Review brief SHA-256:
  `17212F60F5F81E9F7700DB9A3E373B64346466668C94F2BEAFCC5D0A39738285`; reviewed
  runtime source SHA-256:
  `2CD064A1A30FFEB64B7D3042E00EF010CD35ADE43F632EB791874A5FF5A1D08E`; review-time
  test SHA-256 (before the additional regressions below):
  `44AF452B99E112D91482CB0AEEC0400BDE2BAE21A07F6DA6DB1FEF40AAD8D2C5`. It confirms the captured
  WebAssembly exports getter rejects forged/inherited objects before their `exports`
  properties are touched, and invocation/cleanup use the validated exports object.
- This review also identifies a remaining trust assumption: the host realm must be
  trusted when the runtime module captures its intrinsics. A hostile actor that can
  replace those intrinsics before module initialization can subvert the capture. The
  reviewed package scope does not prove application boot ordering or realm isolation;
  do not claim protection against a pre-compromised realm.
- Durable tests now cover ordinary and forged-prototype objects with hostile getters,
  plus a genuine instance whose prototype, own `exports` accessor and global
  `Reflect.apply` are altered after runtime initialization. The package was rebuilt
  from source and its focused runtime suite passed 72/72 on native Windows and 72/72
  in WSL. The combined `wasm-runtime` plus `seam-adapters` suites then passed 98/98
  on each environment. This is TypeScript/bootstrap runtime evidence only, not Fungi semantics,
  native FFI/WAMR enforcement, secret erasure, production host security, or closure of
  RD-1413/1414/1415.
- The test and this note remain part of the dirty integration checkout. Reconcile the
  complete test-file diff and broader working tree before staging or publication.

### Exports-object review delta — 2026-10-12

- Grok.com reply `18e84c04-00b7-44d8-b161-df61dec2a634` alleged that a registered
  wrapper could invoke through one WebAssembly exports object but finalize or wipe
  through a different object. The allegation was independently checked against
  `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` at the same HEAD;
  source SHA-256 is
  `2CD064A1A30FFEB64B7D3042E00EF010CD35ADE43F632EB791874A5FF5A1D08E`.
- Astra worker `01a12d62-5f4b-7af3-b41c-e3c5f4d44462`, follow-up submission
  `01a12d99-bb98-7042-ad84-baecadd5f0c8`, rejected the alleged within-call split
  under trusted module initialization: `invokeAdmittedExport` reads `rawExports`
  once, obtains the callable from it, and passes that same binding to finalization
  and fallback wipe. The observation that tests do not directly assert private
  reference identity is upheld; current behavior is covered indirectly. A two-real-
  instance hostile-own-getter test can challenge property redirection, but cannot
  expose private local-reference identity or justify an alternating-getter seam.
- Pre-module-initialization intrinsic poisoning remains outside this guarantee.
  Application boot order and realm isolation remain `NOT_VERIFIABLE` in this
  scoped review. The Astra run's focused native-Windows test result was 4/4; it
  separately reported WSL results as implementer-reported, not independently run.
  This remains TypeScript/bootstrap evidence only, not a Fungi, FFI/WAMR, host,
  byte-erasure, end-to-end protected-operation, or RD-1413/1414/1415 conclusion.
- This review makes no source change and authorizes no staging or integration.
  The Grok reply identity is retained here; a response digest was not available
  from the browser review route and is not claimed.

### Live first-donor/WAMR status refresh — 2026-10-12

- Rechecked local status without fetching or changing refs. The integration checkout
  remains on `main` at `add90739684b1be18938aa3f593e8cff48ad7003`; it has 100
  porcelain entries (11 staged, 87 unstaged, 5 untracked; 3 staged/unstaged overlaps;
  no conflicts). This supersedes the earlier 96-entry count, not the older dated record.
- `memory-current-main-20261008` remains at
  `34b419057de49b6437d0b3b9423f3f2bfb205970`, 102 behind and zero ahead of this local
  `main`; its live status is 49 entries (43 staged, 8 unstaged, 2 untracked; 4 overlaps;
  no conflicts). Its dirty overlay remains to be reconciled despite ancestor-only HEAD.
- The donor's untracked `rd1413-wamr-duplicate-import-probe.wat` and
  `rd1413-wamr-unlinked-import-probe.wat` working bytes match the integration checkout's
  staged and working bytes exactly (Git blob IDs `0c298f80e8ff29d001c38aa058e633269a2aeecd`
  and `458ea7cfdfcbce4256d9b98909687aa965987a7a`). They need no second copy.
- The donor's WAMR admission C working file changes the integration version's typed
  contract-validation result into a boolean refusal and accepts `WASM_V128` and
  `WASM_EXTERNREF` results. Its runner removes the externref-result refusal fixture
  build and invocation. Those working files differ between trees even though their
  staged blobs match. Keep this donor delta `HOLD/NOT_PORTABLE` until pinned WAMR API
  support and a discriminating result-kind test justify any change; the donor's other
  existing refusal probes must not be dropped. No donor bytes were copied.
- This is one donor's current status and a narrow WAMR comparison, not complete
  path-level disposition of either memory donor or authorization to integrate/retire.
- Layer identity for the WAMR files: donor staged blobs equal the corresponding current
  `main` HEAD blobs, while the unstaged working versions differ. Current-main working blobs
  (header, C implementation, runner, C probe) are `ad047c7cfc00f30eec07a92cd050dbc330e820af`,
  `e90c7fba85ad075a6d710119bf5dd6498fc4d7b7`,
  `c25efe9b598f163e26e912e9f6a66756cacf6bba`, and
  `4cf6f80c092593a759c23eda0e0e0891f2b9419d`. Donor working blobs are respectively
  `cfd7cf230da740f5b44eda1e5fadaf0771dc066a`,
  `e06ca1bbd71ceb8562891be6f2a37e5c90fd00f8`,
  `a7d0c7cf462e1a0639333075dbeaf22ca3a4c2c7`, and
  `7cd69fec570dcb7bfe4a52da01816a832d9a22f0`.
- Exact working-layer comparison: current `main` preserves typed refusal reasons, rejects
  V128/EXTERNREF result contracts, and includes V128/EXTERNREF refusal probes plus duplicate,
  unlinked, oversized-input and exact-bound fixtures. The donor converts validation to a
  boolean, admits V128/EXTERNREF result contracts, and deletes the externref-result refusal
  probe and feature flags from the documented WAMR rebuild configuration. Its matcher still
  invokes WAMR's result-kind accessor for every result. Keep this delta `HOLD/NOT_PORTABLE`;
  widening a contract allowlist does not establish safe result introspection.
- The probe runner pins WAMR 2.4.5 product-mini Release headers/library by exact SHA-256.
  **Historical preflight snapshot:** WSL had `gcc` and `wat2wasm`, but no
  `WAMR_ROOT`, `WAMR_INCLUDE_DIR`, or `WAMR_LIBRARY` in that invocation; its probe
  refused before execution. This bounded environment check did not establish that
  WAMR was absent elsewhere. The current pinned-SDK probe rerun and its exact
  results are recorded in the 2026-10-13 entry below. Astra worker
  `01a12dba-335e-7191-b2cc-f2a17c55076d`
  reviewed the supplied exact diff **PARTIAL, excerpt-based**: it agrees the donor working
  delta should be excluded, and asks for exact pinned WAMR source/API behavior plus
  assertions-enabled and Release probes before either result kind can be admitted. It did not
  inspect the filesystem or run WAMR; no response digest is available. The runner preflight
  was invoked in WSL and refused before build/execution with “Set WAMR_ROOT or both
  WAMR_INCLUDE_DIR and WAMR_LIBRARY”. No donor bytes were copied.
- Bounded follow-up: rechecked the live Git relation and the candidate's four WAMR
  working-layer paths. The two untracked WAT fixtures are byte-identical to files
  already present in the integration checkout. Candidate C admission/probe/runner
  changes add invalid-kind, duplicate/unlinked-import and bounded-fixture checks, but
  the integration checkout already contains those cases plus stricter refusal tests
  for V128/EXTERNREF result contracts and typed validation outcomes. Candidate
  contract validation accepts result kinds the integration code refuses; do not port
  that weaker variant. The candidate's staged WAMR layer is already identical to
  integration `main`; no unique WAMR path from this candidate needs copying. This
  disposition is limited to WAMR paths, does not clear its other 49 dirty entries,
  and is not authorization to retire the worktree. Continue to the next candidate.

### Locked native-Fungi overlay recheck — 2026-10-12

- The detached `rd-0873-native-fungi-bootstrap-implementation` worktree remains at
  `e1c2496f3f36d154a445ba9c302401ccaaf74bae`, 343 commits behind local integration
  `main`. Its live overlay has 50 paths: 36 staged, 5 unstaged, 14 untracked, with
  5 staged/unstaged overlaps. The worktree metadata carries the explicit lock
  `CLOSED_FOR_NEW_WORK / RETAINED_DIRTY` and says not to prune, reset or delete it.
  The lock's dated statement says the source was reconciled into the
  `memory-custody-20261007-5cb651189` preservation copy.
- A bytewise comparison of the 50 live changed paths against the integration
  working tree found 5 identical and 45 different files. This is not a disposition
  of the 45 differences: generated files, historical source revisions and staged
  versus unstaged layers need per-path interpretation. Existing dated reviews
  already reject the donor's VOK arena patch and unsafe WAMR result-kind widening;
  current integration has its own pinned WAMR probes. Do not recopy either.
- The remaining detached overlay is not cleared for integration or retirement by
  this bounded recheck. Preserve its index, working files, ignored payload and
  preservation copy; no files were written in, copied from or removed from the
  locked worktree. Continue to the next eligible checkout.

### VOK arena copy-escape and donor-port review — 2026-10-12

- Exact current `main` blobs for `native/vok-authority/src/secret_arena.rs`,
  `src/tests.rs`, and `tests/secret_arena.rs` are respectively
  `aa624135b4483ed7b3d0bdff92f535f8cbc6972e`,
  `bc0a4a89cf6f454c50adbe1f9fd9964a6bed870d`, and
  `15a10a8fa986a068dcd1226955846b35fb69a42c`; all three are clean in the integration
  checkout. The older `memory-current-main-20261008` donor has staged changes to those
  files plus `src/lib.rs`; its checkout remains 101 commits behind this `main`.
- Both revisions expose `SecretArena::with_bytes_mut` only through a private Rust module
  and a `pub(crate)` callback. The ignored Linux test copies byte `0xA5` into an owned
  `Vec`, successfully cleans the arena, then asserts the vector still holds the byte.
  The test is ignored by default because it requires `memfd_secret`; it was explicitly run
  on the integration `main` in Ubuntu WSL and passed 1/1. This confirms copy survival
  through successful cleanup on that execution surface. It does not establish a production
  leak: a bounded text search found no production call site, and it does not prove
  repository-wide absence.
- Astra review `01a12dba-335e-7191-b2cc-f2a17c55076d` returned **PARTIAL, excerpt-based**:
  it did not independently read the checkout or run tests. It agrees the counterexample
  limits the cleanup claim, while production reachability and RD disposition require
  more evidence. The WSL result was sent to the same Astra worker for a bounded evidence
  update; that follow-up is pending. No response digest was available for the first reply
  and none is claimed.
- Fresh Ubuntu WSL verification on this `main` candidate: the explicitly ignored copy-escape
  test passed 1/1. The full `vok-authority` crate suite then passed 47 unit tests, 3
  integration tests and 20 doctests; 6 unit and 2 integration tests remained ignored by
  their own platform/resource gates. Native Windows `cargo test ... secret_arena` passed
  3 unit plus 3 integration tests, including explicit unsupported-platform refusal. These
  are crate-level results only; they do not establish production protected-byte flow or
  RD-1413/1414/1415 closure. GitHub CI was not run.
- Do not transplant the donor `src/tests.rs` or `src/lib.rs` wholesale: the integration
  `resource.rs` test module imports three `crate::tests` helpers that are `pub(crate)` on
  `main`, while those helpers are private in the donor and its staged `lib.rs` removes
  `mod resource;`. This is a conditional compile risk, not a reproduced failure. Review
  the exact VOK hunks; preserve current `resource` wiring/helper visibility, then compile
  and run the composed tests in WSL. Include `tests/secret_arena.rs` only if its diff is
  required for that coverage. No donor bytes were copied or staged.
- Direct file-to-file diff narrows the proposed VOK port further: donor `secret_arena.rs`
  changes formatted error identifiers and removes `allow(dead_code)`, but changes no arena
  allocation, cleanup, or ownership behavior. Donor tests remove `SecretArenaError` display
  compatibility coverage; its `lib.rs` removes the existing resource, memory-policy, SHA-256,
  and VEO modules/APIs. Current `main` already contains the passing copy-survival counterexample.
  Provisional disposition: **do not port this donor VOK patch as a memory fix**; no useful
  arena-memory delta has been demonstrated. The same Astra worker's exact-diff follow-up
  agreed (**PARTIAL, excerpt-based**) that all four donor VOK file changes should be excluded
  from the memory path. The formatted-error-code change could be proposed separately as an
  API-output contract change; it is not memory protection, and existing tests require explicit
  compatibility review. Do not widen this conclusion to “no VOK memory fix exists anywhere.”

## Inventory snapshot — 2026-10-11

- A fresh read-only snapshot flags every current worktree and every local/origin branch ref. It found 19 worktrees (10 with Git lock metadata), 34 local branches and 33 origin-tracking refs. `main` and `origin/main` were equal at `c46e1e01b4c33fa6d540550482deaf4b44dcc7c6`.
- 30 of 33 non-main local branches and 26 of 32 non-main origin refs have commits not reachable from their respective `main`. These are review candidates, not merge counts; ancestry does not detect squash-equivalence or classify dirty overlays.
- Full per-item flags, commit distances, staged/unstaged/untracked status counts and required next checks are in [worktree-flags-20261011.md](reports/worktree-flags-20261011.md). The report now includes ignored-path match counts and an exact PR-head crosswalk for all registered worktrees, plus the live open-PR list. Ignored payload contents remain unreviewed; no item is marked safe to retire.
- The current `main` worktree alone has 9 staged, 87 unstaged and 11 untracked status entries. The two dirty memory-candidate overlays have 2/48/0 and 48/8/2 respectively. Preserve all three pending path-level reconciliation.
- Snapshot procedure: audit-map plan SHA-256 `416961e565e7e8f76aaaea29c1373d20ee95f961d8d583a119bdb1a48ce8dba4`; inventory script SHA-256 `ED83C1EE4B5F7A248F939C0BA22EBD55853583ACCE418C3BF46C41C9CD7BFDE5`.

## Live retirement delta — 2026-10-11

- `main` and `origin/main` are both `44a26cb22a362638a6cf106d05bd9d09e57f6821`.
- Live Git counts after retiring the merged PR #40 checkout are 18 registered worktrees,
  33 local branches and 31 remote-tracking names (including `origin/HEAD`). Ten worktrees
  retain Git lock metadata; those locks and the dirty memory donors remain untouched.
- The active `main` checkout still has 103 porcelain entries: 11 staged, 87 unstaged and
  10 untracked, with overlapping staged/unstaged paths. No broad staging or cleanup occurred.
- The exact PR #40 worktree registration and local branch were retired. Its merged change is
  present on `main`; the original tip is preserved under the local archive tag recorded in
  `reports/worktree-flags-20261011.md`. Git left ignored package build/dependency output in the
  former directory; it was not deleted. Matching output directories exist in the active
  checkout. This is one verified retirement, not whole-project consolidation.

### Verified remote-branch retirement delta — 2026-10-11

- Six remote branch refs were removed after checking each live tip against live
  `origin/main` at `c46e1e01b4c33fa6d540550482deaf4b44dcc7c6`: the already-integrated
  `fix/absorbed-kb-links-20261009` and five completed core-CLI branches
  (`grok/core-cli-build-command-20261005`, `grok/core-cli-build-contracts-20261005`,
  `grok/core-cli-plan-command-20261005`, `grok/core-cli-plan-contracts-20261005`,
  `grok/core-cli-verify-runtime-20261005`). None was checked out or had an open PR;
  their tips were ancestors of `origin/main`. GitHub Actions was verified disabled.
  Their commits remain reachable from `main`.
- Live counts after deletion: 19 registered worktrees, 33 local branch refs and 27
  origin branch refs. No worktree or local branch was removed by this delta. The
  older inventory tables remain dated snapshots; refresh them before another
  retirement batch.
- A further redundant remote ref, `grok/wat-parked-memory-20261002`, was removed
  after verifying its tip is contained in the live remote
  `grok/wat-integration-candidate-20261003`, with no PR for the parked branch.
  Its local branch and worktree remain intact because ignored signing/build
  payloads have not been dispositioned. This does not mean the WAT work is in
  `main`. Live counts are now 19 worktrees, 33 local branch refs and 26 origin
  branch refs.
- Fresh working-tree comparison: `memory-consolidation-20261007` is 80 behind / 7
  ahead of `origin/main` with 48 changed paths; `memory-current-main-20261008` is
  99 behind / 0 ahead with 54; the `main` baseline is current with 103. Shared
  changed-path overlaps are not interchangeable: consolidation/current-main has
  8 overlaps and all 8 differ byte-for-byte; consolidation/main has 10 and all
  10 differ; current-main/main has 13, of which 2 match and 11 differ. No donor
  overlay was selected or overwritten by this comparison.
- The full native Windows compiler `npm test` run at candidate HEAD
  `3ac9f8b150e074247092bdcf164f500e4b4d995d` exited 1. Partial output includes
  self-hosted parity failures, a WAT refusal regression, and a secret-runtime
  fixture digest mismatch. This is a failing run, not a pass; its output was
  truncated and a complete per-test disposition remains outstanding.

## Current consolidation checkpoint — 2026-10-10, reviewed compiler batch

- Remote `main`, local `main` and the reused working branch were read back at
  `d1939459ecfa53a6d91e5ea28016d3e446d1071c`. The 84-file reviewed compiler,
  graph and generated-record batch is integrated; this is not a whole-memory
  merge or an assertion that the detached primary checkout is clean.
- Git registers 19 worktrees. The primary checkout remains detached and dirty;
  the two retained memory donors remain dirty. A fresh comparison against this
  commit found 10 working-file matches in `memory-consolidation-20261007` and
  nine in `memory-current-main-20261008`. The other 77 donor file entries need
  path-level reconciliation; generated differences are not automatically missing
  code. The comparison is scoped to those donors and does not retire either one.
- The new integer-invariant fold patch is uncommitted and **not mergeable**:
  retained interpreter, WAT and CLI counterexamples expose semantic disagreement
  and four maintained red regressions. The vault status/acknowledgement contract and real protected
  `/auth/verify` route still lack implementation and composed proof. Keep the
  local-only coordination file and untracked Myco exclusion outside staged work.
- A direct working-file comparison of
  `examples/auth-service/routeDispatcherService.fungi` against the retained
  `memory-current-main-20261008` donor found only different header comments.
  The current integration copy explicitly says its dispatch metadata does not
  establish production execution readiness; the donor's older milestone wording
  is not a missing `/auth/verify` implementation. No port is needed for this
  path, but this one-file disposition does not retire the donor.
- The same donor's `cli-classical-signing-refusals.test.mjs` uses a copied
  repository revocation snapshot and omits several independent refusal checks.
  The current integration test instead uses an isolated signed fixture,
  clears inherited Git/signing variables and covers missing, unsigned,
  wrong-root, tampered and non-append-only snapshots as well as legacy CBOR
  refusal. Its six tests passed locally on Windows and WSL. The donor test
  needs no wholesale port; this does not prove production signing custody.
- The donor's `wasm-effect-grant-abi.test.mjs` has narrower signature-refusal
  assertions. The current integration test additionally observes actual engine
  compilation/linking and start-call order, compares successful signature twins,
  checks synthetic-oracle rejection, and captures the factory host across
  changing options. Its 15 tests passed locally on Windows and WSL. No donor
  test port is needed for this file; these controlled non-secret checks are not
  production grant custody or protected-memory proof.
- The donor's `rd1413-auth-route-candidate-strict.test.mjs` mislabels legacy
  checker flags as strict enforcement. The integration test now calls them
  compatibility-only and sanitizes inherited Git/Node authority. Its one
  compatibility test passed on Windows and WSL; the separate
  `scripts/tests/auth-route-dispatch-example.test.mjs` passed its two real
  root-CLI positive/negative checks on both hosts. No donor test port is needed
  for this path. Neither test supplies a production `/auth/verify` implementation.
- The two donor comparisons also contain 17 `build/` file entries, including
  code-index, registry, dev-tool-index and project-graph outputs. Their current
  generator owners were reopened. Read-only checks show code-index, dev-tool
  index and project-graph output drift; the code-registry check passes against
  its present code-index input, which itself is stale. These are derived
  visibility outputs, not donor source to copy byte-for-byte. Regenerate and
  verify them from the final integrated source set, then inspect any remaining
  semantic differences; this classification does not account for the donor
  source files or claim the generated outputs are current.
- The retained `memory-current-main-20261008` copy of
  `packages-ts/galerina-core-compiler/src/generic-argument-kinds.ts` lacks the
  integration version's shared builtin arity map and out-of-range-position
  refusal. Current parser, type checker and value-state checker consume those
  contracts; the focused domain-type and authority-use suites passed 184/184 on
  Windows and WSL. The donor source is superseded for this path, not an
  unported memory feature. Those bootstrap checks do not prove runtime secret
  ownership or host enforcement.
- That donor's `src/value-state-checker.ts` would replace parser-backed secret
  result-type identity with a text match, scope-aware module alias capture with
  a flow-wide map, and omit current resource/hallmark secret-lease checks.
  Focused authority, helper-return, alias and secret-source suites passed
  199/199 on Windows and WSL. The current integration source supersedes this
  donor path; these checks establish compiler/bootstrap behavior only, not a
  Fungi runtime or hostile-host memory guarantee.

## Earlier reconciliation checkpoint - 2026-10-10, generic/helper and WASM donor review

- The reused integration checkout was reverified at
  `a7bfa3cb4ee87e8a62ad447a59798927416b6a80`. No fresh remote equality
  claim is made by this checkpoint. The compiler repair now in progress is
  uncommitted and is not included in that commit identity.
- Independent five-file comparison of the retained memory-current-main donor
  found its generic metadata, type-checker, value-state and export changes
  superseded by current implementations, and its helper-return tests retained.
  This establishes no need for a wholesale five-file transplant; it does not
  account for the donor's remaining files or authorise whole-tree retirement.
- New counterexamples from that review remain open: quoted generic payload
  parsing, helper module-shadow classification and secret-result metadata
  classification. The last is reproduced through the strict root CLI and has
  a focused parser-backed repair in progress. No runtime disclosure claim or
  RD closure follows from those bootstrap checks.
- The separate three-file WASM host/grant donor comparison favours current
  host capture and admission controls; its disposition remains provisional
  pending independent reconciliation. Focused local execution is not proof
  of production secret-grant admission or complete memory guarantees.
- A fresh comparison also accounts for three memory-consolidation app-kernel
  paths: `src/idempotency-replay-policy.ts`, `src/kernel.ts` and
  `tests/kernel.test.mjs` within `packages-ts/galerina-framework-app-kernel`.
  Their donor working contents match the committed integration version after
  CRLF-to-LF normalisation; the donor index equals its own HEAD, with no separate
  staged delta for these paths. No additional port is needed for those files.
  This source-preservation result is not a new runtime test result.
- Integer invariant folding and the vault proposal's recovery/acknowledgement
  contract remain separate unresolved repair units. Original donors and
  recovery material remain retained. This checkpoint retires no worktree,
  removes no branch and does not claim main-plus-one consolidation complete.

## Earlier integration checkpoint - 2026-10-10, auth/key donor ports in main

- Main and the reused working branch were read back remotely at
  `65792296dc79404f1ab8d0b3956dde03b3275102` after an atomic, non-force
  fast-forward from `213772564df45ab7ddedc997101483c56cf75089`. Local main
  was advanced only after confirming no registered checkout held it.
  Actions was disabled immediately before publication.
- The auth compatibility test preserves the legacy checker without claiming
  that its ignored strict flags enforce current semantics. Fresh retained WSL
  evidence covers three tests, including the separate root CLI controls.
- The app-kernel duplicate response no longer echoes the caller's key.
  Independent source review and the retained 579-test package result cover
  the narrow port; durable idempotency and host-memory guarantees remain open.
- Build manifests were regenerated from staged Git contents. The app-kernel
  manifest also reconciled prior-main drift; its SBOM drift and the separate
  TypeScript-migration policy finding were not silently declared resolved.
- Nineteen registrations remain; no donor checkout was retired or modified.
  The two retained vault proposal copies agree after line-ending normalization,
  but their recovery, generation and integration obligations remain open.
  Archive preservation still does not establish integration.

## Earlier integration checkpoint - 2026-10-10, reviewed batch in main

- Remote and local main were read back at
  `c74af0b3e7f73cf0f1713f79d612a21f7c7a374c` after a normal non-force
  fast-forward from `08249019a555e5d613644bd9252cce30f0a04500`. The eleven
  reviewed commits are integrated; the reused working branch matches that head.
  Actions was verified disabled immediately before publication.
- The earlier frozen diagnostic-owner and canonical root-lock conditions below
  are resolved for this batch. The final native root-lock check returned
  `REFERENCE_LOCK_VERIFIED`, with `authorityReleased: false`. Independent
  external-delta adjudication found no additional scoped integration blocker.
  Explicit LF policy still refuses CRLF; declaration discovery does not imply
  complete diagnostic sink inference.
- Nineteen worktree registrations remain. None held local main when its ref was
  advanced; no dirty primary/native working files were reset or synchronized.
  The local-only coordination file and untracked Myco exclusion remain excluded.
- This is partial integration, not whole-memory completion or a full compiler
  suite pass. Retained primary/native/memory overlays, other compiler failures,
  lease/runtime/host evidence and useful-work reconciliation remain open.
  Archive preservation is not integration. No checkout was retired by this update.

## Earlier integration checkpoint - 2026-10-10, reviewed memory batch

- The existing integration branch `fix/absorbed-kb-links-20261009` is published
  through `0c146e27aca038ee86fcbfcedba85ca253c16780`, eight commits ahead of the
  last verified remote main `08249019a555e5d613644bd9252cce30f0a04500` and zero
  behind it. This batch is **not merged into main**. Recheck remote identities
  before publication; this paragraph is a dated observation, not a live receipt.
- Live registration inspection found 19 worktrees and **none holding local
  main**. Local main matches the main revision above. The native implementation
  checkout is detached at `e1c2496f3f36d154a445ba9c302401ccaaf74bae`, still locked
  and retained. The primary checkout remains detached at `9a26c71e60e491766ef351d0efe0405b0739c1b6`.
  Earlier occupied-main statements below describe historical checkpoints.
- Independent review leaves two finite batch integration conditions: correct
  the diagnostic catalog's frozen WASM-grant owner classification, and reconcile
  the root-lock collector's byte contract with cross-platform Git text conversion
  without ignoring working-file changes. The existing runtime freeze and secret
  lease refusal remain intact. No root-lock acceptance or whole-memory closure
  is established by this checkpoint.
- The vault build-manifest correction in `0c146e27a` was independently checked
  against the committed test blob and the generator's aggregate formula. The
  post-commit owner check reports no generated-document drift for compiler,
  runtime-WASM or vault, but retains 52 other drift entries and separate package
  policy findings. Its overall result remains a finding, not an all-package pass.
- Retained primary, native and historical memory overlays still need useful-work
  accounting and integration. No checkout retirement follows from this batch.
  GitHub Actions was disabled before its last push; no CI was run.

## Latest retirement checkpoint - 2026-10-10, native finalize

- Git registers **19 worktrees** after retiring the historical
  `rd-0873-native-fungi-bootstrap-finalize` checkout. Its committed head
  `5faf6e2653199ae2174ddec30994e757be79c685` is contained in published main
  `ca4bed8946805e823f0d993f4dda1f7f3afab6c1`.
- The redundant local and remote branch
  `codex/rd-0873-native-fungi-bootstrap-implementation` were removed after
  verifying exact remote-tip ancestry and no open PR. GitHub Actions remained
  disabled. The commit remains in main history and the original directory is retained.
- Five uncommitted documentation changes were preserved, not merged wholesale.
  They roll back later progress records; their dependency-closure,
  negative-fixture and same-head evidence requirements remain in the current
  AGENTS source-origin design/plan. That reconciliation does not close those
  execution requirements or privately owned RD criteria.
- The complete original directory and Git administration remain in local
  recovery. All 15,945 entries, including 14,330 regular-file hashes and 12 link
  spellings, matched before and after relocation. Inventory SHA-256:
  `83f40354499ad96329c735aef8137b4f85a90abb79b9bb99a6a8456be331f945`.
  Historical Git markers and link targets need repair before reuse. Same-volume
  preservation is not an off-device backup.
- Visible Windows and WSL process checks found no reference to the old checkout;
  inaccessible system processes remain outside that observation. No source file
  was deleted. Primary, local-main and memory overlays remain unreconciled.
- The preceding scoped integration is now published on remote main and the work
  branch at `ca4bed894`; the old local main remains intentionally unchanged.

## Scoped integration decision - 2026-10-10

The coordinator accepts the reviewed twenty-commit source delta through
`29e61be9bca0162b5fc138c21f70a1c347557889` for scoped integration over
`5b64928ca67b30279eae38e372398ba16acd8827`, with the following explicit limits.
Independent matched comparison and subsequent port reviews found no demonstrated
new regression; they did not establish full-suite clearance. The matched candidate
retains **233 failures and 117 cancellations**. CEC4, host-bound P9 failures, T14
setup/hash findings, historical whole-file freezes, stale line assertions and
assertions masked by earlier failures remain open debt. The missing packing-disabled
and contiguous-producer controls remain prerequisites to replacing the historical
freeze, not evidence supplied by this merge. Expected acceptance hashes are unchanged.

HOST and docs-index ports have independent scoped approval, including the retained
journal-failure controls and manual-recovery limitations. The diagnostic code-index
reproduces under native Windows Node v24.18.0; cross-platform JSON equality has not
been established. Documentation indexes are refreshed through their owner separately.
This decision authorizes no production deployment, runtime-security claim or RD closure.

Remote main may be fast-forwarded through the existing integration branch after
fresh publication checks. Local main at `e1c2496f3` remains intentionally retained
in its dirty legacy checkout; the detached primary and its changes also remain
untouched. Remote integration does not itself reconcile either overlay. Actual
publication and final commit identity require a separate verified receipt.

## Latest retirement checkpoint - 2026-10-10, docs-index

- Git registers **20 worktrees** after retiring `rd0873-docs-index-manifest`.
  Its branch `codex/rd0873-docs-index-manifest` remains at
  `34907348c5d948c2ced23a841802e181176b6015`; no branch history was deleted.
- The two unique historical commits and exact head tree were independently
  recovered from a complete bundle, SHA-256
  `71352b2538b46c799bb560ab95569613d9f578712a009560e4c6a18925554fd2`.
  The old generated write plan remains historical evidence, not current authority.
- All 10,411 directory entries, including 9,388 regular files and no links,
  matched before and after moving the original directory into local recovery.
  Original Git administration and index are separately preserved. This same-volume
  recovery is not an off-device backup; the old Git marker needs repair before reuse.
- The useful source port is retained in `e4f64e3bf`. Independent non-author Astra
  review approved the scoped HOST port, and required two docs-index follow-ups.
  Commit `131f9dbc1` adds journal-after-rename regression controls and
  [recovery guidance](reports/docs-index-recovery-contract.md). Both conditions
  received a subsequent independent PASS bound to the exact file hashes.
- The full manifest test file passed 61 tests in WSL. The reviewer separately
  executed the new parent and its two cases (three test entries), not the full suite.
  This is tooling evidence, not Fungi runtime or crash-durability proof.
- Visible Windows command-line and Linux process checks found no reference to the
  old checkout. Inaccessible system-process details remain outside that observation.
  The original directory was preserved; only its Git worktree registration was removed.
- Integration commit `131f9dbc1` was verified equal to its remote; no main merge
  occurred. Primary and other dirty memory overlays remain unreconciled.

## Earlier retirement checkpoint - 2026-10-10, Task6CR

- Git registers **21 worktrees** after retiring the old Task6CR checkout
  `rd0873-task6cr-hosted-evidence`. This is not overall consolidation completion.
- Its branch `codex/rd0873-local-integration` remains at
  `0ee686214619372c9cd87d6d58db72cf388ab651`. Ten unique historical commits were
  preserved in a complete bundle and recovered into an independent bare repository;
  full object checks and the exact head tree comparison passed. Bundle SHA-256:
  `81d88b184c85594b7dece1d45854646bd097153cdb9ec6c855f04abf20516579`.
- The original directory, including ignored files, was moved into the local recovery
  archive. All 32,456 entries, including 28,909 regular-file hashes and 40 link
  spellings, matched before and after the move. Original index and Git administration
  are retained separately. Recovery is on the same volume, not an off-device backup.
- The 40 absolute dependency junctions originally pointed within the old checkout.
  Their original spellings are preserved, not silently rewritten. They and the Git
  marker require remapping before reuse; this archive is not a runnable checkout.
- Independent Astra source review accounted for the identified useful Task6CR port:
  `742c9acba` retains the environment test with the moved product-asset declaration.
  Newer compiler and retained-capture owners remain intact. This does not prove
  emitted String-GIR execution, real checker receipts or SLIDE/VOK admission.
- Bounded Windows command-line and Linux process checks found no visible reference;
  inaccessible system-process details were not proven inactive. No source was deleted,
  no main merge occurred, and the retained historical branch was not deleted.
- Published integration head before this ledger update was `b153cc8ae`; remote main
  remained `5b64928ca`. HOST and docs-index need non-author independent review;
  their original Astra author cannot provide that approval. Other dirty overlays
  remain unreconciled.

## Earlier integration checkpoint - 2026-10-10, matched comparison and retained ports

- Fresh registration inspection shows **22 worktrees**. The target remains main
  plus one active work branch; consolidation is not complete. Other dirty memory
  candidates, the primary checkout and retained historical trees still require
  reconciliation. A retained lock is not proof that source is absent from main.
- Existing work branch `fix/absorbed-kb-links-20261009` contains the reviewed
  comparison candidate `9ce35c719` and four subsequent scoped local commits:
  `e92958ca6` (historical archive references), `742c9acba` (core-config asset
  metadata and retained snapshot test), `a408a4a3e` (HOST residue tests), and
  `e4f64e3bf` (guarded docs-index output-plan port). Publication is a separate
  checkpoint; this entry does not claim a main merge or release clearance.
- Core-config typecheck/build and all 97 package tests passed in WSL. HOST tests
  finished with 56 passes, one Windows-only skip and no failures. Integrated
  docs-index fixture tests passed 60/60 from the repository cwd; an earlier
  wrong-cwd setup failure remains recorded. No real documentation corpus apply
  was performed. These results do not close runtime or RD obligations.
- Independent Astra review reconciled the earlier B/C test ambiguities and found
  no newly demonstrated source regression in that bounded delta. The full
  candidate still recorded 233 failures and 117 cancellations. Generator counts
  were B11/C32; both generated-index checks reported drift, not PASS. Later ports
  remain outside that review's exact revision scope.
- Comparison originals, candidate build outputs and exact mixed-EOL copies were
  preserved separately. Thirteen restored files were confirmed equal to committed
  source after newline normalization, then returned to Git's checkout formatting.
  No substantive compiler edits were discarded. The local-only branch record is
  excluded from publication.

## Earlier retirement checkpoint - 2026-10-10, historical documentation

- Git now registers **28 worktrees**. This remains an incomplete consolidation,
  not a claim that the remaining dirty overlays are reconciled.
- `rd0873-pre-restart-docs-20260905` at
  `4143efcb649ea65536c096e8db033442d2fb2cf1` and `rd0873-task6d-cumulative` at
  `5b234d91b023f0ed1bc3e527994576c50278e68c` were retired after independent
  historical-document disposition. No additional live port was identified;
  historical external-owner caveats remain unresolved, not silently signed off.
- Both whole original directories, including ignored contents, Git administration
  and saved indexes, remain in the local recovery archive. All 9,369 and 9,883
  regular files respectively matched their recorded hashes before and after
  relocation. No links were encountered in these two inventories. Local branch
  references remain; no remote references changed in this retirement.
- Their complete history bundle has SHA-256
  `264246cedda7f34bf82beb166c8ae98e183506d7576dad7a9fbd843105cb16e6`.
  Independent restoration, full Git integrity checking and the seven reviewed
  committed blob identities passed. Recovery working bytes and committed blobs
  retain separate identities where line endings differ. Original Git pointers
  require repair before a recovered checkout can operate normally.
- The earlier broad ignore-rule equivalence claim is withdrawn: the current
  rule covers a narrower specific toolchain directory. Retirement preserves the
  historical alternative; it does not adopt that broader ignore pattern.
- Visible process checks found no users of these two paths; this is not an
  exhaustive open-handle guarantee. Same-volume recovery is not independent-device
  disaster recovery. No runtime, RD or main-merge clearance follows from retirement.

## Earlier retirement checkpoint - 2026-10-10, after rounding review

- Fresh Git registration count: **30 worktrees, 20 locked**. Consolidation is
  incomplete; these counts do not establish that remaining work is reconciled.
- `rd-0873-native-fungi-bootstrap-resume` was retired after confirming its clean
  tracked tree and HEAD `4a940db252e0ae03d8769fe517549a61f206a589` were contained in
  remote main `5b64928ca67b30279eae38e372398ba16acd8827`. Its 408 untracked files
  (closure note and native build output) remain with the whole original directory
  in local recovery. All 13,511 regular-file hashes and 15,044 inventory entries
  matched before and after same-volume relocation. Git administration/index were
  preserved. Ten absolute link targets retain historical spellings.
- `grok-rounding-20260930` was retired after Astra dispositioned all 64 changed
  paths: useful source/test work was preserved or superseded in the integration
  candidate; no additional port was identified. The whole original directory,
  including 27 untracked files, generated snapshots and Git administration/index,
  remains in local recovery. All 10,918 regular-file hashes and 12,211 inventory
  entries matched after relocation; 33 link targets were recorded without
  traversal. The redundant local branch was deleted without force after checking
  containing main history; no matching remote branch or open PR existed.
- Recovery inventories are bound by SHA-256:
  native resume `d9b72d472c4c24376ec7788f06f39d2c1095df24562d3fe6205ce07654adefb3`;
  rounding `9371b9901411d65c592eeb479d3634da8891b6dd9d7349db1da76e69acc78132`.
  Process checks covered visible Windows command lines and Linux working
  directories, not every possible open handle. Original Git markers and absolute
  junctions require repair in restored working copies. Same-volume retention is
  not independent disaster recovery; retirement is not runtime or RD clearance.
- Published integration source is `330e45149c358e61654d21f4ea150245a87ccacd` on
  `fix/absorbed-kb-links-20261009`: 11 commits ahead, zero behind the checked remote
  main. Its generated diagnostic index is now committed. Before this ledger edit,
  only the explicitly local-only `GROK-BRANCHES.md` remained dirty in that checkout.
- The full WSL compiler run at this exact source finished with exit 1, not timeout:
  **8,104 tests: 7,751 passed, 236 failed, 117 cancelled, zero skipped**. Log
  SHA-256 `f7ead08a730b70b09e7c48981bd0ce3a2e75d46629540276c47bd3a5eb7f51cb`.
  This is not a passing merge gate. Test-count changes mean differences from the
  earlier run do not directly count repaired defects. Classify inherited versus
  introduced failures before integration; never refresh expected hashes blindly.
- Historical documentation trees remain under separate review. The primary,
  occupied-main and memory-candidate overlays still require reconciliation.

## Earlier retirement checkpoint - 2026-10-10

- Current verified registration count: **32 worktrees, 21 locked**. Nineteen
  detached WAT variants were retired after exact source-preservation review,
  publication of the reviewed successor on the existing work branch, and recovery
  verification. Original directories, including ignored content, and saved Git
  administration/indexes remain in the local recovery archive. All nineteen
  receipts were rechecked against live registration and filesystem state.
- The redundant roadmap checkout and local/remote branch
  `grok/roadmap-wat-l1-label-20261006` were subsequently retired. Independent review
  verified all twelve added lines and four deletions, including their surrounding
  behavior, in published remote main `5b64928ca`. Original commit `420645da2` is
  retained in a complete history bundle (SHA-256
  `46bf043c39a540bf03a9770444bde64e3e85d79de9feb580424b8eb6093771c5`), independently
  unbundled and checked. Original directory and Git index/admin remain recoverable.
  Its already-dangling compiler dependency junction was retained as metadata,
  not represented as recovered dependency contents. No open PR used that branch.
- The `grok-interpreter-i2-i3-20261002` and `grok-diag-constants-20261002`
  checkouts were recoverably retired, not declared merged. Their complete original
  directories, including ignored local files, and copied Git indexes/admin remain
  in the local recovery archive. Commits `ce68d618` and `c9f0453` are retained in
  the independently restored candidate-history bundle, SHA-256
  `465b114d754e9fa33df56c1cd60599c814a87a80aac481d35990104e795c2cef`.
  Branch refs remain. Remaining ports: timeout quarantine/re-entry handling,
  body-local invariant admission/enforcement with matching WAT refusal, and
  diagnostic metadata consolidation. Do not replace current source wholesale.
- Published work branch at this checkpoint: `fix/absorbed-kb-links-20261009` at
  `46bcd8c5975882f0cf151a02af24ed550e10be8d`. Remote main remains
  `5b64928ca67b30279eae38e372398ba16acd8827`. The exact i64-local match and strict
  parity assertions are committed in `ea549b3e2f0c3f05a83b0efffa14ba2f6680667b`;
  the signed CLI test fixture is committed in `86a5ea57a`. Focused fixture tests
  passed 6/6 in WSL, but the broader compiler run remains 7,540 passed, 250 failed
  and 117 cancelled. This retirement does not claim main integration or runtime
  correctness. The missing counted-loop deadline callback was separately ported
  in `46bcd8c59`, independently reviewed, with 64/64 focused WSL tests passing.
  Three generated code-index files remain separately uncommitted; a new failing
  generator regression reproduces a registry-entry false emission pending repair.
- Recovery archives retain historical Git markers and junction targets; restore
  requires metadata repair. Reviewed changed files were hash-verified, while the
  full directory inventory checked metadata, not every ignored file's bytes.
  Original directories were moved within the same volume, not deleted.

### Earlier checkpoint within 2026-10-10

- Then-verified registration count: **54 worktrees, 40 locked**. Consolidation
  remains incomplete; the dated batches below explain the reduction, not a clean
  estate claim.
- Runtime-executor strict checkout was retired after independent source review
  found its changes preserved in main. Its unique history remains in a complete
  recovery bundle (SHA-256 `8117754af06cae1f9cc2a7f0050c611e6d73ef8589864145050576e92a9fbb4e`).
  An independent bare restore passed strict Git integrity checks and matched all
  74,133 reachable objects. The original directory, ignored contents, Git admin
  and index remain in the local recovery archive. Its local branch was removed.
- Three detached WAT checkouts were retired after their source-preservation PASS
  and exact HEAD/status/raw-hash rechecks: `supergrok-wat-zt-q9-fault-recode-20261001`,
  `supergrok-wat-zt-q8-null-build-20261001`, and `supergrok-wat-j1-20260929`.
  Original directories and administrative/index records remain recoverable;
  every inventoried changed file was hash-checked again after relocation.
  Nineteen partially reconciled WAT variants remain; Int64 widening and stricter
  runtime-parity test findings are still unresolved. Preservation is not runtime
  correctness evidence.
- Integration HEAD for these checks was `6638def79f46e2e3c492ff194d472b618881b9d0`.
  The native memory/diagnostic slice remains uncommitted and under independent
  corrected-patch review. It is not included in the published-main claim.

- Registration count after the WAT snapshot retirement: **64 worktrees, 43 locked** after retiring the detached
  `supergrok-wat-zt-q9b-fault006-test-flip-20261001` checkout.
- All 160 changed source paths matched Git blobs at `05eb5c29be9592a42cdd48baaeb027279ff5299d`,
  verified as an ancestor of remote main. Four generated outputs and the closure marker
  were preserved with the entire original directory in the local recovery archive.
- Source status and SHA-256 values were checked before relocation and all 165 changed
  paths were checked again in the archive. Git administration and index were retained.
  Only the now-absent original registration was removed; no source files were deleted.
- The live 23-tree WAT comparison found differing source in the earlier variants.
  Supersession notes alone do not close those reviews. Twenty-two variants remained
  at that checkpoint, before the three reviewed retirements above.
- Remote main and the integration branch were both verified at
  `dde0e89efb12c2855c5ce87a3f1b237b0807e9d3` before this ledger update.
  Archived Git markers and dependency junctions remain historical, not executable setups.
- Latest count after four further recoverable retirements: **60 worktrees, 43 locked**.
  `codex-pr143-reconcile`, `grok-rd0349-zt-defaults-20261004`,
  `grok-rd0361-slide-s1-20261004` and `grok-rd0361-slide-s5-20261004` each had one
  dirty generated document whose normalized Git blob exactly matched its committed
  version. All four HEADs were ancestors of main. Original directories, index and
  administrative records were preserved; the three redundant local branches were
  removed, and no matching remote branches existed.
- Removed the two remaining remote counterparts from the earlier marker-only batch:
  `codex/rd0873-pinned-upload-format-observation-source` and
  `codex/rd0873-task6c-frozen-frame-candidate`. Their exact remote tips were ancestors
  of main and neither had an open PR. Their commits remain recoverable in main history.
- A second line-ending-only batch reduced the count to **58 worktrees, 43 locked**:
  `grok-rd0365-custody-host-resolution-20261004` and `grok-wat-d4-e5-zippair-20261003`.
  Every dirty file was compared with committed text after CRLF-to-LF normalization;
  original raw bytes, ignored contents and Git administration were preserved on relocation.
  Both local branches were removed. The RD-0365 remote had a different tip,
  `79687f2f105d364803dd84e4d47e9b035e5f18c6`; this exact tip was separately verified
  as an ancestor of main with no open PR before remote deletion. No matching remote
  WAT D4/E5 branch existed. No workflow contents or behavior were changed.

## Earlier verified checkpoint - 2026-10-09

- Remote main and `fix/absorbed-kb-links-20261009` both reached
  `087f8c172ff4ffe5803ad4ce4c8b87ec104af34c` through non-force fast-forward pushes.
- Fresh Git registration count after the marker-only batch: **65 worktrees, 44 locked**. This is not a fresh
  classification of every dirty or ignored file; the full inventory is separate.
- Consolidation is incomplete. Package-TODO was recoverably retired after its source,
  saved index and independent Git-history restoration were verified.
- WAT integration was also retired recoverably: 13,527 files retained, 160 changed paths
  verified in main history, five generated outputs preserved separately, and all 166
  status records matched through independent recovery. Its redundant local branch was
  removed; no matching remote branch existed. Eight already-broken external dependency
  junctions remain explicitly recorded, not claimed repaired.
- Thirteen additional marker-only checkouts were retired after fresh ancestry and status
  checks. Their entire original directories were moved within their original volumes,
  not deleted. Closure records and Git administrative files were retained; five redundant
  local branches were removed. Remote branch cleanup remains a separate check.

## Preservation and integration slots

| Checkout | Verified state | Next action |
|---|---|---|
| Repository root | Detached at `9a26c71e60e491766ef351d0efe0405b0739c1b6`; 87 status records | Reconcile staged, unstaged and untracked work separately. Keep local-only GROK-BRANCHES.md unpublished. |
| `.worktrees/rd-0873-native-fungi-bootstrap-implementation/` | Local main at `e1c2496f3f36d154a445ba9c302401ccaaf74bae`; locked; 50 status records | Preserve overlay before moving local main. Remote integration does not update this checkout. |
| `.worktrees/memory-main-baseline-20261009/` | Reused branch `fix/absorbed-kb-links-20261009`; published through `86a5ea57a`; native and diagnostic source fixes already in remote main `5b64928ca`; generated index changes retained separately | Diagnose remaining compiler failures, validate generated artifacts and continue consolidation; reuse this integration slot. |
| `.worktrees/memory-consolidation-20261007/` and `.worktrees/memory-current-main-20261008/` | Historical candidates with distinct overlapping changes | Recheck exact bases and preserve both overlays during reconciliation. |
| Former `.worktrees/grok-pkg-todos-20260929/` | Retired; redundant local branch removed; no matching remote branch existed | Original directory and independent recovery retained under the local Galerina-Recovery archive. Do not use obsolete path references. |

Owner-authorized consolidation includes eligible commits, pushes and merges. Do not
trigger GitHub Actions/CI; verify it remains disabled before publication. Use local
WSL tests. No force-push, reset of occupied dirty main, or deletion of unreconciled work.

## Integrated batches

- `c15ce8b5c53dccd336271e36b0338d01baf35e4d`: Myco ignore and code-label link fixes.
- `8b6d3af6c68b7e52f9780963bec0700e6919366a`: correction for scoped `/**/` matching.
  The earlier commit alone had a reproduced regression. Corrected package: 141/141
  WSL tests and strict type checking; independent Astra controls: 10/10.
- `087f8c172ff4ffe5803ad4ce4c8b87ec104af34c`: eleven Spore/governance doc repairs;
  twelve scoped documents scanned without broken active links. Missing historical
  generators remain unavailable; historical test claims are not fresh execution evidence.

## Remaining consolidation

1. Native and diagnostic source fixes are published; complete generated diagnostic
   index validation and diagnose the remaining compiler failures before broader
   integration. Keep source-preservation and runtime claims separate.
2. Retain package-TODO and WAT recovery archives, including generated outputs and closure
   records. Do not treat archived external dependencies as standalone executable setups.
3. The thirteen identified marker-only trees are retired. Continue with separately
   verified remaining trees; small diffs containing source or policy changes are not markers.
4. Reconcile memory candidates, primary and occupied-main overlays using actual ancestors,
   preserving later-main corrections and testing affected boundaries.
5. Review rounding and other unique commits; integrate useful work and retain recoverable
   evidence and an explicit disposition for superseded alternatives.
6. Verify main plus one working branch, remote equality, no unaccounted-for work and fresh
   indexes before reporting completion. Five deferred memory/consumer PRs remain separate.

Package-TODO recovery contains the preserved original directory and administrative
metadata, a byte-verified copy with internal junctions retargeted within the copy,
the saved index, a complete history bundle and independently restored bare repository.
The restored repository passed full and cached-object checks; recovery status exactly
matched all 33 original status records. File metadata checks covered 15,977 files;
directory permissions were recorded and the original directory was moved, not deleted.
The copied `.git` markers and original junction spellings are historical: recover using
the independent bare repository, explicit work-tree and saved index, not plain Git in
the copied directory. Process command-line checks found no named user of the old path;
this is not an exhaustive open-handle or external-dependency proof.

## Compiler integration preparation checkpoint (2026-10-10)

This dated checkpoint supplements, rather than replaces, the historical inventory
above. The active integration checkout remains
`.worktrees/memory-main-baseline-20261009/`, branch
`fix/absorbed-kb-links-20261009`, at
`a7bfa3cb4ee87e8a62ad447a59798927416b6a80` before the pending integration commit.

- The reviewed compiler batch covers structural secret labels, scalar artifact
  compatibility, exact wide-integer argument dispatch, WAT record/Float handling,
  and the portable WASM grant-signature test oracle. It also admits only the exact
  Decimal leaf dependency required by the existing closed scalar loader.
- Coordinator verification retained 922 passing tests across 32 affected compiler
  test files, plus a separate 12-test Decimal dependency/closed-loader run. These
  are bounded bootstrap/compiler evidence, not complete Fungi runtime, host,
  secret-erasure or end-to-end protected-operation proof.
- The maintained package-graph generator and its check passed for 100 packages and
  201 outputs. Changed tracked boundary reports were reviewed; ignored raw graphs
  are not part of the staged batch. Twenty-seven affected package build manifests
  were reproduced from the selected Git index. Twenty-eight other generated
  document differences remain separate, as do the generator's 95 content findings.
- Exact working-byte and prior-index recovery for the staged source and reports
  is retained in the coordinator's `reviewed-stage-recovery-v1` evidence bundle;
  the generated-manifest recovery and selected path receipt are retained in
  `selected-manifest-reconciliation-v1`. These are local recovery locators, not
  repository runtime inputs or proof that donor trees have been integrated.
- The project-graph builder now maps validated audited subpath imports to their
  exact registered package owner and retains the import spellings as provenance.
  Unknown and malformed identities still refuse. Independent coordinator execution
  passed all 13 maintained package tests; this proves neither exports nor runtime
  admission. The two-file repair and its generated build manifest have separate
  recovery in `graph-repair-stage-v1`.
- Diagnostic catalog generation/checks and project-graph generation/checks passed
  against the current candidate, with source and index stability checks. All five
  project-graph outputs are current. Existing lexical diagnostic coverage warnings
  remain findings, not execution evidence or resolved defects.
- Final staged gates and root-lock reconciliation remain pending. No commit,
  push, merge or donor retirement is claimed by this checkpoint.

Keep vault status/acknowledgement and ABI adaptation, integer-invariant folding,
protected-operation/host evidence, and remaining donor accounting open. Preserve
unrelated work, local-only coordination material and all recovery copies. The
remaining-work and main-plus-one requirements are not satisfied by this batch alone.

## Live donor reconciliation checkpoint — 2026-10-12, first donor partial

Rechecked from the registered integration checkout and donor worktrees; this section
supersedes older head/count snapshots above only for the facts stated here.

- Integration worktree: branch `main`, HEAD `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6`;
  live `origin/main` is `44a26cb22a362638a6cf106d05bd9d09e57f6821`. The integration
  worktree has 96 unique porcelain paths (11 staged, 83 unstaged, 5 untracked; 3
  paths have both staged and unstaged layers). A live `git ls-remote` check confirmed
  that remote `main` still equals `origin/main`; local `main` is one commit ahead.
  No broad staging or cleanup is authorized by this snapshot.
- `memory-current-main-20261008`: HEAD `34b419057de49b6437d0b3b9423f3f2bfb205970`,
  ancestor of local `main` (`main...HEAD` = `101 0`), with 49 status entries (43 staged,
  8 unstaged, 2 untracked; layer overlap applies). Ancestry does not account for its dirty
  overlay. `memory-consolidation-20261007` is a separate later pass, not yet reconciled.
- The local `test: isolate package Git environment` commit is present on `main` but
  not yet published. Its focused `test-git-environment-isolation.test.mjs` passed
  6/6 applicable cases on native Windows (3 WSL-only cases skipped) and 9/9 in WSL,
  including the Windows-parent repository-routing interop case. This verifies only
  that focused test-routing unit; it is not whole-suite evidence or a reason to stage
  or publish the remaining mixed working tree.
- A collapsed ignored-path inventory found 169 entries in the integration checkout and
  34 in this donor. The names include signing-environment/key locations and generated
  Myco, graph, build and dependency/cache directories. Contents were not opened or copied;
  required-vs-reproducible status is not yet known. Preserve them and resolve their owner,
  recoverability and non-public status before any worktree retirement. Never commit
  signing environment material or private keys.
- Correction from the independent live-layer recheck: the first donor's vault
  `package.json`, `src/types.ts`, and `src/self-hosted/secrets-gateway-wit.fungi`
  are already committed in integration HEAD, with blob IDs
  `f5ee783e6ccab25bad51d59039b54c07c5066ea6`,
  `4e7402db093a6a49f4e179d3726f4c5d88ef1fbb`, and
  `6556f8a50993c692d4db323ce8d41b137bc83219` respectively. They are clean in
  the integration checkout; no donor port or dirty-main review is needed for
  these three files. The earlier working-byte hashes remain comparison evidence,
  not a current dirty-state claim. The Fungi WIT source labels itself
  non-authorizing and says no WIT build/runtime consumer is wired; the committed
  contract text and TypeScript oracle therefore do not implement the protected
  operation.
- The donor's untracked `rd1413-wamr-duplicate-import-probe.wat` and
  `rd1413-wamr-unlinked-import-probe.wat` are byte-identical to the integration worktree's
  staged additions. They are already represented in the integration index; do not add a
  second copy. Matching SHA-256 values are `17F55E1B4E0B162093A612CEB856B0FC8CC247A4BE869962FCED0795D14456D0`
  (duplicate-import probe) and `4D750C65449E6E987FFDF0DC8164D657FA5C8ADE023DD8B0C33424FFB43E9ABA`
  (unlinked-import probe). The separate context-probe C and runner-script working files
  differ and remain under review.
- `examples/auth-service/routeDispatcherService.fungi` differs from integration only in
  four milestone/header comment lines; integration explicitly says the example does not
  establish production readiness. This is not a missing protected `/auth/verify`
  implementation. The donor's strict-auth test is not equivalent to the integration test:
  it drops inherited `GIT_*`, `NODE_OPTIONS`, and `NODE_PATH` filtering and removes
  subprocess error/signal checks and the timeout. Do not port it wholesale.
- The donor's WAMR ABI overlay expands accepted result kinds to `V128` and `EXTERNREF`,
  removes the explicit unsupported-result probes and drops their runner invocation. The
  integration header documents the pinned WAMR accessor/assertion limitation for
  `EXTERNREF` results. Treat this donor change as unsafe to port absent a separately
  pinned runtime/API proof and discriminating test; this is not a general claim about
  other WAMR versions.
- Other inspected donor deltas are not blanket memory ports: `generic-argument-kinds.ts`
  removes builtin arities and returns a default `type` for unknown/out-of-range argument
  positions; the effect-grant ABI test removes observation of actual engine compile/link
  calls and start/effect ordering; and `wasm-runtime.ts` removes option/string canonical
  handles, an option-equality depth limit, and narrows effect-handler mapping. Keep these
  as separate source/test review units rather than transplanting whole files. In the
  VOK arena family, the donor also changes formatted error identifiers and removes the
  dedicated consumer-compatibility assertion while narrowing test-helper visibility; its
  intended contract and downstream consumers still need verification.
- `native/vok-authority/src/secret_arena.rs` and its unit/integration tests differ between
  the two working trees and remain unresolved. The remaining compiler, runtime, vault,
  WAMR, generated-output, ignored-payload and unrelated overlay paths also have no blanket
  disposition from this partial comparison.

These are working-tree byte comparisons and source review, not a completed independent
review, test result, Fungi runtime/host guarantee, RD closure, or authorization to commit,
publish, merge or retire either donor. Next: complete the first donor's per-path layers and
focused verification, then reconcile the second donor separately without replacing the
overlapping integration work.

### Independent Astra donor reconciliation — 2026-10-11

- Read-only Astra report: `PARTIAL`; response message
  `msg_05da37b88b862bc3016acc1b3b81e8819190614c9412fc8733`, completed
  `2026-10-11T23:31:11Z`. Exact report retained outside the repository with
  SHA-256 `2D12377D115CA446CF1DB39ABC82200C90CD37496A8CB7D08CF69FCE958D3C3E`.
- Astra independently confirmed the three checkout pins, separate staged/working
  layers, and selective-not-wholesale reconciliation. It found the vault status
  statement above stale; the correction is recorded here. Its 98-path matrix is
  advisory and does not replace current source verification or focused tests.
- Highest-priority next unit is the WAMR dependency group: reconcile the current
  header, admission implementation, runner, C probe, and every referenced WAT
  input as one set. Keep unsupported result-kind refusal until pinned runtime/API
  evidence supports broader acceptance. No test was run in Astra's review.
- The second donor's seven unique commits and dirty layers still require separate
  path-level reconciliation. No donor is approved for retirement by this review.

### Pinned WAMR context-probe recheck — 2026-10-11

- Re-ran the integration worktree's `scripts/tests/run-rd1413-wamr-context-probe.sh`
  in WSL Ubuntu with `WAMR_ROOT=$HOME/.local/opt/wamr-2.4.5-sdk` (the pinned SDK
  install is resolved through the invoking user's home directory).
  Exit status was 0; all 11 emitted probe checks passed, covering invalid ABI
  kinds/results, signature mismatch before instantiation, closed import allowlist,
  non-function and duplicate imports, matching-but-unlinked imports, per-instance
  context isolation/missing context/mismatch refusal, `externref` result refusal,
  and bounded input acceptance/refusal.
- The chosen SDK's `wasm_export.h` SHA-256 is
  `779ee0870da26f129afe26f58881d286e0bef1537d995acf9cdd27c8a50c3ee0`; its
  `libiwasm.a` SHA-256 is `f21702522f6ce032193ac0529a95f841be044730a0b1c237f17ebb0d61f0104d`,
  matching the runner's exact pins. WSL reports GCC 15.2.0 and `wat2wasm` 1.0.36.
- Tested working-tree inputs at that run: admission header
  `6a6d8b612171812bdab62996dd1042854b379ab63de10faece1039355f0a6405`, implementation
  `fd6a19e36758e7359375c4ebf6c8117667b168827df968d5d1adefd745edd15d`, C probe
  `d933257e4ab2937c75941d8af33de5a7d1294c62cd2a24046b821b1b1bb6db8e`, and runner
  `831a7f31d7491ad0fa129eb451288b6ca6ad8cdee8e57df107956d7012af8711`. The three
  WAT inputs were duplicate-import
  `17f55e1b4e0b162093a612ceb856b0fc8cc247a4be869962fced0795d14456d0`, unlinked-import
  `4d750c65449e6e987ffdf0dc8164d657fa5c8ade023dd8b0c33424ffb43e9aba`, and externref-result
  `060a2aed2a5d0bafca5fda55c101e533641df473792e1981a93f63b0c6462006`.
- This validates the current local WAMR host-admission probe against the pinned
  artifact; it is not a clean-tree/committed-main result, a general WAMR-version
  claim, or proof of production Fungi/FFI/host enforcement. Build recipe/config and
  compiled helper provenance remain separate custody evidence to capture before
  treating this dependency family as integration-ready. No donor was changed and no
  GitHub Actions/CI was run.

### Test-runner WSL parent-environment correction — 2026-10-11

- The first WSL run exposed a deterministic fixture-contamination failure in
  `test-git-environment-isolation.test.mjs`: its synthetic Windows parent inherited
  the outer test preload's temporary `GIT_TEMPLATE_DIR`, so unrelated-control rows
  did not start from the intended clean parent environment. The production helper
  was not changed. The test now launches its synthetic PowerShell parent with
  `cleanGitEnvironment(process.env)` before applying each explicit injected case.
- The changed test's working-file SHA-256 is
  `d614b403a0bcea826688a26b4ecca25c94e75e1885037c86e5504ec6fe9f7c85`.
  Reproduction before the fix failed at the inherited-Windows-routing assertion;
  after the one-line environment isolation correction, the isolated case passed.
- WSL Ubuntu, with the repository's actual test preload: both
  `test-git-environment-isolation.test.mjs` and
  `test-wsl-native-git-boundary.test.mjs` passed **11/11**, including the positive
  control that proves poisoned Windows-parent Git routing redirects native Git,
  then verifies the preload refuses that route and clean discovery still works.
  Native Windows ran the same two files: **6 passed, 5 skipped** because those
  cases are WSL-only; none failed. The exact temporary `.git-routing-decoy-*`
  directory was absent after cleanup.
- This repairs the reproducibility of the WSL test fixture, not production Fungi
  behavior or Git's own WSL interop. The test file is a local unstaged change on
  integration `main`; it has not received an independent review, commit, or merge.
  No GitHub Actions/CI ran.

### Test-runner isolation cross-platform recheck — 2026-10-12

- Revalidated integration `main` at `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6`.
  The Windows parent environment had no `GIT_DIR`, `GIT_WORK_TREE`,
  `GIT_INDEX_FILE`, `GIT_COMMON_DIR`, `GIT_CONFIG_COUNT`, `GIT_CONFIG_GLOBAL`, or
  `WSLENV` set; the WSL invocation explicitly removed Git repository-routing
  variables before starting Node.
- Native Windows: `test-git-environment-isolation.test.mjs` passed **6/6**, with
  three WSL-only cases skipped; `scripts/tests/run-all-tests.test.mjs` passed
  **31/31**.
- WSL Ubuntu: the same environment-isolation file passed **9/9**, including the
  WSL interop controls. `scripts/tests/run-all-tests.test.mjs` passed **20/20**
  applicable cases; its 11 Windows-fallback-specific cases were skipped.
- Exact tested working-file SHA-256: `test-git-environment-isolation.test.mjs`
  `D614B403A0BCEA826688A26B4ECCA25C94E75E1885037C86E5504EC6FE9F7C85`;
  `scripts/run-all-tests.cjs`
  `1CA7C3BE5BE620336B7BD162EE2AC4F59D77D51CE8CD2C08741A8DC96AF6C490`;
  `scripts/tests/run-all-tests.test.mjs`
  `80C692C1D3F2CEB94E033690EB69D50CDD12F555F958685237C0214B0F7A0B89`.
- This verifies the selected local runner/isolation tests at the stated dirty
  checkout, not a full package test run, a clean/committed main result, or any
  Fungi/runtime/host security property. No GitHub Actions/CI ran and no package
  source, Git fixture, or branch was changed by these test invocations.

### VOK secret-arena donor disposition — 2026-10-12

- Compared integration `main` at `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6`
  with `memory-current-main-20261008` (`34b419057de49b6437d0b3b9423f3f2bfb205970`)
  and `memory-consolidation-20261007` (`16fb71a21c41c66de13a0167606feb58a8b63951`).
  The two donors' staged `secret_arena.rs` edits change `Display` output from the
  existing `SECRET_ARENA_*` consumer identifiers to `ERR_SECRET_ARENA_*` codes.
  Integration's separate `tests/secret_arena.rs` asserts the legacy strings and
  separately checks the registered `ERR_SECRET_ARENA_*` metadata. Its focused
  native-Windows test passed 1/1 with
  `cargo test --manifest-path packages-ts/galerina-core-runtime/native/vok-authority/Cargo.toml secret_arena_display_preserves_existing_consumer_identifiers -- --exact`.
  Do not port the donor formatting change without an explicit compatibility decision
  and consumer-wide update; the donor version was not executed in this check.
- Both donors also make shared helpers in `src/tests.rs` private. The current
  `src/resource.rs` test module imports `context`, `return_u64_request`, and
  `table_with_nonces` from `crate::tests`; those sibling-module imports require
  crate-visible helpers. This is a source-based compile-blocker finding; the donor
  test build was not run. The `memory-current-main` copy additionally removes an
  `allow(dead_code)` annotation on `with_bytes_mut`; no separate disposition is made
  for that warning-related change.
- This narrows the arena donor disposition only. It does not adjudicate the arena's
  security semantics, close an RD, or authorize donor retirement, publication, or
  merge. Both donor worktrees and their recovery state remain untouched.

### WAMR probe donor-layer reconciliation — 2026-10-12

- Rechecked the exact WAMR dependency set in the integration checkout and both
  memory donors. The integration files match the source/fixture hashes in
  `docs/reports/rd1413-wamr-pinned-probe-20261011.md`; the pinned WSL probe was
  rerun from this checkout and all 11 checks passed. The deliberate signature
  mismatch emits the expected WAMR diagnostic. This is local candidate evidence,
  not a clean or committed `main` result.
- The 2026-10-11 collision table did not identify which Git layer it compared.
  Do not apply its CR-only summary to today's donor working files. For the four
  tracked header/source/probe/runner paths, `memory-current-main-20261008` has
  index blobs equal to the integration index, but its unstaged working copies
  differ materially. Its header drops the pinned-profile and assertion caveat;
  its C validator accepts `V128` and `EXTERNREF` result contracts and collapses
  unsupported kinds into generic invalid-argument handling; its probe removes
  the `V128`/`EXTERNREF` negative controls and the actual externref-result module
  probe; and its runner no longer builds/runs that module probe. Do not port
  those working copies over the integration candidate.
- `rd1413-wamr-duplicate-import-probe.wat` and
  `rd1413-wamr-unlinked-import-probe.wat` are byte-identical between the
  integration index and `memory-current-main`'s untracked copies; the integration
  already has both staged. The externref-result WAT fixture exists only in the
  integration checkout. The corresponding duplicate/unlinked fixtures are
  absent from `memory-consolidation-20261007`; no separate WAMR improvement from
  that donor is identified by this bounded comparison.
- Disposition: retain the integration candidate as the stronger WAMR probe set;
  no donor port is needed for these paths. Before calling it integration-ready,
  preserve the raw WAMR build log, resolved library path and effective build
  configuration, plus the compiled helper-C identity. Keep the helper restricted
  to the documented hash-pinned Release profile; this probe does not establish
  general WAMR support or production Fungi, FFI, host, or protected-secret
  guarantees. Donor trees remain unchanged and unretired.

### Vault/WIT generator donor-layer reconciliation — 2026-10-12

- Compared the `memory-current-main-20261008` index and working files with the
  integration checkout at `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6`. The donor's
  staged WIT mirrors are byte-identical to integration `main`:
  `packages-ts/galerina-ext-secrets-vault/src/self-hosted/secrets-gateway-wit.fungi`
  (`6556f8a50993c692d4db323ce8d41b137bc83219`) and
  `packages/fungi/products/galerina-ext-secrets-vault/secrets-gateway-wit.fungi`
  (`0fd60ffa2dff8c714c798508771905a8d1c3df8f`). No mirror port is needed.
- The donor's staged `scripts/generate-secrets-gateway-wit.mjs` instead imports
  `dist/types.js`; integration `main` parses the source TypeScript AST and refuses
  absent, duplicate, mutable, non-exported, or interpolated declarations before
  generating either mirror. The donor's shorter test file omits four integration
  controls: resource-method/interface binding, stale compiled/mirror drift,
  mutable-or-duplicate source declaration refusal, and memory-accounting/interface
  binding. Do not replace the integration generator or test with the donor versions.
- The focused integration test
  `node --test packages-ts/galerina-ext-secrets-vault/tests/secrets-gateway-wit.test.mjs`
  passed 14/14 locally. This validates source/generator/mirror contract controls
  only; the WIT remains explicitly non-authorizing and has no wired runtime consumer.
  It does not prove a protected operation or close an RD. Donor contents remain
  untouched and unretired.
- A separate exact comparison confirms the donor's staged and working
  `packages-ts/galerina-ext-secrets-vault/package.json` and `src/types.ts` bytes
  already match integration `main`; no copy is needed for the WIT package script
  or contract oracle. Re-ran the same focused integration test on native Windows:
  14/14 passed. This remains design/generator evidence, not runtime enforcement.

### WASM host-grant donor and integration verification — 2026-10-12

- The donor's staged `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`
  adds a closed non-secret effect ABI and typed host callback bridge. The
  integration checkout has a separate, newer working-tree implementation and
  tests; do not replace those files with the donor version or treat the donor
  source-only change as tested by the integration suite.
- Rebuilt the integration package locally with `npm run build`, then ran
  `node --test tests/wasm-runtime.test.mjs` on Windows: 72/72 passed. The same
  already-built test file ran under Ubuntu WSL: 72/72 passed. Focused cases cover
  allow-listed and import-specific grants, denied imports, start-time effect
  refusal, start-failure quarantine, handler accessor capture, and alias/re-entry
  refusal. No GitHub Actions/CI ran.
- This is TypeScript/bootstrap runtime evidence only. The ABI intentionally
  excludes secret-byte grants; these checks do not establish `.fungi` language
  semantics, native FFI/WAMR enforcement, a production host, a protected
  `/auth/verify` path, or RD-1413/1414/1415 closure. Integration changes remain
  dirty and uncommitted; the donor remains untouched.

### Protected auth-route Astra source adjudication — 2026-10-12

- Reused Astra worker `01a12d62-5f4b-7af3-b41c-e3c5f4d44462`, submission
  `01a12da0-65b9-75e3-b064-9bee52f6cc3e`; review prompt SHA-256
  `DE789ADE1FF9C6F36D76EE6751AF75A26B126F4976DD0FDC09A8824395F607D2`.
  All six prompt-pinned source hashes were independently recomputed at integration
  HEAD `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6` and matched.
- Astra returned `PARTIAL`: the route selector maps POST `/auth/verify` to a flow
  name, but the adapter still returns 503; the Fungi password service remains a
  plaintext-String, `fixtureHash()` synthetic route under
  `/__fixture/auth/verify`. Existing generic executor and greeting/package-gate
  tests do not demonstrate protected provider-open, cleanup, or result release.
- The next implementable slice is a controlled synthetic composition with one
  route-bound coordinator, provider and non-durable sink, with discriminating
  refusal/order tests. No owner needs to reselect the route. Hostile-host isolation,
  Fungi runtime/FFI enforcement, rollback freshness, authenticated end-to-end
  acknowledgement, live deployment, and RD closure remain unproven. Astra ran no
  tests/build/CI and inspected no private RD bodies. The response was returned in
  the worker result; no separate reply ID or reply digest was exposed.

- Live exact-source recheck at the same integration HEAD confirms the blocker:
  `../examples/auth-service/deno-adapter.ts` returns HTTP 503 for POST
  `/auth/verify`; `verifyPasswordService.fungi` exposes only the plaintext,
  hard-coded-hash `/__fixture/auth/verify` route; and the route-dispatcher
  `.fungi` maps the production path only to a flow name. The app-kernel
  `hold-pin.ts` still explicitly refuses TypeScript secret authority and
  protected-memory lifecycle wiring. No auth-route source/test file in this
  recheck was dirty; an unrelated dirty example-host file was inspected only
  for custody and left untouched. The code graph returned a route locator with
  no source path, so exact source—not graph absence—supports this finding.
  Resolution remains a controlled provider/coordinator/non-durable sink
  composition with byte-custody, ordering and refusal tests; it must not be
  presented as an enclave, Fungi runtime, FFI/host, or live-deployment proof.

### WASM-grant export-finalization regression repair — 2026-10-12

- The compiler-side suite initially failed 19/20. The failing control supplied a
  Proxy `returnLayouts` value but expected an export-finalization error; live
  source showed `snapshotReturnLayouts` rejects that Proxy before compilation, so
  the control never exercised its named ordering property.
- Reworked only
  `packages-ts/galerina-core-compiler/tests/wasm-effect-grant-abi.test.mjs` to
  instantiate a genuine module, inject a controlled failure while finalizing its
  real exports, and assert the host memory remains unbound and the failed host is
  consumed. Working-file SHA-256:
  `0DBA98ECB5ADD144021C78CC560B1883C9C68688A890AE81EF5A3DA8414D78F7`.
- Compiler package build passed locally (949 tracked inputs). The corrected suite
  passed 20/20 on native Windows and 20/20 under Ubuntu WSL. No production runtime
  source changed; this closes the false-positive test setup, not broader compiler
  parity, Fungi semantics, FFI/host enforcement, protected-auth execution, or RD
  requirements. The test remains unstaged; no CI ran.

### Test-routing and CLI positive-control donor reconciliation — 2026-10-12

- Compared donor `memory-current-main-20261008` at
  `34b419057de49b6437d0b3b9423f3f2bfb205970` with integration `main` at
  `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6`. The donor proposes removing four
  Git repository/index redirection variables from package-child environments.
  Integration `main` already has a stricter admission boundary: it refuses a
  broader inherited local-Git environment before starting any package child,
  with an adversarial regression test. Its full runner test file passed 31/31;
  the donor runner test file passed 17/28 (11 failures). The donor's new
  child-environment case passed within that run, but does not establish that its
  older runner/test bundle is portable to current `main`. Do not replace the
  integration runner or its tests with the donor versions.
- The donor changes its classical-signing positive control to copy the
  repository's pinned public trust files into a temporary fixture. Integration
  `main` instead creates fixture-scoped signing authority and verifies a signed
  positive control plus five refusal cases; its focused test passed 6/6. The
  donor's focused test passed 1/1, but its changed positive-control setup is
  redundant and weaker than the integration test. Do not port this test change.
- Exact reviewed working-file SHA-256s:
  - Integration `scripts/run-all-tests.cjs`:
    `1CA7C3BE5BE620336B7BD162EE2AC4F59D77D51CE8CD2C08741A8DC96AF6C490`;
    `scripts/tests/run-all-tests.test.mjs`:
    `80C692C1D3F2CEB94E033690EB69D50CDD12F555F958685237C0214B0F7A0B89`;
    `packages-ts/galerina-core-compiler/tests/cli-classical-signing-refusals.test.mjs`:
    `A2BC9DC8E2E2EA78BDD5CB3CD1463DD4A76E3B3879098874625C902D4DCA0475`.
  - Donor `scripts/run-all-tests.cjs`:
    `C11CED3D613EBC3381D4EE351B335F3A3E6EEF334AF7E0B6464A8361AD897EBA`;
    `scripts/tests/run-all-tests.test.mjs`:
    `C65978E8A3F66D6F79B3A63C90A5B470B910CB476BC3951F72A2DFAE9AF44ECB`;
    `packages-ts/galerina-core-compiler/tests/cli-classical-signing-refusals.test.mjs`:
    `518291C24C0CA6BCC29B46C93F10B9405C6EE6C336EED320C21D9272C0FEDCCB`.
- Disposition is limited to these test-routing and CLI-test paths. No donor file
  was copied, staged, committed, or retired. The 11 donor suite failures remain
  unreconciled as a donor-wide test issue; no claim is made that the whole donor
  is redundant or that its other compiler/runtime/vault changes are cleared.

### Pinned WAMR import-admission probe — 2026-10-12

- Re-ran `scripts/tests/run-rd1413-wamr-context-probe.sh` from the integration
  checkout at `main` HEAD `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6` under Ubuntu
  WSL. Exit code was 0. The run exercised signature mismatch, unapproved and
  non-function imports, duplicate and unlinked imports, externref result
  classification, per-instance context isolation, input-size refusal, and the
  exact size-bound fixture.
- The selected SDK under `/home/phill/.local/opt/wamr-2.4.5-sdk` matched all
  three script pins: `wasm_export.h`
  `779ee0870da26f129afe26f58881d286e0bef1537d995acf9cdd27c8a50c3ee0`,
  `lib_export.h`
  `19c182c07246c971eee6c54ddf5bd552fcb5fee91be6970681815c0d19ea1264`, and
  `libiwasm.a`
  `f21702522f6ce032193ac0529a95f841be044730a0b1c237f17ebb0d61f0104d`.
  Toolchain pins were `gcc 15.2.0` and `wat2wasm 1.0.36`.
- The exact dirty source inputs were SHA-256-bound for this run: probe script
  `831A7F31D7491AD0FA129EB451288B6CA6AD8CDEE8E57DF107956D7012AF8711`, C probe
  `D933257E4AB2937C75941D8AF33DE5A7D1294C62CD2A24046B821B1B1BB6DB8E`, and
  `wamr_import_admission.c`
  `FD6A19E36758E7359375C4EBF6C8117667B168827DF968D5D1ADEFD745EDD15D`.
- This validates the integration checkout's current pinned WAMR probe only. It
  does not prove production Fungi/host memory security or RD closure, and it does
  not by itself admit the donor's differing C implementation. No CI ran and no
  donor file was copied.

### WAMR donor file disposition — 2026-10-12

- The same verified SDK was used for a read-only attempt to run the donor's
  `scripts/tests/run-rd1413-wamr-context-probe.sh`. It exited 1 before compilation:
  the script references `scripts/tests/rd1413-wamr-context-probe.wat`, which is
  absent from that donor checkout. Therefore the donor WAMR test result is
  **NOT_RUN**, not a pass or a code failure.
- The integration C source already rejects negative/unavailable import metadata,
  over-counted imports, duplicate `(module,name)` pairs, unlinked native imports,
  and mismatched signatures. The pinned integration probe exercised the duplicate,
  unlinked, mismatch and unsupported-externref-result cases successfully. The
  donor's extra metadata/duplicate/link checks are not missing from this
  integration version.
- The donor working C/header instead broadens accepted result kinds to include
  `WASM_V128` and `WASM_EXTERNREF`; its runner removes the pinned externref-result
  refusal fixture and drops the documented WAMR build-feature/profile caveat.
  Since the pinned integration probe observes an actual externref result being
  refused as a signature mismatch, do not import this broader acceptance or
  remove that negative control without a safe accessor contract and positive/
  negative result-kind tests.
- Preservation identities: donor working-tree SHA-256 values are header
  `22AB719998BFB7219094524820983A44688B43248FE8A17A4B23C18E557ED352`, C source
  `4D41F7FBFF71D2817D20EF36198248D869D4C3910C0E5A050B989312ECA70D19`, and runner
  `0EC3B91CBFD5B495FD79B3EE9E30993BCC4229E82EFA2527A9D9C9FA95770673`. Their
  staged Git blobs are respectively `e142194a12ded1ee81b6dffaf1a06341f1b1b327`,
  `1c09b724837d623b7e0a39b7508f0db3cf66b8ae`, and
  `d733c3a60bb92e090216e46f6778cb4811b86908`; each remains `AM` in the donor.
  No file was copied, unstaged, or retired. This disposition covers these three
  WAMR paths only, not the remaining donor overlay.

### Refreshed memory-current-main overlay inventory — 2026-10-12

- Read-only live status: integration checkout `main` is at
  `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6`, one ahead of its recorded
  `origin/main`; it has 96 unique status paths (11 staged, 83 unstaged, five
  untracked, with three staged/unstaged overlaps). The donor remains at
  `34b419057de49b6437d0b3b9423f3f2bfb205970`, zero ahead and 100 behind
  `origin/main`, with 49 status paths (43 staged, eight unstaged, two untracked,
  with four staged/unstaged overlaps). These counts do not include ignored files.
- A path-presence and raw working-byte comparison of the donor's 49 status paths
  against the integration checkout found seven byte-identical paths, 42 paths
  with different bytes, and no donor path absent from the integration checkout.
  This compares the two current working trees, not either tree to `main`'s commit;
  it does not establish that differing donor content is missing, obsolete, or
  safe to overwrite. Donor index blobs remain a separate custody layer and have
  not been equated with integration's index.
- `git ls-files --others --ignored --exclude-standard` reports 5,017 ignored files
  in the donor and 20,370 in the integration checkout. Neither set was copied,
  removed, or treated as disposable. Their required-payload/recovery purpose is
  not fully classified; keep both checkouts intact until that targeted audit and
  the remaining staged/working path dispositions are complete.
- No source donor changes were transferred or staged by this inventory refresh.
  It is a bounded snapshot, not full donor reconciliation, worktree retirement,
  or a clean-tree claim.

### VOK arena donor WSL counterexample — 2026-10-12

- Correction to the earlier source-only compile-blocker note: the donor's
  `src/tests.rs` helpers are private and the donor does not contain the newer
  integration `src/resource.rs` consumer. The donor crate itself compiled
  successfully, so no standalone donor compile failure was reproduced. The
  visibility mismatch remains a transplant-compatibility risk: integration's
  `resource.rs` tests import those helpers across sibling modules, where the
  current `pub(crate)` visibility is required.
- In Ubuntu WSL 2 (`6.18.40.1-microsoft-standard-WSL2`), the donor command
  `cargo test --offline --locked --manifest-path packages-ts/galerina-core-runtime/native/vok-authority/Cargo.toml secret_arena -- --nocapture`
  compiled and passed 5 tests; 7 target-specific tests were ignored. The build
  used an external target directory at `/tmp/codex-wsl-vok-donor-20261012` and
  did not change tracked files.
- Explicitly ran the ignored synthetic counterexample:
  `cargo test --offline --locked --manifest-path packages-ts/galerina-core-runtime/native/vok-authority/Cargo.toml tests::secret_arena_owned_copy_survives_arena_cleanup -- --exact --ignored --nocapture`.
  It passed 1/1. The test writes marker `0xA5` in the arena, copies it into an
  ordinary `Vec<u8>` inside `with_bytes_mut`, successfully cleans the arena, and
  confirms the copied byte remains. This directly demonstrates that arena
  cleanup cannot erase caller-owned copies permitted by the current Rust API.
  It is a real native implementation/API boundary finding, not TypeScript
  evidence and not proof of Fungi language semantics or host-level containment.
- Donor working source hashes: `src/secret_arena.rs`
  `5FDABF5FDBC1E57292421C26ECFD768E52B717EF209BFD462A518DF22D27480F`,
  `src/tests.rs`
  `1014BE0CE8A6B697AE619B74681D4F2BC740E8E93CF815F0D468277AEBC0AB81`, and
  `tests/secret_arena.rs`
  `808619EE37304C58CD0B8E1E541122D91CDE563D87565D5365D365250949FC5B`.
  The seven ignored cases include other memfd-secret/kernel-dependent behavior;
  they remain unverified on this WSL host. No donor code was changed or copied.

### Donor ignored-file custody refresh — 2026-10-12

- Fresh ignored-path counts are 21,753 in the integration checkout and 5,017 in
  `memory-current-main-20261008`. These are live snapshots, not required-payload
  counts; the older 20,370 integration count is stale. The integration ignored
  count is dominated by `packages-ts` paths (21,475), with 271 under `build`.
- Of the donor's 5,017 ignored paths, 3,939 have the same relative path in the
  integration checkout and 1,078 do not. Same-path presence is not byte identity
  or proof of equivalent purpose. The donor-only set consists of 1,066 files
  under `packages-ts/galerina-core-runtime/native/target`, 11 under package
  `node_modules`, and one governance public-key file. The target files are build
  outputs, not source candidates; do not copy them into Git. No ignored files
  were moved or deleted.
- `governance/signing-key-00059a89c3089e9f.pub.pem` exists only in the donor
  checkout (113 bytes); the integration checkout's one ignored governance file
  is a different relative path. A bounded text search excluding key files and
  generated dependency/build directories found no reference to this key ID.
  Its role and byte-level recovery equivalence remain unverified, so retain the
  donor until the key inventory/owner route classifies it. No key content was
  opened, copied, or exported.
- The donor's staged `.gitattributes` addition for
  `scripts/tests/run-rd1413-wamr-context-probe.sh` is already effective at
  integration `main`: `git check-attr` reports `text` and `eol=lf`, and Git
  reports index and working bytes as LF there. No port is needed for that rule.
- The donor has 49 porcelain status records (43 staged, eight unstaged, two
  untracked, with four staged/unstaged overlaps); local `main` has 101 commits
  not in the donor branch and the donor has zero unique commits. The donor
  overlay, not branch history, remains the integration unit. Every donor dirty
  path currently exists at the same relative path in the integration checkout,
  but this is only a presence check; differing index and working bytes still
  require path-level disposition. No donor data was copied or retired.

### Generic-argument compiler donor disposition — 2026-10-12

- The donor stages `packages-ts/galerina-core-compiler/src/generic-argument-kinds.ts`
  as a new file relative to its older branch base. Integration `main` already has
  this owner file, with `GENERIC_ARITY` and `genericArgumentKind` returning
  `undefined` for invalid or surplus positions. The donor version omits the arity
  table and defaults unknown/surplus positions to `type`; do not port it or infer
  that a staged `A` status means the file is missing from current `main`.
- Current `type-checker.ts` uses the shared arity table to emit
  `FUNGI-TYPE-009`; `value-state-checker.ts` also requires exact known arity
  before classifying generic arguments. After a local compiler build, the
  generic-position tests passed 9/9 (including a new direct check for surplus,
  negative, and fractional positions), and the focused generic-arity tests
  passed 10/10 on native Windows. These bootstrap/compiler checks do not
  establish Fungi runtime or host guarantees.
- Disposition is limited to this shared metadata path and its arity behavior;
  the donor's coupled checker/test changes and remaining compiler paths still
  need their own staged/index/working-layer comparison. No donor bytes were
  copied, staged, committed, or retired by this review. The new focused test
  remains an unstaged integration-checkout change.
- Compared the donor's staged `type-checker.ts` against integration `main`:
  the donor recreates a local generic-arity table instead of using the shared
  owner, removes the typed-content block inference cases, and revises comments
  to describe call-argument/count coverage as partial. Do not port that checker
  over the integration version. Native-Windows generic-argument and typed-
  content AST/validation suites passed 20/20; this validates only those
  compiler/bootstrap cases. No GitHub CI ran.

### Secret-return classifier and helper-context test donor disposition — 2026-10-12

- Integration `main`'s `value-state-checker.ts` classifies declared secret
  return types from parser-preserved `typeStructure`, requires exact known
  generic arity, and traverses only arguments classified as type positions.
  The donor version instead accepts a cooked `typeName` string and keeps its
  own generic-argument metadata. Do not replace the integration classifier
  with the donor implementation: re-lexing compatibility text would discard
  parser identity and payload/type distinctions.
- The integration `tests/value-state/helper-return-context.test.mjs` includes
  positive nested type-component cases and negative controls for payloads,
  invalid/surplus shapes, synthetic legacy nodes, escaped literal contents,
  and missing delimiters. Those parser-identity and malformed-input controls
  are absent from the donor's older test file. The focused integration tests
  `value-state-secret-source-precision.test.mjs` and
  `value-state/helper-return-context.test.mjs` passed 84/84 on native Windows
  on 2026-10-12; no GitHub CI ran.
- This disposition covers only the generic secret-return classifier and this
  helper-context test layer. It does not clear other donor changes to
  `value-state-checker.ts`, prove `.fungi` runtime/FFI/host behavior, or establish
  end-to-end protected-memory guarantees. No donor bytes were copied, staged,
  committed, or retired; continue with the next exact path group.

### Value-state module-alias donor comparison — 2026-10-12

- Rebuilt the integration compiler locally from its current source; the build
  completed with 949 inputs and did not change tracked compiler output. The
  focused `c1-value-state-alias.test.mjs` and `c1-effect-alias.test.mjs` suites
  passed 11/11 on native Windows. No GitHub CI ran.
- Integration `value-state-checker.ts` already tracks module receiver identity
  in lexical `BindingInfo` scopes, resolves aliases at governed sinks, and has
  direct and transitive alias regression tests. The donor's `buildModuleAliasMap`
  wiring is therefore not a missing feature to port into this integration
  source.
- The donor's staged value-state file is an older, materially narrower version:
  it replaces parser-identity/exact-arity secret-return classification with a
  `SecureString` substring test and removes or simplifies several integration
  paths. Do not transplant the donor file wholesale. This finding addresses
  alias-sink coverage and the obvious return-classifier regression only; other
  donor hunks still need independent path/behavior review. No donor bytes were
  copied, staged, committed, or retired.
- A direct staged-blob comparison against integration `main` confirms the
  difference is broader than those two examples: the donor adds a flow-wide
  `buildModuleAliasMap` in place of integration's lexical binding alias state,
  drops the shared `GENERIC_ARITY` exact-position guard, and replaces the
  parser-structure return classifier with a cooked type-name string path. The
  donor does contain secret-lease recognition/refusal logic, but integration
  `main` already has the corresponding reserved-lease collector and
  `FUNGI-AFFINE-005` refusal/tests. Do not port the donor checker wholesale.
  Re-ran the focused integration authority, alias, helper-return and
  secret-source suites on native Windows: 202/202 passed; this is compiler/
  bootstrap evidence only, not Fungi runtime or host proof. No GitHub CI ran.

### Interpreter deadline callback donor disposition — 2026-10-12

- The donor's staged `interpreter.ts` change adds a `checkDeadline` callback to
  `tryWhileFastPath` and invokes it during each fast-loop iteration. Integration
  `main` already has that callback and invocation in its current source; its
  caller also performs an entry check and the tree-walker checks loop progress.
- After a fresh local compiler build, the integration
  `tests/interpreter-while-fastpath.test.mjs` passed 12/12 on native Windows,
  including deadline boundary, per-iteration and refusal-propagation cases.
  This is compiler/interpreter bootstrap evidence, not proof of Fungi runtime
  deadline enforcement in another implementation or host. No GitHub CI ran.
- The donor file differs substantially from integration `main` because it is
  based on older interpreter code; its three-line deadline addition is already
  present, while the donor omits newer integration hardening elsewhere. No
  donor interpreter bytes need to be ported for this deadline behavior, and no
  donor bytes were copied, staged, committed, or retired. This is not a blanket
  disposition of the donor's separate interpreter test changes.
- Compared that separate staged test file with integration `main`: the donor
  removes 124 lines and adds 30, replacing the real-boundary/`executeFlow`
  timeout, audit, loop-exit and refusal cases with a narrower hostile fast-path
  case. Re-ran the integration test on native Windows: 12/12 passed. Keep the
  broader integration test; the donor test is not a missing test port.

### WASM grant ABI test donor comparison — 2026-10-12

- The integration `wasm-effect-grant-abi.test.mjs` has 20 focused cases; the
  donor's staged replacement has 11. The integration suite additionally checks
  invalid observation records, captured factory-host identity, changing host
  accessors, mutable registry isolation, export-finalization failure, and
  memory binding restrictions. Its current working SHA-256 is
  `0DBA98ECB5ADD144021C78CC560B1883C9C68688A890AE81EF5A3DA8414D78F7`.
  The donor's staged blob is `668f64326e96f859db986e9b8f97770137928a07`; its
  working-file SHA-256 is `BFF987126869426E90251E03372B5791302D694B45B790521107AD0BAF5F3597`.
- The donor's unique positive-start control expects a granted `audit.log`
  callback to run during WebAssembly instantiation. That conflicts with the
  integration effect barrier: its tests require start-time effects to be
  refused, while allowing an explicit call after admission. Do not port this
  test expectation without an owner-approved change to that policy.
- Rebuilt integration compiler output was used for fresh native-Windows and
  Ubuntu-WSL runs of the current integration test: 20/20 passed on each host.
  This is a TypeScript/bootstrap ABI test, not `.fungi` semantic, native FFI,
  production-host, or protected-byte evidence. No GitHub CI ran.
- The integration test remains unstaged; the donor replacement remains staged
  only in its donor. No donor bytes were copied, staged, committed, or retired.
  This comparison covers this test path, not every effect-grant implementation
  difference in either checkout.

### Auth route-dispatcher donor disposition — 2026-10-12

- The donor's staged `examples/auth-service/routeDispatcherService.fungi`
  changes its `RouteResult` payload from `Response` to the declared
  `RouteDispatchResponse` record. Integration `main` at
  `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6` already contains that typed record,
  returns it from `dispatchRequest`, and maps `POST /auth/verify` to
  `verifyPassword`; the integration source has no local diff. The donor source
  hunk is therefore already represented and should not be copied over main.
- Re-ran the donor test's exact strict-check command against integration main:
  `node packages-ts/galerina-core/compiler/galerina.js check examples/auth-service/routeDispatcherService.fungi --strict-types --strict-governance`.
  It returned 0 errors, 0 warnings and 0 info. The donor's new
  `rd1413-auth-route-candidate-strict.test.mjs` asserts only this checker result;
  it does not execute route dispatch, call `verifyPassword`, or prove a protected
  provider/sink path. Treat it as a compile smoke-test candidate, not auth-route
  closure or RD evidence.
- The codebase-memory graph route refused this checkout as not indexed; this
  disposition is therefore based on the exact source and local checker result,
  not a fresh graph claim. No donor bytes were copied, staged, committed, or
  retired. The real protected `/auth/verify` operation remains open in TODO and
  ROADMAP.

### Test-routing donor check replay — 2026-10-12

- Re-ran the current integration runner-isolation suite at `main`
  `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6` using its direct root test command
  `node --test scripts/tests/run-all-tests.test.mjs`; native Windows passed
  31/31. Under Ubuntu WSL, the same suite passed 20 tests and skipped 11
  Windows-only cases (31 total, zero failures). In particular, the WSL run
  exercised the non-Windows refusal case and inherited local-Git-environment
  refusal. No GitHub Actions/CI ran.
- The first attempted invocation supplied a package-local import-helper path
  from the repository root; that file does not exist there, so Node failed
  before loading a test. It is not a product or suite failure. The corrected
  direct command above ran the tests.
- The current runner and its test file have no local Git diff after the runs.
  This refresh verifies only the current runner test surface; it does not
  validate or port the donor's older 17/28 runner-test bundle, nor does it
  reconcile the remaining donor paths or ignored payloads.
- The donor's staged `wat-q5n-d7-d8-refusal.test.mjs` renames the T14 zone-hash
  assertion and removes the separate check for the current-region revision.
  It does not resolve the integration test's separate T12 generated-WAT digest
  mismatch (13/14 currently pass), and no authoritative refreshed historical
  pin was found in this pass. Do not port the changed identity assertion or
  replace expected hashes to manufacture a pass; keep the source/pin mismatch
  unresolved and proceed to another donor path group.

### Q5N historical WAT pin replay — 2026-10-12

- Re-ran `node --test tests/wat-q5n-d7-d8-refusal.test.mjs` from the compiler
  package in the integration checkout on native Windows: 13/14 passed. The
  203-flow live lowering check passed; T14's three historical region checks and
  two current-region checks passed. The separate T12 seven-stage generated-WAT
  hash check failed first on `lexer.fungi` (actual
  `198c2c25badbf348f255a4120d5c6877710690f09d99286bb9779df0bbba9fc5`, expected
  `5f7f235b944d36a7e3cbb16a7d88fe895e19fdd2d2728732235d70bc0975fdd7`).
- Source inspection shows `stageSource()` reads the current working `.fungi`
  files, while `STAGE_HASHES` labels expected values as historical Q4n-B pins.
  The current lexer/parser/type-checker/effect-checker working files also have
  unstaged edits. This replay does not establish whether the mismatch is stale
  historical inputs, an intentional current-source delta, or a source defect.
  Do not replace the expected hash to force green; first recover and pin the
  exact historical inputs or document an independently approved migration.
- Bounded disposition: leave this test/source group unresolved and move to the
  next donor path group. No files were edited by the test run; no GitHub CI ran.

### VOK arena copy-survival replay on integration — 2026-10-12

- Re-ran the explicit ignored counterexample on the integration checkout under
  WSL 2 (`6.18.40.1-microsoft-standard-WSL2`), with inherited `GIT_DIR` and
  `GIT_WORK_TREE` unset and `CARGO_TARGET_DIR` outside the checkout. The exact
  Cargo test passed 1/1: it copies marker byte `0xA5` from the arena slice into
  an ordinary `Vec<u8>`, cleans the arena, then confirms the copy survives.
- This behavior is already represented in integration `main`; it is not a
  donor-only fix to port. `with_bytes_mut` is `pub(crate)` and documents a
  trusted synchronous callback, but gives that callback `&mut [u8]`; therefore
  crate-internal callers can still copy or capture bytes. A bounded source search
  found only tests and a documentation example calling it, no production caller
  in this crate. This demonstrates the Rust arena API's no-copy limitation, not
  an exercised production operation or `.fungi` runtime/FFI/host guarantee.
- Do not delete or weaken the counterexample, nor claim that arena cleanup wipes
  caller-owned copies. Resolve any stronger guarantee through an enforceable
  Fungi ownership/effect boundary and composed runtime evidence; keep the Rust
  reference limitation explicit. The replay changed no source, and no CI ran.

### Code-index and diagnostic-parser donor disposition — 2026-10-12

- Compared `memory-current-main-20261008`'s staged `scripts/code-index.mjs`,
  Rust runtime-code parser, diagnostic-code audit, tests and generated
  `build/code-index` / `build/code-registry` outputs with the integration source.
  The donor removes the AST-based `diagnosticObjectOccurrences` path from the
  code index, removes Rust lexical masking, and deletes regression/refusal tests
  for structural ownership and malformed children. Do not transplant this
  implementation or its generated outputs; regenerate derived indexes only
  after the integrated sources are stable and the owning generator verifies.
- A bounded native-Windows run of
  `node --test scripts/tests/code-index-generator.test.mjs scripts/tests/diagnostic-code-audit.test.mjs`
  produced 75 passes and one failure. The new descriptor-lookup regression
  passes. The existing real-WASM-source fixture still yields no indexed
  definition because the dirty integration `wasm-runtime.ts` adds further
  `Object` call shapes, including dynamic `defineProperty` and `assign`, outside
  the classifier's explicitly accepted syntax. This is a conservative
  classification refusal, not evidence to broadly whitelist those forms.
- `node scripts/code-index.mjs --check` returned 1 because generated
  `build/code-index/code-index.json` and `CODE_INDEX.md` drift from current
  sources. The check was read-only; do not refresh those outputs until the
  source set is integrated and the generator's coverage is verified.
- Added a narrow regression and parser case for a two-argument
  `Object.getOwnPropertyDescriptor` call; that new test passes, but it does not
  resolve the real-source failure. Keep this slice open for a source-backed
  grammar decision or a code-shape adjustment with discriminating tests. No
  donor bytes were copied, staged, committed or retired; no CI ran.

### WASM admission-gate donor test disposition — 2026-10-12

- The donor's staged edit replaces the integration test's scoped
  `t.mock.method(WebAssembly, "instantiate", ...)` observation with a manual
  process-wide replacement and `try/finally` restoration. The integration test
  also checks a valid positive twin after the tampered-input refusal; the donor
  hunk omits that positive control. Do not port the donor test change.
- Re-ran `node --test
  packages-ts/galerina-core-compiler/tests/wasm-admission-gate.test.mjs` on
  native Windows: 10/10 passed, including tampered/unsigned/profile-mismatch
  refusal and valid signed-profile controls. This is the current TypeScript /
  WebAssembly admission harness only; it does not establish `.fungi` semantics,
  WAMR/FFI host enforcement, or protected-byte admission. No donor changes were
  copied or staged, and no CI ran.

### AFFINE-005 donor disposition — current integration already contains the gate — 2026-10-12

- The `memory-current-main-20261008` donor's staged AFFINE-005 checker and
  `authority-use-state.test.mjs` changes are already represented in the
  integration checkout's committed `HEAD` `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6`.
  Exact `git grep HEAD` confirms `FUNGI-AFFINE-005` and
  `SECRET_LEASE_RUNTIME_UNWIRED` in the checker and its focused tests.
- Re-ran `node --test packages-ts/galerina-core-compiler/tests/value-state/authority-use-state.test.mjs`
  on native Windows: 107/107 passed. No GitHub CI ran.
- Disposition: do not transplant the donor copy; it is duplicate at this
  integration head. The gate is a fail-closed compiler/bootstrap reservation,
  not a Fungi lease implementation or proof of runtime cleanup, protected-byte
  custody, FFI/host enforcement, or end-to-end RD-1413/1414/1415 acceptance.
- The donor checkout and its staged/ignored contents remain untouched. This
  records path disposition only; no source was staged, committed, or retired.

### WSL probe line-ending donor disposition — already present at integration main — 2026-10-12

- The donor's `.gitattributes` addition explicitly pins
  `scripts/tests/run-rd1413-wamr-context-probe.sh` to LF. Integration `main`
  already has that exact attribute: `git check-attr` reports `text` set and
  `eol=lf`, and `git ls-files --eol` reports index LF / working LF for the
  probe script (despite `core.autocrlf=true`).
- Disposition: no donor change is needed. The probe was separately run from
  integration under Ubuntu WSL with exit 0 as recorded above. This is test
  script portability only, not runtime security or RD closure. Donor files
  remain untouched.

### Runner environment and compiler-barrel donor replay — 2026-10-12

- Re-ran the integration `main` runner suite on native Windows:
  `node --test scripts/tests/run-all-tests.test.mjs` passed 31/31. This is a
  local runner test; no GitHub CI ran. The recorded donor change to
  `scripts/run-all-tests.cjs` and its test removes four Git repository/index
  redirection variables from child environments. Integration `main` already
  refuses inherited local-Git redirection before any package child starts, so
  this donor behavior is not a reason to replace the stricter admission policy.
  The donor's older runner test bundle had previously passed 17/28; that result
  was not rerun in this pass.
- Compared the donor's staged
  `packages-ts/galerina-core-compiler/src/index.ts` against integration `main`.
  The donor version removes the RD-0855 replanning-contract exports and moves
  `FUNGI_AFFINE_005` from the value-state checker re-export into a local barrel
  declaration. Integration `main` already exposes the affine diagnostic and
  retains the RD-0855 exports; do not replace its barrel with the donor version.
  The donor's reordered WASM grant exports add no identified missing integration
  behavior. This is a disposition of the reviewed barrel hunks only, not the
  donor's other compiler paths.
- Neither checkout was modified by these checks. No donor bytes were copied,
  staged, committed, or retired. The integration checkout remains dirty, and
  remaining donor overlays and ignored payloads still require bounded
  path-level review before custody can be consolidated.

### WSL/native Git environment-isolation test disposition — 2026-10-12

- The changed test line in
  `packages-ts/galerina-core-compiler/tests/test-git-environment-isolation.test.mjs`
  gives the outer PowerShell child an environment passed through
  `cleanGitEnvironment(process.env)`. This prevents inherited local Git config
  and repository-routing variables from contaminating the Windows-to-WSL
  positive/negative control.
- In Ubuntu WSL, ran the full file with
  `node --test packages-ts/galerina-core-compiler/tests/test-git-environment-isolation.test.mjs`:
  9/9 passed, including the poisoned-parent positive control and native Git
  verification. On native Windows the same command passed 6 tests and skipped
  the 3 WSL-only cases, with no failures. These are local checks; no GitHub
  Actions/CI ran.
- The WSL control's temporary routing repository is created with `mkdtemp`
  under this checkout and removed by the test's `finally` cleanup; no matching
  `galerina-windows-parent-git-config-*` directory remained afterward. The
  test and adjacent runner source were not edited by these commands; the
  checkout's pre-existing dirty state remains preserved.
- This verifies test-process Git isolation for these exercised environments;
  it does not verify every test runner, establish full-worktree custody, or
  prove compiler/runtime/host security. No CI was triggered.

### Bounded live donor survey — 2026-10-12

- The reused integration checkout is `main` at
  `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6`, one commit ahead of
  `origin/main` at inspection. It has 99 status entries: 11 staged, 86
  unstaged, three staged/unstaged overlaps and five untracked. Preserve the
  complete mixed state; no donor was merged or copied during this survey.
- Live registration is 18 worktrees and 33 local branch refs. These supersede
  older inventory counts in this file; this is a registration count, not a
  claim that each slot is safe to retire.
- `memory-consolidation-20261007` is at
  `16fb71a21c41c66de13a0167606feb58a8b63951`, 82 commits behind and seven
  ahead of integration `main`, with 48 changed tracked paths and no untracked
  paths. A byte comparison of its 48 working files against integration found
  seven identical and 41 different. Its history spans compiler, memory,
  WAMR/VOK, vault, test-routing and generated-index changes; do not merge the
  branch or copy the overlay wholesale. Continue with a focused path manifest.
- `memory-current-main-20261008` is at
  `34b419057de49b6437d0b3b9423f3f2bfb205970`, an ancestor 101 commits behind
  integration `main` with no unique commits. Its overlay remains separate:
  43 staged paths, seven unstaged paths (including overlapping index changes)
  and two untracked paths. Existing later sections in this ledger contain
  path-level dispositions; continue only on any not-yet-reviewed paths.
- `rd-0873-native-fungi-bootstrap-implementation` is detached at
  `e1c2496f3f36d154a445ba9c302401ccaaf74bae`, 343 commits behind integration,
  and has 50 status entries (36 staged, five unstaged, five overlaps, 14
  untracked). Its live Git worktree lock is
  `CLOSED_FOR_NEW_WORK / RETAINED_DIRTY 2026-10-07`; preserve it. A byte
  comparison found 28 of its 50 dirty file contents identical to the
  memory-consolidation donor and 22 different. The lock's archive/reference
  is not proof that those 22 differences are integrated; reconcile them by
  path without unlocking, pruning or deleting this checkout.
- `grok/wat-integration-candidate-20261003` is at
  `3ac9f8b150e074247092bdcf164f500e4b4d995d`, 560 commits behind and 16 ahead
  of integration, with three unstaged paths. Its commit summary mixes WAT,
  numeric/F32 and generated-index work. Keep it out of wholesale integration;
  review a narrowly identified capability only when its exact tests and
  current-main equivalent are mapped.
- These bounded checks move past candidates that cannot safely be reconciled
  as whole worktrees. All donor checkouts and ignored payloads remain intact;
  no branch, worktree, staged entry, untracked file or ignored file was
  deleted, reset, copied or retired. GitHub Actions/CI was not run.

### Vault provider wrong-view cleanup probe — 2026-10-12

- On the live dirty integration candidate, `ownProviderBuffer` rejects a
  non-Buffer provider result before attempting cleanup. A direct Node probe
  passed a provider-owned `Uint8Array` containing the bytes `secret` to
  `SecretsRotationManager.load`; the call refused, but the same view still
  contained `[115, 101, 99, 114, 101, 116]` afterward. This is a reproduced
  cleanup gap for a byte-view result that violates the declared `Promise<Buffer>`
  provider contract; it is not evidence about normal conforming providers or
  Fungi/runtime enforcement.
- The package suite rebuilt and passed 84/84 under Ubuntu WSL. Native Windows
  `npm test` stopped at the build because the global `tsc` shim targets a
  missing TypeScript installation; no dependency was installed. The existing
  `dist` output was not used to claim a Windows source-build pass.
- A narrow design question is pending owner response: wipe an actual returned
  `Uint8Array` view through captured typed-array intrinsics before refusing,
  retain failed cleanup as an obligation and fail closed; leave non-byte
  malformed values rejected. No vault source or test was changed for this
  proposed fix. Next: wait for that decision, add a regression first if
  approved, rerun WSL and repair native TypeScript resolution only through an
  already-owned toolchain; then obtain independent review before integration.

### Local-main test-runner commit review — 2026-10-12

- Astra worker `01a12dba-335e-7191-b2cc-f2a17c55076d` reviewed exact local-main
  commit `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6` against parent
  `44a26cb22a362638a6cf106d05bd9d09e57f6821` (follow-up submission
  `01a12e05-9cdf-7d53-8429-3b1f415196d5`). It found the 11-path change
  internally coherent and no material source defect, but returned **PARTIAL**
  for the hostile-environment proof and publication eligibility. It explicitly
  limits the boundary to recognized Git config/routing variables; other
  environment and configuration sources are not comprehensively covered.
- Fresh local execution of the four relevant runner, isolation, cleanup and
  native-Git boundary test files returned 61 tests on each platform: Windows
  56 passed / 5 WSL-only skipped; Ubuntu WSL 50 passed / 11 Windows-only
  skipped; zero failures on both. The WSL test contains an explicit raw
  poisoned-parent positive control that routes Git to a decoy without preload,
  then requires the actual preload to refuse and clean-parent cases to succeed.
- These are candidate-working-tree runs, not exact-blob runs: the isolation
  test contains one additional unstaged `cleanGitEnvironment(process.env)`
  argument beyond the reviewed commit; the other ten commit paths are clean.
  That one-line delta received its own prior Astra review. The same Astra
  worker has the fresh results and is adjudicating whether the negative control
  meets its remaining controlled-red criterion (follow-up submission
  `01a12e09-ebde-76e1-bd75-b663f2f5e9f7`). Until that returns, do not publish
  the local-main commit. Current Actions setting was read as disabled; this
  does not change the review or imply CI has never run historically.

- An isolated clone at the exact commit was then built with the checkout's
  existing TypeScript toolchain and exercised on Windows and Ubuntu WSL. The
  linked-checkout-only isolation case correctly refused the plain clone because
  it has a `.git` directory rather than a linked-worktree `.git` pointer; this
  is a fixture mismatch, not evidence for or against that case. Four separate
  RD-0858 process-root controls failed on both systems: the tests expected two
  detector/descriptor reads but observed three. Do not treat those controls as
  passing or attribute the mismatch to the test-runner commit without a linked
  checkout reproduction. The other 31 of 36 WSL cases passed; the selected
  Windows run likewise had five failures, consisting of that fixture mismatch
  and the four process-root assertions. Exact-commit publication evidence
  remains incomplete; the broader consolidation should proceed to the next
  donor while this narrow verification gap remains explicitly open.

### Scalar-return metadata donor disposition — 2026-10-12

- The divergent `memory-consolidation-20261007` branch has seven commits not
  ancestral to integration `main` and is 82 commits behind it. Its
  `d01952803` commit changes the WAT emitter's scalar-return wrapper and adds a
  small Q1 regression file. A direct comparison against current integration
  shows the donor emitter also removes the return-capacity/watermark guards,
  recursive non-null refusal, host-import collision protection, and wide
  scalar return lanes present in the current implementation; the donor test
  replaces, rather than extends, the larger integration Q1 suite. Do not merge
  or copy those files wholesale.
- Rebuilt the current dirty integration compiler with its existing local
  TypeScript toolchain and ran `tests/q1-secret-return-value.test.mjs` on
  native Windows: 99/99 passed. Ubuntu WSL separately rebuilt that same
  working source and ran the same test file: 99/99 passed. This is dirty TypeScript/WASM
  bootstrap evidence only, not proof of Fungi runtime, FFI/host, physical
  enclave or RD-1413/1414/1415 security. One test expressly leaves host-exception
  wipe behavior not verifiable in this harness.
- The current integration source and Q1 test files have local modifications,
  so these runs bind to the working candidate, not committed `main` alone.
  This disposition covers only the `d01952803` scalar-return slice; the
  remaining donor history and separate staged/unstaged content still require
  path-level review. No donor bytes were copied, staged, committed or retired.

### WAT integration candidate triage and nested invariant refusal — 2026-10-12

- The retained `grok/wat-integration-candidate-20261003` checkout is at
  `3ac9f8b150e074247092bdcf164f500e4b4d995d`, with 16 commits not in the
  integration baseline and 560 commits of divergence. Its history spans I2/I3
  invariants, WASM effect grants, numeric/F32 work and generated indexes; its
  dirty tree has three paths and 128,532 ignored files. Preserve it unchanged;
  do not merge the branch or treat its ignored footprint as disposable.
- Its focused `interpreter-i2-i3.test.mjs` suite passes 64/64 after a local
  build. This is candidate-specific compiler/bootstrap evidence. The current
  integration branch does not contain that test file or the candidate's I3
  diagnostic model, so the 560-commit-divergent feature is not a safe wholesale
  transplant; defer it and continue with the next checkout.
- The candidate review exposed a separately reproducible integration defect:
  a nested flow returning a failed precondition (`FUNGI-INV-001`) could be
  discarded by its caller, which then returned success. On the dirty
  integration compiler, the new regression failed first (`int` success instead
  of refusal). Adding `FUNGI-INV-001` to the existing fail-closed propagation
  classifier makes the focused invariant suite pass 7/7 after rebuild. This
  narrow source/test delta is unreviewed and not yet eligible for publication;
  it does not establish Fungi runtime/FFI/host guarantees.
- The same integration-source build and 7-test file also pass in Ubuntu WSL
  (7/7, zero failures). Both platform results are tied to this dirty checkout.
- The current integration test fixture reports a precondition failure as
  `FUNGI-INV-001`, unlike the candidate's body-local `FUNGI-INV-005/006` cases.
  Do not infer that the narrow `001` fix closes the candidate's broader I3
  feature. No candidate commit, dirty file, ignored file or worktree was
  copied, staged, committed, pushed, merged or deleted. GitHub Actions/CI was
  not run.

### PR #169 native-floor refusal candidate — 2026-10-12

- The clean `grok/core-runtime-bounded-native-floor-refusal` checkout is at
  `246494403ac4d48c0e44a73aae72aeacde738c49`, three commits ahead and 170
  behind local integration `main`. PR #169 is OPEN, DRAFT, merge state DIRTY,
  with no check results reported. Preserve the branch and checkout; do not
  merge or retire them as part of this triage.
- The two floor-transfer commits add a fail-closed policy helper and focused
  tests. A fresh WSL package build and test run passed 10/10. Native Windows
  stopped before compilation because this checkout's `tsc` shim resolves to a
  missing global TypeScript install; no dependencies were changed.
- Source/call-site inspection shows `admitBoundedNativeFloorTransfer` is
  referenced only by its new tests, always refuses, and does not call or gate
  a native/WAMR transfer path; the commit makes no Rust/Cargo change. The
  package TODO explicitly keeps L45-L48 open. Therefore the passing tests
  verify a proposed TypeScript refusal contract, not native enforcement or
  closure of those runtime floors. Do not port it as a repair without a
  concrete production caller and reviewed contract.
- The third commit registers a terminal-scope product asset and overlaps
  dirty integration `package.json`/test paths; reconcile those exact files
  separately. Nothing from PR #169 was copied, staged, committed, pushed,
  merged or deleted. No GitHub Actions/CI was run.

### Parked WAT candidate overlap check — 2026-10-12

- The clean `grok/wat-parked-memory-20261002` checkout is at
  `1ea29bd2b53d47f8923f5e7d39d6413e5bdd4971`, eight commits not in local
  integration `main` and 560 commits divergent; its 35-file history spans
  D4 pattern lowering, D8 effect grants, ZipPair, Float16/Float32 and a
  read-only usage-search tool. Preserve this checkout while the remaining paths
  are accounted for; no branch or worktree was retired.
- Exact blob comparison against integration `main` shows the `narrow-float.ts`
  source and E5 test already identical. The D4 and ZipPair tests are also
  identical, while their implementation sources have since diverged; D8's
  runtime and test blobs differ from current `main`. These are signs of
  subsequent integration/evolution, not proof that every commit or all 35
  paths are redundant.
- On the current dirty integration compiler build, focused E5, D4, ZipPair and
  D8 effect-grant tests pass 70/70 (native Windows; no CI). This validates the
  current working candidate only. The parked checkout's changes should not be
  cherry-picked wholesale; remaining path-level review and ignored-file
  accounting are still required before safely retiring its branch/worktree.

### Detached primary overlay recheck — 2026-10-12

- The repository-root checkout is still detached at
  `9a26c71e60e491766ef351d0efe0405b0739c1b6`; it is 201 commits behind and 10
  ahead of local `main`. Those 10 branch-only commits change roadmap,
  component-health and generated roadmap files; they contain no memory
  implementation changes. The separately dirty overlay remains the memory
  integration candidate and must not be confused with that branch history.
- Live porcelain contains 92 distinct paths: 46 staged, 43 unstaged, 10
  untracked, with seven paths staged and modified again in the working tree.
  Preserve each layer separately. `GROK-BRANCHES.md` is untracked and marked
  local-only; exclude it from publication.
- A bounded byte-hash comparison of the following **working-copy bytes** found
  13 of 14 selected compiler, `.fungi`, WASM, native VOK, security, route-test,
  Myco and memory-doc files differ between the detached primary and integration
  checkout. These hashes do not identify staged index blobs and establish
  neither redundancy nor which version is correct. Reconcile the paths against
  staged blobs, exact base commits, tests and later-main changes before copying.

  | Repository-relative path | Detached primary SHA-256 | Integration checkout SHA-256 |
  |---|---|---|
  | `packages-ts/galerina-core-compiler/src/interpreter.ts` | `FB80A7103753232779EBCCDA6BCB4F6F925131DC3655CA8009DEF1ED0E80DBE7` | `DB9F34D037D53AC3FEAA56E8022B06F9E1BB2938773018CEAA41744E84583B2D` |
  | `packages-ts/galerina-core-compiler/src/type-checker.ts` | `0F19BE88FDF149790117476834EA19367AA4301849A9F88A1ABF3FA9971D5FBF` | `CB51F67D70BD759E681D69EF12B08EE63EA547FC827D19142AEAB2D3F8B565B1` |
  | `packages-ts/galerina-core-compiler/src/self-hosted/slide-v2a-runtime.fungi` | `EED02B16091637779DCDA167C93F8F7C55973A75752D146A1924C886B25962CC` | `BE11DD6FF0B356B1399CCEE41E98373BAA6DA871D6F6B86E61EEF5626513AB53` |
  | `packages-ts/galerina-core-compiler/src/self-hosted/slide-v2c-runtime.fungi` | `B3CF9A3015317620F85D1DDB10587067379460B83B6A5C5C3C2F0888E6F43249` | `98629FAC33894882831A8356533A6E1078126B222D7D4BC8D92E3DBAFC746A84` |
  | `packages-ts/galerina-core-compiler/src/self-hosted/slide-v2d-runtime.fungi` | `F73BDC93D54A34278E8B0198E95408D6A7D080A97962E2B0B59854A00AC6A80D` | `7CFD4FA6853B18E2A6BD45E3522B2BC51D62183C0DD6EE88F04B2304237949FF` |
  | `packages-ts/galerina-core-compiler/src/wat-emitter.ts` | `A8CEA968C83356843F73AC96DDDEBC26A91CDD61310DA1E7DFCA3BE30B28D375` | `AD9D5C264D65735D2FF2EF2F47D165F35EE65E390E0AE18E501EAE1BBDFBF674` |
  | `packages-ts/galerina-core-compiler/tests/q1-secret-return-value.test.mjs` | `A3F5337F7250C65273888DC98FAF883ED764A1E73515A39414F6B042D5E807D9` | `80A308A8779C5D61AC01CA1B35C60C1E69088A02F8E61FA2DD1F639E218C0AD7` |
  | `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | `125C7B087D620BB5C2DE4EECB48278EA5B02EC4C18A83EFF5DA9FD499DEF8411` | `2CD064A1A30FFEB64B7D3042E00EF010CD35ADE43F632EB791874A5FF5A1D08E` |
  | `packages-ts/galerina-core-runtime/native/vok-authority/src/secret_arena.rs` | `A5DDB68279244BCE13FA346902E6148D6F4BC7D73C8B940D6AEDA4A34F5B2213` | `AE9F1EB85086FC40F8BBEA0B2A287855A59377CE1148D9E7D57DDA3DB13E5BB5` |
  | `packages-ts/galerina-core-security/src/crypto-provider.ts` | `3AFD1AB40B30BE9F2F426D9F5AB132DAFCA7039BFFB180D01ABB3E196EB7114F` | `3AFD1AB40B30BE9F2F426D9F5AB132DAFCA7039BFFB180D01ABB3E196EB7114F` |
  | `packages-ts/galerina-framework-example-app/tests/route-capability-grants.test.mjs` | `5BA8D871C5F81EEEDE5A4E5DE8E399ED972476CACF8B55D3F4A7C03382ABEC6A` | `1F6F23B774F0B24ED90EE064911134AE54FC6F38587126B1F0A25AE9B88C761C` |
  | `packages-ts/galerina-tools-myco/src/ingest/walk.ts` | `4CB1FD74509B5C3F49D841BB4F246F737BB6D96D3FC9F84013046619046843A5` | `63094FCD74EC50EB860256848E7019D60032D29087CC0C01655DC2EAFA6EB365` |
  | `packages-ts/galerina-tools-myco/src/query/links.ts` | `D17193FC4D722E29A574DD2BD938764FC85CF2C26D66BE058FC26E30A9D70246` | `F14713A87B90DF773F71F775BF86FB9A214DD5C3A2FAAF30B867AACF53AB79E2` |
  | `packages-ts/galerina-core/docs/memory-safety.md` | `9BADB471D4A38C865CABDE30BB6CDA25AB1CAC292297472940B2CE1651A9DC6C` | `F9F7080352B8594CCC7CE9CAFEC806DB4822BAFDE8575A390088F2589CF1E78D` |
- The older preservation-slot row above reported 87 status records and is now
  stale. Keep it as historical context; this dated live snapshot supersedes
  its count. No primary bytes were copied, staged, committed, pushed, merged
  or deleted during this recheck. Continue to the next bounded candidate while
  retaining this checkout intact for later path-level reconciliation.

### Memory-consolidation Int64 slice and ignored custody — 2026-10-12

- `memory-consolidation-20261007` remains at
  `16fb71a21c41c66de13a0167606feb58a8b63951`, 82 commits behind and seven
  ahead of local integration `main`; relative to its own remote tracking ref,
  Git reports 67 ahead and six behind. Its 48 tracked dirty paths remain
  separate: two have both staged and unstaged edits, with no untracked paths.
- The ignored-file scan found 10,585 entries: 10,575 under `packages-ts`,
  seven under `build`, and one each under `.env.galerina-signing`, `.myco`,
  and `governance`. The 460-byte `.env.galerina-signing` exists in both
  checkouts, but its contents were not opened or compared. The donor-only
  ignored `governance/signing-key-35e22204696ab84f.pub.pem` is 113 bytes; its
  role and recovery requirements remain unverified. Preserve both locations
  and the donor; do not copy or export either key-related file. `.myco` exists
  in both, but presence alone does not establish index identity or freshness.
- The donor's staged-plus-unstaged Int64 test file has 49 `it` declaration
  sites; the current integration test has 67, and every donor title line is
  present in integration. The integration interpreter resolves numeric aliases
  against the owning AST declaration, while the donor uses a shared alias map.
  This is a narrower, older donor slice, not a reason to replace current
  integration source. Exact working-file SHA-256 values are donor/integration:
  interpreter `754A07D44B7BC3DBFFF2E09E6BB35898B5B59A22EDDBB8B8F4C40541E69FD663`
  / `DB9F34D037D53AC3FEAA56E8022B06F9E1BB2938773018CEAA41744E84583B2D`;
  test `DF656E11590478FA93FAB11B9F3DB45888D0BA25F20F49F10C28193430F1DD61`
  / `2891131C90F537AF67192C463490DC2517D95FCC29696B6029B57D9FECC3893D`.
- The donor's WSL TypeScript compile completed, but its subsequent build-evidence
  step refused because the Windows worktree `.git` pointer is not a valid Linux
  path. Its focused test passed 61/61 on WSL and native Windows using that
  compiled output. The integration checkout then completed `npm run build` in
  WSL (949 compiler inputs) and its expanded focused suite passed 142/142 in
  WSL and native Windows on that WSL-built output. This supports the tested
  TypeScript/bootstrap behavior only; it is not Fungi runtime, FFI/host, or
  end-to-end memory-security proof. No GitHub Actions/CI ran.
- Disposition: no Int64 test/source bytes need a second wholesale copy for the
  covered flow-call behavior. The other 46 dirty paths and remaining ignored
  payload still need their own bounded review. Nothing in the donor was staged,
  copied, committed, pushed, merged, or deleted; continue to the next unresolved
  path while keeping the checkout and ignored material intact.

### Memory-consolidation G5 arena-fill test disposition — 2026-10-12

- Compared the donor and integration versions of
  `packages-ts/galerina-core-compiler/tests/wat-arena-memory-fill-g5.test.mjs`.
  The donor hash is `5EC6F48407365DCB2E2B6F598F4C2C2CDCD101F59CEFE20C201F93129EF8381D`;
  integration is `13039454AB590715BC48FBB7E6CC59F86801DD4066A299EBC4A148E217A7AF47`.
- Both focused suites pass 6/6 on native Windows. The integration version
  includes a runtime check that a public execution does not wipe the preceding
  secret allocation and an injected-wipe negative control proving the oracle
  detects that regression. The donor removes both runtime checks and replaces
  them with WAT-string assertions about whether the wipe export is emitted.
  Its added mixed-privacy sibling assertion is already covered by its passing
  focused test, but does not replace the stronger public-path evidence.
- Disposition: keep the current integration test; do not port the donor rewrite.
  This is a source/test comparison for the G5 WAT/bootstrap boundary, not proof
  of Fungi runtime, FFI/host enforcement, or the coupled memory RDs. The donor
  remains untouched and available while its other dirty paths are reviewed.

### memory-current-main VOK arena error-format slice — 2026-10-12

- Moved to `memory-current-main-20261008` after the bounded review of the prior
  donor. This checkout is at `34b419057de49b6437d0b3b9423f3f2bfb205970`, has
  49 dirty status records, and its branch is 101 commits behind local `main`
  with no branch-only commits. No files were moved or staged by this review.
- Compared `native/vok-authority/src/secret_arena.rs` and its unit/integration
  tests. Donor/integration working hashes are: source
  `5FDABF5FDBC1E57292421C26ECFD768E52B717EF209BFD462A518DF22D27480F` /
  `AE9F1EB85086FC40F8BBEA0B2A287855A59377CE1148D9E7D57DDA3DB13E5BB5`;
  unit tests `1014BE0CE8A6B697AE619B74681D4F2BC740E8E93CF815F0D468277AEBC0AB81` /
  `90DBACA8440FB9654DB3CDFBFB7B0031D22C7F4F70DEF6AE149D9609D51025AB`;
  integration tests `808619EE37304C58CD0B8E1E541122D91CDE563D87565D5365D365250949FC5B` /
  `59906E96C86E18BC5E71BBA6913C6A67AE6F2BA7386E18C22E03AA860E1FF703`.
- The donor changes `Display` to use the metadata `code`; current integration
  uses metadata `name` and preserves the separately registered `ERR_*` code.
  Donor's focused arena tests passed 5 total; integration passed 6 total,
  including `secret_arena_display_preserves_existing_consumer_identifiers`.
  The focused native-Windows command was
  `cargo test --offline --locked --manifest-path packages-ts/galerina-core-runtime/native/vok-authority/Cargo.toml secret_arena`.
  This review therefore keeps the integration behavior/test rather than
  transplanting the donor formatting change without its compatibility test.
  It establishes only this local Rust API/display contract, not locked-memory
  guarantees or end-to-end secret custody. Donor checkout remains intact.

### Parked WAT branch D8 effect-grant slice — 2026-10-12

- `grok/wat-parked-memory-20261002` is clean at
  `1ea29bd2b53d47f8923f5e7d39d6413e5bdd4971`, eight commits ahead and 560
  behind local `main`. Its 35-path/3,181-addition branch delta includes D4
  pattern lowering, ZipPair, D8 effect grants, Float-width work and tooling.
  `gh pr list --state all --head grok/wat-parked-memory-20261002` returned no
  PR. Preserve the checkout; seven other commit units were not assessed here.
- The D8 commit `e580f81da` is not eligible for a second copy: the current
  integration working tree already has a more discriminating effect-grant
  implementation and 20-test boundary in `wasm-runtime.ts` plus
  `wasm-effect-grant-abi.test.mjs` (both modified, not yet committed). Their
  current working hashes are respectively
  `2CD064A1A30FFEB64B7D3042E00EF010CD35ADE43F632EB791874A5FF5A1D08E` and
  `0DBA98ECB5ADD144021C78CC560B1883C9C68688A890AE81EF5A3DA8414D78F7`.
  The candidate versions hash to
  `C3639BE437C73CF7597EFDC862A8E08755A864CEB7A41B7D73D47831628CD41E` and
  `B40E8B5DD29179F1C0D6FAD191829116EC68C32FC73C423D50850F061414D466`.
- At the current integration working tree, the focused ABI suite passed 20/20
  after a WSL build (949 compiler inputs), then passed 20/20 under native
  Windows against the same WSL-built `dist`. The current tests additionally
  cover signature/arity/result mismatch before host callbacks, host identity
  substitution and mutation, module start effects, unknown imports, and
  secret-grant refusal. This is TypeScript/WASM runtime evidence only; it does
  not prove `.fungi` source semantics, native VOK/FFI/host enforcement, or
  end-to-end memory security. No GitHub Actions/CI ran.
- Disposition: do not transplant the older D8 unit; keep the already-present
  integration overlay pending its full custody/review and commit audit. The
  other branch work remains preserved and requires separate bounded review.

### WAT integration-candidate checkout triage — 2026-10-12

- `grok/wat-integration-candidate-20261003` is at
  `3ac9f8b150e074247092bdcf164f500e4b4d995d`, 16 commits ahead and 560 behind
  local `main`. Its merge-base delta spans 56 paths and 23,288 additions / 12,871
  deletions, including generated code-index/registry snapshots. No PR is
  associated with this branch. Its checkout has three unstaged tracked edits:
  `docs/generated/HALLMARK-NON-AUTHORITIES.md`,
  `packages-ts/galerina-core-compiler/src/interpreter.ts`, and
  `packages-ts/galerina-core-compiler/tests/interpreter-i2-i3.test.mjs`; no
  staged or untracked paths were reported. Keep those edits and the branch intact.
- Its history merges the parked WAT branch and also contains I2/I3 interpreter,
  diagnostic-constant and index-regeneration work. The D8 effect-grant slice is
  superseded by the more discriminating, tested integration overlay recorded
  above. This checkout is too broad for wholesale integration; only the D8
  overlap is adjudicated here. Its other commit/path units and any ignored
  payload remain unreviewed, not discarded or certified redundant.

### Core-runtime bounded native-floor refusal candidate — 2026-10-12

- Candidate branch `grok/core-runtime-bounded-native-floor-refusal` is clean at
  `246494403ac4d48c0e44a73aae72aeacde738c49`, three commits ahead and 170
  behind local `main` (`5317ce06b2ba225fea6bbd4a93cf3e928a8578e6`). Its open
  PR #169 is draft and GitHub reports merge conflicts. No rebase, cherry-pick,
  branch rewrite, PR mutation or CI action was performed.
- Its five-path delta is limited to runtime `TODO.md`, `package.json`,
  `src/runtime-contracts.ts`, `tests/bounded-native-floor-transfer.test.mjs`,
  and `tests/terminal-scope-fungi-conversion.test.mjs`. The new TS surface
  explicitly refuses transfer and labels the L47/L48 checklists proposed; it
  does not bind to or execute the native provider. WSL build plus the focused
  test passed 10/10; native Windows Node tests passed 10/10 against that WSL
  build. Native Windows `npm run build` could not start because its global `tsc`
  shim targets a missing TypeScript installation. These results prove only
  this exercised TS/bootstrap surface, not Fungi or native-floor guarantees.
- Existing Astra worker was given a read-only two-vector adjudication of this
  exact candidate (`246494403ac4d48c0e44a73aae72aeacde738c49`) against local
  main, submission `01a12e2a-fb5b-7123-a2e1-c3409eab0b60`. Await its per-path
  disposition before deciding whether any exact change is worth carrying
  selectively. Preserve the clean donor and the dirty integration checkout.

### PR #169 Astra result and source adjudication — 2026-10-12

- The existing Astra reviewer completed the read-only review for candidate
  `246494403ac4d48c0e44a73aae72aeacde738c49`; submission
  `01a12e2a-fb5b-7123-a2e1-c3409eab0b60`. Exact prompt/reply records are
  retained in the task workspace with SHA-256
  `ECC309A06369F2C2561DAC191FA861D05851695567C045F1905E1B66C0681DD6` and
  `5D8981F24C56074DC1E9B4F4A5DA0C58D9C019F4BBB70E1864D593BDDFA295FE`.
- Source adjudication confirms a candidate proxy trap can mutate caller-visible
  state even though the function returns refusal: a `getPrototypeOf` trap
  incremented a sentinel, producing `{allowed:false,hit:1}`. The candidate's
  tests only require throwing/revoked traps to be caught. The function has no
  provider argument or Rust call, so it is a TS-side refusal surface, not
  native admission. Its source check pins 16-byte length and GVEO magic only;
  Rust `validate_object` additionally checks version, return-u64 profile,
  target, flags and value.
- The current integration tree already has `admitVeoReturnU64Profile` and
  structural VEO policy tests, and the native-floor contracts suite passed
  6/6 on WSL and 6/6 on native Windows after WSL build. This remains
  TypeScript policy evidence; it does not prove native execution or host
  enforcement. The candidate's always-refuse API/test/proposed checklist do
  not add stronger proof and should not be transplanted as a second API.
- Exact working-copy comparison confirms the candidate `package.json` is
  byte-identical to the dirty integration version. The terminal-scope test
  already has the same `productTree` ownership check in integration, factored
  through a constant; its focused suite passed 2/2 in WSL and native Windows.
  Both are already present in the dirty integration overlay, so no copy is
  needed. Preserve and review those exact dirty contents as part of the later
  path-specific custody/commit audit.
- Per-path disposition: candidate TODO note is proposal/status context only;
  candidate runtime-contracts API is superseded by existing policy and remains
  non-executing; its dedicated refusal test is candidate-only evidence with
  the proxy-side-effect gap; package manifest and terminal-scope test are
  already represented in the integration overlay. PR #169 stays open/draft/
  conflicting and unchanged. No code, branch or PR was modified; no CI ran.

### Memory-consolidation invariant-fold slice — 2026-10-12

- Rechecked the dirty `memory-consolidation-20261007` checkout rather than
  relying on its earlier ancestry snapshot: HEAD remains
  `16fb71a21c41c66de13a0167606feb58a8b63951`, with 48 tracked dirty paths;
  its local branch now reports 67 ahead/6 behind its tracking ref. The remote
  tracking ref is `691232158d886697ca658463e4ce7edeccc9517e`. This differs
  from the older integration-ledger ancestry counts, so those counts are
  historical, not current Git authority.
- Compared the donor's `invariant-discharge.ts` and matching test against the
  integration checkout. The donor replaces `parseFloat` with `BigInt`, but
  accepts arbitrarily large integer values and has no token-length or runtime
  lane bound. Its added test explicitly folds distinct values above JavaScript
  exact-integer range to DENY. The integration implementation instead accepts
  only complete integer spellings within its documented signed-i32 common
  lane and leaves wider/fraction/exponent forms UNKNOWN, retaining runtime
  enforcement. Do not transplant the donor's wider fold: absent proof of
  identical downstream semantics, it could discharge a gate for a value whose
  runtime representation differs.
- The integration invariant-discharge suite rebuilt and passed 78/78 under
  WSL. Its added cases cover malformed and wide spellings, parser-to-governance
  identity, real WAT gate/positive twins, runtime parity, and typed Int64
  comparisons. This is compiler/bootstrap parity evidence only, not a Fungi
  runtime/FFI/host guarantee. No source was copied or changed by this review;
  no commit, push, merge, branch edit or GitHub CI occurred. Continue to the
  next worktree/slice rather than spending unbounded time reconciling the
  donor's remaining dirty overlay.

### Memory-current-main WAMR import-gate slice — 2026-10-12

- Reopened `memory-current-main-20261008` at
  `34b419057de49b6437d0b3b9423f3f2bfb205970`: 49 dirty status records and
  101 commits behind the integration checkout's local `main`, with no
  branch-only commits. Staged and unstaged versions coexist on the C gate,
  probe and shell runner; leave the donor intact.
- Compared its WAMR C/header/probe/runner with the integration working copies.
  Integration adds explicit unsupported-value-kind results, narrowly states
  the supported WAMR product-mini build/profile, and tests an EXTERNREF result
  under the exact pinned release configuration. The donor's versions lack
  those safeguards. The donor's duplicate-import and unlinked-import WAT
  fixtures are byte-identical to already staged integration fixtures, so no
  copy is needed.
- Verified the recorded SDK in WSL by all three SHA-256 pins, then ran the
  integration probe script: invalid/unsupported value kinds, signature
  mismatch, unapproved/non-function imports, duplicate and unlinked imports,
  per-instance context isolation, EXTERNREF result refusal, and both sides of
  the 1 MiB input-size boundary passed. This is pinned WAMR host-ABI probe
  evidence; it does not prove the production gateway invokes this gate or
  establish RD end-to-end secret custody. Donor changes were not transplanted;
  no commit, push, merge, branch edit or GitHub CI occurred.

### Grok WAT integration I2/I3 candidate — 2026-10-12

- Rechecked `grok/wat-integration-candidate-20261003` at
  `3ac9f8b150e074247092bdcf164f500e4b4d995d`: 16 commits ahead and 560
  behind integration `main`; three dirty paths, no staged changes. The
  candidate's focused interpreter test is a broad I2 timeout-quarantine and
  I3 body-local-invariant feature suite. The integration compiler does not
  contain the candidate's `FUNGI-FAULT-008`/`FUNGI-INV-005` implementation or
  that test file; its related interpreter changes are not a drop-in equivalent.
- After WSL TypeScript compilation succeeded, the build-evidence generator
  refused because this checkout's `.git` pointer contains a Windows absolute
  gitdir path that WSL resolves as an invalid nested `C:/...` path. Running the
  focused suite in WSL then passed 63/64; its only failure was the suite's
  self-hosted-source-vs-HEAD check for the same invalid Git pointer. The full
  focused suite passed 64/64 in native Windows against the WSL-built output.
  Do not inject this checkout's Git authority into WSL or rewrite the pointer
  merely to force that check green. No Git fixture or source was changed to
  work around it.
- Disposition: retain this candidate as an unintegrated compiler feature,
  rather than transplanting a broad interpreter rewrite into the memory
  integration. It is not evidence of Fungi runtime/FFI/host enforcement, and
  is outside the named memory/WASM/vault/auth repair slices pending separate
  integration review. Preserve its dirty source, test and generated-doc state;
  do not merge or retire this worktree on the basis of the focused pass alone.
  No commit, push, merge, branch edit or GitHub CI occurred.

### Parked WAT E5/D4 exact-current refresh — 2026-10-12

- Rechecked the clean `grok/wat-parked-memory-20261002` candidate at
  `1ea29bd2b53d47f8923f5e7d39d6413e5bdd4971`. Git blob IDs for E5's
  `narrow-float.ts`, `wat-e5-narrow-float.test.mjs`, and `numeric-lowering.ts`
  match the integration checkout's current `HEAD` and working Git blobs; no
  E5 source/test transfer is needed.
- The D4 test and refusal source blobs also match. The candidate's pattern
  emitter has two null guards absent from integration, but the integrated
  `galerina-tri-regex` type now makes `charRanges` non-null and its table test
  explicitly asserts the sentinel representation. The emitter difference is
  therefore tied to an older upstream type contract; do not transplant the
  guards without a current repro.
- The candidate's ZipPair feature and test are present in the integration
  source. A fresh WSL build followed by its focused test passed 11/11,
  covering interpreter/WASM/truth-table parity, repeated calls, per-field
  payload types, and fail-closed unsupported payloads. Existing focused E5,
  D4 and D8 results are recorded above. No candidate code was copied.
- The branch's separate `symbol-usage-search` utility is absent from the
  integration checkout and its four native-Windows tests pass 4/4. It is a
  read-only discovery tool, not one of the requested memory/WASM/vault/auth
  repairs; leave it candidate-only pending a separate usefulness/ownership
  comparison with Myco/Hypha rather than expanding this integration slice.

### Test-routing Astra adjudication and current WSL rerun — 2026-10-12

- Reused Astra worker `01a12dba-335e-7191-b2cc-f2a17c55076d`, submission
  `01a12e38-750c-76b3-8833-1bdafc83d715`; the retained prompt is
  `outputs/test-routing-astra-prompt-20261012.md`, SHA-256
  `7A7F9BAA58C9398FACCB477D52BAB0EB0CEE73B1EBD7813055E4FB180EA7CAC3`.
  Astra returned PASS for both review questions and recommended retaining the
  one-line test-only environment isolation change. No separate reply digest
  was exposed; the complete result is retained in the worker response.
- Reopened the exact test and helper at integration `main` HEAD
  `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6`. The helper copies the supplied
  environment and removes its recognized Git-control keys; the synthetic
  PowerShell child then clears `WSLENV` before each poisoned-control setup.
  The positive controls still demonstrate the injected routing/config effect,
  and the sanitized checks still require that effect to disappear. The helper
  deliberately does not remove every conceivable Git-related variable; this
  supports only the enumerated test boundary, not universal environment
  sanitization or production Fungi/runtime guarantees.
- Fresh local rerun: WSL passed all 9/9 cases, including native-Git WSL
  interop; native Windows passed 6 with 3 WSL-only skips. No GitHub Actions/CI
  ran. The source edit remains a test-fixture correction only; it does not
  change production runtime or Fungi enforcement.

### Protected auth-route source and raw-ingress retest — 2026-10-12

- Rechecked the route at integration `main` HEAD
  `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6`. The exact source hashes are:
  `../examples/auth-service/deno-adapter.ts`
  `718F4DDAD8579819CE50140A0E724B74983FC6D551C3256AE02BE1BD75457D4C`,
  `examples/auth-service/verifyPasswordService.fungi`
  `274C05453441DC44E19F1120919F30AC9429B3CAFF6705E96076C2B009F12B67`,
  `examples/auth-service/routeDispatcherService.fungi`
  `EF9CDC544165112ABA6A27C990927A00F26DB57ABB683118535C62C0A167B28E`,
  `packages-ts/galerina-core-compiler/src/route-dispatcher.ts`
  `9EE1B46CF687320A7661AB32F2C1B728BA230B47B6D3EA440EF4B25198AFA096`,
  and `tests/runtime-route-request-size.test.mjs`
  `20989EBD958AA9F5EB973A832672059589195A222FB95178DC57A7987F316F33`.
- The Deno adapter still returns 503 for POST `/auth/verify`; the `.fungi`
  password service labels its plaintext-string plus hard-coded `fixtureHash()`
  path as `/__fixture/auth/verify`. The route-dispatcher `.fungi` selects a
  flow name, not a credential provider or result-release operation. The
  compiler transport preserves the selected route's ingress as raw bytes and
  rejects ambiguous overlapping POST bindings, but that is not provider,
  cleanup, recipient-acknowledgement or protected-memory evidence.
- The maintained code graph returned `REFUSED` because the expected `Galerina`
  project was not indexed in this tool context. Exact-source fallback was used;
  no graph absence claim is made. WSL rerun of
  `runtime-route-request-size.test.mjs` passed 13/13. This verifies request-size,
  byte-preservation and route-binding behavior only. No auth source was changed,
  no live data was used, and no GitHub Actions/CI ran. Next bounded step is to
  review the existing typed secret-gateway contract and current dirty vault
  provider tests before designing any controlled synthetic composition; do not
  replace the stub with an invented execution or real-secret path.

### Secret-gateway contract versus executable implementation — 2026-10-12

- The existing `SECRETS_GATEWAY_WIT` in
  `packages-ts/galerina-ext-secrets-vault/src/types.ts` specifies opaque
  authenticated-request, grant, lease, verification-result, cleanup-receipt
  and release-receipt resources, plus grant/acquire/verify/close/release
  operations. Its `.fungi` mirror is a literal contract oracle; the focused
  `secrets-gateway-wit.test.mjs` passed 14/14 under WSL, checking declarations,
  opaque resource shapes, binding reuse and mirror alignment. This establishes
  contract-text consistency, not an executable Fungi/WIT binding or host
  enforcement.
- A bounded exact-name search across `packages-ts` and `examples` found those
  verification operations in the contract and its tests, not an implementation
  wired into the auth route. The existing TypeScript vault facade instead
  exposes `useSecret`/`useActive` callback access for the rotation manager; its
  existing regression explicitly demonstrates that a callback-created copy
  can survive wiping of the scoped buffer. Treat that as bootstrap/API-gap
  evidence, not as the maximum guarantees Fungi can provide.
- Do not connect this callback API to `/auth/verify`. Next implementation
  candidate is a controlled synthetic coordinator/provider/non-durable sink
  whose observable event sequence is tested against the existing WIT contract,
  with no live secrets and no claim of Fungi, enclave, FFI, or production
  enforcement. Only proceed after its state transitions and refusal ordering
  are source-mapped to the contract; otherwise move to the next bounded donor
  review and leave the production route refused.

### Vault dirty-overlay exact-head verification — 2026-10-12

- Rechecked the existing integration checkout at `main`, HEAD
  `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6`. Its three vault paths remain
  dirty and unstaged within a much larger shared dirty tree; no staged path was
  changed by this review. Do not treat the overlay as an isolated donor or
  commit it as a unit without path-level custody review.
- `npm test --prefix packages-ts/galerina-ext-secrets-vault` built the current
  TypeScript source and passed 84/84 tests in WSL. After that build, native
  Windows `node --test tests/*.test.mjs` also passed 84/84 against the generated
  package output. The first Windows package-script attempt failed before build
  because its global `tsc` shim points to a missing install; this is an
  environment/tooling failure, not a source-test failure. No CI ran.
- The suite covers re-entry, captured identity, disposal and late provider
  results, retryable wipe failures, and owned provider-buffer transfer. It also
  intentionally proves that a TypeScript callback can retain a copied secret
  after the manager wipes its scoped buffer. These are bootstrap/API properties;
  they do not bound Fungi memory semantics or prove Fungi runtime, FFI, host, or
  end-to-end enforcement.
- No code edit or staging occurred. Keep the callback API disconnected from
  `/auth/verify`. Continue with the next bounded memory-integration item: map a
  controlled synthetic provider/coordinator/sink sequence to the existing
  `SECRETS_GATEWAY_WIT` contract, or move on if its implementation boundary
  cannot be established from source. Preserve the protected route as refused
  until composed evidence exists.

### Memory-consolidation donor bounded reassessment — 2026-10-12

- Reopened `codex/memory-consolidation-20261007` at
  `16fb71a21c41c66de13a0167606feb58a8b63951`. Relative to the integration
  checkout's local `main` at `5317ce06b2ba225fea6bbd4a93cf3e928a8578e6`,
  the donor has 7 unique commits while main has 82; the three-dot diff spans
  56 paths and includes large generated code-index/registry snapshots. The donor
  also has a broad dirty overlay, including two staged-plus-unstaged paths, so
  neither a branch merge nor a wholesale copy is a safe next action.
- Its dated report's two blockers are not current as stated. In the integration
  checkout, the classical signed-revocation test passed its trusted positive
  control and all five refusal controls. T14's historical and current Codex-zone
  identity assertions also passed. The same focused run was 19/20 because a
  different Q5N T12 seven-stage hash assertion failed for `lexer.fungi`
  (actual `198c2c25badbf348f255a4120d5c6877710690f09d99286bb9779df0bbba9fc5`,
  expected `5f7f235b944d36a7e3cbb16a7d88fe895e19fdd2d2728732235d70bc0975fdd7`).
  The integration checkout's lexer is dirty; this result does not establish a
  committed-main failure or justify changing the frozen pin. Build plus focused
  tests ran in WSL with `GIT_DIR` and `GIT_WORK_TREE` unset; no GitHub CI ran.
- Disposition: preserve the donor unchanged and move to the next bounded
  worktree. This bounded rerun supersedes the report's old CLI/T14 failure
  state, but does not adjudicate the remaining 7 commits or dirty layers.
  Those still require path-level comparison against current staged, working and
  ignored layers before selective integration. No donor bytes were copied; no
  staging, commit, push, merge, branch edit or deletion occurred.

### Detached-primary live custody refresh — 2026-10-12

- Rechecked the repository-root checkout: detached at
  `9a26c71e60e491766ef351d0efe0405b0739c1b6`, 201 commits behind and 10 ahead
  of the integration checkout's local `main`. All 10 branch-only commits are
  dated roadmap/component-health documentation or their generated roadmap
  snapshots; they do not themselves carry the dirty memory implementation.
- The live dirty overlay comprises 88 unique paths: 46 staged, 39 unstaged,
  10 untracked, with 7 staged/unstaged overlaps. It includes memory-relevant
  compiler/runtime/VOK files and TODOs, broad unrelated package/spec changes,
  and seven untracked RD/review documents plus an untracked memory-safety test
  catalogue. Keep each index, working and untracked layer distinct; no files
  were copied or staged.
- `GROK-BRANCHES.md` is untracked and explicitly local-only. Its contents are a
  dated PR/branch register referencing scratch data and include visible text
  encoding damage; it is useful as historical navigation, not a current merge
  manifest or authority. The repository's integration `docs/WORKTREES.md` has
  the stronger custody trail, but its older 92-path primary snapshot is now
  superseded by this 88-path live count.
- Disposition: preserve the detached checkout and move to path-level review in
  the existing integration tree. No branch/worktree switch, reset, cleanup,
  commit, push, merge or GitHub CI occurred.

### Myco link-check fix verification in integration checkout — 2026-10-12

- The integration checkout already contains commit
  `c15ce8b5c53dccd336271e36b0338d01baf35e4d` (`fix(myco): retain
  anchored-ignore scope and inspect code-label links`). Both
  `packages-ts/galerina-tools-myco/src/query/links.ts` and its focused test are
  clean relative to HEAD here; the primary checkout's corresponding working
  copy is not needed as a separate donor for these files.
- Ran the exact `links.test.ts` owner test in the integration checkout on
  native Windows and Ubuntu WSL. Each run passed 34/34. The regression checks
  that inline code inside a Markdown link label does not hide the real link
  target, alongside refusal and private-reference controls. This verifies this
  Myco classifier behavior only; it is not a repository-wide broken-link scan.
- No files were copied or staged, and no commit, push, merge, branch/worktree
  edit, cleanup or GitHub CI occurred.

### Locked RD-0873 bootstrap checkout bounded refresh — 2026-10-12

- Reopened the registered detached checkout at
  `e1c2496f3f36d154a445ba9c302401ccaaf74bae`; it remains 343 commits behind
  the integration checkout's local `main` and contains no unique branch ref.
  The live Git registration still carries the lock
  `CLOSED_FOR_NEW_WORK / RETAINED_DIRTY`; its original staged index and working
  files are explicitly preserved for path-level reconciliation.
- Current porcelain has 49 entries: 36 staged, five unstaged, 13 untracked,
  and five staged/unstaged overlaps. This supersedes the ledger's earlier
  50-entry snapshot; it does not mean any of the files disappeared or are safe
  to discard. The prior comparison still identifies 22 dirty-file byte
  differences from the memory-consolidation donor; this bounded pass did not
  reconcile those paths.
- Disposition: do not unlock, edit, merge, copy from, prune or delete this
  checkout. The lock, divergence and unreconciled layers prevent a safe whole-
  tree action. Preserve it and move to the next registered worktree; revisit
  only if an exact path is required and can be reconciled against its preserved
  index/working bytes and current source.

### RD-1246 scalar-chain spike bounded disposition refresh — 2026-10-12

- Rechecked `codex/rd1246-scalar-chain-spike` at
  `e8f1b68235daeb6a0ec08f3639bd7e1b69af2de7`: it is 563 commits behind the
  integration checkout's local `main` and has no unique branch commits.
  `WORKTREE-CLOSURE.md` identifies its purpose as the RD-0858 scalar source-pair
  GIR adapter, explicitly outside the current RD-1413–1415 memory-security
  slice, with its source, tests and generated-document change preserved.
- Live state still has three modified tracked paths
  (`docs/generated/HALLMARK-NON-AUTHORITIES.md` and the RD-0858 adapter/source
  test) plus the untracked closure note. Its local note records focused 4/4 and
  typecheck evidence; this refresh did not rerun those checks or independently
  audit the adapter.
- Disposition: retain unchanged and do not integrate into the memory slice.
  The checkout is already marked `CLOSED_FOR_WORK / RETAINED / NOT_IN_MAIN`;
  preserve its source and branch for a separately scoped RD-0858 review. Move
  to the next worktree rather than extending this bounded pass. No files were
  copied or staged, and no branch/worktree mutation or GitHub CI occurred.

### Detached package worktree bounded classification — 2026-10-12

- The clean checkout `moving/galerina-pkg-cc` is detached at
  `2e9e86110932499e846b54543b999a93bae1131c`, one commit ahead and 201 behind
  the integration checkout's local `main`. Its only unique commit adds a
  non-executing quantum-target refusal in `galerina-core-compute`, with its own
  focused tests; the commit is also present at
  `origin/grok/core-compute-quantum-refusal`.
- The exact commit purpose and touched paths are therefore identifiable, and
  the checkout has no dirty or untracked files. This capability is outside the
  current memory/auth/WASM integration slice; no source or test was rerun in
  this pass.
- Disposition: preserve as a clean, separately reviewable package candidate;
  do not transplant or merge it as memory work. No files were copied or staged,
  and no commit, push, merge, branch/worktree edit or GitHub CI occurred.

### Fresh detached package checkout verification — 2026-10-12

- Rechecked `moving/galerina-pkg-cc` at
  `2e9e86110932499e846b54543b999a93bae1131c`: it remains clean and detached;
  the only commit not in integration `main` is the same remote-tracked
  `grok/core-compute-quantum-refusal` commit. The refreshed ancestry count is
  one candidate-only commit and 202 main-only commits (the earlier ledger count
  was 201 main-only before `main` advanced).
- Confirmed the commit is a separate quantum-target refusal slice across eight
  core-compute source/test files, not memory/auth/WASM integration. The checkout
  reports 197 ignored paths; they were not enumerated or altered. Keep this clean
  candidate available for its own disposition and move to the next memory
  candidate; do not transplant it into the memory integration.

### memory-current-main auth-route candidate slice — 2026-10-12

- The donor's staged `routeDispatcherService.fungi` changes its response from
  an inferred object literal to an explicit `RouteDispatchResponse` record and
  adds `rd1413-auth-route-candidate-strict.test.mjs`. In the integration
  checkout, the existing route source passes the exact strict-types and
  strict-governance compiler check: zero errors, warnings or info. Running the
  same check in `memory-current-main-20261008` also passes, and its added test
  passes 1/1. The named-record rewrite therefore has no demonstrated admission
  gap to repair at this source state; the test is not a distinguishing control
  because the integration source already passes the same check.
- Exact-source boundary remains open: current `routeDispatcherService.fungi`
  maps `/auth/verify` to `verifyPassword`, while
  `verifyPasswordService.fungi` labels its password handler as the separate
  synthetic `/__fixture/auth/verify` route and says the selected production
  route remains unimplemented. This compiler check does not wire protected
  ingress, provider, cleanup, or authenticated output.
- Disposition: do not transplant this donor source rewrite or describe the
  protected operation as implemented. Preserve the donor's staged layers; the
  route slice has no proven functional delta, and the end-to-end route gap is a
  separate integration task. No source was copied or staged, and no commit,
  push, merge, or GitHub CI occurred.

### Astra vault delivery/recovery contract adjudication — 2026-10-12

- Reused Astra worker `01a12dba-335e-7191-b2cc-f2a17c55076d`, prompt submission
  `01a12e45-9199-7dc1-910d-7bc59e0012fe` (prompt SHA-256
  `5D89A33D1F8E2320D1C4DDF5EFA0346B304E7533E9B27F22F4D33A3D5F17CDD5`). Its
  completed response is **PARTIAL**; exact response SHA-256 is
  `9EF79002AC57FBE7AD380C806AC4CC32A9063738E7B1885605D7BC95291D9F46`.
  This is the existing review, not a duplicate dispatch.
- Verified against current owner text: committed `HEAD:docs/TODO.md` lines
  74–75 require an authenticated acknowledgement bound to the operation and
  status-only recovery that neither rediscloses nor retries with a consumed
  lease. The current WIT oracle `packages-ts/galerina-ext-secrets-vault/src/types.ts`
  (SHA-256
  `36C4E697A9A001FDF711DD13BF67784C898C9590159A9B141EE9B871F3A3FBF2`)
  exposes only `release-receipt.state()` with `released | delivery-unknown` and
  `release-verification-result(request, grant, proof, cleanup)`. It has no
  authenticated acknowledgement or operation-status lookup. The `.fungi`
  mirror states no WIT build/runtime consumer is wired (SHA-256
  `5A5AF8DEF5655E77D83A0BDC1C8625B19999D9B87CA42A4CA1BC3CBB23D1BA8C`); a
  bounded search of other vault TypeScript source found no such operation.
- The focused WIT test (SHA-256
  `8188D0A722DE1E86C099AF007DB4702555C1B6E48D96B8058EC07E7F4192264E`)
  asserts opaque resource/signature shape and request/grant reuse, not recipient
  acknowledgement, duplicate/replay behavior, lost-response recovery, or
  wrong-recipient refusal. Astra's counterexample is material: if release
  commits but its response/receipt is lost, the caller cannot perform `state()`;
  retry may replay consumed proof/cleanup handles. Host-private deduplication
  could address this, but no executable consumer was found in this bounded
  source scope, so behavior remains **NOT_VERIFIABLE**.
- Owner constraints already fix the semantic outcome (one disclosure, ack bound
  to operation, status-only recovery, no automatic redisclosure/retry). The
  concrete operation-identity/authentication binding and durable journal/status
  authority, retention and replay/idempotency contract remain unspecified. The
  30-day period is explicitly a guess and must not be hard-coded as production
  policy. Do not invent an ABI. Next safe step is to settle those fields, then
  add a controlled synthetic lost-response/replay state-machine test before any
  runtime integration. No source was changed, staged, committed, pushed or
  merged; no GitHub CI ran.

### Scoped native-Git test-routing commit and consolidation checkpoint — 2026-10-12

- Committed exactly one reviewed test-only path on local `main`: commit
  `add90739684b1be18938aa3f593e8cff48ad7003`, subject
  `test(compiler): isolate native Git child environment`, path
  `packages-ts/galerina-core-compiler/tests/test-git-environment-isolation.test.mjs`.
  The test prevents a synthetic child Git process from inheriting the parent
  checkout's repository-routing environment. Existing staged work was not
  included: 11 staged paths remain, alongside other dirty/untracked work.
- Verification at this candidate: focused Windows run 6 passed, 3 WSL-only
  skipped; WSL run 9/9 passed, including native-Git interop and repository
  routing isolation. `staged-growth-gate.mjs` returned `CLEAN` before commit
  with 46 staged paths; the explicit `--only` commit isolated this one path.
  No GitHub Actions/CI ran.
- Publication remains HOLD: `origin/main` was `44a26cb22a362638a6cf106d05bd9d09e57f6821`
  at verification and this checkout contains workflow definitions under
  `.github/workflows/`. Repository Actions disablement/trigger behavior has not
  been verified, so do not push until that risk is resolved. Do not infer the
  remote state from a prior checkpoint.
- Consolidation procedure is bounded per worktree: inspect its purpose/custody
  record, branch and HEAD relation, staged/unstaged/untracked/ignored state,
  locks, and distinct paths. If purpose or safe integration still cannot be
  established after that pass, record `UNRESOLVED—PRESERVED` with the exact
  checks and reason, then continue to the next candidate. Never let one unclear
  checkout stall the queue or discard its work. Revisit unresolved entries only
  when new evidence or a required dependency appears.

### Bounded review of `memory-current-main-20261008` donor — 2026-10-12

- Fresh Git read: donor HEAD `34b419057de49b6437d0b3b9423f3f2bfb205970` is an
  ancestor of this integration `main` at `add90739684b1be18938aa3f593e8cff48ad7003`;
  it has zero unique commits and is 102 commits behind. Its 49 live status entries
  comprise 43 staged, 8 unstaged, 2 untracked and 4 staged/unstaged overlaps.
  The donor has many compiler, WAMR, vault, and generated-index paths, so its whole
  overlay is not a safe merge unit.
- Bounded WAMR result: the donor's staged admission header and C source blobs equal
  integration `main` HEAD (`e142194a12ded1ee81b6dffaf1a06341f1b1b327` and
  `1c09b724837d623b7e0a39b7508f0db3cf66b8ae`). Its unstaged working versions differ.
  The donor working C admits `WASM_V128` and `WASM_EXTERNREF` result kinds; the
  integration working C result allowlist admits numeric kinds and `WASM_FUNCREF`,
  but refuses those two additional result kinds. Both are working-tree
  implementations; the donor's staged blob is the integration `main` HEAD version.
  The WAMR API/version capability
  needed to justify broadening this contract was not found in this bounded source
  scope. Disposition: `UNRESOLVED—PRESERVED`; do not port this WAMR working overlay.
- Continue to the next recorded candidate rather than spending the consolidation
  pass on this entire highly divergent dirty checkout. The donor remains intact;
  its other staged/working compiler, vault, Rust, and generated-index changes still
  require path-level reconciliation before any subset is eligible.

### Bounded CLI-control disposition in `memory-consolidation-20261007` — 2026-10-12

- The donor's latest unique commit `16fb71a21c41c66de13a0167606feb58a8b63951`
  changes one fixture from a non-production-shaped revocation key label to a
  16-character lowercase-hex value. The current integration `main` test already
  uses the CLI-generated `GALERINA_SIGNING_KEY_ID` and asserts `^[0-9a-f]{16}$`,
  so that one-commit test correction is superseded by the stronger current test.
- Fresh focused run on integration `main`: `cli-classical-signing-refusals.test.mjs`
  passed 6/6 on native Windows and 6/6 under Ubuntu WSL, with `GIT_DIR` and
  `GIT_WORK_TREE` removed from the test environments. No GitHub Actions/CI ran;
  the test path remained unchanged.
- The donor remains at `16fb71a21c41c66de13a0167606feb58a8b63951`, 7 commits ahead
  and 83 behind current integration `main`; its 48-entry dirty overlay remains
  separate (2 staged, 48 unstaged including the 2 overlaps, no untracked entries).
  Its `f5b474bd7` commit alone spans 47 paths, including very large generated
  indexes, so no donor-wide integration is justified. The remaining unique
  commits/dirty paths are not cleared by the CLI test result; preserve them and
  continue the next bounded candidate.

### Bounded WAT-candidate checkout pass — 2026-10-12

- Fresh Git read of `grok/wat-integration-candidate-20261003`: HEAD
  `3ac9f8b150e074247092bdcf164f500e4b4d995d` matches its remote-tracking branch;
  relative to integration `main` it has 16 unique commits and is 561 commits
  behind. The merge-base diff spans 56 paths, including large generated index
  and registry changes. Its live tree has three unstaged paths—generated
  non-authorities report, compiler interpreter source, and I2/I3 interpreter
  tests—with no staged or untracked paths.
- Existing exact-candidate notes identify I2/I3 interpreter semantics, WASM
  grants, Float/F32 and generated snapshots in its history; the candidate has a
  prior focused I2/I3 test result, but a later WSL evidence generator refused
  because its Windows `.git` pointer is not usable as a Linux path. Neither fact
  makes this divergent branch a safe whole-branch integration. No source or
  generated file was copied, and ignored contents were not enumerated or touched.
- Disposition: preserve this candidate and its three dirty paths; defer its
  capability deltas to a separately pinned path/test review, then continue to
  the next checkout rather than reconciling its 56-path branch delta wholesale.

### Primary detached checkout bounded memory-path check — 2026-10-12

- Fresh primary status: detached at `9a26c71e60e491766ef351d0efe0405b0739c1b6`,
  with 10 commits not in integration `main` and 202 main-only commits. Its 92
  status entries comprise 46 staged, 43 unstaged, 10 untracked and 7 overlaps.
  The mixed overlay includes retained review/RD reports and compiler/runtime
  changes; it is not a safe whole-checkout merge unit.
- Bounded memory-path check: the primary's staged addition to
  `packages-ts/galerina-core-runtime/native/vok-authority/src/tests.rs` is the
  ignored Linux `secret_arena_owned_copy_survives_arena_cleanup` counterexample.
  The same test body is already present in integration `main`'s committed file,
  so this staged addition needs no transplant. This check does not reconcile
  the primary's remaining staged, working, untracked or ignored material.
- Preserve the detached primary and move to the next candidate; do not switch,
  reset, broad-merge or clean it as a shortcut.

### Parked WAT worktree containment and preservation check — 2026-10-12

- `grok/wat-parked-memory-20261002` is clean at
  `1ea29bd2b53d47f8923f5e7d39d6413e5bdd4971`, with eight commits not in local
  `main` and 561 main-only commits. A fresh ancestry check confirms its tip is
  contained in `grok/wat-integration-candidate-20261003`; this makes it a
  duplicate source candidate, not evidence that the work is integrated in `main`.
- The checkout has 4,041 ignored entries. Their content/requiredness was not
  inspected in this pass. Preserve the local branch and checkout; do not retire
  them until the ignored payload is dispositioned and the WAT candidate's
  relevant work is reconciled.

### Fresh PR #169 native-floor candidate reconciliation — 2026-10-12

- Rechecked clean `grok/core-runtime-bounded-native-floor-refusal` at
  `246494403ac4d48c0e44a73aae72aeacde738c49` against integration `main` at
  `add90739684b1be18938aa3f593e8cff48ad7003`: candidate has three unique
  commits; integration main has 171 commits absent from the candidate. Its
  3,874 ignored paths are all under
  `packages-ts/galerina-core-compiler/dist/`; none were moved or deleted.
- Revalidated the prior Astra per-path disposition (submission
  `01a12e2a-fb5b-7123-a2e1-c3409eab0b60`, retained prompt/reply digests in the
  preceding entry): candidate runtime refusal API is non-executing and its test
  permits caller-visible proxy side effects; the TODO is proposal context. The
  package manifest and terminal-scope test are already represented in the
  integration working overlay. No candidate-only change is currently eligible
  to port. The integration overlay remains user work and is preserved.
- This updates the older 170-behind snapshot by one commit; PR #169 and remote
  state were not changed or rechecked in this bounded local pass. Preserve the
  clean donor and continue to the next memory-relevant checkout; no CI ran.

### Vault provider malformed-byte-view refusal — 2026-10-12

- A WSL red/green regression reproduced that a provider returning a plain
  `Uint8Array` subview was refused before cleanup, leaving its 25 visible
  marker bytes intact. The scoped dirty patch now wipes only the supplied view
  before refusing it as a non-`Buffer`, retaining retryable cleanup failures;
  its regression also checks surrounding sentinel preservation and no handle
  creation.
- Astra's initial review (submission `01a12e6b-5d15-7502-8027-8d350865f02a`)
  returned PARTIAL and identified that a detached malformed view was not
  retained, leaving existing protected reads available. Two added regressions
  reproduced this in both load and rotation (RED: `useActive` returned true).
- The fix now retains every failed wipe obligation, including detached views
  that cannot be retried through the local reference. Such a view remains in
  `pendingWipes`; existing reads and future provider access stay refused rather
  than asserting bytes were erased. An older detached-Buffer rotation test was
  updated to require quarantine instead of serving the prior secret.
- Verification after that change: vault TypeScript build passed; full vault
  suite passed 87/87 in WSL and 87/87 on native Windows against the WSL-built
  package. No GitHub CI ran. This is bounded TypeScript/bootstrap evidence,
  not Fungi runtime, FFI, host, or end-to-end protected-memory proof.
- Current dirty-file SHA-256: manager
  `0E93E49B874FCADD25AE33F202BD6534F1CFBB92C8AAC283E805773307F3C97B`; tests
  `9142AE9D54298915C5CDF73231937FA44765334BACAB8649623B2E4398239F62`. The
  focused follow-up is with the same Astra reviewer (submission
  `01a12e70-faec-7601-888f-a3e450a015f1`). Both files remain unstaged and
  uncommitted pending review and fresh custody checks.

### Memory-consolidation donor fresh custody reconciliation — 2026-10-12

- The older row above describing `codex/memory-consolidation-20261007` as
  clean after publication is stale. Live checkout is at
  `16fb71a21c41c66de13a0167606feb58a8b63951`; it has 7 commits absent from
  local `main`, is 83 commits behind local `main`, and has 48 modified/staged
  status entries. No files were reset, staged, moved, or deleted.
- Its committed delta includes native-memory evidence and runtime/compiler
  changes; the distinct recent commits include the Fungi scalar-return metadata
  correction, compiler-test Git-environment isolation, and a production-form
  revocation-key test. These are review candidates, not yet shown eligible for
  integration: current `main` and this donor both contain broad overlapping
  dirty files, and the donor's generated indexes and docs are also dirty.
- Preserve this donor and reconcile one exact commit or path set at a time
  against current `main` and its dirty overlay. Do not merge the branch or
  trust its historical “clean after publication” note as current custody.
- Commit `d01952803` is not a safe whole-branch merge, but its scalar-return
  metadata behavior is already present in the integration source overlay
  (`wat-emitter.ts`); the associated targeted regression cases are present in
  the tracked `q1-secret-return-value.test.mjs`. On the integration build
  output, compiler `typecheck` passed and the focused 99-test suite passed in
  WSL and native Windows. No source build or CI was run in this check. These
  are compiler/bootstrap observations, not evidence of Fungi runtime or host
  enforcement. The modified emitter and broader memory overlay remain
  uncommitted and pending independent review.

### Provider-read re-entry guard and next candidate disposition — 2026-10-12

- The prior Astra review of the malformed detached provider-view fix returned
  PARTIAL and identified provider-time re-entry as uncovered. Exact source
  reproduction: while `load` or `rotate` awaited an injected `readSecret`, that
  provider synchronously called `useActive` on the same manager and successfully
  read the previous active value before returning a detached `Uint8Array`.
  Both new regressions failed against the pre-fix compiled package.
- The local fix tracks unresolved provider reads in the manager and makes
  `useActive` refuse while any such read is in flight. This is deliberately
  manager-wide and fail-closed; its availability impact and remaining races are
  pending the same Astra worker's exact-hash review. It does not undo copies a
  provider already obtained, and proves no Fungi/runtime/FFI/host enforcement.
- Exact working-file SHA-256: `rotation-manager.ts`
  `AF9C424BC5C3A16D243D9F049F0D8D760A3259853D124E506D3BAD80A0BE7C6F`;
  `vault.test.mjs`
  `BBFBFA313B249D1ECF963D721B2C2F1B0154F16E519EDB7B76D7B8153B2DE374`.
  WSL build plus package suite: 89/89 pass; native Windows Node suite against
  that WSL-built output: 89/89 pass. No GitHub CI ran. Astra follow-up queued
  as submission `01a12e74-7cdb-7f50-8c32-642489662699`.
- The WAT candidate's D8 commit `e580f81da` is not a transplant candidate:
  the patch fails `git apply --check` against this integration checkout because
  runtime/compiler contexts differ and its test already exists here. Keep the
  donor intact; its broad 16-commit history and unrelated dirty interpreter and
  generated-document paths are not a merge unit.
- Current-source route check: the Fungi route dispatcher maps POST
  `/auth/verify` to a flow name, but `deno-adapter.ts` still returns 503 and
  `verifyPasswordService.fungi` explicitly marks its `/__fixture/auth/verify`
  handler synthetic-only and production-unimplemented. Preserve this as an
  integration blocker; do not count the fixture or route name as the protected
  operation.

### Vault provider-gate retest and WASM collision source disposition — 2026-10-12

- Removed one invalid provider-reentry test probe: it monkey-patched
  `Buffer.isBuffer` after module initialization, but the vault captures the
  intrinsic when the module loads. That probe could not reach byte validation
  and is not retained as regression evidence. The separate overlapping-read
  and malformed-quarantine concurrency tests remain.
- Final working-file SHA-256s:
  `packages-ts/galerina-ext-secrets-vault/src/rotation-manager.ts`
  `69043C64624D6E2C03812799EEE7B72BC71A70EBC23DAE958CDC5487E2A08249`;
  `packages-ts/galerina-ext-secrets-vault/tests/vault.test.mjs`
  `56ADF7952EA626BFBA86004E3CE5FF08695BA781F088A3D197E753984AD8B597`.
  Package build plus tests passed 91/91 in WSL. Native Windows package tests
  also passed 91/91 using the local TypeScript compiler; the package's ordinary
  `npm test` wrapper first failed because the global `tsc.ps1` resolved to a
  missing roaming TypeScript installation. This is TS bootstrap evidence only.
- The exact-hash Astra re-review is queued on the existing worker as submission
  `01a12e7d-1c90-7cf0-ab38-19315cf42b3a`. It must adjudicate whether a
  post-provider-settlement re-entry window is reachable under actual JavaScript
  job ordering, and review overlapping provider, detached-view, quarantine,
  rotation-policy and disposal cases. Until that response is source-checked,
  keep the manager-wide gate provisional; no Fungi/runtime/FFI/host or
  end-to-end claim follows from these tests.
- The historical WASM grant-collision note names source SHA-256
  `008F9F158C9D5DBC24308EA9C0625B15E695220294BC1B515F65D3F882E867AA`, which
  is not the current working source (`wasm-runtime.ts` SHA-256
  `2CD064A1A30FFEB64B7D3042E00EF010CD35ADE43F632EB791874A5FF5A1D08E`). The
  current factory's host object contains no `audit.write` or `audit.log` bridge
  before grant installation, so the recorded collision is not reproduced for
  the present ABI. The `hasOwnProperty` branch still silently preserves any
  future same-name bridge; retain the fail-closed collision requirement as a
  latent guard-design question, not as a verified current exploit or a closed
  fix. No source change was made for this candidate.
- Next: continue with the executable auth composition gap only at a controlled
  synthetic provider/sink boundary. Keep POST `/auth/verify` fail-closed at
  503 until the actual Fungi/WIT consumer and approved trusted execution
  boundary exist. Preserve every unrelated staged/unstaged path; no CI,
  commit, push, merge, or donor cleanup occurred in this checkpoint.

### Test Git-isolation donor commit disposition — 2026-10-12

- Bounded review of donor commit `1288bf86f6134b658b7768d4175b6d9eea1b5f57`
  (`Isolate compiler tests from Git worktree overrides`) found no safe transplant
  to integration `main`. Its package wiring is already present, while its
  isolation preload and runner tests are an earlier, reduced implementation.
- Current `main` routes through the shared `scripts/lib/test-git-environment.cjs`
  owner, creates isolated Git configuration and WSL interop environments, and
  tests hostile config/template/routing behavior. The donor version only removes
  four routing variables and replaces several controls with smaller fixtures.
  Replacing current files with donor blobs would reduce coverage and discard
  stronger behavior. No donor bytes were copied; the donor checkout remains
  untouched.
- Disposition: superseded by the stronger current-main implementation; no
  additional merge is needed for this commit. Continue to the next unreviewed
  donor commit/path set. This does not resolve the donor's dirty overlay or the
  remaining memory/compiler/runtime evidence requirements.

### Astra vault rotation-window correction and patch review — 2026-10-12

- Astra worker `01a12dba-335e-7191-b2cc-f2a17c55076d` returned correction
  submission `01a12e80-272d-7591-b6df-6ac5e07d2e17`, retained at
  `outputs/astra-vault-provider-gate-review-20261012/follow-up-reply.txt`
  (SHA-256 `37CB9E77DD94BBE985E9600639CC3EFA458E44A9C8A10E17032F8D28264BFC3A`).
  It withdrew its missing cross-credential settlement-test finding: the cited
  test directly holds two reads, checks the gate after one settles, and reopens
  only after both settle. It separately confirmed the rotation-window gap:
  `useActive` did not check the published per-credential rotation lease during
  `QUIESCE_MS`.
- A deterministic regression now holds that quiescence timer and checks the
  same credential cannot expose `old-active`, then verifies access after the
  rotation completes. Before the source fix it failed as intended (77/78,
  observed `old-active`); after adding the per-credential rotation-lease check,
  package build and tests passed 92/92 in WSL and 92/92 on native Windows using
  the local TypeScript compiler. No GitHub Actions/CI ran.
- Exact final working-file SHA-256s: `rotation-manager.ts`
  `8E1CFDFE8C45066CBCE6F0EC00CB5D8168F3B9AF5C65DA1463E10778A3640E25`;
  `vault.test.mjs`
  `2FB6D7628AE297016B1A0CC8CD312EF5CE1A728DEBFB57A21962DD6836D402D3`.
  The check is per credential; evidence remains TypeScript/bootstrap package
  evidence and proves no Fungi, runtime, FFI, host, or end-to-end guarantee.
- One exact final-patch review was sent to the same Astra worker as submission
  `01a12e85-ac3b-7ca1-8c2e-3b004bfb74be`; prompt
  `outputs/astra-vault-provider-gate-review-20261012/final-patch-review-prompt.md`
  has SHA-256 `A2F2EADD6DAD17B59A8B83D0702C467B58FD0BBF36606515A1F4E3390E097AB2`.
  Await that review before classifying this patch as eligible for integration.
- This remains a local, uncommitted patch in the existing integration checkout.
  No unrelated staging was changed and no commit, push, merge, branch change or
  worktree cleanup occurred.
- A bounded source slice from the older `f5b474bd7a5ef5f422c611334bf26e582ded9dc1`
  donor commit changed `examples/auth-service/routeDispatcherService.fungi` to
  use a named `RouteDispatchResponse` record. Current `main` already has that
  type from later commit `22a5ccd796cab1865585755c20077ea837ef5c05`; its working
  file matches the `main` blob. The donor variant instead replaces the current
  caveat that this is example metadata with aspirational “50% Runtime” milestone
  prose. Do not transplant the donor version. This resolves only that path, not
  the other 46 paths in the donor's 47-path commit.

### Vault quiescence scope control and Astra delta — 2026-10-12

- Astra's exact-patch reply is retained in the task workspace as
  `outputs/astra-vault-provider-gate-review-20261012/final-patch-review-reply.txt`,
  SHA-256 `A40ADE90B96B7547E2A3CCEA149A65778C9C84117AB9748283F94F27FF3DA6E9`;
  submission `01a12e85-ac3b-7ca1-8c2e-3b004bfb74be`. Astra marked Q1 PASS and Q2
  PARTIAL, specifically requiring proof that credential B remains available
  while credential A is in its quiescence interval.
- Added that positive control to the same deterministic regression: it now loads
  an unrelated credential, holds A's quiescence, observes refusal for A and
  successful access to B, then releases the timer and confirms A's new value.
  WSL package build/full suite passed 92/92; native-Windows build/full suite
  passed 92/92. These are package/bootstrap results only. No GitHub Actions/CI
  ran.
- Current exact source hashes: `rotation-manager.ts`
  `8E1CFDFE8C45066CBCE6F0EC00CB5D8168F3B9AF5C65DA1463E10778A3640E25`;
  `vault.test.mjs`
  `32E395F7F98E5FA0BB0D889920939E9753FAC378B5F2D32C544B461D11F95682`.
  The bounded delta prompt is retained as
  `outputs/astra-vault-provider-gate-review-20261012/quiescence-control-followup-prompt.md`,
  SHA-256 `F7F4B4828743D53594016C42934878D9B02714CE47CB53C8FD09857F18734ABE`;
  same-worker submission `01a12e87-c9a3-7772-bc63-b642d66761ab` is pending.
- Keep the preceding Astra Q1 PASS and Q2 PARTIAL bound to their exact reply;
  the new control awaits independent Astra adjudication before clearing Q2.
  This does not establish Fungi/runtime/FFI/host enforcement or whole-operation
  exclusion. The `log` failure policy's post-settlement stale-value serving
  remains an explicit non-fail-closed behavior, separate from the rotation
  window finding.
- The patch remains uncommitted in the dirty integration checkout. No unrelated
  staged files were changed; no commit, push, merge, branch change or cleanup.

### Vault rotation harness final delta — 2026-10-12

- Astra's exact-harness reply is retained at
  `outputs/astra-vault-provider-gate-review-20261012/harness-cleanup-followup-reply.txt`,
  SHA-256 `3ECF7CA503570F5529F50EE18F1D3724DB1808A0D6049A7203CCF81AEA96EEFF`.
  Its Q2 remained PARTIAL and raised a possible unbounded wait after a watchdog.
- Source adjudication: in that prior test, the ordering assertion was inside
  `try`; if it failed, `finally` ran and the assertion propagated, so the later
  `await rotation` was skipped. That specific claim did not match JavaScript
  control flow. The remaining concern—an observed/cleaned-up rotation after an
  early failure—was addressed in a bounded test-only delta.
- The test now uses temporary expected buffers and wipes both expected and
  observed copies, restores intercepted timers in `finally`, releases the
  quiescence callback, resolves its controlled provider once, observes both
  rotation outcomes, bounds readiness and cleanup waits, and disposes the
  manager. Same-credential refusal, different-credential availability, and the
  post-rotation value are checked.
- Updated `vault.test.mjs` SHA-256:
  `558C9E7AB9B58F69C8934023E317F3A7CD933E945B6804FCD73D4D2813B5CF8B`.
  WSL package build/tests passed 92/92 with inherited Git authority variables
  removed. Native Windows local TypeScript compilation and the same 92 tests
  passed. The package `npm test` wrapper failed only because its `tsc` command
  resolved to a missing global installation; invoking the package-local
  TypeScript compiler directly succeeded. No GitHub Actions/CI ran.
- One narrow read-only delta review was sent to the same Astra worker
  `01a12dba-335e-7191-b2cc-f2a17c55076d`, submission
  `01a12e8e-0ebd-7ad3-98cd-034e514fa0a0`; the exact prompt is retained at
  `outputs/astra-vault-provider-gate-review-20261012/harness-final-delta-prompt.md`,
  SHA-256 `1C285120D916535D2F70FFA879007741E17E8261E935A6788CA70D14F1E1F7A9`.
  Astra's exact reply is retained at
  `outputs/astra-vault-provider-gate-review-20261012/harness-final-delta-reply.txt`,
  SHA-256 `650637B8A0EB6302AA5BB528F5B7B6094AEB66FB286A8D08E271C1C58E71B08D`.
  It withdraws the prior unbounded-await concern after tracing `try/finally`,
  marks the revised harness cleanup/oracles PASS, and resolves the earlier Q2
  PARTIAL for this narrow delta. No concrete remaining harness failure path was
  identified. Astra did not rerun tests; local WSL and Windows results above
  are the test evidence.
- Disposition: eligible for further integration review only—not merge,
  security clearance, or RD closure.
- This establishes only TypeScript/bootstrap vault-test behavior. It does not
  prove Fungi ownership/effects, compiler/runtime/FFI/host enforcement, or an
  end-to-end protected operation. No commit, push, merge or unrelated staging
  change occurred.

### `memory-current-main-20261008` bounded first-pass — 2026-10-12

- Live worktree branch `codex/memory-current-main-20261008`, HEAD
  `34b419057de49b6437d0b3b9423f3f2bfb205970`, is 100 commits behind
  `origin/main` and has no unique committed changes relative to it. Do not
  rebase this dirty checkout or integrate its historical HEAD wholesale.
- Its live overlay is separately valuable and must be preserved: 43 staged
  paths, 7 unstaged paths (including staged/working overlaps), and 2 untracked
  WAT probes. Of the 43 staged blobs, 8 currently match local `main`; 35 differ.
  The changes span compiler/value-state and auth tests, WASM grant/runtime,
  Rust secret-arena/VOK, WAMR admission/probes, vault WIT generation, code
  indexes/registry, and historical docs. Generated indexes are not source
  integration candidates and should be regenerated after source selection.
- The branch's `docs/reports/memory-native-consolidation-20261007.md` explains
  its original scope, review and component checks, and explicitly retains the
  frozen T14 digest mismatch, classical-CLI positive-control failure, and an
  interrupted broad test caused by inherited WSL Git fixture authority. That
  report predates this live overlay; do not treat it as current verification.
- First-pass disposition: use the report plus Git path/stage history to guide
  review, but carry each source/test/tool path against current `main` before
  deciding. The eight staged blobs already equal to `main` need no copy in
  their staged form; inspect their unstaged overlays separately. The remaining
  35 staged differences and 7 unstaged changes are not yet individually
  adjudicated. Preserve both untracked WAT probes. This worktree is not
  cleared, merged, committed, pushed, rebased, or deleted.
- Focused WASM-grant path review found a material regression in this staged
  candidate. Its `wasm-runtime.ts` removes the single captured `const host =
  opts.host` and instead rereads `opts.host` after the async compile boundary
  for factory validation, imports, instantiation, memory binding and result.
  Current `main` deliberately captures one identity, and its tests exercise a
  mutated option during compilation plus a changing accessor. The candidate
  also deletes those two tests. Do not port its runtime implementation or
  weakened test rewrite. Its grant test replaces real engine compile/instantiate
  observation and valid/refusal twins with simpler `assert.rejects` checks,
  weakening proof that refusal happens before host start effects.
- Current-main source verification: WSL TypeScript compilation passed; focused
  compiler admission/effect-grant tests passed 30/30 and runtime-WASM tests
  passed 72/72, with inherited Git authority variables removed. No GitHub CI
  ran. These remain bootstrap/runtime-package checks, not Fungi semantics or
  whole protected-operation evidence. Preserve the candidate's other staged
  path groups for later serial review; this finding does not disposition all
  43 staged paths.

### `grok-wat-integration-candidate-20261003` first-pass — 2026-10-12

- Branch `grok/wat-integration-candidate-20261003` is clean relative to its
  remote, at `3ac9f8b150e074247092bdcf164f500e4b4d995d`: 16 commits ahead and
  559 behind `origin/main`. It has no staged or untracked paths; two tracked
  files are unstaged: the compiler interpreter and its I2/I3 tests, plus a
  generated non-authorities document. Preserve those edits.
- The 16-commit history is a composite, not a single WAT patch: governed fault
  handlers/body-local invariants (I2/I3), D4 pattern lowering, D8 non-secret
  effect-grant ABI, ZipPair lowering, provisional E5 Float32/Float16 rounding,
  diagnostic migration and symbol-usage tooling, followed by WAT integration
  and index regeneration. The history/path diff is a useful map for later
  source review; the generated code-index/registry blobs are not source and
  should be regenerated after any selected integration.
- `docs/reports/float-width-usage-2026-10-02/README.md` records a read-only
  symbol census; it is explicitly not authority. Its companion
  `worktree-only.md` is a dated snapshot and names other worktrees rather than
  fully describing this branch. The commit history confirms E5 sources and
  tests are present here despite that snapshot. Verify the exact current main
  files and tests before any port; do not infer capability or profile admission
  from the audit or branch label.
- Bounded first-pass disposition: retain the candidate untouched and continue
  with the next worktree. Its 16 unique commits and two local source/test edits
  remain unadjudicated against current main; no whole-branch merge, rebase,
  commit, push, cleanup, or CI was performed.

### `grok-baseline-05eb5c29-20261002` bounded triage — 2026-10-12

- The clean checkout is at `1ea29bd2b`; its history has 8 commits not in
  `origin/main` and is 559 commits behind. The 8-commit series changes 35 paths
  across WAT D4/D8/ZipPair, provisional narrow-float E5, the interpreter,
  runtime-WASM and a Tri-Regex package, plus its read-only float-usage report.
- This exact HEAD is an ancestor of
  `grok/wat-integration-candidate-20261003` via its recorded merge commit
  `fc937d7a0`. Review those commits only through the larger candidate's single
  path-level reconciliation; do not duplicate-port this branch independently.
  The dated float report is a locator/audit, not evidence that E5 or an RD-0855
  profile is implemented/admitted on current main.
- No staged, unstaged or untracked changes were present in this worktree. This
  bounded check found no standalone work to integrate apart from the larger
  candidate already in the queue. No branch/worktree mutation or CI occurred.

### Memory-consolidation donor bounded exit and next worktree — 2026-10-12

- Rechecked donor `codex/memory-consolidation-20261007` at
  `16fb71a21c41c66de13a0167606feb58a8b63951`: 7 unique commits versus current
  integration `main`, plus a 48-entry dirty overlay (2 staged, 48 unstaged
  including staged/working overlaps, no untracked paths). Preserve its index,
  working files and branch unchanged.
- Bounded commit dispositions: `16fb71a21` is superseded by the stronger
  production-shaped current CLI fixture; `1288bf86f` is superseded by current
  main's fuller Git-environment isolation; the signed-revocation control from
  `2fe94fbaf` is present in the current six-case test with a key ID generated
  by CLI keygen and constrained to 16 lowercase-hex characters; focused current
  CLI test was already verified 6/6 in WSL and on Windows. `1146f91c2`'s dated
  baseline-failure narrative is already retained inside the current historical
  report wrapper. `a23ade05b`'s “pushed/clean” custody statement conflicts with
  live donor dirt and is superseded by this ledger's live refresh. `d01952803`
  and its scalar-return path were already dispositioned in the earlier entry.
- The 47-path `f5b474bd7` commit is not eligible for whole-commit integration:
  it combines memory source/tests, generated code indexes/registries and
  historical custody material. One route-dispatch type slice is already on main
  and does not need copying. The other paths remain candidates, not rejected
  work; do not substitute the donor's old WORKTREES snapshot for current
  custody.
- Bounded attempt on this donor is complete for now. Move to the next recorded
  worktree and resume donor reconciliation later by exact path group; this is
  not permission to archive/delete the donor or a claim that its remaining
  source is unnecessary. No donor files or Git refs were changed.

### WAT integration candidate I2/I3 interpreter delta — 2026-10-12

- Reopened `grok/wat-integration-candidate-20261003` at
  `3ac9f8b150e074247092bdcf164f500e4b4d995d`. Its only substantive dirty
  source/test paths remain `packages-ts/galerina-core-compiler/src/interpreter.ts`
  (SHA-256 `4DD7BBFF04FAB64C80CBDCB10296D8A77B7D74E1AE68E960C602F37193A80CC9`)
  and `packages-ts/galerina-core-compiler/tests/interpreter-i2-i3.test.mjs`
  (SHA-256 `AFB8D61EF04136D73CAFDD7813DD79088BF216EDE9F6619F54C5597F10F8712C`).
  The generated `docs/generated/HALLMARK-NON-AUTHORITIES.md` is status-marked
  modified, but its working and index object IDs match and `git diff` reports no
  content change. Preserve the checkout; no candidate files or refs changed.
- Earlier focused `interpreter-i2-i3.test.mjs` runs reported 64/64 in native
  Windows and WSL. They imported the existing `dist/index.js`, and no fresh
  candidate build was performed first. Treat both runs as unbound to the dirty
  candidate source, not as verification of this delta. The first WSL attempt
  also exposed a test-fixture portability issue: its HEAD-pinned Git probe read
  a Windows worktree path as a WSL path. A process-local WSL mapping of this
  exact worktree's Git directory, common directory and worktree root corrected
  that probe; no repository configuration was changed. No GitHub Actions/CI
  ran.
- The candidate replaces `isCheckedTrap` propagation with
  `isFailClosedRuntimeError` and adds message-text matches for
  `FUNGI-INV-005/006`. The integration working interpreter still uses
  `isCheckedTrap` and has a different dirty overlay; the candidate test file is
  absent there. Candidate tests exercise nested body-local invariant failure
  propagation and fixed-classification diagnostics, but do not appear to test a
  soft runtime error whose message spoofs an invariant-code prefix. Keep
  message-based failure identity under review; do not port this delta yet.
- Candidate tests explicitly refuse executable fault handlers and body-local
  invariants in WAT. This is interpreter/bootstrap evidence with WAT refusal
  controls, not implemented compiled-Fungi behavior, runtime/FFI/host
  enforcement, or proof of a memory guarantee.
- Astra's first read-only adjudication returned PARTIAL under submission
  `01a12e9e-a145-7273-8614-7ed4ae85b871`; prompt SHA-256
  `F59E7CA63F09C889EA816C674B892ACBF2532FAFE02BFA84D5D0507D6163C4CE`.
  Source verification narrows its direct caller-value counterexample:
  `executeFlow` calls `snapshotHostRuntimeErrors` in integration main, not in
  this candidate source. The candidate's dirty source has no such sanitizer;
  its `isFailClosedRuntimeError` classifies by matching message text, including
  `FUNGI-INV-005/006`. A probe and the 64/64 test run used the candidate's
  pre-existing `dist/index.js` without first rebuilding it. Their observed
  top-level/nested behavior is therefore unbound and is withdrawn as candidate
  runtime evidence. Source review still identifies a plausible forgeable
  message-classification risk, but no fresh-build reproduction has been
  established. Integration main's separate shallow sanitizer does not resolve
  or establish the candidate behavior.
- A bounded follow-up addressing the corrected source-level concern is pending
  under Astra submission `01a12ea6-3b96-7773-a1ee-190678e97198`; prompt
  SHA-256 `90A8CBF092F13CAB3AEF6827BCF605A6ED703F9E810D15919ACFECB36D2CBE29`.
  Until adjudicated, do not port the candidate's text classifier. The
  recommended direction is an internal structured/non-forgeable hard-failure
  identity plus tests for genuine INV-005/006 and top-level/nested soft-marker
  behavior, but candidate intent and runtime behavior remain unresolved.
- The graph lookup returned zero nodes without a verified build point, so graph
  freshness remains UNKNOWN; exact source and tests are the bounded evidence.
  Bounded disposition: preserve this candidate and mark its dirty interpreter
  delta unresolved; do not spend further time here before addressing the next
  eligible memory path group. Revisit only if that group depends on this
  interpreter behavior or after a separately scheduled source-bound build and
  test. No merge, rebase, commit, push or worktree cleanup occurred.

### `memory-current-main-20261008` bounded disposition — 2026-10-12

- Checkout `C:/Users/phill/Documents/GitHub/Galerina/.worktrees/memory-current-main-20261008`
  is at `34b419057de49b6437d0b3b9423f3f2bfb205970`, 100 commits behind the
  locally recorded `origin/main` and with no commits unique to its HEAD. It has
  43 staged paths, seven additional unstaged paths, and two untracked WAT
  probes. Preserve all three layers; do not reset or clean it.
- The staged index is a mixed snapshot: 39 of 43 staged blobs exactly match
  commit `f2a6a5fe2642c3498528b1d542308a4f3adfd30f` on
  `origin/codex/memory-consolidation-20261007`; three staged documentation or
  attribute files differ from both that commit and `origin/main`, and one
  staged blob matches `origin/main`. The f2a commit itself is not in
  `origin/main` (one unique commit on the f2a side; 141 on the origin-main
  side at this snapshot). Several important paths have since diverged in
  `origin/main`, including the auth example, value-state checker, helper test,
  Wasm runtime, VOK secret arena and vault WIT test. This is not a safe
  wholesale-merge candidate; the source must be compared path by path against
  the current integration checkout.
- The checkout's own `docs/WORKTREES.md` and native-consolidation report say
  the staged work derives from a reviewed legacy native-memory consolidation,
  while separately retaining old TODO/roadmap, generated-index, `.gitignore`
  and secrets-spore changes. Treat those notes as discovery only: their
  dated verification and main-integration holds (classical-CLI positive
  control and frozen T14 digest) must be reopened before accepting any claim.
- Bounded disposition: retain this checkout and its index/worktree/untracked
  contents as a path-level recovery source; do not merge it wholesale. Continue
  by reconciling the published consolidation branch's current state and review
  source-bound deltas against the integration checkout. No Git refs or candidate
  files changed during this inspection.
- Follow-up WAMR comparison (2026-10-12): the donor working copy of
  `packages-ts/galerina-core-runtime/native/wamr-host/src/wamr_import_admission.c`
  is SHA-256 `4D41F7FBFF71D2817D20EF36198248D869D4C3910C0E5A050B989312ECA70D19`,
  versus integration SHA-256
  `FD6A19E36758E7359375C4EBF6C8117667B168827DF968D5D1ADEFD745EDD15D`. The
  donor's `scripts/tests/rd1413-wamr-context-probe.c` is SHA-256
  `BD852E4E217EF29C4CBBC2E425CD88E351525602B7AE8B702F07F4E45986A334`, versus
  integration SHA-256
  `D933257E4AB2937C75941D8AF33DE5A7D1294C62CD2A24046B821B1B1BB6DB8E`. Direct
  diff shows the donor probe removes the externref-result fixture path and its
  pre-instantiation signature-mismatch assertions; the integration runner still
  invokes that probe and the pinned receipt records its refusal result. Do not
  transplant the donor WAMR probe/source as a unit: it drops a discriminating
  regression and changes contract validation. Preserve it for any separately
  useful pieces; no donor bytes were copied.
- Follow-up auth-route comparison (2026-10-12): donor
  `examples/auth-service/routeDispatcherService.fungi` SHA-256
  `09E8652C58352476D609237E0AF72E971D71F6A5991EFE8298BC38D54F6498D7`
  differs from integration SHA-256
  `EF9CDC544165112ABA6A27C990927A00F26DB57ABB683118535C62C0A167B28E`
  only in comments; both map `POST /auth/verify` to `verifyPassword`. The
  donor file supplies no runtime bridge and is not eligible to port. Current
  integration source still returns 503 from the Deno adapter, while the Fungi
  service route remains the synthetic `/__fixture/auth/verify`; the separate
  token-issuing example is not the selected result contract. Rechecked focused
  auth tests passed 22/22 on native Windows Node and 22/22 in WSL, but cover
  only fixture behavior and static CLI checks. No route source was copied.

### `memory-consolidation-20261007` current-state check — 2026-10-12

- The integration branch's older ledger row says this checkout was clean after
  publication; that statement is stale. The live checkout is at
  `16fb71a21c41c66de13a0167606feb58a8b63951`, tracking
  `origin/codex/memory-consolidation-20261007`, and has **67 local commits ahead
  and 6 behind** that tracking ref. Against `origin/main`, it has **7 commits
  ahead and 81 behind** at this inspection snapshot. Do not push this divergent
  branch or merge it wholesale.
- The checkout has 48 status entries: 2 staged, 48 unstaged (2 paths have both
  staged and unstaged layers), and no untracked paths. Changes span generated
  code indexes/graphs, TODO/roadmap and reports, compiler/runtime tests, Rust
  VOK and Wasm admission. Preserve each layer; generated indexes require their
  own source-bound refresh/review.
- Its recent history includes the native memory consolidation, the recorded
  classical-CLI baseline failure, test Git-environment isolation, and a
  production-form revocation-key test correction. Its report still records the
  classical CLI positive-control failure and frozen T14 digest mismatch as
  unresolved. The checkout merits continued focused review, but its divergence
  and dirty overlays are a reconciliation gate, not permission to overwrite
  newer main content.
- T14 is still failing, not resolved by the dirty pin update: the current Q8
  probe returns Z1 `d0b7917b…` while the separate Q4n test still expects its
  captured Z1 `7db66823…`. A native-Windows run of only that source-hash test
  reproduced the mismatch (1 test, 0 passed). The Q5n test changes its three
  zone pins and seven generated-WAT pins to current values and adds a
  non-secret-helper assertion; that may document intended source evolution,
  but it does not satisfy the still-frozen Q4n capture. Keep both evidence
  tracks; do not replace the old expected value without adjudicating the
  purpose/ownership of the capture and preserving an independent regression
  for the intentional WAT change. No source or test files were changed here.
- The separate classical-CLI blocker is resolved for the current candidate
  head, not for the whole release. Commit
  `16fb71a21c41c66de13a0167606feb58a8b63951` changes only the regression
  fixture's trusted revocation-root key ID from a non-production string to the
  production-shaped 16-character lowercase-hex value. I preserved and
  SHA-256-verified the prior ignored compiler `dist` (312 files, 4,377,876
  bytes) to a task-local recovery copy, then compiled current source with
  TypeScript 5.9.3. The focused `cli-classical-signing-refusals.test.mjs`
  passed 1/1 in native Windows and WSL with inherited Git worktree variables
  unset. Test SHA-256:
  `4D412482F984942F5722E3676D1F3CA5596FAB123041695D843EA7E45E57C045`.
  No production CLI code changed for this correction; it fixes an invalid
  positive-control fixture. The earlier failure report remains valid for its
  older source point; this local result supersedes it only for the exact head
  and focused test above. `npm run typecheck` initially resolved a missing
  global `tsc`; direct invocation of the package-pinned compiler passed
  `--noEmit`. No GitHub Actions/CI ran.
- The dirty WAT return-copy change is exercised by four exact `.fungi`-to-Wasm
  regressions on this candidate: recursive non-null tail refusal, partial
  secret-copy wipe with bounded cleanup, maximum-depth refusal, and the 4-GiB
  wasm32 heap-watermark boundary passed 4/4 in native Windows and 4/4 in WSL
  after compiling the current TypeScript source. The separate Q5n test for
  seven non-secret self-hosted modules also
  passed 1/1 in Windows: no secret-only wipe helper is emitted and the current
  output matches its new pins. These are generated-Wasm tests under Node's
  WebAssembly engine; they do not prove the production WAMR/host path or native
  Fungi semantics. Candidate source/test digests are recorded in the source
  checkout; the integration checkout has different bytes for both emitter
  files and the Q5n test, so this is not yet integrated.
- Bounded disposition: preserve; next review the two recorded verification
  blockers against current source and tests, then compare one memory-critical
  path group at a time. No rebase, merge, reset, commit, push, CI or worktree
  cleanup occurred in this check.

### Bounded continuation: vault quiescence control and compiler-test Git isolation — 2026-10-12

- Rechecked the vault test against the prior Astra review's cross-credential
  control request. The current working test
  `packages-ts/galerina-ext-secrets-vault/tests/vault.test.mjs` holds credential
  A at the rotation-quiescence ordering point, asserts A is unavailable, and
  asserts credential B still yields its expected synthetic value. Focused test
  passed 1/1 on native Windows and WSL. Test SHA-256:
  `558C9E7AB9B58F69C8934023E317F3A7CD933E945B6804FCD73D4D2813B5CF8B`;
  `rotation-manager.ts` SHA-256:
  `8E1CFDFE8C45066CBCE6F0EC00CB5D8168F3B9AF5C65DA1463E10778A3640E25`.
  The manager was not changed in this bounded continuation. The exact test hash
  is covered by the retained Astra harness-final-delta review, submission
  `01a12e8e-0ebd-7ad3-98cd-034e514fa0a0`; prompt SHA-256
  `1C285120D916535D2F70FFA879007741E17E8261E935A6788CA70D14F1E1F7A9`, reply
  SHA-256
  `650637B8A0EB6302AA5BB528F5B7B6094AEB66FB286A8D08E271C1C58E71B08D`.
  Astra marked the revised harness/control delta PASS and eligible for further
  integration review only. This is not merge approval or Fungi/runtime/FFI/host
  or end-to-end security evidence.
- Reconciled donor commit `1288bf86f` (`Isolate compiler tests from Git
  worktree overrides`) against the integration checkout. The current compiler
  package test scripts already preload Git-environment isolation, and the
  current governed runner refuses inherited Git directory/index/worktree
  overrides before package children. Focused runner-policy tests passed on
  Windows 39/39; WSL passed 28, skipped 11 Windows-specific cases, failed 0.
  No files were copied from the donor for this feature. This verifies only the
  current runner/bootstrapped compiler tests, not the donor's remaining work.
- Fresh branch comparison for `codex/memory-consolidation-20261007`: HEAD
  `16fb71a21c41c66de13a0167606feb58a8b63951`; 7 commits are not in local
  `main`, 83 main commits are absent from the donor, and its checkout has 48
  modified/staged status entries (the branch also differs from its tracking
  ref). Preserve it and continue by exact path/commit; do not merge wholesale.
- Fresh `grok/wat-integration-candidate-20261003` comparison: HEAD
  `3ac9f8b150e074247092bdcf164f500e4b4d995d`, 16 commits not in local `main`,
  561 main commits absent from the candidate, 56 paths in its branch delta,
  and three unstaged paths. Keep it intact and move to the next candidate;
  no candidate file, ref, or worktree was modified. No GitHub Actions/CI ran.

### Test Git-isolation donor Astra delta — 2026-10-13

- Reused Astra reviewer `01a13557-f7e5-72d0-9802-4f73da57d91f` returned a
  bounded **PARTIAL** review at 15:41 UTC; no separate response/submission ID
  or model/version metadata was exposed. Durable findings and dispositions are
  in `docs/independent-audits/2026-10-13-test-git-isolation-donor-astra-delta.md`
  (SHA-256 `E7F26DD2C82037CDB71FAADE177803821F986F23C0B49C198A3974DC1041DBD3`).
- Astra confirms donor `1288bf86f` is not an ancestor of this checkout; current
  main commit `5317ce06b` contains the evolved implementation. The separate
  untracked root preload is weaker than the shared committed helper (notably
  configuration and WSLENV/case coverage), and its test's helper selection is
  cwd-dependent. Do not merge that duplicate as added protection.
- Restored the donor's explicit empty-`GIT_INDEX_FILE` regression in
  `scripts/tests/run-all-tests.test.mjs`. Current edited test SHA-256 is
  `C5360CFA919E04AF4C6592FFFBAEE081DD754388E47DA3667FA2375A2F42B9F0`.
  The focused test passed on native Windows and WSL. The complete runner test
  file passed Windows 31/31 and WSL 20 passed, 11 Windows-only skipped, 0
  failed. No GitHub Actions/CI ran.
- This closes the retained-test gap only. The reviewer did not rerun the full
  sentinel/positive-control integration or WSL interop suite; its review is not
  donor-retirement authority, full custody proof, or Fungi/runtime/host security
  evidence. No donor, branch, or worktree was changed here.

### Astra WAT return-copy review adjudication — 2026-10-12

- The existing Astra reviewer agent `01a12dba-335e-7191-b2cc-f2a17c55076d`
  returned a Q1/Q2 PARTIAL review of the `memory-consolidation-20261007`
  candidate's WAT return-copy evidence. The completion payload exposed no
  separate prompt or submission identity. The exact returned text is retained
  in the task workspace as `astra-wat-return-copy-review-reply-20261012.md`,
  SHA-256
  `30B54D891D73B054FF0C1DB8DA6B4ABD3868F12DA61883E1472C1B73AD8DFACD`.
  Treat it as advisory evidence, not a complete review receipt.
- Source adjudication: Q4n T12 retains the historical Z1 pin
  `7db668236da13ad6e898bd7ab125e67c096b8b4ca2aeea861698fb1c2a649c9f`; Q5n
  T14 pins current source separately. Focused Q4n/Q5n tests reproduced the
  Q4n mismatch and Q5n match on both Windows and WSL: actual current Z1 is
  `d0b7917b0cb79ed19965945807e5bea45c61250bf0f2d0849586ca87f9b87e71`.
  Preserve both tracks; do not rewrite Q4n's expected digest to silence the
  red result. A historical immutable baseline fixture plus separate current
  semantic assertions is the candidate resolution, subject to checking the
  original capture's owner/purpose.
- For the 4-GiB boundary, the source emits capacity and i32-watermark guards,
  reserves the full result before stores, and trap cleanup wipes the owned
  range. However, the boundary test extracts guard expressions into a
  synthetic module rather than executing the actual emitted packed-return path
  at the limit. Add an emitted-module discriminator that binds the guard to
  that path and observes heap/wipe state after capacity and recursive refusal
  before treating Q2 as resolved.
- The donor test file contains compiler-to-Wasm/Node observations; these do
  not prove native `.fungi` execution, WAMR/provider/host enforcement, or an
  end-to-end memory guarantee. No donor file or ref changed in this review.

### Serial donor triage — runtime refusal and native arena compatibility — 2026-10-12

- Rechecked `grok/core-runtime-bounded-native-floor-refusal` at
  `246494403ac4d48c0e44a73aae72aeacde738c49`: three unique commits, clean
  checkout. Its proposed TypeScript transfer API always refuses and is not
  wired to the native provider; its proxy-reflection path can still execute
  caller traps before returning refusal. Keep the donor intact; no candidate-only
  code is eligible to port from this bounded slice. The already-present package
  asset and terminal-scope test deltas need no second copy.
- Rechecked `grok/wat-parked-memory-20261002` at
  `1ea29bd2b53d47f8923f5e7d39d6413e5bdd4971`: its eight-commit tip is already
  an ancestor of `grok/wat-integration-candidate-20261003`; do not duplicate
  its branch or review as a separate integration unit.
- On `memory-consolidation-20261007`, exact native-arena comparison shows the
  donor's `Display` change would replace established `SECRET_ARENA_*` consumer
  strings with `ERR_SECRET_ARENA_*`. The integration source deliberately keeps
  those strings and exposes canonical registered codes separately; its
  regression `secret_arena_display_preserves_existing_consumer_identifiers`
  passed 1/1 on native Windows and 1/1 in WSL. This is a bounded Rust API
  compatibility result, not memory-erasure proof. No donor file/ref changed.
- Next: continue the remaining dirty memory donor by an exact unresolved path
  group; preserve its staged/unstaged/untracked layers and move to another
  candidate if the chosen group cannot be adjudicated within a bounded review.

### Serial donor triage — scalar return metadata wrapper — 2026-10-12

- Reviewed donor commit `d01952803e64f7b65ecc0a30faffc66592eb4f01`
  (`fix(fungi): clear stale scalar return metadata`), which changes the WAT
  emitter and adds scalar-after-secret-return regressions. Its implementation
  is already represented at integration `main` HEAD
  `add90739684b1be18938aa3f593e8cff48ad7003`: the committed emitter selects
  matching scalar ABI lanes for i32, f64 and i64 and wraps calls to clear the
  heap-result tag. The committed Q1 test covers 16 scalar types in public-only,
  sequential and nested-call cases, plus stale-tag and generated-name controls.
- The donor's current working test is not a better copy: exact path comparison
  shows it removes portions of the integration test's broader regression set.
  No port is needed from this commit, and the donor's staged/unstaged layers
  remain untouched. This is source/test coverage evidence only; it does not
  establish native Fungi memory semantics or runtime/host security.
- The code graph located the integration emitter at the integration checkout,
  but its freshness receipt was not verified. Exact Git HEAD blobs and source
  were used for this disposition. No tests, builds, commits, pushes, merges or
  CI ran in this bounded review.
- Next: continue the donor one path group at a time; if the next group cannot
  be understood from its retained notes and exact source comparison, preserve
  it and move to the next candidate rather than repeating this review.

### Serial donor triage — Int64 dispatch test custody — 2026-10-12

- Compared the donor's staged and final working copies of
  `packages-ts/galerina-core-compiler/tests/interpreter-int64-dispatch.test.mjs`
  with integration `main` HEAD `add90739684b1be18938aa3f593e8cff48ad7003`.
  The donor index blob is `19d0894f27229875506b0178bb17a5ad6f5e4982`; its final
  worktree blob is `aec52bbfb5f5321cce463d53ca888b495c61fcde`; integration HEAD
  is `b741a0b4323343e627ed4439b4fe8443e9b90227`.
- The donor's final test file has no unique test titles relative to integration
  and removes nine integration controls covering lexical alias ownership,
  caller/callee identity, and the parameterless-call convention. Do not port
  this staged/working test version over the integration copy. Both donor layers
  remain untouched; this comparison does not determine whether every staged or
  unstaged interpreter-source hunk is redundant.
- Bounded disposition: preserve `memory-consolidation-20261007` and advance to
  the next candidate, `memory-current-main-20261008`, for an independent
  custody-first review. Return to the donor only for a newly scoped source hunk
  whose behavior is not already represented in integration.

### Serial donor triage — exact wide-integer interpreter boundary — 2026-10-12

- Reverified `memory-consolidation-20261007` at HEAD
  `16fb71a21c41c66de13a0167606feb58a8b63951`; it is 7 commits ahead and 83
  behind the reused integration `main` at `add90739684b1be18938aa3f593e8cff48ad7003`.
  Its 48 dirty entries remain untouched. The staged interpreter and final working
  interpreter are distinct layers; final interpreter SHA-256 is
  `754A07D44B7BC3DBFFF2E09E6BB35898B5B59A22EDDBB8B8F4C40541E69FD663` and the
  donor test SHA-256 is
  `DF656E11590478FA93FAB11B9F3DB45888D0BA25F20F49F10C28193430F1DD61`.
- The interpreter delta adds typed Int64/UInt64 argument evaluation before
  conversion through ordinary JS-number expressions, bounded range checks,
  return-context restoration, alias resolution, fast-path deferral and refusal
  of malformed/accessor-backed host payloads. Its focused regression file has
  61 tests and covers exact values above 2^53, `UInt64::MAX`, overflow and
  underflow refusal, single evaluation and side-effect ordering, alias chains,
  cyclic/conflicting aliases and host accessor cases.
- Rebuilt from these exact donor sources in WSL (compiler build evidence covers
  938 inputs; receipt SHA-256
  `C946D294CA438ED6273EEC43C52F913937F94B8BAD5278EC8B9D9B809771AEFF`). WSL
  typecheck passed; the focused suite passed 61/61 in WSL and 61/61 under native
  Windows Node using that same freshly built output and the Git-isolation loader.
  Native Windows `npm run typecheck` was unavailable because its configured
  global TypeScript executable is missing. The initial WSL build-evidence step
  refused on the Windows-form `.git` pointer; a process-local POSIX Git-path
  mapping allowed the build to complete without repository metadata changes.
- Before rebuilding, the ignored compiler `dist` was copied to a task-local
  recovery bundle and verified file-by-file (312 files, 4,377,876 bytes); the
  generated tracked hallmark document remained unchanged. The donor still has
  48 status entries. No source/test bytes were copied or staged, and no CI ran.
- This is fresh TypeScript/bootstrap interpreter evidence, not proof of `.fungi`
  language semantics or compiled Fungi/runtime/FFI/host enforcement. The exact
  staged/working delta is under read-only Astra review, submission
  `01a12ee7-ecb3-7980-bdb7-30254b8a1f1a`. Do not port until its findings and the
  donor-vs-integration behavior are independently reconciled. If the remaining
  alias or numeric scope cannot be adjudicated within the next bounded review,
  preserve this donor and continue to another candidate; do not let it stall the
  overall consolidation.

### Astra adjudication — wide-integer interpreter donor — 2026-10-12

- Existing Astra worker `01a12dba-335e-7191-b2cc-f2a17c55076d` returned the
  read-only review under submission `01a12ee7-ecb3-7980-bdb7-30254b8a1f1a`.
  Exact returned text was 7,737 characters; SHA-256
  `E12AFC9134C7A4E646FC032FB334EF86EB57DC967115E3F157692E089E4A6DFA` (the
  local digest implementation was checked against the standard `abc` vector).
  Astra inspected donor index/working layers separately against integration HEAD
  and did not run tests.
- Astra rates the donor's two vectors PARTIAL. It confirms the wide scalar flow
  admission/return-context additions, but identifies a plausible untested array
  boundary: generic list evaluation cannot preserve a >2^53 numeric literal as an
  Int64 element. It also confirms the donor's global alias map regresses lexical
  declaration ownership (a flow-local alias can poison a same-named valid module
  alias), and that its host-error snapshot helper drops the accepted empty `{}`
  parameterless-call convention. Integration HEAD already has lexical alias
  scopes, the empty-record normalization, and tests for both. Do not port the
  donor's alias resolver or its weakened test replacement.
- Rebuilt the current integration `main` working source in WSL; build evidence
  covers 949 inputs, SHA-256
  `64D7E94E6B9B8CD3F139AE62AC893E14922606BD070D75218067A042DDC249B6`. The
  focused `interpreter-int64-dispatch` plus `interpreter-while-fastpath` suites
  passed 154/154 in WSL and 154/154 under native Windows Node using that same
  fresh build and Git-isolation loader. This verifies the current integration
  TypeScript/bootstrap interpreter surface, not compiled Fungi semantics or
  runtime/FFI/host guarantees.
- Independent source probes refined Astra's array concern: an out-of-range
  literal in `Array<Int64>` produces a type diagnostic and execution refusal;
  a host-supplied rounded JS-number element passed to an `Array<Int64>` callback
  is rejected as `IntegerOverflow`, not returned as a rounded BigInt. No silent
  precision-loss output was reproduced. Added a focused source-level
  characterization regression for an exact `Int64` returned by a flow, placed
  in `Array<Int64>`, and passed through a top-level higher-order callback; it
  asserts the exact `9007199254740993n` result. Astra's narrow follow-up
  `01a12ef3-d7cf-7351-9f62-8d3bce1292fb` passed this identity-path test narrowly
  and confirmed the limit to TypeScript/bootstrap interpreter behavior. Its
  exact reply is retained in the task workspace; SHA-256
  `3F285D7CFC7898449DE52FED40521E95AC630F3D88A04EBD17EA89389226161D`.
- Based on Astra's identified callback-arithmetic gap, added a separate test
  asserting `AddTwo(value: Int64)` returns exact `9007199254740995n` from the
  array-carried `9007199254740993n`. The updated focused suite passes 144/144
  in WSL and 144/144 under native Windows Node against the same integration
  build. Current test SHA-256 is
  `F415F855173CFC940B50DDD70874C1450C352C26C3A77F8ECA36F43AD332C4FC`. This
  adds one interpreter callback-arithmetic discriminator; it closes neither
  all array/numeric semantics nor any Fungi/runtime/FFI/host proof.
- Astra's arithmetic-test follow-up `01a12ef7-0f7b-73c0-bbb8-d22c4e0b3d49`
  returned PASS for Q1/Q2, confirming the exact callback arithmetic path and
  the narrowly stated bootstrap conclusion. Exact reply SHA-256:
  `C4FF7CE82711DFFC8D4D5C922BEA8086A7DCBF8F5640D44832EE1803FCEFB411`; the
  linted prompt SHA-256 is
  `F45D8346F5137A3925EB393FBE3609B541687F6E141D1E3997CB7412B8F2A8A4`. Astra
  retracted its prior unsupported statement that the preceding brief's actual
  digest differed from a declared digest: Q3 is NOT VERIFIABLE because no
  declared comparison value is available. The prior brief file SHA-256 is
  `A8AB1FF55048A4E8DA8C55322C4B622BB98CA1A688156C27086BFC293789FD6B`.
- Source adjudication confirmed Astra's only citation-path typo: the reply links
  list construction through a non-existent `memory-main-baseline-20260909`
  path. The cited lines 2818–2821 were verified directly in the pinned
  integration checkout `memory-main-baseline-20261009`; the code claim itself
  is upheld. No donor source/test files were copied or staged. Preserve its
  remaining paths and continue serially; this is not clearance to retire the
  worktree or claim all 48 entries reconciled.
- Disposition: integration `main` already contains the direct wide-integer
  behavior and stronger lexical/host controls; the donor's alias/host regressions
  are not portable. No donor source/test files were copied or staged. Preserve
  its remaining paths and continue serially; this is not clearance to retire the
  worktree or to claim all 48 entries reconciled.

### Integration WASM grant-ABI verification — 2026-10-12

- Rechecked the existing integration `main` test and runtime source without
  changing their contents. `wasm-effect-grant-abi.test.mjs` SHA-256 is
  `0DBA98ECB5ADD144021C78CC560B1883C9C68688A890AE81EF5A3DA8414D78F7`; the
  exercised `wasm-runtime.ts` source SHA-256 is
  `2CD064A1A30FFEB64B7D3042E00EF010CD35ADE43F632EB791874A5FF5A1D08E`.
- Using the integration compiler build receipt already recorded above
  (`64D7E94E6B9B8CD3F139AE62AC893E14922606BD070D75218067A042DDC249B6`), the
  20-case grant-ABI suite passed 20/20 in WSL and 20/20 under native Windows
  Node. Coverage includes exact import signatures, refusal before callback or
  guest start, captured/frozen host identity, registry isolation, and denied
  secret or unknown grants.
- This is focused bootstrap/WebAssembly-engine behavior, not proof of production
  WAMR execution, Fungi runtime/FFI/host enforcement, protected-memory custody,
  or end-to-end RD completion. The test and runtime source remain in the
  pre-existing dirty integration set; no donor bytes were copied or staged and
  no GitHub CI ran.

### Integration secrets-vault package verification — 2026-10-12

- Before rebuilding the ignored vault `dist`, copied it to task-local recovery
  storage and verified every file hash: 20 files, 93,057 bytes. The recovery
  copy is under `outputs/galerina-vault-dist-20261012-prebuild/`; it is not a
  repository artifact.
- The package's documented `npm test` rebuilt the current source with `tsc` in
  WSL and passed 92/92 tests. Native Windows `npm test` stopped before building
  because its configured global TypeScript executable is missing; native Windows
  Node then ran the same 92 tests against the WSL-built `dist` and passed 92/92.
  No GitHub CI ran.
- Verified working-source identities: `src/rotation-manager.ts`
  `8E1CFDFE8C45066CBCE6F0EC00CB5D8168F3B9AF5C65DA1463E10778A3640E25`,
  `src/index.ts`
  `1B90585B856CFB85504C8C75D0E13C9EF9947CA2BBEED6C2ADE23C7BACA69229`, and
  `tests/vault.test.mjs`
  `558C9E7AB9B58F69C8934023E317F3A7CD933E945B6804FCD73D4D2813B5CF8B`.
  These are the pre-existing dirty integration files; this run changed no
  tracked vault source or test bytes.
- The suite includes provider re-entry and unresolved-operation read barriers,
  detached/unwipable-view refusal and quarantine, cleanup retry, rotation lease
  ordering, captured credential identity, and transferred-copy behavior. These
  are TypeScript package tests; they do not establish Fungi memory semantics or
  production provider/runtime/FFI/host enforcement, and do not close the coupled
  RDs.

### Current auth-route Astra adjudication and Temp-path locator check — 2026-10-12

- Reused Astra worker `01a12dba-335e-7191-b2cc-f2a17c55076d`, submission
  `01a12f00-9cb0-79f3-8577-312dd93e489f`, against integration `main` HEAD
  `59b23502fee2fdb4b5ae2bbdb6ac1ed4bc8b8e04`. Prompt SHA-256:
  `8753691FD0D4E69A02AE18E5F043DE7F07A4D64AA5C330E6BC22F9923716E48B`.
  The complete reply is retained in the task output; report-file SHA-256:
  `A227571C794FE7ABECFE28104767D444BF89A5FB6BC7CB91CB5FC5194D4BF4D3`.
  No provider/model metadata beyond the worker identity was exposed.
- Independently recomputed current source/test hashes and confirmed the review's
  bounded `PARTIAL` finding: the Deno adapter still returns 503 for the selected
  `POST /auth/verify`; the dispatcher returns a `verifyPassword` name, not an
  executed handler; the only wired service route is a synthetic plaintext
  fixture using an ordinary `String` and fixed hash. The older token-issuing
  flow is incompatible with the selected result-only contract. The review does
  not establish that no other repository-wide path exists. Keep the production
  adapter fail-closed until a synthetic-only composed Fungi/runtime/provider/
  sink path has discriminating evidence; do not wire either shortcut.
- Ran the owner worktree-aware Myco literal query for the exact Windows Temp
  path against this checkout. It returned `PARTIAL`, `freshness: UNKNOWN`, and
  no findings; query digest `64ea17be7afb3d4a4187d1dfd9ff7be87bbae452dd64e3b25b3a3e29997af8bd7`,
  report digest `2e59aa9a4ed6a23f3df7efe686939d12e707df7a78bce82a2c81f3a154c4a422`.
  The scan reports 18 unregistered local branches outside its current-worktree
  scope, so it cannot establish repository-wide absence.
- A bounded raw exact-string sweep for the owner-reported Temp root over common
  source/document/log text types in the integration checkout found no matches.
  `.git`, build outputs,
  dependencies, distributions and caches were excluded; registered sibling
  worktrees and other repositories were not scanned. No link edit is justified
  by this evidence, and no clean-across-the-estate claim is made.

### Stale Temp checkout locator in preserved branch-register copies — 2026-10-12

- A wider literal search located repeated `GROK-BRANCHES.md` entries naming an
  old per-user Temp checkout, `gal-compute-c11`, for branch
  `grok/core-compute-taxonomy-20261005`. The exact target directory is absent.
  The branch ref still resolves to commit
  `6126cb3eab9088f88bb52f594943857375bc82a4`, but `git worktree list` contains
  no checkout for it: the stale worktree locator does not mean the branch tip
  was lost.
- The stale entry occurs in multiple preserved `moving/` snapshots and in the
  tracked, clean branch-register copies in `memory-current-main-20261008` and
  `memory-consolidation-20261007`. The active integration checkout's local
  `GROK-BRANCHES.md` does not contain this exact locator. These copies are
  historical/candidate records; no mass rewrite, worktree recreation, or donor
  edit was made. Keep them preserved and use the branch ref/commit as the
  locator until an authorized checkout slot is available.
- The broad text sweep was stopped after establishing this repeatable stale
  reference; it also encountered an inaccessible recovery junction. It is
  partial coverage, not an estate-wide inventory. Myco's explicit
  `--include-worktrees` query did not finish within the bounded check and was
  interrupted; it has no result to report. Continue with the next eligible
  candidate rather than waiting on either scan.

### Secrets-vault facade rotation delta — 2026-10-12

- In the designated integration checkout at `main` HEAD
  `59b23502fee2fdb4b5ae2bbdb6ac1ed4bc8b8e04`, added a facade-level overlapping
  rotation test and strengthened provider-failure non-disclosure coverage in
  `packages-ts/galerina-ext-secrets-vault/tests/vault.test.mjs`. Current test
  SHA-256:
  `76E7E0BCDADF1169DC2579555E9B48ACED756E524DE643D9AA98AF1009D230E6`.
  The test holds rotation A's provider read pending, refuses rotation B before
  an additional provider call, then proves A completes and remains usable. The
  provider-failure control throws a sentinel and asserts only the fixed facade
  error escapes, without sentinel text or `cause`.
- Current reviewed source hashes: `src/index.ts`
  `400370E92F70ED489487B71F16606D98B1CF573C5ACB4803597E1BB060DFFF78` (final
  JSDoc narrows normalization to busy and handled failures that return false;
  unexpected manager rejections may propagate separately) and
  `src/rotation-manager.ts`
  `8E1CFDFE8C45066CBCE6F0EC00CB5D8168F3B9AF5C65DA1463E10778A3640E25`.
  All three vault paths remain unstaged; no unrelated staged path was changed.
- Full vault package suite passed 93/93 in WSL after rebuilding the TypeScript
  package with `GIT_DIR` and `GIT_WORK_TREE` unset. Native Windows Node then
  passed 93/93 against that WSL-built `dist`. Native Windows `npm test` cannot
  build because the configured global TypeScript executable is missing. No
  GitHub Actions/CI ran.
- SuperGrok's bounded advisory review is in conversation
  `2586df02-f737-4279-b874-046518490513`, final response
  `7c8c0ceb-c9c6-4601-bd52-408d2000b990`. Astra independently adjudicated the
  exact final test (`76E7E0BC…9D230E6`): both reviewed vectors PASS for the
  facade paths—generic error non-disclosure for handled provider failures and
  non-disruptive refusal of a duplicate rotation. Astra follow-up submissions
  `01a12f29-68fb-7310-befd-b0f6832747f8` and
  `01a12f2b-40c6-7112-a6e1-c3fbfa2342ca`; complete reply retained at
  `outputs/astra-vault-facade-followup-20261012-reply.md` in the task workspace.
  Retained prompt SHA-256 `3940B7139D2AE403144D3A719A8B500BD55A8987D1FC77651F86AD5242E4866A`;
  reply SHA-256 `3AB39714B456D4FC81D20F1F749AB8C4807CFCCA5000501DAB5AEC03AE5256D0`.
  Exact SuperGrok reply text/hash and a model-reported timestamp were not
  available in this record; its response ID is retained above.
- Remaining contract caveat: the same generic rejection represents a busy
  lease and a completed failure under the `halt` policy. Whether callers need
  to distinguish these states, or depended on earlier manager-specific error
  details, remains NOT_VERIFIABLE. Clarify that rejection means this rotation
  attempt failed, not necessarily that the credential remains unavailable.
  The final facade JSDoc now states this for normalized busy/handled failures
  and explicitly excludes unexpected manager rejections.
  These TypeScript/bootstrap tests do not establish Fungi semantics or
  runtime/FFI/host/RD guarantees. No wider integration or RD is closed.

### Standalone-WASM CLI output refusal — 2026-10-12

- Revalidated the current working-tree overlay (not just its index layer) in
  the designated integration checkout at `main` HEAD
  `59b23502fee2fdb4b5ae2bbdb6ac1ed4bc8b8e04`. The staged CLI patch and its
  larger unstaged filesystem-hardening overlay differ materially; neither is
  treated as a standalone commit unit yet.
- Before rebuilding, preserved the ignored compiler `dist` in task-local
  recovery storage at
  `outputs/galerina-main-compiler-dist-current-20261012/dist/`: 312 files,
  4,484,835 bytes, every file hash matched the source tree. Two older nearby
  recovery bundles do not match the current ignored `dist` and were not used as
  its restoration source.
- Current working source SHA-256: `src/cli.ts`
  `175B3EF14D6ADE8C22DD942B41FEA812E51F91E880CB690B0AF2A772FA5986F5`; focused
  test SHA-256:
  `tests/cli-wasm-assembly-refusal.test.mjs`
  `DC8ED65246A58CE9C39C3DD20EA430350A21315E50AD989783FF91825BBD0F46`.
  WSL build `dist/cli.js` SHA-256:
  `4E9AA241BA30875F3032D48FB93DF03BED8448475872526AB644778C8F33C519`; its
  build-evidence file SHA-256 is
  `9DD3974177ED48D79ECC253A1D081110FCF952D84021BD443799E0C03F08D628`.
- WSL `npm run build` succeeded. The current working-tree CLI refusal suite
  passed 39/39 in WSL and 36 passed, 3 platform-specific skips, 0 failures on
  native Windows Node using that WSL-built output. No GitHub Actions/CI ran.
  These tests exercise the TypeScript compiler CLI/bootstrap path, not Fungi
  language semantics or production runtime/FFI/host enforcement.
- A bounded exact-hash Astra review was submitted to the existing reviewer as
  submission `01a12f38-eda5-75b2-9ef9-fd9941bdd625`; prompt SHA-256
  `EEABEEF65BB841D516A6276E135C0FE8D7F4C8CB1C5DE5D43AEFF05B625023EB`.
  Astra verified all listed hashes and returned PASS for both bounded vectors:
  assembly refusal does not emit a stale WASM or claim PASS in the reviewed
  path; output path checks/publication refuse linked leaves and cover parent
  replacement races. Exact reply retained at
  `outputs/astra-compiler-wasm-output-review-20261012-reply.md`, SHA-256
  `C30C4B07433A704866A6363E37F70B8BC4AAAA37ED9CE3D553C2EC7506589E0A`.
  Astra recommends one stronger combined regression: seed an old successful
  WASM artifact, force assembly refusal, and assert the old artifact is gone.
  Linux parent-rename coverage is Linux-only and not proven by the Windows run.
  This is an advisory disposition, not integration approval. Do not commit or
  publish this compiler slice until the suggested control, staged/unstaged
  boundary and wider commit custody are reconciled.

### Q5n-B seven-stage WAT pin drift — 2026-10-12

- Re-ran `tests/wat-q7-k5.test.mjs` in WSL after the compiler build. The
  focused file is 17/18: the sole surfaced failure is the seven-stage generated
  WAT assertion. The full compiler suite also exits 1 at this assertion; its
  truncated output does not establish whether other failures exist. No GitHub
  Actions/CI ran.
- The Q5n-B expected hashes entered Git in
  `05eb5c29be9592a42cdd48baaeb027279ff5299d` (2026-10-01,
  `feat(wat): integrate reviewed WAT lowering work (Q1b-Q9b) into main`). This
  pins when the test values were committed. The exact compiler/toolchain
  reproduction is now verified below against this source commit and its lock.
- The current built compiler rendered all seven stages, and every current
  digest/length differs from the committed Q5n-B expectation:

  | Stage | Q5n-B bytes / SHA-256 | Current bytes / SHA-256 |
  |---|---|---|
  | lexer.fungi | 425985 / `5f7f235b944d36a7e3cbb16a7d88fe895e19fdd2d2728732235d70bc0975fdd7` | 427105 / `198c2c25badbf348f255a4120d5c6877710690f09d99286bb9779df0bbba9fc5` |
  | parser.fungi | 425985 / `5f7f235b944d36a7e3cbb16a7d88fe895e19fdd2d2728732235d70bc0975fdd7` | 427105 / `198c2c25badbf348f255a4120d5c6877710690f09d99286bb9779df0bbba9fc5` |
  | type-checker.fungi | 593181 / `1be2bfd57e0c06dd8bdae2c72822660e9817bc488392c581c5a71cead021d97f` | 598738 / `85a76a6ca8b71b18353c39111ea15a8836b32a34c88a441bcdf5887b81eb87f6` |
  | effect-checker.fungi | 507412 / `95227de9bdb61d5706bf70aa81d0efc0361c45cff9ef332017535e4dbdee1b02` | 508560 / `a72b287b97aca557110edb9612d89a17e5b1f097ecc56d230fed3a60f088a11e` |
  | governance-verifier.fungi | 466103 / `3a6a3745b76747949836c90aab51392b3c3dc208b54dc3d633722b02ea2a6819` | 467480 / `fd75a14a14a201460c859ea8ad19ebee1288e108033d1b3d91d2cd482dfbd2d7` |
  | gir-emitter.fungi | 481889 / `f7511e57de512542481177e63e2a21c3459339ee12456a82516be9e8c6180b43` | 483958 / `b55105e5309ee0c88390775f9607671a9c2a63e4b3ff64834e09579aa584336` |
  | runtime.fungi | 536554 / `d615ca94bfacd55564b0ffdefc73ce1923d9186756f50c2baa701cf22ae7c4a1` | 538691 / `27f78d881efe56a64a6297b691eb303371e428974d1785d00240df1fc2cf296e` |

- Source/status correction from Astra: six of the seven named working-tree
  stage files differ from `HEAD`—lexer, type-checker, effect-checker,
  governance-verifier, GIR emitter and runtime; parser is clean. The current
  `type-checker.ts` and `wat-emitter.ts` are also dirty. Thus the parser-labeled
  output is not an independent unchanged-source control: its `stageSource()`
  input still includes the shared lexer, and current compiler sources affect
  every stage render.
- `stageSource()` deliberately supplies the same lexer+parser source to both
  lexer and parser labels; their equal hashes are expected by the current test
  harness. The committed lexer from `HEAD` is refused by the current compiler
  with `FUNGI-TYPE-002`; the working lexer with four explicit `Token`
  annotations is accepted. Re-rendering all seven stage sources from the
  Q5n pin-introduction commit with the current compiler also refuses each stage
  with `FUNGI-TYPE-002`.
- Reproduced all seven historical values in a disposable extracted snapshot of
  `05eb5c29be9592a42cdd48baaeb027279ff5299d`, using that commit's compiler
  source and `package-lock.json`; the focused hash assertion passed 1/1 and
  verified every stage hash/length. WSL2 kernel was
  `6.18.40.1-microsoft-standard-WSL2`, Node `v24.21.0`, npm `11.19.0`, and
  TypeScript `5.9.3`. Built `dist/index.js` SHA-256:
  `A115A87FE052487209C8C98026145077CF3E5DD24A628C696D91DD74531044F1`.
  The package build's final build-evidence script refused because the
  disposable archive has no `.git`; no real-checkout Git authority was supplied.
  TypeScript compilation and hallmark generation had succeeded before that
  refusal, and the isolated focused pin test passed afterward. Full archive,
  dependency archive, registry archive, compiler lock and registry hashes are
  retained in `outputs/galerina-q5n-historical-pin-reproduction-20261012.md`
  (SHA-256 `C9AD2E770929BC71385524420DCDCD073C64BA62CC7B6720DC12204DD6BE52F4`).
  No permanent worktree was added and the active integration checkout was not
  changed by the replay.
- SuperGrok response `2bf96635-4acb-4ac4-8520-b7f6112b3120` in conversation
  `6fcb5b44-1422-438b-bd23-72a325da8c70` is advisory and based on supplied
  measurements. It recommends preserving the historical pins separately from
  any current-source baseline, then comparing one unchanged stage against its
  historical output and localizing the lexer delta. Exact prompt and response
  are retained in task outputs; prompt SHA-256
  `806598C90DF82B23BC1AC7835875A8606143671BE42860C9343E763AB0DAEDCD`, reply
  SHA-256 `0A6B834E6379B6D9FA9C1818549C23C5165F2FE6E03CAABACA2EF3D4AD777967`.
- Astra adjudication of the initial packet is retained at
  `outputs/astra-q5n-stage-drift-adjudication-20261012.md`, SHA-256
  `4900A0A8D7E531884E127ABD482E748B3FBD6BA2BB4F164D8AB7E471325A1596`.
  The follow-up (submission `01a12f44-f8f6-7d91-bd22-c74ca2ebe6d1`) returns
  PASS for historical reproduction and for treating the Git-dependent build
  evidence refusal as non-material to the focused hash assertion. It explicitly
  leaves current-output attribution open. A simple “one unchanged stage”
  comparison is insufficient here; source identity and compiler identity need
  to be varied in a controlled historical/current matrix, with the shared
  lexer+parser input accounted for.
- Disposition: do not change the expected hashes yet. Recover or reproduce
  Q5n-B values remain immutable and historically reproducible. Keep the current
  seven-output drift as a distinct unresolved compiler/source-baseline change;
  do not rebaseline until a separate current-source regression and explicit
  review exist. Astra follow-up submission
  `01a12f44-f8f6-7d91-bd22-c74ca2ebe6d1` independently adjudicated the replay
  receipt PASS for historical-pin reproduction. Current-output attribution
  remains unresolved. This is `.fungi` compiler/bootstrap evidence only, not
  runtime/FFI/host guarantees or RD closure.

### Live integration checkout custody refresh — 2026-10-12

- Revalidated the designated integration checkout without fetching or changing
  refs: branch `main`, HEAD
  `59b23502fee2fdb4b5ae2bbdb6ac1ed4bc8b8e04`; live `origin/main` from
  `git ls-remote` is `44a26cb22a362638a6cf106d05bd9d09e57f6821`. Local `main`
  is three commits ahead and zero behind. The prior three commits are compiler
  test Git-environment isolation and exact Int64 callback coverage; they are
  already committed on this local main, not evidence that the remaining dirty
  changes are integrated.
- The worktree has 100 porcelain entries: 11 staged, 87 unstaged, 5 untracked,
  with 3 staged/unstaged overlaps and no unmerged paths. The staged path set is
  limited to compiler CLI/shim tests, WAT option/string-lifetime tests, an
  RD-0873 artifact-generator test, and two WAMR import-probe fixtures. The
  untracked paths are `.mycoignore`, two reports, the RD-0873 generator, and
  the WAMR externref-result probe. This inventory is a snapshot; inspect exact
  staged and working diffs again before any commit.
- The repository currently has 18 registered worktrees and 33 local branches.
  Several are explicitly locked for preservation; no checkout or branch was
  removed. This confirms consolidation is not complete, and locked historical
  work must be reconciled before retirement.
- Corrected the Q5n section above against the retained Astra report: follow-up
  submission `01a12f44-f8f6-7d91-bd22-c74ca2ebe6d1` returned PASS for historical
  pin reproduction. Current-source attribution remains unresolved. The report
  SHA-256 is `4900A0A8D7E531884E127ABD482E748B3FBD6BA2BB4F164D8AB7E471325A1596`.
- Anti-Drift over `docs/` exited 0 after the correction; `git diff --check` for
  this ledger section reports no whitespace errors (Git emits only its
  configured LF-to-CRLF notice). No tests, GitHub Actions/CI, staging, commit,
  push, merge, branch switch or worktree cleanup occurred in this refresh.

### Compiler refusal/parity focused verification — 2026-10-12

- At the same source point (`main` HEAD `59b23502fee2fdb4b5ae2bbdb6ac1ed4bc8b8e04`
  plus the current working-tree overlay), `npm run build` passed in WSL. The
  WSL toolchain reported Node `v24.21.0` and npm `11.19.0`; TypeScript
  compilation, Hallmark generation and Git-bound build-evidence generation all
  completed. The generated `dist` output is ignored and is not proposed for Git.
- The bounded compiler test group passed in WSL: 45/45, zero failures, zero
  skips. Native Windows ran the identical five-file group: 42 passed, zero
  failures, three platform-gated cases skipped. Covered files were
  `tests/cli-wasm-assembly-refusal.test.mjs`,
  `tests/self-hosted-schema-typecheck.test.mjs`,
  `tests/rd0873-artifact-generator.test.mjs`,
  `tests/wat-option-equality-parity.test.mjs`, and
  `tests/wat-runtime-string-lifetime.test.mjs`, using
  `--import ./scripts/isolate-test-git-environment.mjs` and clearing inherited
  `GIT_DIR`/`GIT_WORK_TREE` in WSL.
- Exact tested source hashes: `src/cli.ts`
  `175B3EF14D6ADE8C22DD942B41FEA812E51F91E880CB690B0AF2A772FA5986F5`,
  `src/node-fs-shim.d.ts`
  `D73EF60E7E0FCC204F915381E975F8C8BCF80BA5AA75B5552DFD92410E9F3D81`;
  CLI test `DC8ED65246A58CE9C39C3DD20EA430350A21315E50AD989783FF91825BBD0F46`,
  schema test `19B121968DCFBA04935569CAE9ED204D49E56E032BD3101CCA5F2008A495ADB8`,
  artifact test `E5E39280FDA3A48A1B02E5C10DB4D88332039F996837E98BA6FA5ECDE79B9BBF`,
  Option equality test `BD7CC21654590846CF2D64C7A8E04F90024BD5AB5F0F88FAC71AD5B7D0CA1DE1`,
  string lifetime test `82503036F824CD9328A0B9BAF1D2DFEA6CC3DAE1965E2F6D6867129D49560D44`.
- Built `dist/index.js` SHA-256 is
  `28E6C7222CAA690CBD933C5B4887F01E854F68DFDB48A9C44CDD7BA08FCFAA9B`;
  `dist/cli.js` is
  `4E9AA241BA30875F3032D48FB93DF03BED8448475872526AB644778C8F33C519`;
  build-evidence JSON is
  `9DD3974177ED48D79ECC253A1D081110FCF952D84021BD443799E0C03F08D628`.
- This is compiler/bootstrap plus JavaScript WebAssembly-engine evidence for
  the named tests only. The full compiler suite and Q5n seven-stage historical
  pin test remain unresolved; this verification does not establish Fungi
  runtime, native FFI/WAMR, production-host, protected-byte or RD guarantees.
  No source was edited by the build or test run; no GitHub Actions/CI ran.

### Q5n two-axis source/compiler attribution — 2026-10-12

- Replayed all seven frozen Q5n-B outputs across historical/current stage
  sources and historical/current compiler builds. The retained machine report
  is `galerina-q5n-wat-2x2-custody-20261012.json`, SHA-256
  `437B29C5006905A3202F03D8A6DD067AD20B443E87041EB5C7E8E24ED22E9D55`;
  its harness is `q5n-wat-2x2-custody-probe.mjs`, SHA-256
  `DCA85A4A5C29C38C1C2472E63DC814FFB3F9924DD66792968437900574A95178`.
- Historical source plus historical compiler reproduced all seven recorded
  pins exactly. The seven source files were byte-verified against commit
  `05eb5c29be9592a42cdd48baaeb027279ff5299d`. Caveat: the historical
  `dist/index.js` used for replay was an extracted artifact, not a tracked blob
  in that commit, so the source pin is verified but the old compiler binary's
  exact build provenance is not.
- Holding the historical compiler fixed while switching to current source
  preserved the lexer, parser and GIR-emitter pins; type-checker,
  effect-checker, governance-verifier and runtime output differed. Holding
  current source fixed while switching compiler builds changed all seven
  outputs. These establish two independent axes of output drift, not which
  individual edits caused every byte difference.
- Historical source with the current compiler refused all seven stages before
  WAT generation (`FUNGI-TYPE-002`), including declared `Array<Token>` mutable
  bindings and several `Array<Auto>` diagnostic/GIR/binding values. This cell
  is a compatibility/refusal result, not a WAT comparison; do not infer codegen
  drift from absent output.
- The first-difference report is
  `galerina-q5n-wat-first-differences-20261012.json`, SHA-256
  `BF54BFDBFC21A95C231E5D7ACFDE57EABEB8F686B9E8C59A6D77C32F6969E99B`.
  Its first textual differences are locations for follow-up, not causal proof.
  In the emitter, the current compiler adds the typed
  `__array_get_option_string_v2` host import; source paths call it for
  `Array<String>.get`, `.first` and `.last` Option access. Current source edits
  also explain why the old source is rejected by today's stricter checker.
- A bounded WABT artifact-level isolation probe confirms the import is used:
  removing only its declaration from the current lexer-stage WAT leaves nine
  unresolved references and makes the baseline-valid module fail parsing.
  The report is outside this repository at
  `outputs/q5n-emitter-import-probe-report-20261012.md`, SHA-256
  `9113B799B6B9F5AE891D4F1914BFEABD0FEA82EFBE4877FD1FE35F41C30BBA3E`.
  This establishes necessity for those generated calls, not correctness of the
  host implementation or semantics; the emitter source was not rebuilt in an
  import-removed variant.
- For the type-checker source-axis difference, the current `.fungi` source
  defines `appendDiagnostics` at line 381 and calls it while combining typed
  diagnostic arrays. The current-source/historical-compiler WAT contains the
  corresponding `$appendDiagnostics` function beginning at line 8850, with
  typed-array loop, `get`, `match`, and append structure. This strengthens the
  source-to-output correspondence for that function only; it does not establish
  semantic equivalence or correctness of the broader changed stage.
- SuperGrok's bounded advisory response is reply
  `e034994f-ffef-437b-be7c-6c0be0fa5a04` (observed 2026-10-12T09:00:32Z),
  retained outside this repository as
  `supergrok-q5n-matrix-reply-20261012.md`, SHA-256
  `0CFC66D87DD0FA89C4762A14D81A150B9C4B1BE8C4F6FE71E3083AA22590C17D`.
  It recommended retaining historical pins and not rebaselining from a dirty
  candidate; it did not inspect source or execute the replay. The exact prompt
  hash is `73DAF7057F4B47C4608E672484A50FBA450CBC094031D7320D98043ECFD12427`.
- Independent Astra adjudication of the new matrix and bounded SuperGrok
  claims was submitted to the existing Astra worker as
  `01a12f5c-607f-7c00-a079-2b6c705696ff`; it returned PARTIAL attribution,
  PASS on the bounded test architecture, and PARTIAL first-difference
  attribution. The retained report is outside this repository at
  `outputs/astra-q5n-matrix-adjudication-20261012.md`, SHA-256
  `30044E8F2C6B83F971AB5A17B7DCB36F503C12E51C7C4025CB14AEB339B866C2`.
  Astra did not rerun the matrix or rehash every artifact; its adjudication is
  independent reasoning over supplied evidence, not compiler/runtime proof.
- Disposition: preserve all seven historical expected digests. Do not update
  them from the dirty current tree. A separate current-baseline regression
  needs a reviewed, reproducible compiler/source identity and deliberate
  acceptance criteria. The existing Q5n test's combined lexer/parser source
  input also means its parser output is not an independent source control.
  The WSL replay cleared inherited `GIT_DIR` and `GIT_WORK_TREE`; it changed no
  source, test, pin, stage state, Git ref or index. No GitHub Actions/CI ran.
- The source/output investigation's matching focused type-checker suite passed
  on both WSL Ubuntu (Node `v22.22.1`) and native Windows (Node `v24.18.0`):
  85/85 on each, zero failures or skips. Test file SHA-256 is
  `9028FEDF87E859EE55D608858C8ED4F503AF718B321FE4D0B6B19D3CF46BF0E6`;
  current `.fungi` type-checker source SHA-256 is
  `A117AA248D0830D385EA68A94B80164E09DB21CC3DD51C602694FB60F94C2224`.
  These are bootstrap/source tests, not independent proof of the emitted
  function's semantic equivalence or runtime behavior. Both runs isolated Git
  routing variables; no GitHub Actions/CI ran.
- The changed WASM runtime implementation and its focused snapshot/ownership
  tests also passed on WSL Ubuntu and native Windows: 72/72 on each, zero
  failures or skips. Runtime source SHA-256 is
  `2CD064A1A30FFEB64B7D3042E00EF010CD35ADE43F632EB791874A5FF5A1D08E` and
  test SHA-256 is
  `6A5F4FA783AB75337C4FF2F4DCF0C7D39279CC9640B9ED8712084DCED7B71B0E`.
  Included test asserts that `Array<String>` Option access returns a stable
  payload snapshot after the original seed slot is changed, returns None for
  an out-of-range valid array, and refuses an unknown handle. This is host
  runtime TypeScript evidence for this adapter only; it does not prove Fungi
  language-wide ownership or production-host security. Both runs removed
  `GIT_DIR` and `GIT_WORK_TREE`; no GitHub Actions/CI ran.
- Independent Astra review of this exact runtime patch was queued to the same
  existing worker as submission `01a12f61-a436-7ba0-83c8-1e17a813dea1`; result
  is pending. The requested scope is host-import/admission lifecycle, callback
  re-entry, Option/String snapshot ownership, test coverage and integration
  risk. The test pass is not independent review or production evidence.

### Parked WAT worktree triage — 2026-10-12

- Live registry identifies clean worktree
  `.worktrees/grok-baseline-05eb5c29-20261002` on
  `grok/wat-parked-memory-20261002`, HEAD
  `1ea29bd2b53d47f8923f5e7d39d6413e5bdd4971`; no lock metadata was reported.
  The checkout is clean. Against current local `main` HEAD
  `59b23502fee2fdb4b5ae2bbdb6ac1ed4bc8b8e04`, it has eight commits not
  patch-equivalent to `main` and is 562 commits behind / 8 ahead by ancestry.
- Those commits mix D4 in-Wasm pattern matching, D8 WASM effect grants,
  ZipPair lowering, provisional Float32/Float16 rounding, symbol-usage tooling
  and audit changes. Their merge-base diff touches 35 paths. All 35 paths
  exist in current `main`; 17 committed blobs match byte-for-byte and 18
  differ. Thus this is neither a wholesale-merge candidate nor a disposable
  branch based on path presence alone. The differing files need feature-level
  and dirty-overlay comparison; no branch/worktree or file was changed.

### AGENTS Git-aware Myco refresh of Galerina custody — 2026-10-12

- Ran the AGENTS-owned `tools/myco-hypha-worktree-scan.mjs` in registered-worktree
  mode against Galerina. The snapshot discovered 18 registered worktrees and
  reported 18 local branches outside that registered-worktree scope. A separate
  live Git count confirmed 33 local branches total, 18 registered worktrees,
  10 locked worktrees and zero prunable worktrees. No refs or worktree
  registrations were changed.
- The worktree snapshot captured Git metadata for all 18 entries, but Myco's
  content query completed for only six (`UNKNOWN`, because the tool uses
  `--no-refresh`) and refused 12 with `ENGINE_RESULT_REFUSED`. A read-only
  check found `.myco/index.json` in exactly six registered worktrees and absent
  from the other 12. A direct no-refresh query in the WAT integration donor
  returned `myco: no index yet`; the refusal is expected and must not be
  mistaken for a negative search result. No donor index was created or
  refreshed.
- Report digest: `49b1d90e68e0639037e9fe35b878131faa74db67f98506f3b004675d3065a8ce`;
  captured-state digest: `1d944e62f18edd549ebca9b610382edf8e26c5116bcfb56eb7f28ad706bd3149`.
  The report is snapshot-only and non-authorizing; it does not disposition any
  branch or worktree.
- The selected primary checkout remains detached at `9a26c71e60e491766ef351d0efe0405b0739c1b6`
  and dirty. The separate integration checkout remains on `main` at
  `facaa24de57ee75f5bde51795b824300eb43a755`, equal to its local
  `origin/main` ref and heavily dirty (101 porcelain entries, including staged,
  unstaged and untracked layers). Preserve these layers and the ten locked
  worktrees; continue one donor/path group at a time. No GitHub Actions/CI ran.

### Fresh source-bound I2/I3 candidate tests — 2026-10-12

- Rebuilt the retained `grok/wat-integration-candidate-20261003` compiler from
  its current dirty source with native Windows TypeScript, then ran
  `tests/interpreter-i2-i3.test.mjs`: 64/64 passed, zero skipped. Repeated that
  same focused suite in WSL with process-local Git path mapping: 64/64 passed,
  zero skipped. The previous ledger warning that these results were unbound to
  the dirty candidate source is superseded by these fresh-build runs.
- The tests exercise the candidate's TypeScript interpreter/bootstrap I2/I3
  behavior and explicit WAT refusal. They do not demonstrate compiled-WAT I2/I3
  execution, Fungi-native runtime/FFI/host enforcement, or end-to-end memory
  guarantees. The candidate's three existing dirty paths remain unchanged; no
  candidate source, ref, worktree, or ignored output was integrated or removed.
- The focused test result is evidence to continue exact-path review, not a
  disposition of this highly divergent composite branch or its unrelated
  staged/history/ignored content. No GitHub Actions/CI ran.

### Current integration-checkout runtime verification — 2026-10-12

- Revalidated the current integration checkout at `4792af6939a53d491547eb0db36c612cdb7ee4e8`
  on local `main` (tracking ref `origin/main`; no fetch was performed). The
  checkout remains dirty across 109 tracked paths and seven untracked paths;
  11 tracked paths are staged and 101 have unstaged changes, with three paths in
  both layers. No source, stage, ref, index, or worktree registration was
  changed by these verification runs.
- In `packages-ts/galerina-core-runtime-wasm`, native Windows Node `v24.18.0`
  and WSL Node `v24.21.0` each passed `npm run typecheck`, `npm run build`,
  and the complete package test set: 118/118, zero failures, skips, or todos.
  Both test processes ran with `GIT_DIR` and `GIT_WORK_TREE` unset. No
  GitHub Actions/CI ran.
- Source/test SHA-256 values at verification time:
  `src/wasm-runtime.ts` `74D2D5E45C1073D923E8EF83082DA3D26C24F48D96BB508AAA0CEB93F57C4C8C`;
  `src/seam-adapters.ts` `19E8079E244C29FE7E220B52F3798478CB151345A0F150E3A140086DF745D320`;
  `tests/wasm-runtime.test.mjs` `795A93659CE4839A65E3ACBE6A4A33607AF766625621C0FA54AC8695E8FC622B`;
  `tests/seam-adapters.test.mjs` `8B4902F18A93C8DBE38A9299F748DA23F254173EACB0605D95741F1FD9BDE241`.
- This is bounded TypeScript-host/WebAssembly-engine evidence for the current
  dirty package snapshot. It does not establish Fungi language semantics,
  native WAMR behavior, FFI/host production guarantees, or RD-1413/1414/1415
  closure. The existing static-name collision decision and independent Astra
  review remain separate open items; do not treat these package passes as
  integration or merge approval.

### WASM adapter delta review and ABI policy — 2026-10-12

- The existing Grok.com conversation supplied SuperGrok response
  `e9634e5d-ce04-4d82-840c-a8a68997b7d2`, captured SHA-256
  `9843470F06068CAF6DFA4B416904F08E3E2F1C71A1D87D37947FFD0DE4D2D0DE`.
  Astra reviewer `01a12fd6-e0ef-74d2-bbd0-3aa0775fec94` returned bounded
  adjudication submission `01a13052-3979-7cf3-b011-f5042b18a498`. Prompt
  SHA-256: `69AAFA7DE55D6B85503C5EEAA852DE5EB23B371AAD4B7B42C277DF4ACBF9F78F`;
  reply SHA-256: `1F3329447A13FE9797B745D49EF5FF84958B3A809D0814D535AFC21813C86A9D`.
  Astra reported no exposed completion timestamp/model metadata and ran no tests.
- The reviewed source hashes still match the current integration checkout:
  `wasm-runtime.ts` `74D2D5E45C1073D923E8EF83082DA3D26C24F48D96BB508AAA0CEB93F57C4C8C`;
  `seam-adapters.ts` `19E8079E244C29FE7E220B52F3798478CB151345A0F150E3A140086DF745D320`;
  `seam-adapters.test.mjs` `8B4902F18A93C8DBE38A9299F748DA23F254173EACB0605D95741F1FD9BDE241`.
  Current HEAD is `4792af6939a53d491547eb0db36c612cdb7ee4e8`; the review's
  packet named an earlier integration HEAD, so only matching source bytes—not
  commit identity—carry forward.
- Astra upheld the bounded export-name identity and revoked-Proxy repairs;
  those conclusions do not cover all parser/adapter paths. It confirmed that
  finite JS numbers are not checked for Wasm-type representability before the
  engine applies `i32`/`f32` conversions. The correct intended policy is
  **NOT_VERIFIABLE** from the inspected package README, relevant TODO/roadmap
  passages and adapter tests. A checked TODO elsewhere about ToInt32 belongs
  to a distinct bridge-result contract and is not this adapter's ruling.
- Owner choice requested: refuse lossy numeric conversions (recommended for
  the security boundary) or explicitly preserve WebAssembly coercions and bind
  the normalized guest values. Until decided, do not change the public ABI or
  claim exact argument-value preservation. The local Windows and WSL
  typecheck/build/package-test runs at these source hashes independently pass
  118/118; Astra's report did not execute them.
- This remains Node/WebAssembly-engine bootstrap evidence. It establishes no
  Fungi language policy, native/WAMR behavior, FFI/host production guarantee,
  physical erasure, deployment readiness or RD-1413/1414/1415 closure.

### Pure-flow cache admission and owned-copy boundary — 2026-10-12

- Reverified the reused integration checkout at `4792af6939a53d491547eb0db36c612cdb7ee4e8`
  on `main`, equal to its locally recorded `origin/main` ref. The shared checkout
  remains dirty with 118 porcelain entries across staged, unstaged and untracked
  layers; preserve all unrelated paths and existing stage state.
- A focused public-API probe found that `setCachedPureFlow` copied admitted values
  through ordinary typed-array iteration, `Array.map`, `Map` iteration and object
  spread. Five red tests reproduced accessor execution for a byte iterator, a list
  `map`, a record iterator, unrelated scalar metadata and the top-level `__tag`.
- The working patch now validates a candidate value through the bounded exact
  encoder before insertion and structurally copies only own data fields, using
  captured Map intrinsics and bounded indexed array/byte reads. Invalid host
  values fail closed; reads of cached values return another owned copy. Source
  `packages-ts/galerina-core-compiler/src/pure-flow-cache.ts` SHA-256 is
  `CCAF8995F84E000DE95D6FA6D4930D9603263F9614C0A06ABFE4EDE855D5D5C7`;
  `packages-ts/galerina-core-compiler/tests/pure-flow-cache-identity.test.mjs`
  SHA-256 is
  `6125729819FCF66117AE24FB9908F67F590389202F719C98156FD94868B58EE8`.
- Fresh compiler builds and the focused cache suite pass on native Windows and
  WSL: 23/23 each. The four-file cache/interpreter regression batch passes
  222/222 on each platform. `git diff --check` reports no whitespace defects;
  only configured LF/CRLF warnings remain. No GitHub Actions/CI ran.
- Astra reviewer `01a12fd6-e0ef-74d2-bbd0-3aa0775fec94` has the exact current
  two-file hashes for bounded admission/copy-boundary review (submission
  `01a13174-ff64-79e3-8547-8971e19e3364`); response pending.
  Grok-Bot update `codex-grok-bot-galerina-interpreter-cache-delta-update-20261012-05`
  was delivered to the existing review route with the same hashes (envelope
  SHA-256 `5306F04936BAC491EC8823D59AAB6B2192FAFAF34AF1B2BDA4ECAEACDE624B65`);
  no matching reply was present in the outbox at the last check, and delivery
  is not evidence of pickup.
- This is TypeScript/bootstrap source and test evidence only. It proves no
  `.fungi` runtime, FFI/host guarantee or end-to-end memory security, and closes
  no RD. No files were staged or committed; do not integrate this shared dirty
  checkout until exact-path custody, independent review and broader eligible
  work are reconciled.

### WAMR import-result contract donor comparison — 2026-10-13

- Reopened the integration checkout at `823c8bc30c34a354e033f597f6477d258e0de488`
  and donor `codex/memory-current-main-20261008` at
  `34b419057de49b6437d0b3b9423f3f2bfb205970`. The donor admission source is
  staged and further modified: its index blob is
  `1c09b724837d623b7e0a39b7508f0db3cf66b8ae`, and its working blob is
  `e06ca1bbd71ceb8562891be6f2a37e5c90fd00f8`. The integration working source
  is SHA-256 `FD6A19E36758E7359375C4EBF6C8117667B168827DF968D5D1ADEFD745EDD15D`.
  Donor stage and worktree layers were inspected but not changed.
- Exact source comparison found the donor's working validator accepts
  `WASM_V128` and `WASM_EXTERNREF` as function result kinds. The integration
  validator rejects both as unsupported; its WAMR probe includes negative
  controls for those contract kinds and a real `externref` result module whose
  import must be classified as a signature mismatch before instantiation.
  Therefore the donor file is not eligible for wholesale port: it weakens the
  current result-ABI refusal contract. This disposition applies only to this
  file and these checked controls, not to the donor's other staged or dirty
  paths.
- Ran the integration runner in WSL with inherited `GIT_DIR`, `GIT_WORK_TREE`
  and `GIT_INDEX_FILE` removed and the documented WAMR 2.4.5 SDK selected. The
  runner's pinned SDK/toolchain checks passed. All printed controls passed:
  invalid value-kind and unsupported-result refusal; pre-instantiation
  signature-mismatch refusal; closed allowlist/non-function/duplicate-import/
  unlinked-import refusal; per-instance context isolation and fail-closed
  callback cases; `externref` mismatch classification; exact and oversized
  input bounds; and runtime-init/registration cleanup ordering. The SDK pins,
  WAT fixtures and runner are bound to the invocation by the runner's hash
  checks; source hashes for the C probe, `externref` WAT and runner are
  respectively `2677B47FE8EEFC95AA230CCD04314CE74E598D97DBBAC1281C2C05EC05C881E1`,
  `060A2AED2A5D0BAFCA5FDA55C101E533641DF473792E1981A93F63B0C6462006`, and
  `8944997CB828D729490100934D67EB03495183E9C3571EBB7A7B7711AA1AE4C6`.
- Scope limit: this is a pinned Linux WAMR host-admission probe, not proof of
  Fungi language semantics, secret-byte wipe, Windows enforcement, or the
  composed `/auth/verify` operation. No GitHub Actions/CI ran. No files were
  staged, committed, pushed, merged, or retired. The integration checkout still
  has 122 porcelain entries; preserve all layers and continue serial review of
  the remaining donor paths.

### Galerina TODO cross-repository link repair — 2026-10-13

- Reopened the integration candidate at `823c8bc30c34a354e033f597f6477d258e0de488`
  and the SLIDE `main` checkout at `514737141a16db521d07bdf355b8e3af1b36b192`,
  equal to its `origin/main` ref. Replaced resolvable legacy
  `triLowLevel-v2`/sibling paths in `docs/TODO.md` with links pinned to that
  verified SLIDE commit. All 34 pinned SLIDE links in the TODO resolve to Git
  tree objects at that commit. The remaining `../SLIDE` exact file/directory
  references resolve in both the checked tree and local checkout; each of the
  six `results/*-latest.*` patterns has three tracked matches.
- Two legacy artifact names—`15-EXECUTABLE-GIR-V1.md` and
  `18-R1-REGISTRY-V1.md`—are absent from the verified SLIDE main tree. They are
  now identified as unresolved historical locators; no replacement document
  was inferred. The memory contract link in the 2026-10-06 checkpoint report
  is pinned to the same verified SLIDE commit.
- AGENTS Anti-Drift self-test passed 71/71. The Galerina `docs/` scan still
  reports 14 other drifting documents (15 missing-file findings and 3
  duplicate blocks); the repaired checkpoint link is no longer among them.
  Those unrelated findings remain for separate source-by-source disposition.
  No GitHub Actions/CI ran. No paths were staged or committed; the integration
  checkout remains dirty and must not be published as a whole.

### Galerina legacy triLowLevel-v2 locator correction — 2026-10-13

- A follow-up source check found four additional `docs/TODO.md` references to
  the absent `../triLowLevel-v2` checkout. The historical owner-decision file,
  R1 executable-GIR draft, frontend-receipt proposal and first-vertical-slice
  owner record were not found in the locations searched; this is bounded
  evidence, not a claim that no copy exists anywhere. The TODO now marks the
  three unrecovered decision/draft records open rather than presenting them as
  available.
- SLIDE's current `QUESTIONS-FOR-OWNER.md`, V2 general executable-GIR successor
  and V2-E frontend-receipt contract were verified at SLIDE `main` and its
  matching `origin/main` commit `514737141a16db521d07bdf355b8e3af1b36b192`.
  They are linked only as related/current artifacts, not asserted to reproduce
  the missing historical records. The first vertical-slice probe report was
  verified at Galerina commit `9a26c71e60e491766ef351d0efe0405b0739c1b6`,
  reachable from `origin/grok/roadmap-todo-refresh-20261006`; it is cited as
  probe evidence, not owner-confirmation evidence.
- This corrects the preceding link-repair entry's incomplete locator accounting.
  No source behavior changed; no paths were staged or committed, and no CI ran.

### Current-head VOK secret-arena donor reconciliation — 2026-10-13

- Reopened integration `main` at `823c8bc30c34a354e033f597f6477d258e0de488`
  and the `memory-current-main-20261008` donor without changing either. The
  integration arena implementation and two test files are clean relative to
  HEAD. Their working SHA-256 values are `AE9F1EB85086FC40F8BBEA0B2A287855A59377CE1148D9E7D57DDA3DB13E5BB5`
  (`src/secret_arena.rs`), `90DBACA8440FB9654DB3CDFBFB7B0031D22C7F4F70DEF6AE149D9609D51025AB`
  (`src/tests.rs`), and `59906E96C86E18BC5E71BBA6913C6A67AE6F2BA7386E18C22E03AA860E1FF703`
  (`tests/secret_arena.rs`). Donor index blobs are respectively
  `2568f84e66d3bcf447fff5689eb0b7298a3868bc`,
  `cf8d83ecf2dc2bdd346a04a50e5e06c5e04a687b`, and
  `a5b57fec5f0a65fd7ac4189fff9614ad30c170f4`; donor working SHA-256 values
  are `5FDABF5FDBC1E57292421C26ECFD768E52B717EF209BFD462A518DF22D27480F`,
  `1014BE0CE8A6B697AE619B74681D4F2BC740E8E93CF815F0D468277AEBC0AB81`, and
  `808619EE37304C58CD0B8E1E541122D91CDE563D87565D5365D365250949FC5B`.
- Direct source comparison confirms the integration already has canonical
  `ERR_SECRET_ARENA_*` metadata and sticky cleanup-failure refusal after a
  successful retry. Its public integration test also preserves established
  `SECRET_ARENA_*` display identifiers. The donor's staged arena changes those
  display strings to `ERR_SECRET_ARENA_*`, so do not port its three-file arena
  set wholesale. This only dispositions the inspected arena and its two test
  files; other donor overlays remain open.
- Separate comparison of the donor's final staged/working layer confirms the
  same result: it removes `#[allow(dead_code)]` from the in-crate byte callback,
  narrows shared test-helper visibility, and deletes the integration test that
  locks the consumer-facing error strings. These are not cleanup semantics
  missing from integration; the final donor overlay would weaken compatibility
  and sibling-test access.
- On the current integration source, the focused `cargo test --offline --locked
  --manifest-path packages-ts/galerina-core-runtime/native/vok-authority/Cargo.toml
  secret_arena -- --nocapture` passed 6 matching tests on native Windows and
  6 matching tests on WSL (three unit and three integration tests; WSL also
  reported seven unrelated target-specific tests ignored). Explicitly ran two
  synthetic-data WSL tests normally ignored by the suite:
  `cleanup_observes_zero_bytes_before_unmapping_the_real_mapping` passed 1/1,
  and `secret_arena_owned_copy_survives_arena_cleanup` passed 1/1.
- The WSL live mapping check proves the arena region is read back as zero before
  it is unmapped on this host. The copy-survival test separately proves that a
  `Vec<u8>` deliberately made by the in-crate callback remains after arena
  cleanup. `with_bytes_mut` is crate-private and currently has test/doc callers,
  not a production protected-operation caller; its callback is a trust boundary,
  not a mechanism that prevents same-crate code from copying. This remains a
  concrete integration/TCB gap, not a closed RD or `/auth/verify` proof. The
  codebase-graph routing probe returned `REFUSED` because it could not resolve
  this checkout; graph results were therefore treated as unverified, and the
  caller check used exact Git/source search only.
- No donor bytes were copied, no staged layer changed, and no GitHub Actions/CI
  ran. The Linux mapping checks are scoped host evidence; they do not prove
  `.fungi` ownership/effects or end-to-end application behavior.

### Secrets-vault donor slice reconciliation — 2026-10-13

- Compared the staged `memory-current-main-20261008` vault slice with the
  integration candidate at `823c8bc30c34a354e033f597f6477d258e0de488`.
  Four donor index blobs already equal the integration `HEAD` blobs:
  `packages-ts/galerina-ext-secrets-vault/package.json`
  (`f5ee783e6ccab25bad51d59039b54c07c5066ea6`), the package's
  `src/self-hosted/secrets-gateway-wit.fungi`
  (`6556f8a50993c692d4db323ce8d41b137bc83219`), `src/types.ts`
  (`4e7402db093a6a49f4e179d3726f4c5d88ef1fbb`), and the product-path Fungi
  mirror (`0fd60ffa2dff8c714c798508771905a8d1c3df8f`). They are already
  present in this candidate; copying them would be redundant.
- Two donor overlays do not match integration. The donor generator
  (`239be897882ea6d73d0c5d3a02a1454692ef122d`) imports compiled `dist/types.js`
  rather than validating and reading the source declaration; the integration
  generator (`84af5291b0cc8f367025dc993418a819b0ea1ecc`) retains source-AST
  validation, so the donor change weakens source-to-generated provenance.
  The donor test (`f3fa50a5a0806e6795b7cef6ea278a144c29d322`) removes four
  source-bound controls present in the integration version
  (`58e842ed2f4be4478dac50e4bdb960b924690285`), including stale-dist detection,
  duplicate/mutable declaration refusal and adversarial structural binding
  checks. Do not port either donor overlay as-is.
- This dispositions only these six vault paths, not the donor's compiler,
  auth-route, WASM-grant, WAMR, staged, unstaged or untracked work elsewhere.
  The WIT text remains a non-authorizing interface candidate; its matching
  mirrors and source tests do not prove a loaded WIT consumer, Fungi runtime,
  protected `/auth/verify` operation or RD closure. Donor and integration
  trees remain unmodified by this comparison; no CI ran.

### Auth-route donor slice reconciliation — 2026-10-13

- Compared donor `codex/memory-current-main-20261008`'s staged route slice
  with integration `main` at `823c8bc30c34a354e033f597f6477d258e0de488`.
  Its `routeDispatcherService.fungi` index blob is
  `f4c472827adebe7af0aa545d13cc77fa9d8c72ae`; the integration HEAD blob is
  `580d7b7de232c2551974dde938f62eb6e3de3cf8`. Integration already has the
  typed `RouteDispatchResponse` record and routing result; the donor's
  remaining header/metadata change does not wire execution. The function
  resolves a route name, writes an audit event, then returns a record with
  `dispatched: true`; its only declared HTTP route is `POST /dispatch`. It
  does not call the resolved flow or establish a production `/auth/verify`
  operation. The current Deno adapter still returns HTTP 503 for
  `/auth/verify` (`Service bridge pending Phase 54`).
- The donor's staged replacement for
  `packages-ts/galerina-core-compiler/tests/rd1413-auth-route-candidate-strict.test.mjs`
  has blob `7133b65984b4449787af843316743bfc2bdec9f6`; current integration
  has `d9de53bd19fe73505d4f1c5455582abb4c17c40e`. The current test explicitly
  labels this legacy-CLI compatibility coverage, strips inherited `GIT_*`,
  `NODE_OPTIONS` and `NODE_PATH`, and bounds the subprocess. The donor removes
  those safeguards and renames the assertion as a strict check while invoking
  the same legacy `packages-ts/galerina-core/compiler/galerina.js` path. That
  CLI's `check` branch prints diagnostics and derives its exit status from
  them; it does not parse either `--strict-types` or `--strict-governance`.
  Therefore the donor test overstates what it verifies and regresses process
  isolation. Do not port it.
- A separate app-kernel strict-route test exists, but it proves only its own
  compiler diagnostic assertions. Neither test executes the protected
  provider-to-sink operation. This dispositions only the route dispatcher and
  this one test file; no donor files or stage entries were changed, and no
  GitHub Actions/CI ran.

### Current-head WASM admission and effect-grant verification — 2026-10-13

- Re-ran the focused suites against integration `main` at
  `823c8bc30c34a354e033f597f6477d258e0de488` after the WASM runtime and ABI
  tests changed beyond the older 2026-10-12 receipt. Current SHA-256 identities:
  `57FE846F35086EA39C21C068944CEA2F3B84AA285A35269708BF7269F6B7A8C1`
  (`packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`),
  `8D2DDBEB2B604B7E5FE568300655C871159C8719714135B49F9AAECD45155068`
  (`packages-ts/galerina-core-compiler/tests/wasm-effect-grant-abi.test.mjs`),
  and `A47E5B2FF88F0784F27F664D1344C278D679CB11E34F930E93FA05BAF5565EC4`
  (`packages-ts/galerina-core-compiler/tests/wasm-admission-gate.test.mjs`).
- The package-local TypeScript compiler completed in WSL without the inherited
  `GIT_DIR`, `GIT_WORK_TREE` or `GIT_INDEX_FILE` variables. Then
  `node --test tests/wasm-effect-grant-abi.test.mjs
  tests/wasm-admission-gate.test.mjs` passed **33/33** in WSL and **33/33**
  under native Windows against that build. The repository build wrapper was
  deliberately not run because its evidence writer could overwrite an already
  dirty tracked generated document. The ignored compiler `dist` output was
  copied to the task-workspace recovery area before compilation and verified
  byte-for-byte (312 files; 4,525,577 bytes); it is not a repository artifact.
- This is fresh compiler/bootstrap WebAssembly admission/effect-grant test
  evidence only. It does not prove `.fungi` source semantics, FFI/native or
  production-host enforcement, `/auth/verify` composition, protected-byte
  custody, or closure of RD-1413/1414/1415. No donor files were copied, no
  unrelated or pre-staged changes were altered, and no GitHub Actions/CI ran.

### WASM runtime accessor-hardening donor working-layer review — 2026-10-13

- At the same integration HEAD, the integration working source
  `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` has SHA-256
  `57FE846F35086EA39C21C068944CEA2F3B84AA285A35269708BF7269F6B7A8C1`;
  its focused `tests/wasm-runtime.test.mjs` has SHA-256
  `AF2F676AFA2310EBBF2856D34CA29E01BC0D15D2996FB2D5D76BE89AA3434BC1`.
  A package-local TypeScript build completed in WSL with inherited Git redirection
  variables unset. The full runtime test file then passed **103/103** in WSL
  and **103/103** under native Windows against that build.
- The integration source captures native WebAssembly.Memory and buffer
  accessors before guest/granted callbacks; its tests exercise callback-driven
  prototype replacement, snapshot copying, secret-result finalization and
  memory growth. Comparing the donor's **unstaged working layer** shows it
  removes those captured-accessor guards. That donor working file's SHA-256 is
  `008F9F158C9D5DBC24308EA9C0625B15E695220294BC1B515F65D3F882E867AA`; do
  not copy it over the tested integration source. The donor index is a separate
  layer (`cf1f517a6e64c9c056c7ef9431d91870aad990f2`) and remains unadjudicated;
  this finding is not a blanket disposition of the donor runtime file or branch.
- The ignored runtime `dist` output was copied before rebuilding to the
  task-workspace recovery area and verified byte-for-byte (10 files; 175,091
  bytes). The new tests are TypeScript/bootstrap WebAssembly-runtime evidence;
  they do not establish `.fungi` language enforcement, native FFI or production
  host guarantees, or the composed protected `/auth/verify` operation. No
  donor bytes or staged entries changed and no GitHub Actions/CI ran.

### WASM effect-grant staged donor source reconciliation — 2026-10-13

- The donor index version of
  `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` is blob
  `cf1f517a6e64c9c056c7ef9431d91870aad990f2`. It adds a closed non-secret
  effect-grant ABI and typed callback bridge. The integration working source
  already contains `WASM_EFFECT_GRANT_ABI` and `typeEffectGrantHandler`, plus
  captured primordial memory accessors and a `WeakMap` admission lifecycle;
  the donor staged version uses only a `WeakSet` factory marker. The donor's
  unchanged staged `wasm-runtime.test.mjs` contains none of the integration
  test names for callback-mutated memory accessors, snapshot escape, or
  secret-result finalization. The integration runtime suite passed 103/103 on
  both WSL and Windows as recorded above. Do not replace the newer integration
  implementation with the donor staged file.
- The donor's staged closed-effect-ABI idea is already represented; its older
  implementation does not supersede the integration lifecycle and hardening.
  This is a path-level source/test disposition only, not a full disposition of
  the donor's staged or working layers and not proof of Fungi, native-host,
  production, or RD guarantees. No donor state changed and no GitHub Actions/CI
  ran.

### Code-index real WASM grant source refusal — 2026-10-13

- Reproduced the current focused integration test at HEAD
  `823c8bc30c34a354e033f597f6477d258e0de488`:
  `node --test --test-name-pattern='real frozen Wasm grant owner'
  scripts/tests/code-index-generator.test.mjs` fails because the generated
  definition list is empty instead of containing
  `packages-ts/example/src/arbitrary-runtime.ts:575` for
  `FUNGI-WASM-GRANT-001`. Current SHA-256 values are
  `004D1A921D401E8CFF7B335A81C19F73FF01F4C0AAD2A4B69D5B0CEF59320F12`
  (`scripts/lib/diagnostic-object-occurrences.mjs`),
  `2A2D36AD119771A57A7FC9C6E67FE7BAD76083C05A4D2AAC43E9D4F5BE78D7CC`
  (`scripts/tests/code-index-generator.test.mjs`), and
  `57FE846F35086EA39C21C068944CEA2F3B84AA285A35269708BF7269F6B7A8C1`
  (`packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`).
- Source comparison narrows the conservative classifier refusal: its
  `ordinaryObject` whitelist does not admit the runtime's `Object.values`,
  `Object.assign`, or the data-only `Object.defineProperty(snapshot, key, …)`
  shape, so it declines all structural diagnostic exemptions in this source.
  Do not regenerate or bless code-index outputs while this real-source control
  fails. Next step is a red/green parser change admitting only exact inert
  shapes with controlled negative tests for getters, arbitrary descriptors,
  shadowing and mutation; no broad `Object.*` whitelist. This is a tooling
  coverage issue, not evidence that the runtime grant is absent or unsafe.
- No source, generated index, or donor state changed in this check; no CI ran.

### Q1 recursive-return cutoff status correction — 2026-10-13

- Integration checkout remains `main` at `823c8bc30c34a354e033f597f6477d258e0de488` with pre-existing staged, unstaged, untracked and ignored state; no branch/worktree topology changed. The compiler TODO now records that the 2026-09-22 “drops grandchild secrets” residual is superseded for the specifically tested finite recursive-return cases.
- Exact current working identities: `packages-ts/galerina-core-compiler/src/wat-emitter.ts` SHA-256 `B99E9A845944A5AB13D74E2039013A056A8FEBE1E2BDD8190DC4D225BFC93B7C`; `tests/q1-secret-return-value.test.mjs` SHA-256 `3095EBEE78E5D1EC5F890B1CFE560726D5B7737A37B10F177EF28137C962ABE4`; loaded ignored `dist/wat-emitter.js` SHA-256 `164BF199A8AA5DDE126E05343B6F785EDE59F18DC9EB644624E51A783A1FEA4A`.
- The focused Q1 test file passed **99/99** in WSL and **99/99** on native Windows. Controls show an omitted recursive grandchild yields `[0, 1, 7]`; a non-null child beyond the closed flatten plan traps instead of being silently truncated; partial flattened output is wiped without widening cleanup to an unrelated sentinel; maximum-depth null/non-null twins distinguish success from refusal. The WSL command unset inherited `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and `GIT_COMMON_DIR` and used the repository test-isolation preload.
- This run used the already-built ignored `dist`; no build was run. Evidence is for this compiler-to-WASM path only. Runtime cycle traversal, general recursive schema/ABI guarantees, clean-HEAD regression admission, Fungi/runtime/FFI/host guarantees, and RD closure remain unproved. No donor state, code source, generated index, commit, push, merge or GitHub Actions/CI changed.

### Code-index real WASM grant source refusal — resolution candidate — 2026-10-13

- Reproduced the refusal with a red control, then narrowed the source-AST
  classifier to the runtime's exact read-only `Object.hasOwn/is/keys/values`,
  null-prototype `Object.assign`, identity comparisons against
  `Object.prototype`, and locally owned null-record `defineProperty` shape.
  The latter requires one local `const` initialized by `Object.create(null)`,
  only its definition/freeze uses, and exactly a data `value` plus
  `enumerable: true` descriptor. Existing literal `cause` decoration remains
  separate. Arbitrary targets, aliases, extra descriptor fields, spreads,
  unsupported calls and mutation controls still refuse structural exemptions.
- The full `scripts/tests/code-index-generator.test.mjs` suite passed **73/73**
  on native Windows and **73/73** in WSL. The fixture runner strips inherited
  Git authority variables; the WSL invocation also explicitly unset
  `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and `GIT_COMMON_DIR`. No CI ran.
- This establishes parser/tooling behavior and recovery of the frozen grant
  definition in the current dirty integration checkout only. It does not
  regenerate or verify committed code-index outputs, establish runtime grant
  security, or close an RD. Re-run the generator/check after the integrated
  source set is stable; retain this as an uncommitted candidate pending full
  custody review.

### Code-index grant classifier current verification — 2026-10-13

- Reopened the integration checkout at `main` HEAD
  `823c8bc30c34a354e033f597f6477d258e0de488`; `origin/main` is
  `8a51ecbfec5d6e4911717c6fb09a1f76fad1c01c` (two local commits ahead, none
  behind). The worktree has 125 porcelain entries across existing staged,
  unstaged and untracked state. The classifier, its regression test and this
  dated custody entry remain unstaged; no other path was staged or modified in
  this follow-up.
- Live `git worktree list` reports 18 registered worktrees, 33 local branches
  and 31 remote-tracking refs. These are topology counts, not disposition or
  retirement authority; no branch or worktree was changed.
- Current SHA-256: `CA83CF763C3189B1E2999CE1B77072D319F54EA8DD0CF002F9FC854354939C8B`
  (`scripts/lib/diagnostic-object-occurrences.mjs`) and
  `79D4471DBCE800C0E22FC4DDD62ED3004867F8C219E5635F5A29078D8FE48A1A`
  (`scripts/tests/code-index-generator.test.mjs`). The focused full test file
  passed on native Windows and WSL (80 dot-reporter cases on each);
  `git diff --check` passed for both paths. No GitHub Actions/CI ran.
- The test-backed classifier now recognizes the actual frozen grant-registry
  construction, while paired fixtures refuse mutable, accessor, escaped,
  reassigned and extra-field variants. This remains a dirty-checkout tooling
  result, not a regenerated/committed index, runtime grant-security result, or
  Fungi/RD proof.
- AGENTS' worktree-aware Myco query returned `PARTIAL`, one current-worktree
  target, `UNKNOWN` freshness (`INDEX_UNREFRESHED_NO_FINDINGS`), and captured
  state digest
  `5428aa4977666f3db43ca4cf6ad4641f72c5a64d23a8847cea6d8c19f9771a6c6`.
  It also reports 18 unregistered branches outside that query's scope; this is
  not a count of all branches or worktrees. The zero-result structural graph
  query is likewise not evidence of absence. Refresh indexes only after the
  integrated source set is stable.
- Astra worker `01a13347-b269-7e72-a37f-b377bf657188` received the exact
  two-file delta as submission `01a13367-ba26-7d31-a65d-b1ea75238ff1` for
  independent review. It remained nonterminal at the latest wait; do not
  record an audit outcome until its reply is captured and checked. No source
  index output was regenerated, no donor was changed, and no commit, push or
  merge occurred.

### Test-routing donor current revalidation — 2026-10-13

- Reopened integration `main` at `823c8bc30c34a354e033f597f6477d258e0de488`
  and donor `codex/memory-current-main-20261008` at
  `34b419057de49b6437d0b3b9423f3f2bfb205970`. The integration runner and test
  working hashes still match the prior review
  (`1CA7C3BE5BE620336B7BD162EE2AC4F59D77D51CE8CD2C08741A8DC96AF6C490` and
  `80C692C1D3F2CEB94E033690EB69D50CDD12F555F958685237C0214B0F7A0B89`); donor
  working hashes still match
  (`C11CED3D613EBC3381D4EE351B335F3A3E6EEF334AF7E0B6464A8361AD897EBA` and
  `C65978E8A3F66D6F79B3A63C90A5B470B910CB476BC3951F72A2DFAE9AF44ECB`). The donor runner/test working
  files remain unstaged changes over their index versions.
- With inherited `GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE` and
  `GIT_COMMON_DIR` removed, integration `node --test
  scripts/tests/run-all-tests.test.mjs` passed **31/31** on native Windows.
  The corresponding donor working test passed **17/28** and failed **11**.
  The donor's newly added child-environment case passes, but several controls
  fail when child output is classified as `TEST-SUMMARY-UNPARSEABLE`; its
  zero-test control also returns that code instead of the expected
  `TEST-SUMMARY-EMPTY`. Keep the donor runner and test changes excluded; retain
  integration's broader Git-environment refusal and subprocess controls.
- Reopened the exact classical-signing test diff. Integration's current test
  working hash is
  `88D8C909A8DDDF9134AE7B2B732D5EDD13DEE317259D5E6A9966390E8803B658`; its
  focused run passed **8/8**, including a production-profile run of a manifest
  signed under a fixture-local trust root and explicit output `42`, followed by
  refusal controls. The donor working hash is
  `B0CAFD666EDD9F1D9D19935DE25CCC74752BE551`; it passed **1/1**, but its added
  `verify` control inherits the helper's `GALERINA_PROFILE=dev` rather than
  exercising the production run gate. Copying public trust files alone does
  not make that control production-profile evidence. Keep the integration test;
  no extra test port is justified by this donor hunk.
- This revalidates only the two runner files and one classical-signing test
  path; it does not clear the donor's other compiler/runtime/vault changes or
  separate CLI positive-control reports. No donor bytes or stage entries
  changed, no commit/push/merge occurred, and no GitHub Actions/CI ran.

### WASM owned-return hardening candidate — species and cleanup failure — 2026-10-13

- Reopened the integration checkout at `823c8bc30c34a354e033f597f6477d258e0de488`.
  The focused runtime and compiler test files were already dirty in this
  checkout; this entry records only the new scoped behavior, not all existing
  worktree changes.
- A hostile `Uint8Array[Symbol.species]` constructor intercepted the captured
  `Uint8Array.prototype.subarray` path in a red regression. Runtime parsing now
  creates a bounds-checked owned byte copy without invoking species.
- A second red regression reproduced a cleanup failure followed by hostile
  `Object.defineProperty` throwing during error-cause decoration, before the
  failure flag was recorded. Cleanup failure state is now recorded before
  diagnostic construction; later calls are quarantined even when diagnostic
  decoration is hostile.
- `galerina-core-runtime-wasm` builds and
  `rd-1296-host-registry.test.mjs` passed **28/28** on native Windows and WSL
  for its earlier revision; that receipt does not bind the larger current diff.
  The full current package command passed **141/141** on Windows. In WSL, the
  same package typecheck, build, and **141/141** tests passed when invoking the
  pinned TypeScript JS entrypoint directly with native WSL Node; the generated
  `.bin/tsc` wrapper otherwise selects `node.exe` and cannot run in this clean
  Linux process environment.
  `git diff --check` passes for the two source/test files, with only configured
  LF-to-CRLF warnings. This is scoped TypeScript/bootstrap runtime evidence,
  not proof of Fungi language, compiler, FFI, production host or end-to-end
  guarantees, and does not close an RD.
- Current working SHA-256: `023A3D00BFAC43E61B5750690F89D8B1D101B9ECC32F8D471B2C95E78D97BD03`
  (`packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`) and
  `A857F6BE7D90C27C45433CCA2E94599333F83C39D69125DDB3A18B8D312E8DF7`
  (`packages-ts/galerina-core-compiler/tests/rd-1296-host-registry.test.mjs`).
  Generated package output is ignored. No source was staged; no donor was
  changed; no commit, push, merge, index refresh or GitHub Actions/CI ran.
- The prior Astra submission `01a1337a-a26b-70e2-b5be-5b6b49fe379d` covers
  the separate code-index classifier delta, not these WASM changes. Its worker
  remains nonterminal at the latest poll; obtain a distinct bounded review of
  this runtime delta through the same worker after the pending response is
  captured. It does not review the current exact hashes below. Do not treat
  review delivery as runtime proof.
- Current 2026-10-13 SHA-256 for the runtime source is
  `12001BA044BA1B735E7D8091A3F2F9BB20780A44DF1CB3AEFC3824424D578CD5`; the
  host-registry test is
  `CB91A5FA0FA67353F2A7C1604A66C67B39FA6FD82A96FC2F30D141A2A3A68009`.
  This 141/141 package run is current bootstrap/runtime-surface evidence only;
  compiler emission, real consumers, a composed Fungi path, independent review
  of these hashes and RD closure remain open. No donor or Git publication state
  changed; no CI ran.

### Code-index classifier ambient and binding bypasses — repaired candidate — 2026-10-13

- Astra completed its read-only classifier follow-up as worker
  `01a13347-b269-7e72-a37f-b377bf657188`, submission
  `01a1337a-a26b-70e2-b5be-5b6b49fe379d`, overall **PARTIAL**. It independently
  confirmed three ambient-root bypasses and two lexical-binding bypasses that
  could mask a runtime diagnostic emission as a registry reference. It also
  noted syntax-only coverage limits around closure references and arbitrary
  identifier snapshot values; those are not resolved by this patch.
- Added five discriminating generator fixtures. All five failed before the
  implementation change because the code literal was masked instead of
  emitted. The classifier now propagates reassigned ambient-root aliases,
  refuses computed ambient-root property access and descriptor reads from
  ambient roots, counts destructured bindings, and refuses loop-initializer
  declarations as proof of a function-local method target.
- A separate red fixture showed `safeSnapshotDefinition` ignored a nested
  closure capturing its snapshot. The reference check now includes nested
  closures within the owning function; the regression requires the code
  literal to remain an emission.
- The five new fixtures plus five preservation controls passed **10/10**;
  the complete `scripts/tests/code-index-generator.test.mjs` passed **88/88**
  on native Windows and **88/88** in WSL before the closure regression was
  added; after it, the final candidate passed **89/89** on each platform.
  Existing WebAssembly descriptor,
  local snapshot, captured intrinsic, wrapper, and nested-loop controls remain
  green. These are classifier/generator results, not runtime-security proof.
- Current working SHA-256:
  `59F93DD900E0B4AE21535DB12D7DCC712E65E3679594A2165DF16EEE3C969A9B`
  (`scripts/lib/diagnostic-object-occurrences.mjs`) and
  `3A43A7D386DBEBDD569F955705EACD6FDFAE94A74FAF2768A5E4C54F1FE3538F`
  (`scripts/tests/code-index-generator.test.mjs`). `git diff --check` passed;
  only configured LF-to-CRLF warnings were emitted.
- A new independent review of the exact four-file classifier/WASM candidate
  was sent to the same Astra worker. Earlier submission
  `01a13382-fe9d-7dd0-90ea-59208cd851f8` was superseded because its classifier
  hash went stale after the closure-capture fix. The current submission is
  `01a13385-33f1-7a10-9cd1-3e84a6a8ea18`, prompt SHA-256
  `63765D37A25A6F4126D244E6EE59A9DED2FC254BFA29C1339757758EA43C5E0B`.
  It covers the final four-file classifier/WASM candidate, including the
  species-independent byte copy and cleanup-failure quarantine fix. It is
  pending; do not treat delivery as pickup or independent approval.
- No files were staged; no donor was changed; no code-index output was
  regenerated. No commit, push, merge, Myco refresh or GitHub Actions/CI ran.

### WASM cleanup diagnostic-construction failure — verified delta — 2026-10-13

- A hostile regression replaced `globalThis.Error` with a constructor that
  throws while an owned-memory wipe also fails. Against the pre-fix package
  output, the focused registry suite failed: retained host result bytes remained
  readable after cleanup failure. The source ordering explained the gap:
  `attempt.failed` was set only after `new Error(...)` returned.
- The runtime now records `attempt.failed = true` and a primitive diagnostic
  fallback before constructing the `Error`. If construction throws, the
  invocation catch still observes cleanup failure and quarantines the admitted
  instance/runtime. The regression checks host-result refusal and refusal of a
  later export call.
- After rebuilding only `galerina-core-runtime-wasm`, the focused
  `rd-1296-host-registry.test.mjs` passed **29/29** on native Windows and WSL.
  The complete runtime-wasm package typecheck/build/test command passed
  **141/141** on both platforms. WSL runs removed inherited `GIT_DIR`,
  `GIT_WORK_TREE`, `GIT_INDEX_FILE` and `GIT_COMMON_DIR`. `git diff --check`
  passed for the two source/test paths; Git emitted only configured
  LF-to-CRLF warnings. No GitHub Actions/CI ran.
- Current source SHA-256: `715FD55E247F428D7A21AF066AFB4A5316A1B7F6EA45D548EDBE2AFEBFDB87DA`
  (`packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`); regression
  SHA-256: `640E02195ABED66E3DF730504B90DBDFE55EB69D662FE9A12E7BF76B297DC1D4`
  (`packages-ts/galerina-core-compiler/tests/rd-1296-host-registry.test.mjs`).
  Astra follow-up submission `01a13394-e370-78a2-aec4-ab95a7d6f010` is
  pending on these exact hashes; do not treat it as approval until returned
  and checked.
- This is TypeScript/bootstrap runtime evidence only. It does not prove Fungi
  language semantics, production FFI/host enforcement, composed `/auth/verify`
  behavior, or closure of RD-1296/1413/1414/1415. No files were staged,
  committed, pushed, merged or refreshed; unrelated dirty work and all donor
  worktrees remain untouched.

### CLI filesystem-race harness review — current-source adjudication — 2026-10-13

- Reverified `main` HEAD `823c8bc30c34a354e033f597f6477d258e0de488` and the
  checked-in `packages-ts/galerina-core-compiler/tests/cli-wasm-assembly-refusal.test.mjs`
  (SHA-256 `B9FFEC736574D4DE2FD20A2360B369AFBB80101A97C8379445016539AE288B45`).
  This differs from SuperGrok's reviewed file SHA `72AC12F...` and target HEAD
  `facaa24...`; its conclusion was treated as a lead, not current-state proof.
- SuperGrok response identity is
  `59d43817-dc31-4ff2-8690-a754ffd4f103` in the existing worktree-estate
  review conversation. The browser exposed no response digest or timestamp.
  Astra worker `01a13347-b269-7e72-a37f-b377bf657188`, follow-up submission
  `01a133af-e041-7bc1-9a5f-3fdb099c7c08`, independently inspected the exact
  current source and adjudicated both bounded concerns. The multi-agent
  response exposed no digest or completion timestamp; do not imply otherwise.
- Both reviews found the OS-error classifier narrow and the restore path
  fail-closed: a restoration exception is thrown before it can be classified
  as a Windows skip. However, wrapping the restore exception can obscure the
  original setup diagnostic, and later release/cleanup exceptions may replace
  a pending error. No injected restore-failure control is present. Minimal
  follow-up: inject a setup error after displacement, then force restoration
  and final cleanup failures; assert the test fails (never skips) while
  retaining both primary and cleanup diagnostics. The junction-`EBUSY`
  negative classification also lacks a direct control.
- Current local test results, independently run by Codex on this exact file:
  WSL **42 passed, 1 Windows-only skip**, all four replacement-race controls
  executed; native Windows **36 passed, 7 skipped**, including all four
  replacement-race controls skipped on `EBUSY`. Windows therefore has no
  executed replacement-race attack-control evidence. No GitHub Actions/CI ran.
- These results establish only this test harness's exercised platform paths.
  They do not prove `.fungi` semantics, production CLI/runtime/host security,
  or R&D closure. No source was changed, and no donor, index, commit, push,
  merge or worktree topology was changed for this review.

### WAMR donor probe-fixture and failure-control layer reconciliation — 2026-10-13

- Reopened donor `codex/memory-current-main-20261008` at
  `34b419057de49b6437d0b3b9423f3f2bfb205970` and the integration checkout at
  `823c8bc30c34a354e033f597f6477d258e0de488`. Donor-untracked
  `scripts/tests/rd1413-wamr-duplicate-import-probe.wat` and
  `rd1413-wamr-unlinked-import-probe.wat` hash to Git blobs
  `0c298f80e8ff29d001c38aa058e633269a2aeecd` and
  `458ea7cfdfcbce4256d9b98909687aa965987a7a`; each exactly matches the
  integration checkout's staged file bytes. This is staged-candidate
  equivalence, not committed-main integration.
- The donor's staged C and runner blobs (`94058618941cd8380a06aa9c7ceeb58589d499d4`
  and `d733c3a60bb92e090216e46f6778cb4811b86908`) match the integration
  index, but the donor working layer removes the `WASM_V128` and
  `WASM_EXTERNREF` unsupported-result controls, the real externref-result
  mismatch fixture path, runtime-init/registration failure wrappers, and the
  environment-injection cleanup controls. It also drops the runner's explicit
  unset of `RD1413_TEST_FAIL_NATIVE_REGISTRATION` and
  `RD1413_TEST_FAIL_RUNTIME_INIT`. Current working Git-object hashes are
  integration/donor respectively `8cf8dd82f36f92c9f47bdc677b6ce3ab28a18cb8` /
  `7cd69fec570dcb7bfe4a52da01816a832d9a22f0` for the C probe and
  `a3f7eab79b3ff11bfa767cb2a94828c6ad304c9e` /
  `a7d0c7cf462e1a0639333075dbeaf22ca3a4c2c7` for the runner.
- Disposition: do not copy the donor working C/runner over the integration
  candidate; that would remove discriminating refusal and cleanup-order
  evidence. The two donor WAT files add no new bytes to the integration index.
  The donor remains otherwise unreconciled; its dirty and ignored state is
  preserved. No files were changed in either checkout, no path was staged,
  and no commit, push, merge, branch/worktree retirement or CI action occurred.

#### Live layer refresh — 2026-10-13

- Rechecked the exact donor and integration layers after the candidate advanced
  within the same dirty checkout. Donor `HEAD` remains
  `34b419057de49b6437d0b3b9423f3f2bfb205970`; integration `HEAD` remains
  `823c8bc30c34a354e033f597f6477d258e0de488`. For the four tracked WAMR
  admission/probe/runner files, each donor index blob still equals the
  integration index blob. The donor's two untracked duplicate-import and
  unlinked-import WAT fixtures still match the integration index and working
  bytes exactly. This is staged-candidate equivalence, not committed-main
  integration.
- Current integration working-file Git-object hashes are now header
  `ad047c7cfc00f30eec07a92cd050dbc330e820af`, admission source
  `e90c7fba85ad075a6d710119bf5dd6498fc4d7b7`, probe
  `e2266bb29e29868cade508aced1bf29bf273449c`, and runner
  `bcee5a7c38adb2322e0d216fa8b522c880eee94d`; these replace the older
  integration working hashes recorded above, not the donor/index receipts.
  The donor working hashes remain header
  `cfd7cf230da740f5b44eda1e5fadaf0771dc066a`, admission source
  `e06ca1bbd71ceb8562891be6f2a37e5c90fd00f8`, probe
  `7cd69fec570dcb7bfe4a52da01816a832d9a22f0`, and runner
  `a7d0c7cf462e1a0639333075dbeaf22ca3a4c2c7`.
- The integration working layer adds explicit unsupported-result-kind handling
  and its real externref-result refusal path, plus fault-injection environment
  clearing and expanded runtime-init/registration cleanup witnesses. The donor
  working layer does not contain the current candidate's complete control set;
  copying it would regress the tested integration candidate. Keep the donor
  intact for its other staged, unstaged and ignored layers. No donor or
  integration source/index was changed, staged, committed, pushed, merged or
  retired for this refresh; no CI ran.
- Re-ran the current integration working files in Ubuntu WSL with the pinned
  WAMR SDK, clearing inherited Git-routing variables. Exit status was 0; the
  probe emitted its expected PASS controls for invalid/unsupported kinds,
  signature and allowlist refusals, duplicate and unlinked imports, per-instance
  context, size boundaries, unavailable metadata, and runtime-init/registration
  cleanup. WAMR's signature diagnostic was expected in the mismatch negative
  control. Exact SHA-256 pins for this run: header
  `6A6D8B612171812BDAB62996DD1042854B379AB63DE10FAECE1039355F0A6405`,
  admission source
  `FD6A19E36758E7359375C4EBF6C8117667B168827DF968D5D1ADEFD745EDD15D`,
  probe `83A8F89E9A3C0A80D4DDBAAA5F836CDF8E6AB8E6AFFC86BABF5C034791ADF037`,
  runner `3DD0A4CA59B2EAAB1E385DCF5A9C18B17A512C3C1B1D6F15A7BA8F9A65FD9F1F`.
  This verifies the bounded native WAMR import-admission/cleanup seam only; it
  is not the production protected operation, Fungi-owned secret-memory proof,
  or RD-1413 closure. No GitHub CI ran.

### Grok-Bot memory-branch survey status reconciliation — 2026-10-13

- Received status message `grok-bot-galerina-memory-branch-survey-20261012-status-01`
  (`codex.session-message.v1`, sender `grok-bot-first-look`, subject
  `grok-galerina-memory-branch-survey-20261012`, created
  `2026-10-12T21:14:45.686Z`, related commit
  `8a51ecbfec5d6e4911717c6fb09a1f76fad1c01c`, status `OPEN`). Exact file:
  `coordination/session-exchange/outbox/grok-bot-galerina-memory-branch-survey-20261012-status-01.json`,
  SHA-256 `81CA331F81470909A59CA05C5582E17C55A1057ED2BE39FF45A35FA0567468A6`.
  It is an interim status, not a completed survey or merge/retirement authority.
- Rechecked its `memory-current-main-20261008` HEAD claim against live refs:
  donor `34b419057de49b6437d0b3b9423f3f2bfb205970` is an ancestor of
  integration `main` `823c8bc30c34a354e033f597f6477d258e0de488`, with zero
  donor-only and 109 integration-only commits. The donor still has 49 Git
  status entries. Therefore only its committed HEAD is contained; the survey's
  general “safe to retire” phrasing does not apply until the staged, unstaged,
  untracked and required ignored layers are dispositioned. Existing exact-path
  reviews remain controlling for those layers.
- No external message was sent. No donor data, refs, worktree, or integration
  paths were changed by this reconciliation.

### Ignored-payload custody comparison — memory-current-main donor — 2026-10-13

- Read-only ignored-file inventory for donor `memory-current-main-20261008`
  counted 5,502 ignored/untracked paths (758,825,339 bytes); the integration
  checkout counted 21,753 paths (2,131,214,847 bytes). These are checkout
  snapshots, not a claim that all ignored files are required or safe to remove.
- The path sets share 4,006 entries; 1,496 are donor-only and 17,747 are
  integration-only. Most integration ignored paths are under package output
  directories, but generated/recreatable status has not been individually
  verified. No ignored path was deleted or copied.
- Both checkouts contain a local ignored signing-configuration file, and the
  two files are not byte-identical. Their contents and digests were not
  disclosed or recorded. Preserve both separately; do not overwrite, merge,
  publish or assume either is disposable. Git worktree archival alone would
  not preserve ignored files, so any eventual retirement needs a separately
  verified, access-controlled recovery disposition for each required payload.
- This inventory does not clear either checkout for retirement. It records
  an additional custody distinction while path-level reconciliation
  continues. No source, ignored payload, branch, worktree or index was changed;
  no commit, push, merge or GitHub Actions/CI ran.

### Local-main admission and revocation-control commits — focused verification — 2026-10-13

- Reopened local integration `main` at `823c8bc30c34a354e033f597f6477d258e0de488`.
  Its two commits ahead of `origin/main` are narrowly scoped: runtime native
  admission input refusal (`3cf67e6e1821ddbd22c2abb5d3f87760761d54bd`) and
  a classical-CLI positive/negative control for a separate revocation-registry
  signer (`823c8bc30c34a354e033f597f6477d258e0de488`).
- `galerina-core-runtime` TypeScript build plus
  `tests/native-floor-contracts.test.mjs` passed on native Windows; the
  focused suite passed **8/8**. The same test passed **8/8** under WSL with
  inherited Git worktree variables removed.
- `galerina-core-compiler/tests/cli-classical-signing-refusals.test.mjs`
  passed **8/8** on native Windows and **8/8** under WSL. It exercised the
  separate pinned signer empty-snapshot positive control, signed revocation
  refusal before invocation, and existing malformed/unsigned/wrong-root
  refusal controls. Temporary fixture keys are created inside the test's
  temporary directory and the test removes that directory; no repository key
  was read or exported.
- The compiler package's `npm run build` TypeScript stage and Hallmark
  generation ran, but its build-evidence step refused because these two
  existing untracked compiler tests are not admitted build inputs:
  `tests/float-literal-context.test.mjs` and
  `tests/numeric-fast-tier-parity.test.mjs`. Do not stage them merely to bypass
  the guard; review and disposition them as separate dirty work first. The
  focused CLI test passed against the resulting local compiler output, but
  this is not a successful package build-evidence receipt.
- These checks are bootstrap/compiler/runtime tests only. They do not prove
  Fungi language enforcement, production host/FFI security, composed
  `/auth/verify`, or RD closure. Both commits remain local and unpushed; the
  repository's broad dirty state is unchanged apart from this ledger entry.
  No GitHub Actions/CI ran.

### RD-1413 pinned WAMR context-probe current-input rerun — 2026-10-13

- Re-ran `scripts/tests/run-rd1413-wamr-context-probe.sh` under WSL from the
  integration checkout at `823c8bc30c34a354e033f597f6477d258e0de488`, with
  inherited Git redirection variables unset. The exact current input SHA-256
  set and runner output are retained in
  `docs/reports/rd1413-wamr-pinned-probe-20261011.md` under its dated rerun
  section.
- The current WSL toolchain and the pinned WAMR headers/library matched the
  script's exact pins. Runner exit was 0; import-admission, mismatch,
  allowlist, context-isolation, size-bound and initialization/registration
  cleanup controls all reported PASS. Temporary generated probe artifacts
  were removed by the runner's own cleanup trap.
- This supersedes the older receipt only for the listed current dirty probe
  inputs and pinned Release artifact. It does not prove a source-rebuilt WAMR
  artifact, production Fungi runtime wiring, protected memory custody,
  `/auth/verify` composition, or RD-1413/1414/1415 closure. No source or index
  was changed by the run; no commit, push, merge or GitHub Actions/CI ran.

### RD-1413 WAMR pinned-source reproduction — 2026-10-13

- Rebuilt WAMR from the clean pinned source commit
  `25bd7eb63e828e4bd242cc9b38d260b4b31c6605` in a new local build directory,
  using the exact Linux X86_64 Release/interpreter/reference-types/SIMD
  configuration recorded in the linked probe report. CMake was 4.4.3 and GNU
  C/C++ 15.2.0. The `vmlib` target completed; one upstream unused-variable
  warning was emitted and not suppressed.
- Rebuilt `libiwasm.a` hash
  `f21702522f6ce032193ac0529a95f841be044730a0b1c237f17ebb0d61f0104d` matches
  the runner's expected digest. The current integration runner then passed all
  14 expected controls against that rebuilt artifact, exit 0. Full current
  Galerina input hashes are retained in
  `docs/reports/rd1413-wamr-pinned-probe-20261011.md`.
- This narrows the prior WAMR build-provenance gap for this exact pinned
  configuration. It remains a synthetic native host-ABI probe, not production
  Fungi runtime wiring, protected-byte custody, `/auth/verify` evidence or RD
  closure. The WAMR build directory is a local generated artifact; no repo
  source or indexes changed, and no GitHub Actions/CI ran.

### CLI revoked-export witness controlled-red — 2026-10-13

- Astra worker `01a13347-b269-7e72-a37f-b377bf657188` (submission
  `01a133c2-8de3-7623-aa11-e8f4b3c2d0c5`) identified a missing controlled
  mutation for the CLI revocation dispatch witness. In disposable copies only,
  the revoked path was made to call the real Wasm `answer` export, discard its
  value, then refuse. The focused test failed specifically because its marker
  existed (`true !== false`), while its other refusal controls passed.
- The ordinary focused test passed 8/8 on Windows and 8/8 in WSL. The assertion
  wording now claims only that wrapped named-export dispatch was not attempted.
  The original source/test hashes stayed unchanged. The first disposable copies
  were removed without a retained diff; the separate exact repeat is documented
  in the report linked below and its disposable copies remain only for review.
- This verifies the detector for that exact regression, not all possible
  startup/effect paths, Fungi runtime/FFI/host guarantees, `/auth/verify`
  composition or RD closure. No GitHub Actions/CI ran.
- Astra's bounded delta submission `01a133cb-a84f-7441-8c78-34344c50c789`
  was PARTIAL because the first disposable mutant was not retained. The exact
  repeat mutation, test-copy delta and transcript are retained in
  `docs/reports/rd1413-cli-revocation-controlled-red-20261013.md`. Astra's
  follow-up (submission `01a133d1-b0f8-7730-8f84-b84df9d9350a`) returned PASS
  for this narrow detector claim after inspecting, but not rerunning, the exact
  evidence. Dispatch/full-report hashes and claim limits are in that report;
  the verbatim reply is retained in the Codex task workspace.

### Q4n/Q5n T12/T14 historical and current zone identity recheck — 2026-10-13

- Reopened integration `main` at `823c8bc30c34a354e033f597f6477d258e0de488`.
  The current working edits to the Q4n/Q5n tests were preserved; no test,
  fixture, source or generated artifact was edited during this recheck.
- Independently extracted the three source regions from historical commit
  `05eb5c29be9592a42cdd48baaeb027279ff5299d`, normalized stored CRLF to LF,
  and recomputed SHA-256 over each exact region without a trailing newline.
  The resulting hashes match the retained historical fixture pins exactly:
  Z1 `7db668236da13ad6e898bd7ab125e67c096b8b4ca2aeea861698fb1c2a649c9f`,
  Z2 `eacc64386775298dc0c0f41401234bcc3210ff0f49bbcb1e39539c0e095a8929`,
  and Z3 `646835cf3f8006c999e60ae125c8585a23d148468875cca36c608713e7571e7f`.
- The focused Q4n T12 and Q5n T14 historical/current identity cases passed
  **4/4** on native Windows (Node `v24.18.0`) and **4/4** in Ubuntu WSL
  (Node `v22.22.1`). The current-zone checks executed the hash helper against
  the live source and matched `CURRENT_CODEX_ZONE`; historical checks matched
  the pinned Git-source bytes above. WSL removed inherited Git redirection and
  Node preload/path variables. No GitHub Actions/CI ran.
- This corrects the older mismatch status for these named identity assertions:
  the historical digest remains a valid historical pin, while current source
  is checked against its separate reviewed identity. It does not settle the
  broader Q2 emitted-module boundary, prove Fungi/runtime/FFI/host security,
  or close an RD. Exact current SHA-256 values: Q4n test
  `4E3BFC483CBFF41744290DCBFB6FA1F1DCB17E84F2360D96CAFE02D6FC02A335`, Q5n
  test `A8DC974957F2F113ADC4191202B35FD5955C9D9B106F8419571CCF121741047B`,
  historical fixture `996AFBB4AC21D71D2AF830ABDEC1E61C1A265B8D0A2E8DAE235DA13FE73E69B0`,
  freeze helper `3398B30818802E080C695751431715FDDFA1B44C3D212C676D1C8E9AD247CC67`,
  and current-source runner `25FE2FFEFC96906437E105C264CD30ABEB3FB35985709C25077D8BEA38051FCD`.

### Q4n/Q5n seven-stage WAT digest full-file rerun — 2026-10-13

- The full Q4n and Q5n test files passed **28/30** on native Windows and
  **28/30** in Ubuntu WSL; both failures are the seven-stage WAT digest case,
  first at `lexer.fungi` (actual `198c2c25badbf348f255a4120d5c6877710690f09d99286bb9779df0bbba9fc5`,
  expected historical `5f7f235b944d36a7e3cbb16a7d88fe895e19fdd2d2728732235d70bc0975fdd7`).
  The live 203-flow checks and all historical/current Q4n T12 and Q5n T14
  identity checks passed on both platforms.
- The pin constants were introduced in commit
  `05eb5c29be9592a42cdd48baaeb027279ff5299d`. Current `stageSource()` reads
  the live working `.fungi` files, and `renderStageWat()` uses the current
  package `dist` compiler; both the Fungi inputs and compiler sources are
  modified in this integration checkout. Therefore this failure proves a
  current-vs-historical generated-WAT mismatch, not which source/build layer
  caused it and not a Fungi memory defect. Preserve the historical values;
  do not bless new digests until the exact historical tool/build pair and the
  current reviewed source/build pair are separately reproducible and compared.
- This remains an open test-evidence reconciliation item. No expected digest,
  source, build output, or donor state was changed by the rerun. No GitHub
  Actions/CI ran.

### WASM owned-return reserved-helper identity collision — narrow review PASS; further coverage gaps — 2026-10-13

- Current integration checkout is `main` at `823c8bc30c34a354e033f597f6477d258e0de488`;
  the tracked worktree remains broadly dirty, so no whole-file staging is safe.
- A controlled red probe showed that one WebAssembly function exported under two
  different reserved secret-helper names was accepted. `wrapAdmittedExports`
  now refuses that ambiguous helper identity with
  `FUNGI-WASM-REFERENCE-001` before exposing the admitted wrapper. This is
  admission-finalization refusal after instantiation, not a claim of pre-start
  refusal or a general Fungi guarantee.
- Exact reviewed source SHA-256:
  `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`
  `12001BA044BA1B735E7D8091A3F2F9BB20780A44DF1CB3AEFC3824424D578CD5`.
  Exact current regression-test SHA-256:
  `packages-ts/galerina-core-compiler/tests/rd-1296-host-registry.test.mjs`
  `CB91A5FA0FA67353F2A7C1604A66C67B39FA6FD82A96FC2F30D141A2A3A68009`.
- The host-registry suite passed **49/49** on Windows and **49/49** in Ubuntu
  WSL. The WASM runtime plus seam-adapter suites passed **139/139** on Windows
  and **139/139** in WSL. WSL runs removed inherited Git redirection variables
  and used the repository's test-environment isolation preload. The WSL package
  build passed after the source change. No GitHub Actions/CI ran.
- `git diff --check` found no whitespace errors; Git reported the repository's
  configured LF-to-CRLF working-copy notices. Existing Astra worker
  `01a133e5-cc30-7513-b863-5f65b2034a8f` returned a read-only **PASS** for the
  source and then-current test hashes above. Astra verified hashes by reading
  but did not independently run tests or whitespace checks. A follow-up then
  reviewed the current test hash above and found no new blocking test defect.
  The exact retained Codex-workspace report has SHA-256
  `2928EF1E3B63C740CFE8B2D8E2801C5AEB7368459A063F41AD3D034E8E4FAE26`;
  triggering update submission `01a1340e-3c05-74f3-94e8-619d90d48cef`.
  Astra reported no reply ID, timestamp, or model metadata. Remaining
  test-evidence gaps:
  inherited-accessor pollution plus failed cleanup on signed and flat copies;
  setter/container probes across each signed/container path; and a focused
  negative control proving the container oracle catches a reverted descriptor
  implementation. These are review coverage gaps, not demonstrated runtime
  bypasses. Earlier
  submissions `01a133fc-3737-79d1-87f6-f365f2f503f4`,
  `01a13401-ac7b-76c3-b166-f4bcc12a0fa7`,
  `01a13404-e3dc-7602-9819-6226fa419b47`, and
  `01a13409-3fa8-7130-b842-06267aeedf82` remain historical; they do not
  substitute for adjudication of the newest test hash.
- This is TypeScript/WASM host-bootstrap evidence only. It does not establish
  `.fungi` compiler/runtime/FFI/host guarantees, provider-open/revocation order,
  a production protected operation, or RD-1413/1414/1415 closure. No commit,
  push, merge, or unrelated-tree modification was made.

### Q2 scientific-notation Int-assignment regression correction — 2026-10-13

- The expanded `wat-q2-parked7-d5.test.mjs` test incorrectly required
  `FUNGI-TYPE-024` for `2147483648e0` assigned to `Int`. The current parser
  classifies exponent notation as `Float`; the type checker rejects the
  Float-to-Int assignment as `FUNGI-TYPE-002`. The test now requires refusal
  (type mismatch, integer-range diagnostic, or parse/lex refusal), rather than
  misclassifying a floating-point token as an integer literal. A direct probe
  confirmed the TypeScript/bootstrap checker emits `FUNGI-TYPE-002`.
- The complete Q2 test file passed **60/60** on native Windows and **60/60** in
  Ubuntu WSL after this expectation correction. The separate RD-0873 artifact,
  self-hosted schema, WAT option-equality and string-lifetime tests passed
  **6/6** on both platforms. These tests use the repository's Git-environment
  isolation preload; no GitHub Actions/CI ran.
- The Q2 test file's current SHA-256 is
  `C11A3A424C49E28C61C2150215F79CC8B536322239B34F48AEF5D1275B2F6D6F`.
  Its working diff is broad (1,615 insertions and 17 deletions), so the file
  cannot be safely staged as a narrow correction without first separating its
  other user changes. The integration worktree's `.git` pointer uses a Windows
  absolute gitdir path; WSL Git cannot resolve it, although the isolated WSL
  test runs themselves pass. No Git metadata was changed.

### `memory-current-main` donor staged-layer revalidation — 2026-10-13

- Reopened branch `codex/memory-current-main-20261008` at
  `34b419057de49b6437d0b3b9423f3f2bfb205970`; it has **0 commits ahead and
  107 behind `origin/main`**. Its current porcelain snapshot has 49 records:
  43 staged path records, 8 unstaged status records (including paths that also
  have staged content), and 2 untracked WAMR `.wat` fixtures.
- Compared each of its 43 staged index blobs with the integration checkout at
  `823c8bc30c34a354e033f597f6477d258e0de488`: 8 match the candidate HEAD,
  8 match its index, 4 match its current working bytes, and **35 match none of
  those three layers**. These categories overlap; they are not additive. This
  proves the donor stage is not a safe bulk-merge payload, not that the
  unmatched work is useless. Review and disposition the distinct staged,
  unstaged, untracked and required ignored layers individually before any
  integration or retirement.
- No donor, index, branch, or worktree content was changed during this
  comparison. The donor remains available for the next serial reconciliation;
  no commit, push, merge, cleanup, or CI ran.

### Shared test-runner Git-isolation regression suite — 2026-10-13

- At integration checkout HEAD `823c8bc30c34a354e033f597f6477d258e0de488`,
  `scripts/tests/run-all-tests.test.mjs` passed **31/31** on Windows after
  removing inherited `GIT_*` variables from the test process. In Ubuntu WSL,
  **20 passed, 11 platform-specific cases were skipped, 0 failed** with a clean
  process environment. No GitHub Actions/CI ran.
- The first Windows invocation was invalid because the test itself was run
  under the isolation preload; that deliberately installed `GIT_CONFIG_*`
  values and caused the runner's inherited-environment guard to refuse. The
  clean-parent rerun exercised the suite's own poisoned-environment controls.
- This verifies the test runner's existing environment-isolation/refusal suite;
  it does not repair the separate WSL Git inability to follow this particular
  integration worktree's Windows-absolute `.git` pointer. No runner source,
  branch, or index was changed by these tests.

### `memory-current-main` secrets-vault staged slice disposition — 2026-10-13

- Compared the six donor-staged vault/interface/generator paths against
  integration `main`. The package manifest, TypeScript WIT source, and both
  Fungi mirrors (four paths total) are already present at identical blob IDs in
  candidate `HEAD`. No port is needed for those four exact matches.
- The donor's other two staged files are not improvements over `main`:
  `tests/secrets-gateway-wit.test.mjs` removes the source-fixture checks and
  discriminating negative controls for comment decoys, lookalike fields, and
  wrong-interface scope; `scripts/generate-secrets-gateway-wit.mjs` replaces
  the current source-AST check (one exported, immutable, non-interpolated
  declaration) with a read from compiled `dist/types.js`, weakening protection
  against stale generated output. Neither donor version was copied.
- The integration vault package's build-and-test command passed **99/99** on
  Windows and **99/99** in Ubuntu WSL using the repository-pinned local
  TypeScript compiler. Its test hash is
  `8188D0A722DE1E86C099AF007DB4702555C1B6E48D96B8058EC07E7F4192264E` and the
  source-AST generator hash is
  `51C052E0A8D75C39409F440391494761506EC543797D32F510FC558E4438F87B`.
  This is package/bootstrap evidence; the generated interface remains a
  non-authorizing candidate and does not prove a Fungi/WASM/host runtime path.
- Donor staged test blob `f3fa50a5a0806e6795b7cef6ea278a144c29d322` and
  generator blob `239be897882ea6d73d0c5d3a02a1454692ef122d` remain in the donor
  index, unchanged. No donor file, candidate source, branch, or index was
  modified; no commit, push, merge, or CI ran.

### WAMR host-admission probe rerun — 2026-10-13

- Ran `scripts/tests/run-rd1413-wamr-context-probe.sh` from the integration
  candidate at `823c8bc30c34a354e033f597f6477d258e0de488` in Ubuntu WSL, using
  the pinned WAMR 2.4.5 SDK recorded in
  `docs/reports/rd1413-wamr-pinned-probe-20261011.md` and a clean environment
  with no inherited Git authority variables. Exit status: **0**.
- The run passed refusal checks for invalid and unsupported value kinds,
  signature mismatch before instantiation, closed import allowlisting,
  non-function and duplicate imports, an unlinked native import, per-instance
  context isolation/missing-context/mismatch callbacks, externref result
  mismatch, and oversized/exact-bound Wasm inputs. Injected native-registration
  refusal and runtime-init failure cleanup controls also ran and emitted their
  expected markers. WAMR emitted an expected signature diagnostic during the
  mismatch negative control.
- Exact current candidate SHA-256: admission header
  `6A6D8B612171812BDAB62996DD1042854B379AB63DE10FAECE1039355F0A6405`;
  admission source `FD6A19E36758E7359375C4EBF6C8117667B168827DF968D5D1ADEFD745EDD15D`;
  C probe `2677B47FE8EEFC95AA230CCD04314CE74E598D97DBBAC1281C2C05EC05C881E1`;
  failure wrapper `5224DF3794A46D1DBD783401159C8E211B2065B12CE5C6E4A12923DAA3EF72B3`;
  runner `8944997CB828D729490100934D67EB03495183E9C3571EBB7A7B7711AA1AE4C6`;
  externref fixture `060A2AED2A5D0BAFCA5FDA55C101E533641DF473792E1981A93F63B0C6462006`.
- This is a native WAMR host-admission/cleanup probe at the exact candidate
  source, not end-to-end secret-memory proof, production `/auth/verify`, Fungi
  language/runtime guarantees, Windows-host evidence, or RD closure. No CI,
  donor changes, commits, pushes, or merges occurred.

### `memory-current-main` value-state staged slice — 2026-10-13

- Compared the staged donor versions on branch `codex/memory-current-main-20261008`
  at `34b419057de49b6437d0b3b9423f3f2bfb205970` with integration `main` at
  `823c8bc30c34a354e033f597f6477d258e0de488`. The donor checker replaces the
  parser-identity/type-structure test for `SecureString` with a substring
  regular expression over the type-name text, and removes secret-lease refusal
  handling for resource and hallmark declarations. Do not port this staged
  checker as-is; its proposed classifier weakens fail-closed treatment of
  malformed or non-type syntax.
- The donor's staged `tests/value-state/helper-return-context.test.mjs` has
  1 added and 253 removed lines. Among the removed controls are nested/helper
  alias identity and shadowing cases, parser-owned type identity, malformed and
  opaque type payloads, and compatibility strings that must not authorize
  secret-label preservation. The current integration version passed **55/55**
  on native Windows and **55/55** in WSL. These runs verify the current
  bootstrap checker/test layer only; they do not establish Fungi runtime,
  FFI/host, protected-operation, or RD guarantees.
- The integration checker and test were unchanged at the pinned candidate
  during this review. The donor index/worktree and its ignored files remain
  untouched and retained; this staged slice is **reviewed, not integrated**.
  No commit, push, merge, worktree retirement, or GitHub Actions/CI ran.

### `memory-current-main` WASM effect-grant staged slice — 2026-10-13

- The donor's staged `wasm-runtime.ts` removes the single captured `host`
  reference and dereferences `opts.host` again after the awaited
  `WebAssembly.compile`. A caller can therefore change the supplied host while
  compilation is pending; the admission check and later import binding,
  instantiation, and returned host can observe different identities. The
  current integration implementation snapshots the host once and uses that
  captured identity throughout.
- The donor's staged `wasm-effect-grant-abi.test.mjs` removes both controls
  covering option replacement during compilation and a changing host
  accessor. The exact current tests passed **2/2** on Windows and **2/2** in
  WSL. The donor's staged implementation/test pair is **not safe to integrate
  as-is**; this is a bootstrap runtime boundary finding, not proof of the
  composed Fungi host or protected-operation guarantee.
- No donor source/index, integration runtime source, or test was changed for
  this finding. The donor remains retained for path-level review. No commit,
  push, merge, worktree retirement, or GitHub Actions/CI ran.

### `memory-current-main` auth-route staged slice — 2026-10-13

- The donor changes only the route-dispatcher's comments from explicitly
  non-readiness example metadata to claims that it is a runtime component and
  represents a 50% runtime milestone. The Fungi source still consists of
  route-selection logic; this comment change supplies no execution bridge.
- At the same integration candidate, `../examples/auth-service/deno-adapter.ts`
  still returns HTTP 503 for `POST /auth/verify` with “Service bridge pending
  Phase 54.” The donor test is still a compiler/checker invocation, not a
  production route execution test; its staged edit also removes child-process
  environment filtering and timeout/error/signal assertions. Do not port this
  staged route/test pair as evidence that the first protected operation is
  wired or ready.
- This is a source comparison, not proof of the entire deployment state. No
  donor or integration route/test content was changed; no commit, push, merge,
  worktree retirement, or GitHub Actions/CI ran.

### `memory-current-main` test-routing and CLI unstaged layer — 2026-10-13

- The donor's working-tree version of `../scripts/run-all-tests.cjs` and
  `../scripts/tests/run-all-tests.test.mjs` removes the inherited Git-authority
  isolation/refusal path, cleanup-failure handling, and many adversarial
  fallback controls. The two-file donor diff deletes hundreds of lines; do not
  port it as-is because tests could inherit Git authority from the real
  checkout and the test runner would lose refusal coverage.
- The donor's working-tree version of
  `../packages-ts/galerina-core-compiler/tests/cli-classical-signing-refusals.test.mjs`
  removes the signed empty-revocation positive control and several invalid,
  tampered, and revoke-before-export cases. The current integration version
  passed **8/8** on Windows and **8/8** in WSL. Its test-runner isolation suite
  passed **31/31** on Windows and **20 passed / 11 Windows-specific skips / 0
  failures** in WSL. Current candidate hashes: runner
  `1CA7C3BE5BE620336B7BD162EE2AC4F59D77D51CE8CD2C08741A8DC96AF6C490`, runner
  tests `80C692C1D3F2CEB94E033690EB69D50CDD12F555F958685237C0214B0F7A0B89`,
  and CLI tests
  `A8EBAB6787540915F859C642ADD74AB3765134C132260E886B9091F2C246646A`.
- These test results cover local CLI/test orchestration controls, not Fungi
  runtime/host guarantees or RD closure. The donor's separate WAMR C probe and
  native admission source changes are still awaiting path-level review; this
  entry does not reject that distinct slice. No donor/integration code was
  changed; no commit, push, merge, worktree retirement, or CI ran.

### Astra donor adjudication and current runtime working-diff verification — 2026-10-13

- Astra agent `01a13463-d885-7141-a313-32b10e11298f`, submission
  `01a13468-b4f9-79d2-bd21-e49a8ddb709f`, independently reviewed the two staged
  donor slices. It confirmed the parser-structure, alias/shadow, secret-lease,
  and async host-identity regressions and recommended rejecting the four donor
  checker/test/runtime/grant-test files as-is. The exact advisory report is
  `reports/astra-memory-current-main-donor-review-20261013.md`, SHA-256
  `3846CF57297FC209397CB0186869D78BBD6AB3236CE751DEB079F283C312CA57`.
- Separately checked the current dirty integration runtime implementation
  (`packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts`, SHA-256
  `12001BA044BA1B735E7D8091A3F2F9BB20780A44DF1CB3AEFC3824424D578CD5`) and
  grant test (`packages-ts/galerina-core-compiler/tests/wasm-effect-grant-abi.test.mjs`,
  SHA-256 `3EE556CEF32851FA155C230D86637ADA56E67C3CA492AC4EBBD23D46E7E9B9E2`).
  The pinned package typecheck passes on Windows and WSL; the runtime package
  build passes on Windows and reproduces the same ignored dist hash
  `1EB2D7679412F2285487A769F5E6ECC22BC6D4D33FBCBBDF1F6788E2DDFE0CEA`.
  Against that build, `wasm-runtime.test.mjs` passes **106/106** and
  `wasm-effect-grant-abi.test.mjs` passes **23/23** on both Windows and WSL.
- The tests exercise the current TypeScript/runtime distribution and targeted
  cleanup/identity controls; they do not prove Fungi-language semantics,
  production `/auth/verify`, the full host/FFI threat boundary, or RD closure.
  Astra's follow-up on the broader dirty owned-result/runtime patch is still
  pending. No source or donor changes were made; no commit, push, merge,
  worktree retirement, or GitHub Actions/CI ran.

### WAMR cleanup-witness review and test-only correction — 2026-10-13

- Existing Astra reviewer `01a13491-1aad-7470-b905-a86f5d97ee85` completed a
  bounded harness delta review (turn `01a13529-1190-70a3-94f9-cc4919485ca8`,
  message `msg_0cbfbbf44f8f72e1016ace1f37679487d28d68a242c886a2ab`,
  `2026-10-13T12:09:01Z`, reply SHA-256
  `90AD5BE87D22E500832E451C06089D727435FA66C69F7FE4FF559A4250DA4055`).
  Astra confirmed the three injected metadata faults reach the intended
  refusing branches (Q1 PASS), but rated the cleanup witness PARTIAL because
  it did not prove the real WAMR initialization succeeded. Detailed evidence
  is in `docs/reports/rd1413-wamr-pinned-probe-20261011.md`.
- Added a test-only simulated init-bypass control. The red run showed the old
  wrapper accepted cleanup after simulated initialization and emitted the
  success marker (runner exit 1). The wrapper now records the real init result
  and refuses the success marker unless initialization succeeded. The focused
  WSL runner then exited 0, including bypass rejection and ordinary standalone
  registration-refusal cleanup. Production admission/runtime source is
  unchanged.
- Current hashes: probe
  `83A8F89E9A3C0A80D4DDBAAA5F836CDF8E6AB8E6AFFC86BABF5C034791ADF037`,
  wrapper
  `D154E198A159DE038A7B17E49D760AC2801E5D15C5F9C1C3F9DFD494C1639DFF`,
  runner
  `E3C3892371DA9BE230B16795742C90ED8A11970179B2EEAA03D5D6718910DCEF`.
  Independent review of these final wrapper/runner bytes is pending; missing
  prior-import metadata and standalone unlinked-import cleanup also remain
  open. No CI, staging, commit, push, merge or worktree retirement occurred.

### `memory-current-main` untracked WAMR fixture custody recheck — 2026-10-13

- Reopened integration `main` at `823c8bc30c34a354e033f597f6477d258e0de488`
  and donor `codex/memory-current-main-20261008` at
  `34b419057de49b6437d0b3b9423f3f2bfb205970`. The donor has 49 status records
  (43 staged, 8 unstaged including four overlaps, and 2 untracked); the
  integration checkout has 134 status records (7 staged, 111 unstaged and 16
  untracked; no conflicts). Integration `main` is 2 commits ahead of its
  locally cached `origin/main`; no fetch was done.
- Donor-untracked `scripts/tests/rd1413-wamr-duplicate-import-probe.wat` and
  `scripts/tests/rd1413-wamr-unlinked-import-probe.wat` match the integration
  working files byte-for-byte. For each path, the donor file's Git blob ID
  matches the integration index and working-file blob (`0c298f80e8ff29d001c38aa058e633269a2aeecd`
  and `458ea7cfdfcbce4256d9b98909687aa965987a7a`). They are therefore
  represented in the candidate index, but absent from candidate `HEAD` and not
  yet committed. This resolves custody for these two fixture bytes only; it
  does not establish donor retirement eligibility or integration of the other
  donor layers.
- The same Astra reviewer returned `NOT_VERIFIABLE` on the previous test
  follow-up because its test SHA pin was stale. Current test SHA is
  `1AB63B615B42B482F3006B952CE2EE6CFC343A3536EE7A5D0E98B9981252A4DA`; a
  bounded correction was sent to that reviewer as submission
  `01a13573-b85b-7b03-aecd-71834fc834ed`. Its adjudication is pending. No
  donor/index mutation, CI, commit, push, merge or retirement occurred.

### Current compiler-test bundle and WAMR probe revalidation — 2026-10-13

- At integration `main` HEAD `823c8bc30c34a354e033f597f6477d258e0de488`,
  `npm --prefix packages-ts/galerina-core-compiler run build` reached and passed
  TypeScript compilation and Hallmark generation, then refused during build
  evidence generation because these untracked test inputs are present:
  `packages-ts/galerina-core-compiler/tests/float-literal-context.test.mjs`,
  `packages-ts/galerina-core-compiler/tests/nonsecret-owned-record-copy-wipe.test.mjs`,
  and `packages-ts/galerina-core-compiler/tests/numeric-fast-tier-parity.test.mjs`.
  None was staged to bypass the refusal. The current local compiler output was
  then exercised by the focused test group.
- The Q2 parked-7 suite and the RD-0873 artifact-generator, self-hosted schema,
  WAT option-equality and WAT string-lifetime suites passed **66/66** on native
  Windows and **66/66** in Ubuntu WSL, with no skips. The Q2 suite also invokes
  the staged WABT fallback probe. Exact test SHA-256 values are recorded by
  path: `wat-q2-parked7-d5.test.mjs`
  `C11A3A424C49E28C61C2150215F79CC8B536322239B34F48AEF5D1275B2F6D6F`,
  `wabt-fallback-probe.mjs`
  `E50D0235A20B379CD50E4FE134F1724A6CD9CEE34A2624D23202F53FA07624C4`,
  `rd0873-artifact-generator.test.mjs`
  `E5E39280FDA3A48A1B02E5C10DB4D88332039F996837E98BA6FA5ECDE79B9BBF`,
  `self-hosted-schema-typecheck.test.mjs`
  `19B121968DCFBA04935569CAE9ED204D49E56E032BD3101CCA5F2008A495ADB8`,
  `wat-option-equality-parity.test.mjs`
  `BD7CC21654590846CF2D64C7A8E04F90024BD5AB5F0F88FAC71AD5B7D0CA1DE1`,
  and `wat-runtime-string-lifetime.test.mjs`
  `82503036F824CD9328A0B9BAF1D2DFEA6CC3DAE1965E2F6D6867129D49560D44`.
  These are compiler/bootstrap and JavaScript-Wasm-engine checks, not proof of
  production Fungi/FFI/host behavior or RD closure.
- Re-ran `scripts/tests/run-rd1413-wamr-context-probe.sh` in Ubuntu WSL with
  the pinned WAMR 2.4.5 SDK and no inherited Git-routing environment. Exit 0;
  duplicate-import, unlinked-import, metadata-refusal, context isolation,
  signature/type mismatch, bounds, and cleanup controls emitted their expected
  PASS markers. Current probe, runner and fixtures are pinned above in their
  existing sections; the two donor-untracked WAT fixtures still match staged
  candidate blobs and remain uncommitted.
- No GitHub Actions/CI ran. No index, branch, commit, push, merge, or worktree
  retirement changed. Build evidence remains refused until the untracked inputs
  receive an explicit custody disposition; this local test result does not
  override that refusal.

### Owned-result copy/wipe focused verification — 2026-10-13

- At integration `main` HEAD `823c8bc30c34a354e033f597f6477d258e0de488`,
  built the dirty runtime-WASM package on Windows with
  `npm --prefix packages-ts/galerina-core-runtime-wasm run build` (exit 0).
  Compiler `typecheck` passed on Windows and Ubuntu WSL.
- The focused compiler tests
  `q1-secret-return-value.test.mjs`, `rd-1414-wipe-failure.test.mjs`, and the
  untracked `nonsecret-owned-record-copy-wipe.test.mjs` passed **112/112** on
  Windows and **112/112** in Ubuntu WSL. Test SHA-256:
  `1AB63B615B42B482F3006B952CE2EE6CFC343A3536EE7A5D0E98B9981252A4DA`.
  Candidate source hashes: `wat-emitter.ts`
  `2321457E97C417F84D6D7B67BCE3F998F7C8E3351677FC34C26B919B9DC26365`,
  `wat-emitter-types.ts`
  `F90E0E68B65D5F3833079BE488BECB3FD8F63AB6A054FA148B67BED2C1487942`,
  and runtime `wasm-runtime.ts`
  `DA047E522DF42688FB28165DB600E7F96053F44A02AEC4A8F054B0A52279A5F0`.
- This verifies the current compiler/bootstrap and JavaScript WASM-engine
  owned-result/copy-before-cleanup test surface. The new structured-record case
  is explicitly non-secret. These checks do not prove Fungi-owned secret bytes,
  host/FFI isolation, provider/revocation ordering, a real `/auth/verify` path,
  or composed RD evidence. No source/test file was edited by these checks.
- GitHub Actions/CI did not run. No donor was changed; no staging, commit,
  push, merge, branch/worktree retirement, or Myco refresh occurred. The
  compiler build-evidence refusal for untracked test inputs remains in force;
  this focused pass does not override it. The previously recorded Astra
  follow-up on the broader dirty owned-result/runtime patch remains pending;
  this turn did not obtain its reply, so independent review is still required
  before integration.

### Owned-result Fungi type-check test delta — 2026-10-13

- The previously untracked `nonsecret-owned-record-copy-wipe.test.mjs` source
  helper checked parser errors and effects but did not run symbol resolution or
  type checking before GIR/WAT emission. Added a negative Fungi source regression
  that initially failed because the helper accepted a String return for an Int
  flow. The helper now resolves symbols and refuses type-error diagnostics
  before emitting WAT. This is test-harness evidence only; it changes no
  production compiler/runtime behavior.
- The owned-result test file passes **11/11** on native Windows and WSL. The
  combined `q1-secret-return-value`, `rd-1414-wipe-failure`, and
  `nonsecret-owned-record-copy-wipe` set passes **113/113** on both. Updated
  test SHA-256: `E7885568FD5A7B9CBA2DB76C317323503C3DC835CBBC13061D4827065B906835`.
  Updated TODO SHA-256: `4532CDA8C07BBC8FCE620151A1DD0FAC0B89143E27E47D01BD7573F73A53C894`.
- The earlier Astra 10/10 review predates this type-check delta; the broader
  owned-result/runtime review remains pending. The evidence is compiler/bootstrap
  and bounded JavaScript WASM-engine coverage, not Fungi-owned secret custody,
  production `/auth/verify`, host/FFI guarantees, or RD closure. No GitHub CI,
  staging, commit, push, merge, or worktree retirement occurred.

### Owned-result test resolver-coverage correction — 2026-10-13

- Astra's review of the 11/11 test revision found `resolveSymbols` diagnostics
  were discarded, that direct nested-record/scalar source cases skipped the
  new checks, and that the type-error assertion was too broad. The integration
  test now shares parser/symbol/type assertions across the helper and those
  direct Fungi-source cases. Negative tests require `FUNGI-NAME-001` and
  `FUNGI-TYPE-008`, with callbacks confirming later pipeline stages are not
  reached. The unresolved-name regression was first run red (`Missing expected
  rejection`) before the fix.
- Current test SHA-256:
  `37040E863F949A7FF527247CBF7F43B83AB880B02A2D2B7FCE5C24A38CC55192`;
  current `docs/TODO.md` SHA-256 before this ledger update:
  `FE679C63669A672EBF715A933A200D8C016EB5B36B4B4013F4CF0FDEBDCCF4B5`.
  The test file passed **12/12** on native Windows and WSL; the combined
  Q1-return/wipe-failure/owned-record-copy-wipe set passed **114/114** on both.
  Astra's read-only review of this exact final hash is pending (latest queued
  update `01a1359b-ddd7-7f30-a810-9cb4de96c2da`).
- Anti-Drift reported no findings against this TODO entry; its broader `docs`
  scan still reports 15 missing-file references and 3 duplicate blocks in
  other documents. This is a test-harness correction only, not production
  Fungi/compiler/runtime/FFI/host enforcement, protected-route evidence, or RD
  closure. No donor changes, staging, commit, push, merge, CI, or retirement.

### Astra adjudication — resolver-check test delta — 2026-10-13

- Reused Astra agent `01a13557-f7e5-72d0-9802-4f73da57d91f` for the bounded
  final test review. It verified current test SHA-256
  `37040E863F949A7FF527247CBF7F43B83AB880B02A2D2B7FCE5C24A38CC55192` and
  returned PASS for shared parser/resolver/type diagnostics, the two precise
  negative refusal vectors, and the not-reached hooks. It independently reran
  12/12 on native Windows; it did not rerun WSL or the combined 114/114 suite,
  which were rerun locally on both.
- Astra flagged one low-severity ambiguity in `docs/TODO.md`: “these controls”
  did not identify the older reviewed revision. The wording is now explicit
  that the current review covers only this helper and compiler-stage ordering,
  and the separate broad runtime review remains pending. Current TODO SHA-256
  `08F7204EEFD276BBFD00FB51BDAF9C33BA36EF91C6DDA07642B09C52ED090757`;
  the wording-only follow-up (`01a135a0-5f1f-7363-bb52-c92350404d0a`) returned
  PASS from the same Astra worker. It verified this TODO hash and confirmed
  lines 21–37 accurately separate the reviewed test-helper claim from the
  runtime/security and RD obligations. No edits or test reruns were made.
- The prior entry's “exact 12-test revision awaiting independent review” is
  superseded by this test adjudication. No production-code or donor files were
  changed by the test-helper correction; no staging, commit, push, merge,
  retirement, or GitHub Actions/CI occurred.

### Scalar-return metadata donor disposition — 2026-10-13

- Reconciled donor commit `d01952803e64f7b65ecc0a30faffc66592eb4f01`
  (`fix(fungi): clear stale scalar return metadata`) against integration `main`.
  The donor commit is not an ancestor of current `main`, so history alone does
  not establish integration.
- The behavior is present in `main` through the later reviewed integration
  commit `d1939459ecfa53a6d91e5ea28016d3e446d1071c`: its emitter wraps scalar
  returns to reset stale heap-result metadata, and its Q1 tests cover a scalar
  after a secret heap export, nested secret-record calls, multiple record
  fields, and generated-name collision. The integrated implementation extends
  the donor's i32-only wrapper to typed scalar lanes; it is not a byte-for-byte
  copy of the donor patch.
- At this check, the committed `main` blobs were emitter
  `326c9fc5b028ac67fcf70b5f28813cfb455d4b8c` and Q1 test
  `b7b09c617520ffa5eef339139c6e5b61a4b3ea9b`; the donor's corresponding blobs
  were `45239dcd9bfdf657ca4743702d09de3ad00f7668` and
  `9ab71831ab063a24157680ab217c2ea828ace14e`. The integration worktree has
  newer dirty versions of both files, so this disposition covers the committed
  scalar-metadata behavior only, not all current uncommitted deltas.
- Disposition: do not cherry-pick or merge `d01952803` as a whole; its
  identified scalar-metadata fix is already integrated in an extended form.
  Keep the donor checkout and its remaining staged/working changes under the
  existing path-level custody audit. This does not establish Fungi runtime,
  host/FFI, secret-erasure, protected-operation, or RD closure.

### Classical-CLI revocation key-ID donor disposition — 2026-10-13

- The donor's earlier positive-control commit
  `2fe94fbaf63ee46d15abd8ffbe38f4b7dcc9b477` introduced an empty signed
  revocation fixture but used the non-production label `test-revocation-root`.
  Its follow-on `16fb71a21` changed only that label's format; neither donor
  commit is an ancestor of current `main`.
- Main's ancestor commit `86a5ea57a007b36e75d60fc6b8c288110eaac22a` replaced
  the fake-ID fixture with the actual ephemeral key ID generated by CLI
  `keygen`, verifies its production shape, and tests the signed empty-snapshot
  positive control alongside refusal cases. This is the stronger integrated
  disposition for the two narrow donor commits.
- Reconciled donor commit `16fb71a21c41c66de13a0167606feb58a8b63951`, which
  changed the empty-revocation fixture from a non-production label to a
  16-character lowercase-hex key ID. Its changed test blob is
  `1d078ff7edcbff6c972acf0776f1e1a4229431c5`.
- Current `main` already contains the stronger positive-control route in
  ancestor commit `86a5ea57a007b36e75d60fc6b8c288110eaac22a`: it obtains the
  actual ephemeral key ID from CLI `keygen`, checks the production format,
  signs the empty snapshot with that key and separately tests a pinned registry
  signer. The committed test blob is
  `c839b8211e40d9a5d18ae49125de13a026be20c8`; the donor commit is not an
  ancestor of `main`. This disposition applies only to the donor's key-ID
  fixture change, not the donor's other commits or working-tree layers.
- The newer dirty integration-test bytes (SHA-256
  `A8EBAB6787540915F859C642ADD74AB3765134C132260E886B9091F2C246646A`) passed
  the focused classical-signing/refusal test **8/8** on native Windows and
  **8/8** in WSL. These local results include separate-root positive control,
  missing/unsigned/wrong-root/tampered/non-append-only refusals, and refusal
  before dispatch for a revoked key. No GitHub CI ran. The result validates
  this test path only, not the production `/auth/verify` memory operation or
  any RD closure.
- Disposition: do not cherry-pick `16fb71a21` for this one-line fixture
  correction or `2fe94fbaf` as a whole; current `main` has an actual-key
  positive control and the integration worktree has a passing broader
  revision. Keep the donor itself intact while its remaining committed and
  dirty layers are reconciled.

### Isolated CLI-baseline diagnosis donor disposition — 2026-10-13

- Donor commit `1146f91c2335dc3ce9e9a09b6ef0b35922a23ce2` records that the
  earlier classical-CLI positive control failed when isolated from inherited
  Git routing variables, because it expected a production run to succeed
  without a pinned signed revocation snapshot. The donor's changed report blob
  is `01e4d9489ade01305cd1e07468b6264cfc9bd1fb`.
- That diagnosis is present in committed `main`'s report blob
  `8f7565936c72b9792d573cedd79652ed32c97497`, included by integration commit
  `d1939459ecfa53a6d91e5ea28016d3e446d1071c`; the donor commit itself is not
  an ancestor. The current untracked
  `docs/reports/rd1413-cli-revocation-controlled-red-20261013.md` records a
  later controlled-red for invocation of the wrapped export before refusal.
  Its disposable mutant source is not retained in this checkout and was not
  rerun in this turn; the report and TODO identify an Astra PASS for that
  detector-sensitivity claim. The stock current CLI test passed 8/8 on Windows
  and WSL in this turn; the controlled mutant is separate negative-control
  evidence, not a failing stock test.
- Disposition: do not cherry-pick `1146f91c2` solely to add this diagnosis.
  Preserve the historical baseline explanation in main and reconcile the
  current controlled-red report as its own untracked evidence unit. The
  controlled-red is test-wrapper evidence only, not direct Wasm instruction,
  protected-byte, FFI/host, or RD-1413 closure proof.

### Emitted packed-return wasm32 boundary discriminator — 2026-10-13

- Added untracked test `packages-ts/galerina-core-compiler/tests/rd-1414-emitted-packed-return-boundary.test.mjs`
  (current SHA-256 `538ABCCDCEACECFEA229919DF1E3F9F2CC5315733EA9F931AB59D01EC13A916F`)
  against emitter source `src/wat-emitter.ts` (SHA-256
  `2321457E97C417F84D6D7B67BCE3F998F7C8E3351677FC34C26B919B9DC26365`).
  It compiles nested Fungi records, instruments the emitted WAT with a one-page
  memory and simulated capacity operand, executes the emitted packed-return
  export, and covers ordinary and exact-capacity successes plus capacity and
  i32-exclusive-end refusals. The exact-fit result ends at byte 65,536 in the
  actual one-page memory. Refusal cases require the expected `unreachable`
  trap and unchanged final heap/memory observations; no multi-gigabyte memory is
  allocated. Final-state equality is not an execution trace and is not described
  as proof that no transient write occurred.
- Fresh TypeScript output was directed outside the checkout. All 155 generated
  compiler JavaScript files matched the corresponding ignored `dist` files
  byte-for-byte (zero mismatches), including `wat-emitter.js` SHA-256
  `25EB70D56137F0F69E23AA04DB290AB80520D13FE400125E23A9AA057787D861`.
  The checkout's ignored `dist` was not overwritten.
- Compiler package typecheck passed on Windows and WSL. The existing Q1 return
  suite plus the four boundary cases passed **103/103** on each; after extending
  the capacity case through `admitAndInstantiate` and `invokeAdmittedExport`,
  the focused boundary file passed **4/4** on Windows and WSL. In that composed
  case the synthetic out-of-range watermark makes cleanup trap; the wrapper
  reports cleanup failure while retaining the original guard trap, quarantines
  the instance, and a later invocation is refused. A counter at the first
  executable instruction is paired with a raw retry that increments before its
  prologue trap; the admitted retry leaves the counter unchanged. This
  demonstrates fail-closed quarantine on
  cleanup failure, not successful erasure. These remain local
  compiler/bootstrap, emitted-WASM and
  TypeScript runtime-wrapper tests only; they do not demonstrate production
  Fungi/native/FFI/host guarantees, the production `/auth/verify` path, or
  RD-1413/1414/1415 closure.
- Reused Astra reviewer `01a13557-f7e5-72d0-9802-4f73da57d91f`. Initial
  submission `01a135f9-37d0-7c23-a9a0-6bac299dbe18` returned PARTIAL: it
  confirmed the two emitted refusal guards, but noted that final-state equality
  is not an execution trace and an always-refusing mutation passed. Its
  source/dist-identity update `01a135f9-b71f-7b03-982f-1627c6d5390a` matched
  all 155 generated JS files. The success-twin test delta is in follow-up
  submission `01a135fc-2c91-7832-81c9-814d581bbf1a` passed the success-twin
  delta and identified the exact-capacity edge. The final exact-fit control in
  submission `01a135fd-21cc-78c3-ba84-eb190a020fa3` also passed: Astra verified
  an in-memory `>` to `>=` mutation traps at exact capacity while the other
  three cases remain passing. The new composed wrapper path covers quarantine
  after its cleanup trap; ordinary successful cleanup following a trapped
  emitted return and direct transient-write tracing remain separate evidence
  gaps. Astra submission `01a13600-262b-7162-9487-cb5bf794249` passed an earlier
  test hash, reran 4/4 on Windows, observed a no-op wipe mutation fail, and
  confirmed the cleanup-failure/quarantine sequence. Astra then found the
  B8FD... counter was placed after the emitted arena-wipe prologue and failed to
  observe re-entry. The first-instruction counter plus raw retry control passed
  Astra's exact-hash review, submission
  `01a13606-189f-7c03-8a2f-f6e39d9d7970`, with an independent 4/4 Windows rerun
  and mutation that moved the counter after the prologue. WSL 4/4 is Codex-run
  evidence. The insertion is specific to the current emitted WAT format; it is
  not a general parser or runtime-security proof.
  No GitHub CI, staging, commit, push, merge, donor retirement, or unrelated
  working-tree change occurred.

### Value-state loop widening and test-isolation donor disposition — 2026-10-13

- Astra worker `01a136f8-9f55-7ca2-8045-9ef393e8ddda` returned review submission
  `01a136fa-8f75-7280-9501-1bb4f51fd82a`. It verified two findings in the
  integration checkout: provenance-alternative join order can over-distinguish
  equivalent loop states (no wrong result or nonconvergence reproduced), and
  name-only cycle detection can widen a different same-name lexical binding,
  causing a false `FUNGI-SECRET-006` refusal.
- The second finding was reproduced before editing: the parsed shadowing sample
  emitted one `FUNGI-SECRET-006`. The checker now matches captured and target
  bindings by declared source file/line/column when both locations exist, with
  conservative name fallback when location evidence is absent. Its regression
  passes after rebuild. Source SHA-256 is
  `911B6A3B9094C3EC1026D5CF9A7D3CEAD24BD677B84D46ED6AA61F1405543584`; test
  SHA-256 is
  `9063A2E0D8100337AC1965CA41F68DB0C3701FC1890CC2D265B8A03EF7623E85`.
  The code fix is implemented; independent post-fix review submission
  `01a13705-872c-7a30-9c10-fb6aeedf02da` is pending.
- Windows compiler typecheck passed. WSL compiler build emitted TypeScript and
  10 hallmark entries, then build-evidence generation refused because eight
  compiler/test inputs are untracked. The WSL value-state suite passed 331/331,
  zero skipped; this is bootstrap checker evidence only, not Fungi runtime,
  FFI/host, protected-operation or RD closure evidence.
- Donor commit `1288bf86f6134b658b7768d4175b6d9eea1b5f57` is not a clean
  transplant: integration `main` already contains a substantially expanded
  shared Git-environment isolation implementation and larger tests, with four
  of the six donor-touched files differing at committed HEAD. Its focused WSL
  test-runner suite passed 20, failed 0 and skipped 11 WSL-inapplicable tests.
  The donor commit does not include the shared helper itself. Do not cherry-pick
  this older commit wholesale; keep its worktree and remaining layers intact
  until separately reconciled. No staging, commit, push, merge, retirement or
  GitHub Actions/CI occurred.
- Remaining checker delta: add a regression for equivalent branch-join
  provenance permutations and canonicalize that unordered state without
  reordering semantic AST children. Do not claim this over-distinction is a
  security failure unless a concrete erroneous result or nonconvergence is
  demonstrated.
- The AGENTS Anti-Drift self-test passed (71 fixtures); scanning Galerina
  `docs/` returned 15 `MISSING_FILE` findings across 14 documents and 3
  `DUPLICATE_BLOCK` findings. Two reported SuperGrok paths in the coupled-RD
  design spec were confirmed to exist in the separate AGENTS review bucket, so
  those are cross-repository references rather than missing files. The other
  13 missing-file findings and three duplicate blocks remain unadjudicated;
  this scan is not clean. A separate repository-wide search found no current
  Galerina text references to the purged Windows Temp location or clipboard
  filenames.

### Published memory candidate and local donor reconciliation — 2026-10-13

- In donor `memory-consolidation-20261007`, the published candidate commit
  `f2a6a5fe2642c3498528b1d542308a4f3adfd30f` is an ancestor of
  `origin/codex/memory-consolidation-20261007`, but is not an ancestor of local
  donor HEAD `16fb71a21c41c66de13a0167606feb58a8b63951`. This confirms the
  published candidate and current local branch are different custody layers;
  neither substitutes for the other's working tree.
- The published commit changes 47 paths. Comparing its committed blobs with
  the donor's current committed HEAD gives 40 exact matches and 7 differences.
  Comparing those same paths with integration checkout `main` at
  `823c8bc30c34a354e033f597f6477d258e0de488` gives 12 exact matches and 35
  differences. At that integration checkout, all 47 paths exist: the Git
  index has 12 exact candidate blobs and 35 differences; the worktree has 8
  exact candidate contents and 39 differences (including four paths whose
  staged candidate blob was subsequently changed in the worktree). These are
  comparisons of only the published commit's path set, not an integration
  verdict. No path was copied during this check. The donor still has 48 dirty
  status records, and its local branch remains 67 commits ahead / 6 behind its
  tracking ref. Preserve staged, working and ignored layers pending path-level
  disposition; do not merge or push either divergent branch wholesale.
- A second Astra review of loop-provenance deduplication is pending under
  submission `01a1370c-f925-71d3-9fdb-e955de06df10`. Its exact current source
  pins are `value-state-checker.ts` SHA-256
  `FD0214D49AC7AD65D5DF6423BC8851F57D3737A3697E468EA5FF8C60A0B97D1E` and
  `provenance-identity.test.mjs` SHA-256
  `3767732E089F555D957F52186588354E9B52259783E5A6A9D2DFBD2E9059072F`.
  The candidate adds declaration source identity (including parser offsets)
  to provenance equivalence. Native Windows TypeScript compilation succeeded;
  the new focused identity tests passed 2/2 after failing before the change,
  and the full value-state suite passed 333/333 on Windows and WSL. This remains
  checker/bootstrap evidence; independent review, parsed-path challenge
  coverage and the outstanding AST-order determinism question remain open. No
  RD disposition changes.

### Provenance declaration-identity follow-up — 2026-10-13

- Current integration checkout remains `main` at
  `823c8bc30c34a354e033f597f6477d258e0de488`; local `main` is two commits
  ahead of cached `origin/main` and zero behind. Its broad dirty/staged/untracked
  state is preserved.
- The same Astra reviewer identified a deeper repeated-name counterexample and
  a mismatch between provenance equality and loop-widening identity. The new
  test reproduced the comparator failure before the fix (`true` for distinct
  nested leaf declarations). The scoped source now assigns declaration tokens
  at binding registration, retains them through state snapshots/updates,
  traverses provenance recursively with cycle references, and uses the same
  identity rule for widening.
- Verification: Windows `npx tsc -p tsconfig.json` passed; the full compiler
  value-state suite passed **337/337** on Windows and **337/337** on WSL with
  no skips. The WSL run used the locally emitted compiler files. No GitHub
  Actions/CI ran.
- Current pins: `packages-ts/galerina-core-compiler/src/value-state-checker.ts`
  SHA-256 `F2491E82DA5BF13C1520E5BFBC10FDD4D37C04C4227C906CE681025BAC3A7F48`;
  `packages-ts/galerina-core-compiler/tests/value-state/provenance-identity.test.mjs`
  SHA-256 `06825911CE72469DDC58F241CBA4B67736FBF4D5803BF8F4E21C4213B379FBD0`.
- Same-worker Astra follow-up submission
  `01a13716-dd7b-7f00-8213-1f13e7dc9c6a` is pending. In particular, actual
  checker join-order behavior is not directly asserted yet. This remains
  TypeScript/bootstrap evidence, with independent audit pending; it changes no
  memory-RD status and authorizes no integration, staging or publication.

### Q4n/Q5n/Q7 self-hosted WAT pin recheck — 2026-10-13

- Re-ran the full Q4n, Q5n and Q7 test files from the current integration
  checkout on Windows and Ubuntu WSL (Git routing variables unset in WSL).
  Q4n: 15/16 passed; Q5n: 13/14; Q7: 17/18. In each file the single failure
  is the seven-stage generated-WAT digest assertion at the combined
  `lexer.fungi`/`parser.fungi` stage. The independent Q4n T12 and Q5n T14
  historical/current zone identity groups pass 2/2 on both platforms. Thus
  the earlier short description “T14 digest mismatch” is not accurate for the
  named T14 identity test; the outstanding failure is a historical generated
  WAT pin, not a raw lexer-source digest.
- The current combined source emits SHA-256
  `be720ea27f5b265797570683c88740548a1989a56e4ba42db210f8794bad82c3`
  (460295 bytes), versus the test's historical Q5n-B value
  `5f7f235b944d36a7e3cbb16a7d88fe895e19fdd2d2728732235d70bc0975fdd7`
  (425985 bytes). The live integration working lexer differs from HEAD only at
  four record-literal type annotations (`TokenKind.Eof` and `TokenKind.Newline`);
  parser bytes match HEAD. Current combined source is admitted and emits WAT.
  Pairing the HEAD lexer with the current parser instead refuses under the
  current checker with four `FUNGI-TYPE-002` token-layout diagnostics. No old
  pins were changed, and no current source was reverted. A historical-pin
  update or test redesign requires independent review of its original compiler
  and input contract; current output mismatch alone does not authorize either.
- This does not close self-hosted compiler correctness, Fungi runtime/FFI/host
  memory guarantees, or RD-1413/1414/1415. No CI, donor modification,
  integration, staging, commit, push, merge or worktree retirement occurred.

### `memory-current-main` WAMR staged/working slice recheck — 2026-10-13

- Reopened donor `codex/memory-current-main-20261008` at
  `34b419057de49b6437d0b3b9423f3f2bfb205970` and integration `main` at
  `823c8bc30c34a354e033f597f6477d258e0de488`. The donor's staged WAMR
  admission header/source are not its final working bytes: the worktree adds
  contract-kind validation, negative import-count handling, duplicate-import
  refusal, and an explicit linked-import requirement. Keep staged and working
  layers distinct.
- Running the donor's current `scripts/tests/run-rd1413-wamr-context-probe.sh`
  with the pinned WAMR 2.4.5 SDK and Git routing variables unset fails before
  compilation: the donor checkout lacks `rd1413-wamr-context-probe.wat`, the
  first fixture the runner requires. It also lacks the runner's other base
  fixtures and the untracked init-failure wrapper. Do not treat the donor
  runner as passing evidence or transplant it as a complete test bundle.
- The integration checkout contains those base fixtures plus the donor's two
  duplicate/unlinked-import fixtures. The latter remain byte-identical between
  donor worktree and integration index/worktree (`0c298f80e8ff29d001c38aa058e633269a2aeecd`,
  `458ea7cfdfcbce4256d9b98909687aa965987a7a`). Integration's admission C,
  header, probe and runner have different working bytes from the donor; its
  current runner also contains additional metadata-failure, externref-result
  and initialization-cleanup controls. This is evidence that the donor's
  WAMR slice cannot be copied wholesale; compare the specific behavior before
  disposition.
- Re-ran the integration runner against the exact pinned SDK at
  `/home/phill/.local/opt/wamr-2.4.5-sdk` with Git routing variables unset.
  Exit 0; all 19 expected PASS markers appeared, covering closed import
  allowlisting and signature/type checks, duplicate/unlinked/non-function
  imports, per-instance context, metadata-failure refusal, input-size bounds,
  registration-refusal cleanup and failed-init cleanup. The pinned
  `wasm_export.h`, `lib_export.h` and `libiwasm.a` SHA-256 values were
  respectively `779ee0870da26f129afe26f58881d286e0bef1537d995acf9cdd27c8a50c3ee0`,
  `19c182c07246c971eee6c54ddf5bd552fcb5fee91be6970681815c0d19ea1264`, and
  `f21702522f6ce032193ac0529a95f841be044730a0b1c237f17ebb0d61f0104d`.
  Current integration pins: admission header `6a6d8b612171812bdab62996dd1042854b379ab63de10faece1039355f0a6405`,
  admission C `fd6a19e36758e7359375c4ebf6c8117667b168827df968d5d1adefd745edd15d`,
  probe `6bf3e231e8b3f44d9c445f4c2382589f9299912a1751f84587f8b944a45c92bc`,
  init wrapper `030a6ddd6becfc81fd3c9cccdbee800d7c52bcebbffa655fed67aa4100e084b6`,
  and runner `c4edd6e65871f5b3f755494f257482c07a58e486bb81b83abb163248115789b5`.
  This is evidence for this pinned WAMR ABI/admission and cleanup probe only;
  it does not establish Fungi memory semantics, production protected I/O or RD
  closure. No donor or integration source, index, branch or worktree was
  changed; no CI, commit, push, merge or retirement occurred.
