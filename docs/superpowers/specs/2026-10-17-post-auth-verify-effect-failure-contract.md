# POST /auth/verify — effect and failure contract

**Status:** DRAFT FOR OWNER REVIEW — NON_AUTHORIZING  
**Brief:** A (document only; no code in this round)  
**Base:** Galerina main `ad0ed3acc298f4ffe76d01f7c7286b2ea5c964f9`  
**Context heads (read-only):** PR #182 `e0601a2e64009ea2be7c43d2235dcc4d9f3ebc4f`; PR #183 `ead2d7cc3f63f8a971da184458758d173f58bebc`; Gate-1 Signet/Wax Seal draft PR #185  
**Owner ruling (Phillip, 2026-10-16 23:06 BST):** Rust is only an independent out-of-process verifier, never part of the runtime.  
**Owner ruling on the commit point:** release at the result sink is the commit point. A revocation committed first refuses the release; a release committed first is the one permitted disclosure; stale or missing authority refuses.  
**Synthetic data only.** This document does not quote private RD bodies, keys, or live credentials.

Claims about existing code are pinned to a named commit and `file:line`. Claims about the required future route are **SPECIFIED**. A composed production path from loaded WAMR artifact through SLIDE, VOK, a protected sink, and a terminal receipt is a **GAP**.

---

## 1. Scope and actors

This contract covers one operation: **HTTP `POST /auth/verify`**. It is the owner-selected first protected slice (public reports on RD-1413; see clause 9). Adjacent fixture routes (`POST /__fixture/auth/verify`) are out of scope except as negative evidence that they must not be confused with this operation.

### 1.1 Actors and trust

Zero trust: nothing is trusted because it is local, in-process, on the same host, or previously green.

