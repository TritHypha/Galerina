export type AiAcceleratorKind =
  | "npu"
  | "tpu"
  | "ane"
  | "dsp"
  | "ai-chip"
  | "inference-accelerator"
  | "training-accelerator"
  | "plan-only";

export type AiAcceleratorWorkloadKind =
  | "llm_inference"
  | "llm_finetuning"
  | "rag"
  | "embedding"
  | "multimodal"
  | "image_video_preprocess"
  | "tensor_batching";

export type AiAcceleratorPrecision =
  | "INT4"
  | "INT8"
  | "FP8"
  | "BF16"
  | "FP16"
  | "TF32"
  | "FP32";

export type AiAcceleratorFramework =
  | "onnx-runtime"
  | "coreml"
  | "webnn"
  | "tflite"
  | "pytorch"
  | "vllm"
  | "hugging-face"
  | "deepspeed"
  | "tensorflow"
  | "pytorch-lightning"
  | "adapter-only";

export type AiAcceleratorModelFormat = "onnx" | "coreml" | "tflite" | "gguf" | "native";

export type AiAcceleratorAdapterId =
  | "onnxruntime"
  | "onnxruntime-coreml"
  | "onnxruntime-directml"
  | "onnxruntime-qnn"
  | "webnn"
  | "coreml"
  | "android-tflite"
  | "plan-only";

export type AiAcceleratorDiagnosticSeverity = "info" | "warning" | "error";

