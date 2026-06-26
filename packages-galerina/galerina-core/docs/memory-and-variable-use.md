# Galerina Memory and Variable Use

This document describes the proposed **Memory and Variable Use** model for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

This feature explains how Galerina should avoid hidden copies of large values, keep local variables safe, and allow efficient read-only sharing without relying on unsafe global variables.

---

## Summary

Galerina should avoid hidden copies of large values.

Large immutable values such as JSON payloads should be passed by safe read-only reference. They should remain local to the owning flow and be cleaned up when no longer needed.

If a value must be modified, Galerina should use explicit mutation rules or copy-on-write.

If a full copy is required, the developer must call:

```Galerina
clone()
```

explicitly.

The core goals are:

```text
no hidden global variables
no repeated 500kb copies
safe local lifetime
fast read-only sharing
explicit copies only
better memory control
```

---

## Core Principle

```text
Large values should be shared safely, not copied silently.
```

Galerina should make memory-heavy behaviour visible.

This means:

```text
read-only use = safe reference
modification = explicit mutation or copy-on-write
full copy = explicit clone()
global storage = denied unless declared in the Strict Global Registry
```

---

## Local Variables by Default

Variables created inside a flow belong to that flow.

Example:

```Galerina
secure flow handleWebhook(req: Request) -> Result<Response, WebhookError> {
  let payload: Json = req.json()

  verifySignature(&payload)
  processWebhook(&payload)

  return JsonResponse({ "received": true })
}
```

In this example:

```text
payload
```

is local to:

```text
handleWebhook
```

When the flow finishes, `payload` can be cleaned up.

---

## No Global Variable Required

Large data should not need to be global to avoid copying.

Bad idea:

```Galerina
global mut CURRENT_PAYLOAD: Json
```

Better:

```Galerina
let payload: Json = req.json()

verifySignature(&payload)
processWebhook(&payload)
```

This keeps the data local but still aLOws efficient reuse.

---

## Large Immutable Values

Large values may include:

```text
JSON payloads
XML payloads
GraphQL responses
large strings
large arrays
binary buffers
matrix data
dataset rows
event batches
```

Galerina should avoid copying these unless the developer explicitly asks for a copy.

---

## Read-Only References

Galerina should allow large immutable values to be passed by read-only reference.

Example:

```Galerina
verifySignature(&payload)
```

The `&payload` means:

```text
borrow payload
read only
do not copy
do not mutate
do not store beyond the owning flow lifetime
```

The called flow receives:

```Galerina
secure flow verifySignature(payload: &Json) -> Result<Void, WebhookError> {
  ...
}
```

---

## Example: 500kb JSON Payload

Example:

```Galerina
secure flow handleWebhook(req: Request) -> Result<Response, WebhookError> {
  let payload: Json = req.json()

  verifySignature(&payload)
  let eventType: String = json.pick<String>(&payload, "$.type")
  let eventId: String = json.pick<String>(&payload, "$.id")

  processEvent(&payload)

  return JsonResponse({ "received": true })
}
```

Memory behaviour:

```text
payload is loaded once
verifySignature reads the same payload
json.pick reads the same payload
processEvent reads the same payload
no repeated 500kb copies are created
payload is cleaned up when handleWebhook ends
```

---

## What Should Not Happen

Galerina should avoid this hidden behaviour:

```text
500kb payload copied into verifySignature()
500kb payload copied into json.pick()
500kb payload copied into processEvent()
500kb payload copied again for logging
```

Hidden copies make memory harder to understand and can damage performance.

---

## Explicit Clone

If the developer really wants a full independent copy, they must call:

```Galerina
clone()
```

Example:

```Galerina
let payloadCopy: Json = payload.clone()
```

This should be treated as a visible memory-heavy action.

Galerina may warn if the cloned value is large.

Example warning:

```text
Memory warning:
Json payload cloned explicitly.

Payload size:
  500kb

Suggestion:
  Use read-only reference, JSON view, copy-on-write, or lazy compact JSON if a full copy is not needed.
```

---

## Copy-On-Write

If a value needs to be modified, Galerina should prefer copy-on-write.

Example:

```Galerina
let payload: Json = req.json()
let safePayload: Json = json.redact(&payload, fields: ["$.token"])
```

