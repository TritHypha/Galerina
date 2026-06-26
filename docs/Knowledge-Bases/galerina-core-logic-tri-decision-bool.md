# Galerina Core Logic: Tri Logic, Decision Logic, and Bool Boundary Rules

> **Canonical name:** `Tri` — Galerina's three-valued truth type (`True`, `False`, `Unknown`).
> Older docs may say `tristate`, `tri-decision`, or `TriState` — all refer to the same type.
> `Tri` is **not** a trie (prefix-tree data structure). The names are unrelated.
> For operator rules on `Tri`, see `docs/Knowledge-Bases/operator-type-rules.md`.

## Status

```text
Package: galerina-core-logic
Area: Tri logic, Decision logic, Bool boundary rules
Version target: v0.2
Implementation status: fully specified, implementation pending
Canonical diagnostics:
  - SPORE-TRI-001 through SPORE-TRI-005
  - SPORE-DECISION-001 through SPORE-DECISION-005
  - SPORE-BOOL-BOUNDARY-001 through SPORE-BOOL-BOUNDARY-005
```

Tri logic, Decision logic, and Bool boundary rules form Galerina's deterministic governance logic layer.

They model uncertainty, policy outcomes, and safe conversion into runtime booleans.

---

# Design Goals

```text
explicit uncertainty
no truthy/falsy coercion
deny-first policy decisions
fail-closed runtime Bool conversion
traceable unknown reasons
safe governance composition
```

Tri values may represent uncertainty.

Decision values may represent policy outcomes.

Runtime Bool values must remain deterministic and safe.

---

# TriState

TriState is a discriminated union, not a numeric enum.

```ts
export type TriState =
  | { kind: "true"; value: true }
  | { kind: "false"; value: false }
  | { kind: "unknown"; reasons: UnknownReason[] }
```

---

# Tri Constants

```ts
export const TRI_TRUE: TriState = { kind: "true", value: true }
export const TRI_FALSE: TriState = { kind: "false", value: false }
```

---

# UnknownReason

```ts
export interface UnknownReason {
  code: string
  message: string
  source?: string
}
```

---

# triUnknown()

```ts
export function triUnknown(reason: UnknownReason): TriState {
  return { kind: "unknown", reasons: [reason] }
}
```

---

# combineUnknownReasons()

```ts
export function combineUnknownReasons(states: TriState[]): UnknownReason[] {
  return states.flatMap(state =>
    state.kind === "unknown" ? state.reasons : []
  )
}
```

---

# Tri Operations

```ts
export function triNot(value: TriState): TriState {
  switch (value.kind) {
    case "true":
      return TRI_FALSE
    case "false":
      return TRI_TRUE
    case "unknown":
      return value
  }
}
```

```ts
export function triAnd(left: TriState, right: TriState): TriState {
  if (left.kind === "false" || right.kind === "false") {
    return TRI_FALSE
  }

  if (left.kind === "unknown" || right.kind === "unknown") {
    return {
      kind: "unknown",
      reasons: combineUnknownReasons([left, right])
    }
  }

  return TRI_TRUE
}
```

```ts
export function triOr(left: TriState, right: TriState): TriState {
  if (left.kind === "true" || right.kind === "true") {
    return TRI_TRUE
  }

  if (left.kind === "unknown" || right.kind === "unknown") {
    return {
      kind: "unknown",
      reasons: combineUnknownReasons([left, right])
    }
  }

  return TRI_FALSE
}
```

---

# Decision

Decision is a discriminated union used for governance outcomes.

```ts
export type Decision =
  | { kind: "allow"; reason: string; evidence: DecisionEvidence[] }
  | { kind: "deny"; reason: string; evidence: DecisionEvidence[] }
  | { kind: "review"; reason: string; evidence: DecisionEvidence[] }
  | { kind: "unknown"; reasons: UnknownReason[]; evidence: DecisionEvidence[] }
```

---

# DecisionEvidence

```ts
export interface DecisionEvidence {
  type: "policy" | "capability" | "effect" | "boundary" | "target" | "runtime"
  id: string
  message: string
}
```

---

# Decision Constructors

```ts
export function allow(reason: string, evidence: DecisionEvidence[] = []): Decision {
  return { kind: "allow", reason, evidence }
}

export function deny(reason: string, evidence: DecisionEvidence[] = []): Decision {
  return { kind: "deny", reason, evidence }
}

export function review(reason: string, evidence: DecisionEvidence[] = []): Decision {
  return { kind: "review", reason, evidence }
}

export function unknownDecision(
  reasons: UnknownReason[],
  evidence: DecisionEvidence[] = []
): Decision {
  return { kind: "unknown", reasons, evidence }
}
```

---

# combineDecisions()

Decision composition is deny-first.

Priority order:

```text
deny
review
unknown
allow
```

```ts
export function combineDecisions(decisions: Decision[]): Decision {
  const denied = decisions.find(decision => decision.kind === "deny")
  if (denied) return denied

  const needsReview = decisions.find(decision => decision.kind === "review")
  if (needsReview) return needsReview

  const unknown = decisions.find(decision => decision.kind === "unknown")
  if (unknown) return unknown

  return allow(
    "All decisions allowed.",
    decisions.flatMap(decision => decision.evidence)
  )
}
```

---

# decisionToRuntimeBool()

Runtime Bool conversion must fail closed.

