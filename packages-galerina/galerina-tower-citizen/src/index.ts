// ── TLSTP S4 — the Recovering transport FSM above K3 (pure wrapper over decideAtBoundary) ──
export { step as transportStep, permitData, initialContext as initialTransportContext } from "./transport-fsm.js";
export type { TransportState, FsmContext, FsmEvent, StepResult, RecoveryConfig, ChannelKeys } from "./transport-fsm.js";

export { TowerRuntime } from "./tower-runtime.js";
export { AuditLogger } from "./audit-logger.js";
export type { AuditLoggerOptions, EgressSink } from "./audit-logger.js";
export { PluginSandbox } from "./plugin-sandbox.js";
export type { TowerConfig } from "./tower-runtime.js";
export type { TowerAuditEvent, AuditFilter } from "./audit-logger.js";
export type { PluginMetadata, ExecutionResult } from "./plugin-sandbox.js";

// ── Unified Hybrid Inference Engine — best-of-all-three (BitNet + NVFP4 + Groq) ──
export { HybridInferenceEngine, createHybridEngine } from "./hybrid-engine.js";
export type { HybridInferenceRequest, HybridInferenceReceipt, AiGovernance } from "./hybrid-engine.js";
export type { PhotonicConfig, PhotonicOffloadPort, PhotonicKernelCost } from "./hybrid-engine.js";
export {
  routePrecision,
  planHybridInference,
  TECHNIQUE_SOURCE,
  TECHNIQUE_BITS,
  OP_SENSITIVITY,
  LOOSE_TOLERANCE,
} from "./precision-strategy.js";
export type {
  PrecisionTechnique,
  SchedulingTechnique,
  InferenceOpClass,
  PrecisionDecision,
  RoutingContext,
  HybridPlan,
} from "./precision-strategy.js";

// ── Virtual Photonic Processor — BitNet-faithful ternary core (TPL Standard v1.0) ──
export { TPLSimulator, TritState, SecurityTrap, TPLIntegrityFault } from "./tpl-simulator.js";
// Balanced-ternary logic gates (#196/#173) — carry-free SUM (== XOR), carry, AND/OR, multiply, consensus.
export {
  negTrit, sumTrit, xorTrit, carryTrit, addTrit, mulTrit, minTrit, maxTrit, consensusTrit,
} from "./tpl-simulator.js";
export { GovernanceEnforcer, TPL_DEFAULT_POLICY } from "./governance-enforcer.js";
export type { TransitionPolicy, RestrictedTransition } from "./governance-enforcer.js";

// ── Three-valued governance verdicts (Direction A) — proved fail-closed ──
// Kleene K3 over the trit (vAnd=minTrit ∧, vOr=maxTrit ∨, vNot=negTrit ¬); collapse
// at the trust boundary (0,-1 → deny); FUNGI-GOV-3VL-001 audits 0→deny. Never silent.
export {
  Verdict, vAnd, vOr, vNot, allOf, anyOf, collapse, authorize,
  decideAtBoundary, GOV_3VL_DIAGNOSTIC,
  vAndTensor, vAndTensor2D, consensusTritN, collapseConfidence,
} from "./three-valued-governance.js";
export type { ConfidenceVerdict } from "./three-valued-governance.js";
export type { GovernanceDiagnostic, BoundaryDecision } from "./three-valued-governance.js";

// ── Epistemic type-state — the trust trit lifted from verdict to value (RD-0337) ──
// The four tri-native safety primitives + the 3-axis type, all a thin proven lift over
// three-valued-governance: values carry a first-class CONTAGIOUS, FAIL-CLOSED epistemic
// trit (proven/unknown/refuted); the only lift to PROVEN is an explicit discharge; a
// non-proven value deny-collapses at the boundary (FUNGI-GOV-3VL-001). Safety under
// REPRESENTED (not eliminated) uncertainty — the tri-native element binary cannot express.
export {
  Trust,
  unverified, trustedRoot, refute, discharge,
  map, combine, combineAll,
  isTrusted, isUnverified, isRefuted, trustOf,
  requireTrusted,
  optimistic, reconcile,
  allContracts, anyContract, evaluateContract,
  validateTriSchema,
  classJoin, triTyped, combineTriTyped, declassify, releaseTo,
} from "./epistemic-type-state.js";
export type {
  Epistemic, Trusted, Unverified, Refuted, TrustBoundaryResult,
  Contract, EnforcementMode, ContractOutcome,
  FieldRequirement, TriFieldSpec, TriSchema, TriFieldResult, TriSchemaResult,
  Classification, TriTyped, ReleaseResult,
} from "./epistemic-type-state.js";

// ── Per-user data hard border — Qexecuted = Q ∩ S_user (owner note 54 / IDOR, CWE-639) ──
// K3 set-intersection at the query boundary: caller scope comes ONLY from the proven .spore passport, never a
// `?user_id=` param; a developer `where` may only narrow. Visibility is fail-closed PRIVATE by default —
// only an exact attested `"public"` widens, so a forgotten/typo'd marker over-denies, never leaks.
export {
  vaultIsPublic, admitRowVerdict, admitRow, intersectUserScope,
} from "./data-plane-border.js";
export type { VaultManifestEntry, VaultRegistry, DataRow, UserScope, BorderPolicy } from "./data-plane-border.js";

