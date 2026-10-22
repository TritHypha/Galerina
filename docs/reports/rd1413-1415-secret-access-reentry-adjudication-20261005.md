# RD-1413–1415 Secret-Access Re-entry Adjudication

**Disposition:** Q1 PARTIAL; Q2 NOT_VERIFIABLE for product integration. This is
candidate-level evidence only. RD-1413, RD-1414, RD-1415 and composed adoption
remain HOLD / NON_AUTHORIZING.

## Scope and custody

Astra reviewed the exact dirty candidate on branch
`codex/rd1413-1415-coupled-route-20261004`, HEAD
`e1c2496f3f36d154a445ba9c302401ccaaf74bae`, using the bounded prompt
`docs/reports/rd1413-1415-secret-access-reentry-astra-review-prompt-20261005.md`
(SHA-256 `080C54BA8054CBD1D17C67BD6864BBC00930AD7925C301586660B29FB3566676`).
Reviewer task: `01a10e3e-d8e1-7532-b08b-d114e02e66ba` (`gpt-6-astra`, High).
The response was returned in the reviewer task; no separate response file or
response-byte hash was supplied. Treat the task result as advisory, not as an
immutable signed review artifact.

The prompt's four source/test pins matched during Astra's review:

| Candidate file | SHA-256 |
|---|---|
| `packages-ts/galerina-framework-app-kernel/src/kernel.ts` | `68CF8ACA8F74825E2FC8C2791CAC14AC9AAD25C34C644A0FDCDACA11A10771E2` |
| `packages-ts/galerina-framework-app-kernel/src/secret-gate.ts` | `995CA61B95014A91E962D9A4DCC5D091AD943A8F360DE51554E2BA4637A66DCC` |
| `packages-ts/galerina-framework-app-kernel/tests/secret-gate.test.mjs` | `970CAD02F91E2605AA3E5F9A6E28F14209483858AB6D32DCBEA7D65D3C7E3E65` |
| `packages-ts/galerina-framework-app-kernel/tests/security-closure.test.mjs` | `7EDDA6D1366DE5955F92F2F4E0D9586C0958FC88ADF71A28E0D601C8D93B222F` |

## Findings

**Q1 — PARTIAL.** The tested pending-delivery re-entry paths latch failure
before consumer delivery; catching the nested refusal does not clear that
latch. Astra's focused source/test review found no successful-response bypass
in those paths. However, once the consumer has received a raw `Uint8Array`
view, the host callback cannot revoke copies or prevent further synchronous
consumer effects.

Codex independently reproduced the residual on the same pinned candidate:
the consumer receives the view, attempts nested `getSecret`, catches its
refusal, and then copies the original bytes. The request returns HTTP 500; the
provider is called once; the gate-owned original is zeroed on return; the
consumer's copy remains `[65,66,67]`. This confirms continued access to bytes
already delivered despite request refusal. It does **not** demonstrate a
successful response bypass, a second provider acquisition, or failure to wipe
the gate-owned original. The current synchronous re-entry test checks refusal
and call counts but does not assert the post-refusal copy.

**Q2 — NOT_VERIFIABLE for product integration.** The reviewed seam establishes
only a TypeScript candidate's one-acquisition latch, refusal propagation in
the exercised paths, and best-effort cleanup of its own staging buffer. It
does not establish a loaded governed `/secure` operation, object/version or
key-owner binding, Fungi-owned authorization/secret custody, protected Linux
runtime enforcement, complete alias cleanup and safe reuse, or
recipient-bound release.

## Design disposition and next step

The owner's approved ECC/RAS and protected-staging direction remains narrowly
scoped: ECC/RAS is host reliability telemetry, while bounded protected
staging/authentication must not be mistaken for authorization; a second
plaintext copy is not an integrity or zero-trust control. That approval does
not approve the complete v0.7 design, select a deployed runtime/TCB, or
authorize implementation of a new API.

Carry the residual into the coupled design: the protected operation needs an
opaque, object/version-bound lease or operation handle, and trusted
Fungi/runtime-controlled effects and release must be prevented after terminal
failure. A TypeScript token wrapper alone cannot revoke plaintext already
handed to arbitrary consumer code. Before implementation, obtain owner review
of the complete design and a concrete runtime/ABI plan; then test adversarial
re-entry, copied/transferred views, terminal failure, cleanup, and release on
the selected runtime. Keep refusal behavior for a missing or unverified
protected runtime; do not add a fast-path fallback.

## Verification limits

Astra reported 58 focused tests passing against in-memory-loaded pinned source;
it did not edit files or inspect private RD bodies. Codex's prior candidate
checks were a package build, four focused re-entry/security-closure tests, and
one Fungi admission-fold differential test. These are source/candidate checks,
not evidence that the application executes the Fungi gate or that the host,
runtime, or product route satisfies the coupled requirements. No private RD
owner, index, product source, commit, push, merge, or product status was
changed by this adjudication.
