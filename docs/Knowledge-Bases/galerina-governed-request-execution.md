# Galerina — Governed Request Execution

## Status

```
Architecture Principle — applies to current implementation
Route dispatch: implemented (route-dispatcher.ts)
Contract enforcement: implemented (contractEnforcer.ts, capabilityHost.ts)
Runtime reports: implemented (runtimeReport.ts)
Honest claim scope: more predictable, safer, easier to optimise — not "absolute security"
```

## TL;DR

- Galerina server = **governed request execution** — not just an HTTP server
- Each route receives only the capabilities declared in its contract — no ambient access
- The safest route is also the clearest and most optimisable route

---

## What Galerina Realistically Improves

### Security
- No ambient access to `process`, `globalThis`, `fs`, `eval` — capability-bounded only
- Route capabilities are explicit in `contract.effects`
- `protected` data cannot leak to response or logs unless explicitly permitted

### Performance
- Fewer dynamic checks inside flows (pre-verified by compiler)
- Predictable request/response schemas (`request {}` / `response {}`)
- Pure flows can distribute across workers without coordination
- Future passive execution plans avoid repeated AST-walking per request

### Reliability
- Timeouts, limits, retries, and observability are declared **per flow** — not runtime defaults
- Every secure route can produce a signed runtime report proving effects, timing, and limits

---

## The Five Key Ideas

### 1. Capability-Bounded Routes

```galerina
route GET "/patients/:patientId" {
  trigger getPatient
}
```

`getPatient` only receives the capabilities in `contract.effects`. It cannot reach
`network.outbound` or `email.send` unless explicitly declared. The route is a
governed entry point — not an open door.

### 2. Request-Scoped Memory Boundary

All temporary request data is owned by the request lifecycle. When the flow
completes, the request boundary is released. Protected values (`protected PatientId`)
carry ownership metadata — no accidental retention after response.

### 3. Worker/Isolate Routing

Pure or stateless flows can safely distribute across workers:

```galerina
pure flow computeScore(embedding: Tensor<Float32, [768]>) -> Float32
```

No effects, no shared mutable state → safe to run in a worker or isolate pool
without synchronisation.

### 4. Static Request/Response Schemas

```galerina
request {
  params { patientId: unsafe String }
}

response {
  exposes { patientId name }
  denies  { email nhsNumber }
}
```

The compiler knows the exact input shape and permitted output shape before
the request arrives. Validation is pre-planned, not dynamic.

### 5. Runtime Reports Per Secure Route

Every `secure flow` can prove: which effects were used, what the latency was,
which limits applied, and that the audit was written. The runtime report is
cryptographically signed.

---

## Canonical Governed Route Pattern

```galerina
route GET "/patients/:patientId" {
  trigger getPatient
}

secure flow getPatient(
  readonly request: Request
) -> GetPatientResult

contract {
  types {
    type GetPatientResult = Result<Response, ApiError>
  }

  intent {
    "Return a patient profile to an authorised actor."
  }

  request {
    params {
      patientId: unsafe String   // boundary origin — not yet validated
    }
  }

  response {
    returns PatientProfileResponse
    exposes { patientId name }
    denies  { email nhsNumber }  // PII may not leave unless explicitly allowed
  }

  context {
    require actor
    require trace_id
    require deadline
  }

  effects {
    database.read
    audit.write
  }

  limits {
    max request size 64 KB
    max memory 16 MB
  }

  timeouts {
    deadline 200 milliseconds
  }

  privacy {
    contains PII
    require redaction before audit.write
  }

  observability {
    trace flow
    measure latency
    deny request body logging
    deny protected values in logs
  }

  audit {
    require runtime report
  }
}
{
  // 1. Receive raw (unsafe) input
  unsafe let rawPatientId: String = request.params.patientId

  // 2. Validate into a protected type — gate breaks taint chain
  let patientId: protected PatientId = validate.patientId(rawPatientId)?

  // 3. Governed database read
  let patient = PatientsDB.find(patientId)?

  // 4. Audit with redacted PII
  AuditLog.write({
    event: "PatientRead",
    patientId: redact(patient.id)
  })

  // 5. Return only allowed fields (email/nhsNumber denied by contract)
  return Ok(Response.okJson({
    patientId: patient.id,
    name: patient.name
  }))
}
```

---

## What the Contract Buys

| Contract section | Enforcement |
|---|---|
| `effects { database.read }` | capabilityHost denies network.outbound |
| `response { denies { email } }` | SPORE-GOV-003 if email appears in response body |
| `context { require actor }` | SPORE-CONTEXT-001 if actor not accessed |
| `limits { max request size 64 KB }` | contractEnforcer.checkRequestSize() at request entry |
| `timeouts { deadline 200ms }` | contractEnforcer.checkDeadline() aborts if exceeded |
| `privacy { require redaction }` | governance verifier checks redact() is called |
| `audit { require runtime report }` | runtime report is generated and signed |

---

## What Is Not Claimed

- Not "absolute security" — Galerina runs on V8, which has its own attack surface
- Not "near-native speed" — V8 is fast but not equivalent to native code for all patterns
- Not "better than hand-optimised Node.js" — an expert Node.js server can outperform

**What IS true:**
> Galerina makes the safest route also the clearest and most optimisable route.
> Security, performance, and reliability constraints are declared once in the contract
> and enforced consistently at every level: compiler, runtime, and audit chain.

---

## See Also

- `galerina-flow-entry-points.md` — routes as entry points, flows as non-addressable
- `galerina-contract-full-model.md` — 16-section contract canonical reference
- `galerina-static-capability-proofs.md` — compiler-verified capability bounds
- `galerina-pii-handling.md` — PII lifecycle in governed flows
- `galerina-passive-execution-plans.md` — future plan-based request execution
- `galerina-javascript-escape-hatch.md` — no ambient globalThis/process/eval in emitted code