export interface AiAcceleratorDiagnostic {
  readonly code: string;
  readonly severity: AiAcceleratorDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

export type AiAcceleratorTopology =
  | "single-card"
  | "pooled_1x4"
  | "pooled_2x4"
  | "independent_4x1"
  | "unknown";

export interface AiAcceleratorMemoryProfile {
  readonly hbmBytes?: number;
  readonly onDieSramBytes?: number;
  readonly hbmBandwidthBytesPerSecond?: number;
  readonly pooledHbmBytes?: number;
  readonly avoidHostTransfers: boolean;
}

export interface AiAcceleratorBackendProfile {
  readonly id: string;
  readonly vendor: string;
  readonly device: string;
  readonly kind: AiAcceleratorKind;
  readonly passiveProfile: true;
  readonly preferredWorkloads: readonly AiAcceleratorWorkloadKind[];
  readonly supportedPrecisions: readonly AiAcceleratorPrecision[];
  readonly frameworks: readonly AiAcceleratorFramework[];
  readonly memory: AiAcceleratorMemoryProfile;
  readonly topologies: readonly AiAcceleratorTopology[];
}

export interface AiAcceleratorCapability {
  readonly name: string;
  readonly kind: AiAcceleratorKind;
  readonly vendor?: string;
  readonly supportedPrecisions: readonly string[];
  readonly supportedModelFormats?: readonly AiAcceleratorModelFormat[];
  readonly supportedOperators?: readonly string[];
  readonly supportsOnDeviceOnly?: boolean;
  readonly supportsDynamicShapes?: boolean;
  readonly maxMemoryBytes?: number;
  readonly features: readonly string[];
  readonly backendProfileId?: string;
  readonly topology?: AiAcceleratorTopology;
}

export interface AiAcceleratorModelProfile {
  readonly name: string;
  readonly path: string;
  readonly format: AiAcceleratorModelFormat;
  readonly precision: AiAcceleratorPrecision;
  readonly requiredOperators: readonly string[];
  readonly inputTensors: readonly {
    readonly name: string;
    readonly elementType: string;
    readonly shape: readonly number[];
  }[];
  readonly outputTensors: readonly {
    readonly name: string;
    readonly elementType: string;
    readonly shape: readonly number[];
  }[];
  readonly sizeBytes?: number;
  readonly dynamicShapes: boolean;
}

export interface AiAcceleratorTargetPreference {
  readonly prefer: AiAcceleratorKind;
  readonly fallback: readonly ("gpu" | "cpu" | "low_bit_ai" | AiAcceleratorKind)[];
  readonly requireOnDevice: boolean;
  readonly allowNetwork: boolean;
  readonly allowSilentFallback: false;
  readonly reportFallback: true;
}

export interface AiAcceleratorTargetSelection {
  readonly requestedTarget: AiAcceleratorKind;
  readonly selectedTarget: AiAcceleratorKind | "gpu" | "cpu" | "low_bit_ai" | "reject";
  readonly adapter: AiAcceleratorAdapterId;
  readonly fallbackUsed: boolean;
  readonly fallbackDeclared: boolean;
  readonly safe: boolean;
  readonly reasons: readonly string[];
  readonly diagnostics: readonly AiAcceleratorDiagnostic[];
}

export interface AiAcceleratorPlan {
  readonly flow: string;
  readonly model: string;
  readonly accelerator: "ai_accelerator";
  readonly backendProfileId?: string;
  readonly operations: readonly string[];
  readonly workload?: AiAcceleratorWorkloadKind;
  readonly framework?: AiAcceleratorFramework;
  readonly precision?: AiAcceleratorPrecision | "auto";
  readonly fallbackPrecision?: AiAcceleratorPrecision;
  readonly fallback: "cpu" | "gpu" | "low_bit_ai" | "reject";
}

export interface AiAcceleratorReport {
  readonly backendProfiles?: readonly AiAcceleratorBackendProfile[];
  readonly capabilities: readonly AiAcceleratorCapability[];
  readonly plans: readonly AiAcceleratorPlan[];
  readonly targetSelections?: readonly AiAcceleratorTargetSelection[];
  readonly warnings: readonly string[];
}

export const INTEL_GAUDI3_HL338_PROFILE: AiAcceleratorBackendProfile = {
  id: "intel.gaudi3.hl338",
  vendor: "intel",
  device: "Intel Gaudi 3 PCIe HL-338",
  kind: "inference-accelerator",
  passiveProfile: true,
  preferredWorkloads: [
    "llm_inference",
    "llm_finetuning",
    "rag",
    "embedding",
    "multimodal",
    "image_video_preprocess",
    "tensor_batching",
  ],
  supportedPrecisions: ["FP8", "BF16", "FP16", "TF32", "FP32"],
  frameworks: [
    "pytorch",
    "vllm",
    "hugging-face",
    "deepspeed",
    "tensorflow",
    "pytorch-lightning",
  ],
  memory: {
    hbmBytes: 128 * 1024 ** 3,
    onDieSramBytes: 96 * 1024 ** 2,
    hbmBandwidthBytesPerSecond: 3.7 * 1000 ** 4,
    avoidHostTransfers: true,
  },
  topologies: ["single-card", "pooled_1x4", "pooled_2x4", "independent_4x1"],
};

export const GENERIC_ONNX_NPU_PROFILE: AiAcceleratorBackendProfile = {
  id: "generic.onnx.npu",
  vendor: "generic",
  device: "NPU via ONNX Runtime execution provider",
  kind: "npu",
  passiveProfile: true,
  preferredWorkloads: ["embedding", "multimodal", "image_video_preprocess"],
  supportedPrecisions: ["INT8", "FP16", "FP32"],
  frameworks: ["onnx-runtime", "adapter-only"],
  memory: {
    avoidHostTransfers: true,
  },
  topologies: ["unknown"],
};

export function selectAiAcceleratorTarget(input: {
  readonly model: AiAcceleratorModelProfile;
  readonly preference: AiAcceleratorTargetPreference;
  readonly capabilities: readonly AiAcceleratorCapability[];
  readonly adapter?: AiAcceleratorAdapterId;
}): AiAcceleratorTargetSelection {
  const diagnostics: AiAcceleratorDiagnostic[] = [
    ...validateAiAcceleratorModel(input.model),
  ];
  const reasons: string[] = [];
  const preferredCapability = input.capabilities.find(
    (capability) =>
      capability.kind === input.preference.prefer &&
      isCapabilityCompatible(input.model, capability),
  );

  if (input.preference.allowNetwork) {
    diagnostics.push({
      code: "Galerina_AI_ACCELERATOR_NETWORK_NOT_ON_DEVICE",
      severity: "error",
      message: "NPU/AI accelerator inference must not use network fallback when on-device execution is required.",
      path: "preference.allowNetwork",
    });
  }

  if (preferredCapability !== undefined) {
    reasons.push(`Selected ${preferredCapability.name} for compatible model inference.`);
    return {
      requestedTarget: input.preference.prefer,
      selectedTarget: preferredCapability.kind,
      adapter: input.adapter ?? "plan-only",
      fallbackUsed: false,
      fallbackDeclared: input.preference.fallback.length > 0,
      safe: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      reasons,
      diagnostics,
    };
  }

  reasons.push(`No compatible ${input.preference.prefer} capability is available.`);
  const fallback = input.preference.fallback[0] ?? "reject";
  const fallbackDeclared = input.preference.fallback.length > 0;

  if (!fallbackDeclared) {
    diagnostics.push({
      code: "Galerina_AI_ACCELERATOR_FALLBACK_REQUIRED",
      severity: "error",
      message: "AI accelerator target selection requires explicit fallback or rejection.",
      path: "preference.fallback",
    });
  }

  if (fallback !== "reject") {
    reasons.push(`Selected declared ${fallback} fallback.`);
  }

  return {
    requestedTarget: input.preference.prefer,
    selectedTarget: fallback,
    adapter: input.adapter ?? "plan-only",
    fallbackUsed: true,
    fallbackDeclared,
    safe:
      fallbackDeclared &&
      diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    reasons,
    diagnostics,
  };
}

export function createAiAcceleratorTargetReport(input: {
  readonly capabilities: readonly AiAcceleratorCapability[];
  readonly plans?: readonly AiAcceleratorPlan[];
  readonly selections?: readonly AiAcceleratorTargetSelection[];
  readonly backendProfiles?: readonly AiAcceleratorBackendProfile[];
}): AiAcceleratorReport {
  const warnings = (input.selections ?? []).flatMap((selection) =>
    selection.diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  );

  return {
    ...(input.backendProfiles === undefined
      ? {}
      : { backendProfiles: input.backendProfiles }),
    capabilities: input.capabilities,
    plans: input.plans ?? [],
    targetSelections: input.selections ?? [],
    warnings,
  };
}

export function validateAiAcceleratorModel(
  model: AiAcceleratorModelProfile,
): readonly AiAcceleratorDiagnostic[] {
  const diagnostics: AiAcceleratorDiagnostic[] = [];

  if (model.path.trim().length === 0) {
    diagnostics.push({
      code: "Galerina_AI_ACCELERATOR_MODEL_PATH_REQUIRED",
      severity: "error",
      message: "AI accelerator inference requires an explicit external model path.",
      path: "model.path",
    });
  }

  if (model.format === "onnx" && !model.path.toLowerCase().endsWith(".onnx")) {
    diagnostics.push({
      code: "Galerina_AI_ACCELERATOR_ONNX_EXTENSION_REQUIRED",
      severity: "error",
      message: "ONNX model profiles must reference an .onnx model file.",
      path: "model.path",
    });
  }

  for (const [index, tensor] of model.inputTensors.entries()) {
    if (tensor.shape.some((dimension) => !Number.isSafeInteger(dimension) || dimension <= 0)) {
      diagnostics.push({
        code: "Galerina_AI_ACCELERATOR_INPUT_SHAPE_INVALID",
        severity: "error",
        message: "AI accelerator model input tensor shapes must use positive static dimensions.",
        path: `model.inputTensors.${index}.shape`,
      });
    }
  }

  return diagnostics;
}

function isCapabilityCompatible(
  model: AiAcceleratorModelProfile,
  capability: AiAcceleratorCapability,
): boolean {
  if (capability.supportedModelFormats !== undefined && !capability.supportedModelFormats.includes(model.format)) {
    return false;
  }

  if (!capability.supportedPrecisions.includes(model.precision)) {
    return false;
  }

  if (model.dynamicShapes && capability.supportsDynamicShapes === false) {
    return false;
  }

  if (capability.supportedOperators !== undefined) {
    return model.requiredOperators.every((operator) =>
      capability.supportedOperators?.includes(operator) ?? false,
    );
  }

  return true;
}
