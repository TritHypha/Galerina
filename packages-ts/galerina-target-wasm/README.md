# Galerina Target WASM

`galerina-target-wasm` is the package for WebAssembly target planning and output
contracts.

It belongs in:

```text
/packages-ts/galerina-target-wasm
```

Use this package for:

```text
WASM target metadata
WASM module output planning
browser and edge runtime constraints
WASM import/export contracts
WASM target reports
fallback reports (fungi.wasm.fallback.v1)
compiler/compute planning handoff (fungi.wasm.handoff.v1)
FUNGI-WASM-001..030 diagnostics
```

## Boundary

`galerina-target-wasm` consumes compiler `{ projectRoot, entryFiles }` and
compute selection shapes as a *planning* handoff. `admission` on that handoff
is always `not-evaluated`; fallback identity never admits an artefact.

This package hashes supplied `bytesHex`. It does not open artefact paths
(TOCTOU lives with the loader). `verifyWasmAttestationSignature` always
refuses: Ed25519 verification is the runtime TCB. Certified artefacts still
require a non-empty signature field.

Compute target `wasm` maps to wasm runtimes `{ browser, edge, server, standalone }`.
Other compute targets (`gpu`, `photonic`, …) are not wasm runtimes.

Examples: `examples/artefact.example.json`, `examples/handoff.example.json`.
