# LogicN — Developer Tooling: Test Generation, Capability Warnings, Constraint Signatures

## Overview

Three tightly related developer tooling features that together make LogicN comprehensible to both
human developers and AI tools:

1. **Intent-Driven Test Skeleton Generation** — `logicn gen-tests` produces typed test
   scaffolding from API contracts and flow signatures *(shipping command is `gen-tests`, stdout/TAP;
   the `generate tests --out` file-emission form below is PLANNED — see R&D 0119/0016)*
2. **Cross-Package Capability Inheritance Warnings** — import-time visibility of transitive authority
   before code compiles
3. **Constraint-Complete Callable Signatures** — every public flow exposes effects, capabilities,
   resources, secrets and errors in a machine-readable contract

---

## Part 1: Intent-Driven Test Skeleton Generation

### Problem

Without test generation, developers must read governance documents to understand what tests a
flow requires. Test coverage of effect mocks, capability-denial paths and boundary conditions
is typically incomplete or missing.

### Command

```bash
# SHIPPING today (stdout / TAP):
logicn gen-tests api-orders.lln
logicn gen-tests api-orders.lln --tap
# PLANNED (file-emission + --out; not yet built — R&D 0119/0016):
logicn generate tests api-orders.lln --out tests/generated/
```

### Generated Skeleton

For a flow declared as:

```logicn
secure flow createOrder(input: CreateOrderRequest)
  -> Result<CreateOrderResponse, ApiError>
effects [database.write, payment.charge]
capabilities [orders.create, payments.charge]
```

The generator produces:

```logicn
// [generated] test skeleton for createOrder
// Review and implement each test.

test "createOrder: valid input returns Ok" {
    let input: CreateOrderRequest = TODO("construct valid input")
    let result = createOrder(input)
    assert result is Ok
}

test "createOrder: database.write failure" {
    mock database.write { return Err(DatabaseError.Unavailable) }
    let input: CreateOrderRequest = TODO("construct valid input")
    let result = createOrder(input)
    assert result is Err
}

test "createOrder: missing capability orders.create" {
    // Capability denial test
    without capability orders.create {
        let input: CreateOrderRequest = TODO("construct valid input")
        let result = createOrder(input)
        assert result is Err(CapabilityError.Missing)
    }
}
```

### Effect Mocks

Effect mocks are auto-generated from the declared effects:

```logicn
// [generated] effect mocks for tests
mock database.write { ... }
mock database.read  { ... }
mock payment.charge { ... }
```

The developer fills in behavior; the scaffold is ready.

### Capability-Denial Tests

For every declared capability, the generator creates a test that asserts the flow refuses
to execute without that capability. This ensures capability enforcement is not only declared
but actually tested.

### Safe Non-Overwrite

- Generated test files are marked with `[generated]` headers
- The generator will not overwrite tests that the developer has implemented
- Developer-written tests interleave safely with generated ones
- The generator uses `// TODO` markers to mark required manual work

### Required AST Additions

```text
TestSkeleton
EffectMock
CapabilityDenialTest
GeneratedTestBlock
```

### Diagnostics

| Code | Meaning |
|---|---|
| `LLN-GEN-TEST-001` | No public API or flow contracts found for test generation |
| `LLN-GEN-TEST-002` | Generated test references missing type |
| `LLN-GEN-TEST-003` | Effect mock type mismatch |
| `LLN-GEN-TEST-004` | Capability not grantable in test context |
| `LLN-GEN-TEST-005` | Generated test file would overwrite developer changes |
| `LLN-GEN-TEST-006` | Flow has no declared effects — no mocks generated |
| `LLN-GEN-TEST-007` | Boundary test missing for declared external boundary |

---

## Part 2: Cross-Package Capability Inheritance Warnings

### Problem

When a developer imports a package entry point, the compiler should immediately surface what
authority that import requires — not only at call sites, and not only after a build scan.

Without import-time warnings:

```logicn
import { charge } from "@logicn/payments"
// No warning. The developer doesn't know this requires payment.charge.
```

### Import-Time Warning

```logicn
import { charge } from "@logicn/payments/charge"
```

```text
Warning: LLN-CAPABILITY-IMPORT-001

Importing @logicn/payments/charge introduces:
  effects:      network.external, secret.read
  capabilities: payment.charge, payment.refund, webhook.verify
  resources:    outbound HTTPS to api.stripe.com

Your calling flow must declare or inherit these capabilities.
```

### Transitive Capability Graph

The compiler builds a graph of all capabilities transitively required across packages:

```text
@logicn/payments/charge
  → requires payment.charge
  → requires secret.read
  → requires network.external (api.stripe.com)
  → transitively requires webhook.verify
```

This is computed at import time, not only at call-site analysis.

### Export-Level Manifests

Package exports carry split authority declarations:

```json
{
  "name": "@logicn/payments",
  "exports": {
    "./types": {
      "effects": [],
      "capabilities": []
    },
    "./charge": {
      "effects": ["network.external", "secret.read"],
      "capabilities": ["payment.charge"]
    },
    "./webhook": {
      "effects": ["secret.read"],
      "capabilities": ["webhook.verify"]
    }
  }
}
```

Importing `./types` carries no authority. Importing `./charge` does.

### Install-Time Authority Review

On `logicn install`, the complete authority summary is shown before acceptance:

```bash
logicn install @logicn/payments
```

```text
Package: @logicn/payments@1.4.0

Effects:       network.external, secret.read
Capabilities:  payment.charge, payment.refund, webhook.verify
Resources:     outbound HTTPS to api.stripe.com

Accept package authority? [y/N]
```

Accepted authority is recorded in the lockfile.

### `package_capability_policy`

Projects may configure policy for capability warnings:

