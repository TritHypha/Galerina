# Galerina Package Implementation and Runtime Gaps

Status: Draft architecture and implementation guidance  
Purpose: Define the remaining core package gaps required for the Galerina v0.1 runtime, compiler and governance baseline.

---

# 1. Overview

The Galerina repository already defines the high-level governance-first architecture, package boundaries and runtime direction.

However, several core implementation areas remain partially specified or planning-only.

This document defines:

```text
remaining package responsibilities
runtime expectations
compiler expectations
boundary enforcement
CLI behaviour
report schemas
future compute planning
Omni logic planning
recommended implementation order
```

The goal is to complete the documentation contracts before full implementation.

---

# 2. Current Remaining Gaps

## 2.1 galerina-core-compiler

Remaining:

```text
effect checker
boundary checker
cross-package visibility enforcement
runtime capability verification
```

Status:

```text
KB specified
implementation pending
```

---

## 2.2 galerina-core-cli

Remaining commands:

```text
galerina deploy
galerina explain
galerina plan
```

Status:

```text
specified in KB
not implemented
```

---

## 2.3 galerina-core-reports

Remaining:

```text
runtime audit log schema
runtime execution proof format
capability usage reports
structured deployment reports
```

Status:

```text
schema not finalised
```

---

## 2.4 galerina-core-compute

Remaining:

```text
GPU backend
AI accelerator backend
photonic planning backend
heterogeneous scheduler integration
```

Status:

```text
planning only
```

---

## 2.5 galerina-core-logic

Remaining:

```text
Omni logic implementation
multi-valued logic runtime support
logic reasoning planner
non-binary compute abstraction
```

Status:

```text
not implemented
```

---

# 3. galerina-core-compiler

---

# 3.1 Compiler Responsibilities

The Galerina compiler is not only a syntax compiler.

It is responsible for:

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

The compiler should produce:

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

---

# 3.2 Effect Checker

The effect checker validates that functions explicitly declare dangerous or externally observable behaviour.

Effects are part of governance.

Example effects:

```text
network
storage
filesystem
process
scheduler
timer
secret
crypto
accelerator
optical_io
```

---

# 3.3 Example: Explicit Effect

```galerina
pub fn fetch_user(
    http: HttpClient,
    id: UserId
) -> Result<UserProfile, NetworkError> effect network {
    return http.get("/users/" + id)
}
```

Compiler understanding:

```text
function performs network activity
runtime capability required
must appear in effect graph
must appear in audit logs
```

---

# 3.4 Example: Missing Effect

Bad:

```galerina
pub fn fetch_user(
    http: HttpClient,
    id: UserId
) -> Result<UserProfile, NetworkError> {
    return http.get("/users/" + id)
}
```

Compiler diagnostic:

```text
SPORE-EFFECT-001: undeclared effect
function: fetch_user
required effect: network
```

---

# 3.5 Effect Propagation

Effects should propagate upward.

Example:

```galerina
pub fn load_profile(
    http: HttpClient,
    id: UserId
) -> Result<UserProfile, NetworkError> effect network {
    return fetch_user(http, id)
}
```

If `fetch_user` requires `network`, then `load_profile` must also declare it.

---

# 3.6 Boundary Checker

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

---

# 3.7 Example: Package Boundary Violation

Bad:

```galerina
import { InternalKey } from "app/auth/private-keys"
```

Compiler error:

```text
SPORE-BOUNDARY-001: import crosses restricted package boundary
module: app/auth/private-keys
```

---

# 3.8 Example: Secret Leakage

Bad:

```galerina
private type SecretToken = Text

pub fn export_token() -> SecretToken {
    return load_secret_token()
}
```

Compiler error:

```text
SPORE-BOUNDARY-002: public API exposes private secret-bearing type
```

---

# 3.9 Runtime Manifest Generation

Compiler output example:

```json
{
  "package": "app-users",
  "modules": [
    "app/users/types",
    "app/users/service"
  ],
  "effects": [
    "network",
    "storage"
  ],
  "capabilities": [
    "Database",
    "HttpClient"
  ],
  "targets": [
    "cpu"
  ],
  "hash": "sha256:example"
}
```

