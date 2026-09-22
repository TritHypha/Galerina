import { createHash } from "node:crypto";
import { isProxy as isNodeProxy } from "node:util/types";

export const WASM_ARTEFACT_SCHEMA = "fungi.wasm.artefact.v1";
export const WASM_FALLBACK_SCHEMA = "fungi.wasm.fallback.v1";
export const WASM_HANDOFF_SCHEMA = "fungi.wasm.handoff.v1";

/** Owned diagnostic registry. Legacy Galerina_WASM_* names are retired. */
export const WASM_DIAGNOSTIC_REGISTRY = Object.freeze({
  "FUNGI-WASM-001": "input refused",
  "FUNGI-WASM-002": "artefact schema invalid",
  "FUNGI-WASM-003": "artefact path required",
  "FUNGI-WASM-004": "artefact path escapes",
  "FUNGI-WASM-005": "runtime invalid",
  "FUNGI-WASM-006": "digest invalid",
  "FUNGI-WASM-007": "digest mismatch",
  "FUNGI-WASM-008": "bytes required",
  "FUNGI-WASM-009": "attestation digest invalid",
  "FUNGI-WASM-010": "attestation forged",
  "FUNGI-WASM-011": "attestation profile invalid",
  "FUNGI-WASM-012": "certified signature required",
  "FUNGI-WASM-013": "limits invalid",
  "FUNGI-WASM-014": "no exports",
  "FUNGI-WASM-015": "export duplicate",
  "FUNGI-WASM-016": "import duplicate",
  "FUNGI-WASM-017": "effect forbidden",
  "FUNGI-WASM-018": "digest duplicate",
  "FUNGI-WASM-019": "fallback schema invalid",
  "FUNGI-WASM-020": "fallback requested required",
  "FUNGI-WASM-021": "fallback selected required",
  "FUNGI-WASM-022": "fallback reason required",
  "FUNGI-WASM-023": "fallback flag invalid",
  "FUNGI-WASM-024": "fallback digest invalid",
  "FUNGI-WASM-025": "fallback identity contradiction",
  "FUNGI-WASM-026": "handoff schema invalid",
  "FUNGI-WASM-027": "handoff compiler input invalid",
  "FUNGI-WASM-028": "handoff compute vocabulary invalid",
  "FUNGI-WASM-029": "handoff cannot admit artefacts",
  "FUNGI-WASM-030": "signature verification is not this package",
} as const);

export interface WasmTarget {
  readonly runtime: "browser" | "edge" | "server" | "standalone";
  readonly features: readonly string[];
}

export type WasmSectionKind = "func" | "memory" | "table" | "global";

export interface WasmSectionExport {
  readonly name: string;
  readonly kind: WasmSectionKind;
}

export interface WasmSectionImport {
  readonly module: string;
  readonly name: string;
  readonly kind: WasmSectionKind;
}

export interface WasmSandboxLimits {
  readonly memoryMinPages: number;
  readonly memoryMaxPages: number;
  readonly tableMax: number;
  readonly fuel: number;
}

export interface WasmArtefactAttestation {
  readonly sha256: string;
  readonly profile: "dev" | "certified";
  readonly signature: string;
}

export interface WasmArtefact {
  readonly schema: typeof WASM_ARTEFACT_SCHEMA;
  readonly path: string;
  readonly target: WasmTarget;
  readonly exports: readonly WasmSectionExport[];
  readonly imports: readonly WasmSectionImport[];
  readonly digest: string;
  readonly bytesHex: string;
  readonly attestation: WasmArtefactAttestation;
  readonly limits: WasmSandboxLimits;
  readonly effects: readonly string[];
}

export interface WasmRefusedArtefact {
  readonly digest: string | undefined;
  readonly path: string | undefined;
  readonly diagnostics: readonly WasmDiagnostic[];
}

export interface WasmTargetReport {
  readonly schema: typeof WASM_ARTEFACT_SCHEMA;
  readonly admitted: readonly WasmArtefact[];
  readonly refused: readonly WasmRefusedArtefact[];
  readonly warnings: readonly string[];
}

