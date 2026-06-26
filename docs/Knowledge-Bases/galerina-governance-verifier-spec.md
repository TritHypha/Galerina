# Galerina Governance Verifier Specification

## Status

```text
Governance verifier: specified - implementation Phase 8
Compiler pass:       Pass 7, after effect checker and before GIR emission
```

This document defines the governance verifier, the compiler pass that confirms
declared intent, policy, authority, audit, and compute governance match observed
program behaviour.

---

## Rules at a Glance

- Governance verification runs after symbol, type, value-state, and effect
  checks.
- It combines checker evidence; it does not re-parse source or infer effects
  independently.
- Intent guides policy and optimisation, not permission.
- Protected external sharing requires authority or policy evidence.
- Denied compute targets and remote execution rules fail closed.
- GIR emission is blocked by governance errors.

---

## TL;DR
- Runs after all checker passes — combines their evidence for governance-level assertions
- Intent guides optimisation, not permission
- GIR emission is blocked by governance errors

---

## Purpose

The governance verifier confirms that declared intent matches observable
behaviour. It runs after all checker passes have completed, combining their
results to make governance-level assertions.

Inputs:

- checked AST
- `FlowMeta`
- symbol resolution evidence
- type checker evidence
- value-state evidence
- effect checker evidence
- deployment profile

Outputs:

- `GovernanceDiagnostic[]`
- proof obligations for GIR
- intent status
- policy and authority evidence

## What the Governance Verifier Checks

### Intent/Behaviour Consistency

Diagnostic: `SPORE-GOV-001` or `SPORE-INTENT-001`

If a flow declares:

```galerina
intent "Score fraud locally"
```

but observed effects or target evidence show remote execution, the verifier
emits an intent mismatch.

### Audit Requirement from Intent

Diagnostic: `SPORE-GOV-002`

Optional policy rule:

```text
If a flow declares intent and uses governed write effects such as
database.write, but AuditLog.write() is never observed, emit a governance
warning or profile-dependent error.
```

Not all writes require audit in every profile. Regulated profiles may promote
this to an error.

### Protected Data Sent Externally Without Authority

Diagnostic: `SPORE-GOV-003`

If a protected binding flows to an external network sink such as `http.post`
without an authority or policy block approving the sharing, the verifier flags
the flow.

### Compute Target Deny Violations

Diagnostic: `SPORE-GOV-004`

If a flow declares:

```galerina
compute target best {
  deny [remote.execution]
}
```

but observed behaviour includes `remote.execution`, the verifier emits a denied
target violation.

### Policy Purpose/Behaviour Mismatch

Diagnostic: `SPORE-GOV-005`

If a policy declares:

```galerina
purpose "appointment_reminder"
```

but the flow calls a marketing API or otherwise behaves outside that purpose,
the verifier emits a purpose mismatch.

## SPORE-GOV Diagnostic Series

| Code | Name | Meaning |
|---|---|---|
| `SPORE-GOV-001` | `INTENT_BEHAVIOR_MISMATCH` | Declared intent conflicts with observed behaviour. |
| `SPORE-GOV-002` | `MISSING_AUDIT_FOR_GOVERNED_SINK` | A governed sink lacks required audit evidence under profile policy. |
| `SPORE-GOV-003` | `PROTECTED_DATA_SENT_EXTERNALLY_WITHOUT_AUTHORITY` | Protected value reaches external network sink without authority. |
| `SPORE-GOV-004` | `DENIED_TARGET_SELECTED` | A denied target or placement category was selected or observed. |
| `SPORE-GOV-005` | `POLICY_PURPOSE_MISMATCH` | Policy purpose does not match observed behaviour. |
| `SPORE-GOV-006` | `GOVERNANCE_PROOF_REQUIRED_BUT_MISSING` | Required governance proof obligation is missing. |
| `SPORE-GOV-007` | `AUTHORITY_BLOCK_MISSING_REASON` | Authority block lacks required reason or approval evidence. |
| `SPORE-GOV-008` | `EXPERIMENTAL_CODE_IN_PRODUCTION_PROFILE` | Experimental code is used in a production profile. |
| `SPORE-GOV-009` | `PRIVILEGED_FLOW_MISSING_CAPABILITY` | Privileged flow lacks a required capability declaration. |
| `SPORE-GOV-010` | `INTENT_MISSING_ON_SECURE_FLOW` | Secure flow requires intent under selected profile. |

## CEC Governance Mapping

| Example | Expected governance rule |
|---|---|
| `docs/Examples/Level-5-Governance/203-intent-mismatch-invalid` | `SPORE-GOV-001` |
| `docs/Examples/Level-5-Governance/204-remote-execution-denied` | valid denied target declaration |
| `docs/Examples/Level-5-Governance/205-remote-execution-violation` | `SPORE-GOV-004` |
| `docs/Examples/Level-5-Governance/206-protected-data-sharing-authority` | valid authority evidence |
| `docs/Examples/Level-5-Governance/207-protected-data-sharing-missing-authority` | `SPORE-GOV-003` |
| `docs/Examples/Level-5-Governance/208-audit-proof-required` | valid audit evidence |
| `docs/Examples/Level-5-Governance/209-audit-proof-missing` | `SPORE-GOV-002` or `SPORE-GOV-006` |
| `docs/Examples/Level-5-Governance/210-governed-execution-plan` | valid GIR proof inputs |
| `docs/Examples/Level-5-Governance/211-policy-block-allows-purpose` | valid policy evidence |
| `docs/Examples/Level-5-Governance/212-policy-purpose-mismatch` | `SPORE-GOV-005` |

## Compiler Status

```text
Governance verifier: specified - implementation Phase 8
Diagnostic series:    specified
GIR proof integration: specified - implementation Phase 8
```

## See Also

- `docs/Knowledge-Bases/galerina-compiler-pipeline.md`
- `docs/Knowledge-Bases/galerina-gir-schema.md`
- `docs/Knowledge-Bases/galerina-ast-to-gir.md`
- `docs/Knowledge-Bases/governed-execution-director.md`
- `docs/Knowledge-Bases/galerina-audit-writer-spec.md`
- `docs/Knowledge-Bases/galerina-proof-chain-spec.md`
- `docs/Knowledge-Bases/compiler-diagnostics.md`
