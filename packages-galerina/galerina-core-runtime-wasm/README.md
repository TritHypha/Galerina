# @galerina/core-runtime-wasm — border-safe WASM trust-computing base

This package is the **border-safe home** for the WASM trust-computing base (TCB) — the attested
`.wasm` instantiation + host record-marshalling that authoritative twin execution (RD-0361 R4 / #143)
depends on. It exists so the **kernel and the DSS supervisor can reach the TCB without importing the
compiler**: the Hardened Border forbids the kernel from depending on `@galerina/core-compiler`, so the
TCB cannot live there once its verdict is authoritative.

## The one hard rule — dependency direction (machine-checked)

```
   ✅  @galerina/core-compiler   →  @galerina/core-runtime-wasm   (compiler re-exports for back-compat)
   ✅  kernel / DSS supervisor   →  @galerina/core-runtime-wasm   (reachable — the whole point)
   ✅  @galerina/core-runtime-wasm →  @galerina/core-runtime      (TYPE-ONLY seam interfaces)  +  node:crypto
   ❌  @galerina/core-runtime-wasm →  @galerina/core-compiler     (would re-cross the Hardened Border)
   ❌  @galerina/core-runtime      →  @galerina/core-runtime-wasm (core-runtime stays import-free; it RECEIVES the TCB by injection)
```

The forbidden directions are enforced by `.graph/boundary-policy.json` + `audit-package-border` (a
compiler import here fails the build) — the border is not a convention, it is a gate.

## Contents

- `record-abi.ts` — the record-layout ABI (`WAT_HEAP_BASE`, `WAT_REC_FIELD_SIZE`): the ONE contract the
  WAT emitter and the WASM runtime TCB both bind to. Dependency-free.
- `wasm-runtime.ts` — the WASM TCB: attestation-verify-then-instantiate (`admitAndInstantiate`,
  `verifyWasm`, `wasmHash`, `signWasm`), a closed host import set, and host record-marshalling
  (`createHostRuntime`). Imports only `node:crypto` + the local `record-abi`. It is the mechanism that
  provides the `LowLevelWasmExecutor` / admission-verify / hash which `core-runtime`'s
  `createGovernedRuntimeExecutor` **injects** — never imported by core-runtime.

Status: the #143 TCB extraction is complete (record-abi + the TCB both live here; the compiler re-exports
them for back-compat). Remaining #143 work is the per-surface R4 authority flip (secret-gate first,
byte-parity order, shadow-bake), which is a runtime-authority change, not a code move.