export type WasmDiagnosticSeverity = "warning" | "error";

export interface WasmDiagnostic {
  readonly code: string;
  readonly severity: WasmDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

/** Versioned fallback identity. Does not admit an artefact or replace compute selection. */
export interface WasmFallbackIdentity {
  readonly schema: typeof WASM_FALLBACK_SCHEMA;
  readonly requested: string;
  readonly selected: string;
  readonly reason: string;
  readonly fallbackUsed: boolean;
  readonly artefactDigest?: string;
}

/** Compute targets owned by galerina-core-compute; copied here to avoid a TCB dependency. */
export const COMPUTE_TARGETS = Object.freeze([
  "cpu", "cpu.generic", "low_bit_ai", "ternary_ai", "wasm", "binary", "vector",
  "gpu", "ai_accelerator", "npu", "optical_io", "photonic",
] as const);
export type ComputeTargetName = (typeof COMPUTE_TARGETS)[number];

export interface WasmCompilerInput {
  readonly projectRoot: string;
  readonly entryFiles: readonly string[];
}

export interface WasmComputeSelection {
  readonly requested: string;
  readonly selectedTarget: string;
  readonly reason: string;
  readonly fallback: boolean;
  readonly satisfied: boolean;
}

/**
 * Compiler/compute → WASM planning handoff.
 * `admission` is always `not-evaluated`: this package never admits an artefact from a plan.
 */
export interface WasmHandoff {
  readonly schema: typeof WASM_HANDOFF_SCHEMA;
  readonly compiler: WasmCompilerInput;
  readonly compute: WasmComputeSelection;
  readonly wasmRuntime?: WasmTarget["runtime"];
  readonly artefactDigest?: string;
  readonly admission: "not-evaluated";
}

const WASM_RUNTIMES: readonly WasmTarget["runtime"][] = ["browser", "edge", "server", "standalone"];
const WASM_SECTION_KINDS: readonly WasmSectionKind[] = ["func", "memory", "table", "global"];
const WASM_PROFILES: readonly WasmArtefactAttestation["profile"][] = ["dev", "certified"];
const MAX_WASM_ARRAY_ITEMS = 1024;
const MAX_WASM_STRING_LENGTH = 1024;
const MAX_WASM_BYTES = 2 * 1024 * 1024;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const HEX = /^[0-9a-f]*$/;

const FORBIDDEN_EFFECTS: Readonly<Record<WasmTarget["runtime"], readonly string[]>> = {
  browser: Object.freeze(["filesystem", "process", "shell", "native", "gpu", "database", "secret"]),
  edge: Object.freeze(["filesystem", "process", "shell", "native"]),
  server: Object.freeze([]),
  standalone: Object.freeze(["filesystem", "process", "shell", "native"]),
};

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

function wasmDecodeFailure(path: string, detail: string): WasmDecodeResult<never> {
  return {
    diagnostic: wasmDiagnostic(
      "FUNGI-WASM-001",
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

function wasmDecodeUint(value: unknown, path: string): WasmDecodeResult<number> {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    return wasmDecodeFailure(path, "expected a non-negative safe integer");
  }
  return { value };
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function decodeHexBytes(hex: string, path: string): WasmDecodeResult<Uint8Array> {
  if (hex.length % 2 !== 0 || hex.length / 2 > MAX_WASM_BYTES || !HEX.test(hex)) {
    return wasmDecodeFailure(path, "expected even lowercase hex of bounded wasm bytes");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return { value: bytes };
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

function wasmDecodeKind(value: unknown, path: string): WasmDecodeResult<WasmSectionKind> {
  const kind = wasmDecodeString(value, path);
  if (isWasmDecodeFailure(kind)) return kind;
  if (!WASM_SECTION_KINDS.includes(kind.value as WasmSectionKind)) {
    return wasmDecodeFailure(path, "section kind must be func, memory, table, or global");
  }
  return { value: kind.value as WasmSectionKind };
}

function wasmDecodeExport(value: unknown, path: string): WasmDecodeResult<WasmSectionExport> {
  const record = wasmDecodeRecord(value, ["name", "kind"], ["name", "kind"], path);
  if (isWasmDecodeFailure(record)) return record;
  const name = wasmDecodeString(record.value.name, `${path}.name`);
  if (isWasmDecodeFailure(name)) return name;
  const kind = wasmDecodeKind(record.value.kind, `${path}.kind`);
  if (isWasmDecodeFailure(kind)) return kind;
  return { value: Object.freeze({ name: name.value, kind: kind.value }) };
}

function wasmDecodeImport(value: unknown, path: string): WasmDecodeResult<WasmSectionImport> {
  const record = wasmDecodeRecord(value, ["module", "name", "kind"], ["module", "name", "kind"], path);
  if (isWasmDecodeFailure(record)) return record;
  const moduleName = wasmDecodeString(record.value.module, `${path}.module`);
  if (isWasmDecodeFailure(moduleName)) return moduleName;
  const name = wasmDecodeString(record.value.name, `${path}.name`);
  if (isWasmDecodeFailure(name)) return name;
  const kind = wasmDecodeKind(record.value.kind, `${path}.kind`);
  if (isWasmDecodeFailure(kind)) return kind;
  return { value: Object.freeze({ module: moduleName.value, name: name.value, kind: kind.value }) };
}

function wasmDecodeSectionArray<T>(
  value: unknown,
  path: string,
  decodeOne: (item: unknown, itemPath: string) => WasmDecodeResult<T>,
): WasmDecodeResult<readonly T[]> {
  const array = wasmDecodeArray(value, path);
  if (isWasmDecodeFailure(array)) return array;
  const copy: T[] = [];
  for (const [index, item] of array.value.entries()) {
    const decoded = decodeOne(item, `${path}.${index}`);
    if (isWasmDecodeFailure(decoded)) return decoded;
    copy.push(decoded.value);
  }
  return { value: Object.freeze(copy) };
}

function wasmDecodeLimits(value: unknown, path: string): WasmDecodeResult<WasmSandboxLimits> {
  const record = wasmDecodeRecord(
    value,
    ["memoryMinPages", "memoryMaxPages", "tableMax", "fuel"],
    ["memoryMinPages", "memoryMaxPages", "tableMax", "fuel"],
    path,
  );
  if (isWasmDecodeFailure(record)) return record;
  const memoryMinPages = wasmDecodeUint(record.value.memoryMinPages, `${path}.memoryMinPages`);
  if (isWasmDecodeFailure(memoryMinPages)) return memoryMinPages;
  const memoryMaxPages = wasmDecodeUint(record.value.memoryMaxPages, `${path}.memoryMaxPages`);
  if (isWasmDecodeFailure(memoryMaxPages)) return memoryMaxPages;
  const tableMax = wasmDecodeUint(record.value.tableMax, `${path}.tableMax`);
  if (isWasmDecodeFailure(tableMax)) return tableMax;
  const fuel = wasmDecodeUint(record.value.fuel, `${path}.fuel`);
  if (isWasmDecodeFailure(fuel)) return fuel;
  return {
    value: Object.freeze({
      memoryMinPages: memoryMinPages.value,
      memoryMaxPages: memoryMaxPages.value,
      tableMax: tableMax.value,
      fuel: fuel.value,
    }),
  };
}

function wasmDecodeAttestation(value: unknown, path: string): WasmDecodeResult<WasmArtefactAttestation> {
  const record = wasmDecodeRecord(value, ["sha256", "profile", "signature"], ["sha256", "profile", "signature"], path);
  if (isWasmDecodeFailure(record)) return record;
  const sha256 = wasmDecodeString(record.value.sha256, `${path}.sha256`);
  if (isWasmDecodeFailure(sha256)) return sha256;
  const profile = wasmDecodeString(record.value.profile, `${path}.profile`);
  if (isWasmDecodeFailure(profile)) return profile;
  const signature = wasmDecodeString(record.value.signature, `${path}.signature`, true);
  if (isWasmDecodeFailure(signature)) return signature;
  return {
    value: Object.freeze({
      sha256: sha256.value,
      profile: profile.value as WasmArtefactAttestation["profile"],
      signature: signature.value,
    }),
  };
}

const ARTEFACT_KEYS = [
  "schema", "path", "target", "exports", "imports", "digest", "bytesHex",
  "attestation", "limits", "effects",
] as const;

function wasmDecodeArtefact(value: unknown, path: string): WasmDecodeResult<WasmArtefact> {
  const record = wasmDecodeRecord(value, ARTEFACT_KEYS, ARTEFACT_KEYS, path);
  if (isWasmDecodeFailure(record)) return record;
  const schema = wasmDecodeString(record.value.schema, `${path}.schema`);
  if (isWasmDecodeFailure(schema)) return schema;
  const artefactPath = wasmDecodeString(record.value.path, `${path}.path`, true);
  if (isWasmDecodeFailure(artefactPath)) return artefactPath;
  const target = wasmDecodeTarget(record.value.target, `${path}.target`);
  if (isWasmDecodeFailure(target)) return target;
  const exportsList = wasmDecodeSectionArray(record.value.exports, `${path}.exports`, wasmDecodeExport);
  if (isWasmDecodeFailure(exportsList)) return exportsList;
  const importsList = wasmDecodeSectionArray(record.value.imports, `${path}.imports`, wasmDecodeImport);
  if (isWasmDecodeFailure(importsList)) return importsList;
  const digest = wasmDecodeString(record.value.digest, `${path}.digest`);
  if (isWasmDecodeFailure(digest)) return digest;
  const bytesHex = wasmDecodeString(record.value.bytesHex, `${path}.bytesHex`, true);
  if (isWasmDecodeFailure(bytesHex)) return bytesHex;
  const attestation = wasmDecodeAttestation(record.value.attestation, `${path}.attestation`);
  if (isWasmDecodeFailure(attestation)) return attestation;
  const limits = wasmDecodeLimits(record.value.limits, `${path}.limits`);
  if (isWasmDecodeFailure(limits)) return limits;
  const effects = wasmDecodeStringArray(record.value.effects, `${path}.effects`);
  if (isWasmDecodeFailure(effects)) return effects;
  return {
    value: Object.freeze({
      schema: schema.value as typeof WASM_ARTEFACT_SCHEMA,
      path: artefactPath.value,
      target: target.value,
      exports: exportsList.value,
      imports: importsList.value,
      digest: digest.value,
      bytesHex: bytesHex.value,
      attestation: attestation.value,
      limits: limits.value,
      effects: effects.value,
    }),
  };
}

function pathEscapes(artefactPath: string): boolean {
  const parts = artefactPath.replace(/\\/g, "/").split("/");
  return parts.includes("..") || artefactPath.includes("\0");
}

export function validateWasmArtefact(
  artefact: unknown,
  path = "artefact",
): readonly WasmDiagnostic[] {
  const decoded = wasmDecodeArtefact(artefact, path);
  if (isWasmDecodeFailure(decoded)) return [decoded.diagnostic];
  const item = decoded.value;
  const diagnostics: WasmDiagnostic[] = [];

  if (item.schema !== WASM_ARTEFACT_SCHEMA) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-002",
      "error",
      `Wasm artefact schema must be ${WASM_ARTEFACT_SCHEMA}.`,
      `${path}.schema`,
    ));
  }

  if (item.path.trim().length === 0) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-003",
      "error",
      "Wasm artefact requires a path.",
      `${path}.path`,
    ));
  } else if (pathEscapes(item.path)) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-004",
      "error",
      "Wasm artefact path must stay inside the artefact root.",
      `${path}.path`,
    ));
  }

  if (!WASM_RUNTIMES.includes(item.target.runtime)) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-005",
      "error",
      `Wasm target runtime must be one of: ${WASM_RUNTIMES.join(", ")}.`,
      `${path}.target.runtime`,
    ));
  }

  if (!SHA256_HEX.test(item.digest)) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-006",
      "error",
      "Wasm artefact digest must be 64 lowercase hex characters.",
      `${path}.digest`,
    ));
  }

  const bytes = decodeHexBytes(item.bytesHex, `${path}.bytesHex`);
  if (isWasmDecodeFailure(bytes)) {
    diagnostics.push(bytes.diagnostic);
  } else if (item.bytesHex.length === 0) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-008",
      "error",
      "Wasm artefact requires exact module bytes.",
      `${path}.bytesHex`,
    ));
  } else {
    const computed = sha256Hex(bytes.value);
    if (SHA256_HEX.test(item.digest) && computed !== item.digest) {
      diagnostics.push(wasmDiagnostic(
        "FUNGI-WASM-007",
        "error",
        "Wasm artefact digest does not match the bound module bytes.",
        `${path}.digest`,
      ));
    }
  }

  if (!SHA256_HEX.test(item.attestation.sha256)) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-009",
      "error",
      "Wasm attestation sha256 must be 64 lowercase hex characters.",
      `${path}.attestation.sha256`,
    ));
  } else if (item.attestation.sha256 !== item.digest) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-010",
      "error",
      "Wasm attestation sha256 does not match the artefact digest.",
      `${path}.attestation.sha256`,
    ));
  }

  if (!WASM_PROFILES.includes(item.attestation.profile)) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-011",
      "error",
      "Wasm attestation profile must be dev or certified.",
      `${path}.attestation.profile`,
    ));
  }

  if (item.attestation.profile === "certified" && item.attestation.signature.trim().length === 0) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-012",
      "error",
      "Certified wasm artefacts require a signature. Verification remains with the runtime TCB.",
      `${path}.attestation.signature`,
    ));
  }

  if (item.limits.memoryMaxPages < item.limits.memoryMinPages) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-013",
      "error",
      "Wasm memoryMaxPages must be at least memoryMinPages.",
      `${path}.limits.memoryMaxPages`,
    ));
  }
  if (item.limits.fuel === 0) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-013",
      "error",
      "Wasm fuel must be a positive safe integer.",
      `${path}.limits.fuel`,
    ));
  }

  const exportNames = new Set<string>();
  for (const [index, itemExport] of item.exports.entries()) {
    const key = `${itemExport.kind}:${itemExport.name}`;
    if (exportNames.has(key)) {
      diagnostics.push(wasmDiagnostic(
        "FUNGI-WASM-015",
        "error",
        `Duplicate wasm export '${itemExport.name}'.`,
        `${path}.exports.${index}`,
      ));
    }
    exportNames.add(key);
  }

  const importNames = new Set<string>();
  for (const [index, itemImport] of item.imports.entries()) {
    const key = `${itemImport.module}:${itemImport.kind}:${itemImport.name}`;
    if (importNames.has(key)) {
      diagnostics.push(wasmDiagnostic(
        "FUNGI-WASM-016",
        "error",
        `Duplicate wasm import '${itemImport.module}.${itemImport.name}'.`,
        `${path}.imports.${index}`,
      ));
    }
    importNames.add(key);
  }

  const forbidden = FORBIDDEN_EFFECTS[item.target.runtime] ?? [];
  for (const [index, effect] of item.effects.entries()) {
    if (forbidden.includes(effect)) {
      diagnostics.push(wasmDiagnostic(
        "FUNGI-WASM-017",
        "error",
        `Effect '${effect}' is forbidden on runtime '${item.target.runtime}'.`,
        `${path}.effects.${index}`,
      ));
    }
  }

  if (item.exports.length === 0) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-014",
      "warning",
      "Wasm artefact declares no exports; nothing can be invoked from it.",
      `${path}.exports`,
    ));
  }

  return diagnostics;
}

