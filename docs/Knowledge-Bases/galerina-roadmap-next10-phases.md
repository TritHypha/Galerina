# Galerina — Next 10 Phases Roadmap (Phase 28 → 37)

**Primary goal: Runtime written in Galerina at 100%**
**Current: Phase 69 complete. 2,952 tests passing (2810 compiler + 15 economics + 95 graph + 32 security).**
**Status: Phases 28–45 complete. Phase 41 syntax (when guards, integer match, inline contract, SPORE-SYNTAX-010) canonical.**

---

## Where We Are

| Component | State |
|---|---|
| WAT emitter | ✅ arithmetic, control flow, mut/assign, else-if |
| WASM execution | ✅ all 8 benchmarks run via WebAssembly.instantiate |
| Sync fast-path | ✅ Phase 27B — 2.7-4× tree-walker improvement |
| Tree-walker perf | ⚫ still 100×+ slower than Node on arithmetic |
| HTTP serving | ❌ not yet — `serve()` is TypeScript |
| Self-hosting | ❌ Stage B not yet compiling Stage A |
| Runtime in Galerina | **0%** — runtime is TypeScript |

The 10 phases below take the runtime from 0% to ~50% (first governed HTTP service + self-hosting bootstrap).

---

## ✅ Progress (2026-06-02 — Phase 69)

| Phase | Status | Delivered |
|---|---|---|
| **28** | ✅ DONE | `checkProfiles` (SPORE-PROFILE-001/002/006), `checkTaint` (SPORE-TAINT-001/003/004), OWASP catalogue |
| **29** | ✅ DONE | `@galerina/core-economics` package — CostGraph, ValueGraph, IBM risk matrix, RouteDecision (governanceApproved literal) |
| **30** | ✅ DONE | `buildProofGraphCached` — ExecutionSignature-keyed proof shape cache (67% hit rate on same-shape flows) |
| **31** | ✅ DONE | Bytecode VM — Int32Array opcodes, 14.3× over sync tree-walker, ~300× over async governed |
| **32** | ✅ DONE | `galerina diff` governance delta CLI (exit 2 on authority widening) + governance-diff module |
| **33A** | ✅ DONE | Tier telemetry — executionTier + fallbackReason on FlowExecutionResult. All 5 tiers tagged: cache/bytecode/sync/egraph/tree |
| **34** | ✅ **DONE** | **`verifyPasswordService.spore` IS a live governed HTTP service** — `POST /auth/verify` → governance → `BCrypt.verify` (real bcrypt) → audit → governed JSON. **Runtime-in-Galerina = 25%.** +13 tests. |
| **35** | ✅ DONE | Password.verify/hash/needsMigration — stable API facade over bcrypt/Argon2 |
| **36** | ✅ DONE | Argon2.hash/verify (Argon2id, OWASP preferred). Password.verify auto-routes by hash prefix |
| **37** | ✅ DONE | Password.migrate — verify+rehash bcrypt→Argon2id on successful verify |
| **38** | ✅ DONE | Deno WebGPU GPU benchmark live — RTX 3050 Ti, 3.99M ops/sec, result=1,000,000,000 |
| **39** | ✅ DONE | GovernanceSignature Ed25519 — signProofGraph/verifyGovernanceSignature, tamper-detection verified |
| **40** | ✅ DONE | Stage B executable — compiler.capabilities.spore (8 flows), lexer.spore (makeKeywordTable=40kw, scanWord works). 20 bootstrap tests. |

| **41** | ✅ DONE | Phase 41 syntax: `when` guard match arms, integer/string literal match, inline contract (contract first in flow body), `:` return type canonical, `else if` → SPORE-SYNTAX-010 hard error. 13 new tests. |
| **45** | ✅ DONE (partial) | Bytecode VM Phase 45: `callExpr` support added, callee AST threaded through compiler, subPrograms map in BytecodeProgram. Integer-only restriction maintained; call VM path deferred to Phase 45B. |

**Test count: 2,810 compiler + 15 economics + 95 graph + 32 security = 2,952 total, 0 failures.**

Phase 33 (fast-tier coverage) is scheduled but deferred behind the runtime goal. Phases 35–37
next: Password API abstraction + wasmtime CLI (35), Argon2id + Deno Deploy (36), auto
hash-migration + ValueGraph routing (37).

> **Phase 34 note:** new stdlib `BCrypt.verify`/`BCrypt.hash` (via `bcryptjs`, real `$2b$`
> hashes), registered with `crypto.verify` effect + stdlib-registry entry. Response
> serializer now treats a plain record as the JSON body (convention over configuration —
> the `__httpStatus`/`__body` envelope is opt-in). Hash store = in-memory fixture.

