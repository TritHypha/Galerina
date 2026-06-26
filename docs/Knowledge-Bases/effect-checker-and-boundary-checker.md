# Effect Checker and Boundary Checker

## Status

```text
Package: galerina-core-compiler
Area: effect checker and boundary checker
Version target: v0.2
Implementation status: fully specified, implementation pending
Canonical diagnostic ranges: SPORE-EFFECT-001 through SPORE-EFFECT-004, SPORE-BOUNDARY-001 through SPORE-BOUNDARY-004
Primary compiler outputs: effect graph, boundary graph, runtime manifest input metadata
```

The effect checker and boundary checker are complementary compiler systems.

| Component | Question answered |
| --- | --- |
| Effect checker | What authority does this code require? |
| Boundary checker | Is that authority allowed to cross this boundary? |

Together they turn Galerina source into machine-readable governance metadata:

```text
source code -> checked program -> effect graph -> boundary graph -> runtime manifest
```

They must fail closed. If the compiler cannot prove that an effect or boundary crossing is safe, the build must emit diagnostics and refuse to treat the program as deployment-safe.

---

## Design Goals

```text
explicit authority
transitive effect propagation
fail-closed boundary checks
deterministic diagnostics
runtime-manifest-ready metadata
AI-readable compiler output
safe API/package/runtime boundaries
no silent authority widening
```

The systems do not grant authority. They only identify, validate, and report authority that source code explicitly requires.

---

## Compiler Pipeline Position

The effect checker runs after parsing, binding, and type checking. The boundary checker runs after effect inference and propagation.

```text
lexer
  -> parser
  -> AST normalisation
  -> symbol binding
  -> type checker
  -> effect inference
  -> effect graph construction
  -> effect propagation
  -> boundary graph construction
  -> boundary validation
  -> capability resolution
  -> runtime manifest generation
```

The runtime manifest generator consumes both graphs. It must not invent effects, boundaries, or capabilities that these passes did not produce.

---

## Canonical Effect Categories

```ts
export type EffectCategory =
  | "network"
  | "database"
  | "filesystem"
  | "environment"
  | "secret"
  | "process"
  | "memory"
  | "compute"
  | "ai"
  | "interop"
```

These categories are policy groupings. Individual effects may be more specific:

```text
network.http.request
database.read
database.write
filesystem.read
filesystem.write
secret.read
process.spawn
ai.inference
interop.native_call
```

---

## Effect Interface

```ts
export interface Effect {
  id: string

  /**
   * Human-readable effect name.
   * Examples: "network", "database.write", "secret.read".
   */
  name: string

  /**
   * Category used for deployment policy and target compatibility checks.
   */
  category: EffectCategory

  /**
   * Unsafe effects require explicit permission or capability approval.
   */
  unsafe: boolean

  /**
   * Boundary-sensitive effects must be checked at package/API/runtime boundaries.
   */
  boundarySensitive: boolean

  /**
   * Optional runtime capability required before this effect may execute.
   */
  requiredCapability?: string
}
```

Example registry entry:

```ts
export const NETWORK_HTTP_REQUEST: Effect = {
  id: "effect.network.http.request",
  name: "network.http.request",
  category: "network",
  unsafe: true,
  boundarySensitive: true,
  requiredCapability: "NetworkRequest"
}
```

---

## EffectReference

The checker should use lightweight references inside graphs and checked IR.

```ts
export interface EffectReference {
  /** Stable name from the effect registry. */
  name: string

  /** Source location that caused the effect, if known. */
  sourceLocation?: SourceLocation

  /** True when the effect came from a callee rather than the local body. */
  inherited?: boolean

  /** Function id that introduced this inherited effect. */
  inheritedFromFunctionId?: string
}
```

---

## CheckedFunction Interface

Every checked function must carry effect and boundary metadata.

```ts
export interface CheckedFunction {
  id: string
  name: string

  /** Effects explicitly declared in the function signature. */
  declaredEffects: EffectReference[]

  /** Effects inferred directly from this function's body. */
  inferredEffects: EffectReference[]

  /** Effects inherited from called functions after propagation. */
  transitiveEffects: EffectReference[]

  /** Effective effects = declared + inferred + transitive, normalised by name. */
  effectiveEffects: EffectReference[]

  /** Function ids called by this function. */
  outgoingCalls: string[]

  /** Boundary requirements found in this function or inherited from callees. */
  boundaryRequirements: BoundaryRequirement[]

  diagnostics: CompilerDiagnostic[]
}
```

---

