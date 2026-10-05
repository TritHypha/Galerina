# Galerina CLI

`galerina-core-cli` is the command-line interface for Galerina developers.

It belongs in:

```text
/packages-ts/galerina-core-cli
```

It coordinates other Galerina packages instead of owning language, runtime, server or
application behaviour.

## Responsibilities

```text
read project configuration
load environment mode
call the compiler
call the runtime
start server tools
run task tools
print safe output
generate reports
show diagnostics
generate project graphs
```

## Command Status

### Implemented (Prototype)

```text
galerina check             â€” validate source without producing artefacts
galerina build             â€” compile and produce artefacts (partial)
galerina run               â€” run compiled output
galerina serve             â€” start server
galerina reports           â€” generate reports
galerina security:check    â€” run security scan
galerina routes            â€” list route table
galerina benchmark         â€” placeholder command
galerina task              â€” run project automation tasks
galerina graph             â€” generate project dependency graph
galerina graph query       â€” query generated graph
galerina graph explain     â€” explain graph node
galerina graph path        â€” show path between nodes
galerina fmt               â€” format source files
```

### Planned / Not Yet Implemented

```text
galerina deploy            â€” deploy verified build to target environment
galerina explain           â€” explain build decisions, authority model, effects
galerina plan              â€” preview deployment actions without applying changes
galerina verify deploy     â€” verify running version against build manifest
galerina promote           â€” promote artifact from one environment to another
galerina rollback          â€” rollback to previous deployment
```

`galerina build` compiles source into governed runtime artefacts through a
14-pass pipeline. Flags: `--target`, `--json`, `--report`, `--strict`,
`--profile`, `--out`, `--audit`. Produces `runtime-manifest.json`,
`compiler-report.json`, `effect-report.json`, `capability-report.json`,
`audit-report.json`, `build-hash.txt`. Diagnostic codes: `FUNGI-BUILD-001`
through `FUNGI-BUILD-005`. Status: partial implementation.

`galerina verify` validates compiler and runtime artefact integrity.
Flags: `--json`, `--strict`, `--manifest`, `--hash`, `--policy`, `--audit`.
Produces verification status with `manifestHash` and `graphHash`.
Diagnostic codes: `FUNGI-VERIFY-001` through `FUNGI-VERIFY-016`.
Status: partial. Hash checks, closed-shape artefact integrity (below), plus runtime manifest record checks (below), plus `galerina verify` command wiring (below). Runtime compatibility / capability / audit-report validation and verify-runtime.ts / verify deploy still open.

Artefact integrity (`src/verify/verify-integrity.ts`, zero-trust defaults, owner may
revisit): `readBuildArtefact`, `verifyArtefactIntegrity` and `verifyArtefactIntegritySet`
read BuildArtefact metadata through property descriptors (no getters run), require the
exact closed key list and kind vocabulary, refuse malformed sha256: digests before any
filesystem open, and require dense artefact sets. Codes stay FUNGI-VERIFY-001..005.

Runtime manifest checks (`src/verify/verify-manifest.ts`, zero-trust defaults, owner may
revisit): `verifyRuntimeManifest(record)` and `verifyRuntimeManifestSet(records)` validate the
per-flow `fungi.runtime.manifest.v1` record that the compiler ships today (`RuntimeManifest` in
`galerina-core-compiler/src/type-registry.ts`). A record must be a plain data object with exactly
the v1 keys; values are read once through property descriptors, so getters never run. The
schemaVersion must match exactly, every field has a closed domain, and the fields must agree with
the governance flag mask the way the compiler derives them. `verified: false` never verifies, and
a set must not list a flow twice. Codes: `FUNGI-VERIFY-006` shape, `007` schemaVersion, `008`
domain, `009` consistency, `010` not verified, `011` set. Diagnostics name a field but never
echo a value or an unknown key. `createVerificationReport(result, { manifests })` adds a
`manifests` section and recomputes its success. Not covered: the `runtime-manifest.json` file
container (the v0.2 manifest from compiler pass 14 is not built) and signature checks
(GovernanceSignature, Phase 39).


