# Git Worktree Custody

This is a dated consolidation record, not live Git authority. Before integration or
retirement, reopen the named checkout, its HEAD, index, working files and recovery
receipt. A lock is a preservation notice, not proof of an active worker or a merge.

## Verified checkpoint - 2026-10-09

- Remote main and `fix/absorbed-kb-links-20261009` both reached
  `087f8c172ff4ffe5803ad4ce4c8b87ec104af34c` through non-force fast-forward pushes.
- Fresh Git registration count after package-TODO and WAT retirement: **78 worktrees, 57 locked**. This is not a fresh
  classification of every dirty or ignored file; the full inventory is separate.
- Consolidation is incomplete. Package-TODO was recoverably retired after its source,
  saved index and independent Git-history restoration were verified.
- WAT integration was also retired recoverably: 13,527 files retained, 160 changed paths
  verified in main history, five generated outputs preserved separately, and all 166
  status records matched through independent recovery. Its redundant local branch was
  removed; no matching remote branch existed. Eight already-broken external dependency
  junctions remain explicitly recorded, not claimed repaired.

## Preservation and integration slots

| Checkout | Verified state | Next action |
|---|---|---|
| Repository root | Detached at `9a26c71e60e491766ef351d0efe0405b0739c1b6`; 87 status records | Reconcile staged, unstaged and untracked work separately. Keep local-only GROK-BRANCHES.md unpublished. |
| `.worktrees/rd-0873-native-fungi-bootstrap-implementation/` | Local main at `e1c2496f3f36d154a445ba9c302401ccaaf74bae`; locked; 50 status records | Preserve overlay before moving local main. Remote integration does not update this checkout. |
| `.worktrees/memory-main-baseline-20261009/` | Reused branch `fix/absorbed-kb-links-20261009`; published through `087f8c172` | Finish generated indexes and ledger; reuse this integration slot. |
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

1. Integrate verified generated indexes and this ledger.
2. Retain package-TODO and WAT recovery archives, including generated outputs and closure
   records. Do not treat archived external dependencies as standalone executable setups.
3. Retire individually verified marker-only trees. One failing target need not block others.
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
