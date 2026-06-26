# Galerina — Value-State Checker Architecture

## Status

```
Phase 6 baseline:   rules 1-5, gate functions, taint propagation ✅
Phase 8B:           string taint propagation (SPORE-VALUESTATE-004) ✅
Phase 11B.1:        two-hop taint (SPORE-VALUESTATE-005) ✅
Phase 11B.2:        user-defined gate prefix matching ✅
Phase 18C:          ValueStateFlags bitset, structured SINK_REQUIREMENTS ✅
Phase 19+:          control-flow-aware state tracking
Phase 20+:          @gate annotations, hardware-readiness flags
```

## Principle

```
The Value-State Checker proves how data changes trust state from input to sink.
```

All data has a trust state. The checker prevents unsafe data from reaching governed sinks without a recognised validation gate.

## Pipeline Position

```
Type checker
  ↓
Value-State Checker       ← here
  ↓
Effect checker
  ↓
Governance verifier
```

The value-state checker reads the type-annotated AST and validates state transitions. It does NOT change types — it proves transitions.

---

## State Machine

```
Input boundary
  ↓ unsafe let / unsafe mut
UNSAFE / TAINTED
  ↓ gate function (validate.*, sanitize.*, etc.)
SAFE / VALIDATED
  ↓ governed sink (database.write, audit.write, etc.)
Accepted ✅

UNSAFE / TAINTED
  ↓ direct to governed sink (no gate)
SPORE-VALUESTATE-003 / SPORE-VALUESTATE-005 ❌
```

## State Bitset (ValueStateFlags)

Internal flags for fast bit-operation checks. Compiler does not need heavy wrapper objects:

```typescript
const ValueStateFlags = {
  None:       0,
  Unsafe:     1 << 0,  // from request.body, params, etc. — untrusted input
  Safe:       1 << 1,  // after a gate function
  Validated:  1 << 2,  // explicitly validated (subset of Safe)
  Tainted:    1 << 3,  // derived from Unsafe via non-gate expression
  Protected:  1 << 4,  // protected qualifier — may be used internally
  Redacted:   1 << 5,  // redacted qualifier — may be logged/audited
  Secret:     1 << 6,  // secret/SecureString — approved operations only
  ReadOnly:   1 << 7,  // readonly binding — candidate for APU shared memory
} as const;
```

Check: `if (value & ValueStateFlags.Unsafe) && !(value & ValueStateFlags.Safe) → error`

Benefits: faster checks, lower memory, clearer state semantics, easier self-hosting.

## Gate Functions

Gate functions are the ONLY allowed transition from UNSAFE to SAFE.

### Stdlib gates (Phase 6):
```
validate.*      sanitize.*      json.decode     toml.decode
parse.*         constantTimeEquals    redact
```

### User-defined gates (Phase 11B.2):
Functions whose names start with: `validate`, `sanitize`, `check`, `verify`, `parse`, `decode`

These are automatically recognised without explicit annotation.

### Future: @gate annotation (Phase 19+):
```galerina
@gate
pure flow parseOrderId(raw: String) -> ParseOrderIdResult
```

Allows project-specific validation flows to be explicitly declared as gate functions. Requires error propagation (`?`) at call site.

## Sink Registry (SINK_REQUIREMENTS)

Governed sinks declare their required value state:

```typescript
const SINK_REQUIREMENTS: Map<string, SinkRequirement> = new Map([
  ["AuditLog.write",    { state: "redacted",  note: "Audit logs must not contain raw PII" }],
  ["database.write",    { state: "validated", note: "All database writes require validated data" }],
  ["network.outbound",  { state: "validated", note: "Network output must be validated" }],
  ["response.body",     { state: "safe",      note: "API responses must be safe values" }],
  ["log.write",         { state: "redacted",  note: "Log writes must not include secrets" }],
  ["ai.remoteInference",{ state: "validated", note: "AI calls must use validated inputs" }],
]);
```

Dynamic patterns (`*DB.insert`, `*DB.write`) are validated via regex but should migrate to structured registry when the package system matures.

## Diagnostic Codes

