export type LowBitAiTarget = "low_bit_ai" | "ternary_ai";

export type LowBitAiBackendId =
  | "bitnet"
  | "cpu_reference"
  | "future_standard"
  | "ternary_native"
  | "gpu_kernel"
  | "npu_kernel"
  | "plan_only";

export type LowBitAiDevice = "cpu" | "gpu" | "npu" | "wasm" | "photonic" | "plan-only";

export type LowBitAiWeightFormat =
  | "binary_1bit"
  | "ternary_b1_58"
  | "int2"
  | "int3"
  | "int4"
  | "custom_low_bit";

export type LowBitAiQuantization =
  | "i2_s"
  | "tl1"
  | "tl2"
  | "q2"
  | "q3"
  | "q4"
  | "custom";

export type LowBitAiEmbeddingQuantization = "none" | "f16" | "q6_k" | "custom";

export type LowBitAiKernelFamily =
  | "i2_s"
  | "tl1"
  | "tl2"
  | "ternary"
  | "low_bit_reference"
  | "auto";

export type LowBitAiRuntimeKind =
  | "native-addon"
  | "external-process"
  | "linked-library"
  | "remote-runtime"
  | "plan-only";

export type LowBitAiDiagnosticSeverity = "warning" | "error";

export interface LowBitAiDiagnostic {
  readonly code: string;
  readonly severity: LowBitAiDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export interface LowBitAiBackendAdapter {
  readonly id: LowBitAiBackendId;
  readonly name: string;
  readonly runtime: LowBitAiRuntimeKind;
  readonly device: LowBitAiDevice;
  readonly version?: string;
  readonly supportedWeightFormats: readonly LowBitAiWeightFormat[];
  readonly supportedQuantizations: readonly LowBitAiQuantization[];
  readonly supportedEmbeddingQuantizations: readonly LowBitAiEmbeddingQuantization[];
  readonly supportedKernelFamilies: readonly LowBitAiKernelFamily[];
}

export interface LowBitAiModelReference {
  readonly name: string;
  readonly path: string;
  readonly format: "gguf" | "onnx" | "safetensors" | "native";
  readonly weightFormat: LowBitAiWeightFormat;
  readonly quantization: LowBitAiQuantization;
  readonly embeddingQuantization: LowBitAiEmbeddingQuantization;
  readonly parameterCount?: string;
  readonly maxContextTokens: number;
  readonly maxOutputTokens: number;
  readonly memoryEstimateBytes: number;
}

export interface LowBitAiModelValidationResult {
  readonly model: LowBitAiModelReference;
  readonly valid: boolean;
  readonly diagnostics: readonly LowBitAiDiagnostic[];
}

export interface LowBitAiRuntimeLimits {
  readonly threads: number;
  readonly timeoutMs: number;
  readonly maxPromptTokens: number;
  readonly maxOutputTokens: number;
  readonly memoryLimitBytes: number;
}

export interface LowBitAiInferencePlan {
  readonly target: LowBitAiTarget;
  readonly model: LowBitAiModelReference;
  readonly backend: LowBitAiBackendId;
  readonly device: LowBitAiDevice;
  readonly runtime: LowBitAiRuntimeKind;
  readonly kernelFamily: LowBitAiKernelFamily;
  readonly limits: LowBitAiRuntimeLimits;
  readonly fallbackReason?: string;
  readonly report: true;
}

export interface LowBitAiInferenceReport {
  readonly modelName: string;
  readonly target: LowBitAiTarget;
  readonly backend: LowBitAiBackendId;
  readonly device: LowBitAiDevice;
  readonly runtime: LowBitAiRuntimeKind;
  readonly weightFormat: LowBitAiWeightFormat;
  readonly quantization: LowBitAiQuantization;
  readonly embeddingQuantization: LowBitAiEmbeddingQuantization;
  readonly threads: number;
  readonly fallback: boolean;
  readonly diagnostics: readonly LowBitAiDiagnostic[];
}

export interface LowBitAiBenchmarkSample {
  readonly modelName: string;
  readonly backend: LowBitAiBackendId;
  readonly device: LowBitAiDevice;
  readonly runtime: LowBitAiRuntimeKind;
  readonly threads: number;
  readonly promptTokens: number;
  readonly outputTokens: number;
  readonly tokensPerSecond: number;
  readonly memoryBytes: number;
}

export interface LowBitAiBenchmarkReport {
  readonly samples: readonly LowBitAiBenchmarkSample[];
  readonly diagnostics: readonly LowBitAiDiagnostic[];
}

export function createLowBitAiInferencePlan(
  model: LowBitAiModelReference,
  limits: LowBitAiRuntimeLimits,
  options: {
    readonly target?: LowBitAiTarget;
    readonly backend?: LowBitAiBackendId;
    readonly device?: LowBitAiDevice;
    readonly runtime?: LowBitAiRuntimeKind;
    readonly kernelFamily?: LowBitAiKernelFamily;
    readonly fallbackReason?: string;
  } = {},
): LowBitAiInferencePlan {
  return {
    target: options.target ?? "low_bit_ai",
    model,
    backend: options.backend ?? "plan_only",
    device: options.device ?? "plan-only",
    runtime: options.runtime ?? "plan-only",
    kernelFamily: options.kernelFamily ?? "auto",
    limits,
    ...(options.fallbackReason === undefined
      ? {}
      : { fallbackReason: options.fallbackReason }),
    report: true,
  };
}

export function createLowBitAiInferenceReport(
  plan: LowBitAiInferencePlan,
): LowBitAiInferenceReport {
  const diagnostics = validateLowBitAiInferencePlan(plan);

  return {
    modelName: plan.model.name,
    target: plan.target,
    backend: plan.backend,
    device: plan.device,
    runtime: plan.runtime,
    weightFormat: plan.model.weightFormat,
    quantization: plan.model.quantization,
    embeddingQuantization: plan.model.embeddingQuantization,
    threads: plan.limits.threads,
    fallback: plan.fallbackReason !== undefined,
    diagnostics,
  };
}

export function validateLowBitAiModel(
  model: LowBitAiModelReference,
): LowBitAiModelValidationResult {
  const diagnostics: LowBitAiDiagnostic[] = [];

  if (model.path.trim().length === 0) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_MODEL_PATH_REQUIRED",
      severity: "error",
      message: "Low-bit AI inference requires an explicit local model path.",
      path: "model.path",
    });
  }

  if (model.format === "gguf" && !model.path.toLowerCase().endsWith(".gguf")) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_GGUF_EXTENSION_REQUIRED",
      severity: "error",
      message: "GGUF low-bit AI model paths must reference a GGUF file.",
      path: "model.path",
    });
  }

  if (model.maxContextTokens <= 0) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_CONTEXT_TOKENS_REQUIRED",
      severity: "error",
      message: "Low-bit AI model requires a positive max context token limit.",
      path: "model.maxContextTokens",
    });
  }

  if (model.maxOutputTokens <= 0) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_OUTPUT_TOKENS_REQUIRED",
      severity: "error",
      message: "Low-bit AI model requires a positive max output token limit.",
      path: "model.maxOutputTokens",
    });
  }

  if (model.memoryEstimateBytes <= 0) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_MEMORY_ESTIMATE_REQUIRED",
      severity: "error",
      message: "Low-bit AI model requires a positive memory estimate.",
      path: "model.memoryEstimateBytes",
    });
  }

  return {
    model,
    valid: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    diagnostics,
  };
}

