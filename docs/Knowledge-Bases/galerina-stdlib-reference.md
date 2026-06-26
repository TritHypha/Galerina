# Galerina Standard Library Reference

## Status

```text
Stdlib reference: minimal v1 surface required by CEC examples
Implementation:    Phase 7B/8 runtime and checker integration
```

This document lists the standard library functions and helpers that v1 Galerina
flows may assume are available. It is not an exhaustive final API; it is the
minimal stable surface required for canonical examples and Stage 1 execution.

---

## Rules at a Glance

- `match` is the primary way to handle `Option<T>` and `Result<T, E>`.
- `?` is language-level error propagation, not a method.
- Network, filesystem, secret, and audit operations require declared effects.
- Validation, decoding, sanitization, redaction, and constant-time comparison
  are pure gates unless otherwise stated.
- Collection mutation-style helpers return new values unless a future mutable
  API is explicitly specified.
- String and byte conversions must be explicit and fallible where decoding can
  fail.

---

## Option<T> Operations

### `match`

Signature:

```galerina
match Option<T> { Some(value) => U, None => U } -> U
```

Description: Primary exhaustive handling form.

Example:

```galerina
match maybeUser {
  Some(user) => user.name
  None       => "Anonymous"
}
```

### `.unwrapOr(default: T) -> T`

Returns the contained value or the default.

```galerina
let name = maybeName.unwrapOr("Anonymous")
```

### `.map(f: fn(T) -> U) -> Option<U>`

Transforms `Some(value)` and preserves `None`.

```galerina
let maybeName = maybeUser.map(userName)
```

### `.flatMap(f: fn(T) -> Option<U>) -> Option<U>`

Chains optional computations.

```galerina
let maybeEmail = maybeUser.flatMap(primaryEmail)
```

### `.isSome() -> Bool`

```galerina
let present = maybeUser.isSome()
```

### `.isNone() -> Bool`

```galerina
let absent = maybeUser.isNone()
```

## Result<T, E> Operations

### `match`

Signature:

```galerina
match Result<T, E> { Ok(value) => U, Err(error) => U } -> U
```

Example:

```galerina
match loaded {
  Ok(order) => order.id
  Err(e)    => return Err(e)
}
```

### `.unwrapOr(default: T) -> T`

```galerina
let amount = parsedAmount.unwrapOr(Decimal("0.00"))
```

### `.map(f: fn(T) -> U) -> Result<U, E>`

```galerina
let id = saved.map(orderId)
```

### `.mapErr(f: fn(E) -> F) -> Result<T, F>`

```galerina
let apiResult = domainResult.mapErr(toApiError)
```

### `.isOk() -> Bool`

```galerina
let success = saved.isOk()
```

### `.isErr() -> Bool`

```galerina
let failed = saved.isErr()
```

### `?` operator

Language-level propagation:

```galerina
let order = OrdersDB.find(id)?
```

If the result is `Err(e)`, the enclosing flow returns `Err(e)` early.

## String Operations

| Operation | Signature |
|---|---|
| `.length()` | `String -> Int` character count |
| `.toLower()` | `String -> String` |
| `.toUpper()` | `String -> String` |
| `.trim()` | `String -> String` |
| `.startsWith(s)` | `String -> Bool` |
| `.endsWith(s)` | `String -> Bool` |
| `.contains(s)` | `String -> Bool` |
| `.split(sep)` | `String -> Array<String>` |
| `.replace(from, to)` | `String -> String` |
| `.encode(Encoding.UTF8)` | `String -> Bytes` |
| `+` | `String + String -> String` only |
| `String.decode(b, Encoding.UTF8)` | `Bytes -> Result<String, DecodeError>` |
| `format("template {}", value)` | `String` |

Example:

```galerina
let normalized = email.trim().toLower()
let body = String.decode(raw, Encoding.UTF8)?
```

## Array<T> Operations

| Operation | Signature |
|---|---|
| `.length()` | `Array<T> -> Int` |
| `.first()` | `Array<T> -> Option<T>` |
| `.last()` | `Array<T> -> Option<T>` |
| `.get(i)` | `Array<T>, Int -> Option<T>` |
| `.push(item)` | `Array<T>, T -> Array<T>` |
| `.filter(f)` | `Array<T>, fn(T) -> Bool -> Array<T>` |
| `.map(f)` | `Array<T>, fn(T) -> U -> Array<U>` |
| `.reduce(init, f)` | `Array<T>, U, fn(U, T) -> U -> U` |
| `.sum()` | `Array<T> -> T` for numeric `T` only |
| `.isEmpty()` | `Array<T> -> Bool` |
| `.contains(item)` | `Array<T>, T -> Bool` |

Example:

```galerina
let total = prices.reduce(Money.gbp("0.00"), addMoney)
```

