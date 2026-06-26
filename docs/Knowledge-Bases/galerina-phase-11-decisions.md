# Galerina Phase 11 — Design Decisions

## Status

```
Recorded: 2026-05-30
Applies to: Phase 11A–11D implementation
```

---

## Decision 1 — Loops stay future-reserved through Phase 11A

`for`, `while`, `loop`, `until` remain in `V1_FUTURE_RESERVED`. No user-facing loop syntax in v1 core.

**v1 iteration model:** collection methods and stdlib helpers only.
```galerina
inputs.map(...)
inputs.filter(...)
inputs.reduce(...)
Result.sequence(...)
```

Reason: unbounded loops make timeouts, limits, audit proof, effect propagation, termination reasoning, and AI comprehension harder.

For retry logic, use contract declarations not hand-written loops:
```galerina
retries {
  network.outbound { attempts 3 strategy exponential_backoff }
}
```

**Phase 11 plan:** introduce `while`, `do until`, and possibly `for each` deliberately in Phase 11, not Phase 10.

---

## Decision 2 — `mut` unlocks real reassignment in Phase 11A

`mut` is not just an intent marker — it must unlock actual reassignment.

```galerina
mut count: Int = 0
count = count + 1       // allowed

let count: Int = 0
count = count + 1       // SPORE-BINDING-XXX: Cannot reassign immutable binding
```

Stage A may parse `mut` without enforcing reassignment.
Phase 11A must enforce:
- `let` → immutable, reassignment = error
- `readonly` → immutable, reassignment = error
- `mut` → mutable, type-stable (type cannot change on reassignment)

Expected Phase 11A diagnostic:
```text
SPORE-BINDING-XXX (name TBD)
Cannot reassign immutable binding 'count'.
Use mut if reassignment is intended.
```

---

## Decision 3 — Wire CEC into the test suite

The Canonical Example Corpus (215 examples in `docs/Examples/`) must be executable integration tests.

```text
npm test should:
  - compile every docs/examples/**/*.spore file
  - compare actual diagnostic codes to expected.diagnostics.txt
  - fail on mismatch
```

**Staged rollout:**
- Phase 1: `test_status: stable` examples only — code-level match
- Phase 2: all examples — code + message match
- Phase 3: enforce strict zero-diff

**Metadata convention** (add to example headers):
```galerina
/// test_status: stable    ← included in CI assertions
/// test_status: draft     ← compiled but not asserted
```

**Matching rules:**
- `expected.diagnostics.txt` contains `none` → zero ERROR-level diagnostics
- `expected.diagnostics.txt` contains `SPORE-XXX-YYY` → at least one diagnostic with that code must fire
- Match diagnostic **codes** first; message matching comes later

---

## Decision 4 — Internal graph module now, standalone package later

**Do not create `C:\laragon\www\SPORE-Graph\` yet.**

Create internal graph module now as:
```
packages-galerina/galerina-devtools-graph/
```

Design it with extraction in mind (clean interfaces, tests), but keep it internal until:
- At least 2 Galerina packages use the same graph code
- GIR schema has stabilised
- Runtime report format has stabilised
- Graph APIs have tests

What to build inside it now:
- Flow dependency graph
- Call graph
- Effect propagation graph
- Value-state graph
- GIR node graph
- Runtime report event DAG

**Extraction trigger:** When concepts stabilise, move to `C:\laragon\www\SPORE-Graph\` standalone Apache 2.0 package.

---

## Decision 5 — `result of X else Y` remains documentation only

`Result<X, Y>` is canonical compiler syntax. `result of X else Y` is explanatory prose in docs only.

**Do not implement parser support yet.**

Reason: Readable Logic Forms are still pilot-only. Adding readable type parsing widens the grammar before the pilot proves value.

Contract examples must use canonical syntax:
```galerina
type GetPatientResult = Result<Response, ApiError>
```

If the readable form appears in docs, mark it clearly as proposal:
```galerina
// Proposed readable alias (not parser-supported yet):
// type GetPatientResult = result of Response else ApiError
```

**Later adoption path:** if Readable Type Forms pilot succeeds, `result of X else Y` parses to same AST as `Result<X, Y>` with `readableForm` preserved.

---

## Decision 6 — Phase order: 11C before 11D

```
Phase 11C: enforce contract runtime controls (timeouts, retries, limits)
Phase 11D: Governed Memory Blocks (runtime value protection)
```

Reason: contracts must be real before memory blocks. A contract that declares `timeout 5 seconds` but is ignored is not a contract — it is documentation.

**Phase 11C minimum enforcement:**
```
timeouts: abort/cancel flow after deadline; enforce operation timeouts
retries:  retry according to contract; forbid undeclared infinite retries
limits:   max request size; max batch size; max memory; max prompt size
```

**Runtime report must include contract_enforcement section:**
```yaml
contract_enforcement:
  timeouts:
    deadline_ms: 5000
    exceeded: false
  retries:
    database.read:
      attempts_used: 1
      max_attempts: 2
  limits:
    request_size_bytes: 842
    max_request_size_bytes: 1048576
```

---

## Revised Phase 11 execution order

```
Phase 11A.1  — CEC tightening (promote stable examples, fix expected.diagnostics.txt)
Phase 11A.2  — mut reassignment enforcement (SPORE-BINDING-XXX)
Phase 11A.3  — inferType() member access chains (patient.id → String, etc.)
Phase 11B    — Value-state taint completion
Phase 11C    — Contract runtime enforcement (separate runtime layer, not interpreter.ts)
Phase 11D    — Governed Memory Blocks
Phase 11E    — Package system (import resolution)
Phase 12     — Stage B (Galerina compiles Galerina)
```

## Decision 7 — galerina-devtools-graph integrates into compiler now

Replace manual call graph / topoSort in `effect-checker.ts` with `buildCallGraph` and `topoSort`
from `galerina-devtools-graph` now. API is plain data — no compiler types flow into the graph package.
One-way dependency: `galerina-core-compiler` → `galerina-devtools-graph`. Never the reverse.

## Decision 8 — GIR emitter handles #record now

`callExpr { value: "#record" }` (record literals) must not be silently skipped in the GIR emitter.
Record literals appear in AuditLog.write, Response.okJson, and database inserts.
Skipping would cause missed diagnostics for protected values in responses and unsafe values in sinks.

## Decision 9 — Phase 11C uses a new runtime enforcement layer

`interpreter.ts` is already 900+ lines. Phase 11C contract enforcement goes into a new
`src/runtime/` layer: `contractEnforcer.ts`, `runtimeContext.ts`, `runtimeReport.ts`,
`retryPolicy.ts`, `timeoutPolicy.ts`, `limitPolicy.ts`.

```typescript
await contractEnforcer.withTimeout(contract.timeouts, async () => {
  return await interpreter.executeFlowBody(flow)
})
```

## Decision 10 — spore-graph renamed to @galerina/devtools-project-graph

The standalone package at `C:\laragon\www\SPORE-Graph\` is renamed from `spore-graph` to
`@galerina/devtools-project-graph`. Consumed via `github:galerina/spore-graph` (not `file:` path).
It is the **only package outside the monorepo** — all others live in `packages-galerina/`.

---

## See Also

- `galerina-phase-10-roadmap.md` — completed Phase 10 items
- `galerina-governed-memory-blocks.md` — Phase 11D spec
- `galerina-contract-full-model.md` — 16-section contract canonical reference
- `galerina-contract-operational-constraints.md` — timeouts/retries/limits spec
