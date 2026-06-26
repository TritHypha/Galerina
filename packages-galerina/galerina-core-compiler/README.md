# Galerina Compiler

`galerina-core-compiler` is the future compiler package for Galerina parser, checker, IR,
diagnostics and report generation.

It belongs in:

```text
/packages-galerina/galerina-core-compiler
```

Use this package for:

```text
lexer
parser
AST
symbol table
type checker
effect checker
security checker integration
memory checker
IR generation
optimiser
linker
diagnostics
compiler reports
source maps
AI context output
```

## Early Safety Scan

The current package includes a conservative compiler-facing syntax safety scan
for the v1 core subset. It is not a replacement for the future parser, but it
blocks several high-risk patterns while the parser and checker pipeline are
being built:

```text
Tri used directly as an if condition
Tri assigned directly to Bool or Decision
Decision assigned directly to Tri
non-exhaustive Tri matches
unknown_as: true inside secure flow
raw secret-like string literals
unsafe dynamic code execution calls
```

The scan is intentionally fail-safe. It emits diagnostics for suspicious source
instead of trying to infer intent from ambiguous syntax.

## Compiler Pass Pipeline

14-pass pipeline:

```text
 1. Lexer
 2. Parser
 3. AST builder
 4. Type checker
 5. Visibility checker
 6. Effect checker
 7. Boundary checker
 8. Capability resolver
 9. Package graph validator
10. Runtime graph generator
11. Optimisation planner
12. Backend emitter
13. Audit metadata emitter
14. Runtime manifest generator
```

## Runtime Manifest Generation (Pass 14)

Pass 14 aggregates all compiler metadata into a canonical governance
artefact: `runtime-manifest.json`.

The manifest includes:

```text
module name
declared and inferred effects
capability grants
runtime targets
trust level
audit requirements
integrity hashes
```

### Internal Structure

```text
packages-galerina/galerina-core-compiler/src/manifests/
```

Suggested files:

```text
manifest-builder.ts
manifest-schema.ts
manifest-hash.ts
manifest-serializer.ts
manifest-validator.ts
```

### RuntimeManifest Type (v0.2)

Full manifest produced by pass 14. All sub-types are strongly typed — no
raw `string[]` or `any`.

```ts
export interface RuntimeManifest {
    schemaVersion: "galerina.manifest.v1"
    buildId: string
    generatedAt: string          // ISO-8601
    target: RuntimeTarget
    routes: RouteManifest[]
    functions: FunctionManifest[]
    effects: EffectManifest[]
    permissions: string[]
    boundaries: BoundaryManifest[]
    reports: string[]
    diagnostics: CompilerDiagnostic[]
}

export interface RouteManifest {
    id: string
    method: HttpMethod
    path: string
    handler: string
    effects: string[]
    auth: boolean
    rateLimit: boolean
}

export interface FunctionManifest {
    id: string
    name: string
    declaredEffects: string[]
    inferredEffects: string[]
    boundaryRequirements: string[]
}

export interface EffectManifest {
    id: string
    name: string
    category: EffectCategory
    unsafe: boolean
    boundarySensitive: boolean
}

export interface BoundaryManifest {
    id: string
    type: BoundaryType
    trustLevel: TrustLevel
    allowedEffects: string[]
    deniedEffects: string[]
}
```

### BuildManifestInput

```ts
export interface BuildManifestInput {
    checkedProgram: CheckedProgram
    effectGraph: EffectGraph
    boundaryGraph: BoundaryGraph
    compilerOptions: CompilerOptions
}

export function buildManifest(input: BuildManifestInput): RuntimeManifest
export function validateManifest(manifest: RuntimeManifest): CompilerDiagnostic[]
```

### Manifest Pipeline

```text
AST
    ↓
effect checker      → EffectGraph
    ↓
boundary checker    → BoundaryGraph
    ↓
capability resolver
    ↓
runtime graph builder
    ↓
manifest serializer → RuntimeManifest
    ↓
runtime-manifest.json
```

### Manifest Output Layout

