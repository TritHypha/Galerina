import { isProxy as isNodeProxy } from "node:util/types";

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

type DecodeResult<T> =
  | { readonly value: T }
  | { readonly diagnostic: AiAcceleratorDiagnostic };

type AcceleratorTensor = {
  readonly name: string;
  readonly elementType: string;
  readonly shape: readonly number[];
};

type DecodedSelectionInput = {
  readonly model: AiAcceleratorModelProfile;
  readonly preference: AiAcceleratorTargetPreference;
  readonly capabilities: readonly AiAcceleratorCapability[];
  readonly adapter: AiAcceleratorAdapterId;
};

const AI_ACCELERATOR_KINDS: readonly AiAcceleratorKind[] = [
  "npu", "tpu", "ane", "dsp", "ai-chip", "inference-accelerator", "training-accelerator", "plan-only",
];
const AI_ACCELERATOR_WORKLOADS: readonly AiAcceleratorWorkloadKind[] = [
  "llm_inference", "llm_finetuning", "rag", "embedding", "multimodal", "image_video_preprocess", "tensor_batching",
];
const AI_ACCELERATOR_PRECISIONS: readonly AiAcceleratorPrecision[] = ["INT4", "INT8", "FP8", "BF16", "FP16", "TF32", "FP32"];
const AI_ACCELERATOR_FORMATS: readonly AiAcceleratorModelFormat[] = ["onnx", "coreml", "tflite", "gguf", "native"];
const AI_ACCELERATOR_FRAMEWORKS: readonly AiAcceleratorFramework[] = [
  "onnx-runtime", "coreml", "webnn", "tflite", "pytorch", "vllm", "hugging-face", "deepspeed", "tensorflow", "pytorch-lightning", "adapter-only",
];
const AI_ACCELERATOR_ADAPTERS: readonly AiAcceleratorAdapterId[] = [
  "onnxruntime", "onnxruntime-coreml", "onnxruntime-directml", "onnxruntime-qnn", "webnn", "coreml", "android-tflite", "plan-only",
];
const AI_ACCELERATOR_TOPOLOGIES: readonly AiAcceleratorTopology[] = ["single-card", "pooled_1x4", "pooled_2x4", "independent_4x1", "unknown"];
const AI_ACCELERATOR_FALLBACKS: readonly ("gpu" | "cpu" | "low_bit_ai" | AiAcceleratorKind)[] = [
  "gpu", "cpu", "low_bit_ai", ...AI_ACCELERATOR_KINDS,
];
const MAX_ACCELERATOR_ARRAY_ITEMS = 1024;
const MAX_ACCELERATOR_STRING_LENGTH = 2048;
const MAX_TENSOR_RANK = 8;
const MAX_TENSOR_DIMENSION = 1_000_000;

function decodeFailure(path: string, detail: string): DecodeResult<never> {
  return {
    diagnostic: {
      code: "Galerina_AI_ACCELERATOR_INPUT_REFUSED",
      severity: "error",
      message: `AI accelerator input refused: ${detail}.`,
      path,
    },
  };
}

function isDecodeFailure<T>(result: DecodeResult<T>): result is { readonly diagnostic: AiAcceleratorDiagnostic } {
  return "diagnostic" in result;
}

function decodeRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  path: string,
): DecodeResult<Record<string, unknown>> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || isNodeProxy(value)) {
      return decodeFailure(path, "expected a non-proxy plain object record");
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return decodeFailure(path, "inherited or non-plain records are refused");
    }
    const keys = Reflect.ownKeys(value);
    const stringKeys = keys.filter((key): key is string => typeof key === "string");
    if (
      stringKeys.length !== keys.length
      || stringKeys.some((key) => !allowedKeys.includes(key))
      || requiredKeys.some((key) => !stringKeys.includes(key))
    ) {
      return decodeFailure(path, "surplus, symbol, or missing fields are refused");
    }
    const copy: Record<string, unknown> = {};
    for (const key of stringKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return decodeFailure(`${path}.${key}`, "accessor or non-enumerable fields are refused");
      }
      copy[key] = descriptor.value;
    }
    return { value: copy };
  } catch {
    return decodeFailure(path, "exceptional or proxy-like records are refused");
  }
}

