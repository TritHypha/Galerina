# Galerina Project Graph

`galerina-devtools-project-graph` is the package for Galerina project knowledge graph contracts.

It belongs in:

```text
/packages-galerina/galerina-devtools-project-graph
```

Use this package for:

```text
project graph nodes
project graph relationships
package ownership maps
document and decision links
policy and unsafe feature classification
report output manifests
AI assistant map files
graph query, path and explain request contracts
backend selection policy
workspace package/doc scanner
Markdown report and AI map rendering
graph query, explain and path helpers
```

## Backend Role

`galerina-devtools-project-graph` should expose generic Galerina graph contracts and commands. It
should not expose one tool name as source syntax or CLI syntax.

Stable Galerina surface:

```text
Galerina graph
Galerina graph --out build/graph
project graph nodes and edges
project graph reports
```

Swappable backend implementations:

```text
Galerina_native
graphify
static_analyser
docs_indexer
future_standard
```

Graphify-style tooling is useful as inspiration and can be used as an optional
backend, including from a pinned Git package. The Galerina graph output should still
use Galerina-native node, edge, manifest and report contracts so the backend can be
replaced later without renaming commands or generated file formats.

Git backends must be explicitly allowed by backend policy and pinned to a ref.
Model-assisted extraction remains opt-in.

This package must not become part of Galerina core, compile-time security enforcement
or production runtime.

## Boundary

`galerina-devtools-project-graph` explains relationships. It does not enforce security,
compile source code, run tasks, serve HTTP or replace compiler checks.

## Native Mapper

The package includes a Galerina-native workspace graph builder that can consume:

```text
galerina.workspace.json package paths
README and TODO documents
package.json metadata
TypeScript exported contracts
top-level docs
generated JSON report examples
```

It maps packages, documents, exported contracts and package references into a
stable graph. The CLI can render:

```text
build/graph/galerina-devtools-project-graph.json
build/graph/Galerina_GRAPH_REPORT.md
build/graph/galerina-ai-map.md
build/graph/galerina-devtools-project-graph.html
```

Run the current local CLI build from the repository root:

```text
node packages-galerina\galerina-core-cli\dist\index.js graph --out build\graph
```

Once `galerina-core-cli` is installed or linked, the intended shorthand is:

```text
Galerina graph --out build\graph
```

It can also query generated graph output:

```text
node packages-galerina\galerina-core-cli\dist\index.js graph query galerina-core-security --out build\graph
node packages-galerina\galerina-core-cli\dist\index.js graph explain package:galerina-core-security --out build\graph
node packages-galerina\galerina-core-cli\dist\index.js graph path package:galerina-devtools-project-graph report:project-graph --out build\graph

Galerina graph query galerina-core-security
Galerina graph explain package:galerina-core-security
Galerina graph path package:galerina-devtools-project-graph report:project-graph
```

Final rule:

```text
galerina-devtools-project-graph maps and explains the project.
graphify is one possible backend, not Galerina syntax.
galerina-core and galerina-core-compiler define language checks.
galerina-core-security and runtime packages enforce policy.
```
