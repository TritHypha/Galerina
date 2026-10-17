# CONSOLIDATION-NOTES: memory TS reference branch (2026-10-18)

Branch `grok/memory-ts-consolidated-20261018`, worktree `Galerina/.worktrees/memory-ts-consolidated-20261018`, created by Grok (git merges only, no code edits) on Phillip's 00:03 BST instruction. Base: main `bdb5d1baa9fd97a3b0ac8a16cb074809a2d00567`.

Purpose: one place holding every unresolved TypeScript memory head, as the frozen TS reference / test oracle and the conversion input for the .fungi memory briefs (converter sequence: AGENTS code-logic-workbench, then translating-typescript-to-fungi, then writing-fungi). This branch is NEVER merged to main and has no PR. The original PRs stay open. Nothing here is fixed in TS; failures below are recorded for the .fungi build. NON_AUTHORIZING: RD-1413/1414/1415 stay HOLD.

## Merged heads (stack order; each head = `git ls-remote` at 2026-10-18 00:06 BST; `git merge --no-ff`, `[skip ci]`)

| # | source | head | latest Grok independent check (grok-scratch/memory-goal-20261014) | verdict |
|---|---|---|---|---|
| 1 | PR #182 (WAMR host, fix9) | `8f7eec4f8b387fcfeabe89bcf737450c95d2d888` | grok-independent-check-182-fix9-8f7eec4f-20261017.md (sha256 7ff460c5a2ab94c08954c2d12b9e5343055767cab71bf6156daf9ffd31ada2c5) | PASS-WITH-NOTES |
| 2 | PR #183 (VOK verifier, fix8) | `ae47960561e1e4d88bdf3942041359d9455ba4ed` | grok-independent-check-183-fix8-ae479605-20261017.md (f00be83e976d168816a4d37cd680fc9653ac501d601163533b8f57de290c8ced) | PASS-WITH-NOTES |
| 3 | PR #185 (Signet gate 1) | `33854dcede1160a44d3890cf01d66f76a4ab6d4a` | grok-independent-check-signet-fix-ic185-33854dced-20261017.md (bace8aff4ec28d2e28070cde6162f2f023a25d3edbfd72cf58f75110b1a86415) | PASS-WITH-NOTES |
| 4 | PR #186 (auth-verify effect/failure contract spec) | `ee1d33d9d5b9e421d377ba9d1780f4d126e75e47` | grok-independent-check-186-20261017.md (49ee9c4e6725f4b21c969b2a67c19152a9b70b92e8b7108360341f674a990383) | FAIL |
| 5 | PR #188 (serve-gate residual) | `2f3f4a7d74e6d5d512fcdabb697233d55e542a44` | grok-independent-check-188-20261017.md (33013b04ae71e8a18a9283d9c51c0a50585ec7ec1e0b4227067a586dd1385ed7) | FAIL |
| 6 | PR #190 (U4 ack/recovery) | `dd591c31bf799d0b5a520aeb9f8efa7b80de0ee0` | grok-independent-check-u4-dd591c31-20261017.md (4a6f7d814adb5c4fe291c0b917e8bac4d4b78f0da88830b3e2abfff85fd5d44f) | PASS-WITH-NOTES |
| 7 | PR #192 (U4 overflow/epoch typing) | `665f0bce69233ca7a4dd5e6f505833bbdaa968bf` | grok-independent-check-u4overflow-665f0bce-20261017.md (dc42d93a0260c3e117c56d635ab5abf07aaa032c50df1f066d0a8f047e70c5a7) | PASS-WITH-NOTES |
| 8 | queue 24 branch grok/memory-kernel-finalize-order-20261017 (PARKED_TS_REFERENCE) | `93934967ef72e4fc711754775760c18b10f1d240` | grok-independent-check-q24-93934967-20261017.md (6c0940fa20a05fa612bf9ca2bd823cb3b0d18215b5fc6f9d78dde146c624829c) | FAIL |
| 9 | PR #191 (U6 artifact digest binding) | `b67acb23367f6122344a71f43238c8d62fe5a777` | grok-independent-check-u6-b67acb23-20261017.md (c4a1f492fc7287881d03541c71467453ea700d38446e3a2a4e5f3b0846a69e88) | PASS-WITH-NOTES |
| 10 | #187 fix branch grok/memory-auth-verify-route-fix-ic187-20261017 (PARKED_TS_REFERENCE; PR #187 head itself is c7bd2daa) | `b59598787fdbeaccafe2f2d2daf062170dd17a05` (no push after parking) | grok-independent-check-ic187fix6-b5959878-20261017.md (834aaaeee8a211878f3980a5e4e6683c726e06c19f045248b1f5cca927af96ba) | FAIL |

