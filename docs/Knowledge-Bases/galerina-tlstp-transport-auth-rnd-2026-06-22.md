# Galerina — TLSTP Transport + Zero-Trust Auth: R&D Decision-Support (2026-06-22)

**What this is.** A grounded decision-support analysis of the owner's two R&D notes — `notes/41-tritmesh`
(single-WASM monolith + govern-don't-absorb data architecture) and `notes/42-auth` (the "TriLogic Secure
Transport Protocol / TLSTP" series: Docs 001 transport+identity, 002 legacy-auth threat model, 003 defensive
primitives, 004 HTTPS/TLS-1.3 autopsy). These notes ARE the owner's R&D behind the **OWNER-LOCKED B8 HTTP
transport** ([[feedback-http-transport-owner-locked]]), so this document is **decision-support only — no code, and
it does not propose building B8**. Main-session build work (BLD-003 etc.) is paused per the owner.

**Method.** 18-agent grounding workflow (`wi3py3913`): 8 decision-cluster grounders, each adversarially
re-verified against live Galerina source/KB (crypto-on-core violations, "already-shipped" overclaims, re-derive
risk), then a synthesis + a completeness critic that re-read both notes and re-checked load-bearing citations in
the repo. The critic's three corrections (SPORE-ENTROPY-002 is doc-only not enforced; `authority-model.md` anchor is
:326-328 not :108-147; five missed ideas) are folded in below.

---

## Headline

- **~75-85% of the notes RE-DERIVE already-shipped or already-decided Galerina architecture.** The TLSTP framing
  ("separate the crypto math you must not invent from the transport state machine you may invent") is literally
  Galerina's own **crypto-on-core invariant** (`architecture-charter.md:147-150, 192-196`). Adopt as an organizing
  principle; cite the shipped rails, do **not** rebuild them.
