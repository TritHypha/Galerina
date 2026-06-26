# galerina-core-cli: build, verify, deploy, explain, and plan

## Status

```text
Package: galerina-core-cli
Version target: v0.2
Primary commands:
  - galerina build
  - galerina verify
  - galerina deploy
  - galerina explain
  - galerina plan
Canonical exit codes: 0 through 7
Primary outputs:
  - runtime-manifest.json
  - compiler reports
  - verification reports
  - deployment reports
  - compute plans
```

The CLI is the operational governance surface for Galerina.

It connects:

```text
compiler -> manifests -> verification -> deployment -> explainability -> compute planning
```

The CLI must remain deterministic, scriptable, machine-readable, and fail-closed.

---

# Design Goals

```text
reproducible builds
manifest-first verification
policy-aware deployment
explainable authority traces
hardware-neutral compute planning
machine-readable reports
safe CI/CD integration
stable exit codes
```

---

# CLI Command Overview

| Command | Purpose |
| --- | --- |
| `galerina build` | Compile workspace and emit manifests/reports |
| `galerina verify` | Validate artefact integrity, manifests, and policies |
| `galerina deploy` | Validate and deploy a verified artefact |
| `galerina explain` | Explain effects, boundaries, capabilities, and plans |
| `galerina plan` | Produce compute/runtime execution plans |

---

# Canonical Exit Codes

| Exit Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Compiler failure |
| `2` | Verification failure |
| `3` | Manifest failure |
| `4` | Deployment policy denial |
| `5` | Target incompatibility |
| `6` | Runtime capability failure |
| `7` | Internal CLI/runtime error |

All commands must use these exit codes consistently.

---

# BuildArtefact

```ts
export interface BuildArtefact {
  id: string

  /** Build target selected during compilation. */
  target: DeploymentTarget

  /** Output directory for generated files. */
  outputDirectory: string

  /** Primary runtime manifest path. */
  runtimeManifestPath: string

  /** Generated report files. */
  reportFiles: string[]

  /** Build hashes used for verification and deployment. */
  hashes: ArtefactHashes

  /** Compiler diagnostics emitted during build. */
  diagnostics: CompilerDiagnostic[]
}
```

---

# BuildResult

```ts
export interface BuildResult {
  success: boolean

  artefact?: BuildArtefact

  diagnostics: CompilerDiagnostic[]

  warnings: CompilerDiagnostic[]

  durationMs: number
}
```

---

# buildWorkspace()

```ts
export async function buildWorkspace(
  input: BuildWorkspaceInput
): Promise<BuildResult> {
  const compilerResult = await compileWorkspace(input)

  if (!compilerResult.success) {
    return {
      success: false,
      diagnostics: compilerResult.diagnostics,
      warnings: [],
      durationMs: compilerResult.durationMs
    }
  }

  const runtimeManifest = buildManifest({
    checkedProgram: compilerResult.checkedProgram,
    effectGraph: compilerResult.effectGraph,
    boundaryGraph: compilerResult.boundaryGraph,
    compilerOptions: input.compilerOptions,
    reports: compilerResult.reports
  })

  const outputDirectory = createBuildDirectory(input)

  writeRuntimeManifest(outputDirectory, runtimeManifest)
  writeCompilerReports(outputDirectory, compilerResult.reports)

  return {
    success: true,
    artefact: {
      id: createBuildId(runtimeManifest),
      target: input.compilerOptions.target,
      outputDirectory,
      runtimeManifestPath: `${outputDirectory}/manifests/runtime-manifest.json`,
      reportFiles: collectReportFiles(outputDirectory),
      hashes: buildArtefactHashes(outputDirectory),
      diagnostics: compilerResult.diagnostics
    },
    diagnostics: compilerResult.diagnostics,
    warnings: compilerResult.warnings,
    durationMs: compilerResult.durationMs
  }
}
```

---

# galerina build

## Purpose

`galerina build` compiles the workspace, generates manifests, and emits all reports required for verification and deployment.

---

## CLI Syntax

```bash
galerina build [flags]
```

---

## Supported Flags

| Flag | Meaning |
| --- | --- |
| `--target <target>` | Deployment target |
| `--out <dir>` | Output directory |
| `--strict` | Enable strict compiler policy mode |
| `--verify` | Automatically run verification after build |
| `--reports` | Emit extended reports |
| `--profile <profile>` | Build profile |
| `--watch` | Watch mode |
| `--json` | Machine-readable JSON output |
| `--verbose` | Extended diagnostics |

---

## Example

```bash
galerina build \
  --target server \
  --out build \
  --strict \
  --reports
```

---

## Generated Files

```text
build/
  manifests/
    runtime-manifest.json
    route-manifest.json
    function-manifest.json
    boundary-manifest.json
    effects-manifest.json

  reports/
    compiler-report.json
    effect-report.json
    boundary-report.json
    deployment-report.json
    audit-report.json
```

