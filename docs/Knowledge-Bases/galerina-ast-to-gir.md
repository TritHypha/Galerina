# Galerina AST to GIR Transformation

## Status

```text
Pass 8 specification
Depends on: clean outputs from passes 3-7
Schema: docs/Knowledge-Bases/galerina-gir-schema.md
Emitter status: Phase 8+
```

This document specifies how the fully checked AST is transformed into the
Governed Intermediate Representation (GIR). The GIR schema is defined in
`galerina-gir-schema.md`; this document defines extraction and mapping rules.

---

## Rules at a Glance

- GIR emission runs only after symbol, type, value-state, effect, and governance
  checks produce zero errors.
- GIR records governance facts, not raw protected data.
- `effects.declared` comes from source effects clauses.
- `effects.observed` comes from the effect checker, including local `fn` bodies
  and transitive flow calls.
- `protected_values` records binding names and base type names only.
- `redacted` bindings and `redact(...)` calls satisfy audit redaction evidence.
- Compute targets guide placement; they do not grant authority.
- Successful GIR must have `effects.status: compliant`.

---

## Input: Checked AST

The checked AST is the parser AST enriched by checker evidence from passes 3-7.
After all checks pass, the GIR emitter can safely extract:

- Flow declarations -> GIR flow entries
- Declared effects -> `effects.declared`
- Inferred effects -> `effects.observed`
- Protected value bindings -> `protected_values`
- Redacted bindings and redact calls -> audit proof evidence
- Intent declarations -> `intent.declared`
- Governance verifier result -> `intent.status` and proof statuses
- Compute target blocks -> `execution.preferred`, `execution.denied`,
  `execution.fallback`
- Authority and policy blocks -> proof obligations and governance evidence
- Flow qualifier -> `flow.qualifier`

The emitter must not infer new authority, repair diagnostics, or widen effect
sets. It serializes facts already proven by earlier passes.

---

## Output: GIR

The minimal successful GIR flow shape is:

```yaml
flow:
  name: string
  qualifier: pure | guarded | secure
  effects:
    declared: [string]
    observed: [string]
    status: compliant
  intent:
    declared: string | null
    status: satisfied | mismatch | null
  protected_values:
    - name: string
      type: string
  audit:
    protected_values_redacted: bool
  execution:
    preferred: [cpu | gpu | npu | wasm | photonic | ai_accelerator]
    denied: [string]
    fallback: string | null
  proofs:
    - name: string
      status: satisfied | missing | failed
```

Failed checker output may include GIR-like reports for debugging, but successful
GIR must not encode known semantic violations.

---

## Flow Declaration Mapping

AST nodes:

```text
flowDecl
pureFlowDecl
guardedFlowDecl
secureFlowDecl
```

Mapping:

| AST | GIR |
|---|---|
| `.value` | `flow.name` |
| `flowDecl` | `flow.qualifier: guarded` or implementation-specific plain `flow` lowering policy |
| `pureFlowDecl` | `flow.qualifier: pure` |
| `guardedFlowDecl` | `flow.qualifier: guarded` |
| `secureFlowDecl` | `flow.qualifier: secure` |
| `paramDecl` children | source map/type evidence, not part of minimal GIR shape |
| return `typeRef` child | source map/type evidence, not part of minimal GIR shape |
| body `block` child | scanned for protected values, redaction evidence, compute, authority, policy, and proof facts |

Plain `flowDecl` is a legacy/general form. If a target GIR schema only accepts
`pure | guarded | secure`, the emitter must lower a plain `flowDecl` to
`guarded` when effects are declared or observed, and to `pure` only when all
semantic checks prove no effects are possible.

---

## Effects Mapping

Declared effects:

```text
effectsDecl.children[*].value -> effects.declared
FlowMeta.declaredEffects      -> effects.declared
```

Observed effects:

```text
EffectCheckResult observed evidence -> effects.observed
```

Status:

```text
effects.status = compliant
```

Emission rule:

```text
If any observed effect is not covered by declared effects, pass 6 emits an
SPORE-EFFECT-* error and GIR emission does not run.
```

Direct effects, effects inside local `fn` helpers, and transitive flow-call
effects must all be reflected in `effects.observed`.

Example:

```galerina
guarded flow saveOrder(order: Order) -> SaveOrderResult
contract {
  types {
    type SaveOrderResult = Result<OrderId, OrderError>
  }
  effects {
    database.write
  }
}
{
  let orderId = OrdersDB.insert(order)?
  return Ok(orderId)
}
```

GIR fragment:

