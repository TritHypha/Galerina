# Galerina — Broader Governance Architecture

Galerina's governance model is more than a four-stage execution pipeline. It is a
complete semantic operating model for a system — from declared intent through
to runtime evidence, with every intermediate layer made explicit, machine-readable
and enforceable.

The full pipeline:

```text
intent
    ↓
authority tracking
    ↓
capability propagation
    ↓
effect propagation
    ↓
intent verification
    ↓
governance diffing
    ↓
AI system comprehension
    ↓
compliance generation
    ↓
runtime governance
    ↓
unsafe boundary visibility
    ↓
resource flow tracking
    ↓
deployment planning
    ↓
runtime target planning
    ↓
package governance
    ↓
build-time explainability
    ↓
negative guarantees
    ↓
runtime evidence correlation
    ↓
AI context compression
    ↓
threat modelling
    ↓
architectural visualization
    ↓
governed execution plan
    ↓
coordinated compute
    ↓
audit proof
```

The first and last stages each have their own specification documents. This
document covers the full pipeline and all intermediate stages in detail.

**Related documents:**
- [galerina-concept-intent.md](galerina-concept-intent.md)
- [galerina-concept-governed-execution-plan.md](galerina-concept-governed-execution-plan.md)
- [galerina-concept-coordinated-compute.md](galerina-concept-coordinated-compute.md)
- [galerina-concept-audit-proof.md](galerina-concept-audit-proof.md)
- [galerina-intent-graph.md](galerina-intent-graph.md)

---

## The Deepest Goal

The intent graph — and the governance architecture built around it — should
become the **semantic operating model of the application**. Not merely:

```text
syntax tree
dependency graph
call graph
```

But:

```text
machine-readable system meaning
```

Traditional compilers build:
```text
functions    calls    types
```

Galerina builds:
```text
purpose    authority    effects    resources
security   runtime behavior    deployment semantics    AI semantics
```

That is why the governance architecture is foundational, not an add-on.

---

## 1. Intent

Intent is the explicit declaration of what a flow or system is *for*: its
purpose, the authority it requires, the effects it may produce, the boundaries
it must respect, and the outcomes it intends to deliver.

```galerina
intent CreateOrder {
  purpose "Create a customer order after payment is authorised"

  requires [database.write, payment.charge, audit.write]
  denies   [filesystem.write, process.spawn, network.unlisted]
  produces [OrderCreated]
}
```

Intent is machine-readable, compiler-visible, and enforceable. It is not
documentation — it is the semantic entry point for everything else in this
pipeline.

**Full specification:** [galerina-concept-intent.md](galerina-concept-intent.md)

---

## 2. Authority Tracking

Authority tracking maps what authority enters the system and where it flows.

The intent graph answers questions like:

```text
Where does payment authority exist?
Which flows can charge a card?
Which code paths have access to admin capabilities?
```

Example — tracking where `payment.refund` authority propagates:

```text
processRefund
  ├─ network.external
  ├─ payment.refund
  ├─ secret.read
```

The compiler and runtime can then ask:

```text
Has any flow acquired payment authority without declaring it?
Has any untrusted caller been granted refund capability?
```

Authority tracking makes the authority surface of the system explicit and
queryable — not hidden in conventions or runtime config.

---

## 3. Capability Propagation

Capability propagation tracks how authority moves through the system: through
imported packages, transitive call chains, flow inheritance and runtime escalation.

```text
API Gateway
    ↓  grants request context
OrderService
    ↓  calls
StripeAdapter
    ↓  uses
payment.charge capability
```

The capability graph understands:

```text
imported package authority    — what does @galerina/payments bring in?
transitive authority          — what does calling chargePayment imply?
flow inheritance              — does a caller inherit a callee's capabilities?
runtime escalation            — is capability acquired at runtime vs compile-time?
```

This prevents hidden capability creep — authority does not silently expand
because a package was added or a call chain grew deeper.

---

## 4. Effect Propagation

Effect propagation tracks the full transitive closure of what the system does:

```text
database.write
network.external
filesystem.read
ai.inference
audit.write
```

tracked across:

```text
flows          — direct effects declared on each flow
packages       — effects imported from dependencies
runtime boundaries  — effects that cross trust zones
```

A `pure flow` calling an effectful helper is a compile error — the effect
propagation analysis catches it. A secure flow that transitively acquires
`network.external` through a chain of calls must declare it — otherwise the
checker emits `SPORE-EFFECT-002`.

