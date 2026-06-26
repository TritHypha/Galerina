# Galerina — Standard Library Architecture

## Principle

```
The Galerina standard library should make the safe path the fast path.
```

## Architecture Rule: WASM First

All stdlib API decisions should consider WASM compatibility.
- Pure stdlib functions → WASM functions with zero imports
- Effectful stdlib functions → WASM import table entries
- StringView/BytesView/TensorView → WASM linear memory slices
- Arena APIs → explicit WASM memory layout

## Status

```
Stage A baseline:  callStdlib(), String/Array/Math/Decimal/Json/File/Http/Crypto stubs ✅
Phase 18H:         STDLIB_CAPABILITY_MAP, STDLIB_MODULE_KIND, SPORE-STDLIB-001,
                   TriState stdlib, Tensor stdlib ops registry ✅
Phase R4:          Map<K,V> operations, String extended ops, Math extended ops ✅
                   Tensor.relu, Tensor.dot, Crypto.constantTimeEquals now real (not stubs) ✅
Phase 19+:         StringView, BytesView, TensorView
Phase 21+:         WASM SIMD lowering for Tensor stdlib
Phase 22+:         Arena APIs, target-aware math lowering
```

---

## Pure vs Effectful Split

### Pure Stdlib (no effects — WASM-compatible, JIT-safe, NPU/GPU/APU candidate)

```
String         — immutable ops, char iteration, encoding; extended: trim, split, contains,
                 startsWith, endsWith, padStart, padEnd, repeat, toUpperCase, toLowerCase ✅ Phase R4
Array/List     — filter, map, reduce, fold, collect
Map<K,V>       — get, set, has, delete, keys, values, entries, size ✅ Phase R4
Option<T>      — map, flatMap, unwrapOr, isSome
Result<T,E>    — map, flatMap, mapErr, unwrap, isOk
Math           — add, sub, mul, div, sqrt, pow, abs, min, max, clamp;
                 extended: floor, ceil, round, log, log2, log10, sign, trunc ✅ Phase R4
Decimal        — arbitrary-precision arithmetic (BigInt-based ✅)
Json           — local parsing (no I/O)
Tensor         — matmul, dot (real ✅ Phase R4), transpose, normalize,
                 relu (real ✅ Phase R4), softmax, quantize, dequantize
Vector         — element-wise ops, cross, dot
Matrix         — multiply, invert, transpose
TriState       — and, or, not, toBool, toDecision, match
Hash           — sha256 (pure computation)
Bytes          — encode, decode (pure)
Char           — codePoint, fromCodePoint, isDigit, isAlpha
Crypto         — constantTimeEquals (real ✅ Phase R4 — timing-safe comparison, no stub)
```

### Effectful Stdlib (declare effects — maps to WASM import table)

```
File           → filesystem.read / filesystem.write
Http           → network.outbound
Database       → database.read / database.write
AuditLog       → audit.write
Secrets        → secret.read
Clock          → (deterministic alternative: Clock.fromContext())
Random         → (deterministic alternative: Random.fromSeed(seed))
AI             → ai.inference
EmailService   → network.outbound + email.send
Payment        → payment.charge + network.outbound
```

---

## Capability-Tagged Stdlib

Every stdlib module declares its required effects. These feed into:
- EFFECT_REGISTRY (effect checker)
- SINK_REQUIREMENTS (value-state checker)
- GIR.allowedEffectsMask
- WASM import table

See `STDLIB_CAPABILITY_MAP` in `stdlib-registry.ts`.

---

## Validation Gates (Trusted upgrade path)

Stdlib provides the recognised gates that lift unsafe input to safe/validated:

```galerina
validate.email(raw)?        → protected Email
validate.uuid(raw)?         → protected Uuid
sanitize.html(raw)?         → safe String
parse.int(raw)?             → Int
json.decode<T>(raw)?        → Result<T, DecodeError>
redact(value)               → redacted T
```

These are the ONLY safe upgrade paths from `unsafe String` to governed values.

---

## Protected/Redacted-Aware APIs

Stdlib APIs understand value-state qualifiers:

```galerina
AuditLog.write({ email: protectedEmail })  → SPORE-VALUESTATE-006 ❌
AuditLog.write({ email: redact(email) })   → ✅ passes value-state check
```

Stdlib functions that receive protected values must either:
1. Accept `redacted T` (audit/log functions)
2. Declare they require `protected T` (governed internal APIs)
3. Return a new redacted form

---

## TriState Stdlib

TriState (three-valued logic) is foundational for:
- Logical operations under uncertainty
- Future photonic/ternary backend targets
- Decision systems with unknown/neutral states

```galerina
type Tri = enum { Negative Neutral Positive }

Tri.and(a, b)     → Tri
Tri.or(a, b)      → Tri
Tri.not(t)        → Tri
Tri.toBool(t, policy) → Bool
Tri.toDecision(t) → Decision
```

The photonic backend can map Tri operations to balanced ternary arithmetic without any parser or stdlib changes.

---

## Tensor Stdlib

