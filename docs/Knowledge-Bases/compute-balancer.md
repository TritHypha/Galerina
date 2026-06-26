# Compute Balancer

## Purpose

Galerina should include a Compute Balancer responsible for hardware awareness,
runtime pressure monitoring and approved compute target selection.

The Compute Balancer answers:

```text
Where should this approved work run right now?
```

It does not decide whether work is allowed. It selects from compute targets
already approved by governance.

## Role Split

The runtime responsibility split is:

```text
Execution planning      what should happen
Authority Control       what may happen
Runtime Logistics       how to do it efficiently
Compute Balancer        where it should run
Passive modules         execute approved work
Audit/Proof             records why and what happened
```

## Core Principle

```text
Approved hardware only.
Best available target.
Safe fallback always.
```

The Compute Balancer must never grant authority.

```text
Authority Control approves.
Compute Balancer selects from approved hardware.
```

If policy does not allow GPU, the Balancer cannot use GPU even if it is idle
and fast.

## What The Balancer Observes

The Compute Balancer monitors:

```text
CPU cores
performance cores
efficiency cores
GPU availability
NPU availability
TPU availability
VPU availability
ASIC availability
FPGA availability
memory pressure
VRAM pressure
temperature
thermal pressure
power state
queue depth
device availability
device trust level
fallback availability
```

## Questions The Balancer Answers

The Balancer evaluates:

```text
Is this hardware available?
Is it overloaded?
Is it too hot?
Is it power-constrained?
Is it trusted enough?
Is it allowed by policy?
Is fallback needed?
Is the queue too deep?
Is memory or VRAM pressure too high?
```

## Approved Target Selection

The Balancer receives an approved target set from the governed execution plan.

Example approved set:

```text
allowed targets:
- VPU
- GPU
- CPU fallback
```

The Balancer may choose among those targets based on live pressure and safety
signals. It may not add a target that was not approved.

## Example Flow

```text
AI vision job arrives
  -> Runtime Command identifies vision inference
  -> Authority Control approves VPU or GPU
  -> Runtime Logistics prepares efficient pipeline
  -> Compute Balancer checks hardware pressure
  -> VPU is hot and overloaded
  -> GPU is available and approved
  -> job goes to GPU
  -> audit records why
```

## Relationship To Resource Deployment Balancer

`Resource Deployment Balancer` is the broader operational terminology for
governed workload deployment across heterogeneous hardware.

`Compute Balancer` is the focused role name for the runtime component that
observes hardware pressure and selects the best currently available approved
compute target.

Both names describe the same responsibility area at different levels:

```text
Resource Deployment Balancer = broad operational responsibility
Compute Balancer = focused runtime role
```

## Reports

The Compute Balancer should emit or feed:

```text
compute-balancer-report.json
compute-target-pressure-report.json
hardware-availability-report.json
hardware-trust-report.json
fallback-decision-report.json
thermal-pressure-report.json
queue-pressure-report.json
```

Reports should record:

```text
approved target set
selected target
rejected approved targets
pressure signals
thermal state
memory/VRAM state
queue state
trust state
fallback reason
policy reference
audit event
```

Reports must be secret-safe and must not expose sensitive workload data.

## Relationship To Other Concepts

The Compute Balancer depends on:

- [Governed Execution Director](governed-execution-director.md)
- [Runtime Terminology Evolution](runtime-terminology-evolution.md)
- [Specialist AI Hardware Compute Targets](specialist-ai-hardware-compute-targets.md)
- [Memory Pressure Security](memory-pressure-security.md)
- [Verified Fast Paths](verified-fast-paths.md)
- [AI As Untrusted Reasoning Worker](ai-as-untrusted-reasoning-worker.md)

## Final Principle

```text
Authority decides what is allowed.
Logistics decides what is efficient.
The Compute Balancer decides what approved target is available.
The modules execute.
The audit proves.
```
