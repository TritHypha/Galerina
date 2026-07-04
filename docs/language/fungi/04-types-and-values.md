# 04 — Types & Values

> Grounded in: `parser.ts:5326-5343` (`type` alias / record-body), `parser.ts:5353-5391`
> (`record`), `parser.ts:5394-5426` (`enum`), `parser.ts:1134-1140` (`protected`/`redacted`
> qualifier on a type), type IDs in `type-registry.ts:22-99`, generics/arity + `Some/None/Ok/Err`
> in KB `formal-type-system-spec.md`. Real examples: `examples/healthcare/getPatient.fungi`,
> `examples/auth-service/createSession.fungi`, `.../self-hosted/lexer.fungi`.

## Primitive types

These are the built-in primitives (`type-registry.ts` TypeId table):

| Type | Notes |
|---|---|
| `Bool` | `true` / `false` |
| `Int` | platform integer, at least 64-bit; sized variants exist: `Int8/16/32/64`, `UInt8/16/32/64` |
| `Float` | approximate maths; sized variants `Float16/32/64` |
| `Decimal` | **use for money and precise values** (never `Float` for currency) |
| `String` | UTF-8 text |
| `Char` | a single character |
| `Timestamp`, `Duration` | time values |
| `SecureString` | a string derived from a secret — the taint checker guards it (see [05](05-bindings-taint-privacy.md)) |
| `None` | the absent value (the `None` case of `Option`) |

```fungi
let message: String = "hello"
let count: Int = 42
let price: Decimal = 19.99
```

> Rule from the KB: **use `Decimal` for money, `Float` only for approximate maths.** Avoid `Any`.

## Declaring types

### Alias — `type Name = TypeRef`

The most common declaration. It names a type expression, usually your flow's result type.
`parser.ts:5332` captures the right-hand side as a child type reference.

```fungi
type GetPatientResult = Result<PatientSummary, PatientError>   // getPatient.fungi:1
type CreateSessionResult = Result<Session, SessionError>       // createSession.fungi:1
type PatientId = Brand<String, "PatientId">                    // getPatient.fungi:2
```

### Record — two equivalent forms

A record is a struct with named fields. **Fields are separated by newlines or commas** (both parse;
`parser.ts:5353-5391`). There are two spellings and both work:

```fungi
// Form 1 — top-level `record` keyword (self-hosted/lexer.fungi:39-48)
record Token {
  kind: TokenKind
  value: String
  line: Int
  column: Int
}

// Form 2 — `type Name = record { ... }` (getPatient.fungi:5)
type PatientSummary = record { patientId: redacted String, name: String, dob: String }

// Form 3 — `type Name { ... }` record-body shorthand (createSession.fungi:2-5)
type Session {
  readonly sessionId: SessionId
  readonly expiresAt: Timestamp
}
```

Form 3 (`type Name { ... }` with no `= record`) is the short spelling the parser treats as a
record-style body (`parser.ts:5326`). Note that fields can carry qualifiers: `redacted String`,
`readonly sessionId: SessionId`.

### Enum — `enum Name { A B C }`

Variants are **space/newline-separated** (commas optional); `parser.ts:5394-5426`.

```fungi
// Top-level enum (self-hosted/lexer.fungi:23-37)
enum TokenKind {
  Identifier
  Keyword
  StringLiteral
  NumberLiteral
}

// Inline enum in an alias (getPatient.fungi:6)
type PatientError = enum { NotFound Unauthorized }

// (createSession.fungi:7)
type SessionError = enum { InvalidToken SessionLimitReached }
```

> **Common mistake:** writing `enum { A, B, C }` and assuming commas are *required*. They are
> optional — the canonical corpus style is whitespace-separated (`NotFound Unauthorized`).

## Generic / wrapper types

The real generic types (with their argument counts, from `type-registry.ts` + the formal spec):

