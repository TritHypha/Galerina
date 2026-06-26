// =============================================================================
// galerina-core-compiler — compiler pipeline contracts
//
// Package: @galerina/core-compiler
// Role:    Parsing, checking, diagnostics, and IR contracts for the
//          Galerina compiler pipeline.
//
// Phase 3: scanner-level safety rules (validateCoreSyntaxSafety)
// Phase 4: lexer + parser (lex, parseProgram)
// Phase 5: effect checker (checkEffects, checkFlowEffects)
// =============================================================================

// Phase 4 — Lexer
export {
  lex,
  V1_ACTIVE_KEYWORDS,
  V1_FUTURE_RESERVED,
  V1_DEPRECATED_RESERVED,
  TokenKindId,
  type Token,
  type TokenKind,
  type TokenKindIdValue,
  type LexResult,
  type LexerDiagnostic,
} from "./lexer.js";

/** SPORE-LEX-001: Generic type nesting exceeds maximum depth (8 levels). */
export const SPORE_LEX_001 = {
  code: "SPORE-LEX-001",
  name: "ExcessiveNesting",
  severity: "error" as const,
  message: "Generic type nesting exceeds maximum depth (8 levels). Simplify the type.",
  suggestedFix: "Use a type alias to break up deeply nested generics.",
} as const;

/** SPORE-LEX-002: String literal or identifier exceeds maximum length (10,000 characters). */
export const SPORE_LEX_002 = {
  code: "SPORE-LEX-002",
  name: "OversizedToken",
  severity: "error" as const,
  message: "String literal or identifier exceeds maximum length (10,000 characters).",
  suggestedFix: "Split large string literals or shorten identifier names.",
} as const;

/** SPORE-LEX-003: Invalid unicode escape sequence in string literal. */
export const SPORE_LEX_003 = {
  code: "SPORE-LEX-003",
  name: "InvalidUnicodeEscape",
  severity: "error" as const,
  message: "Invalid unicode escape sequence in string literal.",
  suggestedFix: "Use \\u{XXXXXX} with 1-6 hex digits, or \\uXXXX with exactly 4.",
} as const;

/** SPORE-LEX-004: Source file exceeds the 10 MB maximum. */
export const SPORE_LEX_004 = {
  code: "SPORE-LEX-004",
  name: "FileTooLarge",
  severity: "error" as const,
  message: "File exceeds maximum size (10MB). Split into smaller files.",
} as const;

/** SPORE-LEX-005: A single line exceeds 10,000 characters. */
export const SPORE_LEX_005 = {
  code: "SPORE-LEX-005",
  name: "LineTooLong",
  severity: "warning" as const,
  message: "Line exceeds maximum length (10,000 characters).",
} as const;

/** SPORE-LEX-006: Lexer emitted too many diagnostics; further errors suppressed. */
export const SPORE_LEX_006 = {
  code: "SPORE-LEX-006",
  name: "TooManyDiagnostics",
  severity: "error" as const,
  message: "Lexer emitted the maximum number of diagnostics (100). Further errors suppressed. Fix the first errors and re-compile.",
  why: "Emitting thousands of cascading diagnostics from a single malformed file wastes resources and obscures the root cause.",
  suggestedFix: "Fix the first reported errors — cascading errors usually disappear once the root cause is resolved.",
} as const;

// Phase 4 — Parser
export {
  parseProgram,
  NodeFlags,
  type NodeFlagsMask,
  type AstNode,
  type AstNodeKind,
  type ParseResult,
  type ParseDiagnostic,
  type FlowMeta,
  type SourceLocation as ParserSourceLocation,
} from "./parser.js";

// Phase 5 / 18E / 18H / 19A — Effect Checker
export {
  checkEffects,
  checkFlowEffects,
  checkStdlibEffects,
  effectResultsToDiagnostics,
  EFFECT_REGISTRY,
  LEGACY_EFFECT_CALL_PATTERNS_COUNT,
  inferEffectsForOperation,
  inferDirectEffectsForFlow,
  buildModuleAliasMap,
  buildFlowEffectSummary,
  type EffectCheckResult,
  type EffectDiagnostic,
  type FlowEffectSummary,
  type EffectCheckerMode,
} from "./effect-checker.js";

// ── AI-code-gen referee: the machine-consumable structural leak proof (spore.leakproof.v1) ──
// Normalizes the compiler's governance diagnostics into one stable schema an autonomous LLM writer can
// read to self-patch the exact capability leak. Fail-closed (any deny → module verdict 'leak'); signable.
export { buildLeakProof, canonicalLeakProof } from "./leak-proof.js";
export type { CapabilityLeakProof, LeakFinding, LeakCategory, LeakFix, CodeAnchor } from "./leak-proof.js";
// RD-0128 (note 67): signable TestWitness receipt binding a wasm artifact to its leak proof + test-suite digest.
export { buildTestWitness, testSuiteDigest, canonicalTestWitness, testWitnessDigest, witnessVouchesClean } from "./leak-proof.js";
export type { TestWitness } from "./leak-proof.js";

// Execution Graph Kernel — ProofGraph, ExecutionSignature, GraphFingerprint
// Phase 26B: ImmutableInputSeal, HardwareSealedDispatch, SPORE-HW-001/002/003
// Phase 40: EpilogueReceipt, generateEpilogueReceipt
export {
  computeExecutionSignature,
  executionSignatureHash,
  buildProofGraph,
  makeManifestEnvelope,
  buildProofGraphCached,
  getProofCacheStats,
  clearProofCache,
  sharesGovernanceShape,
  diffFingerprints,
  generateROIReport,
  signProofGraph,
  signProofGraphHybrid,
  verifyGovernanceSignature,
  verifyGovernanceSignatureHybrid,
  generateGovernanceKeyPair,
  generateHybridGovernanceKeyPair,
  generateEpilogueReceipt,
  type GovernanceAlgorithm,
} from "./proof-graph.js";
// #56 (galerina fix --write): the safe single-line edit applier + re-check-gated auto-fix orchestration.
export { applyFixEdits, computeAutoFix } from "./fix-edit.js";
export type { FixEdit, ApplyFixEditsResult, AutoFixOutcome } from "./fix-edit.js";
// #49 production hybrid (Ed25519+ML-DSA-65) verifier for the fuse loader's injected hybridVerifier seam.
export { makeLmanifestHybridVerifier } from "./lmanifest-hybrid-verifier.js";
export type { LmanifestHybridVerdict, LmanifestHybridVerifierInput } from "./lmanifest-hybrid-verifier.js";
export {
  SPORE_HW_001,
  SPORE_HW_002,
  SPORE_HW_003,
  type ExecutionSignature,
  type ProofGraph,
  type ProofObligation,
  type ProofObligationKind,
  type ProofEvidence,
  type GraphFingerprint,
  type GovernanceROIReport,
  type ImmutableInputSeal,
  type HardwareSealedDispatch,
  type GovernanceKeyPair,
  type EpilogueReceipt,
  type EpilogueProofStrategy,
  type EpilogueFailureAction,
} from "./proof-graph.js";

// Phase 18D / 18E / 18F / Hybrid WASM — Type Registry
export {
  TypeId,
  EffectFlags,
  EffectCheckerFlags,
  HardwareGovernanceClass,
  HardwareObservabilityLevel,
  HardwareObservability,
  ProofLevel,
  HARDWARE_GOVERNANCE_CLASS_MAP,
  HARDWARE_TRUST_PROFILES,
  type HardwareGovernanceClassId,
  type HardwareObservabilityLevelId,
  type ProofLevelId,
  type HardwareTrustProfile,
  GovernanceFlags,
  ComputeCompatibilityFlags,
  NativeCapabilityId,
  EFFECT_TO_NATIVE_CAPABILITY,
  effectsToFlags,
  effectsSubset,
  resolveTypeId,
  parseTensorType,
  tensorElementTypesCompatible,
  tensorDimensionCountsCompatible,
  TYPE_NAME_TO_ID,
  DEFAULT_WAT_ASSEMBLER_CONFIG,
  type TypeIdValue,
  type EffectFlagsMask,
  type EffectCheckerFlagsMask,
  type GovernanceFlagsMask,
  type ComputeCompatibilityFlagsMask,
  type TensorTypeInfo,
  type RuntimeManifest,
  type NativeCapabilityIdValue,
  type WATAssemblerConfig,
  type NativePluginManifest,
} from "./type-registry.js";

// Phase 6 / 18C — Value-State Checker
export {
  checkValueStates,
  ValueStateFlags,
  SINK_REQUIREMENTS,
  getSinkRequirement,
  type ValueStateDiagnostic,
  type ValueStateCheckResult,
  type ValueStateFlagsMask,
  type SinkRequirement,
} from "./value-state-checker.js";

// ---------------------------------------------------------------------------
// Gate diagnostics — SPORE-GATE-001
//
// Reserved for Phase 19 @gate annotation enforcement.
// When a flow is annotated @gate, callers must use error propagation (?)
// and the result must transition the binding from unsafe to safe.
// ---------------------------------------------------------------------------

/** SPORE-GATE-001: @gate-annotated flow called without required error propagation or state transition. */
export const SPORE_GATE_001 = {
  code: "SPORE-GATE-001",
  name: "GateAnnotationRequired",
  severity: "error" as const,
  message: "This flow is annotated @gate. Callers must use error propagation (?) and assign the result to a 'safe mut' binding.",
  why: "@gate flows are the only way to transition data from unsafe to safe. Without the ? operator, errors are silently ignored and the transition is not proven.",
  suggestedFix: "Change the call to: safe mut name = gateFn(value)?",
} as const;

/** SPORE-VALUESTATE-005: A value derived from an unsafe binding reached a governed sink. */
export const SPORE_VALUESTATE_005 = {
  code: "SPORE-VALUESTATE-005",
  name: "DERIVED_UNSAFE_VALUE_AT_SINK",
  severity: "error" as const,
  message: "A value derived from an unsafe binding reached a governed sink. Even after transformation (e.g. .trim()), a value derived from unsafe input is still tainted.",
  why: "SQL injection and similar attacks pass through string methods like .trim(), .replace(), and .toLowerCase().",
  suggestedFix: "Use a validation gate (validate.*, sanitize.*) to transform the unsafe value into a safe/validated type.",
};

// Phase 6 — Type Checker
export {
  checkTypes,
  type TypeDiagnostic,
  type TypeCheckResult,
} from "./type-checker.js";

/** SPORE-TYPE-003: raw String assigned to a branded type (Brand<T,"Name"> alias) without a validation gate. */
export const SPORE_TYPE_003 = {
  code: "SPORE-TYPE-003",
  name: "InvalidNominalConversion",
  severity: "error",
  message:
    "Branded types (type X = Brand<T, \"Name\">) cannot be assigned a raw String value. "
    + "Use a validation gate such as validate.x(raw)? to produce a trusted branded value.",
} as const;

// SPORE-TYPE-010..019 — per formal-type-system-spec.md canonical mapping
export const SPORE_TYPE_010 = { code: "SPORE-TYPE-010", name: "UnsatisfiedGenericConstraint", severity: "error", message: "Type does not satisfy the required generic constraint." } as const;
export const SPORE_TYPE_011 = { code: "SPORE-TYPE-011", name: "InvalidCollectionElement", severity: "error", message: "Collection element type does not match the declared element type." } as const;
export const SPORE_TYPE_012 = { code: "SPORE-TYPE-012", name: "InvalidResultType", severity: "error", message: "Ok/Err branch type does not match the declared Result<T,E> type." } as const;
export const SPORE_TYPE_013 = { code: "SPORE-TYPE-013", name: "InvalidSecretOperation", severity: "error", message: "Protected secret value cannot use this operator. Use constantTimeEquals() for equality." } as const;
export const SPORE_TYPE_014 = { code: "SPORE-TYPE-014", name: "MissingRequiredEffect", severity: "error", message: "Calling this function requires an effect that the current flow does not declare." } as const;
export const SPORE_TYPE_015 = { code: "SPORE-TYPE-015", name: "GovernedSinkViolation", severity: "error", message: "Governed sink requires a safe/validated binding; received an unsafe binding." } as const;
export const SPORE_TYPE_016 = { code: "SPORE-TYPE-016", name: "TensorShapeMismatch", severity: "error", message: "Tensor shapes are incompatible for this operation." } as const;
export const SPORE_TYPE_017 = { code: "SPORE-TYPE-017", name: "QuantizedPrecisionMismatch", severity: "warning", message: "Cannot mix quantized (Int8) and floating-point (Float32) without explicit dequantize(). General numeric narrowing is SPORE-TYPE-002." } as const;
export const SPORE_TYPE_018 = { code: "SPORE-TYPE-018", name: "InvalidRuntimeTargetType", severity: "error", message: "This type cannot exist in the selected compute target." } as const;
export const SPORE_TYPE_019 = { code: "SPORE-TYPE-019", name: "UnknownSymbol", severity: "error", message: "Symbol is not defined in the current scope." } as const;

// SPORE-TYPE-030/031 — Tensor element type and dimension checking (Phase 18D)