```text
build/
  manifests/
    runtime-manifest.json
  reports/
    effect-report.json
    boundary-report.json
    capability-report.json
    diagnostics.json
```

### Manifest Diagnostic Codes (SPORE-MANIFEST series)

| Code | Meaning |
| --- | --- |
| `SPORE-MANIFEST-001` | missing runtime manifest |
| `SPORE-MANIFEST-002` | manifest integrity failure |
| `SPORE-MANIFEST-003` | unsupported manifest version |
| `SPORE-MANIFEST-004` | invalid capability reference |
| `SPORE-MANIFEST-005` | runtime target mismatch |

## Effect Checker (Planned)

The effect checker is not yet implemented. When implemented it will validate that
functions declare all side effects they perform, that effects propagate through
the call graph correctly, and that compile-time code does not attempt runtime-only
effects.

### Effect Interface

```ts
export interface Effect {
    id: string
    name: string
    category: EffectCategory
    unsafe: boolean
    boundarySensitive: boolean
    requiredCapability?: string
}

export type EffectCategory =
    | "network"
    | "database"
    | "filesystem"
    | "shell"
    | "process"
    | "secret"
    | "ai"
    | "gpu"
    | "native"
    | "custom"
```

### Checked Function and Effect Graph

```ts
export interface CheckedFunction {
    id: string
    name: string
    declaredEffects: Effect[]
    inferredEffects: Effect[]
    effectiveEffects: Effect[]        // declaredEffects ∪ inferredEffects
    boundaryRequirements: BoundaryRequirement[]
    diagnostics: CompilerDiagnostic[]
}

export interface EffectGraphNode {
    functionId: string
    outgoingCalls: string[]           // functionIds called by this function
    inferredEffects: Effect[]
}

export interface EffectGraph {
    nodes: EffectGraphNode[]
    nodeMap: Map<string, EffectGraphNode>
}
```

### Effect Propagation Algorithm

```ts
// Infer effects for a single expression by kind
export function inferExpressionEffects(
    expression: Expression,
    context: CheckContext
): Effect[]

// Iterative fixpoint: propagate effects until stable
export function propagateEffects(graph: EffectGraph): EffectGraph
```

The propagation algorithm runs iteratively. Each pass updates every node's
`inferredEffects` based on the effects of its callees. Iteration continues
until no node's inferred set changes (fixpoint).

### Effect Diagnostic Codes (SPORE-EFFECT series)

| Code | Meaning |
| --- | --- |
| `SPORE-EFFECT-001` | undeclared effect — function uses an effect not in its declaration |
| `SPORE-EFFECT-002` | forbidden effect — effect is not permitted in this context |
| `SPORE-EFFECT-003` | missing capability — effect requires a capability not granted |
| `SPORE-EFFECT-004` | unsafe transitive — unsafe effect propagated from callee |

Legacy codes `SPORE-E4001` (undeclared effect), `SPORE-E4002` (undeclared propagated
effect), `SPORE-E4003` (forbidden compile-time effect) remain active until the
SPORE-EFFECT series fully replaces them.

See `docs/Knowledge-Bases/effect-checker-and-boundary-checker.md` for the full
specification including the 12-effect table, algorithm, and checker output schema.

## Boundary Checker (Planned)

The boundary checker is not yet implemented. When implemented it will validate
that code does not cross module/package/trust/runtime boundaries incorrectly.
It includes visibility checking, capability boundary checking, secret leakage
prevention, and filesystem/network path allowlists.

### Boundary Interface

```ts
export interface Boundary {
    id: string
    type: BoundaryType
    trustLevel: TrustLevel
    allowedEffects: string[]
    deniedEffects: string[]
    requiredPolicies: string[]
}

export type BoundaryType =
    | "api"
    | "webhook"
    | "worker"
    | "job"
    | "network"
    | "database"
    | "secret"
    | "ffi"
    | "filesystem"
    | "ai"

export type TrustLevel =
    | "untrusted"
    | "validated"
    | "internal"
    | "privileged"

export interface BoundaryRequirement {
    boundaryType: BoundaryType
    requiresValidation: boolean
    requiresAuth: boolean
    requiresRateLimit: boolean
    requiresReplayProtection: boolean
    requiresSecretProtection: boolean
}

export interface BoundaryEdge {
    from: string
    to: string
    transferredEffects: string[]
    transferredSecrets: string[]
    requiresValidation: boolean
}

export interface BoundaryGraph {
    boundaries: Boundary[]
    edges: BoundaryEdge[]
}
```

