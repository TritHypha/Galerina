# Galerina worktree and branch consolidation flags — 2026-10-11

Snapshot only; refresh before acting. This is a per-item triage ledger, not merge or deletion authority.

## Build identity and scope

- Local `main` and `origin/main`: `c46e1e01b4c33fa6d540550482deaf4b44dcc7c6`.
- Git registrations: 19 worktrees, including 10 carrying Git lock metadata.
- Refs: 34 local branches (including `main`) and 33 actual `origin/*` tracking branches (including `origin/main`); four additional cached `pr/*` refs exist and are counted separately.
- Relative to local `main`, 30 of 33 non-main local branches contain graph-unique commits. Relative to `origin/main`, 26 of 32 non-main origin refs contain graph-unique commits.
- Audit-map plan SHA-256 `416961e565e7e8f76aaaea29c1373d20ee95f961d8d583a119bdb1a48ce8dba4`; inventory script SHA-256 `ED83C1EE4B5F7A248F939C0BA22EBD55853583ACCE418C3BF46C41C9CD7BFDE5`.
- Dirty counts are Git porcelain status entries: staged / unstaged / untracked / conflicts. A path modified in both index and worktree can contribute to both staged and unstaged counts.

## Flag meanings

- `LOCKED/PRESERVE`: Git registration has a lock; preserve and read its exact reason before any action.
- `DIRTY/RECONCILE`: staged, unstaged, untracked or conflict entries exist; reconcile custody path by path.
- `UNIQUE-COMMITS/REVIEW`: the HEAD contains commits not reachable from the stated `main`; inspect patches and equivalence before deciding to integrate.
- `ANCESTOR-TIP/ONLY`: HEAD is an ancestor of `main`; this says nothing about dirty overlay content, PR closure or retirement permission.
- `DETACHED/REVIEW`: checkout has no attached branch.
- `IGNORED?`: ignored files were deliberately not enumerated; recoverability is not established.
- `PR?`: open-PR state was not queried; branch-retirement eligibility is not established.
- `CHECKED-OUT` / `NO-CHECKOUT`: local association only; not a statement that a process is active.

An ancestry count is not the number of changes to merge. Squash-equivalent work, patch-equivalent commits, generated outputs and dirty overlays require separate evidence. No branch, worktree or file was changed for this inventory.

## Worktrees — refreshed ignored-path and PR flags (2026-10-11)

The original worktree flag cells below retain their snapshot shorthand; where they say `IGNORED?` or `PR?`, use the live per-worktree table and PR crosswalk immediately below as the replacement evidence.