Effect propagation makes the effect surface of the system queryable:

```text
Which endpoints write to the database?
Which flows make outbound network calls?
Which jobs touch the filesystem?
```

---

## 5. Intent Verification

Intent verification compares what the system *declared* it would do against what
it *actually* does:

```galerina
intent ReadOnlyAnalytics {
  denies [database.write]
}
```

If the implementation performs `database.insert(...)`:

```text
SPORE-INTENT-001: Flow violates declared intent.
  declared:  denies [database.write]
  actual:    database.write detected in analyticsFlow
```

Intent verification closes the gap between stated purpose and implementation
reality. Without it, intent declarations are documentation. With it, they are
enforceable contracts.

Intent verification runs at:
- compile time (static analysis against AST)
- CI time (governance diff between builds)
- runtime (policy enforcement against the governed execution plan)

---

## 6. Governance Diffing

Governance diffing compares the *semantic state* of the system between commits
or builds — not just the source diff, but the meaning diff:

```text
Governance diff (v1.4 → v1.5):

Added:
  network.external

Removed:
  filesystem.read

Expanded:
  payment.refund authority

New secret access:
  ANALYTICS_API_KEY
```

A source diff shows lines changed. A governance diff shows:

```text
What changed semantically?
Did authority expand?
Did new effects appear?
Did boundaries shift?
Did new unsafe code enter?
```

This is the CI governance gate. Any governance diff that expands authority,
adds unsafe code, or crosses a new boundary requires explicit approval — not
just a passing test suite.

**Related:** [galerina-governance-diff-ci.md](galerina-governance-diff-ci.md)

---

## 7. AI System Comprehension

AI tools usually struggle with large codebases because they must infer
architecture, authority and semantics from code patterns.

Galerina changes this. Instead of giving AI 500,000 lines of source:

```text
give AI:    intent graph + effect graph + capability graph
```

The intent graph exposes:

```text
purpose              — what each flow and system is for
flow relationships   — which flows call which
security boundaries  — where trust changes
resource ownership   — what each component controls
runtime behavior     — what actually happens at execution
```

An AI tool can answer questions like:

```text
Which flows can charge a card?
What does this service expose externally?
What authority does this package introduce?
Which code paths touch customer PII?
```

from the intent graph, without reading every line of source.

This is a structural advantage that compounds as the codebase grows — AI
comprehension quality does not degrade as the system scales.

---

## 8. Compliance Generation

The intent graph generates compliance artefacts directly:

```text
This system:
- processes payments (payment.charge declared in N flows)
- stores customer orders (database.write to OrdersDB)
- accesses Stripe (network.external to api.stripe.com)
- does not access filesystem (filesystem.* absent from all intent declarations)
- does not spawn subprocesses (process.spawn denied in all execution plans)
```

Compliance reports can be automatically derived from:
- declared intent blocks
- effect graphs
- capability graphs
- governed execution plans
- audit proofs

Use cases:
- SOC 2 control mapping
- GDPR data flow documentation
- security review inputs
- architecture review artefacts
- deployment approvals

The key insight: compliance is derived from the code's declared semantics, not
from a separate audit exercise that must be kept in sync manually.

---

## 9. Runtime Governance

Runtime governance extends the compiler's authority enforcement into the running
system. The governed execution plan becomes a runtime policy that the execution
environment enforces:

```yaml
denied:
  - process.spawn
  - filesystem.write
  - outbound.unlisted
```

If any denied operation is attempted at runtime:

```text
SPORE-RUNTIME-001: Execution violates governed execution plan.
  denied: process.spawn
  status: rejected
```

Runtime governance also includes:
- capability checks gating sensitive operations
- secret redaction applied automatically in scope
- memory arena scoping for request isolation
- effect verification at execution points
- resource quota enforcement

Intent that is enforced only at compile time is still valuable. Intent that is
enforced at both compile time *and* runtime is a genuine security boundary.

---

## 10. Unsafe Boundary Visibility

Every unsafe boundary in the system is made explicit and tracked in the intent
graph:

```text
unsafe native calls     — FFI, C interop, direct memory
GPU/NPU kernels         — accelerator backends
unsafe flows            — blocks requiring reason + fallback
foreign runtimes        — WASM boundaries, native extensions
```

Example — a fraud model using a native TensorRT backend:

