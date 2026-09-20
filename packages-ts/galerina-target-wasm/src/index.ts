import { isProxy as isNodeProxy } from "node:util/types";

export interface WasmTarget {
  readonly runtime: "browser" | "edge" | "server" | "standalone";
  readonly features: readonly string[];
}

export interface WasmArtefact {
  readonly path: string;
  readonly target: WasmTarget;
  readonly exports: readonly string[];
  readonly imports: readonly string[];
}

export interface WasmTargetReport {
  readonly artefacts: readonly WasmArtefact[];
  readonly warnings: readonly string[];
}

// ── runtime contract helpers ──────────────────────────────────────────────────
// The interfaces above are the type contract; the helpers below enforce it at
// runtime for artefacts that arrive as untrusted parsed JSON. Fail-closed
// validators returning typed diagnostics, mirroring the green sibling target
// packages (target-cpu, target-ai-accelerator).

export type WasmDiagnosticSeverity = "warning" | "error";

export interface WasmDiagnostic {
  readonly code: string;
  readonly severity: WasmDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

const WASM_RUNTIMES: readonly WasmTarget["runtime"][] = ["browser", "edge", "server", "standalone"];

function wasmDiagnostic(
  code: string,
  severity: WasmDiagnosticSeverity,
  message: string,
  path?: string,
): WasmDiagnostic {
  return Object.freeze({ code, severity, message, ...(path === undefined ? {} : { path }) });
}

type WasmDecodeResult<T> =
  | { readonly value: T }
  | { readonly diagnostic: WasmDiagnostic };

const MAX_WASM_ARRAY_ITEMS = 1024;
const MAX_WASM_STRING_LENGTH = 1024;

function wasmDecodeFailure(path: string, detail: string): WasmDecodeResult<never> {
  return {
    diagnostic: wasmDiagnostic(
      "Galerina_WASM_INPUT_REFUSED",
      "error",
      `Wasm input refused: ${detail}.`,
      path,
    ),
  };
}

function isWasmDecodeFailure<T>(result: WasmDecodeResult<T>): result is { readonly diagnostic: WasmDiagnostic } {
  return "diagnostic" in result;
}

function wasmDecodeRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  path: string,
): WasmDecodeResult<Record<string, unknown>> {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value) || isNodeProxy(value)) {
      return wasmDecodeFailure(path, "expected a non-proxy plain record");
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return wasmDecodeFailure(path, "inherited or non-plain records are refused");
    }
    const keys = Reflect.ownKeys(value);
    const stringKeys = keys.filter((key): key is string => typeof key === "string");
    if (
      stringKeys.length !== keys.length
      || stringKeys.some((key) => !allowedKeys.includes(key))
      || requiredKeys.some((key) => !stringKeys.includes(key))
    ) {
      return wasmDecodeFailure(path, "surplus, symbol, or missing fields are refused");
    }
    const copy: Record<string, unknown> = {};
    for (const key of stringKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return wasmDecodeFailure(`${path}.${key}`, "accessor or non-enumerable fields are refused");
      }
      copy[key] = descriptor.value;
    }
    return { value: copy };
  } catch {
    return wasmDecodeFailure(path, "exceptional or proxy-like records are refused");
  }
}

function wasmDecodeArray(value: unknown, path: string): WasmDecodeResult<readonly unknown[]> {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || isNodeProxy(value)) {
      return wasmDecodeFailure(path, "expected a plain non-proxy array");
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (
      lengthDescriptor === undefined
      || !("value" in lengthDescriptor)
      || typeof lengthDescriptor.value !== "number"
      || !Number.isSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value > MAX_WASM_ARRAY_ITEMS
    ) {
      return wasmDecodeFailure(path, "array length is invalid or unbounded");
    }
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || !keys.includes("length")) {
      return wasmDecodeFailure(path, "sparse or surplus array fields are refused");
    }
    const copy: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!keys.includes(key) || descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
        return wasmDecodeFailure(`${path}.${index}`, "array elements must be own enumerable data");
      }
      copy.push(descriptor.value);
    }
    return { value: Object.freeze(copy) };
  } catch {
    return wasmDecodeFailure(path, "exceptional or proxy-like arrays are refused");
  }
}

function wasmDecodeString(value: unknown, path: string, allowEmpty = false): WasmDecodeResult<string> {
  if (typeof value !== "string" || value.length > MAX_WASM_STRING_LENGTH || (!allowEmpty && value.length === 0)) {
    return wasmDecodeFailure(path, "expected a bounded string");
  }
  if ([...value].some((character) => character.charCodeAt(0) < 0x20 || character === "\u007f")) {
    return wasmDecodeFailure(path, "control characters are refused");
  }
  return { value };
}

function wasmDecodeStringArray(value: unknown, path: string): WasmDecodeResult<readonly string[]> {
  const array = wasmDecodeArray(value, path);
  if (isWasmDecodeFailure(array)) return array;
  const copy: string[] = [];
  for (const [index, item] of array.value.entries()) {
    const decoded = wasmDecodeString(item, `${path}.${index}`);
    if (isWasmDecodeFailure(decoded)) return decoded;
    copy.push(decoded.value);
  }
  return { value: Object.freeze(copy) };
}

