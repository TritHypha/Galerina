# Governed Execution Director

## Purpose

Galerina should include a Governed Execution Director as the runtime planning
and coordination layer.

The Director asks:

```text
What is this?
What is allowed?
What needs to happen?
Where should it run?
Has it already been verified?
Why is access requested?
Why is data being returned?
What proof is needed?
```

The Director does not grant hidden authority. It builds a verified execution
plan and assigns work only to approved passive runtime modules.

## Core Flow

```text
data enters
  -> Director identifies it
  -> contracts and policy are checked
  -> execution plan is built
  -> compute target is selected
  -> memory path is assigned
  -> normal path or verified fast pipe is selected
  -> passive modules execute approved work
  -> audit/proof system records the result
```

## Architecture Principle

```text
The Director understands.
The policy decides.
The modules execute.
The audit proves.
```

The Director is not a bypass around policy. It coordinates understanding,
planning, routing and evidence. Policy remains the authority for permission,
capability, effect and boundary decisions.

## Main Parts

The governed execution model has five parts:

```text
1. Shared Understanding Model
2. Governed Execution Director
3. Passive Compute Modules
4. Boundary Modules
5. Audit/Proof System
```

Compute target selection may also use the Compute Balancer role. The Director
builds or coordinates the execution plan; Authority Control approves the
allowed target set; Runtime Logistics prepares efficient processing; the
Compute Balancer chooses the best currently available approved target.

## Shared Understanding Model

All runtime modules should operate from a shared understanding model.

The model describes:

```text
data type
data sensitivity
source
owner
requested action
required effects
required capabilities
compute shape
memory shape
output contract
audit requirement
validation state
processing state
trust state
expiry state
```

This allows CPU, GPU, NPU, TPU, VPU, ASIC, AI, storage and network modules to
operate from the same verified plan instead of inventing local authority.

## Governed Execution Director

The Director decides or prepares evidence for:

```text
whether the data is trusted
whether the data has already been processed
whether a verified fast pipe may be used
which hardware is allowed
which hardware is best
which capabilities are required
which effects are required
why access is requested
why output is being returned
what audit proof is required
```

It does not blindly run code. It plans and governs execution.

The Director should not be confused with the Compute Balancer. The Director
understands and plans. The Compute Balancer evaluates live hardware pressure
and selects from approved targets.

## Passive Compute Modules

Runtime modules should be passive executors.

Passive means:

```text
CPU module does not decide authority
GPU module does not decide authority
NPU module does not decide authority
TPU module does not decide authority
VPU module does not decide authority
AI module does not decide authority
storage module does not decide authority
network module does not decide authority
```

Modules receive a verified execution plan from the Director and must operate
inside that plan.

Example module roles:

```text
CPU      general compute
GPU      parallel accelerator compute
NPU      neural processing unit
TPU      tensor processing unit or AI ASIC
VPU      vision processing unit
ASIC     application-specific integrated circuit
AI       bounded inference or reasoning worker
storage  governed storage operation
network  governed network operation
```

## Boundary Modules

Boundary modules handle sensitive edges such as:

```text
request input
response output
database access
network access
storage access
AI tool calls
file parsing
asset conversion
compute acceleration
plugin execution
```

Boundary modules must enforce the verified plan. They must not widen
permissions, change output contracts or switch compute targets without a new
approved plan and report.

## Verified Fast Pipes

A Verified Fast Pipe is a pre-approved execution route for data and actions
that match a known execution signature.

It may reduce repeated:

```text
parsing
validation of unchanged facts
copying
memory shaping
compute routing
planning
policy calculation
```

It must not bypass:

```text
policy validity
capability limits
effect boundaries
audit
expiry checks
trust checks
boundary checks
revocation checks
```

Rule:

```text
A Verified Fast Pipe skips repeated work, not required security.
```

Fast pipes are contextual, revocable and auditable. They are not permanent
privilege.

## Justified Execution

The runtime should require reasons for sensitive access, output and target
selection.

The Director should ask:

```text
Why is data being returned?
Why is access requested?
Why is this hardware needed?
Why is this plugin needed?
Why is this AI tool needed?
Why is this permission broader than normal?
```

Conceptual access request:

```galerina
request_access database.customer.read
reason: "needed to calculate customer risk score"
```

The reason becomes part of the execution plan and audit proof. Policy can
approve, deny or require human review.

This syntax is conceptual until formal Galerina access-request syntax is
specified.

## Reports

The Director should emit or feed:

```text
execution-plan-report.json
shared-understanding-report.json
compute-target-decision-report.json
memory-path-report.json
verified-fast-pipe-report.json
justified-access-report.json
boundary-module-report.json
audit-proof-report.json
```

Reports must be source-linked, secret-safe, AI-readable and audit-friendly.

## Relationship To Other Concepts

The Governed Execution Director connects existing Galerina concepts:

- [Securely Governed Runtime](securely-governed-runtime.md)
- [Verified Fast Paths](verified-fast-paths.md)
- [Specialist AI Hardware Compute Targets](specialist-ai-hardware-compute-targets.md)
- [Compute Balancer](compute-balancer.md)
- [Memory Pressure Security](memory-pressure-security.md)
- [AI As Untrusted Reasoning Worker](ai-as-untrusted-reasoning-worker.md)
- [Compile-Time Metadata Reflection](compile-time-metadata-reflection.md)
- [Generative Runtime Mapper](generative-runtime-mapper.md)

## Final Principle

```text
The Director understands.
The policy decides.
The modules execute.
The audit proves.
```
