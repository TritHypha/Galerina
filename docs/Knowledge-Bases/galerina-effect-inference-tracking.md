# Galerina — Effect Inference Tracking

## Status

| Field | Value |
|---|---|
| Phase | 16 — Implementation |
| New types | `FlowEffectSummary` (`declaredEffects`, `inferredEffects`, `missingEffects`) |
| New | `EFFECT_REGISTRY` (centralised operation→effect mapping) |
| New | `suggestedCode` in `SPORE-EFFECT-001` diagnostics |

## TL;DR

- The compiler now separates what the developer declared, what it inferred, and what is missing.
- `EFFECT_REGISTRY` is the single source of truth for operation→effect mappings — no more scattered hardcoded strings.
- In dev mode: missing effects are warnings with a suggested `contract.effects` patch; in production: errors.

---

## Three Sets

Effect tracking is built on three distinct sets per flow:

| Set | Definition |
|---|---|
| `declaredEffects` | What the developer wrote in `contract.effects` or with `effects [...]` |
| `inferredEffects` | What the compiler discovered from known operation calls in the flow body |
| `missingEffects` | `inferredEffects - declaredEffects` — what needs to be added |
| `extraEffects` _(future)_ | `declaredEffects - inferredEffects` — over-broad declarations |

`missingEffects` is the actionable output: these are effects the code provably requires but the developer has not yet declared. `extraEffects` is reserved for a future lint pass that identifies declarations with no corresponding operation.

---

## `FlowEffectSummary` Interface

```typescript
interface FlowEffectSummary {
  /** The name of the flow as declared in source. */
  flowName: string;

  /** Effects explicitly declared by the developer in contract.effects. */
  declaredEffects: string[];

  /** Effects inferred by the compiler from operation calls in the flow body. */
  inferredEffects: string[];

  /**
   * Set difference: inferredEffects minus declaredEffects.
   * These are the effects the developer must add to satisfy the contract.
   */
  missingEffects: string[];

  /**
   * Optional — future use.
   * Set difference: declaredEffects minus inferredEffects.
   * Declarations that have no matching operation in the body.
   */
  extraEffects?: string[];
}
```

All array fields are sorted lexicographically for determinism.

---

## `EFFECT_REGISTRY`

`EFFECT_REGISTRY` is the single authoritative map from operation name to the set of effects that operation requires. It lives in one place and is imported wherever effect inference or effect checking runs. No other module may hardcode effect name strings.

```typescript
const EFFECT_REGISTRY: Record<string, string[]> = {
  "database.find":    ["database.read"],
  "database.findOne": ["database.read"],
  "database.insert":  ["database.write"],
  "database.update":  ["database.write"],
  "database.delete":  ["database.write"],
  "database.query":   ["database.read"],
  "http.get":         ["network.outbound"],
  "http.post":        ["network.outbound"],
  "http.put":         ["network.outbound"],
  "http.delete":      ["network.outbound"],
  "audit.write":      ["audit.write"],
  "email.send":       ["network.outbound", "email.send"],
  "cache.get":        ["cache.read"],
  "cache.set":        ["cache.write"],
  "fs.readFile":      ["filesystem.read"],
  "fs.writeFile":     ["filesystem.write"],
};
```

Note that `email.send` maps to an array of two effects. An operation may require more than one effect, and all of them are collected during inference.

Operations not present in `EFFECT_REGISTRY` are treated as having no known effects. Unknown operations do not produce errors — they are silently ignored during inference. This keeps inference conservative: the compiler only asserts what it knows.

---

## Effect Inference Algorithm

Inference runs once per flow after the AST is available.

1. Walk the flow body looking for `CallExpression` nodes.
2. Resolve each call's callee to a fully-qualified operation name (e.g. `db.find` resolved via import bindings to `database.find`).
3. Look up the resolved name in `EFFECT_REGISTRY`. If found, collect all effects in the mapped array.
4. Accumulate all collected effects in a `Set<string>` (deduplicates automatically).
5. Convert the set to a sorted array for the `inferredEffects` field.

Resolution in step 2 uses the same import-tracking pass used by the capability checker, so aliased imports are handled correctly.

---

## Transitive Propagation

Direct inference only covers effects from operations called directly in the flow body. Transitive propagation extends this to effects inherited from called flows.

1. Build a map of `flowName → directInferredEffects` for every flow in the module.
2. Build a call graph: for each flow, record which other flows it calls.
3. Propagate: if flow A calls flow B, A inherits all of B's `inferredEffects` (including B's own transitive effects).
4. Iterate until fixpoint — no new effects are added in a full pass.

Cycles in the call graph (mutual recursion) are handled safely: the fixpoint loop terminates because the effect sets are monotonically growing and bounded by the finite contents of `EFFECT_REGISTRY`.

