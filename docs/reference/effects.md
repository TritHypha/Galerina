# Reference — the effect vocabulary

Every `domain.verb` effect a contract may declare, one entry each. This is the detail page behind the
`effects { … }` table in [contract-authoring-model.md](../contract-authoring-model.md); read that first for how
effects sit in the three-tier model. Each effect is a **Table 1 (standard)** element — you declare it, and the
compiler holds you to it.

**Source of truth:** `CANONICAL_EFFECTS` and `DENY_ONLY_EFFECTS` in
`packages-galerina/galerina-core-compiler/src/effect-checker.ts`, kept drift-free by
`scripts/audit-effect-canonicality.mjs`. **Verified against source 2026-07-15: 45 canonical effects + 2 deny-only,
no drift.** Regenerate this page from that file if in doubt — do not hand-edit the set.

**Badge legend** (per effect):
- **secure-tier** — declaring or using this from a `flow`/`guarded` declaration under-declares the obligation and
  trips `FUNGI-TIER-001`; it belongs in a `secure flow`.
- **pure-forbidden** — may not appear (even inferred) in a `pure flow`; doing so is `FUNGI-EFFECT-003`.
- **plain-flow-privileged** — accepted in a plain `flow` but warns; the platform nudges it to `secure`.
- *(no badge)* — a benign-tier effect that stays at `guarded` by design (e.g. reads).

---

## A. How every effect works (the shared slots)

These answer *where / how / result* once, for all 45 effects; each entry below only adds what is specific to it.

- **What (in general)** — an effect is a **declared capability**: the closed set of side-effect domains a flow is
  allowed to touch. The declared `effects { }` set **is** the flow's capability surface — the `#105` admission gate
  admits the unit only if that set is within what policy grants. Nothing outside the declared set may happen at
  runtime.
- **Where — authored** — inside the flow's contract: `contract { effects { domain.verb } }`. One canonical
  `domain.verb` per line.
- **Where — enforced** — `checkEffects` / `checkFlowEffects` in `effect-checker.ts`. The rule is **declared ⊇
  observed**: the compiler infers the effects your body actually performs (from the call patterns noted per entry)
  and every inferred effect must be declared. Transitive calls count — if flow A calls flow B, A must declare B's
  effects too.
- **How — canonicalisation** — call-site-friendly names resolve to the canonical effect before checking:
  `http.get`/`https.post` → `network.outbound`, `database.find` → `database.read`, `Crypto.sign` → `crypto.sign`,
  `Secrets.get` → `secret.read`. Declare either form; the checker canonicalises. **Broad aliases** (`network`,
  `database`, `secret.access`, …) are accepted with a `FUNGI-EFFECT-005` nudge toward the precise name.
- **How — deny-by-default for unknown effectful calls (#153)** — an unregistered method on a *known-effectful*
  module (e.g. `Database.someNewMethod()`) is not treated as effect-free; it requires the module's broad effect
  (`FUNGI-STDLIB-002`). Effectful modules fail closed.
- **If omitted / under-declared** — performing a capability you did not declare is a hard `FUNGI-EFFECT-001`
  (error in a production compile). This is the core guarantee: **a manifest can never attest `effects: [none]` for a
  flow that actually reaches the database, the network, or a secret.**
- **Result — guarantee** — the signed manifest binds the flow to exactly its declared effect set; the runtime
  capability mask denies anything outside it. Governance is proven at compile time, enforced at admission — no
  runtime surprise.

### The tier floor (which effects force `secure`)

23 of the 45 are **secure-required**: border/egress, credential & crypto material, high-consequence sinks &
mutations, and code/process execution. Touching one from a `flow`/`guarded` declaration skips the secure-only
obligations (intent justification, epilogue proof, secret-egress sealing), so the compiler floors it to `secure`
(`FUNGI-TIER-001` — warning in dev, error in a production build). Benign reads (`database.read`, `storage.read`,
`desktop.user.read`) are **deliberately excluded** to avoid false floors.

### Diagnostics (the full effect family)

| Code | Meaning | Severity |
|---|---|---|
| `FUNGI-EFFECT-001` | uses an effect it did not declare | error (prod) |
| `FUNGI-EFFECT-002` | over-declared (warn) / a called flow's effect not declared (error) | warning / error |
| `FUNGI-EFFECT-003` | a `pure` flow declares or performs an effect | error |
| `FUNGI-EFFECT-004` | effect name is non-canonical / unknown (with "did you mean") | error |
| `FUNGI-EFFECT-005` | a broad alias used where a precise name exists | warning |
| `FUNGI-EFFECT-006` | a **deny-only** effect declared | error (every profile) |
| `FUNGI-TIER-001` | a `flow`/`guarded` declaration touches a secure-tier effect | warning (dev) / error (prod build) |
| `FUNGI-STDLIB-001/002` | a stdlib call needs an undeclared effect / unregistered method on an effectful module | error (prod) / warning (dev) |

---

## B. The 45 canonical effects

### Data / storage

#### `database.read`
**What** — read from a database (queries, lookups, selects). It is the benign end of data access: the flow observes
persisted state but does not change it. Kept at guarded tier on purpose, so ordinary read paths are not forced to
`secure`.
**Inferred from** — `database.find` · `.get` · `.select` · `.query`; any `*DB.<method>` that is not a write.
**Result** — authorises reads only; a read you don't declare is `FUNGI-EFFECT-001`. Pure-forbidden (a `pure` flow
performs no I/O).

