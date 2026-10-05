# Galerina Tasks TODO

```text
[x] Create /packages-ts/galerina-core-tasks
[x] Add README.md
[x] Add TODO.md
[x] Add package.json
[x] Add tsconfig.json
[x] Add src/index.ts
[x] Define TaskDefinition type
[x] Define TaskEffect type
[x] Define TaskPermission type
[x] Add dry run placeholder
[x] Add permission check placeholder
[x] Add task report type
[x] Add unsafe shell placeholder
[x] Deny shell by default
[x] Load tasks.fungi
[x] Run named task operations (parse + permission-check 2026-09-29; execution through host handlers 2026-10-05) -- src/execute-operations.ts, runTask({ handlers }), tests/task-execution.test.mjs (Grok; zero-trust defaults, owner may revisit)
[x] Support task dependencies
[x] Detect circular dependencies
[x] Add filesystem permissions
[x] Add environment permissions
[x] Write task-report.json output
[x] Add tests
```

Run-operations note (2026-09-29, Grok Bot, owner-approved; see AGENTS
session-exchange grok-bot-pkg-todo-work-20260929/LEDGER.md): `run { ... }` blocks
are now parsed into typed `TaskDefinition.run` operations
(src/task-operations.ts `parseTaskRunBlock`) and refused by
`checkTaskOperations` before dry-run or run (src/run-task.ts). Refused: unknown
ops (shell included), non-call statements, malformed args, duplicate or oversize
run blocks, an undeclared effect, wrong arity, unsafe paths, and paths outside the
declared read/write permissions. Tests: tests/task-operations.test.mjs. Nothing
is executed; a non-dry run still returns `skipped`. Open product decisions:
execution semantics; the effect mapping for `schemas.generateJson`,
`openapi.generate` and `tests.run` (refused as
`Galerina_TASK_OPERATION_EFFECT_UNDECIDED` for now); what `compiler.build` may
write; and whether statements such as `return Ok(TaskOk)` or `reports.generate*`
variants from the requirements doc are admitted.

Execution note (2026-10-05, Grok Bot, standing permission; zero-trust defaults,
owner may revisit): `runTask(task, { handlers })` now runs a checked run block
through `executeTaskOperations` (src/execute-operations.ts). The package still
ships no ambient authority: an operation runs only through a host handler
registered for that exact name, and without handlers a non-dry run stays
`skipped`. Rules: permission and operation checks run first; every operation
needs an own-property function handler or nothing runs; operations run one at a
time in declared order and the first failure stops the task; every task is time
bounded (timeoutMs, else 60 s; 1 ms to 1 h accepted, anything else refused) and
the handler's AbortSignal fires on timeout or failure; path arguments arrive
normalised; handler error text is never copied into the result. Tests:
tests/task-execution.test.mjs. Still open and not decided here: the effect
mapping for `schemas.generateJson`, `openapi.generate` and `tests.run` (still
refused), what a `compiler.build` handler may write, and CLI wiring
(galerina-core-cli task-command still calls runTask without handlers, so CLI
runs remain `skipped`).
