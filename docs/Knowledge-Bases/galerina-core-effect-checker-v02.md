> ⚠️ **SUPERSEDED** — This is a v0.2 historical document. Current spec: see See Also links.
>
> ⚠️ **CANONICAL RULE (applies even to historical reading):** In the current Galerina model, only
> `flow` variants may declare effects. `fn` cannot declare `effects [...]` or `with effects [...]`
> — this emits `SPORE-SEC-014`. The `CheckedFunction` class below reflects v0.2 compiler internals
> that predate this rule. See `flow-vs-fn-security-model.md` for the canonical `fn` contract.

# Galerina Core Compiler: Effect Checker and Boundary Checker v0.2

## Formal Specification

**Status: SUPERSEDED — This is a v0.2 design document. The current canonical specification
is in the corresponding Phase 9-15 implementation docs. See galerina-roadmap.md for
the up-to-date architecture. This file is retained for historical context only.**

This document is the v0.2 canonical TypeScript specification for the
effect checker (pass 13) and boundary checker as defined in the Galerina
core compiler.

See also: `effect-checker-and-boundary-checker.md` (prior architecture),
`galerina-core-manifest-generation-v02.md` (pass 14 output).

---

## Effect System v0.2

### Effect Enum

The v0.2 compiler defines a 7-value Effect enum.

```ts
enum Effect {
    Pure,
    IO,
    Async,
    State,
    Network,
    Unsafe,
    External
}
```

| Effect   | Meaning                          |
| -------- | -------------------------------- |
| Pure     | No side effects                  |
| IO       | File or stream I/O               |
| Async    | Asynchronous operation           |
| State    | Mutable state access             |
| Network  | Network access                   |
| Unsafe   | Unsafe memory or runtime access  |
| External | External service call            |

Note: The prior KB uses a string union type. This enum is the v0.2
canonical form used by the compiler passes.

---

### CheckedFunction Class

```ts
class CheckedFunction {
    name: string;

    params: CheckedParam[];

    returnType: CheckedType;

    declaredEffects: Set<Effect>;

    inferredEffects: Set<Effect>;

    body: CheckedExpression[];
}
```

Fields:
- `declaredEffects` — effects explicitly declared in the function signature
- `inferredEffects` — effects inferred by AST walking the body
- Both must agree for validation to pass

---

### EffectGraphNode

```ts
interface EffectGraphNode {
    functionName: string;

    effects: Set<Effect>;

    dependencies: string[];
}
```

---

### EffectGraph

```ts
interface EffectGraph {
    nodes: Map<string, EffectGraphNode>;

    propagateEffects(): void;
}
```

The `propagateEffects()` method walks the graph and propagates effects
from callees to callers using a recursive depth-first algorithm with
visited-node tracking to prevent cycles.

---

### Effect Propagation Algorithm

```ts
function propagateEffects(
    node: EffectGraphNode,
    graph: EffectGraph,
    visited: Set<string>
): void {

    if (visited.has(node.functionName)) {
        return;
    }

    visited.add(node.functionName);

    for (const dep of node.dependencies) {

        const depNode =
            graph.nodes.get(dep);

        if (depNode) {

            propagateEffects(
                depNode,
                graph,
                visited
            );

            for (const effect of depNode.effects) {
                node.effects.add(effect);
            }
        }
    }
}
```

Key property: visited-node tracking prevents infinite loops in recursive
call graphs.

---

### analyzeFunction() Algorithm

```ts
function analyzeFunction(
    fn: CheckedFunction
): Diagnostic[] {

    const diagnostics: Diagnostic[] = [];

    for (const effect of fn.inferredEffects) {

        if (!fn.declaredEffects.has(effect)) {

            diagnostics.push({
                code: getEffectDiagnosticCode(effect),
                message: `Missing effect declaration: ${effect}`
            });
        }
    }

    return diagnostics;
}
```

---

### SPORE-EFFECT Diagnostic Codes (v0.2)

| Code          | Meaning                               |
| ------------- | ------------------------------------- |
| SPORE-EFFECT-001 | Missing IO effect declaration         |
| SPORE-EFFECT-002 | Effect propagation violation          |
| SPORE-EFFECT-003 | Missing Async effect declaration      |
| SPORE-EFFECT-004 | Unsafe operation without Unsafe effect |

