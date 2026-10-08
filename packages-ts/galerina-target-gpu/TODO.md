# Galerina Target GPU TODO

## Graph integration follow-up — 2026-09-22

- [x] Admitted `node:util/types` on the boundary because `src/index.ts` already
      loads it. Live `--check` PASS. Exact-specifier hostility retained.

Post-v1 status: GPU target work is preserved as planning only and must not be
part of the active v1 build surface.

```text
[x] Create /packages-ts/galerina-target-gpu
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[x] Package-side POST-V1 pin: `implementPostV1GpuContract`,
    `dispatchGpuKernel`, and `executeGpuFallback` always refuse
    (`GPU_POST_V1_CONTRACT_FORBIDDEN`, `GPU_KERNEL_DISPATCH_FORBIDDEN`,
    `GPU_FALLBACK_EXECUTE_FORBIDDEN`). No precision/data-movement schema
    is admitted. tests/gpu-hold-pin.test.mjs. (SuperGrok 2026-10-08.)
[!] POST-V1 GPU capability/plan/kernel/precision/data-movement/fallback
    contracts, examples and tests. Not part of the active v1 build.
    Compute already owns generic target/fallback selection.
    Owner decision 2026-10-06 10:14 BST (O1, Phillip): stays parked until v1 ships; no implementation.
    Kept HOLD: SuperGrok's side is the typed refuse. The parked contracts
    themselves stay unimplemented. (SuperGrok pin 2026-10-08.)
[x] Implement the bounded runtime capability/plan decoder and detached report
    snapshot; `src/index.ts:71-217,219-315` and
    `tests/gpu-contracts.test.mjs:10-74` pass **6/6** with typecheck/build.
[x] Package-side GPU authority pin: `prepareGpuAdmissionRequest` emits
    REQUESTED_NOT_ADMITTED; `admitGpuCapability` always
    `GPU_PHYSICAL_ADMISSION_FORBIDDEN`; `claimPhysicalGpuEvidence` always
    `GPU_PHYSICAL_EVIDENCE_FORBIDDEN`. FUNGI mapping frozen as
    PROPOSED_NOT_ADMITTED (5 rows); `promoteGpuDiagnosticsToFungi` always
    `GPU_FUNGI_PROMOTION_FORBIDDEN`. Live codes stay the five
    `Galerina_GPU_*` names. tests/gpu-hold-pin.test.mjs.
    (SuperGrok 2026-10-08.)
[!] Keep the broader `galerina-core-compute` schema owner, physical GPU
    capability/admission evidence and legacy diagnostic registry migration open;
    this bounded plan-only package does not release GPU authority.
      SuperGrok 2026-10-07 pin: L17-L20 and L24-L26 stay [!]. O1 non-executing. tests/o1-gpu-closed-set.test.mjs pins frozen GPU_BACKENDS (5, including plan-only) and GPU_DIAGNOSTIC_CODES (five Galerina_GPU_* codes), refuses unknown kernel backend metal, refuses a surplus precision field, and asserts src has no FUNGI-GPU / authorityReleased / core-compute import. core-compute not edited. Docker node:24 2026-10-07: 5/5 new O1 tests, package 11/11 tests (3 suites) PASS. PROPOSED (not claimed final): FUNGI-GPU-001..005 would map onto those five Galerina_GPU_* codes if the owner later wants a FUNGI family; do not mint them in this slice.
    Kept HOLD: schema owner, physical evidence, and registry ownership are
    not this package. SuperGrok 2026-10-08: typed refuse plus frozen
    catalog; host+Docker 18/18. Unique `e202f177` UNCHANGED.
```
