# Galerina Memory Safety

This document describes the proposed memory-safety model for **Galerina / Galerina**.

Galerina is a strict, memory-safe, security-first, JSON-native, API-native and accelerator-aware programming language concept.

Memory safety should be a core part of the language, not an optional library feature.

---

## Memory Safety Summary

Galerina should be memory safe by default.

The language should help prevent:

```text
use-after-free
double free
dangling references
buffer overflows
out-of-bounds access
uninitialised memory
unsafe shared mutation
data races
null pointer errors
unsafe raw pointer access
secret leakage through memory misuse
```

Normal Galerina application code should not require manual memory management.

---

## Core Principle

The core memory principle is:

```text
Safe memory by default.
Unsafe memory only if explicitly enabled, clearly marked and heavily restricted.
```

Default project setting:

```Galerina
security {
  memory_safe true
  unsafe "deny"
}
```

---

## Memory Safety Goals

Galerina should aim for:

```text
predictable ownership
clear lifetimes
safe references
immutable values by default
explicit mutability
bounds-checked collections
safe concurrency
no raw pointers in normal code
safe string handling
safe JSON handling
safe secret handling
```

---

## Immutable by Default

Values should be immutable unless marked as mutable.

Immutable:

```Galerina
let name: String = "Galerina"
let count: Int = 10
```

Mutable:

```Galerina
mut retryCount: Int = 0
retryCount = retryCount + 1
```

This makes code easier to reason about and reduces accidental state changes.

---

## Explicit Mutability

Mutable state should always be visible.

Bad:

```Galerina
let count: Int = 0
count = count + 1
```

Expected compiler error:

```text
Cannot assign to immutable value `count`.

Suggestion:
Declare it as mutable:

mut count: Int = 0
```

Good:

```Galerina
mut count: Int = 0
count = count + 1
```

---

## Ownership Model

Galerina uses a hybrid ownership model. This is the current v1 candidate memory
model, not marketing language: memory safety depends on compiler-enforced
ownership, borrow, move, bounds and unsafe-boundary checks.

Normal values use safe automatic memory management. Resources, concurrent messages, accelerator buffers and secrets use stricter ownership rules.

A value should have a clear owner.

Example:

```Galerina
let order: Order = createOrder(input)
processOrder(order)
```

The compiler should understand whether `order` is:

```text
moved
borrowed
copied
shared immutably
shared mutably
```

V0.1 ownership policy:

```text
normal immutable data may be shared safely
large immutable data may be borrowed by read-only reference
mutable values have one active mutable owner
resources have explicit owners and cleanup points
channel sends move ownership unless the value is immutable/share-safe
SecureString has special ownership and redaction rules
raw pointer ownership is not exposed to application code
```

V1 commitment:

```text
Galerina will not describe itself as memory safe unless the checked/compiler path can
enforce these rules for the supported v1 syntax subset.
```

---

## Borrowing Concept

Galerina uses borrowing for temporary local access.

Borrow forms:

```text
read-only borrow
mutable borrow
```

Example concept:

```Galerina
flow printOrder(order: &Order) -> Void {
  print(order.id)
}
```

Mutable borrow concept:

```Galerina
flow updateOrder(order: &mut Order) -> Result<Void, OrderError> {
  order.status = Processing
  return Ok()
}
```

The exact surface syntax may evolve, but the borrow rules are part of the memory safety model.

---

## Borrowing Rules

Borrowing should prevent unsafe access.

Rules:

```text
many immutable borrows are aLOwed
only one mutable borrow is aLOwed at a time
mutable and immutable borrows cannot overlap unsafely
borrowed values cannot outlive their owner
borrowed values cannot be stored in globals
borrowed values cannot be returned unless the return lifetime is tied to the input
borrowed values cannot be captured by longer-lived workers or async tasks
```

These rules help prevent data races and dangling references.

---

## Borrow Escape Checks

