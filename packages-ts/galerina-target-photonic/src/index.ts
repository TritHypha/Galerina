export type PhotonicActualTarget =
  | "photonic_hardware"
  | "photonic_sim"
  | "photonic_plan"
  | "optical_io_interconnect"
  | "cpu_fallback"
  | "unsupported";

export type PhotonicTargetStatus =
  | "photonic-compatible"
  | "photonic-simulation-only"
  | "optical-io-only"
  | "fallback-required"
  | "unsupported";

export type PhotonicOperationKind =
  | "matrix-multiply"
  | "vector-transform"
  | "logic-mapping"
  | "tensor-transfer"
  | "remote-memory-read"
  | "distributed-reduce"
  | "signal-routing"
  | "unsupported";

export type OpticalInterconnectMode =
  | "interconnect"
  | "memory-pooling"
  | "gpu-disaggregation"
  | "ai-cluster"
  | "data-movement";

export type OpticalTransferFormat =
  | "schema-compressed"
  | "binary-record"
  | "tensor-binary"
  | "columnar"
  | "stream";

export interface PhotonicTargetCapability {
  readonly name: string;
  readonly kind: "hardware" | "simulator" | "plan-only" | "optical-io";
  readonly supportedWavelengthsNm: readonly number[];
  readonly supportsPhaseControl: boolean;
  readonly supportsAmplitudeControl: boolean;
  readonly supportedOperations: readonly PhotonicOperationKind[];
  readonly precisionModel: "digital-reference" | "analogue-estimate" | "vendor-reported";
}

export interface OpticalIoCapability {
  readonly provider: string;
  readonly mode: OpticalInterconnectMode;
  readonly available: boolean;
  readonly estimatedBandwidthGbps?: number;
  readonly estimatedLatencyNs?: number;
  readonly reachMeters?: number;
  readonly fallbackInterconnects: readonly ("pcie" | "ethernet" | "standard-network")[];
  readonly supportsRemoteMemory: boolean;
  readonly supportsMemoryPooling: boolean;
  readonly supportsGpuDisaggregation: boolean;
}

export interface PhotonicTargetInput {
  readonly flow: string;
  readonly requestedTarget: "photonic";
  readonly fallbackTargets: readonly string[];
  readonly operations: readonly PhotonicOperationKind[];
  readonly requiredWavelengthsNm: readonly number[];
  readonly requiresCpuReference: boolean;
  readonly sourcePackageVersions: {
    readonly compiler?: string;
    readonly compute?: string;
    readonly photonic?: string;
    readonly vector?: string;
  };
}

export interface PhotonicLoweringPlan {
  readonly flow: string;
  readonly targetCapability: string;
  readonly status: PhotonicTargetStatus;
  readonly mappedOperations: readonly PhotonicOperationMapping[];
  readonly unsupportedOperations: readonly UnsupportedPhotonicOperation[];
}

export interface PhotonicOperationMapping {
  readonly operation: PhotonicOperationKind;
  readonly sourceOperation: string;
  readonly targetOperation: string;
  readonly channels: readonly OpticalChannelLayout[];
}

export interface UnsupportedPhotonicOperation {
  readonly operation: string;
  readonly reason: string;
  readonly suggestedFallback: string;
}

export interface PhotonicSimulationTarget {
  readonly name: string;
  readonly simulator: string;
  readonly version?: string;
  readonly supportedCapabilities: readonly string[];
}

export interface PhotonicExecutionPlan {
  readonly flow: string;
  readonly requestedTarget: "photonic";
  readonly actualTarget: PhotonicActualTarget;
  readonly status: PhotonicTargetStatus;
  readonly targetCapability: string;
  readonly loweringPlan: PhotonicLoweringPlan;
  readonly outputFiles: readonly string[];
}

export interface OpticalIoPlacementRecommendation {
  readonly flow: string;
  readonly recommendation: string;
  readonly reason: string;
  readonly estimatedBytesAvoided?: number;
}

