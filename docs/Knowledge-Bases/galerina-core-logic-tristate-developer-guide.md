# Galerina Core Logic v0.2
## Tri Logic `if` and `match` Developer Guide

> **Canonical name:** `Tri` — Galerina's three-valued truth type.
> This file uses the older name `tristate` in places — the canonical type name is `Tri`.
> `Tri` is **not** a trie (prefix-tree data structure). The names are unrelated.
> For operator compatibility rules, see `docs/Knowledge-Bases/operator-type-rules.md`.
> For the authoritative spec, see `docs/Knowledge-Bases/galerina-core-logic-tri-decision-bool.md`.

This document is the v0.2 developer guide for Tri Logic runtime behaviour,
safe conditional handling, operator semantics, and Decision conversion.

Update status: this guide predates the current package README shape in a few
places. When it conflicts, use `packages-galerina/galerina-core-logic/README.md`
and `galerina-core-logic-tri-decision-bool.md`: `TriState` has `kind` plus
`value` for known states, `triUnknown()` takes an `UnknownReason`, `Decision`
has `allow|deny|review|unknown`, and each decision carries evidence.

See also: `galerina-core-logic-tri-decision-bool.md` (formal type spec),
`galerina-core-logic-v02.md` (v0.2 runtime types).

Note: This guide uses `kind:` field discriminants (`"true"/"false"/"unknown"`).
The separate formal spec KB (`galerina-core-logic-v02.md`) documents the
`type:` discriminant form (`"TRI_TRUE"/"TRI_FALSE"/"TRI_UNKNOWN"`). Both
exist in the codebase; see the formal spec for the canonical v0.2 types.

---

## Core Rule

```text
Only definite true grants access. false denies. unknown fails closed.
```

Tri Logic supports three logical states:

| State | Meaning |
| ------- | --------------------------------------- |
| `true` | The condition is definitely true |
| `false` | The condition is definitely false |
| `unknown(reason)` | The runtime cannot prove true or false |

---

## Goals

Tri Logic is useful for:
- capability checks
- policy evaluation
- permission checks
- sandbox decisions
- distributed runtime state
- network governance
- secret access checks
- audit and explain output

---

## TriState Model (Developer Guide form)

```ts
// Discriminated union — forces callers to handle unknown.
type TriState =
  | {
      kind: "true";
    }
  | {
      kind: "false";
    }
  | {
      kind: "unknown";
      // Reasons explain why the value could not be resolved.
      // Preserved for diagnostics, audit logs, and explain output.
      reasons: string[];
    };
```

---

## Constructors

```ts
// Definite true.
const TRI_TRUE: TriState = { kind: "true" };

// Definite false.
const TRI_FALSE: TriState = { kind: "false" };

// Unknown with one or more reasons.
function triUnknown(reason: string | string[]): TriState {
  return {
    kind: "unknown",
    reasons: Array.isArray(reason) ? reason : [reason],
  };
}
```

Example:
```ts
const hasNetworkCapability = TRI_TRUE;

const isSandboxed = TRI_FALSE;

const userPolicyKnown = triUnknown(
  "Policy service did not return a definitive answer."
);
```

---

## `if` Behavior

### Rule

| Condition | Behavior |
| --------- | --------------------------------- |
| `true` | enter `if` branch |
| `false` | enter `else` branch |
| `unknown` | enter `else` branch (fail-closed) |

Unknown must not accidentally behave like true.

### triIf()

```ts
function triIf(
  condition: TriState,
  onTrue: () => void,
  onFalseOrUnknown: (reason?: string[]) => void
): void {
  if (condition.kind === "true") {
    // Only definite true enters the privileged branch.
    onTrue();
    return;
  }

  if (condition.kind === "unknown") {
    // Unknown fails closed and preserves diagnostic reasons.
    onFalseOrUnknown(condition.reasons);
    return;
  }

  // Definite false also enters the safe fallback branch.
  onFalseOrUnknown();
}
```

### Example: Safe Permission Check

```ts
const canReadSecret = triUnknown(
  "Secret capability could not be verified."
);

triIf(
  canReadSecret,

  () => {
    // This branch only runs for definite true.
    revealSecret();
  },

  (reasons) => {
    // False and unknown both end up here.
    denyAccess({
      reason: "Secret access denied.",
      unknownReasons: reasons,
    });
  }
);
```

### Galerina Syntax

```galerina
let canReadSecret = unknown("Secret capability could not be verified")

if canReadSecret {
    revealSecret()
} else {
    // Runs when condition is false or unknown (fail-closed).
    denyAccess()
}
```

