# Package Completion Status

## Definition

This document tracks the remaining implementation gaps across the core
Galerina packages and defines the contract each package must fulfil for the
v0.1 governance baseline.

## Status Key

```text
✅ Implemented   — working prototype or full implementation exists
⚠️  Specified     — KB contract defined, implementation pending
❌ Planned only  — direction set, not yet specified in detail
```

---

## Current Gaps Summary

| Package | Gap | Status |
| ------- | --- | ------ |
| `galerina-core-compiler` | Effect checker | ⚠️ Specified |
| `galerina-core-compiler` | Boundary checker | ⚠️ Specified |
| `galerina-core-compiler` | Cross-package visibility enforcement | ⚠️ Specified |
| `galerina-core-cli` | `galerina deploy` | ⚠️ Specified |
| `galerina-core-cli` | `galerina explain` | ⚠️ Specified |
| `galerina-core-cli` | `galerina plan` | ⚠️ Specified |
| `galerina-core-reports` | Runtime audit log schema | ⚠️ Specified |
| `galerina-core-reports` | Execution proof format | ⚠️ Specified |
| `galerina-core-compute` | GPU backend | ❌ Planned |
| `galerina-core-compute` | AI accelerator backend | ❌ Planned |
| `galerina-core-compute` | Photonic planning backend | ❌ Planned |
| `galerina-core-logic` | Omni logic implementation | ❌ Planned |

---

## galerina-core-compiler

### Responsibilities

The compiler is not only a syntax validator. It is responsible for:

```text
syntax validation
type checking
visibility checking
capability checking
effect analysis
package boundary enforcement
runtime graph generation
audit metadata generation
policy verification
compute planning hints
```

### Compiler Pass Pipeline

Recommended 13-pass pipeline:

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
```

### Compiler Outputs

```text
compiled executable graph
module dependency graph
visibility report
capability graph
effect graph
source maps
audit metadata
runtime manifest
```

### Effect Checker (Planned)

The effect checker validates that functions explicitly declare all
externally observable behaviour.

Effect categories:

```text
network     — outbound network calls
storage     — database or file writes
filesystem  — file system reads/writes
process     — spawning processes
scheduler   — scheduling or timers
timer       — clock access
secret      — secret store access
crypto      — cryptographic operations
accelerator — GPU / AI accelerator use
optical_io  — optical interconnect / photonic transport
```

Example — declared correctly:

```galerina
pub fn fetch_user(
    http: HttpClient,
    id: UserId
) -> Result<UserProfile, NetworkError> effects [network] {
    http.get("/users/" + id)
}
```

Example — missing declaration:

```galerina
pub fn fetch_user(
    http: HttpClient,
    id: UserId
) -> Result<UserProfile, NetworkError> {
    http.get("/users/" + id)
}
// SPORE-EFFECT-001: undeclared effect
// function: fetch_user  required effect: network
```

Effects propagate upward through the call graph — callers of an effectful
function must also declare that effect. See
`effect-checker-and-boundary-checker.md` for full specification.

### Boundary Checker (Planned)

The boundary checker validates:

```text
package boundaries
public/private visibility
capability boundaries
unsafe data crossing
secret leakage
runtime ownership
module graph integrity
```

Example — restricted import:

```galerina
import { InternalKey } from "app/auth/private-keys"
// SPORE-BOUNDARY-001: import crosses restricted package boundary
```

Example — secret leakage through public API:

```galerina
private type SecretToken = String
pub fn export_token() -> SecretToken { ... }
// SPORE-BOUNDARY-002: public API exposes private secret-bearing type
```

See `effect-checker-and-boundary-checker.md` for full specification.

### Runtime Manifest Generation

The compiler produces a runtime manifest trusted by the runtime loader:

```json
{
  "package": "app-users",
  "modules": ["app/users/types", "app/users/service"],
  "effects": ["network", "storage"],
  "capabilities": ["Database", "HttpClient"],
  "targets": ["cpu"],
  "hash": "sha256:example"
}
```

The runtime trusts manifests, not dynamic filesystem scanning.

---

## galerina-core-cli

### CLI Philosophy

The CLI is not only a build tool. It also acts as:

```text
runtime planner
governance inspector
audit viewer
policy validator
deployment coordinator
compute planner
```

### `galerina deploy` (Planned)

Responsibilities:

```text
verify package graph
verify runtime capabilities
verify deployment policy
verify runtime target compatibility
verify secrets policy
verify effects policy
produce deployment report
```

Example output — approved:

```text
Validating package graph...
Checking runtime capabilities...
Checking deployment policy...
Checking effect approvals...
Generating runtime manifest...
Deployment approved.
```

Example output — denied:

```text
Deployment denied.