The compiler must reject borrows that escape the owner lifetime.

Invalid examples:

```Galerina
flow leakOrder(order: &Order) -> &Order {
  return order
}
```

unless the returned reference is explicitly tied to the input lifetime by a future lifetime syntax.

Invalid:

```Galerina
global cachedOrder = orderRef
```

where `orderRef` is borrowed from a local flow value.

Invalid:

```Galerina
worker AuditWorker {
  process(orderRef)
}
```

if `orderRef` is a borrowed local reference that may outlive the owning flow.

Borrow escape diagnostics should include the owner, borrow site, escape site and suggested fix.

---

## Copy and Move Rules

Some simple types may be copied.

Examples:

```text
Bool
Int
Float
Decimal
small enums
```

Larger types may be moved or borrowed.

Examples:

```text
String
Array<T>
Map<K, V>
Json
Order
Customer
```

The language should make expensive or unsafe movement clear where needed.

---

## Safe References

Normal Galerina references should be safe.

They should not become dangling pointers.

The compiler should prevent:

```text
returning a reference to a local value
using a reference after the owner has moved
mutating through an immutable reference
sharing mutable references unsafely
```

---

## No Raw Pointers in Normal Code

Raw pointers should not be aLOwed in normal Galerina application code.

Invalid in normal code:

```Galerina
let ptr: RawPointer = ...
```

If raw pointers are ever supported, they should require:

```text
unsafe block
explicit permission
source-map tracking
security report entry
review
```

---

## Unsafe Code Policy

Unsafe code should be denied by default.

Default:

```Galerina
security {
  unsafe "deny"
}
```

Possible future explicit unsafe block:

```Galerina
unsafe flow callNative()
permissions [native_bindings] {
  ...
}
```

Unsafe blocks should be:

```text
rare
visible
auditable
source-mapped
reported in security reports
blocked in strict profiles
```

---

## Kernel and Driver Boundary

Kernel modules, operating-system drivers, privileged device access and raw
hardware access are not normal Galerina memory-safety features.

They are last-stage work, blocked by default and require explicit maintainer or
project permission before design or implementation starts.

---

## Bounds Checking

Arrays, buffers and collections should be bounds checked.

Example:

```Galerina
let item = items[0]
```

If the index is out of range, Galerina should fail safely with a source-mapped error.

Safer access should return `Option<T>`:

```Galerina
let item: Option<OrderItem> = items.get(0)

match item {
  Some(i) => processItem(i)
  None    => return Review("No item found")
}
```

---

## Buffer Overflow Prevention

Galerina should prevent buffer overflows through:

```text
bounds-checked arrays
safe string handling
safe Bytes handling
no unchecked pointer arithmetic
safe JSON parser limits
safe memory aLOcation rules
```

---

## String Safety

`String` should be memory safe.

The language should avoid:

```text
manual string buffer management
unsafe string termination bugs
unbounded string writes
encoding confusion where possible
```

Strings should be immutable by default.

Mutable string builders may exist but should remain bounds checked.

---

## Bytes Safety

`Bytes` should represent raw binary data safely.

Example:

```Galerina
let body: Bytes = req.body
```

Operations on `Bytes` should be bounds checked.

Unsafe byte reinterpretation should require explicit permission.

---

## Uninitialised Memory

Galerina should prevent uninitialised variables.

Invalid:

```Galerina
let name: String
print(name)
```

Expected compiler error:

```text
Variable `name` may be uninitialised.

Suggestion:
Assign a value before use.
```

Valid:

```Galerina
let name: String = "Galerina"
print(name)
```

---

## Null Pointer Prevention

Galerina should not use silent null in normal code.

Missing values should use:

```Galerina
Option<T>
```

Example:

```Galerina
let customer: Option<Customer> = findCustomer(id)

match customer {
  Some(c) => process(c)
  None    => return Review("Customer missing")
}
```

This prevents null pointer errors.

---

