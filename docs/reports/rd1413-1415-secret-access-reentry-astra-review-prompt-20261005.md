# Astra review request — current SecretGate re-entry candidate

## Role and intended use

Act as an independent, read-only adversarial source reviewer. Your answer will be checked by Codex against the exact current owner source. It is advisory and cannot change RD, product, release, or authorization status.

## Scope and constraints

Inspect only the named Galerina working-tree source and tests. Do not edit files, run broad scans, infer committed or production behavior from this dirty branch, read or reproduce private RD bodies, or claim that TypeScript proves Fungi/runtime/host security. The agreed owner boundary is: ECC/RAS is host reliability only; Galerina uses bounded protected staging and verification; a second plaintext copy is not a zero-trust integrity control. RDs 1413–1415 remain HOLD / NON_AUTHORIZING.

## Exact evidence pins

- Branch: `codex/rd1413-1415-coupled-route-20261004`
- HEAD: `e1c2496f3f36d154a445ba9c302401ccaaf74bae`
- Working tree is dirty; the reviewed source is not committed.
- `packages-ts/galerina-framework-app-kernel/src/kernel.ts` SHA-256 `68CF8ACA8F74825E2FC8C2791CAC14AC9AAD25C34C644A0FDCDACA11A10771E2`
- `packages-ts/galerina-framework-app-kernel/src/secret-gate.ts` SHA-256 `995CA61B95014A91E962D9A4DCC5D091AD943A8F360DE51554E2BA4637A66DCC`
- `packages-ts/galerina-framework-app-kernel/tests/secret-gate.test.mjs` SHA-256 `970CAD02F91E2605AA3E5F9A6E28F14209483858AB6D32DCBEA7D65D3C7E3E65`
- `packages-ts/galerina-framework-app-kernel/tests/security-closure.test.mjs` SHA-256 `7EDDA6D1366DE5955F92F2F4E0D9586C0958FC88ADF71A28E0D601C8D93B222F`
- Fresh focused result: package TypeScript build passed; 3 matching re-entry tests plus the security-closure test passed (4 total). This is candidate evidence only.

## Questions

1. **Adversarial re-entry:** Can provider or handler-controlled same-stack or synchronously triggered code catch a re-entrant secret-access refusal and still cause the outer request to deliver bytes or succeed? Trace the precise state transitions in `kernel.ts` and `secret-gate.ts`; identify the smallest bypass, or explain why each feasible re-entry is latched before staged bytes reach the consumer. Name a discriminating red test if coverage is incomplete.
2. **Evidence and integration boundary:** What is the strongest justified claim from these exact files and the focused test result? Check whether this seam establishes the actual governed `/secure` authenticated object/version operation, Fungi-owned authority and secret custody, protected Linux runtime/arena, complete cleanup/reuse, or recipient-bound release. Identify the next single source-backed implementation/evidence action that reduces a real coupled-RD blocker without overstating these tests.

## Outcome-to-proof and response contract

For Q1, direct evidence means tracing the exact pinned code and checking the named refusal/outer-delivery ordering; tests are supporting evidence only. For Q2, direct evidence means the loaded real operation and exact runtime/host path; a TypeScript fixture, design note, graph edge, or synthetic test is insufficient. For each question return `PASS`, `PARTIAL`, or `NOT_VERIFIABLE`, label claims `CONFIRMED`, `PLAUSIBLE`, or `NOT_VERIFIABLE`, cite exact file/line and test names, and state one smallest counterexample or missing discriminating check. End with a concise recommendation and explicit residuals. Self-reject if the response omits either question or upgrades candidate tests/design evidence to product closure.