function decodeArray(value: unknown, path: string): DecodeResult<readonly unknown[]> {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || isNodeProxy(value)) {
      return decodeFailure(path, "expected a plain non-proxy array");
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined
      || !("value" in lengthDescriptor)
      || typeof lengthDescriptor.value !== "number"
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value > MAX_ACCELERATOR_ARRAY_ITEMS
    ) {
      return decodeFailure(path, "array length is invalid or unbounded");
    }
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || !keys.includes("length")) {
      return decodeFailure(path, "sparse or surplus array fields are refused");
    }
    const copy: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      if (!keys.includes(key)) return decodeFailure(path, "sparse array fields are refused");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return decodeFailure(`${path}.${index}`, "array elements must be own enumerable data");
      }
      copy.push(descriptor.value);
    }
    return { value: Object.freeze(copy) };
  } catch {
    return decodeFailure(path, "exceptional or proxy-like arrays are refused");
  }
}

function decodeString(value: unknown, path: string, nonEmpty = true): DecodeResult<string> {
  if (typeof value !== "string" || value.length > MAX_ACCELERATOR_STRING_LENGTH || (nonEmpty && value.length === 0)) {
    return decodeFailure(path, "expected a bounded string");
  }
  if ([...value].some((character) => character.charCodeAt(0) < 0x20 || character === "\u007f")) {
    return decodeFailure(path, "control characters are refused");
  }
  return { value };
}

function decodeBoolean(value: unknown, path: string): DecodeResult<boolean> {
  return typeof value === "boolean" ? { value } : decodeFailure(path, "expected a boolean");
}

function decodeFiniteSafeNumber(value: unknown, path: string, minimum = 0): DecodeResult<number> {
  return typeof value === "number" && Number.isFinite(value) && Number.isSafeInteger(value) && !Object.is(value, -0) && value >= minimum
    ? { value }
    : decodeFailure(path, "expected a finite safe integer in the permitted range");
}

function decodeEnum<T extends string>(value: unknown, path: string, vocabulary: readonly T[]): DecodeResult<T> {
  return typeof value === "string" && vocabulary.includes(value as T)
    ? { value: value as T }
    : decodeFailure(path, "unknown or absent vocabulary value");
}

function decodeStringArray(value: unknown, path: string, vocabulary?: readonly string[], requireNonEmpty = false): DecodeResult<readonly string[]> {
  const decoded = decodeArray(value, path);
  if (isDecodeFailure(decoded)) return decoded;
  if (requireNonEmpty && decoded.value.length === 0) return decodeFailure(path, "an explicit non-empty collection is required");
  const copy: string[] = [];
  for (const [index, item] of decoded.value.entries()) {
    const stringValue = decodeString(item, `${path}.${index}`);
    if (isDecodeFailure(stringValue)) return stringValue;
    if (vocabulary !== undefined && !vocabulary.includes(stringValue.value)) {
      return decodeFailure(`${path}.${index}`, "unknown vocabulary value");
    }
    copy.push(stringValue.value);
  }
  return { value: Object.freeze(copy) };
}

function absent<T>(): DecodeResult<T | undefined> {
  return { value: undefined };
}

function decodeTensor(value: unknown, path: string): DecodeResult<AcceleratorTensor> {
  const record = decodeRecord(value, ["name", "elementType", "shape"], ["name", "elementType", "shape"], path);
  if (isDecodeFailure(record)) return record;
  const name = decodeString(record.value.name, `${path}.name`);
  if (isDecodeFailure(name)) return name;
  const elementType = decodeString(record.value.elementType, `${path}.elementType`);
  if (isDecodeFailure(elementType)) return elementType;
  const shape = decodeArray(record.value.shape, `${path}.shape`);
  if (isDecodeFailure(shape)) return shape;
  if (shape.value.length === 0 || shape.value.length > MAX_TENSOR_RANK) {
    return decodeFailure(`${path}.shape`, "tensor rank is outside the bounded range");
  }
  const dimensions: number[] = [];
  for (const [index, dimension] of shape.value.entries()) {
    if (typeof dimension !== "number" || !Number.isSafeInteger(dimension) || dimension <= 0 || dimension > MAX_TENSOR_DIMENSION) {
      return decodeFailure(`${path}.shape.${index}`, "tensor dimensions must be bounded positive safe integers");
    }
    dimensions.push(dimension);
  }
  return { value: Object.freeze({ name: name.value, elementType: elementType.value, shape: Object.freeze(dimensions) }) };
}

