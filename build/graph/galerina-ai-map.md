# Galerina AI Map

## galerina-core

Galerina / Galerina language package, examples, schemas and prototype CLI.

Provides:
- OrderId
- CustomerId
- OrderItem
- CreateOrderRequest
- CreateOrderResponse
- CreateOrderResult
- Decision
- ArithmeticBenchmarkReport
- ArithmeticBenchmarkError
- BootPolicy
- HardwareAdmission
- Buffer

## galerina-core-runtime-wasm

Border-safe WASM trust-computing base (RD-0361 R4 / #143): the record-layout ABI and (next brick) the attested WASM instantiation TCB that the kernel/DSS reach WITHOUT importing the compiler.

Provides:
- DecTrapKind
- DEC_TRAP_KINDS
- MoneyTrapKind
- MONEY_TRAP_KINDS
- DecResult
- DecCompare
- MAX_DECIMAL_SCALE
- MAX_DECIMAL_DIGITS
- RoundMode
- ROUND_MODES
- isRoundMode
- isDecTrap

## galerina-core-compiler

Galerina compiler pipeline contracts for parsing, checking, IR, diagnostics and reports.

Provides:
- COMPILER_BUILD_EVIDENCE_SCHEMA
- CONSUMED_COMPILER_OUTPUTS
- BuildEvidenceFileRecord
- CompilerBuildEvidence
- assertNoDuplicateJsonKeys
- createBuildEvidence
- writeBuildEvidence
- verifyBuildEvidence
- ArtifactOwner
- ArtifactKind
- Sha256Digest
- ARTIFACT_REFERENCE_SCHEMA

## galerina-core-runtime

Galerina execution engine contracts for checked and compiled runtime execution.

Provides:
- RuntimeMode
- RuntimeEnvironment
- RuntimeDiagnosticSeverity
- RuntimeContext
- RuntimeDiagnostic
- RuntimeError
- RuntimeResult
- RuntimeEffectKind
- RuntimeEffect
- RuntimeEffectPolicy
- RuntimeEffectDecision
- RuntimeReport

## galerina-core-network

Galerina core network I/O policy, profile, permission and report contracts.

Provides:
- AdmissionHealth
- AdmissionTelemetry
- telemetryToSideSignal
- withTelemetryFeedback
- certGateWithTelemetry
- ChainValidationOutcome
- RevocationOutcome
- CertSubVerdicts
- CertGateInput
- toSubVerdicts
- certVerdict
- withSideSignal

## galerina-core-security

Reusable Galerina security primitives, redaction helpers, permission models and security report contracts.

Provides:
- CRYPTO_PROVIDER_SCHEMA
- PasswordKdfAlgorithm
- CryptoProviderRequest
- CryptoProviderResult
- CryptoProvider
- FUNGI_CRYPTO_PROVIDER_REQUIRED
- FUNGI_CRYPTO_PROVIDER_THREW
- FUNGI_CRYPTO_PROVIDER_MALFORMED
- FUNGI_CRYPTO_PROVIDER_SCHEMA
- DAGEdgeResult
- DSSState
- DWIHandle

## galerina-core-config

Galerina project configuration, environment mode and policy loading contracts.

Provides:
- GOVERNANCE_MODES
- GovernanceMode
- DEFAULT_GOVERNANCE_MODE
- isGovernanceMode
- ResolvedProjectGovernance
- resolveProjectGovernance
- GALERINA_ENVIRONMENT_MODES
- EnvironmentMode
- ConfigDiagnosticSeverity
- ConfigDiagnostic
- ProjectPackageReference
- ProductionPackageOverride

## galerina-core-reports

Shared Galerina report schemas and report-writing contracts.

Provides:
- AI_DIGEST_MAX_TEXT
- AI_DIGEST_MAX_ITEMS
- AI_DIGEST_MAX_INPUT
- AiDigestList
- AiDigest
- aiSafeText
- aiSafePath
- AiErrorItem
- aiErrorDigest
- AiProjectInput
- AiProjectDigest
- aiProjectDigest

## galerina-core-logic

Galerina multi-state logic concepts including Tri, Decision, BoolBoundary and Omni logic.

Provides:
- ComputeMixBenchmarkRequest
- BoolBoundaryContext
- BoolBoundaryResult
- FUNGI_BOOL_BOUNDARY_001_FAILED_CLOSED
- FUNGI_BOOL_BOUNDARY_002_UNKNOWN_REASON
- FUNGI_BOOL_BOUNDARY_003_INVALID_INPUT
- FUNGI_BOOL_BOUNDARY_004_MISSING_BOUNDARY_NAME
- FUNGI_BOOL_BOUNDARY_005_RESULT_MISUSED
- boolDiagnosticFailedClosed
- boolDiagnosticUnknownReason
- boolDiagnosticInvalidInput
- boolDiagnosticMissingBoundaryName

## galerina-core-vector

Galerina vector value, lane, operation and report concepts.

Provides:
- VectorDimension
- NumericElementType
- VectorType
- MatrixShape
- MatrixType
- TensorShape
- TensorType
- QuantizedType
- VectorOperation
- TensorOperation
- VectorReport
- VectorDiagnosticSeverity

## galerina-core-compute

Galerina compute planning, capability and target selection concepts.

Provides:
- CompatibilityReport
- buildCompatibilityReport
- FUNGI_COMPAT_FORBIDDEN_EFFECT
- FUNGI_COMPAT_UNSUPPORTED_EFFECT
- FUNGI_COMPAT_MISSING_CAPABILITY
- FUNGI_COMPAT_MEMORY_LIMIT
- FUNGI_COMPAT_SENSITIVE_DATA
- CompatDiagnosticEntry
- COMPAT_DIAGNOSTIC_REGISTRY
- CompatibilityLevel
- COMPATIBILITY_LEVELS
- CompatibilityBlocker

## galerina-ai

Galerina AI inference contracts, model metadata, safety policy and reports.

Provides:
- AiTaskKind
- AiOutputTrust
- AiModelFormat
- AiInferenceTarget
- AiDiagnosticSeverity
- AiDiagnostic
- AiMemoryEstimate
- AiModelCapability
- AiModelDescriptor
- AiModelRegistryEntry
- AiModelRegistry
- AiTargetSelection

## galerina-ai-lowbit

Galerina low-bit AI inference contracts with BitNet as an optional backend.

Provides:
- LowBitAiTarget
- LowBitAiBackendId
- LowBitAiDevice
- LowBitAiWeightFormat
- LowBitAiQuantization
- LowBitAiEmbeddingQuantization
- LowBitAiKernelFamily
- LowBitAiRuntimeKind
- LowBitAiDiagnosticSeverity
- LowBitAiDiagnostic
- LowBitAiBackendAdapter
- LowBitAiModelReference

## galerina-ai-agent

Galerina supervised AI agent, tool permission, task group and report contracts.

Provides:
- AGENT_DECLARATION_SCHEMA
- MAX_AGENT_SOURCE_BYTES
- MAX_AGENT_DECLARATIONS
- MAX_AGENT_TOOLS
- MAX_AGENT_LINE_LENGTH
- AgentSourceSpan
- AgentDeclarationNode
- AgentDeclarationParseResult
- AgentDeclarationLowering
- parseAgentDeclarations
- lowerAgentDeclaration
- GovernanceVerdict

## galerina-ai-neural

Galerina neural network model, layer, inference and training boundary contracts.

Provides:
- NeuralTask
- ActivationFunction
- LossFunction
- OptimizerName
- TensorShapeRef
- NeuralTensorRef
- NeuralLayer
- NeuralModelDefinition
- NeuralInferencePlan
- NeuralTrainingPlan
- NeuralReport
- NeuralDiagnosticSeverity

## galerina-ai-neuromorphic

Galerina neuromorphic and spiking event model contracts.

Provides:
- Spike
- SpikeTrain
- EventSignal
- SpikingModel
- NeuromorphicPlan
- NeuromorphicReport
- NeuromorphicDiagnosticSeverity
- NeuromorphicDiagnostic
- validateSpikeTrain
- validateSpikingModel
- validateNeuromorphicPlan
- createNeuromorphicReport

## galerina-data

Galerina data processing package umbrella contracts.

Provides:
- DataFamilyPackage
- DATA_FAMILY_PACKAGES
- DataMemoryLimits
- DataSecurityBoundary
- DataBoundaryDeclaration
- DataChecksumAlgorithm
- ArchiveIntegrityRef
- DataReportStatus
- DataFamilyReportEntry
- DataFamilyReportIndex
- DataDiagnosticSeverity
- DataDiagnostic

## galerina-data-html

Galerina HTML parse, sanitize, render and search document contracts.

Provides:
- HtmlParseMode
- HtmlParsePlan
- HtmlSanitizePolicy
- HtmlRenderPlan
- HtmlExtractionTarget
- HtmlExtractionPlan
- HtmlSearchField
- HtmlSearchDocumentPlan
- HtmlUnsafeFindingKind
- HtmlUnsafeAction
- HtmlUnsafeFinding
- HtmlProcessingReport

## galerina-data-search

Galerina search document, indexing, query and search report contracts.

Provides:
- SearchFieldKind
- SearchDocumentField
- SearchDocumentContract
- SearchIndexPolicy
- SearchIndexInput
- SearchFilterOperator
- SearchFilter
- SearchQueryContract
- SearchRankingStrategy
- SearchFieldBoost
- SearchRankingMetadata
- SearchIndexReport

## galerina-data-archive

Galerina archive manifest, integrity and restore report contracts.

Provides:
- ChecksumAlgorithm
- ChecksumRef
- ContentAddressedRef
- ArchiveItem
- SignatureAlgorithm
- SignatureRef
- RetentionPolicyRef
- ArchiveManifest
- ArchiveVerificationStatus
- ArchiveIntegrityReport
- ArchiveRestoreReport
- ArchiveDiagnosticSeverity

## galerina-data-db

Galerina typed database boundary contracts for model, query, command, response, archive and report flows.

Provides:
- DbBoundaryOperationKind
- DbBoundaryOperation
- DbBoundaryRequirements
- DbModelFlow
- DbReportIndexEntry
- DbReportIndex
- DbBoundaryReport
- DbDiagnosticSeverity
- DbDiagnostic
- KNOWN_DB_OPERATION_KINDS
- validateDbBoundaryOperation
- validateDbBoundaryRequirements

## galerina-data-model

Galerina typed database model, field classification and storage mapping contracts.

Provides:
- ModelFieldClassification
- ModelFieldType
- SecretStorageMode
- ModelField
- ModelKeyKind
- ModelKey
- ModelPermissionAction
- ModelPermission
- StorageKind
- StorageMapping
- DataModelContract
- DataModelDiagnosticSeverity

## galerina-data-query

Galerina typed query, command, parameterisation and database access report contracts.

Provides:
- QueryParameterType
- QueryParameter
- QueryCardinality
- TypedQueryDeclaration
- CommandEffect
- TypedCommandDeclaration
- RawSqlException
- DatabaseAccessPolicy
- QueryOption
- optionSome
- optionNone
- isSome

## galerina-data-response

Galerina safe database-model-to-response mapping and response report contracts.

Provides:
- ResponseFieldClassification
- SourceModelField
- ResponseFieldMapping
- ModelToResponseMapping
- ResponseFlowDeclaration
- ResponseReportKind
- ResponseReport
- ResponseDiagnosticSeverity
- ResponseDiagnostic
- validateResponseMapping
- validateResponseFlow
- applyResponseMapping

## galerina-data-json

Galerina JSON streaming, validation, redaction and archive contracts.

Provides:
- JsonDecodeMode
- JsonMemoryPolicy
- JsonDecodePlan
- JsonSchemaKind
- JsonSchemaField
- JsonSchemaContract
- JsonExtractionPlan
- JsonRedactionPolicy
- JsonArchiveReport
- JsonDiagnosticSeverity
- JsonDiagnostic
- validateJsonMemoryPolicy

## galerina-data-database

Galerina database export, snapshot, checksum and archive contracts.

Provides:
- DatabaseChecksumAlgorithm
- DatabaseChecksum
- SchemaVersionMetadata
- DatabaseSnapshotMetadata
- TableExportContract
- DatabaseExportContract
- DatabaseVerificationStatus
- DatabaseExportReport
- DatabaseRestoreValidationReport
- DatabaseDiagnosticSeverity
- DatabaseDiagnostic
- validateDatabaseChecksum

## galerina-data-pipeline

Galerina bounded streaming data pipeline, backpressure and checkpoint contracts.

Provides:
- PipelineSourceKind
- PipelineSource
- PipelineTransform
- BatchWindow
- SaturationBehaviour
- BackpressurePolicy
- CheckpointPolicy
- RetryPolicy
- QuarantinePolicy
- PipelineBudgets
- PipelineStage
- PipelineDefinition

## galerina-data-reports

Galerina data processing, HTML, search, archive and pipeline report contracts.

Provides:
- DataReportKind
- DataReportStatus
- DataReportDiagnosticSeverity
- DataReportDiagnostic
- DataReportEnvelope
- KNOWN_DATA_REPORT_KINDS
- deriveDataReportStatus
- validateDataReportEnvelope
- createDataReportEnvelope

## galerina-web

Galerina browser-safe web package umbrella contracts.

Provides:
- WebFamilyPackage
- WEB_FAMILY_PACKAGES
- WebDiagnosticSeverity
- WebDiagnostic
- BrowserRuntimeProfile
- WebRuntimeCheck
- WebRuntimeCheckOutcome
- WebReportStatus
- BrowserRuntimeReport
- WEB_RUNTIME_CHECKS
- WebFamilyReportEntry
- WebFamilyReportIndex

## galerina-web-render

Galerina typed safe browser rendering pipeline contracts.

Provides:
- WebRenderDiagnosticSeverity
- WebRenderDiagnostic
- TextRenderContent
- SafeHtmlRenderContent
- RenderableContent
- KNOWN_RENDERABLE_CONTENT_KINDS
- StateDiffRenderPlan
- StreamingBatchRenderPlan
- DomUpdateCounts
- WebRenderCheck
- WebRenderCheckOutcome
- WebRenderReportStatus

## galerina-web-state

Galerina browser client state and state-diff contracts.

Provides:
- WebStateDiagnosticSeverity
- WebStateDiagnostic
- PageStatePhase
- KNOWN_PAGE_STATE_PHASES
- PageStateFieldKind
- KNOWN_PAGE_STATE_FIELD_KINDS
- PageStateField
- PageStateContract
- ApiToStateConversion
- HydrationFieldClassification
- KNOWN_HYDRATION_CLASSIFICATIONS
- HydrationPayloadField

## galerina-web-components

Galerina typed browser component boundary contracts.

Provides:
- WebComponentsDiagnosticSeverity
- WebComponentsDiagnostic
- ComponentPropKind
- KNOWN_COMPONENT_PROP_KINDS
- ComponentProp
- ComponentTextChild
- ComponentSafeHtmlChild
- ComponentChildContent
- KNOWN_COMPONENT_CHILD_KINDS
- ComponentSlotContent
- ComponentEffect
- KNOWN_COMPONENT_EFFECTS

## galerina-web-router

Galerina browser route and navigation contracts.

Provides:
- WebRouterDiagnosticSeverity
- WebRouterDiagnostic
- RouteParamValidatorKind
- KNOWN_ROUTE_PARAM_VALIDATORS
- RouteParamDeclaration
- RouteDataFetchContract
- RouteContract
- RoutePreloadPolicy
- WebRouterCheck
- WebRouterCheckOutcome
- WebRouterReportStatus
- WebRouteReport

## galerina-web-events

Galerina typed browser event contracts.

Provides:
- WebEventsDiagnosticSeverity
- WebEventsDiagnostic
- WebEventKind
- KNOWN_WEB_EVENT_KINDS
- EventPayloadFieldKind
- KNOWN_EVENT_PAYLOAD_FIELD_KINDS
- EventPayloadField
- EventPropagationPolicy
- KNOWN_EVENT_PROPAGATION_POLICIES
- EventRatePolicy
- SensitiveCapability
- KNOWN_SENSITIVE_CAPABILITIES

## galerina-db-postgres

Galerina PostgreSQL adapter contract placeholder.

Provides:
- PostgresDiagnosticSeverity
- PostgresDiagnostic
- PostgresAdapterRequirements
- PostgresContractRefs
- PostgresCredentialRef
- PostgresPlaceholderStyle
- PostgresSslMode
- PostgresConnectionContract
- PostgresAdapterDeclaration
- PostgresAdapterCheck
- PostgresAdapterCheckOutcome
- PostgresAdapterReportStatus

## galerina-db-mysql

Galerina MySQL adapter contract placeholder.

Provides:
- MysqlDiagnosticSeverity
- MysqlDiagnostic
- MysqlAdapterRequirements
- MysqlContractRefs
- MysqlCredentialRef
- MysqlPlaceholderStyle
- MysqlTlsMode
- MysqlConnectionContract
- MysqlAdapterDeclaration
- MysqlAdapterCheck
- MysqlAdapterCheckOutcome
- MysqlAdapterReportStatus

## galerina-db-sqlite

Galerina SQLite adapter contract placeholder.

Provides:
- SqliteDiagnosticSeverity
- SqliteDiagnostic
- SqliteAdapterRequirements
- SqliteContractRefs
- SqliteCredentialRef
- SqlitePlaceholderStyle
- SqliteJournalMode
- SqliteAdapterDeclaration
- SqliteAdapterCheck
- SqliteAdapterCheckOutcome
- SqliteAdapterReportStatus
- SqliteAdapterReport

## galerina-db-opensearch

Galerina OpenSearch adapter contract placeholder.

Provides:
- OpenSearchDiagnosticSeverity
- OpenSearchDiagnostic
- OpenSearchAdapterRequirements
- OpenSearchContractRefs
- OpenSearchCredentialRef
- OpenSearchConnectionContract
- OpenSearchIndexOperationKind
- OpenSearchIndexOperation
- OpenSearchQueryContract
- OpenSearchAdapterDeclaration
- OpenSearchAdapterCheck
- OpenSearchAdapterCheckOutcome

## galerina-db-firestore

Galerina Firestore adapter contract placeholder.

Provides:
- FirestoreDiagnosticSeverity
- FirestoreDiagnostic
- FirestoreAdapterRequirements
- FirestoreContractRefs
- FirestoreCredentialRef
- FirestorePathKind
- FirestorePathContract
- FirestoreIndexFieldOrder
- FirestoreIndexField
- FirestoreCompositeIndex
- FirestoreAdapterDeclaration
- FirestoreAdapterCheck

## galerina-core-photonic

Galerina photonic and wavelength concepts, models, APIs and simulation contracts.

Provides:
- Wavelength
- Phase
- Amplitude
- OpticalSignal
- OpticalChannel
- PhotonicMapping
- PhotonicMode
- PHOTONIC_DIAGNOSTIC_SCHEMA
- PhotonicDiagnosticSeverity
- PhotonicDiagnostic
- PhotonicDiagnosticDecode
- PhotonicPlan

## galerina-target-cpu

Galerina CPU target capability, fallback and execution planning contracts.

Provides:
- CpuArchitecture
- CpuSimdFeature
- CpuWorkloadClass
- CpuThreadingPolicy
- CpuTargetCapability
- CpuTargetPlan
- CpuTargetReport
- CpuFeatureProbe
- CpuTargetDiagnosticSeverity
- CpuTargetDiagnostic
- CpuCalibrationSample
- CpuCalibrationReport

## galerina-cpu-kernels

Galerina optimized CPU kernel contracts for scalar, vector, matrix and low-bit workloads.

Provides:
- CpuKernelOperation
- CpuKernelDataType
- CpuKernelFeature
- CpuKernelTilePlan
- CpuKernelPlan
- CpuKernelBenchmark
- CpuKernelReport
- CpuKernelNativeAbi
- CpuKernelCalibrationEntry
- CpuKernelCalibrationCache
- CpuKernelDiagnosticSeverity
- CpuKernelDiagnostic

## galerina-target-native

Galerina future native executable and ABI target planning concepts.

Provides:
- NATIVE_ARTIFACT_SCHEMA
- NativeAbi
- NativeTarget
- NativeVokBinding
- NativeArtifact
- NativeTargetReport
- NativeDiagnosticSeverity
- NativeDiagnostic
- validateNativeTarget
- validateNativeArtifact
- createNativeTargetReport
- createHash

## galerina-target-js

Galerina JavaScript output target planning contracts.

Provides:
- JsRuntime
- JsModuleFormat
- SourceMapMode
- JsBuildMode
- SourceMapRule
- JsOutputPlan
- EsModuleMetadata
- FrameworkAdapterMetadata
- JsBundleCheckOutcome
- JsBundleReport
- JsTargetDiagnosticSeverity
- JsTargetDiagnostic

## galerina-target-wasm

Galerina WebAssembly target planning and output contracts.

Provides:
- WASM_ARTEFACT_SCHEMA
- WASM_FALLBACK_SCHEMA
- WASM_HANDOFF_SCHEMA
- WASM_DIAGNOSTIC_REGISTRY
- WasmTarget
- WasmSectionKind
- WasmSectionExport
- WasmSectionImport
- WasmSandboxLimits
- WasmArtefactAttestation
- WasmArtefact
- WasmRefusedArtefact

## galerina-target-gpu

Galerina GPU target planning and output contracts.

Provides:
- GpuTargetCapability
- GpuKernelPlan
- GpuTargetReport
- GpuDiagnosticSeverity
- GpuDiagnostic
- validateGpuKernelPlan
- createGpuTargetReport
- isProxy

## galerina-target-ai-accelerator

Galerina NPU, TPU and AI accelerator target planning contracts.

Provides:
- AiAcceleratorKind
- AiAcceleratorWorkloadKind
- AiAcceleratorPrecision
- AiAcceleratorFramework
- AiAcceleratorModelFormat
- AiAcceleratorAdapterId
- AiAcceleratorDiagnosticSeverity
- AiAcceleratorDiagnostic
- AiAcceleratorTopology
- AiAcceleratorMemoryProfile
- AiAcceleratorBackendProfile
- AiAcceleratorCapability

## galerina-target-photonic

Galerina photonic target backend planning concepts.

Provides:
- PhotonicActualTarget
- PhotonicTargetStatus
- PhotonicOperationKind
- OpticalInterconnectMode
- OpticalTransferFormat
- PhotonicTargetCapability
- OpticalIoCapability
- PhotonicTargetInput
- PhotonicLoweringPlan
- PhotonicOperationMapping
- UnsupportedPhotonicOperation
- PhotonicSimulationTarget

## galerina-framework-app-kernel

Optional Galerina secure App Kernel: the fixed, non-bypassable governed request pipeline + secure-default route policy resolver. The fusion host for protocol/capability packages.

Provides:
- VideoJob
- canonicalJson
- FuseDescriptor
- FusedComponent
- FusePackageOptions
- HybridManifestVerdict
- HybridManifestVerifier
- CapabilityImportFactory
- BUILTIN_CAPABILITY_NAMES
- buildCapabilityImports
- admitFusePackageName
- CompositionMember

## galerina-framework-api-server

Galerina HTTP API-server adapter: a thin node:http transport that buffers the request body under a hard DoS cap and hands every request to the non-bypassable App Kernel. It never pre-empts a kernel gate except the additive body cap.

Provides:
- DEFAULT_MAX_BODY_BYTES
- DEFAULT_REQUEST_TIMEOUT_MS
- DEFAULT_HEADERS_TIMEOUT_MS
- DEFAULT_IDLE_TIMEOUT_MS
- RevocationResolution
- PrincipalResolution
- ApiServerTlsOptions
- CreateApiServerOptions
- ApiServerWebhookOptions
- createApiServer
- listen
- MemoryReplayStoreOptions

## galerina-auth

Standalone Galerina authentication/authorization FACTOR provider: computes the K3 auth/identity verdicts (TLSTP S1 channel/identity via the shipped certGate, the tightened required-auth posture, and scope authorization) that the App Kernel folds at its fixed, non-bypassable admission gate. galerina-auth provides the FACTORS; the App Kernel still decides admission.

Provides:
- scopeVerdict
- JwtAlg
- BearerVerifyOptions
- bearerTokenVerdict
- channelIdentityVerdict
- composeAuthVerdict
- previewAdmission
- HeaderPresenceOptions
- headerPresenceVerdict

## galerina-docs

Galerina API documentation generator: emits a valid OpenAPI 3.x document from the App Kernel's governed route table (EffectiveRoutePolicy / RouteDeclaration) and contract metadata. The generated spec documents exactly the gates the kernel enforces — auth, body limits, idempotency, rate limits, and the error contract — and fails closed rather than emit an invalid or misleading governance contract.

Provides:
- generateOpenApi
- exportOpenApi
- exportOpenApiYaml
- Reference
- SchemaOrRef
- SchemaObject
- ContractSchemaExport
- MediaTypeObject
- RequestBodyObject
- ResponseObject
- ParameterLocation
- ParameterObject

## galerina-core-cli

Galerina developer command-line interface for checking, building, serving, reporting and running safe tasks.

Provides:
- FUNGI_CLI_ENV_001
- FUNGI_CLI_ENV_002
- FUNGI_CLI_ENV_003
- FUNGI_CLI_001
- FUNGI_CLI_002
- FUNGI_CLI_003
- EnvironmentResolution
- parseEnvironment
- commands
- findCommand
- createCoreCommandRunner
- relativeCoreCompilerPath

## galerina-core-tasks

Safe typed task runner for Galerina project automation.

Provides:
- checkTaskPermissions
- TaskDependencyPlan
- resolveTaskDependencies
- DryRunPlan
- createDryRunPlan
- dryRunTask
- DEFAULT_TASK_TIMEOUT_MS
- MAX_TASK_TIMEOUT_MS
- TaskOperationInvocation
- TaskOperationHandler
- TaskOperationHandlers
- ExecuteTaskOperationsOptions

## galerina-tools-benchmark

Galerina benchmark and diagnostics contracts for logic, compute targets, fallback behaviour and safe reporting.

Provides:
- BenchmarkRequest
- BenchmarkMode
- BenchmarkTrigger
- BenchmarkTarget
- BenchmarkStatus
- BenchmarkPrivacyPolicy
- BenchmarkConfig
- BenchmarkSystemInfo
- BenchmarkTestResult
- BenchmarkScores
- BenchmarkReport
- BenchmarkSubmitPayload

## galerina-tools-myco

grep, but it grows a graph — a graph-indexed search tool for file contents and filenames. Smart-case, token-precise, and instant on repeat searches.

Provides:
- MAX_INDEX_PATH_LENGTH
- MAX_INDEX_TERM_LENGTH
- MAX_INDEX_TERMS_PER_FILE
- IndexLimits
- DEFAULT_INDEX_LIMITS
- StoredContentSkip
- StoredFile
- StoredIndex
- isCanonicalIndexPath
- validateStoredIndex
- FileId
- ContentSkip

## galerina-devtools-benchmarks

Runtime comparison benchmarks: Python · Node.js · C++ · Rust · Galerina (governed + manifest)

## galerina-test

The consolidated Galerina test harness for unit, e2e, R6 conformance, fidelity-differential, and exact SLIDE corpus checks.

Provides:
- parseCounts
- parseAggregateTotal
- WORKSPACE_MARKER
- resolveRoot
- resolveTarget
- DEFAULT_E2E_EXAMPLES
- SpawnOutcome
- DEFAULT_TIMEOUT_MS
- DEFAULT_OUTPUT_LIMIT_BYTES
- runNode
- CheckKind
- CheckScope

## galerina-devtools-graph-project

Galerina project knowledge graph contracts for package, document, policy and report relationships.

Provides:
- ProjectGraphNodeKind
- ProjectGraphEdgeKind
- ProjectGraphConfidence
- ProjectGraphDiagnosticSeverity
- ProjectGraphBackendId
- ProjectGraphBackendSourceKind
- ProjectGraphBackendCapability
- ProjectGraphDiagnostic
- ProjectGraphNode
- ProjectGraphEdge
- ProjectGraph
- ProjectGraphWorkspacePackage

## galerina-framework-example-app

The canonical runnable 'hello, governed world' Galerina app: a governed flow compiled to a signed .wasm, fused into the App Kernel at a route, and served over HTTP. This is the golden template `galerina new app` emits.

Provides:
- AppEnv
- AppPosture
- AppConfig
- parseConfig
- loadConfig
- paths
- FuseOptions
- createGreetingKernel
- StartedServer

## galerina-api-protocol-rest

Reference REST protocol-adapter (L3): /src governed flow → fusable .wasm, fused via the App Kernel. Proves the /src → .wasm → fused path end-to-end.

## galerina-substrate-math

Pure substrate-noise math shared by the governance layer: per-lane error probability + von Neumann NMR (N-modular-redundancy) closed form. Zero runtime deps. Single source of truth for the NMR calculus used by both galerina-tower-citizen (substrate-model) and galerina-core-compiler (substrate-inference).

Provides:
- SubstrateMathErrorCode
- SubstrateMathError
- SubstrateNoiseParams
- MAX_NMR_N
- flipProbability
- singleLaneErrorProbability
- nmrFailureProbability
- isProxy

## galerina-inference-bridge-contract

Neutral Brain/Brawn contract — InferenceBridge, BridgeOp/Result, packed-ternary + fixed-point layout metadata, bridge manifest schema, determinism oracle interface. Zero runtime deps.

Provides:
- FixedScale
- BridgeOp
- BridgeResult
- InferenceBridge
- BridgeRegistry
- assertDeterminism
- DeterminismMode
- CertificationProfile
- BridgeDomain
- ToleranceWitness
- BridgeManifest
- BridgeAttestation

## galerina-core-economics

CostGraph, ValueGraph, and risk-adjusted execution routing for the Galerina platform. Economics is a constraint layer that sits below governance — it can pull the emergency brake on a safe path, but never press the gas pedal on an unsafe one.

Provides:
- ExecutionTarget
- CostBreakdown
- CostEstimate
- CLOUD_PRICING
- AI_PRICING
- AiModel
- CostInputs
- estimateCost
- PER_RECORD_LOSS_USD
- RISK_MODIFIERS
- RiskInputs
- calculateRiskCost

## galerina-core-sentinel-egress

Galerina Sentinel Egress — governed audit egress: fixed ring buffer + batched HMAC-chained tamper-evident flush. Citizen Protocol v1.6.

Provides:
- AuditBatch
- AuditEgressOptions
- AuditEgress
- readEgressLedger
- HardenedBorderViolation
- SecurityTrap
- RingBuffer

## galerina-core-sentinel-io

Galerina Sentinel I/O (LSIO) — deterministic, governed, manifest-driven zero-copy data ingestion with HMAC-SHA256 integrity. Citizen Protocol v1.1.

Provides:
- HardenedBorderViolation
- SecurityTrap
- IntegrityResult
- IntegrityMonitor
- IoBlock
- IoManifest
- ManifestLoader
- buildManifest
- IngestSourceKind
- LocalDiskBus
- PhotonicBus
- MappedBlock

## galerina-core-sentinel-memory

Galerina Sentinel Memory (LSM) — deterministic fixed-block pool, 128-bit alignment, Compute/Governance segmentation, ternary TPL state buffer. Citizen Protocol v1.2.

Provides:
- SecurityTrap
- HardenedBorderViolation
- ALIGN_BYTES
- MemoryValidator
- MemoryChannel
- LocalSramBus
- SegmentationController
- Segment
- Block
- PoolConfig
- StaticMemoryPool
- TPLStateBuffer

## galerina-core-sentinel-power

Galerina Sentinel Power (LSP) — thermal/power envelope governor with deterministic kernel down-tiering. Citizen Protocol v1.4.

Provides:
- PowerFault
- PowerDecision
- PowerGovernor
- PowerState
- KernelTier
- ThermalEnvelope
- validateEnvelope
- AEROSPACE_ENVELOPE

## galerina-core-sentinel-state

Galerina Sentinel State (LSS) — atomic, HMAC-verified state snapshots + cold-boot recovery. Citizen Protocol v1.5.

Provides:
- refuseSnapshotSpecialFile
- AtomicWriter
- RESTORE_VERDICT_PACKAGE_IDENTITY
- RESTORE_VERDICT_EXPORT_NAME
- ROLLBACK_FLOOR_NAME
- RestoreVerdictAuthority
- ColdBootOrchestrator
- SecurityTrap
- HardenedBorderViolation
- Snapshot
- SnapshotKeyHandle
- SnapshotKeyProvider

## galerina-core-sentinel-time

Galerina Sentinel Time (LST) — deterministic Logical Clock + drift monitor. Cycle-indexed audit timing. Citizen Protocol v1.3.

Provides:
- PrecisionFault
- LogicalClock
- StabilityEnvelope
- SynchronizationGate

## galerina-tower-citizen

Galerina Tower Citizen — TowerRuntime + AuditLogger + PluginSandbox for governed AI inference

Provides:
- AiActionProposal
- AiActionDecision
- AiGovernanceResult
- governAiProposal
- TowerAuditEvent
- EgressSink
- AuditFilter
- AuditLoggerOptions
- AuditLogger
- StubTernaryBridge
- StubFp4Bridge
- createStubRegistry

## galerina-tri-pipe

Tri-Pipe proposal, routing and composition layer (RD-0855). createTriPipeEngine() proposes a digest-bound route; it does not construct an engine or authorise dispatch. ExecutionRouter composes hardware-tier, precision and photonic net-win axes. Fail-closed to binary.

Provides:
- CapabilityInput
- ExecutionRouteInput
- ExecutionDecision
- ExecutionRouter
- createExecutionRouter
- ADMITTED_REPRESENTATION_PROFILES
- RepresentationProfile
- EXPERIMENTAL_REPRESENTATION_PROFILES
- COMPUTE_TRANSFER_SCHEMA
- ComputeTransferV1
- TriPipeOptions
- TriPipeProposal

## galerina-tri-regex

Ternary streaming pattern matching — ReDoS-immune by construction. Non-backtracking automaton, compile-time cost certificate, fail-closed SECURITY_VETO on uncertifiable patterns, three-valued streaming verdicts (+1 match / 0 indeterminate / -1 refuse) with fail-closed collapse at end-of-stream.

Provides:
- Closure
- Compiled
- compileAst
- inRangesWithCost
- inRanges
- TriStream
- NO_CHAR_RANGES
- AutomatonTables
- TriMatcher
- VERSION
- CompileOptions
- CompileOk

## galerina-ext-spore

Galerina .spore format engine (Phase 2 #6) — TMX-256 integrity (TriMerkle-XOF/SHAKE256), container, KEM-DEM confidentiality, ML-DSA-65 signing. Crypto-on-core: bit-exact, deterministic.

Provides:
- MAGIC
- HEADER_SIZE
- HEADER_CORE_SIZE
- ENTRY_SIZE
- TMX_PROFILE_SHAKE
- SporeErrorCode
- SporeError
- SporeSection
- SporeReadResult
- headerCore
- writeSpore
- readSpore

## galerina-ext-bridge-bitnet

Galerina governed bridge for Microsoft BitNet.cpp — ternary CPU inference with Tower audit lifecycle

Provides:
- BitNetModelSpec
- BitNetRequest
- BitNetResponse
- BitNetBridge
- createBitNetBridge

## galerina-ext-bridge-cpp

Native CPU/GPU execution bridges (BitNet ternary) implementing the Tower InferenceBridge contract — simulator fallback, native addon seam

Provides:
- BitNetNativeAddon
- AddonLoadResult
- MAX_ADDON_BYTES
- AddonSnapshot
- snapshotAddonFile
- stageAddonBytes
- loadNativeAddon
- BitNetCpuBridge
- BitNetGpuBridge
- CpuCapability
- GpuCapability
- detectCpu

## galerina-ext-photonic-emulator

Galerina photonic-PPU backend: a physics-faithful (Rung-2) MZI-mesh / micro-ring ternary-MAC emulator + the partition cost-model router behind the neutral Brain/Brawn bridge contract. Digital stays the default; photonic only on a proven net win; fail-closed to digital. EMULATED, not silicon (no measured speedup).

Provides:
- EccDecode
- eccEncodeNibble
- eccDecodeNibble
- eccEncode
- EccBlockResult
- eccDecode
- PhysParams
- ACT_MAX
- ENOB_CEILING
- PHOTONIC
- NOISY
- Xorshift32

## galerina-ext-proof-snarkjs

snarkjs Groth16 prover backend for Galerina epilogue { generate_proof zk_snark_receipt }. Phase 1: pure-JS Groth16 circuit over sha256(sourceText + contractHash). Non-core extension — the compiler core never imports this directly.

Provides:
- CIRCUIT_ID
- computePhase1Proof
- verifyPhase1Proof
- Sha256SealBackend
- GalerinaSnarkjsProver
- createSnarkjsProver
- ProverInput
- ZkProof
- ProverBackend

## galerina-ext-secrets-vault

HashiCorp Vault provider for Galerina contract.secrets {} blocks. Implements dual-token ephemeral rotation with zero-downtime handshake. Non-core: vault mechanics live outside the deterministic compiler core.

Provides:
- GalerinaSecretsVault
- SecretsRotationManager
- SECRETS_GATEWAY_WIT
- SecretCredential
- RotationPolicy
- SecretsContractBlock
- SecretHandle
- SecretHandleStatus
- VaultClientOptions
- VaultClient

## galerina-ext-secrets-spore

OPTIONAL sealed-secrets-on-.spore layer for Galerina. env.spore = an encrypted-at-rest replacement for plaintext .env, edited through a governed in-memory-only CLI (no temp file, no $EDITOR, no .swp). Thin orchestration over @galerina/ext-spore (format/crypto) + the ext-secrets-vault store discipline. No new crypto, no new container bytes; crypto stays Binary (FUNGI-SUBSTRATE-001). Unsigned-but-encrypted (flags.signed=0); signed root gated on ext-spore slice 4/#7.

Provides:
- SecretConfigSource
- ARGON2ID_PARAMS
- deriveWrapKey
- WrappedKey
- wrapRecipientSecret
- unwrapRecipientSecret
- SealArena
- withWiped
- readStdinBytes
- EchoingLineReader
- atomicWriteCiphertext
- setMlockHook

## galerina-ext-tritsocket

TritSocket: a deny-only ternary (Kleene-3) admission pre-filter. Emits Deny | Maybe — never Allow. A cheap, cache-dense necessary-condition check that runs IN FRONT OF a real keyed PQ gate (ML-DSA/Ed25519/HMAC), cutting load without ever weakening the real gate. The public mask makes the score forgeable, which is exactly why Maybe is never an Allow.

Provides:
- RealKeyedGate
- admitSync
- Verdict
- Trit
- packedLen
- pack
- unpack
- prefilter
- dot
- prefilterBatch
- ABI_VERSION

## galerina-registry

Hybrid-signed, governance-reviewed package registry entries for Galerina. The live tree contains only independently admitted manifests and refuses builds without complete public authority evidence.

## galerina-governance-telemetry

Blind-observability exporter: streams a Galerina app's governance + operational STATE (masks, verdicts, effect-families, counts, declared budgets) to Prometheus/OpenMetrics — never the data it processes. Log the contract, not the payload.

Provides:
- GOVERNANCE_FLAGS
- AUDIT_STATUSES
- EXECUTION_TIERS
- GovernanceSnapshot
- isSafeLabel
- effectFamily
- GovernanceStateInput
- buildGovernanceSnapshot
- renderPrometheus
- ExporterOptions
- ExporterHandle

## galerina-observability

Actuator-style operational observability for a Galerina app: a health/liveness/readiness surface, app metrics (request counts, latencies, error rates), and structured app logs. The app-operator's ops view — distinct from @galerina/governance-telemetry (which exports governance STRUCTURE). Surfaces through the App Kernel as health routes + a metrics collector. Fail-closed, zero ambient authority.

Provides:
- HealthStatus
- HealthKind
- ComponentHealth
- HealthCheck
- HealthReport
- DEFAULT_CHECK_TIMEOUT_MS
- HealthRegistryOptions
- HealthRegistry
- metricsAuditSink
- InstrumentOptions
- instrumentDispatch
- MetricsAuth

## galerina-hardware-tier

Galerina Tri-Pipe topology: the cached, attested hardware() capability directive {binary|hybrid|photonic} + the per-tier package loader (photonic > hybrid > binary, fail-closed to binary). Capability preference picks the package; the 0053 per-kernel router still gates actual offload — worst case == binary == today.

Provides:
- Tier
- ResolveHardwareInput
- resolveHardware
- resolveHardwareFromIdentity
- HardwareDirective
- capabilityPreimage
- TierRegistries
- TierSelection
- selectTier
- createTierLoader
- GovernanceClass
- TierProfile

## galerina-devtools-context

Context Receipt generator for Galerina: produces minimal AI-consumable structural summaries from .fungi source. 98% token reduction vs raw source while preserving full architectural intent.

Provides:
- DEVTOOLS_CONTEXT_VERSION
- md
- renderReceiptMarkdown
- renderFileReceiptsMarkdown
- generateReceipts
- generateFlowReceiptByName
- FlowContextReceipt
- FileContextReceipts
- ReceiptOptions

## galerina-devtools-flowgraph

Flow graph analysis for Galerina — finds cycles, dead flows, authority escalation, PII leakage paths, and missing audit coverage.

Provides:
- GraphSeverity
- GraphDiagnostic
- detectCycles
- detectDeadFlows
- detectAuthorityEscalation
- detectPiiLeakagePaths
- detectMissingAuditCoverage
- detectUnboundedRetry
- checkFlowGraph
- FlowNode
- FlowEdge
- FlowGraph

## galerina-devtools-graph-algorithms

Internal graph data structures and algorithms for the Galerina compiler. Designed for future extraction to fungi-graph.

Provides:
- bfsPath
- bfsReachable
- DfsVisitor
- dfsVisit
- detectCycle
- canReach
- allReachable
- topoSort
- GraphBuilder
- ImmutableGraph
- NodeId
- GraphNode

## galerina-devtools-hypha

Passive capability-map scanner for Galerina: extracts the compiler's dispatch surfaces, sentinel sets and checker wiring in memory and answers drift/coverage questions. No database, no build step, no dependencies — run it and it answers.

## galerina-devtools-impact

Fail-closed affected-scope planner for frequent non-authorizing Galerina verification.

## galerina-devtools-intelligence

Hybrid BM25 + structural code search for Galerina workspaces. Indexes flows by semantic tokens, effects, economics, and governance metadata. Zero external dependencies — runs fully local.

Provides:
- tokenize
- tokenizeWithCompounds
- buildInvertedIndex
- bm25Search
- ExtractionInput
- extractFlows
- computeIndexIntegrity
- verifyIndexIntegrity
- IndexBuildResult
- search
- searchWithIndex
- IndexedFlow

## galerina-devtools-fungi-scan

Syntax-migration corpus scanner: walks every .fungi/.gate file and reports old-form usage, @version headers, match exhaustiveness and planned-keyword collisions — via the REAL compiler lexer, never regex.

Provides:
- discoverInlineHosts
- InlineFixture
- looksLikeFungi
- extractFungiFixtures
- scanInlineFixtures
- WordRollup
- Rollup
- buildRollup
- renderMarkdown
- renderConsole
- PLANNED_CONSTRUCT_WORDS
- PLANNED_ALIAS_WORDS

## galerina-devtools-kb-graph

Auto-index graph for Galerina Knowledge Base documents

Provides:
- KBGraph
- buildKBGraph
- generateDOT
- generateJSON
- generateMarkdownReport
- KBDocNode
- KBEdge
- ScanResult
- scanKBDirectory

## galerina-devtools-naming

Naming standard enforcer for Galerina: detects abbreviations, implicit types, missing intent. Promotes Zero-Ambiguity / Maximum-Semantics coding.

Provides:
- DEVTOOLS_NAMING_VERSION
- NamingDiagnosticCode
- NamingDiagnostic
- NamingCheckResult
- NamingCheckOptions
- checkNaming
- NamingRunnerOptions
- NamingAuditReport
- runNamingAudit

## galerina-devtools-package-graph

Per-package boundary-governance graph — internal edges, external-dependency surface, orphan detection, Hardened Border CI gate

Provides:
- InternalEdge
- ExternalDep
- PackageGraph
- buildGraph
- PACKAGE_MANIFEST_SCHEMA
- PACKAGE_BUILD_MANIFEST_SCHEMA
- PACKAGE_STANDARD_GENERATOR
- PACKAGE_STANDARD_FILES
- FUNGI_PKGSTD_001
- FUNGI_PKGSTD_002
- FUNGI_PKGSTD_003
- FUNGI_PKGSTD_004

## galerina-devtools-pci

PCI DSS 4.0.1 compliance audit for Galerina programs. Static analysis maps PCI requirements to Galerina contract patterns: cardholder data protection (Req 3), transit encryption (Req 4), access control (Req 7), audit logging (Req 10), secure development (Req 6). CI-runnable, no infrastructure needed.

Provides:
- EgressBatch
- readEgressBatches
- ComplianceDecision
- ComplianceEntry
- ComplianceReport
- buildComplianceReport
- buildComplianceReportFromDir
- appendComplianceLedger
- readComplianceLedger
- verifyComplianceChain
- DEVTOOLS_PCI_VERSION
- runPciAudit

## galerina-devtools-project-graph

Graph data structures, algorithms, and runtime reporting for the Galerina platform

Provides:
- bfsPath
- bfsReachable
- dfsVisit
- detectCycle
- FixpointResult
- fixpoint
- updateNode
- canReach
- allReachable
- canReachAll
- reachableSubset
- TopoResult

## galerina-devtools-provenance

Data lineage and provenance tracker for Galerina: maps data sources, transformations, and sinks across a workspace. Visualizes trust boundaries and PII flow paths for compliance and security review.

Provides:
- FileProvenanceResult
- analyzeFile
- FungiCollection
- collectFungiCorpus
- collectFungiFiles
- buildProvenanceGraph
- DEVTOOLS_PROVENANCE_VERSION
- renderTextReport
- renderJsonReport
- ProvReportOptions
- renderProvReport
- DataSourceKind

## galerina-devtools-security

Security analysis, audit, and testing tools for Galerina programs. Runs all security checks (taint, profiles, governance, hardware, path sandbox, ReDoS guard) and produces structured audit reports. Designed for CI integration — lightweight, no runtime dependency.

Provides:
- SecuritySeverity
- SecurityVerdict
- EXPECTED_CHECKERS
- ExpectedChecker
- SecurityFinding
- SecurityAuditReport
- SecurityAuditOptions
- DEVTOOLS_SECURITY_VERSION
- PathCheckResult
- checkPathSandbox
- isPathEscape
- PATH_SANDBOX_TEST_VECTORS

## galerina-devtools-wasmtime-oracle

Development-only independent Wasmtime differential oracle for Galerina's optional Wasm target.
