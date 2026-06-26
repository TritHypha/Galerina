# Auth Service — Governance Proof

This document records the static governance properties of every flow in the
`auth-service` example package. It is generated once per compiler release and
pinned alongside the source so that auditors can verify claims without
re-running the toolchain.

---

## Flow: verifyPassword

**Source:** `verifyPassword.spore`
**Qualifier:** `secure`

### Declared Effects

| Effect | Meaning |
|---|---|
| `database.read` | Reads the stored password hash from the user database |
| `crypto.verify` | Calls `Crypto.constantTimeEquals` for timing-safe comparison |
| `audit.write` | Writes one `AuthAttempt` record to the audit log unconditionally |

### WASM Capability Imports

| Effect | WASM import (`host:<name>`) | Description |
|---|---|---|
| `database.read` | `host:database.read` | Sandboxed read-only DB cursor; write access denied by import table |
| `audit.write` | `host:audit.write` | Append-only audit sink; cannot read back written records |

`crypto.verify` is satisfied by `Crypto.constantTimeEquals`, which is a
pure stdlib function. No host import is emitted for it.

### Audit Trail Contents

Every execution appends exactly one record:

```
{
  event:   "AuthAttempt",        // fixed string literal — not caller-controlled
  email:   redact(email),        // stable non-reversible hash; raw value never stored
  success: <bool>                // outcome; no credentials appear in the record
}
```

The record is written unconditionally (outside any `if` branch), so failed
attempts are always logged.

### PassiveExecutionPlan Hash

```
pep_sha256: PLACEHOLDER-verifyPassword-v0
```

---

## Flow: createSession

**Source:** `createSession.spore`
**Qualifier:** `secure`

### Declared Effects

| Effect | Meaning |
|---|---|
| `database.write` | Persists the new session record |
| `audit.write` | Writes one `SessionCreated` record to the audit log |

### WASM Capability Imports

| Effect | WASM import (`host:<name>`) | Description |
|---|---|---|
| `database.write` | `host:database.write` | Append-capable session store; read access not granted |
| `audit.write` | `host:audit.write` | Append-only audit sink |

### Audit Trail Contents

Every execution appends exactly one record on success:

```
{
  event:     "SessionCreated",         // fixed string literal
  sessionId: redact(session.sessionId) // opaque hash; raw SessionId never stored
}
```

The `deny protected SessionId to response.body` privacy rule additionally
prevents the raw `sessionId` from appearing in any HTTP response body. The
`redact()` call at the audit sink enforces the same constraint for the log.

### PassiveExecutionPlan Hash

```
pep_sha256: PLACEHOLDER-createSession-v0
```

---

## Flow: verifyToken

**Source:** `verifyToken.spore`
**Qualifier:** `pure`

### Declared Effects

_None._ The flow is declared `pure` with an empty `effects {}` block.

### WASM Capability Imports

_None._ Pure flows emit no host imports. The WAT module for `verifyToken`
contains only a function definition; no `(import ...)` stanzas are emitted.

### Audit Trail Contents

_None._ `pure` flows cannot call `AuditLog.write` because `audit.write` is
not in scope. This is enforced statically by the effect checker (SPORE-EFFECT-*
diagnostics).

### PassiveExecutionPlan Hash

```
pep_sha256: PLACEHOLDER-verifyToken-v0
```

---

## Governance Summary

| Flow | Qualifier | Effects | WASM imports | Audited |
|---|---|---|---|---|
| `verifyPassword` | `secure` | `database.read`, `crypto.verify`, `audit.write` | `host:database.read`, `host:audit.write` | Yes — `AuthAttempt` |
| `createSession` | `secure` | `database.write`, `audit.write` | `host:database.write`, `host:audit.write` | Yes — `SessionCreated` |
| `verifyToken` | `pure` | _(none)_ | _(none)_ | No — pure flows cannot write audit records |

All hashes above are placeholders pending integration of the deterministic GIR
hasher in Phase 25C. Replace each `PLACEHOLDER-*` value with the output of
`galerina hash <flow-name>` after building the package.
