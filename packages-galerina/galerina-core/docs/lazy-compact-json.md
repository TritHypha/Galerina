# Galerina Lazy Compact JSON

This document describes the proposed **Lazy Compact JSON** model for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

Lazy Compact JSON is designed to reduce memory use when working with large JSON payloads, repeated JSON datasets, copied JSON structures and modified JSON values.

---

## Summary

Galerina should not automatically duplicate large JSON payloads when passing them between flows.

A JSON payload should normally be:

```text
loaded once
kept local to the owning flow
passed by safe read-only reference
cleaned up when no longer needed
```

Compact JSON conversion should only happen when it is useful.

The recommended rule is:

```text
Do not compact JSON immediately.
Borrow read-only JSON.
Check before copying.
Compact only if JSON is modified, duplicated, patched, or has repeated dataset-like structure.
```

---

## Core Principle

```text
Read-only JSON should be borrowed.
Small JSON should stay simple.
Dataset-style JSON should be checked for repeated node shapes.
Modified or duplicated JSON should be checked before copying.
Compact only when the memory saving is worthwhile.
```

---

## Problem

A large JSON payload may be around:

```text
500kb
```

If the code passes it into several flows, Galerina should not create multiple 500kb copies.

Bad memory behaviour:

```text
payload copy 1 -> verifyWebhook()
payload copy 2 -> extractEventType()
payload copy 3 -> processEvent()
payload copy 4 -> redactPayload()
```

Good Galerina behaviour:

```text
payload loaded once
flows borrow it by reference
only modified, duplicated or dataset-like versions are checked for compact conversion
```

---

## Read-Only JSON Behaviour

Example:

```Galerina
secure flow handleWebhook(req: Request) -> Result<Response, WebhookError> {
  let payload: Json = req.json()

  verifySignature(&payload)
  let eventType: String = json.pick<String>(&payload, "$.type")
  processEvent(&payload)

  return JsonResponse({ "received": true })
}
```

Memory behaviour:

```text
payload is loaded once
verifySignature reads it by reference
json.pick reads it by reference
processEvent reads it by reference
no full copy is created
no compact conversion is required
```

---

## Borrowing Rule

Large immutable JSON values should be passed by safe reference.

Example:

```Galerina
verifySignature(&payload)
```

Meaning:

```text
borrow payload
read only
do not copy
do not mutate
do not store beyond the owning flow lifetime
```

---

## When Compact Conversion Should Happen

Compact conversion should be considered only when one of these happens:

```text
JSON is modified
JSON is duplicated
JSON is patched
JSON is redacted into a new value
JSON is transformed into another structure
JSON has repeated dataset-like node shapes
JSON is repeatedly accessed in memory-heavy ways
JSON exceeds a configured node threshold and would otherwise be copied
```

---

## Lazy Conversion Rule

```text
Galerina should run a memory/copy/repeated-shape check before converting JSON into compact form.
```

If the check passes:

```text
keep normal representation
```

If the check fails:

```text
convert to compact schema-backed representation
```

---

## What "Check Fails" Means

A check should fail when Galerina estimates that normal JSON handling would be inefficient or risky.

Possible reasons:

```text
payload has many nodes
payload has many repeated keys
payload has repeated object shapes
payload behaves like a dataset
payload would be duplicated
payload would be patched several times
payload would exceed copy budget
estimated compact saving is high enough
```

This does not mean the application failed.

It means:

```text
normal JSON representation is no longer the best internal representation
```

---

## Small JSON Should Not Compact

Example:

```json
{
  "id": "foo",
  "name": "moo"
}
```

This should not be compacted by default.

Reason:

```text
too small
no repeated node shape
schema overhead is not worth it
normal representation is fine
```

---

## Repeated Node Shape Detection

Lazy Compact JSON should be most useful when JSON behaves like a dataset.

A repeated node element means the JSON contains the same object keys or same object shape many times.

Example:

```json
[
  { "id": "1", "name": "A", "status": "active" },
  { "id": "2", "name": "B", "status": "active" },
  { "id": "3", "name": "C", "status": "active" }
]
```

These objects all share the same node shape:

```text
id, name, status
```

Galerina can store that shape once and then store each row using compact field references.

---

## Dataset Detection Rule

Galerina should only consider compact conversion when the payload has enough repeated structure.

Example policy:

```Galerina
json_policy {
  compact {
    mode "lazy"

    trigger [
      "modified",
      "duplicated",
      "patched",
      "copy_pressure",
      "repeated_node_shapes"
    ]

    repeated_node_shapes {
      enabled true
      min_shape_reuse 5
      min_matching_keys 3
      min_dataset_nodes 100
      min_saving "20%"
    }

    key_interning true
    string_interning true
    shape_detection true
    copy_on_write true
  }
}
```

