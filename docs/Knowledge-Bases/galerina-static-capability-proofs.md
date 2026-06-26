# Galerina — Static Capability Proofs

## Status

```
Phase 19A — SPORE-STDLIB-001 enforcement complete
Phase 18D  — EffectFlags bitset, effectsToFlags(), effectsSubset() implemented
Phase 18H  — STDLIB_CAPABILITY_MAP wired (35+ stdlib functions → required effects → WASM imports)
Phase 19A  — SPORE-STDLIB-001: File.readText without filesystem.read → compile error
Phase 20A  — RuntimeManifest.requiredContext populated from contract.context
```

**Key files:**
- `src/stdlib-registry.ts` — STDLIB_CAPABILITY_MAP, getStdlibRequiredEffects(), getStdlibWasmImport()
- `src/type-registry.ts` — EffectFlags (14-bit bitset), effectsToFlags(), effectsSubset()
- `src/effect-checker.ts` — SPORE-STDLIB-001 enforcement, SPORE-EFFECT-001..005
- `src/gir-emitter.ts` — GIRFlow.allowedEffectsMask populated from declared effects

## TL;DR

- Compile-time proves what a flow is allowed to do; runtime enforces what it actually receives
- The compiler checks: which host operations are called → what effects they require → does the contract declare those effects?
- Static proofs reduce unnecessary runtime permission checking and feed into Passive Execution Plans

---

## Core Idea

A **capability** is permission to do something outside local computation.

Calling a pure function, adding two numbers, building a string — these are local computation. They require no capability. No external state is touched. No authority is consumed.

Calling a database, writing to an audit log, making an outbound network call, reading a secret — these require authority granted by the execution environment. A capability is the compile-time token that represents that authority.

```text
local computation:   no capability needed
host operation:      capability required
```

Galerina's capability system answers the question before execution begins: *does this flow have permission to do what it wants to do?* If the answer is no, the build fails.

---

## Example

```galerina
secure flow getPatient(id: PatientId)
  -> GetPatientResult
contract {
  types {
    type GetPatientResult = Result<PatientRecord, PatientError>
  }
  effects {
    database.read
    audit.write
  }
}
{
  let patient = PatientsDB.find(id)?
  AuditLog.write({ event: "PatientAccessed", patientId: id })
  return Ok(patient)
}
```

The compiler traces host operations called in the flow body:

| Host operation | Required effect |
| --- | --- |
| `PatientsDB.find` | `database.read` |
| `AuditLog.write` | `audit.write` |

The contract declares both effects. Static proof passes. No runtime capability discovery is needed for this flow.

---

## Missing Capability Example

```galerina
secure flow getPatient(id: PatientId)
  -> GetPatientResult
contract {
  types {
    type GetPatientResult = Result<PatientRecord, PatientError>
  }
  effects {
    database.read
    // audit.write is missing
  }
}
{
  let patient = PatientsDB.find(id)?
  AuditLog.write({ event: "PatientAccessed", patientId: id })
  return Ok(patient)
}
```

The effect checker sees `AuditLog.write` requires `audit.write`. The contract does not declare it.

```text
SPORE-EFFECT-001: Flow getPatient calls AuditLog.write which requires effect audit.write,
but audit.write is not declared in the contract effects block.

Suggested fix:
  contract {
    effects {
      database.read
      audit.write   ← add this
    }
  }
```

In `galerina check` mode this is a warning with a suggested fix. In `galerina build --production` this is a hard error (see Decision 2).

---

## Why This Matters vs Dynamic Permission Checking

Traditional dynamic permission systems work at runtime:

```text
runtime reaches a privileged operation
  → checks: does caller have permission?
  → if yes: proceed
  → if no: throw PermissionDenied
```

Problems with dynamic checking alone:

- Permission errors surface only during execution, often in production
- No developer feedback before deployment
- Cannot prove what a flow will or will not do before it runs
- Cannot generate execution plans that pre-approve capabilities
- Every execution pays the cost of repeated capability lookup