After propagation, `inferredEffects` for each flow represents the complete set of effects reachable from that flow, directly or transitively.

---

## Suggested Fix Builder

When `missingEffects` is non-empty, the diagnostic includes a `suggestedCode` field containing a ready-to-paste `contract.effects` block.

The suggested fix is built by:

1. Taking the union of `declaredEffects` and `missingEffects`.
2. Sorting lexicographically.
3. Emitting as a `contract.effects` block.

Example output for a flow with `declaredEffects: []` and `missingEffects: ["database.read"]`:

```
contract.effects [
  database.read
]
```

Example output for a flow with `declaredEffects: ["audit.write"]` and `missingEffects: ["database.read", "network.outbound"]`:

```
contract.effects [
  audit.write
  database.read
  network.outbound
]
```

The suggested block is complete and sorted — the developer can paste it directly without reordering.

---

## Dev vs Production Mode

| Mode | Behaviour when `missingEffects` is non-empty |
|---|---|
| `galerina check` (dev) | Diagnostic severity: **warning**. `suggestedCode` is included. Compilation continues. |
| `galerina build --production` | Diagnostic severity: **error**. Build fails. No effects are silently granted. |

In dev mode the compiler is a helpful assistant: it tells you what you are missing and shows you how to fix it. In production mode the contract is enforced strictly — a flow that calls `database.find` without declaring `database.read` does not build.

The diagnostic code for both severities is `SPORE-EFFECT-001`.

---

## AI Semantic Graph Addition

Flow nodes emitted into `galerina.ai.json` are extended with effect tracking data:

```json
{
  "type": "flow",
  "name": "getUserOrders",
  "declaredEffects": ["database.read"],
  "inferredEffects": ["database.read", "network.outbound"],
  "missingEffects": ["network.outbound"]
}
```

This allows AI tooling and static analysis consumers to reason about effect completeness without re-running the compiler.

---

## Important Design Rule

> Effect inference is not authority granting. The compiler may suggest; the developer must approve.

Inference populates `missingEffects` and generates `suggestedCode`. It does not automatically add those effects to the contract. The developer reads the suggestion, understands what the effect means, and adds it deliberately. This keeps the contract meaningful: every line in `contract.effects` is a conscious decision.

---

## Test Cases

### 1. No effects declared, `database.find` used

```
flow getUser {
  db.find({ id: userId })
}
```

- `declaredEffects`: `[]`
- `inferredEffects`: `["database.read"]`
- `missingEffects`: `["database.read"]`
- Diagnostic: `SPORE-EFFECT-001` warning with suggested patch.

---

### 2. Correct declaration — no missing effects

```
flow getUser {
  contract.effects [database.read]
  db.find({ id: userId })
}
```

- `declaredEffects`: `["database.read"]`
- `inferredEffects`: `["database.read"]`
- `missingEffects`: `[]`
- No diagnostic.

---

### 3. Transitive: `getUser` calls `dbQuery` which uses `database.find`

```
flow dbQuery {
  db.find({ id: id })
}

flow getUser {
  dbQuery(userId)
}
```

- `dbQuery` — `inferredEffects`: `["database.read"]`
- `getUser` — direct `inferredEffects`: `[]`; after transitive propagation: `["database.read"]`
- `getUser` — `missingEffects`: `["database.read"]`
- Diagnostic on `getUser`.

---

### 4. Multiple effects: `database.find` + `audit.write`

```
flow getUserAudited {
  db.find({ id: userId })
  audit.write({ action: "getUser", userId })
}
```

- `declaredEffects`: `[]`
- `inferredEffects`: `["audit.write", "database.read"]` (sorted)
- `missingEffects`: `["audit.write", "database.read"]`
- `suggestedCode`:
  ```
  contract.effects [
    audit.write
    database.read
  ]
  ```

---

## Rules at a Glance

- All effect arrays (`declaredEffects`, `inferredEffects`, `missingEffects`) are sorted lexicographically for determinism.
- `EFFECT_REGISTRY` is the single source of truth — no scattered hardcoded effect name strings anywhere in the compiler.
- `missingEffects` is always a set difference: `inferredEffects - declaredEffects`.
- `SPORE-EFFECT-001` diagnostics always include `suggestedCode` containing the complete, ready-to-paste `contract.effects` block.
- In dev mode the diagnostic is a warning; in production it is an error.
- The compiler suggests — the developer approves.

---

## See Also

- `effect-checker-spec` — the rule engine that validates declared effects against capability grants.
- `capability-registry.yaml` — the runtime registry that maps effects to capability tokens.
- `galerina-gradual-capability-inference` — the broader gradual typing approach that effect inference is part of.
