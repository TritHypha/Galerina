# Astra review: RD-1413–1415 re-entry design delta

## Role and intended use

Act as an independent, read-only reviewer of a narrow update to Galerina's
coupled RD-1413–1415 design. Codex will adjudicate your findings against the
exact artifacts. Your answer is advisory: it cannot approve the complete
design, authorize implementation, change an RD state, or establish product
security.

## Scope and constraints

Review only the named Galerina design, adjudication report, and source/test
pins below. Do not edit files, run commands, inspect private RD bodies, or
infer committed, deployed, Fungi-runtime, or production behavior from this
dirty candidate. The only owner-approved choice in this delta is ECC/RAS as a
host reliability layer plus bounded protected staging/verification; neither
ECC/RAS nor a second plaintext copy is a zero-trust control. The full design
remains DRAFT FOR OWNER REVIEW / NON_AUTHORIZING. Do not claim a TypeScript
wrapper can revoke bytes already disclosed to a callback.

## Exact artifacts

- Design: `docs/superpowers/specs/2026-10-05-coupled-rd-1413-1415-design.md`,
  SHA-256 `7ECC78BD97956C18A6FEE9A4ECFE89BC73F2EAD2B8D73B91E37ED1B2B1D1C4B1`.
- Adjudication: `docs/reports/rd1413-1415-secret-access-reentry-adjudication-20261005.md`,
  SHA-256 `E6E4F616B1AD22E9BA6F8B98C1F6C2F95ECC3982BB8460C4FAC26C6C31551781`.
- Candidate branch/head: `codex/rd1413-1415-coupled-route-20261004` /
  `e1c2496f3f36d154a445ba9c302401ccaaf74bae`; dirty and not a release build.
- Source/test hashes are enumerated in the adjudication report. Astra's prior
  source review and Codex's independent reproduction found: a pending re-entry
  refusal is latched, but after raw bytes are delivered to consumer callback
  code, that code can catch a nested refusal and retain a copy; the request
  returns 500 and the gate-owned original is wiped. No successful-response
  bypass or second provider acquisition was demonstrated.

## Questions — independent vectors

1. **Trust boundary and lifecycle:** Does the proposed constraint—no raw
   plaintext view to arbitrary host callbacks; an opaque object/version-bound
   operation with secret-dependent effects and release mediated inside the
   protected Fungi/runtime—actually address the demonstrated residual, without
   promising impossible revocation of bytes already disclosed? Identify a
   smaller bypass, an overclaim, or a missing lifecycle transition.
2. **Proof and integration:** Are the proposed discriminating tests sufficient
   to distinguish pending-refusal protection from post-disclosure behavior,
   terminal failure, release suppression, cleanup, and reuse? Name the single
   most important missing observable or negative test. State which parts remain
   NOT_VERIFIABLE without a loaded route and selected runtime.

## Required inspection and outcome-to-proof map

- For question 1, inspect the exact design paragraph and the pinned adjudication
  result. Direct proof is consistency between the claimed contract and the
  observed copied-byte counterexample. The source-level replay is candidate
  evidence only; a design sentence or passing TypeScript fixture cannot prove
  the Fungi/runtime boundary.
- For question 2, inspect the design's acceptance-test row and compare it with
  the exact counterexample and stated product gaps. Direct product proof would
  require an actually loaded governed `/secure` route, the selected Fungi
  runtime/ABI and protected host profile, and observable effects/release plus
  cleanup/reuse on that path. Those are not supplied; mark product integration
  NOT_VERIFIABLE.
- Weaker proxies that cannot close either target include model agreement,
  design text, graph/index edges, a TypeScript callback test, a Fungi presence
  fold, or HTTP 500 by itself.

## Output contract

For each numbered question return PASS, PARTIAL, or NOT_VERIFIABLE; label each
material claim CONFIRMED, PLAUSIBLE, or NOT_VERIFIABLE; cite exact design
section and report section; give the smallest counterexample or missing
observable; and recommend only a bounded next step. Explicitly state whether
the document delta is safe to retain as a proposed constraint. Do not imply
the full design or any RD is approved or closed.

## Exclusions

Do not propose TypeScript authorization as the fix, accepting copies as safe,
using ECC/RAS as malicious-integrity proof, weakening zero-trust, choosing a
host profile, or implementing a new API from this review.

## Self-rejection

Self-reject if either review vector is omitted, if you claim product/Fungi/
host proof from the supplied TypeScript evidence, if you fail to disclose that
the full design remains pending owner review, or if your answer treats this
prompt as authority to modify code or RD status.
