# Governing the AI control plane: tool results are data, not instructions; provenance is a value-state, not a wrapper

**Disclosure ID:** DP-RD-0524 (landed in `docs/paper/defensive-papers/` 2026-07-22; number = the source RD id, verified free in the canonical index) · **Date:** 2026-07-19 · **Type:** defensive publication (prior-art disclosure — NOT a patent claim) · **Provenance:** the KB AI-control-plane adjudication (the data-mining/AI arc) — the shipped MCP/AI-tool boundary + the value-state/privacy system (framework design docs verified read-in-full) + the K3 governance model. Construction/position disclosure; no performance number is claimed.
**Purpose:** establish prior art for the AI-host governance construction below so it remains freely implementable. The tool-boundary and value-state/privacy mechanisms are **shipped/designed framework concepts** (verified read-in-full in the internal design corpus); the AI-output-provenance value-state and the additive AI-effect family are the disclosed **extensions**. Companion disclosure: dp-rd-0523 (the verdict-brand family), whose disjoint-brand rule §5 relies on.

## Setting

An application that hosts an AI model or an autonomous agent must govern **authority, privacy, effects, and contracts** while the model itself stays **replaceable** — the host owns the guarantees, the model owns the intelligence. The recurring failure mode is that a model's *output*, or a tool's *result*, is treated as trusted control flow: untrusted content plus private data plus an action channel (the "lethal trifecta"). This paper discloses the construction that makes the AI boundary **structural** — enforced by types and effects rather than by convention.

## Claimed mechanisms

### 1. Tool results are data, not instructions

An AI/agent tool boundary treats every tool, resource, and prompt as **untrusted until explicitly declared**, and — the load-bearing rule — treats a tool's returned content as **data, never as instructions** to the host or the model. Tool *availability* is not *permission*: a tool being reachable never implies authority to invoke it. Token pass-through is **denied** — a tool never inherits the caller's ambient credentials. This closes the injection path in which a retrieved document or a tool response redirects the agent.

### 2. Hash-pinned tools, re-validated per call

A declared tool is **hash-pinned**; its schema/identity is re-validated on **every** call, and a changed schema **forces re-approval** rather than silently proceeding. An external tool source is treated as a **third-party supply chain**: provenance, a pinned version, and a checksum are required. Model *sampling* (the host calling back into a model on a tool's behalf) is **denied by default** and is an explicit admission decision, not an ambient capability.

### 3. Provenance is a value-state, not a wrapper

AI-generated and untrusted-inbound content is governed as a **value-state qualifier** carried by the type-checker (e.g. `tainted` / a `generated` / `untrusted-output` state), **not** as a parallel wrapper generic (`Untrusted<T>` / `Generated<T>`). One canonical representation, checker-enforced end-to-end, so a governed sink refuses a tainted/generated value **by construction**. This is a deliberate layering choice: provenance belongs at the **value-state layer the checker already tracks**, giving exactly **one** mechanism for "untrusted-until-verified." A wrapper generic would be a *second* mechanism for the same property — and two mechanisms for one invariant is precisely where confusion (and bypasses) breed. Clearing provenance is an explicit, audited boundary (a `validate…?` untaint or a `redact()` safe-exit), never an implicit assignment.

### 4. Private data cannot reach a remote model

A `privacy { … }` contract states requirements the checker enforces **before** inference: **protected data must pass a redaction/authorization boundary before any inference** (`require protected_boundary before ai.inference`); a class of data may be processed **only locally, never a remote model** (`require local_execution`); protected values **cannot leave in a response** (`deny protected T to response.body`); audit writes require prior redaction (`require redaction before audit.write`). Private data is thereby structurally prevented from crossing into a remote model or an outbound channel.

### 5. AI decisions are K3, on disjoint brands

Human-review and AI-output acceptance are three-valued — **`+1` proceed / `0` review / `−1` deny** — under the fail-closed Kleene boundary (deny-by-default on the empty/unknown case). Per the verdict-brand family (companion disclosure dp-rd-0523), an "AI output looks good" verdict is its **own disjoint brand**: it **cannot launder** into "this action is authorized." Acceptance of model output and authorization of an effect are **separate types adjudicated at separate boundaries**.

### 6. AI as a governed effect family under structured supervision

AI operations are a **governed effect family** — a base inference effect plus additive effects (embedding / tool / agent / training / model-load / context read+write) — kept **separate** from generic `network.outbound` / `compute.run`, so AI-specific risk is declared and gated distinctly. Agents are **workers under structured supervision** (a gated background-task / worker-spawn effect, deny-by-default unless declared, with timeout / cancel / step-limit / merge), never ambient authority — **no orphaned agent** runs outside a supervising scope.

## Why this is safe to disclose (harm filter)

Every mechanism is a **hardening posture** that helps a defender and gives an attacker nothing: *treat tool output as data*, *pin and re-validate tools*, *keep private data off remote models*, *make AI-output acceptance a fail-closed K3 verdict on its own brand*. These are best practices for the widely-known prompt-injection / lethal-trifecta problem, disclosed here as a **structural** construction (types + effects, not convention). **No Galerina-specific weakness, bypass, or gap is disclosed; nothing here is deployment-specific; no performance claim is made.**

## Prior art (novelty disclaimed)

The Model Context Protocol, prompt-injection / lethal-trifecta defenses, capability-based tool security, taint tracking, and effect systems are all established. **No novelty is claimed** for those primitives. The recorded contribution is the **composition**: the specific set of tool-boundary rules made structural (§1–2); governing AI/inbound provenance as a **value-state rather than a wrapper generic**, as a single-mechanism design choice (§3); the `privacy {}` pre-inference contract (§4); and the disjoint-brand K3 acceptance of model output tied to a governed AI-effect family under structured agent supervision (§5–6).

## Honest bound

The tool-boundary and value-state/privacy mechanisms (§1–2, §4, and the value-state mechanism of §3) are **shipped/designed framework concepts**, verified read-in-full in the internal design corpus. The **AI-output-provenance state** (the `generated`/`untrusted-output` value-state of §3) and the **additive AI-effect family** (§6) are **proposed extensions** of the shipped value-state and gated-effect systems. This is a construction/position disclosure at the type-and-effect layer, **not** a measured benchmark; no claim is made about any specific deployment's configuration.

## Declarations
- **Type / tier:** defensive publication (prior-art disclosure, novelty disclaimed) — **not** a flagship/workshop novelty claim; no new cryptography, no new science.
- **Authorship & AI assistance:** drafted with AI assistance under human direction; grounded in the framework's shipped MCP/AI-tool-boundary and taint/privacy design docs (verified read-in-full) and the K3 governance model.
- **Funding:** none.
- **Competing interests:** none.
- **Data / artifact availability:** in-repo — the framework design docs cited; no external data; no measured benchmark (construction/position disclosure).
- **Licence:** Apache-2.0.

*Published as a defensive disclosure. Contact hello@trithypha.dev.*