Meaning:

```text
min_shape_reuse 5
  The same object shape must appear at least 5 times.

min_matching_keys 3
  At least 3 keys must match in the repeated shape.

min_dataset_nodes 100
  The JSON must have enough total nodes to behave like a dataset.

min_saving 20%
  Galerina should only compact if estimated memory saving is worthwhile.
```

---

## Dataset JSON Should Compact

Example:

```json
[
  { "id": "1", "name": "A", "status": "active" },
  { "id": "2", "name": "B", "status": "active" },
  { "id": "3", "name": "C", "status": "active" },
  { "id": "4", "name": "D", "status": "active" },
  { "id": "5", "name": "E", "status": "active" }
]
```

If the shape repeats enough times, Galerina may internally represent it as:

```text
schema:
  1 = id
  2 = name
  3 = status

rows:
  ["1", "A", "active"]
  ["2", "B", "active"]
  ["3", "C", "active"]
  ["4", "D", "active"]
  ["5", "E", "active"]
```

The field names are stored once.

---

## Why This Saves Memory

JSON can waste memory when many objects repeat the same keys.

Example repeated keys:

```text
id
name
status
createdAt
updatedAt
customerId
orderId
```

If these appear hundreds or thousands of times, Galerina can store the keys once and refer to them by compact IDs.

This can reduce memory use for:

```text
large imports
bulk API requests
webhook batches
data exports
JSON datasets
event arrays
logs
analytics payloads
```

---

## Compact JSON Features

Lazy Compact JSON may use:

```text
key interning
string interning
shape detection
schema maps
copy-on-write patches
compact arrays
typed partial decoding
schema hashes
```

---

## Key Interning

Key interning stores repeated keys once.

Example:

```text
1 = customerId
2 = orderId
3 = status
4 = total
```

Instead of repeatedly storing:

```text
"customerId"
"orderId"
"status"
"total"
```

Galerina can store compact key references internally.

---

## String Interning

String interning may store repeated string values once.

Example repeated value:

```json
"status": "active"
```

If `"active"` appears thousands of times, Galerina may store it once and refer to it internally.

String interning should be used carefully with sensitive values.

Secret values must not be interned into unsafe shared memory.

---

## Shape Detection

Shape detection identifies repeated object structures.

Example:

```json
{
  "id": "1",
  "name": "A",
  "status": "active"
}
```

and:

```json
{
  "id": "2",
  "name": "B",
  "status": "active"
}
```

have the same shape:

```text
id, name, status
```

Galerina can store this shape once.

---

## Schema Map Example

```json
{
  "schemaHash": "sha256:...",
  "keys": {
    "1": "id",
    "2": "name",
    "3": "status",
    "4": "createdAt"
  },
  "shapes": {
    "shape_1": ["1", "2", "3"]
  }
}
```

This schema map should be internal unless exported for debugging.

---

## Copy-On-Write

If JSON is modified, Galerina should avoid copying everything immediately.

Example:

```Galerina
let payload: Json = req.json()
let safePayload: Json = json.redact(&payload, fields: ["$.token"])
```

Instead of copying the full payload, Galerina can represent this as:

```text
original payload
+ redaction patch
```

Only if a full output is needed does Galerina materialise the final JSON.

---

## Modification Example

```Galerina
secure flow handleWebhook(req: Request) -> Result<Response, WebhookError> {
  let payload: Json = req.json()

  let safePayload: Json = json.redact(&payload, fields: ["$.token"])

  log.info("Safe payload", safePayload)

  return JsonResponse({ "received": true })
}
```

Memory behaviour:

```text
payload loaded once
safePayload is a patch/view if possible
Galerina checks whether a full copy is needed
if check fails, Galerina converts to compact representation
```

---

## Duplication Example

```Galerina
let payload: Json = req.json()

let copyA: Json = payload.clone()
let copyB: Json = payload.clone()
```

For small JSON, this may be acceptable.

For large JSON, Galerina should run a copy-pressure check.

If the check fails:

```text
use compact schema-backed representation
avoid repeated full copies
track copy-on-write versions
```

---

## Explicit Clone Rule

Full copies should be explicit.

```Galerina
let payloadCopy: Json = payload.clone()
```

Galerina should not silently create large clones.

If cloning a large JSON payload is expensive, the compiler/runtime should warn or compact internally.

---

## Suggested JSON Policy