| Actor | Role on this operation | Trusted for | Not trusted for |
|---|---|---|---|
| HTTP adapter (`examples/auth-service/deno-adapter.ts` on main) | Framing only | Nothing today: it returns 503 at `:27-36` without invoking Fungi, VOK, or a sink | Authorization, secret bytes, artifact identity, receipts |
| Standalone route dispatcher (`packages-ts/galerina-core-compiler/src/route-dispatcher.ts` on main) | Transport framing, body-size cap, timeouts | Counting wire bytes before dispatch (`:115-185`); keeping `/auth/verify` body opaque (`:284-290`) | Authorization, secret open, WAMR load, VOK mint |
| Standalone serve-secret-gate (`serve-secret-gate.ts` on main) | Refuse secret/protected routes on `serve()` | Refusing `POST /auth/verify` as reserved for kernel gate 9.5 (`:109-114`, `:436`) | Running the protected operation |
| App kernel (`packages-ts/galerina-framework-app-kernel/src/kernel.ts` on main) | Request pipeline, gate 9.5 then gate 10, overall deadline | Mapping body overflow to 413 (`:745-748`); minting a process-local `releaseOperationId` (`:902-903`); mapping `SecretReleaseRefused` to 503; 504 on deadline (`:984-985`) | Cross-process revocation; WAMR/VOK composition (GAP) |
| Secret gate + release authority (`secret-gate.ts`, `release-commit-point.ts` on main) | Gate 9.5 admit; consume-at-sink as D | Process-local CAS consume as D (`release-commit-point.ts:163-188`); status-only recovery (`:139-157`); wipe of gate-owned staged bytes (`secret-gate.ts:74-76`) | Remote revocation authority; wiping consumer-made copies |
| SLIDE admission | Bound the admitted program/layout identity to this request | Nothing on this route today (GAP: `production-slide-restore-admission.ts` on main is restore-verdict evidence, not `/auth/verify`) | Minting a grant from a restore receipt |
| VOK authority (`vok-authority/src/lib.rs` on #183) | Mint admitted object, open/consume/execute lease bound to artifact digest | Refusing a zero digest (`MintRequest::with_artifact_digest`); `open_lease_for_artifact` / `consume_lease_for_artifact` mismatch (`VOK_ARTIFACT_MISMATCH`) | Linking into the C WAMR runtime; authorizing HTTP |
| WAMR-loaded artifact (C host on #182) | One snapshot copy, bytecode allowlist, hash-pin verifier, SHA-256 of that snapshot, `wasm_runtime_load` of that snapshot | `load_for_authority` (`wamr_secrets_gateway_host.c:460+`); wipe before free (`:262-267`) | Trusting a caller digest; in-process Rust |
| Out-of-process Rust verifier (binary on #183) | Hash stdin itself; emit Envelope + Wax Seal on stdout | Independent verification of exact bytes | Being linked or `extern`'d by C; authorizing=true |
| Secrets provider / arena | Hold credential material; `has`/`use` or SecretArena RPC | Linux SecretArena construction refuses Windows/missing binary (`secret-arena-provider.ts:1-13` on main) | Promising `has()` stays true across a later revoke (RD-1413 boundary check residual) |
| Result sink | The authenticated recipient of the one permitted disclosure | Irreversible delivery D, ordered with consume | Re-releasing a consumed lease |
| Lyth-Weaver | No composed role on this route at main `ad0ed3ac` | — | Authorization or secret bytes |

### 1.2 What exists versus what this contract requires

On main `ad0ed3ac`, `deno-adapter.ts:27-36` answers `POST /auth/verify` with 503 `"Service bridge pending Phase 54"`. `verifyPasswordService.fungi:65-70` binds only `POST /__fixture/auth/verify` and reads `request.jsonBody.password` (`:51`). `routeDispatcherService.fungi:46` maps the path string `"verifyPassword"` without invoking a protected operation. Kernel gate 9.5 and `ReleaseCommitAuthority` exist as a TypeScript bootstrap. #182/#183 exist as the WAMR load + out-of-process verifier path. They are not yet one request.

---

## 2. Inputs

### 2.1 Request shape

| Field | Required | Bound | Notes |
|---|---|---|---|
| Method + path | exact `POST /auth/verify` | identity | Other methods/paths are a different operation. |
| Headers | `Content-Type` present | kernel `body.contentType` default `application/json` (`route-defaults.ts:176`) | Transport must not JSON-parse this body in the dispatcher (`route-dispatcher.ts:284-290`). Fungi-side envelope checks happen after size/auth gates. |
| Body | opaque wire bytes | see 2.2 | Caller-declared `Content-Length` is not allocation authority. |
| Channel + principal | required | kernel `auth.mode` default `"required"` (`route-defaults.ts:175`) | Header-presence fallback is forbidden (`route-defaults.ts:226-227`). |
| Operation id | kernel-minted | see 2.3 | Client-supplied operation ids are refused (fail-closed default; Q1). |
| Request digest | host SHA-256 of the exact admitted body bytes | 32 bytes | Computed after the size gate, before secret touch. |
| Artifact identity | SHA-256 of the WAMR snapshot | 32 bytes, non-zero | Bound by #182 `load_for_authority` and #183 `MintRequest::with_wamr_loaded_digest`. |
| SLIDE admission record | required | owner-named digest/profile | Missing record refuses (Q2). |
| VOK authority / lease | required | non-zero artifact digest on the handle | Stale/missing/revoked refuses at D. |
| Secret handle | declared in `policy.secrets.require` | gate 9.5 | Undeclared names are not readable (`secret-gate.ts:71`). |

### 2.2 Size bounds (existing, to be composed)

| Bound | Value | Pin |
|---|---|---|
| Standalone `serve()` default `maxBodyBytes` | 1_048_576 | `route-dispatcher.ts:115` on main |
| Standalone overflow | HTTP 413 `{ error: "Request body too large" }` | `route-dispatcher.ts:183-185` on main |
| Kernel default `body.maxSizeBytes` | 256 KiB | `route-defaults.ts:176` `SECURE_DEFAULTS` on main |
| Kernel hardened posture | 64 KiB | `route-defaults.ts:183` on main |
| Kernel overflow | HTTP 413 `payload_too_large` | `kernel.ts:745-748` on main |
| Fixture Fungi contract (not this operation) | 16 KB | `verifyPasswordService.fungi:46-48` on main |
| Release lease map | 1024 live records | `RELEASE_LEASE_CAP` in `release-commit-point.ts:55` on main |
| Verifier RPC frame (SecretArena, adjacent) | `64 * 1024 * 1024 + 1024` | `secret-arena-provider.ts:20` on main |

Fail-closed default for this operation (Q3): the effective cap is the **minimum** of kernel policy `maxSizeBytes` and any Fungi `max request size`. A missing Fungi request-size contract refuses the route at load, matching standalone invalid-contract refusal in `runtime-route-request-size.test.mjs`.

### 2.3 Operation id

On main the kernel mints `releaseOperationId = \`${req.requestId}\\u0000${releaseSeq}\`` (`kernel.ts:902-903`) and passes it into `getSecret` (`:1067`). `ReleaseCommitAuthority.mint` refuses empty ids (`release-commit-point.ts:93-95`) and in-flight unused duplicates (`:104-106`, tested `rd1413-release-commit-point.test.mjs:517-525`).

This contract requires:

1. The kernel mints the operation id. The client does not.
2. Uniqueness is per process incarnation plus `requestId` plus monotonic seq. Replay of a used id is `replay` / retired (`:99-100`, `:173-175`).
3. The request digest is SHA-256 of the admitted body. It is not the operation id.

### 2.4 Rejected before any secret is touched

All of the following refuse with **zero** provider `use` / SecretArena GET / WAMR snapshot of credential material:

- wrong method/path
- channel/principal not ALLOW
- body over cap, malformed framing, unknown fields if the envelope is admitted as structured later
- missing/empty/replayed operation id
- missing/zero artifact digest (public loader already hard-refuses `ARTIFACT_DIGEST_MISSING` at `wamr_secrets_gateway_host.h:77-80` / `host.c:440-441` on #182)
- AOT prefix / non-bytecode prefix (`host.c:510-519` on #182) — these run after the one snapshot of **artifact** bytes, which are program bytes, not the password secret
- SLIDE admission refused
- gate 9.5 `admit()` failure (`secret-gate.ts:68`, kernel `:913-919`)

Artifact load hashes program bytes, not the password. Password-secret open is **after** verifier bind, SLIDE, VOK lease, and gate 9.5 admit.

---

## 3. The single permitted effect

### 3.1 What is disclosed

On success, the result sink receives **exactly one** of:

- `outcome: "matched"`
- `outcome: "not-matched"`

and no other secret-derived field. The stored credential hash, the submitted secret, WAMR linear memory, verifier stdin, Envelope internals, lease tokens, and epochs **do not** leave the sink. `outcome: "unknown"` is a refusal (F-24), not a success.

The fixture flow today returns those three strings (`verifyPasswordService.fungi:57-62`) including `"unknown"` on empty submit (`:52-54`). For the protected operation, empty/malformed submit is F-01, not a disclosed unknown-success.

### 3.2 To whom, at most once

Disclosure is to the authenticated principal bound at ingress for this operation id, once. A second consume of the same `(lease, token, epoch)` is `replay` (`release-commit-point.ts:173-175`) and discloses nothing further.

### 3.3 Commit point (owner ruling)

**D = `ReleaseCommitAuthority.consume(leaseId, token, observedEpoch)`** (`release-commit-point.ts:163-188` on main). Comment at `:3-6` and `:163-165`: consumption of the `(lease, ordering-token, epoch)` triple is the result-sink commit point D. Provider open is not D.

Owner ruling applied:

| Order | Required behaviour | Existing bootstrap evidence |
|---|---|---|
| Revocation committed first | refuse release; no sink disclosure | `fence` then `consume` → `fenced` (`rd1413-release-commit-point.test.mjs:74-79`); epoch advanced after open refuses consumer entry (`:100-127`) |
| Release committed first | the one permitted disclosure; later fence cannot recall it | `:82-88` (`release-before-revoke completes once`) |
| Stale or missing authority | refuse | `consume` of unknown lease → `missing` (`:47`); wrong token/epoch → `stale` and unused lease fenced (`:51-63`) |

This TypeScript Map CAS is **process-local bootstrap** (`release-commit-point.ts:5-6`). It does not order a remote revocation authority. Brief B must bind D at the real sink, not only this map.

---

## 4. Failure and refusal table

Legend: **Leave?** = may any secret-derived byte leave the process toward the client/sink. **Lease** = VOK/release-lease state after the outcome. **Receipt** = terminal receipt kind (clause 5). **Q?** = quarantine the uncertainty scope if cleanup cannot complete.

HTTP codes in this table are the fail-closed defaults for Brief B (Q4) unless the owner names different codes. Kernel today maps secret-release refusal to 503 `secret_unavailable` and deadline to 504 `deadline_exceeded`.

| ID | Outcome | Stage | Code | HTTP | Leave? | Cleanup | Lease | Receipt | Q? |
|---|---|---|---|---|---|---|---|---|---|
| S-01 | Success: consume D first | sink | `released` | 200 | yes, outcome only | wipe every host/guest/verifier copy and alias after ACK | consumed | `WAX_SEAL` success | no |
| F-01 | Malformed input | ingress | `malformed_input` | 400 | no | drop body | unused / not minted | refuse | no |
| F-02 | Oversized body | ingress | `payload_too_large` | 413 | no | drop body | unused / not minted | refuse | no |
| F-03 | Missing/empty operation id | mint | `operation_id_missing` | 400 | no | none | missing | refuse | no |
| F-04 | Replay of used operation id | mint/consume | `operation_replay` | 409 | no | none | released/retired unchanged | refuse | no |
| F-05 | Artifact digest missing/zero | WAMR/VOK | `ARTIFACT_DIGEST_MISSING` | 503 | no | wipe snapshot if any | not opened | refuse | no |
| F-06 | Artifact digest mismatch | WAMR/VOK | `ARTIFACT_MISMATCH` | 403 | no | wipe snapshot | not opened / unchanged | refuse | no |
| F-07 | WAMR AOT prefix | WAMR allowlist | `AOT_REFUSED` | 403 | no | wipe snapshot | not opened | refuse | no |
| F-08 | Non-bytecode non-AOT prefix | WAMR allowlist | `BYTECODE_REQUIRED` | 403 | no | wipe snapshot | not opened | refuse | no |
| F-09 | SLIDE admission refused | SLIDE | `slide_admission_refused` | 403 | no | drop admission inputs | not opened | refuse | no |
| F-10 | VOK authority missing | VOK | `authority_missing` | 503 | no | none | missing | refuse | no |
| F-11 | VOK authority stale (epoch/token) | D | `authority_stale` | 403 | no | wipe staged if any | fenced | refuse | no |
| F-12 | Revocation committed before release | D | `authority_revoked` | 403 | no | wipe staged; no sink write | fenced | refuse | no |
| F-13 | Verifier binary missing | verifier custody | `ARTIFACT_DIGEST_MISSING` (host pin miss) | 503 | no | none | not opened | refuse | no |
| F-14 | Verifier hash mismatch | verifier custody | `VERDICT_REFUSED` pin mismatch | 403 | no | none | not opened | refuse | no |
| F-15 | Verifier spawn failure | verifier custody | `VERDICT_REFUSED` | 503 | no | close memfd | not opened | refuse | no |
| F-16 | Malformed / file-origin / authorizing=true verdict | bind | `VERDICT_REFUSED` | 403 | no | wipe snapshot | not opened | refuse | no |
| F-17 | Verifier non-zero exit | bind | `VERDICT_REFUSED` | 403 | no | wipe snapshot | not opened | refuse | no |
| F-18 | Secret provider unavailable | gate 9.5 | `secret_unavailable` | 503 | no | none | not consumed | refuse | no |
| F-19 | Guest trap | WAMR instantiate/run | `guest_trap` | 503 | no | unload, wipe snapshot | consume-to-refuse if opened | refuse | no |
| F-20 | Timeout: verifier | wait | `deadline_exceeded` | 504 | no | kill child tree, wipe snapshot | not opened | refuse | no |
| F-21 | Timeout: SLIDE admission | wait | `deadline_exceeded` | 504 | no | drop | not opened | refuse | no |
| F-22 | Timeout: VOK authority | wait | `deadline_exceeded` | 504 | no | drop handles | fenced if minted | refuse | no |
| F-23 | Timeout: provider | wait | `deadline_exceeded` | 504 | no | wipe staged | fenced / unknown | refuse | yes if wipe fails |
| F-24 | Timeout: guest | wait | `deadline_exceeded` | 504 | no | unload, wipe | fenced / unknown | refuse | yes if unload fails |
| F-25 | Timeout: sink | wait | `deadline_exceeded` | 504 | no if D not consumed; if D already consumed treat as F-28 | wipe undisclosed staging | unknown if D ran | `delivery-unknown` if D ran | yes |
| F-26 | Timeout: ACK | wait | `deadline_exceeded` | 504 | already disclosed iff D ran | continue wipe; do not re-release | `delivery-unknown` | status-only | no |
| F-27 | Cancellation / client disconnect | any | `client_disconnected` | 499 | no unless D already ran | same as timeout at that stage | unused or unknown | refuse or status-only | if D ran and wipe fails |
| F-28 | Crash between release and ACK | sink | `delivery_unknown` | 503 | maybe (D already ran) | resume wipe; never re-release | `delivery-unknown` | status-only | yes |
| F-29 | Partial delivery | sink | `partial_delivery` | 503 | maybe | wipe remainder; never retry D | `delivery-unknown` | status-only | yes |
| F-30 | Unknown outcome | any | `unknown_outcome` | 503 | no unless D logged released | wipe everything in scope | `delivery-unknown` or fenced | status-only | yes |
| F-31 | Cleanup failure | cleanup | `cleanup_failed` | 503 | no new disclosure | quarantine arena/incarnation | fenced / quarantined | refuse + quarantine | **yes** |

S-01 is the sole permitted disclosure row. F-12 is the owner-ruling revoke-first case. A late result after any F-20–F-27 expiry is **refused, wiped, and never disclosed** (clause 7).

---

## 5. Terminal receipt

### 5.1 Fields (synthetic keys only)

One terminal receipt per operation id. Kind is Wax Seal, not Signet. `authorizing=false`, `replayable=false` (existing verifier Envelope/Wax Seal comments on #183 `vok_authority_handoff.h:40-47`).

Required bindings:

| Field | Binds |
|---|---|
| `operationId` | kernel-minted id |
| `requestDigest` | SHA-256 of admitted body |
| `artifactDigest` | SHA-256 of WAMR snapshot / VOK handle |
| `leaseId` | opaque id; not a grant |
| `outcome` | `released` \| refusal code from clause 4 \| `delivery-unknown` |
| `schemaVersion` | receipt schema |
| `sealDigest` | over the canonical lines |

Attestation on this bootstrap: process-local `ReleaseCommitAuthority` audit events (`operationId` + outcome only, `secret-gate.ts:91-92`). Independent Signet attestation of the verifier path already exists as out-of-process Envelope + Wax Seal on #182/#183. Combining those into one operation-bound receipt is Brief B work. **Synthetic keys only.**

### 5.2 Exactly one; status-only recovery

`status(operationId)` returns state and never tokens, epochs, bytes, lengths, or digests, and never opens a provider (`release-commit-point.ts:139-157`). Kernel `noteUnknown` after timeout/throw (`kernel.ts:1009-1010`, `:1096`). A used lease cannot be consumed again (`replay`).

An UNKNOWN or crashed operation may be queried for status. It **never** re-releases a consumed lease.

---

## 6. Response binding

1. The HTTP response is bound to `(operationId, requestDigest, artifactDigest)`. A response body without those three bindings is not a valid success.
2. ACK is `secretGate.acknowledge(releaseOperationId)` (`kernel.ts:1009`) / `ReleaseCommitAuthority.ack` (`release-commit-point.ts:191-196`): wrong id/token/epoch refuses and changes nothing; a second ACK is a no-op reporting `acknowledged`.
3. Replay, swap, or attach of a response onto another request fails request-digest compare and operation-id uniqueness.
4. Idempotency: POST defaults to enabled `Idempotency-Key` with `onDuplicate: reject` (`route-defaults.ts:187-193`). Duplicate key is 409, not a second D. `"replay"` as onDuplicate is refused at declaration (`route-defaults.ts:151-152`).

Fail-closed default (Q5): success responses include a non-authorizing receipt header bound to the three digests/ids; missing binding is F-01/F-16, not 200.

---

## 7. Timeout and blocking wait

Every wait has a finite deadline. No unbounded blocking. Retries share the parent deadline. Deterministic refusals are not retried.

### 7.1 Existing bounds

| Wait | Existing bound | Pin |
|---|---|---|
| Kernel route | `policy.limits.timeoutMs` default 10_000 ms; hardened 5_000 | `route-defaults.ts:177`, `:184`; enforced `kernel.ts:973-1022` |
| Standalone HTTP | `requestTimeoutMs` default 30_000; `headersTimeoutMs` default max(request+5_000, 15_000); keep-alive min(request, 5_000) | `route-dispatcher.ts:20-23`, `:137-239` |
| SecretArena RPC | `RPC_DEADLINE_MS = 5000` | `secret-arena-provider.ts:19` on main |
| Node timer ceiling | `MAX_TIMER_MS = 2_147_483_647` | `route-defaults.ts:36` |

Kernel already races the handler against the deadline and refuses a late success (`kernel.ts:1090-1101`).

### 7.2 Required per-stage remainder

Fail-closed default (Q6): one operation deadline T0 + `timeoutMs`. Each stage (verifier, SLIDE, VOK, provider, guest, sink, ACK) gets the **remaining** time, never a fresh full budget. A 0 or missing timeout on a wait that can block **refuses at construction**.

| Expiry | Yield | Late result after expiry |
|---|---|---|
| F-20–F-24 | 504, wipe, no D | ignored, wiped, never disclosed |
| F-25 sink expiry before D | 504, no D | ignored |
| F-26 ACK expiry after D | 504 `delivery-unknown`; D stands | ACK may still complete; cannot re-release |
| Child still running | kill owned process tree | stdout after kill is not a verdict |

---

## 8. Verifier dependency custody

Owner ruling: Rust is only an independent out-of-process verifier, never part of the runtime.

| Rule | Evidence |
|---|---|
| Hash-pin the verifier binary | `wamr_secrets_gateway_host.h:96-102` on #182; missing binary → `ARTIFACT_DIGEST_MISSING`; pin mismatch → `VERDICT_REFUSED` |
| Copy those bytes into a sealed memfd | `F_SEAL_WRITE\|GROW\|SHRINK\|SEAL` then `F_GET_SEALS` (`wamr_vok_verdict.c:763-775` on #182) |
| `fexecve` with empty envp | `empty_envp[0] = NULL` (`:881-901` on #182) |
| Write the host-owned snapshot to stdin; read Envelope + Wax Seal only from the child's stdout | header comment `:96-100`; internal `wamr_vok_bind_bytes` is static (`:536`) — not a public bind of caller files |
| Wipe the snapshot immediately before every free | `SNAPSHOT_WIPE` + `wipe_bytes` (`host.c:262-267` on #182) |
| C does not link or call Rust | header `:111-112` on #182; U6b `vok_authority_handoff.h:7-8` on #183 |
| `authorizing=true` or file-origin verdict refuses | header `:101-103` on #182 |

Missing or wrong verifier: F-13 / F-14. Spawn failure: F-15. Production `host.o` must keep exporting only the C API (no test helper, no Rust symbols).

---

## 9. Traceability (id and short paraphrase only)

Do not quote private RD bodies.

| Clause | RD / ruling | Short paraphrase |
|---|---|---|
| 1–2, first operation | RD-1413 | Governed protected I/O and incoming access; `POST /auth/verify` is the first candidate; real operation remains HOLD on public reports (`docs/reports/rd1413-boundary-check-20261014.md` on main). |
| 3, D at sink | Owner ruling on commit point; RD-1413 O/R/D | Release at the result sink is D. Revoke-first refuses; release-first is the one disclosure; stale/missing refuses. |
| 4 cleanup / quarantine | RD-1414 | Protected byte custody: wipe every copy/alias; cleanup failure quarantines rather than releasing. |
| 4 F-31, 5 status-only | RD-1415 | After use: reuse is refused until cleanup; unknown/crash does not mint a new disclosure. |
| 5 receipt vs Signet | Coupled design F1 (`docs/superpowers/specs/2026-10-05-coupled-rd-1413-1415-design.md` on main) | Wax Seal is terminal and non-authorizing; it cannot recreate a lease. |
| 6 response binding | RD-1413 ingress | Response cannot be replayed onto another request. |
| 7 timeouts | Coupled design F6; kernel deadline | Pre-admission and in-operation waits are bounded. |
| 8 verifier | Owner ruling 2026-10-16 23:06 BST; #182/#183 | Rust out of process, hash-pinned, sealed memfd, empty envp. |

---

## 10. Gap list and Brief B plan

Planned route: **loaded artifact → SLIDE admission → VOK authorization → protected sink → terminal receipt**.

| Clause | Already exists (pin) | Missing (GAP) |
|---|---|---|
| 1 adapter | `deno-adapter.ts:27-36` 503 stub on main | Invoke kernel + WAMR + VOK; stop returning Phase-54 503 |
| 1 Fungi route | `verifyPasswordService.fungi:65-70` fixture path only | Production `route POST "/auth/verify"` that does not read plaintext JSON password in the adapter |
| 1 dispatcher | opaque body for `/auth/verify` (`route-dispatcher.ts:284-290`); serve-secret-gate reservation | Compose with kernel gate 9.5 instead of standalone `serve()` |
| 2 bounds | kernel 256 KiB / 413; standalone 1 MiB / 413; fixture 16 KB | One named cap for this operation; Fungi contract on the production route |
| 2 operation id | kernel mint `kernel.ts:902-903`; mint uniqueness tests | Bind that id through WAMR/VOK/receipt |
| 3 D | `ReleaseCommitAuthority.consume` + tests on main | D at the real authenticated sink, not only the in-process Map |
| 4 WAMR rows | #182 load-path probe: missing/mismatch/AOT/bytecode/wipe/seals | HTTP mapping; composition with kernel |
| 4 VOK rows | #183 `open_lease_for_artifact` / `consume_lease_for_artifact`; local epoch tests | Wire lease to provider-open and sink D |
| 4 SLIDE | restore-admission types on main | Admission record for this route |
| 5 receipt | process-local status/ack; verifier Wax Seal on #182/#183 | One operation-bound receipt |
| 6 binding | idempotency reject-duplicate; ACK token compare | Response header binding to request/artifact digests |
| 7 timeout | kernel 10 s race; SecretArena 5 s; standalone 30 s | Per-stage remainder deadlines including verifier child |
| 8 verifier | #182/#183 sealed-memfd empty-envp pin | Kernel/adapter actually spawn that path on `POST /auth/verify` |
| Lyth | none on this route at `ad0ed3ac` | Out of Brief B unless the owner names a Lyth obligation |

### 10.1 Named negative tests for Brief B

One test name per clause-4 row, plus timeouts. Synthetic keys and data only.

| Test | Turns red if |
|---|---|
| `neg-malformed-input` | F-01 green |
| `neg-oversized-body` | F-02 green (body one byte over cap) |
| `neg-missing-operation-id` | F-03 green |
| `neg-replay-operation-id` | F-04 green (second consume discloses) |
| `neg-artifact-digest-missing` | F-05 green |
| `neg-artifact-mismatch` | F-06 green |
| `neg-aot-refused` | F-07 green |
| `neg-bytecode-required` | F-08 green |
| `neg-slide-refused` | F-09 green |
| `neg-authority-missing` | F-10 green |
| `neg-authority-stale` | F-11 green |
| `neg-revoke-before-release` | F-12 green (bytes leave) |
| `neg-verifier-missing` | F-13 green |
| `neg-verifier-pin-mismatch` | F-14 green |
| `neg-verifier-spawn-failure` | F-15 green |
| `neg-verdict-malformed` | F-16 green |
| `neg-verifier-nonzero-exit` | F-17 green |
| `neg-secret-unavailable` | F-18 green |
| `neg-guest-trap` | F-19 green |
| `neg-timeout-verifier` | F-20 green |
| `neg-timeout-slide` | F-21 green |
| `neg-timeout-vok` | F-22 green |
| `neg-timeout-provider` | F-23 green |
| `neg-timeout-guest` | F-24 green |
| `neg-timeout-sink` | F-25 green |
| `neg-timeout-ack` | F-26 re-releases |
| `neg-client-disconnect` | F-27 green |
| `neg-crash-after-release` | F-28 re-releases |
| `neg-partial-delivery` | F-29 retries D |
| `neg-unknown-outcome` | F-30 treated as success |
| `neg-cleanup-failure` | F-31 proceeds without quarantine |
| `pos-release-before-revoke` | S-01 fails to disclose once |
| `timeout-late-result` | late verifier/guest result after expiry is disclosed |

Keep the existing #182 wipe-removed / seal-removed mutants red, and `rd1413-release-commit-point.test.mjs` revoke-first / release-first cases red/green as they are.

---

## 11. Open questions for the owner

Each item is an owner-level ambiguity. Fail-closed default applies until the owner names otherwise.

| ID | Question | Fail-closed default |
|---|---|---|
| Q1 | Who mints the public operation id — kernel-only, or may a client supply one (e.g. `Idempotency-Key` as the id)? | Kernel mints. Client values are correlation only. Empty/missing kernel id refuses (F-03). |
| Q2 | What exact SLIDE admission record is required for this route (digest, profile, none)? | Missing/unspecified record refuses (F-09). Cross-machine SLIDE does not block Brief B; absence still refuses production disclosure. |
| Q3 | Production body cap for `POST /auth/verify` — 16 KB fixture, 64 KiB hardened, 256 KiB default, or 1 MiB standalone? | Minimum of kernel policy and Fungi contract; missing Fungi `max request size` refuses route load. Proposed production number: **64 KiB** (hardened default). |
| Q4 | HTTP status mapping for WAMR/VOK codes in clause 4? | The table in clause 4. Do not return 200 or 500 for a determined refusal; use 403/409/413/499/503/504 as listed. |
| Q5 | Must the HTTP success response carry the Wax Seal (or a hash of it), or is process-local ACK enough for V1? | Carry a non-authorizing binding of `(operationId, requestDigest, artifactDigest)` on the response. Missing binding is not 200. |
| Q6 | Per-stage timeout budgets? | Single parent `timeoutMs` (10 s default / 5 s hardened); remainders only; 0/missing wait bound refuses construction. |
| Q7 | Is the guest kernel inside the TCB for this operation (coupled design still open)? | If the owner has not named an attested profile, refuse the protected operation. |
| Q8 | Must D be enforced by the secrets provider/sink (M3) or is the in-process `ReleaseCommitAuthority` enough for Brief B? | Brief B must not claim remote ordering. Ship D in-process **and** refuse if the provider cannot expose a monotonic epoch (`secret-gate.ts:127-138` already throws `stale` when epoch is unavailable). Full M3 remains owner-selectable and HOLD until named. |
| Q9 | Success disclosure: boolean `matched`/`not-matched` only, or a session token? | Boolean only. No token, hash, or lease in the body. |
| Q10 | Does Lyth-Weaver have a required role on this first slice? | No. Absence is not a skip of SLIDE/VOK/WAMR. If later named, it is a new clause, not a silent extra effect. |

---

## Document control

- One file in this round, as required by Brief A.  
- Independent audit of the landed markdown is a **fresh session**. This authoring session does not self-certify.  
- Do not merge. Do not open a PR from this session. Grok Bot opens a draft after checking.  
- `authorizing: false`.