/** SPORE-TYPE-030: Tensor operations received mismatched element types. */
export const SPORE_TYPE_030 = {
  code: "SPORE-TYPE-030",
  name: "TensorElementTypeMismatch",
  severity: "error" as const,
  message: "Tensor element types do not match. Float32 and Int8 tensors cannot be combined without explicit conversion.",
  why: "Mixed-precision tensor operations produce undefined results on GPU/NPU targets. All tensors in an operation must share the same element type, or use explicit quantize()/dequantize().",
  suggestedFix: "Use dequantize() to convert Int8 to Float32 before the operation, or quantize() to convert Float32 to Int8.",
} as const;

/** SPORE-TYPE-031: Tensor operations received incompatible dimension counts. */
export const SPORE_TYPE_031 = {
  code: "SPORE-TYPE-031",
  name: "TensorDimensionMismatch",
  severity: "error" as const,
  message: "Tensor dimension counts do not match. [768] (rank 1) cannot be used where [Batch, 768] (rank 2) is expected.",
  why: "Rank mismatch causes silent shape errors in tensor operations. NPU/GPU kernels require matching rank at compile time.",
  suggestedFix: "Use Tensor.unsqueeze() to add a batch dimension, or Tensor.squeeze() to remove one.",
} as const;

/** SPORE-VALUESTATE-006: A protected value was assigned to a plain (unprotected) binding. */
export const SPORE_VALUESTATE_006 = {
  code: "SPORE-VALUESTATE-006",
  name: "ProtectedBoundaryViolation",
  severity: "error" as const,
  message: "A protected value is used where the plain (unprotected) type is required. Declare the binding as 'protected X', or pass through an authorised access gate.",
} as const;

/** SPORE-VALUESTATE-007: A redacted value cannot convert back to its original type. */
export const SPORE_VALUESTATE_007 = {
  code: "SPORE-VALUESTATE-007",
  name: "RedactedBoundaryViolation",
  severity: "error" as const,
  message: "A redacted value cannot be converted back to its original type. Redaction is irreversible.",
} as const;

export {
  resolveSymbols,
  ModuleExportRegistry,
  type SymbolDiagnostic,
  type SymbolResolveResult,
  type SymbolTable,
  type ExportedSymbol,
  type ExportKind,
} from "./symbol-resolver.js";

/** SPORE-NAME-003: Local binding shadows a built-in domain type. */
export const SPORE_NAME_003 = {
  code: "SPORE-NAME-003",
  name: "CrossModuleShadow",
  severity: "warning",
  message: "Local binding shadows a built-in domain type. Rename to avoid confusion.",
} as const;

// Phase 11E — Import Resolver
export {
  resolveImports,
  type ImportedSymbol,
  type ImportResolveResult,
} from "./import-resolver.js";

// Phase R3 — Package Type Registry
export {
  KNOWN_PACKAGE_TYPES,
  KNOWN_DOMAIN_TYPES,
  resolveImportedTypes,
  loadManifestTypes,
} from "./package-type-registry.js";

// Phase 17A / 18B — Package Manifest Resolver
export {
  loadPackageManifest,
  resolvePackageTypes,
  checkPackageCapabilityExpansion,
  checkInstallScript,
  checkPackageProvenance,
  checkRegistryTrust,
  getResolverReport,
  type PackageManifest,
  type PackageTargets,
  type PackageCompute,
  type PackageResolverDiagnostic,
  type CapabilityExpansionResult,
  type ResolverReport,
  type ResolvedPackageEntry,
} from "./package-resolver.js";

// CycloneDX SBOM emitter (R&D 0120-F3) — fail-closed on missing integrity (SPORE-SBOM-001).
export { generateCycloneDxSbom } from "./sbom.js";
export type { SbomResult, SbomDiagnostic, SbomOptions } from "./sbom.js";

// ---------------------------------------------------------------------------
// Package resolver diagnostics — SPORE-PKG-001..005
// ---------------------------------------------------------------------------

/** SPORE-PKG-001: Package declares capabilities not present in the lockfile snapshot. */
export const SPORE_PKG_001 = {
  code: "SPORE-PKG-001",
  name: "CapabilityExpanded",
  severity: "error" as const,
  message: "Package declares new capabilities not present in the lockfile. This is a breaking security change — review and re-approve.",
  why: "Hidden capability expansion is a supply-chain attack vector. Any new capability must be explicitly reviewed before the lockfile is updated.",
  suggestedFix: "Run 'galerina package audit' to review the new capability declarations, then update the lockfile after explicit approval.",
} as const;

/** SPORE-PKG-002: Package comes from an unregistered or unverified registry. */
export const SPORE_PKG_002 = {
  code: "SPORE-PKG-002",
  name: "UntrustedRegistry",
  severity: "error" as const,
  message: "Package comes from an unregistered or unverified registry. Galerina requires all packages to come from a declared trusted registry.",
  why: "Dependency confusion attacks inject malicious packages via unofficial registries.",
  suggestedFix: "Add the registry to the project's trusted registry list, or switch to a verified source.",
} as const;

/** SPORE-PKG-003: Package manifest has no content-addressable hash. */
export const SPORE_PKG_003 = {
  code: "SPORE-PKG-003",
  name: "MissingHash",
  severity: "warning" as const,
  message: "Package has no content-addressable hash. Without a hash, tamper detection and reproducible builds are not possible.",
  why: "A package without a hash can be silently replaced with a different version.",
  suggestedFix: "Add 'hash: sha256:<hex>' to the package manifest. Run 'galerina package hash' to generate it.",
} as const;

/** SPORE-PKG-004: Package declares or attempts an install script; default policy denies. */
export const SPORE_PKG_004 = {
  code: "SPORE-PKG-004",
  name: "InstallScriptDenied",
  severity: "error" as const,
  message: "Package attempts to declare an install script. Galerina denies install scripts by default.",
  why: "Install scripts execute arbitrary code during package resolution — a major supply-chain attack surface.",
  suggestedFix: "Remove the installScript declaration. If absolutely necessary, configure an explicit resolver policy with signature verification.",
} as const;

/** SPORE-PKG-005: Package has no signature; origin cannot be cryptographically verified. */
export const SPORE_PKG_005 = {
  code: "SPORE-PKG-005",
  name: "MissingSignature",
  severity: "warning" as const,
  message: "Package has no signature. Origin cannot be cryptographically verified.",
  why: "An unsigned package cannot prove it came from the claimed publisher. It could be a substituted or tampered build.",
  suggestedFix: "Sign the package with 'galerina package sign' and add 'signature:' to the manifest.",
} as const;

/** SPORE-PKG-006: Package is signed by a REVOKED key; trusted origin cannot be established. */
export const SPORE_PKG_006 = {
  code: "SPORE-PKG-006",
  name: "RevokedSigner",
  severity: "error" as const,
  message: "Package is signed by a revoked key. A revoked signing key cannot establish trusted origin.",
  why: "Revocation is the supply-chain kill switch: a leaked or compromised signing key keeps producing cryptographically valid signatures, so the gate must refuse a revoked signer even when the signature verifies — at resolution as well as admission.",
  suggestedFix: "Re-sign the package with a current, non-revoked key and update 'signerKeyId:' in the manifest.",
} as const;

// Phase 17A — Naming Policy Checker
export {
  checkNamingPolicy,
  SPORE_STYLE_001,
  SPORE_STYLE_002,
  SPORE_STYLE_SEC_001,
  type NamingPolicyDiagnostic,
  type NamingPolicyResult,
  type NamingPolicyConfig,
} from "./naming-policy-checker.js";

// Pass 8 - GIR Emitter
export {
  emitGIR,
  emitExpr,
  buildSemanticGraph,
  buildAiGraph,
  buildExecutionPlan,
  EFFECT_TO_CAPABILITY,
  type GIRFlow,
  type GIRProgram,
  type GIREmitResult,
  type GIRExpr,
  type GIRRecordField,
  type GalerinaAiGraph,
  type AiGraphFlow,
  type AiGraphParameter,
  type AiGraphEvent,
  type AiGraphContract,
  type AiGraphDiagnostic,
  type AiGraphGovernance,
  type AiGraphSourceSpan,
  type PassiveExecutionPlan,
} from "./gir-emitter.js";
// R&D 0016 - Contract-driven test generation (fault-injection + effect-egress dimensions)
export {
  generateFaultInjectionTests,
  generateFaultInjectionSuite,
  generateEffectEgressTests,
  generateCapabilityDenialTests,
  generateBoundaryTests,
  generateSubstrateViolationTests,
  generateContractTestSuite,
  renderFaultInjectionTAP,
  type FaultInjectionTestCase,
  type EffectEgressTestCase,
  type CapabilityDenialTestCase,
  type BoundaryTestCase,
  type SubstrateViolationTestCase,
  type ContractTestSuite,
} from "./test-generator.js";
export {
  analyzeFlowDependencies,
  analyzeProgramFlowDependencies,
  renderDependencyComments,
  rewriteGeneratedComments,
  type FlowDependencies,
  type ProgramFile,
  type ProgramFlowAnalysis,
} from "./flow-dependency-analysis.js";
export {
  cyclomaticComplexity,
  renderComplexityComment,
} from "./flow-complexity.js";
export type { SemanticGraph } from "@galerina/devtools-graph-algorithms";

// Phase 15 — Passive Execution Plans
export {
  executePlan,
  type ExecutionStep,
  type ApprovedCapability,
  type ValidateContextStep,
  type ValidateParamStep,
  type CapabilityCallStep,
  type ResponseStep,
  type EmitEventStep,
  type ReturnStep,
} from "./runtime/executionPlan.js";

// Stage A - AST Interpreter
export {
  executeFlow,
  BINARY_DISPATCH,
  isPureEffectFree,
  extractRequestTimeMs,
  extractNetworkRequestsLimit,
  SPORE_VOID,
  SPORE_NONE,
  SPORE_RUNTIME_005,
  // Optimization A: binding slot array
  assignSlots,
  SlottedScope,
  // Optimization B: while loop fast-path stub
  tryWhileFastPath,
  tryPureFlowSync,
  executeFlowSync,
  // Phase 29A: NaN-boxing helpers
  tagInt,
  isTagged,
  untag,
  fitsTagged,
  MAX_TAGGED,
  MIN_TAGGED,
  type GalerinaValue,
  type ExecutionResult,
  type ExecutionAuditRecord,
  type FlowExecutionResult,
  type RuntimeAuditEntry,
  type InterpreterRuntimeOptions,
  type ExecutionTier,
  type TierFallbackReason,
} from "./interpreter.js";

// Phase 29C — Production Readiness Check
export { checkProductionReadiness } from "./production-check.js";

// Pure Flow LRU Memoization Cache
export {
  pureFlowCacheKey,
  getCachedPureFlow,
  setCachedPureFlow,
  clearPureFlowCache,
  getPureFlowCacheStats,
} from "./pure-flow-cache.js";

// Phase 23C — ExecutionGraph build-once-run-many cache
export {
  buildExecutionGraph,
  executionGraphCacheKey,
  getGraphCacheStats,
  getCachedGraph,
  getOrLoadGraph,
  storeGraph,
  ExecOp,
  type ExecNode,
  type ExecutionGraph,
} from "./execution-graph.js";

// Stage A - Audit Writer
export {
  createAuditWriter,
  buildFlowAuditEvent,
  type AuditEvent,
  type AuditWriter,
} from "./audit-writer.js";

// Phase 25 — WAT Assembler (WAT → WASM binary)
export {
  assembleWAT,
  executeWASMFlow,
  type WATAssemblerResult,
  type WASMExecutionResult,
} from "./wat-assembler.js";

// P9 (#105) — WASM execution harness as a SECURITY ADMISSION GATE
export {
  wasmHash, generateRunnerKeypair, signWasm, verifyWasm,
  createHostRuntime, admitAndInstantiate,
} from "./wasm-runtime.js";
export type {
  AdmissionPolicy, RunnerProfile, WasmAttestation, AdmissionVerdict,
  Observer, HostRuntime, AdmissionResult,
} from "./wasm-runtime.js";

// Phase 19 / 22A / 22 / 27D — WAT Emitter (WebAssembly Text Format) — skeleton + SIMD types + pure bodies + SIMD ops
export {
  emitWAT,
  renderWAT,
  buildWATModule,
  buildWATModuleFromGIR,
  emitWATBody,
  emitWATFromFlowAST,
  emitWATExpr,
  emitBlockLastExpr,
  buildRecordLayouts,
  buildEnumVariants,
  getInternedStrings,
  extractFlowParamNames,
  findFlowNodeInAST,
  getWATImportsForEffects,
  logicNTypeToWAT,
  DEFAULT_WAT_MEMORY,
  DEFAULT_WASM_SIMD,
  WAT_SIMD_OPS,
  type WATModule,
  type WATEmitResult,
  type WATFunction,
  type WATImport,
  type WATExport,
  type WATFuncType,
  type WATValType,
  type WATMemory,
  type WATFlowInput,
  type WATGIRInput,
  type WATParamDef,
  type WASMSIMDCapability,
  type WATSIMDInstruction,
} from "./wat-emitter.js";

