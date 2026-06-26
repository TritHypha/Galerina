# Secret-hygiene audit — timing side-channels + secret-zeroing (2026-06-24)

**Scope:** verify-before-build audit of `0043-secret-hygiene` (constant-time compares + key zeroize) and `0055-secretzero` (zero-on-exit completeness), under the standing directive *"always make the most secure zero-trust choice"*.
**Verdict:** the timing-side-channel posture is **sound** (no genuine oracle); `0043` is **done**; `0055`'s residual is a bounded **remanence window** (not a leak) whose closure needs the `#70` single-exit transform — recorded build-ready, not built (the risky path would be the *less* secure choice).

---

## 1) Timing side-channels — AUDITED, sound (`0043-secret-hygiene` constant-time half = DONE)

Every comparison of cryptographic material was reviewed. There is **no non-constant-time comparison of a secret-derived value** anywhere in the tree:

| Site | What it compares | Verdict |
|---|---|---|
| `galerina-ext-tmf` `container.ts:64` / `history.ts:92` / `kemdem.ts:65` `bytesEqual` | digests, chain roots, the **keyed `ctxCommitTag` MAC** | **constant-time** — routed through `crypto.timingSafeEqual` (the `0033(c)` fix), length pre-checked (lengths are protocol-fixed/public) |
| Ed25519 / ML-DSA signature verification (`attestation.ts`, signing path) | signatures | **constant-time** — done inside the vetted crypto lib's `verify`, never a manual byte compare |
| `attestation.ts:186/296` | `signature === undefined`, `algorithm !== "Ed25519+ML-DSA-65"` | non-secret (null/algorithm checks) |
| `egress-guard.ts:284` | `username/password !== ""` | non-secret (credentials **presence** check to deny URL-embedded creds) |
| `cli.ts:633` `hash1 !== hash2` | two GIR hashes of the **same local source** | non-secret (build-determinism self-check, SPORE-BUILD-001) |
| `proof-chain.ts:155` | recomputed vs stored proof hashes | non-secret (integrity check over public hashes — the function **returns both values** in its mismatch list anyway) |
| `proof-graph.ts:648` `signatureHash ===` | two ProofGraph shape hashes | non-secret (dedup/caching optimization, not an auth gate) |

**Conclusion:** the only secret-keyed comparison (`ctxCommitTag`) is already constant-time; every other compare is over non-secret material or delegated to the crypto lib. The `0043` constant-time concern (the "6 sites") was already closed by `0033(c)`; the row was stale. Key zeroize: `kemdem.ts` already best-effort-zeroes `sharedSecret`/`kaead` (honest GC-VM limitation, documented). **`0043-secret-hygiene` is done** save the GC-VM zeroize caveat, which is a platform limit, not a fixable gap.

## 2) Secret-zeroing — zero-on-exit covers the safe subset (`0055-secretzero`)

The emitter's **B2b zero-on-EXIT** (`wat-emitter.ts:576-619`) eagerly destroys a call's secret records *before returning* with the bulk-memory `memory.fill` primitive (one atomic instruction, no interruptible loop), closing the host-readable remanence window — **for the SAFE SUBSET**: a secret leaf flow that (a) returns a **primitive i32** (the result is a value, not a heap pointer) and (b) has **no early `(return …)`** (single tail-expression body). Plus **G5b intrusion-wipe** (`:569-573`): a secret flow that hits a runtime invariant/trap breach scrubs linear memory *before* the fail-closed `unreachable`, so secrets aren't recoverable from a post-mortem image.

**The residual gap (build-ready, NOT built):**
- **Early-return secret flows** (`bodyHasEarlyReturn`) and **heap-returning secret flows** (non-primitive result) are EXCLUDED from eager zero-on-exit — they fall back to the **lazy on-entry** path (the *previous* arena is zeroed on the *next* call). That is a **remanence WINDOW** between a flow's return and the next invocation — **not a leak of live data**, and the memory is exported only within the module's own host. CWE-226/CWE-316.
- **Why not built this tick:** eager zero-on-exit for an early-return flow requires first transforming the body to **single-exit** (`#70`, `wat-emitter.ts:3118+`) so there is one place to capture the result and zero before every return path. That is a non-trivial **control-flow transform in security-critical codegen**; a bug would risk a *fail-open* (a return path that skips the zero) — which would be the **less** secure outcome. Verify-before-build: it needs the single-exit transform proven for early-return/match-arm bodies (the current capture-the-tail single-exit explicitly cannot enforce an early return, `:2340`) before the zeroing can ride on it.

**Build-ready plan (for a fresh-context session):** ① complete the `#70` single-exit transform for early-return + match-arm bodies (a `$result` local + `br $exit` rewrite that every `(return …)` routes through); ② gate B2b zero-on-exit on the now-single-exit body (drop the `!bodyHasEarlyReturn` restriction); ③ for heap-returning secret flows, zero everything *except* the returned record's extent (or copy-out-then-zero); ④ **most-secure interim** (bounded, low-risk): emit a **never-silent diagnostic** when a `handlesSecrets` flow is excluded from eager zeroing, so the remanence window is disclosed and the developer can refactor to the safe subset; ⑤ add memory-test TYPES 3-6. Key custody (`#149` KMS/HSM) stays owner-gated.

## 3) Most-secure-zero-trust verdict

The live secret-hygiene posture is **sound**: secrets are sealed (KEM-DEM), compared constant-time, zeroed eagerly on the safe path + on intrusion, and the only residual is a documented remanence window for control-flow shapes that need a proven single-exit transform first. The **most secure choice** here is *not* to ship a risky transform into security-critical codegen at the cost of a possible fail-open, but to record the audit + the build-ready plan and keep the verified-sound posture. No overclaim.

**Key files:** `galerina-ext-tmf/src/{container,history,kemdem}.ts` (constant-time `bytesEqual`, zeroize) · `galerina-core-compiler/src/wat-emitter.ts` (`:576-619` B2b zero-on-exit, `:569-573` G5b intrusion-wipe, `:3118+` `#70` single-exit) · `attestation.ts` (Ed25519/ML-DSA verify).
