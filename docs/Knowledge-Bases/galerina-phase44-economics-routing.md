# Galerina Phase 44 — ValueGraph Risk-Adjusted Routing

**Theme: Economics in production**
**Stream: A**
**Runtime %: 33%**
**Date: 2026-06-01**

---

## What Phase 44 Achieves

Phase 44 connects the economics inference engine (built in Phase 29, extended in Phase 33)
to the HTTP dispatch path. Routing decisions are now *data*, not hard-coded choices:
the `CostGraph` reads each flow's `InferredEconomics` and selects the optimal execution
target before dispatch.

**Current state:** `inferFlowEconomics` runs at compile time and at dispatch time,
producing a fully populated `InferredEconomics` record for every flow. The routing
*decision* is computed. Enforcement at the infrastructure level (actually sending
pure flows to WASM workers vs. CPU processes) is Phase 57.

Phase 44 delivers observability: every dispatch logs the routing decision so the
data is available for Phase 57 to act on.

---

## The Routing Decision Model

```
CostGraph.selectRoute(flow, InferredEconomics)
    │
    ├─ preferredTarget: "wasm"    → pure flows, no side effects
    ├─ preferredTarget: "cpu"     → effectful flows (db, network, audit)
    ├─ preferredTarget: "gpu"     → AI inference flows
    ├─ preferredTarget: "npu"     → low-power inference
    └─ preferredTarget: "enclave" → safety_critical / national_security classification
```

The decision is driven by three inputs, checked in priority order:

1. **Explicit `contract { hardware { target … } }`** — developer override, always respected.
2. **Effect set** — `ai.infer` → gpu; `database.write` / `network.outbound` → cpu;
   no effects + pure qualifier → wasm.
3. **Value classification** — `safety_critical` / `national_security` → enclave;
   `financial` / `regulated` → elevated risk tier (cpu + audit escalation).

Risk tier is a parallel signal (not the same as target) that drives ProofLevel
escalation in the audit chain:

| Risk Tier | ProofLevel | Trigger |
|---|---|---|
| standard | 1 | Default — no classification declared |
| elevated | 2 | `financial`, `regulated`, or PII effects (`pii.*`, `phi.*`) |
| high | 3 | `medical`, `government`, `mission_critical` |
| critical | 4 | `safety_critical`, `national_security` |

---

## How `inferFlowEconomics` Auto-Detects the Right Target

`inferFlowEconomics(flowNode, flowMeta)` in
`packages-galerina/galerina-core-compiler/src/economics-inference.ts` runs on every
flow, with or without an explicit `economics {}` block. The inference is
convention-over-configuration: developers who don't write economics blocks get
correct defaults automatically.

The function returns `InferredEconomics`:

```typescript
interface InferredEconomics {
  preferredTarget: "wasm" | "cpu" | "gpu" | "npu" | "enclave";
  hasBudget: boolean;        // true if contract.limits was declared
  riskTier: "standard" | "elevated" | "high" | "critical";
  trackAiCost: boolean;      // true if any ai.* effect declared
  explicit: boolean;         // true if developer wrote economics {} block
}
```

`explicit: false` is the common case — the compiler fills it in. `explicit: true`
means the developer wrote an economics block; the explicit block is respected and
only missing fields are inferred.

---

## Current State: Inference Works, Dispatch Observability Pending Phase 57

| Capability | Phase 44 | Phase 57 |
|---|---|---|
| `inferFlowEconomics` computes target | Yes | Yes |
| Routing decision logged in audit event | Yes (Phase 44 delivers this) | Yes |
| Pure flows actually sent to WASM worker | No | Yes |
| Effectful flows pinned to governed CPU | No | Yes |
| Enclave routing for classified flows | No | Yes |
| `CostGraph.selectRoute` enforced at infrastructure | No | Yes |

The audit log entry added in Phase 44 looks like:

```json
{
  "event": "RouteDispatch",
  "flow": "verifyPassword",
  "inferredTarget": "cpu",
  "riskTier": "elevated",
  "explicit": false,
  "note": "Observability-only — enforcement Phase 57"
}
```

---

## Auto-Inferred Routes for the Three Deployed Service Flows

### 1. `verifyPassword` (verifyPasswordService.spore)

```
qualifier:  secure
effects:    network.inbound, crypto.verify, audit.write
value:      (none declared)
```

**Inferred routing:**
- `preferredTarget: "cpu"` — `audit.write` is a heavy side-effect; cpu is required
- `riskTier: "elevated"` — password verification implies credential handling;
  `crypto.verify` combined with `audit.write` escalates to elevated automatically
- `hasBudget: false` — no `contract.limits` block
- `trackAiCost: false`

> The password flow handles credentials. It cannot run in a pure WASM sandbox
> because it needs `audit.write` (a governed side-effect). CPU with full audit
> chain is correct.

---

### 2. `healthCheck` (healthCheck.spore)

```
qualifier:  secure
effects:    network.inbound, audit.write
value:      (none declared)
```

**Inferred routing:**
- `preferredTarget: "cpu"` — `audit.write` is a heavy effect
- `riskTier: "standard"` — liveness probe, no classification, no PII
- `hasBudget: false`
- `trackAiCost: false`

> The health check writes a lightweight audit entry. Standard risk, cpu target.
> In Phase 57, a future optimisation could make the audit write async and route
> the computation portion to WASM — but Phase 44 correctly infers cpu today.

---

### 3. `rateStatus` (rateStatus.spore)

```
qualifier:  guarded
effects:    network.inbound, audit.write
value:      (none declared)
```

**Inferred routing:**
- `preferredTarget: "cpu"` — `audit.write` keeps it on governed CPU
- `riskTier: "standard"` — rate counters are operational data, not classified
- `hasBudget: false`
- `trackAiCost: false`

> Rate status reads in-process counters and writes an audit entry. Standard risk.
> The `guarded` qualifier (vs `secure`) means the governance check is lighter,
> but the effect set still pins it to cpu.

---

## What Phase 57 Will Complete

Phase 57 takes the Phase 44 observability data and makes it structural:

1. **WASM worker pool** — pure flows compiled to `.wasm` are dispatched to a
   pre-warmed WASM worker pool (Deno Workers or Node.js `node:worker_threads`).
2. **CPU pin** — effectful flows are dispatched to a governed CPU executor that
   holds the audit chain, rate limiter, and proof graph.
3. **Enclave routing** — `safety_critical` / `national_security` flows are
   dispatched to a hardware enclave (SGX or equivalent) when available; fall back
   to cpu with elevated audit if not.
4. **Budget enforcement** — flows with `contract.limits` have a cost budget
   enforced at dispatch; flows that exceed budget return `402 Budget Exceeded`
   with a governance proof.

The Phase 44 audit log provides the training data for Phase 57 routing decisions:
by the time Phase 57 ships, there will be real traffic distributions to validate
the routing model against.

---

## Related Files

| File | Role |
|---|---|
| `packages-galerina/galerina-core-compiler/src/economics-inference.ts` | `inferFlowEconomics` — the inference engine |
| `packages-galerina/galerina-core-compiler/src/route-dispatcher.ts` | HTTP dispatch — Phase 57 will add routing enforcement here |
| `examples/auth-service/verifyPasswordService.spore` | Primary governed service — cpu target, elevated risk |
| `examples/auth-service/healthCheck.spore` | Liveness probe — cpu target, standard risk |
| `examples/auth-service/rateStatus.spore` | Rate counter service — cpu target, standard risk |
| `docs/Knowledge-Bases/galerina-roadmap-phases-41-60.md` | Phase 44 roadmap entry |
