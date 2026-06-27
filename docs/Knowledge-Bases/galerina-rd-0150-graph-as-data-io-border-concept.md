# RD-0150 — Graph as the standard data model for API / Database I/O (per-tenant zero-trust border)

**Status:** 🧪 DESIGN-ONLY R&D concept. No code, no prod change. Owner/hub-gated. **Number:** RD-0150 (owner-assigned 2026-06-27). **Origin:** owner forward-design question ("concept only ... for security, speed and organisation"), scoped by the owner to **API or Database I/O**.

> **Scope (owner, RD-0150):** this targets **data I/O at the API and database boundary** specifically — data crossing in/out via API request/response and DB read/write. That I/O surface *is* the per-tenant border where `Q ∩ S_user` is enforced, so the "data border" analysis below applies directly to API/DB I/O: the graph governs *which records may cross the API/DB boundary for this caller, and why.*

> **Provenance / honesty note:** produced by workflow `graph-as-data-border-concept` (run `wf_a3d324a3-815`: 3 read-only ground mappers → 1 design synthesis → 2 adversarial verify lenses). **The two verify lenses did not return structured verdicts (StructuredOutput retry-cap failures)**, so the worker did an independent honesty pass instead; the lenses' partial tool-output corroborated it (honesty lens: *"None required"*; cost lens: a densification caveat already present in §5.3). Every claim is tagged to a shipped anchor or marked design-only/aspirational; negative findings are recorded deliberately (record-everything posture).

---

## 1. The question + what already exists

Should the standard data model inside the per-tenant zero-trust data border (the API/DB I/O surface) be a graph, replacing or augmenting today's flat Structure-of-Arrays — evaluated *for security, speed, and organisation*?

The first honest thing to say is that **graphs already pervade this stack — but never as the data spine.** Four graph systems are shipped or proven:

- **ProofGraph** (`proof-graph.ts`) — the governance certificate: `ExecutionSignature` hashes governance shape so isomorphic flows share one proof (O(N flows) → O(M unique shapes)); canonical hash chain (source → GIR → plan → attestation); hybrid Ed25519 + ML-DSA-65 signing.
- **Provenance Graph** (`galerina-devtools-provenance`) — a lineage DAG: source → transform → sink, with `isTrusted` taint state and the "ungated sink reached" fail-open detector.
- **Project / Knowledge Graph** (`galerina-devtools-project-graph`) — generic `Graph<N,E>` with immutable `GraphBuilder`, BFS/DFS/topo/reach/fixpoint, `spore.graph.v1` schema, and **edge confidence (EXTRACTED/INFERRED/AMBIGUOUS)**.
- **TritMesh trit graph-query engine** (`trit-graph-query-perf.mjs`, `tritmeshql.mjs`) — the authorized-adjacency view: verdict trits per node, zone-aware planner, and the **separate-presence-channel** correctness fix (0037).

What is **not** a graph today is the DATA itself. Per note 54 / 41-tritmesh, rows live in **flat SoA**: zero-copy 32-bit offsets into a WASM arena, chosen deliberately for cache coherence, branch prediction, and "the fastest path is the only path." Access control is a per-row **predicate**: `admit(row) = vOr(sharedRowLane, ownerLane)`, authorize iff `=== +1`, evaluated as the implicit intersection `Qexecuted = Q ∩ Suser` with `Suser` proven from the `.tmf` passport (never from a request param).

**The concept, precisely stated:** make the graph the *data spine* too — so the same trit-graph machinery that already governs *flows* also governs *data reachability across the API/DB boundary* — while keeping the parts that flat SoA is genuinely best at. This is not "invent a graph engine." 0037 already built one; this asks whether to point it at the data border. Credit is due to all four existing systems; this is composition, not novelty.

---

## 2. SECURITY — the strong case

This is where the concept is strongest, and the argument is structural.

