# Galerina Core Compiler: Manifest Generation (Pass 14)

## Status

```text
Package: galerina-core-compiler
Area: manifest generation
Compiler pass: 14
Version target: v0.2
Implementation status: specified, implementation pending
Primary output: runtime-manifest.json
Related diagnostics: SPORE-MANIFEST-001 through SPORE-MANIFEST-005
```

This document defines the compiler manifest generation pass for Galerina Core Compiler.

Pass 14 turns the checked program, effect graph, boundary graph, route metadata, capability metadata, report metadata, and compiler diagnostics into a canonical `RuntimeManifest`.

The manifest is the governance bridge between:

```text
compiler -> CLI -> runtime -> deploy -> explain -> audit
```

It must be deterministic, hashable, machine-readable, and safe to consume by runtime and deployment tooling.

---

## Why Pass 14 Exists

Earlier compiler passes answer local questions:

```text
type checker       -> is this program type-safe?
effect checker     -> what authority does this code require?
boundary checker   -> where can data/effects safely cross?
capability resolver -> what named authority is required?
```

Pass 14 answers the deployment question:

```text
What exactly has this build proven, and what must the runtime enforce?
```

Without a runtime manifest, the compiler may understand effects and boundaries internally, but the runtime cannot reliably enforce them after compilation.

---

## Pipeline Position

```text
Pass 01 lexer
Pass 02 parser
Pass 03 AST normalisation
Pass 04 symbol binding
Pass 05 type checking
Pass 06 effect inference
Pass 07 effect propagation
Pass 08 boundary checking
Pass 09 capability resolution
Pass 10 route/API extraction
Pass 11 target compatibility planning
Pass 12 report assembly
Pass 13 audit metadata emission
Pass 14 manifest generation
```

Pass 14 must run after all metadata-producing passes have completed.

It must not invent authority. It only serialises compiler-proven metadata.

---

## RuntimeManifest v0.2

```ts
export interface RuntimeManifest {
  /** Stable schema identifier consumed by CLI/runtime/deploy tools. */
  schemaVersion: "galerina.runtime.manifest.v0.2"

  /** Unique deterministic build identifier. */
  buildId: string

  /** ISO timestamp from the build host. */
  generatedAt: string

  /** Target selected during compilation. */
  target: RuntimeTarget

  /** Route-level runtime metadata for API/server packages. */
  routes: RouteManifest[]

  /** Function-level effect, boundary, and capability metadata. */
  functions: FunctionManifest[]

  /** Global effect registry entries observed or required by this build. */
  effects: EffectManifest[]

  /** Boundary policies required by this build. */
  boundaries: BoundaryManifest[]

  /** Named permissions/capabilities required at runtime. */
  permissions: PermissionManifest[]

  /** Reports emitted by the compiler build. */
  reports: ReportManifest[]

  /** Hashes used by verify/deploy/audit tooling. */
  integrity: ManifestIntegrity

  /** Compiler diagnostics relevant to runtime governance. */
  diagnostics: CompilerDiagnostic[]
}
```

---

## RouteManifest

```ts
export interface RouteManifest {
  id: string

  /** HTTP method, e.g. GET, POST, PUT, DELETE. */
  method: string

  /** Public route path. */
  path: string

  /** Checked request type name if available. */
  requestType?: string

  /** Checked response type name if available. */
  responseType?: string

  /** Authentication policy required for this route. */
  auth?: AuthManifest

  /** Request body validation and size policy. */
  body?: BodyManifest

  /** Runtime limits: timeout, body size, rate limits, etc. */
  limits?: LimitsManifest

  /** Effects reachable from this route handler. */
  effects: string[]

  /** Boundary identifiers crossed by this route. */
  boundaries: string[]

  /** Optional webhook policy when this route is a webhook. */
  webhook?: WebhookManifest
}
```

Route manifests are consumed by:

```text
galerina-framework-api-server
galerina explain --runtime
galerina deploy --policy
OpenAPI export tooling
audit/report tooling
```

---

## FunctionManifest

