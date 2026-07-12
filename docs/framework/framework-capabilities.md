# Framework: Capabilities

## Purpose

Capabilities describe what an actor, service, package, flow or tool is
authorised to do.

## Short Definition

A capability is declared authority for protected action or protected data
access.

## Examples

```text
users.pii.read
users.email.update
orders.refund
payments.charge
ai.external_tool.call
dataset.export
```

## Capabilities Versus Effects

| Concept | Meaning | Example |
|---|---|---|
| `effects` | What the code is technically allowed to do | `database.read`, `database.write`, `audit.write` |
| `capabilities` | What the actor is authorised to do | `users.read`, `users.email.update`, `users.pii.read` |

You normally need both.

## Permission Relationship

Normal developers should usually use `permission` blocks. A permission compiles
into actor capabilities, code effects, data exposure rules, audit requirements
and reports.

```text
effects = can the code technically do it?
capabilities = is the actor/package/flow/tool authorised to do it?
policy = under what rules?
report = proof it was checked
```

## Boundary Check Points

Capabilities should be checked at:

- secure flow boundaries
- public routes
- response/view exposure points
- package exports and package manifests
- adapter and connector boundaries
- AI/tool and MCP tool boundaries
- scoped vault reads and writes

## Security Rules

- Capabilities must be explicit.
- Sensitive actions require capabilities.
- Sensitive data exposure requires capabilities.
- Sensitive capabilities require audit-friendly reports.
- Missing capabilities must fail closed.
- Capability inheritance must be visible in effective policy reports.
- Effects must not replace actor authorization.

## Generated Reports

```text
capability-report.json
capability-boundary-report.json
capability-grant-report.json
policy-effective-report.json
security-report.json
```

## v1 Scope

Capability names, route/flow/package links and effective capability reports.

## Knowledge Base

See [Capabilities](../../../ZTF-Knowledge-Bases/capabilities.md) and
[Permission, Capability And Actor Model](../../../ZTF-Knowledge-Bases/permission-capability-actor-model.md).
