# Galerina Intent, Safety Levels, Effects, and Flow Tracing

**Status:** Stage 1 — type contracts and documentation complete; parser/checker stubs in place  
**Scope:** Developer intent declarations, safety levels, security effects, flow tracing, runtime manifests  
**Packages:** `@galerina/core`, `@galerina/core-compiler`, `@galerina/core-reports`

---

## 1. Core Idea

Most compilers understand syntax. Galerina additionally understands **declared developer intent**:

```text
this flow creates an order         → intent "create customer order"
this function reads a secret       → effects [secret.read]
this route charges money           → safetyLevel: guarded, effects [payment.charge]
this block is unsafe native interop → unsafe block + reason + fallback
this computation is pure           → pure flow + effects []
this code must be audited          → audit required
```

Galerina does not guess intent. It asks the developer to declare intent, then checks whether the code matches.

---

## 2. Safety Levels

Declared on the flow or block header keyword.

| Level | Keyword | Meaning |
|---|---|---|
| `pure` | `pure flow` | Pure or low-risk; no side-effectful operations |
| `guarded` | `guarded flow` | Governed; declared effects, policies, and audit |
| `secure` | `secure flow` | Trust-boundary form; may declare effects, governance, audit |
| `privileged` | `privileged flow` | High authority; requires declared capability |
| `unsafe block` | `unsafe block Name` | Bypasses safety for a bounded block; needs reason, approval, fallback |
| `experimental` | `experimental flow` | Non-production; blocked in production targets |

> **Legacy qualifiers removed:** `safe flow`, `guard flow`, and `unsafe flow` as top-level
> qualifiers are not valid v1 syntax. They emit SPORE-SYNTAX-LEGACY-002 (warning) if
> encountered. Use `pure flow`, `guarded flow`, or `secure flow` respectively.

Unqualified `flow` defaults to governed behavior with no extra constraints — same as the existing `flow` keyword.

---

## 3. Effect Declarations

Effects name every security-sensitive operation a flow may perform.

```galerina
guarded flow createOrder(input: CreateOrderRequest)
contract {
  intent { "create customer order" }
  effects { database.write, network.call }
}
{
  ...
}
```

### Canonical Effect Groups

| Prefix | Examples |
|---|---|
| `auth` | `auth.check`, `auth.issue` |
| `permission` | `permission.check`, `permission.grant` |
| `secret` | `secret.read`, `secret.write`, `secret.derive`, `secret.send` |
| `network` | `network.call`, `network.outbound` |
| `database` | `database.read`, `database.write`, `database.delete` |
| `payment` | `payment.charge`, `payment.refund` |
| `email` | `email.send` |
| `ai` | `ai.invoke` |
| `native` | `native.call` |
| `filesystem` | `filesystem.read`, `filesystem.write` |
| `shell` | `shell.execute` |
| `audit` | `audit.write` |

---

## 4. Intent Declarations

### Optionality Rule

```text
Intent optional  — pure/internal helper functions
Intent recommended — public package functions
Intent required  — all governed surfaces
```

### Governed Surfaces (Always Require Intent)

```text
API routes          webhooks        payment flows
secret access       network calls   AI invocations
native interop      deployment      unsafe blocks
privileged flows
```

### Syntax

```galerina
// Pure helper — no intent needed.
fn add(a: Int, b: Int) -> Int {
  return a + b
}

// Pure flow with intent declared in contract.
pure flow calculateTotals(orders: List<Order>) -> List<Money>
contract {
  intent { "calculate order totals" }
}
{
  return orders.map(order => order.total)
}

// Guarded API flow — intent required, effects in contract.
guarded flow createOrder(input: CreateOrderRequest) -> Result<OrderId, ApiError>
contract {
  intent { "create customer order" }
  effects { database.write, network.call }
  audit { require proof }
}
{
  let order = Order.from(input)
  database.orders.insert(order)
  return Created(order.id)
}

// Privileged flow with effects in contract.
privileged flow rotateSigningKey() -> Result<Unit, ApiError>
contract {
  intent { "rotate JWT signing key" }
  effects { secret.read, secret.write, audit.write }
  audit { require proof, require signed attestation }
}
{
  ...
}

// Unsafe block (remains valid — not a top-level flow qualifier).
unsafe block NativeImageResize
  intent "resize image using approved native library"
  reason "native library provides required image format support"
  requires approval "native-interop"
  fallback safeImageResize
{
  native.call("resize_image")
}

// Experimental flow with effects in contract.
experimental flow newFraudScoringModel(input: PaymentAttempt) -> RiskScore
contract {
  intent { "test new fraud scoring model" }
  effects { ai.invoke }
  audit { require proof }
}
{
  ...
}
```