Reason:
network effect not approved in production policy
module: app/testing/debug-client
```

### `galerina explain` (Planned)

Provides human-readable explanations of:

```text
why a capability exists
why an effect is required
why a deployment was denied
why a backend was selected
why a scheduler decision occurred
```

Example:

```bash
galerina explain app/users/service
```

Output:

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

Reasoning:
The module calls find_user_record which performs storage access.
The storage effect propagates into this module.
```

### `galerina plan` (Planned)

Estimates compute execution strategy:

```text
CPU suitability
GPU suitability
accelerator suitability
memory pressure
parallel execution opportunities
cache reuse opportunities
energy cost estimation
runtime scheduling hints
```

Example:

```bash
galerina plan app/ai/inference
```

Output:

```text
Execution Plan

Recommended target: gpu
Fallback target: cpu

Reason:
- high tensor throughput
- large matrix operations
- parallel execution friendly

Estimated memory pressure: high
Estimated parallelism: high
```

### CLI Output Modes

```text
human-readable (default)
JSON (--json)
machine report (--report)
CI mode (--ci)
silent (--silent)
```

---

## galerina-core-reports

### Purpose

The reports package provides:

```text
runtime audit logs
execution proofs
security evidence
deployment evidence
capability usage logs
runtime diagnostics
structured compliance reports
```

### Audit Philosophy

Audit logs must be:

```text
structured           — JSON format
machine-readable     — parseable by tooling
append-only          — immutable where required
secret-safe          — no raw secret values
hashable             — cryptographic integrity
streamable           — forwardable to SIEM/OTel
```

### Runtime Audit Log Schema (Planned)

```json
{
  "timestamp": "2026-01-01T12:00:00Z",
  "runtime": "galerina-runtime",
  "module": "app/users/service",
  "flow": "get_profile",
  "effects": ["storage"],
  "capabilities": ["Database"],
  "target": "cpu",
  "duration_ms": 14,
  "status": "success",
  "trace_id": "trace-123",
  "hash": "sha256:example"
}
```

Denial example:

```json
{
  "timestamp": "2026-01-01T12:00:00Z",
  "module": "app/testing/debug-client",
  "status": "denied",
  "reason": "network effect denied by runtime policy",
  "policy": "production-runtime-policy"
}
```

### Execution Proof Concept

The runtime produces an execution proof recording:

```text
what ran
which version ran
which capabilities were granted
which runtime target was selected
what effects occurred
whether policy approved execution
```

Example:

```json
{
  "trace_id": "trace-123",
  "runtime_manifest": "manifest-sha",
  "module_hash": "module-sha",
  "policy_hash": "policy-sha",
  "execution_target": "cpu",
  "result_hash": "result-sha"
}
```

### Planned Report Types

| Report | Purpose |
| ------ | ------- |
| `runtime-audit.json` | execution events per module/function |
| `capability-report.json` | granted capabilities |
| `effect-report.json` | observed effects at runtime |
| `deployment-report.json` | deployment validation evidence |
| `compute-plan.json` | backend planning decisions |
| `denial-report.json` | blocked execution events |
| `runtime-health.json` | runtime metrics and health signals |

