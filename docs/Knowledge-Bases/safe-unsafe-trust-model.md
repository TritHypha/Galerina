# Safe / Unsafe Trust Model

## Definition

Galerina introduces `safe` and `unsafe` as first-class runtime trust concepts.
This makes Galerina memory-safe, trust-aware, runtime-governed and security-first.

## Core Distinction

Galerina separates two kinds of safety:

```text
memory safety      = all values, always
runtime trust safety = requires explicit validation
```

Galerina `unsafe` does NOT mean memory-unsafe, pointer-unsafe, unmanaged memory,
bypassing bounds checks, manual allocation or raw memory access.

Unlike Rust where `unsafe` means the memory safety guarantees may be bypassed,
in Galerina:

```text
unsafe = memory-safe but security-untrusted
```

All Galerina values remain memory-safe. `unsafe` means the value originated
outside the trusted runtime and has not yet been validated or sanitised.

## What `unsafe` Means

A value is `unsafe` when it came from:

```text
API requests
browser input
file uploads
AI responses
network traffic
external database imports
plugin data
shell output
```

## Core Runtime Rule

```text
unsafe values may exist in the runtime,
but they cannot participate in normal logic operations.
```

Unsafe values are quarantined until validated.

## Runtime Type Marking

The runtime automatically marks external input as unsafe:

| Source | Runtime Type |
| --- | --- |
| HTTP request | unsafe |
| File upload | unsafe |
| AI output | unsafe |
| Plugin data | unsafe |
| Browser data | unsafe |
| External socket data | unsafe |

## Allowed Operations on Unsafe Values

Unsafe values may only:

```text
1. Be temporarily stored
2. Be passed into approved validators
3. Be sanitised
4. Be rejected
5. Be logged safely as unsafe metadata
```

## Forbidden Operations on Unsafe Values

Unsafe values cannot, until validated:

```text
perform maths
merge with safe values
participate in business logic
be used in conditions
access GlobalVault
access databases
access files
access shell execution
access workers
access runtime APIs
access network execution
access payment systems
```

## Validation Model

```text
unsafe -> validate/sanitise -> safe -> usable
```

Not: `unsafe -> use while still marked unsafe`

## Postfix State Syntax

Galerina uses postfix state syntax: the base type is written first, the state
qualifier second. This keeps the base type as the developer's primary mental anchor.

```galerina
let input:  String  unsafe             = request.body("name")
let secret: String  secure             = env.secret("APP_SECRET")
let email:  Email   safe   validated   = validate.email(rawEmail)
let raw:    Json    unsafe unvalidated = boundary.api.body(request)
```

This avoids wrapper type proliferation:

```text
// Without postfix state — need many wrapper types:
SecureString, UnsafeString, ValidatedString, UnsafeJson, ValidatedJson

// With postfix state — base type stays reusable:
String secure, String unsafe, String validated, Json unsafe, Json validated
```

v1 state set: `safe`, `unsafe`, `validated`, `unvalidated`.
See `postfix-type-state-syntax.md` for the full specification.

## Code Examples

Invalid — unsafe participating in arithmetic:

```galerina
let price: Decimal unsafe = request.price
let tax:   Decimal safe   = 20
let total = price + tax    // compile error
```

Compiler error:

```text
LNN-SEC-041:
unsafe value cannot participate in runtime expressions.
Validate or sanitise before use.
```

Correct:

```galerina
let raw_price: Decimal unsafe = request.price
let price:     Decimal safe   = validate.decimal(raw_price)
let tax:       Decimal safe   = 20
let total:     Decimal safe   = price + tax
```

String example — correct:

```galerina
let raw_name: String unsafe = request.name
let name:     String safe   = sanitise.text(raw_name)
let greeting: String safe   = "Hello " + name
```

Database example — correct:

```galerina
let raw_query: String         unsafe = request.query
let query:     DatabaseString safe   = database.escape(raw_query)
database.run(query)
```

## Safe Values

A `safe` value is:

```text
validated
sanitised
trusted by the runtime
allowed into privileged systems
```

## Context-Specific Safety

Safety is contextual. A value safe in one context is not automatically safe in
another:

```text
safe HtmlText  != safe DatabaseString
safe Email     != safe ShellArg
```

Specialised safe types include:

```galerina
safe Email
safe Url
safe DatabaseString
safe HtmlText
safe ShellArg
safe FilePath
```

## Approved Validators Only

Only approved runtime validators may convert `unsafe` to `safe`:

```galerina
let email: safe Email = validate.email(raw_email)
```

Invalid manual promotion:

```galerina
let email: safe Email = raw_email
```

Compiler error: unsafe value cannot be directly promoted to safe. Use an
approved validator.

## Flow vs fn

Flows may validate unsafe data:

```galerina
flow create_user(body: unsafe Json) -> Result {
  let user: safe User = validate.user(body)
  return GlobalVault.users.create(user)
}
```

Functions (`fn`) cannot upgrade trust automatically. Only runtime-approved
validators may return safe values.

## Worker Isolation

Workers receiving unsafe values run with stricter isolation:

```galerina
worker parse_upload {
  isolation: strict
}
```

## Runtime Enforcement

The compiler and runtime block `unsafe -> privileged runtime access` without
validation. Protected systems include:

```text
GlobalVault
Database runtime
Payment runtime
Secret runtime
File runtime
Worker runtime
Execution runtime
Shell runtime
```

## Runtime Auditing

The runtime tracks:

```text
unsafe origin
validation path
trust conversion
privileged access
runtime execution flow
```

## Security Benefits

This model prevents:

```text
SQL injection
prompt injection
path traversal
unsafe shell execution
privilege escalation
runtime trust confusion
unsafe backend orchestration
secret leakage
```

## Core Principle

```text
Everything is memory-safe.
Not everything is trusted.
```

```text
unsafe values cannot participate in normal runtime logic.
unsafe values must be validated before use.
```
