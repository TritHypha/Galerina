# Galerina — No Cleartext Semantic Embedding Across a Trust Boundary (U2/#204, SPORE-PRIVACY-002)

**Status:** ENFORCED (Stage-A compile-time, `value-state-checker.ts`). Date: 2026-06-16.
**Origin:** tri-encryption R&D verdict 5 (`galerina-rd-adoption-2026-06-16.md`, U2/#204). Design
selected + adversarially hardened via a verify-before-build workflow (12-agent map/design/judge +
2 adversarial skeptics). KB cross-refs: [[galerina-contract-privacy-observability]] (the declarative
`privacy {}` block, SPORE-PRIVACY-001), `pattern-10-verify-before-decrypt-gate.spore`, `galerina-substrate-contracts`
(SPORE-SUBSTRATE-001 crypto-on-core).

## The invariant

*A cleartext semantic embedding may not cross a trust boundary.* An embedding vector is **invertible**:
embedding-inversion attacks (vec2text) reconstruct ~90%+ of the source text from a cleartext vector. So
shipping a semantic vector to an untrusted sink leaks the source content as surely as shipping the text.
The R&D remedy: **encrypt the vector; filter only at trusted endpoints** (after decryption).

## The model (chosen mechanism: SealTaint)

Three candidate mechanisms were scored (type-qualifier / declarative egress-rule / taint-propagation).
**Taint-propagation won** (architecture-fit 9, security 9) because it is the only one that holds the line
against laundering: a vector sliced/normalized/concatenated/reshaped is *still* inversion-bearing, so a
one-hop or type-only check fails open. It rides the **live `checkValueStates` pass** (wired at
`cli.ts`/`runtime.ts`), reusing the exact propagation that already powers SPORE-VALUESTATE-005 and the
(now-fixed) secret-egress guard.

- **Sensitivity flag.** `BindingInfo.embeddingDerived` (mirrors `tainted`). A binding is stamped when it
  (a) is typed `Embedding`/`EmbeddingResult` (type backstop), or (b) is initialised from an embedding
  source, or (c) **derives** from an embedding-stamped binding.
- **Source recognizer** (`isEmbeddingSourceExpression`): the REAL shipped symbols — the `EmbeddingModel`
  value (`@galerina/ai-types`), canonical call `EmbeddingModel.run(...)`/`.infer`/`.embed`, plus the common
  `embed`/`embedQuery`/`embedDocuments` methods. (The original design's `model.embed` matched nothing —
  caught by the adversarial review.)
- **Propagation** (`derivesFromEmbedding`): walks slice/member/concat/record/list/non-sealing-call.
- **Discharge:** `seal()` / `encrypt()` ONLY. Unlike the generic taint chain, validate/parse/decode do
  NOT declassify an embedding (a decoded vector is still invertible). Crypto stays engine-side
  (govern-don't-absorb): the compiler recognizes the state transition, not the cipher.
- **Sink rule** (`checkArgForEmbeddingNetwork`, **SPORE-PRIVACY-002**): a still-cleartext embedding reaching
  a network sink (`isNetworkSink`: http/https/net/socket/ws + fetch + email) is an error. Composes with
  pattern-10: SealTaint answers "may this leave cleartext?" (no, unless sealed); `keyRelease` answers "may
  it be decrypted here?" (only at a verified, key-holding endpoint).

```
secure flow route(req: Request) -> Int
contract { effects { ai.inference  network.outbound } } {
  let v = EmbeddingModel.run(req)        // v : embeddingDerived
  let r = http.post(remoteRouter, v)     // ✗ SPORE-PRIVACY-002 — cleartext embedding egress
  let s = seal(v)                        // s : discharged
  let ok = http.post(remoteRouter, s)    // ✓ sealed vector may cross
  return 0
}
```

## Adversarial corrections applied (vs the raw design)

1. **Code collision avoided** — `SPORE-PRIVACY-001` is reserved for the `privacy {}` block's declarative
   `deny protected X to Y` clause; this dataflow rule took **SPORE-PRIVACY-002**.
2. **Propagating flag, NOT typeName** — keyed on a propagating `embeddingDerived` flag set on derived
   bindings, so slice/concat/record do not launder (the typeName-one-hop trap that the secret guard fell
   into — fixed in the same session, see below).
3. **Real recognizer symbols** — `EmbeddingModel.*` / `EmbeddingResult` / `Embedding`, not `model.embed`.
4. **Seal-only discharge** — the six USER_GATE_NAME_PREFIXES (validate/sanitize/check/verify/parse/decode)
   do NOT discharge this flag.

## Sibling fix (same session)

The fail-open auditor empirically proved **SPORE-SECRET-002 itself** leaked on derived secrets
(`key.slice(0,5)` → `http.post` produced no diagnostic). Fixed first (`derivesFromSecret`, redact-discharge)
so secrets are not weaker than embeddings; SealTaint then mirrors that proven pattern with seal-discharge.

## Adversarial-audit hardening (2026-06-16 — commit after aeb420d/ea6163d)

An independent adversarial audit of the *committed* code returned a zero-trust verdict of FAIL with 6
empirically-confirmed fail-open holes (each also affected the pre-existing taint/secret rules). All were
verified by reproduction and **CLOSED** (regression-tested in `tests/value-state-egress-hardening.test.mjs`):

- **A1 — bare assignment (`s = secret`/`s = embedding`)** silently laundered everything (`walkNode` had no
  `assignStmt` case). FIXED: `handleAssignStmt` recomputes the target's flags from the RHS (taints on dirty,
  clears on `redact()`/`seal()`/clean), via `updateBinding` in the declaring scope. **Critical** — was a total bypass.
- **A2 — record spread `{ ...base, tok: k }`** (`#record-update`) dropped the flag. FIXED in all three walkers.
- **A3 — string interpolation `"...${k}..."`** (single lexer token) was opaque. FIXED with `interpolatedNames`
  (extracts `${}` identifiers, checks each) — a checker-level closure; the lexer-level decomposition is the
  deeper future fix.
- **A5 — sink coverage** added `response.body`, `ai.remoteInference`, and `*VectorDB.(write|insert|upsert|add|index)`
  to `isNetworkSink`.
- **A6 — embedding recognizer** now matches any receiver whose name contains `embed` (case-insensitive), so a
  constructed instance var `embeddingModel.run(...)` is caught, not only the exact-case `EmbeddingModel`.
- **A4 — cross-flow propagation** now surfaces a **warning** (`SPORE-SECRET-002`/`SPORE-PRIVACY-002`,
  `severity:"warning"`) when a secret/embedding is passed to a user flow — fail-loud without breaking
  legitimate secret-helper patterns (the checker is intra-procedural; it cannot prove the callee seals).

## Residual / deferred (honest limits)

- **Container read-back IS tracked (verified 2026-06-16):** storing a secret/embedding in a record or array
  and reading an element back in a later statement is caught — the container binding is tagged and member/index
  access carries the flag to the new binding. Regression-tested in `value-state-egress-hardening.test.mjs`.
- **Inter-flow is a warning, not inter-procedural proof.** Full inter-procedural egress analysis (a call
  graph) is a larger feature; the warning is the fail-loud stopgap (kept a warning so legitimate
  secret-helper patterns aren't broken).
- **`fs.writeFile` / generic `*DB` writes of a raw secret are NOT flagged by the network rule** — deliberately:
  `hash(secret) → db.insert(h)` (password storage) is legitimate and only `redact()` declassifies, so routing
  secrets to persistence sinks would false-positive. A separate "secret-at-rest" rule (with a hash declassifier)
  is the correct future home. Embedding→VectorDB *is* flagged (no legitimate cleartext-vector-at-rest pattern).
- **Runtime backstop** — the DRCM monitor scans only `__tag==='secure'` values; compile-time is the sole
  enforcement for this rule today.
- **`CRYPTO_EFFECT` — DONE 2026-06-16:** `substrate-inference.ts` now covers
  `crypto.hash|sign|verify|encrypt|decrypt|seal`, so seal()/encrypt() compose with SPORE-SUBSTRATE-001
  (a KEM-DEM/AEAD op on a noisy lane is rejected). `crypto.encrypt/decrypt/seal` are canonical effects.
- **Tensor<Float32,[N]>** intentionally NOT treated as an embedding (too generic); recognition is precise to
  `Embedding`/`EmbeddingResult`/`EmbeddingModel`/`*embed*` receivers.

## Tests

`tests/embedding-egress-privacy.test.mjs` (10) + `tests/value-state-egress-hardening.test.mjs` (15, the audit
laundering corpus) + the derived-secret cases in `value-state-checker.test.mjs` (6). Compiler package green
(3,404 tests, 0 fail).