---

# VerifiedArtefact

```ts
export interface VerifiedArtefact {
  artefactId: string

  runtimeManifest: RuntimeManifest

  verifiedHashes: ArtefactHashes

  verificationReports: VerificationReport[]

  verifiedAt: string
}
```

---

# VerificationResult

```ts
export interface VerificationResult {
  success: boolean

  verifiedArtefact?: VerifiedArtefact

  diagnostics: CompilerDiagnostic[]

  warnings: CompilerDiagnostic[]
}
```

---

# verifyHash()

```ts
export function verifyHash(
  actualHash: string,
  expectedHash: string
): boolean {
  return actualHash === expectedHash
}
```

---

# galerina verify

## Purpose

`galerina verify` validates:

```text
manifest integrity
report integrity
effect graph hashes
boundary graph hashes
runtime target compatibility
capability references
```

---

## CLI Syntax

```bash
galerina verify [flags]
```

---

## Supported Flags

| Flag | Meaning |
| --- | --- |
| `--manifest <file>` | Runtime manifest path |
| `--artefact <dir>` | Build artefact directory |
| `--strict` | Fail on warnings |
| `--json` | Machine-readable output |
| `--verbose` | Extended diagnostics |

---

## Example

```bash
galerina verify \
  --manifest build/manifests/runtime-manifest.json
```

---

## Verification Rules

```text
all hashes must match
all required manifests must exist
all capabilities must resolve
all targets must be supported
all diagnostics must be below denial threshold
```

Verification must fail closed.

---

# DeploymentTarget

```ts
export type DeploymentTarget =
  | "server"
  | "edge"
  | "browser"
  | "worker"
  | "wasm"
  | "gpu"
  | "photonic"
```

Targets are intentionally hardware-neutral.

Correct:

```text
gpu
photonic
```

Incorrect:

```text
cuda
nvidia
gaudi
```

---

# DeploymentResult

```ts
export interface DeploymentResult {
  success: boolean

  deploymentId?: string

  target: DeploymentTarget

  diagnostics: CompilerDiagnostic[]

  deploymentReports: string[]

  deployedAt?: string
}
```

---

# ValidateEffectsInput

```ts
export interface ValidateEffectsInput {
  target: DeploymentTarget

  effects: EffectManifest[]

  boundaries: BoundaryManifest[]

  permissions: PermissionManifest[]
}
```

---

# validateEffects()

```ts
export function validateEffects(
  input: ValidateEffectsInput
): CompilerDiagnostic[] {
  const diagnostics: CompilerDiagnostic[] = []

  for (const effect of input.effects) {
    if (!isEffectAllowedForTarget(effect.name, input.target)) {
      diagnostics.push({
        code: "SPORE-EFFECT-002",
        severity: "error",
        message: `Effect ${effect.name} is forbidden for target ${input.target}.`
      })
    }
  }

  return diagnostics
}
```

---

# galerina deploy

## Purpose

`galerina deploy` validates a verified artefact against deployment policy and deploys it to the selected target.

Deployment must fail closed.

---

## CLI Syntax

```bash
galerina deploy [flags]
```

---

## Supported Flags

| Flag | Meaning |
| --- | --- |
| `--target <target>` | Deployment target |
| `--manifest <file>` | Runtime manifest |
| `--policy <file>` | Deployment policy |
| `--verify` | Run verification before deployment |
| `--dry-run` | Simulate deployment |
| `--json` | Machine-readable output |
| `--verbose` | Extended diagnostics |

---

## Example

```bash
galerina deploy \
  --target edge \
  --manifest build/manifests/runtime-manifest.json \
  --verify
```

---

## Deployment Validation

The deploy command validates:

```text
effect compatibility
boundary policy
runtime capabilities
secret handling policy
network policy
filesystem policy
AI governance policy
```

---

# ExplainTrace

```ts
export interface ExplainTrace {
  kind:
    | "effect"
    | "boundary"
    | "capability"
    | "route"
    | "deployment"
    | "compute"

  source: string

  target: string

  message: string
}
```

---

# ExplainResult

```ts
export interface ExplainResult {
  success: boolean

  traces: ExplainTrace[]

  diagnostics: CompilerDiagnostic[]
}
```

---

# buildTrace()

```ts
export function buildTrace(
  input: TraceInput
): ExplainTrace[] {
  return input.graphEdges.map(edge => ({
    kind: input.kind,
    source: edge.from,
    target: edge.to,
    message: edge.reason
  }))
}
```

---

# galerina explain

## Purpose

`galerina explain` exposes compiler and deployment reasoning.

It explains:

```text
why an effect exists
where authority came from
which boundary denied deployment
which capability is missing
which route introduced a network effect
why a compute target was selected
```

