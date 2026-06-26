# Framework: Core Model

## Purpose

Define the five beginner-facing Galerina framework concepts.

## Short Definition

Galerina applications should be explained through:

```text
data -> flow -> permission -> boundary -> report
```

## Concepts

| Concept | Meaning |
|---|---|
| `data` | What information exists, enters and leaves |
| `flow` | What runs |
| `permission` | What is allowed |
| `boundary` | Where Galerina connects to another trust area or system |
| `report` | Proof of what was checked |

Detailed framework concepts sit under this model:

```text
routes, requests, responses/views, models, classification
secure flows, context, scopes/lifetimes, errors
policies, permissions, effects, capabilities
contracts, packages, repositories/storage, adapters, events, MCP AI/tool boundaries
reports and tests
```

## Fast Runtime Relationship

Because Galerina declares data, flows, permissions and boundaries before a request
arrives, the secure runtime can prebuild safe execution plans:

```text
route tables
schema validators
permission tables
vault access rules
database connection pools
outbound API pools
response encoders
security policy checks
```

The goal is fast response through known-safe paths, not hidden state.

## Developer Surface

The beginner-facing surface should stay small:

```text
data       = model + request + response/view
flow       = controlled execution
permission = policy + effects + capabilities + audit
boundary   = package + storage + external + event + AI/tool + compute
report     = generated proof
```

This simplifies what developers write without weakening the internal model.

## Internal Mapping

```text
data       = model + request + response/view
permission = policy + effects + capabilities + audit
boundary   = package + storage + external + event + AI/tool + MCP + compute
```

## Polymorphism

Polymorphism uses the same model:

| Concept | Polymorphism role |
|---|---|
| `data` | generic and variant data shapes |
| `flow` | contract-defined behavior |
| `permission` | required authority for implementation |
| `boundary` | adapter, external, storage, AI/tool or compute boundary |
| `report` | proof of which implementation and effects were used |

## Security Rules

- Do not merge internal models with public responses.
- Use model views for safe output.
- Do not merge routes with flows.
- Do not merge permissions into flows when reusable authority blocks are clearer.
- Do not merge storage with models.
- Do not hide effects, permissions or boundary crossings.

## Generated Reports

```text
data-report.json
flow-report.json
permission-report.json
boundary-report.json
mcp-tool-index.json
vault-report.json
security-report.json
```

## Knowledge Base

See [Core Application Model](../Knowledge-Bases/core-application-model.md).
