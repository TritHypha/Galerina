# Galerina Runtime Audit Log Schema and Execution Proof

Status: Draft v0.1 runtime reporting specification  
Package: `galerina-core-reports`  
Purpose: Define how Galerina records runtime execution, governance decisions, capability usage and execution integrity.

---

# 1. Overview

Galerina is governance-first.

That means the runtime should not only execute code.

It should also produce explainable evidence about:

```text
what executed
why it executed
what authority was granted
what runtime targets were used
what effects occurred
whether policy approved execution
what decisions the runtime made
```

The runtime audit system exists to provide:

```text
runtime observability
security evidence
execution proof
compliance evidence
AI-readable reports
runtime diagnostics
failure analysis
```

---

# 2. Core Concepts

| Concept | Meaning |
|---|---|
| Audit log | Structured runtime event record |
| Execution proof | Evidence that a specific execution occurred under approved conditions |
| Runtime manifest | Compiler-generated runtime metadata |
| Trace ID | Correlation ID for execution chain |
| Capability evidence | Record of granted authority |
| Effect evidence | Record of observable runtime actions |
| Policy evidence | Record of governance decisions |
| Integrity evidence | Hashes and signatures proving runtime consistency |

---

# 3. Reporting Design Principles

The reporting system should be:

```text
append-only
machine-readable
streamable
hashable
secret-safe
structured
runtime-friendly
AI-readable
```

The reporting system should avoid:

```text
raw secrets
unstructured text logs
silent runtime behaviour
hidden runtime decisions
unbounded memory growth
```

---

# 4. Runtime Audit Goals

The runtime should be able to prove:

```text
which module ran
which version ran
which manifest was approved
which effects occurred
which capabilities were granted
which runtime target executed the workload
whether policy allowed execution
whether fallback occurred
whether runtime denial occurred
```

---

# 5. Audit Layers

Recommended audit layers:

| Layer | Purpose |
|---|---|
| Compiler reports | compile-time metadata |
| Deployment reports | deployment validation |
| Runtime audit logs | execution events |
| Execution proofs | integrity and evidence |
| Runtime health reports | runtime status |
| Denial reports | blocked execution evidence |
| Capability reports | granted authorities |
| Effect reports | observable effects |

---

# 6. Recommended File Types

| File | Purpose |
|---|---|
| `runtime-audit.jsonl` | append-only runtime events |
| `execution-proof.json` | execution integrity proof |
| `deployment-report.json` | deployment evidence |
| `capability-report.json` | capability usage |
| `effect-report.json` | effect usage |
| `runtime-health.json` | runtime metrics |
| `denial-report.json` | blocked execution |
| `runtime-trace.json` | execution trace graph |

---

# 7. Why JSONL for Runtime Logs

Recommended format:

```text
JSON Lines (JSONL)
```

Reason:

```text
append-only friendly
stream processing friendly
large runtime friendly
works with distributed systems
works with SIEM systems
works with AI tooling
```

Example:

```json
{"event":"runtime_start"}
{"event":"module_execute"}
{"event":"runtime_stop"}
```

---

# Part A: Runtime Audit Log Schema

---

# 8. Core Runtime Audit Event

Recommended minimum schema:

```json
{
  "timestamp": "2026-01-01T12:00:00Z",
  "traceId": "trace-123",
  "runtime": "galerina-runtime",
  "runtimeVersion": "0.1.0-beta",
  "workspace": "app-main",
  "package": "app-users",
  "module": "app/users/service",
  "function": "get_profile",
  "status": "success",
  "durationMs": 14,
  "effects": ["storage"],
  "capabilities": ["Database"],
  "target": "cpu",
  "policy": "production-runtime-policy",
  "manifestHash": "sha256:manifest",
  "moduleHash": "sha256:module",
  "executionHash": "sha256:execution"
}
```

---

# 9. Required Core Fields

