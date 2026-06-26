> ⚠️ **SUPERSEDED** — This is a v0.2 historical document. Current spec: see See Also links.

# Galerina Core CLI v0.2

## Formal Specification — All 5 Commands

**Status: SUPERSEDED — This is a v0.2 design document. The current canonical specification
is in the corresponding Phase 9-15 implementation docs. See galerina-roadmap.md for
the up-to-date architecture. This file is retained for historical context only.**

This document is the v0.2 canonical specification for the Galerina CLI.

See also: `galerina-core-cli-deploy-explain-plan.md` (prior architecture KB),
`build-system-and-cli.md` (build system context).

---

## Exit Codes (v0.2)

| Code | Meaning               |
| ---- | --------------------- |
| 0    | Success               |
| 1    | General failure       |
| 2    | Invalid arguments     |
| 3    | Build failure         |
| 4    | Verification failure  |
| 5    | Deployment failure    |
| 6    | Explain failure       |
| 7    | Planning failure      |

Note: The prior KB had different semantic assignments. For example:
- Prior code 2: policy denial
- Prior code 3: runtime incompatibility

The v0.2 exit codes above are the formal command-level codes.

---

## Core Types

### BuildArtefact

```ts
interface BuildArtefact {
    id: string;

    hash: string;

    path: string;

    manifest?: RuntimeManifest;

    target: string;
}
```

---

### BuildResult

```ts
interface BuildResult {
    success: boolean;

    artefacts: BuildArtefact[];

    diagnostics: Diagnostic[];

    durationMs: number;
}
```

---

### buildWorkspace()

```ts
function buildWorkspace(
    workspacePath: string
): BuildResult
```

Runs the 14-pass compiler pipeline and returns artefacts with hashes.

---

### VerifiedArtefact

```ts
interface VerifiedArtefact {
    path: string;

    hash: string;

    verified: boolean;

    manifestVersion: string;
}
```

---

### VerificationResult

```ts
interface VerificationResult {
    success: boolean;

    artefact: VerifiedArtefact;

    diagnostics: Diagnostic[];
}
```

---

### verifyHash()

```ts
function verifyHash(
    path: string,
    expectedHash: string
): boolean
```

---

## DeploymentTarget Enum (v0.2)

```ts
enum DeploymentTarget {
    Local,
    Runtime,
    Container,
    Cluster,
    Edge,
    Sandbox,
    Distributed
}
```

Note: The prior KB used string literals: "node", "wasm", "native",
"serverless", "edge", "gpu", "photonic". The v0.2 formal spec uses
the enum above.

---

### DeploymentResult

```ts
interface DeploymentResult {
    success: boolean;

    deploymentId: string;

    target: DeploymentTarget;

    endpoint?: string;
}
```

---

## galerina explain Types

### ExplainTrace

```ts
interface ExplainTrace {
    id: string;

    type: string;

    message: string;

    children: ExplainTrace[];
}
```

---

### ExplainResult

```ts
interface ExplainResult {
    success: boolean;

    traces: ExplainTrace[];
}
```

---

### buildTrace()

```ts
function buildTrace(
    node: CheckedNode
): ExplainTrace
```

---

## galerina plan Types

### ComputePlan

```ts
interface ComputePlan {
    targets: DeploymentTarget[];

    estimatedCost: number;

    warnings: string[];
}
```

---

### estimateTarget()

```ts
function estimateTarget(
    manifest: RuntimeManifest
): DeploymentTarget
```

---

## galerina deploy — Effect Validation

### ValidateEffectsInput

```ts
interface ValidateEffectsInput {
    functions: FunctionManifest[];

    boundaries: BoundaryManifest[];

    target: DeploymentTarget;
}
```

---

### validateEffects()

```ts
function validateEffects(
    input: ValidateEffectsInput
): Diagnostic[]
```

Returns empty array if all effects are valid for the target.

---

## CLI Report Files

| Command         | Output File                   |
| --------------- | ----------------------------- |
| galerina build    | build-report.json             |
| galerina verify   | verification-report.json      |
| galerina deploy   | deployment-report.json        |
| galerina explain  | explain-report.json           |
| galerina plan     | compute-plan.json             |

---

## CI/CD Integration Example

```yaml
# GitHub Actions
- name: Build
  run: galerina build ./workspace

- name: Verify
  run: galerina verify ./build/artefacts/app.lna

- name: Deploy
  run: galerina deploy --target Runtime --manifest ./build/runtime-manifest.json
  env:
    GALERINA_DEPLOY_TOKEN: ${{ secrets.DEPLOY_TOKEN }}
```

Exit code 0 = pipeline success; non-zero = pipeline failure.

---

## File Layout

```text
galerina-core-cli/src/

  commands/
    build.ts         (buildWorkspace, BuildResult, BuildArtefact)
    verify.ts        (verifyHash, VerificationResult, VerifiedArtefact)
    deploy.ts        (DeploymentTarget enum, DeploymentResult, validateEffects)
    explain.ts       (buildTrace, ExplainResult, ExplainTrace)
    plan.ts          (estimateTarget, ComputePlan)

  types/
    artefacts.ts
    results.ts
    targets.ts

  diagnostics/
    exit-codes.ts    (codes 0–7)
    formatDiagnostic.ts
```

---

## Planned v0.3 Features

| Feature                       | Purpose                         |
| ----------------------------- | ------------------------------- |
| galerina watch                  | Live rebuild on change          |
| galerina audit                  | Runtime audit stream inspection |
| galerina diff                   | Manifest delta between builds   |
| galerina sign                   | Cryptographic build signing     |
| Distributed deployment target | Multi-node cluster deploy       |
| Build caching                 | Incremental compilation         |
