# 227 — process.spawn governance (Phase R4 anti-abuse example)

This example demonstrates the canonical correct pattern for flows that need to spawn
background processes or tasks.

## Why process.spawn must be declared

Without a `process.spawn` declaration in the `effects` block, any attempt to call
`Process.spawn()` or equivalent causes SPORE-EFFECT-001. This makes covert background
execution impossible to hide — it is visible in source, audited, and governed.

## The governance pattern

```
1. Declare effects { process.spawn } — makes the capability visible in GIR and audit proof
2. Declare limits { concurrent_tasks N } — bounds the fan-out
3. Audit before spawn — record the intent
4. Call Process.spawn() with governed arguments (validated payload, actor identity)
5. Audit after spawn — record the job ID for traceability
```

## What this prevents

- Accidental background fan-out (supply-chain abuse pattern)
- Unaudited worker threads
- Cron-style scheduled tasks that bypass governance
- Child processes that escape the capability model

## Related diagnostics

| Code | Fires when |
|------|------------|
| SPORE-EFFECT-001 | process.spawn called without effects { process.spawn } declaration |
| SPORE-EFFECT-001 | worker.spawn called without effects { worker.spawn } declaration |
| SPORE-EFFECT-001 | event.schedule called without effects { event.schedule } declaration |

## Added in

Phase R4 — anti-abuse governance. `process.spawn`, `worker.spawn`, and `event.schedule`
added to `CANONICAL_EFFECTS` in `effect-checker.ts`.

## test_status: stable

No diagnostics expected. All effects are correctly declared.