```text
FraudModel
   ↓
unsafe native TensorRT backend
```

The intent graph records this edge. CI can query:

```text
Which flows cross an unsafe boundary?
What new unsafe code entered in this build?
Which unsafe calls lack required sandboxing?
```

Without this visibility, unsafe code is invisible to governance tooling.
With it, every unsafe boundary is a tracked, reviewable, auditable entry in
the system's semantic map.

---

## 11. Resource Flow Tracking

Resource flow tracking maps which components in the system touch which
resources:

```text
OrderService
  ├─ OrdersDB        (database.write)
  ├─ AuditQueue      (queue.publish)
  ├─ StripeAPI       (network.external)
  └─ SecretVault     (secret.read → STRIPE_SECRET_KEY)
```

Resources tracked:
```text
databases        message queues     files
vaults           network endpoints  accelerators
memory arenas    AI model stores
```

Resource flow tracking enables:

- **Secret usage mapping** — which flows can access `STRIPE_SECRET_KEY`? Which
  code paths expose customer PII?
- **Data flow documentation** — where does customer data flow in the system?
- **Resource dependency analysis** — which components must be running for this
  flow to succeed?
- **Blast radius estimation** — if `OrdersDB` fails, which flows are affected?

---

## 12. Deployment Planning

The intent graph informs deployment decisions by exposing what each flow
actually requires to run:

```text
This flow requires:
- NPU (quantized inference)
- secure memory arena
- vault access to STRIPE_SECRET_KEY
- network egress to api.stripe.com
```

Deployment planning uses this to:
- determine required capabilities on the target runtime
- identify hardware requirements (does this service need NPU access?)
- plan fallback behavior (what happens when NPU is unavailable?)
- estimate deployment risk (does this change expand the attack surface?)
- generate infrastructure requirements automatically from source

---

## 13. Runtime Target Planning

Runtime target planning extends deployment planning to the specific compute
hardware the system will run on:

```text
CPU    — x86-64, ARM, RISC-V
GPU    — NVIDIA CUDA, AMD ROCm, Intel Arc
NPU    — Intel NPU, Qualcomm Hexagon, Apple Neural Engine
APU    — AMD/Intel integrated silicon
WASM   — browser, edge, serverless
```

The intent graph understands each flow's compute requirements:

```text
operator compatibility    — is this operator supported on the target?
memory requirements       — does this flow fit within target memory limits?
precision policy          — what quantization is required?
fallback paths            — what is the legal fallback if the preferred target is unavailable?
```

This allows the compiler and runtime to make *governed* target selection
decisions — not just "what is fastest" but "what is legal within declared policy".

---

## 14. Package Governance

Package governance tracks the authority surface introduced by each dependency:

```text
@galerina/payments
  ├─ network.external
  ├─ secret.read
  └─ payment.charge

@galerina/analytics
  ├─ database.read
  └─ ai.inference
```

Package governance enables:

- **Transitive effect analysis** — what effects does adding this package bring in?
- **Supply-chain provenance** — where did this authority come from?
- **Unsafe dependency tracking** — does this package introduce native code?
- **Authority creep detection** — did a package upgrade silently expand the authority surface?

Every dependency addition is a potential governance change. Package governance
makes that change visible, reviewable and governable.

---

## 15. Build-Time Explainability

Build-time explainability turns the intent graph into a queryable knowledge base
about the system:

```bash
galerina explain processRefund
```

```text
Intent:
  Process customer refunds

Effects:
  database.write
  network.external

Capabilities:
  payment.refund

Resources:
  StripeAPI
  OrdersDB

Secrets:
  STRIPE_SECRET_KEY
```

Any flow, any component, any boundary in the system can be explained in
structured terms. This answers the most important question in software
maintenance:

```text
What does this system actually do?
```

Not from documentation that may be stale — from the live semantic model derived
directly from source.

Build-time explainability is also the foundation for AI tool assistance,
architecture review, onboarding documentation and compliance reporting.

---

## 16. Negative Guarantees

Negative guarantees are one of the rarest and most valuable things in software
governance: the ability to prove what a system *cannot* do.

```text
Denied:
  filesystem.write
  process.spawn
  arbitrary outbound network
```

Traditional systems can tell you what they *do*. Very few can tell you what
they *don't do* — and prove it.

