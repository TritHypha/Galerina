# Galerina Core — Online Safety Act Age Assurance Policy Model

This document specifies how Galerina supports Online Safety Act-style rules
by making age assurance a first-class policy primitive.

Applies to: `galerina-core-policy`, `galerina-core-logic`, `galerina-core-network`

See also: `galerina-core-logic-tristate-developer-guide.md`,
`galerina-core-logic-v02.md`, `galerina-api-boundary-architecture.md`.

---

## Context

Under the UK Online Safety Act, services in scope may need "highly effective
age assurance" to prevent children accessing age-restricted content. Ofcom
describes effective age assurance as needing to be accurate, robust, reliable,
and fair.

Galerina must not treat age as a normal boolean. Age assurance status is
inherently a tri-logic value — a system may fail to determine age at all,
and that uncertainty must fail closed.

---

## Core Rule

```text
unknown age must never become allow
```

| Age State | Runtime Behaviour |
| --------- | ----------------- |
| `true` (verified adult) | allow |
| `false` (verified minor or failed) | deny |
| `unknown` (could not be determined) | deny |

---

## Policy Primitive Syntax

```galerina
policy AdultContentAccess {
    require ageAssurance >= highlyEffective
    require age >= 18
    require content.category != "child_harm"
    deny if age == unknown
}
```

Route binding:

```galerina
route GET "/adult/video/:id" {
    policy AdultContentAccess
    effect(Network, Audit)
    boundary(External)
}
```

---

## Tri Logic Age Check

Age verification produces a TriState, not a boolean:

```galerina
let ageVerified = verifyAge(user)

match ageVerified {
    true => allow("User is verified adult")

    false => deny("User is under required age")

    unknown(reason) => {
        deny("Age could not be verified")
        audit(reason)
    }
}
```

---

## AgeAssuranceResult Type

```ts
type AgeAssuranceResult =
  | { kind: "verified"; ageBand: "18+" | "13-17" | "under-13"; method: string }
  | { kind: "failed";   reason: string }
  | { kind: "unknown";  reasons: string[] };
```

### ageToDecision()

Converts an `AgeAssuranceResult` into a safe `Decision`:

```ts
function ageToDecision(result: AgeAssuranceResult): Decision {
  if (result.kind === "verified" && result.ageBand === "18+") {
    return allowDecision("Age assurance passed.");
  }

  if (result.kind === "verified") {
    return denyDecision("User is below required age.");
  }

  if (result.kind === "failed") {
    return denyDecision(result.reason);
  }

  return unknownDecision(result.reasons);
}
```

---

## Age Assurance Provider Syntax

Age assurance separates verification from proof storage to minimise data
exposure while still producing auditable evidence:

```galerina
age_check provider "trusted-age-provider" {
    mode = "age_estimation"
    store = "proof_only"
    retain_personal_data = false
}
```

---

## Required Design Primitives

| Primitive | Purpose |
| --------------------- | ----------------------------------- |
| `AgeAssurance` | Age verification result type |
| `ContentClassification` | Content category and risk level |
| `PolicyDecision` | Structured allow/deny outcome |
| `AuditEvidence` | Proof that check occurred |
| `FailClosedUnknown` | Unknown always denies |
| `ChildSafetyBoundary` | Runtime boundary for age-gated routes |

---

## Diagnostic Codes

| Code | Meaning |
| ---------------------- | ----------------------------------------- |
| `SPORE-SAFETY-AGE-001` | Age-restricted route missing age assurance policy |
| `SPORE-SAFETY-AGE-002` | Unknown age state cannot grant access |
| `SPORE-SAFETY-AGE-003` | Self-declared age is not sufficient for this content category |
| `SPORE-SAFETY-AUDIT-001` | Age-gated access decision missing audit evidence |

---

## Why Tri Logic Is the Right Model

The `unknown` state prevents accidental access grants when the age
assurance system is unavailable, times out, or returns an inconclusive
result. This matches the Online Safety Act requirement that assurance
must be "robust" and that uncertainty must not be treated as approval.

```ts
// Bad — unknown used as truthy
if (ageVerified as any) {
  showAdultContent(); // could run when system is down
}

// Good — unknown fails closed
triIf(ageVerified, showAdultContent, denyWithAudit);
```

---

## Alignment with Galerina Systems

| Galerina System | Role in Age Assurance |
| ----------------------------- | --------------------------------- |
| Tri logic | Models uncertain age outcomes |
| Decision logic | Converts to allow/deny/unknown |
| Bool boundary rules | Prevents implicit unknown→true |
| Audit reports | Records evidence of check |
| Boundary checker | Enforces `ChildSafetyBoundary` |
| Governed network runtime | Governs age provider network access |