The runtime should trust manifests, not dynamic filesystem scanning.

---

# 3.10 Compiler Pass Pipeline

Recommended compiler pipeline:

```text
1. lexer
2. parser
3. AST builder
4. type checker
5. visibility checker
6. effect checker
7. boundary checker
8. capability resolver
9. package graph validator
10. runtime graph generator
11. optimisation planner
12. backend emitter
13. audit metadata emitter
```

---

# 4. galerina-core-cli

---

# 4.1 CLI Philosophy

The Galerina CLI is not only a build tool.

It is also:

```text
runtime planner
governance inspector
audit viewer
policy validator
deployment coordinator
compute planner
```

---

# 4.2 `galerina deploy`

Purpose:

```text
validated deployment execution
```

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

---

# 4.3 Example Deploy Command

```bash
galerina deploy production
```

Potential runtime output:

```text
Validating package graph...
Checking runtime capabilities...
Checking deployment policy...
Checking effect approvals...
Generating runtime manifest...
Deployment approved.
```

---

# 4.4 Example Denied Deployment

```text
Deployment denied.

Reason:
network effect not approved in production policy
module: app/testing/debug-client
```

---

# 4.5 `galerina explain`

Purpose:

```text
human-readable execution explanation
```

The CLI should explain:

```text
why a capability exists
why an effect is required
why a deployment was denied
why a backend was selected
why a scheduler decision occurred
```

---

# 4.6 Example Explain Command

```bash
galerina explain app/users/service
```

Example output:

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

---

# 4.7 `galerina plan`

Purpose:

```text
compute execution planning
```

The planner should estimate:

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

---

# 4.8 Example Plan Command

```bash
galerina plan app/ai/inference
```

Example output:

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

---

# 4.9 CLI Output Modes

Recommended:

```text
human-readable
JSON
machine report
CI mode
silent mode
```

Example:

```bash
galerina plan app/ai/inference --json
```

---

# 5. galerina-core-reports

---

# 5.1 Purpose

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

---

# 5.2 Audit Philosophy

Audit logs should be:

```text
structured
machine-readable
append-only
secret-safe
hashable
streamable
searchable
```

The audit system should avoid:

```text
raw secrets
unbounded logs
human-only text logs
silent runtime failures
```

---

# 5.3 Runtime Audit Log Example

```json
{
  "timestamp": "2026-01-01T12:00:00Z",
  "runtime": "galerina-runtime",
  "module": "app/users/service",
  "function": "get_profile",
  "effects": ["storage"],
  "capabilities": ["Database"],
  "target": "cpu",
  "duration_ms": 14,
  "status": "success",
  "trace_id": "trace-123",
  "hash": "sha256:example"
}
```

---

# 5.4 Runtime Denial Example

```json
{
  "timestamp": "2026-01-01T12:00:00Z",
  "module": "app/testing/debug-client",
  "status": "denied",
  "reason": "network effect denied by runtime policy",
  "policy": "production-runtime-policy"
}
```

---

# 5.5 Execution Proof Concept

The runtime should be able to prove:

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

---

# 5.6 Suggested Report Types

| Report | Purpose |
|---|---|
| runtime-audit.json | execution events |
| capability-report.json | granted capabilities |
| effect-report.json | observed effects |
| deployment-report.json | deployment validation |
| compute-plan.json | backend planning |
| denial-report.json | blocked execution |
| runtime-health.json | runtime metrics |

---

# 6. galerina-core-compute

---

# 6.1 Compute Philosophy

Galerina should remain:

```text
hardware-neutral
future-compatible
governance-first
runtime-coordinated
```

The language should not hardcode vendor syntax.

Bad:

```galerina
target nvidia
```

Good:

```galerina
target gpu
```

The runtime/backend layer maps this onto actual hardware.

---

# 6.2 Current v1 Baseline

v1 should primarily target:

```text
CPU execution
WASM compatibility
safe async scheduling
bounded parallelism
```

GPU and photonic support remain planning layers until stable runtime support exists.

---

