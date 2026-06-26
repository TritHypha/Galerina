# Galerina Application Pattern 01 — CRUD Resource

**When to use:** Any entity with create/read/update/delete lifecycle (users, orders, patients, products, invoices).

---

## Decision: CRUD is a governed pattern, not core syntax

Galerina does not provide a magic `crud` keyword that auto-generates operations. CRUD behaviour is explicit — each operation is a flow, each flow declares its effects, and the compiler verifies those effects against the resource contract.

This matters because real CRUD is never symmetric. Creating a user requires validation and audit. Reading a user may require field redaction. Deleting a patient record may be illegal without a retention hold. Auto-generated CRUD hides these distinctions. Governed CRUD makes them visible at compile time.

---

## The resource contract

```galerina
resource User {
  id: UserId
  email: protected Email
  createdAt: Timestamp
  updatedAt: Timestamp

  operations {
    create effects [database.write, audit.write, validation.run]
    read   effects [database.read]
    update effects [database.write, audit.write, validation.run]
    delete effects [database.write, audit.write]
  }

  policy {
    require audit on create update delete
    redact email on read unless role.admin
  }
}
```

The `protected` marker on `email` means the field cannot appear in an unredacted response unless the caller holds the declared capability. The `policy` block is checked by the compiler against every flow that binds to this resource.

---

## How flows bind to resource operations

Each CRUD operation is implemented as a named flow. The flow declares which resource operation it fulfils:

```galerina
flow createUser(input: UserInput) -> Result<User, ApiError>
  implements resource.User.create
  effects [database.write, audit.write, validation.run]
{
  let validated = validation.run(input)
  let user = database.write(validated)
  audit.write({ actor, action: "create", target: user.id })
  return Ok(user)
}

flow getUser(id: UserId) -> Result<User, ApiError>
  implements resource.User.read
  effects [database.read]
{
  let user = database.read({ id })
  return Ok(user)
}

flow updateUser(id: UserId, data: UserInput) -> Result<User, ApiError>
  implements resource.User.update
  effects [database.write, audit.write, validation.run]
{
  let validated = validation.run(data)
  let user = database.write({ id, ...validated })
  audit.write({ actor, action: "update", target: id })
  return Ok(user)
}

flow deleteUser(id: UserId) -> Result<Unit, ApiError>
  implements resource.User.delete
  effects [database.write, audit.write]
{
  database.write({ id, deleted: true })
  audit.write({ actor, action: "delete", target: id })
  return Ok(unit)
}
```

---

## What the compiler enforces

| Rule | Diagnostic |
|------|-----------|
| A flow implementing `resource.X.create` must declare `database.write` | SPORE-EFFECT-003 |
| A flow implementing `resource.X.update` must declare `database.write` | SPORE-EFFECT-003 |
| A flow implementing `resource.X.delete` must declare `database.write` | SPORE-EFFECT-003 |
| A flow implementing `resource.X.read` must NOT declare `database.write` | SPORE-EFFECT-004 |
| `validation.run` must precede `database.write` in create/update flows | SPORE-VALIDATE-001 |
| `protected` fields must appear in `response.denies` or the flow must hold the declared capability | SPORE-PROTECTED-001 |
| `require audit` in policy means audit.write must appear in every matching operation | SPORE-AUDIT-001 |

---

## What Galerina avoids

Galerina deliberately does not provide:

```galerina
// NOT valid Galerina
crud User { ... }
```

A `crud` macro would:
- Hide effect declarations from the developer
- Make audit requirements implicit and easy to miss
- Prevent per-operation policy customisation
- Produce a single semantic graph node instead of four distinct, traceable operation nodes

Every operation must be declared. Every effect must be named. The compiler's job is to verify, not to infer intent.

---

## Semantic graph output

The Galerina compiler emits a semantic graph (GIR) with the following node structure for a CRUD resource:

```
resource:User
  ├── operation:createUser → [effect:database.write, effect:audit.write, effect:validation.run]
  ├── operation:getUser    → [effect:database.read]
  ├── operation:updateUser → [effect:database.write, effect:audit.write, effect:validation.run]
  └── operation:deleteUser → [effect:database.write, effect:audit.write]
```

Protected fields are annotated as `protected:email` with redaction policy attached. AI tooling reading the GIR can reason about data sensitivity per operation without parsing source code.

---

## Phase 17 implementation status

The `resource` declaration block and `implements resource.X.operation` binding are **Phase 17** features. They depend on:

- The effect checker (Phase 11 — available)
- The validation gate (Phase 11 — available)
- Protected field enforcement (Phase 14 — partially available)
- Policy block parsing (Phase 17 — planned)

Current workaround: declare the operations as plain flows with explicit `effects` blocks. The compiler enforces effects. Policy block enforcement is manual until Phase 17.