Galerina's negative guarantees come from:
- `denies [...]` declarations in intent blocks
- `denied: [...]` entries in governed execution plans
- `pure flow` enforcement (no effects at all)
- runtime policy enforcement confirming denials at execution time
- audit proof recording that denied boundaries were not crossed

A system that can prove it *cannot* write to the filesystem is fundamentally
easier to trust than one that simply has no code that currently does so.

---

## 17. Runtime Evidence Correlation

Runtime evidence correlation connects what happens during execution back to the
semantic model:

```text
Runtime event:
  payment.refund executed at 14:32:07Z
  executionId: 7fa2f8b3

Intent graph node:
  flow: processRefund
  capability: payment.refund
  resource: StripeAPI

Governed execution plan:
  capabilities verified: payment.refund
  denied effects triggered: none
```

This unification means that:

```text
runtime    build    source    governance
```

all become one coherent, queryable record — not four separate systems that must
be reconciled manually.

Runtime evidence correlation enables:
- drift detection (does runtime behavior match the declared intent graph?)
- incident investigation (which governed flow triggered this event?)
- compliance evidence (structured proof of what executed and under what authority)
- anomaly detection (a flow executed an effect it did not declare)

---

## 18. AI Context Compression

AI context compression addresses a fundamental scaling problem: AI tools have
limited context windows, and large codebases quickly exceed them.

The intent graph is the solution. Instead of providing AI with source code:

```text
Give AI:    intent graph (compact, structured, semantic)
Not:        500,000 lines of source code
```

The intent graph is:
- **compact** — a structured summary of the system, not the implementation
- **structured** — queryable nodes and edges, not freeform text
- **semantic** — expresses meaning (purpose, authority, effects) not just syntax

An AI assistant equipped with the intent graph can answer questions about the
entire system within a single context window — something impossible with raw
source, however well-organized.

This is a compounding advantage: as the codebase grows, the intent graph grows
proportionally, but the semantic density stays high. AI comprehension quality
does not degrade at scale.

---

## 19. Threat Modelling

The intent graph enables automatic threat model derivation:

```text
External attack surfaces:
  POST /orders (unauthenticated HTTP input)
  Webhook /webhooks/payment (HMAC-verified)

Secret exposure paths:
  chargePayment → STRIPE_SECRET_KEY → network.external → api.stripe.com

Unsafe boundaries:
  tensorRtInference → native TensorRT (sandboxed)

Authority escalation paths:
  CustomerService → AdminService: payment.refund capability transferred?

Tainted input paths:
  request.rawBody (unsafe let) → json.decode → CreateOrderRequest (validated)
  request.rawBody (unsafe let) → ??? → sql query (possible injection if undeclared)
```

Traditional threat modelling is a manual exercise, typically performed once and
then gradually becomes stale. Galerina's threat model is derived from the live
semantic graph — it stays current as the code changes.

Threat modelling output:
- attack surface inventory (all external entry points with their declared trust levels)
- secret exposure analysis (which secrets flow where)
- unsafe boundary inventory (all native/FFI code, sandboxing status)
- capability escalation analysis (which calls expand authority)
- tainted input analysis (tracking `unsafe let` through to validated types)

---

## 20. Architectural Visualization

The intent graph is a first-class data structure for rendering architecture
diagrams:

```text
Service graphs        — which services call which
Authority graphs      — where capabilities flow
Resource graphs       — which components touch which data stores
Trust boundary maps   — where trust levels change
Deployment maps       — what runs where, with what hardware requirements
Effect graphs         — what operations propagate where
```

These visualizations are derived directly from source — not maintained
separately as architecture diagrams that drift from reality over time.

A governance diff between builds can produce a *diff of the visualization* —
showing not just what code changed, but how the architecture changed:

```text
New edge:    OrderService → AnalyticsService (data.share)
Removed:     OrderService → LegacyDB (database.write)
New boundary: AnalyticsService → external AI provider (network.external)
```

---

## 21. Governed Execution Plan

The governed execution plan is the compiler/runtime-generated operational
contract that defines how execution is *permitted* to occur. It is the bridge
between the semantic governance layers above and actual runtime execution below.

**Full specification:** [galerina-concept-governed-execution-plan.md](galerina-concept-governed-execution-plan.md)

---

## 22. Coordinated Compute

Coordinated compute is the runtime orchestration layer that transforms a
governed execution plan into actual execution across CPU, GPU, NPU, APU, WASM,
native and future targets — safely, verifiably, within declared authority.