Galerina's static capability proofs shift this work to compile time:

| Concern | Dynamic only | Static + runtime |
| --- | --- | --- |
| When discovered | At runtime | At compile time |
| Developer feedback | Exception in production | Compiler error during development |
| Execution plan | Cannot pre-approve | Plan records approved capabilities |
| Runtime overhead | Every call checks | Runtime trusts the plan |
| Governance diff | Not possible | CI can diff plans between commits |

Static proofs do not replace runtime enforcement. They reduce redundant runtime discovery by proving authority before execution begins.

---

## SPORE-STDLIB-001: Stdlib Capability Enforcement (Phase 19A)

The compiler now checks that every effectful stdlib function call has its required effect declared.

```galerina
// ❌ SPORE-STDLIB-001: File.readText requires filesystem.read — not declared
guarded flow loadConfig() -> String
contract { effects { database.read } }
{
  let text = File.readText("/etc/config.txt")?
  return text
}

// ✅ Correct: filesystem.read declared
guarded flow loadConfig() -> String
contract { effects { database.read filesystem.read } }
{
  let text = File.readText("/etc/config.txt")?
  return text
}
```

This is enforced by `STDLIB_CAPABILITY_MAP` in `src/stdlib-registry.ts`, which maps 35+ stdlib functions to their required effects and their WASM import names. The WASM import name is used by the `--target wasm-standalone` build to generate the correct import table.

```typescript
// STDLIB_CAPABILITY_MAP examples:
"File.readText"   → { requiredEffects: ["filesystem.read"],  wasmImport: "host:fs.readText" }
"Http.post"       → { requiredEffects: ["network.outbound"],  wasmImport: "host:http.post" }
"AuditLog.write"  → { requiredEffects: ["audit.write"],       wasmImport: "host:audit.write" }
"Hash.sha256"     → { requiredEffects: [],                    wasmImport: undefined }  // pure
```

## EffectFlags Bitset (Phase 18D)

For fast O(1) effect subset checking at runtime and in the effect checker:

```typescript
// Phase 18D: EffectFlags bitset
const EffectFlags = {
  DatabaseRead: 1 << 0, DatabaseWrite: 1 << 1,
  NetworkOutbound: 1 << 2, AuditWrite: 1 << 3,
  AiInference: 1 << 4, ...
}

// Check: required ⊆ declared
const ok = effectsSubset(
  effectsToFlags(["database.read", "audit.write"]),  // required
  flow.allowedEffectsMask,                            // declared (from GIR)
);
```

`GIRFlow.allowedEffectsMask` is populated by `emitGIR()` from the flow's `declaredEffects`. The runtime and WASM backend both use this mask instead of re-checking strings.

---

## Capability Registry

The capability registry maps effect names to host capability IDs.

```yaml
# capability-registry.yaml

capabilities:

  - id: host.database.read
    effect: database.read
    category: database
    trust_level: internal
    requires_validation: false
    contract_section: effects
    description: "Read from a governed database."

  - id: host.audit.write
    effect: audit.write
    category: audit
    trust_level: internal
    requires_validation: false
    contract_section: effects
    description: "Write to the audit trail."

  - id: host.network.outbound
    effect: network.outbound
    category: network
    trust_level: external
    requires_validation: true
    contract_section: effects
    description: "Make an outbound network call."
```

The registry is the single source of truth. The compiler reads it to resolve effect names. The runtime reads it to configure the `capabilityHost`. Both sides must agree on the same registry version.

File: `docs/Knowledge-Bases/capability-registry.yaml`

---

## Compiler Use

The compiler processes capability proofs in three steps:

**Step 1 — Identify host operations called.**

The effect checker walks the flow body and records every call to a host operation (database, network, audit, secret, etc.).

**Step 2 — Resolve required effects.**

Each host operation maps to one or more required effects via the capability registry. A call to `PatientsDB.find` requires `database.read`. A call to `AuditLog.write` requires `audit.write`.

**Step 3 — Validate against declared contract.**

