# Galerina Logic

`galerina-core-logic` is the governance logic package for Galerina.

## Coverage Reconciliation Status

This README is the current package-level v0.2 contract for runtime-facing logic
docs. Older KB files may still contain the historical `type:` discriminant,
three-state `Decision`, or string-array `triUnknown()` examples. Use the current
shape here and in `docs/Knowledge-Bases/galerina-core-logic-tri-decision-bool.md`
when updating dependent docs:

```text
TriState.kind: "true" | "false" | "unknown"
Decision.kind: "allow" | "deny" | "review" | "unknown"
Decision.evidence: DecisionEvidence[]
Unknown/review -> runtime Bool false
Omni uncertainty -> review()
```

It belongs in:

```text
/packages-galerina/galerina-core-logic
```

The package defines:

```text
Tri logic
Decision logic
Bool boundary enforcement
Omni logic
capability evaluation
policy composition
runtime-safe Bool conversion
```

---

# Public v0.2 Contracts

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
OmniState
OmniDecision
OmniEvidence
omniToDecision
```

---

# Tri Logic

Tri logic models explicit uncertainty.

TriState is a discriminated union.

```ts
export type TriState =
  | { kind: "true"; value: true }
  | { kind: "false"; value: false }
  | { kind: "unknown"; reasons: UnknownReason[] }
```

---

## Tri Constants

```ts
export const TRI_TRUE: TriState = {
  kind: "true",
  value: true
}

export const TRI_FALSE: TriState = {
  kind: "false",
  value: false
}
```

---

## triUnknown()

```ts
export function triUnknown(
  reason: UnknownReason
): TriState
```

---

## combineUnknownReasons()

```ts
export function combineUnknownReasons(
  states: TriState[]
): UnknownReason[]
```

---

# Decision Logic

Decision logic models governance outcomes.

```ts
export type Decision =
  | { kind: "allow"; reason: string; evidence: DecisionEvidence[] }
  | { kind: "deny"; reason: string; evidence: DecisionEvidence[] }
  | { kind: "review"; reason: string; evidence: DecisionEvidence[] }
  | { kind: "unknown"; reasons: UnknownReason[]; evidence: DecisionEvidence[] }
```

---

## Decision Constructors

```ts
export function allow(reason: string): Decision
export function deny(reason: string): Decision
export function review(reason: string): Decision
export function unknownDecision(reasons: UnknownReason[]): Decision
```

---

## combineDecisions()

Decision composition is deny-first.

Priority order:

```text
deny
review
unknown
allow
```

```ts
export function combineDecisions(
  decisions: Decision[]
): Decision
```

---

## decisionToRuntimeBool()

Runtime Bool conversion is fail-closed.

```ts
export function decisionToRuntimeBool(
  decision: Decision
): boolean
```

Conversion rules:

```text
allow   -> true
deny    -> false
review  -> false
unknown -> false
```

---

# Capability Evaluation

## CapabilityRequest

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

## PolicyContext

```ts
export interface PolicyContext {
  environment:
    | "development"
    | "test"
    | "staging"
    | "production"

  grantedCapabilities: string[]
  deniedCapabilities: string[]
  requiredPolicies: string[]

  evidence: DecisionEvidence[]
}
```

---

## evaluateCapability()

Capability evaluation is deny-first.

```ts
export function evaluateCapability(
  request: CapabilityRequest,
  context: PolicyContext
): Decision
```

---

# Bool Boundary Rules

Galerina does not allow implicit truthy/falsy coercion.

Required:

```text
TriState -> validateBoolBoundary()
Decision -> decisionToRuntimeBool()
```

Forbidden:

```text
implicit Tri -> Bool
implicit Decision -> Bool
truthy/falsy coercion
```

---

## BoolBoundaryResult

```ts
export interface BoolBoundaryResult {
  allowed: boolean
  value: boolean
  diagnostics: CompilerDiagnostic[]
  reason: string
}
```

---

## validateBoolBoundary()

```ts
export function validateBoolBoundary(
  input: TriState | Decision,
  context: BoolBoundaryContext
): BoolBoundaryResult
```

Unknown and review states must fail closed.

---

# Omni Logic

Omni Logic is advisory multi-state reasoning.

It must never override deterministic runtime governance.

---

## OmniState

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

## OmniDecision

```ts
export interface OmniDecision {
  state: OmniState
  confidence: number
  reasons: string[]
  evidence: OmniEvidence[]
  advisoryOnly: true
}
```

---

## omniToDecision()

Omni logic cannot directly become runtime Bool.

Required flow:

```text
OmniDecision
  -> Decision
  -> validateBoolBoundary()
  -> runtime Bool
```

```ts
export function omniToDecision(
  omni: OmniDecision
): Decision
```

---

# Safety Rules

The logic package must never:

```text
coerce unknown to true
coerce review to true
allow implicit truthy/falsy conversion
allow advisory Omni logic to bypass governance
allow uncertainty to become runtime permission
```

---

# Diagnostic Codes

## SPORE-TRI

```text
SPORE-TRI-001 through SPORE-TRI-005
```

## SPORE-DECISION

```text
SPORE-DECISION-001 through SPORE-DECISION-005
```

## SPORE-BOOL-BOUNDARY

```text
SPORE-BOOL-BOUNDARY-001 through SPORE-BOOL-BOUNDARY-005
```

## SPORE-OMNI

```text
SPORE-OMNI-001 through SPORE-OMNI-005
```

---

# Core Principle

Galerina separates:

```text
uncertainty modelling
policy reasoning
runtime enforcement
```

Tri and Omni logic may represent uncertainty.

Decision logic governs policy outcomes.

Runtime Bool boundaries remain deterministic and fail closed.