Instead of copying the full payload immediately, Galerina may represent this as:

```text
original payload
+ redaction patch
```

The original remains unchanged.

The modified value is only materialised if needed.

---

## Mutation Must Be Explicit

Galerina should not allow accidental mutation of borrowed immutable data.

Invalid:

```Galerina
secure flow processWebhook(payload: &Json) -> Result<Void, WebhookError> {
  payload.set("$.status", "processed")
  return Ok()
}
```

Expected error:

```text
Mutation error:
Cannot modify read-only borrowed Json.

Suggestion:
Use copy-on-write or request a mutable borrow where aLOwed.
```

---

## Mutable Borrow

If mutation is aLOwed, it should be explicit.

Possible syntax:

```Galerina
secure flow updatePayload(payload: &mut Json) -> Result<Void, Error> {
  payload.set("$.status", "processed")
  return Ok()
}
```

Mutable borrowing should be restricted because it can make code harder to reason about.

Rules:

```text
only one mutable borrow at a time
no read-only borrow while mutable borrow is active
mutable borrow cannot outlive the owning flow
```

---

## Read-Only Sharing

Multiple flows should be able to read the same large value safely.

Example:

```Galerina
let payload: Json = req.json()

verifySignature(&payload)
extractMetadata(&payload)
processEvent(&payload)
```

This should mean:

```text
one payload in memory
three safe read-only borrows
no full copies
```

---

## Virtual Variable / Memory Handle Concept

Internally, Galerina may represent large values using a hidden memory handle.

This could be thought of as:

```text
variable name -> safe handle -> memory value
```

For example:

```Galerina
let foo: Json = req.json()

let var1 = &foo
let var2 = &foo
let var3 = &foo
```

Conceptually:

```text
foo  -> handle json_abc123
var1 -> reference to json_abc123
var2 -> reference to json_abc123
var3 -> reference to json_abc123
```

This means:

```text
foo, var1, var2 and var3 can refer to the same underlying value
without duplicating the 500kb JSON payload
```

The handle may internally be represented by a runtime ID, pointer, UUID-like identifier, reference-counted handle, arena reference, or compiler-managed memory slot.

The developer should not normally manage this ID directly.

---

## Important Clarification

This should not behave like an unsafe global variable.

The underlying value is still owned by the current flow or memory region.

The references are only valid while the owner is valid.

Example:

```text
handleWebhook owns payload
verifySignature borrows payload
processEvent borrows payload
handleWebhook ends
payload can be cleaned up
borrowed references become invalid
```

So the idea is closer to:

```text
safe local memory handle
```

not:

```text
global dynamic variable
```

---

## Example Internal Model

Source code:

```Galerina
let foo: Json = req.json()

let var1: &Json = &foo
let var2: &Json = &foo
let var3: &Json = &foo
```

Possible internal model:

```json
{
  "variables": {
    "foo": {
      "kind": "owner",
      "handle": "json_abc123",
      "type": "Json",
      "scope": "handleWebhook"
    },
    "var1": {
      "kind": "borrow",
      "handle": "json_abc123",
      "mode": "read"
    },
    "var2": {
      "kind": "borrow",
      "handle": "json_abc123",
      "mode": "read"
    },
    "var3": {
      "kind": "borrow",
      "handle": "json_abc123",
      "mode": "read"
    }
  }
}
```

Only one underlying JSON value exists.

---

## Ownership

Every large value should have an owner.

Example:

```Galerina
let payload: Json = req.json()
```

Here:

```text
payload
```

owns the JSON value.

Borrowed references do not own it.

Example:

```Galerina
verifySignature(&payload)
```

The called flow can read the value, but it does not own it.

---

## Lifetime

Borrowed references should not outlive the owning value.

Invalid concept:

```Galerina
let savedRef: &Json

secure flow handleWebhook(req: Request) -> Result<Response, WebhookError> {
  let payload: Json = req.json()

  savedRef = &payload

  return JsonResponse({ "received": true })
}
```

Expected error:

```text
Lifetime error:
Borrowed reference to payload cannot escape handleWebhook.

Reason:
payload is local to handleWebhook and will be cleaned up when the flow ends.
```

---

## Safe Local Lifetime

A local value should be available only while its owning scope is active.

Example:

