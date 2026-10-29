# K3 merge-readiness packet

KEEP 0 UNTIL STEP Z. This packet does not merge and does not flip
SLIDE production constants. Merge to main stays Grok Bot. The Step Z
flip stays Phillip's call. Do not edit `packages/fungi/memory`.

## Merge-day order

KEEP 0 UNTIL STEP Z. SuperGrok does not merge to main. Do not edit
`packages/fungi/memory`.

1. Backup from the SLIDE checkout:
   `node scripts/k3-pre-merge-backup.mjs --out=D:\Backups\pre-k3-merge-<YYYYMMDD> --galerina=<Galerina topic> --slide=<SLIDE topic>`
2. Merge rehearsal READY:
   `node scripts/k3-merge-rehearsal.mjs --slide-root=<SLIDE>`
   (temp clones only, `--no-ff`, never pushes). Resolves `origin/main`
   in the source (clone `origin/main` is the source local `main`) and
   junctions source `node_modules` so code-index/prebuild can run.
3. Grok Bot's separate merge call (Galerina topic onto Galerina main,
   then SLIDE topic onto SLIDE main).
4. Post-merge check:
   `node scripts/k3-post-merge-check.mjs --slide-root=<SLIDE>`
   (lockstep, code-index --check, lock --check, prebuild + kleene-pin,
   both merge-readiness scripts, SLIDE whole-dir baseline). Fixture
   schema stays 16 unless a later row adds a row, then 17 with
   identical bytes in both repos.

## Backup (before either merge)

From the SLIDE checkout:

```
node scripts/k3-pre-merge-backup.mjs --out=D:\Backups\pre-k3-merge-<YYYYMMDD> --galerina=<Galerina topic> --slide=<SLIDE topic>
```

`--dry-run` prints the plan only. A non-empty `--out` is refused.
Writes `galerina.bundle`, `slide.bundle`, and `SHA256SUMS`, then
`git bundle verify` on each. Tests use synthetic temp repos and never
write `D:\Backups`.

## GALERINA_ROOT for the whole SLIDE tests dir

SLIDE tests `v2c-galerina-conformance`, `v2d-reference-validator`, and
`checked-fungi-string-membership-compiler` read this Galerina tree.
Set `GALERINA_ROOT` to the Galerina checkout. Default is `../Galerina`
relative to the SLIDE root.

## Lock-step CI after each merge

```
node scripts/k3-post-merge-check.mjs --slide-root=<SLIDE>
```

Equivalent steps:

```
node scripts/k3-wire-lockstep-gate.mjs --slide-root=<SLIDE>
node scripts/code-index.mjs --check
node scripts/flat-package-root-lock.mjs --check
node packages-ts/galerina-tower-citizen/tests/prebuild-k3-strong-kleene-pin.mjs
node --test packages-ts/galerina-tower-citizen/tests/k3-strong-kleene-pin.test.mjs
```

WSL cargo: `--offline --lib` with `CARGO_TARGET_DIR=/tmp/vok-k3-pin-target`.
A fresh clone needs the prebuilt core compiler and `tsc` under
`node_modules` (N-bd). Kleene pin explicit path reports 7; a dist glob
can report 8 (N-ai).

Lockstep also checks that SLIDE `LEGACY_UNKNOWN_ZERO_EXPIRY_EPOCH`,
`LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S`, `K3_BRIDGE_SUNSET_ALERT_UNIX_S`
and `K3_LEGACY_ZERO_REMOVAL_UNIX_S` match Galerina's legacy-0 dates.

## Rollback

Restore the three SLIDE constants to true / true / false. If a merge
commit is reverted, restore from the verified bundle.

## Open after merge

These stay OPEN after the topic lands on main:

- Legacy-0 removal by 2027-01-18.
- Absent-carrier sunset.
- F5 expected-red production defaults.
- Step Z flip (Phillip's call).

Effective sunset-alert date is 2027-01-01T00:00:00Z
(`LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S` / `K3_BRIDGE_SUNSET_ALERT_UNIX_S`).
Named removal is 2027-01-18. `LEGACY_UNKNOWN_ZERO_EXPIRY_EPOCH` is
20261231 (the day before that unix instant). ZX-4 is designed to go
red from 2027-01-01T00:00:00Z while a bridge is still true; that red
is the sunset alert, not a regression.

## merge-tree

```
node scripts/k3-merge-readiness.mjs
```

Uses `git merge-tree --write-tree --name-only origin/main HEAD`.
Exit 0 is clean, exit 1 is conflict, other non-zero is UNKNOWN
fail-closed. This script never merges.
