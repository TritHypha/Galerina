# Galerina Target WASM

`galerina-target-wasm` is the package for WebAssembly target planning and output
contracts.

It belongs in:

```text
/packages-galerina/galerina-target-wasm
```

Use this package for:

```text
WASM target metadata
WASM module output planning
browser and edge runtime constraints
WASM import/export contracts
WASM target reports
fallback reports
```

## Boundary

`galerina-target-wasm` should consume checked compiler/compute output and produce
WebAssembly target plans or artefact metadata. It should not own general
language syntax, runtime policy or browser framework code.
