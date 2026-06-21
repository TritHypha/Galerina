# Architecture Charter

## Purpose

The LogicN Architecture Charter defines the long-term identity of the language,
runtime and package ecosystem.

LogicN is a secure, auditable, AI-readable execution language and governed
runtime architecture.

LogicN is not designed primarily around raw speed. It is designed around:

- controlled authority
- verifiable execution
- explicit boundaries
- long-term architectural stability
- future-capable compute models
- secure governed execution

## Umbrella: Zero Trust Framework (governing security bar)

LogicN and its sibling parts sit under a project umbrella called the **Zero Trust
Framework**. This is the **top-level security standard every component must meet to warrant
the badge** — it is not a feature, it is the bar:

- **Deny by default** — nothing is permitted unless explicitly granted.
- **No ambient authority** — capabilities are passed explicitly, never globally available.
- **Least capability** — the minimum authority for the task, nothing more.
- **Fail closed** — on any uncertainty/error, refuse rather than allow.
- **Actor-aware audit** — who/what acted is always recorded.
- **Explicit data exposure** — data leaves a boundary only when declared.
- **OS/hardware treated as potentially compromised** — adaptively (posture `off|auto|on`,
  default `auto`, fail-secure; #195 / checkpoint §8.1).
- **AI proposes, compiler verifies, runtime authorizes, human/policy approves** authority.

Every new component, contract clause, and runtime path is measured against this bar.
LogicN itself remains a **TypeScript-like language using `flow` and `contract`** — the
Zero Trust Framework is the assurance standard, not a change to the language model.

## Core Philosophy

```text
Security first.
Code second.
Authority never implicit.
```

LogicN should make secure execution the default.

## Foundational Principles

## Nothing Has Authority Until Verified

Nothing is trusted by default.

This includes:

- code
- packages
- AI output
- user input
- network data
- storage data
- runtime effects
- external systems

Authority must always be:

- declared
- visible
- attributable
- revocable
- auditable

## Security First

Security rules must be:

- explicit
- enforceable
- deny-by-default
- policy-driven
- boundary-aware
- auditable

LogicN should prefer refusing unsafe execution over allowing unclear behaviour.

## Memory Security

LogicN must prevent:

- unsafe memory access
- buffer overflow
- use-after-free
- uncontrolled shared mutation
- secret leakage
- unsafe pointer exposure

Memory access must remain typed, bounded and verifiable.

## Future-Capable Memory And Compute

LogicN may support low-level memory access, but only through controlled, typed
and auditable constructs.

The architecture must work on binary systems today while preserving compatibility
for future:

- tri-state logic
- photonic compute
- optical compute
- GPU compute
- NPU compute
- accelerator architectures

LogicN must avoid assuming that all future compute is purely binary, purely
electrical, CPU-local or Von Neumann style.

### The Bifurcated Execution Invariant (Hardware Parity)

> **Unified semantics, divergent physics.** Maintain semantic parity across all hardware tiers;
> sacrifice shared code before sacrificing hardware performance. If the physics demand it, build it twice.

LogicN guarantees **semantic parity** — *the governed outcome of a program is identical across the
Binary (discrete/silicon) and Photonic (continuous/optical) tiers* — but it **never bottlenecks one
tier with the other's logic** (a "lowest-common-denominator" implementation is forbidden). Where the
two hardware paradigms fundamentally diverge, a component is **bifurcated**: implemented twice under one
interface, each path native to its substrate — *mechanical sympathy at the ecosystem level*. The
compiler/Tower is the **router**: at build time it inspects the available hardware and wires each flow
to the correct implementation. The developer calls one interface and never sees the split.

- **Abstract interface** — all the developer sees (e.g. `@component interface Transform`).
- **Binary implementation** — native to silicon (strict-trapping i32 / WASM linear memory).
- **Photonic implementation** — native to optics (e.g. a Mach–Zehnder interferometer mesh), living in a
  **separate backend package**; the digital path stays the **default and unchanged**.
- **Router** — selects the implementation from the available hardware **and** the partition cost-model:
  offload to photonics only when it is a measured/projected **net win**; otherwise stay digital. The
  worst case is "stayed digital" — never a slowdown.

**What "semantic parity" means precisely — and where the invariant stops:**

1. **Parity is of the GOVERNED OUTCOME, not bit-identical analog values.** A photonic result is
   non-deterministic within a declared tolerance (`substrate {}`); parity is *enforced* by re-verifying
   the result on the digital core — **cheaply (Freivalds), never by re-execution** — and by the **K3
   fail-closed** property (a confident verdict survives bounded analog noise; near-threshold collapses to
   DENY). It is **not** a promise that two tiers emit the same IEEE-754 bits.
2. **Crypto, exact arithmetic, and control flow are BINARY-ONLY — they are NOT bifurcated.** Per
   crypto-on-core (`LLN-SUBSTRATE-001`), bit-exact cryptography and data-dependent control cannot run on
   analog optics (the precision wall — proven). These have **one** implementation (binary); the photonic
   tier's programs route them to the binary core. A photonic crypto path would be invented/broken crypto
   and is forbidden. Bifurcation is *permitted and expected* **only** for components both tiers can
   natively execute (tensor/MAC, ANN, the governance reduction, transforms like `fft`).
3. **No measured photonic performance claim without a named device** — projected envelopes are labelled
   aspirational until a real photonic-integrated-circuit benchmark exists.

In short: **one interface and one governed outcome; two native implementations wherever the physics
allow and a net win exists; binary-only wherever the physics forbid.** (Maths: the cheap-verify /
fail-safe-noise / net-win-partition guarantees are proven in
`LogicN-R-AND-D/scripts/rd-photonic-ppu-virtualisation-proof.mjs`.)

### The Tri-Pipe — three execution tiers under one router

The Bifurcated Invariant materialises as **three execution pipes**, selected per-flow (and
per-component) by a **single heterogeneous router** — NOT three virtual CPUs (R&D 0009: *"one
native-routing seam, not three emulated processors"*):

- **Binary** — pure discrete/silicon (strict-trapping i32 / WASM linear memory). Deterministic,
  bit-exact, the **default and universal fallback**. Every component can run here; **crypto, exact
  arithmetic, and control flow run ONLY here** (crypto-on-core).
- **Photonic** — pure continuous/optical (analog MAC). Non-deterministic within a `substrate {}`
  tolerance, **re-verified on Binary** (Freivalds, never re-execution), **fail-closed**. Eligible for
  tensor / governance-reduction / transform kernels only; a *whole program* is rarely pure-photonic
  because control + crypto forbid it.
- **Hybrid** — the **composition and the realistic dominant mode**: one flow with its control / crypto /
  exact parts on Binary and its eligible kernels offloaded to Photonic, results re-verified. Realized by
  the partition router (R&D 0053 `PartitionDecider`) over the shipped Brain→Brawn dispatch
  (`hybrid-engine.ts`). It offloads only on a measured/projected net win — else it stays Binary.

**One governed outcome across all three pipes** (semantic parity); **fail-closed to Binary** on any
ineligibility / out-of-tolerance / unattested / no-net-win condition; **never a slowdown** (worst case =
stayed Binary). *Disambiguation:* the Tri-Pipe **Hybrid** is hybrid **execution** (binary + photonic) —
distinct from hybrid **signing** (classical Ed25519 + PQ ML-DSA-65), a different axis that applies within
the Binary pipe.

### Build rule: the Tri-Pipe coverage check (every feature) — owner directive 2026-06-21

> *"Everything we build, consider if we need to build for the Tri-Pipe (Binary | Hybrid | Photonic)."*

For **every** new feature, explicitly decide and record its Tri-Pipe dimension — this is a *consideration
checklist*, NOT a mandate to triplicate everything. Apply the invariants:

- **Binary-only is the DEFAULT and the right answer for most features.** Crypto, governance enforcement,
  K3 decisions, control flow, exact arithmetic, admission/attestation, secret handling, memory-safety, CLI,
  and the audit/proof machinery **run ONLY on Binary** (crypto-on-core) — they have **no** Hybrid/Photonic
  facet by invariant. Recent examples: the arena hardening, inbound guard, deploy posture, manifest signing
  → **all Binary-only.** State this explicitly rather than inventing a photonic version.
- **Hybrid / Photonic applies ONLY to eligible COMPUTE kernels** — tensor / inference / governance-reduction
  / transform work — and only behind the shipped gates: the `PartitionDecider` net-win cost model, a
  `substrate {}` tolerance with a witness, Freivalds re-verify, attestation (the photonic-hardware switch +
  certified-mode admission), and **fail-closed to Binary** on any ineligibility. A *whole program* is rarely
  pure-Photonic (control + crypto forbid it); **Hybrid is the realistic dominant mode** when a kernel qualifies.
- **Record the verdict at build time** (commit message / KB): either **"Binary-only (by invariant)"** or
  **"has a Hybrid/Photonic kernel facet → [which kernel, how gated]."** The Tri-Pipe is one router + per-pipe
  packages (below), so a kernel facet means an adapter behind the `PhotonicBackend` / partition seam, never a
  governance/crypto path leaving Binary.

### Per-tier packages + the hardware-capability passive directive

The Tri-Pipe is realized as a **package topology**, not only internal branching: each component is
**replicated per pipe** under one abstract interface — e.g. `tower-citizen-binary`,
`tower-citizen-hybrid`, `tower-citizen-photonic` — each a native implementation for its tier (the
Bifurcated Invariant's "build it twice", here per-pipe). The pattern **replicates across every
component**.

Selection is driven by a **passive directive**: a cached hardware-capability query
**`hardware() → { binary | hybrid | photonic }`**, resolved **once** (boot/admission, deployment-stable)
and reused throughout the logic — a Passive Execution Plan input, not a per-call cost. The loader picks
the **most-capable available tier: photonic, else hybrid, else binary** — Binary is always the
guaranteed fallback.

Reconciliation (the invariants do not change):
- **Capability preference ≠ blind execution.** Preferring the photonic package means *"use the best
  hardware you have"*; WITHIN it, crypto / exact / control still run on the Binary core (crypto-on-core),
  and each eligible kernel is still net-win-gated + re-verified + **fail-closed to Binary**. So
  "photonic > hybrid > binary" (a **capability** axis) and "fail-closed to Binary" (a **correctness**
  axis) are orthogonal and coexist.
- **Honest nuance.** For most *whole* components some control/crypto is present, so the photonic and
  hybrid packages converge in practice: `*-photonic` is for fully-eligible components (pure
  tensor / governance-reduction); **`*-hybrid` (photonic HW present, mixed routing) is the dominant real
  package**; `*-binary` is the no-photonic-HW build. The cached `hardware()` directive + the partition
  router pick the right one; semantic parity holds across all three.

## Architectural Stability

LogicN must be additive by design.

Names, syntax, keywords, package structures and core concepts are long-term
public contracts.

LogicN should avoid:

- renaming core concepts
- removing accepted syntax
- silently changing meaning
- breaking old packages
- introducing confusing aliases
- temporary terminology

Future versions should prefer extension, compatibility, layering and
deprecation over removal.

## Policy-Native Execution

Policy is not middleware.

Policy is part of execution itself.

Execution should always occur inside:

- capability boundaries
- package boundaries
- policy boundaries
- effect boundaries
- audit boundaries

## Effect-Aware Runtime Security

All external access must be declared before execution.

Effects include:

- filesystem
- database
- network
- shell
- AI/tool access
- GPU/NPU access
- external services
- storage
- compute accelerators

Undeclared effects fail by default.

## Auditable Computation

Auditability is part of correctness.

LogicN programs should explain:

- what ran
- what data moved
- what permissions were used
- what policy approved execution
- what effects occurred
- what boundaries were crossed
- what package owned execution
- what secrets were touched
- what tests and checks passed
- what version produced the result

If execution cannot be explained, it should not be considered production-safe.

## Compliance Proof

Compliance should be generated from architecture, not added afterwards.

LogicN should support machine-readable evidence for:

- data handling rules
- permission boundaries
- audit trails
- policy enforcement
- secret handling
- package ownership
- deployment provenance
- runtime integrity

## AI-Safe Governed Execution

AI-generated code is untrusted until verified.

AI may:

- generate code
- propose changes
- request capabilities
- analyse systems
- create reports

AI may not:

- grant capabilities to itself
- bypass policy
- bypass audit
- bypass type checking
- bypass effect checking
- silently expand authority

AI execution should occur inside governed, revocable and auditable boundaries.

## Secure Governed Execution Layer

LogicN should provide a governed runtime layer built around:

- typed requests
- typed responses
- declared effects
- policy enforcement
- capability limits
- audit reports
- boundary isolation
- AI/tool governance

## Backend Simplicity

Backends should remain:

- understandable
- portable
- inspectable
- testable
- verifiable

Avoid unnecessary runtime magic or hidden execution behaviour.

## Efficiency After Safety

LogicN should minimise unnecessary allocation, copying, hidden overhead,
temporary buffers and uncontrolled heap growth.

Performance optimisation should happen after correctness, safety and
architecture stability are protected.

Speed matters, but it must never override:

- security
- memory safety
- auditability
- policy correctness
- compatibility
- architectural stability
- governed execution

## Human And AI Understandability

LogicN should be easy for humans and AI systems to inspect, map, explain,
analyse, refactor, verify and audit safely.

Code structure should favour explicitness over hidden behaviour.

## Disallowed Or Restricted Concepts

Normal LogicN source should disallow or tightly restrict:

- inheritance
- global mutable variables
- hidden global state
- unrestricted dynamic eval
- monkey patching
- reflection that bypasses policy
- silent filesystem, network, database, shell or AI/tool access
- unsafe native calls
- raw pointers and unchecked memory

Safer alternatives include:

- explicit composition
- secure flows
- typed scoped vaults
- verified generated code in quarantine
- declared effects
- contracts and adapters
- response/view contracts
- capability checks
- package manifests
- audit reports

## LogicN Identity

LogicN is not:

- a fastest-language-first project
- an unrestricted scripting language
- an implicit trust runtime

LogicN is:

- a secure execution language
- an auditable runtime architecture
- an AI-readable system
- a governed execution environment
- a policy-native platform
- a future-capable compute architecture

## Best Short Statement

```text
The goal is not uncontrolled power.
The goal is controlled, explainable and governable computation.
```

---

## Living Documents

These documents translate the charter into concrete rules, patterns, and diagnostics:

| Document | Purpose |
|---|---|
| `logicn-governance-rules.md` | Numbered rule registry with LLN codes + enforce status |
| `logicn-architecture-patterns.md` | 9 copy-paste patterns for common structures |
| `logicn-contract-authoring-guide.md` | Canonical contract authoring reference |
| `logicn-deterministic-runtime-containment.md` | DRCM 7-module security architecture |
| `secure-by-default-syntax-principles.md` | Syntax-level security principles |
