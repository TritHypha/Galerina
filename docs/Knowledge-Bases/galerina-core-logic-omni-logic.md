# Galerina Core Logic: Omni Logic

## Status

```text
Package: galerina-core-logic
Area: Omni logic
Version target: v0.2
Implementation status: advisory/research model only
Canonical diagnostics:
  - SPORE-OMNI-001 through SPORE-OMNI-005
```

Omni Logic is Galerina's advisory multi-state reasoning model.

It extends deterministic Tri and Decision logic with richer reasoning states for AI, distributed systems, policy analysis, uncertainty modelling, and conflicting evidence.

Omni Logic is advisory only.

It must never override deterministic runtime governance.

---

# Design Goals

```text
model uncertainty
represent conflicting evidence
track confidence and ambiguity
support explainable reasoning
preserve deterministic runtime enforcement
prevent advisory logic from granting authority
```

---

# OmniState

Omni Logic uses eight explicit reasoning states.

```ts
export type OmniState =
  | "true"
  | "false"
  | "unknown"
  | "partial_true"
  | "partial_false"
  | "conflicted"
  | "deferred"
  | "inconsistent"
```

---

# State Definitions

| State | Meaning |
| --- | --- |
| `true` | Evidence strongly supports truth |
| `false` | Evidence strongly supports falsehood |
| `unknown` | Insufficient information |
| `partial_true` | Some evidence supports truth |
| `partial_false` | Some evidence supports falsehood |
| `conflicted` | Strong evidence exists on both sides |
| `deferred` | Evaluation intentionally postponed |
| `inconsistent` | Input graph or reasoning state is contradictory |

---

# OmniDecision

```ts
export interface OmniDecision {
  state: OmniState

  /** Confidence score from 0 to 1. */
  confidence: number

  /** Human-readable explanation strings. */
  reasons: string[]

  /** Supporting evidence references. */
  evidence: OmniEvidence[]

  /** Whether runtime governance may continue evaluation. */
  advisoryOnly: true
}
```

---

# OmniEvidence

```ts
export interface OmniEvidence {
  id: string

  type:
    | "policy"
    | "runtime"
    | "effect"
    | "boundary"
    | "ai"
    | "human_review"
    | "external"

  message: string

  weight?: number
}
```

---

# Omni Safety Rules

Omni Logic must never:

```text
grant runtime authority directly
bypass Bool boundary enforcement
override Decision deny results
convert uncertainty into allow
silently collapse conflicting evidence
```

Omni Logic may:

```text
assist planning
assist explain tooling
assist governance reporting
assist advisory AI reasoning
assist confidence modelling
```

---

# omniToDecision()

Conversion into deterministic Decision values must remain conservative.

```ts
export function omniToDecision(
  omni: OmniDecision
): Decision {
  switch (omni.state) {
    case "true":
      return allow(
        "Omni logic produced advisory true state.",
        []
      )

    case "false":
      return deny(
        "Omni logic produced advisory false state.",
        []
      )

    case "partial_true":
    case "partial_false":
    case "unknown":
    case "conflicted":
    case "deferred":
    case "inconsistent":
      return review(
        `Omni state ${omni.state} requires deterministic review.`,
        []
      )
  }
}
```

---

# Example OmniDecision

```ts
const advisoryDecision: OmniDecision = {
  state: "conflicted",
  confidence: 0.61,
  reasons: [
    "Policy evidence allows operation.",
    "Runtime telemetry indicates elevated risk."
  ],
  evidence: [
    {
      id: "policy_001",
      type: "policy",
      message: "Capability appears granted."
    },
    {
      id: "runtime_001",
      type: "runtime",
      message: "Runtime anomaly score elevated."
    }
  ],
  advisoryOnly: true
}
```

---

# Deterministic Boundary Rules

Omni Logic cannot directly cross runtime Bool boundaries.

Required flow:

```text
OmniDecision
  -> Decision
  -> validateBoolBoundary()
  -> runtime Bool
```

Forbidden flow:

```text
OmniDecision -> runtime Bool
```

---

# Diagnostic Codes

| Code | Meaning |
| --- | --- |
| `SPORE-OMNI-001` | Invalid Omni state |
| `SPORE-OMNI-002` | Omni confidence outside valid range |
| `SPORE-OMNI-003` | Omni reasoning missing evidence |
| `SPORE-OMNI-004` | Omni logic attempted direct runtime Bool conversion |
| `SPORE-OMNI-005` | Omni advisory result attempted authority escalation |

---

# Runtime Policy

The runtime must treat Omni Logic as:

```text
advisory
non-authoritative
non-deterministic
explainable
policy-constrained
```

The runtime must not:

```text
execute privileged effects from Omni logic alone
allow advisory uncertainty to bypass governance
allow Omni states to bypass capability checks
```

---

# Recommended File Layout

```text
packages-galerina/galerina-core-logic/src/

  omni/
    omni-state.ts
    omni-decision.ts
    omni-evidence.ts
    omni-to-decision.ts
    omni-diagnostics.ts
```

---

# Summary

The v0.2 Omni Logic model defines:

```text
OmniState
OmniDecision
OmniEvidence
omniToDecision
```

Omni Logic provides richer advisory reasoning.

Deterministic runtime governance still depends on:

```text
Decision logic
Bool boundary enforcement
capability evaluation
runtime policy
```
