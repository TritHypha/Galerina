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
// runtime for target descriptions that arrive as untrusted records. This is a
// planning-only boundary: admission here never authorizes native execution.

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
const MAX_NATIVE_ARRAY_ITEMS = 1024;

type NativeDecodeResult<T> =
  | { readonly value: T }
  | { readonly diagnostic: NativeDiagnostic };

function nativeDiagnostic(
  code: string,
  severity: NativeDiagnosticSeverity,
  message: string,
  path?: string,
): NativeDiagnostic {
  return { code, severity, message, ...(path === undefined ? {} : { path }) };
}

function nativeDecodeFailure(path: string, detail: string): NativeDecodeResult<never> {
  return {
    diagnostic: nativeDiagnostic(
      "Galerina_NATIVE_INPUT_INVALID",
      "error",
      `Native input was refused: ${detail}.`,
      path,
    ),
  };
}

function nativeDecodeString(value: unknown, path: string): NativeDecodeResult<string> {
  return typeof value === "string"
    ? { value }
    : nativeDecodeFailure(path, "expected a string");
}

function nativeDecodeBoolean(value: unknown, path: string): NativeDecodeResult<boolean> {
  return typeof value === "boolean"
    ? { value }
    : nativeDecodeFailure(path, "expected a boolean");
}

function nativeDecodeRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  path: string,
): NativeDecodeResult<Record<string, unknown>> {
  try {
    if (typeof value !== "object" || value === null) {
      return nativeDecodeFailure(path, "expected an object record");
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return nativeDecodeFailure(path, "inherited or non-plain records are refused");
    }
    const keys = Reflect.ownKeys(value);
    const stringKeys = keys.filter((key): key is string => typeof key === "string");
    if (stringKeys.length !== keys.length ||
        stringKeys.some((key) => !allowedKeys.includes(key)) ||
        requiredKeys.some((key) => !stringKeys.includes(key))) {
      return nativeDecodeFailure(path, "surplus, symbol, or missing fields are refused");
    }
    const copy: Record<string, unknown> = {};
    for (const key of stringKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        return nativeDecodeFailure(`${path}.${key}`, "accessor properties are refused");
      }
      copy[key] = descriptor.value;
    }
    return { value: copy };
  } catch {
    return nativeDecodeFailure(path, "exceptional or proxy-like records are refused");
  }
}

function nativeDecodeArray(value: unknown, path: string): NativeDecodeResult<readonly unknown[]> {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return nativeDecodeFailure(path, "expected a plain array");
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (lengthDescriptor === undefined || !("value" in lengthDescriptor) ||
        typeof lengthDescriptor.value !== "number" ||
        !Number.isFinite(lengthDescriptor.value) ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0 || lengthDescriptor.value > MAX_NATIVE_ARRAY_ITEMS) {
      return nativeDecodeFailure(path, "array length is invalid or unbounded");
    }
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || !keys.includes("length")) {
      return nativeDecodeFailure(path, "sparse or surplus array fields are refused");
    }
    for (const key of keys) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^\d+$/.test(key) ||
          String(Number(key)) !== key || Number(key) >= length) {
        return nativeDecodeFailure(path, "sparse or surplus array fields are refused");
      }
    }
    const copy: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
      if (descriptor === undefined || !("value" in descriptor)) {
        return nativeDecodeFailure(`${path}.${index}`, "array elements must be own data");
      }
      copy.push(descriptor.value);
    }
    return { value: copy };
  } catch {
    return nativeDecodeFailure(path, "exceptional or proxy-like arrays are refused");
  }
}

function nativeEnsureStructuredCloneable(value: unknown, path: string): NativeDecodeResult<true> {
  try {
    structuredClone(value);
    return { value: true };
  } catch {
    return nativeDecodeFailure(path, "proxy-backed or non-cloneable values are refused");
  }
}

function freezeNativeDiagnostics(
  diagnostics: readonly NativeDiagnostic[],
): readonly NativeDiagnostic[] {
  return Object.freeze(diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic })));
}