export interface OpticalIoTransferPlan {
  readonly flow: string;
  readonly provider: string;
  readonly mode: OpticalInterconnectMode;
  readonly sourceLocation: "host" | "accelerator" | "memory-pool" | "storage" | "remote";
  readonly targetLocation: "host" | "accelerator" | "memory-pool" | "storage" | "remote";
  readonly estimatedTransferBytes: number;
  readonly largestTransfer?: string;
  readonly format: OpticalTransferFormat;
  readonly fallbackInterconnect: "pcie" | "ethernet" | "standard-network";
  readonly encryptionRequired: boolean;
  readonly recommendations: readonly OpticalIoPlacementRecommendation[];
}

export interface PhotonicHardwareMappingFile {
  readonly path: string;
  readonly format: "json" | "vendor-specific" | "plan-only";
  readonly targetCapability: string;
  readonly generatedFor: string;
}

export interface PhotonicFallbackReport {
  readonly flow: string;
  readonly fallbackRequired: boolean;
  readonly fallbackTarget?: string;
  readonly reasons: readonly string[];
}

export interface OpticalChannelLayout {
  readonly channelId: string;
  readonly wavelengthNm: number;
  readonly phaseDegrees?: number;
  readonly amplitude?: number;
}

export interface OpticalChannelLayoutReport {
  readonly flow: string;
  readonly channels: readonly OpticalChannelLayout[];
  readonly warnings: readonly string[];
}

export interface MatrixOperationMappingReport {
  readonly flow: string;
  readonly operation: "matrix-multiply";
  readonly inputShape: readonly number[];
  readonly outputShape: readonly number[];
  readonly channelLayout: readonly OpticalChannelLayout[];
  readonly precisionNotes: readonly string[];
}

export interface PhotonicTargetReport {
  readonly capabilities: readonly PhotonicTargetCapability[];
  readonly opticalIoCapabilities?: readonly OpticalIoCapability[];
  readonly executionPlans: readonly PhotonicExecutionPlan[];
  readonly opticalIoTransferPlans?: readonly OpticalIoTransferPlan[];
  readonly fallbackReports: readonly PhotonicFallbackReport[];
  readonly channelLayoutReports: readonly OpticalChannelLayoutReport[];
  readonly matrixMappingReports: readonly MatrixOperationMappingReport[];
  readonly warnings: readonly string[];
  readonly diagnostics: readonly PhotonicDiagnostic[];
}

// ── runtime contract helpers ──────────────────────────────────────────────────
// The interfaces above are the type contract; the helpers below enforce it at
// runtime for lowering plans that arrive as untrusted parsed JSON. The diagnostic
// shape matches PhotonicTargetReport.diagnostics ({code, safeMessage, suggestedFix})
// — a "safe" message never leaks vendor/host detail. Fail-closed: physically
// impossible channels and silently-dropped operations are rejected.

export interface PhotonicDiagnostic {
  readonly code: string;
  readonly safeMessage: string;
  readonly suggestedFix?: string;
}

export type PhotonicActualTargetDecode =
  | { readonly ok: true; readonly value: PhotonicActualTarget }
  | { readonly ok: false; readonly diagnostic: PhotonicDiagnostic };

const PHOTONIC_STATUSES: readonly PhotonicTargetStatus[] = [
  "photonic-compatible",
  "photonic-simulation-only",
  "optical-io-only",
  "fallback-required",
  "unsupported",
];

const PHOTONIC_ACTUAL_TARGETS: readonly PhotonicActualTarget[] = [
  "photonic_hardware",
  "photonic_sim",
  "photonic_plan",
  "optical_io_interconnect",
  "cpu_fallback",
  "unsupported",
];

const PHOTONIC_OPERATIONS: readonly PhotonicOperationKind[] = [
  "matrix-multiply",
  "vector-transform",
  "logic-mapping",
  "tensor-transfer",
  "remote-memory-read",
  "distributed-reduce",
  "signal-routing",
  "unsupported",
];

