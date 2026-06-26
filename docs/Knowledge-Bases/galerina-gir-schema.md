# Galerina Governed Intermediate Representation (GIR) Schema

## Definition

The Governed Intermediate Representation (GIR) is emitted after parsing,
name resolution, type checking, effect checking, value-state checking, and
governance checks succeed.

GIR is not executable source. It is the compiler's machine-readable governance
contract for planning, lowering, auditing, and proof generation.

## TL;DR
- GIR is emitted only when all checkers produce zero errors
- Records: flow name/qualifier, effects declared/observed, protected values, audit, compute targets
- Never contains raw secrets or unredacted protected payloads

## Minimal Flow Shape

```yaml
# example.gir.yaml
flow:
  name: string
  qualifier: pure | guarded | secure
  effects:
    declared: [string]
    observed: [string]
    status: compliant | violation
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

## Field Semantics

| Field | Meaning |
|---|---|
| `flow.name` | Source flow name. |
| `flow.qualifier` | One of `pure`, `guarded`, or `secure`. |
| `effects.declared` | Effects listed in the source `contract.effects {}` block. |
| `effects.observed` | Effects inferred from the checked body, including local `fn` helpers and transitive calls. |
| `effects.status` | `compliant` when observed effects are covered by declarations; `violation` only appears in failed/check reports, not successful GIR emission. |
| `intent.declared` | Source `intent "..."` string, or `null`. |
| `intent.status` | Governance result for the declared intent, or `null` when no intent was required. |
| `protected_values` | Values carrying `protected Type` governance labels. |
| `audit.protected_values_redacted` | Whether every protected value that reaches audit/output is redacted or policy-approved. |
| `execution.preferred` | Compute targets from `compute target { prefer [...] }`. |
| `execution.denied` | Denied targets, capabilities, or placement categories from `deny [...]`. |
| `execution.fallback` | Required fallback target, or `null`. |
| `proofs` | Named proof obligations and their final status. |

## Example

Source:

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
    - name: effects_declared
      status: satisfied
    - name: intent_matches_behavior
      status: satisfied
    - name: denied_targets_not_selected
      status: satisfied
```

## Invariants

- Successful GIR must not contain undeclared observed effects.
- Successful GIR must not contain raw secret or unredacted protected payloads.
- GIR may contain protected value names and type names, but not protected value
  contents.
- Compute preferences are planning constraints only; they must not grant
  authority or alter source meaning.
- Every proof entry must be machine-readable and source-mapped by the compiler
  report layer.

## Compiler Status

```text
Schema status: specified.
Emitter status: pending after Phase 5+ semantic checks.
Consumer status: target planner, audit proof generator, and runtime lowering pending.
```

