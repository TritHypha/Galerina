# Galerina Target Photonic TODO

Post-v1 status: photonic target work is preserved as planning only and must not
be part of the active v1 build surface.

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
    **10/10** in `tests/photonic-contracts.test.mjs:46-85` and `:127-160`.
[!] Reconcile shared photonic execution-plan, diagnostic and amplitude contracts;
    the remaining schema gap is recorded at `Galerina/docs/TODO.md:1408-1421`.
[!] Register owned FUNGI diagnostic codes before promotion beyond planning
    evidence; legacy diagnostic ownership remains open at
    `Galerina/docs/TODO.md:1422-1423`.
[x] Add the closed runtime decoder for the six-label `PhotonicActualTarget`
    vocabulary; `src/index.ts:198,408-425` and
    `tests/photonic-contracts.test.mjs:12-31` pass as part of the **12/12**
    bounded package route. Execution/hardware authority remains held.
```