---

## 5. Diagnostic Codes — SPORE-INTENT-*

Defined in `@galerina/core-compiler` as `SPORE_INTENT_001` through `SPORE_INTENT_005`.

| Code | Name | Condition |
|---|---|---|
| `SPORE-INTENT-001` | `INTENT_BEHAVIOR_MISMATCH` | Declared intent conflicts with inferred behavior |
| `SPORE-INTENT-002` | `MISSING_REQUIRED_INTENT` | Governed surface (API, webhook, payment, etc.) is missing an intent declaration |
| `SPORE-INTENT-003` | `UNSAFE_MISSING_REASON_OR_FALLBACK` | Unsafe block/flow is missing reason, approval, or fallback |
| `SPORE-INTENT-004` | `PRIVILEGED_MISSING_CAPABILITY` | Privileged flow does not declare required capability |
| `SPORE-INTENT-005` | `EXPERIMENTAL_IN_PRODUCTION` | Experimental code included in production build target without explicit approval |

**Note:** The source design document uses `LN-INTENT-*`. The canonical format in this repo is `SPORE-INTENT-*` (matching `SPORE-CONFIG-*`, `SPORE-LOGIC-*`, `SPORE-STRING-*`, etc.).

### Example Diagnostic Output

```json
{
  "code": "SPORE-INTENT-002",
  "name": "MISSING_REQUIRED_INTENT",
  "severity": "error",
  "message": "Governed surface requires an intent declaration.",
  "suggestedFix": "Add intent \"create customer order\" to the route."
}
```

---

## 6. Intent/Effect Consistency Check

If a flow declares intent and effects, the compiler checks for mismatches:

```galerina
// Bad: declared intent says "send receipt" but body performs delete.
// @legacy: 'safe flow' is invalid v1 syntax (SPORE-SYNTAX-LEGACY-002).
// Use 'guarded flow' instead.
guarded flow sendReceipt(order: Order) -> Result<Unit, ApiError>
contract {
  intent { "send customer receipt" }
  effects { email.send }
}
{
  database.delete(order.id)
}
// ^ SPORE-INTENT-001: Declared intent conflicts with inferred behavior.
//   Flow declared intent "send customer receipt" but performs destructive database.delete.
//   Declare database.delete explicitly or move it to a different flow.
```

---

## 7. Type Contracts

### In `@galerina/core`

```ts
// Note: "safe" maps to the legacy 'safe flow' qualifier (SPORE-SYNTAX-LEGACY-002).
// In SPORE syntax use 'pure flow'. "unsafe" as a top-level qualifier is also legacy;
// use 'secure flow' or 'unsafe block' in source. These type values remain in the
// compiler AST for backward-compatibility with parsed legacy files only.
export type SafetyLevel =
  | "safe" | "guarded" | "privileged" | "unsafe" | "experimental";

export interface IntentDeclaration {
  readonly text: string;
  readonly location?: SourceLocation;
}

export interface EffectReference {
  readonly name: string;            // e.g. "database.write"
  readonly location?: SourceLocation;
}

export interface FlowDeclarationMetadata {
  readonly name: string;
  readonly safetyLevel: SafetyLevel;
  readonly intent?: IntentDeclaration;
  readonly declaredEffects: readonly EffectReference[];
  readonly requiredCapabilities: readonly string[];
  readonly auditRequired: boolean;
  readonly traceEnabled: boolean;
  readonly unsafeReason?: string;   // unsafe blocks only
  readonly fallbackFlow?: string;   // unsafe blocks only
  readonly location?: SourceLocation;
}
```