The effect checker compares required effects against the contract's `effects` block. Any required effect not declared produces `SPORE-EFFECT-001`. Any transitive effect not declared (inherited from a callee) produces `SPORE-EFFECT-002`.

```text
flow body scan
  → host ops detected
  → required effects resolved via capability-registry.yaml
  → required effects compared to contract effects block
  → all present: proof passes
  → any missing: SPORE-EFFECT-001 / SPORE-EFFECT-002 emitted
```

---

## Runtime Use

The runtime receives the capability proof as part of the Passive Execution Plan. It uses the `capabilityHost` to expose only the capabilities approved by the plan.

**Rule:** Generated JS must use `capabilityHost`, not raw globals.

### Bad JS output

```js
// WRONG — bypasses capability model
const row = await db.query("SELECT * FROM patients WHERE id = $1", [id]);
```

The compiled output must never call database drivers, HTTP clients, or any host resource directly. This bypasses the capability proof entirely.

### Good JS output

```js
// CORRECT — routes through governed capability host
const row = await capabilityHost.invoke("host.database.read", {
  query: "SELECT * FROM patients WHERE id = $1",
  params: [id]
});
```

`capabilityHost.invoke` checks:

1. Is this capability in the plan's `approved_capabilities` list?
2. Is the effect declared in the contract?
3. Is the request context still valid?

If any check fails, the invocation is rejected before any host resource is touched.

---

## Static Capability Propagation

Capability requirements propagate through the call graph.

If `fetchRate` requires `network.outbound`, and `processOrder` calls `fetchRate`, then `processOrder` also requires `network.outbound`.

```galerina
fn fetchRate(productId: ProductId) -> Result<Rate, NetworkError>
  effect network.outbound
{
  return HttpClient.get("/rates/" + productId)
}

secure flow processOrder(order: OrderRequest)
  -> ProcessOrderResult
contract {
  types {
    type ProcessOrderResult = Result<OrderResponse, OrderError>
  }
  effects {
    database.write
    // network.outbound missing — processOrder calls fetchRate
  }
}
{
  let rate = fetchRate(order.productId)?
  let saved = OrdersDB.insert(order, rate)?
  return Ok(OrderResponse(saved))
}
```

The effect checker propagates `network.outbound` from `fetchRate` to `processOrder`. Since `processOrder` does not declare `network.outbound`, it emits:

```text
SPORE-EFFECT-002: Flow processOrder inherits effect network.outbound from fetchRate
but does not declare it.

Suggested fix:
  contract {
    effects {
      database.write
      network.outbound   ← add this
    }
  }
```

Propagation is a fixpoint algorithm — it resolves recursive and multi-hop call graphs deterministically.

---

## Approved Capability Slots in Execution Plans

The Passive Execution Plan carries an `approved_capabilities` block. This block is the output of the static capability proof. The runtime does not rediscover capabilities at execution time — it reads the pre-approved list from the plan.

```yaml
approved_capabilities:
  - host.database.read
  - host.audit.write
```

The runtime enforces this list as a closed set. Any call to a capability not in the list is rejected.

---

## Passive Execution Plan Integration

Each plan includes a `capability_proof` section recording the result of static analysis:

```yaml
executionPlan:
  flow: getPatient
  version: "1.0"

  capability_proof:
    status: passed
    verified_at_compile: true
    required_effects:
      - database.read
      - audit.write
    declared_effects:
      - database.read
      - audit.write
    undeclared_effects: []

  approved_capabilities:
    - host.database.read
    - host.audit.write

  steps:
    - kind: validate_context
    - kind: capability_call
      capability: host.database.read
      op: PatientsDB.find
    - kind: capability_call
      capability: host.audit.write
      op: AuditLog.write
    - kind: response
      form: okJson
```

The `capability_proof.status: passed` tells the runtime that static analysis succeeded. The runtime trusts this and does not repeat the analysis at execution time.

---

## Runtime Report

The runtime report records what actually happened, cross-referenced against the plan:

