# Protected Operation v0: Versioned Credential Verify Design

**Status:** DRAFT, NON-AUTHORIZING. Every choice below is **default-pending-owner**
unless it only restates current source. Nothing here is implemented by this document.

**Date:** 2026-10-06

**Pinned source:** `main` `df7f2fb514d8125532f2f6fdb0f0eb7ded27b663`

**Parents:** `docs/TODO.md` "Memory-security product-adoption holds" (RD-1413
incoming access, RD-1414 transient ownership, RD-1415 outgoing release) and the
`docs/ROADMAP.md` memory-security dependency checkpoint, both of which ask for
one real, loaded protected operation before any status changes.

**Companion PRs (separate, not prerequisites of this text):** duplicate
query-name refusal in `packages-ts/galerina-framework-api-server` and the
api-server TODO HOLD reconciliation.

## 1. Purpose and non-goals

The memory-security holds stay open because there is no single named operation
that binds a caller, an object version, a grant, a key custodian, a permitted
recipient and a host. This document defines exactly one such operation with
fail-closed defaults so the three RD owners have a concrete target to accept,
amend or refuse.

Non-goals (explicit):

- No new SecretReference version, no taint-type system, no hardware-risk
  vocabulary and no Logic5 vocabulary are introduced here.
- No package boundary policy (`.graph/boundary-policy.json`) is widened.
- No production, residency or erasure claim is made for the current Node host.
- The implicit-flow (PC label) rule and the host-profile claims are left open
  (section 11); Astra is adjudicating them.

The target language is Fungi: memory layout and lifetimes are ours to define.
The TypeScript host is the current carrier and its limits are recorded as
limits of today's evidence, not as limits of the design.

## 2. The operation

**Name (placeholder, default-pending-owner):** `credential.verify`

**Shape:** an authenticated service principal asks whether a submitted secret
(a password) matches credential object `credentialId` at version `version`.
The only released result is one boolean.

It grows out of the existing fixture service
`examples/auth-service/verifyPasswordService.fungi` (fixture hash, see
`docs/TODO.md` "Memory-security product-adoption holds"), replacing the fixture
hash with a versioned stored credential and adding the grant, fence and sink
rules below. Route form (default-pending-owner):

```text
POST /credentials/verify?credentialId=<id>&version=<n>
body: {"secret":"<password>"}            (JSON, closed shape, small cap)
200:  {"verified": true | false}
```

## 3. Bindings (all default-pending-owner)

| Binding | Default | Fail-closed rule |
|---|---|---|
| Principal | Admitted channel ALLOW plus exact `PrincipalResolution` from `resolvePrincipal` (or the admitted TLS leaf digest), never headers. Current seam: `packages-ts/galerina-framework-api-server/src/index.ts:623-705,756-772`. | No ALLOW or no principal: 401 before any protected acquisition. |
| Scope | One exact application scope (placeholder `credential:verify`) on the principal; route declares `auth: { mode: "required", scopes: [...] }` (`packages-ts/galerina-framework-app-kernel/src/types.ts:17-27`). | Missing scope: kernel 403; provider never entered. |
| Object / version | `credentialId` + integer `version`, exactly one decoded value each (query uniqueness: companion PR). Version must equal the object's current version at the fence (section 5). | Duplicate name, missing, non-canonical or non-current version: refuse before provider entry. |
| Grant | Per-object grant `(principalId, credentialId, scope)` held by the grant authority with a monotonic revocation epoch. | No grant, or epoch moved: refuse. |
| Grant and revocation authority | The credential owner service (the role `docs/TODO.md` calls Signet) is the only writer of grants and revocations. Candidate only; owner must name it. | Unnamed authority: the route stays disabled (503), never open. |
| Provider / key custodian | The boot-resolved secrets provider holding the KDF pepper and the credential hash store (structural seam today: `SecretsProvider.has/use`, `packages-ts/galerina-framework-app-kernel/src/secret-gate.ts:29-34`). Custodian identity is an owner decision. | Provider absent, faulted or disposed: 503 `secret_unavailable`. |
| Allowed recipient / sink | Exactly two sinks: (a) the HTTP response to the same authenticated principal on the same connection, carrying only the boolean; (b) the kernel audit sink, carrying principal, object, version, epoch, outcome code and request ID, never secret-derived bytes. | Any other sink (logs, reports, caches, retries, error bodies) receives nothing derived from the secret. |
| Accepted host profile / TCB | Node host process plus the Node TLS library and the App Kernel; **no residency capability is relied on**. `hardening-residency.ts` host profiles (`packages-ts/galerina-core-compiler/src/hardening-residency.ts:388-398`) are claims under review, not evidence. | A deployment that requires a residency claim fails closed until section 11 is decided. |

