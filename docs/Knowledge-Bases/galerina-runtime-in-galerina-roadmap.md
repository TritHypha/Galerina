# Galerina — Runtime in Galerina: Phased Roadmap

**Goal: Runtime written in Galerina at 100%**
**Strategy: 5 phases at a time, execute, then plan the next 5**

---

## What "Runtime in Galerina 100%" Means

Current: The runtime is TypeScript serving as an interpreter for `.spore` files.
Target: The runtime is Galerina serving as a governed HTTP platform that governs itself.

Milestones:
1. **25%** — Galerina serves a real HTTP endpoint (verifyPassword)
2. **50%** — Galerina governs its own request pipeline (routes, capabilities, audit)
3. **75%** — Galerina can compile and run other Galerina programs (Stage B bootstrap)
4. **100%** — The full runtime (interpreter, capability host, audit writer) expressed in Galerina flows, compiled to WASM, self-governing

---

## Block 1: Performance + Security Foundation (Phases 27B–31)

**Goal:** Make the tree-walker fast enough to run runtime flows, add security types needed for governed HTTP.

### Phase 27B — Sync Fast-Path for Pure Flows
**Impact: 50-100× tree-walker speedup**

Add `evalExprSync()` alongside `async evalExpr()`. Pure EffectFree flows route to sync path — no microtask overhead.

```typescript
// Before: every add(2,3) creates 2 microtask queue entries
private async evalExpr(node): Promise<GalerinaValue>

// After: pure flows use synchronous path
private evalExprSync(node): GalerinaValue
// Routing: if (flow.qualifier === "pure" && effectFree) → evalExprSync
```

Expected: arithmetic-threshold tree-walker 257K/s → ~5M/s

### Phase 28 — Profile Enforcement + Security Types
**Impact: aerospace/safety governance complete; Tainted<T> prevents injection at compile time**

Three additions:
1. `profile strict` / `profile high_integrity` → real compiler errors (SPORE-PROFILE-001..007)
2. `Tainted<T>` — input from untrusted sources cannot reach a `database.query` or `html.render` sink without explicit sanitiser
3. Constant-time comparison — `ProtectedSecret<T> ==` is SPORE-SECURITY-001 (use `.constantTimeEquals()`)

These are required before the runtime can accept external HTTP requests securely.

### Phase 28B — `galerina diff` CLI
**Impact: governance delta between commits — turns PR review into reading a report**

```bash
galerina diff main..feature/add-payment
# → JSON: { added: [{flow: "chargeCard", effects: ["+payment.charge"]}], removed: [], changed: [] }
```

### Phase 29 — `galerina-core-economics` Package
**Impact: CostGraph routes pure flows to WASM, effectful flows to capability-enforced CPU path**

```
total_cost = compute_cost + audit_cost + governance_cost + AI_cost + risk_cost
```

CostGraph auto-routes: pure flow → WASM (10-100× faster), effectful flow → governed CPU path.

### Phase 30 — Governance Overhead <3%
**Impact: proof caching reduces per-call governance tax from ~2× to <1.05×**

Profile: ProofGraph construction is the main cost. Solution: cache ProofGraph by ExecutionSignature. Two flows with identical governance shape share one ProofGraph — build once, use everywhere.

---

## Block 2: First Deployment (Phases 31–35)

**Goal:** Galerina serves a real governed HTTP endpoint. Runtime at 25%.

### Phase 31 — Bytecode VM
**Impact: 10-50× tree-walker improvement beyond sync fast-path**

Compile pure flows to a flat `Int32Array` bytecode. No async, no objects, no scope chain. A tight 10-line `while(pc < code.length)` loop.

```typescript
function runBytecode(code: Int32Array, locals: Int32Array): number {
  let pc = 0; const stack = new Int32Array(64); let sp = 0;
  while (pc < code.length) {
    const op = code[pc++];
    switch (op) {
      case OP.LOAD_LOCAL: stack[sp++] = locals[code[pc++]!]!; break;
      case OP.INT_ADD:    stack[sp-2] = stack[sp-2]! + stack[--sp]!; break;
      case OP.RETURN:     return stack[--sp]!;
    }
  }
  return 0;
}
```

