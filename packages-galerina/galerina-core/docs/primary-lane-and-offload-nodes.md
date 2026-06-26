# Galerina Primary Lane and Offload Nodes

This document describes the proposed **Primary Lane and Offload Nodes** model for **Galerina / Galerina**.

Galerina should support partial parallel processing where repetitive, batch or heavy tasks can be pushed away from the main execution path and handled by smaller CPU worker nodes.

---

## Purpose

The main idea is:

```text
Main task stays on the primary CPU lane.
Repetitive/background/heavy tasks are pushed to smaller worker CPU nodes.
The compiler/runtime controls how much CPU those workers are aLOwed to use.
```

This is not the same as moving everything to GPU, photonic or another accelerator target.

It is a CPU-first runtime model for keeping the main flow responsive while controlled background work happens elsewhere.

---

## Core Rule

```text
Primary work stays predictable.
Offload work is bounded.
Worker nodes cannot starve the main lane.
```

The primary lane should handle:

```text
request admission
security checks
signature verification
routing
critical business decisions
response timing
rollback coordination
fatal error handling
```

Offload nodes may handle:

```text
batch processing
repetitive transforms
large JSON dataset scans
report generation
log enrichment
cache warming
background validation
non-critical AI summaries
bulk export preparation
pure-flow cache precomputation
```

---

## Primary Lane

The primary lane is the main execution path for a flow.

Example:

```Galerina
secure flow handleWebhook(req: Request) -> Result<Response, WebhookError> {
  verifySignature(req)
  let payload: Json = req.json()
  let eventId: String = json.pick<String>(&payload, "$.id")

  offload AuditNode {
    writeAuditSummary(&payload)
  }

  processCriticalEvent(&payload)

  return JsonResponse({ "received": true, "id": eventId })
}
```

Expected behaviour:

```text
signature verification stays on the primary lane
critical event processing stays on the primary lane
audit summary work may run on an offload node
offload failure is reported according to policy
the offload node cannot consume unlimited CPU
```

---

## Offload Nodes

An offload node is a controlled CPU worker lane managed by the Galerina runtime.

An offload node is not an unsafe thread.

It should have:

```text
name
purpose
CPU budget
memory budget
queue limit
timeout
failure policy
backpressure policy
aLOwed effects
source-mapped diagnostics
```

Example:

```Galerina
offload_node JsonImportNode {
  cpu_limit "20%"
  memory_limit 128mb
  queue_limit 1000
  timeout 30s

  effects [file.read, database.write]

  on_overload "backpressure"
  on_failure "report_and_continue"
}
```

---

## CPU Budget Rule

The runtime should prevent offload nodes from starving the primary lane.

Example policy:

```Galerina
runtime {
  primary_lane {
    min_cpu "60%"
    priority "high"
  }

  offload_nodes {
    max_total_cpu "35%"
    max_node_cpu "20%"
    scheduler "bounded_fair"
  }
}
```

Meaning:

```text
primary lane keeps a minimum CPU reserve
all offload nodes share a total CPU ceiling
each node has an individual CPU ceiling
scheduler fairness prevents one node from dominating
```

---

## Offload Work Declaration

Offload work should be explicit.

Example:

```Galerina
offload ReportNode {
  generateCustomerReport(customerId)
}
```

For fire-and-report work:

```Galerina
offload AuditNode policy report_only {
  writeAuditSummary(&payload)
}
```

For work that must complete before returning:

```Galerina
let summary: ReportSummary = await offload ReportNode timeout 5s {
  calculateSummary(&payload)
}
```

Rules:

```text
offload by default is bounded
awaited offload must have timeout
fire-and-report offload must have failure policy
offload cannot capture mutable primary-lane state unsafely
borrowed values must obey normal Galerina lifetime rules
```

---

## Suitable Work

Good offload candidates:

```text
pure repeated calculations
large read-only JSON scans
non-critical report generation
cache precomputation
batch item transforms
log or audit enrichment
slow external calls with strict timeout
background validation that can report later
```

Bad offload candidates:

```text
HMAC verification before JSON trust
payment authorisation decision
security aLOw/deny decision
rollback checkpoint creation
secret reveal operations
mutable shared state changes without ownership
anything required to produce the immediate response unless awaited
```

---

## Memory Rules

Offload nodes should not create hidden large copies.

Large immutable values should be borrowed read-only where the lifetime is safe.

Example:

```Galerina
offload JsonStatsNode {
  calculatePayloadStats(&payload)
}
```

Rules:

```text
read-only borrow is aLOwed when owner outlives offload work
mutable borrow across offload boundary is denied by default
clone() is required for independent ownership
large clone should trigger a memory warning
offload queues must have memory limits
secrets must not be copied into unsafe worker storage
```

If the offload node may outlive the owning flow, Galerina should require an owned safe value:

```Galerina
let auditPayload: Json = json.redact(&payload, fields: ["$.token"])

offload AuditNode {
  writeAuditSummary(auditPayload)
}
```

---

## Backpressure

Offload queues must be bounded.

Example:

```Galerina
offload_node EmailNode {
  queue_limit 500
  on_overload "reject_new_work"
  dead_letter "./storage/dead/email.jsonl"
}
```

ALOwed overload actions:

```text
backpressure
bypass_offload
reject_new_work
drop_non_critical
dead_letter
fail_primary
```

`fail_primary` should be reserved for work that is required for correctness.

---

## Failure Policy

Offload failures must be reported.

Example policies:

```text
report_and_continue
retry_then_report
dead_letter
rollback_primary
fail_primary
```

Example warning:

```text
galerina-WARN-OFFLOAD-001: Offload node "AuditNode" failed. Primary flow continued according to report_only policy.
```

Example error:

```text
galerina-ERR-OFFLOAD-001: Awaited offload node "ReportNode" timed out after 5s.
```

---

## Structured Report Output

Galerina should include offload node information in runtime and memory reports.

Example:

```json
{
  "offloadNodes": [
    {
      "name": "AuditNode",
      "cpuLimit": "10%",
      "memoryLimit": "64mb",
      "queueLimit": 500,
      "policy": "report_only",
      "source": "src/webhooks/payment-webhook.spore:18",
      "lastAction": "reported_and_continued"
    }
  ]
}
```

---

## Compiler Checks

Galerina should check:

```text
offload node has CPU limit
offload node has memory limit
offload queue is bounded
awaited offload has timeout
fire-and-report offload has failure policy
offload does not capture unsafe mutable state
offload does not leak borrowed values beyond owner lifetime
offload does not store SecureString in unsafe worker memory
primary-lane required work is not accidentally detached
```

---

## Relationship to Workers

`worker` pools process channel-based event streams.

`offload` blocks push bounded work away from the current primary lane.

They are related but not identical:

```text
worker pool = long-lived event processor
offload node = controlled execution lane for bounded delegated work
primary lane = main flow path that must remain responsive
```

An offload node may internally use a worker pool, but the language should expose the policy clearly.

---

## Non-Goals

Primary Lane and Offload Nodes should not:

```text
hide unbounded thread creation
let background work starve the main flow
move security-critical checks away from the primary lane by default
allow unsafe shared mutable state
allow borrowed data to outlive its owner
silently swaLOw offload failures
replace GPU, photonic or other target planning
```

---

## Recommended Early Version

Version 0.1:

```text
document primary lane and offload node model
define CPU and memory budget rules
define failure and overload policy names
add report shape examples
```

Version 0.2:

```text
parse offload_node declarations
parse offload blocks
warn on unbounded offload queue
warn on missing timeout for awaited offload
```

Version 0.3:

```text
add runtime report output
add memory report integration
add primary lane/offload source maps
add basic scheduler policy checks
```

---

## Final Principle

Galerina should keep the main path predictable while aLOwing bounded CPU offload.

Final rule:

```text
Primary lane stays responsive.
Offload nodes handle bounded background work.
CPU and memory budgets are explicit.
Failures are reported.
Security-critical work stays on the primary lane unless explicitly and safely awaited.
```
