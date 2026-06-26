# Galerina Debug Console

This document defines a safer, structured debugging console system for **Galerina / Galerina**.

Galerina should support a developer-friendly console, but it should be safer and more structured than raw JavaScript `console.log()`.

---

## Purpose

The console system should help developers inspect code during Run Mode and Dev Mode while still respecting Galerina's security, memory and source-map rules.

Core rule:

```text
Console debugging is aLOwed in Run Mode and Dev Mode.
Production builds should warn, strip or restrict console debug calls unless explicitly aLOwed.
```

---

## Suggested Syntax

Basic log:

```Galerina
console.log("Order received", order.id)
```

Current source location:

```Galerina
console.here()
```

Debug-only log:

```Galerina
console.debug("Payment state", payment.status)
```

Visible local variables:

```Galerina
console.scope()
```

Alias:

```Galerina
console.vars()
```

---

## Example

```Galerina
secure flow createOrder(input: CreateOrderRequest) -> Result<Order, OrderError> {
  let orderId: OrderId = generateOrderId()
  let total: Money<GBP> = calculateTotal(input.items)
  let status: PaymentStatus = Pending

  console.here()
  console.scope()

  return Ok(Order {
    id: orderId
    total: total
    status: status
  })
}
```

Possible output:

```text
[debug] src/services/order-service.spore:6
flow: createOrder

locals:
  input: CreateOrderRequest = { customerId: "cus_123", items: 2, currency: "GBP" }
  orderId: OrderId = "ord_789"
  total: Money<GBP> = "120.00"
  status: PaymentStatus = Pending
```

---

## Console Functions

Recommended functions:

```Galerina
console.log(message, value)
console.info(message, value)
console.warn(message, value)
console.error(message, value)
console.debug(message, value)

console.here()
console.flow()
console.scope()
console.vars()
console.dump(value)
console.trace()
```

`console.scope()` and `console.vars()` may be aliases.

---

## Source Location Output

`console.here()` should output:

```text
file: src/services/order-service.spore
line: 42
column: 7
flow: createOrder
```

If not inside a flow:

```text
file: boot.spore
line: 12
column: 1
flow: null
```

Console output should respect source maps so generated JavaScript, WebAssembly or native output can still point back to original `.spore` source.

---

## Scope Output

`console.scope()` should show visible local variables in the current flow.

Rules:

```text
show file, line and flow name
show visible local variable names
show type where known
summarise large values
redact secrets
avoid full dumps by default
respect source maps
```

---

## Secret Redaction

`SecureString` values must be redacted.

Example:

```Galerina
let apiKey: SecureString = env.secret("API_KEY")

console.scope()
```

Output:

```text
apiKey: SecureString = [redacted]
```

Console output must not leak:

```text
SecureString
API keys
payment tokens
session secrets
private keys
raw webhook secrets
environment secret values
```

---

## Large JSON Summaries

Large JSON should be summarised by default.

Example:

```Galerina
let payload: Json = req.json()

console.scope()
```

For a 500kb payload, do not print the whole JSON by default.

Better output:

```text
payload: Json = {
  size: "500kb",
  nodes: 8200,
  compact: false,
  borrowed: true,
  preview: "{ id: ..., type: ... }"
}
```

---

## Explicit Dumps

Full or larger dumps should be explicit:

```Galerina
console.dump(payload, limit: 10kb)
```

or:

```Galerina
console.dump(payload, mode: "full")
```

Rules:

```text
full dumps are blocked for secrets
large dumps should warn
production dumps should be denied unless explicitly aLOwed
dump output should be size-limited by default
AI reports must not include raw secret dumps
```

---

## Configuration

Example:

```Galerina
debug {
  console true
  console_scope true
  redact_secrets true
  max_dump_size 10kb
  production_console "warn"
}
```

ALOwed `production_console` modes:

```text
strip
warn
error
aLOw
```

Recommended defaults:

```text
Run Mode      = allow console with redaction
Dev Mode      = allow console with redaction
Build Mode    = warn on debug console
Secure Mode   = error or strip debug console
Browser target = never include secrets, always source-map
```

---

## Compiler Checks

Galerina should check:

```text
console.scope is not enabled in production unless aLOwed
console.dump full is not used on SecureString
console output redacts secrets
large JSON dumps are size-limited
browser console output does not contain server secrets
source maps are available for console.here
debug-only logs are stripped or gated in production
```

Example warning:

```text
galerina-WARN-CONSOLE-001: console.scope() is enabled in production build.
```

Example error:

```text
galerina-ERR-CONSOLE-001: console.dump() cannot print SecureString.
```

---

## Report Output

Galerina should include console usage in reports.

Example:

```json
{
  "console": {
    "calls": 4,
    "scopeCalls": 1,
    "dumpCalls": 1,
    "redaction": true,
    "productionPolicy": "warn",
    "diagnostics": [
      {
        "code": "galerina-WARN-CONSOLE-001",
        "source": "src/orders/create-order.spore:6",
        "message": "console.scope() is development-only by default."
      }
    ]
  }
}
```

---

## Non-Goals

The Galerina debug console should not:

```text
behave like unrestricted JavaScript console.log
print secrets
dump huge JSON by default
hide source locations
ignore source maps
ship verbose debug output in secure production builds by default
write raw secrets into AI reports
```

---

## Recommended Early Version

Version 0.1:

```text
document console functions and safety policy
parse console calls as normal flow statements
warn on console.scope in production planning
redact SecureString in planned report output
```

Version 0.2:

```text
add source-mapped console report
add console.dump size limit policy
add browser target console restrictions
```

Version 0.3:

```text
strip or gate debug logs in secure builds
integrate console output with runtime debugger
```

---

## Final Rule

```text
Console debugging should be simple in development.
Console debugging should be structured, source-mapped and redacted.
Production builds should warn, strip or restrict debug console calls.
```
