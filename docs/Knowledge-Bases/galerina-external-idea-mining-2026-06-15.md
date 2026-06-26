# External Idea Mining — Governance Ideas for tower-citizen / Galerina (2026-06-15)

**Source:** 8 third-party git repos vendored under `C:\wwwprojects\x` (4 low-bit/quantization,
4 photonics). Mined by a 9-agent workflow (1 grounded miner per repo + synthesis); **38 raw ideas →
12 ranked**. Every idea is a way for Galerina to **GOVERN** (declare → verify → attest → measure), never
to **absorb** the projects' math/kernels. Guardrails enforced: flow+contract only, no Rust/Zig in core,
no invented crypto (SHA-256 + Ed25519 → ML-DSA-65 only), no fictional perf numbers.

> Raw full output (all 38 ideas + per-idea evidence): workflow `wgatcj184`.
> Companion lanes: [[galerina-photonic-tri-rd]] · [[galerina-substrate-contracts]] · [[galerina-ext-bridge-quantum]] ·
> [[galerina-quantum-resistance-posture]].

---

## 0. The unifying pattern — "calibration-as-attestation"

Across ModelOpt, Transformer Engine, MiniCPM and PNN the recurring move is: **take a numeric property that
is normally an implementation accident** (which layers ran low-bit, which scale was used, how close to ideal
a result was) **and make it a DECLARED → VERIFIED → RECORDED manifest fact.** That is Galerina's
*AI-proposes / compiler-verifies / runtime-authorizes* loop applied to **numbers**, and it lands squarely on
the **already-shipped** `BridgeManifest` + `DeterminismMode "tolerance"` machinery (the FFSM/quantum Phase 0).
The whole harvest is essentially: *finish the measured half of the determinism/tolerance model.*

---

## 1. Projects mined (grounded purpose)

| Repo | What it is | Yield |
|---|---|---|
| **NVIDIA Model-Optimizer** | PTQ/QAT quant (FP8/INT4/NVFP4/AWQ) + pruning/distill; core = a declarative per-layer **precision recipe** + calibration gate | 5 |
| **NVIDIA TransformerEngine** | FP8/MXFP8/NVFP4 low-precision; modules carry **scaling factors**; a user **recipe** governs per-tensor quantization | 5 |
| **MiniCPM (OpenBMB)** | edge LLMs incl. **BitCPM4 ternary 1.58-bit QAT**, full quant spectrum, XML tool-call parser, quant eval harness | 5 |
| **linear_open_lm (TRI-ML)** | linear-attention LMs: parallel↔**recurrent streaming** equivalence, **fixed-size carry state**, equivalence tests | 5 |
| **SPDNN (McMahon Lab)** | NNs accurate under **stochastic single-photon detection**; knob `K` = shots averaged; reports accuracy±std per (N,K) | 5 |
| **Photonic-Neural-Networks (pnn)** | unitary→MZI-mesh decomposition + a **reliability notebook** (loss/crosstalk/extinction/SNR/fidelity models) | 4 |
| **Photonics-Guide** | curated link index (no code/math in-repo) — vocabulary only | 4 (low) |
| **awesome_photonics** | curated tool/format catalog (FDTD/FDFD solvers, GDSII/Touchstone/SPICE) — **Tier-3 bridge candidates** | 5 |

---

## 2. The 12 ranked investigations

Effort: S/M/L. Lane: **A** = low-bit governance · **B** = photonic/noisy-substrate · **X** = cross-cutting.

### #1 — Post-quantization attestation gate: declared precision **==** observed precision per module · **A** · M
Source: ModelOpt #2 + TE per-tensor effective-precision log.
**Map:** a verify pass over `BridgeManifest`: the `precision{}` contract declares intended per-module
`PrecisionTechnique` + forbidden-mutation hashes (tokenizer/template/context); the verifier reads the
bridge's exported quant config vs tensor headers and enforces `declared==observed`, recording the coverage
table as a signed manifest record (Ed25519 over SHA-256, reusing `backendArtifactHash`). New diagnostic
**SPORE-PRECISION-ATTEST**: any *unexpected-unquantized / quantized-but-excluded / mismatch* → DENY.
**Why:** closes a real fail-OPEN — an attested Brawn bridge could ship a layer at the wrong precision (or
swap the tokenizer) and still pass the naive `packageHash` pin. ModelOpt proves it's mechanizable from
exported metadata alone ("a gate, not a guideline").
**First step:** KB stub `galerina-precision-attestation.md` + `SPORE-PRECISION-ATTEST` fixture manifest whose
observed coverage contradicts its declared precision (assert DENY).

