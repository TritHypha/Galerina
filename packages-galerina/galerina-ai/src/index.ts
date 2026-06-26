export type AiTaskKind =
  | "text-generation"
  | "summarisation"
  | "classification"
  | "embedding"
  | "reranking"
  | "tool-planning";

export type AiOutputTrust = "untrusted" | "policy-reviewed" | "trusted-local";

export type AiModelFormat =
  | "gguf"
  | "onnx"
  | "safetensors"
  | "native"
  | "remote";

export type AiInferenceTarget =
  | "gpu"
  | "npu"
  | "low_bit_ai"
  | "ternary_ai"
  | "cpu.generic"
  | "wasm"
  | "remote"
  | "plan-only";

export type AiDiagnosticSeverity = "info" | "warning" | "error";

export interface AiDiagnostic {
  readonly code: string;
  readonly severity: AiDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
  readonly suggestedFix?: string;
}

export interface AiMemoryEstimate {
  readonly modelBytes: number;
  readonly contextBytes: number;
  readonly workingBytes: number;
  readonly totalBytes: number;
}

export interface AiModelCapability {
  readonly task: AiTaskKind;
  readonly maxContextTokens: number;
  readonly maxOutputTokens: number;
  readonly supportsStreaming: boolean;
  readonly supportedTargets: readonly AiInferenceTarget[];
}

export interface AiModelDescriptor {
  readonly name: string;
  readonly format: AiModelFormat;
  readonly source: "local-file" | "local-directory" | "registry" | "remote-api";
  readonly capabilities: readonly AiModelCapability[];
  readonly memoryEstimate?: AiMemoryEstimate;
  readonly safetyPolicy: AiSafetyPolicy;
}

export interface AiModelRegistryEntry {
  readonly id: string;
  readonly descriptor: AiModelDescriptor;
  readonly approved: boolean;
  readonly tags: readonly string[];
}

export interface AiModelRegistry {
  readonly models: readonly AiModelRegistryEntry[];
}

export interface AiTargetSelection {
  readonly selectedTarget: AiInferenceTarget;
  readonly fallbackUsed: boolean;
  readonly reason: string;
  readonly diagnostics: readonly AiDiagnostic[];
}

