# Galerina Target WASM TODO

Current sequencing: [pre-.fungi work register](../../docs/PRE-FUNGI-WORK-REGISTER-2026-09-22.md),
W10. Package tests **25/25** with typecheck/build.

V1 freeze rule: WASM is an active v1 target. Keep the scope to target metadata,
module boundaries, imports/exports, browser/edge constraints, reports, fallback
and compiler/compute *planning* handoff. Signature verification and physical
open remain the runtime TCB.

```text
[x] Create /packages-ts/galerina-target-wasm
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[x] Compiler/compute input contract `fungi.wasm.handoff.v1`
    (`validateWasmHandoff`): CompilerInput `{ projectRoot, entryFiles }` plus
    compute selection `{ requested, selectedTarget, reason, fallback, satisfied }`.
    `admission` is only `not-evaluated`. Tests:
    `tests/wasm-contracts.test.mjs` handoff suite.
[x] Define WASM target metadata (`src/index.ts` WasmTarget; tests runtime invalid).
[x] Define WASM module output contract (`fungi.wasm.artefact.v1`).
[x] Define WASM import/export contract (section kind + duplicate identity).
[x] Define browser and edge runtime constraints (`FORBIDDEN_EFFECTS`).
[x] Define WASM target report format (`createWasmTargetReport` admitted vs refused).
[x] Versioned fallback identity `fungi.wasm.fallback.v1`.
[x] `bindComputeSelectionToWasmFallback` maps a compute selection shape without
    admitting an artefact.
[x] Handoff does not compile identity into artefact admission (`FUNGI-WASM-029`).
    No `@galerina/core-compute` package dependency; compute vocabulary is copied
    as `COMPUTE_TARGETS`.
[x] Examples: `examples/artefact.example.json`, `examples/handoff.example.json`
    (validated in tests).
[x] Focused contract tests **25/25** at `tests/wasm-contracts.test.mjs`.
[x] Hostile-record, inherited/accessor/proxy, sparse/custom-array and alias-mutation tests.
[x] Bounded runtime decoder and detached immutable report snapshot.
[x] C04 `fungi.wasm.artefact.v1` binds bytes, digest, attestation, section
    identity, limits and effects (`RD-1279`).
[x] Diagnostics are `FUNGI-WASM-001`..`FUNGI-WASM-030` (`WASM_DIAGNOSTIC_REGISTRY`).
    Legacy `Galerina_WASM_*` names are retired.
[x] Runtime vocabulary reconciled: compute target `wasm` requires `wasmRuntime`
    in `{ browser, edge, server, standalone }`; other compute targets must not
    carry a wasmRuntime (`FUNGI-WASM-028`).
[x] Physical open/TOCTOU is not this package: identity uses supplied `bytesHex`,
    not a filesystem open. Ed25519 verification is not this package:
    `verifyWasmAttestationSignature` always returns `FUNGI-WASM-030`.
    Certified artefacts still require a non-empty signature (`FUNGI-WASM-012`).
```