const MAX_PHOTONIC_TEXT = 256;
const MAX_PHOTONIC_ITEMS = 256;

function hasField(record: Record<string, unknown>, field: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, field);
}

function boundedPhotonicText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_PHOTONIC_TEXT;
}

function cloneableData(value: unknown): boolean {
  try {
    globalThis.structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

function captureExactRecord(
  value: unknown,
  allowedFields: readonly string[],
): Record<string, unknown> | undefined {
  try {
    if (typeof value !== "object" || value === undefined || value === null ||
        Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
      return undefined;
    }

    const allowed = new Set(allowedFields);
    const captured: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || !allowed.has(key)) return undefined;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return undefined;
      }
      captured[key] = descriptor.value;
    }
    return captured;
  } catch {
    return undefined;
  }
}

function captureDenseArray(value: unknown): readonly unknown[] | undefined {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return undefined;
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (lengthDescriptor === undefined || !("value" in lengthDescriptor) ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0 || lengthDescriptor.value > MAX_PHOTONIC_ITEMS) {
      return undefined;
    }
    const length = lengthDescriptor.value as number;
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.length !== length + 1) return undefined;

    const captured: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return undefined;
      }
      captured.push(descriptor.value);
    }
    return captured;
  } catch {
    return undefined;
  }
}

function decodeOpticalChannel(value: unknown): OpticalChannelLayout | undefined {
  const record = captureExactRecord(value, [
    "channelId", "wavelengthNm", "phaseDegrees", "amplitude",
  ]);
  if (record === undefined || !hasField(record, "channelId") ||
      !hasField(record, "wavelengthNm") || !boundedPhotonicText(record.channelId) ||
      typeof record.wavelengthNm !== "number" || !cloneableData(value)) {
    return undefined;
  }
  if (hasField(record, "phaseDegrees") && record.phaseDegrees !== undefined &&
      typeof record.phaseDegrees !== "number") return undefined;
  if (hasField(record, "amplitude") && record.amplitude !== undefined &&
      typeof record.amplitude !== "number") return undefined;
  return {
    channelId: record.channelId,
    wavelengthNm: record.wavelengthNm,
    ...(record.phaseDegrees === undefined ? {} : { phaseDegrees: record.phaseDegrees as number }),
    ...(record.amplitude === undefined ? {} : { amplitude: record.amplitude as number }),
  };
}

function decodeMappedOperation(value: unknown): PhotonicOperationMapping | undefined {
  const record = captureExactRecord(value, [
    "operation", "sourceOperation", "targetOperation", "channels",
  ]);
  const channels = record === undefined ? undefined : captureDenseArray(record.channels);
  if (record === undefined || channels === undefined ||
      !hasField(record, "operation") || !hasField(record, "sourceOperation") ||
      !hasField(record, "targetOperation") || !boundedPhotonicText(record.operation) ||
      !PHOTONIC_OPERATIONS.includes(record.operation as PhotonicOperationKind) ||
      !boundedPhotonicText(record.sourceOperation) ||
      !boundedPhotonicText(record.targetOperation)) return undefined;
  const decodedChannels: OpticalChannelLayout[] = [];
  for (const channel of channels) {
    const decoded = decodeOpticalChannel(channel);
    if (decoded === undefined) return undefined;
    decodedChannels.push(decoded);
  }
  if (!cloneableData(value)) return undefined;
  return {
    operation: record.operation as PhotonicOperationKind,
    sourceOperation: record.sourceOperation,
    targetOperation: record.targetOperation,
    channels: decodedChannels,
  };
}

function decodeUnsupportedOperation(value: unknown): UnsupportedPhotonicOperation | undefined {
  const record = captureExactRecord(value, ["operation", "reason", "suggestedFallback"]);
  if (record === undefined || !boundedPhotonicText(record.operation) ||
      !boundedPhotonicText(record.reason) || !boundedPhotonicText(record.suggestedFallback) ||
      !cloneableData(value)) return undefined;
  return {
    operation: record.operation,
    reason: record.reason,
    suggestedFallback: record.suggestedFallback,
  };
}