| Type | Arity | Meaning |
|---|---|---|
| `Result<T, E>` | 2 | success `Ok(T)` or failure `Err(E)` |
| `Option<T>` | 1 | present `Some(T)` or absent `None` |
| `Array<T>` | 1 | ordered sequence |
| `Set<T>` | 1 | unordered unique collection |
| `Map<K, V>` | 2 | key-value map |
| `Brand<T, "Name">` | 2 | a plain type given a distinct compile-time identity |
| `Money<Currency>` | 1 | an amount tagged with a currency type |

### `Result` and `Option` — the workhorses

You construct them with `Ok(x)` / `Err(e)` / `Some(x)` / `None`, and you consume them with `match`
or the `?` operator. From `examples/auth-service/createSession.fungi`:

```fungi
type CreateSessionResult = Result<Session, SessionError>

secure flow createSession(readonly request: Request) -> CreateSessionResult
contract { ... }
{
  let session = Session.create(request.body.token)?   // ? unwraps Ok / early-returns Err
  ...
  return Ok(session)
}
```

Matching them (see [07 — Control flow](07-control-flow.md)):

```fungi
match user {
  Some(value) => { return value.name }
  None        => { return "missing" }
  _           => { return "unknown" }
}
```

### `Brand<T, "Name">` — nominal identity for a primitive

`Brand` gives a plain `String` (or `Int`, ...) a distinct domain type so you can't accidentally pass a
raw string where a `PatientId` is required.

```fungi
type PatientId = Brand<String, "PatientId">     // getPatient.fungi:2
type SessionId = Brand<String, "SessionId">     // createSession.fungi:6
```

### `Money<Currency>` and `Decimal`

`Money<Currency>` tags an amount with a currency (`Money<GBP>`). For plain precise numbers use
`Decimal`. Note that *currency-literal* forms like `GBP0.00` are **not** general expression syntax —
see "Literals" below.

## Value-state qualifiers on a type

`protected` and `redacted` (and `tainted`, `secret`) are **governance qualifiers** that prefix a base
type; they are not types themselves. The parser preserves the qualifier as part of the type
annotation (`parser.ts:1134-1140`), and the taint/value-state checker enforces it.

```fungi
type PatientSummary = record { patientId: redacted String, ... }   // field is redacted
let patientId: protected PatientId = validate.patientId(...)?      // binding is protected
```

There is **also** a generic-wrapper spelling that appears in one example —
`Protected<MedicalNote>` (`examples/healthcare/classifyPrivateMedicalNote.fungi:14`):

```fungi
secure flow classifyPrivateMedicalNote(readonly note: Protected<MedicalNote>) -> ...
```

So both `protected T` (qualifier) and `Protected<T>` (wrapper) occur in real code. Full semantics in
[05 — Bindings, taint & privacy](05-bindings-taint-privacy.md).

## Which "fancy" types are real vs aspirational

Be careful here — several types are described in the KB/canonical docs but do **not** appear in the
passing example corpus and have no parser/type-registry backing as first-class generics:

| Type | Status |
|---|---|
| `Result`, `Option`, `Array`, `Set`, `Map`, `Brand`, `Money`, `Decimal`, primitives | **Real** — in `type-registry.ts` and used by examples |
| `Protected<T>` | **Real** (appears in `classifyPrivateMedicalNote.fungi`); `protected T` qualifier is the more common form |
| `SecureString` | **Real** — a TypeId; produced by secret reads |
| `Tainted<T>` | **KB/aspirational** — no parser reference, no passing example. Use the `tainted` param qualifier or `unsafe let` instead (see [05](05-bindings-taint-privacy.md)) |
| `SafeFor<Ctx, T>` | **KB/aspirational** — appears in specs only; not parser-verified |
| `Tensor<Float32, [dims]>`, `Matrix<...>` | **Spec-level** — described in `formal-type-system-spec.md` for the compute/AI story; not used by the general corpus. Treat as advanced/forward-looking |