# 6.3 GPU Backend Planning

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

---

# 6.4 Photonic Planning Layer

Galerina should treat photonics primarily as:

```text
optical interconnect
high-speed data movement
memory pooling transport
distributed accelerator coordination
```

Not as magical CPU replacement syntax.

---

# 6.5 Example Optical I/O Planning

```galerina
fn distribute_training_batch(
    batch: TensorBatch
) effect optical_io, accelerator {
    runtime.distribute(batch)
}
```

Compiler understanding:

```text
high-bandwidth transport requirement
accelerator coordination
runtime-managed scheduling
```

---

# 6.6 Compute Balancer Responsibilities

The Compute Balancer should:

```text
select approved hardware
respect runtime policy
manage thermal pressure
manage power constraints
handle fallback safely
avoid unsafe target switching
```

Example:

```text
GPU overloaded -> fallback to CPU
Photonic transport unavailable -> fallback to Ethernet
Accelerator policy denied -> remain CPU-only
```

---

# 6.7 Heterogeneous Runtime Goal

Long-term runtime goal:

```text
CPU + GPU + AI accelerator + optical transport
```

Coordinated under one governed execution planner.

---

# 7. galerina-core-logic

---

# 7.1 Omni Logic Philosophy

Galerina should remain binary-safe by default.

However, future compute research may require:

```text
multi-valued logic
ternary experimentation
uncertainty modelling
AI reasoning states
optical compute abstraction
```

Omni logic is a planning/research layer.

It is not required for the v1 runtime.

---

# 7.2 Binary Safety Rule

Core execution should remain deterministic.

Example:

```text
security checks
runtime policy
capability enforcement
memory safety
```

should not depend on experimental logic systems.

---

# 7.3 Example Omni Logic Concept

Potential future logic state:

```text
TRUE
FALSE
UNKNOWN
DEFERRED
CONFLICT
```

Example:

```galerina
let verification = OmniState.UNKNOWN
```

This should remain isolated from core runtime safety.

---

# 7.4 Example AI Reasoning Use Case

```galerina
fn evaluate_signal(signal: AISignal) -> OmniState {
    if signal.confidence > 0.95 {
        return OmniState.TRUE
    }

    if signal.confidence < 0.40 {
        return OmniState.FALSE
    }

    return OmniState.UNKNOWN
}
```

This may help planning systems or AI orchestration later.

---

# 7.5 Omni Logic Runtime Rules

Recommended restrictions:

```text
cannot control memory safety
cannot override runtime policy
cannot bypass capability checks
cannot override deployment governance
cannot control cryptographic verification
```

Omni logic should remain advisory unless explicitly approved.

---

# 8. Recommended Implementation Order

---

# 8.1 Phase 1

Highest priority:

```text
module system
visibility enforcement
package graph validation
effect checker
boundary checker
runtime manifest generation
```

Reason:

```text
these define governance correctness
```

---

# 8.2 Phase 2

Next priority:

```text
galerina explain
runtime audit schema
runtime denial reports
capability reports
```

Reason:

```text
these improve observability and auditability
```

---

# 8.3 Phase 3

Then:

```text
galerina deploy
compute planner
execution planner
runtime balancing
```

Reason:

```text
these improve runtime coordination
```

---

# 8.4 Phase 4

Later research:

```text
GPU backend
AI accelerator backend
photonic transport planning
Omni logic
```

Reason:

```text
these require mature runtime governance first
```

---

# 9. Recommended Runtime Principle

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

# 10. Final Recommendation

Galerina should complete the governance and compiler correctness layers before advanced heterogeneous compute work.

Recommended stable foundation:

```text
explicit imports
strict package ownership
visibility enforcement
capability enforcement
effect checking
runtime manifests
structured audit logs
runtime policy validation
```

Once these exist, future compute systems become safer to integrate because:

```text
execution intent is explicit
runtime authority is explicit
backend selection is governed
execution plans are inspectable
runtime behaviour is auditable
```

This creates a secure foundation for:

```text
AI-native orchestration
accelerator coordination
optical interconnect planning
future heterogeneous compute
```