function wasmDecodeTarget(value: unknown, path: string): WasmDecodeResult<WasmTarget> {
  const record = wasmDecodeRecord(value, ["runtime", "features"], ["runtime", "features"], path);
  if (isWasmDecodeFailure(record)) return record;
  const runtime = wasmDecodeString(record.value.runtime, `${path}.runtime`);
  if (isWasmDecodeFailure(runtime)) return runtime;
  const features = wasmDecodeStringArray(record.value.features, `${path}.features`);
  if (isWasmDecodeFailure(features)) return features;
  return { value: Object.freeze({ runtime: runtime.value as WasmTarget["runtime"], features: features.value }) };
}

function wasmDecodeArtefact(value: unknown, path: string): WasmDecodeResult<WasmArtefact> {
  const record = wasmDecodeRecord(value, ["path", "target", "exports", "imports"], ["path", "target", "exports", "imports"], path);
  if (isWasmDecodeFailure(record)) return record;
  const artefactPath = wasmDecodeString(record.value.path, `${path}.path`, true);
  if (isWasmDecodeFailure(artefactPath)) return artefactPath;
  const target = wasmDecodeTarget(record.value.target, `${path}.target`);
  if (isWasmDecodeFailure(target)) return target;
  const exportsList = wasmDecodeStringArray(record.value.exports, `${path}.exports`);
  if (isWasmDecodeFailure(exportsList)) return exportsList;
  const importsList = wasmDecodeStringArray(record.value.imports, `${path}.imports`);
  if (isWasmDecodeFailure(importsList)) return importsList;
  return { value: Object.freeze({ path: artefactPath.value, target: target.value, exports: exportsList.value, imports: importsList.value }) };
}

function wasmDecodeArtefacts(value: unknown, path: string): WasmDecodeResult<readonly WasmArtefact[]> {
  const array = wasmDecodeArray(value, path);
  if (isWasmDecodeFailure(array)) return array;
  const artefacts: WasmArtefact[] = [];
  for (const [index, artefact] of array.value.entries()) {
    const decoded = wasmDecodeArtefact(artefact, `${path}.${index}`);
    if (isWasmDecodeFailure(decoded)) return decoded;
    artefacts.push(decoded.value);
  }
  return { value: Object.freeze(artefacts) };
}

// An artefact must name a path, target a known runtime, and export something — a
// module with no exports can never be called (warning; it may be import-only glue,
// so not a hard error).
export function validateWasmArtefact(
  artefact: unknown,
  path = "artefact",
): readonly WasmDiagnostic[] {
  const decoded = wasmDecodeArtefact(artefact, path);
  if (isWasmDecodeFailure(decoded)) return [decoded.diagnostic];
  const safeArtefact = decoded.value;
  const diagnostics: WasmDiagnostic[] = [];

  if (safeArtefact.path.trim().length === 0) {
    diagnostics.push(wasmDiagnostic(
      "Galerina_WASM_ARTEFACT_PATH_REQUIRED",
      "error",
      "Wasm artefact requires a path.",
      `${path}.path`,
    ));
  }

  if (!WASM_RUNTIMES.includes(safeArtefact.target.runtime)) {
    diagnostics.push(wasmDiagnostic(
      "Galerina_WASM_RUNTIME_INVALID",
      "error",
      `Wasm target runtime must be one of: ${WASM_RUNTIMES.join(", ")}.`,
      `${path}.target.runtime`,
    ));
  }

  if (safeArtefact.exports.length === 0) {
    diagnostics.push(wasmDiagnostic(
      "Galerina_WASM_ARTEFACT_NO_EXPORTS",
      "warning",
      "Wasm artefact declares no exports; nothing can be invoked from it.",
      `${path}.exports`,
    ));
  }

  return diagnostics;
}

// Build a wasm target report, validating every artefact and lifting warnings.
export function createWasmTargetReport(input: unknown): { readonly report: WasmTargetReport; readonly diagnostics: readonly WasmDiagnostic[] } {
  const record = wasmDecodeRecord(input, ["artefacts"], ["artefacts"], "input");
  if (isWasmDecodeFailure(record)) {
    return {
      report: Object.freeze({ artefacts: Object.freeze([]), warnings: Object.freeze([record.diagnostic.message]) }),
      diagnostics: Object.freeze([record.diagnostic]),
    };
  }
  const artefacts = wasmDecodeArtefacts(record.value.artefacts, "artefacts");
  if (isWasmDecodeFailure(artefacts)) {
    return {
      report: Object.freeze({ artefacts: Object.freeze([]), warnings: Object.freeze([artefacts.diagnostic.message]) }),
      diagnostics: Object.freeze([artefacts.diagnostic]),
    };
  }
  const diagnostics: WasmDiagnostic[] = [];
  const warnings: string[] = [];

  artefacts.value.forEach((artefact, index) => {
    for (const d of validateWasmArtefact(artefact, `artefacts.${index}`)) {
      diagnostics.push(d);
      if (d.severity === "warning") warnings.push(d.message);
    }
  });

  return {
    report: Object.freeze({ artefacts: artefacts.value, warnings: Object.freeze(warnings) }),
    diagnostics: Object.freeze(diagnostics),
  };
}