```ts
export function decisionToRuntimeBool(decision: Decision): boolean {
  switch (decision.kind) {
    case "allow":
      return true
    case "deny":
    case "review":
    case "unknown":
      return false
  }
}
```

---

# Bool Boundary Rules

Galerina does not allow implicit Tri/Decision to Bool coercion.

```text
TriState -> Bool requires validateBoolBoundary()
Decision -> Bool requires decisionToRuntimeBool()
unknown -> false by default at runtime boundary
review -> false by default at runtime boundary
deny -> false
allow -> true
```

---

# BoolBoundaryResult

```ts
export interface BoolBoundaryResult {
  allowed: boolean
  value: boolean
  diagnostics: CompilerDiagnostic[]
  reason: string
}
```

---

# validateBoolBoundary()

```ts
export function validateBoolBoundary(
  input: TriState | Decision,
  context: BoolBoundaryContext
): BoolBoundaryResult {
  if (isTriState(input)) {
    if (input.kind === "true") {
      return {
        allowed: true,
        value: true,
        diagnostics: [],
        reason: "Tri true converted to runtime Bool true."
      }
    }

    if (input.kind === "false") {
      return {
        allowed: true,
        value: false,
        diagnostics: [],
        reason: "Tri false converted to runtime Bool false."
      }
    }

    return {
      allowed: false,
      value: false,
      diagnostics: [{
        code: "SPORE-BOOL-BOUNDARY-001",
        severity: "error",
        message: "Tri unknown cannot cross runtime Bool boundary as true."
      }],
      reason: "Unknown values fail closed at runtime Bool boundaries."
    }
  }

  return {
    allowed: input.kind === "allow",
    value: decisionToRuntimeBool(input),
    diagnostics: input.kind === "allow" ? [] : [{
      code: "SPORE-BOOL-BOUNDARY-002",
      severity: "error",
      message: `Decision ${input.kind} converted to runtime Bool false.`
    }],
    reason: `Decision ${input.kind} converted using fail-closed Bool policy.`
  }
}
```

---

# CapabilityRequest

```ts
export interface CapabilityRequest {
  capability: string
  effect?: string
  actor: string
  target?: string
  evidence: DecisionEvidence[]
}
```

---

# PolicyContext

```ts
export interface PolicyContext {
  environment: "development" | "test" | "staging" | "production"
  grantedCapabilities: string[]
  deniedCapabilities: string[]
  requiredPolicies: string[]
  evidence: DecisionEvidence[]
}
```

---

# evaluateCapability()

Capability evaluation is deny-first.

```ts
export function evaluateCapability(
  request: CapabilityRequest,
  context: PolicyContext
): Decision {
  if (context.deniedCapabilities.includes(request.capability)) {
    return deny(
      `Capability ${request.capability} is explicitly denied.`,
      request.evidence
    )
  }

  if (!context.grantedCapabilities.includes(request.capability)) {
    return deny(
      `Capability ${request.capability} is not granted.`,
      request.evidence
    )
  }

  if (context.requiredPolicies.length > 0 && context.evidence.length === 0) {
    return review(
      "Required policy evidence is missing.",
      request.evidence
    )
  }

  return allow(
    `Capability ${request.capability} is granted.`,
    request.evidence
  )
}
```

---

# Diagnostic Codes

## SPORE-TRI

| Code | Meaning |
| --- | --- |
| `SPORE-TRI-001` | Invalid TriState shape |
| `SPORE-TRI-002` | Unknown state missing reason |
| `SPORE-TRI-003` | Invalid Tri operation |
| `SPORE-TRI-004` | Tri converted to Bool without boundary validation |
| `SPORE-TRI-005` | Tri report contains unsafe value |

## SPORE-DECISION

| Code | Meaning |
| --- | --- |
| `SPORE-DECISION-001` | Invalid Decision shape |
| `SPORE-DECISION-002` | Decision missing evidence |
| `SPORE-DECISION-003` | Non-deny decision used despite denial evidence |
| `SPORE-DECISION-004` | Decision converted to Bool without fail-closed policy |
| `SPORE-DECISION-005` | Unknown decision lacks unknown reasons |

## SPORE-BOOL-BOUNDARY

| Code | Meaning |
| --- | --- |
| `SPORE-BOOL-BOUNDARY-001` | Tri unknown attempted to cross Bool boundary |
| `SPORE-BOOL-BOUNDARY-002` | Non-allow Decision converted to Bool false |
| `SPORE-BOOL-BOUNDARY-003` | Implicit truthy/falsy conversion attempted |
| `SPORE-BOOL-BOUNDARY-004` | Review decision used as runtime true |
| `SPORE-BOOL-BOUNDARY-005` | Bool boundary result missing diagnostics or reason |

---

# Fail-Closed Rules

The logic package must never:

```text
coerce unknown to true
coerce review to true
allow truthy/falsy conversion
ignore deny-first composition
let advisory logic override runtime Bool enforcement
```

---

# Summary

The v0.2 deterministic logic contracts are:

```text
TriState
TRI_TRUE
TRI_FALSE
triUnknown
combineUnknownReasons
Decision
Decision constructors
decisionToRuntimeBool
combineDecisions
CapabilityRequest
PolicyContext
evaluateCapability
BoolBoundaryResult
validateBoolBoundary
```

Tri and Decision logic may model uncertainty and governance reasoning.

Runtime Bool boundaries must remain deterministic and fail closed.
