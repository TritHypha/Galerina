<!-- ABSORBED R&D SOURCE — verbatim mirror. Galerina is the main library; the R&D repo is upstream/authoring.
     Source: Galerina-R-AND-D/tmf/research/storage-and-query-v0.md  ·  Pinned: R&D fb68d06 (2026-06-16)
     Integrated Galerina view: (this archive copy is the primary KB home)  ·  Catalog: galerina-rd-absorption-catalog.md
     Rule: edit the upstream source then re-vendor; do not fork this copy (feedback-auto-import-rd-docs). -->

> **Absorbed R&D source (verbatim).** This is the archived upstream document. See `galerina-rd-absorption-catalog.md` for the full ledger. Internal links below point at the upstream R&D tree.

---
# `.tmf` storage & query (the DB half) — design v0

**Status:** R&D design. The `.tmf` trust layer (integrity/authenticity/confidentiality/modalities) is the
*record format*; this doc sketches the **database** over it — a **mesh-coordinate index**, **ANN (HNSW)**
similarity over Vector-modality sections, and **MeshQL** (grammar → AST → planner → executor). Posture:
design + a **measured-recall** reference benchmark only; **no throughput/RPS claims**; all semantic query runs
at **trusted endpoints** on decrypted+re-verified plaintext (never in-network — verdict 5).

> **The boundary that shapes everything:** a `.tmf` section is sealed (KEM-DEM) and its integrity root is
> ML-DSA-signed. A query engine therefore operates in two zones — an **untrusted zone** that can only route on
> opaque coordinates/metadata, and a **trusted zone** (post verify-before-decrypt) that can decrypt, index on
> content, and run ANN. The index design must respect that split.

---

## 1. Two indexes, two zones

| Index | Zone | Keys | Answers |
|---|---|---|---|
| **Mesh-coordinate index** | untrusted-safe (keys are opaque coords) | the section `coord` (128-bit) bound into each TMX leaf | "which sections live at / near these coordinates?" — exact + range |
| **ANN (HNSW) index** | **trusted only** | the *decrypted* embedding vectors (Vector modality, §3) | "which sections are semantically nearest to this query vector?" |

The coordinate index can live in the untrusted routing tier because coordinates are **opaque/non-semantic**
(metadata-minimization). The ANN index **cannot** — embeddings invert to plaintext, so it is built and queried
only inside the trusted zone after the gate releases the section.

---

## 2. Mesh-coordinate index
Each section's `coord` (the 128-bit coordinate block, bound into the TMX leaf and the AEAD AAD) is the primary
key. The index is an ordered map `coord → section_ref` (file offset + `leaf_hash`), supporting:
- **Exact lookup:** `coord == k` → O(log n) (sorted) or O(1) (hash).
- **Range / neighbourhood:** coordinates are structured (the mesh is a product of axes); a range query is a
  prefix/interval scan over the ordered keys. Because the mesh is fixed-width, a coordinate prefix selects a
  sub-cube in O(log n + m).
- **Integrity-checked reads:** a hit returns `section_ref`; the reader still runs the full fail-closed path
  (recompute leaf → root → verify signature → gate) before any payload is trusted. The index is an
  *accelerator*, never a source of truth — a tampered index can only cause a (detected) verification failure,
  never a silent wrong-bytes read.

The index is **rebuildable** from the `.tmf` section table alone (it is derived state), so it needs no
separate integrity guarantee: a corrupt index fails closed at verification or is simply rebuilt.

---

## 3. ANN (HNSW) over Vector sections — measured, trusted-zone only
For similarity search over embeddings (Vector modality, codec NVFP4/f32/…), the design uses **HNSW**
(hierarchical navigable small-world) — the standard graph ANN. The honest commitments:
- It runs **only in the trusted zone**, on vectors that have been decrypted *and* re-verified against the
  signed root. No encrypted/ANN-on-ciphertext shortcut (those leak and aren't line-rate — see
  `tri-encription/research/metadata-confidentiality.md`).
- **Recall is measured, not asserted.** [`tri-encription/bench/hnsw-recall.mjs`](../../tri-encription/bench/hnsw-recall.mjs)
  builds a graph ANN over seeded synthetic vectors and reports **recall@k vs exact brute-force kNN** as a
  function of the search beam `ef` — the recall/cost trade-off you actually get, on the stated machine. No
  speedup or QPS number is claimed; only recall and the candidate-visit count (the honest cost proxy).
- Distances are computed on the **deterministic core** (the same crypto-on-core rule); a *photonic* ANN would
  be the one place a perf claim could later be earned, but only behind its own reproducible benchmark.

---

## 4. MeshQL — grammar → AST → zone-aware planner → executor (worked)
A small query language over coordinates + modalities + similarity. The load-bearing idea is **zone typing**:
every field is `opaque` (coordinate/metadata — safe in the untrusted routing zone) or `semantic` (decrypted
content — trusted zone only). The compiler **statically** guarantees no `semantic` value is touched before the
verify-before-decrypt **Gate**. Worked reference (parser → planner → executor + the invariant checks):
[`tri-encription/bench/meshql.mjs`](../../tri-encription/bench/meshql.mjs) — **13/13**.

