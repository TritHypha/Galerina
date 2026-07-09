# ARCHITECTURE_ISSUES — galerina-tower-citizen

Cross-package / global changes discovered while implementing the TPL Virtual
Photonic Processor. Per the package-isolation directive, these are **logged here,
not implemented**. Each needs a decision before it can land in the wider project.

---

## 1. Native FFI bridge to bitnet.cpp (the real kernel)

- **Status:** The `TPLSimulator` is a byte-faithful CPU reimplementation of BitNet's
  I2_S ternary kernel — the encoding, packing, and T-MAC match
  `C:\Users\phill\Documents\GitHub\BitNet\src\ggml-bitnet-mad.cpp` exactly. But it executes the dot
  product in scalar TypeScript, not via BitNet's SIMD kernels (`ggml_vec_dot_i2_i8_s`,
  AVX2/NEON `vdotq_s32`).
- **Need:** For production throughput (the BitNet 5–7 tok/s benchmark), the T-MAC must
  dispatch to the real C kernel via the planned `galerina-ext-bridge-cpp` package — a
  Node native addon or WASI-NN backend wrapping `ggml_bitnet_mul_mat_task_compute()`.
- **TODO:** Build `galerina-ext-bridge-cpp` (already on the roadmap, task series #119).
  The `TPLSimulator.tmacVector()` signature is the seam: swap the scalar loop for an
  FFI call when the addon is present, keeping the governance/audit wrapper unchanged.
- **Why not here:** The native addon build (CMake + node-gyp) and the BitNet library
  link belong in a dedicated `galerina-ext-bridge-*` package, not in this pure-TS plugin.

## 2. governance.fungi schema — `state_transition_policy` object

- **Status:** `GovernanceEnforcer` hardcodes the TPL v1.0 default policy
  (`0 → 1` requires `audit_signature` + `input_schema_validation`).
- **Need:** This policy should be declared in `governance.fungi` and parsed by the core
  compiler, so the transition rules are governed source — not a TypeScript constant.
- **TODO:** Add a `state_transition_policy { restricted_transitions { ... } }` block to
  the Galerina grammar + governance verifier (core compiler). Then `GovernanceEnforcer`
  loads the policy from the compiled manifest instead of `TPL_DEFAULT_POLICY`.
- **Why not here:** Grammar + verifier changes live in `galerina-core-compiler`, outside
  this package.

## 3. NVFP4 path for the hybrid engine (`fp4_block` technique)

- **Status:** `precision-strategy.ts` routes bandwidth-bound ops to `fp4_block`
  (NVIDIA NVFP4), but the technique currently has no execution backend — only routing
  and audit attribution. The source is available at `C:\Users\phill\Documents\GitHub\TransformerEngine`.
- **Need:** An FP4 block-scaled GEMM backend (E2M1 + 16-element block scale) reached via
  the same FFI bridge, gated on Blackwell hardware detection.
- **TODO:** `galerina-ext-bridge-nvfp4` (roadmap task #122, hardware-gated). The hybrid
  engine already produces the per-op decision; only the kernel dispatch is missing.
- **Why not here:** Requires CUDA toolchain + Blackwell hardware; belongs in its own
  hardware-gated ext package.

## 4. WASM SIMD (`v128`) acceleration of the simulator core

- **Status:** `TPLSimulator` uses scalar `Int32Array` operations. Correct and
  deterministic, but not vectorised.
- **Need:** To approach native throughput in browser/WASM deployments, the T-MAC loop
  should use `v128` intrinsics (64 trits per 128-bit register) when the runtime
  advertises SIMD support.
- **TODO:** Evaluate a `v128` fast-path that preserves the exact bit-packing and the
  vector-level audit boundary. Keep the scalar path as the deterministic reference and
  cross-check the two in tests.
- **Why not here (yet):** This is an in-package optimisation and *could* live here, but
  it depends on the chosen WASM build pipeline (emscripten vs hand-written WAT) which is
  a wider toolchain decision still open in the core project.

## 5. Manifest CBOR tag for the TPL transition ledger

- **Status:** TPL transitions are logged via the existing `AuditLogger` (JSONL).
- **Need:** To appear in the signed `.lmanifest` audit narrative, TPL transitions should
  map to the CBOR Tag 410 AuditEvent schema used by the rest of the Tower.
- **TODO:** Confirm the `tpl_transition` detail shape conforms to the Tag 410 field set
  in `manifest-generator.ts` (core compiler), or extend the schema if a TPL-specific
  sub-record is wanted.
- **Why not here:** Manifest generation + CBOR tags live in `galerina-core-compiler`.

---

## Deep-analysis findings (2026-06-06)

**FIXED this session (governance-first hardening):**
- ✅ `approvedModels` bypass — omitting `model` under an allow-list now traps
  `ERR_AI_MODEL_REQUIRED` (was an implicit pass).
- ✅ Silent host-native fallback — `AiGovernance.denyHostNativeFallback` traps
  `ERR_HOST_NATIVE_DENIED` for any routed precision with no registered bridge
  (aerospace/Tier-1 mode). Default permissive.
- ✅ Corruption masking — `StubTernaryBridge` now TRAPS the illegal `0b11` trit
  encoding instead of decoding it to 0.
- ✅ `engine.shutdown()` releases all bridges once at teardown (not per-infer —
  registry bridges are shared).

**DEFERRED (throughput refactor — the next pass):**
- **Packed end-to-end:** `StubTernaryBridge` still decodes packed `Int32Array`
  weights into a `number[]` and reloads a fresh simulator per op. Should execute
  directly over the packed buffer (no decode/reload, no per-op allocation) to keep
  the ternary memory-bandwidth advantage.
- **Fixed-point scale:** `i2_scale` is a JS `number` → IEEE-754 after the integer
  T-MAC. For bit-exact replay it should be `{ mantissa, shift }` (quantized).
- **`BridgeOp` metadata:** add matrix shape / strides / layout tags / block-scale /
  tile + alignment / memory-handle ownership so NVFP4 tensor-core and photonic
  bridges can be wired without widening the contract later.
- **`canCommit()` in `execute()`:** the cpp BitNet bridges define `canCommit()` but
  don't call it before compute — the Governance Signal is aspirational there.
- **Continuous determinism sampling:** cpp native-vs-simulator cross-check stops
  after 8 calls; aerospace needs continuous sampling or a certified replay mode.
- **`tmacVector` COMMIT gate:** the vector T-MAC path logs a transition without
  consulting `GovernanceEnforcer.checkTransition()` (the single-gate path does).
