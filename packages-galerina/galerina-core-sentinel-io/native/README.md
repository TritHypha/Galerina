# LSIO Native Host Seam — `mmap` / `mlock` contract (NOT implemented)

LSIO is pure TypeScript over `ArrayBuffer` / `SharedArrayBuffer` so it stays
WASM-linear-memory-compatible and deterministic. True zero-copy from the OS page
cache and page-locking (so secrets / model weights are never swapped to disk or
written to a core dump) require privileged, OS-specific syscalls. Those live at
the **host boundary**, not in this portable core.

This directory documents the N-API contract a future native addon
(`lsio_native.node`) would expose. It is a **specification only** — there is no
compiled addon in this build. Until it lands, `ZeroCopyMapper` stages bytes into
an ordinary in-process `(Shared)ArrayBuffer`: deterministic, but neither
page-locked nor backed by a fixed virtual mapping.

## Contract

The addon would export the following functions (N-API, synchronous). All offsets
and lengths are byte counts; all `fd`s are OS file descriptors the host already
opened under its own capability grant. Errors are thrown as JS exceptions and
LSIO maps a non-recoverable integrity/containment failure onto
`HardenedBorderViolation`.

### `mapRegion(fd: number, offset: number, length: number, opts?: { lock?: boolean }): MappedRegion`

POSIX `mmap` of `length` bytes of file `fd` at `offset`.

- syscall: `mmap(NULL, length, PROT_READ, MAP_SHARED, fd, offset)`
- if `opts.lock` is set, also performs `mlock(addr, length)` so the pages are
  resident and non-swappable (see `lockRegion`).
- on Linux, applies `madvise(addr, length, MADV_DONTDUMP)` so the region is
  excluded from core dumps.
- returns a `MappedRegion`:
  ```
  interface MappedRegion {
    readonly address: bigint;   // base virtual address (for diagnostics)
    readonly length: number;    // mapped byte length
    readonly locked: boolean;   // true if mlock succeeded
    buffer(): ArrayBuffer;      // external ArrayBuffer aliasing the mapping
  }
  ```
- `buffer()` returns a Node **external** `ArrayBuffer` (via
  `napi_create_external_arraybuffer`) whose backing store IS the `mmap`'d region.
  No copy: a `Uint8Array` over it reads file pages directly. This external
  `ArrayBuffer` is what `ZeroCopyMapper` would adopt as its backing buffer
  instead of allocating one with `new ArrayBuffer(totalBytes)`.
- **Returns** the `MappedRegion`. **Throws** on `mmap` failure (`errno`
  surfaced in the message).

### `lockRegion(region: MappedRegion): void`

POSIX `mlock(region.address, region.length)`. Pins the pages as resident so the
kernel will not swap them. Used when a manifest block carries sealed material
(keys, model weights) that must never reach swap. Throws if `mlock` fails
(typically `EPERM` / `ENOMEM` against `RLIMIT_MEMLOCK`).

### `unmapRegion(region: MappedRegion): void`

`munlock` (if locked) followed by `munmap(region.address, region.length)`.
Idempotent: a second call is a no-op. Throws only on a genuine `munmap` error.

### `pageSize(): number`

`sysconf(_SC_PAGESIZE)` — so the host can align manifest block offsets to page
boundaries before requesting fixed mappings.

## How it feeds the `SharedArrayBuffer`

For cross-thread / WASM-linear-memory use, the host would:

1. `pageSize()` and align the manifest's `totalBytes` up to a page multiple.
2. `mapRegion(fd, base, alignedLen, { lock: true })` → an external `ArrayBuffer`
   aliasing locked, resident file pages.
3. Hand that external `ArrayBuffer` to `ZeroCopyMapper` as its backing buffer.
   The mapper runs the **integrity gate** (`IntegrityMonitor.enforceBlock`) over
   each block read directly from the mapping BEFORE any view is released — the
   hardened border still applies; the only thing that changed is who owns the
   bytes.
4. `view()` / `i32()` produce typed-array views over the locked mapping — true
   zero-copy, page-locked, dump-excluded.

A `SharedArrayBuffer` cannot itself alias an `mmap` (V8 owns its backing store),
so the cross-thread path is: map + lock once on the owning thread, verify, then
either (a) expose the external `ArrayBuffer` to consumers on that thread, or
(b) copy the verified bytes once into a `SharedArrayBuffer` for worker threads.
The page-locking guarantee holds for (a); (b) trades the lock for shareability.
The choice is a host policy decision recorded in the io-manifest, not something
this core dictates.
