# LSP — Architecture Issues / Deferred Seams

`@galerina/core-sentinel-power` (LSP) is intentionally pure TypeScript with zero
dependencies so it stays deterministic and WASM-linear-memory-compatible. Two
items are deliberately out of scope for this build.

## (a) Real thermal sensor reads — native host seam, NOT implemented

Reading actual on-die temperature (thermal diodes, ACPI thermal zones,
`/sys/class/thermal`, vendor MSRs, or an aerospace board's I2C/SPI thermistor
bus) requires privileged, OS- and board-specific access. That belongs at the
runtime **host boundary**, not in this portable core.

LSP therefore supports temperature input through exactly two deterministic
paths: the injected `sensor` callback (`new PowerGovernor(env, { sensor })`,
returning °C) and the manual `setReading(tempC)` used by tests and no-sensor
operation. When a real sensor addon lands, it is a mechanical change — the host
supplies a `() => number` callback and nothing else in LSP changes. `read()`
re-reads the sensor on every `evaluate()`, so a live sensor is reflected
immediately with no caching to invalidate.

## (b) HybridEngine bridge-selection wiring deferred

Feeding the governor's down-tier decision into the HybridEngine's bridge
selection — so a rising temperature actually swaps the live inference kernel
(`native` → `simd` → `shadow`) before the silicon throttles — is left to the
integrating session. The public surface here is shaped so that wiring is a
mechanical change on the consumer side:

- `evaluate()` returns the `{ state, kernel, tempC, reason }` the bridge
  selector consumes directly.
- `requestAdjustment(targetKernel)` lets the engine ask for a tier and receive
  a clamped, governed answer (`granted` / `allowed`) — it may down-tier freely
  but can never be granted a hotter kernel than the current band permits.
- `assertWithinEnvelope()` is the kill-switch the supervisor calls on the hot
  path; it throws `PowerFault` (`LSP-CRITICAL-001`) at/above the critical
  threshold so a TERMINAL reading halts execution deterministically.
