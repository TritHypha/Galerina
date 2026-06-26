# Request Lifecycle

## Definition

The **Galerina Request Lifecycle** is the governed path every request, event, or external input follows from entry to output.

```text
Galerina Request Lifecycle =
the governed path every request, event, or external input follows
from entry to output, enforced by the Intake Guard and the Response Gate.
```

It is not "receive request → run code → send response." Every step is governed.

## Full Lifecycle

```text
Request enters
 -> Intake Guard
 -> Route match
 -> Request model validation
 -> Runtime.Context creation
 -> Permission check
 -> Flow execution
 -> Result assembly
 -> Response Gate
 -> Audit proof
 -> Response leaves
```

## Intake Guard

The Intake Guard protects the runtime **before** any business logic runs.

It checks:

```text
request size
rate limit
method/path validity
malformed input
content type
schema precheck
dangerous encoding
basic abuse detection
request budget
```

Purpose:

```text
Stop bad input before it reaches flows.
```

## Response Gate

The Response Gate protects the outside world and prevents leakage.

It checks:

```text
response type
view rules
owner rules
secret leakage
forbidden fields
error safety
encoding
cookie safety
audit requirements
```

Purpose:

```text
Nothing leaves the runtime until it is safe to expose.
```

## System Placement

```text
Web/server adapter
 -> Intake Guard
 -> Galerina runtime (route match, validation, permission, flow execution)
 -> Response Gate
 -> Web/server adapter
```

Web adapters handle raw HTTP. Galerina governs what enters and what leaves.

## Route Example

```galerina
route GET "/profile" {
  request Profile.get
  response Profile.response
  flow getProfile
}
```

Runtime lifecycle for this route:

```text
GET /profile
 -> Intake Guard checks size/rate/content
 -> validates Profile.get
 -> creates Runtime.Context
 -> checks permission profile_read
 -> runs getProfile
 -> checks Profile.response
 -> applies view rules
 -> writes audit
 -> returns response
```

## Core Principle

```text
Input is guarded.
Execution is governed.
Output is gated.
```
