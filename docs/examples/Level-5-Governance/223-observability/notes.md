# 223 — Observability

## What this example shows

A complete `observability {}` block showing all major clauses: trace, measure,
count, log, deny, and require. This is the pattern recommended for any flow that
handles sensitive data or financial transactions.

## observability block clauses

| Clause | Meaning |
|--------|---------|
| `trace flow` | Emit a distributed trace span for the full flow execution |
| `measure latency` | Record end-to-end latency as a metric |
| `count database.write` | Increment a counter each time a database.write effect fires |
| `log event names` | Log the names of emitted events (not their payloads) |
| `deny protected values in logs` | Protected/secret field values must not appear in any log line |
| `deny request body logging` | The raw request body must never be logged |
| `require trace_id` | A trace_id must be present in context; reject calls without one |

## Why declare observability in the contract?

- Observability requirements are as important as functional requirements for production flows.
- `deny protected values in logs` provides a machine-checkable log-hygiene guarantee.
- `require trace_id` enables correlated distributed tracing across service boundaries.
- The contract is the single source of truth — no scattered logging configuration.

## Interaction with context block

When `observability { require trace_id }` is used together with `context { require trace_id }`,
the governance verifier checks that `trace_id` is actually accessed in the flow body
(SPORE-CONTEXT-001). Always read required context fields and pass them to audit records.
