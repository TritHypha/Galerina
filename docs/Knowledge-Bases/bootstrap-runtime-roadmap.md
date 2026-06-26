# Bootstrap Runtime Roadmap

## Status

```
Phase 1 complete: Node.js bootstrap runtime (Stage A) ✅ — 2286 tests
Phase 2 complete: GIR (Governance IR) stabilised ✅ — GIR v1 schema, canonical hash, PassiveExecutionPlan
Phase 3 in progress: WAT emitter skeleton (Phase 19-23), Register VM types (Phase 23C), WASM target Phase 24
Phase 4 planned: Phase 25-28 — Stage B self-hosting (lexer.spore token parity, parser.spore, type-checker.spore)
Phase 5 planned: Phase 28-29 — Full Stage B; Galerina verifies its own governed artifacts
```

Current bootstrap architecture:
- Stage A TypeScript runtime: tree-walking interpreter, capabilityHost, audit trail ✅
- Stage A WASM path: WAT emitter skeleton → Phase 24 real instruction emission
- Stage B: lexer.spore (executing), parser.spore v0, type-checker.spore, compiler.capabilities.spore — 0 parse errors ✅

## Definition

Galerina cannot self-host immediately. The bootstrap runtime uses a host language
(Node.js) with strict contracts to validate the governance model, then
progressively replaces itself with native and self-hosted components.

## Core Principle

```text
Phase 1: Prove the model works with Node.js.
Phase 2: Stabilise the Governed IR.
Phase 3: Replace components with native code.
Phase 4: Achieve partial self-hosting.
Phase 5: Galerina verifies and signs its own governed artifacts.
```

## Five Bootstrap Phases

### Phase 1: Node.js Bootstrap Runtime

```text
Host: Node.js
Purpose: validate governance model, safe/unsafe trust model, runtime security rules
Deliverable: working runtime that enforces Galerina security contracts
Trust: local self-signed artifacts only (Level 0)
```

The Node.js runtime implements Galerina governance contracts in strict TypeScript/JavaScript.
It does not need to be fast — it needs to be correct. Security invariants are validated
here before any native code is written.

Key validations:
- safe/unsafe boundary enforcement
- uses permission checking
- Query protection model
- GlobalVault access control
- flow finalizer and cleanup
- Runtime audit events

### Phase 2: Governed IR Stabilisation

```text
Host: Node.js runtime + Governed IR layer
Purpose: design and stabilise the hardware-neutral Intermediate Representation
Deliverable: stable Governed IR schema and compiler output
Trust: Level 0–1 (local + team)
```

The Governed IR is the neutral, hardware-independent representation that sits
between the Galerina source and backend execution. It encodes:

```text
security metadata (permissions, capabilities, effects)
trust boundaries
audit requirements
compute targets
memory layout hints
provenance annotations
```

The IR must be stable before native components are built on top of it.

### Phase 3: Native Components in Rust/WASM/C

```text
Host: Governed IR with native backends
Purpose: replace performance-critical Node.js components
Deliverable: native runtime components for the hot path
Trust: Level 1–2 (team + CI-signed)
```

Native components replace: the Execution Coordination Scheduler, Result Assembler,
memory management, compute target dispatch (GPU/NPU routing), and WASM plugin sandbox.

The governance layer remains the same — only the implementation backend changes.

### Phase 4: Partial Self-Hosting

```text
Host: Galerina-compiled runtime components
Purpose: Galerina compiles and runs some of its own runtime
Deliverable: select runtime modules compiled from .spore source
Trust: Level 2 (production, CI/OIDC provenance required)
```

Galerina runtime modules are progressively rewritten in Galerina. Each module:
- is compiled by the Phase 3 native compiler
- passes the same governance checks as any other Galerina package
- is signed by CI/OIDC

### Phase 5: Galerina Signs and Verifies Its Own Governed Artifacts

```text
Host: Self-hosted Galerina runtime
Purpose: full supply-chain integrity
Deliverable: Galerina builds, verifies, and signs its own runtime artifacts
Trust: Level 2–3 (production + enterprise)
```

At full self-hosting, the Galerina runtime:

```text
compiles from .spore source
generates Trust Capsule automatically
signs artifacts with CI/OIDC identity
verifies all packages against registry
produces SLSA provenance
publishes to transparency log
```

## Trust Level Progression

| Phase | Trust Level | Signing |
| --- | --- | --- |
| 1 | Level 0 — local dev | self-signed |
| 2 | Level 0–1 — local + team | local or CI |
| 3 | Level 1–2 — team + production | CI-signed |
| 4 | Level 2 — production | CI/OIDC |
| 5 | Level 2–3 — production + enterprise | CI/OIDC + transparency log |

## What Does Not Change Between Phases

```text
The Galerina governance model
The safe/unsafe trust model
The uses permission model
The Query protection model
The flow finalizer
The runtime audit model
The Trust Capsule schema
```

Only the implementation technology changes. The security contracts are identical
from Phase 1.

## CLI at Each Phase

```bash
galerina init          # create project trust root
galerina build         # build with trust capsule generation
galerina run           # verify trust capsule then execute
galerina trust inspect # show trust status
galerina build --profile production  # production trust enforcement
galerina trust verify --profile production
galerina deploy        # deploy after trust verification
```

## Beyond Phase 5: Ecosystem Expansion

After full self-hosting is achieved, the platform may extend to:

```text
Multi-runtime support         — multiple concurrent runtime implementations
Edge deployment support       — constrained edge and embedded targets
Federated trust domains       — cross-organisation trust federation
Third-party verification      — external tooling to verify Galerina artifacts
Multi-language compilation    — additional source language frontends
```

These are future directions, not current requirements.

---

## Reference Standards Applied at Phase 5

```text
Sigstore / Cosign  — keyless signing, OIDC identity, transparency logs
SLSA Provenance    — build trust generated by pipeline, not hand-written
SPIFFE / SPIRE     — workload identity issued to running services
in-toto            — attestations generated as artifacts
TUF                — package trust via signed registry metadata
OpenSSF Scorecard  — automated risk scoring
```

## Core Principle

```text
Phase 1 proves the model.
Phases 2–3 build the foundation.
Phases 4–5 make Galerina self-sufficient.

At every phase the governance model is the same.
Only the implementation matures.
```