## JSON Memory Safety

JSON parsing can be a memory risk.

Galerina should support JSON limits:

```Galerina
json_policy {
  max_body_size 1mb
  max_depth 32
  duplicate_keys "deny"
}
```

This helps prevent:

```text
huge payload memory exhaustion
deep nesting attacks
unbounded parsing
unexpected null values
duplicate key ambiguity
```

---

## Streaming JSON

Large JSON payloads should support streaming.

Example:

```Galerina
for item in json.stream<OrderItem>(req.body) {
  process(item)
}
```

This avoids loading very large payloads into memory at once.

---

## JSON Lines Memory Safety

JSON Lines can support event processing without loading everything into memory.

Example:

```Galerina
for event in jsonl.read<Event>("./events.jsonl") {
  process(event)
}
```

This is useful for:

```text
logs
dead-letter queues
event imports
batch jobs
audit trails
```

---

## SecureString Memory Safety

Secrets should use:

```Galerina
SecureString
```

Example:

```Galerina
let apiKey: SecureString = env.secret("API_KEY")
```

`SecureString` must:

```text
avoid accidental printing
avoid accidental logging
redact in reports
avoid accidental conversion to String
clear memory where possible
limit copying where possible
deny disk spill by default
deny AI context value export
deny implicit serialization
```

When the runtime controls the backing storage, it should zero or overwrite secret memory when the value is dropped, replaced or moved out of scope. If the host runtime cannot guarantee zeroing, generated reports should say so.

Invalid:

```Galerina
print(apiKey)
```

Valid:

```Galerina
log.info("API key loaded", { key: redact(apiKey) })
```

---

## Secret Copying

The language should avoid unnecessary copies of secret values.

Example risk:

```text
API key copied into multiple strings
secret appears in logs
secret appears in AI context
secret appears in failure reports
```

Galerina should treat `SecureString` specially so secret values are redacted or blocked from unsafe paths.

---

## Lifetime Checking Approach

Galerina checks lifetimes at flow, borrow, task and resource boundaries.

V0.1 lifetime rules are local and conservative:

```text
local borrows end before the owning flow exits
mutable borrows end before another mutable or immutable borrow starts
resource handles must close or transfer ownership before scope exit
async tasks cannot capture borrowed local references unless the compiler proves they finish first
worker messages must move ownership or use immutable share-safe values
returned references require explicit future lifetime syntax
```

If the compiler cannot prove a reference is valid for the needed lifetime, it must reject the code and suggest clone, move ownership or restructure the flow.

---

## Runtime Memory Pressure

Galerina should let projects declare runtime memory pressure rules in `boot.spore`.

```Galerina
runtime {
  memory {
    soft_limit 512mb
    hard_limit 768mb

    on_pressure [
      "evict_caches",
      "bypass_cache",
      "backpressure",
      "spill_eligible",
      "reject_new_work",
      "graceful_fail"
    ]
  }
}
```

The soft limit is where the runtime begins reducing pressure. The hard limit is
where the runtime must reject, backpressure or fail gracefully rather than
continuing unchecked aLOcation.

---

## Memory Pressure Ladder

Galerina should respond to total memory pressure through controlled stages:

```text
1. Free short-lived finished values.
2. Evict eligible caches.
3. Bypass cache storage.
4. Apply backpressure to queues and channels.
5. Spill approved data to disk if configured.
6. Reject new work safely.
7. Fail gracefully before uncontrolled out-of-memory.
```

A cache limit is not the same as total memory pressure. When a cache is full,
Galerina should calculate and return the result, skip cache storage and report a
cache bypass event.

---

## Runtime Spill Safety

Spill storage is disk-backed temporary storage used only for explicitly aLOwed
data classes.

