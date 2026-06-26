# Galerina — Explicitness Principles

## Core Rule

```
Nothing important should be hidden.
```

For Galerina, "important" means:

```
effects           — what authority this code requires
capabilities      — what the runtime is allowed to do
PII               — what personal data is handled
runtime policy    — what the deployment allows
packages          — where dependencies come from
compute targets   — where code will execute
audit obligations — what must be recorded
allocation        — what memory is consumed
```

Every one of these must be visible to the compiler, auditable by governance, and provable before deployment.

---

## Applied Rules

### 1. No hidden work in the standard library

Simple APIs may allocate. Performance APIs must make allocation explicit:

```galerina
// Simple — allocation happens, acceptable for most code
let parts = String.split(input, ",")

// Performance — explicit arena, no hidden allocation
let arena = Arena.fixed(64.kb)
let parts = String.splitInto(arena, input, ",")
```

**Rule:** if an API may allocate significantly, expose an explicit form. Do not hide allocation in hot paths.

### 2. Compile-time governance proof is Galerina's answer to comptime

Instead of runtime checks and escape hatches, Galerina proves before execution:

```
contracts, effects, policies, types, value-state, capabilities
→ proven at compile time
→ runtime executes from verified manifest
```

The governance proof IS the compile-time execution of governance rules. Nothing runs unless it was proven correct first.

### 3. Explicit error types

Avoid exception-heavy design. Every fallible function returns a typed result:

```galerina
type GetUserResult = Result<User, UserError>

flow getUser(id: UserId) -> GetUserResult
```

This makes errors:
- Visible to AI tools (Result shape is explicit in GIR)
- Compiler-checkable (unhandled Result is caught)
- WASM-compatible (no exception unwinding)
- Auditable (error paths are governed flows)

### 4. Build modes with explicit strictness

```
galerina check                  — development: warn, do not block
galerina check --strict         — warn becomes error
galerina build --dev            — governance is checked, some warnings allowed
galerina build --production     — all governance must pass, no warnings
galerina build --deterministic  — same as production + bit-for-bit reproducibility required
galerina build --target wasm    — emit WASM module instead of JS bootstrap
```

Same source. Different enforcement levels. No magic.

### 5. Explicit compute targets

```galerina
compute {
  prefer [wasm-simd, cpu]
  deny remote.execution
}
```

The compiler chooses before runtime. The plan is proven. The execution follows the plan.

### 6. Explicit unsafe boundary

Dangerous things are unmistakably marked:

```galerina
unsafe let rawEmail: String = request.body.email
```

And require an explicit, recognised gate to become safe:

```galerina
safe mut rawEmail = validate.email(rawEmail)?
```

There is no path from unsafe to governed sink without an explicit gate. The compiler enforces this. The audit trail records it.

### 7. Simple/Performance split in stdlib

```
Simple APIs:     safe default, may allocate, works for most code
Performance APIs: explicit allocation, explicit lifetime, explicit memory control
```

Default developers use simple APIs. Performance-critical code uses performance APIs with the same governance guarantees.

### 8. Cross-compilation mindset

Same Galerina source should produce:

```
JS bootstrap (current, Stage A)
WASM/WASI (Phase 22)
GPU compute shader (Phase 22)
NPU kernel (Phase 23)
```

Contracts, effects, and policies stay identical across all targets. The target changes; the governance does not.

---

## What Galerina Should NOT Do

- Make normal developers manage every allocation manually
- Require explicit unsafe everywhere (only at boundary input)
- Make the performance path harder than the simple path
- Add hardware-specific logic to the parser or type checker

```
Default: safe, governed, ergonomic
Advanced: explicit control, same governance, better performance
```

---

## Connection to Architecture Decisions

This principle directly informs:

- **Stdlib**: `STDLIB_CAPABILITY_MAP` makes every effectful stdlib function explicit
- **Effect checker**: `SPORE-STDLIB-001` catches hidden effectful calls
- **GIR**: `allowedEffectsMask`, `entryPoints`, `sourceHash` make the program's authority explicit
- **RuntimeManifest**: the runtime does not guess governance — it receives a verified manifest
- **PackageResolver**: `SPORE-PKG-003/004/005` catch hidden capabilities, install scripts, unsigned packages
- **ValueStateFlags**: taint tracking makes PII flow visible
- **NodeFlags**: structural properties made explicit at parse time

---

## The One-Line Test

Before shipping any Galerina feature or API, ask:

```
Could a developer accidentally use this without realising its security implications?
```

If yes: make it explicit. Add a required declaration. Emit a diagnostic. Never let it be silent.
