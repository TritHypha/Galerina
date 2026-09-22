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
[!] POST-V1 GPU capability/plan/kernel/precision/data-movement/fallback
    contracts, examples and tests. Not part of the active v1 build.
    Compute already owns generic target/fallback selection.
[x] Implement the bounded runtime capability/plan decoder and detached report
    snapshot; `src/index.ts:71-217,219-315` and
    `tests/gpu-contracts.test.mjs:10-74` pass **6/6** with typecheck/build.
[!] Keep the broader `galerina-core-compute` schema owner, physical GPU
    capability/admission evidence and legacy diagnostic registry migration open;
    this bounded plan-only package does not release GPU authority.
```
