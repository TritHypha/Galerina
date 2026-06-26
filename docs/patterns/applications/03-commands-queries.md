# Galerina Application Pattern 03 — Commands and Queries (CQRS-lite)

**When to use:** Separating reads from writes for clarity, scalability, and governance — without requiring full event sourcing.

---

## The key insight

A query can only read. A command can only write.

This is not an architectural opinion — it is a safety constraint. A query that silently writes state is a governance failure. A command that cannot be audited is a security risk. Galerina makes both constraints compile-time facts, not runtime conventions.

```
query  → read effects only
command → write effects + audit required
```

---

## Galerina CQRS-lite

Galerina does not require full CQRS (separate read models, event sourcing, eventual consistency). CQRS-lite is simpler: the `query` and `command` prefixes on flow declarations carry compiler-enforced constraints.

```galerina
// Queries: read effects only — compiler rejects database.write
query getUser(id: UserId) -> Result<User, ApiError>
  effects [database.read]
{
  return database.read({ id })
}

query listOrders(filter: OrderFilter) -> Result<List<Order>, ApiError>
  effects [database.read]
{
  return database.read({ filter })
}

// Commands: write effects required — compiler requires audit.write
command updateUser(id: UserId, data: UserInput) -> Result<Unit, ApiError>
  effects [database.write, audit.write, validation.run]
{
  let validated = validation.run(data)
  database.write({ id, ...validated })
  audit.write({ actor, action: "updateUser", target: id })
  return Ok(unit)
}

command deleteOrder(id: OrderId) -> Result<Unit, ApiError>
  effects [database.write, audit.write]
{
  database.write({ id, deleted: true })
  audit.write({ actor, action: "deleteOrder", target: id })
  return Ok(unit)
}
```

The `query` and `command` prefixes replace the `flow` keyword for these declarations. A plain `flow` is still valid for internal operations that are neither publicly-routed queries nor commands.

---

## Compiler enforcement

### Query constraints

| Rule | Diagnostic |
|------|-----------|
| A `query` flow may not declare `database.write` | SPORE-QUERY-001 |
| A `query` flow may not declare `audit.write` | SPORE-QUERY-002 |
| A `query` flow may not declare `event.emit` | SPORE-QUERY-003 |
| A `query` flow may not call any internal flow that declares write effects | SPORE-QUERY-004 |

### Command constraints

| Rule | Diagnostic |
|------|-----------|
| A `command` flow must declare `database.write` or `event.emit` (at least one write effect) | SPORE-COMMAND-001 |
| A `command` flow must declare `audit.write` | SPORE-COMMAND-002 (warning in Phase 17, error in Phase 18) |
| A `command` flow must run `validation.run` before any `database.write` | SPORE-VALIDATE-001 |

---

## Benefits for effect inference

The `query`/`command` prefix is a semantic constraint that improves the compiler's effect inference pass:

- When a query calls an internal flow, the compiler propagates the read-only constraint down the call chain. Any write effect discovered in a callee of a query is surfaced as SPORE-QUERY-004 rather than being silently permitted.
- When a command is analysed, the compiler can pre-verify that the declared write effects are actually reachable on all code paths (not just on the happy path).
- The constraint prefix narrows the effect inference search space, which reduces compile time for large service contracts.

---

## AI semantic graph output

The GIR emits separate node types for queries and commands:

```
service:UserService
  ├── query:getUser      → [effect:database.read]
  ├── query:listOrders   → [effect:database.read]
  ├── command:updateUser → [effect:database.write, effect:audit.write, effect:validation.run]
  └── command:deleteOrder → [effect:database.write, effect:audit.write]
```

AI tooling reading the GIR can immediately identify all write surfaces in a service, all audited operations, and all query entry points without parsing source code. This is the primary governance benefit of the CQRS-lite prefix over using plain `flow` for everything.

---

## Not requiring full event sourcing

Full CQRS typically implies:
- A separate read model (projection)
- Commands produce events, not direct state
- The read model is rebuilt from events (event sourcing)

Galerina CQRS-lite does not require any of these. Commands write directly to the database. Queries read directly from the database. Events may be emitted alongside writes (Pattern 04), but they are not the source of truth.

Full event sourcing is a future Phase 18+ consideration. When it arrives, the `command` prefix will be the natural binding point — commands will declare `event.emit` instead of `database.write`, and the read model will be a projection contract. The separation you establish now with CQRS-lite will require no refactoring when that phase lands.
