# Galerina Wasmtime oracle

**Status:** development-only independent execution oracle.
**Production authority:** none.

This package runs admitted Wasm fixtures through Wasmtime so Galerina can
compare results and terminal traps across the Stage-A interpreter, V8, and a
separately implemented engine. It preserves the useful evidence originally
developed in `subprojects/dss-host` while retiring the pre-SLIDE proposal that
described a Rust sidecar as Galerina's future production TCB.

The oracle can:

- prove Wasmtime fuel exhaustion is fail-closed;
- run V_DPM and general corpus differential fixtures;
- prove reused linear memory is zeroed;
- independently reject altered attestation evidence;
- provide compatibility evidence for the optional Wasm target.

It cannot:

- supervise production Galerina or SLIDE tasks;
- grant capabilities, leases, package admission, or memory access;
- hold production secrets or signing keys;
- access application databases or networks;
- substitute for SLIDE final-artifact verification or isolation;
- turn a passing differential into runtime authority.

## Why this remains Rust

Engine independence is the point of the oracle. Implementing the Wasmtime
comparator through the same TypeScript/JavaScript execution stack would weaken
the differential. Rust here is a development-tool implementation detail, not
an authoritative Galerina language component and not an exception that gives
application developers manual memory authority.

## Supply-chain boundary

- `Cargo.lock` pins the exact crate graph.
- Wasmtime is pinned to `47.0.4` (security patch releases 47.0.3 of 2026-07-31: GHSA-hgjw-h833-99q9, GHSA-2hw9-mc66-jc2q, and 47.0.4 of 2026-08-20: GHSA-x84v-gj2h-g759, GHSA-vqjp-4c8c-hfgg; zero-trust default, owner-confirmed 2026-10-04). Further updates need a separate review.
- `deny.toml` refuses yanked packages, wildcard versions, unknown registries,
  unknown Git sources, and non-admitted licences.
- `target/`, generated fixtures, and Cargo registry sources are not Galerina
  packages and are never indexed as project source.
- `cargo deny check` is required before this oracle can count as release
  evidence.

## Build, test, and vet

```bash
cargo build --locked
cargo test --locked
cargo deny check
```

## Evidence boundary

The tests retain their historical DSS/V_DPM fixture names where those names
describe the fixture being compared. Active package and runtime wording uses
“Wasmtime oracle”, not “sidecar” or “production host”.

Superseding design:
`../../docs/superpowers/specs/2026-07-30-governed-memory-and-wasmtime-oracle-design.md`.

Historical security input:
`../../docs/architecture/dss-wasm-runtime-security-inputs-2026-07-22.md`.
