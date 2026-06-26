# Galerina Package Naming

## Status

```text
Package naming: specified - implementation future migration
Applies to:      packages-galerina package family
```

This document defines package naming conventions and a migration map for active
Galerina packages. The broader historical package naming context is in
`docs/PACKAGE_NAMING.md`.

---

## Rules at a Glance

- Use `galerina-*` for implementation packages.
- Use `spore` for language-surface artifacts such as diagnostics, grammar, AST
  formats, and CLI file formats.
- Prefer explicit package families over ambiguous root names.
- Merge duplicates before renaming dependent packages.
- Package names must reveal ownership and authority surface.
- Archived finance, electrical, and OT packages are outside the active v1 build.

---

## Naming Strategy

`galerina-*` names are for implementation packages: compiler, runtime, stdlib,
targets, framework packages, database connectors, developer tools, and runtime
support.

`spore` is reserved for language artifacts:

- grammar file formats
- AST schema names
- diagnostic schemas
- package manifest schema identifiers
- CLI output formats
- GIR schema identifiers

Final principle:

```text
galerina-* for packages. spore for language artifacts.
```

## Naming Families

| Family | Purpose |
|---|---|
| `galerina-core-*` | Core language/runtime primitives. |
| `galerina-ai-*` | AI-specific systems. |
| `galerina-data-*` | Data formats, models, queries, reports. |
| `galerina-db-*` | Concrete database connectors. |
| `galerina-target-*` | Execution target and lowering packages. |
| `galerina-framework-*` | Application framework packages. |
| `galerina-web-*` | Web UI, router, render, state, and events. |
| `galerina-devtools-*` | Developer tooling. |
| `galerina-tools-*` | Standalone tools. |

## Full Rename Map

| Current package | Recommended package | Action |
|---|---|---|
| `galerina-ai` | `galerina-ai` | Keep |
| `galerina-ai-agent` | `galerina-ai-agent` | Keep |
| `galerina-ai-lowbit` | `galerina-ai-lowbit` | Keep |
| `galerina-ai-neural` | `galerina-ai-neural` | Keep |
| `galerina-ai-neuromorphic` | `galerina-ai-neuromorphic` | Keep |
| `galerina-app-kernel` | `galerina-framework-app-kernel` | Merge |
| `galerina-core` | `galerina-core` | Keep |
| `galerina-core-cli` | `galerina-cli` | Rename |
| `galerina-core-compiler` | `galerina-compiler` | Rename |
| `galerina-core-compute` | `galerina-core-compute` | Keep |
| `galerina-core-config` | `galerina-core-config` | Keep |
| `galerina-core-logic` | `galerina-core-logic` | Keep |
| `galerina-core-network` | `galerina-core-network` | Keep |
| `galerina-core-photonic` | `galerina-core-photonic` | Keep |
| `galerina-core-reports` | `galerina-reports` | Merge |
| `galerina-core-runtime` | `galerina-runtime` | Rename |
| `galerina-core-security` | `galerina-security` | Merge |
| `galerina-core-tasks` | `galerina-tasks` | Merge |
| `galerina-core-vector` | `galerina-vector` | Merge |
| `galerina-cpu-kernels` | `galerina-target-cpu-kernels` | Rename |
| `galerina-data` | `galerina-data` | Keep |
| `galerina-data-archive` | `galerina-data-archive` | Keep |
| `galerina-data-database` | `galerina-data-db` | Merge |
| `galerina-data-db` | `galerina-data-db` | Keep |
| `galerina-data-html` | `galerina-data-html` | Keep |
| `galerina-data-json` | `galerina-data-json` | Keep |
| `galerina-data-model` | `galerina-data-model` | Keep |
| `galerina-data-pipeline` | `galerina-data-pipeline` | Keep |
| `galerina-data-query` | `galerina-data-query` | Keep |
| `galerina-data-reports` | `galerina-reports` | Merge |
| `galerina-data-response` | `galerina-data-response` | Keep |
| `galerina-data-search` | `galerina-data-search` | Keep |
| `galerina-db-firestore` | `galerina-db-firestore` | Keep |
| `galerina-db-mysql` | `galerina-db-mysql` | Keep |
| `galerina-db-opensearch` | `galerina-db-opensearch` | Keep |
| `galerina-db-postgres` | `galerina-db-postgres` | Keep |
| `galerina-db-sqlite` | `galerina-db-sqlite` | Keep |
| `galerina-devtools-project-graph` | `galerina-devtools-project-graph` | Keep |
| `galerina-framework-api-server` | `galerina-framework-api-server` | Keep |
| `galerina-framework-app-kernel` | `galerina-framework-app-kernel` | Keep |
| `galerina-framework-example-app` | `galerina-framework-example-app` | Keep |
| `galerina-lowbit-ai` | `galerina-ai-lowbit` | Merge |
| `galerina-packages` | `galerina-package-tools` | Rename |
| `galerina-project-graph` | `galerina-devtools-project-graph` | Merge |
| `galerina-reports` | `galerina-reports` | Keep |
| `galerina-security` | `galerina-security` | Keep |
| `galerina-target-ai-accelerator` | `galerina-target-ai-accelerator` | Keep |
| `galerina-target-cpu` | `galerina-target-cpu` | Keep |
| `galerina-target-gpu` | `galerina-target-gpu` | Keep |
| `galerina-target-js` | `galerina-target-js` | Keep |
| `galerina-target-native` | `galerina-target-native` | Keep |
| `galerina-target-photonic` | `galerina-target-photonic` | Keep |
| `galerina-target-wasm` | `galerina-target-wasm` | Keep |
| `galerina-targets` | `galerina-targets` | Keep |
| `galerina-tasks` | `galerina-tasks` | Keep |
| `galerina-toolchain` | `galerina-toolchain` | Keep |
| `galerina-tools-benchmark` | `galerina-tools-benchmark` | Keep |
| `galerina-vector` | `galerina-vector` | Keep |
| `galerina-web` | `galerina-web` | Keep |
| `galerina-web-components` | `galerina-web-components` | Keep |
| `galerina-web-events` | `galerina-web-events` | Keep |
| `galerina-web-render` | `galerina-web-render` | Keep |
| `galerina-web-router` | `galerina-web-router` | Keep |
| `galerina-web-state` | `galerina-web-state` | Keep |

## High-Priority Consolidations

| Area | Rule |
|---|---|
| Low-bit AI | Merge `galerina-lowbit-ai` into `galerina-ai-lowbit`. |
| Database | Merge `galerina-data-database` into `galerina-data-db`. |
| Reports | Consolidate `galerina-core-reports`, `galerina-data-reports`, and `galerina-reports` into one reports package after API compatibility review. |
| CLI | Rename `galerina-core-cli` to `galerina-cli`. |
| Compiler | Rename `galerina-core-compiler` to `galerina-compiler`. |

## Rename Checklist

When renaming:

- update directory paths
- update `package.json` names
- update `galerina.workspace.json`
- update imports and relative paths
- update tests
- update docs and examples
- regenerate project graph outputs
- add changelog and migration notes

## Compiler Status

```text
Naming spec: specified
Migration:   future package cleanup
```

## See Also

- `docs/PACKAGE_NAMING.md`
- `docs/Knowledge-Bases/certified-package-registry.md`
- `docs/Knowledge-Bases/galerina-package-manifest-spec.md`
- `docs/Knowledge-Bases/galerina-core-compiler-manifest-generation-pass-14.md`
- `docs/Knowledge-Bases/galerina-glossary.md`
