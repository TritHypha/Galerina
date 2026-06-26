# 225 — Context missing (SPORE-CONTEXT-001)

## What this example shows

A flow that declares `context { require actor }` but never reads `context.actor`
in the flow body. This triggers **SPORE-CONTEXT-001** (REQUIRED_CONTEXT_NOT_ACCESSED,
warning).

## Why is this a problem?

Declaring `require actor` in the contract signals to callers and the runtime that
the actor identity is essential for this flow to operate correctly. If the body
never reads it:

1. The actor is not used for access control — any caller can read any user's data
2. The audit record is missing actor attribution — a compliance gap
3. The contract declaration is misleading — it promises actor-awareness but does not deliver it

## How to fix

Read the required context field and use it:

```
with effects [database.read, audit.write] {
  let actor = context.actor
  // Verify the actor is authorised to read this specific user
  let user = UsersDB.findForActor(actor, request.params.userId)?
  AuditLog.write({ event: "UserDataRead", userId: user.id, actor: actor })
  return Ok(Response.ok({ userId: user.id, username: user.username }))
}
```

## Severity

SPORE-CONTEXT-001 is a **warning**, not an error. The flow is not incorrect in a
type-safety sense, but the governance contract is unfulfilled. In a production
profile or regulated environment, treat all warnings as errors.
