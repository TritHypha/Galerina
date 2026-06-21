# LogicN — Build Roadmap

**Version:** 7.0 (2026-06-06)  
**Last updated:** 2026-06-06 — P9 self-hosting: flow-body emission real (small modules execute via real wabt); **CORRECTION — the lexer module does NOT yet wabt-assemble** (undefined stdlib fns; see §16) + Governed-Tower hardening shipped; graph 2924 nodes / 3673 edges; **44/44 packages · 4,128 tests · 0 fail**; audit:security 31 files / 0 findings; 18 CBOR manifests canonical; governance:diff NEUTRAL (no authority widening); r6 Stage-A parity green

---

## 🧭 2026-06-22 — R&D 0059–0064 triaged → proposed tasks #201–#210

Six R&D done-reports (0059 formal proof structure · 0060 TS7/Go-rewrite · 0061 compiler R&D · 0062 3rd-party
package architecture · 0063 AI chain-of-attack · 0064 signed-package graph) triaged + ground-truthed against
live source (3-agent verify workflow). Full analysis, the 0063→packages map, the 14-item tracked-vs-net-new
gap-check, and the proposed task table in
**[logicn-rd-0059-0064-triage-2026-06-22.md](logicn-rd-0059-0064-triage-2026-06-22.md)**.