## 4. Authorized result and declassification rule

Default-pending-owner rule: **the operation may release exactly one bit per
admitted request, `verified: true | false`, computed by the approved
comparison, and nothing else derived from the secret, the stored hash, the salt
or the pepper.**

- Allowed: the boolean; a fixed refusal code that is independent of the secret
  (for example `not_current`, `revoked`, `secret_unavailable`).
- Not allowed: the hash, salt, KDF output, partial matches, error messages that
  depend on the secret, timing-variant early exits, password-policy hints, or
  any freely copyable value derived from secret bytes.
- The comparison must be timing-safe over the KDF output. In Fungi source the
  reserved declassifier `Crypto.constantTimeEquals` already exists
  (`packages-ts/galerina-core-compiler/src/value-state-checker.ts:2625`); this
  design does not add a new declassifier.
- Bound on leakage: the kernel route `limits.rate` (types.ts:47-52) must be set
  per principal and per object so the boolean channel cannot be used as an
  unlimited guessing oracle. The exact rate is an owner decision.

## 5. One shared freshness / fencing point

A membership check (`has`) followed later by a use is not enough: gate 9.5
calls `provider.has` and the handler calls `use` afterwards
(`secret-gate.ts:58-95`), so a revocation can land between them.

Default-pending-owner design: one linearization store owned by the grant
authority holds, per object, `currentVersion` and `revocationEpoch`. Two
operations, both single atomic steps on that store:

1. `openIfCurrent(principalId, credentialId, version, scope)` -> `fence | refusal`.
   Atomically checks the grant exists, `version == currentVersion`, and returns
   `fence = (credentialId, version, epoch)`. Only a fence lets the handler enter
   the provider.
2. `commitIfFenced(fence)` -> `ok | refusal`. Atomically checks the epoch and
   version are unchanged. Only `ok` lets the boolean reach sink (a).

Revocation and version bumps increment the epoch through the same store.
Resulting order, for every request:

```text
open (fence epoch E) -> provider use -> comparison -> commit (epoch still E) -> sink effect
```

- Revocation before open: open refuses; provider never entered.
- Revocation between open and commit: commit refuses; the computed boolean is
  discarded, owner buffers are cleaned, the response is a fixed refusal.
- Revocation after commit: the released bit stands; revocation is not
  retroactive (stated, owner may change).

The store's durability and multi-process semantics are open in the same way as
replay storage (`MemoryReplayStore` is process-local only); a process-local
store is acceptable for a development receipt only.

## 6. API-server body admission and copy/alias contract

Current source (`packages-ts/galerina-framework-api-server/src/index.ts`):
`bufferBody` (261-308) collects socket chunks, then `Buffer.concat` and
`new Uint8Array(...)` produce the body handed to the kernel; the cap trips with
413 before kernel entry (717-734). The same `Uint8Array` is passed to the
webhook gate when configured (816-826) and to `kernel.handle` (843).

Copy inventory today, per request, for a protected body:

| # | Copy | Owner | Cleanable today |
|---|---|---|---|
| 1 | Socket chunk Buffers (may be pool slices) | Node runtime | No; charged |
| 2 | `Buffer.concat` result | adapter, transient | No reference kept; not cleaned; charged |
| 3 | `Uint8Array` handed to the kernel (`kreq.body`) | kernel request | Yes, by the handler on every exit (not done today) |
| 4 | Kernel JSON decode: the password as a JS string | kernel / handler | No (immutable string); charged |
| 5 | Provider `use` view (`new Uint8Array(value)` then zeroed in `finally`) | secret gate | The view yes; the provider's own bytes and any copy made inside `fn` no |

Default-pending-owner admission contract for the protected route:

- Route body cap small and explicit (owner picks; adapter cap stays additive).
- Closed request shape with a validator; unknown fields and duplicate JSON keys
  denied (kernel defaults, `route-defaults.ts:176-183`).
- Copy 3 is the single owner buffer for the secret on the kernel side. The
  handler must not create views or copies that outlive the request; it cleans
  copy 3 on normal return, throw, refusal and abort.
- Copies 1, 2 and 4 are **unresolved storage and stay charged** against the
  operation until a Fungi-owned ingress path replaces them (RD-1414). No
  document or test may present cleaning copy 3 as erasure of the secret.
- A Fungi-owned path (decode into an owned region without an intermediate
  string) is the intended direction; its shape is an RD-1414 owner decision.

## 7. Evidence required before any status change

All on the actual loaded server path, from a source build of a pinned commit
(not ignored `dist` output), with a RED baseline for each control:

1. Duplicate `credentialId` / `version` query names and non-canonical or
   non-current versions refuse before provider entry (counter on the provider).
2. Missing ALLOW, missing principal, missing scope, missing grant: refuse before
   provider entry.
3. Revocation race: revoke between open and commit; result discarded, fixed
   refusal, no boolean released.
4. Cleanup: copy 3 and the provider view are cleaned on every exit path
   (return, throw, refusal, abort), checked by inspection hooks in tests.
5. Copy/alias inventory: every copy site in section 6 listed with status; no
   view of an owner buffer reachable from the response, audit record, logs,
   closures or retained objects after return.
6. FFI / Wasm boundary: no protected handle or view exported across a host
   import or export; host import list closed; for Wasm, views re-derived after
   any `memory.grow` (RD-1351).
7. Sink inventory: only sinks (a) and (b) observed; audit records contain no
   secret-derived bytes.
8. Rate bound in force per principal and per object.

## 8. Fail-closed defaults summary

Unnamed authority, custodian or host profile: route disabled (503). Any
ambiguity in caller, object, version, grant or epoch: refuse before provider
entry. Any doubt at commit: discard the result.

## 9. Relationship to existing work

- RD-1413: sections 3 and 5 plus evidence 1-3 are its "real protected
  operation"; the duplicate-query companion PR covers only the adapter half of
  evidence 1.
- RD-1414: section 6 plus evidence 4-6.
- RD-1415: sections 4 and 5 (commit before sink) plus evidence 7-8.

## 10. Default-pending-owner decisions (to confirm, amend or refuse)

1. Operation choice: `credential.verify` as the first protected operation.
2. Route form, scope name and the closed body shape.
3. Grant and revocation authority identity (Signet role candidate).
4. Provider / key custodian identity and where the credential hash store lives.
5. Allowed sinks limited to the response boolean and the audit record.
6. Accepted host profile: Node host, no residency capability relied on.
7. One-bit release rule and the refusal-code set.
8. Rate bound values per principal and per object.
9. `openIfCurrent` / `commitIfFenced` on one store; revocation not retroactive.
10. Copies 1, 2 and 4 remain charged until a Fungi-owned ingress path exists.
11. Evidence list in section 7 as the acceptance bar.

## 11. Open questions (not decided here; Astra adjudicating)

- **Implicit flow (PC label):** whether control flow that depends on a secret
  (for example branching on the comparison result before commit) must carry a
  program-counter label, and how that interacts with the one-bit release.
- **Host-profile claims:** the `browser_secure_context` swap and the
  `register_pinned` capability claims in `hardening-residency.ts`; until
  adjudicated, no protected operation may rely on either.