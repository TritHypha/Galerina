# LSM — Architecture Issues / Deferred Seams

This package (`@galerina/core-sentinel-memory`) is intentionally pure TypeScript over
`ArrayBuffer` / `SharedArrayBuffer` so it stays WASM-linear-memory-compatible. Two
items are deliberately out of scope for this build:

## (a) Native memory locking (mmap / mlock) — documented host seam, NOT implemented

Real page-locking and fixed virtual mappings (`mmap`, `mlock`, `MADV_DONTDUMP`,
guard pages) require host privileges and OS-specific syscalls. Providing them would
be a wider-project **host function** living at the runtime boundary, not in this
portable core. LSM gives the deterministic, fixed-block, never-growing pool that a
future host can back with locked pages; the locking itself is a TODO at the host
seam. Until then the pool is a normal in-process buffer — deterministic, but not
page-locked or non-swappable.

## (b) Tower integration deferred

Deeper wiring of LSM into `galerina-tower-citizen`'s `TPLSimulator` (so ternary
inference allocates its staging state from the Sentinel pool / `TPLStateBuffer`
instead of ad-hoc arrays) is left to the integrating session. The public surface
here (`TPLStateBuffer`, `StaticMemoryPool`, `SegmentationController`) is shaped so
that wiring is a mechanical change on the consumer side.
