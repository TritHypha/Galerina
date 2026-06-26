# Galerina — Machine-Readable Intent Graph

> **See also:** [galerina-concept-intent.md](galerina-concept-intent.md) — full specification of the `intent` concept, the semantic layers, intent verification and the intent graph's role in the governance pipeline (`intent → governed execution plan → coordinated compute → audit proof`).

## Overview

Every Galerina build emits a machine-readable intent graph as a structured artefact.

```text
nodes = flows, APIs, resources, capabilities, effects, secrets, boundaries, packages, policies, tests
edges = calls, uses_resource, requires_capability, produces_effect, crosses_boundary, reads_secret, …
```

The intent graph is the semantic map of what the application does. It complements the AST
(which describes what the code looks like) with a model of what the system does and under
what authority.

```bash
galerina build --emit-intent-graph
galerina graph intent --out build/intent-graph.json
```

---

## Why the Intent Graph Matters

Instead of asking an AI or compliance tool to infer behavior from source text, Galerina can
directly state:

```text
createOrder calls validateOrder
createOrder requires database.write
createOrder requires payment.charge
createOrder reads STRIPE_SECRET_KEY
createOrder crosses API -> external payment boundary
createOrder may emit PaymentError
createOrder produces OrderCreated event
```

That is more precise and safer than source-only analysis.

The graph can be consumed by:

```text
AI tools and vector databases
compliance and security review systems
CI governance diff
IDE / LSP features
architecture diagrams and visualization
runtime audit tools
dependency analyzers
```

---

## Example

Human-readable:

```text
API POST /orders
  handled_by -> createOrder

createOrder
  calls -> validateOrder
  calls -> chargePayment
  uses_resource -> OrdersDatabase
  requires_capability -> orders.create
  requires_capability -> payment.charge
  produces_effect -> database.write
  produces_effect -> network.external
  reads_secret -> STRIPE_SECRET_KEY
  emits_error -> ValidationError
  emits_error -> PaymentError

chargePayment
  calls_package -> stripe-adapter
  crosses_boundary -> external.payment_provider
```

Machine-readable JSON:

```json
{
  "schemaVersion": "1.0.0",
  "languageEdition": "2026.1",
  "project": {
    "name": "orders-service",
    "workspace": "galerina.workspace.json"
  },
  "build": {
    "id": "build_abc",
    "commit": "abc123",
    "profile": "production"
  },
  "nodes": [
    {
      "id": "flow:createOrder",
      "kind": "flow",
      "name": "createOrder",
      "source": { "file": "api-orders.spore", "line": 12 }
    },
    {
      "id": "capability:payment.charge",
      "kind": "capability",
      "name": "payment.charge"
    }
  ],
  "edges": [
    {
      "from": "flow:createOrder",
      "to": "capability:payment.charge",
      "kind": "requires_capability"
    },
    {
      "from": "flow:createOrder",
      "to": "effect:database.write",
      "kind": "produces_effect",
      "span": { "file": "api-orders.spore", "start": { "line": 24, "column": 1 }, "end": { "line": 24, "column": 25 } }
    }
  ],
  "indexes": {}
}
```

---

## Node Types

```text
package / module / file
flow / pure flow / secure flow
API endpoint / webhook
job / task / worker
type
resource / database / queue
secret / vault source
capability
effect
security boundary
external service
compute block / target
policy / diagnostic
test
```

Every node includes:

```text
id
kind
name
source span
package / module
visibility
stability
metadata
```

---

## Edge Types

```text
calls
handles_route / handles_webhook
uses_type
requires_capability
produces_effect
uses_resource
reads_secret
writes_resource
crosses_boundary
imports_package / depends_on
emits_error / returns_type
validates / sanitizes
taints / reveals_secret
targets_compute / fallbacks_to
owned_by_policy / covered_by_test
```

Every edge includes:

```text
from
to
kind
source span (where applicable)
direct / transitive flag
confidence / provenance
metadata
```