```Galerina
json_policy {
  max_body_size 1mb
  max_depth 32
  duplicate_keys "deny"

  compact {
    mode "lazy"

    node_threshold 1000
    repeated_key_threshold 5
    min_saving "20%"

    trigger [
      "modified",
      "duplicated",
      "patched",
      "copy_pressure",
      "repeated_node_shapes"
    ]

    repeated_node_shapes {
      enabled true
      min_shape_reuse 5
      min_matching_keys 3
      min_dataset_nodes 100
      min_saving "20%"
    }

    key_interning true
    string_interning true
    shape_detection true
    copy_on_write true
  }
}
```

---

## Compact Modes

Recommended modes:

```text
off
auto
lazy
force
```

### `off`

No compact conversion.

```Galerina
compact {
  mode "off"
}
```

### `auto`

Galerina may compact large JSON during parsing if it is obviously beneficial.

```Galerina
compact {
  mode "auto"
}
```

### `lazy`

Galerina waits until modification, duplication, repeated node shapes or copy pressure happens.

```Galerina
compact {
  mode "lazy"
}
```

Recommended default:

```text
lazy
```

### `force`

Always use compact representation where possible.

```Galerina
compact {
  mode "force"
}
```

Useful for very large imports or known repetitive data.

---

## Recommended Default

```text
compact mode = lazy
```

Reason:

```text
small JSON stays simple
read-only JSON stays cheap
dataset-style JSON can be optimised
large modified JSON gets optimised
duplicated JSON gets checked before copying
CPU is not wasted compacting data unnecessarily
```

---

## Copy Pressure Check

Galerina should calculate copy pressure.

Example factors:

```text
payload size
node count
repeated key count
repeated shape count
estimated full-copy cost
number of clones
number of patches
number of decoded views
estimated compact saving
```

If copy pressure is too high, Galerina converts to compact representation.

---

## Example Copy Pressure Report

```json
{
  "jsonCopyPressure": {
    "source": "src/webhooks/payment-webhook.spore:18",
    "payloadSize": "500kb",
    "nodeCount": 8200,
    "cloneCount": 2,
    "patchCount": 1,
    "estimatedNormalMemory": "1.6mb",
    "estimatedCompactMemory": "620kb",
    "saving": "61%",
    "action": "converted_to_compact_json"
  }
}
```

---

## Repeated Shape Report

Galerina should report when repeated node shape optimisation is used.

```json
{
  "jsonCompact": {
    "mode": "lazy",
    "trigger": "repeated_node_shapes",
    "source": "src/imports/customer-import.spore:18",
    "payloadSize": "500kb",
    "nodeCount": 8200,
    "repeatedShapes": [
      {
        "shapeId": "shape_1",
        "keys": ["id", "name", "status"],
        "reuseCount": 1200,
        "estimatedSaving": "48%"
      }
    ],
    "action": "converted_to_compact_json"
  }
}
```

---

## Compact JSON Report

Galerina should report when compact conversion happens.

```json
{
  "jsonCompact": {
    "enabled": true,
    "mode": "lazy",
    "source": "src/webhooks/payment-webhook.spore:18",
    "trigger": "copy_pressure",
    "originalSize": "500kb",
    "estimatedParsedSize": "840kb",
    "compactSize": "390kb",
    "saving": "53%",
    "schemaKeys": 42,
    "nodeCount": 8200
  }
}
```

---

## Internal Only by Default

Compact JSON should be an internal representation.

External APIs should still receive and return normal JSON.

```text
External format = normal JSON
Internal format = compact schema-backed representation
```

Galerina should not expose compact JSON to clients unless explicitly requested.

---

## Partial Decode

For large JSON, Galerina should decode only what is needed.

Example:

```Galerina
let eventType: String = json.pick<String>(&payload, "$.type")
let eventId: String = json.pick<String>(&payload, "$.id")
```

Only decode the full type when needed:

```Galerina
match eventType {
  "payment.succeeded" => {
    let event: PaymentSucceededEvent = json.decode<PaymentSucceededEvent>(&payload)
    handlePaymentSucceeded(event)
  }

  _ => return JsonResponse({ "ignored": true })
}
```

---

## JSON Views

Galerina should support views into JSON.

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

## Streaming for Very Large JSON

For very large JSON, Galerina should support streaming.

```Galerina
for item in json.stream<OrderItem>(req.body, "$.items") {
  processItem(item)
}
```

This avoids loading the entire payload into memory.

Good for:

```text
bulk imports
large arrays
logs
event streams
batch jobs
large webhook payloads
```

---

## Security Rules

Compact JSON must not weaken security.

