# RD-0873 compact/restart handoff - 2026-09-06

## Stop point

The work is paused before Task 6F and Task 7. No `.fungi` source, Task 6F
fixture, push, merge, publication, signing or external-key use occurred.

## Exact local custody

- Galerina Task 6D cumulative: commit
  `077c1cb136aca17ca335ff96aba326a7cbf20926`, tree
  `ace861c7d007712ffb567910656ed7cdbc7250a5`, parent
  `20f303edc13c3c43194dff9567b06e88cf2c4acd`, worktree
  `.worktrees/rd0873-task6d-cumulative`.
- AGENTS Task 6E pinned capacity: commit
  `bc22960337f20fb3e0c17863432f6ba823af1608`, tree
  `95d5937ada1117b8f99ea7b11cfe60a5188b8f80`, parent
  `b2ff05b599a8408a02747c4b4cc733464ae1491a`, worktree
  `.worktrees/rd0873-task6e-pinned-capacity`.
- Task 6D shows only the existing untracked `.superpowers/` diagnostics;
  Task 6E is clean. Preserve both worktrees exactly.

## Evidence and gates

- Galerina frame self-test and 11 bounded Task 6C controls pass.
- AGENTS artifact-admission, bounded-execution and path-leak self-tests pass.
- Task 6F is `HOLD`: the approved plan requires both exact commits to be made
  reachable to the protected workflow by the owner before observation. The
  public Galerina API reports Task 6D absent (HTTP 422); private AGENTS
  reachability requires valid credentials; the expected
  `.github/workflows/platform-smoke.yml` is unavailable (HTTP 404).
- The retained Grok consultation is advisory and records
  `DESIGN_AMENDMENT_REQUIRED`; it is not an authorization or a PASS.

## Housekeeping and memory

- Read-only housekeeping is `REVIEW`: 710 bounded-execution findings, 0
  inventory findings, archive audit skipped because roots were not supplied.
- Memory preflight is `HOLD`: `memory_summary.md` and `raw_memories.md` are
  unindexed and lack frontmatter; the working-set check reports missing owner
  `Galerina`; stale volatile-fact count is 0.
- No cleanup or deletion was performed. The current TODO has a superseding
  checkpoint entry; the roadmap remains a separate documentation follow-up.

## Restart route

1. Re-open this handoff and verify the two commit/tree identities and worktree
   status before any edits.
2. If publication is separately authorized, authenticate GitHub in the Codex
   worker (the normal user credential store was inaccessible); do not expose
   credentials or tokens in chat.
3. Re-verify exact remote reachability and the protected workflow. Only then
   resume Task 6F observe, review the private Windows/Linux evidence, and create
   the two fixtures under the plan's exact-parent/diff rules.
4. Keep Task 7 closed until every amended plan gate passes. Task 7 must use both
   bespoke AGENTS skills: `translating-typescript-to-fungi` and `writing-fungi`.

