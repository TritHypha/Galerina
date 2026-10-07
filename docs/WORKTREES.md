# Galerina memory consolidation custody

Checkpoint: 2026-10-07. This record covers the memory consolidation slots only;
it is not a claim that every historical Galerina worktree has been audited.

| Logical slot | Branch / worktree identity | State and owner | Next safe action |
| --- | --- | --- | --- |
| Published main | remote `main` | Auth and byte-preserving provider integration published at `8cbb790646f6a7dad23985ab5e860feb167329b2` by Codex under Phillip's authorization | Keep later native candidate separate until its integration evidence is accepted |
| Memory implementation | `codex/memory-consolidation-20261007`, worktree `memory-consolidation-20261007` | ACTIVE / PUSHED; Codex; native candidate `f2a6a5fe2642c3498528b1d542308a4f3adfd30f`; clean after publication | Resolve the classical-CLI and frozen T14 verification dispositions before merging the native candidate to main |
| Earlier memory source | `codex/rd1413-1415-coupled-route-20261004`, primary checkout | CLOSED_FOR_NEW_WORK / RETAINED_CLEAN at `5cb651189a3d693d96a350c1891518de39d1f6e5`; included in published main | Preserve history; use the implementation slot for further memory changes |
| Legacy native source | local `main`, worktree `rd-0873-native-fungi-bootstrap-implementation` | CLOSED_FOR_NEW_WORK / RETAINED_DIRTY; historical HEAD `e1c2496f3f36d154a445ba9c302401ccaaf74bae`; 36 tracked changed paths and 14 untracked files preserved | Do not reset or switch this checkout; reconcile retained documentation before cleanup |

The legacy checkout's local `main` is intentionally not moved through its dirty
files. Its staged tree is `feae487ece743642d5a91761dca51dd513d4ea74`.
The local recovery bundle `memory-custody-20261007-5cb651189` in the coordinating
chat workspace preserves the staged archive, working files and native patch.
All 50 working files were compared by SHA-256 with the recovery copies.
The bundle is recovery evidence, not a public repository artifact or a claim
that uncommitted historical documents have already been pushed.

## Retained material and exclusions

- The native source, tests, WAMR probe and WIT generator have been reconciled
  path by path into the implementation slot, with current conflict resolutions,
  and committed/pushed in `f2a6a5fe2642c3498528b1d542308a4f3adfd30f`.
- Old `docs/TODO.md` and `docs/ROADMAP.md` changes remain in the recovery/source
  checkout. They contain historical evidence and superseded policy; they were
  not substituted wholesale for the current owners.
- Old diagnostic indexes and AGENTS count stamps were replaced by fresh
  generation from the consolidated candidate, not copied from the old tree.
- Old secrets-spore anchor/test edits were not imported over the stronger
  current wipe/provider defenses. The app-kernel fuse test was already equal.
- The old `.gitignore` edit remains preserved for separate disposition.

No source branch or worktree was deleted, pruned, or reset. CLOSED_FOR_NEW_WORK
is a custody label, not a Git write barrier, RD completion, product clearance,
or permission to discard files. A worktree lock protects registration from
pruning only. Existing unrelated worktrees and their owners are unchanged.

See [consolidation evidence](reports/memory-native-consolidation-20261007.md)
for the verification scope and remaining merge limitations.
