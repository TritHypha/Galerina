# Data-in-Motion Security

## Definition

Galerina treats data-in-motion as a first-class runtime security concept.
When data crosses any runtime boundary, the runtime knows and governs the
crossing.

## Four Security Layers

Galerina provides:

```text
1. Memory safety
2. Trust safety (safe/unsafe)
3. Runtime authority safety
4. Data-in-motion safety
```

## What Is Data-in-Motion

Data-in-motion includes:

```text
API traffic
service-to-service communication
worker communication
database connections
queue systems
sockets
cloud networking
external providers
filesystem boundaries
device communication
```

## Core Runtime Rule

When data crosses a runtime boundary:

```text
returned data becomes unsafe
```

until validated. This is one of the most important Galerina concepts.

## Developer Experience

Developers write simple code:

```galerina
api payments {
  endpoint: "https://payments.example"
}

flow charge_order(raw: unsafe Json) -> Receipt {
  let order: safe Order = validate.order(raw)

  // Runtime automatically:
  // - creates secure communication
  // - verifies remote identity
  // - applies transport security
  // - audits communication
  // - marks returned data unsafe
  let response: unsafe Any = payments.send(order)

  let receipt: safe Receipt = validate.receipt(response)
  return receipt
}
```

## What the Runtime Automatically Handles

```text
TLS/encryption
service verification
runtime identity
certificate rotation
secure transport
retry policy
timeout policy
audit logging
route safety
trust scoring
policy enforcement
```

## Boundary Types

### API Calls

Response always returns `unsafe`:

```galerina
let response: unsafe Any = payments.send(order)
```

### Database

```galerina
database analytics {
  source: GlobalVault.database.analytics
}
```

Runtime handles: encrypted transport, connection security, identity
verification, audit, unsafe returned data.

### Workers

```galerina
worker image_processor {
  queue: image_jobs
}
```

Runtime handles: secure worker communication, worker identity, audit logging,
message verification, unsafe boundary handling.

### Queues

```galerina
queue uploads {
  source: GlobalVault.queue.uploads
}
```

Runtime handles: authenticated producers/consumers, secure transport, audit
logging, unsafe boundary returns.

## Channels, Identity, Routes Reframed

These are all internal runtime abstractions — not normal developer syntax:

```text
channels  = runtime-managed communication policies
identity  = runtime-generated, auto-rotated
routes    = computed automatically from policy and environment
portals   = runtime boundary abstractions
```

## Runtime Security Profiles

```galerina
runtime profile production {
  auto_identity: true
  auto_secure_channels: true
  require_signed_packages: true
  require_runtime_provenance: true
  strict_audit: true
}
```

## Enterprise Mode

Advanced features for regulated environments:

```text
explicit routes
relay governance
manual channel policies
regional restrictions
advanced provenance
custom runtime identities
```

These live in runtime configuration, deployment policy and enterprise manifests
— not in normal `.spore` application code.

## Zero Trust Alignment

Galerina aligns with zero trust:

```text
never trust communication automatically
always verify boundaries and policies
```

But critically:

```text
the runtime automates most verification
developers declare intent only
```

## Relationship to safe/unsafe

```text
safe / unsafe        = trust state of data values
data-in-motion       = trust state of communication boundaries
```

Both are required. A value can be `safe` in trust state but still have crossed
an unsafe boundary during transport.

## Developer Vocabulary vs Runtime Responsibility

### Developer writes

```text
flow, fn, safe, unsafe, validate, clean, encode
Query, GlobalVault, api {}, database {}, queue {}
```

### Runtime handles automatically

```text
channels, routes, identity, attestation
trust scoring, audit, signing, provenance
certificate management, secure transport
```

## Core Principle

```text
Galerina should not force developers to become
network security architects or cryptographic identity engineers.

Instead:
developers declare intent.
Galerina runtime governs trust automatically.
```
