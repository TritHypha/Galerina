# Galerina Architecture: Adaptive Runtime Profiles

## Status

```
Proposed Architecture Direction
Differentiating concept — combines Governance + Deterministic execution +
Adaptive optimisation + Future AI hardware without an uncontrollable runtime
```

---

## TL;DR
- Adaptive runtime learns workload patterns to optimise scheduling, caching, target selection
- It may NEVER change security, effects, validation, redaction, or program meaning
- Intent guides optimisation, not permission — this is the core safety rule

---

## Executive Summary

Most runtimes are static. They execute code exactly the same way regardless
of workload. Galerina introduces a different concept:

> The runtime may learn and optimise execution patterns over time, while
> remaining completely constrained by governance, security, effects, and
> target policies.

The runtime becomes **adaptive** but never **autonomous**.

---

## Core Principle

The runtime **may** change:

```
Scheduling          Caching             Batching
Memory layout       Target selection    Pipeline structure
Threading           Resource allocation
```

The runtime **may never** change:

```
Security            Governance          Authority
Effects             Intent              Validation
Redaction           Allowed targets
```

```
Adaptive runtime = performance learning
Not             = authority learning
```

---

## Execution Model

**Traditional:**
```
Source → Compiler → Executable → Runtime
```
Runtime behaviour is mostly fixed.

**Galerina:**
```
Source → AST → Governed IR → Execution Plan → Adaptive Runtime → Execution
```
The runtime optimises execution while preserving the meaning of the program.

---

## What The Runtime Learns

```
Execution frequency     Hot paths           Tensor operations
Database access patterns  Network patterns  Request distributions
Memory pressure         Target availability
```

It builds workload profiles and adapts accordingly.

---

## Example: Web API

```galerina
route POST "/orders" {
  secure flow processOrder(...)
}
```

After observing that 95% of requests use the same route, the runtime may optimise:
connection pooling, request batching, object reuse, route caching, thread scheduling.
The code never changes.

---

## Example: AI Inference Service

```galerina
secure flow classifyMessage(...)
effects [ai.inference]
```

Runtime notices thousands of small inference requests and may optimise:
batch requests, preload models, warm tensor memory, reuse embeddings.
Same output. Lower latency. Higher throughput.

---

## What The Runtime Cannot Change

```galerina
secure flow createPatient(...)
effects [database.write, audit.write]
```

The runtime **cannot** decide audit logging is unnecessary and remove it.
The runtime **cannot** remove validation because it "seems fast enough".
The runtime **cannot** skip redaction because it is expensive.
The runtime **cannot** add, remove, or hide effects.

Governance is fixed. Effects are part of program meaning.

---

## Adaptive Runtime Configuration

```galerina
runtime adaptive {
  observe workload

  optimise [
    batching,
    caching,
    scheduling,
    memory_layout
  ]

  preserve [
    governance,
    security,
    effects,
    intent
  ]
}
```

---

## Intent as a Learning Signal

```galerina
secure flow classifyMessage(readonly request: Request) -> Result<Response, ApiError>
effects [ai.inference, audit.write]
intent "Classify inbound messages locally without remote execution" {

  runtime adaptive {
    learn from intent
    optimise [batching, model_warmup, target_selection]
    preserve [security, effects, governance]
  }

  ...
}
```

The runtime can infer from the intent:
- This is an AI inference workload
- It should warm the model and batch requests
- It may prefer NPU/GPU if allowed
- It must **not** use remote execution
- It must keep audit.write

**Rule: Intent guides optimisation, not permission.**

---

## Deterministic Mode

For regulated environments (government, healthcare, defence, banking):

```galerina
runtime deterministic
```

Guarantees identical execution planning on every deployment. This single switch
makes compliance audits straightforward — no adaptive variance to explain.

Both modes must be supported. Adaptive is default for performance environments;
deterministic is required for regulated deployments.

---

## Runtime Profile Artifact

The runtime emits a workload profile for audit and observability.

### Full schema (including anti-entropy fields)

```yaml
runtime_profile:
  workload: ai_inference
  requests: 240000
  optimisations:
    - batching
    - model_warmup
    - tensor_reuse
  governance_changes: none
  security_changes: none

  # ── Intent-Guided Optimisation (IGO) learning state ─────────────────────
  learned_preferences:
    preferred_target: gpu
    confidence: 0.92             # 0.0–1.0 — how certain the runtime is
    evidence_count: 240000       # number of observations that built this

  governance_bounds:
    denied_targets:
      - remote.execution         # governance bounds — never overridden by IGO
    max_confidence: 1.0
    audit_at_confidence: 0.8    # all selections audited once this threshold crossed

  stale_after: "2026-07-01T00:00:00Z"  # profile expires and re-learns from scratch
```

### The anti-entropy rule

Without expiry, learned preferences drift into stale or unsafe behaviour.
With expiry, the runtime must re-prove its optimisation choices under current
conditions. `stale_after` is analogous to certificate expiry — old optimisation
evidence cannot be trusted in production without re-verification.

The `audit_at_confidence` threshold ensures that highly confident preferences
(which become load-bearing assumptions) generate audit records for governance review.

See: `docs/Knowledge-Bases/galerina-intent-guided-optimisation.md`

---

## Runtime Proof

Compiler emits requirements:

```yaml
required:
  validation: true
  redaction: true
  audit: true
```

Runtime emits execution evidence:

```yaml
observed:
  validation: executed
  redaction: executed
  audit: executed
```

Together they form an end-to-end trust chain.

---

## Target Awareness

```galerina
compute target best {
  prefer [photonic, npu, gpu]
  fallback cpu
}
```

The runtime learns which target performs best for each workload and
gradually routes future executions to it — within the declared allowed targets.

---

## What This Is Not

This is **not**:
- LLM reasoning
- Agent behaviour
- Self-modifying code

The runtime learns **execution characteristics**, not **business logic**.

---

## Relationship to GIR

The Governed IR defines meaning, authority, effects, and governance.
The Adaptive Runtime operates **after** GIR is fixed.
It cannot modify GIR semantics — only how they are executed.

---

## Runtime Guardrails Summary

| May | May Never |
|---|---|
| Optimise execution | Change business logic |
| Learn workload patterns | Remove validation |
| Adjust scheduling | Skip redaction |
| Choose better targets | Grant authority |
| Batch requests | Add effects |
| Cache responses | Relax governance |
| Warm models | Expose protected data |

---

## IGO — Intent-Guided Optimisation

This document describes the Galerina adaptive runtime. The formal concept name
for this architecture is **Intent-Guided Optimisation (IGO)**.

> **Intent is a signal for optimisation, not a grant of authority.**

The internal runtime module implementing IGO may be called **GIRT** (Governed
Intent-Guided Runtime) in implementation code. Use IGO in all external docs.

Full IGO specification: `docs/Knowledge-Bases/galerina-intent-guided-optimisation.md`

---

## See Also

- `docs/Knowledge-Bases/galerina-intent-guided-optimisation.md` — full IGO specification
- `docs/Knowledge-Bases/galerina-architecture-layers.md` — five-layer separation
- `docs/Knowledge-Bases/galerina-tensor-arity-decision.md` — tensor target rules
- `docs/Knowledge-Bases/galerina-compute-target-optimisation.md` — GIR tensor metadata and hints
- `docs/Knowledge-Bases/effect-checker-and-boundary-checker.md` — effect model
- `docs/Knowledge-Bases/galerina-quantum-target-bridge.md` — quantum target extension
