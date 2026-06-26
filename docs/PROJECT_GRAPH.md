# Project Graph

## Summary

Galerina should support project maps as optional developer tooling. The goal is to
help humans and AI assistants understand package ownership, documentation
links, policies, reports and design decisions without treating the graph as a
compiler or runtime authority.

Primary references:

- https://graphify.net/
- https://github.com/safishamsi/graphify

## Package

```text
packages-galerina/galerina-devtools-project-graph
```

The package owns graph contracts for:

```text
Package
Document
Flow
Type
Effect
Policy
UnsafeFeature
Report
Target
CompilerRule
RuntimeRule
SecurityRule
ComputeFeature
Decision
```

## Backend-Neutral Rule

Do not make developers write Graphify-specific Galerina syntax or commands. Keep the
stable surface generic:

```bash
Galerina graph
Galerina graph --out build/graph
Galerina graph query "Which package owns SecureString?"
```

Backend selection belongs in policy/configuration:

```text
project_graph {
  backend auto
  allow ["Galerina_native", "graphify", "future_standard"]
}
```

This lets Galerina use:

```text
Galerina_native today
graphify as an optional pinned Git backend
another graph backend later
```

without changing Galerina source, CLI commands or generated graph file names.

If a backend is loaded from Git, it must be explicitly allowed and pinned to a
commit, tag or versioned ref. Model-assisted extraction remains opt-in.

## Outputs

Recommended generated output paths:

```text
build/graph/galerina-devtools-project-graph.json
build/graph/galerina-devtools-project-graph.html
build/graph/Galerina_GRAPH_REPORT.md
build/graph/galerina-ai-map.md
```

## CLI Direction

Run from the repository root:

```powershell
cd C:\laragon\www\Galerina
node packages-galerina\galerina-core-cli\dist\index.js graph --out build\graph
```

This writes the graph outputs under `build\graph`. Once `galerina-core-cli` is linked or
published, use the stable installed CLI form:

```powershell
Galerina graph --out build\graph
```

AI coding tools should consult `build\graph\galerina-ai-map.md` or
`build\graph\Galerina_GRAPH_REPORT.md` when package ownership is unclear. If
`build\graph\galerina-devtools-project-graph.json` is missing, or if changes were made to
`AGENTS.md`, `galerina.workspace.json`, `docs/`, package README/TODO files, package
manifests or package source contracts, regenerate the graph before relying on
it.

Current commands:

```bash
Galerina graph
Galerina graph --out build/graph
Galerina graph query "Which package owns SecureString?"
Galerina graph explain galerina-core-security
Galerina graph path galerina-framework-api-server galerina-core-security
```

Current local Node equivalents:

```powershell
node packages-galerina\galerina-core-cli\dist\index.js graph query galerina-core-security --out build\graph
node packages-galerina\galerina-core-cli\dist\index.js graph explain package:galerina-core-security --out build\graph
node packages-galerina\galerina-core-cli\dist\index.js graph path package:galerina-devtools-project-graph report:project-graph --out build\graph
```

## Safety Rules

Project graphs must not:

```text
replace compiler checks
replace security reports
replace runtime enforcement
be required for production runtime
leak secrets into graph nodes or reports
silently send code, docs or media to model APIs
```

Project graph scans should:

```text
redact secrets by default
mark relationship confidence as EXTRACTED, INFERRED or AMBIGUOUS
make model-assisted extraction opt-in
record generated output paths
distinguish source facts from inferred relationships
```

## Native Mapper

The first implementation is the Galerina-native mapper in `packages-galerina/galerina-devtools-project-graph`.
It can scan workspace package paths and project docs, then map:

```text
workspace package paths from `galerina.workspace.json`, including `packages-galerina/`
README/TODO/docs files
package.json descriptions and dependencies
TypeScript exported types, interfaces and functions
generated graph report outputs
package mentions in documentation
```

This is intentionally lightweight and deterministic. Richer external tools can
be added later as backend adapters without changing `Galerina graph`.

When `packages-galerina/` package paths are listed in `galerina.workspace.json`, the native
mapper should treat them as Galerina package collection paths. They may be beta
domain packages or future package-repository mounts, but the graph remains
advisory and must not decide production package resolution.

The native helper also supports graph query, node explanation and path finding
over generated graph JSON.

## Boundary

The graph explains Galerina. It does not enforce Galerina.
