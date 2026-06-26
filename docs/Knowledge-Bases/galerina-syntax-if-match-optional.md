# Galerina Syntax: if, match, Optional and Type Checking

## Definition

This document defines the conditional logic syntax for Galerina: `if`, `match`,
`Optional<T>` handling, type-guarded checks, and the conversion model. These
rules are designed to make Galerina reliable, explicit and type-safe.

## Status

```text
Design rules documented.
Not yet implemented in compiler prototype.
```

---

## Part 1: if Statements

### Bool-Only Rule

`if` in Galerina requires a strict `Bool`. Truthy/falsy evaluation is forbidden.

```galerina
// Correct: foo must be Bool here.
if foo {
  run()
}
```

There is no implicit coercion from `Int`, `String`, `Optional`, or any other
type to `Bool`. If you have a non-Bool value you need to compare it explicitly.

### Why No Truthy/Falsy

Truthy/falsy evaluation is a common source of bugs:

```text
0 is falsy in JavaScript
"" is falsy in JavaScript
null is falsy in JavaScript
```

These silent coercions hide mistakes. Galerina requires the condition to always
be `Bool` so the intent is unambiguous.

### Boolean Negation

```galerina
if !foo {
  stop()
}
```

### Comparison Operators

```galerina
// Less than or equal.
if foo <= 1 {
  handleSmall()
}
```

```galerina
// Not equal.
// Use != not <>.
if foo != 1 {
  handleDifferent()
}
```

```galerina
// Greater than or equal.
if foo >= 1 {
  handleEnough()
}
```

### Preferred Operator: !=

Galerina uses `!=` for "not equal", not `<>`. This keeps Galerina modern and
familiar to developers coming from most mainstream languages.

### Boolean Composition

Use `&&` and `||` to combine boolean expressions:

```galerina
// OR condition.
// Runs if either side is true.
if (foo >= 1) || (meow != 0) {
  run()
}
```

```galerina
// AND condition.
// Runs only if both sides are true.
if (foo > 1) && (meow != 0) {
  run()
}
```

---

## Part 2: match Expressions

### When to Use match

`match` is preferred over `if` when there are multiple outcomes. Use `if`
only for simple binary conditions.

### Basic match

```galerina
match foo {
  0 => handleZero()
  1 => handleOne()
  value if value > 1 => handleMany(value)
  _ => handleFallback()
}
```

The `_` arm is the default case — always required unless the compiler can
prove the match is exhaustive.

### Governed Decisions with match

```galerina
match evaluateCapability(user, NetworkAccess) {
  Allow => runNetworkTask()

  Deny(reason) => {
    audit.deny(reason)
    return Error(reason)
  }

  Unknown(reason) => {
    // Unknown fails closed.
    return Error("capability unknown")
  }

  Conflict(reason) => {
    // Conflict is a policy error.
    fail PolicyConflict(reason)
  }
}
```

`Unknown` and `Conflict` must never silently become a `Bool`. They must be
handled explicitly or fail closed.

### Predicate match Patterns

Predicate matching must be explicit. The form `value if predicate(value)`
makes the intent unambiguous.

```galerina
// Not allowed — ambiguous:
match foo {
  myFun => handleZero()
}
```

`myFun` is ambiguous: is it a literal pattern? A variable binding? A
function call? A predicate?

```galerina
// Correct form — predicate is explicit:
match foo {
  value if myFun(value) => handleMatch(value)
  _ => handleFallback()
}
```

### Type match Patterns

```galerina
match food {
  value: Int    => handleInt(value)
  value: String => handleString(value)
  value: Bool   => handleBool(value)
  _             => handleUnknown()
}
```

---

## Part 3: Type Checking with is

For single-arm type guards, use `is`:

```galerina
if food is Int {
  let amount = food as Int
  handleInt(amount)
}
```

The `is` keyword checks whether a value matches a type. `as` is the
explicit cast that follows after the guard.

---

## Part 4: Optional<T> — No Null, No Undefined

### Rule: No Null. No Undefined.

Galerina does not allow JavaScript-style `null` or `undefined`.
Missing values must be explicit using `Optional<T>`.

Forbidden:

```galerina
if food != null
if food != undefined
if exists(food)   // undeclared-variable style check
```

### Declaring Optional Values

```galerina
let food: Optional<Food>
```

### Checking Optional with is

```galerina
if food is Some {
  eat(food.value)
}
```

### Checking Optional with match (preferred)

```galerina
match food {
  Some(item) => eat(item)
  None => skip()
}
```

`match` is preferred because it forces you to handle both the present and
absent cases explicitly.

### Some and None

