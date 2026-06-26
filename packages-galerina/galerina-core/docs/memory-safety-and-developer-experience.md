# Memory Safety And Developer Experience

Galerina should not make developers choose between safety and productivity. Safe
patterns should be the easiest patterns to write, read and review.

## Core Principle

```text
Make common safe code simple.
Make risky code explicit, narrow and reported.
```

Galerina should be:

```text
security-first
memory-safe
strict where it matters
fast to prototype
clear to audit
friendly to AI coding assistants
runtime-first for web apps
open to future output targets
supported by compiler and runtime reports
```

## Ownership Modes

Recommended ownership words:

```text
owned
readonly
shared
graph
borrowed
temporary
```

These words should make data movement readable:

```text
owned     = this scope owns cleanup
readonly  = shared read-only view
shared    = explicitly shared safe reference
graph     = owned by a graph region
borrowed  = temporary reference that cannot escape
temporary = short-lived runtime value
```

## Graph Ownership

Many web and tool systems need graph-like data:

```text
route graphs
workflow graphs
permission graphs
dependency graphs
ASTs
AI planning graphs
data lineage maps
knowledge graphs
```

Galerina should make graph ownership explicit.

Example:

```Galerina
graph WorkflowGraph owns Step {
  node start = Step("Start")
  node approve = Step("Approve")
  node reject = Step("Reject")

  edge start -> approve
  edge approve -> reject optional
}
```

Meaning:

```text
The graph owns the nodes.
Edges are references inside the graph region.
External code receives safe handles.
Cleanup belongs to the graph.
Cycles must be declared.
Mutation rules are explicit.
```

## Resource Scopes

Galerina should provide deterministic cleanup for resources that must not wait for
general runtime cleanup.

Examples:

```text
files
sockets
streams
database connections
model handles
temporary secrets
locks
native handles
```

Draft shape:

```Galerina
resource file = File.open(path) {
  let data = file.readText()
  return Ok(data)
}
```

The compiler/runtime should report:

```text
resource opened
resource closed
cleanup path
error path
secret lifetime
unclosed handle diagnostics
```

## Draft And Secure Modes

Galerina can support fast learning and experimentation without weakening release
rules.

```text
draft mode  = fast local feedback with warnings
secure mode = strict production gates
```

Draft mode may allow incomplete examples and softer diagnostics. Secure mode
should require typed inputs, declared effects, route limits, secret-safe output
and report pass conditions.

## Runtime Reports

Memory reports should cover:

```text
large copies
implicit clones
unbounded arrays
large JSON payloads
streaming opportunities
resource lifetime
graph cycle policy
shared mutation policy
native boundary ownership
```

## Developer Experience Rules

The language should prefer:

```text
explicit clone
read-only views
bounded collections
clear ownership words
safe graph regions
resource scopes
typed errors
exhaustive match
actionable diagnostics
```

The language should block or gate:

```text
hidden shared mutation
unchecked pointer-like access
unbounded resource lifetime
unreported native calls
secret output
implicit fallback
unchecked dynamic execution
```

## Product Rule

```text
Galerina safety should feel like clear structure, not ceremony.
```
