# Galerina — Separate Logical Planning From Target Emission

**Status:** Phase 13 — Core architecture principle

## TL;DR

- Galerina should never think "how do I generate JavaScript?" until after "what does this software mean?"
- Clean separation: understand → verify → plan → emit → execute → prove
- This allows CPU/GPU/NPU/WASM/Photonic/Quantum without changing the language

---

## Core Principle

The most important architectural rule in the Galerina compiler:

```text
Never ask "how do I generate JavaScript?"
before asking "what does this software mean?"
```

A compiler that asks the generation question first couples its understanding of software
to its first output target. Every new target then requires re-understanding the software
from scratch, or building awkward bridges between the original understanding and the new one.

Galerina separates these two concerns completely:

```text
Understanding — what does this software mean?
Emission      — how do I express that meaning for this target?
```

Understanding happens once. Emission happens as many times as needed, for as many targets
as needed, without revisiting the understanding.

---

## Traditional Architecture — The Problem

Most compilers follow this shape:

```text
Source
  -> Parser -> AST
  -> Code Generator
  -> Target Output
```

The code generator knows about the target from the beginning. Adding a second target
means either duplicating the code generator or writing conversion passes between them.

Adding a third target multiplies the problem again. Every target is tightly coupled to
every other through shared assumptions about what the code generator expects.

The result:

```text
changing the source language requires changing all code generators
adding a new target requires understanding all existing targets
hardware targets become entangled with language semantics
governance has nowhere to sit between understanding and emission
```

---

## Galerina Architecture

Galerina inserts several distinct layers between source and emission:

```text
Galerina Source
  -> Parser -> AST                     (Source Understanding)
  -> Type Checker -> Typed AST         (Type Understanding)
  -> Semantic Analyser -> SemanticGraph (Semantic Understanding)
  -> Governance Layer -> GIR           (Governance Understanding)
  -> Passive Execution Plan            (GIR — what to do, not how)
  -> Target Emitter -> Runtime         (Emission — how to express it)
```

Each layer has a single, bounded responsibility. No layer reaches backwards or forwards
to influence layers it does not own.

---

## The Six Layers

### Layer 1 — Source Understanding

```text
Input:  Galerina source text
Output: Abstract Syntax Tree (AST)

Responsibility: parse text into structure
Does not know: what the code means, what types exist, what hardware will run it
```

### Layer 2 — Type Understanding

```text
Input:  AST
Output: Typed AST

Responsibility: resolve types, check type safety, infer types where declared
Does not know: what the code does, what effects it has, what hardware will run it
```

### Layer 3 — Semantic Understanding

```text
Input:  Typed AST
Output: SemanticGraph

Responsibility: understand what the code means as a connected semantic structure
Does not know: what capabilities are approved, what hardware will run it
```

### Layer 4 — Governance Understanding

```text
Input:  SemanticGraph
Output: GIR (Governed IR)

Responsibility: prove capabilities, effects, privacy, data flow, authority
Does not know: what hardware will run it, what output format will be produced
```

### Layer 5 — GIR / Passive Execution Plan

```text
Input:  GIR
Output: Passive Execution Plan

Responsibility: express what should happen, in what order, with what resources
Does not know: which hardware will execute it, which language will express it
```

### Layer 6 — Target Emission

```text
Input:  Passive Execution Plan
Output: Target-specific artefact (JavaScript, WASM, native binary, GPU plan, etc.)

Responsibility: translate the proven, planned intent into the target format
Does not revisit: type checking, semantic understanding, governance proofs
```

---

## The Critical Separation

After Layer 5, this statement is true:

```text
The compiler has fully understood the software.
It knows what it means.
It knows what it does.
It knows what it is allowed to do.
It knows what it is not allowed to do.
It knows what it needs.
It knows in what order things must happen.

Only now should emission begin.
```

This is the critical separation. Everything before this line is understanding.
Everything after this line is expression.

---

## Target Emission

Emitters are consumers of the Passive Execution Plan. They do not re-understand the source.
They translate an already-understood, already-verified, already-planned structure into
a target representation.