When in doubt, grep `examples/**/*.fungi` for the type. If it isn't used there, treat it as
aspirational and prefer the qualifier forms that are.

## Literals

| Literal | Example | Notes |
|---|---|---|
| String | `"Hello"`, `"say \"hi\""`, `"emoji \u{1F600}"` | escapes `\n \t \\ \"`, Unicode `\u{...}`/`\uXXXX` |
| Char | `' '`, `'\n'`, `'\''` | single character |
| Int | `42`, `0xFF`, `0b1010`, `0o755`, `1_000_000` | hex/binary/octal, underscores allowed |
| Float | `3.14159`, `1.23e-4` | scientific notation allowed |
| Bool | `true`, `false` | keywords |
| Array | `[1, 2, 3]`, `[]` | comma-separated |
| Record/object | `{ event: "X", id: redact(id) }` | `field: value`, comma-separated, trailing comma OK |

### The unit-suffix gotcha (`16MB`, `5mj`, `GBP0.00`)

Unit-suffixed literals appear in the corpus **only inside contract clauses** — e.g.
`max_memory_ceiling: 16MB`, `max_energy_budget 5mj`, `max_token_cost GBP0.00`
(`guard-domain-ceiling.fungi:35`, `classifyPrivateMedicalNote.fungi:57,62`). The **lexer does not
produce a single "16MB" token** — in ordinary expression position that would be a number `16`
followed by an identifier `MB`. Inside contract-clause bodies the clause sub-parser reads the
`number` + `identifier` pair as one budget value.

**Takeaway:** don't write `let size = 16MB` in a flow body and expect it to work. Unit suffixes are a
contract-clause convenience, not a general number literal.

## Module-path calls use `.` (not `::`)

Method and module calls use a dot today: `AuditLog.write(...)`, `String.split(...)`,
`PatientsDB.find(...)`. The KB notes `::` is the intended canonical form but the `::` parser is not
implemented — **use `.` in all `.fungi` source** (KB `galerina-contract-clause-reference.md`
Stage-A notes).

## A note on named-constructor let-bindings

Per the KB Stage-A notes, `let x = TypeName { field: value }` (a named constructor directly in a
let-binding) can fail in Stage A. The reliable forms are:

```fungi
return Ok(PatientSummary { patientId: id, name: n })   // ✅ constructor as a call argument
let r = { patientId: id, name: n }                     // ✅ anonymous record literal
```

## Common mistakes (types)

| Mistake | Why wrong | Fix |
|---|---|---|
| `-> Result<Foo, Bar>` in a contract flow signature | contract flows return a named alias | `type FooResult = Result<Foo, Bar>` then `-> FooResult` |
| `enum E { A, B }` assuming commas are required | commas are optional | `enum E { A B }` (whitespace) is canonical |
| `let x: Tainted<Foo> = ...` | `Tainted<T>` isn't parser-backed | use `unsafe let` or a `tainted` param (see [05](05-bindings-taint-privacy.md)) |
| `Decimal` vs `Float` for money | `Float` loses precision | use `Decimal` (or `Money<Currency>`) |
| `AuditLog::write(...)` | `::` not implemented | `AuditLog.write(...)` |
| `let x = 16MB` in a body | unit suffixes are contract-clause-only | keep budgets inside contract clauses |
| `result of X else Y` type form | proposal, not in parser | `Result<X, Y>` (`DO_NOT_USE_YET.md` §1) |

## Real files to open

* `examples/auth-service/createSession.fungi` — alias, record (`type Session { ... }`), `enum`, `Brand`.
* `examples/healthcare/getPatient.fungi` — `record` with a `redacted` field, `enum`, `Brand`, `Result`.
* `packages-galerina/galerina-core-compiler/src/self-hosted/lexer.fungi` — top-level `record`/`enum`,
  `Option<Char>`, `Array<String>`, real `match`/`Some`/`None` usage.

Next: **[05 — Bindings, taint & privacy](05-bindings-taint-privacy.md)**.
