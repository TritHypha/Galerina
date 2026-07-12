# Deployment Auto-Configuration

## Purpose

Galerina should treat deployment as a first-class build target, not as an
afterthought handled only by Dockerfiles, YAML files and manual DevOps notes.

The goal is faster and safer deployment through:

```text
typed deployment config
preflight checks
generated deployment artefacts
safe secret handling
incremental builds
smaller outputs
health and readiness checks
rollback metadata
target-specific adapters
runtime capability profiles
AI-readable deployment reports
security gates
```

The largest early win is human speed: fewer missing environment variables,
unsafe configs, mismatched ports, missing health checks and failed deploys.

## Core Rule

Galerina deployment should follow this rule:

```text
Build from source.
Detect the target machine.
Configure safely for that target.
Never copy developer-machine assumptions.
Never expose secrets.
Verify before traffic.
Monitor after traffic.
Rollback if unstable.
Report everything.
```

## Deployment Is Declared, Not Scattered

Deployment intent should live in Galerina-owned declarations such as:

```text
boot.fungi
galerina.deploy.fungi
galerina.security-policy.fungi
galerina.memory-policy.fungi
galerina.compute-policy.fungi
```

It should not be scattered only across:

```text
Dockerfile
docker-compose.yml
cloudbuild.yml
.env
README
GitHub Actions
manual notes
```

Generated files may still be emitted for inspection and platform integration.
Galerina should not hide deployment decisions.

Example deployment intent:

```galerina
deploy_profile production {
  source git
  target auto

  build {
    mode release
    optimise safe
    detect_architecture on_target
    output signed_artifact
    exclude [".env", ".galerina/cache", "tests"]
  }

  security {
    deny_hardcoded_secrets true
    require_dependency_lock true
    require_package_permission_check true
    require_signed_artifact true
    runtime_readonly true
  }

  runtime {
    port env "PORT"
    health "/health"
    readiness "/ready"
    crash_policy ProductionCrashPolicy
  }

  auto_config {
    detect_cpu true
    detect_memory_limit true
    detect_container true
    tune_workers true
    tune_database_pool true
    store_runtime_profile true
    never_commit_runtime_profile true
  }

  verify {
    run_smoke_tests true
    watch_after_deploy 10 minutes
    rollback_on_failure true
  }
}
```

## Do Not Deploy The Developer Machine Profile

The developer machine is not production truth.

A developer laptop may have:

```text
Windows
Intel x64
local paths
local .env
local GPU/cache
```

Production may have:

```text
Linux
ARM64
container memory limits
different ports
different secrets
different network policy
```

Galerina must not commit machine-specific runtime facts to Git.

Git-tracked intent:

```text
boot.fungi
main.fungi
galerina.deploy.fungi
galerina.lock.json
galerina.security-policy.fungi
galerina.memory-policy.fungi
galerina.compute-policy.fungi
```

Not Git-tracked:

```text
.env
.env.*
.galerina/cache/
.galerina/runtime/
.galerina/local/
.galerina/machine-profile.json
.galerina/runtime-profile.json
.galerina/deploy-secrets.json
*.secret.json
```

Machine profiles, benchmark results, tuning results and deployment secret
metadata are local/runtime outputs unless explicitly exported as redacted
reports.

## Three-Phase Auto-Configuration

### Phase 1: Development Machine

Local detection is for developer ergonomics only.

```bash
galerina machine detect --profile development
```

Example report:

```json
{
  "environment": "development",
  "os": "windows",
  "arch": "x64",
  "cpu": "intel",
  "features": ["sse4", "avx2"],
  "gpu": "available",
  "profileStored": ".galerina/cache/local-machine-profile.json",
  "gitTracked": false
}
```

This may help local performance. It must not become production config.

### Phase 2: Build Or CI Environment

Build/CI can create one of three artifact types:

```text
portable artifact
multi-arch artifact
target-specific artifact
```

For Git deployment platforms, the safest path is often:

```text
Git push
-> production build server detects target
-> Galerina builds for that target
-> Galerina runs deploy checks
-> app starts only if checks pass
```

### Phase 3: Production First Boot

Production performs final detection before receiving traffic.

```bash
galerina runtime configure --profile production
```

Example report:

```json
{
  "environment": "production",
  "os": "linux",
  "arch": "arm64",
  "cpu": "aws-graviton",
  "availableMemory": "1024mb",
  "selectedRuntime": "linux-arm64",
  "selectedCompute": "cpu_vector_arm_neon",
  "fallbackCompute": "cpu_scalar",
  "secretsPresent": true,
  "securityPolicyPassed": true,
  "readyForTraffic": true
}
```

## Runtime Capability Profile

On production, Galerina may generate:

```text
.galerina/runtime/capability-profile.json
```

Example:

```json
{
  "machine": {
    "os": "linux",
    "arch": "arm64",
    "cpuFeatures": ["neon"],
    "memoryLimit": "1024mb",
    "container": true
  },
  "galerina": {
    "runtime": "galerina-runtime-linux-arm64",
    "safeMode": true,
    "debugMode": false
  },
  "compute": {
    "selected": "cpu_vector_arm_neon",
    "fallback": "cpu_scalar",
    "gpu": "not_available",
    "aiAccelerator": "not_available"
  },
  "security": {
    "envValuesLoaded": false,
    "secretsAvailable": true,
    "secretsExported": false,
    "hardcodedSecretsDetected": false
  }
}
```

This file contains metadata only. It must not contain secret values.

## Bounded Runtime Tuning

Galerina may run small first-boot tuning checks, but production tuning must be
bounded and safe.

```galerina
runtime_tuning {
  mode safe_auto

  run_on_first_boot true
  max_duration 10 seconds

  test [
    json_decode,
    crypto_hmac,
    database_pool,
    compute_vector
  ]

  store_result ".galerina/runtime/tuning-profile.json"
  never_commit true
}
```

Tuning may choose:

```text
thread count
worker count
database pool size
JSON parser mode
CPU vector mode
compute backend
cache size
```

It must not run extreme benchmarks in production.

## Build Strategies

Galerina should support multiple build strategies.

Portable build:

```bash
galerina build --target portable-linux
```

Multi-arch build:

```bash
galerina build --target linux-x64,linux-arm64
```

Build on target:

```text
Git push
-> cloud build runs on linux-arm64
-> Galerina detects linux-arm64
-> Galerina builds linux-arm64 artifact
```

The deployment report should state which strategy was used.

## Deployment Gates

Production deployment must be blocked when safety gates fail.

```galerina
deployment_gate production {
  require compile passed
  require tests passed
  require security_report passed
  require dependency_report passed
  require secret_report passed
  require memory_report passed
  require deploy_report passed

  block_if [
    hardcoded_secret_detected,
    missing_required_secret,
    unsigned_dependency,
    unknown_package_permission,
    debug_mode_enabled,
    unsafe_network_rule,
    missing_health_endpoint,
    missing_crash_policy,
    target_mismatch,
    failed_smoke_test
  ]
}
```

Example blocked output:

```text
Deployment blocked.
Reason: PAYMENT_API_KEY is missing in production.
```

## Health, Readiness, Smoke Tests And Stability

Galerina should distinguish:

| Check | Meaning |
| --- | --- |
| Health | Is the process alive? |
| Readiness | Can the app safely receive traffic? |
| Smoke test | Does the deployed app actually work? |
| Stability watch | Does it keep running after deployment? |

Example:

```galerina
health {
  live "/health"

  ready "/ready" {
    check secret PAYMENT_API_KEY exists
    check database main reachable
    check outbound PaymentProvider reachable
    check migrations current
    check runtime_config valid
  }

  smoke_tests {
    GET "/health" expect 200
    GET "/ready" expect 200
    POST "/internal/smoke/order-validation" expect 200
  }
}
```

The app should not receive real traffic until readiness and required smoke tests
pass.

## Crash-Loop Protection

Deployments can start successfully and fail shortly after. Galerina should monitor
stability after traffic is enabled.

```galerina
stability_policy production {
  watch_after_deploy 10 minutes

  crash_loop {
    max_crashes 3 per 5 minutes

    on_detected {
      stop_traffic
      rollback previous
      write_crash_report
      alert deployment_owner
    }
  }

  memory {
    max_usage 80 percent
    on_pressure reduce_workers
  }
}
```

## Rollback Metadata

Each deployment should produce rollback metadata.

