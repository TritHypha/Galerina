# Galerina Security — Input Taint Types

## Overview

`Tainted<T>` is a first-class type-system feature that marks values originating
from external, untrusted sources. It provides **data-provenance tracking**
complementary to the existing effect system.

Effects answer:
> What is this flow allowed to do?

Taint types answer:
> Where did this value come from, and is it safe for this sink?

Both checks are required. A flow may correctly declare `effects [database.write]`
and still be unsafe if it passes raw request text into a query builder without
sanitisation.

---

## Tainted Sources

The following input sources produce `Tainted<T>` values by default:

```text
HTTP request bodies
HTTP query parameters
HTTP headers
cookies
webhook payloads
form inputs
uploaded files
environment variable text (user-visible)
CLI arguments
network responses from untrusted services
database text from untrusted tables
message queue payloads
third-party API responses
```

Example:

```galerina
let rawEmail: Tainted<String> = request.form["email"]
let rawAmount: Tainted<String> = request.body.amount
let term: Tainted<String> = request.query["search"]
```

---

## Sensitive Sinks

`Tainted<T>` cannot flow into these sinks without passing through a declared
sanitiser/parser/validator:

```text
database.query()           — SQL injection prevention
html.render()              — XSS prevention
shell.exec()               — command injection prevention
log.info()                 — log-injection prevention
redirect.url()             — open redirect prevention
eval()                     — code injection prevention
```

Compiler error example:

```text
Security error LN-TAINT-DB-001:
Tainted<String> cannot reach database.query raw SQL input.

Taint source:
  request.query["search"]

Required boundary:
  - database.param(rawSearch)
  - ProductSearch.parse(rawSearch)
  - approved query builder API
```

---

## Taint Propagation

Taint is preserved through ordinary transformations:

```galerina
let a: Tainted<String> = request.query["a"]
let b = a.trim()        // inferred: Tainted<String>
let c = b.toLower()     // inferred: Tainted<String>
let d = "prefix_" + c  // inferred: Tainted<String>
```

String concatenation, trimming, case conversion — none of these remove provenance.
Only explicit validated/parsed boundaries remove taint.

---

## Safe Type Conversion

Use sink-specific safe types, not a single global `clean()`.

| Safe Type | Purpose |
|---|---|
| `SafeSqlParam<T>` | SQL parameterised queries |
| `SafeHtmlText` | HTML text content |
| `SafeHtmlAttribute` | HTML attribute values |
| `SafeUrl` | URL redirection |
| `SafePath` | Filesystem path |
| `SafeLogField` | Logging without injection |
| `VerifiedEmail` | Parsed/validated email |
| `ParsedJson<T>` | Validated JSON payload |
| `Validated<T>` | Domain-type parsed value |

Example — parameterised query:

```galerina
let rawId: Tainted<String> = request.query["id"]
let id: UserId = parse.userId(rawId)?

database.query<User>(
  "SELECT * FROM users WHERE id = ?",
  [id]
)
```

Example — HTML escaping:

```galerina
let rawTitle: Tainted<String> = request.body.title
let title: SafeHtmlText = html.escapeText(rawTitle)
view.render(title)
```

---

## Trusted<T> Escape Hatch

An escape hatch exists but must be loud and auditable:

```galerina
let value: Trusted<String> = trust(raw)
  reason "Value came from signed internal service response"
  evidence verifiedSignature
```

This requires a permission or policy gate in production mode and generates a
security report entry.

---

## Compiler Diagnostics

| Code | Description |
|---|---|
| `LN-TAINT-DB-001` | `Tainted<String>` reached `database.query` raw SQL |
| `LN-TAINT-HTML-001` | `Tainted<String>` reached `html.render` unsanitised |
| `LN-TAINT-SHELL-001` | `Tainted<String>` reached `shell.exec` |
| `LN-TAINT-LOG-001` | `Tainted<String>` reached `log` without redaction |
| `LN-TAINT-REDIRECT-001` | `Tainted<String>` reached `redirect.url` |

---

## Security Report Fields

Security reports should include:

```text
taint sources found
sensitive sinks found
blocked tainted flows
approved sanitiser boundaries
manual trust overrides
package-provided sanitisers
unresolved taint warnings
```

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Language rule: `Tainted<T>` cannot implicitly coerce to `T` |
| `galerina-core-compiler` | Taint propagation through AST, type checking, sink policy enforcement |
| `galerina-core-security` | `Tainted<T>`, `Trusted<T>`, `Validated<T>`, safe-type primitives, sanitiser contracts |
| `galerina-core-reports` | Taint flow paths in security reports |
| Database/web packages | Sink-specific parameterised APIs |

---

## V1 Implementation Priority

For v1, the compiler should reject the most obvious taint violations:

```text
request/query/body/header → database raw query    (SQL injection)
request/query/body/header → shell execution        (command injection)
request/query/body/header → unsafe HTML render     (XSS)
request/query/body/header → logs without redaction (log injection)
```

Full propagation through generic functions, async boundaries and container
types is post-v1 maturity work.

---

## Important Caveats

- `Tainted<T>` does not automatically make a program secure. It reduces
  injection and unsafe-data-flow bugs when the compiler, standard library
  and sink policies are implemented correctly.
- A value sanitised for one context may be unsafe in another. HTML text
  escaping is not SQL safety.
- Validation does not replace authorisation. A parsed `UserId` may be
  syntactically valid but still unauthorised.
- If the safe path is harder than the unsafe one, developers will bypass it.
  Galerina should make the safe path shorter.
