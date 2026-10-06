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
// Offline root -> operational registry authority delegation. This binds both
// operational public-key fingerprints and the only two admitted signing roles.
export * from "./registry-authority.js";
// Operational authority -> package manifest. Both signature components cover
// source identity, powers, governance facts, and the delegated signer keyId.
export * from "./registry-package-manifest.js";
// Default production registry consumption. Callers provide pinned verifier
// mechanics and accepted epoch floors, never an index object or filesystem
// path; the runtime opens and verifies the canonical public artifacts itself.
export * from "./registry-runtime.js";
export * from "./registry-rotation-authority.js";
export * from "./registry-rotation-controller.js";
export * from "./registry-generation.js";
export * from "./registry-generation-store.js";
export * from "./registry-activation-simulator.js";
export * from "./registry-durability-admission.js";
export * from "./registry-durability-artifact.js";
export * from "./registry-durability-evidence.js";
export * from "./registry-durability-production-admission.js";
export * from "./production-slide-restore-admission.js";
export * from "./production-boot-composition-candidate.js";
export * from "./typed-api-boundary.js";
export * from "./api-server-handoff-contract.js";
export * from "./request-validation-policy.js";
export * from "./auth-provider-boundary.js";
export * from "./scope-role-policy.js";
export * from "./rate-limit-workload-policy.js";
export * from "./structured-await-policy.js";
export * from "./queue-job-contract.js";
export * from "./runtime-audit-report-format.js";
