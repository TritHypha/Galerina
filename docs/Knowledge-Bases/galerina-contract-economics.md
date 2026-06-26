# Galerina Contract — `economics {}`

**Status (2026-06-03):** the `economics {}` contract sub-block **is parsed and retained**
by the Stage-A compiler (a first-class `contractDecl` child, alongside `effects`, `intent`,
`limits`, `value`, `secrets`, `epilogue`, …), and an auto-inference layer exists
(`economics-inference.ts`, `CostGraph`/`ValueGraph`, README "Economics Layer" ≈65%).
**Runtime *enforcement*** of the declared budgets (reject/throttle/route on overage) is
forward work. This doc is the conceptual + syntactic reference.

## Overview

The `economics` section lets a flow, service, or application declare **economic and resource
constraints as part of its architecture**. Traditionally software treats cost, compute, AI
usage, storage growth, and resource budgets as *operational* concerns discovered after
deployment. Galerina treats them as **architectural constraints** that can be declared,
analysed, audited, and (eventually) enforced *before* software reaches production.

The goal is not simply to reduce cost — it is to make resource consumption **visible,
intentional, and governable**.

## Auto-by-default

Like the rest of the governed contract, `economics {}` is **optional and auto-by-default**:
when omitted, the compiler/runtime infers a default economic envelope from the `CostGraph` +
`ValueGraph` (`economics-inference.ts`). Declaring the block is an **explicit override** of
that inference. (This is the same dual-mode pattern `secrets {}` and `epilogue {}` follow —
see `galerina-design-secrets-epilogue-blocks.md`.) Most simple flows declare nothing.

## Why economics exists

Most systems can answer *"what does this flow do?"*. Few can answer *how much it costs, how
many AI tokens it may consume, how much storage it may allocate, how much compute is
acceptable, and what happens when limits are exceeded.* `economics` expresses these directly.

## Core principles

- **Explicit resource consumption** — usage is declared, not assumed:
  `economics { max_ai_tokens 5000 }`.
- **Cost awareness** — flows express acceptable spend: `economics { max_compute_cost "£0.05" }`.
- **Governance of expensive operations** — AI inference, large DB scans, exports, report/video
  generation can be explicitly constrained.
- **Auditability** — overage becomes audit evidence ("flow exceeded AI token budget / compute
  budget / export quota") feeding runtime governance.

## Example

```galerina
secure flow generateReport(input: ReportRequest) -> ReportResult {
  contract {
    intent  { "Generate a customer report." }
    effects { database.read  ai.inference }
    economics {
      max_compute_cost "£0.10"
      max_ai_tokens    10000
      max_storage_mb   5
    }
  }
  ...
}
```

## Controls (vocabulary)

| Control | Meaning | Typical use |
|---|---|---|
| `max_compute_cost "£0.05"` | maximum acceptable execution cost | any priced workload |
| `max_ai_tokens 5000` | AI token budget | LLMs, embeddings, AI classify/search |
| `max_storage_mb 10` | storage budget | documents, uploads, reports, caches |
| `max_network_mb 50` | network budget | API calls, exports, transfers |
| `max_runtime_ms 1000` | execution-time budget | APIs, interactive/critical services |

## `economics` vs `limits`

Related but distinct:

- **`limits {}`** — *safety*. "Can this flow execute safely / without consuming excessive
  resources?" e.g. `limits { memory 64mb  request_time 5s }`.
- **`economics {}`** — *cost and value*. "Is this flow economically acceptable / can it exceed
  budget / become financially risky?" e.g. `economics { max_ai_tokens 5000  max_compute_cost "£0.05" }`.

## Economics and governance

Economics complements, not replaces, governance. The contract dimensions together:

```
Intent     explains WHY.
Effects    explain WHAT.
Authority  explains WHO.
Economics  explains COST.
```

```galerina
contract {
  intent    { "Generate an AI-assisted fraud assessment." }
  effects   { ai.inference  database.read }
  authority { fraud.analyst }
  economics { max_ai_tokens 15000  max_compute_cost "£0.20" }
}
```

## Future runtimes

Economics data can let a future runtime: reject expensive requests; select cheaper execution
paths; choose local inference over cloud; prefer CPU→GPU→NPU by cost; throttle expensive
workloads; and generate cost reports. With a `targets { prefer [npu, cpu] }` hint plus
`economics { max_compute_cost "£0.02" }`, the runtime can pick the most cost-efficient path
*within policy*.

## Compliance & reporting

Economics also supports cost auditing, AI governance, budget reporting, operational
transparency, chargeback models, and departmental cost allocation — increasingly important for
AI-heavy systems where inference cost varies significantly.

## Recommended usage

**Use** for AI workloads, batch processing, large exports, storage-heavy systems, high-volume
APIs, cost-sensitive SaaS. **Avoid** for simple utility flows, hello-world, trivial demos.

## Summary

`economics {}` expresses resource and cost expectations as part of the architecture — how much
a flow may spend, how many AI tokens it may consume, how much storage it may allocate, how much
compute is acceptable. Making these explicit helps build systems that are not only secure and
governed but also **predictable, sustainable, and operationally accountable**.
