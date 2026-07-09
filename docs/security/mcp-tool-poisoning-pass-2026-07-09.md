# MCP / AI tool-poisoning defensive pass (DP-RD-0285b) — 2026-07-09

Continuation of [`cybersec-skills-audit-2026-07-09.md`](cybersec-skills-audit-2026-07-09.md) — closes that
audit's deferred **"MCP tool-poisoning (DP-RD-0285b)"** item. Same method as the F-series: test the
disclosure's *by-construction* claims against **real** Galerina code, verify **by running** not only reading,
and assign honest verdicts. **A finding MUST NOT print CONFIRMED for machinery that does not exist** — the same
zero-trust bar applied to the `.hypha` engine, whose TritMeshQL implementation is external/future.

**Verdict tiers.** `CONFIRMED` = the construction is present in readable code **and** exercised by a passing
negative test (the attack class is refused, not merely undocumented — never "unhackable"). `DEMONSTRATED` =
the pattern ships and is tested, but for a *sibling* surface, not the named one. `SPEC-ASSERTED` = design-stage;
specified, not implemented. `GAP` = a residual to track. `N/A` = not applicable / no attack surface yet.

**Threat class (2025–26).** *Tool poisoning* (malicious/misleading tool descriptions steering the model),
*rug-pulls* (an approved tool's definition silently changing after approval), *inventory spoofing* (a lookalike
server forging tool lists), and *signature downgrade* (stripping the PQ half). DP-RD-0285b's countermeasure:
derive the tool definition from a compiler-checked effect/budget contract, bind it into a hybrid-signed
deployment artifact, and have the client verify + pin the signer before use (deny-by-default).

## Verdict summary

| ID | Claim under test (DP-RD-0285b) | Verdict | Evidence |
|----|--------------------------------|---------|----------|
| **M1** | An **MCP adapter** derives a tool manifest from a contract, binds it into the signed `.lmanifest`, and a client verifies/pins it before MCP tool use | **SPEC-ASSERTED** (design-stage; **not implemented**) | paper §Stage + §5 ("Adapter not yet implemented") |
| **M2** | The **derive→hash-pin→hybrid-sign→allow-list→fail-closed-admit** pattern is real machinery, not new invention | **DEMONSTRATED** (3 shipped siblings) | `bridge-attestation.ts`, `plugin-manifest.ts`, core-compiler `attestation.ts` (F1) |
| **M3** | A tool/bridge with **missing / malformed / unpinned / unsigned** attestation is **refused** (fail-closed admission) | **CONFIRMED** (read + run) | `bridge-attestation.ts:92-142`; tests below |
| **M4** | The signature is **algorithm-pinned** and the **hybrid PQ half cannot be downgraded** at admission | **CONFIRMED** (read + run) | `bridge-attestation.ts:116,230-257`; `hybrid-engine.ts:486-495,530-540` |
| **M5** | **Rug-pull / manifest-drift** is a detectable event (hash-pin + injective, non-colliding pre-image) | **CONFIRMED** (read + run) | `manifest.ts:92-136` (`canonNum`), `bridge-attestation.ts:107-109` |
| **M6** | Tools are **capability- and budget-bounded** (deny-by-default vocabulary exists; no fail-open stub) | **CONFIRMED** (honest contract) | `galerina-ai-agent/src/index.ts` (typed allow/deny + limits) |
| **M7** | An **MCP-specific** fail-closed admission surface + a standing conformance check for it | **GAP** (forward residual) | none yet — see *Residuals* |

## Constituent findings (evidence)

### M1 — the MCP adapter is design-stage (SPEC-ASSERTED, not CONFIRMED)
`docs/paper/defensive-papers/dp-rd-0285b-signed-capability-bounded-mcp-tool-manifests.md` states plainly
(§Stage): *"DESIGN-STAGE DISCLOSURE … no implementation exists yet. The constituent machinery … is shipped …
**the MCP adapter and manifest derivation are not**"*, and §5: *"Adapter not yet implemented."* There is no
code that derives an MCP tool definition from a contract, binds it into a `.lmanifest`, or verifies an MCP tool
manifest before a tool call. **Zero-trust: the tool-poisoning-prevention claim for MCP is a design claim, not
code-verifiable today.** This is the correct, honest state — recorded, not banked. (Same posture as `.hypha`.)

### M2 — the pattern is DEMONSTRATED by three shipped, tested siblings
The construction DP-RD-0285b would use for MCP already ships and is tested for three *other* signed-manifest
admission surfaces, so RD-0285b is *"wire the existing pattern to an MCP adapter"*, not *"invent new crypto"*:
1. **Inference-bridge attestation** — `galerina-tower-citizen/src/bridge-attestation.ts` (native BitNet/quantum backends).
2. **Plugin manifests** — `galerina-tower-citizen/src/plugin-manifest.ts` (`verifyPluginManifest`; binds `engineId`/`artifactHash` so a manifest signed for plugin A cannot admit plugin B).
3. **`.lmanifest` governance/fuse signing** — `galerina-core-compiler/src/attestation.ts` + `fuse-loader.ts` (F1 CONFIRMED: algorithm-pinned hybrid verification).