## EffectGraphNode Interface

```ts
export interface EffectGraphNode {
  functionId: string

  /** Direct call edges from this function to callees. */
  outgoingCalls: string[]

  /** Reverse call edges used for explain output and propagation debugging. */
  incomingCalls: string[]

  /** Effects declared by the function. */
  declaredEffects: EffectReference[]

  /** Effects inferred from the local function body. */
  inferredEffects: EffectReference[]

  /** Effects inherited from callees after propagation. */
  transitiveEffects: EffectReference[]
}
```

---

## EffectGraph Interface

```ts
export interface EffectGraph {
  nodes: EffectGraphNode[]
  nodeMap: Map<string, EffectGraphNode>
}
```

The graph must be deterministic. Nodes should be sorted by `functionId` before serialisation or manifest generation.

---

## Effect Inference

Effect inference walks checked AST or checked IR and records operations that require runtime authority.

```ts
export function inferExpressionEffects(
  expression: CheckedExpression
): EffectReference[] {
  switch (expression.kind) {
    case "HttpCallExpression":
      return [{ name: "network.http.request", sourceLocation: expression.sourceLocation }]

    case "DatabaseQueryExpression":
      return [{ name: "database.read", sourceLocation: expression.sourceLocation }]

    case "DatabaseMutationExpression":
      return [{ name: "database.write", sourceLocation: expression.sourceLocation }]

    case "SecretReadExpression":
      return [{ name: "secret.read", sourceLocation: expression.sourceLocation }]

    case "ShellExecExpression":
      return [{ name: "process.spawn", sourceLocation: expression.sourceLocation }]

    case "AiInferenceExpression":
      return [{ name: "ai.inference", sourceLocation: expression.sourceLocation }]

    default:
      return []
  }
}
```

---

## Effect Propagation

Effects propagate through the call graph.

If:

```text
route -> flow -> fn
```

and the `fn` performs `database.write`, then the `flow` — and by extension the `route` that called it — also has a transitive `database.write` effect.

---

## propagateEffects() Iterative Fixpoint

A fixpoint algorithm is required so recursive and multi-hop call graphs stabilise deterministically.

```ts
export function propagateEffects(
  graph: EffectGraph
): EffectGraph {
  let changed = true

  while (changed) {
    changed = false

    for (const node of graph.nodes) {
      for (const childId of node.outgoingCalls) {
        const child = graph.nodeMap.get(childId)

        if (!child) {
          continue
        }

        const childEffects = [
          ...child.inferredEffects,
          ...child.transitiveEffects
        ]

        for (const effect of childEffects) {
          if (!containsEffect(node.transitiveEffects, effect.name)) {
            node.transitiveEffects.push({
              ...effect,
              inherited: true,
              inheritedFromFunctionId: child.functionId
            })

            changed = true
          }
        }
      }
    }
  }

  return graph
}

function containsEffect(
  effects: EffectReference[],
  effectName: string
): boolean {
  return effects.some(effect => effect.name === effectName)
}
```

---

## Effect Validation Rules

After propagation, the checker validates declared, inferred, and transitive effects.

```ts
export function validateFunctionEffects(
  fn: CheckedFunction,
  registry: EffectRegistry,
  target: RuntimeTarget
): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []

  for (const effect of fn.effectiveEffects) {
    if (!registry.has(effect.name)) {
      diagnostics.push({
        code: "SPORE-EFFECT-001",
        severity: "error",
        message: `Unknown or undeclared effect ${effect.name}.`,
        sourceLocation: effect.sourceLocation
      })
    }

    if (!isEffectAllowedOnTarget(effect.name, target)) {
      diagnostics.push({
        code: "SPORE-EFFECT-002",
        severity: "error",
        message: `Effect ${effect.name} is forbidden for target ${target}.`,
        sourceLocation: effect.sourceLocation
      })
    }
  }

  for (const transitive of fn.transitiveEffects) {
    if (!containsEffect(fn.declaredEffects, transitive.name)) {
      diagnostics.push({
        code: "SPORE-EFFECT-004",
        severity: "error",
        message: `Function ${fn.name} inherits ${transitive.name} but does not declare it.`,
        sourceLocation: transitive.sourceLocation
      })
    }
  }

  return diagnostics
}
```

---

## Canonical SPORE-EFFECT Codes

