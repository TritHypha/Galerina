# Runtime Terminology Evolution

## Purpose

Galerina runtime terminology should reflect the runtime's current direction:

```text
a governed operational coordination system
```

rather than a traditional:

```text
virtual machine
thread executor
web server runtime
```

Galerina no longer only describes instruction execution. It describes
classification, governance, planning, coordination, deployment, balancing,
auditing and heterogeneous computation.

## Core Shift

Traditional runtimes focus on:

```text
execute code
```

Galerina increasingly focuses on:

```text
coordinate governed computation
```

This terminology shift is architectural, not cosmetic.

## Why Terminology Matters

Traditional runtime vocabulary is often:

```text
CPU-centric
VM-centric
thread-centric
instruction-centric
```

Galerina is moving toward:

```text
governed execution
hardware-aware orchestration
AI-native compute coordination
hybrid electronic and optical execution
capability-driven execution
runtime logistics and deployment
```

Names should describe operational responsibility, not legacy software
abstractions.

## Terminology Summary

| Previous Name | Updated Name |
| --- | --- |
| Director | Runtime Command |
| Sheriff | Authority Control |
| Steward | Runtime Logistics |
| Balancer | Resource Deployment Balancer / Compute Balancer |
| Scheduler | Execution Coordination Scheduler |
| Assembler | Result Assembler |

These names describe responsibility while remaining hardware-neutral and
future-compute compatible.

## Runtime Command

Previous name:

```text
Director
```

Runtime Command is responsible for:

```text
workload understanding
execution planning
dependency planning
compute planning
execution strategy generation
runtime orchestration planning
```

Philosophy:

```text
The runtime must understand execution intent before execution begins.
```

The name reflects governed operational execution across heterogeneous systems,
not simple direction of a local call stack.

## Authority Control

Previous name:

```text
Sheriff
```

Authority Control is responsible for:

```text
capability enforcement
effect enforcement
policy enforcement
runtime authority validation
execution approval
runtime containment
audit enforcement
```

Philosophy:

```text
Execution authority must always be explicit.
```

The name reflects runtime authority governance rather than a metaphorical
security role.

## Runtime Logistics

Previous name:

```text
Steward
```

Runtime Logistics is responsible for:

```text
resource optimization
batching
queue optimization
cache optimization
execution reuse
memory optimization
fast-path reuse
throughput efficiency
```

Philosophy:

```text
Efficient execution requires intelligent resource logistics.
```

The name reflects supply, resource and operational coordination rather than
general stewardship.

## Resource Deployment Balancer And Compute Balancer

Previous name:

```text
Balancer
```

Resource Deployment Balancer is the broad operational responsibility.
Compute Balancer is the focused runtime role that observes hardware pressure
and selects the best currently available approved compute target.

This responsibility area covers:

```text
hardware selection
accelerator routing
workload deployment
thermal awareness
queue pressure awareness
fallback routing
heterogeneous compute balancing
device trust assessment
memory and VRAM pressure assessment
```

Potential hardware targets include:

```text
CPU
GPU
NPU
TPU
VPU
ASIC
FPGA
optical accelerators
future heterogeneous hardware
```

Philosophy:

```text
Compute workloads should be deployed to the most suitable governed hardware target.
```

Rule:

```text
Approved hardware only.
Best available target.
Safe fallback always.
```

The Balancer must not grant authority. Authority Control approves the target
set; the Compute Balancer chooses from that approved set. If GPU is not
allowed by policy, the Balancer cannot select GPU.

The name reflects compute deployment orchestration and live hardware-pressure
selection, not simple load balancing.

## Execution Coordination Scheduler

Previous name:

```text
Scheduler
```

Execution Coordination Scheduler is responsible for:

```text
partially asynchronous execution coordination
dependency timing
task ordering
runtime synchronization
bounded parallelism
queue coordination
cancellation handling
deferred compute execution
```

Philosophy:

```text
Independent execution may occur in parallel,
but governed output must remain coordinated.
```

The name reflects governed execution coordination across multiple execution
types and hardware systems.

## Result Assembler

Previous name:

```text
Assembler
```

Result Assembler is responsible for:

```text
ordered result reconstruction
dependency joining
output assembly
contract restoration
execution result integrity
```

Philosophy:

```text
Parallel execution may complete out of order.
Governed output must return correctly assembled.
```

The name reflects governed output reconstruction after distributed or
partially asynchronous execution.

## Operational Mapping

| Runtime Concern | Operational Equivalent |
| --- | --- |
| Governance | Authority Control |
| Resource optimization | Runtime Logistics |
| Hardware placement | Resource Deployment / Compute Balancing |
| Execution timing | Execution Coordination |
| Output restoration | Result Assembly |
| Runtime planning | Runtime Command |

## Long-Term Runtime Vision

Galerina is moving toward:

```text
a governed compute orchestration platform
```

rather than:

```text
a traditional VM runtime
```

This includes:

```text
CPU orchestration
GPU orchestration
AI accelerator orchestration
optical compute orchestration
governed execution planning
capability-aware execution
audit-native runtime coordination
```

## Final Principle

```text
Traditional runtimes execute instructions.

Galerina coordinates governed computation
across heterogeneous compute systems.
```

Use terminology that describes operational responsibility, not abstract
software objects.
