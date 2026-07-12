// Bounded streaming pipeline contracts: sources, transforms, batch windows,
// backpressure, checkpointing, retry, quarantine, budgets and reports.
//
// "Bounded" is the invariant, not a preference. Every stage must carry a
// positive backpressure bound (a pipeline with no maxInFlight is a memory
// balloon), retries must be finite, checkpoints must actually recur, and the
// whole pipeline runs inside explicit memory and time budgets.

export type PipelineSourceKind = "file" | "queue" | "database" | "http" | "memory";

export interface PipelineSource {
  readonly name: string;
  readonly kind: PipelineSourceKind;
}

export interface PipelineTransform {
  readonly name: string;
  readonly inputType: string;
  readonly outputType: string;
}

export interface BatchWindow {
  readonly maxItems: number;
  readonly maxDelayMs: number;
}

export type SaturationBehaviour = "block" | "shed_oldest" | "fail";

// The backpressure bound is what keeps an upstream burst from becoming an
// out-of-memory crash; it is required on every stage.
export interface BackpressurePolicy {
  readonly maxInFlight: number;
  readonly onSaturation: SaturationBehaviour;
}

export interface CheckpointPolicy {
  readonly intervalItems: number;
  readonly store: string;
}

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoffMs: number;
  readonly maxBackoffMs?: number;
}

export interface QuarantinePolicy {
  readonly destination: string;
  readonly maxItems: number;
}

export interface PipelineBudgets {
  readonly memoryBytes: number;
  readonly timeoutMs: number;
}

export interface PipelineStage {
  readonly name: string;
  readonly transform: PipelineTransform;
  readonly backpressure: BackpressurePolicy;
  readonly batch?: BatchWindow;
  readonly retry?: RetryPolicy;
}

export interface PipelineDefinition {
  readonly name: string;
  readonly source: PipelineSource;
  readonly stages: readonly PipelineStage[];
  readonly checkpoint: CheckpointPolicy;
  readonly budgets: PipelineBudgets;
  readonly quarantine?: QuarantinePolicy;
}

export interface PipelineReport {
  readonly pipeline: string;
  readonly processedCount: number;
  readonly failedCount: number;
  readonly quarantinedCount: number;
  readonly checkpointCount: number;
  readonly diagnostics: readonly PipelineDiagnostic[];
  readonly warnings: readonly string[];
}

export type PipelineDiagnosticSeverity = "warning" | "error";

export interface PipelineDiagnostic {
  readonly code: string;
  readonly severity: PipelineDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

const KNOWN_SOURCE_KINDS: ReadonlySet<string> = new Set([
  "file",
  "queue",
  "database",
  "http",
  "memory",
]);

const KNOWN_SATURATION_BEHAVIOURS: ReadonlySet<string> = new Set([
  "block",
  "shed_oldest",
  "fail",
]);

function pipelineDiagnostic(
  code: string,
  severity: PipelineDiagnosticSeverity,
  message: string,
  path?: string,
): PipelineDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function validateBackpressurePolicy(
  policy: BackpressurePolicy,
  path = "backpressure",
): readonly PipelineDiagnostic[] {
  const diagnostics: PipelineDiagnostic[] = [];

  if (!isPositiveSafeInteger(policy.maxInFlight)) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_BACKPRESSURE_BOUND_REQUIRED",
      "error",
      "Backpressure requires a positive integer maxInFlight; an unbounded stage is unsafe.",
      `${path}.maxInFlight`,
    ));
  }

  if (!KNOWN_SATURATION_BEHAVIOURS.has(policy.onSaturation)) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_SATURATION_MODE_UNKNOWN",
      "error",
      `Saturation behaviour "${String(policy.onSaturation)}" is not a known behaviour.`,
      `${path}.onSaturation`,
    ));
  }

  return diagnostics;
}

export function validateCheckpointPolicy(
  policy: CheckpointPolicy,
  path = "checkpoint",
): readonly PipelineDiagnostic[] {
  const diagnostics: PipelineDiagnostic[] = [];

  if (!isPositiveSafeInteger(policy.intervalItems)) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_CHECKPOINT_INTERVAL_REQUIRED",
      "error",
      "Checkpoint policy requires a positive integer intervalItems; a checkpoint that never fires is no checkpoint.",
      `${path}.intervalItems`,
    ));
  }

  if (policy.store.trim().length === 0) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_CHECKPOINT_STORE_REQUIRED",
      "error",
      "Checkpoint policy requires a store reference.",
      `${path}.store`,
    ));
  }

  return diagnostics;
}