| Field | Purpose |
|---|---|
| `timestamp` | when execution occurred |
| `traceId` | correlates execution chain |
| `runtimeVersion` | runtime identity |
| `module` | module identity |
| `function` | function identity |
| `effects` | observable actions |
| `capabilities` | granted authority |
| `target` | runtime backend used |
| `status` | success, failure or denial |
| `durationMs` | runtime timing |
| `manifestHash` | compiler/runtime integrity |

---

# 10. Status Values

Recommended statuses:

| Status | Meaning |
|---|---|
| `success` | execution completed |
| `failure` | execution failed |
| `denied` | runtime denied execution |
| `fallback` | runtime changed backend |
| `cancelled` | execution cancelled |
| `timeout` | execution timed out |
| `degraded` | runtime reduced capability |

---

# 11. Example: Successful Event

```json
{
  "timestamp": "2026-01-01T12:00:00Z",
  "traceId": "trace-123",
  "module": "app/users/service",
  "function": "get_profile",
  "status": "success",
  "effects": ["storage"],
  "capabilities": ["Database"],
  "target": "cpu",
  "durationMs": 14
}
```

---

# 12. Example: Failure Event

```json
{
  "timestamp": "2026-01-01T12:00:01Z",
  "traceId": "trace-124",
  "module": "app/users/service",
  "function": "get_profile",
  "status": "failure",
  "errorCode": "USER_NOT_FOUND",
  "effects": ["storage"],
  "target": "cpu"
}
```

---

# 13. Example: Runtime Denial Event

```json
{
  "timestamp": "2026-01-01T12:00:02Z",
  "traceId": "trace-125",
  "module": "app/debug/debug-client",
  "function": "ping_debug_server",
  "status": "denied",
  "reason": "network effect denied by policy",
  "policy": "production-runtime-policy"
}
```

---

# 14. Example: Runtime Fallback Event

```json
{
  "timestamp": "2026-01-01T12:00:03Z",
  "traceId": "trace-126",
  "module": "app/ai/inference",
  "status": "fallback",
  "plannedTarget": "gpu",
  "actualTarget": "cpu",
  "reason": "gpu thermal pressure"
}
```

---

# 15. Runtime Trace IDs

Every execution chain should receive a trace ID.

Example:

```text
HTTP request
  → route handler
    → service call
      → repository call
```

All audit records should share:

```json
{
  "traceId": "trace-123"
}
```

This allows:

```text
runtime tracing
security investigation
AI analysis
distributed execution correlation
```

---

# 16. Runtime Event Categories

Recommended categories:

| Category | Example |
|---|---|
| runtime | runtime start/stop |
| execution | function execution |
| effect | storage/network usage |
| capability | authority grant |
| denial | blocked execution |
| fallback | backend change |
| scheduler | runtime scheduling |
| deployment | deployment approval |
| health | runtime metrics |
| integrity | signature/hash validation |

---

# 17. Runtime Event Example

```json
{
  "category": "scheduler",
  "event": "task_scheduled",
  "traceId": "trace-200",
  "scheduler": "execution-coordinator",
  "task": "parallel-batch-1",
  "target": "cpu"
}
```

---

# Part B: Execution Proof

---

# 18. Purpose of Execution Proof

Execution proof is stronger than logging.

It attempts to prove:

```text
what code executed
under which policy
with which runtime manifest
with which integrity hashes
on which runtime target
under which capability grants
```

---

# 19. Execution Proof Goals

Execution proof should help answer:

```text
Was the approved code actually executed?
Was the runtime manifest altered?
Did runtime policy approve execution?
Did runtime fallback occur?
Did execution stay within approved effects?
```

---

# 20. Recommended Execution Proof Schema

```json
{
  "traceId": "trace-123",
  "timestamp": "2026-01-01T12:00:00Z",
  "runtime": {
    "name": "galerina-runtime",
    "version": "0.1.0-beta"
  },
  "workspace": "app-main",
  "module": "app/users/service",
  "function": "get_profile",
  "manifestHash": "sha256:manifest",
  "moduleHash": "sha256:module",
  "policyHash": "sha256:policy",
  "executionHash": "sha256:execution",
  "resultHash": "sha256:result",
  "target": "cpu",
  "effects": ["storage"],
  "capabilities": ["Database"],
  "status": "success"
}
```