### 4.1 Grammar (EBNF)
```
query      := "SELECT" projection "FROM" ident [ "WHERE" predicate ] [ "NEAR" vector "K" int ] [ "LIMIT" int ]
projection := "*" | ident { "," ident }
predicate  := orExpr
orExpr     := andExpr { "OR" andExpr }
andExpr    := cmp { "AND" cmp }
cmp        := ident ( cmpOp operand | "IN" "(" number {"," number} ")" | "RANGE" "(" number "," number ")" )
            | "(" predicate ")"
cmpOp      := "=" | "<" | ">" | "<=" | ">="
operand    := number | string
vector     := "[" number {"," number} "]"
```

### 4.2 AST
```
Query   { projection: "*" | string[], source: string, filter: Pred|null, knn: {vector:number[], k:int}|null, limit: int|null }
Pred    = { type:"and"|"or", kids: Pred[] } | { type:"cmp", field, op, val?|list?|{lo,hi} }
```

### 4.3 Zone typing (the static, fail-closed check)
A **catalog** assigns each field a zone: `opaque` (`x,y,z` mesh axes, `doc_id`) or `semantic` (`embedding`,
`label`, `body`). Resolution of an unknown field is a hard `ResolveError` (fail-closed). A predicate's zone is
`opaque` iff **every** field it references is `opaque`. This typing is what lets the planner decide what may run
untrusted — and it is checked before any plan is emitted.

### 4.4 Planner (zone-aware, predicate-splitting)
1. **Split the `WHERE`.** Flatten the top-level `AND` into conjuncts; each purely-`opaque` conjunct becomes a
   **pushdown** predicate (runs on the untrusted mesh-coordinate index, §2); every other conjunct (any `semantic`
   reference, or a zone-mixing `OR`) becomes a **residual** predicate (trusted zone, post-Gate). This is the
   conservative-correct rule: a zone-mixing `OR` is *not* pushed down (it would need a semantic value untrusted).
2. **Emit the operator pipeline, each tagged with its zone:**
   `IndexScan`(untrusted; pushdown preds) → `Gate`(boundary; verify-before-decrypt + K3 `ALLOW`) →
   `Filter`(trusted; residual preds, if any) → `ANN`(trusted; HNSW over decrypted vectors, if `NEAR`) →
   `Project`+**egress** → `Limit`.
3. **Egress seam (per projected field).** A `semantic` field projected to an **untrusted** destination is
   **redacted**; to a **trusted** destination it is emitted. The reference models this decision purely as
   **destination trust** (`destTrusted`); in a real deployment the trusted-destination emit is itself gated by
   the `k3-policy.spore` `authorizeRead == ALLOW` decision (with `egressRedact` on deny) — the reference *abstracts*
   that policy call, it does not implement it. The threat model is leakage to an *untrusted* destination, which
   is always redacted.

**The invariant (statically enforced, T-ZONE in the reference):** no operator at or before the `Gate` references
any `semantic` field. The pushdown predicate is `opaque`-only by construction, so a semantic value cannot reach
the untrusted zone — verdict 5 made a compiler property, not a runtime hope.

### 4.5 Executor
Runs the plan in order. `IndexScan` narrows on opaque coords only; `Gate` runs the full fail-closed path
(integrity → authenticity → K3 `ALLOW`) and is the *only* place `semantic` fields become visible; `Filter`
applies residual semantic predicates; `ANN` ranks by similarity (trusted); `Project` applies the egress seam;
`Limit` truncates. Every emitted row has passed the Gate, and every `semantic` field crossing to an untrusted
destination is redacted — nothing semantic crosses the trust boundary in cleartext.

### 4.6 Worked example
```
SELECT doc_id, label FROM mesh WHERE x = 3 AND z RANGE (0,9) AND label = "report" NEAR [0.1,0.2,0.3] K 2 LIMIT 5
  pushdown (untrusted) : x = 3 , z RANGE (0,9)          ← opaque coords, on the mesh index
  residual (trusted)   : label = "report"               ← semantic, only after the Gate
  plan : IndexScan{x=3, z∈[0,9]} → Gate → Filter{label="report"} → ANN{[.1,.2,.3], k=2} → Project{doc_id, label↧} → Limit 5
         (label↧ = redacted if the destination is untrusted)
```

---

## 5. What this is NOT (honesty)
- **Not** a throughput/RPS benchmark and **not** a built engine — design + a measured-recall ANN reference
  (`bench/hnsw-recall.mjs`) + a worked MeshQL parser/planner/executor reference (`bench/meshql.mjs`, 13/13,
  enforcing the zone invariant). No QPS/latency is claimed.
- **No** encrypted-similarity / in-network semantic routing (verdict 5). ANN is trusted-zone only.
- **No** claim that the coordinate index or ANN changes the security model — both are *accelerators* under the
  unchanged verify-before-decrypt gate; a corrupt index fails closed, never returns unverified bytes.
- Photonic ANN remains a labelled *later* research item, gated behind its own reproducible benchmark.

## Sources / prior art
HNSW (Malkov & Yashunin, 2016/2018); navigable small-world graphs; standard predicate-pushdown query planning.
Companion: [`tmf-modalities-v0.md`](../spec/tmf-modalities-v0.md), [`tmf-encryption-v0.md`](../spec/tmf-encryption-v0.md),
[`tri-encription/research/metadata-confidentiality.md`](../../tri-encription/research/metadata-confidentiality.md).
