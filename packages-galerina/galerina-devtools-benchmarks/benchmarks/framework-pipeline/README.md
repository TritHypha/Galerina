# framework-pipeline — native framework vs middleware

Measures **one full successful request** through a governed request pipeline, **in
process** (no sockets — so it measures pipeline cost, not localhost RTT).

One operation = `POST /orders` with a JSON body + auth header, run through every gate
to a handler returning `200`. The gates are identical across runtimes: route match →
policy → body-size → content-type → auth → JSON decode → idempotency → concurrency →
dispatch → encode → audit.

## Columns

| Column | What it actually is |
|---|---|
| **Node.js** | **Galerina's shipped App Kernel** (`@galerina/framework-app-kernel`, `createAppKernel().handle()`). A **fixed, non-bypassable 12-gate pipeline** — there is no middleware chain; the gate order is compiled in and cannot be reordered or skipped. It is plain TypeScript-on-Node (not the Stage-A tree-walker), and async (Tri-Pipe audit off the critical path). |
| **Python** | An equivalent **sync middleware-style gate chain** (stdlib only) doing the *same* gates. A real middleware framework (FastAPI/Flask + validation/auth/rate-limit packages) would be **slower**, so this is a conservative, not a rigged, baseline. |

## Honesty notes

- **This is not a "Galerina wins on speed" benchmark.** The App Kernel is plain JS, so it
  beats a Python gate chain and loses to native (Rust/Go) — report it straight.
- The kernel is **async**; the `architecture` block in `node.mjs` output also reports a
  same-language **sync** breakdown so the async cost is visible:
  `galerinaAppKernel(async)` vs `handRolledMiddlewareChain(sync)` vs `rawNoGovernance(sync)`.
  In-language, a sync hand-rolled chain is *faster* than the async kernel — the kernel's
  cost is the audit/async machinery, not the gates.
- **The real "remove middleware" win is structural, not throughput** — a scorecard the
  raw req/s number does not capture:

  | Property | Galerina App Kernel | Express/Flask + middleware |
  |---|---|---|
  | Dependencies for size+ct+auth+idempotency+ratelimit+audit | **0 (built in)** | ~8–12 npm/pip packages |
  | Gate order | **fixed, compiler-known, non-bypassable** | hand-wired `app.use(...)` — reorderable (the auth-after-dispatch footgun) |
  | "Auth can be accidentally placed after dispatch" | **impossible** | possible (the ServiceNow/Tchap failure class) |
  | Secure-by-default (omitting a block = max security) | **yes** | no (must remember each middleware) |

- Correctness gate: the kernel probe must return `200` (full pipeline reached the
  handler) or the runner exits non-zero — a misconfigured pipeline is excluded, not charted.