// ── Hallucination-proof AI action admission — No-Coercion made a headline guarantee ──
// An AI is an UNTRUSTED proposer; the core is the gate. An action executes IFF min(core, ai) = ALLOW, so
// the AI can only pick WITHIN the core-allowed set — never expand it. Containment + No-Coercion theorems
// are checked live (fail-closed); blockedHallucinations surfaces the guarantee as audit evidence.
export { governAiProposal } from "./ai-governance.js";
export type { AiActionProposal, AiActionDecision, AiGovernanceResult } from "./ai-governance.js";

// ── K3 ternary partial-return / `Masked` per-field response shaper (R&D 0108 #2) ──
// Per-field vAnd fold at an output boundary: authorized fields pass through, DENY/
// INDETERMINATE fields become a typed Masked sentinel (keep-the-rest), fail-closed +
// deny-by-default. Three-valued counterpart to whole-record redact/seal masking.
export { partialReturn, maskByVerdict, isMasked } from "./partial-return.js";
export type { Masked, FieldVerdict, PartialReturn } from "./partial-return.js";

// ── T-as-signed-artifact admission rail (R&D 0108 #3) — admit a photonic-config blob ──
// (the matrix T that reprograms the PPU) as SIGNED code before reprogram: hash-pin +
// Ed25519 + revocation + photonic.reprogram capability, fail-closed. Freivalds verifies the
// RESULT; this verifies T is the AUTHORIZED matrix. Crypto Binary; the apply is HW-gated.
export {
  admitPhotonicConfig, signPhotonicConfig, photonicConfigHash,
  generatePhotonicConfigKeypair, PHOTONIC_REPROGRAM_CAP,
} from "./photonic-admission.js";
export type {
  PhotonicConfigManifest, PhotonicConfigAttestation, PhotonicAdmissionPolicy, PhotonicAdmission,
} from "./photonic-admission.js";

// ── Fail-closed TTL capability lease (R&D 0109 G6) — bounded delegation that actually expires ──
// checkLease admits a lease through the shipped K3 boundary: ALLOW only within (now < notAfter);
// expired -> DENY; malformed/absent -> INDETERMINATE/FUNGI-GOV-3VL-001. Pure (the caller passes now).
export { checkLease, isLeaseValid, leaseVerdict } from "./lease.js";
export type { CapabilityLease, LeaseDecision, LeaseDenyReason } from "./lease.js";

// ── Triple-lock key-rotation DECISION core (#28/D2, steps 1–3) — owner-unlocked 2026-07-10 ──
// Append-only MAC'd-head KeyRing (epochs never deleted → verify capability retained forever);
// gates: readiness R1-R3 → triple lock allOf([A,B,C]) → switch → triple-verify → drain → retire
// (signing power only; symmetric destroy = structural DENY). Atomic by immutability: abort
// returns the SAME process object. DI seams fail-closed; key BYTES never enter this module —
// custody execution (step 5) is a separate owner-gated package.
export {
  createKeyRing, verifyRing, activeEpoch, epochForVerification,
  stageEpoch, switchActive, fallbackSwitch, markRevoked,
  readinessVerdict, lockAVerdict, lockBVerdict, lockCVerdict, tripleLockVerdict,
  tripleVerifyVerdict, drainVerdict, retireVerdict,
  beginRotation, checkReadiness, stageCandidate, commitTripleLock, switchEpoch,
  confirmTripleVerify, fallbackToOldEpoch, confirmDrain, retireOldEpoch,
} from "./key-rotation.js";
export type {
  KeyKind, KeyEpochStatus, KeyEpoch, KeyRing, Transition,
  RotationCtx, GateResult, ReadinessEvidence, VerifyEvidence, DrainEvidence,
  RetirePolicyMode, RetirePolicy, RotationPhase, RotationProcess, PhaseOutcome,
} from "./key-rotation.js";

// ── Distinct-signer M-of-N threshold quorum (R&D 0109 G2, core half) — K3 custody DECISION ──
// checkQuorum folds per-signer verdicts: ALLOW iff >= M DISTINCT signers approve (anti-Sybil,
// no equivocation); clean shortfall -> DENY; malformed/equivocation -> INDETERMINATE/FUNGI-GOV-3VL-001.
// Governance only — the Shamir secret-share split/combine is custody EXECUTION (ext package).
export { checkQuorum, meetsQuorum, quorumVerdict } from "./quorum.js";
export type { SignerVote, QuorumDecision, QuorumDenyReason } from "./quorum.js";