### In `@galerina/core-compiler`

```ts
export interface IntentCheckResult {
  readonly flowName: string;
  readonly safetyLevel: CompilerSafetyLevel;
  readonly intent?: string;
  readonly declaredEffects: readonly string[];
  readonly inferredEffects: readonly string[];
  readonly mismatches: readonly IntentMismatch[];
  readonly diagnostics: readonly CompilerDiagnostic[];
}

export interface IntentMismatch {
  readonly kind: IntentMismatchKind;
  readonly message: string;
  readonly path?: string;
}
```

### In `@galerina/core-reports`

```ts
export interface IntentReport extends LoReportBase {
  readonly kind: "intent";
  readonly flows: readonly IntentFlowEntry[];
  readonly governedSurfaces: number;
  readonly missingIntent: number;
  readonly effectMismatches: number;
}

export interface SafetyReport extends LoReportBase {
  readonly kind: "safety";
  readonly flows: readonly SafetyFlowEntry[];
  readonly safeCount: number;
  readonly guardedCount: number;
  readonly privilegedCount: number;
  readonly unsafeCount: number;
  readonly experimentalCount: number;
  readonly experimentalInProduction: number;
}

export interface FlowTraceReport extends LoReportBase {
  readonly kind: "flow-trace";
  readonly events: readonly FlowTraceEventRecord[];
  readonly redactedFields: number;
}

export interface RuntimeFlowManifest {
  readonly id: string;
  readonly name: string;
  readonly safetyLevel: string;
  readonly intent?: string;
  readonly effects: readonly string[];
  readonly capabilities: readonly string[];
  readonly auditRequired: boolean;
  readonly traceEnabled: boolean;
}
```

---

## 8. AstNodeKind Additions

New node kinds added to `AstNodeKind` in `@galerina/core`:

| Kind | Syntax element | Notes |
|---|---|---|
| `guardedFlowDecl` | `guarded flow Name(...)` | Active v1 qualifier |
| `privilegedFlowDecl` | `privileged flow Name(...)` | Active v1 qualifier |
| `unsafeFlowDecl` | `unsafe flow Name(...)` | @legacy — SPORE-SYNTAX-LEGACY-002 (warning); use `secure flow` or `unsafe block` |
| `experimentalFlowDecl` | `experimental flow Name(...)` | Active v1 qualifier |
| `unsafeBlock` | `unsafe block Name { ... }` | Active v1 form for bounded unsafe scope |
| `intentDecl` | `intent "..."` inside `contract { intent {} }` | Use contract form only |
| `requiresCapabilityDecl` | `requires capability CapabilityName` | Active |
| `fallbackDecl` | `fallback safeFlowName` in an unsafe block | Active |

---

## 9. Flow Trace — Governed Evidence

Trace output is **governed evidence**, not a debug dump. All secrets and PII must be redacted before emission.

```jsonl
{"traceId":"trace_123","spanId":"s1","timestamp":"...","stage":"request.received","routeId":"POST /orders","status":"ok"}
{"traceId":"trace_123","spanId":"s2","timestamp":"...","stage":"request.decoded","status":"ok"}
{"traceId":"trace_123","spanId":"s3","timestamp":"...","stage":"validation.completed","status":"ok"}
{"traceId":"trace_123","spanId":"s4","timestamp":"...","stage":"capability.checked","capability":"OrderWriter","decision":"allow","status":"ok"}
{"traceId":"trace_123","spanId":"s5","timestamp":"...","stage":"effect.executed","effect":"database.write","status":"ok"}
{"traceId":"trace_123","spanId":"s6","timestamp":"...","stage":"response.encoded","status":"ok","metadata":{"statusCode":201}}
```

Rules:
- Secrets must never appear in trace metadata.
- PII must be redacted to `"[REDACTED]"`.
- `FlowTraceReport.redactedFields` must count all redacted values.