#### `database.write`  · secure-tier · pure-forbidden
**What** — persistent mutation of a database (insert, update, delete, upsert). A high-consequence sink: it changes
durable state that other flows and tenants rely on, so it carries the secure-tier obligation.
**Inferred from** — `database.insert` · `.update` · `.delete` · `.upsert`; `*DB.insert/update/delete`.
**Result** — authorises writes; being secure-tier, using it from a plain/guarded flow trips `FUNGI-TIER-001`. Note
`pii.write` is *not* a separate effect — it resolves here, with the PII intent carried in `privacy{}`/`protected`
params.

#### `cache.read`  · pure-forbidden
**What** — read from a cache tier. Distinct from `database.read` so a flow can declare cheap, possibly-stale reads
without implying authority over the system of record.
**Inferred from** — `cache.get`.
**Result** — authorises cache reads; undeclared → `FUNGI-EFFECT-001`.

#### `cache.write`  · pure-forbidden
**What** — write or evict in a cache tier. Separated from `database.write` because a cache mutation is lower-
consequence (derived, reconstructable) and stays at guarded tier.
**Inferred from** — `cache.set` · `cache.delete`.
**Result** — authorises cache writes; undeclared → `FUNGI-EFFECT-001`.

#### `storage.read`  · pure-forbidden
**What** — read from a filesystem or object store (files, blobs, segments). Benign-tier like `database.read` — an
object read is observation, not egress.
**Inferred from** — `fs.read`/`readText`/`readBytes`, `File.read*`.
**Result** — authorises object/file reads; undeclared → `FUNGI-EFFECT-001`.

#### `storage.write`  · secure-tier · pure-forbidden
**What** — write to a filesystem or object store. Secure-tier: a write can exfiltrate to a persistent, possibly
shared, medium.
**Inferred from** — `fs.write`/`writeText`/`writeBytes`, any `FileSystem.<method>`.
**Result** — authorises object/file writes; secure-tier floor applies.

#### `state.read`  · pure-forbidden
**What** — read mutable application/session state (in-memory or coordinated). Tracked separately from database and
cache so the capability model can tell durable stores from ephemeral app state.
**Inferred from** — the `StateRead` capability bit (`type-registry.ts`).
**Result** — authorises state reads; undeclared → `FUNGI-EFFECT-001`.

#### `state.write`  · pure-forbidden
**What** — mutate application/session state. Guarded-tier by design (it is not a durable store), but still an effect
a pure flow may not perform.
**Inferred from** — the `StateWrite` capability bit.
**Result** — authorises state mutation; undeclared → `FUNGI-EFFECT-001`.

#### `ledger.mutate`  · secure-tier · pure-forbidden
**What** — append to or mutate an audit ledger — a composite of `storage.write` + `audit.write` given its own name
because a ledger is both a durable write and a governance record. Secure-tier.
**Inferred from** — declared explicitly (a governance operation, not a casual call).
**Result** — authorises ledger mutation; secure-tier floor applies.

### Network / messaging

