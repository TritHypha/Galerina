# Hello World API Pattern

## Status

```
Status: Active — canonical beginner example
Scope:  data / flow / permission / route / report pattern; v1 prefers explicit form
Note:   Uses ctx: RequestContext — see request-context-keyword.md for naming convention
See also: galerina-code-examples-full-flow.md, model-views-and-data-blocks.md, request-context-keyword.md
```

## Purpose

The Hello World API pattern shows the beginner-facing Galerina model using:

```text
data
flow
permission
route
report
```

## Explicit Version

```galerina
data Hello {
  request get {
    // No request body needed
  }

  view response {
    message: String view: public
  }
}

permission public_read {
  actor allow anonymous

  code {
    allow audit.write
    deny db.read
    deny db.write
    deny network.external
    deny file.write
    deny secret.read
  }

  data {
    allow expose view: public
  }

  audit optional event "hello.read"
}

flow sayHello(
  request: Hello.get,
  ctx: RequestContext
) -> Result<Hello.response, ApiError>
  permission use public_read
{
  return Ok(Hello.response {
    message: "Hello World"
  })
}

route GET "/hello" {
  request Hello.get
  response Hello.response
  flow sayHello
}
```

## Meaning

```text
data Hello             = input and output shape
request get            = no request body
view response          = public output
permission public_read = public read-only authority
flow sayHello          = execution logic
route GET "/hello"     = API entry point
```

## Response

```json
{
  "message": "Hello World"
}
```

## Shorter Future Form

Galerina may later support a shorter beginner form after safe defaults are stable:

```galerina
data Hello {
  view response {
    message: String view: public
  }
}

flow sayHello() -> Hello.response {
  return Hello.response {
    message: "Hello World"
  }
}

route GET "/hello" {
  response Hello.response
  flow sayHello
}
```

## Safe Default Requirements

The shorter form is only acceptable if Galerina applies safe defaults:

```text
anonymous allowed only for public data
no database access
no file access
no external network access
no secret access
public response only
report generated
```

## v1 Position

V1 should prefer the explicit version. Short syntax can come later after default
permissions and reports are stable.
