# Core Syntax Keywords

## Definition

Galerina uses a small, deliberate keyword set for control flow and execution. This
document records the canonical keyword decisions and what is intentionally
excluded.

## Keywords in Use

### `flow`

Primary executable unit with runtime authority.

```galerina
flow checkout(order: Order) -> Receipt
  uses vault.payments.write
{
  let total = calculate_total(order)
  return charge_order(order, total)
}
```

A `flow` can: request permissions, use runtime authority, call GlobalVault,
call backend services, spawn workers, be audited, cross trust boundaries.

### `fn`

Pure helper function. Cannot cross trust boundaries.

```galerina
fn calculate_total(order: Order) -> Decimal {
  return order.items.sum(item -> item.price * item.qty)
}
```

A `fn` cannot: use `uses`, call GlobalVault, access backend services directly,
spawn workers, perform network/database/file/payment/secret access, use `task`
or `wait`, or create background work.

```text
flow can cross trust boundaries.
fn cannot cross trust boundaries.
fn is always synchronous.
```

### `let`

Local variable declaration:

```galerina
let message: String = "hello"    // typed
let total = calculate_total(order)  // inferred
```

### `if`

Simple true/false decision:

```galerina
if user.is_active {
  allow()
}
else {
  deny()
}
```

Use `if` for simple conditions only.

### `match`

Multi-branch logic and value matching. Replaces `switch`, `case`, and `elseif`:

```galerina
let message: String = match status {
  "paid"    => "Payment complete"
  "failed"  => "Payment failed"
  "pending" => "Waiting for payment"
  _ => "Unknown status"
}
```

Range matching:

```galerina
let grade = match score {
  >= 90 => "excellent"
  >= 70 => "good"
  >= 50 => "pass"
  _ => "fail"
}
```

### `else`

Fallback block after `if`. Appears after the closing `}`.

### `uses`

Permission declaration. Only valid on `flow`, not `fn`:

```galerina
flow load_secret(user_id: Id) -> Secret
  uses vault.secrets.read
{
  return GlobalVault.secrets.get(user_id)
}
```

### `each`

Iteration over collections. Preferred over `for`:

```galerina
each item in items {
  process(item)
}
```

`each` feels more Galerina-native. `for` is not used.

### `attempt`

Recoverable operation with explicit error handling. Preferred over `try/catch`:

```galerina
let result = attempt charge_payment()
else error {
  return PaymentFailed(error.message)
}
```

### `none`

Empty/absent value. Preferred over `null`:

```galerina
let user = find_user(id)
else {
  none
}
```

### `run worker`

Worker execution:

```galerina
let result = run worker image_resize(file)
```

### `task`

Start governed async work inside a `flow`:

```galerina
let user_task = task database.users.get(user_id)
let stats_task = task database.analytics.get(user_id)
```

`task` is only valid in `flow`. Not valid in `fn`.

### `wait`

Collect the result of a `task`. The flow does not return until all required waits complete:

```galerina
let user: safe User = wait user_task
let stats: safe Stats = wait stats_task
```

`wait` is only valid in `flow`. Not valid in `fn`.

## Keywords Not Used

| Excluded | Use Instead |
| --- | --- |
| `switch` | `match` |
| `case` | `match` block entries |
| `elseif` | `match` or separate `if` blocks |
| `function` | `fn` or `flow` |
| `def` | `fn` or `flow` |
| `for` | `each` |
| `try/catch` | `attempt ... else error` |
| `null` | `none` |
| `async` | `task` |
| `await` | `wait` |

## Decision Summary

```text
if     = simple true/false condition
match  = multiple branch logic and value matching
flow   = authorised execution unit (may use task/wait)
fn     = pure synchronous helper logic (no task/wait)
each   = iteration
attempt = recoverable operation
none   = absent value
task   = start governed async work (flow only)
wait   = collect async result (flow only)
```

## Types

Current core types:

```galerina
String
Int
Decimal    // use for money and precise values
Float      // use for approximate maths
Bool
None
Array<T>
Map<K, V>
```

Avoid `Any` unless required. Use `Decimal` for money.
