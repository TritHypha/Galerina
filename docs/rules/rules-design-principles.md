# Rules: Design Principles

These rules govern how Galerina itself is designed and documented — how a
proposed feature, keyword, rule or document earns its place. They sit above
ordinary features: a proposal can satisfy every
[Non-Negotiable Rule](rules-non-negotiable.md) and still be wrong for Galerina
if it fails these.

See [Priority Categories](rules-priority-categories.md) for how ideas are
sorted once they pass, and the
[Charter Statement](../GALERINA_CHARTER_STATEMENT.md) for the mission these
principles distil. The charter remains canonical; this doc is the operational
gate.

## 1. The identity sentence is a feature gate

> **Galerina is a zero-trust, contract-first language for governed APIs and
> services.**

That one sentence is the scope test. Every proposed feature, package, keyword
or rule must be able to complete: *"…because Galerina is a zero-trust,
contract-first language for governed APIs and services."* If it cannot, it is
out of scope — not wrong, just not Galerina.

**Why.** A language dies from scope creep before it dies from missing features.
A single quotable identity lets a human *or* an AI tool reject an idea in one
step instead of re-deriving the whole charter each time.

**How to apply.**
- **Zero-trust** — the feature must not assume trust it has not verified. If it
  grants authority from data, ambient state or convenience, it fails the gate
  (see the Charter §6 trust model: *untrusted until typed / validated /
  permissioned / provenance-known / policy-allowed / explainable*).
- **Contract-first** — the feature must express itself as a typed contract
  (request, response/view, effect, capability, policy), not hidden dispatch.
- **Governed APIs and services** — the target domain. Operating-system, kernel,
  desktop-GUI and raw-vendor-hardware features stay out of v1 scope
  ([Charter §3, §14](../GALERINA_CHARTER_STATEMENT.md)).
- This distils [Charter §2 and §15](../GALERINA_CHARTER_STATEMENT.md); cite the
  charter for the canonical, longer statement.

## 2. Coherency over consistency

Prefer a design that makes the whole system **cohere** over one that is merely
**uniform**. When the two conflict, coherency wins.

**Why.** Mechanical consistency ("do it the same way everywhere") is easy to
enforce and usually right — but it becomes a trap when a uniform rule produces a
result that does not fit how the rest of the system reasons. Coherency asks the
harder question — *does this make sense together?* — which is the one that keeps
a security language trustworthy.

**How to apply.**
- A new construct should compose with the K3 verdict lattice
  (`DENY < HOLD < ALLOW`, MIN not MAX), the effect/capability model and the
  report surface — even if that means it does not look identical to a
  superficially similar construct elsewhere.
- Do not add a feature *only* because a neighbouring feature has it
  ("consistency"); add it because the system is more coherent with it than
  without.
- Flag, do not silently smooth, a place where consistency and coherency pull
  apart — the tension is information.

## 3. The grug test

If a working backend developer — not a language theorist — cannot read a
construct and correctly predict what it **permits, denies and reports**, the
construct is too clever. Simplicity is the default; complexity must earn its
place and be declared, never hidden.

**Why.** Galerina's value is *legible* security. A rule nobody understands is a
rule nobody can trust — and an AI tool will mis-generate against it. Cleverness
that hides cost violates the charter's no-hidden-power, no-magic stance
([Charter §14, §15](../GALERINA_CHARTER_STATEMENT.md)).

**How to apply.**
- Prefer explicit, boring surface syntax over powerful implicit behaviour.
- If a feature needs a footnote to be safe, either make the safe path the only
  path or cut the feature.
- "It is more elegant" is not a defence; "a junior can predict its verdict and
  its report" is.

## 4. The dual-audience rule

Every rule, keyword, diagnostic and document must serve **two audiences at
once**: the human developer *and* the AI coding tool that reads the same
surface. Neither may be an afterthought.

**Why.** Galerina is explicitly AI-readable ([Charter §1, §13](../GALERINA_CHARTER_STATEMENT.md)).
A message a human understands but an AI cannot parse into structure — or a
machine format no human can review — breaks the governance loop, because
governance needs a human to review what the machine proposed.

**How to apply.**
- Diagnostics carry both a human sentence *and* a stable, machine-referenceable
  code/shape, so tools can act and humans can audit.
- Docs state what is implemented vs planned vs experimental vs research
  explicitly, so neither a human nor an AI over-claims ([Charter §13](../GALERINA_CHARTER_STATEMENT.md)).
- When a design reads well for one audience but not the other, it is not done.

## Priority

These are **Recommended Design Rules** in the
[priority model](rules-priority-categories.md) — they guide every design
decision but are enforced by review and by the checkers, not by a single
compiler error. A proposal that fails a design principle should be redesigned or
rejected before it becomes a requirement.
