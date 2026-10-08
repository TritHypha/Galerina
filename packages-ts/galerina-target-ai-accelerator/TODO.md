# Galerina Target AI Accelerator TODO

## Graph integration follow-up — 2026-09-22

- [x] Admitted `node:util/types` on the boundary because `src/index.ts` already
      loads it. Live `--check` PASS. Exact-specifier hostility retained.

Post-v1 status: AI accelerator target work is preserved as planning only and
must not be part of the active v1 build surface.

```text
[x] Create /packages-ts/galerina-target-ai-accelerator
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[x] Define accelerator capability and plan placeholders
[x] Define passive Intel Gaudi 3 backend profile concept
[x] Define NPU/TPU/AI-chip capability detection contracts
[x] Package-side POST-V1 VPU/FPGA/ASIC and isolation pin:
    `prepareAiAcceleratorAdmissionRequest` refuses parked kinds and isolation
    keys; `implementPostV1VpuFpgaAsic` always
    `AA_POST_V1_VPU_FPGA_ASIC_FORBIDDEN`; `implementPostV1IsolationReport`
    always `AA_POST_V1_ISOLATION_REPORT_FORBIDDEN`. Live kinds stay 8.
    tests/ai-accelerator-hold-pin.test.mjs. (SuperGrok 2026-10-08.)
[!] POST-V1 VPU/FPGA/ASIC planning examples and isolation-level reports.
    Owner decision 2026-10-06 10:14 BST (O1, Phillip): stays parked until v1 ships; no implementation.
    Kept HOLD: SuperGrok's side is the typed refuse. The parked examples
    and isolation reports stay unimplemented. (SuperGrok pin 2026-10-08.)
[x] Define precision compatibility checks
[x] Define framework adapter planning examples
[x] Package-side POST-V1 HBM/topology report pin:
    `implementPostV1HbmTopologyReport` always
    `AA_POST_V1_HBM_TOPOLOGY_REPORT_FORBIDDEN`; request topology `mesh` /
    `isolation` refuses. Gaudi 3 HBM numbers stay passive profile fields.
    `admitAiAcceleratorCapability` always `AA_PHYSICAL_ADMISSION_FORBIDDEN`.
    tests/ai-accelerator-hold-pin.test.mjs. (SuperGrok 2026-10-08.)
[!] POST-V1 HBM and topology report examples.
    Owner decision 2026-10-06 10:14 BST (O1, Phillip): stays parked until v1 ships; no implementation.
      SuperGrok 2026-10-07 pin: L20-L21 and L24-L25 stay [!]. O1 non-executing. tests/o1-parked-closed-set.test.mjs pins frozen AI_ACCELERATOR_KINDS (8, no vpu/fpga/asic) and AI_ACCELERATOR_TOPOLOGIES (5), refuses parked kinds and unknown topology tokens with Galerina_AI_ACCELERATOR_INPUT_REFUSED, and pins Gaudi 3 HBM numbers as passive profile fields. No isolation-level vocabulary in src. Docker node:24 2026-10-07: 5/5 new O1 tests, package 15/15 tests (2 suites) PASS. PROPOSED (not claimed final): keep those closed sets until v1; do not add VPU/FPGA/ASIC kinds or isolation-level reports.
    Kept HOLD: SuperGrok 2026-10-08 typed refuse plus closed-set pin;
    host+Docker 20/20. Unique `c9834a14` UNCHANGED. No new examples.
[x] Define fallback report examples
[x] Add examples
[x] Add tests
```
