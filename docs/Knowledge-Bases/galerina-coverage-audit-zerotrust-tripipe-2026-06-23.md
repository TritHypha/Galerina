# Coverage audit — zero-trust + Tri-Pipe/photonic-Tri (2026-06-23)

## Bottom line

Across **95 audited parts** (package/module clusters spanning the whole repo), Galerina is **well-covered on the security-critical core and the photonic/Tri compute hub, and thin-to-absent on host-side developer tooling, thin target scaffolds, and the unbuilt web-* layer.**

- **Zero-trust: ~55% covered, ~34% GAP, ~12% n/a** (52 covered / 32 GAP / 11 n/a). The coverage is *front-loaded onto the parts that can actually fail a runtime trust decision* — the analysis pipeline, the kernel/fuse-loader admission gate, the cert-gate, the sentinels, the Toxic-Border ext bridges. The GAP count is high but **most GAPs are auditor-completeness (a source-reading dev tool that has never been adversarially fuzzed), not known live fail-opens.** Only a handful are confirmed-live holes (value-state trusted-by-default, the two WAT-emitter codegen bugs, the snarkjs placeholder receipt, the registry "not-yet-enforced" stubs).
- **Photonic-Tri: ~26% covered, ~14% GAP, ~60% n/a** (25 covered / 13 GAP / 57 n/a). The high n/a is **honest, not lazy** — the substrate model lives in a small set of packages (tower-citizen `substrate-model.ts`, `@galerina/substrate-math`, core-photonic/core-logic, target-photonic, ext-photonic-emulator, tri-pipe, hardware-tier), all of which ARE assessed through the photonic lens. The rest (HTTP transport, crypto, secrets, ZK, web DOM, devtools) genuinely do not route compute to a substrate, and the crypto-stays-Binary invariant *forbids* inventing photonic relevance for them. The 13 photonic GAPs are concentrated in one real cluster: **the compiler's lowering/IR/plan layer carries zero photonic-lens assessment** — exactly the seam a Tri-Pipe `R(o)` router plugs into.

**Net judgement:** the zero-trust posture of the *runtime trust boundary* is strong and named. The two systemic weak spots are (1) **host-side auditors/tooling that have never been adversarially tested for fail-open** (a source-reading auditor that reports "PASS" on a parse failure hides real violations), and (2) **the core compiler's compute-routing/IR/plan types have never been put through the degrade-only/substrate lens**, even though that is precisely where a photonic lane must be admitted or declined fail-closed.

## Per-group summary

| Group | Parts | ZT covered/gap/na | PT covered/gap/na | Verdict |
|---|---|---|---|---|
| core-compiler internals | 23 | 18 / 3 / 2 | 6 / 6 / 11 | Analysis passes covered; **lowering/IR/plan layer is the photonic blind spot**; 3 live ZT holes (value-state, wat-emitter ×2, monkey-patch/naming completeness). |
| core-* packages | 17 | 11 / 3 / 3 | 6 / 3 / 8 | Security cores covered; sentinels power/time lack named mutation audit; **core-cli regex redactor is a real fail-open**; core-compute/vector substrate types unassessed. |
| framework + tower + api | 5 | 4 / 0 / 1 | 2 / 0 / 3 | Best-covered ZT group (it IS the zero-trust framework). tower-citizen fully substrate-assessed. One tracked residual (cert-gate→kernel wiring). No new GAPs. |
| ext-* bridges | 7 | 6 / 1 / 0 | 5 / 0 / 2 | Most security-instrumented group. One clear GAP: **snarkjs placeholder receipt**. quantum B2 float64 noise profile owed (sub-residual, not a job of its own). |
| devtools + tools | 14 | 1 / 11 / 2 | 0 / 3 / 11 | **Thinnest ZT coverage in the repo.** Source-reading auditors with plausible fail-open (parse-fail→PASS) never adversarially tested. 3 substrate-aware (bench harness, optical_io target, PhotonicBridge flag) unassessed. |
| substrate / Tri-Pipe / targets / photonic | 11 | 5 / 6 / 0 | 5 / 0 / 6 | Photonic compute fully covered & proven-by-maths. **6 thin target-* contract scaffolds have validate/select logic never fail-closed-audited** (ai-accelerator, cpu strongest). |
| web-* packages | 6 | 0 / 6 / 0 | 0 / 0 / 6 | **All 6 are spec-stubs** (README+package.json only). Fail-closed in prose, never adversarially R&D'd; latent until built. Correctly n/a for photonic. |
| inference + governance + remaining | 12 | 8 / 2 / 2 | 6 / 1 / 5 | Best-covered slice on both lenses (it holds the mechanisms the audits were about). GAPs: **inference-bridge-contract schema as a unit**, **registry unsigned stubs**, cpu-kernels ternary descriptors. |

