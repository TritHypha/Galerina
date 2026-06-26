# Galerina — One-Click Governance Fixes

**Status:** Phase 13/14 — IDE feature specification
**Depends on:** [galerina-ide-tooling](galerina-ide-tooling.md), [galerina-semantic-graph-system](galerina-semantic-graph-system.md), `galerina-lsp`

---

## TL;DR

- Every governance diagnostic has a safe, compiler-approved one-click fix
- The compiler identifies the problem, the IDE explains it, the governance engine proposes the fix
- Makes secure and auditable code the easiest code to write

---

## Overview

In most languages, fixing a security or governance problem requires a developer to read documentation, understand the rule, determine the correct fix, and apply it manually. This is slow and error-prone. Developers under time pressure skip the documentation and apply approximate fixes.

Galerina takes the opposite approach. Every governance diagnostic the compiler emits is accompanied by a specific, compiler-approved fix. The IDE presents this fix as a one-click code action. The developer reads the explanation, confirms they understand it, and applies the fix. The result is code that satisfies the governance rule.

The pattern is consistent for every fix:

1. **Problem** — the compiler identifies the violation
2. **Explanation** — the IDE shows what failed, why it matters, and what the fix will do
3. **Proposed fix** — the governance engine generates the exact code change
4. **One-click apply** — the developer confirms; the fix is applied and the project recompiles

The developer is always in control. The fix is never applied silently. The explanation is always shown before the action.

---

## Fix 1: Missing Effect Declaration

### Problem

A flow calls a function that uses `database.write`, but the flow does not declare `database.write` in its effects contract.

### Diagnostic

```
SPORE-EFFECT-002  orders.spore:18

What:   Call to db.insert uses effect database.write, which is not declared in this flow's contract.
Why:    Undeclared effects bypass governance. Callers cannot know what this flow will do.
Fix:    Add database.write to this flow's effects declaration.
```

### IDE Fix (Code Action)

`Add database.write to contract.effects`

### Before

```galerina
flow createOrder(input: CreateOrderRequest) -> Result<OrderId, OrderError>
effects [database.read]
capabilities [orders.create] {
    db.insert(Orders, input) ?
    return Ok(newOrderId)
}
```

### After

```galerina
flow createOrder(input: CreateOrderRequest) -> Result<OrderId, OrderError>
effects [database.read, database.write]
capabilities [orders.create] {
    db.insert(Orders, input) ?
    return Ok(newOrderId)
}
```

---

## Fix 2: Protected Value Returned Without Redaction

### Problem

A flow returns a `UserRecord` that contains a field typed `protected Email`. The flow's trust boundary is `public`. The protected value would cross a boundary to untrusted callers.

### Diagnostic

```
SPORE-PRIVACY-003  users.spore:31

What:   protected Email is present in the return value crossing a public trust boundary.
Why:    Protected values must not be exposed to untrusted callers without redaction.
Fix:    Redact the email field before returning, or restrict this flow to an internal boundary.
```

### IDE Fix (Code Actions — three options)

1. `Redact email before returning`
2. `Update response contract to use RedactedEmail type`
3. `Create exposure policy for this flow`

Applying option 1:

### Before

```galerina
return Ok(UserRecord { id: user.id, email: user.email, createdAt: user.createdAt })
```

### After

```galerina
return Ok(UserRecord { id: user.id, email: redact(user.email), createdAt: user.createdAt })
```

---

## Fix 3: Missing Validation Gate

### Problem

An UNVALIDATED input value flows directly to a governed database sink without passing through a validation step. The value-state checker rejects this.

### Diagnostic

```
SPORE-TAINT-001  registrations.spore:22

What:   UNVALIDATED value email is passed to db.insert, which requires VALIDATED state.
Why:    Inserting unvalidated data creates injection and data quality risks.
        All values must be validated before reaching governed sinks.
Fix:    Insert a validation gate between the input and the db.insert call.
```

### IDE Fix (Code Action)

`Insert validation gate for email before db.insert`

### Before