| Code | Meaning | Severity | Typical fix |
| --- | --- | --- | --- |
| `SPORE-EFFECT-001` | Unknown or undeclared effect | error | Declare the effect or add it to the registry |
| `SPORE-EFFECT-002` | Effect forbidden for selected target | error | Change target or remove the effect |
| `SPORE-EFFECT-003` | Effect escalation detected | error | Narrow callee authority or update capability policy |
| `SPORE-EFFECT-004` | Transitive effect mismatch | error/warning | Declare inherited effect or remove effectful call |

`SPORE-EFFECT-001` through `SPORE-EFFECT-004` are the canonical v0.2 compiler codes for this checker. Older `SPORE-E4*` codes may remain as compatibility aliases in CLI output, but new reports should use the `SPORE-EFFECT-*` range.

---

## Boundary Types

```ts
export type BoundaryType =
  | "api"
  | "webhook"
  | "worker"
  | "job"
  | "network"
  | "database"
  | "secret"
  | "filesystem"
  | "ffi"
  | "ai"
  | "wasm"
```

---

## Boundary Interface

```ts
export interface Boundary {
  id: string

  type: BoundaryType

  /** Trust level at this boundary. */
  trustLevel:
    | "untrusted"
    | "validated"
    | "internal"
    | "privileged"

  /** Effects explicitly allowed to cross the boundary. */
  allowedEffects: string[]

  /** Effects explicitly denied at this boundary. */
  deniedEffects: string[]

  /** Runtime or deployment policies required before execution. */
  requiredPolicies: BoundaryPolicy[]
}
```

---

## BoundaryRequirement Interface

```ts
export interface BoundaryRequirement {
  boundaryType: BoundaryType

  /** Input validation must run before crossing this boundary. */
  requiresValidation: boolean

  /** Caller identity or route auth is required. */
  requiresAuth: boolean

  /** Rate limiting is required for public/API boundaries. */
  requiresRateLimit: boolean

  /** Replay protection is required for webhooks and signed callbacks. */
  requiresReplayProtection: boolean

  /** Secrets must be redacted or kept as SecretReference values. */
  requiresSecretProtection: boolean
}
```

---

## BoundaryGraph

```ts
export interface BoundaryNode {
  id: string
  boundary: Boundary
}

export interface BoundaryEdge {
  from: string
  to: string

  /** Effects transferred through this boundary edge. */
  transferredEffects: string[]

  /** Secret references transferred through this edge. Raw secrets are forbidden. */
  transferredSecrets: string[]

  requiresValidation: boolean
}

export interface BoundaryGraph {
  boundaries: BoundaryNode[]
  edges: BoundaryEdge[]
}
```

---

## Boundary Validation

```ts
export function validateBoundaryEdge(
  edge: BoundaryEdge,
  boundary: Boundary
): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []

  for (const effect of edge.transferredEffects) {
    if (boundary.deniedEffects.includes(effect)) {
      diagnostics.push({
        code: "SPORE-BOUNDARY-001",
        severity: "error",
        message: `Effect ${effect} is denied at boundary ${boundary.id}.`
      })
    }

    if (
      boundary.allowedEffects.length > 0 &&
      !boundary.allowedEffects.includes(effect)
    ) {
      diagnostics.push({
        code: "SPORE-BOUNDARY-002",
        severity: "error",
        message: `Effect ${effect} is not allowed at boundary ${boundary.id}.`
      })
    }
  }

  if (edge.transferredSecrets.length > 0 && boundary.type !== "secret") {
    diagnostics.push({
      code: "SPORE-BOUNDARY-003",
      severity: "error",
      message: `Secret values cannot cross ${boundary.type} boundary ${boundary.id}.`
    })
  }

  if (edge.requiresValidation && !hasValidationPolicy(boundary)) {
    diagnostics.push({
      code: "SPORE-BOUNDARY-004",
      severity: "error",
      message: `Boundary ${boundary.id} requires validation policy before execution.`
    })
  }

  return diagnostics
}
```

---

## Canonical SPORE-BOUNDARY Codes

| Code | Meaning | Severity | Typical fix |
| --- | --- | --- | --- |
| `SPORE-BOUNDARY-001` | Denied effect crosses boundary | error | Remove effect or change boundary policy |
| `SPORE-BOUNDARY-002` | Effect not present in boundary allowlist | error | Add explicit allow policy or move code behind safer boundary |
| `SPORE-BOUNDARY-003` | Secret or protected value crosses unsafe boundary | error | Use SecretReference/redaction or keep secret inside secret boundary |
| `SPORE-BOUNDARY-004` | Required boundary policy missing | error | Add validation/auth/rate-limit/replay/secret policy |

