# Build System and CLI

## Definition

The Galerina build system (`galerina build`) and deploy system (`galerina deploy`) are
governed workflows. They do not only produce executables — they produce an
**execution contract** that bridges compile-time proof to runtime authority.

```text
galerina build  = proves the package
galerina deploy = proves the environment accepts the package
```

## Core Principle

```text
Build connects source code to manifests, runtime plans, reports and artefacts.
Deploy connects verified artefacts to a real environment under policy.

The build system is not just compilation.
It is the bridge between compile-time authority and runtime authority.
```

## Command Overview

| Command | Purpose |
| --- | --- |
| `galerina check` | Validate source without producing deployment artefacts |
| `galerina build` | Produce artefacts, manifests and reports |
| `galerina plan` | Preview runtime/deployment actions without changing infrastructure |
| `galerina deploy` | Deploy a verified build to a target environment |
| `galerina verify` | Verify generated artefacts and deployment evidence |
| `galerina explain` | Explain project, build, authority and runtime decisions |

## `galerina build`

### Purpose

Answers: _Can this project be built into a governed runtime package?_

Performs:
```text
lexing and parsing
type checking
effect checking
boundary checking
authority manifest generation
schema generation
route table generation
runtime plan generation
source-map generation
report generation
artefact packaging
```

### Basic Usage

```bash
galerina check                                      # validate only
galerina build                                      # standard build
galerina build --mode debug  --out build/debug      # debug build
galerina build --mode release --out build/release   # production build
```

### Build Modes

| Mode | Meaning |
| --- | --- |
| `debug` | Maximum developer reports, readable artefacts |
| `release` | Optimised artefacts, strict production checks |
| `checked` | Runtime checks enabled; full tracing |
| `compiled` | Relies on generated plans and verified manifests |

```text
Release builds must be stricter than debug builds.
```

## Build Stages

```text
 1. Load project          → project graph, source file list, package graph
 2. Resolve entry         → entry point (boot.spore / main.spore)
 3. Parse source          → AST, tokens, source map base, syntax diagnostics
 4. Check types           → unknown types, generic arity, Option/Result usage,
                            enum exhaustiveness, safe/unsafe state transitions,
                            validated/unvalidated transitions, branded type compatibility
 5. Check effects         → all side effects declared, secure flows declare effects,
                            pure flows have no effects, compute blocks avoid banned ops
 6. Check boundaries      → API/webhook inputs start unsafe unvalidated,
                            validated values come from validators,
                            external values cannot reach trusted code unchecked
 7. Build manifests       → app.type-manifest.json, app.effect-manifest.json,
                            app.authority-manifest.json, app.route-table.json,
                            app.schema-manifest.json, app.source-map.json,
                            app.build-manifest.json
 8. Build runtime plan    → app.runtime-plan.json (route bindings, required effects,
                            authority checks, decoder plans, startup order, fallback rules)
 9. Generate reports      → security, runtime, type, api, authority, deployment,
                            ai-context reports
10. Emit artefacts        → app.bin / app.wasm / app.server.js / app.runtime-package.zip
11. Verify output set     → hashes match, source maps exist, manifest schema valid,
                            runtime plan present, no stale outputs
```

## Build Output Directory

```text
build/galerina/
  app.bin
  app.wasm
  app.runtime-package.zip
  manifests/
    app.build-manifest.json
    app.type-manifest.json
    app.effect-manifest.json
    app.authority-manifest.json
    app.route-table.json
    app.runtime-plan.json
  reports/
    app.security-report.json
    app.runtime-report.json
    app.api-report.json
    app.deployment-report.json
  docs/
    api-guide.md
    type-reference.md
    deployment-guide.md
  maps/
    app.source-map.json
```

## Build Manifest

The build manifest is the root evidence file required by `deploy`:

```json
{
  "kind": "galerina.buildManifest",
  "project": "ShopApp",
  "mode": "release",
  "sourceHash": "sha256:...",
  "typeManifest": "manifests/app.type-manifest.json",
  "authorityManifest": "manifests/app.authority-manifest.json",
  "runtimePlan": "manifests/app.runtime-plan.json",
  "artefacts": [
    {
      "path": "app.wasm",
      "hash": "sha256:...",
      "target": "wasm"
    }
  ]
}
```

## `galerina deploy`

### Purpose

Answers: _Can this verified build be safely deployed to this environment?_

Deploy **consumes** build output. It does not rebuild by default.

```bash
galerina build --mode release
galerina deploy --target production
```