function decodeModel(value: unknown, path: string): DecodeResult<AiAcceleratorModelProfile> {
  const record = decodeRecord(
    value,
    ["name", "path", "format", "precision", "requiredOperators", "inputTensors", "outputTensors", "sizeBytes", "dynamicShapes"],
    ["name", "path", "format", "precision", "requiredOperators", "inputTensors", "outputTensors", "dynamicShapes"],
    path,
  );
  if (isDecodeFailure(record)) return record;
  const name = decodeString(record.value.name, `${path}.name`);
  if (isDecodeFailure(name)) return name;
  const modelPath = decodeString(record.value.path, `${path}.path`);
  if (isDecodeFailure(modelPath)) return modelPath;
  const format = decodeEnum(record.value.format, `${path}.format`, AI_ACCELERATOR_FORMATS);
  if (isDecodeFailure(format)) return format;
  const precision = decodeEnum(record.value.precision, `${path}.precision`, AI_ACCELERATOR_PRECISIONS);
  if (isDecodeFailure(precision)) return precision;
  const requiredOperators = decodeStringArray(record.value.requiredOperators, `${path}.requiredOperators`, undefined, true);
  if (isDecodeFailure(requiredOperators)) return requiredOperators;
  const inputs = decodeArray(record.value.inputTensors, `${path}.inputTensors`);
  if (isDecodeFailure(inputs)) return inputs;
  const inputTensors: AcceleratorTensor[] = [];
  for (const [index, tensor] of inputs.value.entries()) {
    const decoded = decodeTensor(tensor, `${path}.inputTensors.${index}`);
    if (isDecodeFailure(decoded)) return decoded;
    inputTensors.push(decoded.value);
  }
  const outputs = decodeArray(record.value.outputTensors, `${path}.outputTensors`);
  if (isDecodeFailure(outputs)) return outputs;
  const outputTensors: AcceleratorTensor[] = [];
  for (const [index, tensor] of outputs.value.entries()) {
    const decoded = decodeTensor(tensor, `${path}.outputTensors.${index}`);
    if (isDecodeFailure(decoded)) return decoded;
    outputTensors.push(decoded.value);
  }
  const dynamicShapes = decodeBoolean(record.value.dynamicShapes, `${path}.dynamicShapes`);
  if (isDecodeFailure(dynamicShapes)) return dynamicShapes;
  let sizeBytes: number | undefined;
  if (record.value.sizeBytes !== undefined) {
    const decoded = decodeFiniteSafeNumber(record.value.sizeBytes, `${path}.sizeBytes`);
    if (isDecodeFailure(decoded)) return decoded;
    sizeBytes = decoded.value;
  }
  return {
    value: Object.freeze({
      name: name.value,
      path: modelPath.value,
      format: format.value,
      precision: precision.value,
      requiredOperators: requiredOperators.value,
      inputTensors: Object.freeze(inputTensors),
      outputTensors: Object.freeze(outputTensors),
      ...(sizeBytes === undefined ? {} : { sizeBytes }),
      dynamicShapes: dynamicShapes.value,
    }),
  };
}

