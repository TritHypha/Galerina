export type ReportSeverity = "info" | "warning" | "error" | "critical";

export type ReportStatus = "ok" | "warning" | "error" | "critical";

export type ReportKind =
  | "build"
  | "security"
  | "target"
  | "runtime"
  | "async"
  | "storage"
  | "build-cache"
  | "task"
  | "processing"
  | "ai-guide"
  | "config"
  | "compiler"
  | "intent"
  | "safety"
  | "flow-trace"
  | "custom";

export interface ReportGenerator {
  readonly name: string;
  readonly version: string;
  readonly packageName?: string;
}

export interface ReportMetadata {
  readonly schemaVersion: string;
  readonly kind: ReportKind;
  readonly name: string;
  readonly projectName: string;
  readonly projectVersion?: string;
  readonly generatedAt: string;
  readonly generator: ReportGenerator;
  readonly sourceRoot?: string;
  readonly buildId?: string;
}

export interface ReportSourceLocation {
  readonly path: string;
  readonly line?: number;
  readonly column?: number;
}

export interface ReportDiagnostic {
  readonly code: string;
  readonly severity: ReportSeverity;
  readonly message: string;
  readonly path?: string;
  readonly source?: ReportSourceLocation;
  readonly packageName?: string;
  readonly suggestedFix?: string;
  readonly redacted?: boolean;
}

export interface DiagnosticSummary {
  readonly info: number;
  readonly warnings: number;
  readonly errors: number;
  readonly critical: number;
  readonly total: number;
  readonly status: ReportStatus;
}

export interface LoReportBase {
  readonly metadata: ReportMetadata;
  readonly summary: DiagnosticSummary;
  readonly diagnostics: readonly ReportDiagnostic[];
  readonly warnings: readonly string[];
}

export interface BuildReport extends LoReportBase {
  readonly kind: "build";
  readonly targets: readonly string[];
  readonly artifacts: readonly ReportArtifact[];
  readonly durationMs?: number;
}

export interface SecurityReport extends LoReportBase {
  readonly kind: "security";
  readonly checkedPolicies: readonly string[];
  readonly blockedOperations: readonly string[];
  readonly redactedSecrets: number;
}

export interface TargetReport extends LoReportBase {
  readonly kind: "target";
  readonly requestedTargets: readonly string[];
  readonly selectedTargets: readonly string[];
  readonly fallbackUsed: boolean;
}

export interface RuntimeReport extends LoReportBase {
  readonly kind: "runtime";
  readonly mode: "checked" | "compiled" | "plan-only";
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly effects: readonly string[];
}

export type AwaitKind =
  | "one"
  | "all"
  | "race"
  | "stream"
  | "queue"
  | "retry";

export type AwaitCancellationPolicy =
  | "cancelOnError"
  | "waitForAll"
  | "firstSuccess"
  | "firstResult"
  | "timeoutCancel"
  | "manualCancel";

export interface AwaitSiteReport {
  readonly name?: string;
  readonly kind: AwaitKind;
  readonly effects: readonly string[];
  readonly timeoutMs?: number;
  readonly source?: ReportSourceLocation;
}

export interface AwaitGroupReport {
  readonly name?: string;
  readonly kind: Extract<AwaitKind, "all" | "race" | "stream" | "queue" | "retry">;
  readonly awaitCount: number;
  readonly timeoutMs?: number;
  readonly cancellationPolicy?: AwaitCancellationPolicy;
  readonly maxConcurrency?: number;
  readonly maxInFlight?: number;
  readonly backpressureRequired?: boolean;
  readonly source?: ReportSourceLocation;
}

export interface AsyncReport extends LoReportBase {
  readonly kind: "async";
  readonly awaitPoints: number;
  readonly awaitGroups: number;
  readonly raceBlocks: number;
  readonly streamBlocks: number;
  readonly queueAwaits: number;
  readonly networkAwaitWithoutTimeout: number;
  readonly databaseAwaitWithoutTimeout: number;
  readonly unscopedTasks: number;
  readonly backgroundTasks: number;
  readonly structuredConcurrency: boolean;
  readonly awaitSites: readonly AwaitSiteReport[];
  readonly groups: readonly AwaitGroupReport[];
}