```Galerina
spill {
  enabled true
  path "./storage/tmp/galerina-spill"
  max_disk 2gb
  ttl 1h
  encryption true
  redact_secrets true

  allow [
    "cache_entries",
    "queue_events",
    "json_stream_buffers",
    "build_cache"
  ]

  deny [
    "SecureString",
    "RequestContext",
    "SessionToken",
    "PaymentToken",
    "PrivateKey"
  ]
}
```

Runtime spill must be aLOw-list based. Sensitive values, request contexts,
session tokens, payment tokens and private keys must not spill to disk.

---

## Memory Safety and Logging

Logs should not accidentally hold sensitive memory.

Bad:

```Galerina
log.info("Webhook secret", webhookSecret)
```

Good:

```Galerina
log.info("Webhook secret loaded", { secret: redact(webhookSecret) })
```

---

## Memory Safety and AI Context

AI context files must not contain secret values.

Generated AI context should include:

```text
secret variable names
redacted placeholders
security settings
```

It should not include:

```text
actual API keys
actual tokens
actual passwords
actual webhook secrets
private keys
```

---

## Concurrency Memory Safety

Galerina should prevent data races.

Rules should include:

```text
immutable data can be shared safely
mutable data cannot be shared without protection
channels transfer ownership or safe messages
workers should avoid shared mutable state
parallel blocks should have structured cancellation
```

Example safe channel:

```Galerina
channel orders: Channel<OrderEvent> {
  buffer 1000
  overflow "reject"
}
```

Worker:

```Galerina
worker OrderWorker count 8 {
  for event in orders {
    processOrderEvent(event)
  }
}
```

---

## Data Race Prevention

Galerina should prevent patterns such as:

```text
two workers mutating the same object
shared global mutable state
mutable references crossing task boundaries unsafely
unsynchronised access to shared collections
```

The compiler and runtime should work together to detect or prevent these.

---

## Shared State

Shared state should be explicit.

Possible future syntax:

```Galerina
shared state OrderCache {
  protected by Mutex
}
```

or:

```Galerina
actor OrderCache {
  ...
}
```

The exact design is open, but unsafe shared mutation should not be easy.

---

## Channels and Ownership

Channels should either:

```text
move values safely
copy safe values
send immutable references safely
```

They should not allow unsafe shared mutable references by default.

Example:

```Galerina
orders.send(event)
```

After sending, ownership rules should define whether `event` can still be used.

---

## Backpressure and Memory

Unbounded queues are a memory risk.

Channels should declare buffer limits.

Example:

```Galerina
channel webhooks: Channel<WebhookEvent> {
  buffer 5000
  overflow "dead_letter"
  dead_letter "./storage/dead/webhooks.jsonl"
}
```

This avoids unbounded memory growth during traffic spikes.

---

## Recursion Safety

Recursive flows may risk stack overflow.

Galerina should consider:

```text
recursion depth warnings
tail-call optimisation where safe
stack usage checks
source-mapped stack overflow errors
```

Example warning:

```text
Flow `walkTree` is recursive and has no obvious depth limit.
```

---

## Stack and Heap

Galerina does not yet define exact stack/heap behaviour.

Future design should consider:

```text
small values on stack where safe
large values on heap where needed
ownership-managed heap aLOcation
safe references
deterministic cleanup where possible
```

The details depend on compiler/runtime implementation.

---

## Garbage Collection Policy

Galerina uses safe automatic memory management for normal application values in early implementations.

It does not expose manual `free`, raw allocation or application-level pointer arithmetic.

The implementation may use garbage collection, reference counting, regions or another safe runtime strategy, but that is a compiler/runtime detail unless it affects observable behaviour.

Required language-level policy:

```text
no use-after-free in safe Galerina
no double-free in safe Galerina
no dangling references in safe Galerina
deterministic cleanup for explicit resources where possible
special handling for SecureString
strict ownership for resources and concurrency
```

Future native/compiler backends may use ownership without tracing GC where practical, but source-level Galerina should preserve the same safety rules.

---

## Unsafe Code Policy

Unsafe application code is denied by default.

