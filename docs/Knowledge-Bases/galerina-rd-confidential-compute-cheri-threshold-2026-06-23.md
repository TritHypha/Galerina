# Secrets / Data-in-Use Hardening — Three-Concept R&D Synthesis

> **R&D verdict doc.** Critical synthesis of three "data-in-use" secret-protection concepts: **(1) Zero-Friction WASM Enclaves** (confidential computing), **(2) CHERI-Native Galerina** (hardware capabilities), **(3) Mesh-Threshold Secrets** (Shamir M-of-N). Verified against shipped Galerina source and external prior art (STRICT-HONESTY, no rubber-stamp). **Net: all three have a SOUND established core and named OVERCLAIMS; none is new science → defensive-pub or none.** This doc is the **data-in-use / hardware-anchoring** view; read with the sibling **secret-lifecycle** doc [[galerina-rd-ephemeral-secret-ingestion-2026-06-23]] and the **intrusion-destruction** view [[galerina-rd-53-azt-selfcert-and-blackhole-protocol-2026-06-23]] (same date). Date: 2026-06-23. Status: design audit, **no build** (net-new items owner/HW/substrate-gated).

---

## 0. Hub critical verdict per concept (up front)

| Concept | Sound core (KEEP) | Named overclaim / refutation (CUT) | Build status | Paper |
|---|---|---|---|---|
| **1 — WASM Enclaves** | Confidential computing (Nitro/SGX/SEV-SNP/TDX) is the **correct, established** fix for the RAM-scrape / `/proc/pid/mem` / hypervisor-read surface — and it directly complements Galerina's *exported-linear-memory* remanence problem. A **small enclaved secrets/crypto core with attestation gating the KMS fetch** is the honest buildable shape. | "Zero-friction, whole-app, compiler auto-handles vsock" is **OVERCLAIMED**; "Wasm-in-enclave is novel" is **REFUTED** (Enarx, Veracruz already do it); "secret hidden everywhere" is **scope-limited** (only while resident in the TEE). | **HW-gated** (dev/emulated path buildable-now) | defensive-pub |
| **2 — CHERI-Native** | The capability-model **alignment** (manifest caps and CHERI caps are both deny-by-default, monotonically-attenuated) is real; CHERI **hardens the native runtime/host TCB** (Wasmtime + future DSS.wasm host) as defense-in-depth *below* Galerina. | "CHERI-Native Galerina" (Galerina emits/uses CHERI caps) **REFUTES via layer-conflation** — Galerina compiles to WASM, not native ISA; "CHERI protects WASM linear memory" **OVERCLAIMED**; "CHERI enforces SealTaint sub-object bounds" **REFUTED** (SealTaint is compile-time IFC, not a runtime bound; CHERI-inside-one-linear-memory is itself unsolved); Morello is **non-production** (no Arm roadmap). Flagship novelty **REFUTED** (cWAMR / IJNSA 2025 prior art). | **HW-gated** (only the design-note is buildable-now) | defensive-pub / none |
| **3 — Mesh-Threshold** | Shamir M-of-N over GF(2⁸), reconstruct **fail-closed** in the WASM arena, **K3-gated share release** — **SOUND and already half-specified** in Galerina (`threshold-custody-v0.md` Axis B). Math is real and benched. | "Secret-zero exists nowhere on Earth" **OVERCLAIMED** (it exists transiently in the reconstructing node's RAM — Vault's own model); MPC-grade "never assembled" is a **CONFLATION** (Shamir-reconstruct ≠ MPC); "bootstrap recursion eliminated" **REFUTED** (relocated to a hardware-anchored node identity — TPM/SPIFFE); "across the mesh" is **gated** (mesh transport verified-absent, #102-106). | **buildable-now** (crypto); mesh-transport HW/substrate-gated | defensive-pub / none |

**House honesty rules inherited:** no "military-grade / impenetrable / physically ceases to exist." Crypto stays **Binary/digital** (SPORE-SUBSTRATE-001); the in-memory wipe "closes the host-readable remanence window," it is **not** impenetrability. Per the standing posture, **Galerina introduces no new science by design** — confidential computing, CHERI, and Shamir secret-sharing are all ESTABLISHED, so the ceiling is **defensive-pub**.

---

## 1. Claim-by-claim verdict table (all three concepts)

| # | Claim | Verdict | Basis |
|---|---|---|---|
| **E1** | Confidential computing (Nitro/SGX/SEV-SNP/TDX) is the legitimate fix for the RAM-scrape / hypervisor-read surface | **SOUND** | Literal design goal of CC TEEs: enclave RAM encrypted/isolated from root + hypervisor. Matches Galerina's own documented surface (`wat-emitter.ts`: module **EXPORTS** its linear memory → host-readable remanence). |
| **E2** | "Zero-friction, whole-app, compiler auto-handles vsock" — honest pattern is a SMALL enclaved secrets/crypto core | **SOUND (intuition confirmed)** | Nitro = no network/no disk/vsock-only; SGX ecall/ocall ≈ 8,000–17,000 cycles vs ~100–150 for a syscall (50–113×). The whole governed server (network admission, disk, telemetry) is a *bad* enclave payload; a small seal/crypto/KMS core is a *good* one. |
| **E3** | "Whole-app unmodified in an enclave" | **NUANCED** | False for *enclave-class* (Nitro/SGX); defensible for *VM-class* CC (SEV-SNP/TDX/CCA lift-and-shift). But a CVM has a normal network stack → there is no vsock to "auto-handle," and you trade the small-TCB story for a large attested measurement. |
| **E4** | "Wasm-in-enclave + attestation" is novel | **REFUTED (prior art)** | **Enarx** (Bytecode Alliance) runs Wasm in a "Keep" on SGX/SEV-SNP with attestation; **Veracruz** (CCC) runs special-purpose Wasm in a TEE. Only un-precedented element = running Galerina governance/SealTaint *inside* the TCB (integration, not invention). |
| **E5** | "Compiler auto-handles vsock" | **OVERCLAIMED** | vsock plumbing, KMS proxy on the parent, attestation round-trip, PCR pinning are **host/orchestration** concerns. Compiler can emit a *payload + attestation manifest*; it cannot "auto-handle" enclave transport. |
| **E6** | "Secret hidden from root and hypervisor" | **SOUND but scope-limited** | True *while resident in the TEE*. Does not protect the secret once it leaves over vsock/network, nor against a malicious in-enclave payload (SGX side-channel caveats). |
| **C1** | Manifest caps and CHERI caps share a capability-model shape (deny-by-default, monotonic narrowing) | **SOUND (design analogy)** | Both are capability systems with deny-by-default + monotonic attenuation. Galerina fuse gate (`fuse-loader.ts` `buildCapabilityImports`) is deny-by-default; a cap a package didn't declare gets *no host import*. |
| **C2** | "CHERI-Native Galerina" — Galerina emits CHERI capability instructions so its caps ARE hardware caps | **REFUTED (layer-conflation)** | Galerina compiles to **WASM**, not native ISA. Caps live in a signed `.lmanifest` enforced by the *host's* import-object (TS on Node). No Galerina→CHERI codegen path; WASM has no CHERI-cap type. |
| **C3** | CHERI protects WASM linear memory | **OVERCLAIMED** | WASM linear memory is *already* software bounds-checked. CHERI's value = hardening the *runtime's own native pointers/TCB* and removing 20–220% software-bounds-check overhead — it hardens the host that enforces the bound, it doesn't add a missing bound. |
| **C4** | CHERI gives sub-object / SealTaint protection *inside one* WASM linear-memory buffer | **REFUTED as buildable; research-only as a question** | "Data can overwrite adjacent objects … a fundamental limitation of the single linear-memory model." Per-object caps inside one linear memory need MSWasm handles / WasmGC — open research. And SealTaint is **compile-time IFC**, not a runtime bound — CHERI categorically cannot enforce it. |
| **C5** | CHERI adds defense-in-depth to the runtime/host TCB (Wasmtime + future DSS.wasm host) | **SOUND — the real value** | A CHERI build traps host-side UAF/OOB at the ISA instead of letting it escape the WASM sandbox. cWAMR (Verifoxx/DSbD 2025) demonstrates exactly this. Below Galerina, complementary. |
| **C6** | ARM Morello / CHERI is production hardware | **REFUTED** | Arm: Morello is "early stage of research … no roadmap … no plan to include in any current or future Arm products." CHERI-RISC-V spec pre-1.0 (v0.9.5, Mar 2025). Research-grade. |
| **C7** | This is flagship-paper novel | **REFUTED** | "Capability-native WASM in CHERI-sealed compartments on Morello" is already published: cWAMR + *Trust Without Exposure* (IJNSA v17n4, 2025). |
| **T1** | Shatter secret-zero into N Shamir shares; M-of-N to reconstruct; removes single-KMS SPOF | **SOUND** | Shamir 1979 (k-of-n; k−1 shares reveal info-theoretically nothing). This is HashiCorp Vault's default unseal model (Shamir-split master key, threshold of shards). |
| **T2** | "Secret-zero exists nowhere on Earth" | **OVERCLAIMED** | `SSS.combine` reconstructs `f(0)` in **one place** → full secret transiently exists in the reconstructing node's RAM (identical to Vault's reconstructed-root-key-in-memory). Honest claim: nowhere **at rest**, transiently in a single hardened arena **at use**. |
| **T3** | Implicit MPC framing ("secret never assembled") | **CONFLATION** | Shamir-reconstruct ≠ MPC. MPC computes on shares and never reconstructs in one place; secret sharing is the primitive *beneath* MPC. But you must reconstruct to *use* secret-zero as a real key, so the design correctly wants Shamir — and must **not** market it as MPC. |
| **T4** | "Bootstrap recursion (need a key to get a key) is eliminated" | **REFUTED** | To gather M shares the node must authenticate to M peers, needing a node-identity credential anchored on TPM / cloud instance-identity / SPIFFE-SPIRE. SPIRE: "identity is derived from attestation, not distributed as a secret." Recursion **relocated to attestation**, not removed. |
| **T5** | "K3 admission gates the share release" | **SOUND & idiomatic** | `threshold-custody-v0.md` Axis A/B encode the quorum as a K3 decision (`≥k → allow; <k → deny; status-unknown → deny`, fail-closed `collapse(0)=deny`). Reuses shipped `three-valued-governance.ts` + revocation registry. |
| **T6** | "Across the Any-Sync / TritMesh peers" (mesh distribution + reconstruction) | **OVERCLAIMED today / gated** | Shamir math real and benched (`bench/threshold-custody.mjs` 11/11). But Any-Sync mesh cascade is verified-absent (NET-NEW), gated on in-WASM isolation #102-106. The spec itself declines to pin the channel: "pins the *sharing*, not the delivery channel." |