---

## Phase 28 — Profile Enforcement + Security Types
**Theme: Governance completeness**
**Runtime %: 0% (foundation)**

1. `profile strict` / `profile high_integrity` → real compiler errors (SPORE-PROFILE-001..007)
2. `Tainted<T>` — external input cannot reach a sink (`database.query`, `html.render`, `shell.exec`) without an explicit sanitiser boundary
3. Constant-time comparison — `ProtectedSecret<T> ==` → SPORE-SECURITY-001 (force `.constantTimeEquals()`)

**Why now:** Before the runtime accepts external HTTP requests, the security type system must prevent injection at compile time.

**Research needed:** Which sanitiser functions should be the recognised "untaint" boundaries? Which sinks are mandatory-tainted-checked?

---

## Phase 29 — `galerina-core-economics` Package (CostGraph)
**Theme: Economic routing**
**Runtime %: 0% (foundation)**

```
total_cost = compute_cost + audit_cost + governance_cost + AI_cost + network_cost + risk_cost
```

CostGraph auto-routes: pure flow → WASM path, effectful flow → governed CPU path. Reads ProofGraph + hardware profile, never modifies governance.

**Why now:** The runtime needs to decide WHERE each flow executes (WASM vs tree-walker vs CPU). CostGraph is that decision engine.

**Research needed:** Real-world cost figures — cloud compute £/CPU-hour, AI token pricing, audit storage costs, breach cost benchmarks per industry.

---

## Phase 30 — Governance Overhead <3%
**Theme: Performance**
**Runtime %: 0% (foundation)**

ProofGraph caching by ExecutionSignature. Two flows with identical governance shape share one ProofGraph — build once, reuse. Target: governed/manifest ratio from ~2× to <1.05×.

**Why now:** The runtime will run governance on every request. It must be near-free.

**Research needed:** None — internal optimisation.

---

## Phase 31 — Bytecode VM for Pure Flows
**Theme: Performance — the big one**
**Runtime %: 0% (foundation)**

Compile pure flows to flat `Int32Array` bytecode. Tight synchronous `while(pc<len)` loop. No objects, no async, no AST traversal per call.

Target: arithmetic-threshold tree-walker 850K/s → 50M+/s (closes the ⚫ black gap to 🟡 yellow vs Node).

**Why now:** The runtime's own flows (capability resolution, audit) run as Galerina — they must be fast.

**Research needed:** None — internal. (Reference: how QuickJS / Lua bytecode VMs structure their opcode dispatch.)

---

## Phase 32 — `galerina diff` + Stage B Lexer Parity
**Theme: Tooling + self-hosting prep**
**Runtime %: 0% (foundation)**

Two parallel tracks:
1. `galerina diff main..branch` — governance delta JSON (effects/capabilities/values changed)
2. Stage B lexer reaches 100% parity — can tokenise all 223 CEC examples

**Why now:** Stage B lexer is the first step to self-hosting (the 75% runtime milestone). `galerina diff` is the PR-review tool.

**Research needed:** None.

---

## Phase 33 — Fast-Tier Coverage + Hardware Routing
**Theme: Performance + hardware**
**Runtime %: 0% (foundation)**

> **Why this matters for the runtime:** the runtime's OWN flows (capability resolution,
> audit, governance checks) will run as Galerina. They must hit the fast tiers, not the
> tree-walker. Closing the black-gap is a prerequisite for a usable governed runtime.

**Root-cause (confirmed by benchmark + audit):** the slowdown is execution *shape*, not
governance policy. Real flows fall OUT of the bytecode VM / WASM into the governed
tree-walker (316 bytes/op, high dispatch cost). The fix is to **shrink the set of flows
that fall back** — every flow moved onto WASM or the bytecode VM fixes its CPU *and*
memory in one move (0.10 bytes/op vs 316).

This phase is **telemetry-gated and deliberately lean** — 2 mechanisms, not 6. See
`galerina-performance-plan.md` and the "Conditional perf work" note below for the
items intentionally deferred.

### Phase 33A — Tier telemetry (DO FIRST, prerequisite for everything)
- Per-benchmark report of which tier executed (`wasm` / `bytecode` / `tree`)
- Fallback-reason counts (unsupported op, dynamic shape, recursion, policy gate)
- Allocations/op + GC pause stats, not only throughput
- **Gate:** measure before building anything. Telemetry may reveal some black cells
  (e.g. `arithmetic-threshold`) are *deliberately forced* onto the governed path for
  comparison, not what real flows do — in which case the problem is smaller than the
  table suggests and later sub-phases shrink accordingly.

