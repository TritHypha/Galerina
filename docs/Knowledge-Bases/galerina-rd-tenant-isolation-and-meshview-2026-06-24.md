# Galerina — Tenant Isolation (note 54) + MeshView (note 55): Governance-Buildable Subset

**Version:** 1.0 (2026-06-24)
**Sources:** `C:/wwwprojects/Galerina/notes/54-userQuery` (tenant isolation / IDOR), `notes/55-tritmeshvewer` (MeshView admin tool, Gemini-authored)
**Posture:** R&D verdict + capture-only. **Read-only on TritMesh** (`C:/wwwprojects/Galerina-TritMesh`) — these notes describe a TritMesh *product*; nothing here edits TritMesh. Galerina keeps **no new crypto / no new science** — RLS, multi-tenancy, macaroon delegation, Shamir threshold, immutable-append/temporal-DB are all ESTABLISHED prior art → **paper verdict: defensive-pub / none.**

---

## 1. Hub verdict (up front)

**Note 54 (tenant isolation) is the strongest of the recent notes** — it targets the #1 real-world vuln (IDOR / OWASP A01 Broken Access Control). But every mechanism it proposes is an established named technique, and 2 of its 3 "borders" are TritMesh-product (MeshQL is a stub) or substrate-gated (per-session WASM arenas = DSS.wasm gap #102-106). **The Galerina-buildable win is real and worth building:** *deny-by-default-private vault visibility* + *compiler-forced capability-scope intersection at the contract/capability layer*. Per-claim: **0 refuted outright, 4 sound-but-overclaimed.** Two phrasings must be corrected before any write-up: border-2's "identity-token-as-key" (a token is not high-entropy key material) and border-3's "O(1)/single-clock-cycle intrusion wipe" (it is O(arena-size), and the shipped `memory.fill(0)` is per-flow reclamation, not intrusion-triggered).

**Note 55 (MeshView) is ~90% TritMesh product tooling** (a phpMyAdmin/DBeaver analogue for the TritMesh DB). All its transferable governance ideas are already shipped or already-assessed in Galerina. **Capture only two things:** *governed visibility* (= shipped K3 `decideAtBoundary` + `redact()`/`seal()`, plus the already-decided `Result.Masked` per-field shaper) and *ephemeral attenuated capability delegation* (= macaroon prior art + shipped capability model; the only buildable governance piece is a fail-closed TTL lease). **Build nothing net-new from note 55.** Two overclaims to flag back: "capability mathematically evaporates" (needs a fail-closed lease, not self-enforcing math) and break-glass "makes theft a cryptographic impossibility" (reconstruction-in-RAM + quorum-compromise window — raises the bar, not impossible).

**Verify-before-build holds.** The single genuinely net-new Galerina build across both notes is the **deny-by-default tenant border (Half A + Half B below)**; everything else re-derives shipped machinery or is TritMesh-product / substrate-gated.

---

## 2. TritMesh-product vs Galerina-governance split

### Note 54