// Security Policy — Anti-abuse architecture (Phase 25D+)
export {
  ANTI_ABUSE_EFFECTS,
  PRIVATE_IP_RANGES,
  SPORE_NET_001,
  SPORE_NET_002,
  SPORE_RUNTIME_006,
  SPORE_ANTI_ABUSE_001,
  parseNetworkDestinationPolicy,
  isHostAllowed,
  type NetworkDestinationPolicy,
} from "./security-policy.js";

// Stage A - Runtime Pipeline
export {
  run,
  serve,
  type RuntimeResult,
  type RuntimeOptions,
  type RuntimeMode,
} from "./runtime.js";

// Stage A - Route Registry
export {
  buildRouteRegistry,
  type RouteEntry,
  type RouteRegistry,
  type RouteMatch,
} from "./route-registry.js";

// Stage A - Route Dispatcher
export {
  startServer,
  makeResponseValue,
  makeApiErrorValue,
  type ServerConfig,
  type RunningServer,
} from "./route-dispatcher.js";

// Stage A - Standard Library
export {
  callStdlib,
  jsObjectToGalerina,
  logicNValuesEqual,
  type StdlibContext,
} from "./stdlib.js";

// Phase 18H — Standard Library Registry
export {
  STDLIB_CAPABILITY_MAP,
  STDLIB_MODULE_KIND,
  TENSOR_STDLIB_OPS,
  TRI_STDLIB_OPS,
  getStdlibRequiredEffects,
  getStdlibModuleKind,
  getStdlibWasmImport,
  type StdlibCapabilityEntry,
  type StdlibModuleKind,
  type TensorOpInfo,
  type TriOpInfo,
} from "./stdlib-registry.js";

// ---------------------------------------------------------------------------
// Stdlib diagnostics — SPORE-STDLIB-001
// ---------------------------------------------------------------------------

/**
 * SPORE-STDLIB-001: An effectful stdlib function was called without the
 * required effect being declared in the flow's contract.
 *
 * Example: calling File.readText() without declaring filesystem.read.
 * The STDLIB_CAPABILITY_MAP defines required effects per function.
 *
 * This diagnostic is emitted by the effect checker when a stdlib call is
 * detected in the flow body but the corresponding effect is not declared.
 */
export const SPORE_STDLIB_001 = {
  code: "SPORE-STDLIB-001",
  name: "StdlibEffectNotDeclared",
  severity: "error" as const,
  message: "Effectful stdlib function called without declaring the required effect in the contract.",
  why: "Every stdlib function that performs I/O, network access, filesystem access, or secret reads must be explicitly declared as an effect. This enables static governance proof and WASM import table generation.",
  suggestedFix: "Add the required effect to the contract: contract { effects { filesystem.read } }",
} as const;

// Stage A - Proof Chain
export {
  buildProofChain,
  verifyProofChain,
  type ExecutionProofChain,
  type ProofHashes,
  type EvidenceRecord,
  type DenialRecord,
  type ProofChainInputs,
} from "./proof-chain.js";

// Stage A - Governance Verifier
export {
  verifyGovernance,
  extractArenaLimitMB,
  SPORE_GOV_001,
  SPORE_GOV_003,
  SPORE_GOV_006,
  SPORE_GOV_013,
  SPORE_GOV_019,
  SPORE_GOV_020,
  SPORE_TERM_001,
  SPORE_VAL_001,
  SPORE_VAL_002,
  SPORE_VAL_003,
  RECOGNISED_VALUE_CLASSIFICATIONS,
  SPORE_CONTEXT_001,
  SPORE_GOV_011,
  SPORE_GOV_012,
  // New category codes (task #50 — EC/ID/AU/LC/T/FG)
  SPORE_RES_001,
  SPORE_OBS_001,
  SPORE_EC_001,
  SPORE_EC_002,
  SPORE_ID_001,
  SPORE_AU_001,
  SPORE_DRCM_UNSUPPORTED,
  // #34 — post-quantum signing enforcement
  SPORE_CRYPTO_PQ_001,
  // Direction B — substrate {} contract obligations
  SPORE_SUBSTRATE_001,
  SPORE_SUBSTRATE_002,
  SPORE_SUBSTRATE_003,
  SPORE_SUBSTRATE_004,
  SPORE_SUBSTRATE_005,
  type GovernanceDiagnostic,
  type GovernanceVerifyResult,
  type DeploymentProfile,
} from "./governance-verifier.js";

// Direction B — substrate inference module (the substrate {} verifier pass) + NMR math
export {
  inferFlowSubstrate,
  checkSubstrateViolations,
} from "./substrate-inference.js";
export type { InferredSubstrate, SubstrateViolation, SubstrateLane } from "./substrate-inference.js";
export { singleLaneErrorProbability, nmrFailureProbability } from "./substrate-math.js";

// Phase 28 — Runtime Profile Enforcement (strict / high_integrity / deterministic)
export {
  checkProfiles,
  PROFILE_DIAGNOSTICS,
  SPORE_PROFILE_001, SPORE_PROFILE_002, SPORE_PROFILE_003, SPORE_PROFILE_004,
  SPORE_PROFILE_005, SPORE_PROFILE_005B, SPORE_PROFILE_006, SPORE_PROFILE_007,
  type RuntimeProfile,
  type ProfileDiagnostic,
} from "./profile-checker.js";

// Phase 32 — Governance Diff (galerina diff main..branch)
export {
  diffGovernance,
  flowShape,
  renderGovernanceDiff,
  type GovernanceDiff,
  type FlowDelta,
  type FlowGovernanceShape,
} from "./governance-diff.js";

// Phase 31 — Bytecode VM for pure integer flows
export {
  compileToBytecode,
  runBytecode,
  tryRunBytecode,
  clearBytecodeCache,
  Op,
  type BytecodeProgram,
} from "./bytecode-vm.js";

// Phase 28 — Taint Tracking & Sink Safety (Tainted<T> / SafeFor<Context,T>)
export {
  checkTaint,
  UNTAINT_BOUNDARIES,
  INJECTION_SINKS,
  TAINT_DIAGNOSTICS,
  SPORE_TAINT_001, SPORE_TAINT_002, SPORE_TAINT_003, SPORE_TAINT_004,
  type SinkContext,
  type TaintDiagnostic,
  SPORE_TAINT_005,
  SPORE_TAINT_006,
} from "./taint-checker.js";

// Phase 29/33 — Economics Inference (convention over configuration)
export {
  inferFlowEconomics,
  describeEconomics,
  type InferredEconomics,
  type InferredTarget,
} from "./economics-inference.js";

// ---------------------------------------------------------------------------
// Economics / Lineage / AI governance diagnostics — SPORE-ECON-001..003
// ---------------------------------------------------------------------------

/** SPORE-ECON-001: Flow execution may exceed the declared economic budget. */
export const SPORE_ECON_001 = {
  code: "SPORE-ECON-001",
  name: "BudgetExceeded",
  severity: "warning" as const,
  message: "Flow execution may exceed the declared economic budget.",
  why: "Economic contracts enable cost-aware scheduling. When actual cost exceeds declared targets, the runtime can route to cheaper alternatives or alert before money is spent.",
  suggestedFix: "Increase the target_cost in contract.economics, or declare preferred_execution wasm to reduce compute cost.",
} as const;

/** SPORE-ECON-002: Protected data binding has no lineage declaration. */
export const SPORE_ECON_002 = {
  code: "SPORE-ECON-002",
  name: "LineageMissing",
  severity: "info" as const,
  message: "Protected data binding has no lineage declaration.",
  why: "Data lineage tracking enables automated regulatory reporting (GDPR Article 30, CCPA). Without lineage, organisations must manually trace data origins during audits.",
  suggestedFix: "Add lineage { source origin owner Team retention duration } to the contract.",
} as const;

/** SPORE-ECON-003: AI model call uses a model not in the contract's approved_models list. */
export const SPORE_ECON_003 = {
  code: "SPORE-ECON-003",
  name: "AiModelUnapproved",
  severity: "error" as const,
  message: "AI model call uses a model not in the contract's approved_models list.",
  why: "Unapproved AI models can incur unexpected costs, produce unaudited outputs, or violate data processing agreements with vendors.",
  suggestedFix: "Add the model to contract.ai.approved_models, or remove the call.",
} as const;

/** SPORE-GOV-014: Flow declares compute targets with prefer [...] but no fallback target is declared. */
export const SPORE_GOV_014 = {
  code: "SPORE-GOV-014",
  name: "MissingFallbackTarget",
  severity: "warning" as const,
  message: "Flow declares compute targets with prefer [...] but no fallback target is declared. A fallback is required — without it, a native accelerator crash becomes an unrecoverable service failure.",
  why: "When native modules crash, the WASM control plane must fall back to a governed CPU/WASM path. No fallback = potential service outage with no recovery path.",
  suggestedFix: "Add: targets { fallback cpu } or targets { fallback wasm }",
} as const;

// Stage A - Boundary Graph
export {
  buildBoundaryGraph,
  type BoundaryGraph,
  type BoundaryNodeData,
  type BoundaryCheckResult,
} from "./boundary-graph.js";

// ---------------------------------------------------------------------------
// Effect diagnostics — SPORE-EFFECT-005
// ---------------------------------------------------------------------------

/**
 * SPORE-EFFECT-005: Effect name is a broad alias without a specific dot-path qualifier.
 *
 * Broad aliases (`network`, `database`, `filesystem`, `ai`, `audit`) are demoted
 * in favour of canonical names (`network.outbound`, `database.read`, etc.) because
 * they can imply broader authority than intended and are ambiguous in governance audits.
 *
 * Severity: warning in development mode, error in production mode.
 */
export const SPORE_EFFECT_005 = {
  code: "SPORE-EFFECT-005",
  name: "BroadAliasUsed",
  severity: "warning" as const,
  message: "Effect name is a broad alias. Use the canonical dot-path name to precisely declare authority.",
  why: "Broad aliases are ambiguous and may grant more authority than intended in future Galerina versions. Canonical names are stable, auditable, and governance-traceable.",
  suggestedFix: "Replace 'network' with 'network.outbound', 'database' with 'database.read' or 'database.write', 'filesystem' with 'filesystem.read' or 'filesystem.write'.",
} as const;

// Phase 9B — Event Checker
export {
  checkEvents,
  SPORE_EVENT_001,
  SPORE_EVENT_002,
  SPORE_EVENT_003,
  SPORE_EVENT_004,
  SPORE_EVENT_005,
  type EventDiagnostic,
  type EventCheckResult,
} from "./event-checker.js";

// Phase 10A — Signed Attestation
export {
  buildAttestation,
  signAttestation,
  verifyAttestation,
  generateAttestationKey,
  signAttestationHybrid,
  verifyAttestationHybrid,
  generateHybridAttestationKey,
  attestationToYaml,
  attestationFromJson,
  type GalerinaAttestation,
  type AttestationInputs,
  type AttestationKeyPair,
  type HybridAttestationKeyPair,
} from "./attestation.js";

// Phase 11C — Runtime Contract Enforcement
export {
  createContractEnforcer,
  type ContractEnforcer,
} from "./runtime/contractEnforcer.js";

export type { ContractEnforcementRecord } from "./runtime/runtimeReport.js";
export type { RuntimeContext } from "./runtime/runtimeContext.js";
export { verifyRuntimeManifestHash } from "./runtime/runtimeContext.js";

// Phase 11C / R4 — Capability Host
export {
  createCapabilityHost,
  parseNetworkDestinationPolicy as parseNetworkDestinationPolicyForHost,
  type CapabilityHost,
  type CapabilityCall,
  type CapabilityResult,
  type CapabilityCheckResult,
  type CapabilityHostConfig,
  type FlowCallCounters,
  type NetworkDestinationPolicy as CapabilityNetworkPolicy,
} from "./runtime/capabilityHost.js";

// Phase 11D — Governed Memory (skeleton)
export {
  createGovernedMemory,
  type GovernedMemory,
  type GovernedValueTag,
} from "./runtime/governedMemory.js";

// Stage B — Root Capability Provider (Phase 14)
export {
  createRootCapabilityProvider,
  COMPILER_MINIMUM_CAPABILITIES,
  type RootCapabilityProvider,
  type CompilerCapabilityHost,
  type UserRuntimeCapabilities,
  type CapabilityDomain,
} from "./runtime/rootCapabilityProvider.js";

// Phase 16A — Canonical Hashing
export {
  canonicalHash,
  stripNonDeterministic,
  hashSource,
  hashGIR,
  hashPassivePlan,
} from "./runtime/canonicalHash.js";