`SPORE-BOUNDARY-001` through `SPORE-BOUNDARY-004` are the canonical v0.2 compiler codes for this checker. Older expanded boundary codes may be retained in historical reports, but new compiler reports should use the four-code canonical range above.

---

## Checked IR: CheckedCallExpression

Checked call expressions connect type checking, effect propagation, and boundary checking.

```ts
export interface CheckedCallExpression {
  kind: "CheckedCallExpression"

  /** Function id resolved during binding/type checking. */
  targetFunctionId: string

  argumentTypes: CheckedType[]

  /** Effects inferred from the call target. */
  inferredEffects: EffectReference[]

  /** Boundary requirements introduced by this call. */
  boundaryRequirements: BoundaryRequirement[]

  sourceLocation: SourceLocation
}
```

---

## Example: Network Effect

```galerina
pub fn load_profile(http: HttpClient, id: UserId)
    -> Result<UserProfile, NetworkError>
    effect network
{
    return http.get("/users/" + id)
}
```

Compiler result:

```json
{
  "flow": "load_profile",
  "declaredEffects": ["network"],
  "inferredEffects": ["network.http.request"],
  "transitiveEffects": [],
  "result": "pass"
}
```

---

## Example: Missing Transitive Effect

```galerina
pub fn load_profile(http: HttpClient, id: UserId)
    -> Result<UserProfile, NetworkError>
    effect network
{
    return http.get("/users/" + id)
}

pub fn render_profile_page(http: HttpClient, id: UserId) -> Html {
    let profile = load_profile(http, id)
    return render(profile)
}
```

`render_profile_page` inherits `network` from `load_profile`. If it does not declare that effect, the checker emits:

```text
SPORE-EFFECT-004: Function render_profile_page inherits network but does not declare it.
```

Corrected:

```galerina
pub fn render_profile_page(http: HttpClient, id: UserId)
    -> Html
    effect network
{
    let profile = load_profile(http, id)
    return render(profile)
}
```

---

## Example: Secret Boundary Failure

```galerina
pub fn debug_secret(secret: SecretString) {
    print(secret)
}
```

The boundary checker must reject this because a protected secret crosses a runtime/logging boundary.

```text
SPORE-BOUNDARY-003: Secret values cannot cross runtime boundary runtime.print.
```

Corrected:

```galerina
pub fn debug_secret(secret: SecretString) {
    print(secret.redacted())
}
```

---

## Example: API Boundary Failure

```galerina
route POST "/admin/restart" {
    process.spawn("systemctl restart app")
}
```

A public API route cannot directly cross into process execution unless an explicit privileged policy exists.

```text
SPORE-BOUNDARY-001: Effect process.spawn is denied at boundary api.public.
```

Corrected design:

```galerina
route POST "/admin/restart"
    auth AdminOnly
    policy privileged_operation
{
    enqueue_restart_job()
}
```

The route should enqueue a governed job rather than directly spawning a process from the public API boundary.

---

## Example: WASM Target Boundary

```galerina
target wasm

pub fn read_local_file(path: Text) -> Text
    effect filesystem
{
    return filesystem.read(path)
}
```

The target policy rejects this because direct filesystem access is not allowed for the selected WASM target.

```text
SPORE-EFFECT-002: Effect filesystem.read is forbidden for target wasm.
```

---

## Runtime Manifest Feed

The effect checker and boundary checker feed pass 14 manifest generation.

```ts
export interface FunctionManifest {
  id: string
  name: string
  declaredEffects: string[]
  inferredEffects: string[]
  transitiveEffects: string[]
  boundaries: string[]
  capabilities: string[]
}

export interface EffectManifest {
  name: string
  category: string
  unsafe: boolean
  boundarySensitive: boolean
  requiredCapability?: string
}

export interface BoundaryManifest {
  id: string
  type: string
  trustLevel: string
  allowedEffects: string[]
  deniedEffects: string[]
  requiredPolicies: string[]
}
```

Example function manifest:

```json
{
  "id": "fn.render_profile_page",
  "name": "render_profile_page",
  "declaredEffects": ["network"],
  "inferredEffects": [],
  "transitiveEffects": ["network.http.request"],
  "boundaries": ["api.public"],
  "capabilities": ["NetworkRequest"]
}
```

---

## Reports

The checker should produce both human-readable and machine-readable report data.

```json
{
  "schemaVersion": "galerina.effect-boundary-report.v0.2",
  "effects": {
    "functionCount": 12,
    "effectfulFunctionCount": 5,
    "diagnostics": []
  },
  "boundaries": {
    "boundaryCount": 4,
    "deniedEdges": 0,
    "diagnostics": []
  }
}
```