### #2 — Tolerance-bounded accuracy contract: measured loss ≤ ε under a hash-matched comparability proof · **X** · M
Source: ModelOpt #3 + TE cross-rank determinism pin + MiniCPM config-drift hazard.
**Map:** extend the shipped `DeterminismMode "tolerance"` triple-pin (tolerance>0 + pinnedEnvHash +
backendArtifactHash) with a **fourth obligation** — a comparability pin-set (prompt/template/gen-settings/
sample-count/judge) that must hash-match the baseline, else verdict = **INDETERMINATE** and `authorize()`
denies. "No threshold supplied" → existing fail-closed INDETERMINATE.
**Why:** supplies the **missing measured half** of the determinism model — today "tolerance" pins
environment hashes but the word has *no enforced numeric witness*. `contract.test.mjs` already asserts
tolerance is admissible only when fully pinned; this widens the pin-set and ties it to a measured delta.
**First step:** add `ComparabilityPins` to `inference-bridge-contract`; extend `validateManifestShape` so
`tolerance` also requires a `comparabilityHash`; test: mismatched sample-count hash → INDETERMINATE/deny.

### #3 — Bind `substrate{ redundancy:N, tolerance:ε }` to a witnessed (N, accuracy±std) curve · **B** · M
Source: SPDNN (shot budget K → monotone accuracy±std) + TE residual-variance.
**Map:** harden `verifySubstrate` / SPORE-SUBSTRATE-002/-003: require the `substrate{}` block to carry/reference
a **witness row** binding declared ε to a measured (N, std_dev) pair, and REJECT any ε tighter than N
empirically supports. `substrate-math.nmrFailureProbability` stays the conservative canonical checker; the
witness only tightens it.
**Why:** turns `redundancy:N` from a slogan into a verifiable claim — the live invariant
("declared tolerance must be PROVABLE at N") gets a real physical witness format.
**First step:** `SubstrateToleranceWitness{N, epsilonMeasured, stdDev, noiseModelId}` in
`substrate-inference.ts`; deny when `epsilonDeclared < epsilonMeasured` for the chosen N.

### #4 — Typed deterministic-sink reducer: only an expectation or N-voted aggregate may cross noisy→deterministic · **B** · M
Source: SPDNN (never lets a raw single-photon sample reach the classifier) + PNN SNR-vs-depth.
**Map:** give **SPORE-SUBSTRATE-004** an enforceable structural shape — a compiler pass verifies every dataflow
edge from a `substrate{lane:noisy}` value into a deterministic sink passes through an **attested reducer**
(`expectation` path, or `voted@N` via consensusTrit/TMR with residual variance < ε). A bare un-voted noisy
sample → DENY. Reuses the shipped `safety{require deterministic_execution}` sink + the `vAnd` no-coercion theorem.
**First step:** define the two admissible reducer kinds in `galerina-substrate-contracts.md`; B3 fixture where an
unreduced noisy edge into a safety sink is DENY.

### #5 — Enrich `PrecisionTechnique` with a grounded low-bit taxonomy + storage-vs-compute split · **A** · S
Source: MiniCPM/BitCPM spectrum + ModelOpt exact-vs-calibrated cast.
**Map:** widen the narrow `PrecisionTechnique` union (`precision-types.ts`) to real production techniques:
`ternary-QAT(1.58b) | int4-QAT | gptq | awq | marlin | nf4 | gguf-Qk | fp8`; a contract declares expected
technique+bit-width, a pass verifies the bridge artifact against an allow-list (BitNet requires `ternary`;
a noisy lane forbids high-precision crypto per SPORE-SUBSTRATE-001). Add `storagePrecision` vs
`computePrecision` (the fake-quantized case).
**Why:** the enum is too narrow today to honestly govern non-BitNet quantized bridges. Low effort, high honesty.
**First step:** extend the union + add storage/compute fields; test: a manifest claiming `gptq` on a noisy lane → deny.

### #6 — `recipe{}` contract sub-block: the whole precision policy as one declarative, deny-by-default object · **A** · M
Source: ModelOpt recipes + TE frozen `Recipe` dataclasses + fusion-group homogeneity.
**Map:** a `recipe{}` (or `precision{}`) sub-block, sibling of the shipped `substrate{}` block:
`PrecisionTechnique` + per-module overrides + scale-strategy(`per_tensor|block|hierarchical`) + block_size +
amax_algo. **Deny-by-default**: a base `disable-all` clause means no module leaves the high-precision path
unless explicitly re-enabled (direct analogue of ModelOpt `base_disable_all '*' enable:false`). A pass enforces
TE `__post_init__`-style rejections **at compile time** (pure-lossy with no high-precision fallback → reject;
pure-E5M2 → reject) and emits the recipe hash into the manifest.
**First step:** `galerina-precision-recipe-contract.md` sketching the grammar (mirroring the `substrate{}` block)
+ 2-3 compile-time rejection rules transcribed from TE asserts.

