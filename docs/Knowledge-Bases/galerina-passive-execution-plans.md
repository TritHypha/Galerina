# Galerina — Passive Execution Plans

## Status

```
Phase 13 — Core architecture proposal
```

## TL;DR

- Replace AST-walking interpretation with compact pre-verified execution plans
- The compiler performs expensive work once (type/effect/contract verification); the runtime just executes the plan
- "Passive" = the plan describes work without making decisions; decisions were made by the compiler

---

## The Problem

Traditional AST-walking interpreters pay the cost of understanding code on every execution:

```text
request arrives
  → load AST from disk or memory
  → traverse nodes
  → inspect types at each node
  → resolve names at each node
  → check permissions at each node
  → execute
  → repeat for next request
```

Every call to the same flow re-traverses the same tree, re-inspects the same types, re-resolves the same names, and re-checks the same permissions. The understanding work is repeated at execution time — every time.

This is wasteful, slow to start, and makes it harder to reason about what a flow will do before it runs.

---

## The Galerina Alternative

Galerina separates two fundamentally different kinds of work:

```text
Understanding Code   →  compiler's job, done once at compile time
Executing Code       →  runtime's job, done from a pre-verified plan
```

The compiler does not hand the runtime an AST. It hands the runtime a compact, pre-verified description of what to execute — stripped of everything the runtime does not need, carrying exactly what the runtime must enforce.

This description is the **Passive Execution Plan**.

---

## Architecture

```text
Source (.spore file)
      ↓
    Lexer + Parser
      ↓
    AST
      ↓
    Type Checker + Effect Checker + Value State Checker
      ↓
    Typed AST
      ↓
    Semantic Resolver
      ↓
    Semantic Graph            ← rich metadata for tooling; not for runtime
      ↓
    GIR Emitter               ← Governed Intermediate Representation
      ↓
    Passive Execution Planner ← expensive verification is complete here
      ↓
    Passive Execution Plan    ← what the runtime receives
      ↓
    Runtime
      ↓
    Runtime Report            ← execution evidence fed to attestation chain
```

Each stage after the Semantic Graph progressively erases metadata and distils the program down to only what is needed for governed execution.

---

## What Is a Passive Execution Plan?

A Passive Execution Plan is a compact, pre-verified description of a flow's execution. It contains:

```text
validated operations       — what the flow does, in order
capability requirements    — which host capabilities are approved
execution order            — the sequence of steps
type information           — what types are expected at each step (for runtime validation)
runtime boundaries         — timeouts, limits, privacy rules
```

It does NOT contain:

```text
parser structures          — no raw AST nodes
comments                   — no human or AI commentary
intent text                — no natural language descriptions
AI metadata                — no AI guidance or reasoning
readable logic forms       — no when/given/then surface syntax
```

The plan is the product of expensive compiler work. The runtime receives a plan it can execute without re-doing any of that work.

---

## Example: Source to Execution Plan

### Source

```galerina
intent GetPatient {
  purpose "Retrieve a patient record with a guaranteed audit trail"
}

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
  timeout: 3s
  limits { maxRows: 1 }
  privacy {
    redact: [email, dateOfBirth]
  }
}
{
  let patient = PatientsDB.find(id)?
  AuditLog.write({ event: "PatientAccessed", patientId: id })
  return Ok(patient)
}
```

### Passive Execution Plan

```yaml
executionPlan:
  flow: getPatient
  version: "1.0"
  plan_hash: sha256:a3f8...

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

  timeout_ms: 3000

  limits:
    maxRows: 1

  privacy:
    redact:
      - email
      - dateOfBirth

  steps:
    - kind: validate_context
      description: verify request context is valid and not expired

    - kind: capability_call
      capability: host.database.read
      op: PatientsDB.find
      input_type: PatientId
      output_type: Result<PatientRecord, PatientError>

    - kind: capability_call
      capability: host.audit.write
      op: AuditLog.write
      input_type: AuditEvent

    - kind: response
      form: okJson
      type: PatientRecord
      privacy_apply: true
```

The intent block is gone. The comments are gone. The readable source form is gone. What remains is a compact description of what the runtime must do and what constraints it must enforce.

---

## Why "Passive"?

The plan is called passive because it does not make decisions. It describes work.

```text
Active (AST interpreter):   runtime walks nodes, makes choices, resolves names, checks types
Passive (execution plan):   runtime reads steps, executes them in order, enforces boundaries
```

Every decision that could be made at compile time was made at compile time. The runtime does not need to understand the plan — it needs to execute it. The intelligence is in the compiler. The plan carries the compiler's conclusions.

A passive plan is closer to a governed recipe than to a program to be interpreted. The chef does not derive the recipe from first principles each time — they follow the recipe that was developed once.

---

## Compile Once

The separation of understanding from executing enables a fundamental efficiency:

```text
compile once:   type checking, effect checking, capability proof, contract verification
execute many:   follow the pre-verified plan on each request
```

Hot paths benefit immediately. Flows that handle thousands of requests per second do not repeat expensive verification on each request. The plan is loaded once. Each request follows it.

