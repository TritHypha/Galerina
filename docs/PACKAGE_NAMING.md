# Package Naming

## Purpose

This document defines the package naming scheme for `packages-galerina/`.

```text
packages/       normal app/vendor package space
packages-galerina/    Galerina language, runtime, tooling, target and domain packages
```

Use grouped names so package purpose is visible from the directory alone.

## Naming Rule

Use:

```text
Galerina-[family]-[purpose]
```

Ungrouped names are allowed only for stable root packages whose responsibility is
already clear:

```text
galerina-core
galerina-ai
```

`galerina-core` is the language root. `galerina-ai` is the generic AI contract root.
`galerina-core-photonic` is the photonic concept/model root, not a compiler target.

When a core package has both a grouped `galerina-core-*` name and an older ungrouped
name, keep the grouped `galerina-core-*` package as canonical. Merge any unique source,
tests, manifests or current generated artifacts into the grouped package, then
remove the stale ungrouped package folder.

## Package Families

| Family | Meaning | Examples |
|---|---|---|
| `galerina-core-*` | Core language, toolchain, runtime, network policy and safe developer automation | `galerina-core-compiler`, `galerina-core-runtime`, `galerina-core-network`, `galerina-core-security`, `galerina-core-cli`, `galerina-core-tasks` |
| `galerina-ai-*` | AI workload, model, agent and AI compute-model packages | `galerina-ai-agent`, `galerina-ai-neural`, `galerina-ai-neuromorphic`, `galerina-ai-lowbit` |
| `galerina-data-*` | Data processing, parsing, search, archive, typed database boundary, streaming and report contracts | `galerina-data-html`, `galerina-data-search`, `galerina-data-db`, `galerina-data-response` |
| `galerina-web-*` | Browser-safe web rendering, state, component, router and event contracts | `galerina-web-render`, `galerina-web-state`, `galerina-web-components` |
| `galerina-db-*` | Database provider adapter contract packages | `galerina-db-postgres`, `galerina-db-mysql`, `galerina-db-sqlite` |
| `galerina-target-*` | Compiler/output targets and backend planning | `galerina-target-cpu`, `galerina-target-gpu`, `galerina-target-wasm`, `galerina-target-photonic` |
| `galerina-cpu-*` | CPU implementation and optimized kernel packages | `galerina-cpu-kernels`, future `galerina-cpu-photonic-sim` |
| `Galerina-gpu-*` | GPU implementation and optimized kernel packages | future `Galerina-gpu-kernels` |
| `galerina-framework-*` | Optional framework, server and app boundary packages | `galerina-framework-app-kernel`, `galerina-framework-api-server`, `galerina-framework-example-app` |
| `galerina-devtools-*` | Development-only tools not needed by production installs | `galerina-devtools-project-graph` |
| `galerina-tools-*` | Tools that may run in development or staging but are not core runtime packages | `galerina-tools-benchmark` |
| `Galerina-finance-*` | Finance domain package family | `Galerina-finance-core` |
| `Galerina-electrical-*` | Electrical infrastructure domain package family | `Galerina-electrical-core` |
| `Galerina-ot-*` | Operational-technology integration package family | `Galerina-ot-core`, future `Galerina-ot-opcua` |
| `Galerina-database-*` | Database domain package family | future package family |
| `Galerina-industrial-*` | Industrial domain package family | future package family |
| `Galerina-science-*` | Science domain package family | future package family |
| `Galerina-manufacturing-*` | Manufacturing domain package family | future package family |

## Current Package Names

```text
galerina-core
galerina-core-cli
galerina-core-compiler
galerina-core-compute
galerina-core-config
galerina-core-logic
galerina-core-network
galerina-core-photonic
galerina-core-reports
galerina-core-runtime
galerina-core-security
galerina-core-tasks
galerina-core-vector
galerina-ai
galerina-ai-agent
galerina-ai-lowbit
galerina-ai-neural
galerina-ai-neuromorphic
galerina-data
galerina-data-archive
galerina-data-database
galerina-data-db
galerina-data-html
galerina-data-json
galerina-data-model
galerina-data-pipeline
galerina-data-query
galerina-data-reports
galerina-data-response
galerina-data-search
galerina-web
galerina-web-render
galerina-web-state
galerina-web-components
galerina-web-router
galerina-web-events
galerina-db-firestore
galerina-db-mysql
galerina-db-opensearch
galerina-db-postgres
galerina-db-sqlite
galerina-target-ai-accelerator
galerina-target-native
galerina-target-cpu
galerina-target-gpu
galerina-target-js
galerina-target-photonic
galerina-target-wasm
galerina-cpu-kernels
galerina-framework-app-kernel
galerina-framework-api-server
galerina-framework-example-app
galerina-devtools-project-graph
galerina-tools-benchmark
```

Archived post-v2 domain package names:

```text
Galerina-finance-core
Galerina-electrical-core
Galerina-ot-core
```

These packages are preserved under `C:\laragon\www\Galerina_Archive\packages-galerina\`
and must not be part of the active v1 build graph.

## Devtools Rule

Packages needed only by developers should use `galerina-devtools-*` when they inspect,
map, scaffold or explain the project. They should not be production runtime
dependencies.

Use `galerina-tools-*` for broader utilities such as benchmark runners, diagnostics or
release tooling that may run in development or staging.

Production profiles must not enable `galerina-devtools-*` or `galerina-tools-benchmark` by
default. A production build that includes one of these packages requires an
explicit production package override with a reason and report output.

## Enterprise Package Root

Enterprise-only packages live outside the active package collection:

```text
packages-galerina-enterprise/
```

Do not add packages from `packages-galerina-enterprise/` to `galerina.workspace.json`
or production package profiles unless the project owner explicitly unlocks the
named enterprise package or feature area.

Current enterprise package family:

```text
galerina-compliance
galerina-compliance-accessibility
galerina-compliance-ai
galerina-compliance-audit
galerina-compliance-data
galerina-compliance-deployment
galerina-compliance-privacy
galerina-compliance-reports
galerina-compliance-retention
galerina-compliance-security
```

## Target Rule

`galerina-target-*` packages describe where compiled Galerina code is going.

Do not rename target packages to I/O packages. For example, `galerina-target-native`
means future native executable output planning. `galerina-target-photonic` means compiler
mapping to photonic hardware, simulators or plans.

I/O packages can be added later for data movement, but core network policy is
owned by `galerina-core-network`:

```text
galerina-core-network
galerina-io-network
Galerina-io-storage
Galerina-io-binary
Galerina-io-optical
Galerina-io-photonic
```

These should not replace compiler target packages. Prefer `galerina-core-network`
for the shared network policy, permission, profile and report contracts used by
the runtime, security package, app kernel and API server.

## Photonic Rule

Use these names for photonic work:

```text
galerina-core-photonic      photonic concepts, types, models, APIs and simulations
galerina-target-photonic    compiler target planning for photonic hardware, simulators or plans
galerina-cpu-photonic-sim   future CPU implementation package for photonic simulation
galerina-cpu-photonic-kernels future CPU kernels for photonic-style numerical simulation
```

Do not use `galerina-core-potonic`; that is a typo. Do not use a bare
`Galerina-photonic` package name under the grouped naming scheme. Do not use
`galerina-cpu-photonic` for the general concept package, because CPU packages should
own CPU implementations or kernels, not photonic vocabulary.

## Rename Checklist

When renaming a package, update:

```text
directory paths
package.json names
galerina.workspace.json
docs and examples
tests
imports and relative paths
generated project graph outputs
changelog and migration notes
```