### Phase 33B — Expand the ONE fast tier (the 80% win)
- **Pure flows → widen WASM lowering** (WASM beats the bytecode VM where it applies)
- **Governed-simple flows → widen bytecode VM**: records (fixed slot maps), bool/branch
  /match opcodes, and **recursion on the VM's own call stack** (this is the real fix for
  `governance-cost`, not a separate trampoline)
- Compile-time eligibility bitmask from GIR/semantic graph chooses the tier
- Skip boxing entirely for Int×op×Int hot paths (raw number arithmetic until flow boundary)

### Phase 33C — Cheap, broad memory win
- Replace per-call `Map` allocation with static slot arrays where keys are known at
  compile time (helps even the fallback path; low risk, broad benefit)

### Phase 33D — Hardware routing
- CostGraph routes to WASM / CPU / NPU based on hardware profile (Phase 29 + 33 combine)
- Hybrid Two-Tier detection: WASM core requests "fast matmul"; host (i5/i9) decides
  AVX2 vs scalar. Core never sees CPU specifics (see Locked Decisions).

**Re-measure gate after 33B/33C:** only then decide whether the conditional work below
is even needed. Likely it is not.

**Semantics constraint:** identical governance, effect, audit, taint, and proof behavior.
Only execution *representation* changes. Every sub-phase ships with semantic-parity,
governance-parity, audit-parity, and determinism tests (optimized tier output ==
tree-walker output; same diagnostics; same deny/allow; same audit event set).

**Research needed:** Confirm the i5/i9 hardware detection approach — is CPUID via Node.js
feasible, or do we shell out to a native helper?

### Conditional perf work (DEFERRED — only if 33A telemetry justifies it)
These were proposed but are **parked**, because they either duplicate 33B or polish the
path we are trying to abandon. Build only if telemetry proves a concrete need:
- ❌ **Separate "pre-decoded plan" interpreter tier** — a pre-decoded, symbol-resolved
  instruction stream *is* a bytecode VM. Don't maintain two fast tiers; fold into 33B.
- ❌ **Monomorphic inline caches** (shape guards + deopt) — most complex/bug-prone item;
  optimizes the tree-walker we're trying to stop landing in. Low ROI.
- ❌ **Recursion trampoline** — narrow (proof-of-equivalence gate); recursion-on-VM (33B)
  is the better framing for the same win.
- ❌ **Arena / frame reuse** beyond slot arrays — defer; if 33B succeeds the hot flows
  aren't in the tree-walker anyway.

---

## Phase 34 — `verifyPassword` Governed HTTP Service
**Theme: FIRST DEPLOYMENT**
**Runtime %: 25% 🎯 — first real governed endpoint**

```galerina
secure flow verifyPassword(readonly req: HttpRequest) -> HttpResponse
contract {
  effects { network.inbound audit.write }
  privacy { pii { password } }
}
{ ... }

route POST "/auth/verify" { verifyPassword }
```

The first `.spore` file that IS the runtime service. HTTP request → governance check → WASM execution → response.

**Decided (2026-06-01):** Node.js `http` substrate (locked). bcrypt hashing via `BCrypt.verify`
(already in stdlib allowlist + taint boundary). **In-memory fixture** hash store for the
demo — proves the governed HTTP → execution → response path with zero infra.

### Password handling track (decided 2026-06-01) — matures across Phases 34–37
| Phase | Password capability |
|---|---|
| **34** | **bcrypt** — `BCrypt.verify`, in-memory fixture store |
| **35** | **Password API abstraction** — stable `Password.verify` facade over the hash backend |
| **36** | **Argon2id** — OWASP-preferred memory-hard scheme behind the same facade |
| **37** | **Automatic hash migration** — transparently re-hash bcrypt → Argon2id on successful verify |

> This track runs alongside the deployment milestones already on Phases 35–37 (wasmtime
> CLI, Deno Deploy, ValueGraph routing) — password handling is the feature that matures
> while deployment surface expands.

---

## Phase 35 — wasmtime CLI Deployment
**Theme: Standalone deployment**
**Runtime %: 30%**

```bash
galerina build --target wasm-wasi -o auth.wasm auth/verifyPassword.spore
wasmtime run auth.wasm
```

Galerina service runs outside Node.js as a standalone WASM binary.

**Research needed:** WASI HTTP proposal status (wasi-http) — is it stable enough to target, or use a wasmtime host shim?

---

## Phase 36 — Deno Deploy First Endpoint
**Theme: Production traffic**
**Runtime %: 35%**