Note: merging #185 brings along PR #156's roadmap commits (its stack base). That is accepted on this non-main branch only.

## Conflict resolutions (all in the #185 merge; every other merge was clean)

| file | resolution | reason |
|---|---|---|
| docs/TODO.md (1 hunk) | both sides kept (main memory-review checkpoint first, then #156 "Current state 2026-10-06" census) | append-style Markdown; no content lost |
| docs/ROADMAP.md hunk 1 | both sides kept (main first, then #156) | append-style Markdown |
| docs/ROADMAP.md hunk 2 (generated Assurance DAG root line) | main side kept | generated one-liner; two roots would be contradictory; both read UNKNOWN |
| packages-ts/galerina-core-compute/TODO.md (1 hunk) | both kept ([HOLD] quantum row with SuperGrok pin notes, then [!] POST-V1 O1 row) | both are holds; keeping both loses no owner decision |
| scripts/component-health.mjs (memory-retention row) | main side kept | stricter wording ("hosted receipts were not independently reverified") and one array entry only; `node --check` passes |
| build/component-health/percent-audit.{html,json}, percent-provenance.json, build/roadmap/provenance.json, build/roadmap/roadmap.svg | main side kept | generated artifacts; not hand-mergeable; regenerate later |

No unsafe conflict: nothing was resolved to the weaker side.

## Composition failures found by merging (new; not fixed in TS)

| id | finding | obligation ids (brief 29) |
|---|---|---|
| CN-1 | Two copies of the one boundary helper: `readForeignSafeInteger` / `ForeignNumberRead` exported from both `secret-gate.ts` (queue 24 / #192 line) and `foreign-boundary.ts` (#187 fix); `src/index.ts` star re-export is ambiguous (tsc TS2308 x2), so ESM importers of those names fail to load. Confirms u4overflow N1 (helper duplication on composition) and breaks Phillip's one-helper rule. | NO_NULL_NAN, SEALED_INTRINSICS |
| CN-2 | `auth-verify-route.ts` (#187 fix) reads `.state` on `OperationRecoveryStatus`, whose shape changed in #190/#192 (tsc TS2339 x2, TS2322 `any` into `never` in the exhaustive arm). The route's recovery switch no longer type-checks against the authority, so its exhaustive fail-closed arm is not proven. | TOTAL_EFFECT_OUTCOME, EXHAUSTIVE_FAIL_CLOSED |
| CN-3 | Full app-kernel suite rewrites five tracked `tests/secret-arena-fake-*` fixtures in place (pre-existing, U3 N2 / u4overflow N6). | LINEAR_SECRET (test custody), BOUNDED_INPUT |

## Open findings carried from each head (mapped to brief 29 obligation ids)

Ids are the brief 29 set: NO_NULL_NAN, EXHAUSTIVE_FAIL_CLOSED, TOTAL_EFFECT_OUTCOME, LINEAR_SECRET, BOUNDED_INPUT, SEALED_INTRINSICS, UNFORGEABLE_CAPABILITY, DEADLINE_COVERS_ALL, MONOTONIC_TYPED_TIME, NO_AMBIENT_AUTHORITY, plus UNKNOWN_IN_TS / OBLIGATION_UNMAPPABLE.

| id | head | finding (open at that head) | obligation ids |
|---|---|---|---|
| C182-N1 | #182 | caller-pending SIGPIPE preservation has no shipped test (Grok S4b green) | EXHAUSTIVE_FAIL_CLOSED, NO_AMBIENT_AUTHORITY |
| C182-N2 | #182 | pinned child that forks leaves a live grandchild holding the pipe | LINEAR_SECRET, DEADLINE_COVERS_ALL |
| C182-N3 | #182 | R3 deadline margin 5 ms (6005 vs 6000 ms) | DEADLINE_COVERS_ALL, MONOTONIC_TYPED_TIME |
| C182-N4 | #182 | setup-failure paths use blocking waitpid after SIGKILL | DEADLINE_COVERS_ALL |
| C182-N5 | #182 | reap on ECHILD refuses (availability only; doc) | TOTAL_EFFECT_OUTCOME |
| C183-N4 | #183 | Rust Option Some/None match without `_` under the owner Rust exception (Grok ZT interpretation, pending Phillip) | EXHAUSTIVE_FAIL_CLOSED |
| C183-N5 | #183 | probe `--digest` asserts rc only (typed id pinned by cli_verifier.rs) | TOTAL_EFFECT_OUTCOME |
| C183-N6 | #183 | `.expect` invariants, verifier copy not wiped, magic+hash only (accepted as recorded) | LINEAR_SECRET, UNFORGEABLE_CAPABILITY |
| C185-N1 | #185 | identity default arm / copy path ASSURED mutants green (default unreachable) | EXHAUSTIVE_FAIL_CLOSED |
| C185-N2 | #185 | `setAfterHelperPinnedHook` ESM export (env-gated test seam) | NO_AMBIENT_AUTHORITY, SEALED_INTRINSICS |
| C185-N3 | #185 | node suite green under R1; behavioural pin only in Rust cargo test | EXHAUSTIVE_FAIL_CLOSED |
| C185-N4 | #185 | 1632 stale /tmp/gate1-* dirs from older runs | LINEAR_SECRET |
| C186-F1 | #186 | ACK refusal outcome unspecified | TOTAL_EFFECT_OUTCOME |
| C186-F2 | #186 | clock and deadline values not typed | MONOTONIC_TYPED_TIME, DEADLINE_COVERS_ALL |
| C186-F3 | #186 | receipt has no algorithm-suite binding (conflicts with owner hybrid, swappable v1 crypto ruling) | UNFORGEABLE_CAPABILITY |
| C186-N1..N6 | #186 | wrong F-24 cross-ref; no explicit exhaustive default row; F-26 quarantine "no"; Q8 overstates epoch control; F-13 code conflation and HTTP 499; unknown-field refusal conditional | EXHAUSTIVE_FAIL_CLOSED (N2, N6), LINEAR_SECRET (N3), MONOTONIC_TYPED_TIME (N4), TOTAL_EFFECT_OUTCOME (N1, N5), BOUNDED_INPUT (N6) |
| C188-F1 | #188 | the PR's single claim is pinned by source text only | EXHAUSTIVE_FAIL_CLOSED |
| C188-F2 | #188 | two serve() layers untested behaviourally (M7 green) | NO_AMBIENT_AUTHORITY, EXHAUSTIVE_FAIL_CLOSED |
| C188-N1 | #188 | serve-gate suite hangs under M4/M5/M6 instead of going red | DEADLINE_COVERS_ALL |
| C188-N2 | #188 | `normalizeDeclaredRoutePath` / `compileDeclaredPathPattern` return null as uncertainty; null path -> "not protected" (pre-existing on main) | NO_NULL_NAN, EXHAUSTIVE_FAIL_CLOSED |
| C188-N3 | #188 | 13 pre-existing tsc errors on main (core-compiler) | UNKNOWN_IN_TS |
| C190-N1 | #190 | tombstone overflow lets an old op read NOT_FOUND and be re-minted (FIXED at #192, kept as regression row) | TOTAL_EFFECT_OUTCOME, UNFORGEABLE_CAPABILITY |
| C190-N2..N5 | #190 | parallel-suite U3 race; NaN-epoch consume mutant green (FIXED at #192); default arm lost `never` check (FIXED at #192); test fakes chmod | MONOTONIC_TYPED_TIME, NO_NULL_NAN, EXHAUSTIVE_FAIL_CLOSED, LINEAR_SECRET |
| C192-N1 | #192 | helper duplication on composition (now real: CN-1) | NO_NULL_NAN |
| C192-N2 | #192 | after 2049 terminal ops every caller-supplied id is refused forever (availability limit) | TOTAL_EFFECT_OUTCOME |
| C192-N3 | #192 | `ack` with epoch omitted skips the epoch comparison | MONOTONIC_TYPED_TIME, UNFORGEABLE_CAPABILITY |
| C192-N4 | #192 | fallback nonce `u4-auth-${n}` predictable when randomUUID missing | UNFORGEABLE_CAPABILITY, SEALED_INTRINSICS |
| C192-N5 | #192 | non-released ack outcome uses a ternary, not a `never` switch | EXHAUSTIVE_FAIL_CLOSED |
| C192-N6 | #192 | full suite rewrites tracked fixtures (CN-3) | LINEAR_SECRET |
| C191 | #191 | no open F/N rows in its check (F1, F2, N2-N4 FIXED); kept as regression rows | UNFORGEABLE_CAPABILITY |
| P24-* | queue 24 | P24-F1..F4, P24-N1..N4, P24-R1 (see parked-ts-findings-for-fungi.md, sha256 b1014a473e6ac75f24377b0cbf035ba923f9649e6864c616ca8d6684aad4c28e) | as listed there |
| P20-* | #187 fix | P20-F1, P20-F2, P20-N2, P20-N3, P20-N5, P20-R1, P20-R2 (same file). Owner answer 00:03: overlapping/duplicate chunks are refused outright (P20-F1) | as listed there; P20-F1 adds BOUNDED_INPUT + LINEAR_SECRET as required |

No finding is OBLIGATION_UNMAPPABLE. Every row above must be discharged by construction in .fungi or carried as a typed refusal / typed UNKNOWN; Grok's independent checks confirm this per unit.

## WSL test run at consolidation head 6f51b07a (before this notes commit; Grok, node v24.20.0, cargo 1.93.1; script grok-scratch mgd-0005-consol-test.sh, output mgd-0005-consol-test.out)

| suite | head 6f51b07a | main bdb5d1ba | note |
|---|---|---|---|
| conflict markers in tree | none | n/a | |
| app-kernel tsc --noEmit | 5 errors (CN-1, CN-2) | 0 | composition failure |
| app-kernel full suite, serial | 840 tests, 784 pass, 55 fail, 1 skipped | 677 tests, 662 pass, 14 fail, 1 skipped | 41 HEAD-only failing tests (auth-verify route, rd1415 negatives, secret-arena), 0 base-only; most likely from CN-1/CN-2 (not diagnosed further: TS is frozen) |
| RD-1413 core-compiler rd1413-serve-gate x3 | 36/36 x3 | blob identical (b5f35642) | green |
| rd1413-serve-gate-residual (#188) | 1/1 | n/a | green |
| tri-pipe artifact-digest-binding, slide-admission-request (#191) | both files fail to load (not ok 1, 0 pass) | not run | INCONCLUSIVE (likely unbuilt deps in the scratch clone; counted as failing) |
| scripts/tests/assurance-authenticated-host (#185) | 32 tests, 15 pass, 17 fail | not run | INCONCLUSIVE environment vs composition; counted as failing |
| run-signet-gate1.sh (#185) | rc 0, "signet gate 1 PASS" | n/a | green |
| run-rd1413-wamr-load-path-probe.sh, run-rd1413-wamr-vok-handoff-probe.sh (#182/#183) | rc 2: WAMR_ROOT not set in the clean WSL clone | n/a | UNKNOWN (not run) |
| vok-authority cargo test (#183, Rust out-of-process verifier) | rc 0 (79 + 10 + 3 + 20 pass, 9 ignored) | n/a | green |

Failures are expected and recorded, not fixed in TS. The scratch clones were removed after the run.