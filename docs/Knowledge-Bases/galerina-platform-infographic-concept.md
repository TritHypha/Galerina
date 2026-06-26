# Galerina — Platform Infographic Concept

**Version:** 1.0 (2026-06-04)  
**Status:** CONCEPT — to be rendered as a poster/visual map when the platform is complete.  
**Format:** Building-style architectural poster — layers and zones, NOT a flowchart.

---

## Concept: "The Governed Tower"

The infographic presents Galerina as a **multi-floor building** where each floor is a distinct layer of trust and enforcement. Higher floors = more abstract governance; lower floors = closer to hardware. Every component sits in its correct layer and is visually connected to what it governs above and what enforces it below.

---

## Visual Layout (5 Floors + 1 Foundation)

```
┌─────────────────────────────────────────────────────────────┐
│ PENTHOUSE: DEVELOPER & AI AUTHORING                         │
│  contract {}  policy {}  [conforms_to: X]                   │
│  @experimental_profile  governance-impact.json              │
│  galerina check --diff  PR templates  change-class            │
├─────────────────────────────────────────────────────────────┤
│ FLOOR 4: GOVERNANCE PIPELINE (CI/CD)                        │
│  galerina diff  run-phase-close.mjs                           │
│  .lmanifest (RFC 8785 → CBOR)  ML-DSA-65 signing            │
│  GitHub Actions  governance:diff gate                        │
├─────────────────────────────────────────────────────────────┤
│ FLOOR 3: COMPILER PIPELINE                                  │
│  lexer → parser → type-checker → value-state                │
│  effect-checker → governance-verifier → GIR → WAT           │
│  SPORE-xxx diagnostics  ProofGraph  GovernanceSignature        │
├─────────────────────────────────────────────────────────────┤
│ FLOOR 2: RUNTIME CONTAINMENT (DRCM)                         │
│  DSS.wasm supervisor  V_DPM 32-bit register                  │
│  DWI isolates (4MB, shared-nothing)  fuel injection          │
│  resilience {}  observability {}  emergency policy           │
├─────────────────────────────────────────────────────────────┤
│ FLOOR 1: EXECUTION + VERIFICATION                           │
│  Wasmtime Cranelift JIT  WASM linear memory                  │
│  CBOR tags 400-408  SecretSinkMonitor                        │
│  wildcard ban  prefix-token scan                             │
├─────────────────────────────────────────────────────────────┤
│ FOUNDATION: HARDWARE + CRYPTOGRAPHY                         │
│  CPU guard pages (2GB)  ML-DSA-65 (NIST FIPS 204)           │
│  Ed25519  CHERI capability monotonicity                      │
│  gVisor/OCI  WASI Preview 2                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Zone Definitions

Each floor has a distinct **colour zone** and **function label**:

| Floor | Colour | Zone name | Core responsibility |
|---|---|---|---|
| Penthouse | Sky blue | **Author Zone** | Where humans and AI agents write governed code |
| Floor 4 | Gold | **Attestation Zone** | Where builds are verified, signed, and classified |
| Floor 3 | Deep green | **Proof Zone** | Where claims are checked and ProofGraphs are built |
| Floor 2 | Red-orange | **Containment Zone** | Where execution is bounded and faults are isolated |
| Floor 1 | Steel blue | **Execution Zone** | Where code actually runs on real hardware |
| Foundation | Dark grey | **Trust Anchors** | Hardware + cryptography — the physical root of trust |

---

## Key Visual Elements

### The "Governance Rail" (vertical spine)
A vertical line running through all floors labelled:
> `contract {} → .lmanifest → DSS.wasm → V_DPM → execution`

This shows the governance claim flowing from developer intent (top) to hardware enforcement (bottom).

### The "Monotonicity Arrow" (downward only)
An arrow pointing DOWN through the containment zone labelled:
> `permissions can only decrease ↓`

This visually communicates the monotonic security rule without words.

### The "Three Goals" badges (right margin)
Three badges pinned to specific floors:
- **Goal A** (Floor 3): Native Speed — static proofs eliminate runtime overhead
- **Goal B** (Floor 2): Single-cycle bitmask — V_DPM bitwise AND at DRCM layer
- **Goal C** (Floor 1/2 boundary): No system crashes — 4MB isolates + guard pages

### Component callout boxes
Each major component has a small callout box showing:
- Name
- Status: ✅ Built / 🔲 Planned / 🔜 DRCM Phase N
- One-line purpose

### The "Change Class" indicator (Floor 4)
A traffic-light system:
- 🟢 NEUTRAL/TIGHTENING — auto-merge
- 🟡 EXPANSION — governance review required
- 🔴 EXPERIMENTAL — architecture review required

---

## Components to Show (by floor)

### Penthouse — Author Zone
- `flow` / `pure flow` / `secure flow` keywords
- `contract [conforms_to: X] {}` block
- `policy { emergency {} }` block
- `@experimental_profile(drcm_core_v1)`
- `resilience {}` + `observability {}` blocks
- `invariant { ensure ... }` (DRCM Phase 2)
- `.galerina.proposal` AI authoring pipeline

### Floor 4 — Attestation Zone
- `galerina diff` change-class engine
- `.lmanifest` (RFC 8785 → CBOR)
- ML-DSA-65 + Ed25519 signing
- `run-phase-close.mjs` (13 CI gates)
- GitHub Actions governance gate
- `governance-impact.json` artifact
- CBOR Tags 400-408

### Floor 3 — Proof Zone
- Lexer → Parser → Symbol Resolver
- Type Checker (SPORE-TYPE-001..023)
- Value-State / Secret Taint Checker (SPORE-SECRET-001/002/003)
- Effect Checker (SPORE-EFFECT-001..005)
- Governance Verifier (35+ SPORE codes)
- ProofGraph + GovernanceSignature
- Domain Guard Policies (`[conforms_to: X]`)
- Wildcard ban (SPORE-CAP-001)
- Prefix-token scanner (SPORE-SECRET-BREACH)

### Floor 2 — Containment Zone
- DSS.wasm supervisor
- V_DPM 32-bit monotonic register
- DWI guest isolates (4MB, shared-nothing)
- Fuel injection (step execution budgets)
- `resilience {}` engine + quarantine
- Emergency policy overlay
- `security::interim::BoundaryProxy`

### Floor 1 — Execution Zone
- Wasmtime Cranelift JIT
- CBOR parser (secure, hardened)
- SecretSinkMonitor
- WASM linear memory + guard pages
- `step` keyword → DWI allocation
- `.lmanifest` admission gate

### Foundation — Trust Anchors
- CPU hardware guard pages (2GB boundaries)
- ML-DSA-65 (NIST FIPS 204 post-quantum)
- Ed25519 (compatibility baseline)
- WASI Preview 2 (Wasmtime 22+)
- gVisor/OCI Layer 2 sandbox
- CHERI capability model (hardware analogue)

---

## Pending Platform Items (shown as "Under Construction" on the poster)

| Item | Floor | Status |
|---|---|---|
| `invariant {}` parser + WAT gate | Floor 2/3 | DRCM Phase 2 — #36 |
| Binary CBOR encoder | Floor 4 | Task #67 |
| Real ML-DSA-65 signing | Floor 4 | After key custody (#34) |
| DSS.wasm self-hosted supervisor | Floor 2 | DRCM Phase 5 — #41 |
| `step` keyword + DWI isolates | Floor 2 | DRCM Phase 5 — #40 |
| Epilogue Receipt | Floor 2 | DRCM Phase 6 — #42 |
| CBOR secure parser | Floor 1 | DRCM Phase 5 — #68 |

---

## When to Render

The infographic should be rendered when:
- ✅ DRCM Phase 1 complete (now)
- 🔲 DRCM Phase 2 (#36 invariant {}) complete
- 🔲 DSS.wasm self-hosted (#41) complete
- 🔲 Binary CBOR (#67) complete
- 🔲 Step keyword + DWI (#40) complete

At that point all "Under Construction" zones become "Live" and the poster is the complete picture.

**Render format:** A4 landscape PDF poster, suitable for printing or displaying as a technical reference card.