function decodePhotonicLoweringPlan(value: unknown): PhotonicLoweringPlan | undefined {
  const record = captureExactRecord(value, [
    "flow", "targetCapability", "status", "mappedOperations", "unsupportedOperations",
  ]);
  const mapped = record === undefined ? undefined : captureDenseArray(record.mappedOperations);
  const unsupported = record === undefined ? undefined : captureDenseArray(record.unsupportedOperations);
  if (record === undefined || mapped === undefined || unsupported === undefined ||
      !hasField(record, "flow") || !hasField(record, "targetCapability") ||
      !hasField(record, "status") || !boundedPhotonicText(record.flow) ||
      !boundedPhotonicText(record.targetCapability) || !boundedPhotonicText(record.status)) {
    return undefined;
  }

  const decodedMapped: PhotonicOperationMapping[] = [];
  for (const operation of mapped) {
    const decoded = decodeMappedOperation(operation);
    if (decoded === undefined) return undefined;
    decodedMapped.push(decoded);
  }
  const decodedUnsupported: UnsupportedPhotonicOperation[] = [];
  for (const operation of unsupported) {
    const decoded = decodeUnsupportedOperation(operation);
    if (decoded === undefined) return undefined;
    decodedUnsupported.push(decoded);
  }
  if (!cloneableData(value)) return undefined;
  return {
    flow: record.flow,
    targetCapability: record.targetCapability,
    status: record.status as PhotonicTargetStatus,
    mappedOperations: decodedMapped,
    unsupportedOperations: decodedUnsupported,
  };
}

function photonicDiagnostic(
  code: string,
  safeMessage: string,
  suggestedFix?: string,
): PhotonicDiagnostic {
  return { code, safeMessage, ...(suggestedFix === undefined ? {} : { suggestedFix }) };
}

/** Decode the runtime target label before it can enter an execution-plan report. */
export function decodePhotonicActualTarget(
  value: unknown,
  path = "actualTarget",
): PhotonicActualTargetDecode {
  if (typeof value === "string" && PHOTONIC_ACTUAL_TARGETS.includes(value as PhotonicActualTarget)) {
    return { ok: true, value: value as PhotonicActualTarget };
  }
  return {
    ok: false,
    diagnostic: photonicDiagnostic(
      "Galerina_PHOTONIC_ACTUAL_TARGET_INVALID",
      "A photonic execution target must use an admitted runtime label.",
      `Set ${path} to one of the admitted photonic target labels.`,
    ),
  };
}

// An optical channel must sit at a physical wavelength (> 0 nm), and — when
// declared — a finite phase and a normalised amplitude in (0, 1].
export function validateOpticalChannelLayout(
  channel: unknown,
  path = "channel",
): readonly PhotonicDiagnostic[] {
  const decoded = decodeOpticalChannel(channel);
  if (decoded === undefined) {
    return [photonicDiagnostic(
      "Galerina_PHOTONIC_CHANNEL_RECORD_INVALID",
      "An optical channel must be an exact own-data record.",
      `Replace ${path} with a plain record containing only its admitted fields.`,
    )];
  }

  const diagnostics: PhotonicDiagnostic[] = [];

  if (decoded.channelId.trim().length === 0) {
    diagnostics.push(photonicDiagnostic(
      "Galerina_PHOTONIC_CHANNEL_ID_REQUIRED",
      "An optical channel requires an identifier.",
      `Set ${path}.channelId to a non-empty value.`,
    ));
  }

  if (!Number.isFinite(decoded.wavelengthNm) || decoded.wavelengthNm <= 0) {
    diagnostics.push(photonicDiagnostic(
      "Galerina_PHOTONIC_WAVELENGTH_INVALID",
      "An optical channel wavelength must be a positive number of nanometres.",
      `Set ${path}.wavelengthNm to a finite value greater than 0.`,
    ));
  }

  if (decoded.phaseDegrees !== undefined && !Number.isFinite(decoded.phaseDegrees)) {
    diagnostics.push(photonicDiagnostic(
      "Galerina_PHOTONIC_PHASE_INVALID",
      "An optical channel phase, when set, must be a finite number of degrees.",
      `Set ${path}.phaseDegrees to a finite value.`,
    ));
  }

  if (decoded.amplitude !== undefined &&
      (!Number.isFinite(decoded.amplitude) || decoded.amplitude <= 0 || decoded.amplitude > 1)) {
    diagnostics.push(photonicDiagnostic(
      "Galerina_PHOTONIC_AMPLITUDE_INVALID",
      "An optical channel amplitude, when set, must be normalised within (0, 1].",
      `Set ${path}.amplitude to a value greater than 0 and at most 1.`,
    ));
  }

  return diagnostics;
}