```json
{
  "deploymentId": "deploy_2026_05_14_001",
  "gitCommit": "abc123",
  "target": "linux-arm64",
  "artifactHash": "sha256:91a...",
  "previousDeployment": "deploy_2026_05_13_004",
  "rollbackSafe": true,
  "databaseMigration": {
    "required": true,
    "reversible": true
  }
}
```

Rollback should not pretend every side effect is reversible. Reports must state
whether database migrations, config changes, secret changes and API contract
changes are rollback-safe.

## Security Controls

Deployment should block:

```text
hardcoded secrets
.env included in build output
secret values included in reports
unsigned artifacts where signing is required
dependency permission expansion without approval
debug mode in production
test routes exposed in production
verbose public errors in production
unsafe network rules
missing crash policy
```

Secret report example:

```json
{
  "envFileIncluded": false,
  "secretValuesIncluded": false,
  "secretNamesIncluded": true
}
```

Secret names may appear in reports. Secret values must not.

## Architecture-Specific Compute Selection

Galerina should select safe compute settings on the target machine, not from the
developer laptop.

```galerina
compute_policy production {
  target auto

  cpu {
    detect_features true

    x64 {
      prefer [avx2, sse4, scalar]
    }

    arm64 {
      prefer [neon, scalar]
    }
  }

  fallback cpu_scalar

  verify {
    compare_against safe_reference
    fail_on_precision_mismatch true
  }
}
```

On Intel, the selected compute may be `cpu_vector_avx2`. On ARM64, it may be
`cpu_vector_neon`. If neither is safe, Galerina should fall back to `cpu_scalar`.

## Generated Deployment Files

Galerina may generate:

```text
Dockerfile
docker-compose.yml
cloudrun.yaml
digitalocean-app.yaml
kubernetes.yaml
systemd service file
Nginx / Apache / Caddy config
GitHub Actions workflow
deployment manifest
health check config
```

Generated files should be inspectable and overrideable. Galerina should show which
policy or profile caused each important generated setting.

Basic Kubernetes output may be free/open. Hardened Kubernetes policy packs,
admission policies, advanced security packs and production hardening automation
remain enterprise-only unless explicitly unlocked by `docs/ENTERPRISE.md`.
The Kubernetes deployment target model is documented in
`docs/KUBERNETES_DEPLOYMENT.md`.

## Deployment Report

Deployment reports should be useful for humans and AI assistants without
exposing secrets.

Example:

```json
{
  "deployment": {
    "status": "ready",
    "environment": "production",
    "gitCommit": "abc123",
    "targetDetected": "linux-arm64",
    "buildTarget": "linux-arm64",
    "machineMismatch": false,
    "secretsPresent": true,
    "secretValuesExposed": false,
    "securityReport": "passed",
    "dependencyReport": "passed",
    "healthCheck": "passed",
    "readinessCheck": "passed",
    "smokeTests": "passed",
    "trafficEnabled": true,
    "rollbackAvailable": true
  }
}
```

AI-readable deployment context should include names and metadata only:

```json
{
  "app": "OrdersApi",
  "target": "cloud_run",
  "startCommand": "./app.bin",
  "requiredSecrets": [
    "PAYMENT_API_KEY",
    "WEBHOOK_SECRET"
  ],
  "healthEndpoint": "/health",
  "port": "PORT",
  "buildOutput": "build/app.bin",
  "doNotExpose": [
    ".env",
    "secret values",
    "private logs"
  ]
}
```

## Command Flow

Recommended production flow:

```bash
galerina check --profile production
galerina test --profile production
galerina build --profile production --target auto
galerina deploy-check --profile production
galerina generate deploy --target docker
galerina deploy --profile production
galerina verify-deploy --profile production
```

For Git platforms:

```bash
galerina deploy-pipeline --profile production
```

Example summary:

```text
Galerina Production Deploy

Source check: passed
Dependency check: passed
Secret scan: passed
Architecture: linux-arm64
Build target: linux-arm64
Security report: passed
Memory report: passed
Crash policy: passed
Health endpoint: passed
Readiness endpoint: passed
Smoke tests: passed
Deployment status: ready
Traffic enabled: yes
```

## Caution

Galerina should not hide deployment too much.

Bad direction:

```text
magic deploy that nobody understands
```

Better direction:

```text
generate clear files
show reports
allow overrides
make decisions visible
block unsafe deployment before traffic
```
