# Postfix Type State Syntax

## Definition

Galerina attaches governance state to values using **postfix state syntax**: the
base type is written first, the state qualifier second.

```galerina
let input:  String unsafe             = request.body("name")
let secret: String secure             = env.secret("APP_SECRET")
let email:  Email  safe validated     = validate.email(rawEmail)
let raw:    Json   unsafe unvalidated = boundary.api.body(request)
```

## Core Rule

```text
Base type first. Governance state second.
```

State qualifiers describe how a value may flow through the system. They are not
wrapper types. `String unsafe` is still a `String` — it is a String that the
runtime considers untrusted.

## Why Postfix

Prefix style (`unsafe String`) makes the qualifier look like a new type name.
Postfix style keeps the base type as the developer's primary mental anchor:

```galerina
// Postfix: type is clear, state is additional
let input: String unsafe = ...

// Prefix alternative (not used in Galerina):
let input: unsafe String = ...    // reads like "unsafe" is the type
```

## v1 State Set

| State | Meaning |
| --- | --- |
| `safe` | Trusted; may participate in normal application logic |
| `unsafe` | Untrusted, unchecked, or externally sourced; must be validated before use |
| `validated` | Has passed a declared validator for its domain |
| `unvalidated` | Has not yet been proven acceptable for its claimed use |

`secure` is reserved for declarations (`secure flow`), not for variable state in v1.
Unmarked values are ordinary safe values unless they originate from an unsafe source.

## Multi-State Values

A value may carry multiple state qualifiers:

```galerina
let rawEmail: String unsafe unvalidated = form.email
let email:    Email  safe  validated    = validate.email(rawEmail)
```

The typical external-input pipeline:

```text
Json unsafe unvalidated
  -> String unsafe unvalidated
  -> Email safe validated
```

## State Transitions

State must change through approved operations — not by assignment.

Invalid (direct assignment across state):

```galerina
let rawEmail: String unsafe unvalidated = form.email
let email: Email safe validated = rawEmail    // compile error
```

Valid (through a validator):

```galerina
let rawEmail: String unsafe unvalidated = form.email
let email: Email safe validated = validate.email(rawEmail)
```

Invalid (secret leaking without declassification):

```galerina
let secret: String secure = env.secret("API_TOKEN")
let leaked: String = secret    // compile error
```

Valid (explicit declassification):

```galerina
let secret: String secure = env.secret("API_TOKEN")
let preview: String = secret.redacted()
```

## Compiler Rule

```text
A value with a restrictive or risky state cannot flow into an ordinary value
without an approved transition.
```

Approved transitions:
- `unsafe -> safe`: via `validate.*` or `clean.*` gates
- `unvalidated -> validated`: via a declared validator flow
- `secure -> plain`: via `.redacted()` or explicit declassification

## State in Type Definitions

State qualifiers may appear on struct fields:

```galerina
type WebhookConfig {
  endpoint:      String
  signingSecret: String secure
}

type IncomingComment {
  authorName: String unsafe
  body:       String unsafe
}

type LoginRequest {
  email:        String unsafe
  password:     String secure
  recoveryCode: Option<String secure>
}
```

## State in Flow Parameters

```galerina
secure flow login(email: String unsafe, password: String secure)
  -> LoginResult
contract {
  types {
    type LoginResult = Result<Session, LoginError>
  }
}
{
  let safeEmail: Email safe validated = validate.email(email)
  ...
}
```

## State in Generic Types

Two distinct forms:

| Form | Meaning |
| --- | --- |
| `Option<String secure>` | The contained String is secure when present |
| `Option<String> secure` | The whole Option value is secure |

Prefer attaching state to the smallest sensitive part:

```galerina
Option<String secure>       // preferred for sensitive inner values
Array<String unsafe>        // preferred for arrays of untrusted input
```

## Composition with Branded Types

State qualifiers compose with `Brand<T, "Name">`:

```galerina
type SessionToken = Brand<String secure, "SessionToken">
type CustomerId   = Brand<String, "CustomerId">
type RawHtml      = Brand<String unsafe, "RawHtml">
```

This reads as:
- `SessionToken` is a branded secure string
- `CustomerId` is a branded normal string
- `RawHtml` is a branded unsafe string

## Style A vs Style B (State Transitions)

**Style A — New binding per transition (preferred):**

```galerina
let emailRaw:       String unsafe unvalidated = form.email
let emailValidated: Email  safe  validated    = validate.email(emailRaw)
```

Pros: clear audit trail, no variable changes meaning, better source maps,
AI can follow state transitions.

**Style B — Mutating state on the same variable (not v1):**

```galerina
mut myEmail: String unsafe unvalidated = form.email
myEmail = validate.email(myEmail)    // type/state changes over time
```

Cons: harder to audit, more complex type checker.

```text
v1 rule: prefer new bindings for state transitions.
```

## Validator Flow Contracts

The compiler understands that validator flows change state:

```galerina
flow validate.email(value: String unsafe unvalidated) -> Email safe validated
flow validate.username(value: String unsafe unvalidated) -> Username safe validated
```

This makes state transitions explicit and typed.

## What is NOT in v1

```text
sanitized — overlaps with safe; context-dependent; deferred to frameworks
redacted  — belongs to framework/package policy, not core syntax
trusted   — deferred
untrusted — deferred
public    — deferred (may conflict with future visibility syntax)
```

PII and redaction are policy/framework concerns. A value may be safe for HTML
but unsafe for SQL. A globally `sanitized` state creates false confidence.

## Grammar Sketch

```text
TypeRef
  = BaseTypeRef TypeState?

TypeState
  = StateKeyword+

StateKeyword
  = "safe"
  | "unsafe"
  | "validated"
  | "unvalidated"
```

## Unmarked Values

Ordinary code does not need state annotations everywhere:

```galerina
let title:   String  = "Checkout"   // normal safe string
let count:   Int     = 3            // normal safe int
let enabled: Bool    = true         // normal safe bool
```

Unmarked types are ordinary safe values unless they come from an unsafe,
secure, or untrusted source.

## Example: Full Boundary Pipeline

```galerina
secure flow submitForm(request: Request) -> SubmitFormResult
contract {
  types {
    type SubmitFormResult = Result<Response, ApiError>
  }
  effects {
    network.inbound
  }
}
{
  let myFormData: Json   unsafe unvalidated = boundary.api.body(request)
  let rawEmail:   String unsafe unvalidated = myFormData.email
  let email:      Email  safe   validated   = validate.email(rawEmail)

  return Ok(Response.created())
}
```

State pipeline:
```text
Json unsafe unvalidated
  -> String unsafe unvalidated
  -> Email safe validated
```

## Core Principle

```text
State is not a type replacement.
State describes how a value may flow.

Base type = what the value is.
State = whether it can be trusted, used, and exposed.
```
