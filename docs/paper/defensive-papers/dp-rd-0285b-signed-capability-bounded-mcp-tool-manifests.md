# Defensive Publication — Signed, capability-bounded AI tool manifests derived from compiler-checked contracts (anti-tool-poisoning for MCP-class protocols)

**Disclosure ID:** DP-RD-0285b · **Date:** 2026-07-09 · **Type:** Prior-art disclosure (defensive) · **Not** a patent claim.
**Stage:** **DESIGN-STAGE DISCLOSURE** — specified in KB RD-0285 §5.1; no implementation exists yet. The
constituent machinery (contract-checked flows; effect checker; hybrid Ed25519 + ML-DSA-65 signing of
`.lmanifest` artifacts) is shipped in the Galerina toolchain; the MCP adapter and manifest derivation are not.

## 1. What is disclosed

A derivation-and-signing pipeline for AI tool definitions (MCP-class tool-calling protocols):

1. **Derived, never authored:** the tool definition (name, description, input/output schema, side-effect
   surface, budgets) is **generated from a compiler-verified flow contract** — the typed signature, the
   declared-and-checked `effects { }` set (deny-by-default; undeclared effects fail compilation), and the
   contract's resource budgets (memory/energy/monetary ceilings). The description of what the tool *does* is
   therefore bound to what the compiler *proved it may do* — a tool manifest cannot claim less (or other)
   than its effect set.
2. **Signed as a deployment artifact:** the derived manifest is embedded in / bound to the signed build
   artifact (the `.lmanifest`, hybrid Ed25519 + ML-DSA-65), so the tool inventory a client sees and the
   governed code that executes are one attested object. Re-derivation on rebuild makes **manifest drift**
   (tool says X, code does Y) a build failure, not a runtime surprise.
3. **Client-side verification:** an AI client (or its host) verifies the manifest signature and pins the
   signer before first use and on every update; an unsigned or re-signed-by-another-party manifest is
   refused. Capability and budget fields let the host bound the tool *before* invocation (deny-by-default
   composition with the host's own policy).

## 2. What it prevents

The live 2025–26 attack class against AI tool ecosystems: **tool poisoning** (malicious or misleading tool
descriptions steering the model), **rug-pulls** (a benign tool's definition silently changing after
approval), and **inventory spoofing** (a lookalike server presenting forged tool lists). With derivation
from checked contracts + signatures, the description cannot diverge from the checked behaviour surface, and
changes are detectable signature events.

## 3. Honest scope and bounds

- The signature attests **provenance and derivation integrity**, not semantic goodness: a signed tool can
  still be a badly-designed tool (integrity ≠ fidelity — DP-RD-0129 applies and is incorporated by
  reference). The effect/budget bounds are the checked part.
- Natural-language *description text* is constrained only insofar as it is templated from the contract
  (intent string + effect list); free-form prose beyond that remains a residual channel and is flagged as such.
- Requires a key-distribution/pinning story on the client side (standard code-signing trust bootstrap; no
  new PKI is claimed).

## 4. Prior art acknowledged (novelty disclaimed)

Code signing and signed package manifests; SLSA provenance attestations; Sigstore; signed OpenAPI /
API-description proposals; MCP's own specification (tool definitions, and its 2026 auth alignment); W3C
Verifiable Credentials; the tool-poisoning literature (2025–26 advisories). The disclosed composition —
*tool definitions derived mechanically from compiler-checked effect/budget contracts and bound into the
signed deployment artifact, so that the AI-visible tool surface is attested against the enforced one* — is
published to establish prior art; novelty is disclaimed for every constituent.

## 5. Declarations

- **Type/tier:** defensive-pub (design-stage).
- **Authorship & AI assistance:** drafted with AI assistance (Claude) under human direction, grounded in KB
  RD-0285 §5.1, the shipped effect-checker/`.lmanifest` machinery, and the MCP 2026-07-28 release-candidate
  spec announcement.
- **Funding:** none. **Competing interests:** none declared.
- **Data / artifact availability:** design source KB `galerina-rd-0285-…`; shipped constituents:
  `effect-checker.ts` (deny-by-default effects), hybrid-signing pipeline, `.lmanifest` format. Adapter not
  yet implemented.
- **Licence:** Apache-2.0.