### #7 — Fusion-group precision-homogeneity invariant · **A** · S
Source: ModelOpt recipe-search runtime fusion rules.
**Map:** a static invariant inside `recipe{}` (spirit of Static Manifest Clamping, structurally identical to
SPORE-SUBSTRATE-002): declare fusion groups as named module sets; verify all members share one
`PrecisionTechnique`. New diagnostic **SPORE-PRECISION-FUSE** (deny if any member's format is unset/divergent).
**Why:** a purely-statically-checkable invariant grounded in a real deploy failure (vLLM fused in_proj /
fused MoE gate+up); zero kernel contact. Small once #6 exists.

### #8 — Manifest-record the noise-model identity (distribution/encoding/gain) · **X** · S
Source: SPDNN (K gives different accuracy across noise models) + PNN multi-axis loss budget.
**Map:** add a `NoiseModel` descriptor to the substrate manifest record (distribution bernoulli/poisson,
encoding coherent/incoherent, gain/slope, expectation-formula id); a pass refuses to honor a tolerance ε
attested under model A when the deployed lane declares model B. The (N,ε) witness from #3 is only valid
against the model it was measured on. Slots beside `substrate-model.ts` calibration knobs (PHASE/XTALK/READOUT_GAIN).
**Why:** prevents a subtle fail-OPEN — a tolerance proven for one distribution silently reused on another.

### #9 — `routePrecision` lane axis = a per-inference shot/photon budget `K` the runtime authorizes & audits · **B** · L
Source: SPDNN (shot budget K) + PNN (SNR degrades with mesh depth).
**Map:** ground the **planned** `routePrecision()` axis: a capability gate BOUNDS the per-inference budget K
(min..max) the way V_DPM bounds caps, DENYING any request below `K_min(ε,N)`; a sentinel MONITORs and the audit
log RECORDS the K actually used. Optionally a declared mesh topology/depth bound (Clements vs Reck).
**Why:** precision isn't just per-op bit-width but the **depth/shot-budget** of the noisy route a value travels —
the dominant reliability driver in both repos. Every relaxation of precision becomes logged + authorized, not silent.
**First step:** `galerina-routeprecision-axis.md` defining K as a V_DPM-style bounded capability + the
`K_min(ε,N)` deny rule computed from the existing `nmrFailureProbability`.

### #10 — Deny-by-default tool-call schema gate: reject the WHOLE call on any invalid param · **X** · M
Source: MiniCPM XML tool parser + func/param/value conformance metric.
**Map:** an `ai{}`/inference-bridge clause: the Brain `CompiledPolicy` table treats each declared tool as a
capability whose params are a typed manifest; a pass verifies the model's emitted tool call against it; the
authorizer returns three-valued DENY/INDETERMINATE on any unknown/duplicate/missing param instead of
forwarding a partial call. "Clear args then drop the call" = deny-by-default at the egress sentinel. The
func/param/value tri-metric feeds per-tool reliability → capability admission/revocation.
**Why:** concrete battle-tested pattern for validating **untrusted model output** at the trust boundary, with
whole-call rejection semantics — strengthens the egress-sentinel + `ai{}` tool story.

### #11 — Streaming carry-state provenance: a supplied recurrent state must be hash-pinned + signed before resume · **A** · M
Source: linear_open_lm carry-state + decay-stability bound.
**Map:** a manifest provenance entry for any externally-supplied recurrent/streaming state: SHA-256 pin +
Ed25519 signature (reuse the attested-bridge pattern, no new crypto); state/egress sentinels accept a resume
only if hash+sig match, else DENY. Companion structural rule: on a noisy lane require a **contractive carry
(decay γ<1)** so bounded per-step error can't blow up; forbid a non-contractive accumulator into a
deterministic sink (SPORE-SUBSTRATE-004 analogue).
**Why:** carrying a compact recurrent state across requests is a NEW trust surface (state injection ⇒ full
output control). Same Ed25519+SHA-256 discipline already used for bridges.

### #12 — Fidelity / quantization-health as a manifest-recorded numeric oracle a verifier thresholds · **X** · S
Source: PNN fidelity oracle (0..1) + TE `LogFp8TensorStats` (underflow%/overflow%/MSE).
**Map:** record a closeness oracle in the manifest beside `precision`: normalized `measured_fidelity` and/or
quant-health stats; the `tolerance` path accepts only if `measured ≥ declared min_fidelity` (or stats ≤ budget),
fail-closed, written to the audit record. A measured field the **bridge supplies** and Galerina **thresholds**.
**Why:** the missing quantitative "how close to ideal was this run" observable that turns
tolerance-provable-at-N into something a sentinel can actually evaluate and log.

---

## 3. Cross-cutting themes

1. **Calibration/quantization-as-attestation** — declared→verified→recorded numeric facts on `BridgeManifest`+`DeterminismMode`.
2. **Tolerance-provable-at-N as a witnessed monotone curve, not a constant** — SPDNN(K), TE(amax-history/sync), ModelOpt(gated reruns) all witness ε against a measured (N, residual-variance) pair, valid only for the noise model it was measured on. Hardens SPORE-SUBSTRATE-002/-003.
3. **Noise-aware safe-conversion at the deterministic boundary** — expectation / N-voting before a deterministic sink; mirrors SPORE-SUBSTRATE-004 + the `vAnd` no-coercion theorem. Noise degrades availability, never manufactures an ALLOW.
4. **Deny-by-default + explicit re-enable as the canonical precision-policy shape** — ModelOpt `disable_all` + TE `__post_init__` reject structurally-impossible configs at COMPILE time. External validation of Galerina's own stance.
5. **Widen the pinned surface beyond weights** — config/converter/sync/comparability/noise-model drift silently produces garbage; `backendArtifactHash`/`pinnedEnvHash` should cover them, not just tensor weights.
6. **Untrusted output AND untrusted state as first-class trust boundaries** — a tool call or a resumed recurrent state must FULLY satisfy a declared schema and carry Ed25519+SHA-256 provenance or be denied whole.

---

## 4. Guardrail flags — tempting but DO NOT cross (govern, don't absorb)

1. **ModelOpt #5 / TE delayed-scaling amax math** — do NOT port scale-derivation formulae into core. Only DECLARE the determinism class (exact = data-independent + replayable formula id; calibrated → `tolerance` + calibration-dataset hash) and VERIFY the claim. The bridge computes the cast; Galerina attests its class.
2. **SPDNN / PNN physics math (noise curves, straight-through, Lp/Lc budgets, SNR/depth)** — do NOT reimplement a photonic noise simulator. `substrate-model.ts` is already the correct conservative software-checker boundary. New work = DECLARE budget/model/witness, RECORD in manifest, THRESHOLD in `verifySubstrate`.
3. **Governing a photonic ML accelerator (Lightmatter-class) as a Brawn bridge** — correctly governance-shaped (reuse the `QuantumSimBackend` Tier-3 attested-bridge pattern), but keep it at the bridge/attestation boundary; the *value* is governing a backend whose math Galerina cannot re-derive (forces `tolerance` + all-3-pins).
4. **Any new hash/signature/tree-hash for precision or state provenance** — binding decision stands: KEEP SHA-256 + ML-DSA-65-over-digest, invent no crypto, no `.tmf`/TMX coupling. #1 and #11 MUST reuse the existing Ed25519+SHA-256 path.
5. **Enum/noise-descriptor scope creep** — keep `PrecisionTechnique` + `NoiseModel` a CLOSED governance-relevant vocabulary (technique id + bit-width + storage-vs-compute), not an open config dump of every kernel's hyperparameters.

---

## 5. Honest low-yield (don't chase)

- **Raw kernel/math internals** of every project — evidence that a governance invariant is real, NOT code to port.
- **Perf/footprint headline numbers** (MiniCPM "90% reduction", SPDNN "99.19%") — usable only as a witness VALUE a manifest records, never a Galerina claim.
- **Photonic simulator stacks (FDTD/BPM/OptSim)** — design-time tooling, not a runtime Brawn surface; only the "optical-analog backend forces tolerance mode" conclusion is worth keeping.
- **`linear_open_lm` bounded-state as standalone** — the memory sentinel already bounds working set; fold into #11.
- **MiniCPM training-data tool-filtering** — upstream data-pipeline practice; only the runtime corollary (audit-sentinel monitors per-tool failure → capability revocation) is in-scope.
- **Photonics-Guide / awesome_photonics** as code — link catalogs; value is vocabulary + the Tier-3 bridge/interchange-format candidates only.

---

## 6. Recommended sequencing (architect's read)

The highest-leverage cluster builds directly on the **just-shipped** tolerance/determinism manifest work and
needs **no external infra**:

1. **#5** (taxonomy, S) → **#2 + #12** (measured tolerance + fidelity oracle, M+S) — *finish the measured half
   of the determinism model.* This is the single most coherent next step; all three extend `contract.test.mjs`
   + `validateManifestShape`.
2. **#3 + #4** (substrate witness + typed reducer, M+M) — harden the shipped `verifySubstrate` /
   SPORE-SUBSTRATE-002/003/004 from asserted constants to witnessed curves; SPDNN gives the physical precedent.
3. **#1** (precision attestation gate, M) — closes a real fail-OPEN in the Brawn attestation path.
4. **#6 + #7** (`recipe{}` block + fusion homogeneity) — a larger architectural addition; **design doc first**.
5. **#9** (`routePrecision`, L) and **#10/#11** (tool-schema gate + carry-state provenance) — grounded design targets for the next lane expansion.

Nothing here justifies new core machinery, new crypto, or absorbing any project's math.