---

## 10. Runtime Auto-Parallelisation

When a flow is `pure` with `effects []`, the runtime may safely rewrite sequential operations to parallel:

```galerina
pure flow calculateTotals(orders: List<Order>) -> List<Money>
contract {
  intent { "calculate order totals" }
}
compute target best { prefer [wasm, cpu] }
{
  return orders.map(order => order.total)
}
```

The runtime must emit a rewrite report:

```json
{
  "rewrite": "map_to_parallel_map",
  "source": "orders.map(order => order.total)",
  "workers": 8,
  "reason": "pure function, independent items, bounded memory",
  "fallback": "sequential_map"
}
```

Shared mutable state blocks parallelisation:

```galerina
// Bad: shared mutation — cannot be auto-threaded.
let count = 0
orders.forEach(order => { count = count + 1 })

// Good: functional fold — safe to optimise.
let count = orders.count()
```

---

## 11. Report Files Produced by `galerina build`

| File | Content |
|---|---|
| `intent-report.json` | Per-flow intent/effect consistency results |
| `safe-unsafe-report.json` | Safety level breakdown; `experimentalInProduction` count |
| `flow-trace-manifest.json` | Trace event schema for governed flows |
| `runtime-optimisation-report.json` | Parallelisation rewrites and fallbacks |

---

## 12. Design Rules

```text
1. Intent is optional for pure/internal functions.
2. Intent is required for all governed surfaces.
3. Effects are required when behavior crosses trust boundaries.
4. Unsafe blocks must declare reason, approval, and a safe fallback.
5. Privileged flows must declare required capability.
6. Experimental code must not enter production silently.
7. The runtime may auto-parallelise only when effects/purity prove it safe.
8. Trace output is governed evidence — never raw debug state.
9. Secret and PII redaction is mandatory in all traces and reports.
10. The compiler must reject intent/behavior mismatches.
```

---

## 13. Implementation Status

| Area | Status | Notes |
|---|---|---|
| `SafetyLevel` type | ✅ | `@galerina/core/src/index.ts` |
| `IntentDeclaration` type | ✅ | `@galerina/core/src/index.ts` |
| `EffectReference` type | ✅ | `@galerina/core/src/index.ts` |
| `FlowDeclarationMetadata` type | ✅ | `@galerina/core/src/index.ts` |
| `FlowTraceEvent` type | ✅ | `@galerina/core/src/index.ts` |
| AstNodeKind additions | ✅ | 8 new node kinds in `@galerina/core` |
| `IntentCheckResult`, `IntentMismatch` | ✅ | `@galerina/core-compiler` |
| `SPORE-INTENT-001..005` constants | ✅ | `@galerina/core-compiler` |
| `CompilerSafetyLevel`, `GovernedSurfaceKind` | ✅ | `@galerina/core-compiler` |
| `FlowScope` extended to all safety levels | ✅ | `@galerina/core-compiler` (internal) |
| `parseFlowStart()` regex extended | ✅ | Recognises guarded/privileged/unsafe/experimental/unsafe block |
| `validateIntentEffects()` stub | ✅ | Returns empty result; TODOs in place for Stages 3–5 |
| `IntentReport`, `SafetyReport`, `FlowTraceReport` | ✅ | `@galerina/core-reports` |
| `RuntimeFlowManifest` type | ✅ | `@galerina/core-reports` |
| `createIntentReport()` | ✅ | `@galerina/core-reports` |
| `createSafetyReport()` | ✅ | `@galerina/core-reports` |
| `createFlowTraceReport()` | ✅ | `@galerina/core-reports` |
| Parser support (Stage 2) | ⏳ | Blocked on `compiler/galerina.js` extension |
| Intent/effect checker (Stage 3) | ⏳ | Stub in place; needs AST → checker wiring |
| Manifest generation (Stage 4) | ⏳ | Types ready; generator not yet wired |
| Runtime integration (Stage 5) | ⏳ | Deferred to runtime package |
| CLI integration (Stage 6) | ⏳ | Deferred to `@galerina/core-cli` |
