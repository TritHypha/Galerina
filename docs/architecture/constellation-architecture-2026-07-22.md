# Galerina Constellation — In-Repo Architecture Record

**Date:** 2026-07-22  
**Status:** Adopted decision record  
**Authority:** Owner + Bob (engineering review)  
**Canonical KB document:** `../ZTF-Knowledge-Bases/galerina-constellation-architecture.md`  
**Gap analysis:** `../ZTF-Knowledge-Bases/constellation-architecture-plan-2026-07-22.md`

---

## What this document covers

This document records the confirmed Constellation architecture decisions that govern how the Galerina project will be structured, split, and extended. It answers three questions:

1. **Does the current project already use the Lego-block modular architecture?** (Mostly yes — gaps are tooling/metadata only.)
2. **Can the project split into separate optional products later?** (Yes — the current architecture already supports this.)
3. **What is the forward architecture plan for engines, TritMesh, and the sister language?**

---

## The Constellation in one diagram

```
                     GALERINA CONSTELLATION

┌──────────────────────────────────────────────────────────────┐
│ GALERINA:CORE FOUNDATION                                     │
│ Language · Compiler · GIR · Runtime · Hallmark · Contracts   │
│ K3 · Packages · Evidence · Provider SDK · CPU/WASM/Native    │
│                                                              │
│ STATUS: BUILDING — Stage A complete; Stage B in progress     │
└──────────────────────────────────────────────────────────────┘
              ▲ required foundation for all optional products
              │
   ┌──────────┼──────────────────┐
   │          │                  │
┌──┴───────┐ ┌┴────────────┐ ┌──┴──────────────────┐
│ FABRIC   │ │ CORTEX      │ │ QUANTUM RESEARCH    │
│ ENGINE   │ │ ENGINE      │ │ VESSEL              │
│ ROADMAP  │ │ ROADMAP     │ │ ROADMAP             │
└──────────┘ └─────────────┘ └─────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ TRITMESH DATA INTELLIGENCE SUITE                             │
│ QL · Discovery · Forecast · Market          ROADMAP          │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│ OPTIONAL FAST SISTER LANGUAGE                                │
│ Same syntax/logic family · reduced governance · closed net  │
│                                                   ROADMAP   │
└──────────────────────────────────────────────────────────────┘
```

---

## Non-negotiable invariant

> **Core must remain a complete product when every optional provider is absent.**

**Current status: PASS.** No optional engines exist. Core runs standalone by construction.  
**CI release gate:** remove every optional engine → build Core → install → run tests → verify evidence → result must be PASS.

---

## Development order

```
1. Finish Galerina:Core Foundation    ← current work
2. Build TritMesh:QL                  ← first post-Core product
3. Build remaining engines and products ← order TBD by R&D and owner
```

No work on TritMesh or optional engines begins until Core ships.

---

## FUNGI-* and GALERINA-* code ownership

These codes belong **exclusively to Galerina:Core** and stay with this project through any split:

- Defined in `packages-galerina/galerina-core-compiler/src/index.ts`
- Emitted by: `type-checker.ts` · `effect-checker.ts` · `governance-verifier.ts` and other compiler stages
- **No optional engine defines a FUNGI-* or GALERINA-* code**

Optional engines define their own namespaces when built: `FABRIC-*`, `CORTEX-*`, `QUANTUM-*`, `TRITMESH-*`.

---

## Lego-block architecture — current compliance

| Rule | Status | Gap |
|---|---|---|
| Package behind versioned interface | ✅ | `package.fungi.json` lacks `interfaceHash` + version on seam field |
| Every seam deny-by-default | ✅ core runtime seam | Other package-level seams lack `onAbsent: deny` |
| Vendored + pinned, no reach-through | ✅ | None |
| One-level-visible manifest | ✅ `BOUNDARY.md` auto-generated | None |
| Authority graph as coupling map | ✅ project graph generated | No gate fails on undeclared cross-block edges yet |
| Twin + differential test per block | ✅ 27+ twins | Swap harness not yet standardised |
| Migration via interface versioning | ⚠ runtime seam only | Drift-gate pattern needed for all seams |

**Gaps are all tooling/metadata. No runtime or compiler changes needed.**

---

## Shared non-governance base (the sister language split point)

The compiler has two logical halves. The boundary between them **must become a versioned seam** before any sister-language work begins:

```
galerina.compiler.shared.v1    ← shared: lexer / parser / AST / GIR / WAT / backends
galerina.governance.v1         ← governance: K3 / policy / evidence / capabilities / FUNGI-* codes
```

Today this is an informal convention inside `galerina-core-compiler`. The seam schema must be defined — as a schema document, not necessarily a physical code split — before the sister language prototype starts.

---

## Gaps to close before the product split is safe

Not blockers for Core v1.0. Preconditions for a clean split later.

| Gap | Work |
|---|---|
| `package.fungi.json` — sparse `provides`/`consumes`/`onAbsent` | Extend schema; fill 94 packages |
| No `audit-seam-graph.mjs` gate | New audit script; fails on undeclared edges |
| Interface hash too shallow (method names only) | Extend to full typed ABI |
| `galerina.compiler.shared.v1` schema not defined | Write schema before sister-language work |
| Unplug-denies test only for runtime seam | One per registered seam |
| Version drift-gate only for runtime seam | Apply to all registered seams |

---

## Key seams (current state)

| Seam | Status |
|---|---|
| `galerina.runtime.seam.v1` | ✅ SHIPPED — `seam-adapters.ts` + `GOVERNED_RUNTIME_SEAM_VERSION` |
| `fungi.wasm.abi.v1` | ✅ SHIPPED — closed seam registry |
| `protocol.inbound` · `compute.pure` | ✅ declared in `package.fungi.json` — needs `interfaceHash` |
| `gate-plan.v1` | DESIGN — decouples Tri-Fuse from WAT lowering |
| `galerina.compiler.shared.v1` | DESIGN — must exist before sister-language work |
| All Fabric/Cortex/Quantum/TritMesh seams | ROADMAP |

---

## References

| Document | Location |
|---|---|
| Canonical Constellation KB spec | `../ZTF-Knowledge-Bases/galerina-constellation-architecture.md` |
| Conformance gap analysis | `../ZTF-Knowledge-Bases/constellation-architecture-plan-2026-07-22.md` |
| Lego-block design | `../ZTF-Knowledge-Bases/galerina-lego-block-modular-architecture-decouple-and-reslot-2026-07-18.md` |
| Lego critical assessment | `../ZTF-Knowledge-Bases/galerina-lego-rules-critical-assessment-security-vs-performance-2026-07-18.md` |
| R&D primary architecture doc | `../new/galerina-constellation-rd-architecture.md` |
| AI builder handover doc | `../new/galerina-constellation-ai-builder-handover.md` |
| Runtime seam implementation | `packages-galerina/galerina-core-runtime-wasm/src/seam-adapters.ts` |
| Package graph (authority map) | `build/graph/galerina-devtools-project-graph.json` |