function emptyReport(diagnostics: readonly WasmDiagnostic[]): {
  readonly report: WasmTargetReport;
  readonly diagnostics: readonly WasmDiagnostic[];
} {
  return {
    report: Object.freeze({
      schema: WASM_ARTEFACT_SCHEMA,
      admitted: Object.freeze([]),
      refused: Object.freeze([{ digest: undefined, path: undefined, diagnostics }]),
      warnings: Object.freeze([]),
    }),
    diagnostics: Object.freeze(diagnostics),
  };
}

export function createWasmTargetReport(input: unknown): {
  readonly report: WasmTargetReport;
  readonly diagnostics: readonly WasmDiagnostic[];
} {
  const record = wasmDecodeRecord(input, ["artefacts"], ["artefacts"], "input");
  if (isWasmDecodeFailure(record)) {
    return emptyReport([record.diagnostic]);
  }
  const array = wasmDecodeArray(record.value.artefacts, "artefacts");
  if (isWasmDecodeFailure(array)) {
    return emptyReport([array.diagnostic]);
  }

  const diagnostics: WasmDiagnostic[] = [];
  const warnings: string[] = [];
  const admitted: WasmArtefact[] = [];
  const refused: WasmRefusedArtefact[] = [];
  const seenDigests = new Set<string>();

  for (const [index, raw] of array.value.entries()) {
    const decoded = wasmDecodeArtefact(raw, `artefacts.${index}`);
    if (isWasmDecodeFailure(decoded)) {
      diagnostics.push(decoded.diagnostic);
      refused.push(Object.freeze({ digest: undefined, path: undefined, diagnostics: Object.freeze([decoded.diagnostic]) }));
      continue;
    }
    const itemDiagnostics = validateWasmArtefact(decoded.value, `artefacts.${index}`);
    diagnostics.push(...itemDiagnostics);
    const errors = itemDiagnostics.filter((diagnostic) => diagnostic.severity === "error");
    for (const diagnostic of itemDiagnostics) {
      if (diagnostic.severity === "warning") warnings.push(diagnostic.message);
    }
    if (errors.length > 0) {
      refused.push(Object.freeze({
        digest: decoded.value.digest,
        path: decoded.value.path,
        diagnostics: Object.freeze(itemDiagnostics),
      }));
      continue;
    }
    if (seenDigests.has(decoded.value.digest)) {
      const duplicate = wasmDiagnostic(
        "FUNGI-WASM-018",
        "error",
        "Duplicate wasm artefact digest in the report.",
        `artefacts.${index}.digest`,
      );
      diagnostics.push(duplicate);
      refused.push(Object.freeze({
        digest: decoded.value.digest,
        path: decoded.value.path,
        diagnostics: Object.freeze([duplicate]),
      }));
      continue;
    }
    seenDigests.add(decoded.value.digest);
    admitted.push(decoded.value);
  }

  return {
    report: Object.freeze({
      schema: WASM_ARTEFACT_SCHEMA,
      admitted: Object.freeze(admitted),
      refused: Object.freeze(refused),
      warnings: Object.freeze(warnings),
    }),
    diagnostics: Object.freeze(diagnostics),
  };
}