Verify command (`src/verify/verify-command.ts`, zero-trust defaults, owner may revisit):
`parseVerifyArgs` + `runVerifyCommand` wire `galerina verify`. Admitted flags:
`--artefacts` (required), `--root`, `--manifest`, `--report`, `--json`, `--strict`,
`--hash`, `--policy <capability-report.json>`, `--audit <audit-report.json>`. Unknown flags,
duplicates, `--flag=value`, and positionals refuse (`FUNGI-CLI-VERIFY-001`/`002`).
Input files must be dense JSON arrays (`003`). The command composes
`verifyArtefactIntegritySet` and optional `verifyRuntimeManifestSet`, can write
`verification-report.json` exclusively (`005`), and never echoes paths or values.
Exit codes: `0` success, `2` usage, `3` audit report failure, `4` runtime-compatibility failure, `5` capability/policy report failure, `6` artefact verify failure, `7` manifest integrity failure. Runtime report validation (`src/verify/verify-runtime.ts`, zero-trust defaults, owner may revisit): closed-shape `galerina.report.audit.v1` / `galerina.report.capability.v1` via descriptors; FUNGI-VERIFY-012..016; complete:false never verifies. Deploy still open.
The current hash helper reads from one opened file handle in fixed 64 KiB chunks,
avoiding whole-file allocations, and checks root resolution plus opened-file
identity. `O_NOFOLLOW` is used where Node supports it. This is not a portable
filesystem sandbox: standard Node does not prevent every concurrent ancestor
directory/reparse-point swap on Windows and Linux. A successful result means the
bytes read from the checked handle matched the supplied digest; it does not prove
trusted provenance, prevent concurrent modification, or resist a compromised OS.

`galerina deploy` (dry-run) validates effects, target compatibility, and the
verified gate against a closed EffectsPolicy + DeployManifestSlice. Live deploy
is not admitted (`--dry-run` required). Exit codes: `0` success, `2` usage or
policy denial, `3` target incompatibility, `4` validation failure, `6` verified-gate
failure. Flags: `--manifest`, `--policy`, `--target`, `--hash`, `--report`,
`--json`, `--dry-run`, `--strict`. Produces optional `deployment-report.json`.
Diagnostic codes: `FUNGI-DEPLOY-001` through `FUNGI-DEPLOY-005`.

`galerina explain` explains compiler decisions, runtime authority, effect
declarations, boundary violations, and why deployment was denied.
Explain CLI wired (`galerina explain`): closed-shape manifest facets,
`deployment-denial.json` reasoning, declared dependency-tree (`--tree`), and
declared runtime profile (`--runtime`); emits `explain-report.json`. Admitted
flags: `--manifest`, `--denial`, `--tree`, `--runtime`, `--report`, `--json`,
`--trace`, `--effects`, `--capabilities`. Still refuse: `--policy`, `--audit`
(`FUNGI-CLI-EXPLAIN-004`). Does not walk a live package graph or probe a live
runtime. Diagnostic codes: `FUNGI-EXPLAIN-001` through `FUNGI-EXPLAIN-010`.

`galerina plan` estimates how execution will be coordinated â€” CPU/GPU suitability,
memory pressure, parallelism, and fallback options. The planner recommends;
the runtime decides final execution.
Flags: `--json`, `--runtime`, `--memory`, `--parallelism`, `--energy`,
`--target`, `--graph`, `--compatibility`. Produces `compute-plan.json`.
Diagnostic codes: `FUNGI-PLAN-001` through `FUNGI-PLAN-004`.

Implementation order: Phase 1 build â†’ Phase 2 verify â†’ Phase 3 explain â†’
Phase 4 deploy â†’ Phase 5 plan.

See `../../../ZTF-Knowledge-Bases/reference/galerina/galerina-core-cli-deploy-explain-plan.md` for the
full specification including all examples, exit codes, output modes, and
report file definitions.

`Galerina benchmark` is currently a placeholder command. The benchmark contracts,
recommended modes and report shape live in `packages-ts/galerina-tools-benchmark/README.md`.

## Graph Command

`Galerina graph` reads `galerina.workspace.json` and writes a local project graph summary.
The query commands read generated graph JSON.

From the repository root, run the current local CLI build with:

```text
node packages-ts\galerina-core-cli\dist\index.js graph --out build\graph
```

The shorter `Galerina graph --out build\graph` form is the intended command once the
CLI is installed or linked.

Default outputs:

```text
build/graph/galerina-devtools-project-graph.json
build/graph/Galerina_GRAPH_REPORT.md
build/graph/galerina-ai-map.md
build/graph/galerina-devtools-project-graph.html
```

Use `--out <dir>` to choose a different output directory.

Examples:

