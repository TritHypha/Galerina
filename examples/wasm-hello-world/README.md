# wasm-hello-world

Phase 24 milestone: `greet.spore` compiles to WAT with real instruction bodies.

## What this demonstrates

`greet.spore` declares a single pure flow:

```
pure flow greet(name: String) -> String
contract { intent { "Return a greeting." } effects {} }
{ return name }
```

Phase 24 delivers real WebAssembly Text Format instruction bodies for pure flows.
Instead of emitting `unreachable` stubs, the compiler now emits:

- `(local.get $p0) ;; return first param` — for pure flows that return a parameter
- `(i32.const 0) ;; default return` — for pure flows with no parameters

## Compilation pipeline

```
greet.spore
  → parseProgram()
  → checkEffects()
  → emitGIR()           (Governed Intermediate Representation)
  → buildWATModuleFromGIR()
  → renderWAT()          → greet.wat  (real instruction bodies)
  → assembleWAT()        → greet.wasm (valid WASM binary)
```

## Phase 24 WAT output

The compiled `greet` flow emits WAT like:

```wat
(module
  (memory 2 2048)
  (export "memory" (memory 0))

  ;; pure flow: greet
  (func $greet (param $p0 externref) (result i32)
    (local.get $p0) ;; return first param
  )
  (export "greet" (func $greet))
)
```

## Target: Phase 25 and beyond

- Phase 25: `wat2wasm` compiles the `.wat` to `.wasm`; `wasmtime` executes it
- Phase 25: `verifyPassword` end-to-end Galerina → WAT → WASM → Node → HTTP → WASM → HTTP response
- Phase 26: `wasmtime` standalone (no Node.js), WASI imports

## Running the Phase 24 test

```
cd packages-galerina/galerina-core-compiler
npm run build && npm test -- --test-name-pattern "Phase 24"
```