function nativeDecodeTarget(value: unknown, path: string): NativeDecodeResult<NativeTarget> {
  const record = nativeDecodeRecord(
    value,
    ["triple", "os", "architecture", "abi", "executionMode"],
    ["triple", "os", "architecture", "executionMode"],
    path,
  );
  if ("diagnostic" in record) return record;

  const { triple, os, architecture, abi, executionMode } = record.value;
  const decodedTriple = nativeDecodeString(triple, `${path}.triple`);
  if ("diagnostic" in decodedTriple) return decodedTriple;
  const decodedOs = nativeDecodeString(os, `${path}.os`);
  if ("diagnostic" in decodedOs) return decodedOs;
  const decodedArchitecture = nativeDecodeString(architecture, `${path}.architecture`);
  if ("diagnostic" in decodedArchitecture) return decodedArchitecture;
  const decodedExecutionMode = nativeDecodeString(executionMode, `${path}.executionMode`);
  if ("diagnostic" in decodedExecutionMode) return decodedExecutionMode;
  const decodedAbi = abi === undefined
    ? { value: undefined }
    : nativeDecodeString(abi, `${path}.abi`);
  if ("diagnostic" in decodedAbi) return decodedAbi;

  const cloneable = nativeEnsureStructuredCloneable(value, path);
  if ("diagnostic" in cloneable) return cloneable;
  return {
    value: {
      triple: decodedTriple.value,
      os: decodedOs.value,
      architecture: decodedArchitecture.value,
      ...(decodedAbi.value === undefined ? {} : { abi: decodedAbi.value as NativeAbi }),
      executionMode: decodedExecutionMode.value as NativeTarget["executionMode"],
    },
  };
}

function nativeDecodeArtifact(value: unknown, path: string): NativeDecodeResult<NativeArtifact> {
  const record = nativeDecodeRecord(
    value,
    ["path", "target", "format"],
    ["path", "target", "format"],
    path,
  );
  if ("diagnostic" in record) return record;

  const { path: artifactPath, target, format } = record.value;
  const decodedPath = nativeDecodeString(artifactPath, `${path}.path`);
  if ("diagnostic" in decodedPath) return decodedPath;
  const decodedFormat = nativeDecodeString(format, `${path}.format`);
  if ("diagnostic" in decodedFormat) return decodedFormat;
  const decodedTarget = nativeDecodeTarget(target, `${path}.target`);
  if ("diagnostic" in decodedTarget) return decodedTarget;

  const cloneable = nativeEnsureStructuredCloneable(value, path);
  if ("diagnostic" in cloneable) return cloneable;
  return {
    value: {
      path: decodedPath.value,
      target: decodedTarget.value,
      format: decodedFormat.value as NativeArtifact["format"],
    },
  };
}

function nativeDecodeMachineProfileBridge(
  value: unknown,
  path: string,
): NativeDecodeResult<NativeTargetReport["machineProfileBridge"]> {
  const record = nativeDecodeRecord(
    value,
    ["enabled", "capabilityProfilePath", "selectedAbi"],
    ["enabled"],
    path,
  );
  if ("diagnostic" in record) return record;

  const { enabled, capabilityProfilePath, selectedAbi } = record.value;
  const decodedEnabled = nativeDecodeBoolean(enabled, `${path}.enabled`);
  if ("diagnostic" in decodedEnabled) return decodedEnabled;
  const decodedProfilePath = capabilityProfilePath === undefined
    ? { value: undefined }
    : nativeDecodeString(capabilityProfilePath, `${path}.capabilityProfilePath`);
  if ("diagnostic" in decodedProfilePath) return decodedProfilePath;
  const decodedSelectedAbi = selectedAbi === undefined
    ? { value: undefined }
    : nativeDecodeString(selectedAbi, `${path}.selectedAbi`);
  if ("diagnostic" in decodedSelectedAbi) return decodedSelectedAbi;
  if (decodedSelectedAbi.value !== undefined &&
      !NATIVE_ABIS.includes(decodedSelectedAbi.value as NativeAbi)) {
    return nativeDecodeFailure(`${path}.selectedAbi`, "ABI is outside the closed vocabulary");
  }

  const cloneable = nativeEnsureStructuredCloneable(value, path);
  if ("diagnostic" in cloneable) return cloneable;
  return {
    value: {
      enabled: decodedEnabled.value,
      ...(decodedProfilePath.value === undefined
        ? {}
        : { capabilityProfilePath: decodedProfilePath.value }),
      ...(decodedSelectedAbi.value === undefined
        ? {}
        : { selectedAbi: decodedSelectedAbi.value as NativeAbi }),
    },
  };
}