// Phase 21A/B/C/D — Lowering Plans (TypedArray, Monomorphisation, Kernel Fusion, Lazy Iterator)
export {
  buildTypedArrayLoweringPlan,
  buildMonomorphisationPlan,
  buildKernelFusionPlan,
  buildLazyIteratorChain,
  ELEMENT_TYPE_TO_TYPED_ARRAY,
  PRODUCTION_ERASURE,
  DEV_ERASURE,
  type TypedArrayLoweringEntry,
  type TypedArrayLoweringPlan,
  type EraseableMetadata,
  type MonomorphisationCandidate,
  type MonomorphisationSpecialisation,
  type MonomorphisationPlan,
  type KernelFusionGroup,
  type KernelFusionPlan,
  type LazyIteratorOp,
  type LazyIteratorStage,
  type LazyIteratorChain,
} from "./lowering-plan.js";

// Phase 22B / 23A/B — GPU, NPU, and APU Plans
export {
  buildWebGPUPlan,
  buildNPUPlan,
  buildAPUSharedMemoryPlan,
  type WebGPUComputePlan,
  type NPUKernelPlan,
  type APUSharedBuffer,
  type APUSharedMemoryPlan,
} from "./gpu-plan.js";

// Phase 23C — Register VM Bytecode
export {
  emitBytecode,
  type RegisterId,
  type ConstantPoolIndex,
  type RegisterOpcode,
  type RegisterInstruction,
  type RegisterFunction,
  type RegisterBytecodeModule,
} from "./register-vm.js";

// Phase 23D — StringView, BytesView, TensorView (zero-copy buffer views)
export {
  createStringView,
  createBytesView,
  sliceStringView,
  type StringView,
  type BytesView,
  type TensorView,
  type WASMLinearMemoryLayout,
} from "./views.js";

// Stage B — Self-hosting milestone tracker
export {
  generateStageBReport,
  type StageBMilestone,
  type StageBReport,
} from "./stage-b-report.js";

export interface CompilerInput {
  readonly projectRoot: string;
  readonly entryFiles: readonly string[];
}

