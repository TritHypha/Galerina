// @galerina/test — the consolidated Galerina test harness.
//
// Folds the repo's scattered test tooling into ONE named, consumable package a
// downstream app can depend on — the way Spring ships spring-test and Cargo has
// trybuild. The four checks it exposes each delegate to the existing, shipped
// tool (it LIFTS, it does not reimplement):
//
//   unit        → scripts/run-all-tests.cjs          (per-package node:test suites)
//   e2e         → node galerina.mjs check/build         (example apps, end-to-end)
//   conformance → tests/r6-corpus/r6-parity.test.mjs  (R6 Stage-A ≡ Stage-B gate)
//   fidelity    → galerina-core-compiler/tests/fidelity-differential.test.mjs
//                                                     (0014 walker ≡ bytecode ≡ WASM)
//
// Every entry point returns a CheckResult and is fail-closed: a missing target,
// a timeout, or a non-zero child exit is reported as `ok: false` with a non-zero
// exitCode — never as a silent pass.

export * from "./types.js";
export { parseCounts, parseAggregateTotal } from "./parse.js";
export { resolveRoot, resolveTarget, WORKSPACE_MARKER } from "./paths.js";
export {
  runUnit,
  runE2e,
  runConformance,
  runFidelity,
  runAll,
  DEFAULT_E2E_EXAMPLES,
} from "./runners.js";
