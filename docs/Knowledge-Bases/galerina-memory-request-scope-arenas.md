# Galerina Memory — Request-Scope Arenas

## Overview

Request-scoped resources have type-level isolation through Galerina's ownership
and lifetime model. This document defines the **runtime enforcement path**: a
per-request arena allocator that gives the memory model a concrete runtime boundary.

A request arena reduces cross-request memory reuse and provides runtime
enforcement for request-scoped lifetimes. It does not replace ownership,
borrow checking, bounds checks, runtime poisoning or unsafe-code restrictions.

---

## Problem Without Arenas

Without runtime isolation, the type checker may know data is request-scoped, but
the allocator may recycle memory globally. Risk scenarios:

```text
request A frees memory
request B receives the same physical region
a stale pointer, native bug or runtime bug reads the region
data from request B leaks into request A's failure path or exploit path
```

A per-request arena changes the failure mode:

```text
request A memory lives in request A arena
request B memory lives in request B arena
request completion invalidates the whole arena
cross-request allocator reuse becomes controlled, quarantined or scrubbed
```

---

## Type Model

```text
Request<T> / Scoped<T, Request>
  may not escape the request arena

Owned<T>
  normal owned value on its own lifetime

Shared<T>
  explicit shared runtime-managed value

Promoted<T>
  value copied or transformed into a longer-lived safe owner

ProtectedSecret<T>
  requires zeroing/redaction regardless of arena lifetime
```

Invalid:

```galerina
globalCache.set(user.sessionData)  // if sessionData is request-scoped
```

Valid with explicit promotion:

```galerina
let safeSummary: Promoted<UserSummary> = promote(user.toSummary())
globalCache.set(safeSummary)
```

---

## Async Escape Detection

Request data often leaks through background tasks. The compiler must require
a promoted copy when a background task may outlive the request:

```galerina
// Invalid — email is request-scoped, background task may outlive request
spawn background {
  sendEmail(request.user.email)
}

// Valid — email is promoted before use in background task
let email: Promoted<Email> = promote(request.user.email)
spawn background {
  sendEmail(email)
}
```

---

## Runtime Arena Model

A strong implementation includes:

```text
one arena per request or request task group
arena ID stored in request context
allocation metadata records owner scope
request completion drops the arena
sensitive pages zeroed before reuse
freed blocks poisoned in debug/security mode
arena reuse quarantined between requests
cross-arena reference checks in checked runtime mode
large objects may use guarded pages or separate slabs
```

---

## Policy Syntax

Project-level policy:

```galerina
memory_policy {
  request_arena true
  request_max_memory 32mb
  zero_sensitive true
  quarantine_freed true
  checked_cross_scope_refs "debug_and_security"
  unsafe_cross_scope_refs "deny"
}
```

Route-level override:

```galerina
api UploadApi {
  POST "/upload" {
    request UploadRequest
    response UploadResponse
    memory {
      arena per_request
      max 128mb
      overflow reject
      zero_sensitive true
    }
    handler upload
  }
}
```

---

## Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-MEMORY-SCOPE-001` | Request-scoped value cannot escape request arena |
| `SPORE-MEMORY-SCOPE-002` | Global store requires promoted or copied value |
| `SPORE-MEMORY-SCOPE-003` | Async task captures request value beyond request lifetime |
| `SPORE-MEMORY-SCOPE-004` | Native binding cannot receive request arena pointer without unsafe permission |
| `SPORE-MEMORY-SCOPE-005` | Request arena exceeded configured memory budget |
| `SPORE-MEMORY-SCOPE-006` | Cross-arena reference detected in checked runtime |
| `SPORE-MEMORY-SCOPE-007` | Sensitive request arena must be zeroed before reuse |

---

## Important Caveats

A request arena is **allocator-level isolation**, not OS isolation. It:
- Prevents accidental cross-request reuse
- Makes memory lifetime enforcement easier
- Supports memory budgets and sensitive-memory cleanup

It does not defend against every native memory corruption bug. The stronger
claim (one request cannot read another's memory) only becomes reasonable when
combined with process isolation, sandboxing, capability separation, no unsafe
code, checked references and no arbitrary native pointer access.

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Lifetime and scope rules, diagnostics, source-level request scope model |
| `galerina-core-compiler` | Escape analysis, borrow/lifetime checking, async capture checks |
| `galerina-core-runtime` | Arena allocator, cleanup, memory budgets, quarantine, checked runtime assertions |
| `galerina-framework-app-kernel` | Request lifecycle integration, API request boundaries, timeout/cancellation cleanup |
| `galerina-core-reports` | Memory report: arena size, peak usage, cleanup mode, violations |
| `galerina-core-security` | Zeroing policy, sensitive memory rules, unsafe/native binding restrictions |
