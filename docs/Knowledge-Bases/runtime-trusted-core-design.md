# Runtime Trusted Core Design

## Definition

The Galerina Securely Governed Runtime (LSGR) organises its components into three layers to prevent complexity and maintain security:

```text
1. Trusted Core       — Sheriff, policy, capability checks, audit integrity
2. Execution Planner  — Director, Steward, Scheduler, Balancer, Assembler
3. Passive Modules    — CPU, GPU, NPU, TPU, VPU, ASIC, storage, network, AI tools
```

Key rule:

```text
Governance enforcement = final authority
Planner               = optimisation and flow
Modules               = approved execution only
```

## Why Roles, Not Services

Making every step a separate heavyweight service makes the runtime too slow and too complex. These are **roles inside one governed runtime**, not independent microservices.

## Trusted Core Characteristics

Security authority must be tiny and hard to bypass. The Governance enforcement (Sheriff) belongs in the smallest trusted core possible.

## Execution Signatures (Fast Paths)

Fast paths should be based on signed/hashed plans:

```text
input type + policy version + capabilities + model + compute target
```

This allows safe reuse without bypassing governance.

## Policy Invalidation

If policy changes, cached fast paths must expire immediately.

## Budget-First Execution

Every task starts with declared budgets:

```text
CPU budget
memory budget
time budget
effect budget
AI/tool budget
```

## Critical vs Deferred Split

Only security-critical work blocks the response. Heavy non-essential work goes to governed deferred paths.

## Data Sensitivity Lanes

```text
public lane      = standard security
internal lane    = restricted routing
private lane     = tighter controls
secret lane      = no shared GPU by default
regulated lane   = stricter hardware and audit
```

## Hardware Trust Levels

```text
trusted CPU    = full authority
shared CPU     = standard authority
dedicated GPU  = compute only
shared GPU     = compute only, no sensitive data
remote TPU     = compute only, approved
unknown device = denied
```

## Zero-Copy Contract Views

Use typed views over data instead of copying repeatedly.

## Kill Switches

The Governance enforcement must be able to stop:

```text
task
plugin
AI agent
hardware queue
package
whole execution plan
```

## Core Formula

```text
Biggest speed improvement: Verified Fast Pipes + zero-copy typed views + deferred compute
Biggest security improvement: Small trusted Governance core + deny-by-default capabilities + runtime budgets
```

```text
Small trusted core.
Smart execution planner.
Passive hardware modules.
Verified fast paths.
Audit always.
```