const FALLBACK_KEYS = ["schema", "requested", "selected", "reason", "fallbackUsed", "artefactDigest"] as const;

export function validateWasmFallbackIdentity(value: unknown, path = "fallback"): readonly WasmDiagnostic[] {
  const decoded = wasmDecodeRecord(
    value,
    FALLBACK_KEYS,
    ["schema", "requested", "selected", "reason", "fallbackUsed"],
    path,
  );
  if (isWasmDecodeFailure(decoded)) return Object.freeze([decoded.diagnostic]);
  const rec = decoded.value;
  const diagnostics: WasmDiagnostic[] = [];
  if (rec.schema !== WASM_FALLBACK_SCHEMA) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-019",
      "error",
      `Fallback identity schema must be ${WASM_FALLBACK_SCHEMA}.`,
      `${path}.schema`,
    ));
  }
  if (typeof rec.requested !== "string" || rec.requested.trim() === "") {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-020",
      "error",
      "Fallback identity requires a requested target.",
      `${path}.requested`,
    ));
  }
  if (typeof rec.selected !== "string" || rec.selected.trim() === "") {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-021",
      "error",
      "Fallback identity requires a selected target.",
      `${path}.selected`,
    ));
  }
  if (typeof rec.reason !== "string" || rec.reason.trim() === "") {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-022",
      "error",
      "Fallback identity requires a non-empty reason; silent fallback is refused.",
      `${path}.reason`,
    ));
  }
  if (typeof rec.fallbackUsed !== "boolean") {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-023",
      "error",
      "Fallback identity fallbackUsed must be a boolean.",
      `${path}.fallbackUsed`,
    ));
  }
  if (rec.artefactDigest !== undefined) {
    if (typeof rec.artefactDigest !== "string" || !SHA256_HEX.test(rec.artefactDigest)) {
      diagnostics.push(wasmDiagnostic(
        "FUNGI-WASM-024",
        "error",
        "Fallback artefactDigest must be a sha256 hex digest when present.",
        `${path}.artefactDigest`,
      ));
    }
  }
  if (rec.fallbackUsed === true && rec.requested === rec.selected) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-025",
      "error",
      "fallbackUsed cannot be true when requested and selected targets are identical.",
      `${path}.fallbackUsed`,
    ));
  }
  return Object.freeze(diagnostics);
}