Emitters available now or planned:

```text
JavaScript Emitter  -> JavaScript (Node.js, browser)
WASM Emitter        -> WebAssembly (browser, edge, sandbox)
LLVM Emitter        -> Native binary (server, CLI)
GPU Plan Emitter    -> GPU compute graph
NPU Plan Emitter    -> NPU inference graph
Photonic Emitter    -> Photonic compute plan (future)
Quantum Emitter     -> Quantum circuit plan (future)
```

Each emitter is independent. Adding a new emitter requires understanding only the Passive
Execution Plan format. It does not require understanding the Galerina language, the type
system, or the governance model.

---

## Multiple Targets From One Plan

The same business logic produces multiple targets without duplication:

```galerina
fn classifyTicket(ticket: SupportTicket): RiskLevel {
  let embedding = embed(ticket.description)
  return model.classify(embedding)
}
```

This produces one SemanticGraph, one GIR, one Passive Execution Plan.

From that single plan, emitters produce:

```text
JS Emitter      -> classifyTicket.js          (Node.js server)
WASM Emitter    -> classifyTicket.wasm        (browser or sandbox)
GPU Plan        -> classifyTicket.gpuplan     (GPU cluster)
NPU Plan        -> classifyTicket.npuplan     (edge NPU device)
Photonic Plan   -> classifyTicket.photoplan   (future optical accelerator)
```

The business logic did not change. The governance proofs did not change. The types did not change.
Only the expression of the plan changed.

---

## Business Logic Example

```galerina
fn classifyTicket(ticket: SupportTicket): RiskLevel {
  requires capability.ai.classify
  effects: [ai.inference]
  data: ticket is private

  let embedding: Tensor<Float32, [768]> = embed(ticket.description)
  return model.classify(embedding)
}
```

Compiler understanding phase produces:

```yaml
semantic_node: classifyTicket
input_type: SupportTicket
output_type: RiskLevel
required_capabilities: [capability.ai.classify]
effects: [ai.inference]
data_sensitivity: private
tensor_shape: [768]
compute_affinity:
  npu: high
  gpu: high
  cpu: low
```

Only at emission time does target selection occur:

```text
Emitter reads compute_affinity: npu high
Runtime reports npu available and approved
NPU Plan Emitter selected
Execution plan emitted for NPU
```

If NPU is unavailable, GPU Plan Emitter is selected automatically. The source did not change.

---

## Why This Enables Future Hardware

Without separation:

```text
Adding photonic compute -> rewrite the compiler to understand photonic
Adding quantum compute  -> rewrite the compiler to understand quantum
Every new target        -> risks breaking existing targets
```

With separation:

```text
Adding photonic compute -> add Photonic Emitter that reads Passive Plans
Adding quantum compute  -> add Quantum Emitter that reads Passive Plans
Every new target        -> isolated, cannot break existing targets
```

The Passive Execution Plan is the stable interface. Emitters plug into it.

---

## Photonic Example

Photonic compute accelerates matrix multiplication using light.

The source code for embedding-based classification does not change.
The SemanticGraph does not change. The GIR does not change. The Passive Plan does not change.

A Photonic Emitter reads:

```yaml
operation: matrix_multiply
input_shape: [1, 768]
weight_shape: [768, 512]
precision: float32
compute_affinity:
  photonic: high
  npu: high
  gpu: high
```

And produces a photonic circuit plan that the optical accelerator executes.

The developer wrote `embed(ticket.description)`. They did not write photonic instructions.

---

## Quantum Example

Quantum compute suits combinatorial optimisation problems.

```galerina
fn optimiseRoutes(routes: Array<Route>, constraints: RoutingConstraints): OptimalPlan {
  requires capability.compute.quantum
  effects: [compute.optimise]
}
```

The Passive Plan describes:

```yaml
operation: combinatorial_optimise
problem_class: routing
input_size: dynamic
compute_affinity:
  quantum: high
  cpu: low (exponential classical cost)
```

