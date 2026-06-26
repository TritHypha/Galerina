# Galerina — Value-State Annotations

## Status

```
v1 feature
Phase 5 prerequisite
```

---

## Rules at a Glance

- `unsafe let` marks a boundary-origin binding — it cannot reach governed sinks without a gate upgrade
- `safe mut` upgrade requires a recognised gate on the RHS (`validate.*`, `sanitize.*`, `json.decode`, `parse.*`) — emits `SPORE-VALUESTATE-001` if missing
- Unsafe binding passed directly to a governed sink emits `SPORE-VALUESTATE-003`
- `SecureString` must not be passed to `print`, `log.*`, `Logger.*`, `console.*` — use `redact()` instead
- `SecureString` must not be compared with `==` or `!=` — use `constantTimeEquals()` instead
- Gate and sink registry: `docs/Knowledge-Bases/stdlib-gates.yaml`

---

## Purpose

Value-state annotations let Galerina attach **trust, safety, validation, and
provenance state** to individual values at the binding site.

They are distinct from flow qualifiers.

| Concept | Syntax example | What it describes |
|---|---|---|
| Flow qualifier | `secure flow`, `pure flow` | The execution kind of a flow |
| Safety prefix | `unsafe let`, `safe mut` | The trust state of a binding |

A flow can be `secure` (security-sensitive execution) while still holding
`unsafe` values from an external API body. These are orthogonal properties.

```galerina
secure flow createCustomer(request: Request) -> CreateCustomerResult
contract {
  types {
    type CreateCustomerResult = Result<Response, ApiError>
  }
  effects {
    database.write
  }
}
{
  unsafe let body: Bytes      = boundary.api.body(request)
  safe   mut body             = validate.customer(body)?
  let input: CreateCustomerInput = body
  ...
}
```

The flow is `secure`. The binding `body` starts `unsafe`. After the validation
gate it becomes `safe`. All three statements are correct and independent.

---

## Core Idea

A safety prefix describes **what trust state a binding starts in**, and
`safe mut` upgrades it after a validation gate.

```galerina
unsafe let rawEmail: String = form.email              // boundary-origin: blocked from sinks
safe   mut rawEmail         = validate.email(rawEmail)?  // gate passed: now safe
```

The compiler uses these annotations to enforce that `unsafe` bindings cannot
reach governed sinks (databases, networks, payment processors) without passing
through an approved gate first.

---

## v1 State Vocabulary

For v1, the supported states are deliberately minimal.

### Safety dimension

| State | Meaning |
|---|---|
| `safe` | Value is allowed inside normal governed logic |
| `unsafe` | Value came from an untrusted or unchecked boundary |

### Validation dimension

| State | Meaning |
|---|---|
| `validated` | Value has passed an explicit validation gate |
| `unvalidated` | Value has not passed a validation gate |

### Provenance dimension

| State | Meaning |
|---|---|
| `tainted` | Value came from a source requiring sanitisation |

### Secret dimension

| State | Meaning |
|---|---|
| `secret` | Value contains sensitive material |
| `protected` | Value has restricted operations (printing, comparison, serialisation) |

### Access dimension

| State | Meaning |
|---|---|
| `readonly` | Cannot be mutated through this binding |

These states are composable in pairs:

```galerina
String unsafe unvalidated
Email safe validated
SecureString secret protected
Json tainted external     // external is a Phase 6+ provenance state
```

> Note: `trusted`, `untrusted`, `internal`, `external`, `redacted`, `owned`,
> `borrowed`, `shared` are in the design vocabulary but are deferred to Phase 6+.
> Do not add them to the Phase 5 checker.

---

## Syntax

### EBNF

```ebnf
binding_decl =
  [ safety_prefix ] binding_keyword identifier [ ":" type_ref ] "=" expression ;

safety_prefix =
  "unsafe" | "safe" ;

binding_keyword =
  "let" | "mut" | "readonly" ;
```