---

## galerina-core-compute

### Philosophy

The language must remain hardware-neutral:

```galerina
// bad — vendor-specific
target nvidia

// good — abstracted
target gpu
```

The runtime and backend layer map generic targets to actual hardware.

### v1 Baseline

v1 targets:

```text
CPU execution          — primary target
WASM compatibility     — portable deployment
safe async scheduling  — governed concurrency
bounded parallelism    — worker pool model
```

GPU and photonic support remain planning layers until stable runtime
governance exists.

### GPU Backend Planning (Future)

Potential responsibilities:

```text
kernel scheduling
buffer management
copy planning
parallel execution
compute balancing
fallback coordination
```

Example planner output:

```json
{
  "target": "gpu",
  "reason": "parallel tensor operations",
  "fallback": "cpu",
  "estimated_speedup": "high"
}
```

### Photonic Planning Layer (Future)

Photonics is treated primarily as:

```text
optical interconnect          — high-speed data movement
memory pooling transport      — cross-node memory bandwidth
distributed accelerator coord — multi-node AI scheduling
```

Not as a CPU replacement. Photonic effects are declared explicitly:

```galerina
fn distribute_training_batch(
    batch: TensorBatch
) effects [optical_io, accelerator] {
    runtime.distribute(batch)
}
```

### Compute Balancer

The runtime balancer must:

```text
select approved hardware
respect runtime policy
manage thermal pressure
manage power constraints
handle fallback safely
avoid unsafe target switching
```

Fallback examples:

```text
GPU overloaded          → fallback to CPU
Photonic unavailable    → fallback to Ethernet
Accelerator denied      → remain CPU-only
```

---

## galerina-core-logic

### Binary Safety Rule

Core execution must remain deterministic. Security checks, runtime policy,
capability enforcement, and memory safety must not depend on experimental
logic systems.

### Omni Logic (Future Research)

Omni logic extends binary TRUE/FALSE with additional reasoning states:

```text
TRUE
FALSE
UNKNOWN
DEFERRED
CONFLICT
```

Intended use cases:

```text
AI confidence modelling
Uncertainty propagation
Multi-valued planning systems
Optical compute abstraction layers
```

Example:

```galerina
fn evaluate_signal(signal: AISignal) -> OmniState {
    if signal.confidence > 0.95 { return OmniState.TRUE }
    if signal.confidence < 0.40 { return OmniState.FALSE }
    return OmniState.UNKNOWN
}
```

### Omni Logic Restrictions

Omni logic must not:

```text
control memory safety
override runtime policy
bypass capability checks
override deployment governance
control cryptographic verification
```

Omni logic is advisory unless explicitly approved by policy.

---

## Implementation Order

### Phase 1 — Governance Correctness (Highest Priority)

```text
module system implementation
visibility enforcement
package graph validation
effect checker
boundary checker
runtime manifest generation
```

These define governance correctness and must exist before advanced work.

### Phase 2 — Observability and Auditability

```text
galerina explain
runtime audit log schema
runtime denial reports
capability reports
```

### Phase 3 — Runtime Coordination

```text
galerina deploy
compute planner
execution planner
runtime balancing
```

### Phase 4 — Advanced Compute (Requires Mature Governance First)

```text
GPU backend
AI accelerator backend
photonic transport planning
Omni logic
```

---

## Core Runtime Principle

The runtime should always prefer:

```text
safe execution
explainable execution
auditable execution
bounded execution
policy-approved execution
```

over:

```text
maximum theoretical speed
unsafe acceleration
hidden optimisation
implicit authority
silent fallback
```

---

## Relationship to Other Documents

```text
effect-checker-and-boundary-checker.md  — effect/boundary checker spec
build-system-and-cli.md                 — CLI command contracts
runtime-audit-log-format.md             — audit log schema spec
cicd-integration-and-provenance.md      — deployment pipeline spec
module-system-and-visibility.md         — module/visibility spec
```
