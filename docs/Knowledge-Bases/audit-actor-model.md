# Audit Actor Model

## Purpose

Galerina audit systems should automatically capture execution identity without
requiring developers to manually attach actors to every audit event.

The runtime already knows:

- who executed the flow
- what permission was used
- which route or flow triggered execution
- which capability was exercised
- which runtime context was active

Therefore actor attribution should be automatic.

## Core Principle

```text
Audit should automatically inherit runtime execution identity.
```

## Problem With Manual Actor Attribution

Traditional systems often require developers to manually attach actor
information.

Example:

```galerina
audit.write(context, "profile.read", {
  actor: context.actor
})
```

This creates avoidable risk:

- duplicated boilerplate
- inconsistent audit structure
- forgotten actor attribution
- developer mistakes
- harder AI-generated code validation
- weaker audit consistency
- possible actor spoofing by application code

## Runtime-Owned Audit Identity

Galerina maintains a governed execution context.

The runtime already knows:

```text
current actor
request id
route
flow
permission
capabilities
execution budget
runtime context
trust zone
```

Therefore:

```galerina
audit.write(context, "profile.read")
```

should automatically inherit actor information.

## Automatic Audit Attribution

When audit events are written, the runtime should automatically attach:

| Runtime Field | Meaning |
| --- | --- |
| `actor` | primary execution identity |
| `request_id` | request correlation ID |
| `route` | route source |
| `flow` | flow source |
| `permission` | permission used |
| `capabilities` | active capabilities |
| `timestamp` | runtime timestamp |
| `execution_id` | runtime execution chain |
| `result` | success, failure, denial or partial result |
| `trust_zone` | runtime trust boundary |

The developer should not need to manually provide these values.

## Simple Audit Event

Source:

```galerina
audit.write(context, "profile.read")
```

Runtime-expanded event:

```text
event: "profile.read"
actor: runtime.actor
request_id: runtime.request_id
route: runtime.route
flow: runtime.flow
permission: runtime.permission
capabilities: runtime.capabilities
timestamp: runtime.timestamp
execution_id: runtime.execution_id
result: runtime.result
```

## Permission-Based Audit

Audit may be fully automatic through permissions.

Example:

```galerina
permission profile_read {

  code {
    allow db.read table: Profiles
  }

  data {
    allow expose view: private owner: actor
  }

  audit required event "profile.read"
}
```

Meaning:

```text
If this permission is used,
the runtime automatically creates the audit event.
```

The flow may not need to call:

```galerina
audit.write(...)
```

at all.

## Example Flow

```galerina
flow getProfile(
  request: Profile.get,
  context: Runtime.DatabaseContext
) -> Result<Profile.response, ApiError>
  permission use profile_read
{
  let profile = db.readOne(
    context,
    table: Profiles,
    where: Profiles.id == request.profile_id
  )

  return Ok(Profile.response {
    name: profile.name,
    email: profile.email
  })
}
```

Runtime records:

```text
actor
request id
route
flow
permission
capabilities
database access
response outcome
audit event
```

## Multiple Actors

Galerina may support multiple actor roles:

```text
primary_actor
delegated_actor
system_actor
source_actor
ai_actor
service_actor
```

One primary actor governs the flow.

The primary actor should always be automatically included in audit records.
Additional actors may be included where delegation, system execution, AI work or
external source events are involved.

For multi-actor events, application code may identify affected, delegated,
source, system or AI actors. It should not set `primary_actor` directly in
ordinary audit metadata.

Example:

```galerina
audit.write("refund.approve.completed", {
  affected_actor: customer_actor,
  system_actor: Runtime.system_actor("payments"),
  refund_id: refund.id
})
```

The runtime still injects the primary actor from governed execution context.

## No Silent Actor Spoofing

Developers should not be able to silently spoof primary audit actors.

Core rule:

```text
Runtime owns primary actor attribution.
```

Application code may not replace the primary actor field in normal audit
events. If an event needs to mention another actor, it should use a distinct
metadata field such as `target_actor`, `delegated_actor` or `source_actor`.

## Optional Manual Metadata

Flows may attach additional metadata.

Example:

```galerina
audit.write(context, "refund.approved", {
  refund_id: refund.id,
  amount: refund.amount
})
```

The runtime still automatically injects:

```text
actor
request id
route
flow
permission
capabilities
timestamp
execution id
result
```

Manual metadata must not override runtime-owned identity fields.

## Runtime Ownership

Audit should be governed by the runtime, not by application code.

Meaning:

```text
Flow declares audit intent.
Runtime owns audit identity and persistence.
```

## Reports

Audit actor reports should include:

```text
audit-actor-report.json
audit-event-report.json
audit-permission-report.json
audit-context-report.json
audit-spoofing-warning-report.json
```

Reports should show:

- event name
- primary actor
- delegated or source actor where present
- request ID
- route and flow
- permission used
- active capabilities
- execution ID
- result
- trust zone
- metadata keys
- redaction decisions
- denied override attempts

## Relationship To Other Concepts

This concept connects:

- [Permission, Capability And Actor Model](permission-capability-actor-model.md)
- [Developer-Friendly Permission Model](developer-friendly-permission-model.md)
- [Secure By Default Syntax Principles](secure-by-default-syntax-principles.md)
- [Multi-Actor Audit Events](multi-actor-audit-events.md)
- [Governed Execution Director](governed-execution-director.md)

## Final Principle

```text
Audit identity should come from governed runtime context,
not from developer-supplied values.
```