- **Three hard tensions** the owner must resolve consciously:
  1. The notes repeatedly fold **analog/photonic entropy into cryptographic key material** (the "Ternary Ephemeral
     Ratchet" `K_{n+1}=KDF(K_n, E_ternary)`). **Hard crypto-on-core violation — refute outright.** It is also
     internally broken (analog is non-reproducible across endpoints).
  2. A **continuous floating-point trust score** (`T_c`) as the authorization gate **conflicts with discrete
     fail-closed K3** (unknown→DENY). Safe only as *degrade-only telemetry* discretized into a trit via `vAnd`.
  3. "**Single-WASM monolith / in-sandbox TLS termination = mathematical security**" is half-decided
     (main-app-as-WASM is R&D 0052) and half-**aspirational** (the isolation guarantee rests on DRCM/DSS.wasm — a
     115-byte ~0% stub, blocked on #102-106 + Stage-B P9.4). Do not claim it as settled isolation yet.
- **Crypto stays Binary everywhere. Photonics/analog may feed ONLY a K3 governance/availability verdict (via
  `vAnd`, degrade-only) — never a key, KDF, cipher, or signature byte.**

---

## Decisions for the owner

| # | Decision | Recommendation | Why (grounded) |
|---|---|---|---|
| D1 | **Ternary Ephemeral Ratchet** — fold `E_ternary` physical entropy into the per-packet KDF | **REJECT `E_ternary` in the KDF.** Forward secrecy = digital one-way ratchet + key erasure. If physical entropy is wanted, condition it through SP 800-90B/90A into a Binary CSPRNG, **outside** the cipher. | Hard crypto-on-core violation (`charter:192-196`; `SPORE-SUBSTRATE-001` enforced at `substrate-model.ts:257,311` `CRYPTO_ON_NOISY_LANE='error'`). Internally broken: analog is non-reproducible (emulator `deterministic=false`, `ENOB_CEILING=8`) → endpoints derive different keys. Shipped substitutes: SHAKE256 key-erasure chain (`tmf-history-chain-v0.md §2`), hybrid X25519+ML-KEM-768 (`kemdem.ts:143-150`). |
| D2 | **Dynamic Trust Mesh** — continuous float `T_c = w₁F + w₂I − w₃N` as the per-packet gate | **Float in telemetry, trit in the gate.** Discretize `T_c` → trit, feed via `vAnd` (degrade-only); final boundary stays discrete K3, unknown→DENY. Weights static/declared; a failed AEAD tag is a hard −1, never a "low score." | A float gate reintroduces the indeterminate-as-allow risk K3 exists to forbid + is non-deterministic. No-Coercion theorem `e=vAnd(t*,r)≤t*` (`substrate-model.ts`) guarantees telemetry can only DEGRADE, never coerce 0→+1. `three-valued-governance.ts:40-44`. |
| D3 | **Photonic/optical state** (φ, θ, sub-ns timing, path-fingerprint `[D,Δτ,t]`) as an auth/identity factor | **Demote to a degrade-only K3 trust/tamper signal** bound *under* the digital Ed25519+ML-DSA-65 signature (`cnf` sender-constraint, RFC 8747, defense-in-depth, never sole). Identity stays Binary. | `charter:147-150,169` forbid a photonic crypto path; tier is ~≤10-bit non-deterministic. Lane-C research (`rd-photonic-lane-c-optical-puf.md §3.2`): noisy linear optical PUFs are poly-time PAC-learnable → "silicon can't emit θ" is too strong. Capsule §9 already scopes optical-PUF as a `cnf` row under the digital sig. Optical front-end = aspirational-HW; governance resolver buildable today vs the emulator. |
| D4 | **K3 three-valued cert/channel-validation gate** (cert_verdict ∈ {+1/0/−1}, revocation-unknown→DENY) over a library-validated chain | **BUILD as a standalone governance pass, sequenced inside the owner's B8 work.** Reuses shipped `decideAtBoundary`; crypto stays digital; does NOT re-implement ASN.1/path-building. | re-R&D 0002 concluded buildable net-new; spec in `rd-photonic-ternary-in-tls.md §4`. Confirmed UNBUILT (`cert_verdict` = 1 KB-doc hit, 0 in `packages-galerina`). Hardens the revocation soft-fail hole (unknown→deny). The narrowest, cleanest in-bounds extraction. |
| D5 | **Single-WASM monolith + in-sandbox TLS termination** as "mathematical security" | **Keep the decided main-app-as-WASM + packages-outside model (R&D 0052).** Deployment stance is decided; the in-sandbox-isolation GUARANTEE is aspirational-HW — do NOT claim it as settled until #102-106 land. | `galerina-build-output-and-env-secrets.md:92-94` explicitly "NOT a single monolith." The isolation rests on DRCM/DSS.wasm (115-byte stub, "Design proposal"). Kernel anti-middleware pipeline + one-time fail-closed admission ARE shipped — cite that half. |
| D6 | **E2EE key custody for cold blobs** — embed the key in the governed `.tmf` so authorized users auto-get it (note 41:260) | **Do NOT embed a usable key in the `.tmf`.** Use the decided split custody; the `.tmf` may carry only a KEM-wrapped key whose unwrap is gated by capability + vault-held private key. | A cleartext key in a widely-replicated metadata plane is a secret-handling violation. [[galerina-key-custody-rotation-decision]] already answers this: long-lived keys live in `galerina-ext-secrets-vault`, never in the `.tmf`/contract. The `.tmf` carries no capability grant — authorization is the `.lmanifest` `fuse{}` block + K3 gate. |
| D7 | **Macaroon-style attenuating caveat chain** on the Governed Trust Capsule (offline P2P delegation) | **Adopt attenuation-only (shrink-never-widen) ON the existing Capsule spec — but only if/when offline P2P delegation is a real product need.** Do not mint a new token format. | `governed-trust-capsule-v0.md §6` already specs macaroon-style caveats (Birgisson NDSS 2014), reuses SHAKE256. Tension: it is a deliberate departure from per-flow-declared authority (`authority-model.md:326-328` "Authority never propagates implicitly"). Shrink-only is Monotonic-Security-Rule-safe; the owner must consciously bless the departure. Spec'd, not wired (slice 5 / #12). |
| D8 | **Legacy-client interop** — sandboxed in-core legacy TLS-1.3 endpoint vs dedicated `any-sync-bridge` proxy | **Prefer a dedicated bridge/proxy** for legacy interop over an in-core legacy endpoint. | A legacy endpoint widens the in-core attack surface against the shipped no-downgrade floor; a proxy keeps legacy parsing outside the governed core. Net-new either way (owner-locked B8). |
| D9 | **Morphing Transport Frames** — obfuscation on-by-default vs opt-in capability | **Opt-in `transport.obfuscate` (deny-by-default).** Frame sizing MUST derive from the digital AEAD/KDF stream; a morphed frame must REPLACE (never accompany) any cleartext routing tag. Classify as metadata-confidentiality/availability, not payload confidentiality. | Consistent with `fuse-loader.ts:435-455` deny-by-default capability gating. PRNG off the AEAD keystream is digital (crypto-on-core OK). Accompanying a cleartext tag re-opens `SPORE-PRIVACY-002`. Resists size/boundary analysis but NOT timing/volume — say so. Perf claims need a named-machine bench. |
| D10 | **Noise Protocol / WireGuard handshake-pattern borrowing** for downgrade negotiation (note 42 §5; *critic-surfaced, was uncaptured*) | **Decision-support: adopt the Noise explicit-handshake-pattern concept for the B8 downgrade-negotiation mechanism** (net-new, transport-side, owner-locked). | Grep confirms ZERO Noise/WireGuard references in repo. The notes repeatedly propose Noise's "mathematically prove key state at every step" for downgrade negotiation; the shipped `DEFAULT_TLS_POLICY` is the *declarative* floor, but the handshake mechanism is genuinely unbuilt. |
| D11 | **`.tmf` search/index** — own metadata index vs external search cluster (note 41:212; *critic-surfaced*) | **Index the metadata in-core; never index the blob.** Pairs with govern-don't-absorb. Heavy text/semantic search → external cluster, kept off the governance trit and under SealTaint at egress. | Consistent with the govern-don't-absorb split + the refutation of balanced-ternary "semantic clustering" (similarity is an ANN/vector concern, not a K3-trit concern). |
| D12 | **Blob hashing responsibility** — edge-client-on-upload vs async governed flow (note 41:144; *critic-surfaced*) | **Re-verify any client-computed hash in a governed flow** (client-computed hash is untrusted input); the async-governed-flow path is the govern-don't-absorb-consistent default. | Security implication: a client-asserted hash must never be trusted as-is. |
| D13 | **Capsule internal contradiction** (must-fix before slice 5/#12) | **Reconcile `governed-trust-capsule-v0.md` §2 (sign Sig_structure directly, RFC 9964, no pre-hash) vs §8 step 4 (`M = SHA-256(CBOR(Sig_structure))`).** Pick one; the §8 pre-hash looks like pre-RFC-9964 leftover. | Confirmed by direct read (§2:63-67 vs §8:147). A genuine crypto-spec defect; changes no current verdict but must be settled before the capsule reader is implemented. |

---

## Net-new, in-bounds, buildable (today's substrate)

1. **K3 cert/channel-validation gate** (D4) — highest-value, lowest-risk; reuses `decideAtBoundary`, crypto digital. Sequence FIRST inside B8.
2. **Degrade-only physical-deviation → "TamperTrust" Verdict resolver** — wraps shipped `effectiveVerdict=vAnd` + `verifyToleranceUnderNoise` + `decideAtBoundary` so a measured optical/path deviation can only push K3 toward DENY; governance side buildable vs the emulator, optical front-end aspirational-HW; owner-gated.
3. **Continuous trust TELEMETRY stream** (`T_c` float) into the existing blind-observability exporter — structure-not-data, threshold→trit; weights static; never enters a KDF; failed AEAD tag = hard −1.
4. **Asymmetric (DH/KEM-rekeying) ephemeral ratchet** for full forward secrecy — builds on shipped hybrid X25519+ML-KEM-768; explicitly out-of-scope in `tmf-history-chain` v0; transport-side, owner-locked B8 + enc-rnd domain.
5. **Mid-compute capability revocation orchestration** (R&D 0015) — primitives exist (`decideAtBoundary` + `TowerRuntime.evict` + `tpl-simulator.erase`, V_DPM monotonic `SPORE-MONO-001`); only the orchestration is unbuilt; strip the float, gate stays K3.
6. **Replace the kernel auth presence-stub with a real verdict** — `kernel.ts:307` today is pure header-presence (`mode==='required' && no Authorization → 401`), zero token/sig/claim verification; adjacent to #212; honest narrow in-core gap.
7. **Digital FEC / erasure-coding over OPAQUE AEAD ciphertext** — the only sound residue of "ternary symbol repair"; authenticate-then-repair (sits UNDER the AEAD); no novelty/semantic/analog claim; perf needs a bench.
8. **Recovering transport FSM state layered ABOVE K3** — reuse the K3 trit, add ONE transport FSM state (deny all data effects while held; time out to −1/Erase, never silently to +1); do NOT mint a parallel +1/0/−1.
9. **Tree-walker-into-WASM reconciliation** (note 41:18-37; *critic-surfaced*) — compile the Galerina tree-walker INTO the monolith so secure/effectful flows (not lowerable to WASM, #125) run sandboxed from the host OS. Invariant-clean (no analog in crypto). NET-NEW tied to #125 + DRCM; the most concrete forward-design idea in note 41.
10. **Edge-client chunk + E2EE-encrypt + CID upload pipeline** (note 41:221-229; *critic-surfaced*) — content-address blobs by CID into cold store; sound, aligns with content-addressed identity; distinct from `.lmanifest` content-addressing.

---

## Conflicts / refuted

- **REFUTED (hard crypto-on-core):** Ternary Ephemeral Ratchet folding analog `E_ternary` into the KDF (D1).
- **CONFLICTS:** continuous float `T_c` as the authorization gate (D2) — collides with discrete fail-closed K3 + determinism.
- **CONFLICTS:** tri-state transport session minting a PARALLEL +1/0/−1 with "holding" semantics ≠ the governance trit — the confusing-alias the charter Architectural-Stability rule forbids (K3 0=INDETERMINATE is fail-closed-neutral, NOT "holding"). Reuse K3, layer a Recovering FSM above it.
- **REFUTED:** "+1/0/−1 == ALLOW/INDETERMINATE/DENY" — endpoints align but the MIDDLE does not (K3 0 collapses to deny; note's 0=Recovering is a live wait).
- **CONFLICTS/REFUTED (two grounds):** "Ternary Symbol Repair / request only the missing entropy / delta-matrix on the wire" — (a) AEAD/MAC fail closed on a single bit, ciphertext isn't analog-repairable; (b) re-opens the killed cleartext-semantic-routing leak (vec2text ~92%, `SPORE-PRIVACY-002`). Only sound residue = digital FEC over opaque ciphertext.
- **REFUTED:** balanced-ternary "spatial/semantic clustering" of `.tmf` via a "tower-discrete-engine" 3D graph — conflates the K3 Kleene lattice with continuous vector geometry (the recurring quantum/continuous category error); "tower-discrete-engine" has zero repo references (invented; real components are `galerina-tower-citizen` + `galerina-ext-photonic-emulator`).
- **REFUTED (framing):** "single-WASM monolith = mathematical security" as settled; "abolish ALL CAs" as a crypto primitive (Galerina governs OVER a library-validated chain via pinned keys — no-CA pinned-key admission IS shipped, but "abolish all CAs" is a deployment stance); physical optical state as an unspoofable auth factor (PAC-learnable).

---

## Crypto-on-core violations (the hard list — keep out of any build prompt)

1. **HARD (refute):** Ternary Ephemeral Ratchet `K_{n+1}=KDF(K_n, E_ternary)` (note 42 Doc003 §4) — analog entropy into the per-packet key. Forbidden (`charter:192-196`; `SPORE-SUBSTRATE-001` enforced). Doubly broken (non-reproducible). Lawful: SP 800-90B/90A → Binary CSPRNG outside the cipher.
2. **VIOLATION (as-written):** Photonic φ/θ/timing/path-fingerprint as a cryptographic auth factor or key-binder (Doc001 §4 / Doc003 §3B). ≤10-bit non-deterministic can't be an auth factor; PAC-learnable. Lawful: degrade-only K3 signal under the digital sig.
3. **VIOLATION-IF-IMPLEMENTED:** continuous noise term `N` / float `T_c` entering crypto or authorizing above a threshold. Float informs, K3 decides, unknown→DENY.
4. **VIOLATION-IF-IMPLEMENTED:** "Ternary Symbol Repair" on ciphertext symbols. AEAD/MAC fail closed on one bit. Only safe as digital FEC that never touches a key/AEAD bit.
5. **SECRET-HANDLING (not photonic):** embedding a usable cleartext E2EE key in the `.tmf` (note 41:260). Use vault custody + KEM-wrapped key.
6. **OVERCLAIM-as-guarantee:** "hardware-level zero-wipe" — on the TS/GC core, zeroization is best-effort (`kemdem.ts:185`); true HW erasure is aspirational-HW (#102-106). Don't assert as a guaranteed primitive.
7. **CATEGORY-ERROR:** balanced-ternary similarity using K3 trits as a vector space — keep similarity off the trit, under SealTaint at egress.

---

## Already shipped (re-derive — cite, do NOT rebuild)

- **Content-addressed signed admission / self-sovereign identity (Node ID = H(PubKey), no CA)** — `fuse-loader.ts` Gate-1 sha256 pin, Gate-2 detached Ed25519 verify against a pinned keyId (no X.509 path-building), Gate-2b revocation; `registry-index.ts` B5a signed allow-list. (ML-DSA-65 hybrid #34 pending.)
- **Deny-by-default capability model** — `fuse-loader.ts` Gate-3 (`SPORE-FUSE-UNKNOWN-CAP`); `capability-types.ts` bit positions, known caps, banned wildcard roots. Defeats bearer-token-possession at the package boundary.
- **Conjunctive K3 admission gate (the real "token tree" primitive)** — `three-valued-governance.ts` allOf/anyOf (empty=INDETERMINATE) + `decideAtBoundary` (INDETERMINATE→deny, `SPORE-GOV-3VL-001`). The 4-node tree is presentation over the shipped conjunctive gate.
- **Attested hardware tier (NOT self-asserted)** — `rd-hardware-tier-directive`: resolved once at admission behind `verifyAttestation`; `!attested ⇒ binary floor + K3 DENY` (`SPORE-HW-004`). Closes the note's self-asserted hardware fail-open.
- **Anti-downgrade / no-plaintext TLS floor (declarative)** — `core-network` `DEFAULT_TLS_POLICY` (TLS1.3, `allowDowngrade:false`, `allowPlaintextFallback:false`, `denySelfSignedInProduction`) + `validateTlsPolicy`. (Enforcing it during a live handshake = the net-new B8 piece.)
- **SSRF/metadata-endpoint defense + verify-before-parse** — `egress-guard.ts` (169.254.169.254 deny, URL-credentials SSRF deny); `wasm-runtime.ts verifyWasm` performs NO instantiation. (Galerina admits signed manifests, doesn't parse SAML XML — XSW critique valid-but-moot.)
- **Trust-anchor pinning / rollback / freshness / duplicate-refusal** — `registry-index.ts verifyRegistryIndex` fail-closed at every step; `revocation-registry.mjs` + `revocations.json` wired into fuse-loader/resolver/bridge-attestation.
- **JWT-attack class eliminated by design** — `governed-trust-capsule-v0.md §4` closed alg registry (verifier never dispatches on token alg; `alg=none` not in registry), deterministic CBOR canon, AND-hybrid downgrade fails closed. (DECIDED, slice 5/#12.)
- **Symmetric key-erasure ratchet (the safe half of the "Ternary Ratchet")** — `tmf-history-chain-v0.md §2` SHAKE256 MK/CK chain with mandatory secure delete; golden-vectored, frozen.
- **Hybrid PQ KEM confidentiality** — `kemdem.ts` X25519+ML-KEM-768 → SHAKE256 → AES-256-GCM, committing-AAD, fail-closed, zeroize-in-finally. "No photonic crypto."
- **Hybrid PQ signatures (Ed25519+ML-DSA-65)** across proof-graph/audit/bridge-attestation with FIPS-204 domain-separation + v2-reject downgrade hardening. (Remaining gate = production key custody #149, not algorithm.)
- **Vault key-custody split** — [[galerina-key-custody-rotation-decision]]: rotation executes in `galerina-ext-secrets-vault`, `onRotationFault=halt`, "never serves a stale key."
- **Degrade-not-drop fail-closed substrate model** — `substrate-model.ts` `effectiveVerdict=vAnd`, exact binomial NMR tail, No-Coercion theorem. Cite this rather than inventing recovery math.
- **AOT compile-time elision** — R&D 0036: const-fold + branch-fold + DCE, 1.64×, byte-identical over 50k inputs. (Correction: AOT #1 const-fold `dc76ed4` AND AOT #2 branch-fold/DCE `056ac70` are BOTH shipped; AOT #3 trap-tail simplify is next.)
- **Flat SoA AST (DOD)** — 2.22×, Int32Array. (As a DB-engine principle it's moot — the DB engine doesn't exist; `galerina-data-*` are README+package.json only, no `src/`.)
- **Arena allocator / monotone-bump memory** — `wat-emitter.ts` B1 arena ceiling, B2 per-flow heap reset + secret-zeroing (R&D 0055); B3 generation-tag deferred.
- **govern-don't-absorb storage split + `.tmf`-as-passport** — standing invariant (SealTaint `SPORE-PRIVACY-002`). **Correction to the note:** the capability GRANT lives in the signed `.lmanifest` `fuse{}` block, NOT the `.tmf` (the `.tmf` is integrity/confidentiality only, no capability grant).
- **Selective disclosure of token claims** — `governed-trust-capsule-v0.md §7` (TMX-256 tree + inclusion proof). DECIDED, slice 5/#12.
- **Kernel anti-middleware request pipeline + one-time fail-closed admission** — `kernel.ts` fixed non-bypassable pipeline; idempotency gate fail-closed (store-error→409, backstops 0-RTT replay). (Auth step is presence-only — see net-new #6.)

---

## HW-gated / aspirational (not on the timeline; needs substrate that doesn't exist)

- **In-sandbox TLS termination / WASM linear-memory isolation at the network boundary** — DRCM/DSS.wasm, 115-byte ~0% stub, "Design proposal," blocked on #102-106 + Stage-B P9.4. Deployment stance decided; isolation GUARANTEE aspirational.
- **Photonic auth / path-fingerprinting front-end** (φ/θ/timing/`[D,Δτ,t]` measurement) — needs photonic silicon; emulator is "model, not silicon," `deterministic=false`, `ENOB_CEILING=8`. Governance resolver buildable today; optical sensing aspirational. Any sub-ns claim needs a named device or a labelled-aspirational envelope.
- **"tower-continuous-engine" / "tower-discrete-engine"** measuring φ/θ/t — zero repo references (author's coinage); real components are `galerina-tower-citizen` + `galerina-ext-photonic-emulator`.
- **Zero-copy / ring-buffer IPC across trust boundaries as a security property** — gated on the WASM Component Model (#102-104); today admitted symbiotes are first-party-trusted co-resident. Intra-module zero-copy is free; cross-trust-boundary isolation is aspirational.
- **Batched-WASI host-boundary byte-mover shim** — designed in R&D 0058 (byte-I/O in a thin Rust shim below the verdict) but design-only / substrate-blocked (#102-106).
- **Admitting an UNTRUSTED P2P peer's `tritmesh.wasm`** — signing/admission half ships; running an untrusted peer needs #102-104 isolation. Phase A is first-party-trusted-only.
- **Any-Sync / P2P mesh as the live peer/node-address layer** (CID routing, Spaces, sharding) — zero first-party implementation; KB/vision only (the real social-ecosystem build is a telemetry sidecar). Content-addressed IDENTITY ships; the live P2P TRANSPORT/directory is the missing substrate the addressing notes assume.
- **Hardware-grade cold-boot-proof zero-wipe** — on TS/GC, best-effort only (`kemdem.ts:185`); true erasure = aspirational-HW.
- **ML-DSA-65 hybrid signing finalization (#34)** over the `.lmanifest`/`.tmf` root — Ed25519 live; the ML-DSA half pending (production key custody #149 is the gate). Not HW-gated but not-yet-complete.

---

## B8 / HTTP transport guidance (the centerpiece — DECISION-SUPPORT, not a build order)

**DO NOT build B8 / `galerina-framework-api-server` — it is owner-locked and these notes ARE the owner's R&D for it.**

1. **Termination model.** Decided deployment = main-app-as-WASM + packages outside (R&D 0052), NOT a single
   monolith. "TLS terminates inside the WASM sandbox" is a SOUND DIRECTION but its security GUARANTEE rests on
   DRCM/DSS.wasm (115-byte ~0% stub) — do not claim in-sandbox termination as settled isolation until #102-106.
   The shipped, citable half is the kernel anti-middleware pipeline + one-time fail-closed admission.
2. **WASI-socket vs raw-bytes.** Already decided in R&D 0058: **raw byte-arrays moved by a thin host shim BELOW
   the verdict, NOT WASI sockets** (verifyWasm verifies before any host fn links; fuse-loader network.inbound is
   accept-side deny-by-default, `__net_in_accept` returns −1, no outbound). Treat SHIM-not-WASI as DECIDED; the
   byte-mover ring-buffer it presumes is #102-106-gated.
3. **TCP vs UDP/QUIC.** `NetworkProtocol` already enumerates tcp/udp/websocket; `isUnsafeNetworkBackend` flags
   dpdk/xdp+elevated-privileges. QUIC/UDP + 0-RTT is legitimate net-new, but 0-RTT MUST be idempotent/replay-
   protected — the kernel idempotency gate (store-error→409) is the shipped backstop. Latency claims need a bench.
4. **Legacy interop.** Prefer a dedicated `any-sync-bridge`/proxy over an in-core legacy TLS-1.3 endpoint (keeps
   legacy parsing outside the governed core; doesn't widen the no-downgrade floor). Net-new either way.
5. **Morphing default.** Opt-in `transport.obfuscate` (deny-by-default). Frame sizing MUST derive from the digital
   AEAD/KDF stream; a morphed frame must REPLACE any cleartext routing tag (else re-opens `SPORE-PRIVACY-002`).
   Metadata-confidentiality/availability, not payload confidentiality; resists size/boundary not timing/volume.
6. **Identity on the wire.** Bind the SHIPPED content-addressed signed identity (fuse-loader Gates 1/2/2b +
   registry-index) to the live handshake — that binding is the net-new B8 piece. SNI leakage → use the DECIDED
   **ECH + Oblivious HTTP (RFC 9458)** pattern; do NOT invent a bespoke Galerina mechanism.
7. **Downgrade negotiation.** Borrow the **Noise/WireGuard explicit-handshake-pattern** (D10) — net-new, the
   shipped `DEFAULT_TLS_POLICY` is only the declarative floor.
8. **Sequence FIRST:** the **K3 cert-validation gate** (D4) — highest-value, lowest-risk, crypto-stays-digital.

Across all of B8: crypto/KDF/cipher/signature stay **Binary**; photonics/analog may feed ONLY a K3
governance/availability verdict via `vAnd` (degrade-only), never a key byte. Surface these as explicit owner
decisions ([[feedback-owner-gated-means-ask]] — owner-gated means ASK, don't park).

---

## Corrections recorded (so the owner doesn't build on bad anchors)

- **`SPORE-ENTROPY-002` is DECIDED/doc-only, not enforced** — zero `.ts` occurrences (lives in
  `galerina-qrng-entropy-capability-design.md`). The Ratchet refutation (D1) survives on the *enforced*
  `SPORE-SUBSTRATE-001` (`substrate-model.ts:257,311`) + non-reproducibility grounds.
- **`authority-model.md` anchor** for "Authority never propagates implicitly" is **:326-328**, not :108-147.
- **Capsule §2-vs-§8 pre-hash contradiction is REAL** (confirmed by direct read) — must-fix before slice 5/#12 (D13).
- Load-bearing citations re-verified live by the critic: `kernel.ts:307` auth = presence-only; `dss-supervisor.wasm`
  = exactly 115 bytes; `substrate-model.ts:257,311` `CRYPTO_ON_NOISY_LANE='error'`; `three-valued-governance.ts:41-75`;
  `core-network/src/index.ts:116-122`; `egress-guard.ts` metadata/SSRF; `kemdem.ts:185` best-effort zeroize.

---

*Sources: `notes/41-tritmesh`, `notes/42-auth`. Workflow `wi3py3913` (18 agents, adversarially verified +
completeness-critiqued). R&D only — no code written; B8 remains owner-locked; main-session build work paused.*