### Why Unknown Goes to `else`

Unsafe — treating unknown as truthy can leak protected data:
```ts
if (canReadSecret as any) { revealSecret(); }
```

Safe — unknown is handled as denied unless explicitly matched:
```ts
triIf(canReadSecret, revealSecret, denyAccess);
```

---

## `match` Behavior

`match` is preferred when all three states must be handled explicitly.
Unlike `if`, `match` exposes the `unknown` branch directly.

### matchTri\<T\>()

```ts
function matchTri<T>(
  value: TriState,
  cases: {
    true: () => T;
    false: () => T;
    unknown: (reasons: string[]) => T;
  }
): T {
  switch (value.kind) {
    case "true":
      return cases.true();
    case "false":
      return cases.false();
    case "unknown":
      return cases.unknown(value.reasons);
  }
}
```

### Example: Explicit Unknown Handling

```ts
const policyResult = triUnknown([
  "Policy cache expired.",
  "Remote policy service unavailable.",
]);

const message = matchTri(policyResult, {
  true: () => "Policy allows request.",

  false: () => "Policy denies request.",

  unknown: (reasons) => {
    // Reasons returned to explain/audit systems.
    return `Policy unknown: ${reasons.join("; ")}`;
  },
});
```

### Galerina Syntax

```galerina
match canDeploy {
    true => {
        deploy()
    }

    false => {
        deny("Deployment policy denied.")
    }

    unknown(reason) => {
        deny("Deployment policy unknown.")
        explain(reason)
    }
}
```

### Security-Sensitive Match Example

```galerina
match canSendNetworkRequest {
    true => {
        sendRequest()
    }

    false => {
        deny("Network capability denied.")
    }

    unknown(reason) => {
        // Unknown must not send the request.
        deny("Network capability unresolved.")
        audit(reason)
    }
}
```

---

## Logical Operators

Tri Logic operators preserve uncertainty.

### AND Rules

| A | B | A AND B |
| ------- | ------- | ------- |
| true | true | true |
| true | false | false |
| true | unknown | unknown |
| false | true | false |
| false | false | false |
| false | unknown | **false** |
| unknown | true | unknown |
| unknown | false | **false** |
| unknown | unknown | unknown |

> `false AND unknown = false` — one side definitely false means whole expression is false.

### OR Rules

| A | B | A OR B |
| ------- | ------- | ------- |
| true | true | true |
| true | false | true |
| true | unknown | **true** |
| false | true | true |
| false | false | false |
| false | unknown | unknown |
| unknown | true | **true** |
| unknown | false | unknown |
| unknown | unknown | unknown |

> `true OR unknown = true` — one side definitely true means whole expression is true.

### NOT Rules

| A | NOT A |
| ------- | ------- |
| true | false |
| false | true |
| unknown | **unknown** |

> `NOT unknown = unknown` — the system still does not know the answer.

---

## Operator Implementation

```ts
function combineUnknownReasons(values: TriState[]): string[] {
  return values.flatMap((value) =>
    value.kind === "unknown" ? value.reasons : []
  );
}

function triAnd(a: TriState, b: TriState): TriState {
  // Either side definitely false → definitely false.
  if (a.kind === "false" || b.kind === "false") {
    return TRI_FALSE;
  }

  // At least one side unknown (neither is false) → unknown.
  if (a.kind === "unknown" || b.kind === "unknown") {
    return triUnknown(combineUnknownReasons([a, b]));
  }

  // Both sides true.
  return TRI_TRUE;
}

function triOr(a: TriState, b: TriState): TriState {
  // Either side definitely true → definitely true.
  if (a.kind === "true" || b.kind === "true") {
    return TRI_TRUE;
  }

  // At least one side unknown (neither is true) → unknown.
  if (a.kind === "unknown" || b.kind === "unknown") {
    return triUnknown(combineUnknownReasons([a, b]));
  }

  // Both sides false.
  return TRI_FALSE;
}

function triNot(value: TriState): TriState {
  if (value.kind === "true") return TRI_FALSE;
  if (value.kind === "false") return TRI_TRUE;
  // Unknown remains unknown.
  return triUnknown(value.reasons);
}
```

