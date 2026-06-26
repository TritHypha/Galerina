# Galerina Governed Memory Blocks

## Status

```
Phase 10C — Specification (not yet implemented)
Depends on: value-state-checker, runtime interpreter
Hardware: ARM MTE, CHERI capability model (future)
```

## TL;DR

- Every sensitive runtime object carries identity, owner, and access policy metadata
- The runtime can detect or prevent unauthorised read, write, mutation, export, and tampering
- Protected values are not just typed — they are owned, tagged, and auditable at runtime

---

## The Problem

Compile-time type checking tells you a value is `protected Email`. The
value-state checker confirms it cannot flow into a governed sink without a
validated upgrade. But once execution begins, the type system is silent.

At runtime, the same value is a memory address, a buffer, or a heap object.
Without runtime policy, `protected Email` is a label with no enforcement.
Another routine could read it, copy it, or export it without the compiler
ever knowing.

Memory without runtime policy is just a label without enforcement.

Governed Memory Blocks (GMBs) close this gap by attaching identity, owner,
and access policy to sensitive runtime objects, and requiring every access to
pass through a capability check.

---

## Governed Memory Block Structure

When the runtime allocates a `protected` or `secret` binding, it creates a
Governed Memory Block with the following metadata:

```yaml
block:
  id: gmb_01J...
  owner_flow: createPatient
  type: "protected Email"
  state: protected
  permissions:
    read: [createPatient, redact]
    write: []
    export: denied
  hash: "sha256:..."
  signature: "runtime-key:..."
```

| Field | Description |
|---|---|
| `id` | Unique block identifier (ULID format) |
| `owner_flow` | The flow that allocated this block — the only flow with default read access |
| `type` | The Galerina type with value-state prefix |
| `state` | Current protection state: `protected`, `redacted`, or `released` |
| `permissions.read` | List of flows or built-in operations permitted to read this block |
| `permissions.write` | Empty by default for `protected` values |
| `permissions.export` | `denied` unless explicitly approved by a governance rule |
| `hash` | SHA-256 of the block's current content (updated on mutation) |
| `signature` | Runtime key signature over `id + hash` for tamper detection |

---

## What the Runtime Enforces

The runtime checks every operation that touches a Governed Memory Block:

| Operation | Check | Failure |
|---|---|---|
| Unauthorised read | Caller not in `permissions.read` | Access denied, audit event written |
| Unauthorised write | `permissions.write` is empty | Mutation rejected |
| Memory tampering | Block hash does not match content | Runtime integrity violation |
| Unexpected export | `permissions.export` is `denied` | Export blocked, SPORE-GOV-003 |
| Runtime injection | Foreign code attempts access to a GMB | Access denied |
| Cross-flow access | Flow not listed in `permissions.read` attempts read | Access denied |

---

## Three-Layer Enforcement Model

Governed memory enforcement operates across three paths, each with a
different cost and frequency trade-off.

**Hot path — every operation**

Memory tags and capability tokens are checked on every read or write. The tag
is a small integer attached to the memory region. The capability token is
passed with the operation. If they do not match, the access is denied
immediately. This path has near-zero overhead on hardware with native tag
support (ARM MTE).

**Checkpoint path — periodic**

At configurable intervals or before effect boundaries (e.g. before
`database.write`), the runtime re-hashes protected blocks and checks them
against their stored hash. A mismatch triggers a runtime integrity violation.

**Audit path — at flow completion**

When a flow completes, the runtime signs the execution report and includes a
summary of all GMBs accessed during the run. This feeds the signed attestation
produced by `src/attestation.ts`.

```
Compile-time:   value-state checks      (SPORE-VALUESTATE-*)
Runtime:        memory tagging + capability checks   (hot path)
Checkpoint:     hash/sign runtime blocks             (periodic)
Audit:          sign runtime report                  (at flow completion)
```

---

## Galerina Source Example

At the source level, the developer writes:

```galerina
secure flow createPatient(readonly request: Request) -> CreatePatientResult
contract {
  types {
    type CreatePatientResult = Result<Response, ApiError>
  }
  effects {
    database.write
    audit.write
  }
}
{
  unsafe let rawEmail: String = request.body.email
  let email: protected Email = validate.email(rawEmail)?

  // At this point the runtime has allocated a GMB for `email`.
  // Only createPatient and redact() can read it.

  AuditLog.write({
    event: "PatientCreated",
    email: redact(email)      // redact() is in permissions.read — allowed
  })

  return Ok(Response.created())
}
```

When `validate.email(rawEmail)?` succeeds, the runtime:

1. Allocates a Governed Memory Block with `owner_flow: createPatient`
2. Sets `permissions.read: [createPatient, redact]`
3. Sets `permissions.export: denied`
4. Hashes the content and stores the hash
5. Signs the block header with the runtime key

Any attempt to pass `email` to a function not in `permissions.read` fails at
runtime before the call executes.

---

## Hardware Acceleration (future)

On hardware with native memory tagging support, the runtime tag checks on the
hot path can be delegated to the hardware, reducing overhead to near zero.

**ARM Memory Tagging Extension (MTE):** Each 16-byte granule can carry a 4-bit
tag. The runtime assigns a tag to each GMB region. Load and store instructions
check the pointer tag against the allocation tag atomically.

**CHERI capability model:** CHERI replaces raw pointers with capability
descriptors that carry bounds, permissions, and a validity bit in hardware.
A CHERI capability for a GMB can encode `read: [createPatient]` directly, so
the hardware rejects out-of-bounds or cross-flow access without a software
check.

Both targets are future work. Phase 10C implements software-only GMBs first.

---

## Contract Declaration

Flow contracts can declare memory protection requirements in the `rules` block.
This gives the governance verifier enough information to check requirements at
compile time before the runtime enforces them at execution time.

```galerina
contract {

  rules {
    protect memory for protected values
    deny runtime injection
    require runtime integrity report
    require redaction before audit.write
  }

}
```

These declarations are checked at compile time by the governance verifier
(Phase 10B+). At runtime they are enforced by the GMB system.

---

## One-Line Principle

> Protected values should not just be typed; they should be owned, tagged, and auditable at runtime.

---

## Rules at a Glance

- Every `protected` or `secret` binding at runtime is backed by a Governed Memory Block
- A GMB carries owner, permissions, hash, and signature metadata
- All reads and writes go through a capability check before executing
- `permissions.export: denied` is the default for all protected values
- Block hashes are re-checked at effect boundaries and at flow completion
- The runtime signs the execution report with a summary of all GMB accesses
- Foreign code attempting to access a GMB is denied before the access executes

---

## See Also

- `docs/Knowledge-Bases/value-state-annotations.md` — compile-time value-state model
- `docs/Knowledge-Bases/galerina-signed-attestation.md` — how the runtime report is signed
- `docs/Knowledge-Bases/galerina-architecture-layers.md` — five-layer architecture context
