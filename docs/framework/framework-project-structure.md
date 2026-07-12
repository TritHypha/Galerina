# Framework: Project Structure

## Purpose

Define where Galerina application files, framework package docs and generated
reports should live.

## Short Definition

Project structure separates application source, reusable Galerina package planning,
language-core documentation and generated output.

## Recommended Structure

```text
packages-galerina/
  galerina-core/
  galerina-framework-app-kernel/
  galerina-framework-api-server/
  galerina-framework-example-app/

docs/
  framework/
  contracts/
  policies/
  reports/
  rules/
  examples/
  ../../../ZTF-Knowledge-Bases/

build/
  graph/
  reports/
```

## Security Rules

- Keep secrets out of source control.
- Keep generated machine-local capability profiles out of Git.
- Keep app-specific docs in `docs/`, not in `packages-galerina/galerina-core/`.
- Keep Galerina language-core docs in `packages-galerina/galerina-core/`, not in app docs.

## AI-Friendly Output

The project graph should be regenerated when package ownership, docs, reports,
package manifests or source contracts change.

## Generated Reports

```text
build/graph/galerina-devtools-project-graph.json
build/graph/Galerina_GRAPH_REPORT.md
build/graph/galerina-ai-map.md
```

## v1 Scope

Use the existing package layout and document framework concepts through the new
`docs/framework`, `docs/contracts`, `docs/policies`, `docs/reports` and
`docs/rules` folders.