---

# 21. Why Hashes Matter

Hashes help prove:

```text
runtime manifest integrity
module integrity
policy integrity
result integrity
```

This helps detect:

```text
runtime tampering
unexpected deployment changes
modified runtime manifests
policy substitution
```

---

# 22. Execution Hash Strategy

Suggested execution hash inputs:

```text
runtime version
module hash
manifest hash
policy hash
target backend
capability grants
effect approvals
trace id
```

Example pseudo-hash:

```text
SHA256(runtime + module + manifest + policy + target + traceId)
```

---

# 23. Result Hashes

Result hashes should not expose secret output.

Bad:

```json
{
  "result": "password123"
}
```

Better:

```json
{
  "resultHash": "sha256:result"
}
```

---

# 24. Secret Safety Rules

Audit logs must not store:

```text
API keys
passwords
authentication tokens
private certificates
raw secret payloads
```

Allowed:

```text
hashes
status flags
presence checks
capability names
```

---

# 25. Example Secret Audit Event

```json
{
  "category": "secret",
  "event": "secret_access",
  "traceId": "trace-300",
  "secret": "PAYMENT_API_KEY",
  "status": "granted"
}
```

Not:

```json
{
  "secret": "sk-live-super-secret-key"
}
```

---

# Part C: Capability and Effect Evidence

---

# 26. Capability Grant Evidence

Runtime should record granted capabilities.

Example:

```json
{
  "category": "capability",
  "event": "capability_granted",
  "traceId": "trace-400",
  "capability": "Database",
  "module": "app/users/service",
  "policy": "production-runtime-policy"
}
```

---

# 27. Capability Denial Example

```json
{
  "category": "capability",
  "event": "capability_denied",
  "traceId": "trace-401",
  "capability": "Shell",
  "module": "app/tools/admin-shell",
  "reason": "Shell capability denied by runtime policy"
}
```

---

# 28. Effect Evidence Example

```json
{
  "category": "effect",
  "event": "effect_observed",
  "traceId": "trace-500",
  "effect": "storage",
  "module": "app/users/service",
  "target": "cpu"
}
```

---

# 29. Effect Violation Example

```json
{
  "category": "effect",
  "event": "effect_violation",
  "traceId": "trace-501",
  "effect": "network",
  "module": "app/debug/debug-client",
  "reason": "effect denied by runtime policy"
}
```

---

# Part D: Runtime Health and Coordination

---

# 30. Runtime Health Schema

Example:

```json
{
  "timestamp": "2026-01-01T12:00:00Z",
  "runtime": "galerina-runtime",
  "cpuLoad": 0.52,
  "memoryUsageMb": 512,
  "schedulerQueueDepth": 4,
  "activeExecutions": 12,
  "fallbackCount": 1,
  "denialCount": 0
}
```

---

# 31. Scheduler Evidence Example

```json
{
  "category": "scheduler",
  "event": "execution_queued",
  "traceId": "trace-600",
  "queue": "storage-queue",
  "priority": "normal"
}
```

---

# 32. Distributed Runtime Example

Future distributed execution:

```json
{
  "traceId": "trace-700",
  "node": "node-03",
  "target": "gpu",
  "distributed": true,
  "transport": "optical_io"
}
```

---

# Part E: Report Generation

---

# 33. Recommended Generated Reports

| Report | Purpose |
|---|---|
| `runtime-audit.jsonl` | append-only runtime events |
| `execution-proof.json` | execution integrity evidence |
| `capability-report.json` | granted authority summary |
| `effect-report.json` | observed effects summary |
| `denial-report.json` | blocked execution evidence |
| `runtime-health.json` | runtime metrics |
| `runtime-trace.json` | execution dependency graph |

---

# 34. Example Capability Report

```json
{
  "capabilities": [
    {
      "name": "Database",
      "granted": 42,
      "denied": 0
    },
    {
      "name": "Shell",
      "granted": 0,
      "denied": 3
    }
  ]
}
```