// ── FUNGI-RETAIN-001 sound-erasure gate (R&D 0116/0118) — the Substrate Dispatch Gateway runtime defense ──
// admitSubstrateWrite is fail-closed K3: an eraseModel is NEVER taken from a drive's self-report;
// `overwrite` needs a verified signed attestation, else fail-closed to the stricter `crypto-only`.
// A cleartext secret to crypto-only media is UNERASABLE (overwrite-erase impossible) -> DENY; seal
// (KEM-DEM) first and "delete" by destroying the DEK. Closes the R&D 0116 WORM-media fail-open.
export {
  admitSubstrateWrite, effectiveEraseModel, STORAGE_ADMIT_CAP,
  admitStorageSubstrate, signSubstrateAttestation, generateSubstrateKeypair,
} from "./substrate-erasure.js";
export type {
  EraseModel, SubstrateDescriptor, WritePayload, SubstrateWriteAdmission,
  SubstrateAttestationManifest, SubstrateAttestation, SubstrateAdmissionPolicy, StorageSubstrateAdmission,
} from "./substrate-erasure.js";

// ── Substrate failure-mode model (Direction C) — seeded, fail-closed ──
// Models photonic/ternary noise (phase-drift/crosstalk/lane-failure/readout) in software.
// effectiveVerdict = vAnd(ideal, reading): noise can cost availability, never safety.
// Canonical check = closed-form von Neumann NMR; NoisyLane is the seeded fault-injector.
// FUNGI-SUBSTRATE-001..004. Compiler/substrate{}-grammar wiring is deferred to Direction B.
export {
  SubstrateParamError, singleLaneErrorProbability, nmrFailureProbability, majorityVote,
  NoisyLane, effectiveVerdict, checkGuarantee, verifyToleranceUnderNoise,
  empiricalAdversarialError, votedTrit3, SUBSTRATE_DIAGNOSTICS,
} from "./substrate-model.js";
export type {
  SubstrateParameters, Reading, Neighbors, SubstrateGuarantee, SubstrateCheckResult,
  SubstrateDiagnostic, SubstrateVerifyContext, SubstrateProfile, SubstrateDecision,
} from "./substrate-model.js";
// K3-0 dead-zone policy executor (runtime enforcer of the parsed `on_indeterminate` policy).
export { dispatchDeadZone, SubstrateDeadZoneTrap, DEFAULT_ON_INDETERMINATE } from "./deadzone-dispatcher.js";
export type { OnIndeterminate } from "./deadzone-dispatcher.js";
// Calibration-as-attestation: a SubstrateModelSnapshot whose noise figures are stamped FROM the model
// (checkGuarantee), self-verifying + fail-closed so a producer/HW cannot game the tolerance down.
export { buildSubstrateSnapshot, verifySubstrateSnapshot, canonicalSnapshot } from "./substrate-snapshot.js";
export type { SubstrateModelSnapshot, SnapshotVerdict } from "./substrate-snapshot.js";

// ── Hardware Execution Bridge — the Brain/Brawn seam (native FFI contract) ──
export { assertDeterminism } from "./bridge/interface.js";

// ── Bridge attestation (CF-3 / CF-7) — signed manifest verification ──
export {
  attestationHash, signManifest, verifyAttestation, generateAttestationKeypair, attestBridge,
  signManifestHybrid, verifyAttestationHybrid, generateHybridAttestationKeypair, attestBridgeHybrid,
} from "./bridge-attestation.js";
export type { AttestationPolicy, AttestationResult } from "./bridge-attestation.js";

// ── Capability grant (RD-0236 #1) — signed V_DPM capability authority ──
export {
  canonicalGrantString, capabilityGrantHash, signCapabilityGrant, signCapabilityGrantHybrid, verifyCapabilityGrant,
} from "./capability-grant.js";
export type { CapabilityGrant, SignedCapabilityGrant } from "./capability-grant.js";

// ── Plugin manifest (RD-0236 #10) — signed plugin-metadata + hash-vs-bytes verification at load ──
export {
  canonicalPluginManifestString, pluginManifestHash, artifactBytesHash,
  signPluginManifest, signPluginManifestHybrid, verifyPluginManifest,
} from "./plugin-manifest.js";
export type { SignedPluginManifest } from "./plugin-manifest.js";

// ── Numeric policy table — ai{} compiled once into packed flags + membership Set ──
export {
  compilePolicy,
  POL_HAS_ALLOWLIST, POL_DENY_HOST_NATIVE, POL_HAS_CALL_BUDGET, POL_HAS_TOKEN_BUDGET, POL_HAS_COST_CEILING,
} from "./compiled-policy.js";
export type { CompiledPolicy, PolicyTrap } from "./compiled-policy.js";

// ── GateCache — memoize the COMPILED governance evaluator, NEVER the decision (#194) ──
export {
  GateCache, defaultGateCache, compilePolicyCached, policyCacheKey,
} from "./gate-cache.js";
export type { GateCacheStats } from "./gate-cache.js";
export type { InferenceBridge, BridgeOp, BridgeResult, BridgeRegistry } from "./bridge/interface.js";
export { StubTernaryBridge, StubFp4Bridge, createStubRegistry } from "./bridge/stub-provider.js";