export interface SourceLocation {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

// Unified Annotation Pass — single-pass type+value-state+effect+governance annotation
export {
  annotate,
  type NodeId,
  type NodeAnnotation,
  type AnnotationMap,
} from "./unified-annotator.js";

// Phase 24/25 — Fused compiler + SoA internals (data-oriented, WASM-ready)
export { SoANodeArena, MAX_NODES } from "./soa-arena.js";
export {
  toFlatTokenStream,
  tokenStreamKind,
  tokenStreamStart,
  tokenStreamEnd,
  tokenStreamValue,
  TOKEN_STRIDE,
  type FlatTokenStream,
} from "./flat-token-stream.js";
export {
  fusedCompile,
  packOpcode,
  unpackOp,
  unpackTypeId,
  unpackEffectMask,
  unpackFlags,
  GIR_OP,
  type FusedPassResult,
} from "./fused-pass.js";

export interface CompilerDiagnostic {
  readonly code: string;
  /** Screaming-snake-case diagnostic name, e.g. "TRI_BRANCH_CONDITION". */
  readonly name: string;
  readonly severity: "info" | "warning" | "error";
  readonly message: string;
  readonly location?: SourceLocation;
  /** Human-readable fix suggestion for IDE quick-fix integration. */
  readonly suggestedFix?: string;
}

export interface CompilerResult {
  readonly ok: boolean;
  readonly diagnostics: readonly CompilerDiagnostic[];
  readonly reports: readonly string[];
}

export interface CompilerSourceText {
  readonly file: string;
  readonly text: string;
}

export interface CoreSyntaxSafetyOptions {
  readonly scanSecrets?: boolean;
  readonly scanUnsafeDynamicCode?: boolean;
}

// ---------------------------------------------------------------------------
// Intent and safety level types
// ---------------------------------------------------------------------------

/**
 * All recognised flow safety levels — mirrors SafetyLevel in @galerina/core.
 * Kept local until workspace links are in place.
 */
export type CompilerSafetyLevel =
  | "safe"
  | "guarded"
  | "privileged"
  | "unsafe"
  | "experimental";

/**
 * A kind mismatch found during intent/effect consistency checking.
 */
export type IntentMismatchKind =
  | "undeclared_effect"
  | "destructive_effect_in_safe_flow"
  | "missing_intent"
  | "unsafe_without_fallback"
  | "unsafe_without_reason"
  | "privileged_without_capability"
  | "experimental_in_production";

export interface IntentMismatch {
  readonly kind: IntentMismatchKind;
  readonly message: string;
  readonly path?: string;
}

/**
 * Result of running the intent/effect consistency checker on a single flow.
 * Structurally compatible with CompilerResult.
 */
export interface IntentCheckResult {
  readonly flowName: string;
  readonly safetyLevel: CompilerSafetyLevel;
  readonly intent?: string;
  readonly declaredEffects: readonly string[];
  /** Effects the checker could infer from the flow body. */
  readonly inferredEffects: readonly string[];
  readonly mismatches: readonly IntentMismatch[];
  readonly diagnostics: readonly CompilerDiagnostic[];
}

// ---------------------------------------------------------------------------
// Intent diagnostic codes — SPORE-INTENT-001..005
//
// Note: The source document uses "LN-INTENT-*"; the canonical repo format
// is "SPORE-INTENT-*" (matching SPORE-CONFIG-*, SPORE-LOGIC-*, etc.).
// ---------------------------------------------------------------------------

/** Declared intent conflicts with inferred behavior (e.g. delete in a "send receipt" flow). */
export const SPORE_INTENT_001 = {
  code: "SPORE-INTENT-001",
  name: "INTENT_BEHAVIOR_MISMATCH",
  severity: "error",
  message: "Declared intent conflicts with inferred behavior.",
} as const;

/** API route, webhook, payment flow, or other governed surface is missing a required intent declaration. */
export const SPORE_INTENT_002 = {
  code: "SPORE-INTENT-002",
  name: "MISSING_REQUIRED_INTENT",
  severity: "error",
  message: "Governed surface requires an intent declaration.",
} as const;

/** Unsafe block is missing a reason, approval, or fallback declaration. */
export const SPORE_INTENT_003 = {
  code: "SPORE-INTENT-003",
  name: "UNSAFE_MISSING_REASON_OR_FALLBACK",
  severity: "error",
  message: "Unsafe block must declare reason, approval, and a safe fallback.",
} as const;

/** Privileged flow does not declare the required capability. */
export const SPORE_INTENT_004 = {
  code: "SPORE-INTENT-004",
  name: "PRIVILEGED_MISSING_CAPABILITY",
  severity: "error",
  message: "Privileged flow must declare its required capability.",
} as const;

/** Experimental flow or block is included in a production build target. */
export const SPORE_INTENT_005 = {
  code: "SPORE-INTENT-005",
  name: "EXPERIMENTAL_IN_PRODUCTION",
  severity: "error",
  message: "Experimental code must not be included in a production build target without explicit approval.",
} as const;

export const SPORE_INTENT_DIAGNOSTICS = [
  SPORE_INTENT_001,
  SPORE_INTENT_002,
  SPORE_INTENT_003,
  SPORE_INTENT_004,
  SPORE_INTENT_005,
] as const;

// ---------------------------------------------------------------------------
// Syntax diagnostics — SPORE-SYNTAX-001..002
// ---------------------------------------------------------------------------

/** `var` is not a valid Galerina keyword. Use `let` or `mut`. */
export const SPORE_SYNTAX_001 = {
  code: "SPORE-SYNTAX-001",
  name: "VAR_NOT_SUPPORTED",
  severity: "error",
  message: "Galerina does not support var. Use let for immutable bindings or mut for mutable bindings.",
} as const;

/** `const` is not a valid Galerina keyword. Use `let` or `readonly`. */
export const SPORE_SYNTAX_002 = {
  code: "SPORE-SYNTAX-002",
  name: "CONST_NOT_SUPPORTED",
  severity: "error",
  message: "Galerina does not support const. Use let for immutable bindings or readonly for read-only values.",
} as const;

/** `let` binding at top level — must be inside a flow. */
export const SPORE_SYNTAX_006 = {
  code: "SPORE-SYNTAX-006",
  name: "LET_AT_TOP_LEVEL",
  severity: "error",
  message: "Top-level let bindings are not allowed. Move this inside a flow, or use const for compile-time constants.",
} as const;

/** `mut` binding at top level — mutable state must be flow-local. */
export const SPORE_SYNTAX_007 = {
  code: "SPORE-SYNTAX-007",
  name: "MUT_AT_TOP_LEVEL",
  severity: "error",
  message: "Top-level mut bindings are not allowed. Mutable state must be flow-local.",
} as const;

/** `unsafe let` at top level — boundary data must be owned by a secure flow. */
export const SPORE_SYNTAX_008 = {
  code: "SPORE-SYNTAX-008",
  name: "UNSAFE_LET_AT_TOP_LEVEL",
  severity: "error",
  message: "unsafe let is only allowed inside a secure flow. Boundary data must be owned by a governed flow.",
} as const;

/** `emit` at top level — events may only be emitted inside flows. */
export const SPORE_SYNTAX_009 = {
  code: "SPORE-SYNTAX-009",
  name: "EMIT_AT_TOP_LEVEL",
  severity: "error",
  message: "Events may only be emitted inside flows. Declare events globally, emit them inside governed execution.",
} as const;

export const SPORE_SYNTAX_DIAGNOSTICS = [
  SPORE_SYNTAX_001,
  SPORE_SYNTAX_002,
  SPORE_SYNTAX_006,
  SPORE_SYNTAX_007,
  SPORE_SYNTAX_008,
  SPORE_SYNTAX_009,
] as const;

// ---------------------------------------------------------------------------
// Legacy syntax diagnostics — SPORE-SYNTAX-LEGACY-001
// ---------------------------------------------------------------------------

/**
 * SPORE-SYNTAX-LEGACY-001: `with effects [...]` is legacy syntax.
 *
 * Fired as a warning by the parser when the old `with effects [database.write]`
 * form is detected. The canonical form is `contract { effects { database.write } }`.
 *
 * The legacy form remains parseable for backwards compatibility.
 */
export const SPORE_SYNTAX_LEGACY_001 = {
  code: "SPORE-SYNTAX-LEGACY-001",
  name: "LegacyEffectsSyntax",
  severity: "warning" as const,
  message: "'with effects [...]' is legacy syntax. Use 'contract { effects { ... } }' instead.",
  suggestedFix: "Replace 'with effects [database.write]' with:\n  contract {\n    effects {\n      database.write\n    }\n  }",
} as const;

// ---------------------------------------------------------------------------
// Binding diagnostics — SPORE-BINDING-001..004
// ---------------------------------------------------------------------------

/** Attempt to reassign an immutable `let` binding. */
export const SPORE_BINDING_001 = {
  code: "SPORE-BINDING-001",
  name: "IMMUTABLE_LET_REASSIGNMENT",
  severity: "error",
  message: "Cannot reassign immutable let binding. Use mut only if reassignment is required.",
} as const;

/** Attempt to reassign a `readonly` binding. */
export const SPORE_BINDING_002 = {
  code: "SPORE-BINDING-002",
  name: "READONLY_REASSIGNMENT",
  severity: "error",
  message: "Cannot reassign readonly binding.",
} as const;

/** Attempt to mutate a value through a `readonly` binding. */
export const SPORE_BINDING_003 = {
  code: "SPORE-BINDING-003",
  name: "READONLY_PROPERTY_MUTATION",
  severity: "error",
  message: "Cannot mutate a value through a readonly binding.",
} as const;

/** `mut` binding used in a pure or safe context where mutation is forbidden. */
export const SPORE_BINDING_004 = {
  code: "SPORE-BINDING-004",
  name: "MUT_IN_PURE_CONTEXT",
  severity: "error",
  message: "mut binding used where mutation is forbidden. Use let or a functional accumulator (fold, count, filter).",
} as const;

/** SPORE-BINDING-005: Reassignment of immutable let binding denied. */
export const SPORE_BINDING_005 = {
  code: "SPORE-BINDING-005",
  name: "IMMUTABLE_BINDING_REASSIGNED",
  severity: "error",
  message: "Cannot reassign an immutable 'let' binding. Use 'mut' if reassignment is intended.",
} as const;

/** SPORE-BINDING-006: Type-changing reassignment of mut binding denied. */
export const SPORE_BINDING_006 = {
  code: "SPORE-BINDING-006",
  name: "MUT_TYPE_CHANGE",
  severity: "error",
  message: "Cannot change the type of a 'mut' binding on reassignment. 'mut' bindings are type-stable.",
} as const;

export const SPORE_BINDING_DIAGNOSTICS = [
  SPORE_BINDING_001,
  SPORE_BINDING_002,
  SPORE_BINDING_003,
  SPORE_BINDING_004,
  SPORE_BINDING_005,
  SPORE_BINDING_006,
] as const;

// ---------------------------------------------------------------------------
// Raw-pointer diagnostics — SPORE-RAWPTR-001
// ---------------------------------------------------------------------------

/**
 * Raw pointer syntax detected outside an approved unsafe block.
 *
 * Galerina bans raw pointer access in normal code. Only approved unsafe blocks
 * may use raw pointer expressions, and they must declare reason + fallback.
 */
export const SPORE_RAWPTR_001 = {
  code: "SPORE-RAWPTR-001",
  name: "RAW_POINTER_OUTSIDE_UNSAFE",
  severity: "error",
  message: "Raw pointer access is not allowed in normal Galerina code. Move this into an approved unsafe block with declared reason and fallback.",
} as const;

export const SPORE_RAWPTR_DIAGNOSTICS = [SPORE_RAWPTR_001] as const;

// ---------------------------------------------------------------------------
// Pipeline diagnostics — SPORE-PIPELINE-001..005
// ---------------------------------------------------------------------------

/** A method called in a pipeline chain does not exist on the current type. */
export const SPORE_PIPELINE_001 = {
  code: "SPORE-PIPELINE-001",
  name: "UNKNOWN_PIPELINE_METHOD",
  severity: "error",
  message: "Unknown method in pipeline chain.",
} as const;

/** The return type of a pipeline stage does not match the input of the next. */
export const SPORE_PIPELINE_002 = {
  code: "SPORE-PIPELINE-002",
  name: "PIPELINE_TYPE_MISMATCH",
  severity: "error",
  message: "Pipeline stage output type does not match the next stage's input type.",
} as const;

/** A pipeline contains a fallible stage whose Result is not handled. */
export const SPORE_PIPELINE_003 = {
  code: "SPORE-PIPELINE-003",
  name: "UNHANDLED_FALLIBLE_PIPELINE",
  severity: "error",
  message: "Fallible pipeline stage produces a Result that is not handled or propagated.",
} as const;

/** A pipeline stage uses an effect not declared on the enclosing flow. */
export const SPORE_PIPELINE_004 = {
  code: "SPORE-PIPELINE-004",
  name: "PIPELINE_UNDECLARED_EFFECT",
  severity: "error",
  message: "Pipeline stage requires an effect that is not declared on the enclosing flow.",
} as const;

/** A pipeline attempts to mutate a value through a readonly receiver. */
export const SPORE_PIPELINE_005 = {
  code: "SPORE-PIPELINE-005",
  name: "PIPELINE_READONLY_MUTATION",
  severity: "error",
  message: "Pipeline stage attempts to mutate a readonly receiver.",
} as const;

export const SPORE_PIPELINE_DIAGNOSTICS = [
  SPORE_PIPELINE_001,
  SPORE_PIPELINE_002,
  SPORE_PIPELINE_003,
  SPORE_PIPELINE_004,
  SPORE_PIPELINE_005,
] as const;

// ---------------------------------------------------------------------------
// Typed content block diagnostics — SPORE-BLOCK-001..004
// ---------------------------------------------------------------------------

/** Unknown typed content block type — only html, dom, script, css are valid. */
export const SPORE_BLOCK_001 = {
  code: "SPORE-BLOCK-001",
  name: "UNKNOWN_CONTENT_BLOCK_TYPE",
  severity: "error",
  message: "Unknown typed content block type. Valid types are: html, dom, script, css.",
} as const;

/** Typed content block was opened but its closing marker was never found. */
export const SPORE_BLOCK_002 = {
  code: "SPORE-BLOCK-002",
  name: "UNCLOSED_CONTENT_BLOCK",
  severity: "error",
  message: "Typed content block is never closed. The closing marker must appear alone at the start of a line.",
} as const;

/** The closing marker does not match the opening marker. */
export const SPORE_BLOCK_003 = {
  code: "SPORE-BLOCK-003",
  name: "MISMATCHED_CONTENT_BLOCK_MARKER",
  severity: "error",
  message: "Typed content block closing marker does not match the opening marker.",
} as const;

/** A ProtectedSecret value was emitted into a script or html block. */
export const SPORE_BLOCK_004 = {
  code: "SPORE-BLOCK-004",
  name: "SECRET_IN_CONTENT_BLOCK",
  severity: "error",
  message: "ProtectedSecret cannot be emitted into a typed content block.",
} as const;

export const SPORE_BLOCK_DIAGNOSTICS = [
  SPORE_BLOCK_001,
  SPORE_BLOCK_002,
  SPORE_BLOCK_003,
  SPORE_BLOCK_004,
] as const;

// ---------------------------------------------------------------------------
// String diagnostics — SPORE-STRING-001..004
// ---------------------------------------------------------------------------

/** Attempted String.decode() produced an invalid UTF-8 sequence. */
export const SPORE_STRING_001 = {
  code: "SPORE-STRING-001",
  name: "INVALID_UTF8_DECODE",
  severity: "error",
  message: "Attempted decode produced invalid UTF-8. Handle the DecodeError with a map block.",
} as const;

/** A secret value was assigned to a plain String binding instead of SecureString. */
export const SPORE_STRING_002 = {
  code: "SPORE-STRING-002",
  name: "SECRET_STORED_AS_STRING",
  severity: "error",
  message: "Secret value must not be stored in a plain String. Use SecureString or Secret.env().",
} as const;

/** A Bytes value was assigned to a String binding without an explicit decode step. */
export const SPORE_STRING_003 = {
  code: "SPORE-STRING-003",
  name: "IMPLICIT_STRING_BYTE_CONVERSION",
  severity: "error",
  message: "Bytes cannot become String without an explicit decode. Use String.decode(bytes, Encoding.UTF8).",
} as const;

/** `.length` was called on a String without specifying whether chars or bytes are counted. */
export const SPORE_STRING_004 = {
  code: "SPORE-STRING-004",
  name: "AMBIGUOUS_STRING_LENGTH",
  severity: "warning",
  message: "Ambiguous String length. Use .charCount() for Unicode scalar count or .encodedLength(Encoding.UTF8) for byte length.",
} as const;

export const SPORE_STRING_DIAGNOSTICS = [
  SPORE_STRING_001,
  SPORE_STRING_002,
  SPORE_STRING_003,
  SPORE_STRING_004,
] as const;

// ---------------------------------------------------------------------------
// Char diagnostics — SPORE-CHAR-001..004
// ---------------------------------------------------------------------------

/** A Char value was assigned to or compared with a Byte without an explicit conversion. */
export const SPORE_CHAR_001 = {
  code: "SPORE-CHAR-001",
  name: "CHAR_BYTE_CONFUSION",
  severity: "error",
  message: "Char cannot be assigned to Byte. Char is text; Byte is raw data. Encode explicitly with .toString().encode(Encoding.UTF8).",
} as const;

/** A character literal contains an invalid Unicode scalar value. */
export const SPORE_CHAR_002 = {
  code: "SPORE-CHAR-002",
  name: "INVALID_CHAR_LITERAL",
  severity: "error",
  message: "Character literal contains an invalid Unicode scalar value.",
} as const;

/** A character literal contains more than one character unit. */
export const SPORE_CHAR_003 = {
  code: "SPORE-CHAR-003",
  name: "MULTI_CHAR_LITERAL",
  severity: "error",
  message: "Char literal must contain exactly one character unit. Use String for multi-character values.",
} as const;

/** A Char was used as an integer without calling .codePoint(). */
export const SPORE_CHAR_004 = {
  code: "SPORE-CHAR-004",
  name: "IMPLICIT_CHAR_NUMBER_CONVERSION",
  severity: "error",
  message: "Char cannot be used as an integer directly. Use .codePoint() to get the Unicode code point.",
} as const;

export const SPORE_CHAR_DIAGNOSTICS = [
  SPORE_CHAR_001,
  SPORE_CHAR_002,
  SPORE_CHAR_003,
  SPORE_CHAR_004,
] as const;

// ---------------------------------------------------------------------------
// Byte diagnostics — SPORE-BYTE-001..005
// ---------------------------------------------------------------------------

/** A Byte literal value is outside the valid 0–255 range. */
export const SPORE_BYTE_001 = {
  code: "SPORE-BYTE-001",
  name: "BYTE_OUT_OF_RANGE",
  severity: "error",
  message: "Byte value must be between 0 and 255.",
} as const;

/** A Byte arithmetic result could exceed 255 without explicit overflow handling. */
export const SPORE_BYTE_002 = {
  code: "SPORE-BYTE-002",
  name: "BYTE_OVERFLOW",
  severity: "error",
  message: "Byte arithmetic result may exceed 255. Use wrapping, checked, or saturating arithmetic explicitly.",
} as const;

/** A Bytes value was assigned to a String binding without an explicit decode step. */
export const SPORE_BYTE_003 = {
  code: "SPORE-BYTE-003",
  name: "IMPLICIT_BYTE_STRING_CONVERSION",
  severity: "error",
  message: "Bytes cannot become String without an explicit decode. Use String.decode(bytes, Encoding.UTF8).",
} as const;

/** A raw Bytes value was passed to a log sink without redaction. */
export const SPORE_BYTE_004 = {
  code: "SPORE-BYTE-004",
  name: "RAW_BYTES_LOGGED",
  severity: "error",
  message: "Raw Bytes must not be passed directly to a log sink. Redact, hash, or encode before logging.",
} as const;

/** A Bytes read has no declared memory limit or streaming path. */
export const SPORE_BYTE_005 = {
  code: "SPORE-BYTE-005",
  name: "UNBOUNDED_BYTES_READ",
  severity: "error",
  message: "Bytes read without a declared memory limit or a streaming path. Declare maxBodyMb or use a streaming reader.",
} as const;

export const SPORE_BYTE_DIAGNOSTICS = [
  SPORE_BYTE_001,
  SPORE_BYTE_002,
  SPORE_BYTE_003,
  SPORE_BYTE_004,
  SPORE_BYTE_005,
] as const;

// ---------------------------------------------------------------------------
// Memory diagnostics — SPORE-MEMORY-001..008
//
// HONEST STATUS (#65 / RD-0130, 2026-06-26). Of this family ONLY SPORE-MEMORY-008
// is WIRED (emitter detectUnsafeBlockWithoutReason; the `unsafe block` construct
// must declare a reason + fallback). SPORE-MEMORY-001..007 are RESERVED / NOT
// EMITTED: no compiler pass produces them and none is planned.
//
// WHY (and why that is correct, not a gap): Galerina is VALUE-SEMANTICS — no shared
// mutable aliasing (a mutated copy never affects its source), no references, no
// raw pointers, no manual malloc/free. The live runtime is a GC tree-walker; the
// production path is WASM (monotonic per-flow bump heap + capability-sandboxed,
// bounds-checked linear memory — no free). So the Rust-borrow-checker bug classes
// these codes name — 001 use-after-move, 002 borrow-after-move, 003
// borrow-escapes-scope, 004 readonly-mutation-through-a-ref, 005 mutable-alias —
// cannot occur by construction. 006 BOUNDS_VIOLATION names a COMPILE-TIME bounds
// proof we do not ship; bounds are enforced at RUNTIME (WASM trap / interpreter
// guard). 007 unchecked-access-outside-unsafe has no scanner (008 covers the
// unsafe-block obligation that matters).
//
// The ONE linear-resource guarantee Galerina genuinely needs — consume-once
// ("a passport used twice") — ships + is enforced as SPORE-AFFINE-001
// (value-state-checker.ts), NOT via these codes. `move`/`borrow`/`pinned` are
// reserved lexer keywords: parsed, currently unenforced.
//
// DO NOT add 001..007 to PRODUCTION_BLOCKERS (production-check.ts): a blocker no
// pass can emit is a FALSE capability claim (RD-0124; enforced by
// scripts/audit-production-blockers.mjs, and the phase29 reserved-codes tripwire).
// Re-classify one as live ONLY if Galerina ever gains shared mutable references AND
// a real detector is wired. They stay defined (namespace stability — the
// catalog/registry/expected-diagnostics reference them), not deleted. Canonical
// stance: docs/Knowledge-Bases/galerina-memory-safety-model.md.
// ---------------------------------------------------------------------------

// --- SPORE-MEMORY-001..007: RESERVED / NOT-EMITTED (value-semantics; see family header) ---

/** RESERVED (no compiler pass emits this): a moved value used again after ownership transferred. */
export const SPORE_MEMORY_001 = {
  code: "SPORE-MEMORY-001",
  name: "USE_AFTER_MOVE",
  severity: "error",
  message: "A moved value cannot be used again. Ownership transferred at the move site.",
} as const;

/** A value was borrowed after its ownership had already moved. */
export const SPORE_MEMORY_002 = {
  code: "SPORE-MEMORY-002",
  name: "BORROW_AFTER_MOVE",
  severity: "error",
  message: "Cannot borrow a value after ownership has moved.",
} as const;

/** A borrowed reference outlives the scope of its owner. */
export const SPORE_MEMORY_003 = {
  code: "SPORE-MEMORY-003",
  name: "BORROW_ESCAPES_SCOPE",
  severity: "error",
  message: "Borrowed reference cannot outlive its owner. Return ownership via move instead.",
} as const;

/** Mutation was attempted through a readonly reference. */
export const SPORE_MEMORY_004 = {
  code: "SPORE-MEMORY-004",
  name: "READONLY_MUTATION",
  severity: "error",
  message: "Cannot mutate a value through a readonly reference.",
} as const;

/** A mutable borrow exists while another borrow or alias is active. */
export const SPORE_MEMORY_005 = {
  code: "SPORE-MEMORY-005",
  name: "MUTABLE_ALIAS",
  severity: "error",
  message: "A mutable borrow cannot coexist with another active borrow or alias of the same value.",
} as const;

/** An index may be outside the bounds of the target collection. */
export const SPORE_MEMORY_006 = {
  code: "SPORE-MEMORY-006",
  name: "BOUNDS_VIOLATION",
  severity: "error",
  message: "Index may be outside collection bounds. Use .get(index) for safe access or prove bounds at compile time.",
} as const;

/** An unchecked access was used outside an approved unsafe block. */
export const SPORE_MEMORY_007 = {
  code: "SPORE-MEMORY-007",
  name: "UNCHECKED_ACCESS_OUTSIDE_UNSAFE",
  severity: "error",
  message: "Unchecked index or memory access must be inside an approved unsafe block with a declared reason and fallback.",
} as const;

// --- SPORE-MEMORY-008: the ONE WIRED memory code (emitter: detectUnsafeBlockWithoutReason) ---

/** An unsafe memory operation has no declared safe fallback. (WIRED — emitted by detectUnsafeBlockWithoutReason.) */
export const SPORE_MEMORY_008 = {
  code: "SPORE-MEMORY-008",
  name: "UNSAFE_MEMORY_REQUIRES_FALLBACK",
  severity: "error",
  message: "Unsafe memory operation must declare a safe fallback. Every unsafe block requires a fallback flow.",
} as const;

export const SPORE_MEMORY_DIAGNOSTICS = [
  SPORE_MEMORY_001,
  SPORE_MEMORY_002,
  SPORE_MEMORY_003,
  SPORE_MEMORY_004,
  SPORE_MEMORY_005,
  SPORE_MEMORY_006,
  SPORE_MEMORY_007,
  SPORE_MEMORY_008,
] as const;

// ---------------------------------------------------------------------------
// Compute-target diagnostics — SPORE-COMPUTE-001
//
// Emitted by the SemanticGraph / ExecutionPlanner (NOT the parser) when a
// flow's body contains patterns incompatible with its declared compute target.
//
// Example trigger: a flow declares `compute { target npu }` but contains
//   `while random()` — non-deterministic iteration cannot map to an NPU.
//
// The parser sets NodeFlags.HasCompute so the compiler knows to check;
// the actual compatibility proof lives in the semantic/planner layer.
// ---------------------------------------------------------------------------

/** SPORE-COMPUTE-001: Pattern is not compatible with the declared compute target. */
export const SPORE_COMPUTE_001 = {
  code: "SPORE-COMPUTE-001",
  name: "ComputeTargetIncompatiblePattern",
  severity: "warning" as const,
  message: "This pattern may not map efficiently to the declared compute target (NPU/GPU/TPU).",
  why: "NPU and GPU targets require deterministic, data-parallel patterns. Non-deterministic control flow (random(), dynamic dispatch, unbounded loops) cannot be compiled to fixed-function hardware.",
  suggestedFix: "Use pure, deterministic operations compatible with the target. Move non-deterministic logic to a CPU-qualified flow.",
} as const;

// ---------------------------------------------------------------------------
// Backend / CLI diagnostics — SPORE-BACKEND-001
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Build diagnostics — SPORE-BUILD-001
// ---------------------------------------------------------------------------

/**
 * SPORE-BUILD-001: Same source produced different output on repeated compilation.
 * Indicates a compiler bug, nondeterministic behaviour, or hidden state leakage.
 */
export const SPORE_BUILD_001 = {
  code: "SPORE-BUILD-001",
  name: "NonDeterministicBuild",
  severity: "error" as const,
  message: "Same source produced different output on repeated compilation. This indicates a compiler bug, nondeterministic behaviour, or hidden state leakage.",
  suggestedFix: "Check for: timestamp in output, random values in codegen, hash map iteration order, filesystem enumeration order.",
};

/** SPORE-BACKEND-001: The CLI or runtime backend encountered an unrecoverable error (e.g. file read failure). */
export const SPORE_BACKEND_001 = {
  code: "SPORE-BACKEND-001",
  name: "BackendError",
  severity: "error" as const,
  message: "The Galerina compiler backend encountered an unrecoverable error.",
  why: "A required file could not be read, or an internal pipeline step failed before compilation could begin.",
  suggestedFix: "Check that the file path is correct and that the file is readable.",
};

// ---------------------------------------------------------------------------
// Source-level escape diagnostics — SPORE-SOURCE-ESCAPE-001
// ---------------------------------------------------------------------------

// Phase 12A — Source Escape Checker
export {
  checkSourceEscapes,
  type EscapeDiagnostic,
  type EscapeCheckResult,
} from "./source-escape-checker.js";

/** SPORE-SOURCE-ESCAPE-001: Galerina source calls eval() or a dynamic code loading function. */
export const SPORE_SOURCE_ESCAPE_001 = {
  code: "SPORE-SOURCE-ESCAPE-001",
  name: "SourceLevelEvalEscape",
  severity: "error" as const,
  message: "Galerina source calls eval() or a dynamic code loading function. This bypasses governance, capability checks, and audit trails.",
  why: "Dynamic code cannot be effect-checked, verified, or audited.",
  suggestedFix: "Replace with a declared flow with explicit effects and capability declarations.",
};

// ---------------------------------------------------------------------------
// Safety diagnostics — SPORE-SAFETY-001..006
//
// These replace the deprecated Galerina_COMPILER_* diagnostic codes from
// validateCoreSyntaxSafety. All new safety-checker diagnostics must use
// this series. Galerina_COMPILER_* codes are frozen — do not extend them.
// ---------------------------------------------------------------------------

/** A Tri value was used directly as a branch condition without explicit conversion. */
export const SPORE_SAFETY_001 = {
  code: "SPORE-SAFETY-001",
  name: "TRI_BRANCH_CONDITION",
  severity: "error",
  message: "Tri values must not be used directly as branch conditions. Use exhaustive match or an explicit conversion policy.",
} as const;

/** An unsafe implicit assignment occurred between Bool, Tri, or Decision types. */
export const SPORE_SAFETY_002 = {
  code: "SPORE-SAFETY-002",
  name: "UNSAFE_LOGIC_ASSIGNMENT",
  severity: "error",
  message: "Implicit conversion between Tri, Bool, and Decision is not allowed. Use an explicit policy-bearing conversion flow.",
} as const;

/** A Tri unknown value was mapped to true without policy justification. */
export const SPORE_SAFETY_003 = {
  code: "SPORE-SAFETY-003",
  name: "TRI_UNKNOWN_AS_TRUE",
  severity: "error",
  message: "Converting Tri unknown to true requires explicit policy justification. In secure flows, this is always an error.",
} as const;

/** A raw secret literal was detected in source code. */
export const SPORE_SAFETY_004 = {
  code: "SPORE-SAFETY-004",
  name: "SECRET_LITERAL",
  severity: "error",
  message: "Source must not contain raw secret literals. Use SecureString or an environment reference.",
} as const;

/** An unsafe dynamic code execution call was detected. */
export const SPORE_SAFETY_005 = {
  code: "SPORE-SAFETY-005",
  name: "UNSAFE_DYNAMIC_CODE",
  severity: "error",
  message: "Unsafe dynamic code execution must not appear in Galerina source. Declare intent and use a governed flow.",
} as const;

/** A Tri match block is missing one or more required cases. */
export const SPORE_SAFETY_006 = {
  code: "SPORE-SAFETY-006",
  name: "TRI_MATCH_NOT_EXHAUSTIVE",
  severity: "error",
  message: "Tri match must handle all three cases: Positive, Neutral, and Negative.",
} as const;

export const SPORE_SAFETY_DIAGNOSTICS = [
  SPORE_SAFETY_001,
  SPORE_SAFETY_002,
  SPORE_SAFETY_003,
  SPORE_SAFETY_004,
  SPORE_SAFETY_005,
  SPORE_SAFETY_006,
] as const;

// Phase 18 — Monkey-Patch Checker (source-level SEC-020/021 detection)
export {
  checkMonkeyPatching,
  checkMonkeyPatchingSource,
  type MonkeyPatchDiagnostic,
  type MonkeyPatchCheckResult,
} from "./monkey-patch-checker.js";

// ---------------------------------------------------------------------------
// Security diagnostics — SPORE-SEC-020..021
//
// Source-level detection: fired by checkMonkeyPatching() / checkMonkeyPatchingSource().
// SPORE-BACKEND-001 is reserved for the future JS emitter (ambient authority checks).
// ---------------------------------------------------------------------------

/** SPORE-SEC-020: Runtime behaviour modification is prohibited in Galerina. */
export const SPORE_SEC_020 = {
  code: "SPORE-SEC-020",
  name: "RuntimeMutation",
  severity: "error" as const,
  message: "Runtime behaviour modification is prohibited in Galerina. Use adapters, interfaces, or mocks instead of patching runtime objects.",
  suggestedFix: "Declare an adapter implementing the interface, or use a mock in test boundaries.",
} as const;

/** SPORE-SEC-021: Prototype or object mutation after definition is prohibited. */
export const SPORE_SEC_021 = {
  code: "SPORE-SEC-021",
  name: "PrototypeMutation",
  severity: "error" as const,
  message: "Prototype or object mutation after definition is prohibited. Galerina requires declared behaviour.",
  suggestedFix: "Use type declarations, adapters, or explicit contract extensions.",
} as const;

// ---------------------------------------------------------------------------
// Governed surface types — surfaces that require intent declarations
// ---------------------------------------------------------------------------

export type GovernedSurfaceKind =
  | "api.route"
  | "webhook"
  | "payment.flow"
  | "secret.access"
  | "network.call"
  | "ai.invoke"
  | "native.interop"
  | "deployment.action"
  | "unsafe.block"
  | "privileged.flow";

// ---------------------------------------------------------------------------
// Private internal types
// ---------------------------------------------------------------------------

// Mirrors ContentBlockType in @galerina/core — kept local until workspace links are in place.
type ContentBlockType = "html" | "dom" | "script" | "css";

const VALID_CONTENT_BLOCK_TYPES: ReadonlySet<string> = new Set<ContentBlockType>([
  "html", "dom", "script", "css",
]);

interface ContentBlockScope {
  readonly blockType: ContentBlockType;
  readonly marker: string;
  readonly startLine: number;
}

type ContentBlockOpenResult =
  | { readonly kind: "entered"; readonly scope: ContentBlockScope }
  | { readonly kind: "unknown_type"; readonly diagnostics: readonly CompilerDiagnostic[] };

type KnownCoreType = "Bool" | "Tri" | "Decision";

interface KnownSymbol {
  readonly name: string;
  readonly type: KnownCoreType;
  readonly location: SourceLocation;
}

interface FlowScope {
  readonly kind:
    | "flow"
    | "secure flow"
    | "pure flow"
    | "guarded flow"
    | "privileged flow"
    | "unsafe flow"
    | "experimental flow"
    | "unsafe block";
  readonly startLine: number;
  readonly braceDepth: number;
}

interface MatchBlock {
  readonly symbol: KnownSymbol;
  readonly startLine: number;
  readonly braceDepth: number;
  readonly cases: Set<string>;
}

const TRI_CASES = ["Positive", "Neutral", "Negative"] as const;

export function validateCoreSyntaxSafety(
  source: CompilerSourceText,
  options: CoreSyntaxSafetyOptions = {},
): CompilerResult {
  const diagnostics: CompilerDiagnostic[] = [];
  const symbols = new Map<string, KnownSymbol>();
  const lines = source.text.split(/\r?\n/);
  let flowScope: FlowScope | undefined;
  let matchBlock: MatchBlock | undefined;
  let contentBlockScope: ContentBlockScope | undefined;
  let braceDepth = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();

    // ── Typed content block tracking ─────────────────────────────────────
    // When inside a block, skip all other checks. Brace depth is not updated
    // so that { } in HTML/CSS/JS do not affect Galerina scope tracking.
    if (contentBlockScope !== undefined) {
      if (trimmed === contentBlockScope.marker) {
        contentBlockScope = undefined;
      }
      return;
    }

    // Detect typed content block opens (html/dom/script/css <<MARKER).
    const blockOpen = parseContentBlockOpen(source.file, line, lineNumber);
    if (blockOpen !== undefined) {
      if (blockOpen.kind === "entered") {
        contentBlockScope = blockOpen.scope;
      } else {
        diagnostics.push(...blockOpen.diagnostics);
      }
      return; // block opener line needs no further processing
    }
    // ─────────────────────────────────────────────────────────────────────

    collectFlowSymbols(source.file, line, lineNumber, symbols);
    collectVariableSymbol(source.file, line, lineNumber, symbols);

    const flowStart = parseFlowStart(line, lineNumber, braceDepth);

    if (flowStart !== undefined) {
      flowScope = flowStart;
    }

    if (matchBlock !== undefined) {
      collectMatchCases(line, matchBlock);
    }

    if (matchBlock === undefined) {
      matchBlock = parseTriMatchStart(source.file, line, lineNumber, braceDepth, symbols);
    }

    diagnostics.push(
      ...detectTriBranchCondition(source.file, line, lineNumber, symbols),
      ...detectUnsafeCoreAssignment(source.file, line, lineNumber, symbols),
      ...detectRiskyTriBoolPolicy(source.file, line, lineNumber, flowScope),
      ...detectUnsupportedBindingKeyword(source.file, line, lineNumber),
      ...detectMutInPureFlow(source.file, line, lineNumber, flowScope),
      ...detectUnsafeBlockWithoutReason(source.file, line, lineNumber),
      ...detectRawPointerOutsideUnsafe(source.file, line, lineNumber, flowScope),
    );

    if (options.scanSecrets ?? true) {
      diagnostics.push(...detectSecretLiteral(source.file, line, lineNumber));
    }

    if (options.scanUnsafeDynamicCode ?? true) {
      diagnostics.push(...detectUnsafeDynamicCode(source.file, line, lineNumber));
    }

    braceDepth += countBraceDelta(line);

    if (
      matchBlock !== undefined &&
      braceDepth < matchBlock.braceDepth
    ) {
      diagnostics.push(...validateTriMatchExhaustive(source.file, matchBlock));
      matchBlock = undefined;
    }

    if (flowScope !== undefined && braceDepth < flowScope.braceDepth) {
      flowScope = undefined;
    }

    if (trimmed === "") {
      return;
    }
  });

  if (matchBlock !== undefined) {
    diagnostics.push(...validateTriMatchExhaustive(source.file, matchBlock));
  }

  // Report any typed content block that was opened but never closed.
  if (contentBlockScope !== undefined) {
    diagnostics.push(
      createCompilerDiagnostic(
        SPORE_BLOCK_002.code,
        SPORE_BLOCK_002.name,
        SPORE_BLOCK_002.severity,
        `${contentBlockScope.blockType} block opened with marker ${contentBlockScope.marker} is never closed.`,
        { file: source.file, line: contentBlockScope.startLine, column: 1 },
      ),
    );
  }

  return {
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    diagnostics,
    reports: [],
  };
}

