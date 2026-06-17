# LogicN — Design Proposal: `secrets {}` and `epilogue {}` Governed Contract Blocks

**Status: DESIGN PROPOSAL (not yet implemented).** Two new `contract` sub-blocks that
extend LogicN's governance model, plus the package boundary they must respect. Parts are
implementable in the near term (grammar + taint stamping); parts are backend/host-dependent
and belong with the external §Tail (zk-SNARK proving, TEE/WASI host secret interfaces,
cloud-vendor drivers). This doc records the intended shape so it can be built incrementally
without re-deriving it. Authored 2026-06-02 from a design contribution; edited for accuracy
against LogicN's actual subsystems.

---

## Auto-by-default (like `economics {}` / `ergonomics`)

Both blocks are **auto-by-default**, not opt-in-only: a flow that declares **neither** block is
still governed — the **runtime populates and handles them automatically**, exactly the way
`economics {}` is auto-inferred from the CostGraph/ValueGraph when omitted. Declaring the block
is an **explicit override** of the auto behavior, not the only way to get the behavior.

- **`secrets {}` auto-mode (omitted):** the runtime handles configuration via standard env
  mapping — the familiar `.env` workflow **is** the auto-mode of `secrets {}`. Most apps never
  write the block and get sane, unsealed env handling for free. Declaring `secrets {}` overrides
  the auto-mode for *sensitive* credentials (vault/KMS handles, rotation, sealing); non-sensitive
  vars can stay in normal env handling alongside it.
- **`epilogue {}` auto-mode (omitted):** the runtime selects the proof tier from the
  CostGraph/ValueGraph (cheap `sha256_seal` for low-value flows, escalating to a
  `zk_snark_receipt` for high-value ones) — or none when value doesn't justify one. Declaring
  `epilogue {}` pins a specific strategy regardless of scale.

So "most apps just use a `.env` and emit no heavy proof" remains true — that's simply the
**default mode** of these blocks, populated in the runtime, not a separate un-governed path.

