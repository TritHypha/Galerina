# Trust Conversion And Data Safety

## Purpose

Galerina separates memory safety from trust safety.

All Galerina values should remain memory-safe. An `unsafe` value is not
memory-unsafe. It is untrusted data that crossed a boundary or has not yet
earned use in trusted runtime logic.

## Core Rule

```text
Unsafe values are inert until converted or declared safe.
```

An `unsafe` variable must not participate in normal runtime expressions. It
must not be added, concatenated, trimmed, mapped, counted, merged, queried,
executed, indexed for business logic, passed to ordinary string or array
helpers, or used by privileged runtime APIs.

Invalid:

```spore
let raw_price: unsafe Decimal = request.price
let total = raw_price + 1
```

Invalid:

```spore
let raw_name: unsafe String = request.name
let name = raw_name.trim()
```

The only allowed operations on an `unsafe` value are:

1. trust conversion through `validate`, `guard` or `sanitize`
2. explicit safe declaration such as `safe foo`, where policy allows that
   declaration and reports the reason

`encode` is not an unsafe-to-safe conversion step. Encoding requires a safe
input value and returns a context-specific safe output value.

## External Boundaries

Values become `unsafe` when they cross external or untrusted boundaries,
including:

- HTTP requests
- databases
- APIs
- file uploads
- browser input
- AI responses
- plugins
- queues
- sockets
- shell output
- cache entries
- package metadata

Example:

```spore
let body: unsafe Json = request.body
```

## Trust Operations

### `validate`

Validation proves that data matches a required structure, type, schema, format,
range, required-field set, allowed-value set or runtime policy.

```spore
let email: safe Email = validate.email(raw_email)
```

### `guard`

Guard checks for dangerous patterns or payloads. It should reject dangerous
values rather than silently rewriting them.

```spore
let checked: safe String = guard(raw_comment)
```

Guarding may detect injection payloads, malformed payloads, dangerous runtime
patterns and suspicious content.

### `sanitize`

Sanitization cleans and normalises generic untrusted data.

```spore
let cleaned: safe String = sanitize.data(raw)
```

`sanitize.data` may normalise whitespace, remove malformed unicode, remove
invalid control characters, normalise encoding and remove broken payload
fragments.

Sanitization is not output-context safety. It does not mean safe for HTML, SQL,
JavaScript, CSS, shell execution or XML.

### `encode`

Encoding converts an already-safe value into a safe representation for a
specific destination context.

```spore
let html: safe Html = encode.html(cleaned)
let url: safe UrlPart = encode.url(cleaned)
let js: safe JavaScript = encode.javascript(cleaned)
let css: safe Css = encode.css(cleaned)
let xml: safe Xml = encode.xml(cleaned)
let arg: safe ShellArg = encode.shell_arg(cleaned)
```

Encoding must be context-aware. `safe Html` is not the same as
`safe JavaScript`, `safe UrlPart`, `safe ShellArg` or `safe Css`.

## Recommended Pipeline

```text
unsafe boundary value
  -> validate / guard / sanitize
  -> safe domain value
  -> encode.context
  -> safe contextual output value
```

The exact order may be policy-specific, but unsafe values cannot enter ordinary
runtime logic before approved trust conversion or explicit safe declaration.

## Query Safety

Galerina should prefer typed, parameterized queries over manual SQL escaping.

```spore
let q: Query = sql {
    SELECT id, email
    FROM users
    WHERE id = :id
}

database.main.run(q, {
    id: safe_id
})
```

Unsafe interpolation is invalid:

```spore
let q: Query = sql {
    SELECT * FROM users WHERE id = ${raw_id}
}
```

Compiler diagnostic:

```text
Unsafe value cannot be interpolated into Query.
```

`Query` should be treated as an external-boundary executable query artifact,
not normal text. Query execution should require safe parameters, runtime
authority, immutability and audit output.

## Runtime Tracking

The runtime and reports should track:

- unsafe origin
- trust conversion path
- validation rules
- guard result
- sanitization state
- explicit safe declaration reason
- encoding context
- runtime authority
- query execution
- worker or boundary transitions

## Final Rule

```text
Unsafe values must pass through approved trust conversion or explicit safe
declaration before entering privileged or ordinary runtime logic.
```