/**
 * Validates a typed content block at the AST level.
 *
 * Stage 1 status: STUB — returns empty diagnostics.
 * Full implementation (Stage 2) will validate block content based on type:
 *   html/dom — HTML structure validation
 *   script   — JavaScript syntax check; SPORE-BLOCK-004 secret detection
 *   css      — CSS property/selector validation
 *
 * TODO SPORE-BLOCK-004: detect ProtectedSecret references interpolated into script blocks.
 */
export function validateTypedContentBlock(_input: {
  readonly blockType: "html" | "dom" | "script" | "css";
  readonly marker: string;
  readonly content: string;
  readonly file: string;
  readonly startLine: number;
}): readonly CompilerDiagnostic[] {
  return [];
}

function collectFlowSymbols(
  file: string,
  line: string,
  lineNumber: number,
  symbols: Map<string, KnownSymbol>,
): void {
  const flowMatch = line.match(
    /^\s*(?:secure\s+|pure\s+)?flow\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([^)]*)\)/,
  );

  if (flowMatch?.[1] === undefined) {
    return;
  }

  for (const parameter of flowMatch[1].split(",")) {
    const parameterMatch = parameter.match(
      /\b([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(Bool|Tri|Decision)\b/,
    );

    if (parameterMatch?.[1] === undefined || parameterMatch[2] === undefined) {
      continue;
    }

    symbols.set(parameterMatch[1], {
      name: parameterMatch[1],
      type: parameterMatch[2] as KnownCoreType,
      location: { file, line: lineNumber, column: line.indexOf(parameterMatch[1]) + 1 },
    });
  }
}

function collectVariableSymbol(
  file: string,
  line: string,
  lineNumber: number,
  symbols: Map<string, KnownSymbol>,
): void {
  const variableMatch = line.match(
    /^\s*(?:let|const)\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(Bool|Tri|Decision)\b/,
  );

  if (variableMatch?.[1] === undefined || variableMatch[2] === undefined) {
    return;
  }

  symbols.set(variableMatch[1], {
    name: variableMatch[1],
    type: variableMatch[2] as KnownCoreType,
    location: { file, line: lineNumber, column: line.indexOf(variableMatch[1]) + 1 },
  });
}

function parseFlowStart(
  line: string,
  lineNumber: number,
  braceDepth: number,
): FlowScope | undefined {
  // Match: [safety-level] flow <name> or unsafe block <name>
  const flowMatch = line.match(
    /^\s*(secure\s+|pure\s+|guarded\s+|privileged\s+|unsafe\s+|experimental\s+)?(?:(flow)\b|(block)\b)/,
  );

  if (flowMatch === null) {
    return undefined;
  }

  // "unsafe block" is distinct from "unsafe flow"
  const isBlock = flowMatch[3] === "block";
  const prefix = flowMatch[1]?.trim() ?? "";

  let kind: FlowScope["kind"];

  if (isBlock && prefix === "unsafe") {
    kind = "unsafe block";
  } else {
    switch (prefix) {
      case "secure":       kind = "secure flow";       break;
      case "pure":         kind = "pure flow";         break;
      case "guarded":      kind = "guarded flow";      break;
      case "privileged":   kind = "privileged flow";   break;
      case "unsafe":       kind = "unsafe flow";       break;
      case "experimental": kind = "experimental flow"; break;
      default:             kind = "flow";              break;
    }
  }

  return {
    kind,
    startLine: lineNumber,
    braceDepth: braceDepth + Math.max(countBraceDelta(line), 1),
  };
}

/**
 * Validates that declared intent and effects are consistent with inferred behavior.
 *
 * Stage 1 status: STUB — returns an empty result.
 * Full implementation requires the compiler AST to carry FlowDeclarationMetadata.
 * Wire up in Stage 3 once the parser emits intent/effect nodes.
 *
 * TODO SPORE-INTENT-001: check inferred effects against declared effects.
 * TODO SPORE-INTENT-002: require intent on governed surfaces.
 * TODO SPORE-INTENT-003: require unsafe blocks to declare reason + fallback.
 * TODO SPORE-INTENT-004: require privileged flows to declare capability.
 * TODO SPORE-INTENT-005: block experimental flows in production targets.
 */
export function validateIntentEffects(
  _flowName: string,
  _safetyLevel: CompilerSafetyLevel,
  _intent: string | undefined,
  _declaredEffects: readonly string[],
  _inferredEffects: readonly string[],
  _isProductionTarget: boolean,
): IntentCheckResult {
  return {
    flowName: _flowName,
    safetyLevel: _safetyLevel,
    ...(_intent === undefined ? {} : { intent: _intent }),
    declaredEffects: [..._declaredEffects],
    inferredEffects: [..._inferredEffects],
    mismatches: [],
    diagnostics: [],
  };
}

function parseTriMatchStart(
  file: string,
  line: string,
  lineNumber: number,
  braceDepth: number,
  symbols: Map<string, KnownSymbol>,
): MatchBlock | undefined {
  const match = line.match(/^\s*match\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);

  if (match?.[1] === undefined) {
    return undefined;
  }

  const symbol = symbols.get(match[1]);

  if (symbol?.type !== "Tri") {
    return undefined;
  }

  return {
    symbol: {
      ...symbol,
      location: { file, line: lineNumber, column: line.indexOf(match[1]) + 1 },
    },
    startLine: lineNumber,
    braceDepth: braceDepth + 1,
    cases: new Set<string>(),
  };
}

function collectMatchCases(line: string, matchBlock: MatchBlock): void {
  const caseMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=>/);

  if (caseMatch?.[1] !== undefined) {
    matchBlock.cases.add(caseMatch[1]);
  }
}