#### `network.outbound`  · secure-tier · pure-forbidden
**What** — egress: the flow initiates a connection out. The canonical destination for HTTP client calls, and the
single most common exfiltration channel — hence secure-tier and the anchor of the egress obligation.
**Inferred from** — `http.get/post/put/patch/delete`, `https.get/post/put/patch/delete`, `*Api.send`, `*Adapter.<method>`.
**Result** — authorises outbound network; using it from a plain/guarded flow trips `FUNGI-TIER-001`.

#### `network.inbound`  · secure-tier · pure-forbidden
**What** — ingress: the flow accepts an inbound connection/request. Secure-tier because an inbound surface is an
attack surface that must carry the full admission obligation.
**Inferred from** — declared explicitly.
**Result** — authorises inbound handling; secure-tier floor applies.

#### `network.external`  · secure-tier · pure-forbidden
**What** — communication that crosses the trust boundary (to a third party / the public internet). Distinguished
from `network.internal` so policy can grant intra-cluster traffic without granting internet egress.
**Inferred from** — declared explicitly.
**Result** — authorises cross-boundary traffic; secure-tier floor applies.

#### `network.internal`  · secure-tier · pure-forbidden
**What** — communication within the trust boundary (service-to-service inside the mesh). Secure-tier for the
same reason as every `network.*` effect: all network-crossing is an egress surface regardless of trust zone.
The trust zone (`network.internal` vs `network.external`) governs the **grant scope** — what policy allows
you to reach — not the **tier**. An internal call can exfiltrate sensitive data as easily as an external one;
restricting egress to the mesh is a policy decision, not a security property of the tier itself. Separable
from `network.external` so policy can grant intra-cluster traffic without granting internet egress.
**Inferred from** — declared explicitly.
**Result** — authorises intra-boundary traffic; secure-tier floor applies.

#### `email.send`  · secure-tier
**What** — send an email. It is both a network egress and a message sink to an external recipient, so it is a
first-class effect (and implies `network.outbound`).
**Inferred from** — `email.send`, `EmailService.send` → `network.outbound` + `email.send`.
**Result** — authorises email egress; secure-tier floor applies.

#### `message.publish`  · pure-forbidden
**What** — publish to a queue/topic/bus. Guarded-tier by design (an internal fan-out primitive), but an effect a
pure flow may not perform.
**Inferred from** — the `MessagePublish` capability bit.
**Result** — authorises publish; undeclared → `FUNGI-EFFECT-001`.

### Secrets & crypto

> All crypto ops run **bit-exact on the deterministic core** (`FUNGI-SUBSTRATE-001`) — never on a noisy/analog
> lane. A photonic/analog result is data, never a verdict or a key (No-Coercion; see the floor doc). Note: the
> `crypto.*` effects are **not** in the pure-forbidden set (a verify is a deterministic function of its inputs); a
> signing flow that reads key material is still gated via `secret.read`, which *is* pure-forbidden.

#### `secret.read`  · secure-tier · plain-flow-privileged · pure-forbidden
**What** — read a secret or credential (vault entry, env secret, key material). One of the two most privileged
effects: even in a plain flow it warns, because reading a credential is the first step of most credential-abuse
paths.
**Inferred from** — `Secrets.get`, `vault.secret`, `Env.get`/`env.get`/`env.secret` → `secret.read`.
**Result** — authorises secret reads; secure-tier floor applies, and a plain-flow declaration warns toward
`secure`. The value returned is `Secret`-typed and gated by the value-state lattice.

#### `secret.write`  · secure-tier · pure-forbidden
**What** — write, rotate, or provision a secret. Secure-tier: it changes credential material other systems trust.
**Inferred from** — declared explicitly.
**Result** — authorises secret writes; secure-tier floor applies.

#### `crypto.verify`  · secure-tier
**What** — verify a signature, MAC, or password hash. Secure-tier because a verification outcome is a trust
decision — a broken or bypassed verify is an authorization bypass.
**Inferred from** — `Crypto.verify`, `BCrypt.verify`/`hash`, `Argon2.verify`/`hash`, `Password.verify`/`hash`.
**Result** — authorises verification; runs bit-exact on the deterministic core.

#### `crypto.sign`  · secure-tier
**What** — produce a signature. Secure-tier: a signing capability is the ability to speak with the key's authority.
The base effect handles call-matching; the algorithm markers below assert *which* algorithm.
**Inferred from** — `Crypto.sign`.
**Result** — authorises signing; a certified profile additionally requires a PQ/hybrid marker (below).