**Full specification:** [galerina-concept-coordinated-compute.md](galerina-concept-coordinated-compute.md)

---

## 23. Audit Proof

Audit proof is the structured, verifiable runtime evidence that execution
occurred within declared authority, respected governance policy, enforced
runtime constraints and satisfied safety guarantees.

**Full specification:** [galerina-concept-audit-proof.md](galerina-concept-audit-proof.md)

---

## How the Pipeline Connects

Each stage feeds the next:

| Stage | Produces | Consumed by |
|---|---|---|
| Intent | Declared purpose + authority | Authority tracking, intent verification, all downstream |
| Authority tracking | Authority graph | Capability propagation, threat modelling |
| Capability propagation | Transitive capability map | Intent verification, runtime governance |
| Effect propagation | Transitive effect map | Intent verification, compliance generation |
| Intent verification | Verified/violated intents | Governance diffing, CI gate |
| Governance diffing | Semantic change report | CI approval, compliance, visualization |
| AI system comprehension | Queryable semantic model | Build explainability, AI context compression |
| Compliance generation | Compliance artefacts | Deployment approval, SOC2, review |
| Runtime governance | Runtime policy | Coordinated compute, audit proof |
| Unsafe boundary visibility | Unsafe boundary inventory | Threat modelling, deployment planning |
| Resource flow tracking | Resource + secret graph | Threat modelling, compliance, deployment |
| Deployment planning | Infrastructure requirements | Runtime target planning |
| Runtime target planning | Target selection policy | Coordinated compute |
| Package governance | Dependency authority map | Authority tracking, intent verification |
| Build-time explainability | Queryable system description | AI comprehension, onboarding |
| Negative guarantees | Provable denials | Audit proof, compliance, runtime governance |
| Runtime evidence correlation | Unified runtime record | Audit proof, drift detection |
| AI context compression | Compact semantic index | AI tooling, context-efficient queries |
| Threat modelling | Attack surface model | Security review, deployment approval |
| Architectural visualization | Live architecture diagrams | Review, onboarding, compliance |
| Governed execution plan | Runtime operational contract | Coordinated compute |
| Coordinated compute | Runtime evidence | Audit proof |
| Audit proof | Verifiable execution evidence | Compliance, CI, security review |

---

## What Makes This Different

Most systems ask: *did execution succeed?*

Galerina asks:

```text
Was execution legitimate?         → intent verification
Was it authorized?                → authority tracking + capability propagation
Was governance respected?         → runtime governance + governed execution plan
Were runtime guarantees enforced? → coordinated compute
Can this be proven?               → audit proof
What changed semantically?        → governance diffing
What does the system actually do? → build-time explainability
What can it provably NOT do?      → negative guarantees
```

That is the key distinction between a language that describes computation and
one that governs it.

---

## Implementation Status

The governance architecture is designed as a whole, but implemented in phases:

| Stage | Status |
|---|---|
| Intent (declaration syntax, `intent` keyword) | ✅ v1 syntax defined |
| Intent verification (`SPORE-INTENT-001..005`) | ✅ Phase 3 scanner-level |
| Authority tracking, capability propagation | ⬜ Phase 5 (type + effect checker) |
| Effect propagation (`SPORE-EFFECT-*`) | ⬜ Phase 5 |
| Governance diffing | ⬜ Phase 6+ |
| AI system comprehension, context compression | ⬜ Phase 6 (real graph output) |
| Compliance generation | ⬜ Post-v1 |
| Runtime governance | ⬜ Phase 6 (runtime) |
| Unsafe boundary visibility | ✅ Phase 3 (`SPORE-RAWPTR-001`, `SPORE-MEMORY-008`) |
| Resource flow tracking, secret mapping | ⬜ Phase 5+ |
| Deployment + runtime target planning | ⬜ Post-v1 |
| Package governance | ⬜ Post-v1 |
| Build-time explainability | ⬜ Phase 6 (with real intent graph) |
| Negative guarantees (syntax) | ✅ Phase 3 (enforced in scanner) |
| Runtime evidence correlation | ⬜ Phase 6 |
| Threat modelling | ⬜ Post-v1 |
| Architectural visualization | ⬜ Post-v1 |
| Governed execution plan | ⬜ Phase 6 |
| Coordinated compute | ⬜ Phase 6+ |
| Audit proof | ⬜ Phase 6+ |
