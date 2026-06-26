# API Response and Error Handling Style

Galerina should support both readable `try`/`catch` style and explicit `match`
style for `Result<T, E>` values.

Core rule:

```text
try/catch = simple readable application flow
match     = explicit branch-by-branch logic
```

Neither should become legacy because of photonic, GPU, AI accelerator or future
hardware support. Future targets should affect how Galerina compiles internally,
not force developers to rewrite clear source code.

## Result Type Meaning

`Result<T, E>` means:

```text
T = the success type
E = the error type
```

Example:

```Galerina
Result<Order, OrderError>
```

Meaning:

```text
If it works: returns Order
If it fails: returns OrderError
```

A more readable mental model is:

```text
Result<SuccessType, ErrorType>
```

`T` is just a common programming placeholder meaning "some type".

## Response Helper Names

Galerina should avoid confusing names such as:

```text
Response
Responses
```

because they look too similar while meaning different things.

Preferred direction:

```text
Http          = framework HTTP response builder
AppResponses  = app response body schemas
```

Example:

```Galerina
return Http.created(
  AppResponses.Order.from(order)
)
```

Meaning:

```text
Use the framework HTTP response builder to return HTTP 201 Created,
with an app-specific Order response body.
```

## HTTP Response Helpers

Galerina does not require `created`.

`Http.created(...)` is a helper for:

```text
HTTP 201 Created
```

It is useful when something new has been created:

```text
new order
new user
new payment record
new uploaded file
new database item
```

Galerina should support common helpers:

```Galerina
Http.ok(...)                 // 200
Http.created(...)            // 201
Http.accepted(...)           // 202
Http.noContent()             // 204
Http.badRequest(...)         // 400
Http.unauthorized(...)       // 401
Http.forbidden(...)          // 403
Http.notFound(...)           // 404
Http.conflict(...)           // 409
Http.unprocessableEntity(...) // 422
Http.serverError(...)        // 500
```

It may also support explicit status building:

```Galerina
return Http.status(201).body(
  AppResponses.Order.from(order)
)
```

For developer readability, keep helpers such as:

```Galerina
Http.ok(...)
Http.created(...)
Http.noContent()
```

## Simple Try/Catch Style

For simple happy-path route actions, `try` can keep the source readable:

```Galerina
export action Orders.createOrder(
  request: Requests.CreateOrderRequest,
  ctx: RequestContext
) -> RouteResult<Http.Response> {

  let order = try Services.OrderService.createOrder(
    userId: ctx.user.id,
    items: request.items,
    deliveryAddress: request.deliveryAddress
  )

  return Http.created(
    AppResponses.Order.from(order)
  )
}
catch error {
  return Error.from(error)
}
```

The corrected shape keeps the success response inside the `try` block only when
the operation it depends on has succeeded:

```Galerina
try {
  return Http.created(
    AppResponses.Order.from(order)
  )
}
catch error {
  return Error.from(error)
}
```

Use this style when:

```text
the route has one normal success path
generic safe error mapping is acceptable
the route contract already limits allowed responses
there are no security-sensitive domain branches
```

## Explicit Match Style

Use `match` when each branch matters:

```Galerina
match result {
  Ok(order) => {
    return Http.created(
      AppResponses.Order.from(order)
    )
  }

  Err(Errors.OrderError.InvalidItems) => {
    return Http.badRequest(
      AppResponses.Error.message("Invalid order items")
    )
  }

  Err(Errors.OrderError.ProductUnavailable) => {
    return Http.conflict(
      AppResponses.Error.message("Product unavailable")
    )
  }

  Err(error) => {
    return Error.from(error)
  }
}
```

`match` is better when:

```text
each error maps to a different HTTP status
the user should receive a specific safe message
the route is security-sensitive
the route changes money, permissions or account state
the compiler should prove every known branch was considered
```

Security does not come from `match` alone. Security comes from the compiler
forcing all possible outcomes to be handled or safely mapped.

## Route Response Contracts

The strongest design is:

```text
Route lists allowed HTTP responses.
match lists handled code branches.
Compiler checks they agree.
```

Example route contract:

```Galerina
POST "/orders" {
  response {
    201: AppResponses.Order
    400: AppResponses.Error
    401: AppResponses.Error
    403: AppResponses.Error
    409: AppResponses.Error
    422: AppResponses.Error
    500: AppResponses.Error
  }

  handler Actions.Orders.createOrder
}
```

Compiler check:

```text
The action cannot return a response that the route did not declare.
```

If the action returns `Http.accepted(...)` but the route did not declare `202`,
the compiler or route checker should fail.

## Full Match Example

```Galerina
export action Orders.createOrder(
  request: Requests.CreateOrderRequest,
  ctx: RequestContext
) -> RouteResult<Http.Response> {

  let result = Services.OrderService.createOrder(
    userId: ctx.user.id,
    items: request.items,
    deliveryAddress: request.deliveryAddress
  )

  match result {
    Ok(order) => {
      return Http.created(
        AppResponses.Order.from(order)
      )
    }

    Err(Errors.AuthError.NotLoggedIn) => {
      return Http.unauthorized(
        AppResponses.Error.message("You must be logged in to create an order.")
      )
    }

    Err(Errors.AuthError.NotAllowed) => {
      return Http.forbidden(
        AppResponses.Error.message("You do not have permission to create this order.")
      )
    }

    Err(Errors.OrderError.InvalidItems) => {
      return Http.badRequest(
        AppResponses.Error.message("The order contains invalid items.")
      )
    }

    Err(Errors.OrderError.ProductUnavailable) => {
      return Http.conflict(
        AppResponses.Error.message("One or more products are unavailable.")
      )
    }

    Err(Errors.OrderError.InvalidDeliveryAddress) => {
      return Http.unprocessableEntity(
        AppResponses.Error.message("The delivery address is not valid.")
      )
    }

    Err(Errors.DatabaseError.ConnectionFailed) => {
      return Http.serverError(
        AppResponses.Error.message("The order could not be created at this time.")
      )
    }

    Err(error) => {
      return Error.from(error)
    }
  }
}
```

## Best Style

For simple actions:

```Galerina
let order = try Services.OrderService.createOrder(...)

return Http.created(
  AppResponses.Order.from(order)
)
```

For security-sensitive or complex actions:

```Galerina
match result {
  Ok(order) => return Http.created(AppResponses.Order.from(order))
  Err(Errors.OrderError.InvalidItems) => return Http.badRequest(...)
  Err(Errors.OrderError.ProductUnavailable) => return Http.conflict(...)
  Err(error) => return Error.from(error)
}
```

Simple rule:

```text
Use try/catch for simple happy-path code.
Use match when every possible result matters.
Use route response contracts for security enforcement.
```

## Compiler And Report Requirements

Galerina should report:

```text
unhandled Result values
non-exhaustive match over known error variants
responses returned by handler but not declared by route
declared route responses that no branch can return
unsafe raw error messages sent to users
generic Error.from fallback on high-risk routes without audit policy
```

Generated reports:

```text
app.route-response-report.json
app.error-mapping-report.json
app.api-contract-report.json
```

## Non-Goals

This guidance should not:

```text
make try/catch legacy
make match mandatory for every route
force developers to write hardware-specific error handling
expose raw internal errors to users
allow handlers to return undeclared HTTP statuses
```

Galerina should keep simple code simple and make complex, security-sensitive code
explicit.
