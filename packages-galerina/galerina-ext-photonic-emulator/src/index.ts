// @galerina/ext-photonic-emulator — the photonic-PPU backend package.
//
// A physics-faithful (Rung-2) ternary-MAC emulator + the partition cost-model router,
// behind the neutral @galerina/inference-bridge-contract. Digital stays the default and is
// byte-unchanged; an eligible kernel routes to the emulator ONLY on a proven net win and
// is re-verified — fail-closed to digital. EMULATED, not silicon (no measured speedup).
//
// Ports the prove-own-maths artifacts:
//   D1 emulator  — rd-photonic-ppu-emulator-proof.mjs   (18/18)
//   D2 router    — rd-photonic-ppu-cost-model-proof.mjs (25/25)

// ── D1: the physics-faithful emulator ──────────────────────────────────────────────
export {
  type PhysParams,
  ACT_MAX, ENOB_CEILING, PHOTONIC, NOISY,
  Xorshift32,
  tmacExact, analogVarianceClosedForm, adcRange, quantStep,
  tmacPhotonic, tmacVoted, N_MAX_VOTES, clampVotes,
  wdmCrosstalkMatrix, applyWdm,
  flipProbability, singleLaneErrorProbability, binom, nmrFailureProbability,
} from "./emulator.js";

// ── re-verify: verify-cheap, never re-execute ───────────────────────────────────────
export { freivaldsVerify, freivaldsVerifyCost, toleranceCheck } from "./freivalds.js";

// ── D2: the partition cost-model router (the `target.photonic` selector) ─────────────
export {
  type Target, type Lane, type KernelCost, type Decision,
  NS, W_REP, meechRealizedRatio, requiredRedundancy,
  Tdigital, Tphotonic, crossover,
  PartitionDecider,
} from "./partition-decider.js";

// ── the bridge (neutral contract) + the fail-closed runtime path ─────────────────────
export {
  type PhotonicBackend, type PhotonicBridgeConfig,
  PhotonicEmulatorBridge,
} from "./photonic-bridge.js";
export { type PhotonicRunResult, PhotonicRuntime, type PhotonicRouteHit, createPhotonicRouterPort } from "./runner.js";

// ── the photonic-HARDWARE switch — emulator (default) ⇄ attested real silicon, fail-closed, keep-digital ──
export {
  type PhotonicMode, type PhotonicHardwareBackend, type PhotonicSwitchOptions, type PhotonicSwitchDecision,
  selectPhotonicBackend, resolvePhotonicBackend,
} from "./photonic-switch.js";

// ── the Bifurcated Execution Invariant — semantic-parity conformance gate ────────────
export {
  type ParityOptions, type ParityResult, type ParityReport,
  checkParity, proveBifurcatedParity,
} from "./parity-conformance.js";

// ── digital FEC for the post-ADC readout — extended Hamming(8,4) SEC-DED, fail-closed / degrade-only ──
// Corrects 1-bit, DETECTS 2-bit (uncorrectable, never miscorrected). NOT for crypto/verdict (those stay
// bit-exact on the digital core); a complement to NMR voting + the conformance gate, never trusted alone.
export {
  type EccDecode, type EccBlockResult,
  eccEncodeNibble, eccDecodeNibble, eccEncode, eccDecode,
} from "./digital-ecc.js";
