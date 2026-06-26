# Galerina Core CLI: Deploy, Explain and Plan

Status: Draft v0.1 CLI architecture document  
Package: `galerina-core-cli`  
Purpose: Define the governance-first command-line interface for deployment validation, execution explanation and compute planning.

---

# 1. Overview

The Galerina CLI is not just a build tool.

It is part of the runtime governance system.

The CLI should help developers, operators, CI systems and AI tooling understand:

```text
what will run
why it is allowed to run
which capabilities are required
which effects are involved
which runtime targets are selected
which deployment policies apply
why execution may be denied
```

The CLI acts as a bridge between:

```text
compiler
runtime
package manifests
deployment policy
audit reports
compute planner
AI-readable project reports
```

---

# 2. Primary Commands

This document focuses on:

```text
galerina deploy
galerina explain
galerina plan
```

These commands are governance-oriented.

They should work even before advanced GPU or photonic runtimes exist.

---

# 3. CLI Design Principles

The CLI should be:

```text
explainable
machine-readable
human-readable
safe by default
policy-aware
runtime-aware
AI-readable
CI-friendly
```

The CLI should avoid:

```text
silent deployment
hidden runtime decisions
unclear failures
implicit target switching
unsafe defaults
```

---

# 4. CLI Architecture

High-level flow:

```text
source code
    ↓
compiler
    ↓
module graph
    ↓
runtime manifest
    ↓
CLI validation
    ↓
policy evaluation
    ↓
runtime planning
    ↓
deployment approval or denial
```

The CLI should not bypass compiler or runtime governance.

---

# 5. Shared Inputs

All three commands should understand:

```text
workspace manifest
package manifests
runtime manifest
compiler reports
capability graph
effect graph
deployment policy
runtime profiles
compute planner metadata
```

---

# 6. Shared Output Modes

Recommended modes:

| Mode | Purpose |
|---|---|
| human | readable terminal output |
| json | machine-readable integration |
| report | structured audit report |
| ci | deterministic CI/CD output |
| silent | scripting |

Example:

```bash
galerina deploy production --json
```

---

# 7. Shared Exit Codes

| Exit Code | Meaning |
|---|---|
| `0` | success |
| `1` | compiler failure |
| `2` | policy denial |
| `3` | runtime incompatibility |
| `4` | deployment validation failure |
| `5` | capability resolution failure |
| `6` | compute planning failure |
| `7` | manifest integrity failure |

---

# Part A: galerina deploy

---

# 8. Purpose of `galerina deploy`

`galerina deploy` validates whether a Galerina application is allowed to execute in a specific environment.

It is not only a file copy operation.

It performs governance validation before runtime execution.

---

# 9. Deploy Responsibilities

The deploy command should:

```text
validate compiler output
validate runtime manifest
validate package graph
validate effects
validate capabilities
validate runtime target compatibility
validate deployment policy
validate secrets policy
validate module integrity
validate runtime profile compatibility
produce deployment report
```

---

# 10. Example Deploy Command

```bash
galerina deploy production
```

---

# 11. Example Deploy Flow

```text
Load workspace manifest
Load runtime profile
Load deployment policy
Load runtime manifest
Validate package graph
Validate effects
Validate capabilities
Validate runtime target support
Validate hashes
Generate deployment report
Deploy if approved
```

---

# 12. Example Successful Output

```text
Galerina Deploy

Profile: production
Workspace: app-main

Validating package graph...
Validating runtime manifest...
Validating capabilities...
Validating deployment policy...
Validating effects...
Validating runtime targets...

Deployment approved.

Target runtime:
- cpu

Approved effects:
- storage
- network

Deployment hash:
sha256:deployment-example
```

---

# 13. Example JSON Output

```json
{
  "status": "approved",
  "profile": "production",
  "runtimeTargets": ["cpu"],
  "effects": ["storage", "network"],
  "deploymentHash": "sha256:deployment-example"
}
```

---

# 14. Example Denied Deployment

```text
Deployment denied.

Reason:
network effect denied by production policy

Module:
app/debug/debug-client

Function:
ping_debug_server
```

---

# 15. Example Denied JSON

```json
{
  "status": "denied",
  "reason": "effect denied by policy",
  "effect": "network",
  "module": "app/debug/debug-client",
  "function": "ping_debug_server",
  "profile": "production"
}
```

---

# 16. Deployment Policy Example

Example `production.policy.json`:

```json
{
  "allowEffects": [
    "storage",
    "network"
  ],
  "denyModules": [
    "app/debug/*"
  ],
  "allowTargets": [
    "cpu"
  ],
  "denyCapabilities": [
    "Shell"
  ]
}
```

---

# 17. Deployment Validation Rules

The deploy command should deny deployment if:

```text
compiler errors exist
runtime manifest is missing
module hashes do not match
undeclared effects exist
policy denies an effect
policy denies a capability
runtime target unsupported
required secrets missing
module graph invalid
```

