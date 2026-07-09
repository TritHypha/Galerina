# Defensive Publication — K3-governed AI tool invocation: a three-valued toxic-flow label lattice over signed capability-bounded tool manifests

**Disclosure ID:** DP-RD-0295b · **Date:** 2026-07-09 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Stage:** **DESIGN-STAGE DISCLOSURE** — specified in KB RD-0294 (finding F4) / RD-0295b; extends the shipped
signed-manifest machinery (DP-RD-0285b) and the shipped K3 governance meet. No implementation of the
flow-lattice yet.

## 1. What is disclosed

A **data-flow governance layer** for AI/agent tool ecosystems (MCP-class tool calling) that decides on the
**composition** of tool calls, not just each call in isolation:

1. **Labels, not just per-tool effects.** Each signed, capability-bounded tool manifest (derived from a
   compiler-checked effect/budget contract — DP-RD-0285b) additionally declares the **sensitivity labels** it
   reads and writes (e.g. `tenant-data`, `secret`, `public`, `network-egress`) over a lattice.
2. **A three-valued (Kleene K3) verdict on the *flow*.** For a session/agent, the composition of the tool
   calls so far is evaluated over the label lattice: **+1 allow** (no boundary crossing), **−1 deny** (a
   crossing that violates policy — e.g. a tool that has read `tenant-data` composed with a `network-egress`
   tool in the same session), **0 undecidable ⇒ governed hold** (challenge / human-in-the-loop / refuse) when
   the flow cannot be shown safe. Composition is **meet/min-only** (a flow can degrade toward deny, never
   manufacture allow), **deny-by-default on flows**.
3. **Enforced at the call boundary, server-side.** The verdict gates *emission* of the next tool call; a
   flow that would cross a boundary is unrepresentable regardless of what an upstream model "decides,"
   because the label check is in the governed runtime, not the model's prompt.

## 2. What it prevents

The **toxic-flow** class in agentic AI: a chain of individually-approved, individually-safe tools that
*composes* into an exfiltration or confused-deputy path — each per-tool capability check passes, and the
**composition** is the attack. Per-tool signing/bounding (DP-RD-0285b, and mainstream MCP tool-audit) does not
see it; a flow lattice does. Also bounds **excessive agency** (an injected agent cannot compose beyond the
labels its session is cleared for) and complements prompt-injection mitigation by constraining *what a
compromised agent can do*, even when it is compromised.

## 3. Honest scope and bounds

- **Mitigates, does not eliminate, prompt injection.** The lattice constrains the *reachable flows*, not
  whether the agent is subverted; injection that stays within an allowed flow is not stopped by this mechanism
  (defence-in-depth, not a perimeter).
- **Correct labels are a modeling obligation.** The guarantee is only as good as the sensitivity labels
  assigned to tools/data; a mislabeled `network-egress` tool defeats it. Labeling is above the mechanism.
- **The undecidable→hold verdict trades availability for safety** — some benign flows will be held; this is
  the deliberate fail-closed posture, not a bug.
- **Composition is intra-session/context** — cross-session or out-of-band exfiltration is a different surface.

## 4. Prior art acknowledged (novelty disclaimed)

Information-flow control and security label lattices (Denning 1976; Myers–Liskov Decentralized Label Model);
taint/dataflow tracking; Kleene three-valued logic (1938); capability security and deny-by-default composition;
the 2025–26 MCP tool-poisoning / "toxic-flow" advisory literature; OWASP Agentic-AI and LLM Top-10 (excessive
agency, tool misuse). The disclosed composition — *a Kleene-three-valued verdict on the **composition** of AI
tool calls over a sensitivity-label lattice, gating call emission server-side, meet-only/deny-by-default,
layered on signed capability-bounded manifests, with undecidable ⇒ governed hold* — is published to establish
prior art; novelty is disclaimed for every constituent.

## 5. Declarations

- **Type/tier:** defensive-pub (design-stage).
- **Authorship & AI assistance:** drafted with AI assistance (Claude) under human direction, grounded in KB
  RD-0294 (F4) / RD-0295, DP-RD-0285b, the shipped K3 governance meet, and the MCP tool-poisoning literature.
- **Funding:** none. **Competing interests:** none declared.
- **Data / artifact availability:** design source KB `galerina-rd-0294…`/`…-0295…`; shipped constituents: the
  effect/budget contract checker, hybrid-signed `.lmanifest`, the K3 `vAnd`/meet. Flow-lattice not yet built.
- **Licence:** Apache-2.0.