| Worktree label | Branch / HEAD | HEAD | Behind/ahead `main` | Staged/unstaged/untracked/conflict | Flags |
|---|---|---:|---:|---:|---|
| `primary-checkout` | detached | `9a26c71e60` | 199/10 | 46/43/10/0 | DIRTY/RECONCILE; UNIQUE-COMMITS/REVIEW; DETACHED/REVIEW; IGNORED?; PR? |
| `.worktrees/codex-pr169-runtime` | `grok/core-runtime-bounded-native-floor-refusal` | `246494403a` | 168/3 | 0/0/0/0 | UNIQUE-COMMITS/REVIEW; IGNORED?; PR? |
| `.worktrees/grok-baseline-05eb5c29-20261002` | `grok/wat-parked-memory-20261002` | `1ea29bd2b5` | 558/8 | 0/0/0/0 | UNIQUE-COMMITS/REVIEW; IGNORED?; PR? |
| `.worktrees/grok-wat-integration-candidate-20261003` | `grok/wat-integration-candidate-20261003` | `3ac9f8b150` | 558/16 | 0/1/0/0 | DIRTY/RECONCILE; UNIQUE-COMMITS/REVIEW; IGNORED?; PR? |
| `.worktrees/memory-consolidation-20261007` | `codex/memory-consolidation-20261007` | `16fb71a21c` | 80/7 | 2/48/0/0 | DIRTY/RECONCILE; UNIQUE-COMMITS/REVIEW; IGNORED?; PR? |
| `.worktrees/memory-current-main-20261008` | `codex/memory-current-main-20261008` | `34b419057d` | 99/0 | 48/8/2/0 | DIRTY/RECONCILE; IGNORED?; PR? |
| `.worktrees/memory-main-baseline-20261009` | `main` | `c46e1e01b4` | 0/0 | 9/87/11/0 | DIRTY/RECONCILE; IGNORED?; PR? |
| `.worktrees/rd-0855-detached-authority-detectors-workspace/Galerina` | `codex/rd-0855-detached-authority-detectors` | `11ed604052` | 1689/25 | 0/0/0/0 | LOCKED/PRESERVE; UNIQUE-COMMITS/REVIEW; IGNORED?; PR? |
| `.worktrees/rd-0873-native-fungi-bootstrap-implementation` | detached | `e1c2496f3f` | 341/0 | 36/5/13/0 | LOCKED/PRESERVE; DIRTY/RECONCILE; DETACHED/REVIEW; IGNORED?; PR? |
| `.worktrees/rd1246-scalar-chain-spike` | `codex/rd1246-scalar-chain-spike` | `e8f1b68235` | 561/0 | 0/4/1/0 | LOCKED/PRESERVE; DIRTY/RECONCILE; IGNORED?; PR? |
| `external-worktree/moving/galerina-pkg-cc` | detached | `2e9e861109` | 199/1 | 0/0/0/0 | UNIQUE-COMMITS/REVIEW; DETACHED/REVIEW; IGNORED?; PR? |
| `external-worktree/pin/Galerina` | `grok/slide-registered-consumer-rd0858-20261004` | `9fab336123` | 420/1 | 0/1/0/0 | RETIRED-AFTER-SNAPSHOT; see post-snapshot disposition below |
| `external-worktree/moving/Galerina-branch-archive-20260823` | `archive/pre-consolidation-2026-08-23` | `307050e282` | 1514/80 | 0/0/0/0 | LOCKED/PRESERVE; UNIQUE-COMMITS/REVIEW; IGNORED?; PR? |
| `external-worktree/moving/Galerina-codex-canonical-close-2026-08-08` | `codex/galerina-canonical-close-2026-08-08` | `101386a168` | 2805/7 | 0/22/0/0 | LOCKED/PRESERVE; DIRTY/RECONCILE; UNIQUE-COMMITS/REVIEW; IGNORED?; PR? |
| `external-worktree/moving/Galerina-codex-final-close-2026-08-08` | `codex/galerina-final-close-2026-08-08` | `86ad43d1c8` | 2805/9 | 0/0/0/0 | LOCKED/PRESERVE; UNIQUE-COMMITS/REVIEW; IGNORED?; PR? |
| `external-worktree/moving/Galerina-codex-final2-close-2026-08-08` | `codex/galerina-final2-close-2026-08-08` | `9094da6c1e` | 2805/33 | 0/1/0/0 | LOCKED/PRESERVE; DIRTY/RECONCILE; UNIQUE-COMMITS/REVIEW; IGNORED?; PR? |
| `external-worktree/moving/Galerina-codex-fresh-verify-2026-08-08` | `codex/galerina-fresh-verify-2026-08-08` | `7ee76040d3` | 2805/5 | 0/0/0/0 | LOCKED/PRESERVE; UNIQUE-COMMITS/REVIEW; IGNORED?; PR? |
| `external-worktree/moving/Galerina-codex-stable-close-2026-08-08` | `codex/galerina-stable-close-2026-08-08` | `c63020ca7a` | 2805/3 | 0/0/0/0 | LOCKED/PRESERVE; UNIQUE-COMMITS/REVIEW; IGNORED?; PR? |
| `external-worktree/moving/Galerina-detached-scalar-phase1` | `codex/detached-scalar-phase1` | `354cb7e4c9` | 1700/20 | 0/0/0/0 | LOCKED/PRESERVE; UNIQUE-COMMITS/REVIEW; IGNORED?; PR? |

### Per-worktree ignored-path and exact PR-head flags

The ignored column is the number of top-level/path matches reported by `git status --ignored=matching --untracked-files=normal` for that checkout. It is **not** a file count or byte total: ignored directories are listed once rather than traversed. No ignored payload contents were read. `PAYLOAD-UNREVIEWED` therefore remains on every row. The PR column is an exact branch-name match against all 174 PR records returned by the live GitHub query; “no exact PR record” does not prove that the worktree's content is already integrated or irrelevant.