### M3 — fail-closed admission (CONFIRMED, read + run)
`verifyAttestation` (`bridge-attestation.ts:92`) returns `{ ok:false }` on **every** failure path: no attestation,
shape violation (`validateManifestShape`), unpinned hash (`allowedHashes`), absent/bad signature, or a verify
exception (`catch → deny`). The Ed25519 check is **algorithm-pinned** — `edVerify(null, …)` (line 116), pure
EdDSA, primitive not read from the artifact (mirrors F1). Runtime negatives (all passing):
- `engine DENIES an unattested bridge under an attestation policy`
- `verifyAttestation: signed manifest verifies; tampered fails`
- `hash pinning: only a pinned manifest hash passes`
- `verifyAttestation ENFORCES the #201 manifest checks end-to-end (fail-closed via validateManifestShape)`

### M4 — algorithm-pinned + no PQ downgrade (CONFIRMED, read + run)
`verifyAttestationHybrid` (`bridge-attestation.ts:230`) runs **all** classical checks, then **additionally**
requires the ML-DSA-65 half (logical AND, no downgrade), bound to a FIPS-204 **domain-separation context**
`galerina.bridge.manifest.v2` (line 187) so a bridge-manifest signature cannot be cross-protocol-confused with
the audit/governance surfaces. The `requireHybrid` **no-downgrade** rule is enforced at the *admission gate*
before routing — `hybrid-engine.ts:488` (bridges) and `:532` (photonic): `requireHybrid === true &&
mlDsaPublicKey === undefined → DENY`. Correct layering: the verifier is a simple primitive; the gate enforces
policy. Runtime negatives (all passing):
- `hybrid: an Ed25519-only attestation is rejected by the hybrid verifier (no downgrade)`
- `engine DENIES an Ed25519-only bridge under a hybrid-requiring policy (no PQ downgrade at admission)`
- `hybrid: tampered manifest fails closed` · `wrong ML-DSA key fails (both signatures required)` · `wrong Ed25519 key fails`
- `verifyAttestation: a validly-signed but REVOKED signing key is refused (fail-closed)`

### M5 — rug-pull / drift is detectable (CONFIRMED, read + run)
A silently-changed manifest hashes differently, so `allowedHashes` pinning (`bridge-attestation.ts:107`) refuses
it. The canonical pre-image is **injective**: `canonNum` (`manifest.ts:92`) maps `NaN`/`±Infinity` to *distinct*
sentinels (JSON renders both as the lossy `null`), and `validateManifestShape` rejects non-finite numerics
unconditionally — so two distinct manifests cannot collide to one attestation hash/signature. Contract test:
`attestation injectivity: non-finite tolerance is rejected (any mode) + NaN/±Infinity do not collide in the
pre-image` (passing). Fidelity/tolerance floors are fail-closed too: you cannot declare a `minFidelity` you did
not measure, nor a `tolerance` tighter than the witnessed epsilon.

### M6 — capability/budget contract is honest (CONFIRMED contract; no fail-open)
`galerina-ai-agent/src/index.ts` is a **pure typed contract** — `AgentToolPermission { tool, decision:
"allow"|"deny", scope? }`, `AgentLimits { timeoutMs, memoryBytes, maxToolCalls, maxTokens?,
rateLimitPerMinute? }`, `AgentDefinition { tools, effects, permissions, limits, failureBehaviour }`. It is a
**deny-capable, budget-bounded** shape and, being types only, executes nothing — there is no implementation
pretending to enforce (no fail-open). The capability + budget vocabulary DP-RD-0285b needs (*"capability and
budget fields let the host bound the tool before invocation"*) therefore **exists** as a checked contract; only
the MCP wiring that consumes it is missing (M1/M7).

## Honest scope & bounds (from the disclosure §3, restated and verified)
- The signature attests **provenance + derivation integrity, not semantic goodness** — a signed tool can still
  be a badly-designed tool (**integrity ≠ fidelity**; **integrity ≠ origin** — never treat a hash/AEAD tag as
  authorship). The **effect/budget bounds** are the checked part; this pass confirms the *bounds*, not fidelity.
- Free-form natural-language description prose beyond the templated contract fields (intent string + effect
  list) is a **residual channel** and remains so until derivation is implemented (M1).
- The three shipped siblings verify *bridge/plugin/fuse* manifests, **not** MCP tool manifests. Do not read M2–M5
  as "MCP tool-poisoning is solved in code" — read them as "the mechanism it needs is proven elsewhere."

## Residuals

- **M7 (GAP, fix-forward — do not fabricate now).** No MCP-specific admission function (a `verifyMcpToolManifest`
  analog) and no conformance check asserting an MCP path is fail-closed — correctly, because the adapter does
  not exist and a check must not assert an absent construction. **When the adapter lands** it MUST reuse
  `verifyAttestationHybrid` / `verifyPluginManifest`'s fail-closed pattern (not a fresh, unproven path) and gain
  a `conformance-scan.mjs` check.
- **Operationalised now:** to keep the *shipped* siblings honest, this pass adds a `bridge-attestation-failclosed`
  by-construction check to `@galerina/devtools-security` (`conformance-scan.mjs`) — it goes RED if the pinned
  `edVerify(null,…)` or the `requireHybrid` no-downgrade guard is ever removed. So the constructions M3/M4 rely
  on cannot silently regress while we wait for the MCP adapter.

## Status
Constituents CONFIRMED (read + run); the MCP surface itself SPEC-ASSERTED (design-stage). No OPEN-RISK requiring
an immediate fix was found — the one residual (M7) is *absence of an unbuilt feature*, tracked forward, not a
live hole. Pass covers **M1–M7**; the MCP adapter is future work (RD-0285 §5.1).
