# crr-01 decision

NON_AUTHORIZING. Synthetic data only.

## Chosen

1. SCAN adds `packages/fungi`. Regeneration covers FUNGI-FUSE admitted identities and FUNGI-MB-NN derived from bare MB-NN literals. No baseline exemption.
2. Grammar keeps FUNGI-MB-NN as the canonical CODE_SRC form (already matched). Bare `MB-NN` is an alias token, not a second canonical family. ACK'd .fungi literals are untouched.
3. Flow names live in a separate generated registry `build/flow-registry/flow-registry.json` with unit-qualified keys (`kernel.mintOperation`). Unqualified duplicates are allowed only in that qualified form. `--check` refuses unregistered flow, qualified collision, and stale bytes.
4. Append-only history `scripts/baselines/code-history.json`. `check-code-history.mjs --check` refuses meaning change, retired reuse, missing history rows, and an alias that resolves to two canonicals.
5. FUNGI-NATIVE-001..021 meanings are the proposed legacy mappings from `proposed-fungi-native-mapping.ts`. Source status is PROPOSED_NOT_ADMITTED; they stay `ref` until a later admit. packages-ts logic is untouched.

## Rejected

R1 Rewrite MB-NN literals inside ACK'd units to FUNGI-MB-NN. Re-opens 14 ACK'd units and their suites.
R2 Admit MB-NN as its own canonical family. Owner ruling maps MB-NN to FUNGI-MB-NN.
R3 FUNGI-MD-* as the canonical form. Owner ruling forbids it.
R4 Put flow names in the diagnostic code registry. Flow names are not diagnostic codes.
R5 Hand-edit REGISTRY.md / registry.json.
R6 Baseline-exempt the 6 FUNGI-FUSE identities.
R7 Edit packages-ts/galerina-target-native to emit FUNGI-NATIVE-*.

## Follow-up

Rewrite ACK'd .fungi `MB-NN` literals to `FUNGI-MB-NN` in a later brief so the alias rows can retire.
