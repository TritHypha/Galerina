# Galerina Architecture Review & Future Direction

**Version: 2.0 — 2026-06-01**
**Status: Canonical — merged from architecture review sessions**
**Origin: User-authored direction document, incorporating best ideas from both perspectives**

---

## Executive Summary

Galerina is evolving into a governance-first programming language designed for:

- Financial systems
- Healthcare systems
- Government services
- Enterprise SaaS
- High-trust AI applications

The primary objective is not merely performance. The objective is:

> **Making secure, auditable, privacy-aware and governed behaviour the default while remaining fast, portable, and hardware-efficient.**

Galerina achieves this through:

```
Contracts
Effects
Capabilities
Value-State Analysis
Governance Verification
SemanticGraph
Passive Execution Plans
```

The architecture should remain focused on a small language core while allowing future support for WASM, CPU, GPU, NPU, APU, Photonic Compute, and Future Accelerators — **without redesigning the language**.

---

## Core Architectural Principle

### Compiler Proves

The compiler verifies: Types · Effects · Capabilities · Governance · Value States · Privacy Rules · Contracts — **before execution**.

### WASM Governs

The default execution target:

```
Galerina
  ↓
SemanticGraph
  ↓
Passive Execution Plan
  ↓
WASM/WASI
```

WASM provides: Portability · Sandboxing · Deterministic execution · Strong isolation boundaries.

### Native Accelerates

Native code exists only as an accelerator. It should never become the governance layer.

```
WASM governs.
Native accelerates.
Compiler proves the boundary.
Runtime audits the boundary.
```

---

## Small Core Syntax

One of the largest long-term risks to Galerina is **syntax inflation**. Every new feature should not become a new keyword.

**Prefer:**
```galerina
contract {
  effects {}
  targets {}
  memory {}
  audit {}
}
```

**Over:**
```galerina
gpu flow
npu flow
arena flow
aerospace flow
```

A small core syntax improves: human readability · AI generation quality · compiler maintainability · self-hosting · long-term evolution.

---

## Security Architecture

### Explicit Authority

Galerina should never rely on ambient authority. All privileged actions must be declared:

```galerina
effects {
  ai.inference
}
```

rather than hidden runtime behaviour.

### Capability Boundaries

Avoid universal native escape hatches such as `host.accelerate_kernel`.

**Prefer domain-scoped acceleration:**
```
host.tensor.accelerate
host.crypto.accelerate
host.string.scan
host.ai.inference
```

This preserves: Auditability · Least privilege · Capability isolation.

### Data Safety & Transformation Lineage

Traditional taint tracking is insufficient. Instead of `Raw → Clean`, Galerina tracks transformation lineage:

```
RawString
  ↓
ValidatedEmail
  ↓
RedactedEmail
  ↓
SafeForAudit
```

Compiler verification ensures: correct transformation order · no skipped security steps · no invalid sink usage.

### Sink-Specific Safety

A value should only be considered safe for the sink it was prepared for.

**Not:** `Clean<String>`

**Preferred:**
```
SafeFor<SqlValue>       ← Sql.parameterize()
SafeFor<HtmlContent>    ← Html.escapeContent()
SafeFor<HtmlAttribute>  ← Html.escapeAttribute()
SafeFor<PurifiedHtml>   ← Html.purify()
SafeFor<ShellArg>       ← Process.spawn(exec, args)  [preferred over Shell.quoteArg]
SafeFor<PathWithin>     ← Path.canonicalizeWithin(base, path)
SafeFor<SafeUrl>        ← Url.parseAndAllowlist(value, policy)
SafeFor<LogLine>        ← Log.escapeLine()
SafeFor<RegexLiteral>   ← Regex.escapeLiteral()
```

**Current status:** `Tainted<T>` and `SafeFor<Context, T>` are implemented (Phase 28). OWASP-aligned catalogue with 22 untaint boundaries. SPORE-TAINT-001/003/004 diagnostics enforced.

---

## AI Safety & Data Governance

### Pre-Inference Data Masking

Before data leaves a governed environment (PII, Financial, Healthcare, Government), it should pass through a masking stage. `John Smith` → `[CUSTOMER_001]`. The original mapping remains local.

This supports: Privacy · Compliance · Reduced AI exposure · Lower breach risk.

### Flow Graphs & AI Understanding

Galerina should make invisible control flow visible:

```bash
galerina graph
galerina graph check
galerina graph mermaid
```

Purpose: loop detection · flow visualisation · governance review · AI understanding.

### AI Metadata Files

Generate machine-readable project summaries:

```
galerina.ai.json          ← governance summary per flow
galerina.flowgraph.json   ← call graph
galerina.effects.json     ← effect declarations
galerina.contracts.json   ← all contract blocks
galerina.riskgraph.json   ← ValueGraph risk routing
```

Benefits: lower AI token usage · faster project understanding · better code generation · improved architecture reviews.