Note: These meanings differ from the prior KB codes. v0.2 codes are
specific to effect category failures rather than generic "undeclared effect".

---

## Boundary System v0.2

### BoundaryType Enum

```ts
enum BoundaryType {
    Internal,
    External,
    Sandbox,
    Unsafe,
    Runtime
}
```

| Boundary | Meaning                              |
| -------- | ------------------------------------ |
| Internal | Same-module or trusted internal call |
| External | External service or third-party call |
| Sandbox  | Restricted execution environment     |
| Unsafe   | Low-level or unsafe operation        |
| Runtime  | Runtime-level system access          |

---

### BoundaryNode

```ts
interface BoundaryNode {
    source: BoundaryType;

    target: BoundaryType;

    allowedEffects: Set<Effect>;
}
```

---

### Boundary Validation Rules

| Rule                          | Requirement                              |
| ----------------------------- | ---------------------------------------- |
| Internal → Internal           | Always allowed                           |
| Internal → External           | Requires Network or External effect      |
| Sandbox → any                 | Prohibits IO, Network, Unsafe, External  |
| any → Runtime                 | Requires Runtime boundary type           |
| Unsafe transition             | Requires Unsafe effect declaration       |

---

### validateBoundary() Algorithm

```ts
function validateBoundary(
    node: BoundaryNode,
    fn: CheckedFunction
): Diagnostic[] {

    const diagnostics: Diagnostic[] = [];

    if (
        node.source === BoundaryType.Sandbox &&
        (fn.declaredEffects.has(Effect.IO) ||
         fn.declaredEffects.has(Effect.Network) ||
         fn.declaredEffects.has(Effect.Unsafe) ||
         fn.declaredEffects.has(Effect.External))
    ) {
        diagnostics.push({
            code: "SPORE-BOUNDARY-002",
            message: "Sandbox boundary violation: prohibited effect detected."
        });
    }

    return diagnostics;
}
```

---

### SPORE-BOUNDARY Diagnostic Codes (v0.2)

| Code             | Meaning                              |
| ---------------- | ------------------------------------ |
| SPORE-BOUNDARY-001  | Invalid external boundary crossing   |
| SPORE-BOUNDARY-002  | Sandbox boundary violation           |
| SPORE-BOUNDARY-003  | Runtime boundary violation           |
| SPORE-BOUNDARY-004  | Unsafe boundary access               |

---

## Implementation Checklist (16 Items)

### Effect Validation (Items 1–8)

```text
 1. Define Effect enum (Pure/IO/Async/State/Network/Unsafe/External)
 2. Implement CheckedFunction with declaredEffects and inferredEffects
 3. Implement EffectGraphNode with effects Set and dependencies
 4. Implement EffectGraph with nodes Map
 5. Implement propagateEffects() with visited-node cycle detection
 6. Implement analyzeFunction() comparing declared vs inferred
 7. Emit SPORE-EFFECT-001–004 diagnostics per missing effect
 8. Integrate effect graph with compiler pass 13
```

### Boundary Validation (Items 9–16)

```text
 9.  Define BoundaryType enum (Internal/External/Sandbox/Unsafe/Runtime)
10. Implement BoundaryNode with source/target/allowedEffects
11. Implement Internal→Internal pass-through rule
12. Implement Internal→External Network/External effect requirement
13. Implement Sandbox prohibition for IO/Network/Unsafe/External
14. Implement Runtime boundary requirement
15. Emit SPORE-BOUNDARY-001–004 diagnostics for violations
16. Feed validated boundary graph into manifest generation (pass 14)
```

---

## File Layout

```text
galerina-core-compiler/src/

  effects/
    Effect.ts               (Effect enum — 7 values)
    CheckedFunction.ts      (class with Set<Effect>)
    EffectGraphNode.ts
    EffectGraph.ts
    propagateEffects.ts     (recursive + visited tracking)
    analyzeFunction.ts
    effect-diagnostics.ts   (SPORE-EFFECT-001–004)

  boundaries/
    BoundaryType.ts         (enum — 5 values)
    BoundaryNode.ts
    validateBoundary.ts
    boundary-diagnostics.ts (SPORE-BOUNDARY-001–004)
```

---

## Determinism Rule

Given identical source programs and runtime policies, the effect and
boundary checkers must produce identical diagnostic outputs across all
compiler runs. The propagation algorithm is stateless aside from the
`visited` set which is reset per invocation.