Operations on `Tensor<T, Shape>` with target-aware lowering:

| Operation | WASM SIMD | GPU | NPU | APU |
|---|---|---|---|---|
| `Tensor.matmul` | ✓ | ✓ | ✓ | ○ |
| `Tensor.dot` | ✓ | ✓ | ✓ | ✓ |
| `Tensor.transpose` | ✓ | ✓ | ✓ | ✓ |
| `Tensor.normalize` | ✓ | ✓ | ✓ | ○ |
| `Tensor.relu` | ✓ | ✓ | ✓ | ✓ |
| `Tensor.softmax` | ✓ | ✓ | ✓ | ○ |
| `Tensor.quantize` | ✓ | ✓ | ✓ | ✓ |
| `Tensor.dequantize` | ✓ | ✓ | ✓ | ✓ |

(✓ = compatible, ○ = partial/layout-dependent)

---

## String/Bytes Views (Phase 19+)

Avoid unnecessary copies:

```galerina
let domain = Email.domainView(email)   // returns StringView, no allocation
let header = Bytes.slice(buf, 0, 16)   // returns BytesView over original buffer
```

Maps to WASM linear memory:
- `StringView` = `(ptr: i32, len: i32)` — no allocation
- `BytesView` = `(ptr: i32, len: i32)` — slice of existing buffer
- `TensorView<T>` = typed view over Float32Array / Int8Array

---

## Arena APIs (Phase 22+)

For high-performance, allocation-aware code:

```galerina
let buf = Arena.fixed(64.kb)
let parts = String.splitInto(buf, input, ",")
```

Maps to WASM linear memory segments. Arena is declared, bounded, and freed deterministically. No GC pressure.

---

## Lazy Iterators (Phase 21+)

Compiler fuses into single loop (no intermediate allocations):

```galerina
items
  .filter(isValid)
  .map(normalize)
  .take(100)
  .collect()
```

WASM output: single loop with inline predicates, no array intermediates.

---

## Deterministic Stdlib

Non-deterministic stdlib functions must be controlled by runtime policy:

```galerina
Clock.now()          → requires clock.read effect
Clock.fromContext()  → reads from request context (deterministic)

Random.bytes(n)      → requires random.generate effect
Random.fromSeed(n)   → pure, deterministic (WASM-safe)
```

---

## Resource Budget Integration

Stdlib calls consume runtime policy budgets:

```
Database.query(...)   → counts against db_reads limit
Http.get(...)         → counts against request_time
AI.infer(...)         → counts against ai_calls
```

Runtime policy config already defines these limits. Stdlib must report consumption.

---

## Diagnostic Code

| Code | Name | Rule |
|---|---|---|
| `SPORE-STDLIB-001` | `StdlibEffectNotDeclared` | effectful stdlib function called without declaring required effect |

---

## Legacy to Avoid

```
global mutable state          → SPORE-SEC-020/021
magic singletons              → hidden state
implicit process/env reads    → must declare secret.read
throw-heavy APIs              → use Result<T,E>
stringly-typed permissions    → use EffectFlags
hidden allocations in hot path → document via Arena
prototype extension           → SPORE-SEC-021
dynamic package loading       → SPORE-BACKEND-001
```

---

## Implementation Status

| Feature | Status |
|---|---|
| callStdlib() (String/Array/Math/Decimal/Json stubs) | ✅ Stage A |
| BigInt-based Decimal arithmetic | ✅ Phase 9A-3 |
| Effectful stdlib (File/Http/Database/AuditLog/Crypto) | ✅ Stage A stubs |
| EFFECT_REGISTRY (effect → capability mapping) | ✅ Phase 5 |
| GATE_PREFIXES (validate.*/sanitize.*) | ✅ Phase 6 |
| Protected/redacted-aware SPORE-VALUESTATE-006/007 | ✅ Phase 11B |
| STDLIB_CAPABILITY_MAP | ✅ Phase 18H |
| STDLIB_MODULE_KIND (pure/effectful classification) | ✅ Phase 18H |
| TENSOR_STDLIB_OPS registry | ✅ Phase 18H |
| TRI_STDLIB_OPS registry | ✅ Phase 18H |
| SPORE-STDLIB-001 constant | ✅ Phase 18H |
| Map<K,V> operations | ✅ Phase R4 |
| String extended ops (trim/split/contains/pad/repeat/case) | ✅ Phase R4 |
| Math extended ops (floor/ceil/round/log/sign/trunc) | ✅ Phase R4 |
| Tensor.relu — real implementation (not stub) | ✅ Phase R4 |
| Tensor.dot — real implementation (not stub) | ✅ Phase R4 |
| Crypto.constantTimeEquals — real implementation (not stub) | ✅ Phase R4 |
| StringView / BytesView / TensorView | 📋 Phase 19 |
| Lazy iterators / chain fusion | 📋 Phase 21 |
| WASM SIMD lowering for Tensor ops | 📋 Phase 21 |
| Arena APIs | 📋 Phase 22 |
| Target-aware math lowering | 📋 Phase 22 |
