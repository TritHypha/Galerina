# Galerina Governance

This document defines the initial governance model for Galerina while it is a concept, documentation and prototype project.

## Project Authority

During the early stage, Galerina design changes should be recorded in project documents before they are treated as accepted language behaviour.

Important changes should update at least one of:

```text
SPEC.md
REQUIREMENTS.md
DESIGN.md
ARCHITECTURE.md
SECURITY.md
OMNI_LOGIC.md
CHANGELOG.md
TODO.md
```

## Decision Records

Major decisions should be documented when they affect:

```text
language syntax
type system
memory safety
security defaults
compiler architecture
target support
logic width compatibility
diagnostic formats
build artefacts
licensing
repository structure
```

## Compatibility Principles

Galerina should prefer forward-compatible names and schemas.

Current examples:

```text
Use logic-width instead of ternary-only.
Use target capability reports instead of silent fallback.
Use structured diagnostics instead of ad hoc messages.
Use source-mapped reports instead of target-only error output.
```

## Change Process

Recommended process:

```text
1. Describe the change in the relevant design document.
2. Add TODO items for implementation work.
3. Add changelog notes under [Unreleased].
4. Update examples or schemas when behaviour becomes concrete.
5. Keep backwards compatibility notes where older documents used different terminology.
```

## Release Readiness

A Galerina release should not be marked stable until:

```text
core syntax is documented
core diagnostics are standardised
security defaults are documented
memory behaviour is documented
target fallback is reported
source maps are defined
examples match the current syntax
```
