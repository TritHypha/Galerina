# MEM-R9: VOK trap parity for linear-memory bounds and integer division

Branch `grok/mem-r9-vok-trap-parity-20261029`, from Galerina `main`
`76297af31` (after MEM-R7). Closes the VOK Rust side of memory-research gap
map rows 5.4 / H16 (`i32.div_s(INT_MIN, -1)` trap parity SLIDE vs WASM,
VOK-checked), and carries the 5.1-5.3 / H15 bounds rows with it. Synthetic
integers only. TypeScript untouched; `lib.rs` untouched (the K3 frame work
on `grok/k3-frame-epoch-20261028` owns it), so nothing collides.

## What MEM-R8 left open

SLIDE `main` `8f62c0c` added the reference model
`src/linear-memory-bounds.mjs` with an engine parity suite, but VOK (the
unshipped Rust checker beside SLIDE, `native/vok-authority`) had no copy of
these rules, so the gap map still read "VOK Rust row open".

## Decision (full auto, Work driver 2026-10-29)

VOK gets an exact Rust mirror of the SLIDE model and is bound to SLIDE by
shared vectors, not by hand-copied expectations:

- `src/linear_memory_bounds.rs`: u128/i128 exact checks for access, range,
  copy, grow and div/rem with the SLIDE failure ids `SLIDE-LMB-001..005`
  and statuses. Pulled into the test with `#[path]`; not registered in the
  crate root.
- `vectors/linear-memory-trap-grid.mjs` + `.gen.mjs`: 1299 inputs; every
  expected answer is computed by SLIDE's own model (source sha256
  `340fc3e7bcbbf7d2...`). Output `linear-memory-trap-vectors.json`
  (sha256 `e1d51f3148a46f64...`, pinned) and `.rows.txt` (LF, eol=lf).
- `vectors/linear-memory-trap-vectors-pin.test.mjs`: pin, grid drift,
  gap rows, 1280 engine rows replayed on V8 with hand-assembled modules
  (load8/16/32/64/v128, memory.fill, memory.copy, memory.grow, div/rem,
  memory64), and a byte-for-byte re-derive from SLIDE when `SLIDE_ROOT` is set.
- `tests/linear_memory_trap_parity.rs`: VOK must give the same
  `STATUS FAILURE [result pages | value]` on every row, plus spot tests.
- `vectors/linear-memory-trap-mutants.mjs`: 9 mutants of the Rust checker.

## Findings

- V8 reports `div_s(MIN, -1)` as "divide result unrepresentable", not
  "overflow"; the engine test accepts either, keyed to `SLIDE-LMB-004`.
- `rem_s(MIN, -1)` is 0 on all three sides, no trap (both widths).
- 19 rows are model + VOK only: 13 shape refusals and 6 grow rows (one
  grow to 65536 pages, five with current pages above the declared max);
  no multi-GiB allocation in tests.
- memory64 ran on node v24.20.0 (0 rows skipped).

## Block pass (WSL, node v24.20.0, cargo 1.98.1)

- pin test 5/5 with `SLIDE_ROOT` (SLIDE `8f62c0c`), engine rows 1280.
- `cargo test --test linear_memory_trap_parity` 11/11.
- mutants killed 9/9, source restored by sha256.
- full `cargo test` for vok-authority green (142 lib + all test binaries).

## Still open

- Lock-step CI: the SLIDE re-derive step skips without a SLIDE checkout.
- Wiring the checker into a VOK CLI verdict (needs a `lib.rs` change; wait
  for the K3 frame branch to merge).