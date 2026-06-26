> ⚠️ **SUPERSEDED** — This is a v0.2 historical document. Current spec: see See Also links.

# Galerina Core Logic v0.2

> **Canonical name:** `Tri` — Galerina's three-valued truth type.
> This file uses older naming conventions in places. The canonical type name is `Tri`.
> `Tri` is **not** a trie (prefix-tree data structure). The names are unrelated.
> For the current authoritative spec, see `docs/Knowledge-Bases/galerina-core-logic-tri-decision-bool.md`.

## Formal Specification — Tri Logic, Decision Logic, Bool Boundary, Omni Logic

**Status: SUPERSEDED — This is a v0.2 design document. The current canonical specification
is in the corresponding Phase 9-15 implementation docs. See galerina-roadmap.md for
the up-to-date architecture. This file is retained for historical context only.**

This document is the v0.2 canonical specification for `galerina-core-logic`.

Update status: this file preserves the formal-spec form that used `type:`
discriminants and a three-state `Decision`. The current package README and
`galerina-core-logic-tri-decision-bool.md` supersede that for runtime-facing docs:
use `kind`, `Decision` states `allow|deny|review|unknown`, evidence arrays, and
fail-closed `decisionToRuntimeBool()`.

See also: `galerina-core-logic-tri-decision-bool.md` (prior KB),
`galerina-core-logic-omni-logic.md` (prior Omni KB),
`galerina-core-logic-tristate-developer-guide.md` (developer guide).

---

## Version Note

The v0.2 formal specification introduces `type` field names in the
discriminated unions (e.g. `type: "TRI_TRUE"`) in contrast to the prior
KB which uses `kind` field names (e.g. `kind: "true"`).

The `kind` form is the developer-guide canonical form (see x12 developer guide).
The `type` form is the formal spec from the v0.2 package specification.

Both represent the same logical model. Implementations may use either form;
`kind` is preferred for developer-facing APIs.

---

## Tri Logic (v0.2 Spec Form)

### TriState (type-field form)

```ts
type TriState =
    | {
        type: "TRI_TRUE";
      }

    | {
        type: "TRI_FALSE";
      }

    | {
        type: "TRI_UNKNOWN";

        reasons: string[];
      };
```

Note: The `reasons` field carries an array (not optional single reason).

---

### Constants and Constructor

```ts
const TRI_TRUE: TriState = {
    type: "TRI_TRUE"
};

const TRI_FALSE: TriState = {
    type: "TRI_FALSE"
};

function triUnknown(
    reasons: string[]
): TriState {

    return {
        type: "TRI_UNKNOWN",
        reasons
    };
}
```

---

### combineUnknownReasons()

```ts
function combineUnknownReasons(
    states: TriState[]
): string[] {

    const reasons: string[] = [];

    for (const state of states) {

        if (
            state.type ===
                "TRI_UNKNOWN"
        ) {
            reasons.push(
                ...state.reasons
            );
        }
    }

    return reasons;
}
```

---

### triAnd()

```ts
function triAnd(
    a: TriState,
    b: TriState
): TriState {

    if (
        a.type === "TRI_FALSE" ||
        b.type === "TRI_FALSE"
    ) {
        return TRI_FALSE;
    }

    if (
        a.type === "TRI_UNKNOWN" ||
        b.type === "TRI_UNKNOWN"
    ) {
        return triUnknown(
            combineUnknownReasons([a, b])
        );
    }

    return TRI_TRUE;
}
```

---

### Truth Table

| A       | B       | Result  |
| ------- | ------- | ------- |
| TRUE    | TRUE    | TRUE    |
| TRUE    | FALSE   | FALSE   |
| TRUE    | UNKNOWN | UNKNOWN |
| FALSE   | UNKNOWN | FALSE   |
| UNKNOWN | UNKNOWN | UNKNOWN |

---

### SPORE-TRI Diagnostics

| Code       | Meaning                       |
| ---------- | ----------------------------- |
| SPORE-TRI-001 | Invalid TriState              |
| SPORE-TRI-002 | Missing unknown reasons       |
| SPORE-TRI-003 | Invalid tri-state combination |

---

## Decision Logic (v0.2 Spec Form)

### Decision (type-field form)

```ts
type Decision =
    | {
        type: "ALLOW";

        reason: string;
      }

    | {
        type: "DENY";

        reason: string;
      }

    | {
        type: "UNKNOWN";

        reasons: string[];
      };
```

Note: The prior KB uses `kind: "allow"|"deny"|"unknown"` with additional
states (notApplicable, conflict). The v0.2 formal spec is a 3-state union.

---

### Constructors

```ts
function allowDecision(
    reason: string
): Decision {

    return {
        type: "ALLOW",
        reason
    };
}

function denyDecision(
    reason: string
): Decision {

    return {
        type: "DENY",
        reason
    };
}

function unknownDecision(
    reasons: string[]
): Decision {

    return {
        type: "UNKNOWN",
        reasons
    };
}
```

---

### Decision Priority Order

```text
DENY
  ↓
UNKNOWN
  ↓
ALLOW
```

This ensures fail-closed security. DENY always wins.

---

### combineDecisions()

```ts
function combineDecisions(
    decisions: Decision[]
): Decision {

    for (const decision of decisions) {

        if (
            decision.type === "DENY"
        ) {
            return decision;
        }
    }

    for (const decision of decisions) {

        if (
            decision.type === "UNKNOWN"
        ) {
            return decision;
        }
    }

    return allowDecision(
        "All checks passed."
    );
}
```

---

### decisionToRuntimeBool()