export function validateLowBitAiBackendAdapter(
  adapter: LowBitAiBackendAdapter,
  plan: LowBitAiInferencePlan,
): readonly LowBitAiDiagnostic[] {
  const diagnostics: LowBitAiDiagnostic[] = [];

  if (!adapter.supportedWeightFormats.includes(plan.model.weightFormat)) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_BACKEND_WEIGHT_FORMAT_UNSUPPORTED",
      severity: "error",
      message: "Low-bit AI backend does not support the model weight format.",
      path: "backend.supportedWeightFormats",
    });
  }

  if (!adapter.supportedQuantizations.includes(plan.model.quantization)) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_BACKEND_QUANTIZATION_UNSUPPORTED",
      severity: "error",
      message: "Low-bit AI backend does not support the model quantization.",
      path: "backend.supportedQuantizations",
    });
  }

  if (
    !adapter.supportedEmbeddingQuantizations.includes(
      plan.model.embeddingQuantization,
    )
  ) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_BACKEND_EMBEDDING_QUANTIZATION_UNSUPPORTED",
      severity: "error",
      message:
        "Low-bit AI backend does not support the embedding quantization.",
      path: "backend.supportedEmbeddingQuantizations",
    });
  }

  if (
    plan.kernelFamily !== "auto" &&
    !adapter.supportedKernelFamilies.includes(plan.kernelFamily)
  ) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_BACKEND_KERNEL_UNSUPPORTED",
      severity: "error",
      message: "Low-bit AI backend does not support the requested kernel.",
      path: "backend.supportedKernelFamilies",
    });
  }

  return diagnostics;
}

export function validateLowBitAiInferencePlan(
  plan: LowBitAiInferencePlan,
): readonly LowBitAiDiagnostic[] {
  const diagnostics: LowBitAiDiagnostic[] = [
    ...validateLowBitAiModel(plan.model).diagnostics,
  ];

  if (
    plan.target === "ternary_ai" &&
    plan.model.weightFormat !== "ternary_b1_58"
  ) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_TERNARY_TARGET_REQUIRES_TERNARY_WEIGHTS",
      severity: "error",
      message: "The ternary_ai target requires a ternary model weight format.",
      path: "model.weightFormat",
    });
  }

  if (plan.limits.maxOutputTokens <= 0) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_MAX_OUTPUT_TOKENS_REQUIRED",
      severity: "error",
      message: "Low-bit AI inference requires a positive max output token limit.",
      path: "limits.maxOutputTokens",
    });
  }

  if (plan.limits.threads <= 0) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_THREAD_LIMIT_REQUIRED",
      severity: "error",
      message: "Low-bit AI inference requires a positive thread limit.",
      path: "limits.threads",
    });
  }

  if (plan.limits.timeoutMs <= 0) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_TIMEOUT_REQUIRED",
      severity: "error",
      message: "Low-bit AI inference requires a positive timeout.",
      path: "limits.timeoutMs",
    });
  }

  if (plan.model.memoryEstimateBytes > plan.limits.memoryLimitBytes) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_MEMORY_LIMIT_EXCEEDED",
      severity: "error",
      message: "Low-bit AI model memory estimate exceeds the configured limit.",
      path: "limits.memoryLimitBytes",
    });
  }

  if (plan.model.maxOutputTokens > plan.limits.maxOutputTokens) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_MODEL_OUTPUT_LIMIT_EXCEEDS_RUNTIME_LIMIT",
      severity: "warning",
      message:
        "Low-bit AI model output capacity is higher than the runtime output limit.",
      path: "model.maxOutputTokens",
    });
  }

  if (plan.limits.maxPromptTokens > plan.model.maxContextTokens) {
    diagnostics.push({
      code: "Galerina_LOWBIT_AI_PROMPT_LIMIT_EXCEEDS_CONTEXT",
      severity: "error",
      message:
        "Low-bit AI prompt token limit exceeds the model context window.",
      path: "limits.maxPromptTokens",
    });
  }

  return diagnostics;
}