**Phase 34+ deliverable.** The `generateStageBReport()` infrastructure already exists; this extends it.

---

## Hardware Compatibility

### Passive Hardware Routing

Hardware should be **planning metadata**, not a language feature:

```galerina
targets {
  prefer [npu, gpu, wasm, cpu]
  fallback cpu
}
```

The same Galerina source should execute on Intel, AMD, ARM, Apple Silicon, Snapdragon, Cloud, Edge Devices — **without modification**.

### Hardware Discovery

**Tier A — Portable runtime detection:**
- WASM SIMD
- Runtime capabilities

**Tier B — Host topology metadata:**
- CPU type, vector extensions, core count
- GPU/NPU availability
- Used for CostGraph/ExecutionGraph/Scheduling — **not** for authority decisions

### Accelerator Architecture

**Preferred model: capability-scoped accelerators**

```
host.tensor.accelerate
host.crypto.accelerate
host.string.scan
host.ai.inference
```

Internally, the host dispatches to CPU Scalar / AVX2 / GPU / NPU / Future Hardware — **without changing Galerina programs**.

### Copy-Minimised Data Transfers

Use governed buffer handles:

```
BufferHandle {
  offset
  length
  permissions
  seal          ← ImmutableInputSeal for opaque hardware
}
```

Goal: copy-minimised execution · reduced memory pressure · better throughput.
**Note:** Do not promise universal zero-copy — actual capabilities depend on OS/Driver/Runtime/Hardware.

---

## CostGraph & ValueGraph

### Purpose

Provide economic awareness: Compute Cost · Cloud Cost · AI Cost · Risk Cost · Compliance Cost.

### Risk Model

```
Risk Cost = Breach Probability × Estimated Financial Impact
```

Based on: data classification · industry sector · deployment topology · governance posture.

### Critical Rule

> **CostGraph may increase protection levels. It must never reduce mandatory security controls.**

```
High Risk → Escalate security (higher ProofLevel, Input/Output seals)
Low Risk  → Maintain minimum policy
```

Policy remains the **floor**. Economics cannot lower the floor.

**Current status:** Phase 29 complete. `@galerina/core-economics` package with IBM/Ponemon 2025 breach matrix. `RouteDecision.governanceApproved: true` is a literal type — structurally impossible to produce an unapproved route.

---

## Aerospace / High-Assurance Profiles

High-assurance environments should be **profiles**, not language features:

```bash
galerina build --profile aerospace
galerina build --profile finance
galerina build --profile medical
galerina build --profile government
```

Profiles can enable: deterministic execution · audit requirements · proof generation · restricted capabilities · stricter verification — **without changing language syntax**.

**Current status:** `strict` and `high_integrity` profiles enforced (Phase 28). SPORE-PROFILE-001 (recursion), SPORE-PROFILE-002 (unbounded loops), SPORE-PROFILE-006 (missing runtime budget).

---

## Future Hardware Vision

Galerina should remain compatible with CPU / GPU / NPU / APU / Photonic Compute / Future Accelerators by maintaining one invariant:

```
SemanticGraph
      ↓
Passive Execution Plan
      ↓
Target-Specific Backend
```

Governance remains unchanged regardless of hardware.

**Current status:** 37 hardware targets classified in `HARDWARE_TRUST_PROFILES`. Only `cpu` and `wasm` are fully implemented. 15 targets are type-only (Phase 33 wires some). 17 are architecture-only (Phase 38-40+).

---

## What Was Removed From Earlier Proposals

Removed as over-engineered, absolute, or weakening the governance model:

- `host.accelerate_kernel` (universal escape hatch) → replaced with domain-scoped `host.tensor.accelerate`
- Promises of universal zero-copy → replaced with "copy-minimised where possible"
- `gpu flow` / `npu flow` / `aerospace flow` keywords → replaced with profiles and `contract.targets`
- Hard requirement that CostGraph must reduce security → replaced with "floor" model

---

## Final Principle

> Galerina should not attempt to be the fastest language at any cost.
>
> Galerina should aim to be:
> - Secure by default
> - Governed by design
> - Auditable by construction
> - Portable across hardware
> - Efficient in execution
> - Understandable by humans
> - Understandable by AI

**The guiding rule remains:**

```
Compiler proves.
WASM governs.
Native accelerates.
Runtime audits.
Policy sets the floor.
```

---

## See Also

- `galerina-master-architecture.md` — four-way separation (Governance/Proof/Economics/Hardware)
- `galerina-governance-hierarchy.md` — the inviolable stack
- `galerina-taint-catalogue.md` — OWASP-aligned untaint boundaries
- `galerina-hardware-compute-fabric.md` — HardwareGovernanceClass, ProofLevel
- `galerina-hardware-compatibility-matrix.md` — current vs planned hardware support
- `galerina-core-concepts-review-2026.md` — concrete improvement suggestions
- `galerina-security-hardening-phase34.md` — 7 attack surfaces before Phase 34