```ts
function decisionToRuntimeBool(
    decision: Decision
): boolean {

    if (
        decision.type === "ALLOW"
    ) {
        return true;
    }

    return false;
}
```

UNKNOWN fails closed: returns false.

---

### Capability Integration

```ts
interface CapabilityRequest {
    capability: string;

    source: string;

    boundary: string;
}

interface PolicyContext {
    allowedCapabilities: string[];

    deniedCapabilities: string[];

    runtimeBoundary: string;
}
```

---

### evaluateCapability() — Deny-First

```ts
function evaluateCapability(
    request: CapabilityRequest,
    context: PolicyContext
): Decision {

    if (
        context.deniedCapabilities
            .includes(
                request.capability
            )
    ) {
        return denyDecision(
            "Capability denied."
        );
    }

    if (
        !context.allowedCapabilities
            .includes(
                request.capability
            )
    ) {
        return unknownDecision([
            "Capability unresolved."
        ]);
    }

    return allowDecision(
        "Capability allowed."
    );
}
```

---

### SPORE-DECISION Diagnostics

| Code            | Meaning                    |
| --------------- | -------------------------- |
| SPORE-DECISION-001 | Invalid decision           |
| SPORE-DECISION-002 | Unsafe decision conversion |
| SPORE-DECISION-003 | Missing deny reason        |

---

## Bool Boundary Rules

### BoolBoundaryResult

```ts
interface BoolBoundaryResult {
    allowed: boolean;

    reason?: string;
}
```

---

### validateBoolBoundary()

```ts
function validateBoolBoundary(
    state: TriState
): BoolBoundaryResult {

    if (
        state.type ===
            "TRI_UNKNOWN"
    ) {
        return {
            allowed: false,

            reason:
                "Unknown states cannot cross bool boundaries."
        };
    }

    return {
        allowed: true
    };
}
```

---

### Bool Boundary Safety Rules

| State       | Allowed |
| ----------- | ------- |
| TRI_TRUE    | Yes     |
| TRI_FALSE   | Yes     |
| TRI_UNKNOWN | No      |

---

### SPORE-BOOL-BOUNDARY Diagnostics

| Code                 | Meaning                   |
| -------------------- | ------------------------- |
| SPORE-BOOL-BOUNDARY-001 | Unsafe unknown conversion |
| SPORE-BOOL-BOUNDARY-002 | Invalid bool boundary     |
| SPORE-BOOL-BOUNDARY-003 | Implicit logical collapse |

---

## Omni Logic (v0.2)

### OmniState Enum

```ts
enum OmniState {
    TRUE,
    FALSE,
    UNKNOWN,
    CONFLICT,
    PARTIAL,
    DENIED,
    DEFERRED,
    IMPOSSIBLE
}
```

| State      | Meaning                  |
| ---------- | ------------------------ |
| TRUE       | Fully valid              |
| FALSE      | Explicitly invalid       |
| UNKNOWN    | Insufficient information |
| CONFLICT   | Contradictory evidence   |
| PARTIAL    | Partially validated      |
| DENIED     | Security denial          |
| DEFERRED   | Delayed evaluation       |
| IMPOSSIBLE | Logically impossible     |

Note: The prior KB used PROBABLE/IMPROBABLE. The v0.2 formal spec
introduces PARTIAL, DENIED, DEFERRED, IMPOSSIBLE in their place.

---

### evaluateOmni()

```ts
function evaluateOmni(
    states: OmniState[]
): OmniState {

    if (
        states.includes(
            OmniState.DENIED
        )
    ) {
        return OmniState.DENIED;
    }

    if (
        states.includes(
            OmniState.CONFLICT
        )
    ) {
        return OmniState.CONFLICT;
    }

    if (
        states.includes(
            OmniState.UNKNOWN
        )
    ) {
        return OmniState.UNKNOWN;
    }

    return OmniState.TRUE;
}
```

---

### Omni Safety Rules

| Rule                    | Purpose                 |
| ----------------------- | ----------------------- |
| DENIED dominates        | Fail-closed security    |
| CONFLICT propagates     | Distributed consistency |
| UNKNOWN preserved       | Explainability          |
| IMPOSSIBLE halts        | Runtime safety          |
| PARTIAL never auto-true | Safe evaluation         |

---

### SPORE-OMNI Diagnostics

| Code        | Meaning                    |
| ----------- | -------------------------- |
| SPORE-OMNI-001 | Invalid omni state         |
| SPORE-OMNI-002 | Impossible state detected  |
| SPORE-OMNI-003 | Unsafe omni collapse       |
| SPORE-OMNI-004 | Conflicting runtime states |

---

## File Layout

```text
galerina-core-logic/src/

  tri/
    TriState.ts           (discriminated union — type field)
    constants.ts          (TRI_TRUE, TRI_FALSE, triUnknown)
    operators.ts          (triAnd, combineUnknownReasons)
    diagnostics.ts        (SPORE-TRI-001–003)

  decision/
    Decision.ts           (discriminated union — type field)
    constructors.ts       (allowDecision, denyDecision, unknownDecision)
    combineDecisions.ts   (priority: DENY > UNKNOWN > ALLOW)
    evaluateCapability.ts (deny-first)
    decisionToRuntimeBool.ts
    diagnostics.ts        (SPORE-DECISION-001–003)

  bool-boundary/
    BoolBoundaryResult.ts
    validateBoolBoundary.ts
    diagnostics.ts        (SPORE-BOOL-BOUNDARY-001–003)

  omni/
    OmniState.ts          (enum — 8 values)
    evaluateOmni.ts
    diagnostics.ts        (SPORE-OMNI-001–004)
```