---

## Suggested File Layout

```text
packages-galerina/galerina-core-compiler/src/

  effects/
    effect-types.ts
    effect-registry.ts
    effect-inference.ts
    effect-propagation.ts
    effect-graph.ts
    effect-checker.ts
    effect-policy.ts
    effect-diagnostics.ts

  boundaries/
    boundary-types.ts
    boundary-graph.ts
    boundary-policy.ts
    boundary-checker.ts
    boundary-diagnostics.ts

  reports/
    effect-report.ts
    boundary-report.ts
```

---

## 16-Item Implementation Checklist

```text
 1. Define Effect and EffectCategory v0.2 types
 2. Define EffectReference for checked IR and graphs
 3. Implement the effect registry
 4. Parse function-level effect declarations
 5. Infer effects from checked AST/IR expressions
 6. Build EffectGraph from checked functions and call edges
 7. Propagate effects using iterative fixpoint
 8. Validate undeclared, forbidden, escalated, and transitive effects
 9. Emit SPORE-EFFECT-001 through SPORE-EFFECT-004 diagnostics
10. Define Boundary, BoundaryRequirement, BoundaryEdge, and BoundaryGraph
11. Build boundary graph from routes, packages, jobs, workers, calls, and interop
12. Validate denied effects, allowlists, secret movement, and required policies
13. Emit SPORE-BOUNDARY-001 through SPORE-BOUNDARY-004 diagnostics
14. Generate effect-report.json and boundary-report.json
15. Feed FunctionManifest, EffectManifest, and BoundaryManifest data into pass 14
16. Add tests for propagation, recursive calls, secret leakage, target denial, and API boundary denial
```

---

## Test Strategy

```ts
describe("effect propagation", () => {
  it("inherits network effects through the call graph", () => {
    const graph = createFixtureGraph({
      root: ["loadProfile"],
      loadProfile: []
    })

    graph.nodeMap.get("loadProfile")?.inferredEffects.push({
      name: "network.http.request"
    })

    propagateEffects(graph)

    expect(
      graph.nodeMap.get("root")?.transitiveEffects.some(effect =>
        effect.name === "network.http.request"
      )
    ).toBe(true)
  })
})
```

```ts
describe("boundary checker", () => {
  it("rejects secrets crossing non-secret boundaries", () => {
    const diagnostics = validateBoundaryEdge(
      {
        from: "fn.loadSecret",
        to: "runtime.print",
        transferredEffects: [],
        transferredSecrets: ["SecretString"],
        requiresValidation: false
      },
      {
        id: "runtime.print",
        type: "api",
        trustLevel: "validated",
        allowedEffects: [],
        deniedEffects: [],
        requiredPolicies: []
      }
    )

    expect(diagnostics.some(d => d.code === "SPORE-BOUNDARY-003")).toBe(true)
  })
})
```

---

## Fail-Closed Rules

The compiler must never:

```text
silently ignore unknown effects
silently widen authority
silently allow a denied boundary crossing
silently pass raw secrets into logs, reports, APIs, or AI prompts
silently downgrade target policy
silently treat missing boundary policy as safe
```

If metadata is incomplete, the checker must produce diagnostics and prevent the build from being marked deployment-safe.

---

## Relationship to Other Systems

```text
effect checker       -> feeds capability resolver and runtime manifest
boundary checker     -> feeds deployment policy, API server, reports, and audit metadata
runtime manifest     -> consumes function/effect/boundary metadata
galerina explain       -> explains effect inheritance and boundary decisions
galerina deploy        -> validates manifest against target policy
galerina-core-security -> supplies secret-safe boundaries and redaction rules
galerina-core-network  -> supplies network destination policies
```

---

## Summary

The effect checker identifies what code can do. The boundary checker decides whether that authority may safely cross a specific trust, package, API, runtime, or target boundary.

For v0.2, the canonical compiler contracts are:

```text
Effect
CheckedFunction
EffectGraphNode
EffectGraph
Boundary
BoundaryRequirement
BoundaryEdge
BoundaryGraph
CheckedCallExpression
```

The canonical diagnostic ranges are:

```text
SPORE-EFFECT-001 through SPORE-EFFECT-004
SPORE-BOUNDARY-001 through SPORE-BOUNDARY-004
```

These systems are required before Galerina can truthfully claim governed execution, runtime authority control, deployment-safe manifests, or audit-grade execution proof.