// A native target must name its triple/os/architecture and, when declared, use a
// known ABI and a known execution mode.
export function validateNativeTarget(
  target: unknown,
  path = "target",
): readonly NativeDiagnostic[] {
  const decoded = nativeDecodeTarget(target, path);
  if ("diagnostic" in decoded) return freezeNativeDiagnostics([decoded.diagnostic]);
  return freezeNativeDiagnostics(validateDecodedNativeTarget(decoded.value, path));
}

function validateDecodedNativeTarget(
  target: NativeTarget,
  path: string,
): readonly NativeDiagnostic[] {
  const diagnostics: NativeDiagnostic[] = [];
  const { triple, os, architecture, abi, executionMode } = target;

  for (const [field, value] of [["triple", triple], ["os", os], ["architecture", architecture]] as const) {
    if (value.trim().length === 0) {
      diagnostics.push(nativeDiagnostic(
        "Galerina_NATIVE_TARGET_FIELD_REQUIRED",
        "error",
        `Native target requires ${field}.`,
        `${path}.${field}`,
      ));
    }
  }

  if (abi !== undefined && !NATIVE_ABIS.includes(abi)) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_TARGET_ABI_INVALID",
      "error",
      `Native target ABI must be one of: ${NATIVE_ABIS.join(", ")}.`,
      `${path}.abi`,
    ));
  }

  if (!NATIVE_EXECUTION_MODES.includes(executionMode)) {
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
  artifact: unknown,
  path = "artifact",
): readonly NativeDiagnostic[] {
  const decoded = nativeDecodeArtifact(artifact, path);
  if ("diagnostic" in decoded) return freezeNativeDiagnostics([decoded.diagnostic]);
  return freezeNativeDiagnostics(validateDecodedNativeArtifact(decoded.value, path));
}

function validateDecodedNativeArtifact(
  artifact: NativeArtifact,
  path: string,
): readonly NativeDiagnostic[] {
  const diagnostics: NativeDiagnostic[] = [];
  const { path: artifactPath, target, format } = artifact;

  if (artifactPath.trim().length === 0) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_ARTIFACT_PATH_REQUIRED",
      "error",
      "Native artifact requires a path.",
      `${path}.path`,
    ));
  }

  if (!NATIVE_FORMATS.includes(format)) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_ARTIFACT_FORMAT_INVALID",
      "error",
      `Native artifact format must be one of: ${NATIVE_FORMATS.join(", ")}.`,
      `${path}.format`,
    ));
  }

  diagnostics.push(...validateDecodedNativeTarget(target, `${path}.target`));
  return diagnostics;
}