---

# 35. Example Effect Report

```json
{
  "effects": [
    {
      "name": "storage",
      "count": 240
    },
    {
      "name": "network",
      "count": 120
    }
  ]
}
```

---

# 36. Example Denial Report

```json
{
  "denials": [
    {
      "module": "app/debug/debug-client",
      "reason": "network effect denied"
    }
  ]
}
```

---

# Part F: Runtime Integration

---

# 37. Runtime Manifest Integration

Audit logs should reference compiler manifests.

Example manifest:

```json
{
  "module": "app/users/service",
  "effects": ["storage"],
  "capabilities": ["Database"],
  "hash": "sha256:module"
}
```

Runtime audit records should include:

```json
{
  "manifestHash": "sha256:manifest",
  "moduleHash": "sha256:module"
}
```

---

# 38. Deployment Integration

Deployment reports should connect to runtime evidence.

Example:

```json
{
  "deploymentHash": "sha256:deployment",
  "runtimeProof": "sha256:execution"
}
```

This creates:

```text
compiler → deployment → runtime → audit chain
```

---

# 39. CLI Integration

Recommended CLI integration:

```bash
galerina deploy --audit
galerina explain --trace
galerina plan --runtime
```

CLI should read runtime reports directly.

---

# 40. AI Tooling Integration

AI tooling should be able to analyse:

```text
runtime traces
capability graphs
effect reports
denial reports
execution proofs
```

without parsing raw text logs.

---

# Part G: Security and Integrity Rules

---

# 41. Recommended Security Rules

Runtime reports should:

```text
be append-only
be integrity hashed
avoid raw secrets
include policy references
include manifest references
support streaming
support distributed runtimes
```

---

# 42. Recommended Integrity Rules

Every execution should reference:

```text
runtime version
module hash
manifest hash
policy hash
trace id
```

This creates an explainable execution chain.

---

# 43. Suggested Runtime Integrity Flow

```text
compiler
  ↓
module graph
  ↓
runtime manifest
  ↓
deployment validation
  ↓
runtime execution
  ↓
audit logs
  ↓
execution proof
```

---

# 44. Suggested Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-AUDIT-001` | runtime audit write failed |
| `SPORE-AUDIT-002` | execution proof hash mismatch |
| `SPORE-AUDIT-003` | runtime manifest hash mismatch |
| `SPORE-AUDIT-004` | denied effect execution observed |
| `SPORE-AUDIT-005` | secret leakage detected in audit payload |
| `SPORE-AUDIT-006` | runtime capability evidence missing |
| `SPORE-AUDIT-007` | distributed trace correlation failed |

---

# 45. Required Test Cases

## Runtime audit tests

```text
successful execution recorded
failure execution recorded
denial execution recorded
fallback execution recorded
trace IDs propagate correctly
runtime manifests linked correctly
```

## Execution proof tests

```text
manifest hashes verified
policy hashes verified
result hashes generated
execution hash deterministic
runtime tampering detected
```

## Secret safety tests

```text
passwords never logged
API keys never logged
secret hashes allowed
secret names allowed
```

---

# 46. Recommended v0.1 Scope

Implement first:

```text
runtime-audit.jsonl
trace IDs
manifest hashes
module hashes
capability evidence
effect evidence
denial reports
fallback reports
execution proof schema
```

Defer:

```text
cryptographic signing infrastructure
remote audit federation
live distributed trace visualisation
formal runtime proof engine
photonic distributed runtime proofing
```

---

# 47. Final Recommendation

Galerina runtime reporting should not behave like traditional text logging.

It should behave like:

```text
governed execution evidence
```

The runtime should always be able to explain:

```text
what happened
why it happened
which authority was granted
which policy approved it
which runtime target executed it
whether fallback occurred
whether execution remained inside approved boundaries
```

This creates a foundation for:

```text
runtime governance
security auditing
AI-readable execution analysis
future heterogeneous compute coordination
```

without turning runtime behaviour into a black box.
