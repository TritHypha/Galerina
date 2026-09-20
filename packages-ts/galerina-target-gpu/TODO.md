# Galerina Target GPU TODO

Post-v1 status: GPU target work is preserved as planning only and must not be
part of the active v1 build surface.

```text
[x] Create /packages-ts/galerina-target-gpu
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[ ] Define input contract from galerina-core-compute
[ ] Define GPU target capability model
[ ] Define GPU plan output format
[ ] Define kernel mapping plan format
[ ] Define precision and tolerance report format
[ ] Define data movement report format
[ ] Define fallback report format
[ ] Add examples
[ ] Add tests
[x] Implement the bounded runtime capability/plan decoder and detached report
    snapshot; `src/index.ts:71-217,219-315` and
    `tests/gpu-contracts.test.mjs:10-74` pass **6/6** with typecheck/build.
[!] Keep the broader `galerina-core-compute` schema owner, physical GPU
    capability/admission evidence and legacy diagnostic registry migration open;
    this bounded plan-only package does not release GPU authority.
```