---

# 18. Runtime Compatibility Checks

Example:

```galerina
fn train_model(batch: TensorBatch)
    effect accelerator
{
    runtime.accelerator.run(batch)
}
```

If deployment profile only allows CPU:

```json
{
  "allowTargets": ["cpu"]
}
```

Deployment response:

```text
Deployment denied.

Reason:
accelerator target required but unavailable in deployment profile
```

---

# 19. Suggested Deploy Flags

| Flag | Purpose |
|---|---|
| `--json` | machine-readable output |
| `--report` | generate deployment report |
| `--dry-run` | validate without deploying |
| `--strict` | fail on warnings |
| `--profile` | specify runtime profile |
| `--policy` | specify deployment policy |
| `--target` | force runtime target |
| `--audit` | generate audit evidence |

Example:

```bash
galerina deploy production --report --audit
```

---

# 20. Deployment Report Example

```json
{
  "deployment": {
    "status": "approved",
    "profile": "production",
    "workspace": "app-main"
  },
  "runtime": {
    "targets": ["cpu"],
    "capabilities": ["Database", "HttpClient"]
  },
  "effects": [
    "storage",
    "network"
  ],
  "integrity": {
    "manifestHash": "sha256:manifest",
    "moduleGraphHash": "sha256:graph"
  }
}
```

---

# Part B: galerina explain

---

# 21. Purpose of `galerina explain`

`galerina explain` provides human-readable reasoning about Galerina code, runtime planning and governance decisions.

It is intended for:

```text
developers
security auditors
runtime operators
CI systems
AI tooling
```

---

# 22. Explain Responsibilities

The explain command should describe:

```text
imports
capabilities
effects
runtime targets
policy decisions
module relationships
why deployment was denied
why a backend was selected
runtime dependency graph
```

---

# 23. Example Explain Command

```bash
galerina explain app/users/service
```

---

# 24. Example Human Output

```text
Module: app/users/service

Imports:
- app/users/types
- app/users/repository
- galerina-core-data/database

Capabilities:
- Database

Effects:
- storage

Public API:
- get_profile

Reasoning:
The module imports Database capability.
The module calls find_user_record.
find_user_record performs storage access.
The storage effect propagates into get_profile.
```

---

# 25. Example JSON Output

```json
{
  "module": "app/users/service",
  "imports": [
    "app/users/types",
    "app/users/repository",
    "galerina-core-data/database"
  ],
  "capabilities": ["Database"],
  "effects": ["storage"],
  "publicApi": ["get_profile"]
}
```

---

# 26. Example Explain for Denial

```bash
galerina explain deployment-denial.json
```

Output:

```text
Deployment denied because:

Module app/debug/debug-client
requires effect network.

Production policy denies:
- app/debug/*
- effect network
```

---

# 27. Example Explain Dependency Tree

```bash
galerina explain app/users/routes --tree
```

Output:

```text
app/users/routes
 ├── app/users/service
 │    ├── app/users/repository
 │    │    └── galerina-core-data/database
 │    └── app/users/types
 └── galerina-core-network/http
```

---

# 28. Example Explain Runtime Target

```bash
galerina explain app/ai/inference
```

Output:

```text
Recommended runtime target: gpu

Reasoning:
- large tensor operations
- high parallelism
- accelerator-compatible workload

Fallback target:
- cpu
```

---

# 29. Explain Use Cases

| Use Case | Example |
|---|---|
| understand effects | why does this module require network? |
| understand denial | why was deployment blocked? |
| understand imports | where did this type come from? |
| understand runtime planning | why was GPU selected? |
| understand package graph | which module depends on this? |
| understand capability use | why does this route require Database? |

---

# 30. Suggested Explain Flags

| Flag | Purpose |
|---|---|
| `--json` | JSON output |
| `--tree` | dependency graph |
| `--effects` | show effects only |
| `--capabilities` | show capabilities only |
| `--runtime` | show runtime planning |
| `--policy` | show policy evaluation |
| `--audit` | show audit evidence |
| `--trace` | show reasoning trace |

---

# 31. Example Explain Trace

```bash
galerina explain app/users/service --trace
```

Output:

```text
Trace:

get_profile
  → find_user_record
      → Database.find_one
          → requires effect storage
              → requires capability Database
```

---

# Part C: galerina plan

---

# 32. Purpose of `galerina plan`

`galerina plan` estimates and explains how Galerina runtime execution should be coordinated.

This is a planning and governance command.

It does not necessarily execute code.

---

# 33. Planner Responsibilities

The planner should estimate:

```text
CPU suitability
GPU suitability
accelerator suitability
parallelism opportunities
memory pressure
cache reuse opportunities
runtime queue pressure
energy usage
fallback behaviour
```

---

# 34. Example Plan Command

```bash
galerina plan app/ai/inference
```

---

# 35. Example Human Output