**Net:** 0059 is mostly already absorbed (fault-tolerance doc); the supply-chain/package items are net-new.
**Convergent #1 (0062 ∧ 0063):** least-privilege minimality is **partially shipped** — `LLN-EFFECT-002
OVERDECLARED_EFFECT` already detects declare-without-use but only as a **warning** and is **absent from
Stage-B** → the delta is escalate-to-fail-closed-error + port (proposed **#201**). Other net-new: transitive
mask-⊆ proof (**#202**), full contract digest (**#203**), signed-package audit graph (**#204**), Kleene-lattice
type+governance unify (**#205**, the 0061 headline), package-standard profile + verified tier (**#206**),
idempotency annotation (**#207**), per-cap egress binding (**#208**), key-custody name-check (**#209**),
TS7 host build (**#210**). Owner-gated steers to surface: #201 (breaking-in-prod), #205 (architecture),
#210 (toolchain). Design-only; no production code changed by the triage.

---

## 🛡 2026-06-21 — core-network INBOUND guard + rate limiter (ranked priority "core-network guards")

`logicn-core-network` validated the inbound policy but had **no runtime enforcement** (like egress before
`egress-guard`). New `src/inbound-guard.ts` (fail-closed, deny-by-default): `guardInboundRequest` (port/protocol
admission — explicit DENY wins, else ALLOW rule, else `defaultEffect`; bad port refused), a deterministic
fixed-window `RateLimiter` (clock injected; an **unparseable limit fails CLOSED**), `parseRateLimit`,
`rateLimitKey`. +7 tests + prove-own-maths (`prove-inbound-guard.mjs` 6/6: the fixed-window invariant holds
over 100k fuzzed requests, admission is total + deny-by-default over 20k fuzz). Committed `f4d4bc3`. Suite **53/53 · 4924**.

**Photonic-HARDWARE switch (ranked priority "switchable package; keep digital, add a photonic-hardware switch") —
`3138cfa`:** `logicn-ext-photonic-emulator/src/photonic-switch.ts` — `selectPhotonicBackend({mode, hardware})`
picks among `PhotonicBackend` impls behind the existing seam. **FAIL-CLOSED + KEEP-DIGITAL:** default = emulator
(software); real silicon admitted ONLY when present ∧ `nativeAvailable` ∧ `attested` (else fall back to the
emulator with `LLN_PHOTONIC_*` codes — never an unverified PIC); the switch only picks the photonic *compute*
backend (crypto/K3/control stay on the digital core). The runtime seam for the PPU-virtualisation ladder
(Rung 2 emulator today → Rung 3+ attested silicon). +7 tests + prove-own-maths (exhaustive 15-row truth table 3/3).

**Ranked-priority status reconciliation (2026-06-21, verified against source — roadmap was stale):**
**#165** f64 WAT lowering ✅ DONE · **#180** manifest signing ✅ DONE (this session's signing-format hardening +
RFC-8785/#67/fail-secure profile) · **#194** GateCache ✅ DONE (`gate-cache.ts`) — **deliberately UNWIRED** (re-verified 2026-06-21): `compilePolicy` is ~56ns branchless, so a content-hash cache is net-NEGATIVE; it stays an opt-in utility for future *expensive* evaluators (`hybrid-engine.ts:310-312`). NOT dead code — do **not** re-flag it as the "GateCache anti-pattern"; that earlier framing was inaccurate. · **#128(b)** for-in WASM
lowering ✅ DONE (`forEachStmt` lowers to a counted `__array_length`/`__array_get` loop; `wat-forin-execution`
test green) · **core-network guards** ✅ (egress SSRF/DNS-rebind + inbound guard) · **CLI build/verify/deploy** ✅
(build signing #180 · verify fail-closed + unsigned-policy · run signature+revocation · **deploy `ec3d610`** now
enforces LOGICN_PROFILE=production by default — build signs, verify enforces; the pre-existing broken
health-check step fixed via `--governed`). Genuinely-open + non-gated:
the self-hosted **Stage-B pipeline** (#102 dss→wasm), the photonic **-hybrid tier package** + certified-mode
admission, and **0055 B3** (generation tag, deferred — pervasive layout change). **#149/#34/.tmf-4** owner-gated.

## 🌅 2026-06-20 — Photonic emulator package (R&D 0053 GAP) BUILT — `logicn-ext-photonic-emulator`

**New package `packages-logicn/logicn-ext-photonic-emulator`** (peer to `logicn-ext-bridge-cpp`/`-quantum`),
the hub-side production build of the R&D 0053 GAP (the owner-greenlit photonic virtualisation). Depends ONLY
on the neutral `@logicn/inference-bridge-contract` (relative-dist convention, offline); **production /
tower-citizen left byte-unchanged**. Ports the prove-own-maths D1 emulator (18/18) + D2 router (25/25) into
real TS and re-proves them against the package's own compiled code.

- **D1 emulator** (`emulator.ts`): noise-carrying MZI/micro-ring ternary MAC — per-element phase-drift gain
  noise, photodiode shot+thermal readout noise, finite-ADC quantization, N-modular voting, the WDM
  row-stochastic crosstalk coupler, the substrate-math closed forms. Converges to exact in the high-SNR
  limit; MC variance == `σ_phase²·Σa² + σ_readout²`; precision wall at the ~8-bit ENOB knee; WDM
  energy-conserving.
- **D2 router** (`partition-decider.ts`): absolute-ns `Tdigital`/`Tphotonic`/`crossover`, `requiredRedundancy()`
  from D1's variance, `PartitionDecider.decide()` — default digital, photonic only on a proven win, **0
  slowdowns over n=1..4096 × N∈{1,3,9,25}**, crypto/control-flow gated off (crypto-on-core), fail-closed.
- **Bridge + re-verify + runtime** (`photonic-bridge.ts`/`freivalds.ts`/`runner.ts`):
  `PhotonicEmulatorBridge implements InferenceBridge` with a `determinismMode:"tolerance"` manifest that
  passes the shipped `validateManifestShape` only when fully pinned + witnessed; honest
  `executedNatively/deterministic = false` (so `assertDeterminism` correctly throws on it); `PhotonicRuntime`
  demonstrates decide → exec → Freivalds/tolerance re-verify → **fall back to digital** on out-of-tolerance.
- **Verify:** `npm test` (25 node:test cases) + `npm run prove` (10/10, exit 0). The root runner discovers it
  via smart-dispatch against the prebuilt `dist/` (offline; no npm/tsc needed at run time).
- ✅ **DONE 2026-06-20 (the Tower-side dispatch wiring):** the photonic path in `hybrid-engine.ts` now
  routes via the decider + re-verifies via Freivalds/tolerance *instead of* the bit-exact ternary
  `assertDeterminism` oracle — additive + opt-in + off-by-default. See the dedicated section below.
- **EXCLUDED (HW-gated):** any measured photonic speedup (ns are aspirational Meech-anchored envelopes); the
  real PIC noise floor / coupler S-params. No speedup claimed without a named PIC.

R&D bridge: hub-built 0053 production; R&D task **0054** (hardware-capability directive + per-tier packages)
spec has since LANDED → built below.

---

## 🌅 2026-06-20 — Tri-Pipe hardware() directive + tier loader (R&D 0054) BUILT — `logicn-hardware-tier`

**New package `packages-logicn/logicn-hardware-tier`** — the hub-side production of R&D 0054 (the
owner-directed Tri-Pipe topology), built once the enc-rnd worker's spec landed
(`tri-pipe-per-tier-packages-and-hardware-directive-spec.md`). Neutral (depends only on
`@logicn/inference-bridge-contract` + `@logicn/ext-photonic-emulator`, relative-dist); **no production
edits**. Realizes the owner's *"passive directive — what hardware is available {binary|hybrid|photonic},
cache it; packages per tier; clearly photonic if not hybrid if not binary."*

- **`hardware()` directive** (`hardware-directive.ts`): cached, deployment-stable, **ATTESTED** — resolves
  the tier from the bridge manifest's `hardwareIdentity` behind a verifyAttestation result (injected; the
  package stays crypto-free and binds the **bridge** surface, not audit), **never** the gameable
  `nativeAvailable` self-claim. Fail-closed: UNKNOWN/UNATTESTED ⇒ binary (K3→DENY, LLN-HW-004). Tier MAP
  mirrors `HARDWARE_TRUST_PROFILES` (`type-registry.ts:455-505`).
- **Tier loader** (`tier-loader.ts`): selects the `BridgeRegistry` by cached tier with the
  photonic > hybrid > binary fall-through; binary is the unconditional floor; injected via
  `createHybridEngine({ bridges })` — **no Tower edit**.
- **Two orthogonal axes:** AXIS-1 (this directive) picks the *package*; AXIS-2 (0053 `route()`) gates the
  *per-kernel* offload. Preference never forces compute onto photonics — **worst case == binary == today.**
  Honest nuance (§4): whole components converge to **`-hybrid`** (crypto/control always present);
  `-photonic` is a true package only for fully-eligible pure-tensor components.
- **Verify:** `npm test` (14 node:test) + `npm run prove` (9/9 — H1–H5 directive + O1–O4 orthogonality;
  O1 sweeps 12,288 tier×kernel products, 0 over Tdigital). Discharges the spec's §1.4/§5 obligations
  against the production code.
- **EXCLUDED (HW-gated):** real-PIC packaging / measured photonic latency; quantum tier (separate path).

R&D bridge: **0053 + 0054 both now have hub production** (`logicn-ext-photonic-emulator` +
`logicn-hardware-tier`). The R&D-side companion proof scripts the spec flagged "to author" are discharged
in spirit by the hub's `prove-hardware-tier.mjs` against production code.

---

## 🛡️ 2026-06-20 — core-network SSRF / outbound-egress guard BUILT — `logicn-core-network`

**Verified gap closed:** `logicn-core-network` was policy-VALIDATION only (a declared `NetworkPolicy` shape
checker) — it had **no runtime egress guard / SSRF protection / host-IP classification**. Added a new
`src/egress-guard.ts` module (**additive** — the existing validation path is byte-unchanged; +59 tests, the
12 original contract tests intact).

- **`classifyHost(host)`** → IANA special-purpose category (`loopback`/`private`/`linkLocal`/`uniqueLocal`/
  `cgnat`/`metadata`/`multicast`/`unspecified`/`reserved`/`broadcast`/`public`/`invalid`) for IPv4, IPv6
  (incl. IPv4-mapped `::ffff:…`), and hostnames. **Normalizes the numeric-IP SSRF bypasses** that defeat
  naive string checks — decimal (`2130706433`), hex (`0x7f000001`), octal (`0177.0.0.1`), inet_aton short
  forms (`127.1`). The cloud **metadata** endpoint (`169.254.169.254` / `fd00:ec2::254` /
  `metadata.google.internal`) is caught through **every** encoding.
- **`guardOutboundHost` / `guardOutboundUrl` / `validateWebhookTarget`** — fail-closed, deny-by-default:
  only a public host passes; metadata needs its OWN explicit opt-in (not covered by `allowNonPublicHosts`);
  plaintext/non-https schemes, embedded URL credentials (userinfo — parser-confusion SSRF), and unparseable
  URLs are denied; an exact `allowedHosts` allow-list permits specific internal receivers. Hostnames carry
  `requiresDnsRecheck` (the caller MUST re-classify each resolved IP — DNS-rebinding defence). Webhooks force
  the strict posture regardless of caller relaxations. Diagnostic codes `LogicN_NETWORK_SSRF_*` /
  `LogicN_NETWORK_EGRESS_*`.
- **Verify:** `npm test` (71 node:test) + `npm run prove` (8/8 — 2,200 IANA-range samples 0-leak, exact
  172.16/12 CIDR edges, numeric-bypass equivalence, **20k-input fuzz: 0 throws / 0 leaks**, fail-closed URL
  layer). Full suite green: 52/52 packages.
- **Follow-up (DNS-rebinding + declarative egress):** `guardResolvedAddresses(host, resolvedIps, policy)`
  is the connect-time DNS-rebinding defence — re-classify EVERY resolved address and deny if any is
  non-public (`LogicN_NETWORK_SSRF_DNS_REBIND_DENIED`; fail-closed on empty resolution), the actual
  enforcement for the `requiresDnsRecheck` flag. `NetworkPolicy` now carries an optional
  `egress?: EgressPolicy` that `validateNetworkPolicy` flags for dangerous posture
  (`allowMetadataEndpoint`/`allowUrlCredentials`/`allowNonPublicHosts`/plaintext-`http`; additive — a
  policy without `egress` is unaffected). 81 node:test (was 71) + `npm run prove` 10/10 (P6: 5,000 mixed
  resolutions, 0 rebinding leaks / 0 false denies).

---

## 🔌 2026-06-20 — Photonic Tower-side dispatch wiring BUILT (the switch goes live in the engine)

**The photonic backend is now selectable inside the real `HybridInferenceEngine`** — closing the loop
on iterations 1–2 (the emulator + the directive/loader were standalone). Edit to
`logicn-tower-citizen/src/hybrid-engine.ts` is **additive, opt-in, OFF BY DEFAULT** (a new
`photonic?: PhotonicConfig` on `createHybridEngine`; default `null` ⇒ `dispatchPlan` is byte-identical
to before — the 188 existing tower tests are unchanged).

- **How it works:** for a ternary op, `dispatchPlan` consults the injected `PhotonicOffloadPort` FIRST.
  A non-null result has ALREADY passed the port's tolerance re-verify, so it is accepted **without** the
  bit-exact `assertDeterminism` oracle (the analog lane is tolerance-verified, not bit-exact). A `null`
  result (ineligible / no net win / out-of-tolerance / any uncertainty) **falls through to the unchanged
  digital dispatch**. Fail-closed; **NEVER consulted in certified mode** (the dev emulator is an unattested
  tolerance backend). The Tower stays decoupled — the port is duck-typed; `@logicn/ext-photonic-emulator`
  ships the adapter `createPhotonicRouterPort()`.
- **Two axes now compose end-to-end:** `hardware()`/loader (AXIS-1) picks the package; this per-op
  net-win router (AXIS-2) decides whether to actually offload — preference never forces photonics.
- **Verify:** tower-citizen **194/194** (was 188; +6 `photonic-dispatch.test.mjs`: default-unchanged,
  net-win→photonic, no-win→digital, decline→digital, hit→commits-photonic-value, receipt-shape-stable);
  photonic **29/29** (+4 `router-port.test.mjs`). Full suite green: 52/52 packages.
- ✅ **certified-mode photonic admission — DONE 2026-06-21 (`7a58a26`):** `PhotonicConfig.certifiedAttestation`
  admits the photonic lane in certified mode iff verified (attested ∧ certificationProfile="certified" ∧
  toleranceWitnessed) — fail-closed, default-off (byte-unchanged for deployments without it), keep-digital.
  Composes with the photonic-hardware switch's attestation gate. +4 tower-citizen tests. **STILL OPEN:** a real
  per-op kernel-size source (Stage A demo ops are n=16, so `kernelFor` is deployment-supplied).

---

## 🎯 2026-06-20 — Tri-Pipe capstone BUILT — `logicn-tri-pipe` (the switch in one call)

**New package `packages-logicn/logicn-tri-pipe`** — the composition/application layer that ties the whole
photonic line into a single deployment call. `createTriPipeEngine(opts)` resolves the `hardware()` tier and
returns a governed `HybridInferenceEngine` configured for it. It is the **one package allowed to depend on
the Tower runtime** (composes `@logicn/hardware-tier` + `@logicn/ext-photonic-emulator` +
`@logicn/tower-citizen`, relative-dist).

- **Selection:** `binary` (cpu/wasm, or unknown/unattested) ⇒ digital stub, photonic offload **off**;
  `hybrid` (gpu/npu, whole components) / `photonic` (attested photonic + fully eligible) ⇒ digital core +
  photonic offload **on** for net-win eligible kernels. The capability tier is the *preference* (AXIS-1);
  the 0053 per-kernel router (AXIS-2) still gates each actual offload — preference never forces photonics.
  **Fail-closed:** unknown/unattested ⇒ binary ⇒ no offload ⇒ identical to today.
- **Verify:** `npm test` (7 node:test, end-to-end through the real engine: binary→stub,
  hybrid/photonic→photonic-emulator, fail-closed unattested/unknown→binary, per-kernel gating still
  applies) + `npm run prove` (3/3 — S1 tier==hardware() over 68 inputs, S2 offload-IFF-offload-capable-tier,
  S3 fail-closed). Full suite green: 53/53 packages.

**The photonic line is now COMPLETE + demonstrable end-to-end:** emulator (0053) → directive/loader (0054)
→ Tower dispatch wiring → this one-call capstone. Digital stays the default and byte-unchanged throughout.

**Added 2026-06-20 — the LogicN Execution Router** (`tri-pipe/src/execution-router.ts`): `createExecutionRouter()`
unifies the three routing axes into ONE `ExecutionDecision` — AXIS-1 capability tier (`hardware()`), AXIS-2
precision technique (`routePrecision`), AXIS-3 per-kernel offload (`PartitionDecider`). It COMPOSES the
proven routers (no re-derived maths). **Photonic IFF** offload-capable tier ∧ ternary precision ∧ the
net-win router says photonic; everything else (binary tier / non-ternary / crypto / uncertainty) ⇒ digital,
fail-closed. +7 node:test incl. a property sweep proving the conjunction. (There was no component literally
named "Execution Router" before; routing was spread across three packages — this is the single front door.)

**Added 2026-06-20 — the Bifurcated Execution Invariant, made checkable** (`logicn-ext-photonic-emulator/src/parity-conformance.ts`):
`checkParity(op)` / `proveBifurcatedParity(corpus)` enforce semantic parity between a `-binary` and a
`-photonic` impl as TWO relations — (1) DECISION parity (discrete, must be identical: both tiers admit or
both fail-closed — never admit what the other rejects) + (2) NUMERIC parity (continuous: photonic within
the declared `substrate{tolerance}` of the exact binary value). The conformance gate: a `-photonic` package
is admissible iff `allConformant`; the max residual is the band to record in the manifest `ToleranceWitness`.
+6 node:test (valid→conformant, corrupt→both-reject, NOISY-lane→inadmissible, corpus gate pass/fail). This is
the build-time half of the parity enforcement (the runtime half is the per-call Freivalds/tolerance re-verify).

---

## 🛡️ 2026-06-20 — Zero-trust adversarial audit of the session + fixes (41-agent workflow)

An adversarial security audit (`Workflow weeli9elq`, 41 agents, each finding independently refuted-or-confirmed)
over the session's 9 commits returned **24 confirmed** findings (false positives filtered).

**FIXED (the session-introduced gaps + clean pre-existing fail-opens):**
- 🔴 **CRITICAL SSRF** (`core-network/egress-guard.ts`): hex IPv4-mapped IPv6 (`::ffff:a9fe:a9fe` = the
  cloud-metadata endpoint) classified **public**, and `new URL()` canonicalizes the *dotted* form to *hex*
  before the classifier — so the webhook/egress guard **allowed cloud-metadata/loopback/private**. The
  author test only hit `classifyHost` directly, never the URL path. Fixed: rewrote `classifyIpv6` with a full
  `expandIpv6` (8-hextet expansion, `::` + zone-id + dotted-tail), embedded-v4 decode for **all** forms
  (mapped/compat/translated/NAT64/6to4), and a **fail-closed default** (malformed/low-range → non-public).
  +16 regression tests exercising **both** `classifyHost` and `validateWebhookTarget`/`guardOutboundUrl`/
  `guardResolvedAddresses` through the URL parser.
- 🟠 photonic re-verify **tolerance clamp** (`runner.ts`): a caller's `kernel.tolerance` can no longer be
  inflated past the bridge's declared manifest band, so the integrity rail can't be made a no-op.
- 🟡 `hybrid-engine.ts`: **finite-guard** on the injected photonic port's value (non-finite → fall through to
  digital) + a reserved **`photonic:` provenance namespace** so an injected port can never impersonate an
  attested registry bridge (e.g. claim `stub-ternary`) in the audit trail.
- 🟡 `hardware-directive.ts`: strict `attestationVerified === true` (truthy non-boolean no longer coerce-passes
  the tier gate); `partition-decider.ts`: the systematic-floor refusal (LLN-SUBSTRATE-003) can't be skipped by
  supplying `redundancyN`.
- 🟠 `logicn verify`: **fail-OPEN → fail-CLOSED** — a manifest that *claims* a signature but can't be verified
  (crypto error / missing public key) now **denies** instead of warn-and-pass.

All affected suites green (core-network 97, tower-citizen 196, photonic-emulator 35, hardware-tier 14).

**Batch 2 — pre-existing fixes:**
- ✅ **CRITICAL FIXED 2026-06-20 (`fuse-loader.ts` revocation):** the runtime fuse admission gate now refuses a
  validly-signed but REVOKED key (the audited exploit: a forgery signed by the leaked in-repo key `8eecf4…`
  passed because the loader never checked revocation). Added a fail-closed `revocationCheck` to
  `FusePackageOptions` + a `LLN-FUSE-KEY-REVOKED` gate in `loadAndVerifyPackage` (a throwing check ⇒
  `LLN-FUSE-REVOCATION-UNVERIFIABLE`, also fail-closed); the kernel stays node-dep-free and the CLI
  `logicn fuse` injects the real `governance/revocation-registry.mjs` check (`assertRegistryTrustworthy`
  once + per-key `isKeyRevoked`). +1 app-kernel test. app-kernel 58/58.

**STILL OPEN (next):**
- 🟢 **`logicn run` admission gate — FIXED (production-gated signature + revocation):** ✅ the swallowed-error
  fail-open was FIXED first (a present-but-unreadable manifest denies `LLN-MANIFEST-INVALID`). Now, under
  `LOGICN_PROFILE=production`, the run gate also verifies the manifest **signature + revocation** before executing:
  a present manifest that is unsigned/placeholder, has an incomplete signature, is signed by a **REVOKED** key,
  is missing its public key, or whose signature fails to verify is refused (`LLN-MANIFEST-UNSIGNED` /
  `LLN-MANIFEST-REVOKED-KEY` / `LLN-MANIFEST-PUBKEY-MISSING` / `LLN-MANIFEST-TAMPER`); any failure to complete
  the check is itself fail-closed (`LLN-MANIFEST-INVALID`). Rationale: the `sourceHash` check is self-referential
  (an attacker who edits the source AND rewrites `sourceHash` passes it) — only the signature binds the manifest
  to a trusted signer, only the registry catches a revoked key. Dev (default) profile keeps the sourceHash-only
  behaviour byte-for-byte. +1 cli-compatibility test (dev runs → 5050; production with a placeholder manifest →
  `LLN-MANIFEST-UNSIGNED`). **Posture left for owner opt-in:** this is "verify-if-present" — a flow with NO
  manifest still raw-runs in production; the stricter "production requires a signed manifest to run at all" is a
  deliberate posture decision, not built. NB the audit's own refutation still bounds the residual (the governed
  runtime re-derives effects from the sourceHash-bound source; the WASM gate attests over the binary) — this is
  defence-in-depth. Update: the signing-bytes reconstruction is now shared (`manifestSigningInput` /
  `manifestSigCanon`) across the build signer, `verify`, `run`, and the fuse-loader — see the RFC-8785 /
  #67 entry below. A fuller `admitManifest` helper (the surrounding signature+revocation+pubkey orchestration,
  still inlined per-site) remains a tidy-up follow-up.
- 🟢 **unsigned/placeholder manifest accepted by `verify` — FIXED (profile-gated):** under `LOGICN_PROFILE=production`
  a placeholder / absent / incomplete-signature manifest now fails closed with `LLN-MANIFEST-UNSIGNED` (and an
  unreadable signature copy with `LLN-MANIFEST-INVALID`); the default (dev) profile keeps the informational
  behaviour byte-for-byte, so existing usage is unchanged. Mirrors `#178` fail-closed-in-prod. +1 cli-compatibility
  test (placeholder passes in dev, rejected in production).
