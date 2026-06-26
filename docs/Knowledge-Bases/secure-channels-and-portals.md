# Secure Channels and Portals

## Status

Status: Future — This feature is not yet implemented in Stage A (Phase 1-15).
Planned for: Stage B

## Definition

Galerina channels, portals and routes are **runtime-managed trust boundaries**,
not manual security topology declarations. Developers describe communication
intent; the runtime governs trust automatically.

## The Core Insight

Traditional languages think:

```text
API call = just HTTP
```

Galerina thinks:

```text
API call = trust boundary crossing
```

When data crosses a runtime boundary, the runtime knows:

```text
data left the trusted runtime
communication crossed a boundary
remote system must be treated as untrusted
response becomes unsafe
```

## What a Channel Really Is

A Galerina channel is not a socket, TLS connection or VPN. It is:

```text
a governed communication policy
```

Runtime concerns a channel governs:

```text
encryption
timeout
retries
service verification
rate limiting
audit
```

## Developer Experience

Developers write a minimal declaration:

```galerina
api payments {
  endpoint: "https://payments.example"
}
```

The runtime automatically applies:

```text
TLS
certificate verification
runtime identity
audit
timeouts
retry policy
trust policy
boundary conversion to unsafe response
```

Developer application code:

```galerina
flow charge_order(raw: unsafe Json) -> Receipt {
  let order: safe Order = validate.order(raw)
  let response: unsafe Any = payments.send(order)
  return validate.receipt(response)
}
```

## Runtime Internal Behaviour

When an external API is called, the runtime internally:

```text
creates secure runtime channel
resolves runtime identity
verifies remote identity
applies route policy
audits request
enforces timeout
```

The developer does not write this. It is runtime automation.

## Portal

A portal is a controlled gateway into another system (external API, database,
queue, legacy system, filesystem, cloud service). For most developers, this is
expressed as a database or API declaration:

```galerina
database legacy {
  source: GlobalVault.database.legacy
}
```

The runtime internally understands: legacy database, external trust boundary,
governed communication required, unsafe return values, audit required.

Portal is an internal runtime abstraction — not application syntax.

## Route

A route is the approved path that communication takes. For most developers,
routes are computed automatically by the runtime based on policy, environment,
region, deployment profile and runtime trust rules.

Enterprise/runtime teams may define explicit constraints:

```galerina
runtime production {
  region_lock: "uk"
  deny_external_relays: true
}
```

The runtime generates routes automatically from these constraints.

## Developer Vocabulary vs Runtime Responsibility

### Developer writes

```text
flow, fn, safe, unsafe, validate, clean, encode
Query, GlobalVault, api {}, database {}
```

### Runtime handles automatically

```text
channels, routes, identity, attestation
trust scoring, audit, signing, provenance
package verification, certificate management
```

## The Real Innovation

The genuine Galerina innovation is:

```text
runtime-aware trust boundaries
```

combined with the trust conversion vocabulary:

```text
safe, unsafe, validate, clean, encode
Query, GlobalVault
```

Manual channel/route/identity syntax is not the innovation — automatic runtime
trust orchestration is.

## Core Principle

```text
Galerina channels, portals and routes should evolve into
automatic runtime trust orchestration,

NOT manual security topology programming.
```
