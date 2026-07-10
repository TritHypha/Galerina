export type NativeAbi = "c" | "wasm" | "system" | "plugin";

export interface NativeTarget {
  readonly triple: string;
  readonly os: string;
  readonly architecture: string;
  readonly abi?: NativeAbi;
  readonly executionMode: "future-native-executable" | "native-abi-boundary";
}

export interface NativeArtifact {
  readonly path: string;
  readonly target: NativeTarget;
  readonly format: "executable" | "library" | "object";
}

export interface NativeTargetReport {
  readonly artifacts: readonly NativeArtifact[];
  readonly machineProfileBridge: {
    readonly enabled: boolean;
    readonly capabilityProfilePath?: string;
    readonly selectedAbi?: NativeAbi;
  };
  readonly warnings: readonly string[];
}

// ── runtime contract helpers ──────────────────────────────────────────────────
// The interfaces above are the type contract; the helpers below enforce it at
// runtime for target descriptions that arrive as untrusted parsed JSON. Mirrors
// the green sibling target packages (target-cpu, target-ai-accelerator):
// fail-closed validators returning typed diagnostics.

export type NativeDiagnosticSeverity = "warning" | "error";

export interface NativeDiagnostic {
  readonly code: string;
  readonly severity: NativeDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

const NATIVE_ABIS: readonly NativeAbi[] = ["c", "wasm", "system", "plugin"];
const NATIVE_EXECUTION_MODES: readonly NativeTarget["executionMode"][] = [
  "future-native-executable",
  "native-abi-boundary",
];
const NATIVE_FORMATS: readonly NativeArtifact["format"][] = ["executable", "library", "object"];

function nativeDiagnostic(
  code: string,
  severity: NativeDiagnosticSeverity,
  message: string,
  path?: string,
): NativeDiagnostic {
  return { code, severity, message, ...(path === undefined ? {} : { path }) };
}

// A native target must name its triple/os/architecture and, when declared, use a
// known ABI and a known execution mode.
export function validateNativeTarget(
  target: NativeTarget,
  path = "target",
): readonly NativeDiagnostic[] {
  const diagnostics: NativeDiagnostic[] = [];

  for (const field of ["triple", "os", "architecture"] as const) {
    if (target[field].trim().length === 0) {
      diagnostics.push(nativeDiagnostic(
        "Galerina_NATIVE_TARGET_FIELD_REQUIRED",
        "error",
        `Native target requires ${field}.`,
        `${path}.${field}`,
      ));
    }
  }

  if (target.abi !== undefined && !NATIVE_ABIS.includes(target.abi)) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_TARGET_ABI_INVALID",
      "error",
      `Native target ABI must be one of: ${NATIVE_ABIS.join(", ")}.`,
      `${path}.abi`,
    ));
  }

  if (!NATIVE_EXECUTION_MODES.includes(target.executionMode)) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_TARGET_EXECUTION_MODE_INVALID",
      "error",
      `Native target execution mode must be one of: ${NATIVE_EXECUTION_MODES.join(", ")}.`,
      `${path}.executionMode`,
    ));
  }

  return diagnostics;
}

// An artifact must name a path, declare a known format, and describe a valid target.
export function validateNativeArtifact(
  artifact: NativeArtifact,
  path = "artifact",
): readonly NativeDiagnostic[] {
  const diagnostics: NativeDiagnostic[] = [];

  if (artifact.path.trim().length === 0) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_ARTIFACT_PATH_REQUIRED",
      "error",
      "Native artifact requires a path.",
      `${path}.path`,
    ));
  }

  if (!NATIVE_FORMATS.includes(artifact.format)) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_ARTIFACT_FORMAT_INVALID",
      "error",
      `Native artifact format must be one of: ${NATIVE_FORMATS.join(", ")}.`,
      `${path}.format`,
    ));
  }

  diagnostics.push(...validateNativeTarget(artifact.target, `${path}.target`));
  return diagnostics;
}

// Build a native target report, validating every artifact and surfacing a warning
// when the machine-profile bridge is enabled but names no capability profile.
export function createNativeTargetReport(input: {
  readonly artifacts: readonly NativeArtifact[];
  readonly machineProfileBridge: NativeTargetReport["machineProfileBridge"];
}): { readonly report: NativeTargetReport; readonly diagnostics: readonly NativeDiagnostic[] } {
  const diagnostics: NativeDiagnostic[] = [];
  const warnings: string[] = [];

  input.artifacts.forEach((artifact, index) => {
    diagnostics.push(...validateNativeArtifact(artifact, `artifacts.${index}`));
  });

  if (input.machineProfileBridge.enabled &&
      (input.machineProfileBridge.capabilityProfilePath ?? "").trim().length === 0) {
    warnings.push("Machine-profile bridge is enabled but no capability profile path is set.");
  }

  return {
    report: { artifacts: input.artifacts, machineProfileBridge: input.machineProfileBridge, warnings },
    diagnostics,
  };
}