- 🟢 **RFC-8785 canonical signing + #67 CBOR self-verify — FIXED (owner-directed, versioned):** the CLI now signs
  the manifest over **RFC 8785 canonical JSON** (not pretty-printed `JSON.stringify(.., null, 2)`), tagged
  `governanceSignature.canon: "jcs"`. Because canonical JSON is representation-independent, the signed bytes
  reconstruct identically from EITHER the `.json` or the decoded CBOR — so the **authoritative CBOR is now
  self-verifiable (#67)**: `logicn run` (production) verifies the signature directly off the CBOR it already
  decodes, never consulting the `.json`. VERSIONED per the design-stability charter — the format is named in the
  signature, so older untagged signatures still verify via the `"legacy"` pretty-JSON path (no key rotation,
  fully backward-compatible). One shared `manifestSigningInput(objWithoutSig, canon)` + `manifestSigCanon(sig)`
  in `manifest-generator.ts` is routed through by EVERY signer/verifier (build signer, `verify`, `run`, and the
  app-kernel fuse-loader's self-contained local copy) so they cannot drift; a cross-implementation conformance
  test (sign with core's `canonicalJson`, verify through the loader's local one) guards the duplication. +6
  manifest-generator tests (incl. the #67 invariant: jcs reconstructs identically from CBOR, legacy does not;
  a real Ed25519 jcs sig verifies from both JSON and CBOR), +1 fuse-loader jcs/conformance test, +2
  cli-compatibility (production run REJECTS an unsigned CBOR, ACCEPTS a jcs-signed CBOR end-to-end). Suite
  53/53 · 4907.
- 🟢 **signing-profile fail-secure default — FIXED:** the production signing gates keyed off
  `process.env.LOGICN_PROFILE === "production" ? … : "dev"` — FAIL-OPEN: any value other than the exact string
  (a typo'd `"prod"`, `"PRODUCTION"`, a stray space) silently resolved to dev, **silently disabling every gate
  the signing-format work added**. Now a single fail-secure resolver `governance/profile.mjs`
  (`resolveSigningProfile` / `isProductionProfile` / `resolveSigningProfileWarned`) — mirroring core-config
  `posture.ts` (unknown ⇒ fail-secure) — is routed through by all three reads (build key policy, `verify`,
  `run`). UNSET/empty + recognized dev tokens (`dev`/`test`/`local`/…) relax to dev (zero-touch local dev,
  byte-unchanged); the exact canonical `"production"` resolves strict cleanly; anything else set resolves
  **strict (production) with an `LLN-PROFILE-UNRECOGNIZED` warning** so a malformed value can never quietly
  relax enforcement. +4 governance-step unit tests + 1 cli-compatibility behaviour test (a typo'd profile
  fail-secures and denies an unsigned run; explicit `dev` relaxes). Suite 53/53 · 4908; governance step 22/22.
  **The 2026-06-20 zero-trust audit is now FULLY CLOSED** (2 criticals + all highs + all 🟠/🟡 — only the
  `admitManifest` orchestration tidy-up remains, a non-security refactor).
- ✅ **unknown-`opClass` deny-by-default — FIXED:** `routePrecision` (the precision-lane router used by both the
  hybrid engine and the Execution Router) previously let an UNRECOGNIZED op class fall through to a fabricated
  fp8/ternary decision (every numeric comparison against the `undefined` sensitivity is false). `InferenceOpClass`
  is a compile-time union (erased at runtime) and `opClass` crosses a trust boundary as a plain string, so an
  unknown op is now routed to the **fp16 full-precision floor** — no quantization, no photonic offload — mirroring
  `resolveHardware`'s deny-on-unknown. +1 tower-citizen test (deny-by-default, and a loose tolerance can't coax an
  unknown op into the ternary lane). Suite 53/53 · 4899.

Full audit JSON (24 findings, reasoning + recommendations): `tasks/weeli9elq.output`.

---

## 🔏 2026-06-20 — #180: the authoritative CBOR `.lmanifest` is now really Ed25519-signed (owner-unblocked)

**Verified security gap closed.** `logicn build` (#108 zero-touch signing) signed the manifest with real
Ed25519 — but wrote the signature **only to the human-readable `.lmanifest.json`**; the **authoritative
CBOR `.lmanifest`** (the on-disk artifact DSS.wasm parses / the admission gate reads) was serialized
*before* signing and kept the `placeholder:sha256:…` signature. So the authoritative artifact was
**effectively unsigned** while only the convenience copy was signed (confirmed empirically by decoding the
CBOR).

- **Fix (`logicn.mjs`, build path):** after signing, re-serialize the **signed** manifest into the
  authoritative CBOR (guarded by `verifyManifestRoundTrip`), so the CBOR and JSON agree and the CBOR
  carries the real `{ algorithm:"Ed25519", keyId, signature, signedAt }`. **Backward-compatible:** with no
  signing key the placeholder CBOR stands unchanged (the `generateManifest` default is untouched).
- **Verified:** rebuilt → the CBOR governanceSignature is real Ed25519 (not placeholder), the signature
  **validates** against the signing public key, and a **tampered body is rejected**. Locked by a new
  regression guard in `cli-compatibility.test.mjs` (#180: a signed `.json` with a placeholder CBOR fails).
  Full suite green: 53/53 packages.
- **Scope (per the owner's "Ed25519 half"):** the **ML-DSA-65** half stays held (#34 custody). Signing over
  the **canonical/CBOR bytes** so the CBOR is self-verifiable without the `.json` remains **#67** (today the
  signature is over the pretty-JSON body; verification routes through the `.json`).

---

## 🏁 Phase 1 Security Audit — COMPLETE (2026-06-16)

**The perimeter is sealed.** All **8/8** Critical + High findings from the adversarial Gate-6 audit are
patched and verified; the codebase is in a **fail-closed, deterministic** state. 48/48 packages · 4,481
tests · 0 fail · tsc clean · graph reindexed. Local tag: `audit-phase1-2026-06-16` (unpushed — gated on #149).

**Cleared (8):** VSC-001 (crit taint-escape) · VSC-002 (trap declassifier) · VSC-003 (memberExpr recognizer
bypass) · GOV-001 (K3 `permitted_effects` + strict `conforms_to`) · GOV-003 (member/positional response leak)
· CRYPTO-001 (certified PQ-key mandate) · CRYPTO-002 (Tier-3 hybrid) · CRYPTO-003 (tamper-evidence fields
signed). Enforces K3 governance semantics, plugs taint escapes, strictly resolves `conforms_to` pointers,
and binds the full tamper-evidence set under the signature.

### Parked backlog (deliberate — nothing falls through the cracks)
- **Safe subset** (REDUN-001, GAP-*, STYLE/INFO) — *Deferred.* Kept out of this milestone to preserve a
  pristine, security-only commit history. Staged for the next routine maintenance cycle.
- **GOV-003 residual + audit mediums/lows** (VSC-004/005, GOV-002/004, intermediate-binding dataflow) —
  *Tracked for dedicated R&D.* Deliberate semantic choices (taint semantics, binding-level dataflow) that
  need fresh architectural review to avoid breaking developer ergonomics.
- **CRYPTO-004** (algo-label binding) — *Tracked.* Versioning-sensitive (crypto-format bump per the
  design-stability charter).
- **Owner-gated** (#149 git-history scrub + first clean push · #199 Phase 2 engine landing · enc-rnd bridge
  pings · LLN-DP-* allocation) — *Blocked / Queued.* Awaiting owner-supervised execution.

---

## 🏗️ Phase 2 — `.tmf` engine build (#6) — IN PROGRESS (2026-06-16)

Owner decision: build as a **new LogicN package** (`packages-logicn/logicn-ext-tmf`), engine first.
Specs frozen in `LogicN-R-AND-D/tmf/spec/*`; crypto-on-core (bit-exact, deterministic; SHAKE256 via
`node:crypto`, ML-DSA-65 via `@noble/post-quantum` — no Rust, no photonic crypto).

| Slice | Scope | Status |
|---|---|---|
| 1 | **TMX-256 integrity core** (TriMerkle-XOF/SHAKE256: leaf/node/root, ABSENT, tree shape) | ✅ **DONE** — golden-verified vs frozen spec (9 tests; cross-lang conformant w/ Python ref). 49/49 · 4,490. |
| 2 | **Container reader/writer** (header + 56-byte section table; §6 fail-closed reader) | ✅ **DONE** — byte-exact golden (203 B) + full §7 error taxonomy (10 tests). 49/49 · 4,500. |
| 3 | KEM-DEM confidentiality (hybrid X25519+ML-KEM-768 → **SHAKE256** KDF → AES-256-GCM, §4 committing-AAD + §8.5 CTX/CMT-4, STREAM, verify-before-decrypt) | ✅ **DONE** — `src/kemdem.ts`; deterministic key-schedule/AAD/nonces/CTX golden-verified byte-for-byte (K_aead `9b4fdce2…`, commit_tag `ca22f4f5…`) + real hybrid-KEM/AES-GCM round-trip & all fail-closed tamper cases (14 tests). 49/49 · 4,514. |
| 4 | **#7** ML-DSA-65 signing over the root (hybrid Ed25519), reusing the shipped signer | ⬜ |
| 5 | Inclusion proofs · history chain · **#12** Governed Trust Capsule (RFC 9964) | ⬜ |

Remaining enc-rnd hand-offs gated behind this: #7 (slice 4), #12 (slice 5); #9/#10/#11 (privacy + namespace) and #13 (ffsim landing, needs QB-001) tracked separately.

---

## 🔐 2026-06-16 cycle — security audit · PQ benchmark · R&D adjudication

**Verified:** 48/48 packages · 4,481 tests · 0 fail · graph 3569 nodes / 4005 edges / 1875 files · zero `.td` (migration complete). **ALL original audit criticals + highs cleared (8):** VSC-001 (crit), VSC-002, VSC-003, CRYPTO-001, CRYPTO-002, CRYPTO-003, GOV-001, GOV-003. Residual: GOV-003 intermediate-binding-rename (dataflow follow-up); the audit's 10 medium / 10 low / 6 info remain as backlog.

**Security — adversarial Gate-6 audit (23 confirmed):**
- ✅ **CRYPTO-001 (high) FIXED** (`16145bd`) — certified mode silently permitted a post-quantum downgrade: the construction guard required only the Ed25519 `publicKeyPem`, so `checkBridgeAttestation` admitted bridges on the classical half whenever `mlDsaPublicKey` was unprovisioned. Now throws **`ERR_CERTIFIED_NO_PQ_KEY`**; certified-profile tests migrated to hybrid attestation + a no-downgrade guard test (183/183 tower-citizen).
- ✅ **CRYPTO-002 (medium) FIXED** (`a1d7cee`) — `verifyFfsimAdmission` now requires hybrid by default (Tier-3 toxic border; `ERR_QUANTUM_PQ_REQUIRED`); `requireHybrid` added to `AttestationPolicy` + honored in `checkBridgeAttestation`; `requireHybrid:false` opts down. quantum 21/21.
- ✅ **VSC-001 (CRITICAL) FIXED** (`915b16d`) — taint escape: `isGovernedSink` had diverged from the authoritative `SINK_REQUIREMENTS`, so unsafe/tainted values reached `response.body` / `ai.remoteInference` / `network.outbound` / `log.write` / bare `database.write` / `http(s).get` with **no diagnostic**. `isGovernedSink` now ⊇ `getSinkRequirement()` (single source of truth) + 4 regression tests.
- **Full audit RE-VERIFIED (2026-06-16): 37 raised · 32 confirmed** (raw: `tasks/w6lqlqgck.output`). Closed: VSC-001, CRYPTO-001, CRYPTO-002. **Open HIGH backlog — deliberate, individually-tested (do NOT batch on auto):**
  - ✅ **VSC-002 FIXED** (owner decision A) — `trap` no longer declassifies (was: any identifier *mentioned* in a trap condition had its taint cleared, laundering unsafe values into injection sinks). `trap` is now value-state-neutral; declassification requires an explicit `validate.*`/`sanitize.*`/`redact()` gate. trap-decl tests rewritten to the fail-closed semantics. 48/48 · 4,466.
  - ✅ **VSC-003 FIXED** — secret/network/log/serialization recognizers bailed on any non-identifier receiver, so a memberExpr receiver (`client.http.post`, `ctx.secrets.get`, `obj.log.info`, `app.json.encode`) bypassed every one (LLN-SECRET-002/PRIVACY-002 silently skipped). Added a shared `receiverSegment()` (last dotted-path segment) routed through all four — fail-closed, additive. +3 tests. 48/48 · 4,469.
  - ✅ **GOV-001 FIXED** (`00f387a`, owner-ratified) — `permitted_effects` K3 state machine (omitted=neutral/auto-inherit · empty `{}`=deny-all · populated=allow-listed) + unresolvable `conforms_to` = fatal in production/deterministic (was fail-open). KB §7a. +4 tests. · ✅ **GOV-003 FIXED** (`99f0025`) — denied response fields can't leak via member/positional returns (`collectBodyFieldNames` broadened + redact/seal discharge); **residual ✅ FIXED (2026-06-20):** the intermediate-binding RENAME (`let e = user.email; return e`, incl. alias-of-alias) is now caught — `collectBodyFieldNames` builds a precise alias-carry map (direct field-access / identifier renames only; opaque call results carry nothing → no false positives) + 4 regression tests in `gov003-response-leak.test.mjs`. · ✅ **CRYPTO-003 FIXED** (`f43dbf6`) — `hardwareSeal`/`epilogueReceipt`/`liabilityProfile`/`physicalHardeningTier` now bound under the gov signature (canonical sub-hashes; in-place pre-persistence per the VERSIONING charter).
  - 🔲 **CRYPTO-003** — the governance signature omits several security-relevant ProofGraph fields. **Versioning-sensitive** (crypto-format bump per the design-stability charter — handle deliberately).
  - **+10 medium · 10 low · 6 info** (QB-001 admission-not-structurally-enforced, VSC-004/005, GOV-002/004, CRYPTO-004/005/006, dead-code/style) — full triage list in `tasks/w6lqlqgck.output`.
  - ✅ **Low cleanup done** (`cleanup` commit): DEAD-001 (TamperResponseStrategy → single source of truth for VALID_TAMPER), DEAD-002 (dead `hasNode` removed), DUP-001 (duplicate context extractor consolidated). 🔲 REDUN-001 (LLN_SUBSTRATE_00x const consolidation across substrate-inference/-model) deferred — analogous to DEAD-001 but cross-file diagnostic construction.

**Benchmark — Gate 9 (`8273ad3`):** `crypto-ops` now measures **ML-DSA-65 + hybrid Ed25519+ML-DSA-65**. PQ-tax: hybrid verify ≈ 1.75 ms (~17× Ed25519), sign ≈ 6.7 ms (~84×); sigs/keys ~50× larger. governance-cost unchanged within noise. These rows are an **R4 regression gate** — PQ stays at amortized admission/build boundaries, never the per-decision hot path.

**R&D adjudication:** `notes/35-hashing` (photonic "THA-162" ternary hash) **rejected** — contradicts crypto-on-core (analog optics can't compute a bit-exact hash; security-by-radix is an encoding illusion; IOTA's Curl ternary hash was broken → reverted to binary Keccak). Keep SHA-256; PQ the *signature* (ML-DSA-65, shipping).

**Open CLI/DX (filed):** #125 `logicn run --governed` · ✅ **#126 parser-level bitwise hint** (`2026-06-20`) —
`& | << >>` in expression position now get the clear `LLN-PARSE-001` crypto-on-core hint (matching the lexer's
`^`/`~`), with recovery that suppresses the confusing follow-on. Done in the `parseExpression` binary loop (value
context — so it never flags generic `<<`/`>>` in TYPE position or `|` match-arm patterns, which parse elsewhere).
+5 tests; SOT 3710. **NB:** bitwise ops are *intentionally* NOT LogicN operators (crypto-on-core boundary) — #126 is
the HINT, not the feature.

**Tech debt this cycle:** CRYPTO-002 + 14 unverified findings; `crypto-ops` ML-DSA numbers are pure-JS upper bounds (native binding would re-baseline); governance-cost LogicN-runtime variants need a clean re-measure (old baseline had incomplete fields).

---

## 📍 Current snapshot (2026-06-06)

**Governed Inference Tower hardening (logicn-tower-citizen, 106 tests):**
- `CF-3/CF-7` **bridge attestation** — Ed25519 sign/verify + sha256 manifest & addon-hash pinning; `ERR_BRIDGE_UNATTESTED` fail-closed; `logicn bridge-attest` CLI (keygen/hash/sign).
- **P9 Certified Profile** now mandates signed bridges (`ERR_CERTIFIED_NO_ATTESTATION`), governed egress, and per-call `approved_models`+`max_tokens`+`max_token_cost`.
- **Enforced V_DPM capability gate** — branchless `(required & granted) === required`; `ERR_CAPABILITY_DENIED` before any compute (the bitmask was decorative; now live).
- **Numeric policy table** — `ai{}` compiled once → packed i32 flags + O(1) `Set` membership + pre-paid certified preconditions (2.04× on the governance-check slice; scales with allow-list size).

**P9 self-hosting bootstrap (logicn-core-compiler) — ✅ COMPLETE: emission AND execution byte-parity:**
> HISTORY (2026-06-06): an earlier claim said the lexer "compiles to a real wabt-assembling WASM module".
> At the time that was overstated — the MODULE referenced undefined stdlib fns (`$charCount`/`$Ok`/`$Some`/`$None`),
> so real wabt rejected it and `assembleWAT` fell back to a 240-byte minimal-encoder stub. That gap is now CLOSED:
> the stdlib runtime (#145) is wired, the lexer module wabt-assembles to a real binary, and `tokenize.wasm`
> byte-matches the interpreter (golden: `tests/wat-p9-tokenize-parity`, 21 cases).
- `P9.4a` guarded-flow WAT bodies · `P9.4b` record struct layout (construct + `r.field` access, verified in real WASM) · `P9.4c` guarded-flow export gating.
- **#145a MILESTONE (2026-06-06): the self-hosted lexer module now wabt-assembles to a real WASM binary.**
  `charCount`/`Ok`/`Err` wired to host imports + `__array_append` returns the array handle (last linking
  blocker cleared). The module LINKS + produces a valid binary via real wabt (verified, not the stub).
  **#145b ✅ DONE: token-VALUE correctness via type-aware string lowering** (String `+`→`__str_concat`;
  `Char.toString`→`__char_to_string`) with String/Char var-type tracking (incl. `Option<Char>` match bindings),
  the host output reader (`readResult`/`readArray`/`readRecordField`), and string-intern exposure
  (`getInternedStrings`/`seedString`). **Linking AND string semantics done — `tokenize.wasm` byte-matches the
  interpreter (golden: `wat-p9-tokenize-parity`, 21 cases).**

**P9 EXECUTION PARITY → ✅ ACHIEVED (2026-06-06):** `tokenize.wasm` runs through the #105 admission gate and its output byte-matches the interpreter across a 21-case corpus (incl. string-heavy paths: `char_to_string`, `str_concat`, escapes, `Option<Char>` match bindings). The host-import runtime (string table + `__array_*`/`__str_*`/`__char_*` bridge + list/record memory walk) is wired into `WebAssembly.instantiate`. Golden: `tests/wat-p9-tokenize-parity.test.mjs` (21/21). Both the WASM execution parity AND interpreter-level Stage-A==Stage-B parity (lexer-parity + R6 #101) are now locked.

### Next up (ordered)
0. ✅ **#105 — WASM admission-gate harness (security core, 2026-06-06):** `wasm-runtime.ts`
   — attestation-first Ed25519 verify BEFORE host linking (tampered/unsigned → `CRITICAL_SECURITY_VIOLATION`,
   no instantiation), closed-allowlist host imports (no ambient scope), dev/prod differ ONLY in
   observability (host-call log / trap memory dump); proven in real WASM (5 tests). The locked
   security boundary is built.
1. ✅ **Tokenize EXECUTION byte-parity — DONE (completes P9, 2026-06-06):**
   - ✅ **#144 enum-variant member lowering (2026-06-06)** — `EnumType.Variant` → declaration-order i32 tag
     (`buildEnumVariants` registry); **all 9 `tokenize` placeholders eliminated**, verified in real WASM
     incl. enum-in-record round-trip (tests/wat-p9_4d-enum-lowering, 4 tests).
   - ✅ **#145 — type-aware STRING semantics DONE (2026-06-06):** the lexer builds token values via
     `value = value + nc.toString()`. String `+` now lowers to `__str_concat` and `Char.toString` to
     `__char_to_string` (was: `i32.add` handle arithmetic / `__int_to_str` decimal). Shipped + wired:
     `__str_concat` + `__char_to_string` host fns (`src/wasm-runtime.ts:225,266`); type-aware lowering
     (`src/wat-emitter.ts:880,1008`); String/Char var-type tracking incl. `Option<Char>` match bindings
     (`src/wat-emitter.ts:1328-1336,1546-1568,1854-1862`); string-intern table exposure
     (`getInternedStrings`/`seedString`, `src/wat-emitter.ts:524` + `src/wasm-runtime.ts:297`); list/record
     output reader (`readArray`/`readResult`/`readRecordField`, `src/wasm-runtime.ts:299-305`). `tokenize.wasm`
     == interpreter byte-for-byte (golden: `wat-p9-tokenize-parity`, 21 cases). No `;; unresolved` markers remained.
2. **#102–#104, #106 — real DSS.wasm (Post-P9, DRCM Phase 4):** `dss/index.lln` → `build/dss.wasm`; Wasmtime component supervises DWI guests; real per-DWI fuel; DSS.wasm signs epilogue receipts.
3. **CF-4 — extract `@logicn/tpl-oracle`** so the Brawn (`ext-bridge-cpp`) imports NO Tower runtime (currently pulls `StubTernaryBridge`/`GovernanceEnforcer` from `tower-citizen`).
4. **CF-5 / CF-9 / CF-10** — vector T-MAC commit gate · ECC/TMR · atomic failover.
5. **Record follow-ons** — `#record-update` lowering + cross-flow return-type tracking (so `let r = someCall()` returning a record resolves field access).
6. **#110** — key rotation in `secrets {}`; **#69** — floor-specific dev-tools graphs.

---

## ✅ Complete — All of Phases 1–3 + DRCM Phases 1–4

### Compiler Quality (Phase 1)
`#57` Named record constructors · `#61` `::` module separator · `#55` Named arguments · `#62` Multi-variant match arms `A|B =>` · `#45` LLN code wiring · `#50` EC/ID/AU/LC/T/FG codes

### New Language Features (Phase 2)
`#56` Domain Guard Policies `[conforms_to:]` · `#58` `resilience {}` + `observability {}` · `#52` `security::interim` real module · `#51` `@experimental_profile` directive

### Docs, Examples, CI Gates (Phase 3)
`#46–49` Pattern examples + README + examples migration + graph index · `#53` KB index · `#54` T-006/007/008 goal tests · `#59` Change-class CI + GitHub Action · `#60` Contract clause reference

### DRCM Phase 1 — Critical Security Fixes
`#30` Wildcard ban LLN-CAP-001 · `#31` Prefix-token scanner · `#32–35` CAS/CBOR/key custody/separator specs

### DRCM Phase 2 — `invariant {}` Block
`#36` Parser + static eval + WAT gate injection · LLN-INV-001/003/004 enforced

### DRCM Phase 3 — .lmanifest + Admission Gate
`#67` Binary CBOR RFC 8949 · `#37` `logicn verify` admission gate · `#63` governance-impact.json · `#64` `logicn check --diff` · `#65` `logicn init-env`

### DRCM Phase 4 — Structured Capabilities + `policy {}` Parser
`#38` Structured SystemCapabilityType replacing string grants · `#39` `policy {}` block parser + monotonicity verifier (LLN-MONO-001/002)

### CI/CD Enhancements
`#66` LLN-OBS-002 observability/privacy separation · `#71` `logicn check --what-if` shadow policy analysis · `#73` `assuming {}` parser (AST node assumingDecl) · `#74` `assuming {}` manifest-lookup proof verification

### Topological Graph Engine (Foundation)
`#79` Pre-resolved Policy DAG (CBOR Tag 416) · `#80` Behavioral Fingerprinting (CBOR Tag 417) · `logicn manifest-to-dot` DOT visualization · V_DPM extended to 32-bit topology layout

### Tower-Native Syntax (v1.0)
`#81` `trap` keyword + WAT gate + LLN-TRAP-001/002 · `#82` `governed` floor qualifier + manifest ProofObligation · `#83` `view()` MMCP capability-masked pointer type (Tag 415 stub) · `#84` match exhaustiveness LLN-MATCH-001 · `#85` `DSS.lln` V_DPM foundation (Floor 2 bootstrap)

### Tower-Native Syntax v2.1 — Foundations Complete (tasks #86–#94)
`#86` `static` compile-time constants (WAT `(i32.const N)` folding) · `#87` `bitfield` governance registers + V_DPM rewrite (`NAME.field` bitmask + `NAME.BIT_field` position) · `#88` `gate {}` admission guard verifier (LLN-GATE-001/002; `gateConstraints[]` manifest) · `#89` `access {}` Default Deny + `grant` enforcement (LLN-ACCESS-001/002) · `#92` `guard Name {}` domain ceiling syntax (replaces `policy Name {}`) · `#93` `import "./path.lln"` DAG merge (LLN-IMPORT-001-004) · `#94` `import plugin safe/assimilate` bridged plugins (`assimilatedPlugins[]` manifest; LLN-ASSIMILATE-001-003) · `;;` govComment as first-class token → `governanceAnnotations[]` in manifest

### Agile Governance Patterns + Proof-Tracing (Design)
`logicn-agile-governance-pattern.md` · `logicn-proof-tracing-design.md` · `logicn-topological-graph-engine.md`

---

## 🟡 Now Open — Phase 5 + Remaining Tasks

### CI/CD Enhancements
| Task | What | Priority |
|---|---|---|
| **#72** | Hierarchical policy inheritance `parent_policy:` | Medium |

### Tower Completion (Phase 5 gates)
| Task | What | Priority |
|---|---|---|
| **#75** | Governance-as-Evidence: AuditEvent CBOR Tag 410 schema | Phase 5 gate |
| **#76** | LLN-INV-000 DSS trap handler | Phase 5 gate |
| **#77** | ExecutionDAG compile-time CFG → CBOR Tag 414 | DRCM Phase 6 |
| **#78** | MMCP full enforcement (view() runtime gate) → CBOR Tag 415 | DRCM Phase 5 |

### Tower-Native Syntax v2.1 (Remaining)
| Task | What | Priority |
|---|---|---|
| **#90** | `policy {}` State Mutation Governance — permitted transitions on `mut` variables | Phase 5 |
| **#91** | Migrate `vdpm.lln` from verbose VDPM_BIT_* flows to `bitfield V_DPM { }` | After #87 ✅ |

### Phase 9B — Self-Hosting → WASM (in progress)
The self-hosted compiler sources in `packages-logicn/logicn-core-compiler/src/self-hosted/`
(`lexer.lln`, `parser.lln`, `type-checker.lln`, `governance-verifier.lln`, …) now
compile through the Stage-A toolchain. Progress on assembling them to WASM:

| Sub-phase | What | Status |
|---|---|---|
| **P9.2** | `externref` lowering fix — host-handle values cross the WASM boundary | ✅ Done — `lexer.lln` now `logicn build`s to `build/lexer.wasm` |
| **P9.3** | Stdlib host mapping — self-hosted sources resolve stdlib calls to host imports | ✅ Done — lexer + parser link against the host stdlib |
| **P9.4** | Guarded flow bodies + record types fully lowered to WASM | ⬜ Remaining — `parser.wasm` builds but record/guarded-body lowering is still partial |

**Verify:** `node logicn.mjs build packages-logicn/logicn-core-compiler/src/self-hosted/lexer.lln`
emits `build/lexer.wasm`; the parser builds too, pending P9.4 for full body lowering.
See `logicn-phase-9-roadmap.md` (Phase 9B, Stage B1–B5) for the self-hosting plan.

---

## ⬜ DRCM Phases 5–7 (Future)

### Phase 5 — DSS.wasm Supervisor + Step Keyword
```
V_DPM structure definition in DSS.lln  ← START HERE when ready
    ↓
Capability → bitmask mapping
    ↓
step keyword + DWI isolate allocation (#40)
    ↓
DSS supervisor: DPM tracking + trap handler (#41)
    ↓
MMCP (#78) + topology bit validation (bits 8-15)
    ↓
Governance-as-Evidence: AuditEvent CBOR Tag 410 (#75)
    ↓
LLN-INV-000 trap handler (#76)
    ↓
CBOR secure parser: depth/duplicate/overflow (#68)
```

### Phase 6 — Epilogue Receipt + ExecutionDAG
```
Epilogue Receipt: generation + verification + ledger (#42)
    ↓
ExecutionDAG compile-time CFG construction (#77)
    ↓
DAG-edge validation in DSS.wasm signal loop
```

### Phase 7 — Hardening + Deployment
```
Negative test suite: all OWASP vectors (#43)
    ↓
Floor-specific dev tools graphs (#69)
    ↓
WAT single-exit body transformation (#70)
    ↓
Layer 2 OS container config OCI/gVisor (#44)
    ↓
Linux server deployment verification
```

---

## CI/CD Gate Status

| Gate | Status | What |
|---|---|---|
| `tests:core` | ✅ | 3,285 tests — 4 SOT packages |
| `tests:patterns` | ✅ | 8 architecture patterns |
| `tests:goals` | ✅ | T-006/007/008 acceptance tests |
| `tests:devtools-*` | ✅ | 5 devtools packages |
| `tests:ext-*` | ✅ | secrets-vault + proof-snarkjs |
| `audit:security` | ✅ | 0 errors (46 VALUESTATE tracked) |
| `audit:naming` | ✅ | 19 naming findings (informational) |
| `audit:provenance` | ✅ | 0 ungated flows |
| `manifest:cbor` | ✅ | 6 manifests canonical CBOR + round-trip |
| `graph:reindex` | ✅ | 2888 nodes / 3625 edges |
| `governance:diff` | ✅ | Change class vs HEAD~1 per cadence |

---

## .lmanifest Contents (Current)

Every `logicn build` now produces a binary CBOR `.lmanifest` containing:

| Field | CBOR Tag | Status |
|---|---|---|
| `sourceHash` | — | ✅ SHA-256 of .lln source |
| `proofObligations` | Tag 403 | ✅ invariant static/runtime classifications |
| `derivedConstraints` | — | ✅ secret sink + taint rules |
| `policyResolutionDag` | Tag 416 | ✅ pre-resolved effect bitmask |
| `behavioralFingerprint` | Tag 417 | ✅ CFG path SHA-256 |
| `governanceSignature` | Tag 404 | ✅ **real Ed25519** in BOTH the CBOR + JSON when a signing key is present (#180, 2026-06-20); placeholder only when unsigned. ML-DSA-65 held (#34); CBOR-bytes self-verification is #67 |
| `executionDag` | Tag 414 | 🔲 DRCM Phase 6 (#77) |
| `capabilityPointers` | Tag 415 | 🔲 stub in derivedConstraints (#83) — full enforcement Phase 5 (#78) |
| `governanceAnnotations` | — | ✅ `;;` govComment tokens collected into manifest narrative |
| `gateConstraints` | — | ✅ `gate {}` admission guard conditions recorded (#88) |
| `assimilatedPlugins` | — | ✅ Hot-Code Residency plugins tracked with path + source hash (#94) |

---

## Complete Task Register

### ✅ Complete (94 tasks)
Tasks #1–67 + #71 + #73 + #74 + #79–89 + #92–#94 (see task list for full detail)

### 🟡 Open (Priority order)

| # | Task | Phase |
|---|---|---|
| **#72** | Hierarchical policy inheritance | Medium |
| **#75** | Governance-as-Evidence CBOR Tag 410 schema | Phase 5 gate |
| **#76** | LLN-INV-000 DSS trap handler | Phase 5 gate |
| **#68** | CBOR secure parser DSS hardening | Phase 5 gate |
| **#78** | MMCP full enforcement Tag 415 | Phase 5 gate |
| **#70** | WAT single-exit body transform | Phase prereq |
| **#77** | ExecutionDAG CFG → Tag 414 | Phase 6 gate |
| **#69** | Floor-specific dev tools graphs | Phase 7 |
| **#90** | `policy {}` State Mutation Governance | Phase 5 |
| **#91** | Migrate `vdpm.lln` to `bitfield V_DPM {}` | After #87 ✅ |
| **#118** | `logicn-ext-bridge-groq` GroqCloud HTTP wrapper | Track B |
| **#119** | `logicn-ext-bridge-bitnet` BitNet CPU WASI-NN backend | Track A |
| **#120** | `logicn wrap` C++ wrapper generator | CLI |
| **#121** | `logicn promote` full promotion pipeline | CLI |
| **#122** | `logicn-ext-bridge-nvfp4` NVFP4 TensorRT-LLM backend | Hardware-gated |
| **#123** | `governance_tier` boot.lln mapping | Parser |
| **#124** | `audit_depth full` AuditEvent AI inference fields | Verifier |
| **#125** | `logicn run --governed <flow>` — execute effectful/secure flows via the **governed interpreter** (`console.log` / `audit.write` / capability host) **enforcing the manifest's allowed effects**. Today `run` is WASM-`--invoke`-only (only pure, primitive-returning flows are exported), so a `secure flow main { console.log }` can be *checked* but not *executed* from the CLI — the error at `logicn.mjs:1300` correctly says so but offers no run path. Governance-sensitive: must honour deny-by-default (no ambient `console`/capabilities), reuse `interpreter.ts`'s `ContractEnforcer` + `CapabilityHost`, not bypass them. Dogfooding finding (.tmf R&D #2). | CLI |
| **#126** | Extend the descriptive operator hint beyond `^`/`~` (`lexer.ts:790`). `&` `\|` `<<` `>>` and `&&` `\|\|` currently emit a generic `LLN-PARSE-001`. Must be **parser-level, not lexer**: `\|` is overloaded for multi-variant match arms (`A\|B =>`, `parser.ts:1709`) and `<<`/`>>` are `<`/`>` pairs used in generics/comparison — none can be blanket-rejected in the lexer. In *expression* position, hint `&` `\|` `<<` `>>` → engine/extension (crypto-on-core) and `&&` `\|\|` → use the `and`/`or` keywords. From R&D conformance audit (DX only, low priority). | DX |
| **#127** | **Shape-stable governance objects** (V8 hidden-class / inline-cache discipline). Keep hot-path governance objects (PolicySnapshot, GateDecisionInput, DecisionToken, ForensicEvent, and a future Passport/ModuleIdentity) **monomorphic** — fixed field order, no dynamic property add/delete — so the engine keeps a stable hidden class (faster validation, deterministic replay, stable cache keys); fixed structs in the future deterministic/WASM core. Rule: *optimize the path to the decision, not the decision* (consistent with GateCache #194 + the R4 PQ-tax gate). Profiling/design task — **partly already realised** (numeric policy table, V_DPM bitmask). | Perf/design |
| **#128** | **GAP-4 (enc-rnd dogfooding): `for…in` not lowered to WASM — and SILENT.** `forEachStmt` parses + executes in the Stage-A interpreter, but `wat-emitter.ts` has **no case for it** (confirmed — zero `forEachStmt` handler), so under Stage-B the loop body silently never runs (no-op, no error). **Two parts:** (a) **safety (priority) — ✅ DONE 2026-06-17** — `emitBlockStatements` `default` branch no longer emits the silent `(i32.const 0) ;; unhandled stmt` fallthrough; it now emits an atomic `(unreachable) ;; unsupported-in-WASM: <kind>` fail-closed trap (mirrors the ensure/trapDecl gates + flow-stub discipline ~L413-435). Confirmed: the module still assembles (wabt-valid) but traps at runtime instead of returning a wrong result. Regression test `tests/wat-failclosed-unsupported-stmt.test.mjs` (4 cases: no silent no-op, fail-closed trap emitted, module well-formed/assembles, supported `while` unaffected). `test:core` green (compiler 3459). (b) **feature (follow-up, OPEN)** — implement real `forEachStmt` lowering (block+loop+iterator over the collection); when it lands, flip the for-in cases in the regression test from "traps" to "lowers correctly". | Stage-B / safety |

### Governed Inference Tower (Track A/B)
| Task | What | Priority |
|---|---|---|
| **#118** | `logicn-ext-bridge-groq`: GroqCloud HTTP wrapper — governed `step()` via WASI-HTTP, `ai {}` enforcement (max_token_cost, max_latency_ms, approved_models), AuditEvent CBOR Tag 410 | Track B |
| **#119** | `logicn-ext-bridge-bitnet`: BitNet CPU WASI-NN Wasmtime backend — `wasmtime-wasi-nn-bitnet` Rust crate, BitNet.cpp FFI, TL2/TL1 kernel selection, wired into `logicn-ai-lowbit` | Track A |
| **#120** | `logicn wrap`: governance wrapper generator from C++ headers → `.lln` flow + `_host.rs` Wasmtime registration | CLI |
| **#121** | `logicn promote`: full promotion pipeline (wrap + static analysis + sign) → `build/engine.wasm` + signed `.lmanifest` with license/commit metadata | CLI |
| **#122** | `logicn-ext-bridge-nvfp4`: NVFP4 TensorRT-LLM backend — Apache 2.0 + NOTICE; hardware-gated (Blackwell B200/RTX5090) | Hardware-gated |
| **#123** | `governance_tier` mapping in `boot.lln`: `ai_tier_1/2/3` → assimilated plugin routing; no flow-code changes to switch backends | Parser |
| **#124** | `audit_depth full`: enhanced AuditEvent fields for AI inference — token_count, latency_ms, input_hash, output_hash, model_version, engine_id | Verifier |

### ⬜ DRCM (Gated)
`#40–44`: Phase 5–7 (step keyword, DSS.wasm, Epilogue Receipt, OWASP tests, OCI)

---

## Tower-Native Syntax (v1.0 + v2.1 spec)

Compile-time security primitives that map LogicN source directly onto the Governed Tower architecture and V_DPM register. Unlike general-purpose control flow, these keywords are **declarative security primitives** — each one causes the compiler to emit Tower-specific metadata, proof obligations, or WAT gates.

**v1.0 (implemented — Stage A):**

| Keyword | What it declares | Compile-time output |
|---|---|---|
| `governed floor_N` | Floor authorization for a flow | ProofObligation (CBOR Tag 403) with floor + bit |
| `view(cap)` | Capability-masked memory pointer | MMCP stub (CBOR Tag 415) in derivedConstraints |
| `trap COND : ERR` | Hard invariant in failure-condition form | WAT `unreachable` gate + ProofObligation |

**v2.1 (implemented — tasks #86–#94 complete):**

| Keyword | What it declares | Compile-time output |
|---|---|---|
| `static NAME = VALUE` | Compile-time constant | WAT `(i32.const N)` folding; zero runtime overhead |
| `bitfield NAME { field: bit }` | Typed governance register (V_DPM) | `NAME.field` (bitmask) + `NAME.BIT_field` (position) |
| `gate(condition) { ... }` | Admission guard wrapping flows | `gateConstraints[]` in manifest; bit 8 WAT gate (Phase 5) |
| `access { grant ... }` | Call-boundary Default Deny negotiation | `grant` lines verified against effects + capability registry |
| `guard Name {}` | Top-level domain ceiling | Replaces `policy Name {}`; Differential Proof at compile time |
| `import "./path.lln"` | DAG merge file import | Symbols enter scope; resolved path + hash in manifest |
| `import plugin safe/assimilate` | Bridged plugin | `assimilatedPlugins[]` in manifest; LLN-ASSIMILATE-001-003 |
| `;; text` | `govComment` token | `governanceAnnotations[]` in manifest narrative |

See `logicn-tower-native-syntax.md` for full grammar, semantics, and cross-references.

---

## Knowledge Base (Current — 34 docs, v6.0 additions reflected in layer listing)

**Layer 0:** `architecture-charter.md`  
**Layer 1:** `logicn-governance-rules.md` (37+ LLN codes)  
**Layer 2A:** `logicn-architecture-patterns.md`  
**Layer 2B:** `logicn-contract-authoring-guide.md` · `logicn-contract-clause-reference.md` · `logicn-resilience-observability-design.md` · `logicn-domain-guard-policies.md` · `logicn-governance-cicd-pipeline.md` · `logicn-cbor-manifest-spec.md` · `logicn-tower-native-syntax.md` · `logicn-governed-inference-tower.md` ← NEW  
**Layer 3:** `logicn-deterministic-runtime-containment.md` · `logicn-drcm-phase1-specs.md`  
**Topology:** `logicn-topological-graph-engine.md`  
**Patterns:** `logicn-agile-governance-pattern.md` · `logicn-proof-tracing-design.md`  
**Root:** `logicn-engineering-goals.md` · `logicn-build-roadmap.md` (this doc) · `KNOWLEDGE-BASE-INDEX.md`  
**Research:** `logicn-governed-design-synthesis.md` · `logicn-governed-tower-specification.md` · `logicn-platform-infographic-concept.md` · `logicn-floor3-proof-zone-graph.md`

---

## P9 Completion Roadmap (2026-06-06)

State: **44/44 packages · 4,089 tests · 0 fail.** Stage A compiler 100%; the
Governed Inference Tower + 6 Sentinels + neutral bridge contract are built, wired,
governed, and benchmarked. The single gate to P9 is self-hosting (Stage B).

### P9 — self-hosting bootstrap (the gate)
- **#120 P9.4a — guarded flow WAT bodies** ✅ DONE (2026-06-06): the WAT emitter now
  lowers `guarded` flow bodies via `emitWATFromFlowAST` (only when emission fully
  succeeds, else `unreachable` — protects the 3,259 compiler tests). Verified: a
  guarded flow emits real `i32.add` and the suite stays green.
- **#120 P9.4b — record struct layout** ✅ CONSTRUCTION DONE (2026-06-06): a `#record`
  literal now bump-allocates `fieldCount*4` bytes above `$__lln_heap` (base 1024),
  stores each field at its slot offset, and evaluates to the base pointer — per-record
  `$__lln_rec_N` locals make it safe under nesting + record-returning calls. Verified
  end-to-end: a record-returning flow assembles via wabt and executes in real WASM with
  the correct struct in linear memory (tests/wat-p9_4b-record-layout). **Field ACCESS
  also DONE** (2026-06-06): `r.field` → `i32.load` at the slot offset, resolved via a
  `buildRecordLayouts` registry + per-flow var→type tracking (from `let r: T`/`let r =
  T{…}` literal types + record-typed params); round-trips in real WASM (build a record,
  read fields back — 5 tests). REMAINING: `#record-update` still emits the placeholder
  (needs a base-copy), and `let r = someCall()` returning a record isn't type-tracked
  (cross-flow return-type inference) — neither blocks the self-hosted `tokenize` path.
- **#120 P9.4c — export gating for governed flows** ✅ DONE (2026-06-06): a `guarded`
  flow with no declared effects is now WASM-exportable (it lowers like a pure flow), so
  `logicn run --invoke <guardedFlow>` reaches governed entry points. Verified: a guarded
  flow is exported and invocable in real WASM (tests/wat-p9_4c-export-gating, 2 tests).
- **Ceremony — EMISSION half ✅ DONE (2026-06-06):** the self-hosted lexer
  (`src/self-hosted/lexer.lln`) now compiles to a real, wabt-assembling WASM module —
  **all 9 flows have real bodies (0 `unreachable` stubs)**, `tokenize` (record-returning)
  included, using the P9.4b record heap (tests/wat-p9-ceremony-emission, 3 tests). This
  is the milestone "self-hosted `tokenize` emits real WASM". Interpreter-level Stage-A ==
  Stage-B parity is already locked (lexer-parity.test.mjs, PARITY_ACHIEVED=true; R6 #101).
- **Ceremony — EXECUTION-PARITY half ✅ DONE (2026-06-06):** `tokenize.wasm` runs through
  the #105 admission gate and its output byte-matches the interpreter. The full host-import
  runtime (string table + `__array_*`/`__str_*`/`__char_*` bridge + list/record memory walk)
  is wired into `WebAssembly.instantiate`. Golden: `tests/wat-p9-tokenize-parity.test.mjs`
  (21/21, incl. string-heavy paths).

### Post-P9 — real DSS.wasm (DRCM Phase 4)
- #102 dss/index.lln → build/dss.wasm via Stage B
- #103 Wasmtime component supervises DWI guests · #104 real fuel · #105 `logicn run`
  on the real DSS component · #106 receipt signing in DSS.wasm

### 🔒 Flagged externals — blocked on an external dependency or explicit go-ahead (DOCS ONLY)
These are recorded, not started. Each line = **status + blocker**. Do NOT implement or run any of these here.

| Task | Status | Blocker |
|---|---|---|
| **#102** — compile `dss/index.lln` → `build/dss.wasm` via Stage B | 🔲 BLOCKED (pending) | P9 string-runtime (#145/#143) is **✅ DONE** — no longer a blocker. Remaining: drive the full self-hosted Stage-B pipeline (parser/type-checker/govern/emit `.lln`) to module-assembly + link parity for `dss/index.lln` (today only `lexer.lln` reaches WASM byte-parity), plus the Wasmtime component host (#103). |
| **#103/#104** — real Wasmtime component model + per-DWI fuel | 🔲 BLOCKED (pending) | Needs the **Wasmtime runtime** (component-model host + real per-isolate fuel metering); today fuel/supervision is simulated, not enforced by a real engine. |
| **#106** — epilogue receipts signed by `DSS.wasm` | 🔲 BLOCKED (pending) | Depends on a real `dss.wasm` (#102) running under Wasmtime (#103); receipt-signing logic exists, but in-WASM signing by the supervisor can't land until #102/#103 do. |
| **#110** — key rotation in `secrets {}` | 🔲 BLOCKED (pending) | Needs an external **KMS** (key-management service) to source/rotate keys; rotation semantics can't be enforced without a real key custodian. |
| **#149** — signing-key git-history scrub + CI secret scanning | 🔲 BLOCKED — **DESTRUCTIVE, user-driven** | Rewrites git history (committed key `8eecf4187ebc9341` in `cb5036d:.env.logicn-signing`; already rotated → `ab46f4c7e2797b9b`). **DO NOT run** without explicit user go-ahead — requires force-push + collaborator coordination. |

### Parallel hardening track (regulated-assurance lens, from the security audits)
- **CF-3 finish** — Tower verifies `sha256(canonicalManifestString)` + signature;
  `requireSignedBridge` in the Certified Profile; `logicn bridge attest` tool.
- **CF-4 finish** — extract the TPL oracle (`TPLSimulator`/`StubTernaryBridge`) into
  `@logicn/tpl-oracle` so the Brawn imports NO Tower runtime.
- **CF-5** — vector T-MAC commit gate (`canCommit()` in `execute()`).
- Packed-array refactor + fixed-point `i2_scale` (Phase 2 throughput).
- ✅ Numeric policy table (2026-06-06) — `compilePolicy()` compiles `ai{}` ONCE into
  packed i32 flags + an O(1) membership Set + pre-paid certified preconditions; the
  hot path is branchless flag tests + `Set.has` (2.04× on the governance-check slice,
  scales with allow-list size). [Contract → runtime CLI manifest reparse still open.]

### After P9: foundations to 100%
Once the bootstrap ceremony passes, drive the remaining Stage B pipeline modules
(parser/type-checker/effect/govern/emit/runtime `.lln`) from "partial" to "full"
so LogicN compiles and runs LogicN end-to-end — then port `logicn-tower-citizen`
itself to `.lln:tri` (compiler can host it; oracle preserved).