```logicn
package_capability_policy {
    warn_on_new_capabilities true
    block_on_unapproved_effects true
    require_review_for [network.external, secret.read]
}
```

### Diagnostics

| Code | Meaning |
|---|---|
| `LLN-CAPABILITY-IMPORT-001` | Import introduces undeclared capability |
| `LLN-CAPABILITY-IMPORT-002` | Import introduces network effect not declared in project |
| `LLN-CAPABILITY-IMPORT-003` | Import introduces secret access |
| `LLN-CAPABILITY-IMPORT-004` | Transitive dependency widens authority |
| `LLN-CAPABILITY-IMPORT-005` | Package manifest missing export-level capability declarations |
| `LLN-CAPABILITY-IMPORT-006` | Package capability changed since last review |
| `LLN-CAPABILITY-IMPORT-007` | Calling flow does not inherit required capabilities |

---

## Part 3: Constraint-Complete Callable Signatures

### Problem

A normal type signature answers:

```text
what values go in and out?
```

A LogicN signature should also answer:

```text
what authority is required?     what effects can occur?
what resources are touched?     what secrets may be read?
what boundaries may be crossed? what errors are declared?
what diagnostics can be emitted?
```

Without this, an AI tool generating a call to `createOrder()` may produce:

```logicn
flow checkout(input: CreateOrderRequest) -> Result<...>
effects [database.read] {
    return createOrder(input)  // wrong — createOrder needs database.write
}
```

### Source-Level Declaration

```logicn
secure flow createOrder(input: CreateOrderRequest)
  -> Result<CreateOrderResponse, ApiError>
effects [database.write, payment.charge]
capabilities [orders.create, payments.charge]
resources [OrdersDatabase, PaymentProvider] {
  // ...
}
```

### Machine-Readable Contract

Generated by the compiler (`logicn signatures --json`):

```json
{
  "symbol": "flow:orders.createOrder",
  "displayName": "createOrder",
  "signature": {
    "params": [{ "name": "input", "type": "CreateOrderRequest" }],
    "return": "Result<CreateOrderResponse, ApiError>"
  },
  "constraints": {
    "direct": {
      "effects": ["database.write", "payment.charge"],
      "capabilities": ["orders.create", "payments.charge"],
      "resources": ["OrdersDatabase", "PaymentProvider"],
      "secrets": ["PAYMENT_API_KEY"],
      "errors": ["ValidationError", "PaymentError", "DatabaseError"]
    },
    "transitive": {
      "effects": ["database.write", "network.external", "secret.read", "payment.charge"]
    }
  },
  "source": { "file": "api-orders.lln", "line": 12 }
}
```

### Direct vs Transitive Constraints

Direct constraints are what this flow explicitly declares. Transitive constraints include
everything reachable through callees. AI tools should consume the transitive view; call-site
validation uses effective/transitive requirements.

### Human-Facing LSP Display

Default hover:

```text
createOrder(input: CreateOrderRequest) -> Result<CreateOrderResponse, ApiError>

Requires:
  effects: database.write, payment.charge
  capabilities: orders.create, payments.charge
```

Expanded hover:

```text
Resources:  OrdersDatabase, PaymentProvider
Secrets:    PAYMENT_API_KEY
Errors:     ValidationError, PaymentError, DatabaseError
```

### Caller Checking

The compiler validates that callers declare all required constraints:

```text
LLN-CONSTRAINT-001: caller does not declare required effects

Call:            createOrder(input)
Required:        database.write, payment.charge
Declared:        database.read
Missing:         database.write, payment.charge

Suggested fix:
  effects [database.read, database.write, payment.charge]
  (review required — widens authority)
```

Authority-widening fixes are always marked `review required` and are never silent.

### Resource Requirements Inline

```logicn
flow runFraudModel(input: FraudInput)
  -> Result<FraudScore, FraudError>
effects [compute.run]
capabilities [fraud.score]
resources [
    memory.max 512mb,
    target.gpu optional,
    fallback.cpu required
]
```

This feeds deployment planning, CI governance diff, test generation, REPL execution and
runtime scheduling.

### CLI Commands

```bash
logicn signatures --json
logicn signatures createOrder --json
logicn signatures --json --out build/signatures.json
logicn graph intent --symbol createOrder
```

### Diagnostics

| Code | Meaning |
|---|---|
| `LLN-CONSTRAINT-001` | Caller does not declare required effects |
| `LLN-CONSTRAINT-002` | Caller missing required capability |
| `LLN-CONSTRAINT-003` | Caller does not handle declared error type |
| `LLN-CONSTRAINT-004` | Transitive constraint not covered by caller declaration |
| `LLN-CONSTRAINT-005` | Signature export missing from package manifest |

---

## AI Context Bundle

All three features together form the AI context bundle:

```text
build/signatures.json      — constraint-complete callable signatures
build/intent-graph.json    — semantic relationship graph
build/governance.json      — authority and policy summary
tests/generated/           — intent-driven test scaffolding
```

An AI tool that receives these artefacts can generate:

- valid call sites (constraint-complete signatures)
- correct error handling (declared errors)
- safe test cases (generated scaffolding)
- governance-compliant flows (capability/effect contracts)

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `logicn-core` | Signature syntax, constraint categories, test skeleton syntax |
| `logicn-core-compiler` | Signature resolution, transitive constraint calculation, call-site checking |
| `logicn-core-reports` | Machine-readable signature and test plan export |
| `logicn-core-security` | Capability/secret/policy metadata in signatures |
| `logicn-devtools-project-graph` | Symbol graph and AI context integration |
| `logicn-core-cli` | `logicn generate tests`, `logicn signatures` commands |
| `logicn-lsp` | Hover, autocomplete, quick-fix display for all three features |
