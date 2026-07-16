# A three-valued fail-closed calculus for data-system primitives — executable verification, and its equivalence to the seqlock re-check

**Disclosure ID:** SP-RD-0439 · **Date:** 2026-07-16 · **Type:** construction paper (prior-art disclosure — NOT a patent claim) · **Provenance:** KB RD-0438 (the feature ledger) / RD-0439 (security pass) / RD-0441 §2 (the equivalence); runnable harness `TritMesh-Database/examples/third-state-fail-closed/verify-third-state.mjs` — **19/19 assertions green** (dependency-free; re-run and personally verified 2026-07-16). Honesty lock: this is three-valued *classical* logic (Kleene K3), **not** a qubit or quantum claim.

## Purpose
Classic database primitives are binary (hit/miss, valid/invalid, in-sync/stale, held/free). We disclose a uniform construction: give each primitive a **third state carrying governance/verification/health inline**, under a calculus whose fail-closed properties are **machine-checked**, and record the observation that a well-known lock-free systems idiom — the seqlock read re-check — is the *same* fail-closed pattern at the memory layer. Both the construction and the equivalence are placed in the public record as prior art.

## The calculus (all machine-checked, 19/19)
Over verdicts `DENY = −1, INDETERMINATE = 0, ALLOW = +1`:
- **Combination is Kleene min (AND) / max (OR); negation is sign flip.** Consequence (checked): you cannot combine your way to more authority than your inputs — `ALLOW ∧ INDETERMINATE = INDETERMINATE`, `DENY ∨ INDETERMINATE = INDETERMINATE`.
- **Boundary-only collapse (fail-closed):** at an egress/effect boundary, anything not fully `ALLOW` collapses to `DENY`. Internally, `INDETERMINATE` is *preserved* (no premature collapse) so deferred proofs stay resolvable.
- **The only exits from the third state are a valid proof (→ ALLOW) or denial.** Self-healing/repair is therefore a *gated effect* that produces the missing proof; it never silently promotes.
- **Derived structures take the min of their sources:** an index, view, cache, replica, or candidate set over any `DENY` source is `DENY`; over any `INDETERMINATE` source, `INDETERMINATE`.

Applied per primitive, the third state is where quarantine, pending-verification, deferred proof, repair-in-progress, in-doubt transactions, and small-cell suppression live — one law across schema, indexing, storage, transactions, replication, query, operations, and access control.

## The equivalence: the seqlock re-check is this calculus at the memory layer
A classic single-writer lock-free queue advances a write counter, copies the payload, then the *reader re-checks the write counter* after its copy: if the counter moved, the read was torn — it is **discarded and retried**, never served. Mapping: a torn read is a datum in the third state (`torn → re-verify`); the re-check is the boundary collapse (not-proven-consistent ⇒ not served); the retry is the proof that promotes. A nanosecond-scale concurrency idiom and a governance calculus enforce the **same law: never serve what you cannot prove; detect and re-verify instead.** We disclose the equivalence itself as the contribution — it is evidence the fail-closed third-state construction generalizes across layers.

## Prior art (novelty disclaimed)
Kleene's strong three-valued logic (1938) and its database use (SQL `NULL` semantics) are established; seqlocks (Linux kernel), optimistic concurrency validation, and read-copy-update are established; quarantine states and tri-state health checks exist across operations practice. **No novelty is claimed over any of these.** The disclosed composition — the uniform third-state-per-primitive construction, the boundary-only-collapse rule, the derived-takes-min rule, the machine-checked harness form, and the explicit seqlock equivalence — is recorded as prior art.

## Honest bound
The calculus governs *verdicts*; it does not make slow proofs fast (deferred proofs still cost when produced), and the harness verifies the algebra, not an engine (the engines carrying it are design-stage). SQL's NULL shows a three-valued system can *confuse* users when the third value is overloaded — the disclosed construction avoids that by giving the third state one meaning: **not yet proven; act as deny at any boundary.**

*Contact hello@trithypha.dev.*
