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
- Buffer
- inspectBuffer
- ContactFormData

## galerina-core-runtime-wasm

Border-safe WASM trust-computing base (RD-0361 R4 / #143): the record-layout ABI and (next brick) the attested WASM instantiation TCB that the kernel/DSS reach WITHOUT importing the compiler.

Provides:
- WAT_HEAP_BASE
- WAT_REC_FIELD_SIZE
- AdmissionPolicy
- RunnerProfile
- WasmAttestation
- AdmissionVerdict
- wasmHash
- generateRunnerKeypair
- signWasm
- verifyWasm
- Observer
- HostRuntime

## galerina-core-compiler

Galerina compiler pipeline contracts for parsing, checking, IR, diagnostics and reports.

Provides:
- GalerinaAttestation
- AttestationInputs
- AttestationKeyPair
- signAttestation
- verifyAttestation
- generateAttestationKey
- HybridAttestationKeyPair
- attestationToYaml
- attestationFromJson
- AttributeDiagnostic
- AttributeCheckResult
- FUNGI_ATTR_001

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
- DAGEdgeResult
- DSSState
- DWIHandle
- EmergencyTransitionResult
- EpilogueReceipt
- MMCPEntry
- AuditEvent
- TrapSignal
- PluginEvictionSignal
- SecuritySeverity
- SecretClassification
- PermissionEffect

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
- ReportSeverity
- ReportStatus
- ReportKind
- ReportGenerator
- ReportMetadata
- ReportSourceLocation
- ReportDiagnostic
- DiagnosticSummary
- LoReportBase
- BuildReport
- SecurityReport
- TargetReport

## galerina-core-logic

Galerina multi-state logic concepts including Tri, Decision, BoolBoundary and Omni logic.

Provides:
- ComputeMixBenchmarkReport
- ComputeMixBenchmarkError
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
- ComputeTarget
- ComputeWorkloadKind
- ComputeDiagnosticSeverity
- ComputeDiagnostic
- ComputeCapability
- ComputeBudget
- ComputePlan
- ComputeAutoPolicy
- ComputeTargetSelection
- ComputeTargetPreference
- ComputeDataLocation
- ComputeDataMovement

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
- AgentToolDecision
- AgentFailureBehaviour
- AgentToolPermission
- AgentLimits
- AgentDefinition
- AgentTaskGroupPlan
- AgentFinding
- AgentResult
- AgentMergePolicy
- AgentReport
- AgentDiagnosticSeverity
- AgentDiagnostic

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
- PhotonicDiagnosticSeverity
- PhotonicDiagnostic
- PhotonicPlan
- PhotonicReport
- defineOpticalSignal

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
- NativeAbi
- NativeTarget
- NativeArtifact
- NativeTargetReport
- NativeDiagnosticSeverity
- NativeDiagnostic
- validateNativeTarget
- validateNativeArtifact
- createNativeTargetReport

## galerina-target-js

Galerina JavaScript output target planning contracts.

Provides:
- JsRuntime
- JsModuleFormat
- SourceMapMode
- SourceMapRule
- JsOutputPlan
- EsModuleMetadata
- FrameworkAdapterMetadata
- JsBundleCheckOutcome
- JsBundleReport
- JsTargetDiagnosticSeverity
- JsTargetDiagnostic
- isServerOnlyImport

## galerina-target-wasm

Galerina WebAssembly target planning and output contracts.

Provides:
- WasmTarget
- WasmArtefact
- WasmTargetReport
- WasmDiagnosticSeverity
- WasmDiagnostic
- validateWasmArtefact
- createWasmTargetReport

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
- canonicalJson
- FuseDescriptor
- FusedComponent
- FusePackageOptions
- HybridManifestVerdict
- HybridManifestVerifier
- CapabilityImportFactory
- BUILTIN_CAPABILITY_NAMES
- buildCapabilityImports
- CompositionMember
- CapabilitySource
- CompositionPlan

## galerina-framework-api-server

Galerina HTTP API-server adapter: a thin node:http transport that buffers the request body under a hard DoS cap and hands every request to the non-bypassable App Kernel. It never pre-empts a kernel gate except the additive body cap.

Provides:
- DEFAULT_MAX_BODY_BYTES
- DEFAULT_REQUEST_TIMEOUT_MS
- DEFAULT_HEADERS_TIMEOUT_MS
- DEFAULT_IDLE_TIMEOUT_MS
- RevocationResolution
- ApiServerTlsOptions
- CreateApiServerOptions
- createApiServer
- listen

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
- Reference
- SchemaOrRef
- SchemaObject
- MediaTypeObject
- RequestBodyObject
- ResponseObject
- ParameterLocation
- ParameterObject
- SecurityRequirementObject
- HttpOperationKey

## galerina-core-cli

Galerina developer command-line interface for checking, building, serving, reporting and running safe tasks.

Provides:
- parseEnvironment
- commands
- findCommand
- createCoreCommandRunner
- relativeCoreCompilerPath
- spawn
- Dirent
- Stats
- mkdir
- readdir
- readFile
- stat

## galerina-core-tasks

Safe typed task runner for Galerina project automation.

Provides:
- checkTaskPermissions
- TaskDependencyPlan
- resolveTaskDependencies
- DryRunPlan
- createDryRunPlan
- dryRunTask
- LoadedTasks
- parseTasksSource
- readFile
- RunTaskOptions
- TaskReport
- TaskRunReport

## galerina-tools-benchmark

Galerina benchmark and diagnostics contracts for logic, compute targets, fallback behaviour and safe reporting.

Provides:
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
- DEFAULT_BENCHMARK_CONFIG

## galerina-tools-myco

grep, but it grows a graph — a graph-indexed search tool for file contents and filenames. Galerina's owned dev-tool finder (vendored from the myco subproject). Smart-case, token-precise, instant on repeat searches.

Provides:
- FileId
- FileRecord
- TermCounts
- SearchGraph
- nameTermsOf
- INDEX_DIR
- INDEX_FILE
- IndexMeta
- VERSION
- IndexOptions
- IndexStats
- DEFAULT_INDEX_OPTIONS

## galerina-test

The consolidated Galerina test harness — one named, consumable package that runs unit, e2e, conformance (R6) and fidelity-differential (walker ≡ bytecode ≡ WASM) checks against a Galerina workspace.

Provides:
- parseCounts
- parseAggregateTotal
- WORKSPACE_MARKER
- resolveRoot
- resolveTarget
- DEFAULT_E2E_EXAMPLES
- SpawnOutcome
- DEFAULT_TIMEOUT_MS
- runNode
- CheckKind
- CheckScope
- TestCounts

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
- SubstrateMathError
- SubstrateNoiseParams
- flipProbability
- singleLaneErrorProbability
- nmrFailureProbability

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
- AtomicWriter
- ColdBootOrchestrator
- SecurityTrap
- HardenedBorderViolation
- Snapshot
- StateSerializer

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

The Tri-Pipe capstone: createTriPipeEngine() composes the hardware() capability directive + the photonic backend/router + the governed HybridInferenceEngine into one call, selecting the digital registry and photonic offload by the resolved {binary|hybrid|photonic} tier. Digital is the default; photonic only on a proven net win; fail-closed to binary.

Provides:
- CapabilityInput
- ExecutionRouteInput
- ExecutionDecision
- ExecutionRouter
- createExecutionRouter
- TriPipeOptions
- TriPipeEngine
- createTriPipeEngine

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
- loadNativeAddon
- BitNetCpuBridge
- BitNetGpuBridge
- CpuCapability
- GpuCapability
- detectCpu
- detectGpu
- selectTernaryBridge
- createCppBridgeRegistry

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
- atomicWriteCiphertext
- setMlockHook
- tryMlock

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
- BoundaryPolicy
- CheckResult
- writeJson
- runBoundaryGate
- writeBoundaryMarkdown
- EdgeKind
- FileImport
- ScannedFile

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
- collectFungiFiles
- buildProvenanceGraph
- DEVTOOLS_PROVENANCE_VERSION
- renderTextReport
- renderJsonReport
- ProvReportOptions
- renderProvReport
- DataSourceKind
- DataSinkKind
- TransformKind

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
