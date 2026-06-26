# LSIO — Architecture Issues / Deferred Seams

`@galerina/core-sentinel-io` (LSIO) is intentionally pure TypeScript over
`ArrayBuffer` / `SharedArrayBuffer` so it stays WASM-linear-memory-compatible and
deterministic. Two items are deliberately out of scope for this build.

## (a) Native `mmap` / `mlock` — documented host seam, NOT implemented

True zero-copy from the OS page cache and page-locking (non-swappable, dump-
excluded pages) require privileged, OS-specific syscalls (`mmap`, `mlock`,
`madvise(MADV_DONTDUMP)`). These belong at the runtime **host boundary**, not in
this portable core. The exact N-API contract a future `lsio_native.node` addon
would provide — and how its external `ArrayBuffer` feeds `ZeroCopyMapper` — is
specified in [`native/README.md`](./native/README.md).

Until that addon lands, `ZeroCopyMapper` stages bytes into an ordinary in-process
`(Shared)ArrayBuffer`. The integrity gate, deterministic layout, and zero-copy
*access* guarantee all hold; the missing piece is only the OS-level page-locking
of the backing store. The `view()` / `i32()` surface is shaped so swapping in the
native backing buffer is a mechanical change with no consumer-side impact.

## (b) `galerina-tower-citizen` wiring deferred

Deeper integration into `galerina-tower-citizen` — loading real model weights via
an `IoManifest` so a Tower citizen ingests its weights through the hardened
border (HMAC-keyed manifest → `IntegrityMonitor` → `ZeroCopyMapper` →
linear-memory views) instead of ad-hoc reads — is left to the integrating
session. The public surface here (`buildManifest` / `ManifestLoader`,
`IntegrityMonitor`, `ZeroCopyMapper`, `PhotonicBusInterface` / `LocalDiskBus`) is
shaped so that wiring is a mechanical change on the consumer side. The
`PhotonicBus` class is the placeholder for the future photonic ingest transport
and refuses (`HardenedBorderViolation` / `LSIO-PBI-001`) in this build.

## Note: `typeRoots` for `node:crypto`

LSIO compiles with the shared compiler at
`../galerina-core-compiler` (there is no local `tsc`). That compiler package does
not ship an `@types` directory, so `tsconfig.json` points `typeRoots` at
`../galerina-tower-citizen/node_modules/@types`, which carries the exact pinned
`@types/node@25.9.1` and is also LSIO's intended integration peer. This is what
lets TypeScript resolve `node:crypto` at build time.