```ts
export interface FunctionManifest {
  id: string
  name: string

  /** Effects explicitly written in source. */
  declaredEffects: string[]

  /** Effects inferred from AST/IR operations. */
  inferredEffects: string[]

  /** Effects inherited through the call graph. */
  transitiveEffects: string[]

  /** Boundaries crossed by this function or its callees. */
  boundaries: string[]

  /** Runtime capabilities required to execute this function. */
  capabilities: string[]

  /** Optional source location for explain/report output. */
  source?: SourceLocation
}
```

Function manifests must include transitive effects. A route or public function is only safe to deploy if the runtime can see all authority reachable below it.

---

## EffectManifest

```ts
export interface EffectManifest {
  name: string

  /** Group used by target policy and deployment policy. */
  category: string

  /** Unsafe-by-default effects require explicit capability. */
  unsafe: boolean

  /** True when the effect must be checked at API/package/runtime boundaries. */
  boundarySensitive: boolean

  /** Capability required by this effect, if any. */
  requiredCapability?: string
}
```

Example:

```json
{
  "name": "network.http.request",
  "category": "network",
  "unsafe": true,
  "boundarySensitive": true,
  "requiredCapability": "NetworkRequest"
}
```

---

## BoundaryManifest

```ts
export interface BoundaryManifest {
  id: string

  /** api, webhook, worker, job, network, database, secret, ffi, filesystem, ai. */
  type: string

  /** untrusted, validated, internal, privileged. */
  trustLevel: string

  /** Effects allowed to cross this boundary. */
  allowedEffects: string[]

  /** Effects explicitly denied at this boundary. */
  deniedEffects: string[]

  /** Policy names required before runtime execution. */
  requiredPolicies: string[]
}
```

Boundary manifests must remain fail-closed. Empty `allowedEffects` means no effect is allowed unless a higher policy explicitly grants it.

---

## BuildManifestInput

```ts
export interface BuildManifestInput {
  /** Fully checked program from earlier compiler passes. */
  checkedProgram: CheckedProgram

  /** Effect graph after iterative fixpoint propagation. */
  effectGraph: EffectGraph

  /** Boundary graph after policy validation. */
  boundaryGraph: BoundaryGraph

  /** Compiler options, target, profile, strict mode, and output paths. */
  compilerOptions: CompilerOptions

  /** Reports emitted before manifest generation. */
  reports: ReportManifest[]
}
```

Pass 14 must reject incomplete inputs. It should not create a manifest from a partially checked program.

---

## buildManifest() Reference Implementation

```ts
export function buildManifest(
  input: BuildManifestInput
): RuntimeManifest {
  assertManifestInputComplete(input)

  const manifest: RuntimeManifest = {
    schemaVersion: "galerina.runtime.manifest.v0.2",
    buildId: createBuildId(input),
    generatedAt: new Date().toISOString(),
    target: input.compilerOptions.target,

    // Route metadata is optional for library packages but required for API packages.
    routes: buildRouteManifests(input),

    // Function metadata is always required because effect authority is function-scoped.
    functions: buildFunctionManifests(input),

    // Effect and boundary registries are derived from checked compiler metadata.
    effects: buildEffectManifests(input),
    boundaries: buildBoundaryManifests(input),

    // Permissions connect effects to runtime capability checks.
    permissions: buildPermissionManifests(input),

    // Report metadata lets explain/deploy/audit locate generated files safely.
    reports: input.reports,

    // Integrity is filled after stable serialisation.
    integrity: emptyManifestIntegrity(),

    diagnostics: input.checkedProgram.diagnostics
  }

  const diagnostics = validateManifest(manifest)

  return {
    ...manifest,
    diagnostics: [
      ...manifest.diagnostics,
      ...diagnostics
    ],
    integrity: buildManifestIntegrity(manifest)
  }
}
```

---

## Stable Manifest Serialisation

Manifest hashing requires deterministic output.

```ts
export function serializeManifestStable(
  manifest: RuntimeManifest
): string {
  return JSON.stringify(sortManifestKeys(manifest), null, 2) + "\n"
}
```

Rules:

```text
sort object keys
sort effects by name
sort boundaries by id
sort functions by id
sort routes by method + path
include trailing newline
never include local absolute paths unless explicitly allowed
never include raw secrets
```

---

## Manifest Integrity

```ts
export interface ManifestIntegrity {
  manifestHash: string
  graphHash: string
  effectGraphHash: string
  boundaryGraphHash: string
  reportHash: string
}
```

```ts
export function buildManifestIntegrity(
  manifest: RuntimeManifest
): ManifestIntegrity {
  const withoutIntegrity = {
    ...manifest,
    integrity: emptyManifestIntegrity()
  }

  return {
    manifestHash: sha256(serializeManifestStable(withoutIntegrity)),
    graphHash: sha256(JSON.stringify(manifest.functions)),
    effectGraphHash: sha256(JSON.stringify(manifest.effects)),
    boundaryGraphHash: sha256(JSON.stringify(manifest.boundaries)),
    reportHash: sha256(JSON.stringify(manifest.reports))
  }
}
```

---

## validateManifest()

```ts
export function validateManifest(
  manifest: RuntimeManifest
): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []

  if (!manifest.schemaVersion) {
    diagnostics.push({
      code: "SPORE-MANIFEST-001",
      severity: "error",
      message: "Runtime manifest is missing schemaVersion."
    })
  }

  if (manifest.schemaVersion !== "galerina.runtime.manifest.v0.2") {
    diagnostics.push({
      code: "SPORE-MANIFEST-003",
      severity: "error",
      message: `Unsupported runtime manifest version: ${manifest.schemaVersion}.`
    })
  }

  for (const fn of manifest.functions) {
    for (const capability of fn.capabilities) {
      if (!manifest.permissions.some(permission => permission.name === capability)) {
        diagnostics.push({
          code: "SPORE-MANIFEST-004",
          severity: "error",
          message: `Function ${fn.name} references unknown capability ${capability}.`
        })
      }
    }
  }

  for (const route of manifest.routes) {
    for (const effect of route.effects) {
      if (!isEffectAllowedForTarget(effect, manifest.target)) {
        diagnostics.push({
          code: "SPORE-MANIFEST-005",
          severity: "error",
          message: `Route ${route.method} ${route.path} uses effect ${effect} not supported by target ${manifest.target}.`
        })
      }
    }
  }

  return diagnostics
}
```

---

## SPORE-MANIFEST Diagnostic Codes

| Code | Meaning | Severity | Fix |
| --- | --- | --- | --- |
| `SPORE-MANIFEST-001` | Runtime manifest missing or incomplete | error | Re-run build after effect/boundary passes complete |
| `SPORE-MANIFEST-002` | Manifest integrity/hash failure | error | Rebuild manifest and verify stable serialisation |
| `SPORE-MANIFEST-003` | Unsupported manifest schema version | error | Upgrade CLI/runtime or regenerate manifest |
| `SPORE-MANIFEST-004` | Invalid capability reference | error | Add missing capability or remove invalid effect |
| `SPORE-MANIFEST-005` | Runtime target mismatch | error | Change target or remove incompatible effects |

---

## Output Files

```text
build/
  manifests/
    runtime-manifest.json
    route-manifest.json
    function-manifest.json
    permissions-manifest.json
    effects-manifest.json
    boundary-manifest.json

  reports/
    compiler-report.json
    effect-report.json
    boundary-report.json
    security-report.json
    runtime-report.json
```

The primary file is `runtime-manifest.json`. Split manifests are secondary convenience outputs for tooling.

---

## Example runtime-manifest.json