#### `crypto.encrypt`  · secure-tier
**What** — encrypt (KEM-DEM / AEAD). Secure-tier — it handles confidential material and must run on the
deterministic core.
**Inferred from** — `Crypto.encrypt`.
**Result** — authorises encryption; bit-exact core.

#### `crypto.decrypt`  · secure-tier
**What** — decrypt. Secure-tier: decryption exposes plaintext of confidential material.
**Inferred from** — `Crypto.decrypt`.
**Result** — authorises decryption; bit-exact core.

#### `crypto.seal`
**What** — the AEAD **seal** operation, which is also the value-state **declassifier** (`seal()`/`encrypt()` are the
only ways to lower a `Secret`). Notably *not* in the secure-tier trigger set — sealing narrows exposure rather than
widening it — but still a crypto op bound to the deterministic core.
**Inferred from** — `Crypto.seal`.
**Result** — authorises sealing and the one legal declassification; bit-exact core.

#### `crypto.sign.ed25519`
**What** — an **algorithm-assertion marker** declared alongside `crypto.sign` to assert the signature is Ed25519 (a
classical curve, **not** post-quantum). It marks intent; the base `crypto.sign` does the call-matching.
**Inferred from** — declared explicitly alongside `crypto.sign`.
**Result** — asserts the algorithm; on its own it is not sufficient in a certified profile (a PQ/hybrid marker is
required — `FUNGI-CRYPTO-PQ-001`).

#### `crypto.sign.mldsa65`
**What** — algorithm marker asserting **ML-DSA-65** (NIST FIPS 204, post-quantum signature). Declared alongside
`crypto.sign`.
**Inferred from** — declared explicitly alongside `crypto.sign`.
**Result** — satisfies the certified-profile PQ requirement as a post-quantum signature marker.

#### `crypto.sign.slhdsa`
**What** — algorithm marker asserting **SLH-DSA** (stateless hash-based, post-quantum). Declared alongside
`crypto.sign`.
**Inferred from** — declared explicitly alongside `crypto.sign`.
**Result** — satisfies the certified-profile PQ requirement as a post-quantum signature marker.

#### `crypto.sign.hybrid`
**What** — algorithm marker asserting a **hybrid** classical + PQ signature (the platform's own attestation floor is
Ed25519 + ML-DSA-65). Declared alongside `crypto.sign`.
**Inferred from** — declared explicitly alongside `crypto.sign`.
**Result** — satisfies the certified-profile PQ requirement; the strongest of the markers.

#### `random.generate`
**What** — generate cryptographically-secure random bytes. A non-deterministic source, named so it is explicit and
auditable rather than hidden.
**Inferred from** — `Random.secureBytes` · `Random.bytes`.
**Result** — authorises CSPRNG draws; undeclared → `FUNGI-EFFECT-001`.

### Compute & AI

> `compute.*` is the **pure-compute-safe** family: none is secure-tier or pure-forbidden, and a pure flow using only
> these is a `PureComputeCandidate` / `ReadyForAPU` / `ReadyForNPU`. The lane (CPU/GPU/NPU, and any analog/photonic
> backend behind it) is a **byte-mover**: its result is data, never a verdict (No-Coercion).

#### `compute.cpu`
**What** — dispatch numeric/compute work to the CPU lane. An effect (it consumes a resource envelope) but a benign,
deterministic one.
**Inferred from** — declared explicitly.
**Result** — authorises CPU compute; safe inside a pure flow.

#### `compute.gpu`
**What** — dispatch compute to a GPU lane. The GPU is an untrusted offload — results are re-verified on return, never
trusted on-device.
**Inferred from** — declared explicitly.
**Result** — authorises GPU compute; safe inside a pure flow.

#### `compute.npu`
**What** — dispatch compute to an NPU / tensor lane. Same posture as GPU: an offload whose output is data.
**Inferred from** — declared explicitly.
**Result** — authorises NPU compute; safe inside a pure flow.

#### `ai.inference`  · secure-tier · pure-forbidden
**What** — run a model for inference. Secure-tier because model output can carry its inputs' sensitivity and the call
often crosses a boundary to a model service.
**Inferred from** — `Model.run`, `Classifier.classify`, `ai.inference` (and the `ai.infer`/`ai.remoteInference`
deprecated spellings).
**Result** — authorises inference; secure-tier floor applies.

