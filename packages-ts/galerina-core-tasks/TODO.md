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
[ ] Run named task operations (parse + permission-check slice done 2026-09-29; execution open)
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
