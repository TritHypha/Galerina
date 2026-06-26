# Runtime Profiles

## Definition

Galerina **Runtime Profiles** are restricted runtime and language subsets that selectively disable unsafe features or require stronger guarantees. They apply additional governance restrictions on top of the standard Galerina runtime.

```text
Galerina is governed by default.
Profiles restrict further when the environment demands it.
```

## Important Clarification

Profiles do NOT automatically mean: certified, compliant, approved, legally accepted, airworthy, or industrially validated.

Profiles only mean:

```text
the runtime and language are operating
under a more restricted and analyzable subset.
```

## Why Profiles Exist

Some environments require stronger guarantees:

| Environment | Concern |
|---|---|
| Robotics | deterministic control |
| Machine control | bounded execution |
| Embedded systems | predictable timing |
| Regulated systems | audit evidence |
| Safety-sensitive systems | fault containment |
| High-assurance systems | analyzable behaviour |

## Profile Philosophy

Profiles should **remove** unsafe or ambiguous behaviour, not merely warn against it.

```text
Unsafe constructs should become syntactically impossible
inside restricted profiles.
```

## Profile Types

### Strict Profile

Focus: mandatory governance, mandatory audit, maximum analyzability.

```galerina
profile strict {

  require audit required
  require Result<T, Error>
  require checked_returns
  require bounded_execution

  deny try
  deny catch
  deny throw

  deny recursion
  deny unbounded_loop

  deny dynamic_package_load
  deny runtime_reflection
  deny jit

  deny hidden_async
}
```

### High-Integrity Profile

Focus: deterministic execution, runtime predictability, fault isolation.

```galerina
profile high_integrity {

  require Result<T, Error>
  require bounded_execution
  require runtime_budget

  deny try
  deny catch
  deny throw

  deny recursion
  deny dynamic_runtime_mutation
}
```

### Deterministic Runtime Profile

Focus: bounded timing, runtime predictability, controlled scheduling.

```galerina
profile deterministic {

  require bounded_loops
  require fixed_runtime_budget

  deny unbounded_async
  deny dynamic_thread_creation
  deny non_deterministic_scheduler
}
```

## Combining Profiles

```galerina
boot main {
  profile use strict, high_integrity
}
```

## Profile Rules

### Rule 1 — Profiles Only Restrict

Profiles may: add restrictions, require stronger guarantees, disable features.

Profiles may NOT: weaken governance, reduce restrictions, disable core safety.

### Rule 2 — Strictest Rule Wins

When profiles overlap, the strongest restriction applies.

Example: if one profile says `audit optional` and another says `audit required`, the result is `audit required`.

### Rule 3 — Conflicting Profiles Error

Incompatible profiles produce a `ProfileConflictError` at compile time.

Example conflict: Profile A requires deterministic scheduling, Profile B enables unrestricted async execution.

## What Profiles Affect

```text
syntax validation
compile checks
runtime behaviour
scheduler rules
cache behaviour
package loading
execution budgets
audit enforcement
```

Profiles are enforced by: parser, semantic checks, governance checks, runtime authority control.

## Preferred Terminology

```text
Runtime Profile
Restricted Language Profile
High-Integrity Profile
Strict Profile
Deterministic Runtime Profile
```

Avoid: `Aerospace Mode`, `Industrial Mode`, `Military Mode`, `Certified Mode` — these imply guarantees outside the language/runtime itself.

## Final Principle

```text
Galerina profiles increase analyzability,
determinism, and governance restrictions
without implying certification guarantees.
```
