# Galerina Tasks

`galerina-core-tasks` is the safe task runner for Galerina projects.

It belongs in:

```text
/packages-galerina/galerina-core-tasks
```

It provides typed, permissioned project automation as a safer alternative to raw
shell scripts.

## Responsibilities

```text
load task definitions
run named tasks
resolve dependencies
check permissions
enforce declared effects
support dry run mode
generate task reports
deny shell by default
redact safe output
return typed task results
```

## Safe Built-In Operations

Future task operations should prefer explicit built-ins:

```text
filesystem.copy()
filesystem.remove()
filesystem.mkdir()
filesystem.exists()
compiler.check()
compiler.build()
reports.generate()
schemas.generateJson()
openapi.generate()
tests.run()
```

## Task Files

The first supported task file shape is `tasks.spore`:

```Galerina
task generateReports {
  description "Generate local reports"
  effects [filesystem, reports]

  permissions {
    write "./build/reports"
  }
}

task buildApi {
  depends [generateReports]
  effects [filesystem, compiler, reports]

  permissions {
    read "./src"
    write "./build"
  }
}
```

The loader supports:

```text
task name blocks
description strings
depends lists
effects lists
permissions blocks
unsafe markers with reason strings
timeout / timeoutMs values
```

Dependency resolution is deterministic and rejects missing or circular task
dependencies before execution. Current execution can dry-run task plans and
perform permission checks; built-in operation execution is still future work.

## Permission Checks

Dry-run and execution both validate permissions before a task is accepted.

Filesystem tasks must declare at least one `read` or `write` permission with a
safe repository-relative path:

```Galerina
permissions {
  read "./src"
  write "./build"
}
```

Invalid filesystem permissions include empty paths, absolute paths and parent
traversal such as `../outside`.

Environment tasks must declare exact environment variable names:

```Galerina
task readMode {
  effects [environment]

  permissions {
    environment "NODE_ENV" "GALERINA_ENV"
  }
}
```

Environment wildcards and empty values are rejected. Network, database and shell
effects also require matching explicit permissions. Shell remains denied unless
the task is marked `unsafe` and includes a reason.

## Task Reports

Task runs produce a structured report that records:

```text
generated time
task file
requested task
dry-run mode
overall status
dependency order
per-task status, effects, permissions, warnings and errors
```

The CLI writes this report to:

```text
build/reports/task-report.json
```

Use `--report-out <path>` to choose another path or `--no-report` to skip report
writing for a task command.

## Unsafe Shell

Raw shell is disabled by default. If added later, it must require an `unsafe`
task, a reason, a timeout, permissions, reporting and redaction. Production mode
may deny shell entirely.

## Non-Goals

`galerina-core-tasks` must not contain application behaviour, routing, authentication, ORM
logic, template rendering, admin UI, payment logic, queue drivers, CMS features
or business rules.
