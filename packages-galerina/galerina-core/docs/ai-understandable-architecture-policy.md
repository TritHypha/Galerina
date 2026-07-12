# AI Understandable Architecture Policy

Galerina should document architecture so AI tools can read it rather than infer
it.

Core rule:

```text
AI should not infer the architecture.
AI should read the architecture.
```

## Knowledge Map

Galerina repositories should act as knowledge maps. Documentation, package
manifests, project graph output, generated reports and AI context should use
stable names and explicit links for concepts, definitions, ownership and
runtime responsibilities.

The current workspace uses:

- `../../../../ZTF-Knowledge-Bases/` for one-concept indexed notes
- `docs/framework/` for framework concepts
- `docs/contracts/` for boundary agreements
- `docs/reports/` for generated proof
- `build/graph/` for generated project graph outputs
- package docs for package-owned language, runtime and tooling contracts

Future generated views such as `docs/architecture/`, `docs/definitions/`,
`docs/graphs/` or `docs/adr/` may be added only with clear ownership and index
rules.

## Machine-Readable Indexes

Galerina should generate or validate machine-readable indexes for concepts,
permissions, effects, contexts, package ownership, runtime components and
architecture decisions.

Example shape:

```yaml
concepts:
  actor:
    definition: current execution identity
    file: ../../../../ZTF-Knowledge-Bases/audit-actor-model.md

  view:
    definition: who or what may see data
    file: ../../../../ZTF-Knowledge-Bases/data-visibility-view-terminology.md

  vault:
    definition: governed shared storage
    file: ../../../../ZTF-Knowledge-Bases/scoped-vaults.md
```

## Component Metadata

Compiler, runtime, security and tooling components should expose stable
metadata:

```text
Component: Authority Control
Purpose: Enforces permissions, capabilities and runtime authority.
GrantsAuthority: true
TrustedCore: true
RuntimeStage: governance
```

Metadata should identify responsibility, authority, trusted-core status,
runtime stage, package owner, inputs, outputs and report output.

## AI-Friendly Rules

- Use stable names.
- Keep one core concept per concept file.
- Give every concept a definition.
- Give every rule a canonical example where practical.
- Give runtime components responsibility metadata.
- Record major decisions as ADRs or decision entries.
- Index every permission, effect and context.
- Avoid vague names such as `manager`, `helper` and `handler`.
- Avoid hidden magic.
- Keep syntax examples canonical.

## Final Rule

```text
Galerina architecture must be documented so an AI can locate, explain, test and
audit each concept without guessing.
```