### Checked Call Expression (IR)

```ts
export interface CheckedCallExpression {
    callee: string
    arguments: CheckedExpression[]
    resolvedEffects: Effect[]
    boundaryContext: Boundary | null
}
```

### Boundary Diagnostic Codes

**Compiler-specific (SPORE-BOUNDARY series):**

| Code | Meaning |
| --- | --- |
| `SPORE-BOUNDARY-001` | missing validation at untrusted boundary |
| `SPORE-BOUNDARY-002` | missing replay protection on webhook boundary |
| `SPORE-BOUNDARY-003` | unsafe effect crosses trust boundary |
| `SPORE-BOUNDARY-004` | secret leaked across boundary |

**Extended boundary checker codes (SPORE-BOUNDARY-001 through SPORE-BOUNDARY-009)
and legacy codes SPORE-E4004 through SPORE-E4006** remain active. See
`docs/Knowledge-Bases/effect-checker-and-boundary-checker.md` for the
full 16-item implementation checklist and all boundary violation examples.

## Layered Compute Adapter Model

The compiler emits target-specific IR through a layered adapter chain. The
compiler itself is target-agnostic; target packages own the specialised output.

```text
galerina-core-compiler
    ↓  emits checked IR + RuntimeManifest
galerina-core-compute
    ↓  target selection, compatibility report
galerina-target-gpu         galerina-target-wasm       galerina-target-photonic
    ↓                          ↓                          ↓
galerina-device-nvidia      (browser / wasi / edge)    galerina-device-optical-io
galerina-device-amd
galerina-device-intel-gaudi
```

### ComputeDeviceProfile

```ts
export interface ComputeDeviceProfile {
    id: string
    vendor: "nvidia" | "amd" | "intel" | "optical" | "generic"
    family: string
    kind: "gpu" | "optical_io" | "photonic" | "cpu"
    capabilities: string[]
    memoryMb: number
    supports(effect: Effect): boolean
}

export function selectDevice(
    profiles: ComputeDeviceProfile[],
    plan: GpuPlan
): ComputeDeviceProfile | null
```

## Internal File Layout

```text
packages-galerina/galerina-core-compiler/src/
  effects/
    effect-interface.ts      ← Effect, EffectCategory
    effect-graph.ts          ← EffectGraph, EffectGraphNode
    effect-propagation.ts    ← propagateEffects(), inferExpressionEffects()
    effect-diagnostics.ts    ← SPORE-EFFECT-001–004
  boundaries/
    boundary-interface.ts    ← Boundary, BoundaryType, TrustLevel
    boundary-graph.ts        ← BoundaryGraph, BoundaryEdge
    boundary-requirement.ts  ← BoundaryRequirement
    boundary-diagnostics.ts  ← SPORE-BOUNDARY-001–004
  manifests/
    manifest-builder.ts      ← buildManifest()
    manifest-schema.ts       ← RuntimeManifest, sub-types
    manifest-hash.ts
    manifest-serializer.ts
    manifest-validator.ts    ← validateManifest()
  reports/
    compiler-report.ts       ← CompilerDiagnostic, pass reports
  ir/
    checked-call.ts          ← CheckedCallExpression
    checked-function.ts      ← CheckedFunction
```

## Boundary

`galerina-core` owns language documentation, grammar contracts and core safety rules.
`galerina-core-compiler` should own the implementation-oriented compiler pipeline.

Target-specific output belongs in target packages such as `galerina-target-native`,
`galerina-target-wasm`, `galerina-target-gpu` and `galerina-target-photonic`.

Final rule:

```text
galerina-core defines the language contract.
galerina-core-compiler implements compiler pipeline contracts.
target packages own target-specific output.
```