export type StorageKind =
  | "unknown"
  | "hdd"
  | "sata-ssd"
  | "nvme"
  | "ram-disk"
  | "network"
  | "cloud"
  | "container";

export type CacheMode =
  | "disabled"
  | "minimal-bounded"
  | "bounded"
  | "bounded-parallel-indexed"
  | "temporary-only";

export interface StorageCapability {
  readonly detected: boolean;
  readonly kind: StorageKind;
  readonly formFactor?: string;
  readonly sequentialReadMbPerSecond?: number;
  readonly sequentialWriteMbPerSecond?: number;
  readonly randomReadIops?: number;
  readonly randomWriteIops?: number;
  readonly detailsReliable: boolean;
  readonly detectionNotes: readonly string[];
}

export interface StorageReport extends LoReportBase {
  readonly kind: "storage";
  readonly storage: StorageCapability;
  readonly recommendedCacheMode: CacheMode;
  readonly unknownFallbackUsed: boolean;
  readonly conservativeCache: boolean;
}

export interface BuildCacheReport extends LoReportBase {
  readonly kind: "build-cache";
  readonly cacheMode: CacheMode;
  readonly maxSizeBytes?: number;
  readonly hits: number;
  readonly misses: number;
  readonly bypasses: number;
  readonly evictions: number;
  readonly invalidations: number;
  readonly correctnessRequiredCache: false;
  readonly cachedDataClasses: readonly string[];
  readonly deniedDataClasses: readonly string[];
}

export interface TaskReport extends LoReportBase {
  readonly kind: "task";
  readonly taskName: string;
  readonly dryRun: boolean;
  readonly effects: readonly string[];
  readonly changedFiles: readonly string[];
}

export type RecoveryAction =
  | "stop"
  | "continue"
  | "retry"
  | "quarantine"
  | "checkpoint"
  | "rollback"
  | "resume"
  | "hold_for_review";

export interface ProcessingFailureSummary {
  readonly errorType: string;
  readonly count: number;
  readonly retryable: boolean;
  readonly action: RecoveryAction;
}

export interface ProcessingReport extends LoReportBase {
  readonly kind: "processing";
  readonly flow: string;
  readonly totalItems: number;
  readonly successfulItems: number;
  readonly failedItems: number;
  readonly retriedItems: number;
  readonly quarantinedItems: number;
  readonly stopped: boolean;
  readonly checkpoint?: string;
  readonly failureTypes: readonly ProcessingFailureSummary[];
}

export interface BatchResultReport<TItem = unknown> {
  readonly successful: readonly TItem[];
  readonly failed: readonly {
    readonly itemId?: string;
    readonly errorType: string;
    readonly message: string;
    readonly action: RecoveryAction;
  }[];
  readonly report: ProcessingReport;
}

export interface AiGuideReport extends LoReportBase {
  readonly kind: "ai-guide";
  readonly sections: readonly AiGuideSection[];
  readonly tokenEstimate?: number;
}