function decodeCapability(value: unknown, path: string): DecodeResult<AiAcceleratorCapability> {
  const record = decodeRecord(
    value,
    ["name", "kind", "vendor", "supportedPrecisions", "supportedModelFormats", "supportedOperators", "supportsOnDeviceOnly", "supportsDynamicShapes", "maxMemoryBytes", "features", "backendProfileId", "topology"],
    ["name", "kind", "supportedPrecisions", "features"],
    path,
  );
  if (isDecodeFailure(record)) return record;
  const name = decodeString(record.value.name, `${path}.name`);
  if (isDecodeFailure(name)) return name;
  const kind = decodeEnum(record.value.kind, `${path}.kind`, AI_ACCELERATOR_KINDS);
  if (isDecodeFailure(kind)) return kind;
  const supportedPrecisions = decodeStringArray(record.value.supportedPrecisions, `${path}.supportedPrecisions`, AI_ACCELERATOR_PRECISIONS, true);
  if (isDecodeFailure(supportedPrecisions)) return supportedPrecisions;
  const features = decodeStringArray(record.value.features, `${path}.features`);
  if (isDecodeFailure(features)) return features;
  const vendor = record.value.vendor === undefined ? absent<string>() : decodeString(record.value.vendor, `${path}.vendor`);
  if (isDecodeFailure(vendor)) return vendor;
  const supportedModelFormats = record.value.supportedModelFormats === undefined
    ? absent<readonly AiAcceleratorModelFormat[]>()
    : decodeStringArray(record.value.supportedModelFormats, `${path}.supportedModelFormats`, AI_ACCELERATOR_FORMATS);
  if (isDecodeFailure(supportedModelFormats)) return supportedModelFormats;
  const supportedOperators = record.value.supportedOperators === undefined
    ? absent<readonly string[]>()
    : decodeStringArray(record.value.supportedOperators, `${path}.supportedOperators`, undefined, true);
  if (isDecodeFailure(supportedOperators)) return supportedOperators;
  const supportsOnDeviceOnly = record.value.supportsOnDeviceOnly === undefined
    ? absent<boolean>()
    : decodeBoolean(record.value.supportsOnDeviceOnly, `${path}.supportsOnDeviceOnly`);
  if (isDecodeFailure(supportsOnDeviceOnly)) return supportsOnDeviceOnly;
  const supportsDynamicShapes = record.value.supportsDynamicShapes === undefined
    ? absent<boolean>()
    : decodeBoolean(record.value.supportsDynamicShapes, `${path}.supportsDynamicShapes`);
  if (isDecodeFailure(supportsDynamicShapes)) return supportsDynamicShapes;
  const maxMemoryBytes = record.value.maxMemoryBytes === undefined
    ? absent<number>()
    : decodeFiniteSafeNumber(record.value.maxMemoryBytes, `${path}.maxMemoryBytes`);
  if (isDecodeFailure(maxMemoryBytes)) return maxMemoryBytes;
  const backendProfileId = record.value.backendProfileId === undefined
    ? absent<string>()
    : decodeString(record.value.backendProfileId, `${path}.backendProfileId`);
  if (isDecodeFailure(backendProfileId)) return backendProfileId;
  const topology = record.value.topology === undefined
    ? absent<AiAcceleratorTopology>()
    : decodeEnum(record.value.topology, `${path}.topology`, AI_ACCELERATOR_TOPOLOGIES);
  if (isDecodeFailure(topology)) return topology;
  return {
    value: Object.freeze({
      name: name.value,
      kind: kind.value,
      ...(vendor.value === undefined ? {} : { vendor: vendor.value }),
      supportedPrecisions: supportedPrecisions.value,
      ...(supportedModelFormats.value === undefined ? {} : { supportedModelFormats: supportedModelFormats.value as readonly AiAcceleratorModelFormat[] }),
      ...(supportedOperators.value === undefined ? {} : { supportedOperators: supportedOperators.value }),
      ...(supportsOnDeviceOnly.value === undefined ? {} : { supportsOnDeviceOnly: supportsOnDeviceOnly.value }),
      ...(supportsDynamicShapes.value === undefined ? {} : { supportsDynamicShapes: supportsDynamicShapes.value }),
      ...(maxMemoryBytes.value === undefined ? {} : { maxMemoryBytes: maxMemoryBytes.value }),
      features: features.value,
      ...(backendProfileId.value === undefined ? {} : { backendProfileId: backendProfileId.value }),
      ...(topology.value === undefined ? {} : { topology: topology.value }),
    }),
  };
}