```json
{
  "schemaVersion": "galerina.runtime.manifest.v0.2",
  "buildId": "galerina-build-2026-05-25T12-00-00Z",
  "generatedAt": "2026-05-25T12:00:00.000Z",
  "target": "server",
  "routes": [
    {
      "id": "route.users.create",
      "method": "POST",
      "path": "/users",
      "requestType": "CreateUserRequest",
      "responseType": "CreateUserResponse",
      "effects": ["database.write", "audit.write"],
      "boundaries": ["api.public", "database.internal"]
    }
  ],
  "functions": [
    {
      "id": "fn.createUser",
      "name": "createUser",
      "declaredEffects": ["database.write"],
      "inferredEffects": ["database.write", "audit.write"],
      "transitiveEffects": ["database.write", "audit.write"],
      "boundaries": ["database.internal"],
      "capabilities": ["DatabaseWrite", "AuditWrite"]
    }
  ],
  "effects": [
    {
      "name": "database.write",
      "category": "database",
      "unsafe": true,
      "boundarySensitive": true,
      "requiredCapability": "DatabaseWrite"
    }
  ],
  "boundaries": [
    {
      "id": "api.public",
      "type": "api",
      "trustLevel": "untrusted",
      "allowedEffects": [],
      "deniedEffects": ["secret.read", "shell.execute"],
      "requiredPolicies": ["request.validation", "rate.limit"]
    }
  ],
  "permissions": [
    {
      "name": "DatabaseWrite",
      "effect": "database.write",
      "required": true
    }
  ],
  "reports": [],
  "integrity": {
    "manifestHash": "sha256:...",
    "graphHash": "sha256:...",
    "effectGraphHash": "sha256:...",
    "boundaryGraphHash": "sha256:...",
    "reportHash": "sha256:..."
  },
  "diagnostics": []
}
```

---

## CLI Integration

### galerina build

`galerina build` must write `runtime-manifest.json` as part of the build output.

```bash
galerina build --target server --out build
```

Expected output:

```text
build/manifests/runtime-manifest.json
build/reports/compiler-report.json
build/reports/effect-report.json
build/reports/boundary-report.json
```

### galerina verify

`galerina verify` must validate manifest integrity.

```bash
galerina verify --manifest build/manifests/runtime-manifest.json
```

### galerina explain

`galerina explain` should use the manifest to answer:

```text
Which functions require network?
Which route can read secrets?
Which boundary denied deployment?
Which capability is missing?
```

### galerina deploy

`galerina deploy` must fail closed if the manifest is missing, invalid, or incompatible with the selected deployment target.

---

## Implementation Checklist

```text
1. Add runtime-manifest.ts schema definitions
2. Add manifest-builder.ts
3. Add manifest-validator.ts
4. Add manifest-hash.ts
5. Add manifest-serializer.ts
6. Add SPORE-MANIFEST diagnostics
7. Connect pass 14 to compiler pipeline
8. Write runtime-manifest.json during build
9. Add split manifest output files
10. Add verify support for manifestHash
11. Add deploy target compatibility checks
12. Add explain support for routes/functions/effects/boundaries
13. Add tests for deterministic serialisation
14. Add tests for missing capability references
15. Add tests for target mismatch diagnostics
16. Add fixture manifests under test/fixtures/manifests
```

---

## Recommended File Layout

```text
packages-galerina/galerina-core-compiler/src/manifests/
  runtime-manifest.ts
  route-manifest.ts
  function-manifest.ts
  effect-manifest.ts
  boundary-manifest.ts
  permission-manifest.ts
  manifest-builder.ts
  manifest-validator.ts
  manifest-serializer.ts
  manifest-hash.ts
  manifest-diagnostics.ts
```

---

## Testing Notes

```ts
describe("buildManifest", () => {
  it("includes transitive effects for each function", () => {
    const manifest = buildManifest(fixtureInput)

    expect(
      manifest.functions.find(fn => fn.name === "createUser")?.transitiveEffects
    ).toContain("database.write")
  })

  it("fails when a capability reference is missing", () => {
    const manifest = buildManifest(inputWithMissingCapability)
    const diagnostics = validateManifest(manifest)

    expect(diagnostics.some(d => d.code === "SPORE-MANIFEST-004")).toBe(true)
  })
})
```

---

## Architecture Rule

Manifest generation must never widen authority.

Correct:

```text
source declaration + inferred operation + propagated call graph -> manifest authority
```

Incorrect:

```text
manifest builder guesses permission because runtime might need it
```

If metadata is incomplete, pass 14 must emit diagnostics and fail closed.