V0.1 does not allow a general `unsafe` block in normal Galerina application code.

Low-level unsafe capabilities, if ever introduced, must be restricted to trusted modules and require:

```text
explicit trusted module declaration
separate audit report
native binding permissions
source-mapped unsafe diagnostics
no silent secret, pointer or buffer exposure
maintainer approval for package publication
```

Generated code may contain target-specific unsafe implementation details, but those details must not become visible as unsafe operations in source Galerina.

---

## Native Binding Safety Rules

Native bindings are denied by default.

A native binding must declare:

```text
function signature
ownership of inputs and outputs
nullability
buffer lengths
thread-safety
error mapping
secret handling
resource cleanup
permission requirements
target compatibility
```

The compiler should reject native bindings that expose raw pointers, unchecked buffers, ambiguous ownership or unredacted secrets to ordinary Galerina code.

---

## Ownership vs Garbage Collection

### Ownership Benefits

```text
predictable cleanup
lower runtime overhead
good for systems programming
good for single binary output
helps avoid data races
```

### Garbage Collection Benefits

```text
easier for beginners
less manual lifetime thinking
friendlier for API/backend apps
simpler for scripting
```

### Possible Galerina Compromise

Galerina could use:

```text
automatic memory management for normal code
ownership-style rules for concurrency and resources
explicit resource cleanup for files/network/database handles
SecureString special handling
```

This may fit Galerina’s goal of being safer than scripting languages but easier than low-level systems languages.

---

## Resource Safety

Memory safety is not only RAM.

Galerina should also manage resources safely:

```text
files
network sockets
database connections
locks
transactions
temporary files
GPU buffers
future accelerator buffers
```

Resources should have clear ownership and cleanup.

Example:

```Galerina
using file = File.open("./data.json") {
  let data = file.read()
}
```

The exact syntax is open, but resource cleanup should be safe.

---

## Database and Transaction Safety

Database transactions should support safe cleanup.

Example:

```Galerina
transaction db {
  saveOrder(order)
  reserveStock(order)
} rollback error {
  return Err(error)
}
```

This is related to rollback and resource safety.

---

## GPU Memory Safety

GPU targets introduce memory risks.

Galerina should ensure:

```text
GPU buffers are bounds checked where possible
data copied to GPU is aLOwed for target
secrets are not sent to GPU unintentionally
fallback is reported
GPU memory limits are checked
```

Early GPU support may be plan-only.

---

## Photonic Memory / Data Safety

Photonic targets should usually receive only approved compute data.

They should not receive:

```text
SecureString
raw environment variables
unvalidated JSON
database handles
HTTP requests
file handles
```

Photonic planning should report what data would be sent to the target.

---

## Target Boundary Safety

Moving data between CPU, GPU, WASM, photonic plan or ternary simulation should be explicit and checked.

The target checker should detect:

```text
unsupported types
secret values crossing target boundary
I/O inside compute block
precision mismatch
shape mismatch
fallback behaviour
```

---

## Memory Errors and Source Maps

Memory-related errors should map back to original source.

Example:

```text
Runtime error:
Array index out of bounds.

Original source:
  src/order-service.spore:28:14

Code:
  let item = items[10]
             ^

Suggestion:
  Use items.get(10) and handle Option<OrderItem>.
```

---

## Memory Reports

Galerina may generate memory-safety report sections inside:

```text
app.memory-report.json
app.runtime-report.json
app.security-report.json
app.failure-report.json
docs/memory-pressure-guide.md
```

Possible fields:

```json
{
  "memorySafety": {
    "unsafe": "deny",
    "boundsChecking": true,
    "rawPointers": "deny",
    "sharedMutation": "restricted",
    "secureStringRedaction": true
  }
}
```

---

## Memory Safety and Release Builds

Release builds should not remove safety checks unless explicitly approved.

For example:

```text
bounds checks should remain unless proven safe
secret redaction should remain
source maps may be separate
debug symbols may be stripped
```