| Worktree | Ignored matches | Exact PR-head flag | Custody flag |
|---|---:|---|---|
| `primary-checkout` | 957 | DETACHED; no branch-head match | PAYLOAD-UNREVIEWED; DIRTY/RECONCILE |
| `.worktrees/codex-pr169-runtime` | 23 | OPEN #169 | PAYLOAD-UNREVIEWED; UNIQUE-COMMITS/REVIEW |
| `.worktrees/grok-baseline-05eb5c29-20261002` | 112 | No exact PR record | PAYLOAD-UNREVIEWED; UNIQUE-COMMITS/REVIEW |
| `.worktrees/grok-wat-integration-candidate-20261003` | 197 | No exact PR record | PAYLOAD-UNREVIEWED; DIRTY/RECONCILE |
| `.worktrees/memory-consolidation-20261007` | 60 | No exact PR record | PAYLOAD-UNREVIEWED; DIRTY/RECONCILE |
| `.worktrees/memory-current-main-20261008` | 33 | No exact PR record | PAYLOAD-UNREVIEWED; DIRTY/RECONCILE |
| `.worktrees/memory-main-baseline-20261009` | 168 | Main checkout; PR-head flag N/A | PAYLOAD-UNREVIEWED; DIRTY/RECONCILE |
| `.worktrees/rd-0855-detached-authority-detectors-workspace/Galerina` | 39 | No exact PR record | PAYLOAD-UNREVIEWED; LOCKED/PRESERVE |
| `.worktrees/rd-0873-native-fungi-bootstrap-implementation` | 980 | DETACHED; no branch-head match | PAYLOAD-UNREVIEWED; LOCKED/PRESERVE; DIRTY/RECONCILE |
| `.worktrees/rd1246-scalar-chain-spike` | 30 | No exact PR record | PAYLOAD-UNREVIEWED; LOCKED/PRESERVE; DIRTY/RECONCILE |
| `external-worktree/moving/galerina-pkg-cc` | 2 | DETACHED; no branch-head match | PAYLOAD-UNREVIEWED |
| `external-worktree/pin/Galerina` | 22 | MERGED #40 | PAYLOAD-UNREVIEWED; DIRTY/RECONCILE |
| `external-worktree/moving/Galerina-branch-archive-20260823` | 0 | No exact PR record | LOCKED/PRESERVE; PAYLOAD-UNREVIEWED |
| `external-worktree/moving/Galerina-codex-canonical-close-2026-08-08` | 209 | No exact PR record | LOCKED/PRESERVE; PAYLOAD-UNREVIEWED; DIRTY/RECONCILE |
| `external-worktree/moving/Galerina-codex-final-close-2026-08-08` | 100 | No exact PR record | LOCKED/PRESERVE; PAYLOAD-UNREVIEWED |
| `external-worktree/moving/Galerina-codex-final2-close-2026-08-08` | 345 | No exact PR record | LOCKED/PRESERVE; PAYLOAD-UNREVIEWED; DIRTY/RECONCILE |
| `external-worktree/moving/Galerina-codex-fresh-verify-2026-08-08` | 312 | No exact PR record | LOCKED/PRESERVE; PAYLOAD-UNREVIEWED |
| `external-worktree/moving/Galerina-codex-stable-close-2026-08-08` | 114 | No exact PR record | LOCKED/PRESERVE; PAYLOAD-UNREVIEWED |
| `external-worktree/moving/Galerina-detached-scalar-phase1` | 346 | No exact PR record | LOCKED/PRESERVE; PAYLOAD-UNREVIEWED |

### Live pull-request state and branch crosswalk

Read-only query returned 174 PR records: 5 OPEN, 160 MERGED and 9 CLOSED-unmerged. The five currently open PRs are:

| PR | Head branch | Worktree match | Flag |
|---:|---|---|---|
| #80 | `grok/core-network-hold-unlocks-20261005` | none | OPEN; no checkout |
| #156 | `grok/roadmap-todo-refresh-20261006` | none | OPEN; no checkout |
| #158 | `supergrok/core-photonic-o1-refusals-20261007` | none | OPEN; no checkout |
| #159 | `grok/core-compute-quantum-refusal` | none | OPEN; no checkout |
| #169 | `grok/core-runtime-bounded-native-floor-refusal` | `.worktrees/codex-pr169-runtime` | OPEN; checked out |

#### Cached PR refs — individually checked, read-only

| Cached ref | Tip | Commits not reachable from `main` | Live PR state | Disposition flag |
|---|---|---:|---|---|
| `pr/135` | `89f6265b4` | 1 | #135 CLOSED, unmerged | CONTENT-REVIEW; do not retire yet |
| `pr/144` | `67ed2c5eb` | 2 | #144 CLOSED, unmerged; stacked on #135 | CONTENT-REVIEW; inspect with #135 |
| `pr/165` | `f7b9d6b86` | 0 | #165 MERGED | VERIFY-TREE-EQUIVALENCE |
| `pr/169` | `246494403` | 3 | #169 OPEN, draft, merge state DIRTY | ACTIVE; preserve |

