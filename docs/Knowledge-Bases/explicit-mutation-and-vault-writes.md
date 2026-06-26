# Explicit Mutation And Vault Writes

## Purpose

Galerina should make every state change visible in source code, reports and AI
tooling.

The core rule is:

```text
Mutation must be marked with mut.
```

This applies to local variable changes and protected vault writes.

## Why Explicit Mutation Matters

`mut foo++` is more secure than `foo++`.

Reason:

```text
mut makes mutation visible and intentional.
```

It lets:

- developers scan for state changes
- AI tools identify mutation points
- the checker reject hidden writes
- audit tools build mutation reports
- reviewers separate reading code from changing code

Plain mutation hides state change inside normal-looking code.

## Local Mutation Rule

Allowed:

```galerina
let foo: Int = 1

mut foo++
```

Allowed:

```galerina
mut foo = foo + 1
```

Not allowed:

```galerina
foo++
foo = foo + 1
```

These are not allowed because mutation is not explicitly marked.

## Vault Write Rule

Vault writes follow the same rule.

Allowed:

```galerina
mut secure.loginCount++
```

Allowed:

```galerina
mut secure.session[session_uuid] = {
  actor_uuid: user.uuid,
  created_at: Runtime.now(),
  expires_at: Runtime.now() + Duration.hours(12),
  revoked: false
}
```

Not allowed:

```galerina
secure.loginCount++

secure.session[session_uuid] = session
```

Vault values are protected runtime-managed state. Writes must be governed,
typed, permission-checked, audited where required and visibly marked with
`mut`.

## Replacing Direct Vault Writer Calls

Older design wording such as:

```galerina
SessionVault.write(context, session_uuid, session)
```

should not be the preferred v0.1 surface.

The preferred model is:

```galerina
mut secure.session[session_uuid] = session
```

This keeps the syntax aligned with:

- `vault {}`
- `secure.*`
- explicit `mut`
- runtime-managed context
- generated or declared vault permissions
- audit reports

The runtime may still lower this operation into an internal vault write call.
That lowering is an implementation detail, not the source-level model.

## Runtime Context

Vault writes should inherit the active governed runtime context.

Normal application code should not have to pass a generic `context` argument
through every vault operation.

The active context should provide:

- actor identity
- route or flow identity
- permission grant
- request or task ID
- audit correlation ID
- policy profile
- trust zone

The source code should show the important security operation:

```galerina
mut secure.session[session_uuid] = session
```

The runtime should attach the contextual proof.

## Audit And Reports

Mutation reports should be able to find every state change by scanning for
`mut`.

Vault write reports should include:

- mutated vault name
- key, redacted where required
- flow or route
- actor
- permission used
- old/new hash where safe
- audit event
- policy profile
- timestamp

Reports must redact secrets and sensitive payloads.

## Final Principle

```text
Reading can look simple.
Writing must be visible.

Use mut for every state change.
Use secure for protected shared state.
Use vault for governed storage.
```
