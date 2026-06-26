# Multi-Actor Audit Events

## Purpose

Galerina audit events sometimes involve more than one actor.

Examples:

- support staff approving a customer refund
- an admin changing another user's permissions
- a service account acting on behalf of a user
- an AI worker producing advice for a human reviewer
- a payment system processing a customer-owned transaction

The audit model must capture these relationships without allowing application
code to spoof the primary actor.

## Core Principle

```text
Runtime owns the primary actor.
Application code may identify affected, delegated, source or system actors.
```

## Actor Roles

| Actor Role | Meaning | Source |
| --- | --- | --- |
| `primary_actor` | Actor whose authority governs the flow | Runtime context |
| `affected_actor` | Actor affected by the action | Flow metadata |
| `delegated_actor` | Actor represented through delegation | Runtime or policy metadata |
| `source_actor` | Actor or external system that initiated source data | Boundary metadata |
| `system_actor` | Runtime/system component participating in the action | Runtime-approved system identity |
| `ai_actor` | AI worker or model involved in the action | AI worker context |

The `primary_actor` is runtime-owned and should not be supplied by normal
application code.

## Refund Approval Example

In a refund approval flow:

```text
support actor approves refund
customer actor owns refund
payment system processes refund
```

The runtime should treat:

```text
primary_actor = support actor
affected_actor = customer actor
system_actor = payments system actor
```

## Recommended Source Pattern

Application code may identify non-primary actor roles:

```galerina
flow approveRefund(
  request: Refund.approve,
  context: Runtime.AuthContext
) -> ApproveRefundResult
  permission use refund_approve
contract {
  types {
    type ApproveRefundResult = Result<Refund.response, ApiError>
  }
}
{
  let customer_actor = request.customer_actor
  let support_actor = context.actor
  let system_actor = Runtime.system_actor("payments")

  require support_actor.role == "support_admin"
  require request.refund.owner == customer_actor

  audit.write("refund.approve.requested", {
    affected_actor: customer_actor,
    system_actor: system_actor
  })

  let refund = db.update(
    context,
    table: Refunds,
    where: Refunds.id == request.refund_id,
    set: {
      status: "approved",
      approved_by: support_actor.id,
      owner: customer_actor.id
    }
  )

  audit.write("refund.approve.completed", {
    affected_actor: customer_actor,
    system_actor: system_actor,
    refund_id: refund.id,
    status: refund.status
  })

  return Ok(Refund.response {
    refund_id: refund.id,
    status: refund.status
  })
}
```

The runtime automatically attaches:

```text
primary_actor: context.actor
request_id
route
flow
permission
capabilities
timestamp
execution_id
result
trust_zone
```

## Avoid This Pattern

Application code should not normally write:

```galerina
audit.write("refund.approve.requested", {
  primary_actor: support_actor,
  affected_actor: customer_actor,
  system_actor: system_actor
})
```

Reason:

```text
primary_actor is runtime-owned identity.
```

If application code can set it directly, audit identity can drift from the
actual permission and runtime context.

## Permission-Based Audit

The permission can declare audit events:

```galerina
permission refund_approve {
  actor {
    require refunds.approve
    require support.admin
  }

  code {
    allow db.read table: Refunds
    allow db.write table: Refunds
    allow audit.write
  }

  data {
    allow expose view: public
    allow expose view: private owner: affected_actor
  }

  audit required event "refund.approve"
}
```

The permission gives the runtime the required audit context. Flow-level audit
calls may add event-specific metadata.

## Ownership And Actor Checks

Multi-actor flows should make relationships explicit:

```galerina
require support_actor.role == "support_admin"
require request.refund.owner == customer_actor
```

The runtime should still validate the permission against the primary actor.
The affected actor is not authority by itself.

## System Actors

System actors should be runtime-approved identities.

Example:

```galerina
let system_actor = Runtime.system_actor("payments")
```

The runtime should only return system actors that are declared in trusted
runtime policy. Application code should not invent arbitrary system actors.

## Reports

Multi-actor audit reports should include:

```text
multi-actor-audit-report.json
audit-actor-report.json
audit-context-report.json
audit-spoofing-warning-report.json
```

Report entries should show:

- primary actor from runtime context
- affected actor where present
- delegated actor where present
- system actor where present
- source actor where present
- AI actor where present
- permission used
- actor relationship checks
- denied primary actor override attempts
- redaction decisions

## Relationship To Other Concepts

This concept refines:

- [Audit Actor Model](audit-actor-model.md)
- [Permission, Capability And Actor Model](permission-capability-actor-model.md)
- [Secure By Default Syntax Principles](secure-by-default-syntax-principles.md)

## Final Principle

```text
Multi-actor audit should explain who acted, who was affected and which system
participated, while preserving runtime ownership of the primary actor.
```