### Phase 32 — Stage B Lexer Parity
**Impact: Stage B can tokenise 100% of Galerina syntax — prerequisite for self-hosting**

`generateStageBReport()` reaches 100% lexer coverage. Stage B can lex all 223 CEC examples.

### Phase 33 — Integer Fast-Path + Hardware Routing
**Impact: 5-20× additional on integer arithmetic; CostGraph routes to WASM/CPU/NPU**

```typescript
// Skip boxing for Int+Int hotpath:
if (left.__tag === "int" && right.__tag === "int" && op === "+") {
  return intVal(left.value + right.value);  // already fast — add direct dispatch
}
```

### Phase 34 — `verifyPassword` HTTP Service
**Impact: RUNTIME AT 25% — first real governed HTTP endpoint**

```galerina
secure flow verifyPassword(readonly req: HttpRequest) -> HttpResponse
contract {
  effects { network.inbound audit.write }
  privacy { pii { password } }
}
{
  let valid = BCrypt.verify(req.body.plain, req.body.hash)?
  AuditLog.write({ event: "PasswordVerified", success: valid })
  return valid ? Response.ok({}) : Response.unauthorized({})
}

route POST "/auth/verify" { verifyPassword }
```

This is the first `.spore` file that IS the runtime service.

### Phase 35 — wasmtime CLI
**Impact: Galerina service runs outside Node.js — standalone WASM binary**

```bash
galerina build --target wasm-wasi --output auth-service.wasm auth/verifyPassword.spore
wasmtime run auth-service.wasm
```

---

## Block 3: Full Runtime Infrastructure (Phases 36–40)

**Goal:** Galerina governs its own request pipeline. Runtime at 50%.

### Phase 36 — Deno Deploy First Endpoint
**Impact: first external traffic served by a governed Galerina service**

```bash
deno deploy --project galerina-auth dist/auth-service.wasm
curl https://galerina-auth.deno.dev/auth/verify -d '{"plain":"secret"}'
```

Audit trail writes to Deno KV. ProofGraph downloadable from `/governance/proof`.

### Phase 37 — ValueGraph + Risk-Adjusted Routing Live
**Impact: CostGraph makes real routing decisions based on breach probability × loss**

`cloud path: £70,001 expected cost → enclave path: £3,500` — the economics layer chooses the enclave. First live demonstration of governance-first economics.

### Phase 38 — Governance Marketplace Foundation
**Impact: `use governance_shape HIPAA_PHI_v1` — governance shapes importable in source**

```galerina
use governance_shape @galerina/compliance-hipaa:HIPAA_PHI_v1

secure flow processPatient(...) contract { ... }
// HIPAA requirements auto-injected from the shape
```

### Phase 39 — GovernanceSignature (ML-DSA)
**Impact: every ProofGraph gets an unforgeable quantum-resistant certificate**

```bash
galerina-verify proof.json --key spore-gov-2026-01
# ✓ GovernanceSignature: spore-gov-2026-01 (valid, ML-DSA FIPS 204)
# RESULT: COMPLIANT
```

### Phase 40 — Real-Time Governance (Streaming Flows)
**Impact: `deadline hard` for safety_critical flows; bounded-latency execution**

```galerina
contract {
  value { classification safety_critical }
  limits { request_time 50μs deadline hard }
}
```

P-core scheduling, preemption guarantees, timeout-before-deadline enforcement.

---

## Block 4: Runtime in Galerina v1 (Phases 41–45)

**Goal:** The full HTTP runtime is expressible in Galerina. Runtime at 75%.

### Phase 41 — Self-Hosting Bootstrap
**Impact: RUNTIME AT 50% — Stage B compiles a Stage A utility module**

```bash
node bootstrap-verify.mjs
# Stage B compiled: hash-util.ts → hash-util.mjs
# Checksums match: ✓ BOOTSTRAP VERIFIED
```

Galerina is now partially self-hosting.