#### `ai.train`  · pure-forbidden
**What** — train or fine-tune a model. Deliberately *not* secure-tier in the current floor. The rationale:
a training job is a batch compute obligation rather than a live trust decision; the security sensitivity of
the training data is already captured by the effects required to read it (`pii.read`, `phi.read`, etc.) which
ARE secure-tier. This means: a flow that trains on PII data must declare BOTH `ai.train` AND `pii.read` —
the `pii.read` obligation is what forces `secure` tier and all the associated admission obligations. `ai.train`
itself is deliberately not doubled to avoid the ambiguity of "two secure-tier effects both requiring the same
audit trail". Note: the gradient-inversion / membership-inference exfiltration risk is real; the defence is the
`pii.read` obligation upstream (the data must be read before it can be trained on), not a tier upgrade on
`ai.train` itself.
**Inferred from** — the `ModelTrain` capability bit.
**Result** — authorises training; undeclared → `FUNGI-EFFECT-001`. Not secure-tier by design — declare
`pii.read` / `phi.read` / `phi.write` alongside it when the training data is sensitive.

#### `inference.invoke`  · secure-tier · pure-forbidden
**What** — invoke a governed inference bridge (RD-0364): send an input to a loaded model and receive a governed result.
Secure-tier because bridge outputs carry the sensitivity of their inputs (gradient-inversion / membership-inference
risk) and because the call crosses a host boundary to the inference runtime.
**Inferred from** — `EffectFlags.InferenceInvoke` (bit 15); declared explicitly or via the `inference.invoke` alias.
**Result** — authorises a governed inference call; secure-tier floor applies. Must be declared alongside `pii.read`
or `phi.read` when the model input contains sensitive data.

#### `inference.load`  · secure-tier · pure-forbidden
**What** — load a model artefact into the governed inference bridge (RD-0364). Secure-tier because model weights can
contain memorised training data (extraction attacks), the load crosses a boundary to the model store, and the loaded
model becomes part of the trusted compute surface.
**Inferred from** — `EffectFlags.InferenceLoad` (bit 16); declared explicitly or via the `inference.load` alias.
**Result** — authorises a model-load into the bridge runtime; secure-tier floor applies.

#### `native.call`  · secure-tier · pure-forbidden
**What** — call native / FFI code. Secure-tier and high-consequence: native code escapes the governed WASM sandbox,
so it carries the strongest obligation short of deny-only.
**Inferred from** — `Native*.<method>` → `native.call`.
**Result** — authorises an FFI boundary crossing; secure-tier floor applies.

### System / lifecycle

#### `process.spawn`  · secure-tier · pure-forbidden
**What** — spawn a background OS process. An anti-abuse effect (R4B): covert background execution is a classic way to
escape the governed flow, so it is secure-tier and pure-forbidden.
**Inferred from** — `process.spawn`.
**Result** — authorises process spawning; secure-tier floor applies.

#### `worker.spawn`
**What** — spawn an in-process worker. An anti-abuse effect like `process.spawn`, but lower-consequence (stays inside
the runtime), so it is guarded-tier.
**Inferred from** — declared explicitly.
**Result** — authorises worker spawning; undeclared → `FUNGI-EFFECT-001`.

#### `event.schedule`
**What** — schedule a task/event for later execution. Named so deferred execution cannot become a covert channel —
scheduling is visible in the effect set.
**Inferred from** — declared explicitly.
**Result** — authorises scheduling; undeclared → `FUNGI-EFFECT-001`.

#### `shell.execute`  · secure-tier · pure-forbidden
**What** — execute a shell command (V_DPM capability bit 6). One of the highest-consequence system effects — arbitrary
command execution — so it is secure-tier and pure-forbidden.
**Inferred from** — declared explicitly.
**Result** — authorises shell execution; secure-tier floor applies.

#### `clock.read`
**What** — read the wall clock. A non-deterministic source, named so time reads are explicit (they break
reproducibility and can leak timing).
**Inferred from** — `Clock.now`.
**Result** — authorises clock reads; undeclared → `FUNGI-EFFECT-001`.

#### `telemetry.read`  · pure-forbidden
**What** — read telemetry / observe external system state (metrics, posture). An observation of external state, so it
is an effect and pure-forbidden, but not secure-tier.
**Inferred from** — declared explicitly.
**Result** — authorises telemetry reads; undeclared → `FUNGI-EFFECT-001`.

