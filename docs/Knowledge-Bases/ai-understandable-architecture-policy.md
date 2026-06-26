# AI Understandable Architecture Policy

## Purpose

Galerina architecture must be documented so an AI can locate, explain, test and
audit each concept without guessing.

The goal is:

```text
AI should not infer the architecture.
AI should read the architecture.
```

## Core Rule

```text
The repository is a knowledge map, not just folders.
```

Source files, documentation, reports, project graph output and generated AI
context should describe the same architecture with stable names and explicit
links.

## Knowledge Map Model

Galerina should maintain a navigable architecture map that connects:

- concepts
- definitions
- package ownership
- runtime components
- permissions
- effects
- contexts
- data classifications
- reports
- architecture decisions
- generated project graph nodes

The current workspace uses layered docs and `docs/Knowledge-Bases/` concept
files as the canonical human-authored index. Future tooling may generate
additional architecture, definition or graph views from these sources, but those
views must not replace the canonical source docs.

Example generated or curated views may include:

```text
docs/architecture/
docs/definitions/
docs/graphs/
docs/adr/
```

These folders should be introduced only when they are supported by clear
ownership, index rules and report generation.

## Machine-Readable Concept Indexes

Galerina should support machine-readable indexes so tools do not infer concept
locations.

Example shape:

```yaml
concepts:
  actor:
    definition: current execution identity
    file: docs/Knowledge-Bases/audit-actor-model.md

  view:
    definition: who or what may see data
    file: docs/Knowledge-Bases/data-visibility-view-terminology.md

  vault:
    definition: governed shared storage
    file: docs/Knowledge-Bases/scoped-vaults.md
```

Indexes should be generated or validated from source docs, package manifests
and project graph data where possible.

## Component Metadata

Every runtime, compiler, security or tooling component should declare metadata
that explains responsibility and authority.

Example:

```text
Component: Authority Control
Purpose: Enforces permissions, capabilities and runtime authority.
GrantsAuthority: true
TrustedCore: true
RuntimeStage: governance
```

Component metadata should be stable enough for AI tools to answer:

- what the component owns
- whether it grants authority
- whether it belongs to trusted core
- what runtime stage it participates in
- what inputs and outputs it accepts
- what reports it emits
- what package owns it

## AI-Friendly Documentation Rules

Galerina docs should follow these rules:

1. Use stable names.
2. Keep one core concept per concept file.
3. Give every concept a short definition.
4. Give every rule at least one canonical example where practical.
5. Give every runtime component a responsibility table or equivalent metadata.
6. Record major decisions as ADRs or decision entries.
7. Index every permission, effect and context.
8. Avoid vague names such as `manager`, `helper` and `handler` unless the name
   is part of an established package boundary.
9. Avoid hidden magic and undocumented runtime behaviour.
10. Keep syntax examples canonical and source-aligned.

## Relationship To Project Graph

The generated project graph is the machine-readable navigation layer for AI and
developer tools. It should map:

- packages
- package docs
- root docs
- knowledge-base concepts
- reports
- policies
- package boundaries
- ownership relationships

The graph is advisory. It helps tools navigate the repository, but compiler,
runtime, security and test checks remain authoritative.

## AI Context Safety

AI-readable architecture output must be redacted and bounded. It should include
names, definitions, ownership, relationships, report paths and non-secret
metadata. It must not include secrets, raw private data, credentials or
unredacted production payloads.

## Final Rule

```text
Galerina architecture must be explicitly indexed, source-linked and
machine-readable enough that AI tools can explain it without inventing missing
structure.
```
