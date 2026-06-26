# Galerina — Lessons From Other Languages

## Status

```
Adoption decisions recorded
Phase 8 implementation targets
```

## TL;DR
- Rust diagnostics (dual-location "declared here / used here") — adopt, implemented in Phase 7A
- Elm-style `why` + `risk` fields on every diagnostic — adopt, implemented in Phase 7A
- Go context propagation (`trace_id`, `actor`, `deadline`) — adopt for Phase 8
- TypeScript structural typing — use carefully, never bypass nominal/branded types

---

## Adoption Decision Table

| Source | Concept | Decision | Phase |
|---|---|---|---|
| **Rust** | Dual-location diagnostics ("declared here… used here") | ✅ Adopt | 7A — implemented |
| **Elm** | `why` / `risk` / `suggestedFix` / `suggestedCode` on every error | ✅ Adopt | 7A — implemented |
| **Swift** | Typed `Result<T, E>` — `Err` type must match declared `E` | ✅ Adopt | 8B |
| **Zig** | Explicit error sets | Defer | 9+ |
| **TypeScript** | Structural record typing | Use carefully | ongoing |
| **Haskell/Purescript** | Effect rows (composable effect sets) | Adopt later | 9+ |
| **Go** | Context propagation (`trace_id`, `actor`, `deadline`) | ✅ Adopt | 8 |

---

## 1. Rust-Style Diagnostics — Implemented

Every diagnostic that involves two separate source locations (declared here, used
unsafely here) now carries a `relatedLocations` array.

### Example: SPORE-VALUESTATE-003

```text
Error: SPORE-VALUESTATE-003 UnsafeValueReachedGovernedSink

  Unsafe binding 'rawEmail' cannot flow into governed sink 'PatientsDB.insert'.

  'rawEmail' declared as unsafe here:
    unsafe let rawEmail: String = request.body.email          ← line 5

  Used in governed sink here:
    PatientsDB.insert({ email: rawEmail })?               ← line 9

  Why: 'rawEmail' was declared with 'unsafe let', meaning its value comes
  from an untrusted boundary source and has not been validated.

  Risk: Sending unvalidated boundary data to 'PatientsDB.insert' can cause
  injection attacks, data corruption, or governance violations.

  Try:
    safe mut rawEmail = validate.rawEmail(rawEmail)?
```

### Diagnostic interface fields added

All four diagnostic interfaces (`ParseDiagnostic`, `TypeDiagnostic`,
`ValueStateDiagnostic`, `EffectDiagnostic`) now carry:

```typescript
readonly relatedLocations?: readonly { message: string; location: SourceLocation }[];
readonly why?: string;
readonly risk?: string;
```

These are optional so no existing code breaks. New diagnostics should populate
`why` and `risk` wherever the cause and consequence are clear.

---

## 2. Elm-Style "Try This Instead" — Implemented

Every diagnostic already has:
- `message` — what went wrong
- `suggestedFix` — human-readable prose fix
- `suggestedCode` — machine-applicable snippet (introduced in Phase 6)

The new `why` and `risk` fields complete the Elm-style five-part pattern:

| Field | Purpose |
|---|---|
| `message` | What went wrong (the error) |
| `why` | Why this is a problem (the cause) |
| `risk` | What goes wrong if ignored (the consequence) |
| `suggestedFix` | Human-readable fix description |
| `suggestedCode` | Exact snippet to insert/replace |

### Target diagnostic format for all new diagnostics

```typescript
this.diagnostics.push(makeVSDiag(
  "SPORE-SECRET-001",
  "SecretValueLogged",
  `SecureString binding '${name}' must not be passed to '${callName}'.`,
  location,
  `Replace with: log.info("...", { key: redact(${name}) })`,
  `redact(${name})`,
  {
    relatedLocations: [...],
    why: `'${name}' is a SecureString — its raw value must never appear in logs.`,
    risk: `Logging a secret exposes credentials in plaintext.`,
  },
));
```

---

## 3. Swift-Style Typed Result Errors — Phase 8B

Swift enforces that the error type in `Result<T, E>` matches throughout a call chain.
Galerina should do the same.

### Target behaviour (Phase 8B)

```galerina
guarded flow loadUser(id: UserId) -> Result<User, UserError> {
  return Err(NetworkError.Timeout)   // SPORE-TYPE-XXX: Err type NetworkError does not match declared UserError
}
```

### Implementation requirement

When the return type is `Result<T, E>`:
- `Ok(value)` must produce a value compatible with `T`
- `Err(error)` must produce a value compatible with `E`

