# Topology is not authority; reach is not reasoning — the graph law, restated for AI retrieval

**Disclosure ID:** DP-RD-0417 · **Date:** 2026-07-16 · **Type:** defensive publication (prior-art disclosure — NOT a patent claim) · **Provenance:** KB RD-0417 (the relationship layer) · RD-0437 (graph as an engine-wide substrate) · RD-0441 (the AI-retrieval restatement). Design-stage; no performance claim.

## Purpose
As graphs spread through a system — relationship data, query plans, lineage, schema, dependency and admission graphs, retrieval/knowledge graphs for AI — one temptation recurs: treating *connectedness* as *permission*. This publication places the law and its enforcement construction in the public record, including its newest form in AI retrieval pipelines.

## The law
**A graph edge existing proves reach, never authorization.** Traversing an edge requires a **separately signed capability**; a traversal is statically valid only against a schema-declared, signed edge, and does not execute until the signed graph spine verifies. An unsigned index can never be the authority. This applies to *internal* graphs exactly as to user data: a query-plan edge, a lineage edge, a dependency edge never grants a capability — automation driven by an internal graph still passes the gate.

## Corollaries (each a construction, each disclosed)
1. **Structure is disclosure.** A topology answer (shortest path, community, plan shape, lineage) can leak who-connects-to-whom without reading any node. Therefore graph *structure* obeys the same zone model as field data: sensitive-relationship topology is computed post-gate and its result egress-redacted; relationship *types* carry a sensitivity class (metadata is sensitive by default) — the ontology is part of the signed schema.
2. **Bounded traversal.** Every walk carries a hop budget; an unbounded graph walk is resource exhaustion (CWE-400) refused by construction.
3. **Hyperedges admit whole.** A capability admits an entire hyperedge or the traversal is denied; there is no partial crossing.
4. **Reach ≠ reasoning (the AI-retrieval restatement).** Retrieval — vector similarity, RAG, hybrid search — *fetches material*; it must never *authorize actions*. Retrieved text cannot carry a capability: a poisoned or hallucination-adjacent retrieval result is inert input for a governance layer that reasons over the signed graph, so the retrieval-injection class (corpus poisoning → tool/action execution) is structurally dead rather than mitigated. Vectors are **advisory**; the signed graph is **authoritative** — a similarity candidate is born unproven and is confirmed or denied by an edge-plus-capability check before any effect.

## Prior art (novelty disclaimed)
Capability-based security (unforgeable authority tokens), object-capability literature, "confused deputy" analyses, graph databases with per-edge ACLs, and prompt-/retrieval-injection defenses are established — **no novelty is claimed over any of them**. The disclosed contribution is the composition stated as one law with its corollaries: signed-spine-gated traversal, structure-as-disclosure under the zone model, whole-hyperedge admission, budget-bounded walks, and the advisory/authoritative split for AI retrieval — recorded as prior art so it cannot later be enclosed.

## Honest bound
The law does not make cross-boundary traversal *safe by itself*: who holds the decryption key across a tenant boundary is a separate, genuinely hard problem (the safe default is intra-boundary traversal plus proof-carrying results — verifiable inclusion proofs rather than moving keys). And the law costs convenience by design: reachability-as-permission is *fast*; refusing it is the point.

*Contact hello@trithypha.dev.*
