# Galerina — Flow Entry Points and Access Control

**Status:** Phase 11 — Specification (parser partially implemented)

**TL;DR:**
- Flows do not expose themselves — only declared entry points can trigger flows
- "Files do not expose Galerina code. Routes expose governed entry points."
- private flow = internal only; secure/guarded flow without an entry point = not callable externally

---

## The Problem

In PHP and many traditional web frameworks, the location of a file on disk determines whether it is publicly reachable. Place a file under the web root, and it becomes an endpoint. This model has caused decades of accidental exposure:

- Utility scripts executed directly by attackers
- Internal admin pages reachable without authentication
- Debug endpoints left active in production
- File inclusion vulnerabilities exploiting path-based routing

Galerina rejects this pattern entirely. **Files do not expose Galerina code. Routes expose governed entry points.** A flow defined in any file, in any package, is unreachable by external callers unless a specific authorised entry point declares it.

---

## Core Rule

> A flow can only be executed through an authorised entry point.

There is no mechanism in Galerina for an external caller to invoke a flow directly by name, path, or URL without an explicit entry point declaration. The runtime refuses unrouted execution. The compiler enforces this at the declaration level.

---

## Authorised Entry Points

| Entry Point  | Description                        |
|--------------|------------------------------------|
| `route`      | HTTP or API route                  |
| `main`       | Application startup                |
| `worker`     | Background worker                  |
| `scheduled`  | Cron or timer-triggered            |
| `event`      | Message or event handler           |
| `test`       | Test-only entry (stripped in prod) |
| `cli`        | Command-line entry                 |

Each entry point type is a first-class declaration. The runtime only activates flows that are reachable through one of these declared gates.

---

## Examples

### route — HTTP/API route

```galerina
route POST "/patients" {
  trigger createPatient
}
```

The flow `createPatient` is only reachable via an authenticated HTTP POST to `/patients`. No other path reaches it.

---

### main — Application startup

```galerina
main {
  trigger bootApplication
}
```

`bootApplication` runs exactly once at startup. It is not callable from any HTTP path or external source.

---

### worker — Background worker

```galerina
worker "invoice-processor" {
  trigger processInvoiceQueue
}
```

The worker entry point binds the flow to a managed background execution context. It is not an HTTP endpoint.

---

### scheduled — Cron/timer

```galerina
scheduled daily at "02:00" {
  trigger cleanExpiredSessions
}
```

The flow runs on a declared schedule. There is no URL to invoke it and no external caller can trigger it out of band.

---

### event — Message/event handler

```galerina
event UserCreated {
  trigger sendWelcomeEmail
}
```

The flow is activated only when the `UserCreated` event is published through the governed event system. Direct invocation is not possible.

---

### test — Test-only entry

```galerina
test "create patient with valid data" {
  trigger createPatient with testContext
}
```

Test entries are stripped from production builds. The compiler will reject any test entry that appears reachable in a production build manifest.

---

### cli — Command-line entry

```galerina
cli "db:migrate" {
  trigger runMigrations
}
```

The flow is accessible only via the CLI. It does not become an HTTP route.

---

## Security Rule

> **No declared entry point = no external execution.**

If a flow has no authorised entry point — whether it is private, guarded, or simply undeclared — it cannot be reached by any external caller. The runtime will reject the request. The compiler will not emit a reachable binding for it.

This is not a convention. It is enforced at both compile time and runtime.

---

## The `contract.entry` Section

Flows that are reachable via an entry point can carry an `entry` contract block that governs the conditions under which the entry point is valid:

```galerina
flow createPatient {
  contract {
    entry {
      allow route
      deny direct
      require actor
      require csrf_token
    }
  }

  // flow body
}
```

| Directive        | Meaning                                              |
|------------------|------------------------------------------------------|
| `allow route`    | Only callable via a declared route entry             |
| `deny direct`    | Cannot be invoked directly, even within the runtime  |
| `require actor`  | A verified actor identity must be present            |
| `require csrf_token` | A CSRF token must be present and valid           |

The `contract.entry` section is validated at compile time. Missing requirements produce a compile error, not a runtime failure.

---

## Private Flows

A flow declared `private` is internal to the package or module. It can be called by other Galerina flows but cannot be reached through any external entry point — even if a route attempts to trigger it.

```galerina
private flow hashPassword(plain: String) -> HashedString {
  // internal only
}
```

- Cannot appear as the target of a `route`, `event`, `scheduled`, `worker`, `main`, or `cli` block
- Can be called by other flows within the same package
- Not visible in the generated contract manifest

---

## Compiler and Runtime Enforcement

The compiler rejects any request binding that targets a flow without an explicit, matching entry point declaration. For example:

- A request to `/flows/createPatient` is rejected unless a `route` entry point explicitly declares that path
- A worker attempting to trigger a `private` flow across package boundaries is rejected at compile time
- An event handler that references an undeclared flow produces a compile error

At runtime, the governed execution director checks that the invocation path matches a declared and valid entry point before execution begins. If it does not match, the request is refused with a governed error response — not a silent failure.

**Diagnostic:** Attempts to reach ungated flows produce diagnostic `SPORE-ENTRY-001 UndeclaredEntryPoint`.

---

## Future: Entry Contract Section in Parser

Parser support for `contract.entry` is partially implemented as of Phase 11. The following behaviours are planned for full implementation:

- Full parsing of all `entry` directives
- Compile-time validation of `require actor` against the actor model
- `require csrf_token` enforcement integrated with the request context model
- Entry point graph generation for the manifest, enabling governance diff in CI

---

## Rules at a Glance

1. A flow is not reachable unless an authorised entry point declares it
2. Entry point types are: `route`, `main`, `worker`, `scheduled`, `event`, `test`, `cli`
3. `private` flows are callable only from other Galerina flows in the same package
4. A guarded or secure flow with no entry point is not externally callable
5. The `contract.entry` block constrains how a flow may be entered
6. Compiler and runtime both enforce entry point rules — enforcement is not optional
7. Test entry points are stripped from production builds

---

## See Also

- `guarded-flow-spec.md` — guarded flows and access conditions
- `galerina-flow-contracts.md` — full contract model
- `flow-vs-fn-security-model.md` — how flows and functions differ in security posture
- `route-spec.md` — route declaration syntax and governance
- `galerina-route-runtime-spec.md` — runtime handling of route entry points
- `galerina-governance-architecture.md` — overall governance model
- `compiler-diagnostics.md` — diagnostic codes including SPORE-ENTRY-001