Galerina should still enforce:

```text
max body size
max depth
duplicate key policy
null policy
schema validation
secret redaction
source-mapped errors
typed decoding
```

---

## Secret Handling

Compact JSON must not accidentally preserve secrets in unsafe places.

Rules:

```text
redacted fields must stay redacted
SecureString must not be stored in unsafe compact caches
raw secrets must not be written to disk
AI reports must not include secret values
compact schema maps must not expose sensitive values
```

Keys may appear in reports.

Values must be redacted where sensitive.

---

## Source Maps

Compact JSON errors should still map back to original Galerina source.

Example:

```text
JSON compact conversion warning:
Payload converted to compact representation due to repeated node shapes.

Original source:
  src/imports/customer-import.spore:18:21
```

---

## AI Guide Integration

The AI guide should include useful compact JSON summaries.

Example:

```markdown
## JSON Memory Optimisation

Route: `POST /webhooks/payment`

Policy:
- compact mode: lazy
- node threshold: 1000
- repeated node shape detection: enabled
- trigger: modified, duplicated, copy pressure, repeated node shapes
- copy-on-write: enabled

Last observed:
- payload size: 500kb
- node count: 8200
- repeated shape count: 1
- shape reuse count: 1200
- estimated saving: 53%
```

---

## Memory Report Integration

Galerina should include Lazy Compact JSON in memory reports.

Schema fields:

```text
source
mode
trigger
payloadBytes
nodeCount
repeatedShapeCount
shapeReuseCount
estimatedSavingPercent
copyOnWrite
spillEligible
redactionPreserved
warnings
```

```json
{
  "memoryOptimisations": {
    "lazyCompactJson": [
      {
        "source": "src/webhooks/payment-webhook.spore:18",
        "mode": "lazy",
        "trigger": "repeated_node_shapes",
        "payloadBytes": 512000,
        "nodeCount": 8200,
        "repeatedShapeCount": 1,
        "shapeReuseCount": 1200,
        "estimatedSavingPercent": 53,
        "copyOnWrite": true,
        "spillEligible": false,
        "redactionPreserved": true,
        "warnings": []
      }
    ]
  }
}
```

---

## Compiler/Linter Checks

Galerina should warn when code causes avoidable JSON duplication and should report when Lazy Compact JSON is selected, skipped or blocked.

Example:

```Galerina
let a: Json = payload.clone()
let b: Json = payload.clone()
let c: Json = payload.clone()
```

Warning:

```text
JSON memory warning:
Large JSON payload cloned 3 times.

Suggestion:
Use read-only references, views, or lazy compact JSON.
```

Checks:

```text
warn repeated large Json clone
warn eager full decode when json.pick<T> is enough
warn repeated object shapes that could compact
report copy-on-write activation
block compaction if redaction metadata would be lost
block disk spill for secret-bearing JSON
```

---

## Best Practice

Use:

```Galerina
&payload
```

for read-only access.

Use:

```Galerina
payload.view("$.field")
```

for partial access.

Use:

```Galerina
json.pick<T>(&payload, "$.field")
```

for small typed extraction.

Use:

```Galerina
json.decode<T>(&payload)
```

only when the full type is needed.

Use:

```Galerina
payload.clone()
```

only when a real independent copy is required.

---

## Non-Goals

Lazy Compact JSON should not:

```text
compact tiny JSON unnecessarily
hide expensive clones
change external JSON format
weaken validation
leak secrets
write compact data to disk unless aLOwed by spill policy
make JSON dynamically typed inside Galerina
```

---

## Recommended Early Version

Version 0.1:

```text
define lazy compact JSON policy
support read-only references
warn on large explicit clone
document copy-on-write behaviour
document repeated node shape detection
```

Version 0.2:

```text
add key interning
add shape detection
add repeated shape reports
add JSON compact report
add memory report integration
```

Version 0.3:

```text
add copy pressure estimator
add compact conversion on modification/duplication
add compact conversion for repeated dataset-like structures
add AI guide summary
```

Version 0.4:

```text
add streaming integration
add schema hash reuse
add patch-based JSON views
```

---

## Final Principle

Galerina should avoid heavy JSON memory use without forcing unnecessary conversion.

Final rule:

```text
Small JSON stays simple.
Read-only JSON is borrowed.
Dataset-style JSON can use repeated node shape optimisation.
Modified or duplicated JSON is checked before copying.
Compact only when the saving is worthwhile.
Patch instead of duplicating.
Stream when very large.
Keep compact format internal.
```

This gives Galerina safer and more efficient JSON handling for API, webhook and integration-heavy applications.
