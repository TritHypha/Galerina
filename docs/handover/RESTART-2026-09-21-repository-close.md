# Restart — repository close and bounded pre-`.fungi` state — 2026-09-21

## Scope

This restart point covers the active Galerina RD-0873 implementation worktree, the Galerina root checkout carrying the RD-0858 work, and the ZTF Knowledge Bases `main` checkout. Archival and temporary worktrees were not folded into this close; several contain unrelated deletion or generated-artifact states and must be reopened independently.

## What was recorded in this cycle

- Public first-result research from the blocker-chapter keywords was checked against the WebAssembly specification and portability boundary, RFC 8785, Cranelift, uBPF, and RFC 7616.
- Astra and Grok independently agreed that the findings refine existing work but do not justify a new R&D number.
- The useful results were recorded as addenda to `RD-1236` (WASM admission) and `RD-1244` (canonical evidence and replay controls).
- The KB range query was refused because tracked RD sources are dirty. No new RD number was allocated from a refused range.

## Resume order

1. Reopen the three repository heads and verify live Git state before relying on this document.
2. Read `docs/BLOCKER-CHAPTERS-NON-EVIDENCE-2026-09-21.md`, `docs/TODO.md`, and `docs/TODO-MISSING-RD.md` in the RD-0873 worktree.
3. Continue only with bounded non-`.fungi` implementation slices whose ABI, authority, and refusal conditions are already frozen.
4. Keep C02 higher-order lowering, C04/C08/C09/C10 target admission, C15 configuration authority, C16 transport/HMAC authority, C17 `types{}` mapping, C18 overlays, and C19 package splitting on hold until their owner contracts exist.
5. Preserve explicit `_=>` exits and never author `null` or `NaN` in `.fungi`.
6. Do not regenerate PROJECT evidence or conversion queues, run the corpus, or perform the full `.fungi` build until all non-`.fungi` TODOs are complete and the owner authorizes final assurance.

## Close receipts

The bounded close commits before this receipt update are:

- ZTF Knowledge Bases `main`: `f244f29`
- Galerina RD-0873 implementation worktree `main`: `209f46f79`
- Galerina root `codex/rd-0858-unit4-process-root`: `4cde8c5d8`

This receipt update is a documentation-only follow-up on the RD-0873 worktree. Re-verify all hashes and remote refs with live Git; this note is a locator, not authority. No private signing key belongs in any repository.

## Current assurance boundary

The public research review did not close C02, C04, C12, C16, or C19. A passing local test, digest, report, or external-model agreement is not production authority, physical durability, or proof of a complete compiler/runtime contract.
