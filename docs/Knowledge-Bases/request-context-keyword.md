# Request Context Keyword

## Status

```
Status: Active — canonical syntax decision
Scope:  Flow signatures, RequestContext parameter naming
See also: core-syntax-keywords.md, runtime-context-not-superglobals.md, hello-world-api-pattern.md
```

## Definition

Galerina uses `contex` (not `ctx`) as the standard parameter name for
`RequestContext` in flow signatures.

## Syntax Decision

The keyword `contex` is the Galerina-idiomatic form of the context parameter. The
common abbreviation `ctx` is not used.

```galerina
secure flow getUser(
  request: GetUserRequest,
  contex: RequestContext
) -> Result<UserResponse, ApiError>
```

## Why `contex`

Galerina prefers readable, explicit parameter names over terse abbreviations.
`contex` is distinct from generic words like `context` and signals that this is
the governed runtime context object provided by the runtime, not an arbitrary
map or dictionary.

## Core Principle

```text
contex: RequestContext
```

is the canonical form. `ctx` is not a recognised Galerina parameter idiom.