---

## CLI Syntax

```bash
galerina explain [flags]
```

---

## Supported Flags

| Flag | Meaning |
| --- | --- |
| `--effects` | Explain effect graph |
| `--boundaries` | Explain boundary graph |
| `--capabilities` | Explain runtime capabilities |
| `--deployment` | Explain deployment decisions |
| `--compute` | Explain compute planning |
| `--json` | Machine-readable output |
| `--verbose` | Extended trace output |

---

## Example

```bash
galerina explain --effects
```

Expected output:

```text
Function: render_profile_page

Declared effects:
- network

Inherited effects:
- network.http.request

Inherited from:
- load_profile
```

---

# ComputePlan

```ts
export interface ComputePlan {
  target: DeploymentTarget

  estimatedMemoryMb: number

  estimatedCpuCost: number

  estimatedAcceleratorCost?: number

  requiresNetwork: boolean

  requiresFilesystem: boolean

  requiresSecrets: boolean

  routes: PlannedRoute[]

  jobs: PlannedJob[]

  workers: PlannedWorker[]
}
```

---

# estimateTarget()

```ts
export function estimateTarget(
  plan: ComputePlan
): DeploymentTarget {
  if (plan.estimatedAcceleratorCost && plan.estimatedAcceleratorCost > 1000) {
    return "gpu"
  }

  if (plan.requiresFilesystem) {
    return "server"
  }

  return "edge"
}
```

---

# galerina plan

## Purpose

`galerina plan` produces execution and compute planning metadata.

The planner is governance-aware.

It considers:

```text
effects
boundaries
runtime capabilities
memory pressure
accelerator usage
network requirements
filesystem requirements
AI workloads
```

---

## CLI Syntax

```bash
galerina plan [flags]
```

---

## Supported Flags

| Flag | Meaning |
| --- | --- |
| `--target <target>` | Preferred target |
| `--estimate-target` | Auto-estimate best target |
| `--json` | Machine-readable output |
| `--verbose` | Extended planning diagnostics |
| `--profile <profile>` | Runtime profile |

---

## Example

```bash
galerina plan --estimate-target
```

Expected output:

```text
Estimated target: edge
Reason:
- low memory pressure
- no filesystem effects
- low accelerator usage
```

---

# Report Files

## Build Reports

```text
compiler-report.json
effect-report.json
boundary-report.json
runtime-report.json
audit-report.json
```

## Verification Reports

```text
verification-report.json
integrity-report.json
manifest-report.json
```

## Deployment Reports

```text
deployment-report.json
policy-report.json
runtime-capability-report.json
```

## Planning Reports

```text
compute-plan.json
resource-estimate.json
target-estimate.json
```

---

# Recommended CLI File Layout

```text
packages-galerina/galerina-core-cli/src/

  commands/
    build-command.ts
    verify-command.ts
    deploy-command.ts
    explain-command.ts
    plan-command.ts

  build/
    build-workspace.ts
    build-result.ts

  verify/
    verify-artefact.ts
    verify-hash.ts

  deploy/
    deploy-runtime.ts
    validate-effects.ts

  explain/
    explain-trace.ts
    build-trace.ts

  planning/
    compute-plan.ts
    estimate-target.ts
```

---

# Testing Strategy

```ts
describe("galerina verify", () => {
  it("fails when manifest hash does not match", async () => {
    const result = await verifyArtefact(invalidArtefact)

    expect(result.success).toBe(false)
    expect(result.diagnostics.some(d => d.code === "SPORE-MANIFEST-002")).toBe(true)
  })
})
```

```ts
describe("galerina explain", () => {
  it("shows inherited effects", async () => {
    const result = await explainEffects(fixtureManifest)

    expect(result.traces.some(trace =>
      trace.message.includes("Inherited")
    )).toBe(true)
  })
})
```

---

# Fail-Closed Rules

The CLI must never:

```text
silently ignore manifest failures
silently ignore boundary denials
silently downgrade target restrictions
silently bypass verification
silently widen authority
silently deploy unverifiable artefacts
```

If verification or deployment policy is incomplete, deployment must stop.

---

# Summary

The Galerina CLI is not only a developer tool.

It is the governance execution surface for:

```text
build
verify
deploy
explain
plan
```

The canonical v0.2 contracts are:

```text
BuildArtefact
BuildResult
VerifiedArtefact
VerificationResult
DeploymentResult
ExplainTrace
ExplainResult
ComputePlan
```

The canonical deployment targets are:

```text
server
edge
browser
worker
wasm
gpu
photonic
```

The canonical CLI exit codes are:

```text
0 through 7
```

These contracts define the operational interface between the Galerina compiler, runtime, deployment system, governance layer, and future heterogeneous compute planning systems.