This requires Phase 8B expression-level type inference to know the type of the
`Err(...)` argument.

---

## 4. Go Context Propagation — Phase 8

Go's `context.Context` automatically carries `trace_id`, `deadline`, `cancel`,
and arbitrary key-value metadata through every function call.

Galerina should do this differently — not as a hidden implicit parameter, but as
an explicit governed runtime context that flows through route → flow → fn.

### Design

```galerina
// Automatically available in every secure/guarded flow
let ctx: RequestContext = runtime.context()

ctx.traceId      // String
ctx.actor        // Actor identity
ctx.deadline     // Option<Timestamp>
ctx.requestId    // String
ctx.policyContext // PolicyContext
```

The runtime injects this context at the route boundary. It does not need to be
declared as a parameter — it is available from `runtime.context()`.

### Key rules

- Context is **read-only** inside flows — flows cannot modify it
- Context propagates automatically through calls to other flows
- Context does not carry raw secrets (it can carry `actor.id` but not `actor.token`)
- Deadline enforcement is the runtime's responsibility, not the flow's

### Phase 8 implementation

Add `runtime.context()` to the stdlib prelude. The interpreter populates it from
the request hydration step (route/HTTP layer injects `traceId`, `requestId` from
HTTP headers).

---

## 5. TypeScript Structural Typing — Use Carefully

TypeScript uses structural (duck) typing for objects. Galerina should use structural
typing **only for plain records** — never to bypass nominal/branded types.

### Safe: structural matching for plain records

```galerina
record PublicUser {
  name: String
  avatarUrl: String
}

// A record with at least name and avatarUrl can be used as PublicUser
```

### Never allowed: structural bypass of branded/protected types

```galerina
// Wrong — String is not CustomerId structurally
let id: CustomerId = rawString    // SPORE-TYPE-003

// Wrong — protected Email is not plain String
let s: String = email             // SPORE-TYPE-002 (or SPORE-TYPE-003)

// Wrong — Money<GBP> is not Money<USD>
let m: Money<USD> = gbpAmount     // SPORE-TYPE-004
```

### Rule

```text
Structural typing applies to: plain record types, anonymous object literals
Nominal typing applies to: Brand<T,N>, protected/redacted types, Money<C>
```

---

## 6. Haskell/Purescript Effect Rows — Deferred

Effect rows (algebraic effects) allow effects to be a composable polymorphic set:

```haskell
-- Haskell-style effect row
fetchRate :: (Network ∈ eff, Error ∈ eff) => Eff eff Decimal
```

This is more expressive than Galerina's current flat effect list. The benefit is
that effect composition works generically.

Galerina's effect model is simpler and more accessible. Effect rows could be
adopted in a future version (Phase 9+) to enable generic flow combinators, but
the current model is correct for Phase 8.

---

## 7. Zig Explicit Error Sets — Deferred

Zig allows declaring precise error sets:

```zig
error{NotFound, Timeout, BadRequest}
```

This gives the compiler precise knowledge of what errors a function can produce.

For Galerina, this would look like:

```galerina
guarded flow loadUser() -> Result<User, UserError.NotFound | UserError.Timeout>
```

This is a good idea but deferred to Phase 9+ when the type inference engine is
complete enough to validate error set membership.

---

## Implementation Priority

| Priority | Lesson | Status |
|---|---|---|
| ✅ Done | Rust dual-location diagnostics | Implemented — `relatedLocations` on all diagnostic interfaces |
| ✅ Done | Elm why/risk fields | Implemented — `why` + `risk` on all diagnostic interfaces |
| Phase 8 | Go context propagation | `runtime.context()` stdlib entry, route-injected |
| Phase 8B | Swift typed Result errors | Requires expression type inference |
| Phase 9+ | TypeScript structural typing (safe cases) | Already partly in place |
| Phase 9+ | Haskell effect rows | Future language evolution |
| Phase 9+ | Zig explicit error sets | Future language evolution |

---

## See Also

- `docs/Knowledge-Bases/compiler-diagnostics.md` — all SPORE-* diagnostic codes
- `docs/Knowledge-Bases/schemas/diagnostics/` — machine-readable diagnostic schemas
- `docs/Knowledge-Bases/galerina-type-improvements-phase-8.md` — branded types, Money phantom types
- `docs/Knowledge-Bases/galerina-developer-ux-phase-8.md` — error recovery, source spans, explain command
- `packages-galerina/galerina-core-compiler/src/value-state-checker.ts` — relatedLocations in practice
