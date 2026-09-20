# Galerina Target WASM TODO

V1 freeze rule: WASM is an active v1 target. Keep the scope to target metadata,
module boundaries, imports/exports, browser/edge constraints and reports.

```text
[x] Create /packages-ts/galerina-target-wasm
[x] Add README.md
[x] Add TODO.md
[x] Add package metadata
[x] Add initial typed exports
[ ] Define input contract from galerina-core-compiler and galerina-core-compute
[ ] Define WASM target metadata
[ ] Define WASM module output contract
[ ] Define WASM import/export contract
[ ] Define browser and edge runtime constraints
[ ] Define WASM target report format
[ ] Define fallback report format
[ ] Add examples
[x] Add initial focused contract tests (4 tests)
[x] Add hostile-record, inherited/accessor/proxy, sparse/custom-array and alias-mutation tests
[ ] Replace legacy `Galerina_WASM_*` diagnostics with owned `FUNGI-CATEGORY-NNN` registry entries
[ ] Reconcile the WASM runtime vocabulary and schema owner with `galerina-core-compute`
[ ] Bind artefact identity to admitted module bytes, digest, imports/exports and sandbox/effect evidence
[ ] Replace caller-aliased report evidence with one bounded immutable snapshot and typed refusal route
```