```galerina
let email = input.email
db.insert(Users, { email: email, ... }) ?
```

### After

```galerina
let email = input.email
let email = validate(email) ?    // VALIDATED
db.insert(Users, { email: email, ... }) ?
```

---

## Fix 4: Missing Context Requirement

### Problem

A flow calls `getUser`, which requires context key `trace_id`. The calling flow does not declare that it provides or requires `trace_id`.

### Diagnostic

```
SPORE-CONTEXT-001  checkout.spore:45

What:   getUser requires context key trace_id. The calling flow does not declare it.
Why:    Distributed tracing requires trace_id on every call so requests can be correlated.
Fix:    Add trace_id to this flow's context.requires declaration.
```

### IDE Fix (Code Action)

`Add trace_id to context.requires`

### Before

```galerina
flow checkout(input: CheckoutRequest, ctx: RequestContext)
    -> Result<CheckoutResult, CheckoutError>
effects [database.write, payment.charge]
capabilities [orders.create, payments.charge] {
    let user = getUser(input.userId, ctx) ?
    ...
}
```

### After

```galerina
flow checkout(input: CheckoutRequest, ctx: RequestContext)
    -> Result<CheckoutResult, CheckoutError>
effects [database.write, payment.charge]
capabilities [orders.create, payments.charge]
context.requires [trace_id] {
    let user = getUser(input.userId, ctx) ?
    ...
}
```

---

## Fix 5: Missing Runtime Audit Requirement

### Problem

A flow performs `payment.charge` on an external target. The governance rules for this project require that flows using `payment.charge` on external targets declare an audit requirement.

### Diagnostic

```
SPORE-AUDIT-002  payments.spore:12

What:   Flow uses payment.charge on an external target without declaring a runtime audit requirement.
Why:    External payment operations are irreversible and must be auditable.
        This project's governance policy requires runtime audit for all external payment flows.
Fix:    Add an audit requirement to this flow's contract.
```

### IDE Fix (Code Action)

`Add audit { require runtime report } to contract`

### Before

```galerina
flow chargeCard(input: ChargeRequest) -> Result<ChargeResult, ChargeError>
effects [payment.charge, network.external]
capabilities [payments.charge] {
    ...
}
```

### After

```galerina
flow chargeCard(input: ChargeRequest) -> Result<ChargeResult, ChargeError>
effects [payment.charge, network.external]
capabilities [payments.charge]
audit {
    require runtime report
} {
    ...
}
```

---

## Fix 6: Missing Type Alias

### Problem

A flow returns a complex type inline without a declared type alias in the contract. The governance style rules for this project require that response types are named.

### Diagnostic

```
SPORE-CONTRACT-005  users.spore:8

What:   Flow returns an unnamed inline type. Contract style requires a named type alias.
Why:    Named types make contracts readable and enable governance tools to reason about
        what this flow returns without inspecting the body.
Fix:    Create a type alias in contract.types and use it as the return type.
```

### IDE Fix (Code Action)

`Create GetUserResult alias in contract.types`

### Before

```galerina
flow getUser(id: UserId) -> Result<{ id: UserId, email: Email, createdAt: Timestamp }, UserError>
```

### After

```galerina
flow getUser(id: UserId) -> Result<GetUserResult, UserError>
contract {
    types {
        GetUserResult = { id: UserId, email: Email, createdAt: Timestamp }
    }
}
```

---

## Fix 7: Missing Event Declaration

### Problem

A flow emits an `OrderCreated` event in its body but does not declare it in the flow's events contract.

### Diagnostic

```
SPORE-EVENT-001  orders.spore:27

What:   Flow emits event OrderCreated but does not declare it in contract.events.
Why:    Event consumers depend on declared events to establish subscriptions.
        Undeclared events cannot be verified or governed.
Fix:    Add emits OrderCreated to this flow's contract.
```

### IDE Fix (Code Action)

`Add emits OrderCreated to contract.events`

### Before

