# Galerina Target Photonic TODO

Current sequencing: [pre-.fungi work register](../../docs/PRE-FUNGI-WORK-REGISTER-2026-09-22.md),
W11/W13. Planning/diagnostic reconciliation does not promote this target to
active v1 execution or establish physical hardware evidence.

Post-v1 status: photonic target work is preserved as planning only and must not
be part of the active v1 build surface.

Tower certified photonic coupon admission (2026-09-22 dirty-tree slice) is
owned by `@galerina/tower-citizen`, not this target. It does not promote
hardware execution. See `docs/reports/security-q1q2-continuation-2026-09-22.md`.

```text
[x] Create /packages-ts/galerina-target-photonic
[x] Document package boundary
[x] Add package metadata
[x] Add initial typed exports
[x] Clarify that galerina-target-photonic owns compiler/output target planning
[x] Define photonic target capabilities
[x] Define logic-to-photonic lowering plans
[x] Define photonic simulation target model
[x] Define photonic target report format
[x] Define photonic execution plan output
[x] Define hardware mapping file format
[x] Define fallback report format
[x] Define optical channel layout report format
[x] Define matrix operation mapping report format
[x] Define optical I/O interconnect capability model
[x] Define optical I/O transfer report format
[x] Define data movement and topology report direction
[x] Add examples
[x] Add initial focused tests (8)
[x] Add exact hostile-record, changing-getter, sparse-array and nested-channel
    tests; the bounded own-data decoder and nested-channel refusal suite is
    in `tests/photonic-contracts.test.mjs:125-201` and `:207-279`.
[x] C10 `fungi.photonic.diagnostic.v1` shared with core-photonic (`RD-1282`) at
    `src/index.ts:193-230`, `:430-525` and
    `tests/photonic-contracts.test.mjs:52-123`. Package route is **16/16**.
    Legacy `safeMessage` is refused. Execution/hardware authority remains held.
[!] Register owned FUNGI diagnostic codes before promotion beyond planning
    evidence; `FUNGI-PHOTONIC-001..006` remains open.
[x] Add the closed runtime decoder for the six-label `PhotonicActualTarget`
    vocabulary; `src/index.ts` `decodePhotonicActualTarget` and
    `tests/photonic-contracts.test.mjs:28-50` pass as part of the **16/16**
    bounded package route. Execution/hardware authority remains held.
```
