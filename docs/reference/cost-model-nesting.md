# Cost model — nesting, "level 0", and what actually costs

**What.** The `.fungi` cost model for *structure*: which source constructs are erased or lifted at compile time
(zero runtime instructions — "level 0"), and which constructs carry real cost. **Where.** Decided by the compiler
pipeline (`parseProgram → checkEffects → emitGIR → renderWAT`); the evidence below is regenerated from that exact
pipeline by `scripts/emit-doc-wat.mjs` (a drift gate keeps it honest — the quoted WAT cannot rot). **How.** Write
for the reader: nest blocks freely, attach every contract clause the flow deserves, and spend your optimisation
attention only on the things in Table B. **Result.** Source shape is a readability choice, not a performance
choice; governance text is free at runtime; the real costs are algorithmic and boundary-shaped, as in any
compiled language.

> **Structure is free.** *Nest blocks away.* **Safety text is free** — add every contract clause your flow
> deserves; none of it runs in your body. Compiled languages also erase nesting — the distinctive part here is
> that **the governance layer is also structure**, compiling to zero body instructions.
>
> Two qualifiers, always: **loops are your algorithm** (a loop in a loop is O(n·m) in every language ever), and
> **flow calls cost today** (compose small flows for correctness; the planned inliner pays the call cost — never
> hand-flatten a security fold to save a call).

## Table A — "level 0": erased or lifted at compile time

| Construct | Real example | What happens |
|---|---|---|
| The `flow` wrapper | [`synchronization-gate.fungi`](../../packages-galerina/galerina-core-sentinel-time/src/self-hosted/synchronization-gate.fungi) → the WAT below | the body IS the function; params become indexed locals (`$p0…`); no wrapper scope survives lowering |
| The `contract` block | the same flow — its `contract { intent … }` | **zero instructions emitted** — checked at compile time, carried in the signed manifest, enforced at the border; its text appears nowhere in the WAT below |
| Block nesting | [`nesting-shape.fungi`](examples/cost-model/nesting-shape.fungi) — `classifyDeep` vs `classifyFlat` | the deep-styled and flat-styled flows lower to the same control-flow structure; shape is for the reader |
| Comments · annotations · types | any example file here | comments/annotations are erased; types resolve at compile time and emit nothing of themselves |

### The evidence — the emitted WAT (regenerated, never hand-edited)

`syncGateVerdict` + `driftGateVerdict` from the sentinel-time twin, exactly as the current emitter lowers them.
Three things to read off it: the `contract` text is absent (level 0); the params are indexed locals; and
`driftGateVerdict` contains a real `call $syncGateVerdict` — which is Table B row 1.

<!-- emit-doc-wat:BEGIN source=packages-galerina/galerina-core-sentinel-time/src/self-hosted/synchronization-gate.fungi flows=syncGateVerdict,driftGateVerdict -->
```wat
(func $syncGateVerdict (param $p0 i32) (result i32)
    (if (i32.eq (local.get $p0) (i32.const 0))
      (then
        (return (i32.const -1))
      )
    )
    (i32.const 1)
  )

(func $driftGateVerdict (param $p0 i32) (param $p1 i32) (param $p2 i32) (result i32)
    (if (i32.lt_s (call $syncGateVerdict (local.get $p0)) (i32.const 1))
      (then
        (return (i32.const -1))
      )
    )
    (if (i32.gt_s (local.get $p1) (local.get $p2))
      (then
        (return (i32.const -1))
      )
    )
    (i32.const 1)
  )
```
<!-- emit-doc-wat:END -->

## Table B — NOT level 0: the things that really cost

| Construct | Real example | The honest note |
|---|---|---|
| Flow **calls** | `driftGateVerdict` → `call $syncGateVerdict` in the WAT above | a call carries frame/arg cost today (see the call-chain benchmark). Compose small flows for correctness and let the compiler pay the call cost — the planned inliner is the fix; hand-flattening a security fold is never the fix |
| Nested **loops** | [`loops-cost.fungi`](examples/cost-model/loops-cost.fungi) — `gridChecksum(rows, cols)` | the body runs rows×cols times: algorithmic complexity, true in every language. "Nest away" is about *blocks*, not O(n·m). The emitted per-loop fuel counter traps at the platform cap, so even a mis-bounded nest is bounded by construction |
| **Host-boundary** crossings | [`secret-gate.fungi`](../../packages-galerina/galerina-framework-app-kernel/src/self-hosted/secret-gate.fungi) — each `required.count()` / `.get(i)` crosses the host bridge | each crossing is real overhead — batch the work per crossing rather than chattering across the seam |
| The **dev/check lane** | — | the tree-walking interpreter pays per AST node; that is the dev/verification lane (being retired by the execution cutover). The compiled lane is the product — read the WASM ▶ production benchmark row, not the interpreter rows |

## Declare the contraction — the compiler owns the depth

Prefer a **declared fold/contraction** to a hand-written nest. The in-tree shape is the
[`b8-admission.fungi`](../../packages-galerina/galerina-core-network/src/self-hosted/b8-admission.fungi) twin: the
request verdict is a declared K3 conjunction — `vAnd` (min) folded over every gate verdict — not an opaque ladder
of nested `if`s. The difference is not style:

- a **declared fold** tells the compiler the algebra (min/max is a monoid; DENY absorbs), which licenses the
  planned depth-ladder work — absorbing-element short-circuit *as a declared, contract-visible mode* (constant-time
  stays the default where secrets are adjacent), SIMD trit folds, and proof-licensed loop collapse;
- a **hand-nest** hides that structure, so the compiler must run it exactly as written.

Write the meaning; let the compiler own the depth.

## Where this page's claims come from

- The WAT excerpt is regenerated by `scripts/emit-doc-wat.mjs` (`--check` is a phase-close gate; `--write`
  refreshes after an emitter change). The pipeline used is the same one the twin-execution tests run.
- Every linked `.fungi` example compiles clean under `galerina check` (plain and `--strict-types`) and is
  re-verified by `audit-syntax-reference-links` and the `fungi:corpus-check` gate.
- Related pages: [types](types.md) · [effects](effects.md) · the
  [contract-authoring model](../contract-authoring-model.md) · the
  [three-valued logic primer](three-valued-logic-primer.md) · the language
  [SYNTAX-REFERENCE](../language/fungi/SYNTAX-REFERENCE.md).