export interface AiPrompt {
  readonly input: string;
  readonly system?: string;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface AiGenerationOptions {
  readonly maxOutputTokens: number;
  readonly contextTokens: number;
  readonly temperature?: number;
  readonly timeoutMs: number;
  readonly stream: boolean;
}

export interface AiSafetyPolicy {
  readonly outputTrust: AiOutputTrust;
  readonly allowSecurityDecisions: boolean;
  readonly requireHumanReviewForHighImpact: boolean;
  readonly redactSecretsFromPrompts: boolean;
  readonly logPrompts: boolean;
}

export interface AiInferenceRequest {
  readonly model: AiModelDescriptor;
  readonly prompt: AiPrompt;
  readonly task: AiTaskKind;
  readonly targetPreference: readonly AiInferenceTarget[];
  readonly requireOnDevice?: boolean;
  readonly allowNetwork?: boolean;
  readonly allowSilentFallback?: false;
  readonly options: AiGenerationOptions;
}

export interface AiInferenceResponse {
  readonly text: string;
  readonly finishReason: "stop" | "length" | "timeout" | "error";
  readonly outputTrust: AiOutputTrust;
  readonly diagnostics: readonly AiDiagnostic[];
}

export interface AiInferenceReport {
  readonly modelName: string;
  readonly task: AiTaskKind;
  readonly requestedTargets: readonly AiInferenceTarget[];
  readonly selectedTarget: AiInferenceTarget;
  readonly fallbackUsed: boolean;
  readonly memoryEstimate?: AiMemoryEstimate;
  readonly diagnostics: readonly AiDiagnostic[];
}

export const DEFAULT_AI_SAFETY_POLICY: AiSafetyPolicy = {
  outputTrust: "untrusted",
  allowSecurityDecisions: false,
  requireHumanReviewForHighImpact: true,
  redactSecretsFromPrompts: true,
  logPrompts: false,
};

export function defineAiModelRegistry(
  models: readonly AiModelRegistryEntry[],
): AiModelRegistry {
  return { models };
}

export function findAiModel(
  registry: AiModelRegistry,
  id: string,
): AiModelRegistryEntry | undefined {
  return registry.models.find((entry) => entry.id === id);
}

export function defineAiSafetyPolicy(
  policy: Partial<AiSafetyPolicy> = {},
): AiSafetyPolicy {
  return {
    outputTrust: policy.outputTrust ?? DEFAULT_AI_SAFETY_POLICY.outputTrust,
    allowSecurityDecisions:
      policy.allowSecurityDecisions ??
      DEFAULT_AI_SAFETY_POLICY.allowSecurityDecisions,
    requireHumanReviewForHighImpact:
      policy.requireHumanReviewForHighImpact ??
      DEFAULT_AI_SAFETY_POLICY.requireHumanReviewForHighImpact,
    redactSecretsFromPrompts:
      policy.redactSecretsFromPrompts ??
      DEFAULT_AI_SAFETY_POLICY.redactSecretsFromPrompts,
    logPrompts: policy.logPrompts ?? DEFAULT_AI_SAFETY_POLICY.logPrompts,
  };
}

export function selectAiInferenceTarget(
  request: AiInferenceRequest,
): AiTargetSelection {
  const capability = request.model.capabilities.find(
    (item) => item.task === request.task,
  );

  if (capability === undefined) {
    return {
      selectedTarget: "plan-only",
      fallbackUsed: true,
      reason: "Model does not declare support for the requested AI task.",
      diagnostics: [
        {
          code: "Galerina_AI_MODEL_TASK_UNSUPPORTED",
          severity: "error",
          message: `Model "${request.model.name}" does not support task "${request.task}".`,
          path: "model.capabilities",
        },
      ],
    };
  }

  for (const target of request.targetPreference) {
    if (capability.supportedTargets.includes(target)) {
      return {
        selectedTarget: target,
        fallbackUsed: target !== request.targetPreference[0],
        reason: "Target is compatible with the model capability and preference order.",
        diagnostics: [],
      };
    }
  }

  return {
    selectedTarget: "plan-only",
    fallbackUsed: true,
    reason: "No requested inference target is compatible with the model.",
    diagnostics: [
      {
        code: "Galerina_AI_TARGET_UNSUPPORTED",
        severity: "error",
        message: "No requested inference target is compatible with the model capability.",
        path: "targetPreference",
      },
    ],
  };
}

export function createAiInferenceReport(
  request: AiInferenceRequest,
): AiInferenceReport {
  const diagnostics = validateAiInferenceRequest(request);
  const selection = selectAiInferenceTarget(request);

  return {
    modelName: request.model.name,
    task: request.task,
    requestedTargets: request.targetPreference,
    selectedTarget: selection.selectedTarget,
    fallbackUsed: selection.fallbackUsed,
    ...(request.model.memoryEstimate === undefined
      ? {}
      : { memoryEstimate: request.model.memoryEstimate }),
    diagnostics: [...diagnostics, ...selection.diagnostics],
  };
}

export function validateAiInferenceRequest(
  request: AiInferenceRequest,
): readonly AiDiagnostic[] {
  const diagnostics: AiDiagnostic[] = [];
  const capability = request.model.capabilities.find(
    (item) => item.task === request.task,
  );

  if (request.options.maxOutputTokens <= 0) {
    diagnostics.push({
      code: "Galerina_AI_MAX_OUTPUT_TOKENS_REQUIRED",
      severity: "error",
      message: "AI inference requires a positive max output token limit.",
      path: "options.maxOutputTokens",
    });
  }

  if (request.options.contextTokens <= 0) {
    diagnostics.push({
      code: "Galerina_AI_CONTEXT_TOKENS_REQUIRED",
      severity: "error",
      message: "AI inference requires a positive context token limit.",
      path: "options.contextTokens",
    });
  }

  if (request.options.timeoutMs <= 0) {
    diagnostics.push({
      code: "Galerina_AI_TIMEOUT_REQUIRED",
      severity: "error",
      message: "AI inference requires a positive timeout.",
      path: "options.timeoutMs",
    });
  }

  if (request.model.safetyPolicy.allowSecurityDecisions) {
    diagnostics.push({
      code: "Galerina_AI_SECURITY_DECISION_NOT_ALLOWED",
      severity: "error",
      message:
        "AI output must not directly make security or high-impact decisions.",
      path: "model.safetyPolicy.allowSecurityDecisions",
      suggestedFix:
        "Route AI output through deterministic application policy before acting.",
    });
  }

  if (
    request.model.safetyPolicy.outputTrust !== "untrusted" &&
    request.model.safetyPolicy.requireHumanReviewForHighImpact
  ) {
    diagnostics.push({
      code: "Galerina_AI_OUTPUT_TRUST_REVIEW_CONFLICT",
      severity: "warning",
      message:
        "Trusted AI output still requires human review for high-impact actions.",
      path: "model.safetyPolicy",
    });
  }

  if (
    request.model.safetyPolicy.logPrompts &&
    !request.model.safetyPolicy.redactSecretsFromPrompts
  ) {
    diagnostics.push({
      code: "Galerina_AI_PROMPT_LOGGING_REQUIRES_REDACTION",
      severity: "error",
      message: "Prompt logging requires prompt secret redaction.",
      path: "model.safetyPolicy.logPrompts",
    });
  }

  if (
    capability !== undefined &&
    request.options.contextTokens > capability.maxContextTokens
  ) {
    diagnostics.push({
      code: "Galerina_AI_CONTEXT_LIMIT_EXCEEDED",
      severity: "error",
      message: "Requested context token limit exceeds model capability.",
      path: "options.contextTokens",
    });
  }

  if (
    capability !== undefined &&
    request.options.maxOutputTokens > capability.maxOutputTokens
  ) {
    diagnostics.push({
      code: "Galerina_AI_OUTPUT_LIMIT_EXCEEDED",
      severity: "error",
      message: "Requested output token limit exceeds model capability.",
      path: "options.maxOutputTokens",
    });
  }

  if (request.prompt.input.trim().length === 0) {
    diagnostics.push({
      code: "Galerina_AI_PROMPT_INPUT_REQUIRED",
      severity: "error",
      message: "AI inference requires non-empty prompt input.",
      path: "prompt.input",
    });
  }

  if (request.requireOnDevice === true && request.allowNetwork === true) {
    diagnostics.push({
      code: "Galerina_AI_ON_DEVICE_DENIES_NETWORK",
      severity: "error",
      message: "On-device AI inference must not allow network execution.",
      path: "allowNetwork",
      suggestedFix: "Set allowNetwork to false or remove requireOnDevice.",
    });
  }

  if (
    request.targetPreference.includes("remote") &&
    request.allowNetwork === false
  ) {
    diagnostics.push({
      code: "Galerina_AI_REMOTE_TARGET_DENIED",
      severity: "error",
      message: "Remote AI target is denied when network execution is not allowed.",
      path: "targetPreference",
    });
  }

  return diagnostics;
}
