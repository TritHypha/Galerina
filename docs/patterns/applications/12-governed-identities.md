# Galerina Application Pattern 12 — Governed Identities

**When to use:** Any system that needs type-safe, governance-aware entity identifiers

---

## The Problem with Plain UUIDs

A plain UUID is unique, but it conveys nothing about:

- What entity it identifies
- What governance rules apply to that entity
- How long it should be retained
- Whether it can be exported or logged

```galerina
fn getUser(id: String) -> User  // which kind of id? UserId? OrderId? SessionId?
fn getOrder(id: String) -> Order
getUser(orderId)  // compiles — silent logic error
```

Plain `String` identifiers allow functions to be called with the wrong kind of identifier. The type system cannot catch it.

---

## Option 1 (Implemented): Typed IDs via `Brand`

The current implementation uses branded types to make identifiers nominally distinct:

```galerina
type UserId = Brand<String, "UserId">
type PatientId = Brand<String, "PatientId">
type OrderId = Brand<String, "OrderId">
type SessionId = Brand<String, "SessionId">
```

Now the type system enforces correct usage:

```galerina
fn getUser(id: UserId) -> User
fn getOrder(id: OrderId) -> Order

getUser(orderId)    // compile error: expected UserId, got OrderId
getUser(patientId)  // compile error: expected UserId, got PatientId
```

Branded IDs are zero-cost at runtime — the brand exists only in the type checker. Values are created with an explicit constructor:

```galerina
let userId = UserId.from(rawId)
let patientId = PatientId.from(rawId)
```

---

## Option 2: Governed IDs (Phase 17)

Phase 17 introduces the `identity` declaration, which attaches governance metadata to an ID type:

```galerina
identity UserId {
  domain "user"
  classification pii
  retention 7y
}

identity PatientId {
  domain "patient"
  classification sensitive-pii
  retention 10y
  governed by HealthcareAuthority
}
```

The compiler generates a branded type from each `identity` declaration, identical to Option 1 in type behaviour. Additionally:

- The `classification` is included in GIR metadata and audit reports
- The `retention` is enforced at the data layer — queries that would return records older than the retention period are blocked at the governed data layer
- The `governed by` field names the authority whose rules apply to this identity type, referenced in compliance manifests

Generated ID format for governed identities:

```
usr_01HK5M7X4BVKN2PQRST3
pat_01HK5M7X4BVKN2PQRST4
```

The prefix (`usr_`, `pat_`) is derived from the `domain` declaration and is included in the ID itself for human readability and debugging.

---

## Option 3: Deterministic IDs

When an entity's identity is derived from its attributes (e.g. a tenant-scoped user), a deterministic ID is preferable to a random UUID:

```galerina
let userId = UserId.from(tenantId, email)
// → sha256(tenantId.value + ":" + email.value)
// → consistent across deployments and data migrations
```

Deterministic IDs:
- Eliminate duplicate-insertion races (same inputs always produce the same ID)
- Survive data migration (re-derived from source attributes)
- Cannot be guessed from the inputs without knowing the hashing scheme

The `from` method accepts any combination of typed values. The hash input is the concatenation of their canonical string representations, separated by a null byte.

---

## Option 4: Capability-Bound IDs

A `protected UserId` cannot be exported from a governed flow that does not declare `user-identity.export` in its effects:

```galerina
guarded flow exportUserData(id: protected UserId)
contract {
  effects { database.read }
  // no user-identity.export — id cannot be written to an external output
}
```

This prevents accidental leakage of identity values through export flows that should not be exposing them. The compiler treats `protected UserId` as PII and applies the same taint rules as `protected Email`.

---

## Option 5: Verifiable IDs

For identity types governed by an external authority (healthcare, financial regulation), IDs can carry a cryptographic attestation:

```galerina
identity PatientId signed by HealthcareAuthority {
  domain "patient"
  classification sensitive-pii
}
```

A verifiable `PatientId` includes an Ed25519 signature from `HealthcareAuthority`. The runtime verifies the signature before accepting the ID in a governed flow. An unverified or forged ID is rejected at the boundary, not at application logic.

```galerina
let patientId = PatientId.verify(rawId, authorityPublicKey)?
// returns protected PatientId or VerificationError
```

---

## Naming Convention Rule

The compiler optionally warns when a binding name ends in `Id` but the declared type is plain `String`:

```galerina
let userId: String = ...    // warning: consider typed identity UserId
let patientId: String = ... // warning: consider typed identity PatientId
```

Enable with:

```toml
[lint]
naming-convention-ids = "warn"  # or "error"
```

This catches cases where branded types were intended but not applied.

---

## Relationship to PII Handling

`PatientId` is itself PII — it uniquely identifies a person in a healthcare context. The `identity` declaration makes this explicit:

```galerina
identity PatientId {
  classification sensitive-pii
  retention 10y
}
```

The compiler treats `PatientId` as a `protected` value throughout. It cannot be:
- Passed to `log.*` without `redact()`
- Written to a non-governed output
- Included in a JSON response without explicit declaration in the route contract

The governance metadata travels with the ID type through the entire flow, enforced by the same taint-tracking rules as any other protected value.