export function bindComputeSelectionToWasmFallback(
  selection: {
    readonly requested: string;
    readonly selectedTarget: string;
    readonly reason: string;
    readonly fallback: boolean;
  },
  artefactDigest?: string,
): readonly WasmDiagnostic[] {
  return validateWasmFallbackIdentity({
    schema: WASM_FALLBACK_SCHEMA,
    requested: selection.requested,
    selected: selection.selectedTarget,
    reason: selection.reason,
    fallbackUsed: selection.fallback,
    ...(artefactDigest === undefined ? {} : { artefactDigest }),
  });
}

const HANDOFF_KEYS = [
  "schema", "compiler", "compute", "wasmRuntime", "artefactDigest", "admission",
] as const;

export function validateWasmHandoff(value: unknown, path = "handoff"): readonly WasmDiagnostic[] {
  const decoded = wasmDecodeRecord(
    value,
    HANDOFF_KEYS,
    ["schema", "compiler", "compute", "admission"],
    path,
  );
  if (isWasmDecodeFailure(decoded)) return Object.freeze([decoded.diagnostic]);
  const rec = decoded.value;
  const diagnostics: WasmDiagnostic[] = [];

  if (rec.schema !== WASM_HANDOFF_SCHEMA) {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-026",
      "error",
      `Handoff schema must be ${WASM_HANDOFF_SCHEMA}.`,
      `${path}.schema`,
    ));
  }

  if (rec.admission !== "not-evaluated") {
    diagnostics.push(wasmDiagnostic(
      "FUNGI-WASM-029",
      "error",
      "Handoff admission must be not-evaluated. This package does not admit artefacts from a plan.",
      `${path}.admission`,
    ));
  }

  const compiler = wasmDecodeRecord(
    rec.compiler,
    ["projectRoot", "entryFiles"],
    ["projectRoot", "entryFiles"],
    `${path}.compiler`,
  );
  if (isWasmDecodeFailure(compiler)) {
    diagnostics.push(compiler.diagnostic);
  } else {
    const root = wasmDecodeString(compiler.value.projectRoot, `${path}.compiler.projectRoot`);
    if (isWasmDecodeFailure(root) || root.value.trim() === "" || pathEscapes(root.value)) {
      diagnostics.push(wasmDiagnostic(
        "FUNGI-WASM-027",
        "error",
        "Handoff compiler.projectRoot must be a non-empty non-escaping path.",
        `${path}.compiler.projectRoot`,
      ));
    }
    const files = wasmDecodeStringArray(compiler.value.entryFiles, `${path}.compiler.entryFiles`);
    if (isWasmDecodeFailure(files) || files.value.length === 0 || files.value.some((file) => pathEscapes(file) || file.trim() === "")) {
      diagnostics.push(wasmDiagnostic(
        "FUNGI-WASM-027",
        "error",
        "Handoff compiler.entryFiles must be a non-empty list of non-escaping paths.",
        `${path}.compiler.entryFiles`,
      ));
    }
  }

  const compute = wasmDecodeRecord(
    rec.compute,
    ["requested", "selectedTarget", "reason", "fallback", "satisfied"],
    ["requested", "selectedTarget", "reason", "fallback", "satisfied"],
    `${path}.compute`,
  );
  if (isWasmDecodeFailure(compute)) {
    diagnostics.push(compute.diagnostic);
  } else {
    const selected = typeof compute.value.selectedTarget === "string" ? compute.value.selectedTarget : "";
    const requested = typeof compute.value.requested === "string" ? compute.value.requested : "";
    const reason = typeof compute.value.reason === "string" ? compute.value.reason : "";
    if (!COMPUTE_TARGETS.includes(selected as ComputeTargetName)) {
      diagnostics.push(wasmDiagnostic(
        "FUNGI-WASM-028",
        "error",
        `Handoff compute.selectedTarget must be a galerina-core-compute target: ${COMPUTE_TARGETS.join(", ")}.`,
        `${path}.compute.selectedTarget`,
      ));
    }
    if (requested !== "compute auto" && requested !== "" && !COMPUTE_TARGETS.includes(requested as ComputeTargetName)) {
      diagnostics.push(wasmDiagnostic(
        "FUNGI-WASM-028",
        "error",
        "Handoff compute.requested must be a compute target or 'compute auto'.",
        `${path}.compute.requested`,
      ));
    }
    if (reason.trim() === "") {
      diagnostics.push(wasmDiagnostic(
        "FUNGI-WASM-022",
        "error",
        "Handoff compute.reason must be non-empty; silent fallback is refused.",
        `${path}.compute.reason`,
      ));
    }
    if (typeof compute.value.fallback !== "boolean" || typeof compute.value.satisfied !== "boolean") {
      diagnostics.push(wasmDiagnostic(
        "FUNGI-WASM-023",
        "error",
        "Handoff compute.fallback and satisfied must be booleans.",
        `${path}.compute`,
      ));
    }

    if (rec.wasmRuntime !== undefined) {
      const runtime = wasmDecodeString(rec.wasmRuntime, `${path}.wasmRuntime`);
      if (isWasmDecodeFailure(runtime) || !WASM_RUNTIMES.includes(runtime.value as WasmTarget["runtime"])) {
        diagnostics.push(wasmDiagnostic(
          "FUNGI-WASM-005",
          "error",
          `Handoff wasmRuntime must be one of: ${WASM_RUNTIMES.join(", ")}.`,
          `${path}.wasmRuntime`,
        ));
      } else if (selected !== "wasm") {
        diagnostics.push(wasmDiagnostic(
          "FUNGI-WASM-028",
          "error",
          "Handoff wasmRuntime is only valid when compute.selectedTarget is wasm.",
          `${path}.wasmRuntime`,
        ));
      }
    } else if (selected === "wasm") {
      diagnostics.push(wasmDiagnostic(
        "FUNGI-WASM-028",
        "error",
        "Handoff requires wasmRuntime when compute selects wasm.",
        `${path}.wasmRuntime`,
      ));
    }
  }

  if (rec.artefactDigest !== undefined) {
    if (typeof rec.artefactDigest !== "string" || !SHA256_HEX.test(rec.artefactDigest)) {
      diagnostics.push(wasmDiagnostic(
        "FUNGI-WASM-024",
        "error",
        "Handoff artefactDigest must be a sha256 hex digest when present.",
        `${path}.artefactDigest`,
      ));
    }
  }

  return Object.freeze(diagnostics);
}

/**
 * This package never verifies Ed25519 (or any) signatures.
 * A non-empty signature satisfies FUNGI-WASM-012 presence; verification is the runtime TCB.
 */
export function verifyWasmAttestationSignature(_signature: string, _digest: string): readonly WasmDiagnostic[] {
  return Object.freeze([
    wasmDiagnostic(
      "FUNGI-WASM-030",
      "error",
      "Ed25519 attestation verification is not this package. The runtime TCB owns signature checks.",
      "attestation.signature",
    ),
  ]);
}
