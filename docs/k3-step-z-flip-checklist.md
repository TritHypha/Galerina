# K3 Step Z flip checklist

KEEP 0 UNTIL STEP Z. This packet does not flip production constants.
SLIDE `LEGACY_UNKNOWN_ZERO_BRIDGE` stays true,
`ABSENT_CARRIER_FALLBACK_BRIDGE` stays true,
`K3_EXTERNAL_WIRE_OUTPUTS` stays false until Phillip signs. Galerina
already emits UNKNOWN as -128.

## What Phillip signs off

- Flip SLIDE `LEGACY_UNKNOWN_ZERO_BRIDGE` from true to false.
- Flip SLIDE `ABSENT_CARRIER_FALLBACK_BRIDGE` from true to false.
- Flip SLIDE `K3_EXTERNAL_WIRE_OUTPUTS` from false to true.
- Confirm SLIDE copy-only rehearsal READY: step3 fail == 0 and rollback
  matches base.
- Confirm SLIDE producer-carrier inventory has zero unrecorded callers.
- Confirm sunset alerts stay silent on an injected clock before
  `K3_BRIDGE_SUNSET_ALERT_UNIX_S` (effective 2027-01-01T00:00:00Z =
  `LEGACY_UNKNOWN_ZERO_EXPIRY_UNIX_S`). Named removal is 2027-01-18
  (`K3_LEGACY_ZERO_REMOVAL_UNIX_S`). `LEGACY_UNKNOWN_ZERO_EXPIRY_EPOCH`
  is 20261231 (the day before the effective unix instant).
- Confirm SLIDE `node scripts/k3-bridge-sunset-check.mjs` exits 0 on the
  live process clock (N-be). Lockstep checks SLIDE expiry/removal unix
  against Galerina's legacy-0 dates. ZX-4 is designed to go red from
  2027-01-01T00:00:00Z while a bridge is still true; that red is the
  sunset alert, not a regression.

## Who flips

Phillip. SuperGrok and Grok Bot do not flip. Merge to main stays Grok Bot.

## Merge order

1. Galerina topic `grok/k3-frame-epoch-20261028` onto Galerina main (Grok Bot).
2. SLIDE topic `grok/slide-k3-frame-epoch-20261028` onto SLIDE main (Grok Bot).
3. Cross-repo lockstep:
   `node scripts/k3-wire-lockstep-gate.mjs --slide-root=<SLIDE checkout>`
   with identical fixture schema (16 unless a later row adds a row, then 17
   with identical bytes in both repos).

## CI lock-step check

`scripts/k3-wire-lockstep-gate.mjs` against the flipped SLIDE checkout.
VOK cargo `k3fp_external_verdict_out_e2e` already covers the external-output
helper. Do not edit `packages/fungi/memory`.

## Rollback

Restore the three SLIDE constants to true / true / false. Outputs return to
lattice 0. Re-run the copy-only rehearsal; rollback must match base.

## Dry-run (no flip)

SLIDE:

```
node scripts/k3-step-z-flip-plan.mjs --dry-run
```

Refuses (exit 1) unless rehearsal is READY with step3 red == 0. Never writes
checkout src.

## Pre-build (N-bd, N-ai)

A fresh Galerina clone needs the prebuilt core compiler and `tsc` under
`node_modules` before the kleene pin. Then:

```
node packages-ts/galerina-tower-citizen/tests/prebuild-k3-strong-kleene-pin.mjs
node --test packages-ts/galerina-tower-citizen/tests/k3-strong-kleene-pin.test.mjs
```

The explicit path reports 7 tests. A dist glob after the prebuild overlay
can report 8. STATUS uses the explicit path.

## Open until the flip

Legacy-0 removal (by 2027-01-18), absent-carrier sunset, F5, and this Step Z
flip row stay OPEN. Delete nothing.
