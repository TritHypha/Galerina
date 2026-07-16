# Assurance relocation: the hot/cold split applied to proofs — lower the overhead, never the guarantee

**Disclosure ID:** DP-RD-0409 · **Date:** 2026-07-16 · **Type:** defensive publication (prior-art disclosure — NOT a patent claim) · **Provenance:** KB RD-0409 (the assurance-by-default profile) · RD-0441 §2 (the low-latency-engineering parallel) · RD-0443 §1 (the compiler embodiment). Design-stage; no performance number is claimed.

## Purpose
High-assurance systems are routinely assumed to be slow *because* they are assured: every operation pays for signatures, verdict evaluation, and evidence on the hot path. Low-latency engineering solved the shape of this problem long ago for *code*: keep the warm path minimal and move cold paths (error handling, diagnostics) far from it — without deleting them. This publication records the same split applied to **assurance itself**, with the invariants that keep it honest.

## The construction
**Relocate expensive proofs off the hot path; never remove them.**
- **A signed, per-dataset profile — not a runtime flag.** Data defaults to high assurance; opting *down* to the performance profile is an explicit, signable act permitted only for data proven ordinary. Protected classes (PII/PHI/PCI) are unreachable by the opt-down: they keep the full gate on every path, including the fastest one.
- **Deferred, on-demand, or asynchronous evidence.** Under the performance profile, per-row signatures, per-field verdicts, and proof artifacts move to deferred/async production — with the datum carrying a third state (**pending-proof**) until produced. Pending never auto-promotes: at any boundary it denies; the only exits are the proof or the denial.
- **The durability rule:** an externally-visible effect releases only when its audit record is durable. Relocation may reorder *when* evidence is computed; it may not reorder evidence *behind* an effect the world can see.
- **The compiler embodiment:** governance-violation, diagnostic, and error paths compile to a cold region away from warm function bodies (never inlined into them) — the checks exist, verbatim, off the fast path. Assurance becomes a *placement* decision; placement is never an *authority* decision.

## The parallel (why this is known-good engineering shape)
The nanosecond-trading discipline — cold code far from warm code, expect-style assertions whose failure path lives in a cold section, "use the big machinery only when you actually need it" — is the same split. The disclosed contribution is transplanting it from *code paths* to *proof obligations* with the fail-closed third state and the durability rule attached, so the fast profile provably lowers overhead and provably cannot lower the guarantee.

## Prior art (novelty disclaimed)
Hot/cold code splitting, deferred/lazy verification, asynchronous audit pipelines, write-ahead durability rules, and tiered assurance (evaluation levels) are established — **no novelty is claimed over any of them**. The disclosed composition — signed per-dataset profiles with protected-class unreachability, pending-proof as a fail-closed third state, effect-release gated on durable audit, and cold-section compilation of governance paths — is recorded as prior art.

## Honest bound
Relocation changes *when* you pay, not *whether*: deferred proofs still cost when produced, and a burst of on-demand proof production is a real operational load. The construction's claim is strictly *no guarantee is lost* — any throughput/latency benefit is an empirical question that must be measured per workload on named hardware, never asserted from the design.

*Contact hello@trithypha.dev.*