---

## 2. Hardware-anchoring vs hardware-agnostic — RECOMMENDATION

The three concepts split cleanly on whether they need special silicon:

| Path | Anchor | Protection ceiling | Deployable where | Verdict |
|---|---|---|---|---|
| **Hardware-agnostic crypto-mesh** (Concept 3 + the shipped never-write / write-only / SealTaint / KMS-anchor lane) | KMS/Vault + Shamir shares + TPM/SPIFFE node-identity | Secret at-rest (sharded) + at-use (single hardened arena, transient) | **Everywhere** (commodity HW) | **BUILD FIRST — the default.** |
| **Confidential-compute enclave** (Concept 1) | Nitro/SGX/SEV-SNP/TDX attestation | **Strongest** — live RAM hidden from root + hypervisor | Cloud CC instances only; I/O-constrained | **Maximum-security deployment PROFILE, not the default.** |
| **CHERI** (Concept 2) | CHERI/Morello ISA capabilities | Host-TCB memory-safety hardening (below Galerina) | Research silicon only | **Research-grade design-note.** |

### RECOMMENDATION (hub)

1. **Hardware-AGNOSTIC FIRST.** The never-write / write-only / SealTaint-confined / fail-closed-KMS-fetch lane (already ~75% shipped, see [[galerina-rd-ephemeral-secret-ingestion-2026-06-23]]) **plus the Shamir-threshold path** (Concept 3) is **buildable now on commodity hardware** and keeps Galerina **deployable everywhere**. This is the spine. Threshold M-of-N (`threshold-custody-v0` Axis B) bolts onto it directly: split secret-zero, K3-gate share release, reconstruct fail-closed in the per-flow arena (reuse the shipped B2 zero-on-exit).
2. **Enclave = a maximum-security deployment PROFILE, not the default.** Spec it as an opt-in `wasm-enclave-core` build that compiles **only** the `handlesSecrets` flows + crypto primitives into a small enclaved core, with attestation gating the KMS fetch. Mark it HW-gated; ship a *software/emulated* shim first so the flow is CI-testable. For the "whole-app unmodified" ambition, the honest answer is *operations, not compiler*: run the normal `wasm-standalone` build inside a confidential VM (SEV-SNP/TDX) — which Galerina **already documents** as a *reporting/planning* direction (`hardware-feature-detection-and-security.md` §3: "Recommended confidential runtime: AMD SEV-SNP / Intel TDX," fail-closed if unavailable). No compiler work needed.
3. **CHERI = a 1–2 page design-note only.** Frame it as "compile the *native runtime* for a CHERI target so a host-side memory-safety 0-day traps in hardware" — defense-in-depth *beneath* Galerina. Do **not** map SealTaint to CHERI sub-object bounds (category error). The capability-alignment note largely restates what `galerina-memory-safety-model.md` ("CHERI inapplicable / inspiration only / software analogue = MSWasm handles") and `galerina-deterministic-runtime-containment.md` already say — net-new content is small.

