# Galerina Syntax: Loops and Iteration

## Definition

Galerina supports a range of iteration patterns. Loops are allowed but they
are not the primary abstraction. The preferred model is expression-based
functional iteration: `map`, `filter`, `fold`, `match` and `Result` pipelines.
Loops are reserved for side effects.

## Status

```text
Design rules documented.
Not yet implemented in compiler prototype.
```

---

## Core Rule

```text
Use loops for effects.
Use map / filter / fold for data transformation.
Use match for decisions.
Use Result / Decision for governed outcomes.
Require limits on while and do-while.
```

---

## Part 1: for — Best for Side Effects

Use `for item in items` when each iteration causes an observable effect:
logging, saving, notifying, auditing.

```galerina
for user in users {
  // Good for actions: send, save, audit, notify.
  audit.log("processing user", user.id)
}
```

Do not use a `for` loop when you are building a new data structure. Use
`map` instead.

---

## Part 2: map — Best for Transformation

Use `map` when one collection transforms into another. No mutation.
One input produces one output.

```galerina
let summaries =
  users.map(user => UserSummary {
    id:   user.id
    name: user.name
  })
```

`map` is preferred over a loop because it makes the transformation
explicit and composable, and it does not mutate the original collection.

---

## Part 3: filter — Best for Selection

Use `filter` to select items from a collection based on a condition.

```galerina
let activeUsers =
  users.filter(user => user.status == Active)
```

The predicate is isolated and testable. This is more reliable than
manual index tracking in a loop.

### Chaining filter and map

```galerina
let activeUserSummaries =
  users
    .filter(user => user.active)
    .map(user => UserSummary {
      id:   user.id
      name: user.name
    })
```

---

## Part 4: fold / reduce — Best for Totals

Use `fold` when accumulating a single result from a collection.

```galerina
let total =
  orders.fold(0, (sum, order) => {
    // Accumulator is explicit.
    return sum + order.amount
  })
```

`fold` is better than a hidden mutable counter because the accumulator
and operation are both explicit.

---

## Part 5: match — Best for Multiple Outcomes

Use `match` when iteration produces multiple possible outcomes. This is
stronger than boolean branching.

```galerina
match validateOrder(order) {
  Valid(cleanOrder) => submitOrder(cleanOrder)

  Invalid(reason) => {
    // Explicit failure path.
    return Error(reason)
  }

  NeedsReview(caseId) => {
    // Third outcome is not forced into true/false.
    return QueueReview(caseId)
  }
}
```

```galerina
match evaluateCapability(user, "network") {
  Allow            => continue
  Deny(reason)     => return Denied(reason)
  Unknown(reason)  => return Denied("unknown capability")
  Conflict(reason) => fail BuildError(reason)
}
```

---

## Part 6: while — Supported, but Guarded

`while` is allowed but must include a `limit` clause to prevent accidental
infinite loops.

```galerina
while queue.hasItems() limit 1000 {
  // Limit prevents accidental infinite loop.
  let job = queue.next()
  process(job)
}
```

A `while` without a `limit` clause is a compile error. This rule makes
long-running loops explicit and reviewable.

### Why Require Limits

Without limits, a while loop can run indefinitely on unexpected input.
In a governance-first runtime, an unbounded loop is unsafe behaviour.

---

## Part 7: do while — Support for Rare Cases

`do while` is supported only for cases that require at least one execution
before testing the condition — such as polling.

```galerina
do {
  // Runs at least once.
  response = pollStatus(jobId)
} while response.status == Pending limit 20
```

`do while` also requires a `limit` clause.

`do while` is considered a legacy pattern. Include only when polling or
similar at-least-once semantics are genuinely required.

---

## Part 8: Result Pipeline — Best for Validation

Use a `Result` pipeline when each step may fail and must be handled.

```galerina
let result =
  input
    .validate(validateEmail)
    .validate(validateAge)
    .map(createUser)
    .map(saveUser)
```

Each step must handle failure explicitly. The pipeline composes validation
and transformation without nested if chains.

---

## Summary: Iteration Patterns

| Pattern | Best For | Notes |
| --- | --- | --- |
| `for item in items` | side effects | audit, notify, save |
| `.map(fn)` | transformation | preferred over loops for data |
| `.filter(fn)` | selection | condition isolated and testable |
| `.fold(seed, fn)` | totals and aggregation | accumulator is explicit |
| `match` | multi-outcome decisions | preferred for governance |
| `while cond limit N` | condition-driven loops | limit required |
| `do { } while cond limit N` | at-least-once loops | limit required; rare |
| `Result pipeline` | validation chains | explicit failure path |

---

## What Not to Do

### Don't Use Loops for Data Transformation

```galerina
// Avoid: mutates and loops
let result = []
for item in items {
  result.push(transform(item))
}
```

```galerina
// Better: map
let result = items.map(item => transform(item))
```

### Don't Use Boolean Loops for Decisions

```galerina
// Avoid: collapses multiple outcomes into bool
for item in items {
  if validate(item) == true {
    process(item)
  }
}
```

```galerina
// Better: match retains outcome structure
for item in items {
  match validate(item) {
    Valid(clean)    => process(clean)
    Invalid(reason) => audit.log("rejected", reason)
    NeedsReview(id) => queue(id)
  }
}
```

### Don't Use while Without Limits

```galerina
// Forbidden: no limit, can run forever
while channel.hasMessages() {
  process(channel.next())
}
```

```galerina
// Required: explicit limit
while channel.hasMessages() limit 10000 {
  process(channel.next())
}
```

---

## Relationship to Other Systems

```text
galerina-core-logic   → Decision / match govern capability outcomes
galerina-core-network → safeHttpRequest uses Result; governed loops use limits
galerina-core-reports → audit events recorded inside for loops
compiler            → enforces while limit requirement; detects side-effect loops
```

See also: `galerina-syntax-if-match-optional.md`,
`galerina-core-logic-tri-decision-bool.md`.
