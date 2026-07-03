// Galerina App Kernel (framework P1) — public surface.
// Slice 1: core route-policy contracts + the secure-default resolver (§10).
// Slice 2: the fixed, non-bypassable governed request pipeline (createAppKernel).
// Slice 4 (Fuse B2): the fusion host — admit a built package's signed, governed
//   .wasm at a declared seam, capability-bounded (fusePackage / FusedComponent).
export * from "./types.js";
export * from "./route-defaults.js";
export * from "./kernel.js";
// Gate 9.5: the fail-closed secrets seam (SecretsProvider / SecretGate / createSecretGate).
export * from "./secret-gate.js";
export * from "./fuse-loader.js";
// Slice (Fuse B5a): the signed central registry index — a tamper-evident certified-package
//   catalog the resolver consults before admission (verify → lookup → policy, fail-closed).
export * from "./registry-index.js";
