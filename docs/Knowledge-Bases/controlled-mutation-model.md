# Controlled Mutation Model

## Definition

Galerina makes mutation **rare, explicit, scoped, and reportable**.

```text
Immutable by default.
Mutation only by declared permission.
Shared mutation denied by default.
```

## Core Rules

### 1. Default to Immutable Values

Normal values do not change after creation:

```galerina
let user = createUser(input)
```

To mutate, the developer must declare it:

```galerina
mut user = createUser(input)
```

### 2. Mutation Must Be Scoped

Mutation only exists inside a controlled block:

```galerina
mutate user effects [audit.write] {
  user.email = newEmail
}
```

Outside the block, the value becomes immutable again.

### 3. No Hidden Mutation

Banned or restricted:

```text
global mutable state
static mutable variables
hidden cache mutation
object mutation through aliases
reflection mutation
runtime monkey patching
```

### 4. Capability-Based Mutation

Writing to important systems requires declared capability:

```galerina
flow updateEmail(
  user: User,
  newEmail: Email,
  db: DatabaseWrite,
  audit: AuditWrite
) -> Result<User, UpdateError>
effects [database.write, audit.write]
```

No capability — no mutation.

### 5. Copy-on-Write for Data

Prefer:

```galerina
let updatedUser = user with {
  email: newEmail
}
```

Rather than mutating the original. Benefits: testability, rollback, audit clarity, concurrency safety, AI readability.

### 6. Controlled Shared State

If shared state is needed, require a safe wrapper:

```text
Atomic<T>
Mutex<T>
Transaction<T>
Actor<T>
```

Each must declare: lock policy, timeout, ownership, failure mode, audit rules.

### 7. Transaction-First External Mutation

Database/file/network writes go through transactions or commands:

```galerina
command UpdateUserEmail {
  input UpdateEmailRequest
  output User
  errors [ValidationError, PermissionError, StorageError]
  effects [database.write, audit.write]
}
```

This makes side effects reportable and testable.

## Security Danger Levels

```text
Safe:
  local mutation inside one function

Controlled:
  copy-on-write update
  transactional database write
  actor-owned state

Restricted:
  shared mutable state
  global cache
  background mutation

Denied by default:
  secret mutation
  policy mutation at runtime
  permission mutation from AI/tool output
  self-modifying code
```

## Reports

The compiler/runtime should emit:

```text
mutation-report.json
shared-state-report.json
effect-report.json
database-write-report.json
rollback-report.json
```

## Final Principle

```text
Mutation is not banned in Galerina.

Uncontrolled mutation is banned.

Every mutation must have a scope, owner, effect, permission,
failure path, and report.
```