export interface CustomReport extends LoReportBase {
  readonly kind: "custom";
  readonly data: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// Intent report — per-flow intent/effect consistency results
// ---------------------------------------------------------------------------

/** Status of a single flow's intent/effect check. */
export type IntentFlowStatus = "ok" | "mismatch" | "missing_intent" | "unsafe_incomplete";

export interface IntentFlowEntry {
  readonly name: string;
  readonly safetyLevel: string;
  readonly intent?: string;
  readonly declaredEffects: readonly string[];
  readonly inferredEffects: readonly string[];
  readonly status: IntentFlowStatus;
  readonly mismatches: readonly string[];
}

export interface IntentReport extends LoReportBase {
  readonly kind: "intent";
  readonly flows: readonly IntentFlowEntry[];
  readonly governedSurfaces: number;
  readonly missingIntent: number;
  readonly effectMismatches: number;
}

// ---------------------------------------------------------------------------
// Safety report — safe/guarded/privileged/unsafe/experimental breakdown
// ---------------------------------------------------------------------------

export interface SafetyFlowEntry {
  readonly name: string;
  readonly safetyLevel: string;
  readonly auditRequired: boolean;
  readonly traceEnabled: boolean;
  readonly capabilities: readonly string[];
  readonly effects: readonly string[];
}

export interface SafetyReport extends LoReportBase {
  readonly kind: "safety";
  readonly flows: readonly SafetyFlowEntry[];
  readonly safeCount: number;
  readonly guardedCount: number;
  readonly privilegedCount: number;
  readonly unsafeCount: number;
  readonly experimentalCount: number;
  /** Number of experimental flows included in the build (must be 0 for production). */
  readonly experimentalInProduction: number;
}

// ---------------------------------------------------------------------------
// Flow trace report — governed evidence trail for auditing
// ---------------------------------------------------------------------------

export type FlowTraceStage =
  | "request.received"
  | "request.decoded"
  | "validation.completed"
  | "policy.checked"
  | "capability.checked"
  | "effect.executed"
  | "handler.started"
  | "handler.completed"
  | "response.encoded"
  | "request.denied";

export type FlowTraceStatus = "ok" | "warning" | "denied" | "error";

export type FlowTraceDecision = "allow" | "deny" | "unknown" | "conflict";

/**
 * A governed trace event. All secret and PII fields must be redacted before emission.
 * Structurally compatible with FlowTraceEvent in @galerina/core.
 */
export interface FlowTraceEventRecord {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string;
  readonly timestamp: string;
  readonly stage: FlowTraceStage;
  readonly status: FlowTraceStatus;
  readonly routeId?: string;
  readonly effect?: string;
  readonly capability?: string;
  readonly decision?: FlowTraceDecision;
  /** Non-secret metadata only. Redacted values must be "[REDACTED]". */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface FlowTraceReport extends LoReportBase {
  readonly kind: "flow-trace";
  readonly events: readonly FlowTraceEventRecord[];
  readonly redactedFields: number;
}

// ---------------------------------------------------------------------------
// Runtime flow manifest — intent/safety/effect metadata for a built flow
// ---------------------------------------------------------------------------

export interface RuntimeFlowManifest {
  /** Dot-path flow ID, e.g. "orders.create". */
  readonly id: string;
  readonly name: string;
  readonly safetyLevel: string;
  readonly intent?: string;
  readonly effects: readonly string[];
  readonly capabilities: readonly string[];
  readonly auditRequired: boolean;
  readonly traceEnabled: boolean;
}

export type LoReport =
  | BuildReport
  | SecurityReport
  | TargetReport
  | RuntimeReport
  | AsyncReport
  | StorageReport
  | BuildCacheReport
  | TaskReport
  | ProcessingReport
  | AiGuideReport
  | IntentReport
  | SafetyReport
  | FlowTraceReport
  | CustomReport;

export interface ReportArtifact {
  readonly path: string;
  readonly kind: string;
  readonly bytes?: number;
  readonly sha256?: string;
}

export interface AiGuideSection {
  readonly title: string;
  readonly summary: string;
  readonly sourcePaths: readonly string[];
}

export interface ReportWriteRequest {
  readonly report: LoReport;
  readonly path: string;
  readonly format: "json" | "markdown";
  readonly overwrite: boolean;
}

export interface ReportWriteResult {
  readonly path: string;
  readonly bytes: number;
  readonly diagnostics: readonly ReportDiagnostic[];
}

export interface ReportWriter {
  readonly name: string;
  readonly supportedFormats: readonly ReportWriteRequest["format"][];
  write(request: ReportWriteRequest): Promise<ReportWriteResult>;
}

export interface ReportMetadataOptions {
  readonly kind: ReportKind;
  readonly name: string;
  readonly projectName: string;
  readonly projectVersion?: string;
  readonly generatedAt?: string;
  readonly generator?: Partial<ReportGenerator>;
  readonly sourceRoot?: string;
  readonly buildId?: string;
}

export function createReportMetadata(
  options: ReportMetadataOptions,
): ReportMetadata {
  const generator = defineReportGenerator(options.generator);

  return {
    schemaVersion: "0.1.0",
    kind: options.kind,
    name: options.name,
    projectName: options.projectName,
    ...(options.projectVersion === undefined
      ? {}
      : { projectVersion: options.projectVersion }),
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    generator,
    ...(options.sourceRoot === undefined ? {} : { sourceRoot: options.sourceRoot }),
    ...(options.buildId === undefined ? {} : { buildId: options.buildId }),
  };
}

export function defineReportGenerator(
  generator: Partial<ReportGenerator> = {},
): ReportGenerator {
  return {
    name: generator.name ?? "galerina-core-reports",
    version: generator.version ?? "0.1.0",
    ...(generator.packageName === undefined
      ? {}
      : { packageName: generator.packageName }),
  };
}

export function createReportDiagnostic(
  code: string,
  severity: ReportSeverity,
  message: string,
  options: {
    readonly path?: string;
    readonly source?: ReportSourceLocation;
    readonly packageName?: string;
    readonly suggestedFix?: string;
    readonly redacted?: boolean;
  } = {},
): ReportDiagnostic {
  return {
    code,
    severity,
    message,
    ...(options.path === undefined ? {} : { path: options.path }),
    ...(options.source === undefined ? {} : { source: options.source }),
    ...(options.packageName === undefined
      ? {}
      : { packageName: options.packageName }),
    ...(options.suggestedFix === undefined
      ? {}
      : { suggestedFix: options.suggestedFix }),
    ...(options.redacted === undefined ? {} : { redacted: options.redacted }),
  };
}

export function summarizeDiagnostics(
  diagnostics: readonly ReportDiagnostic[],
): DiagnosticSummary {
  const info = countSeverity(diagnostics, "info");
  const warnings = countSeverity(diagnostics, "warning");
  const errors = countSeverity(diagnostics, "error");
  const critical = countSeverity(diagnostics, "critical");

  return {
    info,
    warnings,
    errors,
    critical,
    total: diagnostics.length,
    status: selectReportStatus({ warnings, errors, critical }),
  };
}

export function createBuildReport(input: {
  readonly metadata: ReportMetadata;
  readonly diagnostics?: readonly ReportDiagnostic[];
  readonly targets?: readonly string[];
  readonly artifacts?: readonly ReportArtifact[];
  readonly durationMs?: number;
}): BuildReport {
  return {
    kind: "build",
    metadata: normalizeMetadataKind(input.metadata, "build"),
    ...baseReportFields(input.diagnostics ?? []),
    targets: input.targets ?? [],
    artifacts: input.artifacts ?? [],
    ...(input.durationMs === undefined ? {} : { durationMs: input.durationMs }),
  };
}

export function createSecurityReport(input: {
  readonly metadata: ReportMetadata;
  readonly diagnostics?: readonly ReportDiagnostic[];
  readonly checkedPolicies?: readonly string[];
  readonly blockedOperations?: readonly string[];
  readonly redactedSecrets?: number;
}): SecurityReport {
  return {
    kind: "security",
    metadata: normalizeMetadataKind(input.metadata, "security"),
    ...baseReportFields(input.diagnostics ?? []),
    checkedPolicies: input.checkedPolicies ?? [],
    blockedOperations: input.blockedOperations ?? [],
    redactedSecrets: input.redactedSecrets ?? 0,
  };
}

export function createTargetReport(input: {
  readonly metadata: ReportMetadata;
  readonly diagnostics?: readonly ReportDiagnostic[];
  readonly requestedTargets?: readonly string[];
  readonly selectedTargets?: readonly string[];
  readonly fallbackUsed?: boolean;
}): TargetReport {
  return {
    kind: "target",
    metadata: normalizeMetadataKind(input.metadata, "target"),
    ...baseReportFields(input.diagnostics ?? []),
    requestedTargets: input.requestedTargets ?? [],
    selectedTargets: input.selectedTargets ?? [],
    fallbackUsed: input.fallbackUsed ?? false,
  };
}

export function createRuntimeReport(input: {
  readonly metadata: ReportMetadata;
  readonly diagnostics?: readonly ReportDiagnostic[];
  readonly mode: RuntimeReport["mode"];
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly effects?: readonly string[];
}): RuntimeReport {
  return {
    kind: "runtime",
    metadata: normalizeMetadataKind(input.metadata, "runtime"),
    ...baseReportFields(input.diagnostics ?? []),
    mode: input.mode,
    ...(input.startedAt === undefined ? {} : { startedAt: input.startedAt }),
    ...(input.completedAt === undefined
      ? {}
      : { completedAt: input.completedAt }),
    effects: input.effects ?? [],
  };
}

export function createAsyncReport(input: {
  readonly metadata: ReportMetadata;
  readonly diagnostics?: readonly ReportDiagnostic[];
  readonly awaitPoints?: number;
  readonly awaitGroups?: number;
  readonly raceBlocks?: number;
  readonly streamBlocks?: number;
  readonly queueAwaits?: number;
  readonly networkAwaitWithoutTimeout?: number;
  readonly databaseAwaitWithoutTimeout?: number;
  readonly unscopedTasks?: number;
  readonly backgroundTasks?: number;
  readonly structuredConcurrency?: boolean;
  readonly awaitSites?: readonly AwaitSiteReport[];
  readonly groups?: readonly AwaitGroupReport[];
}): AsyncReport {
  return {
    kind: "async",
    metadata: normalizeMetadataKind(input.metadata, "async"),
    ...baseReportFields(input.diagnostics ?? []),
    awaitPoints: input.awaitPoints ?? 0,
    awaitGroups: input.awaitGroups ?? 0,
    raceBlocks: input.raceBlocks ?? 0,
    streamBlocks: input.streamBlocks ?? 0,
    queueAwaits: input.queueAwaits ?? 0,
    networkAwaitWithoutTimeout: input.networkAwaitWithoutTimeout ?? 0,
    databaseAwaitWithoutTimeout: input.databaseAwaitWithoutTimeout ?? 0,
    unscopedTasks: input.unscopedTasks ?? 0,
    backgroundTasks: input.backgroundTasks ?? 0,
    structuredConcurrency: input.structuredConcurrency ?? true,
    awaitSites: input.awaitSites ?? [],
    groups: input.groups ?? [],
  };
}

export function createStorageReport(input: {
  readonly metadata: ReportMetadata;
  readonly diagnostics?: readonly ReportDiagnostic[];
  readonly storage: StorageCapability;
  readonly recommendedCacheMode?: CacheMode;
  readonly unknownFallbackUsed?: boolean;
  readonly conservativeCache?: boolean;
}): StorageReport {
  return {
    kind: "storage",
    metadata: normalizeMetadataKind(input.metadata, "storage"),
    ...baseReportFields(input.diagnostics ?? []),
    storage: input.storage,
    recommendedCacheMode:
      input.recommendedCacheMode ??
      (input.storage.kind === "unknown"
        ? "minimal-bounded"
        : "bounded"),
    unknownFallbackUsed:
      input.unknownFallbackUsed ?? (input.storage.kind === "unknown"),
    conservativeCache: input.conservativeCache ?? true,
  };
}

export function createBuildCacheReport(input: {
  readonly metadata: ReportMetadata;
  readonly diagnostics?: readonly ReportDiagnostic[];
  readonly cacheMode?: CacheMode;
  readonly maxSizeBytes?: number;
  readonly hits?: number;
  readonly misses?: number;
  readonly bypasses?: number;
  readonly evictions?: number;
  readonly invalidations?: number;
  readonly cachedDataClasses?: readonly string[];
  readonly deniedDataClasses?: readonly string[];
}): BuildCacheReport {
  return {
    kind: "build-cache",
    metadata: normalizeMetadataKind(input.metadata, "build-cache"),
    ...baseReportFields(input.diagnostics ?? []),
    cacheMode: input.cacheMode ?? "minimal-bounded",
    ...(input.maxSizeBytes === undefined
      ? {}
      : { maxSizeBytes: input.maxSizeBytes }),
    hits: input.hits ?? 0,
    misses: input.misses ?? 0,
    bypasses: input.bypasses ?? 0,
    evictions: input.evictions ?? 0,
    invalidations: input.invalidations ?? 0,
    correctnessRequiredCache: false,
    cachedDataClasses: input.cachedDataClasses ?? [],
    deniedDataClasses:
      input.deniedDataClasses ?? [
        "SecureString",
        "api_keys",
        "session_tokens",
        "payment_tokens",
        "private_keys",
        "raw_sensitive_payloads",
        "authorization_decisions",
        "non_deterministic_results",
      ],
  };
}

export function createTaskReport(input: {
  readonly metadata: ReportMetadata;
  readonly diagnostics?: readonly ReportDiagnostic[];
  readonly taskName: string;
  readonly dryRun?: boolean;
  readonly effects?: readonly string[];
  readonly changedFiles?: readonly string[];
}): TaskReport {
  return {
    kind: "task",
    metadata: normalizeMetadataKind(input.metadata, "task"),
    ...baseReportFields(input.diagnostics ?? []),
    taskName: input.taskName,
    dryRun: input.dryRun ?? false,
    effects: input.effects ?? [],
    changedFiles: input.changedFiles ?? [],
  };
}

export function createProcessingReport(input: {
  readonly metadata: ReportMetadata;
  readonly diagnostics?: readonly ReportDiagnostic[];
  readonly flow: string;
  readonly totalItems: number;
  readonly successfulItems: number;
  readonly failedItems: number;
  readonly retriedItems?: number;
  readonly quarantinedItems?: number;
  readonly stopped?: boolean;
  readonly checkpoint?: string;
  readonly failureTypes?: readonly ProcessingFailureSummary[];
}): ProcessingReport {
  return {
    kind: "processing",
    metadata: normalizeMetadataKind(input.metadata, "processing"),
    ...baseReportFields(input.diagnostics ?? []),
    flow: input.flow,
    totalItems: input.totalItems,
    successfulItems: input.successfulItems,
    failedItems: input.failedItems,
    retriedItems: input.retriedItems ?? 0,
    quarantinedItems: input.quarantinedItems ?? 0,
    stopped: input.stopped ?? false,
    ...(input.checkpoint === undefined ? {} : { checkpoint: input.checkpoint }),
    failureTypes: input.failureTypes ?? [],
  };
}

export function createAiGuideReport(input: {
  readonly metadata: ReportMetadata;
  readonly diagnostics?: readonly ReportDiagnostic[];
  readonly sections?: readonly AiGuideSection[];
  readonly tokenEstimate?: number;
}): AiGuideReport {
  return {
    kind: "ai-guide",
    metadata: normalizeMetadataKind(input.metadata, "ai-guide"),
    ...baseReportFields(input.diagnostics ?? []),
    sections: input.sections ?? [],
    ...(input.tokenEstimate === undefined
      ? {}
      : { tokenEstimate: input.tokenEstimate }),
  };
}

export function createIntentReport(input: {
  readonly metadata: ReportMetadata;
  readonly diagnostics?: readonly ReportDiagnostic[];
  readonly flows?: readonly IntentFlowEntry[];
}): IntentReport {
  const flows = input.flows ?? [];
  const governedSurfaces = flows.length;
  const missingIntent = flows.filter((f) => f.status === "missing_intent").length;
  const effectMismatches = flows.filter((f) => f.status === "mismatch").length;

  return {
    kind: "intent",
    metadata: normalizeMetadataKind(input.metadata, "intent"),
    ...baseReportFields(input.diagnostics ?? []),
    flows,
    governedSurfaces,
    missingIntent,
    effectMismatches,
  };
}

export function createSafetyReport(input: {
  readonly metadata: ReportMetadata;
  readonly diagnostics?: readonly ReportDiagnostic[];
  readonly flows?: readonly SafetyFlowEntry[];
  readonly experimentalInProduction?: number;
}): SafetyReport {
  const flows = input.flows ?? [];
  const count = (level: string): number =>
    flows.filter((f) => f.safetyLevel === level).length;

  return {
    kind: "safety",
    metadata: normalizeMetadataKind(input.metadata, "safety"),
    ...baseReportFields(input.diagnostics ?? []),
    flows,
    safeCount: count("safe"),
    guardedCount: count("guarded"),
    privilegedCount: count("privileged"),
    unsafeCount: count("unsafe"),
    experimentalCount: count("experimental"),
    experimentalInProduction: input.experimentalInProduction ?? 0,
  };
}

export function createFlowTraceReport(input: {
  readonly metadata: ReportMetadata;
  readonly diagnostics?: readonly ReportDiagnostic[];
  readonly events?: readonly FlowTraceEventRecord[];
  readonly redactedFields?: number;
}): FlowTraceReport {
  return {
    kind: "flow-trace",
    metadata: normalizeMetadataKind(input.metadata, "flow-trace"),
    ...baseReportFields(input.diagnostics ?? []),
    events: input.events ?? [],
    redactedFields: input.redactedFields ?? 0,
  };
}

export function createCustomReport(input: {
  readonly metadata: ReportMetadata;
  readonly diagnostics?: readonly ReportDiagnostic[];
  readonly data?: Readonly<Record<string, unknown>>;
}): CustomReport {
  return {
    kind: "custom",
    metadata: normalizeMetadataKind(input.metadata, "custom"),
    ...baseReportFields(input.diagnostics ?? []),
    data: input.data ?? {},
  };
}

export function validateLoReport(
  report: LoReport,
): readonly ReportDiagnostic[] {
  const diagnostics: ReportDiagnostic[] = [];

  if (report.metadata.name.trim().length === 0) {
    diagnostics.push(
      createReportDiagnostic(
        "Galerina_REPORT_NAME_REQUIRED",
        "error",
        "Report metadata requires a non-empty name.",
        { path: "metadata.name" },
      ),
    );
  }

  if (report.metadata.projectName.trim().length === 0) {
    diagnostics.push(
      createReportDiagnostic(
        "Galerina_REPORT_PROJECT_NAME_REQUIRED",
        "error",
        "Report metadata requires a non-empty project name.",
        { path: "metadata.projectName" },
      ),
    );
  }

  if (report.metadata.kind !== report.kind) {
    diagnostics.push(
      createReportDiagnostic(
        "Galerina_REPORT_KIND_MISMATCH",
        "error",
        "Report metadata kind must match the report kind.",
        { path: "metadata.kind" },
      ),
    );
  }

  for (const [index, diagnostic] of report.diagnostics.entries()) {
    if (diagnostic.code.trim().length === 0) {
      diagnostics.push(
        createReportDiagnostic(
          "Galerina_REPORT_DIAGNOSTIC_CODE_REQUIRED",
          "error",
          "Report diagnostic requires a non-empty code.",
          { path: `diagnostics.${index}.code` },
        ),
      );
    }
  }

  return diagnostics;
}

export function serializeReportJson(report: LoReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function baseReportFields(
  diagnostics: readonly ReportDiagnostic[],
): Pick<LoReportBase, "summary" | "diagnostics" | "warnings"> {
  return {
    summary: summarizeDiagnostics(diagnostics),
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}

function normalizeMetadataKind<K extends ReportKind>(
  metadata: ReportMetadata,
  kind: K,
): ReportMetadata & { readonly kind: K } {
  return {
    ...metadata,
    kind,
  };
}

function countSeverity(
  diagnostics: readonly ReportDiagnostic[],
  severity: ReportSeverity,
): number {
  return diagnostics.filter((diagnostic) => diagnostic.severity === severity)
    .length;
}

function selectReportStatus(input: {
  readonly warnings: number;
  readonly errors: number;
  readonly critical: number;
}): ReportStatus {
  if (input.critical > 0) {
    return "critical";
  }

  if (input.errors > 0) {
    return "error";
  }

  if (input.warnings > 0) {
    return "warning";
  }

  return "ok";
}