// Build a native target report, validating every artifact and surfacing a warning
// when the machine-profile bridge is enabled but names no capability profile.
export function createNativeTargetReport(input: unknown): {
  readonly report: NativeTargetReport;
  readonly diagnostics: readonly NativeDiagnostic[];
} {
  const diagnostics: NativeDiagnostic[] = [];
  const root = nativeDecodeRecord(
    input,
    ["artifacts", "machineProfileBridge"],
    ["artifacts", "machineProfileBridge"],
    "input",
  );
  if ("diagnostic" in root) {
    return {
      report: nativeSnapshotReport([], { enabled: false }, []),
      diagnostics: freezeNativeDiagnostics([root.diagnostic]),
    };
  }

  const { artifacts, machineProfileBridge } = root.value;
  let admittedBridge: NativeTargetReport["machineProfileBridge"] = { enabled: false };
  const decodedBridge = nativeDecodeMachineProfileBridge(machineProfileBridge, "machineProfileBridge");
  if ("diagnostic" in decodedBridge) {
    diagnostics.push(decodedBridge.diagnostic);
  } else {
    admittedBridge = decodedBridge.value;
  }

  const admittedArtifacts: NativeArtifact[] = [];
  const decodedArtifacts = nativeDecodeArray(artifacts, "artifacts");
  if ("diagnostic" in decodedArtifacts) {
    diagnostics.push(decodedArtifacts.diagnostic);
  } else {
    for (const [index, value] of decodedArtifacts.value.entries()) {
      const decodedArtifact = nativeDecodeArtifact(value, `artifacts.${index}`);
      if ("diagnostic" in decodedArtifact) {
        diagnostics.push(decodedArtifact.diagnostic);
        continue;
      }
      const artifactDiagnostics = validateDecodedNativeArtifact(decodedArtifact.value, `artifacts.${index}`);
      diagnostics.push(...artifactDiagnostics);
      if (artifactDiagnostics.every((diagnostic) => diagnostic.severity !== "error")) {
        admittedArtifacts.push(decodedArtifact.value);
      }
    }

    const cloneable = nativeEnsureStructuredCloneable(artifacts, "artifacts");
    if ("diagnostic" in cloneable) {
      admittedArtifacts.length = 0;
      diagnostics.push(cloneable.diagnostic);
    }
  }

  const warnings: string[] = [];
  if (admittedBridge.enabled &&
      (admittedBridge.capabilityProfilePath ?? "").trim().length === 0) {
    warnings.push("Machine-profile bridge is enabled but no capability profile path is set.");
  }

  if (diagnostics.length === 0) {
    const cloneableRoot = nativeEnsureStructuredCloneable(input, "input");
    if ("diagnostic" in cloneableRoot) {
      admittedArtifacts.length = 0;
      admittedBridge = { enabled: false };
      warnings.length = 0;
      diagnostics.push(cloneableRoot.diagnostic);
    }
  }

  return {
    report: nativeSnapshotReport(admittedArtifacts, admittedBridge, warnings),
    diagnostics: freezeNativeDiagnostics(diagnostics),
  };
}

function nativeSnapshotTarget(target: NativeTarget): NativeTarget {
  return Object.freeze({
    triple: target.triple,
    os: target.os,
    architecture: target.architecture,
    ...(target.abi === undefined ? {} : { abi: target.abi }),
    executionMode: target.executionMode,
  });
}

function nativeSnapshotArtifact(artifact: NativeArtifact): NativeArtifact {
  return Object.freeze({
    path: artifact.path,
    target: nativeSnapshotTarget(artifact.target),
    format: artifact.format,
  });
}

function nativeSnapshotBridge(
  bridge: NativeTargetReport["machineProfileBridge"],
): NativeTargetReport["machineProfileBridge"] {
  return Object.freeze({
    enabled: bridge.enabled,
    ...(bridge.capabilityProfilePath === undefined
      ? {}
      : { capabilityProfilePath: bridge.capabilityProfilePath }),
    ...(bridge.selectedAbi === undefined ? {} : { selectedAbi: bridge.selectedAbi }),
  });
}

function nativeSnapshotReport(
  artifacts: readonly NativeArtifact[],
  machineProfileBridge: NativeTargetReport["machineProfileBridge"],
  warnings: readonly string[],
): NativeTargetReport {
  return Object.freeze({
    artifacts: Object.freeze(artifacts.map(nativeSnapshotArtifact)),
    machineProfileBridge: nativeSnapshotBridge(machineProfileBridge),
    warnings: Object.freeze([...warnings]),
  });
}
