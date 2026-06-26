# Galerina Documentation

This directory contains detailed Galerina language, compiler, runtime and target design documents.

Root files such as `README.md`, `SPEC.md`, `DESIGN.md`, `ARCHITECTURE.md` and `OMNI_LOGIC.md` should act as entry points. Detailed subject documents should live here.

For the runnable v0.1 prototype, start with the repository-root
`GETTING_STARTED.md`, `compiler/README.md` and `examples/README.md`.

## Coverage Update Status

`../../../docs/COVERAGE.md` is the active coverage tracker for package docs and
Knowledge Base files. When coverage notes conflict with this directory, prefer
the owning package README/TODO and the newest canonical KB before changing
language-core docs.

Current canonical notes:

- `galerina-core-logic` owns the v0.2 `TriState`, `Decision`,
  `BoolBoundaryResult` and Omni contracts.
- `galerina-core-network` owns webhook HMAC, replay and idempotency contracts.
- `galerina-core-security` owns protected secret references and safe sink policy.
- `galerina-core-photonic` owns photonic runtime target semantics; photonic/vector
  ownership and diagnostic-code conflicts are unresolved.
- `galerina-core` docs may reference these packages, but should not make package
  implementation details look like language-core syntax.

## Core Language

```text
pending-additions.md
pending-Galerina-additions.md
feature-status.md
language-rules.md
language-supported-primitives.md
language-non-supported-primitives.md
legacy-and-compatibility-boundaries.md
backend-runtime-capability-roadmap.md
language-core-maturity-roadmap.md
generated-output-and-runtime-ergonomics.md
memory-safety-and-developer-experience.md
language-positioning-principles.md
ai-understandable-architecture-policy.md
security-invariants-and-policy-proof.md
trust-conversion-and-data-safety.md
context-tagged-verified-execution-cache.md
package-resolver.md
certified-package-registry.md
machine-profile-bridge.md
compliance-and-privacy.md
data-processing.md
concurrency.md
structured-await.md
compute-blocks.md
syntax.md
syntax-logic-status.md
sytax/
dart-flutter-target.md
react-native-target.md
device-capability-boundaries.md
javascript-typescript-framework-targets.md
safe-pattern-matching-and-regex.md
tri-logic
type-system.md
modules-and-visibility.md
standard-library.md
package-use-registry.md
package-boundaries.md
contracts.md
glossary.md
```

## Package Boundary References

`galerina-core` documentation may describe syntax, compiler checks and report
contracts for package-owned concepts, but the package-specific docs should be
updated first:

```text
../../galerina-core-logic/README.md
../../galerina-core-compiler/README.md
../../galerina-core-runtime/README.md
../../galerina-core-security/README.md
../../galerina-core-config/README.md
../../galerina-core-reports/README.md
../../galerina-core-vector/README.md
../../galerina-core-compute/README.md
../../galerina-ai/README.md
../../galerina-ai-lowbit/README.md
../../galerina-core-photonic/README.md
../../galerina-target-cpu/README.md
../../galerina-cpu-kernels/README.md
../../galerina-target-native/README.md
../../galerina-target-wasm/README.md
../../galerina-target-gpu/README.md
../../../docs/AI_ACCELERATOR_TARGETS.md
../../../docs/OPTICAL_IO.md
../../galerina-target-photonic/README.md
../../galerina-framework-app-kernel/README.md
../../galerina-framework-api-server/README.md
../../galerina-core-cli/README.md
../../galerina-core-tasks/README.md
../../galerina-tools-benchmark/README.md
../../galerina-devtools-project-graph/README.md
```

Use `package-boundaries.md` to decide whether a change belongs in `galerina-core` or
one of the sibling packages.

## Logic and Targets

```text
omni-logic.md
logic-widths.md
logic-targets.md
hybrid-logic-and-wavelength-compute.md
hardware-feature-detection-and-security.md
target-and-capability-model.md
vector-model.md
vectorised-dataset-syntax.md
simple-vector-and-compute-auto.md
backend-compute-support-targets.md
compiler-backends.md
gpu-target.md
kernel-and-driver-boundary.md
```

## Safety and Diagnostics

```text
memory-safety.md
memory-and-variable-use.md
memory-error-correction.md
memory-pressure-and-disk-spill.md
storage-aware-performance.md
security-risk-feature-ranking.md
warnings-and-diagnostics.md
system-health-warnings.md
disk-memory-and-cache-warnings.md
error-codes.md
auth-token-verification-boundaries.md
security-model.md
security-invariants-and-policy-proof.md
trust-conversion-and-data-safety.md
ransomware-resistant-design.md
strict-global-registry.md
dependencies.md
```

## API and Interop

```text
../../galerina-framework-api-server/README.md
json-native-design.md
lazy-compact-json.md
api-native-design.md
api-duplicate-detection-and-idempotency.md
api-data-security-and-load-control.md
auth-token-verification-boundaries.md
webhooks.md
frontend-compilation-js-wasm.md
browser-dom-and-web-platform-primitives.md
dart-flutter-target.md
device-capability-boundaries.md
javascript-typescript-framework-targets.md
xml-support.md
graphql-support.md
search-and-translation-provider-boundaries.md
text-ai-package-boundaries-and-compute-auto.md
image-ai-package-boundaries-and-compute-auto.md
video-package-boundaries-and-compute-auto.md
interoperability.md
Galerina-vs-python-and-generated-outputs.md
```

## Tooling

```text
run-and-compile-modes.md
startup-validation.md
security-first-build-system.md
debug-console.md
pure-flow-caching.md
primary-lane-and-offload-nodes.md
ai-token-reduction.md
testing.md
observability.md
```

## Per-Syntax Reference

The `docs/sytax/` folder contains one-file-per-feature syntax notes.

When adding or changing Galerina syntax, update both the relevant design document and
the matching file under `docs/sytax/`.

The `docs/sytax-examples/` folder contains matching good/bad usage examples for
each syntax feature. Update it at the same time as `docs/sytax/`.

## Generated Build Documentation

The prototype writes generated documentation under the selected build output
directory, usually `build/examples/docs/` for production-style example builds
or `.build-dev/docs/` for development generation.

```text
api-guide.md
webhook-guide.md
type-reference.md
global-registry-guide.md
security-guide.md
runtime-guide.md
memory-pressure-guide.md
run-compile-mode-guide.md
deployment-guide.md
ai-summary.md
docs-manifest.json
```

These generated files describe the checked source and build reports. They are
separate from the hand-written design documents in this directory.
