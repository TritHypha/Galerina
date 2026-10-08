# Astra final delta review — coupled RD-1413–1415 design v1.0

## Role and intended use

Independently challenge the current integrated Galerina memory-security design
after it incorporated an exact-source Astra re-entry finding and a fresh
adjacent-mapper audit. Codex will adjudicate your answer against the pinned
documents and current owner records. Your review is advisory only; it cannot
approve the whole design, implement code, alter an RD state, or grant product
clearance.

## Scope and constraints

Read only the exact design and named evidence reports below. Do not edit files,
run commands, inspect private RD bodies, or infer deployed/production behavior.
RD metadata currently reports STALE; Codex reopened the private RD owner
documents directly and confirmed their hashes and states still hold product
closure. Their bodies are not included here. The owner has approved only
ECC/RAS as host reliability and bounded protected staging/verification; the
whole design remains DRAFT FOR OWNER REVIEW / NON_AUTHORIZING. No raw plaintext
may be handed to arbitrary TypeScript callbacks, and a second plaintext copy
is not a zero-trust control.

## Exact artifacts

- Design v1.0: `docs/superpowers/specs/2026-10-05-coupled-rd-1413-1415-design.md`,
  SHA-256 `3C7CAE5E976596C891B1E7E375127AC82D8B3BF7074725F17FCA49A1330A2C11`.
- Re-entry adjudication: `docs/reports/rd1413-1415-secret-access-reentry-adjudication-20261005.md`,
  SHA-256 `E6E4F616B1AD22E9BA6F8B98C1F6C2F95ECC3982BB8460C4FAC26C6C31551781`.
- Astra delta adjudication: `docs/reports/rd1413-1415-reentry-design-delta-astra-adjudication-20261005.md`,
  SHA-256 `C2877ED68A135778B2C9285ED7D84626AD5170ED6A7E6761037419B664FDEA27`.
- ZeroCopyMapper current-state report: `docs/reports/rd1414-zero-copy-mapper-current-state-20261005.md`,
  SHA-256 `06B8F517078F8AA9AA3BAA960C431CCAAF324FBDB313F90CA28B9BABD40E32C8`.
- The fresh mapper package result in that report is TypeScript build plus
  48/48 package tests and a small local buffer-copy/dispose observation. This
  is not secret-runtime evidence.

## Independent review vectors

1. **Coupled lifecycle and ordering:** Are the invariants and stages 7–10
   coherent across custody, terminal refusal, cleanup, effect commit, release,
   and reuse? In particular, does terminal invalidation serialize at the
   actual irreversible effect/commit/release boundary, or can an operation
   checked before enqueue still commit after terminal failure? Identify one
   missing state transition, owner, or counterexample.
2. **Evidence and adoption boundary:** Does v1.0 accurately represent the
   current ZeroCopyMapper behavior and distinguish it from the protected app
   path? Is any claim too strong or any important residual missing? Verify
   artifact hashes and citations in the supplied reports; do not claim source
   or product execution beyond their stated evidence.

## Outcome-to-proof map

- Vector 1 can be specified, not proven: direct product proof requires the
  selected Fungi runtime/ABI to pause an effect at its irreversible boundary,
  make terminal refusal race it, and observe whether the effect commits. The
  design currently supplies the acceptance contract only. Any missing selected
  primitive is NOT_VERIFIABLE, not PASS.
- Vector 2's direct evidence is the mapper source/test hash, 48-test run, and
  bounded copy-after-dispose observation recorded in the report. It proves
  local JavaScript behavior only. It cannot prove physical erasure, protected
  Fungi custody, app-kernel wiring, or route integration.
- Weaker proxies include design/model agreement, HTTP 500 alone, graphs, the
  Fungi presence fold, and TypeScript tests as evidence of protected runtime
  behavior.

## Output contract

For each vector return PASS, PARTIAL, or NOT_VERIFIABLE and label each claim
CONFIRMED, PLAUSIBLE, or NOT_VERIFIABLE. Cite exact design section and report
section; give the smallest counterexample or missing observable; state whether
v1.0 is safe to retain as a draft; and name one bounded next action. Keep the
three RD statuses HOLD / NON_AUTHORIZING unless the specified full-route proof
exists (it does not in this packet).

## Exclusions and self-rejection

Do not select a platform TCB, invent owner facts, approve an API, lower the
zero-trust requirement, propose TypeScript authority as a fix, or treat
ZeroCopyMapper as integrated product evidence. Self-reject if either vector
is omitted, hashes are not checked, the mapper's limits are omitted, or any
RD/product/runtime status is upgraded from document-only evidence.