function decodePreference(value: unknown, path: string): DecodeResult<AiAcceleratorTargetPreference> {
  const record = decodeRecord(
    value,
    ["prefer", "fallback", "requireOnDevice", "allowNetwork", "allowSilentFallback", "reportFallback"],
    ["prefer", "fallback", "requireOnDevice", "allowNetwork", "allowSilentFallback", "reportFallback"],
    path,
  );
  if (isDecodeFailure(record)) return record;
  const prefer = decodeEnum(record.value.prefer, `${path}.prefer`, AI_ACCELERATOR_KINDS);
  if (isDecodeFailure(prefer)) return prefer;
  const fallback = decodeStringArray(record.value.fallback, `${path}.fallback`, AI_ACCELERATOR_FALLBACKS);
  if (isDecodeFailure(fallback)) return fallback;
  const requireOnDevice = decodeBoolean(record.value.requireOnDevice, `${path}.requireOnDevice`);
  if (isDecodeFailure(requireOnDevice)) return requireOnDevice;
  const allowNetwork = decodeBoolean(record.value.allowNetwork, `${path}.allowNetwork`);
  if (isDecodeFailure(allowNetwork)) return allowNetwork;
  const allowSilentFallback = decodeBoolean(record.value.allowSilentFallback, `${path}.allowSilentFallback`);
  if (isDecodeFailure(allowSilentFallback)) return allowSilentFallback;
  const reportFallback = decodeBoolean(record.value.reportFallback, `${path}.reportFallback`);
  if (isDecodeFailure(reportFallback)) return reportFallback;
  if (allowSilentFallback.value !== false) return decodeFailure(`${path}.allowSilentFallback`, "silent fallback is forbidden");
  if (reportFallback.value !== true) return decodeFailure(`${path}.reportFallback`, "fallback reporting is mandatory");
  return {
    value: Object.freeze({
      prefer: prefer.value,
      fallback: fallback.value as readonly ("gpu" | "cpu" | "low_bit_ai" | AiAcceleratorKind)[],
      requireOnDevice: requireOnDevice.value,
      allowNetwork: allowNetwork.value,
      allowSilentFallback: false,
      reportFallback: true,
    }),
  };
}

function decodeSelectionInput(value: unknown): DecodeResult<DecodedSelectionInput> {
  const record = decodeRecord(value, ["model", "preference", "capabilities", "adapter"], ["model", "preference", "capabilities"], "input");
  if (isDecodeFailure(record)) return record;
  const model = decodeModel(record.value.model, "model");
  if (isDecodeFailure(model)) return model;
  const preference = decodePreference(record.value.preference, "preference");
  if (isDecodeFailure(preference)) return preference;
  const capabilities = decodeArray(record.value.capabilities, "capabilities");
  if (isDecodeFailure(capabilities)) return capabilities;
  const decodedCapabilities: AiAcceleratorCapability[] = [];
  for (const [index, capability] of capabilities.value.entries()) {
    const decoded = decodeCapability(capability, `capabilities.${index}`);
    if (isDecodeFailure(decoded)) return decoded;
    decodedCapabilities.push(decoded.value);
  }
  const adapter = record.value.adapter === undefined
    ? { value: "plan-only" as AiAcceleratorAdapterId }
    : decodeEnum(record.value.adapter, "adapter", AI_ACCELERATOR_ADAPTERS);
  if (isDecodeFailure(adapter)) return adapter;
  return { value: Object.freeze({ model: model.value, preference: preference.value, capabilities: Object.freeze(decodedCapabilities), adapter: adapter.value }) };
}

function validateDecodedModel(model: AiAcceleratorModelProfile): readonly AiAcceleratorDiagnostic[] {
  const diagnostics: AiAcceleratorDiagnostic[] = [];
  if (model.path.trim().length === 0) {
    diagnostics.push({ code: "Galerina_AI_ACCELERATOR_MODEL_PATH_REQUIRED", severity: "error", message: "AI accelerator inference requires an explicit external model path.", path: "model.path" });
  }
  if (model.format === "onnx" && !model.path.toLowerCase().endsWith(".onnx")) {
    diagnostics.push({ code: "Galerina_AI_ACCELERATOR_ONNX_EXTENSION_REQUIRED", severity: "error", message: "ONNX model profiles must reference an .onnx model file.", path: "model.path" });
  }
  return diagnostics;
}

