# Component-readiness honest audit — 2026-07-10

**Purpose.** The `scripts/component-health.mjs --table` topline (64.9% at the start
of this session) is often read as "36% of tests are missing." That reading is
wrong, and this note records the *real* shape of the gap so the remaining work is
scoped honestly and not "greened" by writing tests over code that does not exist.

Scope note (unchanged): component-health measures **workspace packages only**
(92 + 2 orphans = 94). Root CLI, `scripts/`, `examples/`, `docs/`, and the
self-hosted corpus have their own gates (phase-close, lint-conventions, keep-green).

## The gap is implementation, not tests

Every non-green workspace package falls into exactly one of three buckets:

| Bucket | What it means | Packages | Honest path to green |
|---|---|---|---|
| **Green** | source + real `tests/` + recorded count | 61 (→ 63 this session) | — |
| **Contract-only** | `src/index.ts` is a *type contract* (`export type`/`interface` only); the `test` script is just `tsc --noEmit` | target-native, target-wasm, target-gpu, target-photonic (4) | add fail-closed runtime validators + a real test, **mirroring the green sibling in the same family** (target-cpu / ai-neural) |
| **Impl without test** | has runtime code but no `tests/` dir | tools-benchmark (1) | write a behavioural test for the existing function(s) |
| **Scaffold-only** | `package.json` + `README.md` + `.graph/` metadata and **no `src/` at all** | data ×12, db ×5, web ×6, target-js (1) = **24** | **implement the subsystem** — this is product build, not a test pass |

### Why this matters for zero-trust

A scaffold-only package has **nothing to test**. Writing a test file (or, worse,
manufacturing a throwaway implementation *plus* a test) purely to turn the health
row green is **fail-open gate-gaming** — the exact move the house rules forbid.
The health tool is correctly red for these; the honest fix is to build them or to
consciously de-scope them (an owner decision), not to paint them green.

Contrast with the two packages completed honestly this session (below): they had a
**real type contract**, an **established sibling pattern** proving the runtime layer
belongs there, **genuine invariants** to enforce, and **verified** tests. That is
completion, not gaming.

## Completed this session (ai family → 100%)

- **`@galerina/ai-agent`** — added the runtime validators the sibling AI packages
  already carry (`validateAgentLimits`, `validateAgentToolPermissions`,
  `validateAgentDefinition`, `validateAgentTaskGroupPlan`, `applyAgentMergePolicy`,
  `createAgentReport`) + 21 behavioural tests. Fail-closed: unbounded limits are
  unsafe, allow+deny resolves to deny, evidence-less High/Critical findings are
  dropped, human review is forced on any not-passed run / unsafe tool / high-impact
  finding.
  *(Provenance: the validator body was drafted by a background worker; it was then
  read line-by-line, typecheck-verified, and pinned by tests before being kept —
  verify-don't-trust, not trust-the-worker. An initial instinct to revert it was
  itself checked and found wrong: the `Galerina_AGENT_*` diagnostic codes match the
  family convention exactly.)*
- **`@galerina/ai-neuromorphic`** — added `validateSpikeTrain`, `validateSpikingModel`,
  `validateNeuromorphicPlan`, `createNeuromorphicReport` + 14 tests. Fail-closed:
  unbounded event streams (no `maxEvents`/`timeout`) are unsafe; a plan with no
  target preference that also rejects fallback is unsatisfiable → error.

## Remaining, by honest effort

- **Contract-only (4)** — target-native/wasm/gpu/photonic. Each is a bounded,
  sibling-guided job (validators + one test file), completable on the main thread.
- **Impl-without-test (1)** — tools-benchmark. Small.
- **Scaffold-only (24)** — data, db, web, target-js. These are **real subsystems**
  (JSON streaming/validation/redaction, a web renderer + router + state, five DB
  adapters, a JS backend). Building them is not a test-writing pass and should not
  be auto-generated unattended. **Owner decision:** implement (large, staged) vs.
  de-scope from the readiness denominator until scheduled.

## Recommendation

1. Finish the *contract-only* + *impl-without-test* set honestly (5 packages) — this
   is genuine completion and lifts readiness to ~68/94 (~72%) with no gaming.
2. Leave the 24 scaffolds red and **visible**. Do not green them without real code.
3. Consider teaching `component-health` to label the three buckets distinctly
   (`scaffold` / `contract-only` / `impl-no-test`) so the topline can't be misread —
   without moving any package into "green" it hasn't earned.