This also makes execution deterministic and auditable: the same plan produces the same execution path on every invocation, given the same inputs.

---

## Relationship to Static Capability Proofs

Static capability proofs happen before plan generation. The compiler proves which capabilities are required and verifies they are declared in the contract. The result of this proof — the `approved_capabilities` list — is written into the plan.

```text
effect checker         →  capability proof  →  approved_capabilities in plan
```

The plan does not re-derive which capabilities are needed. It records the result of the proof that already happened. The runtime reads this result and enforces it.

See `galerina-static-capability-proofs.md` for the full proof model.

---

## Relationship to Metadata Erasure

The compiler uses metadata (intent, comments, readable forms, effect declarations, privacy rules) to do its work. Once it has done that work and produced the plan, most metadata is no longer needed in the executable.

```text
compiler consumes metadata
  → proves safety and correctness
  → emits plan

plan contains:
  proof results (approved_capabilities)
  enforcement contracts (timeout, limits, privacy)
  execution steps

plan does NOT contain:
  intent text
  comments
  readable logic forms
  AI guidance
```

Metadata informs the plan. Metadata does not become the plan.

See `galerina-metadata-erasure.md` for the full erasure model.

---

## Full Example Plan

```yaml
executionPlan:
  flow: createOrder
  version: "1.0"
  plan_hash: sha256:b7c2...

  capability_proof:
    status: passed
    verified_at_compile: true
    required_effects:
      - database.write
      - network.outbound
      - audit.write
    declared_effects:
      - database.write
      - network.outbound
      - audit.write
    undeclared_effects: []

  approved_capabilities:
    - host.database.write
    - host.network.outbound
    - host.audit.write

  timeout_ms: 5000

  limits:
    maxPayloadBytes: 65536
    maxDbWritesPerRequest: 1

  privacy:
    redact:
      - cardNumber
      - billingEmail

  steps:
    - kind: validate_context

    - kind: validate_input
      type: CreateOrderRequest
      rules:
        - field: quantity
          constraint: min(1)
        - field: productId
          constraint: not_empty

    - kind: capability_call
      capability: host.network.outbound
      op: fetchRate
      input_type: ProductId
      output_type: Result<Rate, NetworkError>

    - kind: capability_call
      capability: host.database.write
      op: OrdersDB.insert
      input_type: ValidatedOrder
      output_type: Result<Order, DbError>

    - kind: capability_call
      capability: host.audit.write
      op: AuditLog.write
      input_type: AuditEvent

    - kind: response
      form: okJson
      type: OrderResponse
      privacy_apply: true

  denied_capabilities:
    - host.filesystem.write
    - host.process.spawn
    - host.network.raw
```

---

## Runtime Behaviour

The runtime receives a plan and executes it:

```text
1. Load plan from verified plan store
2. Check plan_hash against attestation chain
3. Configure capabilityHost with approved_capabilities
4. Set timeout timer (timeout_ms)
5. Execute steps in order:
   a. validate_context → reject if context invalid or expired
   b. validate_input   → reject if input fails constraints
   c. capability_call  → invoke through capabilityHost only
   d. response        → apply privacy_apply rules, serialise, return
6. Enforce denied_capabilities (reject any attempt to call them)
7. Enforce limits (abort if exceeded)
8. Cancel if timeout exceeded
9. Emit runtime report
```

The runtime does not walk an AST. It does not re-check types. It does not re-resolve names. It follows the plan.

---

## Security Benefits

**The runtime never executes arbitrary AST nodes.**

There is no AST at runtime. The plan contains only pre-verified, named operation kinds (`validate_context`, `capability_call`, `response`). There is no surface for an attacker to inject an AST node that was not in the original source.

**The plan is a closed set of operations.**

A plan's steps are an enumerated, pre-approved sequence. Adding a step at runtime is not possible — the plan is immutable and hash-verified before execution begins.

**Denied capabilities are explicit.**

Plans carry a `denied_capabilities` list. Any attempt to call a denied capability — whether from flow code or from a supply chain dependency — is rejected before the host resource is touched.

---

## Capability Boundaries

Plans never contain references to:

```text
globalThis
process
require()
__dirname
native database driver APIs
raw HTTP client APIs
```

All external resource access is via `capabilityHost.invoke(capability_id, args)`. The capability IDs in the plan are the only ones the capabilityHost will accept during this flow's execution. Everything else is rejected.

---

## Runtime Enforcement

The plan proves intent. The runtime enforces reality.

| Plan entry | Runtime enforcement |
| --- | --- |
| `approved_capabilities` | capabilityHost accepts only these IDs |
| `timeout_ms` | cancellation timer; flow aborted if exceeded |
| `limits.maxRows` | db read results truncated/rejected if exceeded |
| `limits.maxPayloadBytes` | input rejected if payload exceeds limit |
| `privacy.redact` | fields redacted in response serialisation |
| `denied_capabilities` | any attempt to invoke is rejected immediately |
| `plan_hash` | verified against attestation chain before execution |

---

## Deterministic Execution

The plan hash is included in the attestation chain:

```yaml
attestation:
  source_hash: sha256:...
  semantic_graph_hash: sha256:...
  typed_ast_hash: sha256:...
  gir_hash: sha256:...
  passive_execution_plan_hash: sha256:b7c2...
  execution_proof_hash: sha256:...
```

Every execution of the same plan produces the same execution path for the same inputs. The plan hash in the attestation chain proves which plan was used. The execution proof proves the plan was followed.

---

## Cross-Platform Execution

The same plan can be executed by different runtime backends:

```text
Passive Execution Plan
      ↓
  CPU runtime     (Node.js Stage B, native)
  GPU runtime     (parallel compute flows)
  WASM runtime    (sandboxed execution)
  NPU runtime     (AI inference flows)
```

The plan describes what to do, not how the host executes it. Different runtimes interpret the same steps through their own execution primitives. The plan is the portable governed description; the runtime is the hardware-specific executor.

---

## Runtime Reports

Plans naturally produce execution evidence. Because each step is named and pre-verified, the runtime can emit a structured report without inferring what happened:

```json
{
  "flow": "createOrder",
  "plan_hash": "sha256:b7c2...",
  "steps_executed": [
    { "kind": "validate_context", "status": "passed" },
    { "kind": "validate_input", "status": "passed" },
    { "kind": "capability_call", "capability": "host.network.outbound", "status": "passed" },
    { "kind": "capability_call", "capability": "host.database.write", "status": "passed" },
    { "kind": "capability_call", "capability": "host.audit.write", "status": "passed" },
    { "kind": "response", "status": "passed", "privacy_applied": true }
  ],
  "capabilities_used": [
    "host.network.outbound",
    "host.database.write",
    "host.audit.write"
  ],
  "undeclared_capability_attempts": [],
  "timeout_ms": 5000,
  "elapsed_ms": 312,
  "limits_enforced": true,
  "privacy_redactions_applied": ["cardNumber", "billingEmail"],
  "capability_proof_status": "passed",
  "runtime_enforcement_status": "clean"
}
```

The report is fed into the attestation chain as the `execution_proof_hash`. The audit trail is complete: source proved it → plan described it → runtime executed it → report records it.

---

## Performance Benefits

```text
no AST traversal
  runtime does not walk or interpret tree structures

better caching
  plans are loaded once per deployment or per warm instance
  cold start does not include parsing or type checking

parallel opportunities
  independent steps in a plan can be identified at compile time
  runtime can schedule parallel capability calls safely

smaller footprint
  plans are compact YAML/binary
  no parser structures, no metadata, no comments in the hot path

predictable execution time
  no dynamic resolution; steps are enumerated and bounded
  timeout and limit enforcement is built into the plan
```

---

## Phase 13 Vision

Phase 13 moves Galerina from interpreter-driven to plan-driven execution:

```text
Current (interpreter-driven):
  source → AST → runtime walks AST → execution

Phase 13 target (plan-driven):
  source → AST → Typed AST → SemanticGraph → GIR → Passive Execution Plan → runtime executes plan
```

The Semantic Graph, GIR, and Passive Execution Planner are the three Phase 13 components that enable this shift. The compiler becomes the place where understanding happens. The runtime becomes the place where governed execution happens.

---

## Final Principle

> **Source → Verified Plan → Governed Execution → Runtime Report → Audit Proof**

---

## Rules at a Glance

```text
RULE 1   Plans contain validated operations, capability requirements, execution order, type info, and runtime boundaries.
RULE 2   Plans do NOT contain AST nodes, comments, intent text, AI metadata, or readable logic forms.
RULE 3   The compiler does expensive verification once; the runtime executes the pre-verified plan.
RULE 4   Static capability proofs happen before plan generation; results go into approved_capabilities.
RULE 5   Plans are immutable and hash-verified before execution begins.
RULE 6   capabilityHost accepts only capability IDs listed in approved_capabilities.
RULE 7   denied_capabilities is a closed set; any attempt to invoke them is rejected.
RULE 8   The runtime enforces timeouts, limits, and privacy rules from the plan.
RULE 9   The same plan can execute on CPU, GPU, WASM, or NPU runtimes.
RULE 10  Every plan execution produces a runtime report that feeds the attestation chain.
RULE 11  Source → Verified Plan → Governed Execution → Runtime Report → Audit Proof.
```

---

## See Also

- `galerina-static-capability-proofs.md` — capability proofs that feed approved_capabilities
- `galerina-metadata-erasure.md` — what is erased to produce the plan
- `galerina-semantic-graph-system.md` — rich metadata model (upstream of the plan)
- `galerina-gir-schema.md` — Governed IR (immediate upstream of plan generation)
- `galerina-phase-13-decisions.md` — Decision 3 (compiler graph), Decision 5 (canonical hashing)
- `galerina-concept-governed-execution-plan.md` — governed execution plan concept
- `galerina-proof-chain-spec.md` — attestation chain spec
- `galerina-runtime-lifecycle.md` — runtime startup and plan loading
- `neutral-governed-ir.md` — neutral IR specification
- `runtime-assembler.md` — how plans are assembled for target runtimes