export function validateRetryPolicy(
  policy: RetryPolicy,
  path = "retry",
): readonly PipelineDiagnostic[] {
  const diagnostics: PipelineDiagnostic[] = [];

  // Infinite retries are an unbounded loop wearing an error handler's coat.
  if (!isPositiveSafeInteger(policy.maxAttempts)) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_RETRY_BOUND_REQUIRED",
      "error",
      "Retry policy requires a positive integer maxAttempts.",
      `${path}.maxAttempts`,
    ));
  }

  if (!(policy.backoffMs > 0) || !Number.isFinite(policy.backoffMs)) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_RETRY_BACKOFF_INVALID",
      "error",
      "Retry policy requires a positive finite backoffMs.",
      `${path}.backoffMs`,
    ));
  } else if (policy.maxBackoffMs !== undefined && policy.maxBackoffMs < policy.backoffMs) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_RETRY_BACKOFF_INVALID",
      "error",
      "Retry policy maxBackoffMs must be at least backoffMs.",
      `${path}.maxBackoffMs`,
    ));
  }

  return diagnostics;
}

export function validateQuarantinePolicy(
  policy: QuarantinePolicy,
  path = "quarantine",
): readonly PipelineDiagnostic[] {
  const diagnostics: PipelineDiagnostic[] = [];

  if (policy.destination.trim().length === 0 || !isPositiveSafeInteger(policy.maxItems)) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_QUARANTINE_INVALID",
      "error",
      "Quarantine policy requires a destination and a positive integer maxItems.",
      path,
    ));
  }

  return diagnostics;
}

export function validatePipelineStage(
  stage: PipelineStage,
  path = "stage",
): readonly PipelineDiagnostic[] {
  const diagnostics: PipelineDiagnostic[] = [];

  if (stage.name.trim().length === 0) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_STAGE_NAME_REQUIRED",
      "error",
      "Pipeline stage requires a name.",
      `${path}.name`,
    ));
  }

  if (
    stage.transform.inputType.trim().length === 0 ||
    stage.transform.outputType.trim().length === 0
  ) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_TRANSFORM_TYPE_REQUIRED",
      "error",
      "Pipeline transform requires input and output types.",
      `${path}.transform`,
    ));
  }

  diagnostics.push(...validateBackpressurePolicy(stage.backpressure, `${path}.backpressure`));

  if (stage.batch !== undefined) {
    if (
      !isPositiveSafeInteger(stage.batch.maxItems) ||
      !(stage.batch.maxDelayMs > 0) ||
      !Number.isFinite(stage.batch.maxDelayMs)
    ) {
      diagnostics.push(pipelineDiagnostic(
        "Galerina_DATA_PIPELINE_BATCH_BOUND_INVALID",
        "error",
        "Batch window requires positive maxItems and maxDelayMs bounds.",
        `${path}.batch`,
      ));
    }
  }

  if (stage.retry !== undefined) {
    diagnostics.push(...validateRetryPolicy(stage.retry, `${path}.retry`));
  }

  return diagnostics;
}