### Deploy Stages

```text
 1. Load build manifest
 2. Verify artefact hashes
 3. Load deployment profile
 4. Check target compatibility
 5. Check authority policy
 6. Check secrets and config
 7. Produce deployment plan
 8. Require approval if configured
 9. Apply deployment
10. Run post-deploy verification
11. Write deployment report
```

### Deployment Profiles

```galerina
deployments {
  staging {
    target       "docker"
    region       "eu-west-2"
    runtime_mode "checked"
    require_approval false
  }

  production {
    target       "kubernetes"
    region       "eu-west-2"
    runtime_mode "compiled"
    require_approval true
  }
}
```

### Dry Run

```bash
galerina deploy --target production --plan
```

Outputs what would be deployed, what authority is needed, what secrets are
required, and what rollback point would be created — without changing anything.

### Deployment Authority

Deploy is an authority-sensitive operation requiring permissions such as:

```text
deploy.write
secrets.read
infra.read
infra.write
runtime.restart
```

If a required permission is denied, the deploy is blocked with an explicit report.

### Secrets Check

Deploy verifies required secrets exist without printing them:

```text
required secrets:
  DATABASE_URL       → exists
  PAYMENT_API_KEY    → exists
  SESSION_SECRET     → exists
```

Deploy must never embed secrets into compiled artefacts unless an explicit policy
permits it.

### Rollback

```bash
galerina deploy --target production --rollback
galerina rollback --target production --to build_2026_05_24_001
```

Rollback requires the same authority checks as a forward deploy.

## Deployment Targets

| Target | Notes |
| --- | --- |
| `local` | Developer machine |
| `docker` | Container image |
| `kubernetes` | Orchestrated cluster |
| `serverless` | Function-as-a-service |
| `edge` | Edge compute (restricted effects) |
| `wasm host` | WASM runtime host |
| `native service` | Native process |

Each target has a compatibility profile. The deploy command blocks builds with
incompatible effect declarations.

Example edge target profile:
```text
Denied effects:
  filesystem.write
  long_running_worker

Allowed effects:
  network.outbound
  cache.read / cache.write
```

## Build Caching

Cache key:
```text
source hash + package lock hash + compiler version + build mode + target + policy hash
```

Cache is invalidated if any of these change. Correctness beats speed — incremental
build outputs must be equivalent to a clean build.

## Good-Taste Build Architecture

Apply the same principle as good Galerina code:

```text
Make the normal path simple. Make edge cases disappear.
```

Avoid separate build paths for API, webhook, queue, CLI. Use one model:

```text
boundary -> type contract -> effect contract -> authority plan -> runtime plan
```

Build phases should be small and produce plain data:

```text
loadProject
parseProject
checkTypes
checkEffects
buildManifests
buildRuntimePlan
emitArtefacts
verifyBuild
```

## `galerina verify`

```bash
galerina verify build/galerina
```

Checks manifest hashes, required reports, schema validity, source-map validity,
artefact status, no stale outputs.

```bash
galerina verify deploy --target production
```

Checks running version matches build manifest, health checks pass, route table
matches deployed runtime.

## `galerina build --for-ai`

```bash
galerina build --for-ai
```

Outputs `app.ai-context.json` and `app.ai-guide.md` from checked source and
manifests. Includes: error type and location, route summary, type summary, effect
summary, authority summary, known risks. Never includes secrets or private keys.

## Build Responsibilities

| Build | Deploy |
| --- | --- |
| Source correctness | Artefact verification |
| Type checking | Environment compatibility |
| Effect checking | Runtime policy checks |
| Schema generation | Secret availability |
| Runtime plan generation | Target deployment |
| Artefact creation | Post-deploy verification |
| Build reports | Rollback evidence |
| Source maps | Deployment reports |

## Minimum v1 Command Set

```bash
galerina check          # validate source
galerina build          # build artefacts
galerina verify         # verify build output
galerina deploy --plan  # dry-run deploy preview
galerina deploy         # deploy to target
galerina explain        # explain build decisions
```

Optional in later releases:
```bash
galerina rollback
galerina plan
galerina clean
galerina cache
galerina doctor
```

## What Not to Build Yet

v1 deploy should not become:
```text
cloud provisioner
Kubernetes operator
Terraform replacement
secret manager
CI/CD platform
container registry
monitoring suite
```

Galerina deploy focuses on verified artefacts, deployment plans, environment
compatibility, authority checks, and post-deploy evidence. It calls existing
infrastructure tools rather than replacing them.