### Phase 42 — Galerina Interprets Galerina (Pure Flows)
**Impact: pure flow interpreter written in Galerina**

```galerina
pure flow interpretAdd(a: Int, b: Int) -> Int
contract { effects {} }
{ return a + b }
// This IS the interpreter for add() — written in Galerina
```

The pure-flow evaluator (the hot path) is expressed as Galerina flows compiled to WASM.

### Phase 43 — HTTP/2 Governed Service
**Impact: production-grade HTTP serving in Galerina**

HTTP/2 + TLS. Every connection carries `connection_id` in audit. The `serve()` function becomes a `.spore` file:

```galerina
secure flow startServer(readonly config: ServerConfig) -> ServerHandle
contract { effects { network.bind audit.write } }
{ return Server.listen(config.port) }
```

### Phase 44 — Capability Host in Galerina
**Impact: RUNTIME AT 75% — capability management expressed as Galerina flows**

```galerina
secure flow resolveCapability(readonly request: CapabilityRequest) -> CapabilityLease
contract {
  effects { capability.resolve audit.write }
  safety { require deterministic_execution }
}
{
  let proof = ProofGraph.verify(request.flowSignature)?
  let lease = CapabilityLease.create(proof, request.capability, 300ms)?
  AuditLog.write({ event: "CapabilityLeased", capability: request.capability })
  return Ok(lease)
}
```

### Phase 45 — AI Governance Layer
**Impact: Galerina governs AI inference inside the runtime**

```galerina
contract {
  ai {
    approved_models { local_llm gpt5 }
    max_model_calls 3
    require audit_interlock
  }
}
```

---

## Block 5: Runtime 100% (Phases 46–50)

**Goal:** Galerina v1.0 — full runtime in Galerina, production deployed, certified shapes.

### Phase 46 — Compliance Packages Public Beta
`@galerina/compliance-eu-ai-act`, `@galerina/compliance-hipaa`, `@galerina/compliance-soc2` released.

### Phase 47 — Hardware Attestation (Intel TXT/SGX)
ProofGraph includes hardware attestation quote when native code runs inside SGX enclave.

### Phase 48 — Audit Writer in Galerina
The last major runtime component expressed in Galerina:

```galerina
secure flow writeAuditRecord(readonly event: AuditEvent) -> Void
contract {
  effects { audit.write filesystem.append }
  safety { require append_only require deterministic_execution }
}
{ AuditStore.append(event) }
```

### Phase 49 — Formal Verification (Lean4)
ProofGraph exports to Lean4 proof format. DO-178C compliance certificate generation.

### Phase 50 — Galerina v1.0 RC — RUNTIME AT 100%

**Criteria:**
- ✅ HTTP server is a Galerina governed service
- ✅ Capability host is Galerina flows
- ✅ Audit writer is Galerina flows
- ✅ Stage B compiles Stage A utilities
- ✅ WASM binary runs the hot path at native speed
- ✅ Governance proven at compile time — zero runtime policy checking
- ✅ ~3,153 tests, 0 failures
- ✅ One production deployment with real traffic

---

## Runtime Progress Tracker

| Milestone | Phase | % | Key deliverable |
|---|---|---|---|
| HTTP serving | 34 | **25%** | `verifyPassword` endpoint live |
| Governed pipeline | 36 | **35%** | Deno Deploy, audit in production |
| Self-hosting | 41 | **50%** | Stage B compiles Stage A |
| Capability in Galerina | 44 | **75%** | Capability host expressed in .spore |
| Audit in Galerina | 48 | **90%** | Audit writer expressed in .spore |
| v1.0 RC | 50 | **100%** | Full runtime in Galerina, deployed |

---

## Executing Block 1 Now

The immediate 5 phases:

```
Phase 27B: Sync fast-path (50-100× tree-walker)
Phase 28:  Profile enforcement + Tainted<T> + constant-time comparison
Phase 28B: galerina diff CLI
Phase 29:  galerina-core-economics (CostGraph)
Phase 30:  Governance overhead <3%
```

These are foundation phases that make the runtime fast enough and secure enough for HTTP serving (Phase 34).