| Code | Name | Rule |
|---|---|---|
| `SPORE-VALUESTATE-001` | `UnsafeToSafeTransitionDenied` | `safe mut` without recognised gate |
| `SPORE-VALUESTATE-002` | `UnsafeConditionalUpgrade` | conditional gate (one branch has gate, other doesn't) |
| `SPORE-VALUESTATE-003` | `UnsafeValueReachedGovernedSink` | unsafe binding at governed sink |
| `SPORE-VALUESTATE-004` | `TaintedValuePropagation` | taint propagated through expression |
| `SPORE-VALUESTATE-005` | `DerivedUnsafeValueAtSink` | two-hop taint at sink |
| `SPORE-VALUESTATE-006` | `ProtectedBoundaryViolation` | protected value at non-protected sink |
| `SPORE-VALUESTATE-007` | `RedactedBoundaryViolation` | redacted value converted back |
| `SPORE-SECRET-001` | `SecretValueLogged` | SecureString in log function |
| `SPORE-SECRET-002` | `SecretComparisonDenied` | SecureString used with `==` |
| `SPORE-SECRET-003` | `SecretSerializationDenied` | SecureString in serialize/stringify |
| `SPORE-GATE-001` | `GateAnnotationRequired` | call site missing required gate for @gate flow (Phase 19+) |

## Control-Flow-Aware State (Phase 19+)

Instead of only: `safe inside this block`

Track: `safe after this validation point`, `unsafe on this branch`, `unknown after branches merge`

```galerina
if validate.email(rawEmail) {
  // SAFE here
} else {
  // UNSAFE here
}
// At merge point: UNKNOWN — require proof before governed sink
```

Implementation: value-state map with branching (`StateMap → branch → merge`). Similar to Rust NLL but simpler — no lifetimes needed.

## Protected / Redacted / Secret Boundary

```
unsafe / safe / tainted  =  value-state  (how trusted is the data)
protected / redacted / secret  =  privacy qualifier  (how sensitive is the data)
```

Both may apply to the same binding:

```galerina
unsafe let rawEmail: protected Email = request.body.email
safe mut rawEmail: protected Email = validate.email(rawEmail)?
```

Rules:
- `protected` — may be used internally; cannot cross to unprotected binding
- `redacted` — may appear in audit logs; cannot be "un-redacted"
- `secret / SecureString` — no logging, no `==`, no serialisation; approved operations only

## Audit Proof Output

The checker should emit structured evidence:

```json
{
  "flow": "createUser",
  "valueStateAudit": [
    { "binding": "rawEmail",    "state": "unsafe",    "source": "request.body.email" },
    { "binding": "rawEmail",    "state": "validated",  "gate": "validate.email",    "result": "protected Email" },
    { "sink": "AuditLog.write", "value": "rawEmail",   "permitted": true, "evidence": "redacted via gate" }
  ]
}
```

This feeds the ExecutionProofChain and supports governance audits.

## Hardware-Readiness Flags (Phase 20+)

Value-state can prove properties useful for hardware backends:

```
readonly + safe + fixed-shape Tensor  →  APU zero-copy shared memory candidate
validated Tensor<Float32, [Batch, 768]>  →  NPU tensor execution candidate
```

The value-state checker proves the state; the ExecutionPlanner decides the target. Same separation as `NodeFlags.TensorCandidate`: parser sets the flag, compiler validates compatibility.

## Compile-Time Erasure

State checks happen at compile time. The runtime does NOT need heavy wrapper objects around every value. The emitted code is just the plain value — governance proof lives in the PassiveExecutionPlan and audit chain.

## Implementation Status

| Feature | Status |
|---|---|
| State machine (unsafe → gate → safe) | ✅ Phase 6 |
| Gate prefix matching (validate.*, sanitize.*, ...) | ✅ Phase 6 |
| SPORE-VALUESTATE-001..007 | ✅ Phase 6 / 11B |
| SPORE-SECRET-001..003 | ✅ Phase 6 |
| Two-hop taint (SPORE-VALUESTATE-005) | ✅ Phase 11B.1 |
| User-defined gate prefix matching | ✅ Phase 11B.2 |
| ValueStateFlags bitset | ✅ Phase 18C |
| SINK_REQUIREMENTS structured registry | ✅ Phase 18C |
| SPORE-GATE-001 constant (reserved) | ✅ Phase 18C |
| @gate annotation support | 📋 Phase 19 |
| Control-flow-aware state tracking | 📋 Phase 19 |
| Audit proof structured output | 📋 Phase 20 |
| Hardware-readiness flags | 📋 Phase 20 |
| Arena-backed state map | ⏳ Phase 23+ |