Operator examples:
```ts
const knownTrue = TRI_TRUE;
const knownFalse = TRI_FALSE;
const unknownPolicy = triUnknown("Policy not loaded.");

// true AND unknown = unknown
const result1 = triAnd(knownTrue, unknownPolicy);

// false AND unknown = false
const result2 = triAnd(knownFalse, unknownPolicy);

// true OR unknown = true
const result3 = triOr(knownTrue, unknownPolicy);

// false OR unknown = unknown
const result4 = triOr(knownFalse, unknownPolicy);

// NOT unknown = unknown
const result5 = triNot(unknownPolicy);
```

---

## Unknown Reasons

Unknown reasons must be preserved so Galerina can explain:
- why a policy was unresolved
- why a capability was denied
- why a request failed closed
- why a runtime decision was not definite

Combined unknown reasons example:
```ts
const capabilityUnknown = triUnknown(
  "Capability graph did not contain network.write."
);

const boundaryUnknown = triUnknown(
  "Runtime boundary could not be resolved."
);

const combined = triAnd(capabilityUnknown, boundaryUnknown);
// combined is unknown with both reasons combined.
```

Explain report example:
```json
{
  "condition": "canDeploy",
  "state": "unknown",
  "reasons": [
    "Capability graph did not contain deploy.production.",
    "Runtime boundary could not be resolved."
  ],
  "runtimeDecision": "deny"
}
```

Audit report example:
```json
{
  "event": "policy_evaluation",
  "status": "denied",
  "triState": "unknown",
  "failClosed": true,
  "reasons": [
    "Policy service timeout."
  ]
}
```

---

## Decision Conversion

Tri Logic is usually converted into a `Decision` before runtime authorization.

### Decision Model (Developer Guide form)

```ts
type Decision =
  | { kind: "allow"; reason: string; }
  | { kind: "deny";  reason: string; }
  | { kind: "unknown"; reasons: string[]; };
```

### Constructors

```ts
function allowDecision(reason: string): Decision {
  return { kind: "allow", reason };
}

function denyDecision(reason: string): Decision {
  return { kind: "deny", reason };
}

function unknownDecision(reasons: string[]): Decision {
  return { kind: "unknown", reasons };
}
```

### triToDecision()

```ts
function triToDecision(value: TriState): Decision {
  if (value.kind === "true") {
    return allowDecision("Condition evaluated to true.");
  }

  if (value.kind === "false") {
    return denyDecision("Condition evaluated to false.");
  }

  return unknownDecision(value.reasons);
}
```

### decisionToRuntimeBool()

Only `allow` becomes `true`. Both `deny` and `unknown` fail closed.

```ts
function decisionToRuntimeBool(decision: Decision): boolean {
  if (decision.kind === "allow") {
    return true;
  }

  // Deny and unknown both fail closed.
  return false;
}
```

Example:
```ts
const decision = triToDecision(
  triUnknown("Authorization service unavailable.")
);

const canProceed = decisionToRuntimeBool(decision);
// canProceed is false. Unknown does not grant access.
```

---

## Bool Boundary

`unknown` cannot silently cross a boolean boundary.

A boolean boundary is any place where Galerina needs a normal runtime `boolean`:
- JavaScript `if`
- runtime authorization
- route access
- deployment approval
- secret access
- network permission check

### BoolBoundaryResult

```ts
interface BoolBoundaryResult {
  allowed: boolean;
  value?: boolean;
  diagnostic?: {
    code: string;
    message: string;
  };
}
```

### validateBoolBoundary()

```ts
function validateBoolBoundary(value: TriState): BoolBoundaryResult {
  if (value.kind === "true") {
    return { allowed: true, value: true };
  }

  if (value.kind === "false") {
    return { allowed: true, value: false };
  }

  return {
    allowed: false,
    diagnostic: {
      code: "SPORE-BOOL-BOUNDARY-001",
      message: "Unknown TriState cannot implicitly convert to bool.",
    },
  };
}
```

Invalid boundary (bad):
```ts
const canDeploy = triUnknown("Deployment policy was not loaded.");

if (canDeploy as any) {       // SPORE-BOOL-BOUNDARY-001
  deployToProduction();
}
```

Correct boundary (good):
```ts
const boundary = validateBoolBoundary(canDeploy);

if (!boundary.allowed) {
  throw new Error(boundary.diagnostic?.message);
}

if (boundary.value) {
  deployToProduction();
} else {
  denyDeployment();
}
```

Preferred Galerina pattern:
```galerina
match canDeploy {
    true    => deployToProduction()
    false   => denyDeployment("Policy denied deployment.")
    unknown(reason) => {
        denyDeployment("Policy unresolved.")
        explain(reason)
    }
}
```