Other exact PR-head matches on registered worktree branches: `grok/slide-registered-consumer-rd0858-20261004` → MERGED #40. The full origin-ref scan also found: `grok/ai-agent-declaration-contracts-20261005` → MERGED #71; `grok/api-server-todo-followups-20261006` → CLOSED #144; `grok/api-server-todo-hold-reconcile-20261006` → CLOSED #135; `grok/app-frame-hardening-20261003` → CLOSED #4; `grok/core-cli-build-command-20261005` → MERGED #101; `grok/core-cli-build-contracts-20261005` → MERGED #100; `grok/core-cli-plan-command-20261005` → MERGED #99; `grok/core-cli-plan-contracts-20261005` → MERGED #98; `grok/core-cli-verify-runtime-20261005` → MERGED #92; `grok/core-compute-taxonomy-20261005` → CLOSED #83; `grok/core-vector-photonic-proposal-guard-20261005` → MERGED #70; `grok/docs-protected-operation-spec-20261006` → CLOSED #137; `grok/tools-benchmark-command-wiring-20261006` → CLOSED #149; `grok/tri-pipe-trifuse-row-rd0855-20261006` → CLOSED #145; and `supergrok/core-photonic-o1-refusals-20261007` → OPEN #158. All other scanned origin branch names had no exact head-branch match among the 174 returned PR records. A PR state is not a content-equivalence or safe-retirement verdict.

## Local branch refs — all 34 flagged

`Δ` is `behind/ahead` relative to local `main`.

| Branch | Tip | Δ | Checkout | Flag |
|---|---:|---:|---|---|
| `archive/pre-consolidation-2026-08-23` | `307050e282` | 1514/80 | `external-worktree/moving/Galerina-branch-archive-20260823` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW |
| `codex/candidate-pr158-main-merge-20261008` | `cb8421492f` | 101/4 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `codex/detached-scalar-phase1` | `354cb7e4c9` | 1700/20 | `external-worktree/moving/Galerina-detached-scalar-phase1` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW |
| `codex/fix-secret-scan-ci` | `9ea824399a` | 3451/1 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `codex/galerina-canonical-close-2026-08-08` | `101386a168` | 2805/7 | `external-worktree/moving/Galerina-codex-canonical-close-2026-08-08` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW |
| `codex/galerina-final-close-2026-08-08` | `86ad43d1c8` | 2805/9 | `external-worktree/moving/Galerina-codex-final-close-2026-08-08` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW |
| `codex/galerina-final2-close-2026-08-08` | `9094da6c1e` | 2805/33 | `external-worktree/moving/Galerina-codex-final2-close-2026-08-08` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW |
| `codex/galerina-fresh-verify-2026-08-08` | `7ee76040d3` | 2805/5 | `external-worktree/moving/Galerina-codex-fresh-verify-2026-08-08` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW |
| `codex/galerina-stable-close-2026-08-08` | `c63020ca7a` | 2805/3 | `external-worktree/moving/Galerina-codex-stable-close-2026-08-08` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW |
| `codex/memory-consolidation-20261007` | `16fb71a21c` | 80/7 | `.worktrees/memory-consolidation-20261007` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW |
| `codex/memory-current-main-20261008` | `34b419057d` | 99/0 | `.worktrees/memory-current-main-20261008` | CHECKED-OUT; ANCESTOR-TIP/ONLY |
| `codex/rd-0855-detached-authority-detectors` | `11ed604052` | 1689/25 | `.worktrees/rd-0855-detached-authority-detectors-workspace/Galerina` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW |
| `codex/rd-0858-unit4-process-root` | `88c43afc89` | 1051/8 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `codex/rd-0874-0945-paper-screen` | `570c833ef9` | 1258/2 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `codex/rd0873-docs-index-manifest` | `34907348c5` | 1125/2 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `codex/rd0873-local-integration` | `0ee6862146` | 1078/10 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `codex/rd0873-pre-restart-docs-20260905` | `4143efcb64` | 1127/1 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `codex/rd0873-task6d-cumulative` | `5b234d91b0` | 1124/4 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `codex/rd1246-scalar-chain-spike` | `e8f1b68235` | 561/0 | `.worktrees/rd1246-scalar-chain-spike` | CHECKED-OUT; ANCESTOR-TIP/ONLY |
| `codex/rd1413-1415-coupled-route-20261004` | `eda327e47c` | 140/1 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `fix/absorbed-kb-links-20261009` | `468ef12c32` | 1/0 | none | NO-CHECKOUT; ANCESTOR-TIP/ONLY |
| `grok/app-frame-response-contract-20261003` | `f19604d734` | 557/4 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `grok/app-frame-response-contract-v2-20261003` | `97a7f4e93f` | 554/2 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `grok/core-compute-taxonomy-20261005` | `6126cb3eab` | 341/2 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `grok/core-network-hold-unlocks-20261005` | `ce5437cd6e` | 117/5 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `grok/core-runtime-bounded-native-floor-refusal` | `246494403a` | 168/3 | `.worktrees/codex-pr169-runtime` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW |
| `grok/diag-constants-20261002` | `c9f0453aef` | 558/2 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `grok/interpreter-i2-i3-20261002` | `ce68d61813` | 558/1 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `grok/slide-registered-consumer-rd0858-20261004` | `9fab336123` | 420/1 | `external-worktree/pin/Galerina` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW |
| `grok/todo-sync-20261004` | `60be8ebacf` | 394/2 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |
| `grok/wat-integration-candidate-20261003` | `3ac9f8b150` | 558/16 | `.worktrees/grok-wat-integration-candidate-20261003` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW |
| `grok/wat-parked-memory-20261002` | `1ea29bd2b5` | 558/8 | `.worktrees/grok-baseline-05eb5c29-20261002` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW |
| `main` | `c46e1e01b4` | 0/0 | `.worktrees/memory-main-baseline-20261009` | CHECKED-OUT; ANCESTOR-TIP/ONLY |
| `prototype/hardening-residency` | `5a927a6f57` | 4073/6 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW |

## Origin tracking refs — all 33 flagged; PR state unchecked

`Δ` is `behind/ahead` relative to `origin/main`.

| Remote ref | Tip | Δ | Checkout | Flag |
|---|---:|---:|---|---|
| `origin/archive/pre-consolidation-2026-08-23` | `307050e282` | 1514/80 | `external-worktree/moving/Galerina-branch-archive-20260823` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/codex/memory-consolidation-20261007` | `691232158d` | 140/6 | `.worktrees/memory-consolidation-20261007` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/codex/rd-0858-unit4-process-root` | `88c43afc89` | 1051/8 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/codex/rd0873-local-integration` | `0ee6862146` | 1078/10 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/codex/rd1413-1415-coupled-route-20261004` | `eda327e47c` | 140/1 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/fix/absorbed-kb-links-20261009` | `65205ed030` | 2/0 | none | NO-CHECKOUT; ANCESTOR-TIP/ONLY; PR? |
| `origin/grok/ai-agent-declaration-contracts-20261005` | `d8d7af47b6` | 367/1 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/api-server-todo-followups-20261006` | `67ed2c5eb9` | 199/2 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/api-server-todo-hold-reconcile-20261006` | `89f6265b47` | 199/1 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/app-frame-hardening-20261003` | `6efdda52d3` | 557/2 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/app-frame-response-contract-20261003` | `f19604d734` | 557/4 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/app-frame-response-contract-v2-20261003` | `97a7f4e93f` | 554/2 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/core-cli-build-command-20261005` | `2ca3403e33` | 322/0 | none | NO-CHECKOUT; ANCESTOR-TIP/ONLY; PR? |
| `origin/grok/core-cli-build-contracts-20261005` | `1886d7987e` | 323/0 | none | NO-CHECKOUT; ANCESTOR-TIP/ONLY; PR? |
| `origin/grok/core-cli-plan-command-20261005` | `0ae7f85b2a` | 325/0 | none | NO-CHECKOUT; ANCESTOR-TIP/ONLY; PR? |
| `origin/grok/core-cli-plan-contracts-20261005` | `91cbb5350a` | 326/0 | none | NO-CHECKOUT; ANCESTOR-TIP/ONLY; PR? |
| `origin/grok/core-cli-verify-runtime-20261005` | `73e8718ac2` | 333/0 | none | NO-CHECKOUT; ANCESTOR-TIP/ONLY; PR? |
| `origin/grok/core-compute-quantum-refusal` | `2e9e861109` | 199/1 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/core-compute-taxonomy-20261005` | `6126cb3eab` | 341/2 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/core-network-hold-unlocks-20261005` | `ce5437cd6e` | 117/5 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/core-runtime-bounded-native-floor-refusal` | `246494403a` | 168/3 | `.worktrees/codex-pr169-runtime` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/core-vector-photonic-proposal-guard-20261005` | `859af62f33` | 367/1 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/diag-constants-20261002` | `c9f0453aef` | 558/2 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/docs-protected-operation-spec-20261006` | `656e7469aa` | 199/3 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/interpreter-i2-i3-20261002` | `ce68d61813` | 558/1 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/roadmap-todo-refresh-20261006` | `9a26c71e60` | 199/10 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/todo-sync-20261004` | `60be8ebacf` | 394/2 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/tools-benchmark-command-wiring-20261006` | `2ee61c570c` | 198/1 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/tri-pipe-trifuse-row-rd0855-20261006` | `86040d71c5` | 199/1 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/wat-integration-candidate-20261003` | `3ac9f8b150` | 558/16 | `.worktrees/grok-wat-integration-candidate-20261003` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/grok/wat-parked-memory-20261002` | `1ea29bd2b5` | 558/8 | `.worktrees/grok-baseline-05eb5c29-20261002` | CHECKED-OUT; UNIQUE-COMMITS/REVIEW; PR? |
| `origin/main` | `c46e1e01b4` | 0/0 | `.worktrees/memory-main-baseline-20261009` | CHECKED-OUT; ANCESTOR-TIP/ONLY; PR? |
| `origin/supergrok/core-photonic-o1-refusals-20261007` | `eedeeca500` | 199/3 | none | NO-CHECKOUT; UNIQUE-COMMITS/REVIEW; PR? |