**Why agnostic-first:** the enclave gives the *strongest* RAM protection but is HW-gated, I/O-constrained (vsock-only, syscall-forbidden), and cloud-locked. Making it the default would break "deployable everywhere." The crypto-mesh path achieves at-rest SPOF-removal + a bounded at-use exposure window on *any* hardware, and the enclave can later wrap the *same* small secrets core as a profile upgrade — they compose, they don't compete.

---

## 3. Revocation — poll vs push (the answer: BOTH, lease-authoritative)

**Question:** when a key/secret is revoked mid-use, how does a node holding a live secret learn it must wipe?

**Answer: BOTH channels, but the AUTHORITATIVE control is a bounded LEASE/TTL that fail-closes.**

- **Lease/TTL is authoritative (the fail-safe).** Each fetched secret carries a bounded lease. If the node cannot **re-confirm with the KMS/anchor within the lease**, it **zero-wipes the secret** (reuse the shipped vault `.fill(0)` on evict, `rotation-manager.ts`). A dropped or missed push must **never** leave a revoked secret live — so liveness is gated on positive renewal, not on receiving a revocation message. This is the **short-lived-credential pattern**: Vault leases, SPIFFE SVID TTL.
- **Push webhook = low-latency optimization.** A revocation push collapses the window from "up to one lease" to "near-immediate" — but it is **best-effort**, never the sole control (a forgeable/missed push must not be load-bearing; verify any cascade signal under the shipped revocation/trust-anchor registry, per the AZT "forgeable cascade = DoS amplifier" caution).
- **Poll/renewal = the fail-safe backstop.** Periodic re-confirmation is what makes a dropped push safe: worst-case exposure is bounded by the lease, not unbounded.