---

## Security Rules

| Rule | Meaning |
| -------------------------------- | --------------------------------------------- |
| Unknown never grants access | Only definite true grants access |
| Deny-first priority | Any explicit deny wins |
| Unknown fails closed | Unknown converts to denied runtime behaviour |
| Explicit handling required | Sensitive paths must match unknown |
| Reasons preserved | Unknown reasons must appear in explain/audit output |

### combineDecisions() — Deny-First

```ts
function combineDecisions(decisions: Decision[]): Decision {
  // Deny always wins.
  const deny = decisions.find((d) => d.kind === "deny");
  if (deny) return deny;

  // Unknown beats allow — cannot prove safety.
  const unknown = decisions.find((d) => d.kind === "unknown");
  if (unknown) return unknown;

  // Only if all checks allow do we allow.
  return allowDecision("All checks allowed.");
}
```

### Security Example: Network Request

```ts
const hasNetworkCapability = TRI_TRUE;

const destinationAllowed = triUnknown(
  "Destination policy cache expired."
);

const tlsValid = TRI_TRUE;

// Combined becomes unknown because destinationAllowed is unknown.
const canSendRequest = triAnd(
  triAnd(hasNetworkCapability, destinationAllowed),
  tlsValid
);

const decision = triToDecision(canSendRequest);

if (decisionToRuntimeBool(decision)) {
  // Does not run — decision is unknown.
  sendNetworkRequest();
} else {
  denyNetworkRequest({ reason: "Network request denied.", decision });
}
```

### Security Example: Secret Access

```ts
const hasSecretCapability = TRI_TRUE;

const secretPolicyLoaded = triUnknown(
  "Secret policy service unavailable."
);

// true AND unknown = unknown
const canReadSecret = triAnd(hasSecretCapability, secretPolicyLoaded);

matchTri(canReadSecret, {
  true: () => {
    // Only definite true can reveal the secret.
    revealSecret();
  },

  false: () => {
    denyAccess("Secret capability denied.");
  },

  unknown: (reasons) => {
    // Unknown fails closed and is auditable.
    denyAccess("Secret access unresolved.");
    audit({
      event: "secret_access_denied",
      triState: "unknown",
      reasons,
    });
  },
});
```

---

## Compiler Enforcement

| Rule | Diagnostic |
| ----------------------------------------- | ----------------------- |
| Unknown used as bool | `SPORE-BOOL-BOUNDARY-001` |
| Missing unknown match case | `SPORE-TRI-001` or `SPORE-BOOL-BOUNDARY-002` |
| Unknown reason missing | `SPORE-TRI-002` |
| Unsafe decision conversion | `SPORE-DECISION-002` |
| Sensitive path without explicit unknown handling | `SPORE-BOOL-BOUNDARY-003` |

Diagnostic examples:
```text
SPORE-BOOL-BOUNDARY-001:
Unknown TriState cannot implicitly convert to bool.
```

```text
SPORE-TRI-002:
Unknown TriState must include at least one reason.
```

```text
SPORE-DECISION-002:
Decision conversion is unsafe because UNKNOWN was not handled explicitly.
```

---

## Recommended Developer Patterns

### Use `if` for simple fail-closed behaviour

```galerina
if canAccess {
    accessResource()
} else {
    denyAccess()
}
```

Use when unknown should be treated exactly like false.

---

### Use `match` for explainable behaviour

```galerina
match canAccess {
    true    => accessResource()
    false   => denyAccess("Explicitly denied.")
    unknown(reason) => {
        denyAccess("Access unresolved.")
        explain(reason)
    }
}
```

Use when the reason for unknown matters for audit or explain output.

---

### Use `Decision` for runtime authorisation

```ts
const decision = triToDecision(canAccess);

if (decisionToRuntimeBool(decision)) {
  allowRuntimeAction();
} else {
  denyRuntimeAction();
}
```

Use when integrating with the runtime authorization pipeline.

---

## Summary

| Key Rule | Behaviour |
| ---------------------------------------- | ----------------------------- |
| `true` | Definitely allowed |
| `false` | Definitely denied |
| `unknown(reason)` | Unresolved — reasons preserved |
| `if` with unknown | Goes to `else` (fail-closed) |
| `match` with unknown | Must be handled explicitly |
| AND/OR/NOT | Preserve uncertainty correctly |
| Bool boundary | Unknown cannot silently convert |
| Runtime authorization | Must fail closed |
| Deny-first priority | Protects sensitive paths |