---

## Direct and Transitive Edges

The graph stores direct edges and optionally emits transitive summaries:

```json
{
  "from": "flow:createOrder",
  "to": "effect:network.external",
  "kind": "transitively_produces_effect",
  "via": ["flow:chargePayment"]
}
```

Consumers can derive transitive reachability, but the direct graph remains the
explainable ground truth.

---

## Source Maps

Every graph fact is source-mapped where possible:

```json
{
  "from": "flow:createOrder",
  "to": "effect:database.write",
  "kind": "produces_effect",
  "span": {
    "file": "api-orders.spore",
    "start": { "line": 24, "column": 1 },
    "end": { "line": 24, "column": 25 }
  }
}
```

This allows tools to jump from semantic fact to code location.

---

## Privacy and Redaction

The graph must never leak secret values:

```text
Safe: secret name, logical secret reference, source type, capability requirement
Unsafe: secret values, raw environment values, vault payloads, tokens, credentials
```

Omit `value` entirely from secret nodes; use the secret's logical name only.

---

## CI Governance Integration

The intent graph is the primary input for governance diff:

```bash
galerina diff main..branch
```

A governance diff compares two intent graphs:

```text
added effect
removed capability
new secret edge
new external boundary
resource budget changed
package authority changed
```

---

## AI and Compliance Uses

A vector database or AI assistant can query the intent graph to answer:

```text
which flows can charge a card?
which endpoints write to the database?
which code paths read STRIPE_SECRET_KEY?
which flows cross external network boundaries?
which package introduced payment.refund?
which flows are not covered by tests?
what changed in authority since last release?
```

A compliance tool can map:

```text
personal data flows
payment flows
secret access
external data transfers
retention resources
audit events
access control boundaries
```

Important caveat: the intent graph supports compliance review; it does not automatically
prove legal or regulatory compliance.

---

## Relationship to Runtime Evidence

Build-time graph: what the application is designed to do.
Runtime evidence: what actually happened.

```text
intent graph edge:
  createOrder produces database.write

runtime evidence:
  createOrder produced database.write 1042 times in production
```

Connecting these supports audit and drift detection.

---

## CLI Commands

```bash
galerina build --emit-intent-graph
galerina graph intent --out build/intent-graph.json
galerina graph intent --format json
galerina graph intent --format graphml
galerina graph intent --only capabilities
galerina graph intent --only secrets
galerina graph intent --flow createOrder
galerina graph intent --redact
galerina ai-context --include intent-graph
```

Output formats: JSON (primary), JSONL, GraphML, DOT, vector-index chunks.

---

## Diagnostics

| Code | Meaning |
|---|---|
| `SPORE-INTENT-GRAPH-001` | Intent graph emitted |
| `SPORE-INTENT-GRAPH-002` | Unresolved edge omitted due to type errors |
| `SPORE-INTENT-GRAPH-003` | Secret value redacted |
| `SPORE-INTENT-GRAPH-004` | Schema validation failed |
| `SPORE-INTENT-GRAPH-005` | Graph contains experimental node kind |
| `SPORE-INTENT-GRAPH-006` | Transitive summary omitted due to cycle |

---

## Architecture Placement

| Layer | Responsibility |
|---|---|
| `galerina-core` | Semantic definitions: flows, effects, capabilities, resources, boundaries |
| `galerina-core-compiler` | Graph extraction from AST, type/effect/capability analysis |
| `galerina-core-reports` | Intent graph schema, report writer, validation |
| `galerina-devtools-project-graph` | Graph visualization, indexes, AI/project context integration |
| `galerina-core-security` | Redaction, secret/resource/security metadata |
| `galerina-core-cli` | Graph/build commands and export options |
| `galerina-framework-app-kernel` | API/webhook/runtime boundary nodes |
| `galerina-core-compute` | Compute-target/resource planning nodes |