export function selectAiAcceleratorTarget(input: unknown): AiAcceleratorTargetSelection {
  const decoded = decodeSelectionInput(input);
  if (isDecodeFailure(decoded)) {
    return {
      requestedTarget: "plan-only",
      selectedTarget: "reject",
      adapter: "plan-only",
      fallbackUsed: false,
      fallbackDeclared: false,
      safe: false,
      reasons: ["AI accelerator target selection refused malformed input."],
      diagnostics: [decoded.diagnostic],
    };
  }
  const { model, preference, capabilities, adapter } = decoded.value;
  const diagnostics: AiAcceleratorDiagnostic[] = [...validateDecodedModel(model)];
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return {
      requestedTarget: preference.prefer,
      selectedTarget: "reject",
      adapter,
      fallbackUsed: false,
      fallbackDeclared: preference.fallback.length > 0,
      safe: false,
      reasons: ["AI accelerator model validation failed."],
      diagnostics,
    };
  }
  const reasons: string[] = [];
  const preferredCapability = capabilities.find(
    (capability) =>
      capability.kind === preference.prefer &&
      isCapabilityCompatible(model, capability, preference, adapter),
  );

  if (preference.requireOnDevice && preference.allowNetwork) {
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
      requestedTarget: preference.prefer,
      selectedTarget: preferredCapability.kind,
      adapter,
      fallbackUsed: false,
      fallbackDeclared: preference.fallback.length > 0,
      safe: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
      reasons,
      diagnostics,
    };
  }

  reasons.push(`No compatible ${preference.prefer} capability is available.`);
  const fallback = preference.fallback[0] ?? "reject";
  const fallbackDeclared = preference.fallback.length > 0;

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
    requestedTarget: preference.prefer,
    selectedTarget: fallback,
    adapter,
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

export function validateAiAcceleratorModel(model: unknown): readonly AiAcceleratorDiagnostic[] {
  const decoded = decodeModel(model, "model");
  if (isDecodeFailure(decoded)) return [decoded.diagnostic];
  return validateDecodedModel(decoded.value);
}

function isCapabilityCompatible(
  model: AiAcceleratorModelProfile,
  capability: AiAcceleratorCapability,
  preference: AiAcceleratorTargetPreference,
  adapter: AiAcceleratorAdapterId,
): boolean {
  if (capability.supportedModelFormats === undefined || !capability.supportedModelFormats.includes(model.format)) {
    return false;
  }

  if (!capability.supportedPrecisions.includes(model.precision)) {
    return false;
  }

  if (model.dynamicShapes && capability.supportsDynamicShapes !== true) {
    return false;
  }

  const supportedOperators = capability.supportedOperators;
  if (supportedOperators === undefined || !model.requiredOperators.every((operator) => supportedOperators.includes(operator))) {
    return false;
  }

  if (preference.requireOnDevice && capability.supportsOnDeviceOnly !== true) return false;
  if (model.sizeBytes !== undefined && capability.maxMemoryBytes !== undefined && model.sizeBytes > capability.maxMemoryBytes) return false;
  if (adapter !== "plan-only" && !adapterSupportsFormat(adapter, model.format)) return false;
  return true;
}

function adapterSupportsFormat(adapter: AiAcceleratorAdapterId, format: AiAcceleratorModelFormat): boolean {
  switch (adapter) {
    case "onnxruntime":
    case "onnxruntime-coreml":
    case "onnxruntime-directml":
    case "onnxruntime-qnn":
      return format === "onnx";
    case "webnn":
      return format === "onnx" || format === "tflite";
    case "coreml":
      return format === "coreml";
    case "android-tflite":
      return format === "tflite";
    case "plan-only":
      return true;
  }
}