```text
Execution Plan

Module:
app/ai/inference

Recommended target:
gpu

Fallback target:
cpu

Reasoning:
- large tensor operations
- highly parallel workload
- accelerator-compatible execution

Estimated memory pressure:
high

Estimated parallelism:
high
```

---

# 36. Example JSON Output

```json
{
  "module": "app/ai/inference",
  "recommendedTarget": "gpu",
  "fallbackTarget": "cpu",
  "parallelism": "high",
  "memoryPressure": "high",
  "reasoning": [
    "large tensor operations",
    "parallel workload"
  ]
}
```

---

# 37. Example CPU Plan

```bash
galerina plan app/users/service
```

Output:

```text
Execution Plan

Recommended target:
cpu

Reasoning:
- low computational intensity
- storage-bound workload
- minimal parallel gain from accelerator
```

---

# 38. Example Optical Planning

Future planning example:

```galerina
fn distribute_batch(batch: TensorBatch)
    effect optical_io, accelerator
{
    runtime.distribute(batch)
}
```

Plan output:

```text
Recommended transport:
optical_io

Reasoning:
- high bandwidth requirement
- distributed accelerator coordination
- large tensor movement
```

---

# 39. Planner Inputs

The planner should analyse:

```text
compiler reports
runtime manifests
effect graph
function graph
loop structure
async structure
parallel opportunities
memory estimates
runtime target support
policy constraints
```

---

# 40. Planner Rules

The planner must not:

```text
bypass runtime policy
force unsafe targets
silently downgrade security
assume unavailable hardware
```

---

# 41. Planner and Runtime Relationship

The planner produces recommendations.

The runtime decides final execution.

Example:

```text
Planner recommends GPU.
Runtime detects GPU overheating.
Runtime safely falls back to CPU.
```

The runtime should record this in audit logs.

---

# 42. Example Runtime Override

Runtime audit:

```json
{
  "plannedTarget": "gpu",
  "actualTarget": "cpu",
  "reason": "gpu thermal pressure"
}
```

---

# 43. Suggested Plan Flags

| Flag | Purpose |
|---|---|
| `--json` | JSON output |
| `--runtime` | include runtime reasoning |
| `--memory` | include memory estimates |
| `--parallelism` | show parallel planning |
| `--energy` | estimate energy cost |
| `--target` | force planning target |
| `--graph` | show execution graph |

---

# 44. Example Execution Graph

```bash
galerina plan app/ai/inference --graph
```

Output:

```text
input
  ↓
preprocess
  ↓
parallel tensor stage
  ├── gpu kernel 1
  ├── gpu kernel 2
  └── gpu kernel 3
  ↓
merge results
  ↓
output
```

---

# Part D: Shared Runtime Integration

---

# 45. Runtime Manifest Relationship

All three commands should rely on compiler-produced manifests.

Example manifest:

```json
{
  "module": "app/users/service",
  "effects": ["storage"],
  "capabilities": ["Database"],
  "targets": ["cpu"],
  "hash": "sha256:module"
}
```

---

# 46. Runtime Coordination

| Command | Runtime Relationship |
|---|---|
| deploy | validates runtime compatibility |
| explain | explains runtime decisions |
| plan | estimates runtime execution |

---

# 47. AI Tooling Integration

The CLI should support AI tooling by producing:

```text
stable diagnostics
structured JSON
machine-readable reasoning
module graphs
runtime graphs
explanation traces
```

AI tools should not need to infer hidden runtime behaviour.

---

# 48. Suggested CLI Report Files

| File | Purpose |
|---|---|
| deployment-report.json | deployment validation |
| explain-report.json | reasoning graph |
| compute-plan.json | execution planning |
| runtime-manifest.json | runtime metadata |
| capability-report.json | capability graph |
| effect-report.json | effect graph |
| denial-report.json | blocked execution details |

---

# 49. Security Principles

The CLI should prefer:

```text
explainable behaviour
safe defaults
explicit authority
visible runtime decisions
policy enforcement
```

over:

```text
silent deployment
hidden optimisation
implicit authority
unsafe fallback
```

---

# 50. Recommended v0.1 Scope

Implement first:

```text
galerina deploy
- manifest validation
- policy validation
- effect validation
- capability validation
- runtime target validation

galerina explain
- imports
- effects
- capabilities
- dependency tree
- denial reasoning

galerina plan
- cpu/gpu recommendation
- memory estimation
- parallelism estimation
- fallback planning
```

Defer:

```text
real photonic execution
real accelerator scheduling
energy optimisation engine
live cluster orchestration
formal planner proof system
```

---

# 51. Final Recommendation

The Galerina CLI should become one of the main governance surfaces of the platform.

It should not merely build code.

It should explain:

```text
what the code does
what authority it needs
why runtime decisions happen
why deployment is safe or denied
how execution is planned
```

This allows Galerina to provide:

```text
secure deployment
runtime auditability
AI-readable execution planning
future heterogeneous compute coordination
```

without making runtime behaviour hidden or magical.