```text
node packages-ts\galerina-core-cli\dist\index.js graph query galerina-core-security --out build\graph
node packages-ts\galerina-core-cli\dist\index.js graph explain package:galerina-core-security --out build\graph
node packages-ts\galerina-core-cli\dist\index.js graph path package:galerina-devtools-project-graph report:project-graph --out build\graph

Galerina graph query galerina-core-security
Galerina graph explain package:galerina-core-security
Galerina graph path package:galerina-devtools-project-graph report:project-graph
```

## Task Command

`Galerina task` loads safe project automation from `tasks.fungi` in the repository root,
or from a file passed with `--file`.

Examples:

```text
Galerina task
Galerina task buildApi --dry-run
Galerina task generateReports --file packages-ts/galerina-core-tasks/examples/tasks.fungi --dry-run
Galerina task buildApi --report-out build/reports/task-report.json
```

Current task execution supports loading task definitions, listing tasks,
resolving dependency order, rejecting missing or circular dependencies and
running dry-run plans. Task runs write a structured report to
`build/reports/task-report.json` by default. Use `--report-out <path>` to choose
a different path, or `--no-report` to skip writing the report. Built-in
operation execution remains in `galerina-core-tasks`.

## Architecture Depth: TypeScript Contracts (v0.2 Specification)

### Core Result Types

```ts
export interface CliCommandResult {
    success: boolean
    diagnostics: CompilerDiagnostic[]
    reportPath?: string
    exitCode: number
}

export interface CompilerDiagnostic {
    code: string
    message: string
    severity: "error" | "warning" | "info"
    file?: string
    line?: number
}

export interface Workspace {
    root: string
    packages: string[]
    entryPoints: string[]
    config: WorkspaceConfig
}
```

### Build Contracts

```ts
export interface BuildArtefact {
    path: string
    kind: "manifest" | "bundle" | "report" | "hash" | "map"
    hash: string
    target: RuntimeTarget
}

export interface BuildResult {
    success: boolean
    artefacts: BuildArtefact[]
    diagnostics: CompilerDiagnostic[]
    manifestPath: string
    duration: number
}

export interface BuildWorkspaceInput {
    workspace: Workspace
    target: RuntimeTarget
    strict: boolean
    profile?: string
    outDir: string
}

export async function buildWorkspace(
    input: BuildWorkspaceInput
): Promise<BuildResult>
// Pass 1:  Lexer
// Pass 2:  Parser
// Pass 3:  AST builder
// Pass 4:  Type checker
// Pass 5:  Visibility checker
// Pass 6:  Effect checker
// Pass 7:  Boundary checker
// Pass 8:  Capability resolver
// Pass 9:  Package graph validator
// Pass 10: Runtime graph generator
// Pass 11: Optimisation planner
// Pass 12: Backend emitter
// Pass 13: Audit metadata emitter
// Pass 14: Runtime manifest generator
```

### Verify Contracts

```ts
export interface VerifiedArtefact {
    path: string
    hash: string
    verified: boolean
    diagnostics: CompilerDiagnostic[]
}

export interface VerificationResult {
    success: boolean
    artefacts: VerifiedArtefact[]
    diagnostics: CompilerDiagnostic[]
}

export async function verifyHash(
    artefact: BuildArtefact,
    expected: string
): Promise<VerifiedArtefact>
```

### Deploy Contracts

Deploy contracts (`src/deploy.ts` / `src/deploy/deploy-validator.ts`, zero-trust defaults, owner may
revisit): closed `DeploymentTarget` vocabulary (`node|wasm|native|serverless|edge|gpu|photonic`),
`DeploymentResult` (`createDeploymentResult` / `readDeploymentResult`), `EffectsPolicy`,
`DeployManifestSlice` (`allowedEffects` + `verified`), and `validateEffects`. Shapes are read through
property descriptors (no getters). Diagnostics never echo effect names, targets, hashes or unknown
keys. Codes: `FUNGI-DEPLOY-001` shape, `002` domain, `003` policy effect denial, `004` target
incompatibility, `005` verified gate. Command wiring (`src/deploy/deploy-command.ts`, zero-trust defaults, owner may revisit):
`parseDeployArgs` + `runDeployCommand` wire `galerina deploy` as **dry-run only**.
Admitted flags: `--manifest`, `--policy`, `--target`, `--hash`, `--report`,
`--json`, `--dry-run` (required), `--strict`. `--audit` refuses `FUNGI-CLI-DEPLOY-004`.
Exit codes: `0` success, `2` usage or policy denial, `3` target incompatibility,
`4` validation failure, `6` verified-gate failure (`5`/`7` reserved). Report writer
(`src/deploy/deploy-report.ts`): exclusive-create `deployment-report.json` with
messages withheld and `dryRun:true`. Not covered: live deploy, module hashes on disk,
capability/audit validation, deploy-policy.ts / deploy-runtime.ts.