First external traffic served by a governed Galerina service. Audit → Deno KV. ProofGraph downloadable from `/governance/proof`.

**Research needed:** Deno Deploy WASM support limits — memory, cold start, KV pricing. Alternative: Cloudflare Workers (also WASM-based)?

---

## Phase 37 — ValueGraph + Risk-Adjusted Routing Live
**Theme: Economics in production**
**Runtime %: 40%**

CostGraph makes real routing decisions: `cloud path £70,001 expected cost → enclave path £3,500` — economics chooses the enclave. First live governance-first economics.

**Research needed:** Real breach cost data per data classification (medical, financial, etc.) to calibrate the risk model.

---

## The 10-Phase Arc

```
Phase 28: Profile enforcement + Tainted<T>      [governance + security]
Phase 29: galerina-core-economics (CostGraph)     [routing engine]
Phase 30: Governance overhead <3%               [perf: near-free governance]
Phase 31: Bytecode VM                           [perf: close the black gap]
Phase 32: galerina diff + Stage B lexer           [tooling + self-host prep]
Phase 33: Fast-tier coverage + HW routing       [perf — telemetry-gated, lean]
          33A telemetry → 33B widen WASM/VM → 33C slot arrays → 33D HW routing
          (plan-tier / inline-caches / trampoline DEFERRED unless telemetry proves need)
Phase 34: verifyPassword HTTP service     🎯 RUNTIME 25%
Phase 35: wasmtime CLI                          [standalone WASM]
Phase 36: Deno Deploy                           [production traffic]
Phase 37: ValueGraph risk routing live          [economics in prod] → RUNTIME 40%
```

By Phase 37: a governed Galerina service serving real HTTP traffic, with the runtime
40% expressed in Galerina, economic routing live, and bytecode VM closing the perf gap.

Phases 38-50 (next block) take it to self-hosting (50%), capability host in Galerina (75%),
and v1.0 (100%).

---

## Locked Decisions (2026-06-01)

### HTTP Substrate (Phase 34-37): Node.js http first, WASI later
- Phase 34: `serve()` uses Node.js `http` module — fastest path to a working endpoint.
- Phase 35: migrate the hot path to WASI; keep Node.js shell for capabilities.
- This is the pragmatic path — get governed traffic flowing, optimise deployment after.

### Deployment Reality: DigitalOcean (terminable) + i9 desktop (truth)
- **Performance truth:** the i9 Windows desktop is the canonical benchmark machine.
  The project may migrate there when ready.
- **Deployment:** DigitalOcean droplet — cost-effective IF the server can be terminated
  when not in use. This means the Galerina service must support:
  - Fast cold start (WASM binary, minimal init)
  - Clean shutdown (flush audit, close connections) — `flow finalizer` already exists
  - Stateless-friendly design (audit to persistent store, not local memory)
- **AI economics:** OpenAI pricing is the calibration source for the AI_cost term.

### Taint Model (Phase 28): Hybrid — sanitiser + validator
- **Injection sinks** (`database.query`, `html.render`, `shell.exec`) require a named
  stdlib sanitiser: `Sql.escape`, `Html.escape`, `Shell.quote`. Only these convert
  `Tainted<T>` → `T` at an injection boundary.
- **Business-logic sinks** accept any `Validated<T>` (integrates with existing value-state).
- Two diagnostic series: `SPORE-TAINT-001` (injection sink, raw tainted) and
  `SPORE-TAINT-002` (logic sink, unvalidated).

### Hardware Detection (Phase 33): Hybrid Two-Tier Design
- **Tier 1 — WASM workspace (portable core):** the application engine runs entirely
  inside WASM. Completely isolated, portable, secure. Knows nothing about the host CPU.
- **Tier 2 — Host capability exposure:** the host system (Node.js shell on i5/i9)
  detects specialised silicon (AVX2, AVX-512, P/E-cores) and exposes those
  optimisations to the WASM workspace through a defined host-import interface.
- The WASM core requests "fast matrix multiply"; the host decides whether to use
  AVX-512 (i9), AVX2 (i5), or scalar fallback. The core never sees CPU specifics.
- This keeps the WASM-first architecture rule intact: governance + execution stay
  portable; hardware acceleration is a host-provided capability, never baked into
  the core binary.

### Economic Calibration Sources
| Term | Source |
|---|---|
| compute_cost | i9 desktop (real CPU-time) + DigitalOcean droplet pricing |
| AI_cost | OpenAI API pricing (per-token) |
| network_cost | DigitalOcean bandwidth pricing |
| risk_cost | (research pending — breach cost data per industry) |
| audit_cost | DigitalOcean storage pricing |