```yaml
effects:
  declared:
    - database.write
  observed:
    - database.write
  status: compliant
```

---

## Intent Mapping

AST source:

```text
intent declaration attached to a flow
```

Mapping:

| Source | GIR |
|---|---|
| `intent "Save a customer order"` | `intent.declared: "Save a customer order"` |
| governance verifier satisfied | `intent.status: satisfied` |
| governance verifier mismatch | no successful GIR; failed report may show `mismatch` |
| no intent and no requirement | `intent.declared: null`, `intent.status: null` |

Example from `docs/Examples/Level-5-Governance/201-intent-basic`:

```yaml
intent:
  declared: "Save a customer order"
  status: satisfied
```

Intent is an optimisation and governance signal. It must not grant permission or
add effects.

---

## Protected and Redacted Value Mapping

Protected value sources:

```text
paramDecl with protected Type
letDecl / mutDecl / readonlyDecl with protected Type
```

Mapping:

| AST binding | GIR |
|---|---|
| binding name | `protected_values[].name` |
| base type after stripping `protected` | `protected_values[].type` |

Example:

```galerina
let email: protected Email = patient.email
```

GIR fragment:

```yaml
protected_values:
  - name: email
    type: Email
```

The emitter must strip governance type qualifiers before recording the base type.
`protected Email` is a governed type annotation, not a distinct nominal type.

Redaction evidence sources:

```text
let auditId: redacted PatientId = redact(patientId)
redact(protectedValue)
AuditLog.write({ field: redactedBinding })
```

Mapping:

```text
audit.protected_values_redacted = true when every protected value reaching audit,
output, or external sharing is redacted or governance-approved.
```

Example from `docs/Examples/Level-5-Governance/208-audit-proof-required`:

```galerina
let auditId: redacted PatientId = redact(patientId)
AuditLog.write({ patientId: auditId })
```

GIR fragment:

```yaml
protected_values:
  - name: patientId
    type: PatientId
audit:
  protected_values_redacted: true
proofs:
  - name: protected_values_redacted
    status: satisfied
```

Raw protected values must never be serialized into GIR.

---

## Compute Target Mapping

AST source:

```galerina
compute target best {
  prefer [npu, gpu, cpu]
  deny [remote.execution]
  fallback cpu
}
```

Mapping:

| Source | GIR |
|---|---|
| `prefer [...]` | `execution.preferred` |
| `deny [...]` | `execution.denied` |
| `fallback cpu` | `execution.fallback: cpu` |
| no compute block | default target policy from compiler/runtime profile |

Example from `docs/Examples/Level-5-Governance/204-remote-execution-denied`:

```yaml
execution:
  preferred:
    - npu
    - gpu
    - cpu
  denied:
    - remote.execution
  fallback: null
proofs:
  - name: denied_targets_not_selected
    status: satisfied
```

Compute target preferences constrain planning only. They must not change
validation, effects, redaction, or authority.

---

## Authority and Policy Mapping

Authority blocks provide governance evidence for sensitive sharing:

```galerina
authority {
  sharing protected PatientData to "specialist-service"
  approved_by "data-governance-board"
}
```

Policy blocks provide allowed-purpose and protected-data routing evidence:

```galerina
policy {
  purpose "appointment_reminder"
  allow protected Email to "patient"
}
```

Minimal GIR stores these as proof obligations and governance evidence. The
current minimal schema does not define a dedicated `authority` or `policy` field,
so the Phase 8 emitter records their result in `proofs`.

Recommended proof names:

```text
authority_declared
protected_sharing_approved
policy_purpose_allowed
policy_destination_allowed
```

Example from `docs/Examples/Level-5-Governance/206-protected-data-sharing-authority`:

```yaml
proofs:
  - name: authority_declared
    status: satisfied
  - name: protected_sharing_approved
    status: satisfied
```

Example from `docs/Examples/Level-5-Governance/211-policy-block-allows-purpose`:

```yaml
proofs:
  - name: policy_purpose_allowed
    status: satisfied
  - name: policy_destination_allowed
    status: satisfied
```

Future GIR schema versions may promote authority and policy evidence into
dedicated structured fields.

---

## Audit Proof Mapping

Audit evidence comes from:

```text
audit.write declared in effects
AuditLog.write(...) observed in flow body
redaction evidence for protected values
governance verifier proof obligations
```

Mapping:

| Evidence | GIR |
|---|---|
| `audit.write` declared and observed | `proofs: audit_write_observed = satisfied` |
| protected value redacted before audit/output | `audit.protected_values_redacted: true` |
| missing audit write when required | no successful GIR; failed report may show `missing` |