#### `desktop.user.read`  · pure-forbidden
**What** — read desktop / user-environment data (host context). Benign-tier by design — an observation, not egress —
but pure-forbidden like every read family.
**Inferred from** — `Host.<method>` → `desktop.user.read`.
**Result** — authorises host/user reads; undeclared → `FUNGI-EFFECT-001`.

### Sensitive data

#### `pii.read`  · secure-tier · pure-forbidden
**What** — read personally-identifiable information. Secure-tier: PII carries regulatory and reputational
consequence, and reading it is the first step of a leak. There is deliberately **no `pii.write`** effect — a PII
write resolves to `database.write`, and the PII intent is carried in `privacy{}` / `protected` params.
**Inferred from** — declared explicitly (the intent rides on typed/`protected` params).
**Result** — authorises PII reads; secure-tier floor applies; the value propagates as sensitive through the
value-state lattice.

#### `phi.read`  · secure-tier · pure-forbidden
**What** — read protected health information. Secure-tier for the same reason as PII, with a distinct name so
health-data policy is separable.
**Inferred from** — declared explicitly.
**Result** — authorises PHI reads; secure-tier floor applies.

#### `phi.write`  · secure-tier · pure-forbidden
**What** — write protected health information. Secure-tier: a durable write of regulated health data. (Unlike PII,
PHI has an explicit write effect.)
**Inferred from** — declared explicitly.
**Result** — authorises PHI writes; secure-tier floor applies.

#### `payment.charge`  · secure-tier · plain-flow-privileged · pure-forbidden
**What** — charge a payment method / move money. The second of the two plain-flow-privileged effects: it warns even
in a plain flow because an unintended charge is directly, financially irreversible.
**Inferred from** — `*Payment.<method>`, `*Payments.<method>`, `*Api.charge` → `payment.charge`.
**Result** — authorises a charge; secure-tier floor applies and a plain-flow declaration warns toward `secure`.

### Audit

#### `audit.write`  · secure-tier · pure-forbidden
**What** — append to the append-only audit trail. Secure-tier as a governance record, but with a special carve-out:
`audit.write` is permitted on a **deny arm** so that a denial is never silent (the checker's
`DENY_ARM_ALLOWED_EFFECTS`).
**Inferred from** — `AuditLog.write`, `audit.log`.
**Result** — authorises audit appends; the deny-arm carve-out keeps refusals recorded.

---

## C. Deny-only effects (recognised, never grantable)

These two names exist in the vocabulary **only so an author gets the real reason instead of a typo hint**. They are
absent from every grantable table (canonical / alias / flag / GIR / capability), proven by C10 in
`audit-effect-canonicality.mjs`. Declaring either is `FUNGI-EFFECT-006` at **every profile** — there is no
declaration that makes the flow admissible.

#### `eval.execute`  · **deny-only**
**What** — arbitrary dynamic evaluation. No capability bit, no host import, and no admission path may ever carry it —
dynamic eval is the antithesis of a compile-time-proven governed flow.
**If declared** — `FUNGI-EFFECT-006`; the fix is to restructure the flow to avoid dynamic evaluation, not to declare
an effect.
**Result** — always denied; there is no grant.

#### `memory.spill`  · **deny-only**
**What** — a hardened value crossing its `hardening { residency … }` ceiling — a register-only / no-swap secret
reaching DRAM or swap (RD-0358 / H-6). Deny-by-default: no capability legitimises leaking a hardened secret to
memory, so a *declared* spill can never buy admission the way the implicit spill (`FUNGI-HARDEN-005/007`) is already
rejected — the two paths close the door from both sides.
**If declared** — `FUNGI-EFFECT-006`.
**Result** — always denied. A future *grantable* "audited paged-optimizer" spill (RD-0356 B5) would be a **distinct**
canonical effect, never this name — so "declared spill" can never become a synonym for "declared paging."

---

*Provenance: `effect-checker.ts` (`CANONICAL_EFFECTS`, `DENY_ONLY_EFFECTS`, `EFFECT_REGISTRY`, `EFFECT_NAME_ALIASES`,
`SECURE_REQUIRED_EFFECTS`, `PURE_FORBIDDEN_EFFECTS`, `PLAIN_FLOW_PRIVILEGED_EFFECTS`); `type-registry.ts`
(EffectFlags); `scripts/audit-effect-canonicality.mjs` (drift gate). Verified against source 2026-07-15.*
