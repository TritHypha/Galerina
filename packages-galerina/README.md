# Galerina Package Collection

`packages-galerina/` is the home for active reusable Galerina packages in this beta
workspace. It is split from ordinary app/vendor packages.

Current beta rule:

```text
packages/       normal app/vendor package space
packages-galerina/    Galerina package collection and beta Galerina package experiments
```

The long-term direction is:

```text
my-galerina-app/
|-- package.json       normal app/runtime ecosystem dependencies
|-- package-galerina.json    Galerina package manifest
|-- galerina.lock.json       locked Galerina package graph
|-- packages/          normal vendor/app packages
|-- packages-galerina/       Galerina packages, optionally a nested Git repository
|-- boot.spore
`-- main.spore
```

`packages-galerina/` may later become its own Git repository or submodule. If a
`.git` directory is added, it must be intentional and documented.

## Production Boundary

Production app installs should only fetch Galerina packages required by the selected
runtime profile. Development-only packages, staging packages, diagnostics,
generators and experimental packages should require an explicit development or
staging profile.

## V1 Surface Freeze

The active v1 surface is intentionally narrow:

```text
core language syntax
core type system
explicit Result / Option error and missing-value handling
memory-safety model
CPU target
WASM target
core reports, config, security, runtime, compiler and CLI tooling
core network I/O policy and report contracts
```

Everything beyond CPU and WASM target support is post-v1 unless it is required
to specify the core type system. Domain packages and regulated/safety-heavy
packages should stay outside the active workspace until the parser, memory
model and v1 examples are stable.

## Naming

Package names follow the family-prefix rule documented in
`../docs/PACKAGE_NAMING.md`.

Use:

```text
galerina-[family]-[purpose]
```

Development-only packages should use `galerina-devtools-*` or `galerina-tools-*` so they are
not mistaken for production runtime dependencies.

## Current Packages

- `galerina-core/` - Galerina language rules, syntax, type system, examples and core docs.
- `galerina-core-compiler/` - compiler pipeline contracts.
- `galerina-core-runtime/` - execution contracts for checked or compiled Galerina code.
- `galerina-core-network/` - network I/O policy, profile, permission and report contracts.
- `galerina-core-security/` - security primitives, redaction, permissions and reports.
- `galerina-core-config/` - project config and environment mode contracts.
- `galerina-core-reports/` - shared report schemas and report-writing contracts.
- `galerina-core-logic/` - `Tri`, `Galerina`, Decision, RiskLevel and Omni logic.
- `galerina-core-vector/` - vector, matrix, tensor and numeric operation concepts.
- `galerina-core-compute/` - compute planning, capabilities, effects and target selection.
- `galerina-core-cli/` - developer command tooling.
- `galerina-core-tasks/` - safe typed project automation.
- `galerina-ai/` - post-v1 generic AI inference contracts and AI safety policy.
- `galerina-ai-agent/` - post-v1 supervised AI agent and tool-permission contracts.
- `galerina-ai-lowbit/` - post-v1 low-bit and ternary AI backend contracts.
- `galerina-ai-neural/` - post-v1 neural workload contracts.
- `galerina-ai-neuromorphic/` - post-v1 spike and event-signal workload contracts.
- `galerina-data/` - post-v1 data-processing package umbrella contracts.
- `galerina-data-*` - post-v1 HTML, search, archive, JSON, database archive,
  typed database boundary, model, query, response, streaming pipeline and
  data-processing report contracts.
- `galerina-web/` and `galerina-web-*` - post-v1 typed browser rendering, client
  state, component, router and browser event contracts.
- `galerina-db-*` - post-v1 database provider adapter contracts for PostgreSQL,
  MySQL, SQLite, OpenSearch and Firestore-style systems.
- `galerina-core-photonic/` - post-v1 photonic concepts, models, APIs and simulations.
- `galerina-target-cpu/` and `galerina-target-wasm/` - v1 compiler/output target packages.
- `galerina-target-js/` - post-v1 JavaScript output planning for browser and
  framework adapter targets.
- Other `galerina-target-*` packages - post-v1 target planning.
- `galerina-cpu-kernels/` - optimized CPU kernel contracts.
- `galerina-framework-app-kernel/` - optional secure application kernel.
- `galerina-framework-api-server/` - built-in HTTP API transport package.
- `galerina-framework-example-app/` - minimal example/template app package.
- `galerina-devtools-project-graph/` - development-only project graph tooling.
- `galerina-tools-benchmark/` - benchmark and diagnostic tooling.

Archived package planning lives outside this active workspace:

```text
C:\laragon\www\Galerina_Archive\packages-galerina\galerina-finance-core
C:\laragon\www\Galerina_Archive\packages-galerina\galerina-electrical-core
C:\laragon\www\Galerina_Archive\packages-galerina\galerina-ot-core
```

Enterprise-only packages live outside this active package collection:

```text
../packages-galerina-enterprise/
```

The compliance package family has been moved there and must not be treated as
part of the active v1 build graph unless explicitly unlocked.