```galerina
flow createOrder(input: CreateOrderRequest) -> Result<OrderId, OrderError>
effects [database.write]
capabilities [orders.create] {
    ...
    emit OrderCreated { orderId: id, customerId: input.customerId }
    return Ok(id)
}
```

### After

```galerina
flow createOrder(input: CreateOrderRequest) -> Result<OrderId, OrderError>
effects [database.write]
capabilities [orders.create]
contract {
    events {
        emits OrderCreated
    }
} {
    ...
    emit OrderCreated { orderId: id, customerId: input.customerId }
    return Ok(id)
}
```

---

## Fix 8: Missing Privacy Rule

### Problem

A flow writes to an audit log but does not declare a privacy rule requiring redaction of email before the write. The privacy policy checker detects that `protected Email` reaches `audit.write` without a declared redaction requirement.

### Diagnostic

```
SPORE-PRIVACY-005  registrations.spore:34

What:   protected Email reaches audit.write without a declared redaction requirement.
Why:    Audit logs are often accessible to more actors than the flow that writes them.
        Personal data must be redacted before audit writes to limit exposure.
Fix:    Add a privacy rule requiring redaction before audit.write, and apply redact() at the call site.
```

### IDE Fix (Code Action)

`Add privacy.require redaction before audit.write + redact(email)`

### Before

```galerina
flow registerUser(input: RegisterRequest) -> Result<UserId, RegistrationError>
effects [database.write, audit.write]
capabilities [users.create] {
    ...
    audit.write({ event: "user.registered", email: input.email })
    return Ok(userId)
}
```

### After

```galerina
flow registerUser(input: RegisterRequest) -> Result<UserId, RegistrationError>
effects [database.write, audit.write]
capabilities [users.create]
privacy {
    handles [protected Email]
    require redaction before audit.write
} {
    ...
    audit.write({ event: "user.registered", email: redact(input.email) })
    return Ok(userId)
}
```

---

## Fix 9: Missing Timeout Declaration

### Problem

A flow makes an outbound network call but does not declare a timeout constraint. The network governance policy requires all outbound calls to declare a timeout.

### Diagnostic

```
SPORE-NETWORK-003  payments.spore:19

What:   Outbound network call to payment gateway has no declared timeout.
Why:    Undeclared timeouts allow calls to block indefinitely, causing resource exhaustion
        and cascading failures in dependent flows.
Fix:    Add a timeout declaration for outbound network calls in this flow's contract.
```

### IDE Fix (Code Action)

`Add timeouts.network.outbound { timeout 5 seconds } to contract`

### Before

```galerina
flow chargeCard(input: ChargeRequest) -> Result<ChargeResult, ChargeError>
effects [payment.charge, network.external]
capabilities [payments.charge] {
    let result = paymentGateway.charge(input) ?
    return Ok(result)
}
```

### After

```galerina
flow chargeCard(input: ChargeRequest) -> Result<ChargeResult, ChargeError>
effects [payment.charge, network.external]
capabilities [payments.charge]
contract {
    timeouts {
        network.outbound { timeout 5 seconds }
    }
} {
    let result = paymentGateway.charge(input) ?
    return Ok(result)
}
```

---

## Fix 10: Missing Retry Policy

### Problem

A flow makes outbound network calls to an external service but has no declared retry policy. The network governance policy requires retry declarations for flows that use `network.external`.

### Diagnostic

```
SPORE-NETWORK-007  notifications.spore:14

What:   Flow uses network.external effect but declares no retry policy.
Why:    External network calls fail transiently. Without a declared retry policy, failures
        are unrecoverable and no backoff strategy is enforced.
Fix:    Add a retry policy for outbound network calls in this flow's contract.
```

### IDE Fix (Code Action)

`Add retries.network.outbound { attempts 3 strategy exponential_backoff } to contract`

### Before

```galerina
flow sendNotification(notification: Notification) -> Result<Unit, NotificationError>
effects [network.external]
capabilities [notifications.send] {
    let result = notificationService.send(notification) ?
    return Ok(unit)
}
```

### After