`Some` and `None` come from the `Option` / `Maybe` type pattern used in
Rust, Scala, OCaml, F# and Haskell. Galerina follows this convention.

| Language | Present | Absent |
| --- | --- | --- |
| Galerina | `Some(item)` | `None` |
| Rust | `Some(item)` | `None` |
| Scala | `Some(item)` | `None` |
| OCaml | `Some item` | `None` |
| F# | `Some item` | `None` |
| Haskell | `Just item` | `Nothing` |

### exists() Allowed Meaning

`exists()` is not allowed for undeclared-variable checks. An undeclared
variable is a compile error. The allowed meaning of `exists` is for
collection queries or optional value checks:

```galerina
// Collection query: allowed.
if users.exists(user => user.id == targetId) {
  handleFound()
}
```

```galerina
// Optional value: acceptable.
if foo.exists {
  use(foo.value)
}

// Preferred:
if foo is Some {
  use(foo.value)
}
```

### Summary: Recommended Optional Patterns

```galerina
// Optional value declaration.
let food: Optional<Food>

// Preferred: match forces explicit handling of None.
match food {
  Some(item) => eat(item)
  None => skip()
}

// Acceptable: is guard.
if food is Some {
  eat(food.value)
}

// Not allowed.
if food != null
if food != undefined
if exists(food)   // undeclared-variable check style
```

---

## Part 5: No Implicit Conversion

### Rule

Galerina does not allow casual conversion functions as the normal coding style:

```text
Avoid: value.toString()
Avoid: value.toInt()
Avoid: value.toJSON()
Avoid: value.toArray()
```

These encourage unsafe "fix it later" programming and hide type mistakes.

### Rule Summary

```text
Values should be created with the correct type.
Conversions must be explicit, checked, and fallible.
Creation validates.
Parsing returns Result.
Encoding is explicit.
Unsafe conversion is denied.
```

### Parsing Returns Result

```galerina
match Int.parse(input.age) {
  Ok(age)    => saveAge(age)
  Err(error) => return BadRequest(error)
}
```

Or store the result:

```galerina
let ageResult: Result<Int, ParseError> =
  Int.parse(input.age)
```

Never:

```galerina
let age = input.age.toInt()   // no error path
```

### JSON Decoding Returns Result

```galerina
let user: Result<User, DecodeError> =
  Json.decode<User>(request.body)
```

Never:

```galerina
let user = request.body.toJSON()   // untyped, no error path
```

### String Formatting

```galerina
let message =
  format "User {user.id} created"
```

Never:

```galerina
let message = user.toString()   // opaque, no schema
```

### Preferred Conversion Names

| Preferred | Avoid |
| --- | --- |
| `Int.parse(value)` | `value.toInt()` |
| `Decimal.parse(value)` | `value.toDecimal()` |
| `Json.decode<User>(value)` | `value.toJSON()` |
| `Json.encode(user)` | `user.toJSON()` |
| `Array.from(iterable)` | `iterable.toArray()` |
| `String.format(...)` | `value.toString()` |

---

## Part 6: Function Design with if and match

### Order Matters in if Chains

When checking exceptional cases, always check the exception first:

```galerina
// Correct order: exceptional case first.
fn myFun(foo: Int) -> Bool {
  if foo > 100 {
    return false
  }

  if foo > 1 {
    return true
  }

  if foo != 0 {
    return true
  }

  return false
}
```

Or cleaner:

```galerina
fn myFun(foo: Int) -> Bool {
  return foo <= 100 && foo != 0
}
```

The reason order matters: `if foo > 1 { return true }` is reached before
`if foo > 100 { return false }` if you put them in the wrong order.
This is a common logic bug that explicit ordering prevents.

---

## Rule Summary

```text
if requires Bool only.
No truthy/falsy.
Use != not <>.
Use && and || for boolean composition.
Use match for multi-outcome logic.
Predicate match uses: value if predicate(value).
Type match uses: value: Type.
Type check in if uses: value is Type.
Unknown and Conflict must not become Bool silently.
No undefined.
No silent null.
Missing values must be explicit via Optional<T>.
Use Some / None for optional handling.
match is preferred over if for Optional.
No implicit conversion.
Parsing returns Result.
Encoding is explicit.
```

---

## Relationship to Other Systems

```text
galerina-core-logic    → Decision uses match; Unknown/Conflict fail closed
galerina-core-security → ProtectedSecret must not convert to raw String
galerina-core-config   → ConfigValue uses typed discriminated union
runtime/type-checker → enforces Bool-only if; rejects truthy/falsy
```

See also: `galerina-syntax-loops-iteration.md`,
`galerina-core-logic-tri-decision-bool.md`,
`galerina-core-config-environment-secrets.md`.