```ts
export type DeploymentTarget =
    | "node"
    | "wasm"
    | "native"
    | "serverless"
    | "edge"
    | "gpu"
    | "photonic"

export interface DeploymentResult {
    success: boolean
    target: DeploymentTarget
    manifestHash: string
    diagnostics: CompilerDiagnostic[]
    reportPath?: string
}
```

### Effect Validation

```ts
export interface ValidateEffectsInput {
    manifest: RuntimeManifest
    policy: EffectsPolicy
    target: DeploymentTarget
}

export function validateEffects(
    input: ValidateEffectsInput
): CompilerDiagnostic[]
// For each function in manifest.functions:
//   effectiveEffects = declaredEffects âˆª inferredEffects
//   check each effect against policy.allowedEffects
//   check capabilities present for each effect
//   emit FUNGI-EFFECT-001 through FUNGI-EFFECT-004 as needed
```

### Explain Contracts

Explain contracts (`src/explain.ts` / `src/explain/explain-trace.ts`, zero-trust defaults, owner may
revisit): closed `ExplainTrace` (`step`, `label`, `input`, `output`, `diagnostics[]`) with label
vocabulary `import|effect|capability|boundary|dependency|denial`; closed `ExplainResult`
(`traces`, `effects`, `capabilities`, `boundaries`, `diagnostics`); `ExplainManifestSlice` +
`ExplainOptions`; `buildTrace` / `explainManifest` / `createExplainResult` / `readExplainResult`.
Shapes via property descriptors (no getters). Unknown keys refuse without echo. Diagnostic messages
never echo tokens/keys. Codes: `FUNGI-EXPLAIN-001` shape, `002` domain, `003` options facet refuse,
`004` result consistency (contiguous steps). Does not wire `galerina explain`, write
walk a live dependency tree, or probe runtime/policy/audit (`--tree`/`--runtime`/`--policy`/`--audit` refuse). Denial reader + report writer landed.


### Compute Plan Contracts

```ts
export interface ComputePlan {
    target: RuntimeTarget
    gpu: GpuPlan
    optical: OpticalPlan
    wasm: WasmTarget | null
    compatibility: CompatibilityReport
    estimatedMemoryMb: number
    parallelism: number
    diagnostics: CompilerDiagnostic[]
}

export function estimateTarget(
    workspace: Workspace,
    options: PlanOptions
): ComputePlan
```

### Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | success |
| `1` | general error |
| `2` | policy denial |
| `3` | runtime incompatibility |
| `4` | deployment validation failure |
| `5` | capability resolution failure |
| `6` | verification failure |
| `7` | manifest integrity failure |

### CLI Report Files

| File | Command | Description |
| --- | --- | --- |
| `runtime-manifest.json` | build | Full v0.2 runtime manifest |
| `compiler-report.json` | build | All compiler diagnostics |
| `effect-report.json` | build | Effect graph and decisions |
| `capability-report.json` | build | Capability resolution log |
| `audit-report.json` | build | Audit metadata |
| `build-hash.txt` | build | Artefact hashes |
| `verification-report.json` | verify | Hash verification results |
| `deployment-report.json` | deploy | Deploy decisions and policy log |
| `explain-report.json` | explain | Execution reasoning traces |
| `compute-plan.json` | plan | GPU/WASM/optical suitability |

### CLI Directory Layout

```text
packages-ts/galerina-core-cli/src/
  commands/
    build.ts
    verify.ts
    deploy.ts
    explain.ts
    plan.ts
    check.ts
    serve.ts
    routes.ts
    graph.ts
    task.ts
    fmt.ts
    security-check.ts
    reports.ts
  contracts/
    build-contracts.ts
    verify-contracts.ts
    deploy-contracts.ts
    explain-contracts.ts
    plan-contracts.ts
  output/
    safe-output.ts       â† redact SecureString, tokens
    json-output.ts
  index.ts
```

## Security Rules

CLI output is safe by default. It must redact `SecureString` values, bearer
tokens, API keys, cookies, database passwords and private key material.

Production mode is strict and should fail when critical unsafe features are
enabled without explicit reason.

## Non-Goals

`galerina-core-cli` must not contain business logic, routing logic, authentication logic,
ORM logic, template rendering, CMS features, admin UI or frontend framework
behaviour.