A Quantum Emitter translates this into a quantum circuit plan.
The developer did not write qubit operations. The governance layer already approved
`capability.compute.quantum` before emission began.

---

## Security Benefits

Because emission occurs after governance:

```text
Emitters cannot bypass effect declarations
Emitters cannot bypass capability proofs
Emitters cannot bypass privacy constraints
Emitters cannot introduce new data flows
Emitters cannot grant authorities the source did not declare
```

A malicious or buggy emitter cannot produce code that exceeds the authority already proven
in the GIR. The proof is upstream of emission.

---

## Audit Benefits

Audits target the SemanticGraph, GIR, and Passive Plan — not the generated JavaScript.

```text
Generated JavaScript changes when the JavaScript emitter changes
SemanticGraph is stable as long as the source is stable
GIR is stable as long as governance policy is stable
Passive Plan is stable as long as intent is stable
```

Auditing the Passive Plan gives target-independent, deterministic, version-stable evidence
of what the software does and what it is allowed to do.

---

## Deterministic Verification Hash Chain

```text
Source hash
  -> AST hash
  -> Typed AST hash
  -> SemanticGraph hash
  -> GIR hash
  -> Passive Plan hash
  -> Emitter version + target
  -> Emitted artefact hash
```

Any change at any stage invalidates all downstream hashes. Verifiers can confirm that a
given artefact was produced from a specific source through a specific governance-verified
plan. This chain is target-independent up to the final step.

---

## Relationship to Existing Concepts

| Concept | Relationship |
|---|---|
| Hardware as Capabilities | Hardware selection happens inside the Emitter stage, after planning is complete |
| Metadata Erasure | Governance metadata is stripped during emission; proofs are in attestation not artefacts |
| Passive Plans | Passive Plans are the output of the planning stage and the input to all emitters |

---

## Compiler Philosophy

Traditional compiler philosophy:

```text
Parse -> Generate -> Run
```

Galerina compiler philosophy:

```text
Understand -> Verify -> Plan -> Emit -> Execute -> Prove
```

The traditional model asks "how do I run this?" as soon as parsing completes.
The Galerina model asks "what does this mean and is it allowed?" before asking "how do I express it?".

This is not a performance concern. It is a correctness and governance concern.
Understanding must precede expression.

---

## Long-Term Vision

Galerina is not a JavaScript generator that happens to have a type system.

Galerina is a governed software planning system that can express its plans in any target
language or hardware format, because understanding and expression are cleanly separated.

```text
The source language describes intent.
The governance layer proves constraints.
The plan describes execution.
The emitter expresses the plan.
The target executes the expression.
The proof verifies all of the above.
```

This structure can accommodate hardware that does not yet exist, because new hardware
only requires a new emitter — not a new language, not a new type system, not a new
governance model.

---

## Final Principle

```text
Understand first.
Execute second.
```

---

## Rules at a Glance

- Understanding layers MUST complete before any emission begins
- Emitters MUST consume Passive Plans, not source code or ASTs
- Emitters MUST NOT re-perform type checking, semantic analysis, or governance proofs
- Emitters MUST NOT introduce capabilities, effects, or authorities not present in the GIR
- Adding a new target MUST NOT require changes to understanding layers
- Audit evidence MUST be derived from SemanticGraph/GIR/Plan, not from emitted artefacts
- The hash chain MUST link source to plan to artefact without gaps

---

## See Also

- [Hardware as Governed Capabilities](galerina-hardware-as-capabilities.md)
- [Governed Memory Boundaries and APU Memory Sharing](galerina-governed-apu-memory.md)
- [AI and Linear Algebra Accelerator Support](ai-linear-algebra-accelerator-support.md)
- [Passive Execution Plans](galerina-passive-execution-plans.md)
- [Metadata Erasure](galerina-metadata-erasure.md)
- [Static Capability Proofs](galerina-static-capability-proofs.md)
- [Runtime Reports](galerina-passive-execution-plans.md#runtime-reports)
