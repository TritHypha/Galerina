# Galerina — Contracts as the Meaning Layer

## Status

```
Architecture philosophy document
Core to Galerina's "what / why / how" model
```

## TL;DR
- Flows own execution; contracts own meaning; global scope owns shared facts
- Contracts bridge human meaning and machine governance
- Without contracts, the compiler knows HOW; with contracts, it also knows WHAT and WHY

---

## The Three-Part Architecture

```
Global Scope = Shared Facts
Contract     = Flow Meaning
Flow Body    = Flow Execution
```

This single statement explains almost the entire Galerina architecture.

---

## Without Contracts

The compiler sees:
```galerina
let email: protected Email = validate.email(rawEmail)?
AuditLog.write({ email: redact(email) })
PatientsDB.insert({ email: email })?
```

It can build a type graph, check effects, and validate value-state.

But it doesn't know: **why?**

---

## With Contracts

```galerina
contract {
  intent { "Create a patient record while protecting PII." }
  events { emits PatientCreated }
}
```

Now the compiler knows:
- **What** — patient record creation
- **Why** — protecting PII is the governance objective
- **How** — the body implements this

---

## The Pipeline Connection

```
Intent (from contract)
  ↓
Governed Execution Plan (GIR includes contract facts)
  ↓
Coordinated Compute (IGO uses intent as optimisation signal)
  ↓
Runtime Report (events emitted, declared in contract)
  ↓
Audit Proof (contract intent vs. observed behaviour)
```

Contracts become the **bridge between human meaning and machine governance**.

---

## Audit Proof Enhancement

Today, audit proof can prove: what happened.

With contracts, it proves:
```yaml
flow: createPatient

declared_intent:
  Create patient while protecting PII

observed_behaviour:
  validated_email: true
  database_write: true
  audit_write: true
  protected_values_redacted: true

status: compliant
```

This is much stronger governance than just "here's what ran."

---

## Security Impact

**Without contracts:** Implementation first, meaning second.

**With contracts:** Meaning first, implementation second.

A reviewer can immediately ask: "Does the implementation match the contract?" before reading a single line of the body.

---

## Future Contract Sections

The current proposal (`types`, `intent`, `rules`, `events`) is only the beginning:

```galerina
contract {
  types {}          // flow-local type aliases
  intent {}         // machine-readable purpose (IGO signal)
  rules {}          // enforceable constraints
  events {}         // declared event emissions
  governance {}     // future: data sharing policy
  targets {}        // future: compute target preferences
  examples {}       // future: testable examples for AI/docs/testing
}
```

---

## See Also

- `docs/Knowledge-Bases/galerina-flow-contracts.md`
- `docs/Knowledge-Bases/galerina-contract-sets.md`
- `docs/Knowledge-Bases/galerina-no-variables-outside-flows.md`
- `docs/Knowledge-Bases/galerina-intent-guided-optimisation.md`