## Other retained Git refs — separately flagged

These are not ordinary local branches or `origin/*` branches. They still count as recoverable Git state and must not be removed by branch cleanup.

| Ref | Tip | Commits not reachable from `main` | Flag |
|---|---:|---:|---|
| `refs/codex/turn-diffs/checkpoints/45cd3f7f93f5dd77b9bad8086af3ad22/0a0f962b6ef02223c862a47b50a7e675/1791670714477/93a4ff3b-4175-42c9-a568-1265ec60b8de` | `f7e5e0220` | 0 | CHECKPOINT/IDENTIFY-OWNER; preserve |
| `refs/notes/bob` | `89b7bb828` | 5 | NOTES-METADATA/REVIEW; not a code-merge count |
| `refs/review/pr-76` | `ad08318fe` | 0 | REVIEW-REF/VERIFY-PURPOSE; preserve pending custody check |
| `refs/review/pr-77` | `c277c98b9` | 0 | REVIEW-REF/VERIFY-PURPOSE; preserve pending custody check |
| `refs/review/pr-78` | `c55f272fa` | 0 | REVIEW-REF/VERIFY-PURPOSE; preserve pending custody check |
| `refs/review/pr-79` | `1fa931c47` | 0 | REVIEW-REF/VERIFY-PURPOSE; preserve pending custody check |
| `refs/stash` | `14f5094ab` | 2 | STASH-PAYLOAD/REVIEW; preserve until stash contents are accounted for |
| `refs/tmp/origin-main-inspect-20261007` | `51ae68184` | 0 | SNAPSHOT/COMPARE-TIP; no unique commit from this ref |
| `refs/tmp/pr108` | `53cb6c301` | 0 | SNAPSHOT/COMPARE-TIP; no unique commit from this ref |
| `refs/tmp/pr109` | `4827e160a` | 0 | SNAPSHOT/COMPARE-TIP; no unique commit from this ref |
| `refs/tmp/pr115` | `ac2ffb50f` | 0 | SNAPSHOT/COMPARE-TIP; no unique commit from this ref |
| `refs/tmp/pr116` | `e38a2b638` | 0 | SNAPSHOT/COMPARE-TIP; no unique commit from this ref |
| `refs/tmp/pr117` | `bf7b1d660` | 0 | SNAPSHOT/COMPARE-TIP; no unique commit from this ref |
| `refs/tmp/pr118` | `23fe8b8b8` | 0 | SNAPSHOT/COMPARE-TIP; no unique commit from this ref |
| `refs/tmp/pr87` | `ab8ba4288` | 0 | SNAPSHOT/COMPARE-TIP; no unique commit from this ref |

## Live consistency refresh — 2026-10-11

Rechecked the registered worktrees, local refs and cached `origin/*` refs without fetching or mutating Git state. The per-item flag rows above cover all current registered worktrees and local/origin branch refs, but the following fields supersede stale values in the earlier snapshot:

