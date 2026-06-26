# Galerina Runtime Value Model

## Status

```text
Runtime value model: specified - implementation Phase 7B/8
Applies to:          TypeScript Stage 1 interpreter
```

This document defines how checked Galerina values are represented by the Stage 1
TypeScript runtime. It is the boundary between the type system and execution.

---

## Rules at a Glance

- Runtime values must preserve the distinctions proven by the type checker.
- `Option<T>` and `Result<T, E>` use tagged objects, not null or exceptions.
- Governance labels are runtime wrappers or binding-registry facts.
- Records erase to plain objects while preserving field names.
- Unsafe and protected values remain tracked until validated, redacted, or
  rejected.

---

## Primitive Value Representations

| Galerina type | TypeScript runtime representation | Notes |
|---|---|---|
| `Int` | `number` | Must be integer-checked by runtime where required. |
| `Float` | `number` | Standard JavaScript number in Stage 1. |
| `Decimal` | `string` | Stage 1 stores decimal text for precision; arithmetic helper owns conversion. |
| `String` | `string` | Valid Unicode text. |
| `Bool` | `boolean` | `true` or `false`. |
| `Char` | `string` | Length one character unit. |
| `Byte` | `number` | Integer range `0..255`. |
| `Bytes` | `Uint8Array` | Raw binary data. |
| `Timestamp` | `Date` | UTC timestamp. |
| `Duration` | `number` | Milliseconds. |
| `Void` | `undefined` | No meaningful value. |

String, Char, Byte, Bytes, and SecureString contracts are defined in
`galerina-core-standard-types-string-char-byte.md`.

## Algebraic Type Representations

`Option<T>`:

```typescript
Some(value) -> { __tag: "Some", value }
None        -> { __tag: "None" }
```

`Result<T, E>`:

```typescript
Ok(value)  -> { __tag: "Ok", value }
Err(error) -> { __tag: "Err", error }
```

The runtime must not use JavaScript `null` or `undefined` to represent absence.
Absence is `None`. Failure is `Err`.

## Governance-Labelled Value Representations

| Galerina | TypeScript runtime representation |
|---|---|
| `unsafe let rawEmail: String` | Plain string, flagged in binding registry as `unsafe`. |
| `let email: protected Email` | `{ __logicn_protected: true, __type: "Email", value: string }` |
| `let audit: redacted Email` | `{ __logicn_redacted: true, __type: "Email", value: "[REDACTED]" }` |
| `let key: SecureString` | `{ __logicn_secure: true, value: string }` with safe display behaviour. |

`protected` and `redacted` are governance labels, not runtime type names. The
base type remains the declared domain type, such as `Email` or `PatientId`.

## Record Types

Galerina record and `type` declarations become plain TypeScript objects at
runtime:

```typescript
type User = {
  id: string;
  email: string;
};
```

Field names are preserved exactly as declared. Runtime validation must reject
missing required fields before a raw request value becomes a typed record.

## Collection Types

| Galerina type | TypeScript runtime representation |
|---|---|
| `Array<T>` | `T[]` |
| `Set<T>` | `Set<T>` |
| `Map<K, V>` | `Map<K, V>` |

Collection operation contracts are documented in
`arrays-and-string-operations.md`, `list-operations.md`, and
`galerina-stdlib-reference.md`.

## Error Propagation at Runtime

When `?` is applied to `Result<T, E>`:

```text
Ok(value)?  -> value
Err(error)? -> early return Err(error)
```

Inside a flow:

1. The interpreter detects `Err(error)`.
2. It throws or signals an internal `EarlyReturn`.
3. The enclosing flow catches that signal.
4. The flow returns `Result.Err(error)` to its caller.
5. The runtime writes audit evidence for the early failure when the profile
   requires it.

The early-return signal is implementation detail. It must not leak to Galerina
source code.

## Runtime Enforcement Rules

- Unsafe bindings are tracked in the binding registry and checked before
  governed sink calls.
- Protected values use `__logicn_protected` wrappers to prevent accidental
  `console.log` and unsafe audit serialization.
- SecureString uses `__logicn_secure` and must display as `[SECURE]`.
- Redacted values are safe for logs and audit, but still retain type metadata.
- Runtime wrappers must never expose raw secret values through `toString()`,
  `valueOf()`, JSON serialization, error messages, or diagnostics.

## Compiler Status

```text
Runtime value model: specified - implementation Phase 7B/8
Binding registry:     specified - implementation Phase 7B/8
Secure wrappers:      specified - implementation Phase 7B/8
```

## See Also

- `docs/Knowledge-Bases/formal-type-system-spec.md`
- `docs/Knowledge-Bases/generic-types.md`
- `docs/Knowledge-Bases/galerina-core-standard-types-string-char-byte.md`
- `docs/Knowledge-Bases/arrays-and-string-operations.md`
- `docs/Knowledge-Bases/list-operations.md`
- `docs/Knowledge-Bases/stdlib-gates.yaml`
- `docs/Knowledge-Bases/galerina-runtime-lifecycle.md`
- `docs/Knowledge-Bases/galerina-audit-writer-spec.md`