```Galerina
secure flow handleWebhook(req: Request) -> Result<Response, WebhookError> {
  let payload: Json = req.json()

  processEvent(&payload)

  return JsonResponse({ "received": true })
}
```

After `handleWebhook` returns:

```text
payload is no longer accessible
borrowed references are invalid
memory can be reclaimed
```

---

## Function Parameters

Large parameters should usually be received by reference when they are read-only.

Good:

```Galerina
secure flow processEvent(payload: &Json) -> Result<Void, WebhookError> {
  ...
}
```

Less efficient if it implies a copy:

```Galerina
secure flow processEvent(payload: Json) -> Result<Void, WebhookError> {
  ...
}
```

Galerina could choose one of two designs:

```text
explicit reference syntax required for large values
or
compiler automatically passes large immutable values by safe reference
```

Recommended early design:

```text
Use explicit `&` syntax for clarity.
Compiler may optimise obvious cases.
```

---

## Move Semantics

Sometimes a value should be moved instead of borrowed.

Example:

```Galerina
consumePayload(payload)
```

If `consumePayload` takes ownership, the original should not be usable afterwards.

Invalid:

```Galerina
let payload: Json = req.json()

consumePayload(payload)

processEvent(&payload)
```

Expected error:

```text
Move error:
payload was moved into consumePayload and cannot be used again.
```

---

## Borrow vs Move vs Clone

| Action | Meaning | Memory Cost |
|---|---|---|
| `&payload` | Read-only borrow | Low |
| `&mut payload` | Mutable borrow | Low, controlled |
| `payload` moved | Ownership transferred | Low, original no longer usable |
| `payload.clone()` | Full independent copy | High |
| `json.redact(&payload)` | Copy-on-write / patch | Medium or low |
| `payload.view("$.items")` | View into original | Low |

---

## JSON Views

Galerina should support views into large JSON.

Example:

```Galerina
let customer = payload.view("$.customer")
let items = payload.view("$.items")
```

A view should mean:

```text
reference part of the original JSON
do not copy the whole payload
decode only when needed
```

---

## Partial JSON Decode

Galerina should allow extracting small typed values from a larger JSON payload.

Example:

```Galerina
let eventType: String = json.pick<String>(&payload, "$.type")
let eventId: String = json.pick<String>(&payload, "$.id")
```

This avoids decoding or copying the full payload when only a few fields are needed.

---

## Lazy Compact JSON Integration

If JSON is modified, duplicated, or behaves like a repeated dataset, Galerina may switch to Lazy Compact JSON.

Example:

```text
small read-only JSON
  -> normal representation

large read-only JSON
  -> borrowed reference

large duplicated JSON
  -> copy pressure check

dataset-style JSON
  -> repeated node shape detection

modified JSON
  -> copy-on-write or compact representation
```

This connects memory and variable use with JSON-specific optimisation.

---

## Memory Report

Galerina should report hidden-copy prevention and explicit large clones.

Example:

```json
{
  "memoryUse": {
    "largeValues": [
      {
        "name": "payload",
        "type": "Json",
        "source": "src/webhooks/payment-webhook.spore:8",
        "size": "500kb",
        "owner": "handleWebhook",
        "borrowCount": 3,
        "cloneCount": 0,
        "copyAvoided": true
      }
    ]
  }
}
```

---

## Clone Warning Report

```json
{
  "memoryWarnings": [
    {
      "type": "LargeClone",
      "value": "payload",
      "source": "src/webhooks/payment-webhook.spore:14",
      "size": "500kb",
      "message": "Large Json value cloned explicitly.",
      "suggestion": "Use read-only reference, JSON view, copy-on-write or Lazy Compact JSON if a full copy is not required."
    }
  ]
}
```

---

## AI Guide Integration

The AI guide should explain large value behaviour.

Example:

```markdown
## Memory and Variable Use

Large JSON payloads are borrowed by read-only reference.

Flow:
`handleWebhook`

Large values:

- `payload: Json`
  - source: `src/webhooks/payment-webhook.spore:8`
  - owner: `handleWebhook`
  - borrow count: 3
  - clone count: 0
  - hidden copies avoided: yes

AI note:
Do not replace read-only borrows with `clone()` unless an independent copy is required.
```

---

## Security Benefits

This model improves security because:

