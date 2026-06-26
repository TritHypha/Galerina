# Boundary Extension Concepts

## Purpose

Galerina uses the five-part core model:

```text
data -> flow -> permission -> boundary -> report
```

Some older concept lists name events, repositories, storage, adapters and
connectors as separate top-level concepts. In the current structure, these are
best understood as boundary concepts.

## Short Definition

Boundary extension concepts are specialised ways that Galerina crosses trust,
system or execution boundaries.

## Concept Map

| Concept | Current placement | Meaning |
| --- | --- | --- |
| `events` | boundary | Typed asynchronous messages, queues, webhooks or job payloads |
| `repositories` | boundary | Named storage access surfaces for models |
| `storage` | boundary | Databases, files, object stores or persistence systems |
| `adapters` | boundary | Governed implementations for external contracts |
| `connectors` | boundary | Integrations with external systems, services or tools |
| `MCP` | boundary | AI tool, resource and prompt access through declared boundaries |

## Events

Events are typed messages that enter, leave or move through the system outside a
direct request/response call.

Events should declare:

- payload type
- schema version
- topic or source
- idempotency policy
- replay policy
- classification
- effects
- audit rules

Events are important, but full event runtime support can be later work unless a
v1 secure web runtime feature needs webhook handling.

## Repositories And Storage

Repositories keep database behaviour out of models.

The preferred pattern is:

```galerina
let user = try UsersRepository.findRequired(userId)
```

not:

```galerina
User.findById(id)
user.save()
```

This keeps storage access explicit, permissioned, effect-checked and reportable.

## Adapters And Connectors

Adapters and connectors wrap external systems.

Examples include:

- payment provider adapter
- email provider adapter
- search adapter
- object storage connector
- AI model adapter
- legacy API connector

Adapters must declare contracts, effects, permissions, timeout policy, retry
policy, secret handling and reports.

## MCP AI Tool Boundaries

MCP tools, resources and prompts are AI/tool boundary concepts.

MCP should not give AI systems direct authority over tools, files, databases or
vaults. Galerina should map every MCP tool and resource to typed data, a declared
flow, explicit permission, boundary rules and generated reports.

MCP tool availability is not permission.

## V1 Split

V1-critical concept work:

- document these as boundary concepts
- deny hidden external/storage access
- require typed contracts and effects
- generate report targets

Later implementation work:

- full event runtime
- queue/job/schedule engines
- large adapter/provider ecosystem
- MCP package/runtime implementation
- database migrations
- advanced storage provider packages

## Core Rule

```text
Events, repositories, storage, adapters and connectors are not hidden framework magic.
They are boundary concepts and must be declared, permissioned, effect-checked and reportable.
```
