# Why Controllers Are Not Core Galerina

## Recommendation

Galerina should not require traditional MVC controllers.

The secure core should be route-first and contract-first:

```text
Routes define the public contract.
Actions or handlers do the work.
Policies define security.
Effects define what the route is allowed to touch.
Reports explain everything.
```

Controller-style grouping may be supported later as optional framework sugar,
but it must compile into the same secure route graph and must not hide auth,
CSRF, object access, permissions, validation, limits, idempotency, audit or
effects.

## Preferred Model

Use this structure:

```text
Route Contract
  -> Security Policy
  -> Request Type
  -> Handler / Action
  -> Allowed Effects
  -> Response Type
  -> Generated Report
```

Preferred names:

```text
route    = public HTTP/API contract
action   = function that performs route work
handler  = runtime entry point bound to the route
policy   = security and permission rules
effect   = what the route is allowed to access
resource = domain object such as Order, User or Payment
```

## Route Example

```galerina
route POST "/orders/{orderId: UUID}/cancel" {
  auth required
  csrf required
  audit required

  body CancelOrderRequest
  response CancelOrderResponse

  object_access {
    resource Order
    id orderId
    rule "user owns order OR user is admin"
  }

  effects {
    database ["orders.read", "orders.write"]
    network []
    files []
  }

  limits {
    timeout 2s
    max_body_size 32kb
  }

  handler cancelOrder
}
```

Handler example:

```galerina
action cancelOrder(request: CancelOrderRequest, ctx: RequestContext)
  -> Result<CancelOrderResponse, OrderError>
{
  let order = Orders.find(request.orderId)

  match order {
    None => return Err(OrderNotFound)

    Some(value) => {
      value.cancel()
      Orders.save(value)

      return Ok(CancelOrderResponse {
        status: "cancelled"
      })
    }
  }
}
```

The route declares the security, request shape, response shape, object-access
rule, allowed effects, limits and handler binding in one inspectable place.

## Why Controllers Are Not Ideal For Core Galerina

Traditional controllers can hide important security behavior across:

```text
middleware
route files
annotations
base controllers
service providers
framework config
inherited methods
```

That makes it harder for the compiler, security tools, AI assistants and humans
to answer:

```text
Does this route require auth?
Does it require CSRF?
Can this user access this object?
Is DELETE allowed?
Is this audited?
Can this handler write to the database?
Can this handler call the network?
Does this response expose private fields?
```

Controllers also tend to grow into large files:

```text
OrderController
  index()
  show()
  create()
  store()
  edit()
  update()
  delete()
  refund()
  export()
  email()
  adminApprove()
```

That shape is harder for developers, reviewers, AI tools, tests and route
reports to inspect.

## Performance Position

The word "controller" does not make routing faster or slower.

Runtime speed depends on:

```text
route matching
runtime reflection
middleware chains
dynamic dispatch
dependency loading
request parsing
database calls
handler execution
```

Galerina should aim for static route manifests, route graphs or tries that map a
method/path contract directly to a typed handler with known policy and effects.

## Compile-Time Checks

A route-first Galerina app can fail earlier when security is incomplete.

Examples:

```text
POST route without CSRF policy -> compile/check error
Route with user ID but no object_access rule -> compile/check error
Route writes to database without database.write effect -> compile/check error
Financial route without audit/idempotency -> compile/check error
Admin route without role policy -> compile/check error
Handler returns private fields without response filter -> compile/check error
Production public route without timeout/body limit -> compile/check error
```

Controllers usually rely on framework behavior or runtime middleware to catch
many of these issues. Galerina should move the checks into source, compiler,
kernel and report layers.

## Folder Structure

Recommended app shape:

```text
src/
  boot.spore
  main.spore

  routes/
    orders.routes.spore
    users.routes.spore
    payments.routes.spore

  actions/
    orders/
      createOrder.spore
      cancelOrder.spore
      refundOrder.spore

    users/
      getUserProfile.spore
      updateUserEmail.spore

  models/
    Order.spore
    User.spore
    Payment.spore

  policies/
    orderAccess.policy.spore
    userAccess.policy.spore

  schemas/
    requests/
      CreateOrderRequest.spore
      CancelOrderRequest.spore

    responses/
      OrderResponse.spore
      CancelOrderResponse.spore
```

This is easier for humans and AI assistants to understand than one large
controller file.

## Optional Framework Sugar

Frameworks may later support controller-style grouping:

```galerina
controller OrdersController {
  uses routes from "./routes/orders.routes.spore"
  actions from "./actions/orders"
}
```

But this must be organization only. It must compile to the same route graph as
plain routes and actions.

Controllers must not:

```text
hide auth policy
hide CSRF policy
hide object access rules
hide validation
hide effects
hide idempotency
hide audit requirements
add runtime magic that bypasses route reports
be required by Galerina core
```

## Roadmap Note

This belongs in the App Kernel and framework-review roadmap:

```text
Galerina should not require traditional MVC controllers.

The preferred structure is:
- route contracts
- route actions / handlers
- typed request objects
- typed response objects
- policies
- effects
- generated route reports

Controller-style grouping may be supported later as optional framework sugar,
but it must compile into the same secure route graph and must not hide auth,
CSRF, permissions, validation, limits, idempotency, audit or effects.
```

Final rule:

```text
For Galerina, controllers are optional organization.
Secure typed routes are essential.
```
