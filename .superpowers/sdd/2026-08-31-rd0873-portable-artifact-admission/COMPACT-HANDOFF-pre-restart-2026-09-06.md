# RD-0873 compact/restart handoff - 2026-09-06

## Superseding access and Git check

The following facts supersede the earlier access/worktree statements below.
Implementation identities and the evidence gates remain in force.

- The three restart commits after Task 6D are `b6af6c25a` (`.gitignore`),
  `778ac5792` (this handoff) and `66ccea62c` (`docs/TODO.md`). Their combined
  diff has exactly those three paths and no DLL, EXE or toolchain files. The
  worktree was clean before the current documentation follow-up.
- The committed `**/.superpowers/**/toolchains/` rule ignores the local
  unpacking. No tracked `toolchains` paths were found. Existing benchmark
  binaries remain subject to review whenever their staged bytes change.
- The host execution context successfully uses the existing GitHub login as
  `TritHypha`, including private AGENTS access and push permission. No further
  login ceremony was needed. Do not copy credentials into a worker profile.
- Authenticated remote queries still return 422 for both exact Task 6D/6E
  implementation commits. The required `platform-smoke.yml` is present in the
  local Task 6D tree but absent from the hosted workflow listing. Resume remote
  preparation using the owner's existing Git authorization, after checking the
  outgoing paths, intended refs and protected environment prerequisites.
- Keep Task 6D as Task 6F's sole-parent source identity. The newer documentation
  HEAD must not substitute for it. No hosted evidence fixtures or native slice
  were produced during this restart preparation.
- Fresh housekeeping returned `REVIEW`: 710 execution-boundary findings across
  the repository and 0 inventory findings across 2,909 documentation files.
  Archive checks were outside the session scope. These findings remain debt;
  nothing was deleted.
- Fresh memory preflight still has findings. Supplying the correct Galerina
  owner resolves the missing-owner invocation problem and exposes `STALE`
  repository-head/document-digest locators. Two top-level files remain outside
  the expected index/frontmatter format. Preserve a locator update note in
  the managed memory update channel; do not rewrite managed memory bodies.
- `docs/TODO.md` and `docs/ROADMAP.md` now have current superseding checkpoints.
  Graph and documentation-index freshness remain unverified. Restart before
  resuming the hosted-evidence cycle as requested by the owner.

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
