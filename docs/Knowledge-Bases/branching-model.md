# Branching Model

## Status

```
Status: Active — language specification
Scope:  if, match, pattern matching, no elseif/switch/case
See also: galerina-syntax-if-match-optional.md, match-catch-all-branch.md, flat-flow-style.md
```

## Core Rule

```text
if    = simple decision (true/false)
match = pattern match and transform
_ =>  = catch-all fallback (inside match block)
```

## if

Use `if` for simple true/false conditions:

```galerina
if user.is_active {
  allow()
} else {
  deny()
}
```

## match

Use `match value` for comparing one value against multiple outcomes.

### Value Matching

```galerina
let payment_message: String = match payment.status {
  Paid    => "Payment complete"
  Failed  => "Payment failed"
  Pending => "Waiting for payment"
  _ => "Unknown payment status"
}
```

Standard syntax:

```galerina
match value_to_check {
  possible_value => result
  _ => fallback_result
}
```

### Range Matching

```galerina
let grade = match score {
  >= 90 => "excellent"
  >= 70 => "good"
  >= 50 => "pass"
  _ => "fail"
}
```

### Object Pattern Matching

```galerina
let output: String = match request {
  { method: "GET", path: "/users" }  => get_users()
  { method: "POST", path: "/users" } => create_user()
  _ => not_found()
}
```

## match Replaces switch and case

Galerina does not use `switch` or `case`. `match` provides the same behaviour
with a smaller, cleaner syntax:

```galerina
match status {
  "paid"    => complete()
  "failed"  => retry()
  "pending" => wait()
  _ => unknown()
}
```

## No elseif

`elseif` is not used. For multiple branches, use `match`:

```galerina
let result: String = match status {
  "paid"   => "complete"
  "failed" => "failed"
  _ => "unknown"
}
```

## Final Language Rule

```text
if      = simple yes/no decision
else    = fallback for if blocks
match   = multiple branch matching and transformation
_ =>    = catch-all arm inside match block
elseif  = not required
switch  = not required
case    = not required as a standalone keyword
```
