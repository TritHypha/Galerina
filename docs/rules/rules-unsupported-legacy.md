# Rules: Unsupported Legacy Patterns

Galerina should avoid legacy patterns that hide behavior, weaken contracts or make
security difficult to review.

## Not Core

```text
global mutable state
raw object dumps
dynamic eval
unrestricted shell execution
hidden network access
raw filesystem access
silent missing values
truthy/falsy branch behavior
implicit coercion
monkey patching
heavy reflection
reflection that bypasses policy
inheritance-heavy object models
inheritance
multiple inheritance
inherited permissions/effects/responses
automatic global dependency injection
implicit async behavior
undeclared effects
silent target fallback
raw model public responses
hidden runtime mutation
unsafe native calls in normal app code
raw pointers / unchecked memory
AI self-granting capabilities
large default framework bundled into runtime
```

## Safer Alternatives

```text
typed globals through strict registry
secret-safe reports
verified generated code in quarantine
explicit admin/tool boundaries
declared network effects
typed file/storage boundaries
Option<T>
Bool-only conditions
explicit conversions
adapters and pipelines
compile-time metadata
explicit composition
contracts and adapters
explicit views/responses
declared capabilities and package manifests
Structured Await, declared tasks and events
effect declarations
fallback reports
response contracts
signed hotfix packages
interop native with explicit ABI and audit reports
```

## Principle

```text
No hidden power.
No hidden mutation.
No hidden execution.
No hidden cost.
```

If a feature hides behaviour, hides authority or forces runtime guessing, keep
it out of normal Galerina source.

Inheritance is disallowed in normal Galerina source because it can hide behaviour,
authority, effects and response exposure behind parent chains.

This rule follows the Architecture Charter: controlled, explainable and
governable computation is more important than unrestricted runtime flexibility.

## v1 Scope

Document and diagnose the patterns most likely to cause security or application
boundary failures.