## GAP table

### Zero-trust GAPs (32) — clustered

| Part(s) | Why it is a GAP | Live fail-open? |
|---|---|---|
| `value-state-checker.ts:1162-1191` | Bare params trusted-by-default (the "34B hole", arch-rd #4); only explicit `tainted`/untrusted-origin auto-taints | **YES — known live** |
| `wat-emitter.ts` (#163 record-update, #165 float arith) | Emit a wrong value instead of trapping (lying-abstraction class), NEW + untriaged | **YES — known live** |
| `monkey-patch-checker.ts` + `naming-policy-checker.ts` | Fail-closed by construction but never individually named in Gate-6/arch-rd; SEC-002 wants one mutant per gate | completeness |
| `core-sentinel-power` (LSP down-tier) | 17/17 unit tests but no named SEC-002 mutation audit of the up-tier-forbidden deny path | completeness (up-tier risk) |
| `core-sentinel-time` (LST drift gate) | 13/13 unit tests but no named mutation audit of drift-detect→fault deny path | completeness (admit-on-unknown-drift risk) |
| `core-cli` `redactCliOutput()` | Best-effort 6-pattern regex secret scrubber, NOT the audited seal()/redact(); any non-matching secret shape prints cleartext | **YES — real fail-open** |
| `ext-proof-snarkjs` `verify()` | Phase-1 sha256-seal placeholder, not real Groth16; no audit checks a forged/placeholder receipt passing `generateEpilogueReceipt` halt_pipeline | **YES — real fail-open in certified profile** |
| devtools auditors: `devtools-security`, `-pci`, `-provenance`, `-context`, `-flowgraph`, `-intelligence`, `package-graph`, `project-graph`, `-benchmarks`, `tools-benchmark`, `kb-graph` | Source-reading auditors/oracles; parse-fail or keyword-miss → reports "clean/PASS"; never adversarially examined; several write files with no path-sandbox; tools-benchmark has unverified default-deny telemetry egress | **YES — fail-open-on-parse-fail class** |
| thin targets: `target-wasm`, `-native`, `-gpu`, `-cpu`, `-ai-accelerator`, `-js` | validate/select/reject logic (cpu 177L, ai-accelerator 368L strongest) never fail-closed-audited; permissive default/fall-through-to-admit risk; js README promises unenforced deny rules | latent / **ai-accelerator selector real** |
| web-* (all 6) | Spec-stubs; fail-closed in prose (RawHtml-deny, taint-laundering, gesture/permission gates) never built or audited | latent (web-render XSS highest) |
| `inference-bridge-contract` (schema as a unit) | Enforcement lives in tower-citizen; the contract's own deny-by-default (unwitnessed tolerance, missing-domain default, allow-list-absent) never audited as a unit | completeness |
| `galerina-registry` | Phase-28 scaffold, manifests "NOT yet actively enforced or signed" by its own admission | **YES — if mistaken for a control** |

### Photonic-Tri GAPs (13)

| Part(s) | Why it is a GAP |
|---|---|
| `taint-checker` + `security-sink-monitor` | secret-on-photonic-lane / cleartext-on-noisy-lane rule (arch-rd #15) designed but not modeled in these passes |
| `gir-emitter.ts` | No R&D has audited whether GIR carries/propagates a sound per-op substrate tag (photonic node distinguishable from Binary) |
| `wat-emitter.ts` | No assessment of whether the Binary-lane emitter correctly DECLINES (fail-closed to Binary) ops authorized for a photonic envelope |
| `interpreter` / `bytecode-vm` / `register-vm` | No assessment of a clean hybrid/photonic handoff seam or how a `0`-state (photonic noise) re-enters the walker |
| `gpu-plan.ts` + `lowering-plan.ts` | **Highest-value photonic GAP**: the accelerator/offload plan types (51+38 refs) carry zero photonic-lens assessment — does a photonic lane belong here, is degrade-only enforced? |
| `attestation.ts` + `manifest-generator.ts` | CBOR `.lmanifest` SubstrateAttestation Tag 418 (arch-rd #7) designed but not emitted — signed artifact cannot prove substrate posture |
| `economics-inference.ts` | degrade-only substrate-cost axis (brake-only, never gas) + photonic ExecutionTarget designed but not assessed against this module |
| `core-compute` | ComputeTarget includes `photonic`/`optical_io`/`ternary_ai`; enumeration→route mapping never run through degrade-only/K3 lens — can `photonic` ever be selected for a Crypto/Hash/Sign workload? |
| `core-vector` | ternary/low-bit lane element types never assessed against substrate-math precision/NMR vocab (routePrecision lane axis) |
| `devtools-benchmarks` | tri-logic "future photonic substrate" bench harness itself never assessed by named photonic R&D |
| `tools-benchmark` | `optical_io` BenchmarkTarget surface ungraded by photonic R&D |
| `devtools-graph-algorithms` | `PhotonicBridge` flag-query (`host.photonic.bridge`) never cross-checked against substrate-model R&D |
| `cpu-kernels` | ternary_matmul/i2_s/`ternary` descriptors never checked for consistency with the photonic-eligible offload contract (no implicit perf claim) |

## Well-covered (cite)

- **Analysis pipeline (Stage 1-5):** `galerina-pipeline-security-posture.md` audits every stage fail-closed/deny-by-default; lexer/parser DoS limits, K3 type exhaustiveness (the WASM defaults are NOT fail-opens), No-Coercion theorem proven to depth-4 in `governance-verifier.ts`, `i32-arith.ts` Z3/SMT cross-tier conformance (R&D 0024), GIR immutable + SHA-256 (R&D 0088).
- **Admission gate:** `framework-app-kernel` non-bypassable pipeline (60→87 tests after b0428b0), `fuse-loader.ts` 3 fail-closed gates + revocation Gate-2b (`isKeyRevoked`, key `8eecf4…`→Deny verified 2026-06-22), `api-protocol-rest` deny-by-default wildcard.
- **Transport/cert:** TLSTP S1 cert-gate (`galerina-tlstp-s1-cert-gate.md`, 22 tests, **SEC-002 8/8 mutants killed**), `api-server` body-cap DoS guard + fail-closed channel-verdict fold.
- **Sentinels:** egress never-drop (SEC-002 audited 2026-06-23, HMAC-chained), io/memory/state HMAC integrity + full unit suites in the 53/53 run, photonic-bus/bridge seams border-sealed (`HardenedBorderViolation`).
- **Ext Toxic-Border:** Gate-6 CF-3/CF-7 bridge-attestation, cpp SHA-256-hash-before-require fail-closed, quantum full 5-stage cycle + hybrid Ed25519+ML-DSA attestation, tmf fail-closed reader (crypto-on-core hard line held).
- **Photonic/Tri hub (fully assessed):** tower-citizen `substrate-model.ts` (SPORE-SUBSTRATE-001..004, `effectiveVerdict=vAnd(ideal,reading)` availability-not-safety), `@galerina/substrate-math` single-source-of-truth, core-logic K3 (SPORE-GOV-3VL-001), tri-pipe/hardware-tier fail-closed-to-binary (`npm run prove`, R&D 0009/0053/0054/0056), ext-photonic-emulator (46 tests, prove-own-maths D1/D2 25/25, degrade-only/projected-not-measured).
