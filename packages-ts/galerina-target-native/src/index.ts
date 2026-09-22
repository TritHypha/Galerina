import { createHash } from "node:crypto";

export const NATIVE_ARTIFACT_SCHEMA = "fungi.native.artifact.v1";

export type NativeAbi = "c" | "wasm" | "system" | "plugin";

export interface NativeTarget {
  readonly triple: string;
  readonly os: string;
  readonly architecture: string;
  readonly abi?: NativeAbi;
  readonly executionMode: "future-native-executable" | "native-abi-boundary";
}

export interface NativeVokBinding {
  readonly receiptId: string;
  readonly subjectDigest: string;
  readonly state: "current";
}

export interface NativeArtifact {
  readonly schema: typeof NATIVE_ARTIFACT_SCHEMA;
  readonly path: string;
  readonly target: NativeTarget;
  readonly format: "executable" | "library" | "object";
  readonly digest: string;
  readonly bytesHex: string;
  readonly vok: NativeVokBinding;
}

export interface NativeTargetReport {
  readonly schema: typeof NATIVE_ARTIFACT_SCHEMA;
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
const MAX_NATIVE_BYTES = 2 * 1024 * 1024;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const HEX = /^[0-9a-f]*$/;

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

function nativeDecodeVok(value: unknown, path: string): NativeDecodeResult<NativeVokBinding> {
  const record = nativeDecodeRecord(
    value,
    ["receiptId", "subjectDigest", "state"],
    ["receiptId", "subjectDigest", "state"],
    path,
  );
  if ("diagnostic" in record) return record;
  const receiptId = nativeDecodeString(record.value.receiptId, `${path}.receiptId`);
  if ("diagnostic" in receiptId) return receiptId;
  const subjectDigest = nativeDecodeString(record.value.subjectDigest, `${path}.subjectDigest`);
  if ("diagnostic" in subjectDigest) return subjectDigest;
  const state = nativeDecodeString(record.value.state, `${path}.state`);
  if ("diagnostic" in state) return state;
  if (state.value !== "current") {
    return nativeDecodeFailure(`${path}.state`, "VOK state must be current; stale or unknown is not admitting");
  }
  return {
    value: {
      receiptId: receiptId.value,
      subjectDigest: subjectDigest.value,
      state: "current",
    },
  };
}

function nativeDecodeArtifact(value: unknown, path: string): NativeDecodeResult<NativeArtifact> {
  const record = nativeDecodeRecord(
    value,
    ["schema", "path", "target", "format", "digest", "bytesHex", "vok"],
    ["schema", "path", "target", "format", "digest", "bytesHex", "vok"],
    path,
  );
  if ("diagnostic" in record) return record;

  const schema = nativeDecodeString(record.value.schema, `${path}.schema`);
  if ("diagnostic" in schema) return schema;
  const decodedPath = nativeDecodeString(record.value.path, `${path}.path`);
  if ("diagnostic" in decodedPath) return decodedPath;
  const decodedFormat = nativeDecodeString(record.value.format, `${path}.format`);
  if ("diagnostic" in decodedFormat) return decodedFormat;
  const decodedTarget = nativeDecodeTarget(record.value.target, `${path}.target`);
  if ("diagnostic" in decodedTarget) return decodedTarget;
  const digest = nativeDecodeString(record.value.digest, `${path}.digest`);
  if ("diagnostic" in digest) return digest;
  const bytesHex = nativeDecodeString(record.value.bytesHex, `${path}.bytesHex`);
  if ("diagnostic" in bytesHex) return bytesHex;
  const vok = nativeDecodeVok(record.value.vok, `${path}.vok`);
  if ("diagnostic" in vok) return vok;

  const cloneable = nativeEnsureStructuredCloneable(value, path);
  if ("diagnostic" in cloneable) return cloneable;
  return {
    value: {
      schema: schema.value as typeof NATIVE_ARTIFACT_SCHEMA,
      path: decodedPath.value,
      target: decodedTarget.value,
      format: decodedFormat.value as NativeArtifact["format"],
      digest: digest.value,
      bytesHex: bytesHex.value,
      vok: vok.value,
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

  const tokens = triple.split("-").filter((token) => token.length > 0);
  if (triple.trim().length > 0 && tokens.length < 3) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_TARGET_TRIPLE_INVALID",
      "error",
      "Native target triple must contain at least architecture-vendor-os tokens.",
      `${path}.triple`,
    ));
  } else if (tokens.length >= 3) {
    if (architecture.trim().length > 0 && tokens[0] !== architecture) {
      diagnostics.push(nativeDiagnostic(
        "Galerina_NATIVE_TARGET_TRIPLE_ARCHITECTURE_MISMATCH",
        "error",
        "Native target architecture must equal the first triple token.",
        `${path}.architecture`,
      ));
    }
    if (os.trim().length > 0 && !tokens.slice(1).includes(os)) {
      diagnostics.push(nativeDiagnostic(
        "Galerina_NATIVE_TARGET_TRIPLE_OS_MISMATCH",
        "error",
        "Native target os must be a hyphen-delimited token of the triple.",
        `${path}.os`,
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

function nativeLocatorEscapes(locator: string): boolean {
  const normalized = locator.replace(/\\/g, "/");
  if (locator.includes("\0") || locator.includes("\\")) return true;
  if (/^[a-zA-Z]:/.test(locator) || normalized.startsWith("/") || normalized.startsWith("//")) return true;
  const parts = normalized.split("/");
  return parts.includes("..") || parts.includes("") || parts.some((part) => part === "." );
}

function nativeSha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function nativeDecodeHexBytes(hex: string, path: string): NativeDecodeResult<Uint8Array> {
  if (hex.length % 2 !== 0 || hex.length / 2 > MAX_NATIVE_BYTES || !HEX.test(hex)) {
    return nativeDecodeFailure(path, "expected even lowercase hex of bounded artifact bytes");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return { value: bytes };
}

function validateDecodedNativeArtifact(
  artifact: NativeArtifact,
  path: string,
): readonly NativeDiagnostic[] {
  const diagnostics: NativeDiagnostic[] = [];
  const { path: artifactPath, target, format } = artifact;

  if (artifact.schema !== NATIVE_ARTIFACT_SCHEMA) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_SCHEMA_INVALID",
      "error",
      `Native artifact schema must be ${NATIVE_ARTIFACT_SCHEMA}.`,
      `${path}.schema`,
    ));
  }

  const trimmedPath = artifactPath.trim();
  if (trimmedPath.length === 0) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_ARTIFACT_PATH_REQUIRED",
      "error",
      "Native artifact requires a path.",
      `${path}.path`,
    ));
  } else if (nativeLocatorEscapes(trimmedPath)) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_ARTIFACT_PATH_ESCAPES",
      "error",
      "Native artifact path must be a relative locator without drive, UNC, or dot-segment escape.",
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