| Mechanism | TritMesh-product (don't build in Galerina) | Galerina-governance (can build / mostly shipped) |
|---|---|---|
| **Border 1 — Implicit Capability Intersection** `Q_executed = Q ∩ S_user` | The MeshQL **query rewriter** that physically injects the tenant filter (MeshQL is a **STUB**) | **Capability-scope intersection at the contract/capability layer** — compiler refuses a flow whose data access isn't intersected with the caller's proven tenant scope (Half B) |
| **Border 2 — Cryptographic Tenant Sharding** | `.tmf` vaults as a runtime store; the live encrypt/decrypt path | **Honest per-tenant KEK** via tmf KEM-DEM (slice 3 DONE) + M-of-N threshold custody (slice 4, NEXT); crypto-shred = shipped digital key-zeroize (revocation registry, vault zero-wipe) |
| **Border 3 — Ephemeral per-session WASM arenas** | "No shared connection pool" runtime; real isolated session arenas; intrusion-triggered O(arena) wipe | Substrate-gated (**DSS.wasm gap #102-106**). Shipped `memory.fill(0)` is per-flow reclamation, **not** session/intrusion-triggered (note-53 ledger item 2b) — verified absent |
| **Closing question** — designate public/shared vs tenant-scoped without dev error | — | **Deny-by-default-private declaration** (Half A) — forgetting = SAFE/denied |

### Note 55

| Claim | Verdict | Where it lives |
|---|---|---|
| C1 Governed visibility (metadata topology, payload shown `[ENCRYPTED BLOCK]`) | SOUND | Galerina-gov = **shipped** K3 `decideAtBoundary` + `redact()`/`seal()` + SealTaint (SPORE-PRIVACY-002); MeshView UI = TritMesh |
| C2 Client-side `meshview.wasm` (decrypt in admin RAM) | SOUND but **TritMesh-product** | Thick-client + E2E crypto; TLSTP is owner-locked R&D. Nothing for Galerina |
| C3 Ephemeral capability delegation (time-locked `.tmf` token to a support engineer) | SOUND, **established (macaroon)** | Buildable governance piece = **fail-closed TTL lease** (small); token-minting + `.tmf` plumbing = TritMesh |
| C4 Immutable-append editing + History slider | SOUND, **already SHIPPED** | tmf-history-chain (hash-chained append); slider UI = TritMesh. Datomic/event-sourcing prior art |
| C5 Break-glass Shamir M-of-N | SOUND, **already-ASSESSED** | **CITE** `wu3iyjjba` + `threshold-custody-v0`; do not re-derive. Overclaim: secret reconstructed-in-RAM, needs node-identity anchor |
| C6 K3 partial-return (`get(All_Users)` masks private rows) | SOUND, **on the queue** | `Result.Masked` per-field shaper (tritmesh tm-5, BUILD-ALL-SIX) — the ONE net-new capability MeshView needs |
| C7 "God Mode mathematically impossible" | SOUND framing, mildly overclaimed | True for single-party (no server master key); C5's quorum IS a recovery path → "no SINGLE-party God-Mode" |
| C8 2D/3D graph renderer, visual query builder | **Out of scope** — pure TritMesh-product | — |

---

## 3. Galerina-buildable designs

### Note 54 — the deny-by-default tenant border (THE net-new build)

Two halves, both deny-by-default, both compile-time, both reusing shipped machinery (no new crypto, no new science).

**HALF A — Deny-by-default-private vault visibility (build first, lowest risk).** Make a `vault`/`model`'s tenancy posture an explicit, compiler-checked declaration that **defaults to the SAFE value**:
- Default = `tenant_scoped` (private). Any flow reading/writing a `tenant_scoped` vault MUST carry a proven caller scope, intersected with it (Half B). **Forgetting the annotation ⇒ tenant_scoped ⇒ SAFE/denied, never leaky.** This is the deny-by-default inversion of the classic ORM footgun (Rails `default_scope` / Django un-scoped `.objects`, where forgetting the scope *leaks*).
- `shared` / `public` must be written **explicitly** and is review-gated: emit a governance obligation mirroring the shipped **C-005 propose→approve** widening machinery (`validateTransitionMonotonicity`) + domain-guard `[conforms_to: X]` ceiling, so promoting a vault to shared is a visible, attributable change an AI cannot make silently.
- New diagnostics in the existing `SPORE-GOV` family (`SPORE-TENANT-*` is a free code family — register in `galerina-diagnostic-namespace-ownership.md`): e.g. **SPORE-TENANT-001** "tenant_scoped vault accessed without a bound caller scope" (fail-closed); **SPORE-TENANT-002** "shared/public vault declared without review obligation."
- **Reuses (shipped):** the `view: public/private/secret/internal/...` lattice on models (`capabilities.md`, `builtin-view-levels.md`); the `scoped vault` boundary (`scoped-vaults.md`, Stage B); deny-by-default capability rules ("missing grants fail closed").

**HALF B — Compiler-forced capability-scope intersection (Galerina-honest border-1; NOT a MeshQL rewriter).** Galerina cannot rewrite a SQL/MeshQL string it doesn't own, so enforce at the capability/contract layer it DOES own:
- Bind `ctx.actor.tenantId` (shipped actor model, `permission-capability-actor-model.md`) as the caller scope `S_user`, sourced from the verified identity passport (`galerina-governed-identity.md` Option 8 verifiable IDs / Option 5 deterministic `UserId.from(tenantId, email)`).
- For a `tenant_scoped` vault, the compiler requires the data-access effect to be **parameterized by `S_user`** and refuses to mint the manifest otherwise — i.e. the capability granted to the flow is the **INTERSECTION** of the contract's declared data effect and the caller's proven tenant scope. This is exactly the shipped attenuation rule "**delegated grants must not be broader than the delegator's authority**" (`capabilities.md` line 219).
- This is the buildable reading of `Q_executed = Q ∩ S_user`: **capability intersection + a fail-closed proof obligation in `governance-verifier.ts`, not a query-string transform.** The actual row filtering still happens in the data engine (Postgres RLS / MeshQL when real); Galerina's job is to make "no caller scope bound" a **COMPILE ERROR**, so the unscoped-query class of bug cannot ship.

**HALF C — Honest per-tenant key (border-2, digital, ext-package).** Do **not** derive a key from the identity token directly (OWASP: never trust a client-supplied tenant ID as key material). Derive a per-tenant KEK via `KDF(tenant_master_secret, tenant_identity_binding)` under **M-of-N threshold custody**, then KEM-DEM-wrap per-record DEKs.
- **Reuses:** tmf **slice 3 KEM-DEM (DONE**, `src/kemdem.ts`, 14 golden tests) + tmf **slice 4 hybrid signing + M-of-N threshold custody (NEXT** — the real build dependency, `threshold-custody-v0`); crypto stays digital (SPORE-SUBSTRATE-001).
- This is **defense-in-depth at-rest BEHIND Half A/B, never a substitute** for the access-control border (a live session with both keys loaded defeats "rogue dump → noise"). Crypto-shred on tenant delete = shipped digital key-zeroize (revocation registry `governance/revocations.json` + vault zero-wipe in `rotation-manager.ts`).

**Build order:** Half A → Half B (both compile-time, no substrate dependency) → Half C after tmf slice 4 lands.

### Note 55 — the only buildable governance pieces

1. **Per-field `Result.Masked` shaper (K3 partial-return, C1/C6).** ALREADY DECIDED, on the owner BUILD-ALL-SIX queue (tritmesh tm-5). Folds actor capabilities per response field with K3 `vAnd`; DENY/INDETERMINATE fields become a typed `Masked(code)` sentinel carrying SPORE-GOV-3VL-001 and the rest is returned. This is the ONE thing MeshView needs that Galerina doesn't already ship (current masking is **binary** redact/seal/reject-whole-record). Build as a thin fail-closed composition of `decideAtBoundary` + `view()` + `redact()` at an output boundary.

2. **Time-locked attenuated capability lease (macaroon-shaped delegation, C3).** Mostly already-research (CapTP delegation + macaroon attenuation in `galerina-governed-runtime-research-2026-06-03.md` §C) + the capability/verdict model is shipped (`galerina-auth` returns K3 `Verdict`s; kernel keeps the decision). The genuinely buildable governance piece is the **FAIL-CLOSED EXPIRY**: model the grant as a bounded lease/TTL that fail-closes (denies) if the verifier can't re-confirm it within the window — exactly the revocation decision already made for confidential-compute (`wu3iyjjba`: "lease/TTL that fail-closes; push-alone is fail-OPEN"). **NOT** "the capability evaporates by itself." Token-minting and `.tmf` plumbing are TritMesh-product.

**Do NOT rebuild (already shipped):** governed visibility / payload gate (K3 `decideAtBoundary` + `redact()`/`seal()` + SealTaint, SPORE-PRIVACY-002); immutable-append history (tmf-history-chain); break-glass Shamir M-of-N (**cite `wu3iyjjba` + `threshold-custody-v0`**); capability verdict factors (`galerina-auth`); revocation of a leaked grant (`governance/revocations.json` + revocation-registry, fail-closed + trust-anchor-pinned).

---

## 4. Answer to note-54's closing question

> *How do we designate public/shared vs strict-tenant-scoped vaults without re-introducing developer error?*

**Make the SAFE value the default and force the dangerous one to be explicit and review-gated.** Vaults are `tenant_scoped` (private) **by default**; "shared"/"public" must be **explicitly declared** and emits a governance obligation (C-005 propose→approve + domain-guard ceiling). Therefore **forgetting the annotation = SAFE (denied), not leaky** — the exact inversion of the Rails `default_scope` / Django `.objects` footgun, and the same posture as PostgreSQL RLS (default-no-access) and Zanzibar/ReBAC deny-by-default. This is Half A above; it is the most Galerina-actionable part of either note.

---

## 5. Prior art + paper verdict

All "novel" mechanisms across both notes are established → **defensive-pub / none** (consistent with Galerina's no-new-crypto / no-new-science posture).

- **Border 1 / capability intersection:** PostgreSQL RLS (default-deny; rows "don't exist"); Oracle VPD predicate injection (2002); macaroon caveats/attenuation `capability = grant ∩ request ∩ policy` (libmacaroons); MongoDB auto-`$match` tenant injection.
- **Border 2 / tenant sharding:** Envelope-encryption key hierarchy (Root→Tenant-KEK→DEK), HKDF-SHA256, per-tenant crypto-shred — OWASP Multi-Tenant Security Cheat Sheet; AWS multi-tenant RLS.
- **Border 3 / deny-by-default:** Zanzibar/ReBAC deny-by-default (relationship/topology visible, contents gated).
- **Macaroons (C3):** Birgisson, Politz, Erlingsson, Taly, Vrable, Lentczner — *Macaroons: Cookies with Contextual Caveats for Decentralized Authorization in the Cloud*, NDSS 2014.
- **Break-glass (C5):** HashiCorp Vault seal/unseal + recovery keys; Shamir's Secret Sharing (1979).
- **Immutable-append (C4):** Datomic temporal `as-of`; event-sourcing time-travel; Git.
- **Client admin tool (C2):** DBeaver (native client) vs phpMyAdmin (server-side).

**Verdict: defensive-pub for the framing (capability-intersection tenant border + deny-by-default-private vault visibility + macaroon-attenuated TTL lease); none / cite-only for break-glass, immutable-append, and the MeshView product surface.**

---

## 6. Cross-references

- `capabilities.md` (effects vs capabilities, `view:` exposure, attenuation rule line 219) · `builtin-view-levels.md` · `scoped-vaults.md`
- `galerina-domain-guard-policies.md` (`[conforms_to: X]` ceilings) · `galerina-contract-permissions-design.md` (C-005/M-001 widening)
- `galerina-governed-identity.md` (Option 5/8 identity binding) · `permission-capability-actor-model.md` (`ctx.actor.tenantId`)
- `galerina-contract-privacy-observability.md` (`redact()`/`seal()`, SealTaint, SPORE-PRIVACY-002)
- `galerina-tmf-engine.md` (KEM-DEM slice 3 DONE, threshold-custody slice 4 NEXT) · `galerina-rd-confidential-compute-cheri-threshold-2026-06-23.md` (`wu3iyjjba`, threshold-custody-v0, Shamir overclaims)
- `galerina-rd-tritmesh-1-5-and-52-3d-2026-06-23.md` (tm-5 `Result.Masked` shaper, BUILD-ALL-SIX) · `galerina-rd-53-azt-selfcert-and-blackhole-protocol-2026-06-23.md` (note-53 ledger: `memory.fill(0)` per-flow not intrusion-triggered, item 2b)
- `galerina-governed-runtime-research-2026-06-03.md` §C (CapTP/macaroon delegation) · `galerina-diagnostic-namespace-ownership.md` (register `SPORE-TENANT-*`)