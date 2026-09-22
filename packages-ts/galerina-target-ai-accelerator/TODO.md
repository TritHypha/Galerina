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
[!] POST-V1 VPU/FPGA/ASIC planning examples and isolation-level reports.
[x] Define precision compatibility checks
[x] Define framework adapter planning examples
[!] POST-V1 HBM and topology report examples.
[x] Define fallback report examples
[x] Add examples
[x] Add tests
```