  if (!SHA256_HEX.test(artifact.digest)) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_DIGEST_INVALID",
      "error",
      "Native artifact digest must be 64 lowercase hex characters.",
      `${path}.digest`,
    ));
  }

  const bytes = nativeDecodeHexBytes(artifact.bytesHex, `${path}.bytesHex`);
  if ("diagnostic" in bytes) {
    diagnostics.push(bytes.diagnostic);
  } else if (artifact.bytesHex.length === 0) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_BYTES_REQUIRED",
      "error",
      "Native artifact requires exact bytes; path is a locator, not identity.",
      `${path}.bytesHex`,
    ));
  } else if (SHA256_HEX.test(artifact.digest) && nativeSha256Hex(bytes.value) !== artifact.digest) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_DIGEST_MISMATCH",
      "error",
      "Native artifact digest does not match the bound bytes.",
      `${path}.digest`,
    ));
  }

  if (artifact.vok.receiptId.trim().length === 0) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_VOK_RECEIPT_REQUIRED",
      "error",
      "Native artifact requires a VOK receipt identifier. Verification remains with VOK.",
      `${path}.vok.receiptId`,
    ));
  }
  if (!SHA256_HEX.test(artifact.vok.subjectDigest) || artifact.vok.subjectDigest !== artifact.digest) {
    diagnostics.push(nativeDiagnostic(
      "Galerina_NATIVE_VOK_SUBJECT_MISMATCH",
      "error",
      "VOK subject digest must equal the artifact digest.",
      `${path}.vok.subjectDigest`,
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
    const seenDigests = new Set<string>();
    for (const [index, value] of decodedArtifacts.value.entries()) {
      const decodedArtifact = nativeDecodeArtifact(value, `artifacts.${index}`);
      if ("diagnostic" in decodedArtifact) {
        diagnostics.push(decodedArtifact.diagnostic);
        continue;
      }
      const artifactDiagnostics = [...validateDecodedNativeArtifact(decodedArtifact.value, `artifacts.${index}`)];
      if (
        admittedBridge.selectedAbi !== undefined &&
        decodedArtifact.value.target.abi !== undefined &&
        admittedBridge.selectedAbi !== decodedArtifact.value.target.abi
      ) {
        artifactDiagnostics.push(nativeDiagnostic(
          "Galerina_NATIVE_ABI_MISMATCH",
          "error",
          "Machine-profile selectedAbi must match the artifact target ABI.",
          `artifacts.${index}.target.abi`,
        ));
      }
      const profilePath = admittedBridge.capabilityProfilePath?.trim() ?? "";
      if (profilePath !== "" && profilePath === decodedArtifact.value.path.trim()) {
        artifactDiagnostics.push(nativeDiagnostic(
          "Galerina_NATIVE_PROFILE_PATH_COLLIDES",
          "error",
          "Capability profile path must not be the artifact path.",
          "machineProfileBridge.capabilityProfilePath",
        ));
      }
      if (seenDigests.has(decodedArtifact.value.digest)) {
        artifactDiagnostics.push(nativeDiagnostic(
          "Galerina_NATIVE_DIGEST_DUPLICATE",
          "error",
          "Duplicate native artifact digest in the report.",
          `artifacts.${index}.digest`,
        ));
      }
      diagnostics.push(...artifactDiagnostics);
      if (artifactDiagnostics.every((diagnostic) => diagnostic.severity !== "error")) {
        seenDigests.add(decodedArtifact.value.digest);
        admittedArtifacts.push({
          ...decodedArtifact.value,
          path: decodedArtifact.value.path.trim(),
        });
      }
    }

    const cloneable = nativeEnsureStructuredCloneable(artifacts, "artifacts");
    if ("diagnostic" in cloneable) {
      admittedArtifacts.length = 0;
      diagnostics.push(cloneable.diagnostic);
    }
  }

  const warnings: string[] = [];
  if (admittedBridge.enabled) {
    const profilePath = (admittedBridge.capabilityProfilePath ?? "").trim();
    if (profilePath.length === 0) {
      diagnostics.push(nativeDiagnostic(
        "Galerina_NATIVE_PROFILE_PATH_REQUIRED",
        "error",
        "Enabled machine-profile bridge requires a capability profile path.",
        "machineProfileBridge.capabilityProfilePath",
      ));
      admittedArtifacts.length = 0;
    } else if (nativeLocatorEscapes(profilePath)) {
      diagnostics.push(nativeDiagnostic(
        "Galerina_NATIVE_PROFILE_PATH_ESCAPES",
        "error",
        "Capability profile path must be a relative locator without drive, UNC, or dot-segment escape.",
        "machineProfileBridge.capabilityProfilePath",
      ));
      admittedArtifacts.length = 0;
    }
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
    schema: artifact.schema,
    path: artifact.path,
    target: nativeSnapshotTarget(artifact.target),
    format: artifact.format,
    digest: artifact.digest,
    bytesHex: artifact.bytesHex,
    vok: Object.freeze({ ...artifact.vok }),
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
    schema: NATIVE_ARTIFACT_SCHEMA,
    artifacts: Object.freeze(artifacts.map(nativeSnapshotArtifact)),
    machineProfileBridge: nativeSnapshotBridge(machineProfileBridge),
    warnings: Object.freeze([...warnings]),
  });
}
