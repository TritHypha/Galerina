# Derived structures inherit the gate: closing the index/view/cache/replica redaction bypass by construction

**Disclosure ID:** DP-RD-0438 · **Date:** 2026-07-16 · **Type:** defensive publication (prior-art disclosure — NOT a patent claim) · **Provenance:** KB RD-0438 §4 / RD-0439 §1 / RD-0441 §2; the derived-takes-min rule is machine-checked in the SP-RD-0439 harness (19/19). Design-stage; no performance claim.

## Purpose
Data systems govern the *primary* copy of a field and then quietly manufacture ungoverned copies of it: secondary indexes, materialized views, caches, replicas, change-data-capture streams, backups, search tokens, vector embeddings, even query-plan statistics. Each derived structure is a **copy**, and any ungoverned copy is a redaction bypass waiting for a reader. This publication records the closing construction.

## The construction
**Every structure derived from governed data inherits the strictest gate of its sources, at creation and at read.**
- **At creation:** building a derived structure over a protected field is itself a governed operation — you cannot silently build a plaintext index, token list, or embedding over data whose primary copy is gated. The derived artifact records its source verdict class.
- **At read:** a probe answers with the data *and* its verdict; the verdict of a derived row is the **minimum** (strictest) of its sources' verdicts — an index entry over any denied source is denied; over any unproven source, unproven (deny at a boundary). This is an algebraic rule, not a policy lookup, so it composes: a cache of a view of an index still carries the min.
- **The census obligation:** the set of derived structures is enumerable from the schema/plan graph (indexes, views, caches, replicas, CDC, backups, embeddings are all declared or planner-created), so "every copy is governed" is auditable — a derived structure outside the census cannot admit.
- **Notable instances** (each the same rule): a **full-text or vector index** over protected text is protected (embeddings are not anonymization); a **CDC stream** is an egress channel and redacts per consumer; a **backup/restore** is verified against the content-addressed integrity structure before it may serve; a **missing-index full scan** over governed data is a governance event, not a silent fallback.

## Prior art (novelty disclaimed)
Row/column-level security, view-based access control, label-based/multilevel security (Bell–LaPadula's no-read-up over labels), taint propagation, and "encrypt the indexes too" practice are established — **no novelty is claimed over any of them**. The disclosed contribution is the uniform *by-construction* form: verdict-carrying derived structures under a min-combining algebra, the creation-time gate on derivation itself, and the enumerable-census obligation — recorded as prior art.

## Honest bound
Inheriting the gate does not make derived data *useful* under denial — a fully-gated index over data a reader cannot see correctly returns nothing, and that cost is the point. Aggregates need their own leak control (small-cell suppression as a third state) because a *count* over protected rows is itself a disclosure; the min-rule governs access, not statistical inference. And the rule is only as complete as the census: a system that lets ad-hoc copies escape enumeration re-opens the class — which is why derivation outside the census must refuse, not warn.

*Contact hello@trithypha.dev.*