> **Project status (2026-06-03):** `economics {}`, `secrets {}`, and `epilogue {}` are all
> **parsed and retained** as first-class `contractDecl` sub-blocks by the Stage-A compiler
> (`parser.ts`), verified by `tests/contract-secrets-epilogue.test.mjs`. `economics {}` has an
> auto-inference layer (`economics-inference.ts`). The runtime auto-population for `secrets`/
> `epilogue`, the taint guard, vault drivers, and the zk prover remain forward work (see §4).
>
> **Wiring gap (2026-06-17, #110):** `secrets {}` is *retained* as a block, but the credential
> **body** (`provider`/`path` + the `rotation {}` policy) is **dropped at parse** (`parser.ts:4114`) —
> only the credential NAME reaches the manifest, so a declared `rotation { interval … on_rotation_fault }`
> never becomes a verifiable proof obligation. The rotation **engine** is already built in ext
> (`logicn-ext-secrets-vault` `SecretsRotationManager` — dual-token/quiesce/atomic-swap/zero-wipe) but is
> not bound to a manifest obligation. Fix is core-side: retain the body in the `contractDecl` AST + emit a
> manifest proof obligation that binds to the ext driver — the engine stays in ext (govern-don't-absorb).
> See [[logicn-key-custody-and-rotation]] §2.

## 0. The unifying pattern — governed contract blocks are *dual-mode*

LogicN already has a precedent worth generalizing: `economics {}` can run in **auto** mode
(the compiler derives cost/route from the `CostGraph` + `ValueGraph` + breach-risk matrix)
or accept **explicit** developer overrides. New governance blocks should mirror this exactly:

- **Implicit auto-mode (default):** when omitted or empty, the compiler chooses the optimal
  behavior from the same governance graphs (`CostGraph`, `ValueGraph` asset-weight /
  breach-risk classifications). The developer pays only for what the workload's value justifies.
- **Explicit manual override:** when a regulatory framework demands a *specific* mechanism
  regardless of transaction scale, the developer states it and the compiler enforces it verbatim.

This keeps the surface small (most flows declare nothing) while preserving total authority
when determinism is required. Both blocks below follow this pattern.

> **Architectural note (editorial):** thresholds shown as concrete dollar figures (e.g.
> "≥ $1,000") are *illustrative*. In LogicN they should be **derived from the `ValueGraph`
> breach-risk / asset-weight classification**, not hardcoded — otherwise the auto-mode isn't
> actually governed by the value model. Treat the numbers as defaults a profile can set.

---

## 1. `epilogue {}` — post-execution proof strategy

A block that decides **what cryptographic receipt a flow emits after it runs**, so the proof
cost scales with the value at risk. Sits alongside `economics {}` and feeds the `ProofGraph`
+ governance-signature layer (Ed25519 v1 / ML-DSA-65 hybrid, FIPS 204) LogicN already has.

### Auto-mode selection (default)
The compiler reads the flow's risk cost (from `CostGraph` × `ValueGraph`) and picks:

| Risk tier (from ValueGraph) | Proof strategy | Cost profile |
|---|---|---|
| Low (below the profile's threshold) | **`sha256_seal`** — input/output hash seal | near-zero overhead; CPU scalar; cheap audit anchor |
| High (at/above threshold) | **`zk_snark_receipt`** — zero-knowledge proof | full third-party-verifiable receipt; heavy; offloadable to GPU/accelerator |

The point: don't run a zk proof on a low-liability string filter, and don't ship a $1M
settlement flow with only a hash. The receipt tier is a *function of governed value*.

### Manual override
```
contract {
  economics {
    max_risk_liability $5000.00
    optimize balanced
  }
  epilogue {
    generate_proof zk_snark_receipt        ;; overrules the auto scaling engine
    on_verification_failure halt_pipeline
  }
}
```

### Proposed AST (parser-side, core-implementable)
```ts
export type ProofStrategy = "auto" | "sha256_seal" | "zk_snark_receipt" | "none";

export interface EpilogueContractBlock {
  strategy: ProofStrategy;
  onFailure: "halt_pipeline" | "quarantine_payload" | "log_and_continue";
}

export const defaultEpilogueBlock = (): EpilogueContractBlock => ({
  strategy: "auto",
  onFailure: "halt_pipeline",
});
```

### Runtime evaluation (host/runtime-side, sketch)
At a WASI boundary the host evaluates `economics {}` and `epilogue {}` together: economics
selects the compute substrate (fallback to local when risk cost exceeds the liability budget),
then epilogue selects the proof engine — `auto` resolves to `sha256_seal` vs `zk_snark_receipt`
by risk tier; an explicit strategy is enforced as-is.

### Mapping to LogicN / honesty
- **Maps onto:** `ProofGraph` (the receipt becomes a ProofGraph node), `GovernanceSignature`
  (the seal/receipt is signed with the existing Ed25519/ML-DSA-65 path), `CostGraph`/`ValueGraph`
  (drive auto-selection).
- **§Tail (not countable in-repo until a backend executes):** actual **zk-SNARK proving** and
  **GPU/tensor-core offload** are external/hardware-dependent — same status as the existing
  roadmap §Tail (SGX attestation, Lean4 export, PQ signing). The *grammar*, the *AST*, the
  *auto-selection policy*, and the `sha256_seal` tier are implementable now; the zk tier is a
  stub/interface until a prover is wired.

---

## 2. `secrets {}` — declarative sealed credentials

An **optional** upgrade path for sensitive credentials (the common case — plain env vars —
stays unchanged). For workloads that need it, it replaces the `.env` → `process.env`
global-string pattern with **contract-declared credential handles** that are never
materialized as plaintext in the guest, are isolated
behind deny-by-default WASI boundaries, support **zero-downtime rotation**, and are tracked by
the value-state/taint checker so a secret can never reach a log/network sink.

### Declared topology
```
contract {
  target { preferred_execution hardware  isolation sealed_envelope }

  secrets {
    ;; Hardened reference handles — values are never stored as raw text
    credential db_password  { provider "hashicorp_vault"  path "secret/data/db" }
    credential api_auth_key { provider "doppler"          id   "api_key_prod"   }

    ;; Continuous rotation policy
    rotation {
      interval 1h                ;; hourly rotation sweep
      strategy smooth_handshake  ;; dual-token window → zero downtime
      on_rotation_fault halt     ;; safe shutdown on error
    }
  }
}
```

### Isolation blueprint
Compiled to WASI Preview 2/3 components, the guest has **no `std::env` / no global namespace**.
The host provides each secret via a restricted read-only handle (`wasi:secrets/read`), zero-copy:
```
[ Vault / KMS ] → [ Host runtime ] →(ephemeral view)→ [ wasi:secrets/read ] →(zero-copy ptr)→ [ guest ]
```
Guarantees: (1) no global object holds credential text — an exploit reading memory finds an
empty structure; (2) **context-specific scope** — only the node explicitly linked to the DB
driver gets the handle; tokenizers / HTTP layers / `ValueGraph` routers are blind to it.

### Zero-downtime rotation — ephemeral splicing
On a rotation signal the host stages the new value in a tracking slot, keeps both old and new
valid during a crossover window, quiesces active threads, then does an **atomic pointer swap**
and zero-wipes the stale slot. The guest is never restarted; application code never sees the swap.
(Sketch types: `EphemeralSecretHandle { currentVersion, activeTokenPointer, trackingHandshakePointer }`.)

### Taint enforcement — the most implementable, highest-leverage slice
This is where the proposal lands **directly on a subsystem LogicN already has** — the
value-state / taint checker (`value-state-checker.ts`, `ValueStateFlags`, `SINK_REQUIREMENTS`,
`LLN-GATE-*`/`LLN-TAINT-*`). Add a top-classification taint bit for secrets and a compile-time
guard that blocks a secret-tainted value from reaching a logger / network sink:
```ts
export const enum SecurityTaintExtension { Secret_Credential = 1 << 5 }

// compile-time invariant, mirrors the existing sink checks
function verifySecretContainment(node, input): void {
  if (node.kind === "telemetry_logger_sink" &&
      (input.taintStatus & SecurityTaintExtension.Secret_Credential)) {
    throw new Error("Cryptographic Guard Violation: classified secret reached a logging sink.");
  }
}
```
A `Log.info(db_password)` is then rejected at **compile time** (a new `LLN-TAINT-xxx`),
before any bytecode is emitted — exactly LogicN's "declared-and-enforced, fail before execution"
posture. **This piece is buildable today**: it's an extension of the taint flags + sink-requirement
table I audited this session, not new infrastructure.

### Worked example — AWS KMS key rotation (host/ext-side)
`credential billing_crypto_key { provider "aws_kms"  arn "...key/v1-production-storage-key"
region "us-east-1" }` + `rotation { trigger "aws_sns_rotation_topic"  strategy smooth_handshake
on_rotation_fault quarantine }`. On an EventBridge rotation notice the host demotes the current
key to a decryption-only fallback slot, stages the new version as the active write key, quiesces,
atomic-swaps, and zero-wipes the old address — same ARN, new backing material, no downtime, and
KMS-tainted buffers are blocked from external sinks by the same taint guard
(`CryptoSecurityTaint.Kms_Managed_Data = 1 << 6`). Old-key-encrypted records still decrypt via
the fallback slot during the window.

---

## 3. Package boundary — this is NOT core

**Strict rule: the cloud/vault mechanics live in a non-core tier, never in `logicn-core-*`.**

| Layer | Responsibility |
|---|---|
| `logicn-core-compiler` | Parse `contract { secrets {} / epilogue {} }` grammar; stamp `SecurityTaintExtension` bits; build the `ProofGraph` node. **Pure, deterministic, platform-agnostic — emits WAT/WASM only.** |
| `logicn-core-runtime` | Host-side WASI component interceptor; expose the abstract `wasi:secrets/read` / proof-engine hooks via a narrow **WIT** boundary. No vendor code. |
| `logicn-ext-secrets-aws` (NEW, non-core) | Talks to AWS KMS / Vault / Doppler; catches EventBridge/SNS rotation webhooks; handles auth; drops raw key bytes into the core's open memory slot through the WIT handle. |

Narrow WIT boundary the core defines (vendor-agnostic):
```wit
interface secrets-gateway {
  type secret-handle = u32;
  provide-secret-buffer: func(id: string, stage_slot: u32) -> list<u8>;
}
```

**Why the boundary (sound, and consistent with LogicN's stated philosophy):**
1. **Core determinism** — the core consumes source → AST → ProofGraph → WASM. It must recognize
   the `secrets {}`/`epilogue {}` *grammar* and stamp taint, but must NOT bundle network/IO.
2. **No dependency creep / small footprint** — baking AWS SDKs / Vault HTTP clients into core
   would drag hundreds of MB into a `wasi:http/proxy` edge node that just runs a local query.
   Bare targets should keep sub-ms cold starts / <10MB footprints.
3. **Vendor churn isolation** — cloud APIs change constantly; the core governance plane stays
   stable. (LogicN already establishes this precedent with `logicn-db-{sqlite,postgres,mysql,
   firestore,opensearch}` and `logicn-data-*` as non-core integration tiers — `logicn-ext-*`
   is the same idea for identity/secrets/proof drivers.)

---

## 4. Recommended build order (editorial)

Ranked by leverage × buildability against today's codebase:

1. **`secrets {}` grammar recognition ✅ + secret taint bit + full sink-guard trilogy ✅ (done 2026-06-03).**
   A binding read from a `secrets {}` credential accessor (`secret.get` / `vault.read` /
   `kms.decrypt` / `secrets.*`) is inferred **SecureString** in the value-state checker, so the
   compile-time sink guards block it from every leak path:
   - **`LLN-SECRET-001`** — logging sinks (`log.*`, `print`)
   - **`LLN-SECRET-003`** — serialization / audit (`json.encode`, `AuditLog.write`)
   - **`LLN-SECRET-002`** — network/egress (`http.*`, `https.*`, `net.*`, `fetch`, `email.send`) ← added
   `redact()` is the safe escape on all three (also fixed: the log guard now honors `redact()`
   like the serialize guard). Pure compile-time, no host/cloud dependency; tests in
   `tests/value-state-checker.test.mjs`. The `SecurityTaintExtension` bit from the original
   proposal is realized via the SecureString classification (same guarantee, no new flag needed).
2. **`epilogue {}` grammar ✅ (done 2026-06-03)** + AST + auto-selection policy + `sha256_seal`
   tier. Grammar is parsed now; remaining: a cheap hash seal into the ProofGraph + auto-tier
   driven by the ValueGraph.
3. **WIT `secrets-gateway` + `wasi:secrets/read` hooks in `logicn-core-runtime`** — the
   capability boundary; no vendor code.
4. **`logicn-ext-secrets-aws` plugin + ephemeral rotation splicing** — host/runtime + cloud;
   the §Tail-adjacent piece (real KMS, real rotation).
5. **`zk_snark_receipt` proof engine** — external prover/hardware; pure §Tail until a backend
   executes (do not count toward in-repo completion).
   - **Path confirmed:** snarkjs (Groth16, pure JavaScript) — Phase 1; bellman (Rust napi-rs) — Phase 2.
   - **Package:** `logicn-ext-proof-snarkjs` (non-core, same tier as `logicn-ext-secrets-vault`).
   - **Interface:** `ProverBackend` plug-in contract so `logicn-core-compiler` never imports snarkjs
     directly. Core defines the interface; ext package provides the implementation.
     ```ts
     interface ProverInput  { sourceText: string; contractHash: string; resultJson?: string }
     interface ProverBackend { prove(input: ProverInput): Promise<ZkProof> }
     ```
   - **Circuit design:** Groth16 over sha256(sourceText + contractHash) as witness; public input =
     inputSeal; output = proof object + verification key hash.
   - **Upgrade path:** replace `zkReceiptStub` field in `EpilogueReceipt` with `zkProof: ZkProof`
     once the backend is wired. The `ZkProof` interface and `ProverBackend` contract are already
     defined in `proof-graph.ts`. See `docs/Knowledge-Bases/logicn-zk-proof-plan.md` for full spec.
   - **Status:** stub live (produces clearly-labelled PENDING receipt). Real prover = Task #29.

Items 1–2 strengthen LogicN's core differentiator (declared-and-enforced governance, fail
before execution) with no new infrastructure; 3–5 are host/ext/backend work.

## Reference
- Luke Wagner, *"Towards a Component Model 1.0"*, Wasm I/O — async execution, narrow typed
  interfaces, capability boundaries; aligns with the WIT-boundary design above.
  https://www.youtube.com/watch?v=qq0Auw01tH8