function detectTriBranchCondition(
  file: string,
  line: string,
  lineNumber: number,
  symbols: Map<string, KnownSymbol>,
): readonly CompilerDiagnostic[] {
  const conditionMatch = line.match(/^\s*if\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/);
  const symbol = conditionMatch?.[1] === undefined ? undefined : symbols.get(conditionMatch[1]);

  if (symbol?.type !== "Tri") {
    return [];
  }

  return [
    createCompilerDiagnostic(
      SPORE_SAFETY_001.code,
      SPORE_SAFETY_001.name,
      SPORE_SAFETY_001.severity,
      SPORE_SAFETY_001.message,
      { file, line: lineNumber, column: line.indexOf(symbol.name) + 1 },
    ),
  ];
}

function detectUnsafeCoreAssignment(
  file: string,
  line: string,
  lineNumber: number,
  symbols: Map<string, KnownSymbol>,
): readonly CompilerDiagnostic[] {
  const assignmentMatch = line.match(
    /^\s*(?:let|const)\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*(Bool|Tri|Decision)\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\b/,
  );

  if (assignmentMatch?.[1] === undefined || assignmentMatch[2] === undefined) {
    return [];
  }

  const targetType = assignmentMatch[1] as KnownCoreType;
  const sourceSymbol = symbols.get(assignmentMatch[2]);

  if (sourceSymbol === undefined || sourceSymbol.type === targetType) {
    return [];
  }

  if (
    (sourceSymbol.type === "Tri" && (targetType === "Bool" || targetType === "Decision")) ||
    (sourceSymbol.type === "Decision" && targetType === "Tri")
  ) {
    return [
      createCompilerDiagnostic(
        SPORE_SAFETY_002.code,
        SPORE_SAFETY_002.name,
        SPORE_SAFETY_002.severity,
        `${sourceSymbol.type} must not implicitly convert to ${targetType}. Use an explicit policy-bearing conversion flow.`,
        { file, line: lineNumber, column: line.indexOf(sourceSymbol.name) + 1 },
      ),
    ];
  }

  return [];
}

function detectRiskyTriBoolPolicy(
  file: string,
  line: string,
  lineNumber: number,
  flowScope: FlowScope | undefined,
): readonly CompilerDiagnostic[] {
  const secure = flowScope?.kind === "secure flow";

  // Case 1: an EXPLICIT `unknown_as: true` / `unknown_as_true` policy. This was
  // always flagged — converting the indeterminate (Neutral/HOLD) state to `true`
  // is risky, and forbidden outright in secure flows.
  if (/\bunknown_as(?:\s*:\s*true|_true)\b/.test(line)) {
    return [
      createCompilerDiagnostic(
        SPORE_SAFETY_003.code,
        SPORE_SAFETY_003.name,
        secure ? "error" : "warning",
        secure
          ? "secure flow must not convert Tri unknown to true."
          : "Converting Tri unknown to true is risky and must be justified by policy.",
        { file, line: lineNumber, column: line.search(/\bunknown_as/) + 1 },
      ),
    ];
  }

  // Case 2 (FAIL-CLOSED, #153): a Tri→Bool / Tri→Decision conversion with NO
  // explicit policy for the unknown (Neutral/HOLD) state. Previously this was
  // silently accepted — the HOLD state could collapse to a default value (and a
  // truthy default is the dangerous case). Deny-by-default: every conversion
  // must declare how the unknown state is handled via an `unknown_as:` clause.
  const conversionMatch = line.match(/\b[Tt]ri\.(toBool|toDecision)\s*\(/);
  if (conversionMatch !== null && !/\bunknown_as\b/.test(line)) {
    const method = conversionMatch[1];
    const col = line.search(/\b[Tt]ri\.(?:toBool|toDecision)/);
    return [
      createCompilerDiagnostic(
        SPORE_SAFETY_003.code,
        SPORE_SAFETY_003.name,
        secure ? "error" : "warning",
        secure
          ? `secure flow must not call Tri.${method} without an explicit unknown-state policy (e.g. unknown_as: Negative). The Neutral/HOLD state must never silently coerce to a truthy default.`
          : `Tri.${method} without an explicit unknown-state policy is risky: the Neutral/HOLD state may silently coerce to a default. Declare unknown_as: to make the conversion fail-closed.`,
        { file, line: lineNumber, column: col >= 0 ? col + 1 : 1 },
      ),
    ];
  }

  return [];
}

function detectSecretLiteral(
  file: string,
  line: string,
  lineNumber: number,
): readonly CompilerDiagnostic[] {
  const secretMatch = line.match(
    /\b(api[_-]?key|token|secret|password)\b\s*[:=]\s*"([^"]+)"/i,
  );

  if (secretMatch?.[2] === undefined || isPlaceholderSecret(secretMatch[2])) {
    return [];
  }

  return [
    createCompilerDiagnostic(
      SPORE_SAFETY_004.code,
      SPORE_SAFETY_004.name,
      SPORE_SAFETY_004.severity,
      SPORE_SAFETY_004.message,
      { file, line: lineNumber, column: line.indexOf(secretMatch[2]) + 1 },
    ),
  ];
}

