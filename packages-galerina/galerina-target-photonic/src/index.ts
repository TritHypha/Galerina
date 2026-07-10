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

const PHOTONIC_STATUSES: readonly PhotonicTargetStatus[] = [
  "photonic-compatible",
  "photonic-simulation-only",
  "optical-io-only",
  "fallback-required",
  "unsupported",
];

function photonicDiagnostic(
  code: string,
  safeMessage: string,
  suggestedFix?: string,
): PhotonicDiagnostic {
  return { code, safeMessage, ...(suggestedFix === undefined ? {} : { suggestedFix }) };
}

// An optical channel must sit at a physical wavelength (> 0 nm), and — when
// declared — a finite phase and a normalised amplitude in (0, 1].
export function validateOpticalChannelLayout(
  channel: OpticalChannelLayout,
  path = "channel",
): readonly PhotonicDiagnostic[] {
  const diagnostics: PhotonicDiagnostic[] = [];

  if (channel.channelId.trim().length === 0) {
    diagnostics.push(photonicDiagnostic(
      "Galerina_PHOTONIC_CHANNEL_ID_REQUIRED",
      "An optical channel requires an identifier.",
      `Set ${path}.channelId to a non-empty value.`,
    ));
  }

  if (!Number.isFinite(channel.wavelengthNm) || channel.wavelengthNm <= 0) {
    diagnostics.push(photonicDiagnostic(
      "Galerina_PHOTONIC_WAVELENGTH_INVALID",
      "An optical channel wavelength must be a positive number of nanometres.",
      `Set ${path}.wavelengthNm to a finite value greater than 0.`,
    ));
  }

  if (channel.phaseDegrees !== undefined && !Number.isFinite(channel.phaseDegrees)) {
    diagnostics.push(photonicDiagnostic(
      "Galerina_PHOTONIC_PHASE_INVALID",
      "An optical channel phase, when set, must be a finite number of degrees.",
      `Set ${path}.phaseDegrees to a finite value.`,
    ));
  }

  if (channel.amplitude !== undefined &&
      (!Number.isFinite(channel.amplitude) || channel.amplitude <= 0 || channel.amplitude > 1)) {
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
  plan: PhotonicLoweringPlan,
  path = "plan",
): readonly PhotonicDiagnostic[] {
  const diagnostics: PhotonicDiagnostic[] = [];

  if (!PHOTONIC_STATUSES.includes(plan.status)) {
    diagnostics.push(photonicDiagnostic(
      "Galerina_PHOTONIC_STATUS_INVALID",
      "A lowering plan status must be one of the known photonic target statuses.",
      `Set ${path}.status to one of: ${PHOTONIC_STATUSES.join(", ")}.`,
    ));
  }

  plan.unsupportedOperations.forEach((op, index) => {
    if (op.reason.trim().length === 0 || op.suggestedFallback.trim().length === 0) {
      diagnostics.push(photonicDiagnostic(
        "Galerina_PHOTONIC_UNSUPPORTED_OP_UNEXPLAINED",
        "An unsupported operation must carry both a reason and a suggested fallback.",
        `Populate ${path}.unsupportedOperations.${index}.reason and .suggestedFallback.`,
      ));
    }
  });

  if (plan.status === "photonic-compatible" && plan.unsupportedOperations.length > 0) {
    diagnostics.push(photonicDiagnostic(
      "Galerina_PHOTONIC_STATUS_INCONSISTENT",
      "A plan marked photonic-compatible must not carry unsupported operations.",
      `Either map the unsupported operations or set ${path}.status to fallback-required.`,
    ));
  }

  if (plan.mappedOperations.length === 0 &&
      plan.unsupportedOperations.length === 0 &&
      plan.status !== "unsupported") {
    diagnostics.push(photonicDiagnostic(
      "Galerina_PHOTONIC_PLAN_EMPTY",
      "A lowering plan maps no operations and reports none unsupported.",
      `Populate ${path}.mappedOperations or mark ${path}.status as unsupported.`,
    ));
  }

  return diagnostics;
}
