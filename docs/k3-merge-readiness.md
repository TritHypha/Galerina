# K3 merge-readiness packet

KEEP 0 UNTIL STEP Z. This packet does not merge and does not flip
SLIDE production constants. Merge to main stays Grok Bot. The Step Z
flip stays Phillip's call. Do not edit `packages/fungi/memory`.

## Merge order

1. Galerina topic `grok/k3-frame-epoch-20261028` onto Galerina main.
2. SLIDE topic `grok/slide-k3-frame-epoch-20261028` onto SLIDE main.
3. Cross-repo lockstep after each merge:
   `node scripts/k3-wire-lockstep-gate.mjs --slide-root=<SLIDE checkout>`
   Fixture schema stays 16 unless a later row adds a row, then 17 with
   identical bytes in both repos.

## Backup (before either merge)

Verified git bundle plus sha256 manifest:

```
D:\Backups\pre-k3-merge-<YYYYMMDD>\
  galerina.bundle
  slide.bundle
  SHA256SUMS
```

Create with `git bundle create` from each topic HEAD, then sha256 of
every file into `SHA256SUMS`. Verify with `git bundle verify` before
the merge.

## Lock-step CI after each merge

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
20261231 (the day before that unix instant).