function detectUnsafeDynamicCode(
  file: string,
  line: string,
  lineNumber: number,
): readonly CompilerDiagnostic[] {
  if (!/\b(?:eval|Function|unsafe_exec|raw_shell)\s*\(/.test(line)) {
    return [];
  }

  return [
    createCompilerDiagnostic(
      SPORE_SAFETY_005.code,
      SPORE_SAFETY_005.name,
      SPORE_SAFETY_005.severity,
      SPORE_SAFETY_005.message,
      { file, line: lineNumber, column: Math.max(line.search(/\b(?:eval|Function|unsafe_exec|raw_shell)\s*\(/) + 1, 1) },
    ),
  ];
}

function validateTriMatchExhaustive(
  file: string,
  matchBlock: MatchBlock,
): readonly CompilerDiagnostic[] {
  const missing = TRI_CASES.filter((triCase) => !matchBlock.cases.has(triCase));

  if (missing.length === 0) {
    return [];
  }

  return [
    createCompilerDiagnostic(
      SPORE_SAFETY_006.code,
      SPORE_SAFETY_006.name,
      SPORE_SAFETY_006.severity,
      `Tri match is missing cases: ${missing.join(", ")}.`,
      { file, line: matchBlock.startLine, column: matchBlock.symbol.location.column },
    ),
  ];
}

// Pattern: optional `print ` prefix, then a word, then ` <<MARKER`
// Valid:   html <<HTML, dom <<DOM, script <<SCRIPT, css <<CSS
// Invalid: xml <<XML (unknown type)
const CONTENT_BLOCK_OPEN_RE =
  /^\s*(?:print\s+)?([a-zA-Z][a-zA-Z0-9_]*)\s+<<([A-Z_][A-Z0-9_]*)\s*$/;

function parseContentBlockOpen(
  file: string,
  line: string,
  lineNumber: number,
): ContentBlockOpenResult | undefined {
  const match = line.match(CONTENT_BLOCK_OPEN_RE);

  if (match === null || match[1] === undefined || match[2] === undefined) {
    return undefined;
  }

  const rawType = match[1].toLowerCase();
  const marker = match[2];

  if (!VALID_CONTENT_BLOCK_TYPES.has(rawType)) {
    return {
      kind: "unknown_type",
      diagnostics: [
        createCompilerDiagnostic(
          SPORE_BLOCK_001.code,
          SPORE_BLOCK_001.name,
          SPORE_BLOCK_001.severity,
          `Unknown typed content block type "${rawType}". Valid types are: html, dom, script, css.`,
          { file, line: lineNumber, column: line.search(new RegExp(`\\b${match[1]}\\b`)) + 1 },
        ),
      ],
    };
  }

  return {
    kind: "entered",
    scope: {
      blockType: rawType as ContentBlockType,
      marker,
      startLine: lineNumber,
    },
  };
}

function detectUnsupportedBindingKeyword(
  file: string,
  line: string,
  lineNumber: number,
): readonly CompilerDiagnostic[] {
  const trimmed = line.trim();

  // Ignore comment lines and doc comments
  if (trimmed.startsWith("//") || trimmed.startsWith("///")) {
    return [];
  }

  // Detect `var <identifier>` or `var <identifier>:` as a statement
  if (/^\s*\bvar\s+[A-Za-z_]/.test(line)) {
    return [
      createCompilerDiagnostic(
        SPORE_SYNTAX_001.code,
        SPORE_SYNTAX_001.name,
        SPORE_SYNTAX_001.severity,
        SPORE_SYNTAX_001.message,
        { file, line: lineNumber, column: line.search(/\bvar\b/) + 1 },
      ),
    ];
  }

  // Detect `const <identifier>` or `const <identifier>:` as a statement
  // Exclude TypeScript-style `export const` — this scanner runs on .spore files
  if (/^\s*\bconst\s+[A-Za-z_]/.test(line)) {
    return [
      createCompilerDiagnostic(
        SPORE_SYNTAX_002.code,
        SPORE_SYNTAX_002.name,
        SPORE_SYNTAX_002.severity,
        SPORE_SYNTAX_002.message,
        { file, line: lineNumber, column: line.search(/\bconst\b/) + 1 },
      ),
    ];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Binding and pipeline checker stubs
// ---------------------------------------------------------------------------

/**
 * Checks whether a reassignment targets an immutable binding.
 *
 * Stage 1 status: STUB — returns diagnostics based on binding kind alone.
 * Full implementation requires AST-level binding scope tracking.
 *
 * TODO SPORE-BINDING-001: reject reassignment of let bindings.
 * TODO SPORE-BINDING-002: reject reassignment of readonly bindings.
 */
export function checkBindingReassignment(input: {
  readonly bindingKind: "let" | "mut" | "readonly";
  readonly bindingName: string;
  readonly location: SourceLocation;
}): readonly CompilerDiagnostic[] {
  if (input.bindingKind === "let") {
    return [
      createCompilerDiagnostic(
        SPORE_BINDING_001.code,
        SPORE_BINDING_001.name,
        SPORE_BINDING_001.severity,
        `Cannot reassign immutable let binding ${input.bindingName}. Use mut only if reassignment is required.`,
        input.location,
      ),
    ];
  }

  if (input.bindingKind === "readonly") {
    return [
      createCompilerDiagnostic(
        SPORE_BINDING_002.code,
        SPORE_BINDING_002.name,
        SPORE_BINDING_002.severity,
        `Cannot reassign readonly binding ${input.bindingName}.`,
        input.location,
      ),
    ];
  }

  return [];
}

/**
 * Checks whether a property mutation occurs through a readonly binding.
 *
 * Stage 1 status: STUB — returns diagnostic when binding is readonly.
 * Full implementation requires property access tracking in the AST.
 *
 * TODO SPORE-BINDING-003: reject property mutation through readonly binding.
 */
export function checkReadonlyMutation(input: {
  readonly bindingKind: "let" | "mut" | "readonly";
  readonly bindingName: string;
  readonly propertyName: string;
  readonly location: SourceLocation;
}): readonly CompilerDiagnostic[] {
  if (input.bindingKind !== "readonly") {
    return [];
  }

  return [
    createCompilerDiagnostic(
      SPORE_BINDING_003.code,
      SPORE_BINDING_003.name,
      SPORE_BINDING_003.severity,
      `Cannot mutate property ${input.propertyName} through readonly binding ${input.bindingName}.`,
      input.location,
    ),
  ];
}

/**
 * Validates a method-chain pipeline for type safety, effects, and readonly rules.
 *
 * Stage 1 status: STUB — returns an empty result.
 * Full implementation requires:
 *   - Type scope (to resolve method return types)
 *   - Effect context (to compare declared vs used effects)
 *   - Readonly scope (to detect readonly receiver mutation)
 *
 * TODO SPORE-PIPELINE-001: reject unknown pipeline methods.
 * TODO SPORE-PIPELINE-002: reject type mismatches between stages.
 * TODO SPORE-PIPELINE-003: require Result handling in fallible pipelines.
 * TODO SPORE-PIPELINE-004: require declared effects for effectful stages.
 * TODO SPORE-PIPELINE-005: reject readonly receiver mutation.
 */
export function checkMethodChain(_input: {
  readonly receiver: string;
  readonly calls: readonly { readonly methodName: string }[];
  readonly location: SourceLocation;
}): readonly CompilerDiagnostic[] {
  return [];
}

/**
 * Checks whether a `mut` binding is used inside a pure-context flow.
 *
 * Implemented: Phase 3 (binding-level, no AST required).
 * `pure flow` bodies must not contain mutable bindings; callers should use
 * `let` or a functional accumulator (fold, count, filter).
 *
 * @param flowSafetyLevel - The safety level of the enclosing flow.
 * @param bindingName     - Name of the binding declared with `mut`.
 * @param location        - Source location for the diagnostic.
 */
export function checkMutInPureContext(input: {
  readonly flowSafetyLevel: "pure" | "safe" | "secure" | "guarded" | "privileged" | "unsafe" | "experimental";
  readonly bindingName: string;
  readonly location: SourceLocation;
}): readonly CompilerDiagnostic[] {
  if (input.flowSafetyLevel !== "pure") {
    return [];
  }

  return [
    createCompilerDiagnostic(
      SPORE_BINDING_004.code,
      SPORE_BINDING_004.name,
      SPORE_BINDING_004.severity,
      `mut binding ${input.bindingName} is not allowed in a pure flow. Use let or a functional accumulator (fold, count, filter).`,
      input.location,
    ),
  ];
}

/**
 * Emits SPORE-BINDING-004 when a `mut` binding declaration appears inside a
 * `pure flow` body. `pure flow` contexts forbid all mutable state.
 *
 * Phase 3 binding-level rule — no AST required. Full effect tracking
 * (including deeply nested pure closures) is Phase 5 work.
 */
function detectMutInPureFlow(
  file: string,
  line: string,
  lineNumber: number,
  flowScope: FlowScope | undefined,
): readonly CompilerDiagnostic[] {
  if (flowScope?.kind !== "pure flow") {
    return [];
  }

  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("///")) {
    return [];
  }

  // Match `mut <identifier>` as a binding declaration (not a type name or argument label)
  const mutMatch = line.match(/^\s*\bmut\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
  if (mutMatch === null || mutMatch[1] === undefined) {
    return [];
  }

  return [
    createCompilerDiagnostic(
      SPORE_BINDING_004.code,
      SPORE_BINDING_004.name,
      SPORE_BINDING_004.severity,
      `mut binding "${mutMatch[1]}" is not allowed in a pure flow. Use let or a functional accumulator (fold, count, filter).`,
      { file, line: lineNumber, column: line.search(/\bmut\b/) + 1 },
    ),
  ];
}

/**
 * Emits SPORE-MEMORY-008 when an `unsafe block` opening line is missing a
 * `reason` declaration. Every unsafe block must declare a human-readable
 * reason justification on the same line as the block header.
 *
 * Syntax required: unsafe block <name> reason "<text>" fallback <safeFlow> {
 *
 * Phase 3 binding-level rule. Structural validation of reason/fallback content
 * is Phase 5 (AST) work.
 */
function detectUnsafeBlockWithoutReason(
  file: string,
  line: string,
  lineNumber: number,
): readonly CompilerDiagnostic[] {
  // Only fire on lines that begin an unsafe block scope
  if (!/^\s*\bunsafe\s+block\b/.test(line)) {
    return [];
  }

  // If `reason` keyword already appears on the same line, declaration is present
  if (/\breason\b/.test(line)) {
    return [];
  }

  return [
    createCompilerDiagnostic(
      SPORE_MEMORY_008.code,
      SPORE_MEMORY_008.name,
      SPORE_MEMORY_008.severity,
      `unsafe block must declare a reason on the opening line. Expected: unsafe block <name> reason "<justification>" fallback <safeFlow> { ... }`,
      { file, line: lineNumber, column: line.search(/\bunsafe\b/) + 1 },
    ),
  ];
}

/**
 * Emits SPORE-RAWPTR-001 when a raw-pointer dereference expression appears
 * outside an approved unsafe block.
 *
 * Galerina bans raw pointer access in normal code. The pattern `*identifier`
 * at the start of an expression (after whitespace, `=`, or `(`) is treated
 * as a pointer dereference. Inside an `unsafe flow` or `unsafe block` scope
 * the expression is permitted.
 *
 * Phase 3 binding-level rule. Type-level pointer tracking is Phase 5 work.
 */
function detectRawPointerOutsideUnsafe(
  file: string,
  line: string,
  lineNumber: number,
  flowScope: FlowScope | undefined,
): readonly CompilerDiagnostic[] {
  // Pointer access is permitted inside unsafe scopes
  if (flowScope?.kind === "unsafe flow" || flowScope?.kind === "unsafe block") {
    return [];
  }

  const trimmed = line.trim();
  if (trimmed.startsWith("//") || trimmed.startsWith("///")) {
    return [];
  }

  // Detect `*identifier` as a pointer dereference — after `=`, `(`, or at start
  const ptrMatch = line.match(/(?:^|[=(,\s])\*([A-Za-z_][A-Za-z0-9_]*)\b/);
  if (ptrMatch === null) {
    return [];
  }

  const column = line.search(/(?:^|[=(,\s])\*[A-Za-z_]/) + 1;

  return [
    createCompilerDiagnostic(
      SPORE_RAWPTR_001.code,
      SPORE_RAWPTR_001.name,
      SPORE_RAWPTR_001.severity,
      SPORE_RAWPTR_001.message,
      { file, line: lineNumber, column },
    ),
  ];
}

function createCompilerDiagnostic(
  code: string,
  name: string,
  severity: CompilerDiagnostic["severity"],
  message: string,
  location?: SourceLocation,
  suggestedFix?: string,
): CompilerDiagnostic {
  return {
    code,
    name,
    severity,
    message,
    ...(location === undefined ? {} : { location }),
    ...(suggestedFix === undefined ? {} : { suggestedFix }),
  };
}

function countBraceDelta(line: string): number {
  let delta = 0;

  for (const character of line) {
    if (character === "{") {
      delta += 1;
    }

    if (character === "}") {
      delta -= 1;
    }
  }

  return delta;
}

function isPlaceholderSecret(value: string): boolean {
  return /^(?:example|placeholder|redacted|change-me|todo|SecureString\(redacted\))$/i.test(
    value,
  );
}