```galerina
flow sendNotification(notification: Notification) -> Result<Unit, NotificationError>
effects [network.external]
capabilities [notifications.send]
contract {
    retries {
        network.outbound {
            attempts 3
            strategy exponential_backoff
        }
    }
} {
    let result = notificationService.send(notification) ?
    return Ok(unit)
}
```

---

## Governance Quick Fix Panel

The IDE provides a project-wide Governance Quick Fix Panel — a dedicated view listing every active governance diagnostic and its available fixes across the entire project.

```
Governance Quick Fixes                          12 issues

  orders.spore:18     SPORE-EFFECT-002    Add database.write to contract.effects        [Fix]
  users.spore:31      SPORE-PRIVACY-003   Redact email before returning                 [Fix]
  checkout.spore:45   SPORE-CONTEXT-001   Add trace_id to context.requires              [Fix]
  payments.spore:12   SPORE-AUDIT-002     Add audit { require runtime report }          [Fix]
  payments.spore:19   SPORE-NETWORK-003   Add timeout 5 seconds to network.outbound     [Fix]
  ...

  [Fix All Safe]    [Fix All — Review Required]
```

The panel distinguishes between:

- **Safe fixes** — additions that widen no authority and cannot change runtime behaviour (adding a missing declaration that was already required)
- **Review required fixes** — changes that widen authority, change a privacy policy, or alter a runtime audit requirement

`Fix All Safe` applies every safe fix automatically. `Fix All — Review Required` opens each fix for manual confirmation before applying.

---

## AI Integration

When an AI assistant is active in the editor, it receives the AI semantic graph and the current list of governance diagnostics. The assistant can:

- Explain any diagnostic in plain language on request
- Propose the same fixes the IDE proposes, grounded in compiler-verified contract rules
- Generate new flows with correct contract declarations already included, because it reads the capability registry from the graph
- Verify that a proposed fix satisfies the governance rule before presenting it

The AI does not invent fixes. It generates fixes by following the same contract rules the compiler enforces. The result is fixes that pass compilation on the first attempt.

---

## Final Goal

The goal of one-click governance fixes is that governance compliance becomes the path of least resistance.

In a language without this feature, the path of least resistance is to skip governance declarations and add them later — or never. Fixes require reading documentation, understanding rules, and writing boilerplate. The temptation is to defer.

In Galerina, the path of least resistance is to apply the fix the IDE offers. The fix is shown immediately. It is one click. The explanation is visible. The result is correct. Deferring is more effort than complying.

The compiler identifies. The IDE explains. The governance engine proposes. The developer remains in control — but making the right choice is always easier than making the wrong one.

---

## Rules at a Glance

| Rule | Detail |
|---|---|
| Every diagnostic has a fix | No diagnostic is emitted without a corresponding code action |
| Fixes are compiler-approved | All proposed code follows the same rules the compiler enforces |
| Explanation always shown | Developer reads what/why before any fix is applied |
| Developer confirms | No fix is applied silently — one-click means one deliberate action |
| Authority-widening is flagged | Fixes that widen capability or effect are marked review required |
| Panel shows project-wide | Governance Quick Fix Panel lists all fixes across the whole project |
| AI follows compiler rules | AI-proposed fixes are grounded in the semantic graph, not guessed |

---

## See Also

- [galerina-ide-tooling](galerina-ide-tooling.md) — full IDE feature set
- [galerina-ai-semantic-graph-output](galerina-ai-semantic-graph-output.md) — AI graph used by assistants
- [compiler-diagnostics](compiler-diagnostics.md) — full diagnostic code reference
- [galerina-contract-full-model](galerina-contract-full-model.md) — contract syntax and semantics
- [galerina-governance-architecture](galerina-governance-architecture.md) — governance model
- [value-state-checker](value-state-checker.md) — value-state rules and transitions
- [galerina-core-privacy-observability](galerina-contract-privacy-observability.md) — privacy contract rules
- [galerina-core-network-governance](galerina-core-network-governance.md) — network timeout and retry policy
