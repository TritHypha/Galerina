# Trust Conversion And Data Safety

Galerina separates memory safety from trust safety. `unsafe` does not mean
memory-unsafe. It means untrusted, unvalidated or boundary-derived.

All Galerina values remain memory-safe, but unsafe values are restricted until
they become safe through approved trust handling.

## Core Rule

```text
Unsafe values are inert until converted or declared safe.
```

An `unsafe` variable cannot be used by normal runtime logic. It cannot be:

- used in maths, concatenation or comparisons that drive logic
- merged with safe values
- passed to ordinary array helpers such as map, filter, reduce or event counts
- passed to ordinary string helpers such as trim, split, replace or format
- interpolated into queries
- passed to shell execution
- used to access `GlobalVault`
- passed to workers or runtime APIs
- used as business logic input

Invalid:

```spore
let raw_price: unsafe Decimal = request.price
let total = raw_price + 1
```

Invalid:

```spore
let raw_name: unsafe String = request.name
let clean_name = raw_name.trim()
```

Allowed:

```spore
let raw_price: unsafe Decimal = request.price
let price: safe Decimal = validate.decimal(raw_price)
let total: safe Decimal = price + 1
```

The only operations allowed on an unsafe value are:

1. trust conversion through `validate`, `guard` or `sanitize`
2. explicit safe declaration such as `safe foo`, where policy allows and
   reports the reason

`encode` is not an unsafe-to-safe conversion operation. `encode.*` requires a
safe input and produces a context-specific safe output.

## Boundary Sources

External boundaries produce unsafe values by default:

- HTTP requests
- database rows
- API responses
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

Validation proves that data matches a required structure or rule:

```spore
let email: safe Email = validate.email(raw_email)
```

Validation may check type, schema, format, range, required fields, allowed
values and runtime policy.

### `guard`

Guard inspects data for dangerous patterns or payloads and rejects suspicious
values instead of rewriting them:

```spore
let checked: safe String = guard(raw_comment)
```

### `sanitize`

Sanitize cleans and normalises generic untrusted data:

```spore
let cleaned: safe String = sanitize.data(raw)
```

`sanitize.data` may normalise whitespace, remove malformed unicode, remove
invalid control characters, normalise encoding and remove broken payload
fragments. It does not mean safe for HTML, SQL, JavaScript, CSS, shell
execution or XML.

### `encode`

Encode converts a safe value into a destination-specific safe value:

```spore
let html: safe Html = encode.html(cleaned)
let url_part: safe UrlPart = encode.url(cleaned)
let css: safe Css = encode.css(cleaned)
let js: safe JavaScript = encode.javascript(cleaned)
let xml: safe Xml = encode.xml(cleaned)
let arg: safe ShellArg = encode.shell_arg(cleaned)
```

Contextual safety is not interchangeable:

```text
safe Html != safe JavaScript
safe UrlPart != safe ShellArg
safe Css != safe Html
```

## Recommended Pipeline

```text
unsafe
  -> validate / guard / sanitize
  -> safe domain value
  -> encode.context
  -> safe contextual value
```

The compiler and runtime should reject attempts to use unsafe values before the
conversion point.

## Query Handling

Galerina should prefer parameterized typed queries:

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

Diagnostic:

```text
Unsafe value cannot be interpolated into Query.
```

`Query` is an external-boundary executable artifact, not normal text. It should
be immutable, authority-checked, parameterized and audited.

## Runtime Tracking

Reports should track unsafe origin, validation path, guard result,
sanitization state, explicit safe declaration reason, encoding context,
runtime authority, query execution and worker boundaries.

## Final Rule

```text
Unsafe values must pass through approved trust conversion or explicit safe
declaration before entering privileged or ordinary runtime logic.
```