- `main` and cached `origin/main` both resolve to `c46e1e01b4c33fa6d540550482deaf4b44dcc7c6`.
- 19 registered worktrees remain; 10 have lock metadata and 10 currently have at least one porcelain status entry.
- There are 34 local branches and 33 actual `origin/*` branch refs. The separate symbolic `origin/HEAD` is not an additional branch.
- Four cached `pr/*` refs (`pr/135`, `pr/144`, `pr/165`, `pr/169`) are also present; do not silently omit them from the custody crosswalk.
- Relative to `main`, 30 of 33 non-main local branches and 26 of 32 non-main origin branches contain commits not reachable from `main`. These are ancestry-review flags, not merge counts or proof of distinct work.
- Across local branches, `origin/*` tracking refs and the four cached `pr/*` refs, 188 distinct commits are reachable but not from `main`; including other namespaces raises the all-ref graph union to 195. Neither number is a count of changes to integrate. Local branches plus `origin/*` tracking refs alone expose 162 such commits. The remaining commits arise from other refs, including the notes ref and stash; each recovery ref now has an explicit preservation/review flag above.
- A live status refresh found 10 dirty and 9 clean registered worktrees. Current dirty tuples (staged/unstaged/untracked/conflict) include `.worktrees/memory-current-main-20261008` at `48/8/2/0`, `.worktrees/rd-0873-native-fungi-bootstrap-implementation` at `36/5/13/0`, and `.worktrees/memory-main-baseline-20261009` at `9/87/11/0`; other tuples remain as listed in the worktree table.
- The four cached PR refs were cross-checked individually against live GitHub PR metadata without querying CI: #135 and #144 are closed unmerged, #165 is merged, and #169 is open draft with a dirty merge state. Their exact mappings and next-action flags are recorded above; this does not establish whether their patches are already represented elsewhere.
- `.worktrees/grok-baseline-05eb5c29-20261002` is `558/8` behind/ahead; live `git rev-list --left-right --count main...grok/wat-parked-memory-20261002` confirms it.
- `.worktrees/memory-main-baseline-20261009` has 9 staged, 87 unstaged and 11 untracked entries, with no conflicts; five tracked paths appear in both staged and unstaged status, yielding 102 unique changed paths.

These are local-ref observations, not a fresh network fetch. The prior broad PR query is supplemented only by the four individual cached-PR checks above; other PR-state flags retain the earlier query's scope. The 30/26 ancestry counts must not be read as 30/26 mergeable units: compare content, dirty overlays, PR state, ignored payload, lock purpose and patch-equivalence before assigning `IN_MAIN`, `PORT`, `SUPERSEDED` or `RETAIN_FOR_REVIEW`. A deduplicated final disposition count is therefore still NOT_VERIFIED.

## Before integrating or retiring any item

### Dirty memory-donor collision manifest — live comparison

The `memory-current-main-20261008` donor has 48 staged path entries, 8 unstaged entries (4 paths appear in both sets), and 2 untracked paths: 54 unique changed paths. The `memory-main-baseline-20261009` integration checkout has 102 unique dirty paths. Thirteen exact paths are dirty in both checkouts: seven remain substantively byte-different; three more are identical after removing CR line-ending bytes; and three are byte-identical. `main → donor` below is a textual diff count only; it is not an integration recommendation.

| Collision path | Donor additions / deletions vs integration checkout | Flag |
|---|---:|---|
| `docs/WORKTREES.md` | 597 / 41 | CUSTODY-DOC-CONFLICT; reconcile both ledgers |
| `packages-ts/galerina-core-compiler/src/interpreter.ts` | 400 / 80 | COMPILER-CONFLICT; semantic review required |
| `packages-ts/galerina-core-compiler/src/type-checker.ts` | 289 / 47 | COMPILER-CONFLICT; semantic review required |
| `packages-ts/galerina-core-compiler/tests/wasm-effect-grant-abi.test.mjs` | 208 / 72 | TEST-CONFLICT; preserve both test intents |
| `packages-ts/galerina-core-runtime-wasm/src/wasm-runtime.ts` | 225 / 27 | RUNTIME-CONFLICT; semantic review required |
| `scripts/run-all-tests.cjs` | 115 / 49 | TEST-ROUTER-CONFLICT; preserve fail-closed behavior |
| `scripts/tests/run-all-tests.test.mjs` | 162 / 75 | TEST-ROUTER-CONFLICT; retain adversarial coverage |

The following six WAMR probe paths are additional donor/main overlaps introduced during the current integration pass. The C/header/source files differ only by CR bytes; the two WAT fixtures and shell runner are byte-identical. These statuses still require donor custody reconciliation; equivalence does not imply commit or donor retirement.

| WAMR overlap path | Current comparison | Flag |
|---|---|---|
| `packages-ts/galerina-core-runtime/native/wamr-host/include/wamr_import_admission.h` | CR-only difference | NORMALIZE-ONLY; REVIEW |
| `packages-ts/galerina-core-runtime/native/wamr-host/src/wamr_import_admission.c` | CR-only difference | NORMALIZE-ONLY; REVIEW |
| `scripts/tests/rd1413-wamr-context-probe.c` | CR-only difference | NORMALIZE-ONLY; REVIEW |
| `scripts/tests/rd1413-wamr-duplicate-import-probe.wat` | Byte-identical | EXACT-DUPLICATE; RECONCILE |
| `scripts/tests/rd1413-wamr-unlinked-import-probe.wat` | Byte-identical | EXACT-DUPLICATE; RECONCILE |
| `scripts/tests/run-rd1413-wamr-context-probe.sh` | Byte-identical | EXACT-DUPLICATE; RECONCILE |

No copy, checkout switch, staging, merge or overwrite was performed for these collisions.

