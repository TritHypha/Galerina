# Compiler Backends

Galerina should compile through a checked intermediate representation before backend output.

## Planned Backends

```text
cpu binary
portable systems output
JavaScript ESM
TypeScript declarations
Node-compatible JavaScript/WASM
Dart package
Flutter-compatible Dart package
Flutter FFI native library plus Dart bindings
React Native-compatible TypeScript/JavaScript package
mobile native binding/package output
WebAssembly
browser/Node WASM bridge
worker-compatible JavaScript/WASM modules
GPU plan
photonic plan
ternary simulation
omni-logic simulation
wavelength compute plan
```

## Prototype Output

The v0.1 prototype emits `app.omni-logic.sim` as a planning artefact for configurable logic-width simulation.

Wavelength compute is documented as a future analogue photonic planning target
in `docs/hybrid-logic-and-wavelength-compute.md`; the v0.1 prototype does not
emit a wavelength backend artefact.

## First Practical Implementation Target

The first practical Galerina implementation target is a checked interpreter/prototype running on Node.js.

This target exists to prove syntax, safety checks, diagnostics, reports and developer workflow before committing to native, WASM, GPU or hardware-specific backends.

Implementation order:

```text
1. Node.js-hosted lexer, parser, checker and simple run mode.
2. Development reports, source maps, AI context and generated guides.
3. JavaScript/browser output for browser-safe Galerina code.
4. TypeScript declaration and schema output for framework-facing code.
5. Node-compatible ESM and worker-safe module output planning.
6. Dart package output for Dart/Flutter-compatible business logic.
7. Flutter package/plugin output planning, including permission and source-map reports.
8. React Native adapter/package output planning, including permission and native-boundary reports.
9. WebAssembly output for isolated compute-heavy frontend/backend code.
10. Browser/Node WASM bridge output and worker-compatible compute modules.
11. Portable systems output planning once IR, memory rules, layout rules and ABI rules stabilise.
12. Native/CPU backend once IR, memory rules and security rules stabilise.
13. Flutter FFI/native-library output after native ABI and memory rules stabilise.
14. Mobile native binding/package output after platform permission and native boundary rules stabilise.
15. GPU, photonic, wavelength and omni-logic backends as planning/report targets first.
```

This means early Galerina should run through a checked interpreter/prototype first, not compile directly to WASM or a native executable as the first production path.

The final long-term compiler implementation language remains a separate decision.

## Systems Lowering Boundary

Galerina may support lower-level backend and ABI work later, but normal Galerina
source should stay high-level, strict and security-first.

Recommended boundary:

```text
Galerina app layer     = APIs, agents, JSON, security policy, typed contracts
Galerina systems layer = runtime internals, ABI bindings, layout, buffers, targets
systems output       = generated backend artifact, not normal source style
```

This means Galerina may lower checked IR to portable systems output:

```text
main.spore
  -> Galerina AST
  -> typed IR
  -> security, memory and effect checks
  -> systems output
  -> platform compiler
```

Raw pointer-like access, unchecked casts, null pointer behaviour, macro-heavy
generation, manual free everywhere and implicit integer conversions remain
outside normal Galerina code.

Future systems-output planning may remain staged in `galerina-target-native` until
it is stable enough to split. Shared ABI and systems-profile rules may later
justify separate packages, but those packages should not be added before the
core parser, checker, memory model and interop report contracts are credible.

Expected future systems backend outputs:

```text
build/systems/app.runtime
build/systems/galerina_runtime.runtime
build/systems/galerina_runtime.interface
build/app.bin
build/app.source-map.json
build/app.security-report.json
build/app.memory-report.json
build/app.abi-report.json
```

Rules:

```text
Systems output is generated, not hand-authored app code.
Generated systems output must preserve source maps back to Galerina.
Generated systems output must not weaken Galerina's typed errors, missing-value rules or effects.
Manual memory control is allowed only inside audited systems/interop profiles.
Native ABI imports and exports must declare ownership, nullability, layout and errors.
```

## Backend Rules

```text
CPU compatibility remains the baseline.
Accelerator backends must report fallback.
Logic width support must be reported as a target capability.
Unsupported operations must produce source-mapped diagnostics.
Generated reports should describe precision, fallback and target risk.
Wavelength and analogue compute must declare tolerance, fallback and CPU-reference verification policy.
Dart and Flutter backends must keep Galerina as a language output target, not a native Flutter framework.
Flutter render reports must describe Skia/Impeller assumptions instead of assuming one backend.
Flutter package/plugin output must preserve normal Flutter build workflows.
Flutter FFI output must declare platform support, native memory ownership and unsupported targets.
JavaScript/TypeScript output should prefer ESM for modern framework and Node interop.
React, React Native, Angular, Express/Fastify and similar adapters must be generated package/tool outputs, not core language frameworks.
Worker-compatible outputs must report clone/transfer decisions and forbidden effects.
Mobile-native outputs must not provide built-in phone features; they must report device permissions, native bindings and platform capability assumptions.
Backend compute outputs must keep vendor-specific GPU, AI accelerator, cloud and photonic behaviour in target plugins or deployment profiles.
Systems output must be treated as a backend artifact with source maps, ABI reports and memory reports.
CPU fallback remains the baseline unless a project policy explicitly denies fallback.
Precision, tolerance, memory movement and fallback decisions must be reported.
```

## Kernel and Driver Backend Boundary

Kernel and driver development is not part of normal backend planning.

Rule:

```text
kernel modules are blocked by default
operating-system drivers are blocked by default
privileged device access is blocked by default
raw hardware access is blocked by default
vendor SDK driver bindings are blocked by default
```

Any backend work that crosses into kernel, driver, privileged runtime or direct
device-control territory must wait until late-stage design and requires explicit
maintainer or project permission before design or implementation starts.