The safety prefix appears **before** the binding keyword. It describes the
trust state of the value being bound.

### Binding forms

| Form | Meaning |
|---|---|
| `unsafe let name: T = expr` | New immutable binding; marks `expr` as boundary-origin |
| `unsafe mut name: T = expr` | New mutable binding; marks `expr` as boundary-origin |
| `safe mut name = gate(name)?` | Upgrades an existing `unsafe` binding to safe after a gate |
| `safe let name: T = expr` | New binding explicitly declared safe (rarely needed; default is safe) |
| `let name: T = expr` | New binding; no prefix — internally constructed, treated as safe |
| `mut name: T = expr` | Mutable binding; no prefix — internally constructed, treated as safe |
| `readonly name: T = expr` | Immutable after first write |

### Examples

```galerina
unsafe let rawEmail: String = form.email              // boundary input — unsafe
safe   mut rawEmail         = validate.email(rawEmail)?  // gate passed — now safe

unsafe let rawBody: Bytes   = request.rawBody             // HTTP body — unsafe
safe   mut rawBody          = json.decode<Order>(rawBody)?  // decoded — safe

let total: Decimal = price + tax                      // internal — safe by default
readonly config: AppConfig = loadConfig()             // safe, immutable
```

The `safe`/`unsafe` prefix is **optional for non-boundary bindings**. A plain
`let` or `mut` without a prefix is treated as safe (internally constructed).
The prefix is required when binding boundary data so the compiler can enforce
governed sink access rules.

---

## AST Shape

The safety prefix is encoded on the `BindingNode` as a `safetyPrefix` field.

### Updated binding node shape

```typescript
export type SafetyPrefix = "safe" | "unsafe";

export interface BindingNode extends AstNode {
  readonly kind: "letDecl" | "mutDecl" | "readonlyDecl";
  /** Binding name */
  readonly value: string;
  /** Base type reference */
  readonly typeAnnotation?: string;
  /** Safety prefix — "unsafe" | "safe" | undefined (no prefix = safe by default) */
  readonly safetyPrefix?: SafetyPrefix;
  readonly location?: SourceLocation;
  readonly children?: readonly AstNode[];
}
```

### Example AST

Source:

```galerina
unsafe let rawEmail: String = form.email
```

AST:

```json
{
  "kind": "letDecl",
  "value": "rawEmail",
  "typeAnnotation": "String",
  "safetyPrefix": "unsafe",
  "location": { "file": "forms.spore", "line": 3, "column": 3 }
}
```

---

## Semantic Checker Rules

These rules are enforced by the value-state checker pass (Phase 5).

### Rule 1 — `unsafe` bindings cannot reach governed sinks

Bindings declared with `unsafe let` or `unsafe mut` must not flow into:

```
database.write
database.insert
network.outbound
shell.exec
filesystem.write
secret.write
payment.charge
```

without first passing through a `safe mut` upgrade.

Diagnostic: `SPORE-VALUESTATE-001`

### Rule 2 — `safe mut` requires an approved gate

The right-hand side of `safe mut` must be a call to a recognised gate function.
Directly re-assigning an `unsafe` binding to safe without a gate is illegal.

Invalid:

```galerina
unsafe let rawEmail: String = input.email
safe   mut rawEmail = rawEmail   // no gate — SPORE-VALUESTATE-002
```

Valid:

```galerina
unsafe let rawEmail: String = input.email
safe   mut rawEmail = validate.email(rawEmail)?   // gate present
```

Diagnostic: `SPORE-VALUESTATE-002`

### Rule 3 — `SecureString` bindings have restricted operations

`SecureString` values cannot be:

- Passed to `print()`, `log.*()`, or any logging function
- Compared with `==` (use `constantTimeEquals()`)
- Included in an API response body
- Stored in a plain `String` binding

Diagnostic: `SPORE-SECRET-001` (print/log), `SPORE-SECRET-002` (equality comparison),
`SPORE-SECRET-003` (API response)

