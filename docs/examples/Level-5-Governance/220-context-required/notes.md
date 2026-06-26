# 220 — Context required fields

## What this example shows

A flow that declares `context { require actor require trace_id }` and correctly
reads both fields from the execution context in the flow body.

## The rule

`contract.context { require fieldName }` declares that the flow depends on a named
execution context field (such as `actor`, `trace_id`, `deadline`, etc.). The governance
verifier checks that each required field is actually accessed in the flow body.

If a required field is never accessed, **SPORE-CONTEXT-001** (REQUIRED_CONTEXT_NOT_ACCESSED,
warning) is emitted.

## Why require context fields in a contract?

- Prevents flows that depend on actor identity from running unauthenticated
- Makes the dependency on trace context explicit and machine-verifiable
- Enables the runtime to reject calls that do not provide required context values
- Supports distributed tracing by ensuring trace_id is propagated into audit records

## Correct pattern

```
context {
  require actor
  require trace_id
}
```

Then in the body:
```
let actor = context.actor
let traceId = context.trace_id
```