**Today isolation is predicate-based:** every row physically sits in the same flat arena, and a per-row K3 check decides admission. The check is sound (the intersection-redbench proves naiveLeaks=6 → governedViolations=0), but **safety depends on the predicate running on every row, every time.** A forgotten gate, a mis-shaped AST (the limit-enforcement gap is a live example of "the check looked for the wrong node"), or a rogue flow reading flat memory is a leak waiting on a single missed evaluation.

**A data graph makes isolation structural instead.** Reframe (per note 54's own transposition and trittmesh-3): a `.tmf` passport is a **node**; an admissible relationship is an **edge** carrying a K3 verdict. Then:

> **`Q ∩ Suser` becomes K3-verdict REACHABILITY: a node is admitted iff an ALLOW *path* exists from the caller's capability root.**

This is exactly 0037/0035 applied to data instead of governance flows. `pathAuthorized(target) ⟺ ∃ path: authorize(min_fold(trits)) = +1`. The properties carry over verbatim:

- **No edge = no reach.** A row the caller cannot reach is not "denied by a predicate that must fire" — it is *not in the traversable subgraph at all*. Absence of an edge is an explicit DENY, never a silent pass.
- **A tenant is a connected component.** Cross-tenant edges must be *explicitly constructed and individually governable* — they cannot arise by omission. This inverts the failure mode: today a forgotten WHERE *widens* exposure; in a graph, exposure requires an edge someone had to create.
- **K3 reachability is strictly finer than binary BFS** (0035): one INDETERMINATE node sinks the whole path (`authorize(min(+1, 0, +1)) = FALSE`). Binary "reachable" is not "authorized." This is the right model for an access view.

**Non-negotiable carry-over — the 0037 separate-presence-channel discipline.** A data graph composes filters (WHERE clauses narrow the traversable set). The trit-0 aliasing bug is therefore *directly in scope*: if "filtered-out" is encoded as verdict-0, a genuinely INDETERMINATE node becomes indistinguishable from a dropped one, and the gate **fails open** — admitting an INDETERMINATE decision because it looks absent. The data graph MUST carry `{verdict: trit, present: bool}` on separate lanes; filters AND the presence lane only; verdict is never masked. Admission stays fail-closed: `admit = present && verdict === +1`. This is not optional polish — it is the one correctness invariant that makes graph-as-data sound rather than a new fail-open surface.

**Standards mapping (honest):**
- **NIST SP 800-207** — T1 (every resource is a resource): each datum is a *node* with explicit identity, the cleanest possible realization. T4 (per-request access decision): reachability is *evaluated per request* from the caller's capability root, with `Suser` immutable from the passport. T7 (collect state for posture): edge confidence + provenance edges give intrinsic lineage. *Strengthened.*
- **CWE-639 (IDOR) / CWE-285 (improper authorization):** structurally closed. `?user_id=456` can never widen `Suser` because traversal always starts from the *passport-derived* capability root, not a parameter (the canonical API-I/O IDOR vector). There is no edge for the attacker to traverse to the victim's component.

**Honest cost on the security side:** the attack surface *moves*, it doesn't vanish. It moves to **edge construction and edge integrity** — whoever can mint a cross-tenant edge holds the keys to the border. That must be as governed as visibility-flips are today (signed manifest, audited, fail-closed default). And crypto for any of this stays binary-digital (SPORE-SUBSTRATE-001) — see §6.

---

## 3. SPEED — the honest mixed case

This is where a sales pitch would overreach. The honest answer is: **graph wins some workloads decisively and loses others to flat SoA — and note 54 chose SoA for good reasons that still hold.**

**Where the graph WINS (directionally, by avoiding joins):**
- Relationship / multi-hop / reachability / lineage queries. "Can the caller reach this?", "what is downstream of this datum?", "shortest authorized path" — these are *native* graph traversals (BFS/reach/fixpoint already exist). On flat SoA the same questions are repeated self-joins, which is the canonical relational pain point. This is an *asymptotic structural* advantage (no join blow-up), not a benchmarked one.
- The **0037 precompute WIN regime**: small + dense + **repeated, read-heavy, static** all-pairs authorized-adjacency. Build once, look up many times. The harness proved this regime exists (build-once + many lookups beats many BFS passes) — but only in that regime.

**Where the graph LOSES (and SoA is right):**
- **Bulk scans and aggregations.** Counting, summing, filtering millions of rows on an attribute is a contiguous columnar/SIMD job. This is *exactly why note 54 chose flat SoA*: L1/L2 cache coherence, branch prediction, zero-copy. Pointer-chasing a graph evicts cache and destroys mechanical sympathy. A graph spine does not improve — and likely regresses — this workload.
- The **0037 precompute LOSE regime**: sparse or single-source queries (BFS O(N+E) beats an O(N²) dense table), large graphs (dense table is O(N²) memory, ~1365× the sparse footprint at N=8192 — *0037's measured figure, not a new claim*), and write-heavy workloads. Materializing reachability is a trap outside the WIN envelope.

**Photonic angle (grounded, govern-don't-absorb):** graph topology *is* sparse-matrix work — adjacency, reachability closure, similarity. Sparse matmul A·B maps to the MZI photonic mesh as an **offload candidate** (X1 envelope). But the substrate rules are absolute: the photonic result is **never authority**. It is Freivalds-verified on the binary core into an `opticalVerdict`, then min-folded `vAnd(coreVerdict, opticalVerdict)` — confirm-or-degrade, never upgrade (V1 no-coercion). The K3 dead-zone (±σ band) collapses to fail-closed DENY via `maskByVerdict`, not ALLOW. And **crypto / signing / key-derivation stay strictly digital** (SPORE-SUBSTRATE-001). So the honest framing is: *topology computation is photonic-accelerable outside the gate; the verdict and the crypto are not.* Net-win is asymptotic and conditional (n ≫ 3k), labeled aspirational — never 0-cycle (V3: latency-masking ≠ work-elimination).

**The new resource-exhaustion vector (must be designed in, not bolted on):** unbounded traversal is a **DoS / CWE-400 surface**. A maliciously crafted API query that walks a deep or fan-out subgraph is unbounded work — this is the same **unbounded-work residual** flagged in the limit-enforcement gap (rate/concurrent host store still owner-pending). A data graph therefore *requires a traversal-budget gate* by construction: a hop/node/time budget that, when exhausted, returns INDETERMINATE → fail-closed DENY (audited SPORE-GOV-3VL-001), never a partial or silent result. The budget gate is part of the concept's cost, not an afterthought.

---

## 4. ORGANISATION — the strong case

This is the second strong axis, and it is about *unification*.

Today the stack runs **parallel, separately-maintained representations**: flat SoA for data, ProofGraph for governance, Provenance for lineage, capability bitmasks for effects, the project/KB/memory graphs for knowledge. They share *vocabulary* (K3, V_DPM) but not a *substrate*.

A graph data spine collapses these onto **one substrate**:
- **Data, capabilities, provenance, and governance become the same kind of thing** — nodes, edges, and trits. A capability is an edge you can traverse; a provenance link is an edge you can audit; a governance verdict is the trit the edge carries. The `Graph<N,E>` core already parameterizes node/edge types without reimplementing traversal — domain-specific kinds, shared algorithms.
- **One query language (TritMeshQL)** with its zone-aware planner (T-ZONE: no semantic field before the Gate; IndexScan(opaque) → Gate → Filter(semantic) → ANN → Project+Egress → Limit) governs *data* queries the same way it governs adjacency views — and that planner sits exactly at the API/DB I/O boundary.
- **One K3 verdict algebra** (vAnd=min, vOr=max, authorize ⟺ +1, deny-by-default empty) is the single composition rule everywhere — no second decision model to keep in sync, no place a new feature can manufacture an ALLOW.
- **Lineage is intrinsic, not bolted on.** Provenance is already a graph; if data *is* a graph, "where did this come from / where can it flow" is a traversal, not a separate analyzer. Edge confidence (EXTRACTED/INFERRED/AMBIGUOUS) carries "how did we know this edge?" — proven vs inferred relationships stay distinguishable for audit.
- **Schema-on-read / additive evolution.** A zero-trust model evolves (new effect bits, new visibility classes, new shared scopes). Adding a node/edge kind is additive (`schemaVersion` guards breaking changes) versus migrating a flat columnar schema. The immutable builder pattern (mutable `GraphBuilder` → frozen `Graph`) gives safe sharing across readers without concurrency bugs.

The organisational win is real and largely independent of the speed tradeoff: even where you keep columnar payloads, *modeling the relationships and verdicts as one graph* removes the synchronization burden between four representations.

---

## 5. The honest shape (recommendation): HYBRID PROPERTY-GRAPH

**Not graph-everything.** The recommended design is a **hybrid property-graph**:

- **Graph SPINE** carries what graphs are best at: **reachability, capability edges, K3 verdicts, provenance/lineage, and tenant component boundaries.** This is the security and organisation backbone — the part where "no edge = no reach" and "one substrate" pay off.
- **Columnar / SoA PAYLOAD** carries bulk attributes hanging off each node. Scans, aggregations, SIMD, zero-copy WASM dispatch keep running on flat columnar memory — *exactly the note-54 model, unchanged.* A node is a lightweight identity + verdict; its heavy attribute vectors stay in cache-coherent SoA.

So the graph governs *which* records may cross the API/DB boundary and *why*; the columnar payload answers *what* the attributes are, fast. This directly maps the 0037 envelope: spine = the static/relational/read-heavy structure (graph wins); payload = the bulk-scan workload (SoA wins). It also matches the AOT + runtime-mask model: AOT the static spine and zone annotations, mask the dynamic predicate at runtime over the columnar payload, taken-path only (never superposition — 0037 C proved superposition is 4× FLOPs).

**The hard problems — stated plainly, not waved away:**

1. **Tenant crypto-sharding when an edge spans tenants.** Layer-2 today encrypts a tenant's chunks under *that tenant's* `.tmf`-derived key. A cross-tenant edge has **two** owners — *who can decrypt the edge?* This is the single hardest open question. Candidate directions (design-only, unproven): the edge is a first-class governed object with its own key custody (threshold / break-glass multi-sig, per MeshView), or the edge stores only opaque CIDs and the *verdict* (not the payload), so traversal authority and payload decryption are separate gates. Either way, **the edge cannot be encrypted under one tenant's key alone**, and getting this wrong reintroduces a cross-tenant leak. Crypto stays digital throughout (SPORE-SUBSTRATE-001).
2. **Transactional consistency.** Flat SoA + arena wipe has a clean O(1) lifecycle (Black Hole Protocol). A mutable graph with cross-component edges needs a consistency story (atomic multi-node updates, edge insert/delete under concurrency) that the immutable-builder pattern only partially answers (great for read-sharing, awkward for in-place mutation). Write-heavy graphs are exactly the 0037 LOSE regime.
3. **Per-edge memory cost.** A graph spine pays O(N+E) with per-edge metadata (verdict, confidence, zone, provenance). For dense relationships this approaches the O(N²) dense-table footprint 0037 measured. The spine must stay *sparse and governance-shaped*, not a dense materialized reachability table (use the precompute table only inside its proven WIN envelope).

---

## 6. Compliance tags

**Tri-Pipe lane:**
- **Data-plane verdict + admission: BINARY DIGITAL (default lane, stated).** K3 fold, presence channel, intersection — exact integer min/max, deterministic.
- **Topology computation (sparse matmul / adjacency / reachability closure): PHOTONIC-ACCELERABLE, but only *outside* the gate** — Freivalds-verified into a degrade-only `opticalVerdict`, min-folded with the core; dead-zone → fail-closed DENY. Never authority.
- **Crypto (tenant-key derivation, edge signing, attestation, ML-KEM): STRICTLY BINARY DIGITAL** — SPORE-SUBSTRATE-001, crypto-on-core, never photonic.

**NIST SP 800-207 (7 tenets — which strengthen, which need care):**
- *Strengthen:* **T1** (resource = node, cleanest realization), **T4** (per-request reachability from passport root), **T7** (intrinsic lineage + edge confidence for posture).
- *Neutral / inherited:* **T2** (per-session secure comms), **T3** (per-session dynamic auth) — unchanged from today's session-arena model.
- *Need care (could COST a tenet if done wrong):* **T5** (integrity/posture before access) — the traversal-budget gate and crypto-edge custody must be in place, else the graph adds a DoS and an edge-leak surface. **T6** (dynamic policy / least privilege) — least privilege is *better expressed* (reachable subgraph = exact privilege) but **only if cross-tenant edges are minimal and audited**; a careless edge over-grants structurally. Flag honestly: the graph does not automatically improve T5/T6 — it *relocates* the work to edge governance.

**CWE / PCI:**
- **CWE-639 (IDOR), CWE-285 (improper authz):** structurally closed (§2).
- **CWE-400 (resource exhaustion):** *newly introduced* by unbounded traversal — mitigated only by the mandatory traversal-budget gate (§3). Do not claim closure without it.
- **PCI DSS:** Req 7 (need-to-know access) maps cleanly to reachability; Req 10 (audit trail) is strengthened by intrinsic provenance edges + SPORE-GOV-3VL-001 on every INDETERMINATE. Coverage is partial and unchanged in count from the shipped baseline — this concept doesn't add PCI requirements, it re-expresses existing ones on a graph.

---

## 7. Honest caveats

- **Concept-only, design-only.** Nothing here is implemented. Prod LogicN is READ-ONLY from R&D; any build is owner/hub-gated and would go through patch-spec + RED-bench + overlay-staging, never a direct edit.
- **Builds ON, does not reinvent.** This composes 0037 (trit-graph engine, separate-presence-channel fix, precompute envelope), 0035 (K3 path-fold), note 54 / 41-tritmesh (flat SoA rationale, three-layer border), the intersection-redbench (Q ∩ Suser contract), and ProofGraph/Provenance/Project-graph. None of those are claimed as new.
- **No measured performance number is asserted.** Every speed statement is *directional* (graph avoids joins) or *asymptotic* (O(N+E) BFS vs O(N²) table, n ≫ 3k photonic crossover); the `1365×`/`4× FLOPs` figures are cited from 0037's existing harness, not new benchmarks. The actual win/loss boundary for graph-as-data-spine is **unbenchmarked** and would need its own RED/perf harness (the same prove-own-maths, exits-nonzero-on-fail discipline as `trit-graph-query-perf.mjs`) before any quantitative claim.
- **The hard problems in §5 are genuinely open**, especially cross-tenant edge crypto custody. The concept is sound enough to prototype the *spine* (reachability + verdict + provenance) against a columnar payload; it is **not** ready to claim the crypto-sharding or transactional story is solved.
- **Posture compliance:** every claim above is tagged to a shipped anchor or marked design-only/aspirational; negative findings (graph loses bulk scans, introduces CWE-400, edge-crypto unsolved) are recorded deliberately, not hidden.

---

## Verdict (one line)

Graph-as-data-spine is a **genuine win on SECURITY and ORGANISATION**, a **deliberate mixed bag on SPEED**, and the right answer is a **HYBRID property-graph, not graph-everything**: graph SPINE for reachability/capability/verdict/provenance + columnar/SoA PAYLOAD for bulk attributes — carrying the 0037 separate-presence-channel discipline and a mandatory traversal-budget gate, with three open problems flagged (cross-tenant edge crypto custody is the hardest). **Next step if pursued:** prototype the spine against a columnar payload behind a RED/perf harness; do not claim the crypto-sharding or any quantitative speed result until benchmarked.

---

*Provenance: workflow `graph-as-data-border-concept` (`wf_a3d324a3-815`, 6 agents, read-only on prod). Worker-authored into the KB per owner direction (RD-0150). Source copy in the R&D repo `RD-0150-graph-as-data-io-border-CONCEPT.md`.*