Optimisation must not weaken safety.

---

## Memory Safety and Deterministic Builds

Deterministic builds help security and debugging.

The same source, dependencies and compiler version should produce the same output where possible.

This supports:

```text
auditability
release verification
multi-server deployment
rollback
```

---

## Common Memory Pitfalls Galerina Should Avoid

| Pitfall | Galerina Protection |
|---|---|
| Buffer overflow | Bounds-checked collections |
| Use-after-free | Ownership/lifetime rules |
| Double free | Automatic resource ownership |
| Dangling reference | Borrow/lifetime checks |
| Null pointer | Option<T> instead of silent null |
| Data race | Safe concurrency rules |
| Uninitialised variable | Definite assignment checks |
| Secret leakage | SecureString and redaction |
| Memory exhaustion | Payload and queue limits |
| Unsafe target transfer | Target compatibility checks |

---

## Example: Safe Optional Access

Bad:

```Galerina
let customer: Option<Customer> = findCustomer(id)
print(customer.name)
```

Good:

```Galerina
let customer: Option<Customer> = findCustomer(id)

match customer {
  Some(c) => print(c.name)
  None    => return Review("Customer missing")
}
```

---

## Example: Safe Array Access

Risky:

```Galerina
let first = items[0]
```

Safer:

```Galerina
let first: Option<OrderItem> = items.get(0)

match first {
  Some(item) => processItem(item)
  None       => return Review("No items found")
}
```

---

## Example: Safe Secret Handling

Bad:

```Galerina
let apiKey: SecureString = env.secret("API_KEY")
print(apiKey)
```

Good:

```Galerina
let apiKey: SecureString = env.secret("API_KEY")
log.info("API key loaded", { key: redact(apiKey) })
```

---

## Example: Safe Channel Buffer

Bad concept:

```Galerina
channel webhooks: Channel<WebhookEvent> {
  buffer unlimited
}
```

Good:

```Galerina
channel webhooks: Channel<WebhookEvent> {
  buffer 5000
  overflow "dead_letter"
  dead_letter "./storage/dead/webhooks.jsonl"
}
```

---

## Implementation Options

Galerina may choose one of several implementation models.

### Option 1: Ownership-Based

Similar in spirit to strict ownership-oriented safety.

Pros:

```text
strong safety
predictable performance
good for native binaries
```

Cons:

```text
harder for beginners
more complex compiler
```

### Option 2: Garbage-Collected

Similar in spirit to Go, Java or C#.

Pros:

```text
easier development
good for API/backend apps
simpler mental model
```

Cons:

```text
runtime overhead
less predictable cleanup
```

### Option 3: Hybrid

Possible Galerina direction.

```text
automatic memory management for normal objects
strict ownership for resources and concurrency
special handling for secrets
safe target boundary checks
```

This may best fit Galerina’s goal.

---

## Recommended Early Direction

For early Galerina design, use a hybrid concept:

```text
immutable by default
explicit mutability
safe automatic memory management
no raw pointers
bounds checking
Option<T> for missing values
Result<T, E> for errors
structured concurrency
special SecureString behaviour
unsafe denied by default
native bindings denied by default
```

This keeps the language approachable while preserving strong safety goals.

---

## Open Questions

```text
Should borrowing syntax use & and &mut?
Should direct indexing return T or Option<T>?
Should release builds ever remove bounds checks?
Should GPU buffers have special ownership types?
Should photonic target data require explicit approval?
```

---

## Final Memory Safety Principle

Galerina should make memory safety normal and unsafe memory unusual.

The language should protect developers from common memory errors while staying usable for real API, JSON, worker and AI systems.

Memory safety should support the wider Galerina goals:

```text
security
debuggability
source-mapped errors
safe concurrency
safe JSON processing
safe accelerator targeting
AI-friendly diagnostics
build-once deploy-many deployment
```
