# Software As Declared Intent

Galerina is built on the idea that modern code should not only execute. It should
communicate system intent.

## Core Statement

```text
Modern coding is becoming less about writing machine instructions and more about
expressing system intent in a way that humans, AI and tools can understand,
check and safely execute.
```

Modern software development is shifting from simply writing instructions for
machines to clearly expressing the methods, policies, data flows and intentions
behind a system so humans, AI tools and compilers can all understand, verify
and improve it.

## Galerina Statement

Galerina programs should clearly express:

```text
methods
rules
policies
data flows
security boundaries
permissions
effects
reports
```

The goal is for developers, AI systems, compilers and runtime tools to
understand what the software is meant to do before it runs.

A Galerina program should clearly express the methods, rules, policies, data flows
and security boundaries it represents, so developers, AI systems and runtime
tools can understand what the software is meant to do before it runs.

## How Galerina Expresses Intent

Galerina uses:

```text
data       = what information exists, enters and leaves
flow       = what runs
permission = what is allowed
boundary   = where trust changes
report     = proof of what was checked
```

## Security Value

Declared intent lets Galerina check whether implementation behavior matches the
declared model:

```text
Does this flow require the right permission?
Does this response expose only allowed data?
Does this boundary validate input?
Does this code perform only declared effects?
Does this report prove the decision?
```

## AI Value

AI tools should not need to guess architecture from scattered code. They should
read declared data, flows, permissions, boundaries and reports, then propose
changes that preserve those declarations.

## Rule

When Galerina accepts a feature, it should be visible to humans, AI and tools
through types, permissions, policies, effects, source maps or reports.

---

## Governance Execution Pipeline

Declared intent is the first stage of Galerina's four-stage governance pipeline:

```text
intent                  — why this system exists; declared purpose and authority
    ↓
governed execution plan — how execution is permitted to occur; the operational contract
    ↓
coordinated compute     — how governed execution actually occurs across targets
    ↓
audit proof             — verifiable evidence that execution respected all declared guarantees
```

Each stage has a full specification:

- [galerina-concept-intent.md](galerina-concept-intent.md)
- [galerina-concept-governed-execution-plan.md](galerina-concept-governed-execution-plan.md)
- [galerina-concept-coordinated-compute.md](galerina-concept-coordinated-compute.md)
- [galerina-concept-audit-proof.md](galerina-concept-audit-proof.md)
