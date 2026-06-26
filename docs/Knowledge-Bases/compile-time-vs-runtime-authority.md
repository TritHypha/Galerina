# Compile-Time vs Runtime Authority

## Definition

Galerina separates what is known and enforced at compile time from what is only
available and executed at runtime. This distinction is central to the language
safety model.

| Boundary | Question Answered |
| -------- | ----------------- |
| Compile-time authority | What does the compiler know and enforce before execution? |
| Runtime authority | What operations require live execution context? |

## Core Model

```text
Compile time determines what *can* happen.
Runtime determines what *does* happen.

Compile-time systems establish guarantees and constraints.
Runtime systems execute behaviour within those guarantees.
```

---

## Compile-Time Authority

Compile-time authority refers to operations the compiler may evaluate,
validate, or enforce before program execution.

### What the Compiler Can Do

```text
Type checking                  — resolve and verify all types
Module resolution              — resolve all imports statically
Generic specialisation         — expand generic types to concrete types
Constant evaluation            — evaluate const expressions
Macro expansion                — transform program structure
Static capability validation   — validate declared effects and boundaries
Exhaustiveness checking        — verify match arms are complete
Visibility enforcement         — enforce public/private boundaries
```

### Compile-Time Example

```galerina
readonly SIZE = 1024
```

The compiler fully resolves this value before runtime. No runtime context
is required. Note: Galerina uses `readonly` for immutable/compile-time values.
`const` is not a supported keyword — see `SPORE-SYNTAX-002`.

### Compile-Time Restrictions

Compile-time expressions must be:

```text
Deterministic       — same input always produces same output
Pure                — no external side effects
Non-blocking        — no I/O, no network, no file system
Runtime-independent — cannot depend on live environment state
```

The effect checker enforces these restrictions. See
`effect-checker-and-boundary-checker.md`.

---

## Runtime Authority

Runtime authority refers to operations that require live execution context.

### What Only Runtime Can Do

```text
File access             — fs.read, fs.write
Network access          — network.connect, network.fetch
User input              — reading from stdin or HTTP requests
System clocks           — time.read
Dynamic allocation      — heap allocation beyond static analysis
External service calls  — API calls, database queries
Secret access           — reading from secret store
Randomness              — random.read
Process spawning        — process.spawn
```

### Runtime Example

```galerina
let content = fs.read("config.json")
```

This operation cannot be resolved during compilation. It requires a live file
system at execution time.

---

## Capability Declarations

`.spore` restricts runtime capabilities unless explicitly declared.

```galerina
capability fs
capability network
```

Modules lacking declared capabilities cannot perform restricted runtime
operations. This enables:

```text
Sandboxed execution           — modules can only do what they declare
Deterministic builds          — no hidden runtime operations
Reduced attack surface        — undeclared capabilities are denied
Auditable dependency behaviour — each dependency's authority is explicit
```

See `authority-model.md` and `governed-capability-modules.md` for the
full capability model.

---

## Compile-Time Evaluation vs Runtime Execution

```galerina
readonly area = 10 * 20   // compile-time evaluation
let width = input()       // runtime value
```

| Expression | Evaluates At | Properties |
| ---------- | ------------ | ---------- |
| `readonly area = 10 * 20` | Compile time | Deterministic, stable, no side effects |
| `let width = input()` | Runtime | May vary, depends on external state |
| `fs.read("config.json")` | Runtime | Performs effect, may fail |
| `type User { name: String }` | Compile time | Fully resolved before execution |

---

## Interaction with Macros and Generics

Macros operate with compile-time authority.

```galerina
@derive(Serializable)
```

The macro transforms program structure during compilation. Generated code
executes at runtime.

Similarly:

```text
Generic type resolution   — occurs at compile time
Concrete instantiation    — executes at runtime
```

---

## Interaction with the Effect Checker

The effect checker enforces compile-time/runtime separation:

```galerina
compile flow generateSchema() {
    network.fetch("https://example.com/schema")
}
// SPORE-E4004: compile-time/runtime boundary violation
// Compile-time function attempted runtime-only operation `network.fetch`
```

Compile-time code must not attempt runtime-only effects. The effect checker
rejects this at build time.

---

## Security and Determinism

Separating compile-time and runtime authority improves:

```text
Reproducibility     — builds are deterministic, not host-state-dependent
Security auditing   — compile-time authority is bounded and auditable
Build determinism   — same source always produces same artifact
Static verification — more invariants can be checked before execution
```

A compile-time system that cannot perform arbitrary runtime actions is
simpler to reason about and easier to secure.

---

## Summary

```text
Compile-time authority:
  type checking, module resolution, constant evaluation, macro expansion,
  capability validation, exhaustiveness checking, visibility enforcement

Runtime authority:
  file I/O, network, secrets, clocks, user input, external services,
  randomness, process spawning

Capabilities declared in source.
Effects checked by compiler.
Boundaries enforced by both compiler and runtime.
```

## Relationship to Other Systems

```text
Effect checker          → enforces compile-time/runtime boundary
Boundary checker        → validates crossing points between contexts
authority-model.md      → full capability and permission model
effect-checker-and-boundary-checker.md → enforcement implementation
module-system-and-visibility.md → module resolution (compile-time)
```