```json
{
  "flow": "getPatient",
  "capabilities_used": [
    "host.database.read",
    "host.audit.write"
  ],
  "undeclared_capability_attempts": [],
  "capability_proof_status": "passed",
  "runtime_enforcement_status": "clean"
}
```

If a capability attempt occurs that is not in the plan:

```json
{
  "flow": "getPatient",
  "capabilities_used": [
    "host.database.read"
  ],
  "undeclared_capability_attempts": [
    {
      "capability": "host.network.outbound",
      "rejected": true,
      "reason": "not in approved_capabilities"
    }
  ],
  "capability_proof_status": "passed",
  "runtime_enforcement_status": "violation"
}
```

This becomes evidence in the audit chain.

---

## Dev vs Production Mode

Per Decision 2:

| Mode | Missing declared effect | Governance violation |
| --- | --- | --- |
| `galerina check` | Warning + suggested fix | Always error |
| `galerina check --strict` | Error | Always error |
| `galerina build` | Warning (configurable) | Always error |
| `galerina build --production` | Hard error | Always error |

Security and privacy violations always fail regardless of mode. Missing effect declarations are developer feedback in check mode and governance failures in production.

---

## Security Boundary

The capability model enforces three hard security rules:

**No dynamic capability names.**

```js
// FORBIDDEN — capability name must be static, not computed at runtime
capabilityHost.invoke(userInput, data);
```

Capability IDs must be compile-time string literals resolvable against the registry. Dynamic capability dispatch defeats the proof model.

**No raw global access.**

Generated JS must not access `globalThis`, `process.env`, `require`, raw database drivers, or any host resource directly. All host access is mediated through `capabilityHost`.

**No eval.**

`eval`, `Function()`, and dynamic code generation are forbidden in generated output. They bypass the entire static proof model.

---

## One-Click Governance Fixes

When `SPORE-EFFECT-001` or `SPORE-EFFECT-002` fires, the compiler produces a machine-readable fix suggestion:

```json
{
  "code": "SPORE-EFFECT-001",
  "severity": "warning",
  "message": "Flow getPatient uses audit.write but does not declare it.",
  "suggestedCode": "contract {\n  effects {\n    database.read\n    audit.write\n  }\n}"
}
```

The `suggestedCode` field enables IDE quick-fix and `galerina fix` CLI application without manual editing.

---

## Final Principle

> **Compiler proves permission. Runtime enforces reality.**

The static capability proof tells the runtime what authority the flow was granted. The runtime enforces what authority the flow actually uses. The two together constitute governed capability execution.

---

## Rules at a Glance

```text
RULE 1   Every host operation requires an effect declared in the contract.
RULE 2   Transitive effects (from callees) must be declared by the calling flow.
RULE 3   Missing effects emit SPORE-EFFECT-001 (direct) or SPORE-EFFECT-002 (transitive).
RULE 4   Runtime uses capabilityHost, never raw globals, drivers, or require().
RULE 5   Approved capabilities are pre-computed in the Passive Execution Plan.
RULE 6   Dynamic capability names are forbidden.
RULE 7   eval and Function() are forbidden in generated output.
RULE 8   Security/privacy violations always fail; missing effects are warnings in dev.
RULE 9   Runtime reports record capabilities_used and undeclared_capability_attempts.
RULE 10  Compiler proves permission. Runtime enforces reality.
```

---

## See Also

- `capability-registry.yaml` — effect → host capability mapping (source of truth)
- `effect-checker-and-boundary-checker.md` — full effect checker spec
- `galerina-passive-execution-plans.md` — plans that record approved_capabilities
- `galerina-metadata-erasure.md` — what survives into the plan vs what is erased
- `galerina-phase-13-decisions.md` — Decision 2 (warn vs error modes), Decision 5 (canonical hashing)
- `galerina-gradual-capability-inference.md` — inference modes for developer workflow
- `galerina-stage-b-root-capability-provider.md` — how capabilityHost is bootstrapped
- `compiler-diagnostics.md` — full SPORE-EFFECT-* and SPORE-BOUNDARY-* code table