### Rule 4 — Tainted bindings require sanitisation

A binding tainted by an `unsafe` operand in an expression must pass through a
`sanitize.*` gate before it can be used at a governed sink.

Diagnostic: `SPORE-VALUESTATE-004`

### Rule 5 — Boundary values must be declared `unsafe`

Values arriving from HTTP bodies, file reads, environment, or external APIs
must be declared with `unsafe let` or `unsafe mut`. Assigning them to a plain
`let` without the prefix is a state contradiction.

Diagnostic: `SPORE-VALUESTATE-005`

---

## Gate Functions

State upgrades from `unsafe → safe` require a `safe mut` with a named gate.

```galerina
unsafe let raw: String = request.body
safe   mut raw = validate.email(raw)?   // gate call required
```

### Recognised gate prefixes (Phase 5)

| Pattern | Typical use |
|---|---|
| `validate.*` | Format/schema validation (email, uuid, url, phone …) |
| `sanitize.*` | Sanitise for safe display (HTML, SQL, shell escaping) |
| `json.decode<T>()` | Decode JSON bytes to typed value |
| `toml.decode<T>()` | Decode TOML string to typed value |
| `parse.*` | Parse primitive from string (int, decimal, bool) |
| `constantTimeEquals()` | Compare two `SecureString` values |
| `redact()` | Produce a safe log placeholder from a `SecureString` |

Gate recognition in Phase 5 is pattern-based on call expression names. A
full type-system gate registry is a Phase 6+ addition.

---

## Diagnostic Codes

All codes follow the `SPORE-SERIES-NNN` format.

### SPORE-VALUESTATE series

| Code | Name | Severity | Description |
|---|---|---|---|
| `SPORE-VALUESTATE-001` | `UNSAFE_VALUE_AT_SINK` | error | `unsafe` or `unvalidated` value reached a governed sink |
| `SPORE-VALUESTATE-002` | `IMPLICIT_STATE_UPGRADE` | error | Cannot assign `unsafe unvalidated` to `safe validated` without a gate |
| `SPORE-VALUESTATE-003` | `MISSING_VALIDATION_GATE` | error | A validation gate is required but not present |
| `SPORE-VALUESTATE-004` | `TAINTED_VALUE_UNSANITISED` | error | `tainted` value used without a sanitiser |
| `SPORE-VALUESTATE-005` | `STATE_ANNOTATION_CONFLICT` | error | Value-state annotation conflicts with inferred source state |

### SPORE-SECRET series

| Code | Name | Severity | Description |
|---|---|---|---|
| `SPORE-SECRET-001` | `SECRET_LOGGED_RAW` | error | `secret protected` value passed to a print or log function |
| `SPORE-SECRET-002` | `SECRET_EQUALITY_COMPARISON` | error | `secret protected` value compared with `==` (use `constantTimeEquals()`) |
| `SPORE-SECRET-003` | `SECRET_IN_API_RESPONSE` | error | `secret protected` value included in an API response |

### Diagnostic shape

```typescript
{
  code: "SPORE-VALUESTATE-001",
  name: "UNSAFE_VALUE_AT_SINK",
  severity: "error",
  message: "Unsafe unvalidated value 'rawMessage' cannot flow into database.write.",
  location: { file: "forms.spore", line: 14, column: 7 },
  suggestedFix: "Pass rawMessage through validate.* or sanitize.* before writing to the database."
}
```

---

## Examples

### API boundary — correct pattern

```galerina
secure flow createCustomer(request: Request) -> CreateCustomerResult
contract {
  types {
    type CreateCustomerResult = Result<Response, ApiError>
  }
  effects {
    database.write
    audit.write
  }
}
{

  unsafe let body: Bytes = request.rawBody
  safe   mut body = json.decode<CreateCustomerInput>(body)?

  let saved: Customer = saveCustomer(body)?
  return Ok(Api.created(saved))
}
```

### API boundary — error (unsafe value reaches database)