**Tie to shipped Galerina:** the **revocation registry is already enforced** — `governance/revocations.json` + `revocation-registry.mjs` (`isKeyRevoked`) is wired fail-closed into `fuse-loader` / `package-resolver` / `bridge-attestation`, anchored on `governance/trust-anchor.json`. That covers the **signing identity** (which code may run) at admission time. The **net-new** piece is the **lease/TTL on the application secret** and **mid-stream revocation** of a *live* secret — which is the existing **TRACK item: intrusion-triggered arena wipe / wire `memory.fill(0)` to a live runtime −1 DENY**, currently **substrate-gated (#102-106)** because the deterministic wipe fires at per-flow entry/exit, not on a mid-execution −1. Lease-expiry-driven wipe is the *buildable-now, commodity-HW* approximation of mid-stream revocation: it does not need substrate isolation, only a renewal loop + the already-shipped zero-wipe.

---

## 4. Buildable-now vs HW-gated vs research-only

**buildable-now (no special hardware):**
- **Threshold Axis B (Concept 3):** Shamir M-of-N split + K3 fail-closed reconstruction on a single node — math real, benched (`threshold-custody.mjs` 11/11), spec'd. Production wiring sits behind the Trust-Capsule policy-resolution + vetted-signing-lib gate (same as the rest of tmf).
- **Lease/TTL revocation** on application secrets + lease-expiry zero-wipe (renewal loop + shipped `.fill(0)`).
- **Enclave dev/emulated path (Concept 1):** the partitioning pass (compile only `handlesSecrets` flows into a core), attestation-manifest emission, and a *software* enclave shim with a mock attestation doc — CI-testable on commodity hardware.
- **CHERI design-note + capability-alignment write-up (Concept 2)** — nothing runs on CHERI; it's documentation.
- **The whole agnostic spine** (never-write / write-only rotation / SealTaint / fail-closed KMS fetch) — already ~75% shipped per [[galerina-rd-ephemeral-secret-ingestion-2026-06-23]].

**HW-gated (real hardware required for the guarantee):**
- **Enclave confidentiality (Concept 1):** real PCRs, real KMS attestation policy (`RecipientAttestation:ImageSha384`/`:PCR`), key encrypted to the in-enclave public key — needs Nitro/SGX/SEV-SNP/TDX.
- **CHERI runtime hardening (Concept 2):** real CHERI hardening of Wasmtime / the DSS.wasm host, or CHERI-sealed compartments — needs Morello / CHERI-RISC-V (prototype-only).
- **Confidential-VM "whole-app unmodified":** SEV-SNP/TDX CVM — but this is an *ops recipe* needing **no compiler work** (already a reporting direction in `hardware-feature-detection-and-security.md`).

**substrate-gated (#102-106) / research-only:**
- **Mesh transport (Concept 3):** Any-Sync share distribution/cascade + authenticated multi-fetch + reconstruction in an *isolated* WASM arena — verified-absent, gated on in-WASM isolation (DSS / Smart-Core / Wasmtime-TCB).
- **Live intrusion-triggered mid-stream wipe** wired to a runtime −1 DENY (substrate-gated; lease-expiry wipe is the buildable approximation).
- **Sub-object / SealTaint-grade protection inside one WASM linear memory via CHERI** — unsolved in the literature; realistic path is MSWasm handles / WasmGC, not CHERI.
- **CHERI as a production deployment target** — no Arm roadmap.

---

## 5. Paper verdict

**All three: defensive-pub at most (Concept 2 and 3 lean toward none).** Every primitive is established and in production — confidential computing + Wasm-in-enclave (Enarx, Veracruz, AWS KMS attestation); CHERI capability safety (cWAMR, IJNSA 2025); Shamir 1979 + Vault Shamir-unseal + SPIFFE/SPIRE attestation. Per the standing Galerina posture (**no new crypto / no new science → defensive-pub or none; flagship papers only for measured negatives**):
- **Concept 1:** the only mildly novel angle — *running Galerina governance/SealTaint inside the attested TCB so the policy engine is itself attested* — warrants a short **defensive publication** to establish prior use. A measured-negative ("whole-kernel-in-enclave is untenable on vsock/transition cost, confirming the small-core pattern") could strengthen it but is not flagship.
- **Concept 2:** **defensive-pub / none.** The capability-alignment note is elegant but largely restates existing KB docs; the flagship angle is killed by cWAMR/IJNSA 2025.
- **Concept 3:** **defensive-pub / none.** Only the engineering composition ("K3-gated Shamir share-release wired to mesh-peer node-identity in a fail-closed governed runtime") is arguably novel — a defensive pub for freedom-to-operate, not a research paper. No measured negative ⇒ even the "papers-only-for-measured-negatives" lane is not triggered.

---

## 6. Already-shipped vs net-new (consolidated)

**ALREADY-SHIPPED (cite, do not rebuild):**
- **Threshold Axis B spec** — `threshold-custody-v0.md` (Shamir SSS over GF(2⁸), fail-closed, K3-gated, "no invented crypto," lattice-threshold explicitly OUT); benched `threshold-custody.mjs` 11/11.
- **Capability admission** — `fuse-loader.ts` `buildCapabilityImports` / `BUILTIN_CAPABILITY_REGISTRY`, deny-by-default closed import object.
- **SealTaint + never-write + arena zero-on-exit + diskless fail-closed rotation** — per [[galerina-rd-ephemeral-secret-ingestion-2026-06-23]].
- **Revocation registry, enforced** — `governance/revocations.json` + `revocation-registry.mjs` `isKeyRevoked`, fail-closed in fuse-loader/package-resolver/bridge-attestation; anchored on `trust-anchor.json` (covers **signing identity**, not secret-zero).
- **Confidential-VM reporting direction** — `hardware-feature-detection-and-security.md` §3 (SEV-SNP/TDX recommended, fail-closed if unavailable).
- **CHERI already correctly classified** — `galerina-memory-safety-model.md` ("inapplicable / inspiration only / software analogue = MSWasm handles") + `galerina-deterministic-runtime-containment.md` (DRCM `policy{}` = software CHERI-monotonicity analogue).

**NET-NEW:**
- **Lease/TTL on application secrets + lease-expiry zero-wipe** (buildable-now; renewal loop + shipped `.fill(0)`) — the commodity-HW approximation of mid-stream revocation.
- **`wasm-enclave-core` build profile** — partitioning pass over the flow graph (only `handlesSecrets` flows + crypto) + attestation-manifest emission + software shim (buildable-now); HW attestation HW-gated. New `galerina-host-enclave` package owns vsock/KMS proxy + measurement verification (host/ops, not compiler).
- **Threshold production wiring** — share distribution to mesh peers + authenticated multi-fetch + reconstruct-in-isolated-arena (mesh transport substrate-gated #102-106).
- **CHERI design-note** (documentation only).

**MUST NOT BUILD / claim:**
- "Compiler auto-handles vsock" / "zero-friction whole-app enclave" (E5/E2 overclaim) — vsock/KMS-proxy/PCR-pinning are host/ops concerns.
- "Galerina emits/uses CHERI capabilities" (C2 layer-conflation) — Galerina targets WASM.
- "SealTaint enforced by CHERI sub-object bounds" (C4 category error).
- "Secret-zero exists nowhere on Earth" / MPC-grade "never assembled" / "bootstrap recursion eliminated" (T2/T3/T4 overclaims) — secret-zero exists transiently in one RAM at use; recursion is relocated to a hardware-anchored node identity.

---

## Sources

**Concept 1 (enclaves):** Enarx ([intro](https://enarx.dev/docs/technical/introduction), [Wasm+CC](https://enarx.dev/resources/2022-02-05-fosdem-wasm-cc)) · Veracruz ([repo](https://github.com/veracruz-project/veracruz)) · AWS Nitro Enclaves ([concepts](https://docs.aws.amazon.com/enclaves/latest/user/nitro-enclave-concepts.html), [KMS attestation](https://docs.aws.amazon.com/kms/latest/developerguide/how-nitro-enclaves.html)) · SGX transition cost ([HotCalls ISCA'17](https://www.ofirweisse.com/ISCA17_Ofir_Weisse.pdf), [Gramine perf](https://gramine.readthedocs.io/en/latest/performance.html)) · CVM lift-and-shift ([SIGMETRICS'25 CVM Explained](https://dse.in.tum.de/wp-content/uploads/2024/11/sigmetrics25summer-CVM-Explained.pdf)).

**Concept 2 (CHERI):** Arm Morello (non-production: [Arm](https://www.arm.com/architecture/cpu/morello), [Cambridge CTSRD](https://www.cl.cam.ac.uk/research/security/ctsrd/cheri/cheri-morello.html)) · CHERI-RISC-V v0.9.5 (pre-1.0) · cWAMR ([Verifoxx](https://www.verifoxx.com/post/verifoxx-publishes-its-first-white-paper-on-cwamr-a-breakthrough-in-secure-webassembly-execution)) + [Trust Without Exposure (IJNSA v17n4 2025)](https://aircconline.com/abstract/ijnsa/v17n4/17425ijnsa04.html) · WASM single-linear-memory limit + bounds overhead ([WebAssembly Security](https://webassembly.org/docs/security/), [Leaps and Bounds IISWC'22](https://tom-spink.com/papers/iiswc22leaps.pdf), [MSWasm](https://www.andrew.cmu.edu/user/bparno/papers/mswasm.pdf)).

**Concept 3 (threshold):** Shamir, *How to Share a Secret*, CACM 1979 · HashiCorp Vault [seal/unseal](https://developer.hashicorp.com/vault/docs/concepts/seal) (Shamir-split root key) · [Secret sharing vs MPC](https://www.partisia.com/blog/secret-sharing-and-multi-party-computation-key-to-secure-data-collaboration) · SPIFFE/SPIRE [node attestation](https://spiffe.io/docs/latest/spire-about/spire-concepts/) ("identity derived from attestation, not distributed as a secret").

**Galerina load-bearing files:** `packages-galerina/galerina-core-compiler/src/wat-emitter.ts` (target enum = only `wasm-standalone`/`wasm-hybrid`, line 188; B2/B2b secret zero-on-exit) · `packages-galerina/galerina-framework-app-kernel/src/fuse-loader.ts` (deny-by-default capability admission; Phase A shared-memory note) · `packages-galerina/galerina-ext-tmf/spec/threshold-custody-v0.md` (Axis B Shamir SSS, fail-closed, K3-gated) · `governance/revocations.json` + `revocation-registry.mjs` (enforced revocation) · `packages-galerina/galerina-core/docs/hardware-feature-detection-and-security.md` (§3 SEV-SNP/TDX reporting direction).

**Cross-refs:** [[galerina-rd-ephemeral-secret-ingestion-2026-06-23]] (secret-lifecycle view, never-write lane) · [[galerina-rd-53-azt-selfcert-and-blackhole-protocol-2026-06-23]] (intrusion-destruction view) · [[galerina-key-custody-and-rotation]] · [[galerina-memory-safety-model]] · [[galerina-deterministic-runtime-containment]] · [[galerina-quantum-resistance-posture]].