```text
large request data does not need to become global
secrets stay local where possible
borrowed values cannot outlive their owner
read-only references prevent accidental mutation
explicit clone makes copies auditable
copy-on-write preserves original data
source maps can show where large values are used
```

---

## Performance Benefits

This model improves performance because:

```text
large values are not copied repeatedly
read-only borrowing is cheap
copy-on-write avoids full copies
JSON views avoid full decoding
partial decode avoids unnecessary work
the compiler can optimise local lifetimes
memory reports can detect expensive clones
```

---

## Compiler Checks

Galerina should detect:

```text
large hidden copies
large explicit clones
borrowed references escaping their owner
mutation through read-only references
multiple mutable borrows
unsafe global assignment
large JSON passed by value where reference is expected
```

---

## Example Compiler Warning: Large Clone

```text
Memory warning:
Large Json value cloned.

Value:
  payload

Estimated size:
  500kb

Original source:
  src/webhooks/payment-webhook.spore:18:21

Suggestion:
  Use &payload for read-only access or json.redact(&payload) for copy-on-write redaction.
```

---

## Example Compiler Error: Borrow Escape

```text
Lifetime error:
Borrowed Json reference escapes owning flow.

Owner:
  payload in handleWebhook

Original source:
  src/webhooks/payment-webhook.spore:22:3

Suggestion:
  Return an owned value, clone explicitly, or keep the reference inside the owning flow.
```

---

## Example Compiler Error: Read-Only Mutation

```text
Mutation error:
Cannot mutate read-only borrowed Json.

Original source:
  src/webhooks/payment-webhook.spore:16:5

Suggestion:
  Use copy-on-write or request a mutable borrow.
```

---

## Recommended Syntax

Read-only borrow:

```Galerina
&payload
```

Mutable borrow:

```Galerina
&mut payload
```

Explicit clone:

```Galerina
payload.clone()
```

JSON view:

```Galerina
payload.view("$.items")
```

Partial decode:

```Galerina
json.pick<String>(&payload, "$.type")
```

Copy-on-write modification:

```Galerina
json.redact(&payload, fields: ["$.token"])
```

---

## Recommended Rules

```text
Local variables stay local.
Large immutable values are borrowed.
Borrowed values are read-only by default.
Mutable access must be explicit.
Full copies require clone().
Borrowed references cannot outlive owners.
Large clones should be reported.
Request data should not become global.
Secrets should not be cloned or cached casually.
```

---

## Non-Goals

This memory model should not:

```text
force every value to use manual memory syntax
make simple small values complicated
turn local values into globals
allow unsafe pointer-style access
hide large clones
allow borrowed data to escape its owner
weaken strict JSON validation
```

---

## Open Questions

```text
Should large immutable values automatically pass by reference?
Should explicit & syntax be required for all borrows?
Should Json be read-only by default?
Should clone() require a warning for values over a configured size?
Should Galerina use reference counting internally?
Should Galerina use arena aLOcation for request-scoped data?
Should memory handles appear in reports only or be visible in debugging?
Should copy-on-write be automatic for all Json mutations?
```

---

## Recommended Early Version

Version 0.1:

```text
define local lifetime rules
define read-only borrow syntax
define explicit clone rule
warn on large clone
document no hidden copies
```

Prototype status:

```text
implemented: warning on explicit Json.clone()
implemented: error on mutation through read-only &Json parameter
planned: borrow escape checks
planned: large value size estimation
planned: memory report integration for clone counts and borrow counts
```

Version 0.2:

```text
add JSON views
add partial decode guidance
add borrow escape checks
add read-only mutation checks
```

Version 0.3:

```text
add memory reports
add AI guide memory summaries
add clone/copy pressure warnings
```

Version 0.4:

```text
integrate with Lazy Compact JSON
add copy-on-write optimisation
add request-scoped memory regions
```

---

## Final Principle

Galerina should make large value memory use safe, clear and efficient.

Final rule:

```text
No hidden large copies.
No unsafe globals.
Borrow read-only when possible.
Modify through explicit rules.
Clone only when requested.
Clean up when the owning flow ends.
```

This gives Galerina:

```text
no global variable dependency
no repeated 500kb copies
safe local lifetime
fast read-only sharing
explicit copies only
better memory control
```