export function validatePipelineDefinition(
  pipeline: PipelineDefinition,
): readonly PipelineDiagnostic[] {
  const diagnostics: PipelineDiagnostic[] = [];

  if (pipeline.name.trim().length === 0) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_NAME_REQUIRED",
      "error",
      "Pipeline requires a name.",
      "name",
    ));
  }

  if (pipeline.source.name.trim().length === 0) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_SOURCE_NAME_REQUIRED",
      "error",
      "Pipeline source requires a name.",
      "source.name",
    ));
  }

  if (!KNOWN_SOURCE_KINDS.has(pipeline.source.kind)) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_SOURCE_KIND_UNKNOWN",
      "error",
      `Pipeline source kind "${String(pipeline.source.kind)}" is not a known kind.`,
      "source.kind",
    ));
  }

  if (pipeline.stages.length === 0) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_STAGES_REQUIRED",
      "error",
      "Pipeline requires at least one stage.",
      "stages",
    ));
  }

  const stageNames = new Set<string>();
  pipeline.stages.forEach((stage, index) => {
    diagnostics.push(...validatePipelineStage(stage, `stages.${index}`));
    if (stageNames.has(stage.name)) {
      diagnostics.push(pipelineDiagnostic(
        "Galerina_DATA_PIPELINE_STAGE_DUPLICATE",
        "error",
        `Pipeline stage "${stage.name}" is declared more than once.`,
        `stages.${index}.name`,
      ));
    }
    stageNames.add(stage.name);

    // Typed flow: each stage must consume exactly what the previous stage
    // produces, or the pipeline is silently coercing data mid-stream.
    if (index > 0) {
      const previous = pipeline.stages[index - 1];
      if (
        previous !== undefined &&
        previous.transform.outputType !== stage.transform.inputType
      ) {
        diagnostics.push(pipelineDiagnostic(
          "Galerina_DATA_PIPELINE_STAGE_TYPE_MISMATCH",
          "error",
          `Stage "${stage.name}" consumes "${stage.transform.inputType}" but the previous stage produces "${previous.transform.outputType}".`,
          `stages.${index}.transform.inputType`,
        ));
      }
    }
  });

  diagnostics.push(...validateCheckpointPolicy(pipeline.checkpoint));

  if (!isPositiveSafeInteger(pipeline.budgets.memoryBytes)) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_MEMORY_BUDGET_REQUIRED",
      "error",
      "Pipeline requires a positive integer memoryBytes budget.",
      "budgets.memoryBytes",
    ));
  }

  if (!(pipeline.budgets.timeoutMs > 0) || !Number.isFinite(pipeline.budgets.timeoutMs)) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_TIMEOUT_REQUIRED",
      "error",
      "Pipeline requires a positive timeoutMs budget.",
      "budgets.timeoutMs",
    ));
  }

  if (pipeline.quarantine === undefined) {
    // Without a quarantine destination, failed items either block the stream
    // or vanish. Valid (a pipeline may crash-fast instead) but never silent.
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_QUARANTINE_UNDECLARED",
      "warning",
      "Pipeline declares no quarantine policy; failed items have no declared destination.",
      "quarantine",
    ));
  } else {
    diagnostics.push(...validateQuarantinePolicy(pipeline.quarantine));
  }

  return diagnostics;
}

export function createPipelineReport(input: {
  readonly pipeline: string;
  readonly processedCount: number;
  readonly failedCount: number;
  readonly quarantinedCount: number;
  readonly checkpointCount: number;
}): PipelineReport {
  const diagnostics: PipelineDiagnostic[] = [];

  if (input.pipeline.trim().length === 0) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_NAME_REQUIRED",
      "error",
      "Pipeline report requires a pipeline name.",
      "pipeline",
    ));
  }

  for (const [name, value] of [
    ["processedCount", input.processedCount],
    ["failedCount", input.failedCount],
    ["quarantinedCount", input.quarantinedCount],
    ["checkpointCount", input.checkpointCount],
  ] as const) {
    if (!isNonNegativeSafeInteger(value)) {
      diagnostics.push(pipelineDiagnostic(
        "Galerina_DATA_PIPELINE_COUNT_INVALID",
        "error",
        `Pipeline report ${name} must be a non-negative integer.`,
        name,
      ));
    }
  }

  // Failures that were not quarantined went... where? Surface the gap.
  if (
    isNonNegativeSafeInteger(input.failedCount) &&
    isNonNegativeSafeInteger(input.quarantinedCount) &&
    input.failedCount > 0 &&
    input.quarantinedCount < input.failedCount
  ) {
    diagnostics.push(pipelineDiagnostic(
      "Galerina_DATA_PIPELINE_FAILURES_NOT_QUARANTINED",
      "warning",
      `${input.failedCount - input.quarantinedCount} failed items were not quarantined.`,
      "quarantinedCount",
    ));
  }

  return {
    pipeline: input.pipeline,
    processedCount: input.processedCount,
    failedCount: input.failedCount,
    quarantinedCount: input.quarantinedCount,
    checkpointCount: input.checkpointCount,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