```galerina
secure flow unsafeSave(request: ContactFormRequest) -> UnsafeSaveResult
contract {
  types {
    type UnsafeSaveResult = Result<ContactForm, FormError>
  }
  effects {
    database.write
  }
}
{
  unsafe let rawMessage: String = request.message

  // SPORE-VALUESTATE-001: unsafe binding cannot flow into database.write
  let saved: ContactForm = ContactFormsDB.insert({ message: rawMessage })?

  return Ok(saved)
}
```

### Secret — correct pattern

```galerina
secure flow loadApiKey() -> LoadApiKeyResult
contract {
  types {
    type LoadApiKeyResult = Result<SecureString, SecretError>
  }
  effects {
    secret.read
  }
}
{
  let apiKey: SecureString = env.secret("API_KEY")

  // SPORE-SECRET-001 would fire here — do NOT uncomment:
  // print(apiKey)

  log.info("API key loaded", { key: redact(apiKey) })

  return Ok(apiKey)
}
```

### Constant-time comparison — correct pattern

```galerina
secure flow verifyToken(provided: SecureString) -> VerifyTokenResult
contract {
  types {
    type VerifyTokenResult = Result<Decision, AuthError>
  }
  effects {
    secret.read
    audit.write
  }
}
{
  let expected: SecureString = env.secret("EXPECTED_TOKEN")

  // SPORE-SECRET-002 would fire here — do NOT uncomment:
  // if provided == expected { ... }

  let valid: Bool = constantTimeEquals(provided, expected)

  match valid {
    true  => return Ok(Allow)
    false => return Ok(Deny)
  }
}
```

---

## Relationship to Flow Qualifiers

| Concept | Controls | Example |
|---|---|---|
| `pure flow` | Whether effects are declared | `pure flow add(a: Int) -> Int` |
| `secure flow` | Whether effects are audited and declared | `secure flow save(...) effects [...]` |
| `unsafe let` / `safe mut` | Whether a **binding** is from a trusted source | `unsafe let raw: Bytes = request.body` |

`safe flow` and `unsafe flow` are **not valid syntax** in v1. The `safe`/`unsafe`
qualifiers apply to bindings (`let`, `mut`), not flows.

---

## Relationship to the Effect Checker

The value-state checker and the effect checker are separate passes.

- The **effect checker** (`SPORE-EFFECT-*`) validates that declared effects match
  flow qualifiers (e.g. `pure flow` must declare no effects).
- The **value-state checker** (`SPORE-VALUESTATE-*`, `SPORE-SECRET-*`) validates
  that annotated values do not reach sinks incompatible with their state.

A future joint pass may correlate effect sinks with value states (e.g.
`database.write` requires `safe validated` inputs), but that is a Phase 6+
concern.

---

## Future Extensions (Phase 6+)

The full design vocabulary includes states that are deferred:

```
trusted / untrusted — trust dimension
internal / external — provenance dimension
redacted            — output of redact()
owned / borrowed / shared — ownership/access
```

The `@state(Confirmed)` lifecycle annotation syntax and `state OrderState { ... }`
declarations are also deferred. See the future design specification in
`NOTES TO COVER/z` and `NOTES TO COVER/logicn_value_state_annotation_design.md`.

---

## Tokenisation

Value-state words are **active keywords** in v1 (already in `V1_ACTIVE_KEYWORDS`
in the Phase 4 lexer). They are contextual in semantics — they are only
meaningful after a type reference in a binding declaration — but they are
classified as `keyword` tokens, not `identifier`, to prevent their use as
variable names.

See: `docs/Knowledge-Bases/v1-reserved-keywords.md`

---

## See Also

- `docs/Knowledge-Bases/effect-checker-and-boundary-checker.md`
- `docs/Knowledge-Bases/galerina-core-effect-checker-v02.md`
- `docs/Knowledge-Bases/formal-type-system-spec.md`
- `packages-galerina/galerina-core-compiler/src/parser.ts` — `parseTypeRefWithValueState()`
