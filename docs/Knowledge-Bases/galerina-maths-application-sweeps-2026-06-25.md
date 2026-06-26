# Maths-application R&D sweeps — .tmf/db/TritMesh + expanded-scope (2026-06-25)

Two adversarially-verified sweeps asking "where else can the Galerina ternary-governance maths
apply." Same model as notes/62: verify-before-build, ZT-scored (AI-in-decision penalised),
crypto-stays-digital, fail-closed, defensive-pub. **Headline: the maths scope barely expands — the
cores already ship. 21 of 23 candidates re-derive shipped primitives; several would HARM ZT if
built; only a handful are real, all owner-gated. 2 guardrail-violating ideas marked DO-NOT-BUILD.**

## Sweep A — maths/virtual for .tmf, database, TritMesh (`wb7dqawdt`)

| target | idea | verdict | ZT | note |
|---|---|---|---|---|
| .tmf | tensor batch-segment verify (Freivalds) | **refute** | 10 | Freivalds (float, probabilistic) on bit-exact .tmf bytes violates SPORE-SUBSTRATE-001; no O(n³) to amortise; min-fold is O(N²), SLOWER than the linear hash walk. **DO NOT BUILD.** |
| .tmf | per-segment ConfidenceVerdict trust score | re-derivation | 26 | in-file p_allow is attacker-editable pre-signing; trust must be verifier-side/out-of-band. |
| .tmf | abstain-aware M-of-N threshold | **refute** | 40 | consensusTrit/majorityVote is *majority*, not a *distinct-signer threshold* → fail-OPEN to quorum-downgrade-by-attrition. Correct threshold already ships in `quorum.ts`. **DO NOT BUILD as proposed.** |
| database | K3 ≡ SQL NULL (No-Coercion) | re-derivation | 86 | SQL NULL→triUnknown already lifts through triStateAnd/Or/Not; the query engine that would use it is a by-design stub. |
| database | vAndTensor row/col RBAC | re-derivation | 90 | = the notes/62 net-new #2; build only as a verdict-shaper, never a query/RBAC engine. |
| tritmesh | abstain-aware replica consensus | re-derivation | 80 | plain sign-of-sum is NOT BFT; real replica BFT needs distinct-signed quorum (shipped). |
| tritmesh | T-MAC ternary routing | re-derivation | 74 | stays vocabulary; TritMesh is a separate product. |

**Net:** 0 genuine net-new on the core. Only sound residual = a **GF(2⁸) Shamir SSS ext module**
(digital, fits the custody split, blocked on .tmf slice-4 ML-DSA signing). Two **DO-NOT-BUILD**
guardrail violations (Freivalds-on-.tmf; majority-as-threshold).

## Sweep B — expanded-scope (16 areas: domains / internals / algebra) (`wdpcnecx4`)

**2 real BUILD picks (owner-gated, most-secure-first); 14 re-derivations; several harmful-if-built.**

| bucket | area | verdict | ZT | note |
|---|---|---|---|---|
| domain | **supply-chain provenance** (in-toto/SLSA+SBOM) | **build** | 86 | trust algebra 0% net-new, but the per-step-quorum→chain 2-level fold has zero callers + is enforcing; parser MUST emit explicit ABSTAIN for missing attestors. |
| internal | **typechecker 3VL** (isAssignmentCompatible) | **build** | 80 | NOT a re-derivation — a fix to a confirmed silent fail-OPEN (type-checker.ts:374 ALLOWs when type undeterminable). → owner-gated task. |
| domain | identity federation | re-derivation | 82 | SSO weakest-hop = min-fold, already shipped. |
| internal | Result.Masked channel | re-derivation | 82 | partial-return.ts Masked already exists. |
| domain | healthcare / fraud | re-derivation | 72 | vocabulary skins; keep any model degrade-only via vAnd. |
| internal | telemetry ternary health | re-derivation | 72 | ~15-line wrap over admission-feedback. |
| domain | safety-critical | **track** | 62 | availability-not-safety caveat; "safety" framing overreaches. |
| internal | graph 3VL reachability | re-derivation | 62 | fold the dyn-import DETECTION gap into scanner #40/#149. |
| algebra | interval / lattice / modal | re-derivation | 55-60 | meet-over-a-chain IS min; a *coupled* lattice would break No-Coercion. |
| internal | effect verdict tensor | re-derivation | 55 | would create a 2nd drifting admission authority — **harmful.** |
| internal | scheduler backpressure | re-derivation | 55 | a non-trapping defer is weaker than the shipped hard step-budget trap — **harmful.** |
| domain | ML selective-prediction | re-derivation | 28 | confidence operand is the model's own adversary-shapeable self-report. |
| domain | content trust-safety | re-derivation | 22 | **AI-as-arbiter ZT-9** — in-path moderation verdict from an AI is the theme-4 anti-pattern. |

**AI-in-loop flags:** content-T&S (ZT-9, never auto-approve), ML/healthcare/fraud (keep AI
degrade-only via `telemetryToSideSignal`/vAnd, never an authoritative operand). **Completeness
critic missed-areas (future):** temporal/time-windowed trit, cross-boundary capability-intersection
composition, agentic-AI tool-call mediation, regulated append-only evidence chains.

## Honest net
Across both sweeps the ternary maths is **broad but already-landed**. The value of this exercise was
not new maths — it was (a) **confirming** the shipped primitives cover the space, (b) catching two
**DO-NOT-BUILD** guardrail violations before anyone coded them, (c) surfacing a **real typechecker
fail-open** (owner-gated fix), and (d) two genuinely-uncovered enforcing folds (supply-chain
attestation adapter; the typechecker 3VL). Everything buildable is owner-gated and crypto-digital
clean. 0 papers (defensive-pub).

*Source: workflows `wb7dqawdt` + `wdpcnecx4` (2026-06-25). Feeds notes/62
(`galerina-rd-62-maths-expansion-2026-06-25.md`).*