1. Refresh this snapshot and open-PR state before action.
2. Inventory staged, unstaged, untracked and ignored content separately with recoverable hashes/provenance; protect secrets.
3. Compare each `UNIQUE-COMMITS/REVIEW` patch/tree with current `main`, including squash-equivalence, tests and generated outputs. Record `IN_MAIN`, `PORT`, `SUPERSEDED`, or `RETAIN_FOR_REVIEW` with evidence.
4. Check active process/task ownership and lock explanations before any branch/worktree retirement.
5. Consolidate only useful, custody-verified work through the existing integration lane. These flags authorize no cleanup or deletion.

## Live local-branch disposition refresh — 2026-10-11

Rechecked all local branch tips against `main` after the local-ref retirement below. There are 33 local branches total: `main` plus 32 non-main branches. Exactly two non-main tips have zero commits in `main..branch`; both are attached to dirty worktrees and therefore neither is marked safe to retire:

| Branch | Live ancestry / checkout flag | Custody disposition |
|---|---|---|
| `codex/memory-current-main-20261008` | 0 commits ahead of `main`; attached worktree has staged, unstaged and untracked changes | `ANCESTOR-TIP/ONLY`; `DIRTY/RECONCILE`; retain until all changed and ignored payload is reconciled |
| `codex/rd1246-scalar-chain-spike` | 0 commits ahead of `main`; attached worktree has unstaged and untracked changes and an explicit retention lock | `ANCESTOR-TIP/ONLY`; `DIRTY/RECONCILE`; `LOCKED/PRESERVE` |

The other 30 non-main local branches contain commits not reachable from `main`; each remains `UNIQUE-COMMITS/REVIEW`, not an approved merge. Thus no non-main local branch is currently cleared for retirement: the two ancestry-contained branches still have attached dirty/locked payload, while the other 30 require content-equivalence and PR/custody review. Worktree excess remains 17 against the two-checkout target, but no worktree count is a cleanup authorization. Cached remote refs were not fetched during this refresh; remote flags remain snapshot evidence and must be refreshed before any remote action. No checkout, branch, remote ref, or file payload was changed by this verification.

## Post-snapshot disposition — local branch reference retired

One local reference was safely retired after the inventory snapshot; its history remains reachable and the remote reference is preserved.

| Item | Verified state | Action / flag |
|---|---|---|
| `fix/absorbed-kb-links-20261009` local branch | Tip `468ef12c32d1907532e50272ba6de46b53b89f3e`; zero commits in `main..branch`; no registered worktree at that tip; no matching open or historical PR returned by the live head query | LOCAL-REF-RETIRED; COMMIT-PRESERVED-IN-MAIN |
| `origin/fix/absorbed-kb-links-20261009` | Tip `65205ed030a865effdd2e38ad7d7b48efdc3d2cc`; `main...origin-ref` is `2/0`, so the remote tip is also reachable from `main` | REMOTE-REF-PRESERVED; no push or remote deletion |

The normal local branch-delete check refused because the local tip was not merged into its configured upstream, even though it was reachable from `main`. The exact local ref was then retired only after verifying the main reachability, absence of a worktree at its tip, and absence of a PR. The remote tracking ref was left untouched. At that checkpoint, local branch count was 33 and registered worktree count was 19. These are topology-excess counts, not a count of safe-to-delete or distinct-to-merge items.

## Post-snapshot disposition — merged PR #40 checkout retired

| Item | Verified state | Action / flag |
|---|---|---|
| `grok/slide-registered-consumer-rd0858-20261004` worktree | PR #40 is MERGED; merge commit `26efe2c06a8abc6dba044a943072d874c3164a11` is an ancestor of `origin/main`; both PR paths match `origin/main`; normalized hash of the sole status-marked tracked file matched its HEAD blob; all 22 ignored `dist/` and `node_modules/` matches had same-path counterparts in active main | GIT-WORKTREE-REGISTRATION-RETIRED; ignored payload retained in the now-unregistered directory |
| `grok/slide-registered-consumer-rd0858-20261004` local branch | Its one PR commit was not an ancestor of main because the PR was squash-merged; exact tip `9fab33612300019188bb69f98636e7126a3ccaa9` is preserved by local tag `archive/worktree-grok-slide-registered-consumer-rd0858-20261004`; no remote branch existed | LOCAL-BRANCH-RETIRED; exact commit recoverable from archive tag; no remote action |

Live counts after this retirement are 18 registered worktrees and 33 local branches. The 22 ignored package outputs remain on disk outside Git worktree registration; no recursive deletion was performed. The inventory table above is still a dated snapshot and the remaining entries are not thereby cleared for retirement.
