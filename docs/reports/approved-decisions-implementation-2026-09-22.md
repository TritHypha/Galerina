# Approved decisions implementation — 2026-09-22

**Overall:** INCOMPLETE_NON_AUTHORITATIVE. In-scope implementation landed.
Independent review **HOLD** (subagent `01a0c95d-403a-7d73-aed1-9444fff33c87`).
Not clean-HEAD evidence, not production admission, not closure of the 124-finding scan.

## Candidate identity

| Field | Value |
|---|---|
| Worktree | `Galerina/.worktrees/rd-0873-native-fungi-bootstrap-implementation` |
| Base HEAD | `dc05e30a728484877623c957b522dc6dc8b550a2` = `origin/main` |
| Historical | `backup-checkpoint-2026-09-22.md` retains `0f24ca30…` and backup commits |
| Dirty | Retained backup `build/` + two C18 `.fungi` pairs, plus this slice. No commit/push. |
| KB | Pin + constitution draft in that repo's dirty tree |

## Decision table

| ID | Status | Closure check |
|---|---|---|
| 1 Production host grants | APPROVED_IMPLEMENTATION_PENDING | `FUNGI-RUNTIME-GRANT-REQUIRED`; capability-host **11/11** |
| 2 Pinned production revocation | APPROVED_IMPLEMENTATION_PENDING | `FUNGI-FUSE-REVOCATION-REQUIRED`; fuse-loader **20/20** |
| 3 KB pin | APPROVED_IMPLEMENTATION_PENDING | `kb-guards.yml` `ref: dc05e30a…` |
| 4 Constitution | DISCUSSION_DRAFT NOT_ADOPTED | KB `reference/galerina/galerina-governed-computing-constitution.md` |
| 5 JSON Decimal | APPROVED_DEFERRED_SCOPE | RD-1289 refusal retained |
| 6 Option.zip | implemented named pair | `ZipPair` built-in generic; matrix **6/6** including `Option<ZipPair<Int, String>>` |
| 7 OAuth owner | APPROVED_DEFERRED_SCOPE | App Kernel only |
| 8 Durable replay | refusal implemented | empty `isAdmittedDurableReplayStore` admit-list; Q2 **13/13**; backend deferred |
| 9 Tower profiles | no package extract | RD-1295 isolation+products **83/83** |
| 10 Q3/FIFO/WAT | implemented with known limits | spore **13/13**; Q3 TOCTOU **15/15** WSL; WAT Q1 **13/13** + host cleanup |

## Q3 / FIFO / WAT (CONFIRMED source logic)

- Spore: `section_count > 4096` and hashed-byte work ceiling **before** leaf hashing.
- FIFO: `refuseSnapshotSpecialFile` / registry `isFifo` refuse before open. Live Linux `mkfifo` observed via WSL (`atomic-writer.test.mjs` **6/6**, stdout `LSS-FIFO-001`).
- WAT: secret trap wipe; primitive early returns capture-then-wipe; mixed-body tails zero on exit; `wipeSecretHeapAfterHostCopy` fills the exported arena after the host copies a heap-pointer result.

## Focused receipts

| Command | Result |
|---|---|
| tsc compiler, app-kernel, api-server, sentinel-state, spore | exit 0 |
| capability-host.test.mjs | 11/11 |
| fuse-loader.test.mjs | 20/20 |
| replay-store.test.mjs | 9/9 |
| verify-artifacts.test.mjs | 2/2 |
| type-checker-expression-kind-matrix.test.mjs | 6/6 |
| wat-arena-intrusion-wipe-g5b.test.mjs (incl. G5c early-return wipe) | 5/5 |
| spore container.test.mjs (incl. hashed-byte ceiling) | 13/13 |
| atomic-writer.test.mjs (incl. live Linux FIFO via WSL) | 6/6 |
| Tower rd-1295 isolation+products | 83/83 |
| myco store.test.ts | 24/24 including crypto boundary |
| `node --check galerina.mjs` | exit 0 |

## Independent review

Reviewer: separate session `01a0c95d-403a-7d73-aed1-9444fff33c87`. Verdict **HOLD**.
Follow-up closed: G5c test, hashed-byte test, live Linux FIFO via WSL, ZipPair as a user-writable built-in generic.

Still HOLD / deferred by approved decisions: durable replay backend; JSON-Decimal; OAuth; 124-finding scan; independent production admission; Windows-native FIFO.

## Remaining after this prompt

1. Durable replay backend, JSON-Decimal, OAuth (APPROVED_DEFERRED_SCOPE).
2. 124-finding scan as a whole.
3. Owner explicit-path commits.
4. Independent production admission of the dirty candidate.

No commit, signing, or `.fungi` work.