Example:

```yaml
proofs:
  - name: effects_declared
    status: satisfied
  - name: audit_write_observed
    status: satisfied
  - name: protected_values_redacted
    status: satisfied
```

---

## Local fn Mapping

`fnDecl` nodes do not become top-level GIR flow entries.

Rules:

- A local `fn` is part of the containing flow body.
- Effects observed inside local `fn` bodies are attributed to the containing
  flow.
- Protected values used inside local `fn` bodies remain part of the containing
  flow's protected-value tracking.
- `fn` declarations cannot add authority, effects clauses, or route exposure.

The GIR emitter should not serialize local helper implementation details unless
a future debug/source-map extension requires it.

---

## Route Mapping

Routes are not part of the minimal flow GIR shape, but they feed runtime
manifest generation.

Route source:

```galerina
route POST "/orders" {
  request CreateOrderRequest
  response OrderResponse
  flow createOrder
}
```

Emitter responsibility:

```text
Record route metadata for the manifest generator.
Validate that route.flow resolves to a declared flow before runtime manifest
generation.
```

Manifest generation is specified in `galerina-core-manifest-generation-v02.md`.

---

## Proof Generation

The emitter serializes proof statuses produced by prior passes. It does not
create new semantic conclusions.

Baseline successful proof names:

```text
symbols_resolved
types_resolved
value_states_valid
effects_declared
intent_matches_behavior
protected_values_redacted
denied_targets_not_selected
audit_write_observed
```

Proof status values:

```text
satisfied
missing
failed
```

Successful GIR should contain only `satisfied` proof entries. `missing` and
`failed` are useful in failed compile reports, but not in clean GIR.

---

## Example: Governed Execution Plan

Source: `docs/Examples/Level-5-Governance/210-governed-execution-plan`

```galerina
secure flow runFraudModel(input: FraudInput) -> RunFraudModelResult
contract {
  types {
    type RunFraudModelResult = Result<FraudScore, FraudError>
  }
  intent {
    "Score a payment transaction for fraud risk on approved hardware"
  }
  effects {
    database.write
    audit.write
  }
}
compute target best {
  prefer [npu, gpu, cpu]
  deny [remote.execution]
}
{
  let score = FraudModel.score(input)
  let id = FraudScoreDB.insert({ input: input, score: score })?
  AuditLog.write({ action: "runFraudModel", score: redact(score) })
  return Ok(score)
}
```

GIR:

```yaml
flow:
  name: runFraudModel
  qualifier: secure
  effects:
    declared:
      - database.write
      - audit.write
    observed:
      - database.write
      - audit.write
    status: compliant
  intent:
    declared: "Score a payment transaction for fraud risk on approved hardware"
    status: satisfied
  protected_values: []
  audit:
    protected_values_redacted: true
  execution:
    preferred:
      - npu
      - gpu
      - cpu
    denied:
      - remote.execution
    fallback: null
  proofs:
    - name: symbols_resolved
      status: satisfied
    - name: types_resolved
      status: satisfied
    - name: effects_declared
      status: satisfied
    - name: intent_matches_behavior
      status: satisfied
    - name: denied_targets_not_selected
      status: satisfied
    - name: audit_write_observed
      status: satisfied
```

---

## Emission Preconditions

GIR emission must not run when any prior checker emits an error:

```text
SPORE-NAME-* error
SPORE-TYPE-* error
SPORE-VALUESTATE-* error
SPORE-SECRET-* error
SPORE-EFFECT-* error
SPORE-INTENT-* error
SPORE-GOV-* error
```

Warnings may be included in the compile report. A strict profile may choose to
block GIR emission on warnings, but the default rule is zero errors.

---

## Relationship to Runtime

GIR is consumed by the Governed Execution Director, target planners, backend
bridges, audit proof generation, and manifest generation.

The adaptive runtime may optimise execution after GIR is fixed, but it may not
change GIR semantics:

```text
may change: scheduling, batching, caching, memory layout, approved target choice
may never change: security, governance, effects, validation, redaction, meaning
```

---

## See Also

- `docs/Knowledge-Bases/galerina-gir-schema.md`
- `docs/Knowledge-Bases/neutral-governed-ir.md`
- `docs/Knowledge-Bases/galerina-compiler-pipeline.md`
- `docs/Knowledge-Bases/governed-execution-director.md`
- `docs/Knowledge-Bases/galerina-core-manifest-generation-v02.md`
- `docs/Knowledge-Bases/galerina-adaptive-runtime-profiles.md`
- `docs/Knowledge-Bases/galerina-quantum-target-bridge.md`