## Map<K, V> Operations

| Operation | Signature |
|---|---|
| `.get(key)` | `Map<K, V>, K -> Option<V>` |
| `.set(key, value)` | `Map<K, V>, K, V -> Map<K, V>` |
| `.has(key)` | `Map<K, V>, K -> Bool` |
| `.keys()` | `Map<K, V> -> Array<K>` |
| `.values()` | `Map<K, V> -> Array<V>` |
| `.size()` | `Map<K, V> -> Int` |

## Money<C> Operations

| Operation | Signature |
|---|---|
| `Money.gbp(amount: String)` | `Money<GBP>` |
| `Money.usd(amount: String)` | `Money<USD>` |
| `Money.of(amount: Decimal, currency: C)` | `Money<C>` |
| `+` | `Money<C> + Money<C> -> Money<C>` |
| `-` | `Money<C> - Money<C> -> Money<C>` |
| `*` | `Money<C> * Decimal -> Money<C>` |
| `/` | `Money<C> / Money<C> -> Decimal` ratio |
| `.toString()` | `Money<C> -> String` |
| `.amount()` | `Money<C> -> Decimal` |
| `.currency()` | `Money<C> -> String` |

Different currencies must not be combined without explicit conversion policy.

## Network Operations

Require `network.outbound`.

| Operation | Signature |
|---|---|
| `http.get(url: String)` | `Result<Bytes, NetworkError>` |
| `http.post(url: String, body: Bytes)` | `Result<Bytes, NetworkError>` |
| `http.put(url: String, body: Bytes)` | `Result<Bytes, NetworkError>` |
| `http.delete(url: String)` | `Result<Bytes, NetworkError>` |

## Serialization

Pure; no effects required.

| Operation | Signature |
|---|---|
| `json.decode<T>(raw: Bytes | String)` | `Result<T, DecodeError>` |
| `json.encode(value)` | `Bytes` |
| `toml.decode<T>(raw: String)` | `Result<T, DecodeError>` |

## File System Operations

Read operations require `filesystem.read`. Write operations require
`filesystem.write`.

| Operation | Signature |
|---|---|
| `fs.readText(path: String)` | `Result<String, FileError>` |
| `fs.readBytes(path: String)` | `Result<Bytes, FileError>` |
| `fs.writeText(path: String, content: String)` | `Result<Void, FileError>` |
| `fs.writeBytes(path: String, data: Bytes)` | `Result<Void, FileError>` |

## Environment

`Env.get` requires `secret.read`. `env.secret` also requires `secret.read`.

| Operation | Signature |
|---|---|
| `Env.get(key: String)` | `Result<String, EnvError>` |
| `env.secret(key: String)` | `SecureString` |
| `env.optional(key: String)` | `Option<String>` |

## AuditLog

Requires `audit.write`.

```galerina
AuditLog.write(event: Map<String, Any>) -> Void
```

Audit serialization and redaction are specified in `galerina-audit-writer-spec.md`.

## Validation Gates

Pure gates from `stdlib-gates.yaml`:

| Operation | Signature |
|---|---|
| `validate.email(raw: String)` | `Result<Email, ValidationError>` |
| `validate.patientId(raw: String)` | `Result<PatientId, ValidationError>` |
| `validate.nhsNumber(raw: String)` | `Result<NhsNumber, ValidationError>` |
| `sanitize.text(raw: String)` | `Result<String, SanitizeError>` |
| `redact(value: protected T)` | `redacted T` |
| `constantTimeEquals(a: SecureString, b: SecureString)` | `Bool` |

## Numeric Helpers

| Operation | Signature |
|---|---|
| `Int.parse(s: String)` | `Result<Int, ParseError>` |
| `Float.parse(s: String)` | `Result<Float, ParseError>` |
| `Decimal(s: String)` | `Decimal` |
| `Math.abs(n: Numeric)` | `Numeric` |
| `Math.min(a, b: Numeric)` | `Numeric` |
| `Math.max(a, b: Numeric)` | `Numeric` |

## Compiler Status

```text
Stdlib type surface: specified - Phase 7B/8 runtime integration
Effect metadata:      partially implemented in effect checker
Gate metadata:        specified in stdlib-gates.yaml
```

## See Also

- `docs/Knowledge-Bases/galerina-core-standard-types-string-char-byte.md`
- `docs/Knowledge-Bases/arrays-and-string-operations.md`
- `docs/Knowledge-Bases/list-operations.md`
- `docs/Knowledge-Bases/generic-types.md`
- `docs/Knowledge-Bases/formal-type-system-spec.md`
- `docs/Knowledge-Bases/stdlib-gates.yaml`
- `docs/Knowledge-Bases/galerina-runtime-value-model.md`
- `docs/Knowledge-Bases/galerina-route-runtime-spec.md`