// A lowering plan must carry a known status, explain every unsupported operation
// (a reason AND a concrete fallback — never a silent drop), and actually do
// something (map at least one operation unless it is explicitly unsupported).
export function validatePhotonicLoweringPlan(
  plan: unknown,
  path = "plan",
): readonly PhotonicDiagnostic[] {
  const decoded = decodePhotonicLoweringPlan(plan);
  if (decoded === undefined) {
    return [photonicDiagnostic(
      "Galerina_PHOTONIC_PLAN_RECORD_INVALID",
      "A photonic lowering plan must be an exact own-data record with dense nested arrays.",
      `Replace ${path} with a complete plain lowering-plan record.`,
    )];
  }

  const diagnostics: PhotonicDiagnostic[] = [];

  if (!PHOTONIC_STATUSES.includes(decoded.status)) {
    diagnostics.push(photonicDiagnostic(
      "Galerina_PHOTONIC_STATUS_INVALID",
      "A lowering plan status must be one of the known photonic target statuses.",
      `Set ${path}.status to one of: ${PHOTONIC_STATUSES.join(", ")}.`,
    ));
  }

  decoded.mappedOperations.forEach((mapping, mappingIndex) => {
    if (!PHOTONIC_OPERATIONS.includes(mapping.operation)) {
      diagnostics.push(photonicDiagnostic(
        "Galerina_PHOTONIC_MAPPED_OP_INVALID",
        "A mapped photonic operation must use a known operation kind.",
        `Set ${path}.mappedOperations.${mappingIndex}.operation to a known operation.`,
      ));
    }
    mapping.channels.forEach((channel, channelIndex) => {
      diagnostics.push(...validateOpticalChannelLayout(
        channel,
        `${path}.mappedOperations.${mappingIndex}.channels.${channelIndex}`,
      ));
    });
  });

  decoded.unsupportedOperations.forEach((op, index) => {
    if (op.reason.trim().length === 0 || op.suggestedFallback.trim().length === 0) {
      diagnostics.push(photonicDiagnostic(
        "Galerina_PHOTONIC_UNSUPPORTED_OP_UNEXPLAINED",
        "An unsupported operation must carry both a reason and a suggested fallback.",
        `Populate ${path}.unsupportedOperations.${index}.reason and .suggestedFallback.`,
      ));
    }
  });

  if (decoded.status === "photonic-compatible" && decoded.unsupportedOperations.length > 0) {
    diagnostics.push(photonicDiagnostic(
      "Galerina_PHOTONIC_STATUS_INCONSISTENT",
      "A plan marked photonic-compatible must not carry unsupported operations.",
      `Either map the unsupported operations or set ${path}.status to fallback-required.`,
    ));
  }

  if (decoded.mappedOperations.length === 0 &&
      decoded.unsupportedOperations.length === 0 &&
      decoded.status !== "unsupported") {
    diagnostics.push(photonicDiagnostic(
      "Galerina_PHOTONIC_PLAN_EMPTY",
      "A lowering plan maps no operations and reports none unsupported.",
      `Populate ${path}.mappedOperations or mark ${path}.status as unsupported.`,
    ));
  }

  return diagnostics;
}
