// galerina-target-js — JavaScript output target planning contracts.
//
// Planning contracts + fail-closed PLAN-TIME validators (mirrors the sibling target
// packages: target-cpu, target-gpu, target-wasm, target-photonic). Per the README,
// this package must NOT become a runtime/bundler/framework — it describes where
// Galerina JS output goes and which safety checks must be reported. The validators
// below enforce the two security-relevant plan rules at PLAN time:
//   • server-only import blocking for browser JS (deny-by-default module list),
//   • secret / environment access denial for browser JS.
// Honesty note: these run when a caller validates a plan — the compiler pass that
// derives plans from real emitted output is still future work (README status note).

export type JsRuntime = "browser" | "node";

/** Browser output is ESM-only; "cjs" exists solely for the OPTIONAL Node target. */
export type JsModuleFormat = "esm" | "cjs";

export type SourceMapMode = "external" | "inline" | "none";

/** W01 G3 build modes. `debug`: external map, no minification, test report allowed.
 *  `release`: map `none` by default; `external` only when written outside the shipped
 *  folder; inline maps refused. */
export type JsBuildMode = "debug" | "release";

export interface SourceMapRule {
  readonly mode: SourceMapMode;
  /** Embeds original sources in the map — never acceptable in production browser output. */
  readonly includeSourcesContent: boolean;
  /** True when this plan describes a production artifact (stricter disclosure rules). */
  readonly production: boolean;
  /** Release builds may keep an external map only when it is written OUTSIDE the
   *  shipped output folder (for private symbolication). Omitted means false. */
  readonly outsideShippedOutput?: boolean;
}

export interface JsOutputPlan {
  readonly flow: string;
  readonly runtime: JsRuntime;
  readonly moduleFormat: JsModuleFormat;
  /** Bare/module specifiers the emitted JS imports (as planned). */
  readonly imports: readonly string[];
  /** Plan declares the emitted code reads process/host environment. */
  readonly accessesEnvironment: boolean;
  /** Plan declares the emitted code touches secret material. */
  readonly accessesSecrets: boolean;
  readonly sourceMap: SourceMapRule;
  /** Optional W01 G3 build mode; when present the mode rules below are enforced. */
  readonly buildMode?: JsBuildMode;
}

export interface EsModuleMetadata {
  readonly path: string;
  readonly exports: readonly string[];
  readonly imports: readonly string[];
}

export interface FrameworkAdapterMetadata {
  readonly framework: string;
  readonly adapterVersion?: string;
  readonly mountPoint?: string;
}

export interface JsBundleCheckOutcome {
  readonly check: "server-only-imports-blocked" | "browser-secret-access-denied" | "source-map-disclosure";
  readonly passed: boolean;
  readonly detail: string;
}

export interface JsBundleReport {
  /** Undefined means the plan was refused before a runtime could be admitted. */
  readonly runtime: JsRuntime | undefined;
  readonly entry: string;
  readonly modules: readonly EsModuleMetadata[];
  readonly checks: readonly JsBundleCheckOutcome[];
  readonly adapters: readonly FrameworkAdapterMetadata[];
  readonly warnings: readonly string[];
  readonly diagnostics: readonly JsTargetDiagnostic[];
}

// ── runtime contract helpers ──────────────────────────────────────────────────

export type JsTargetDiagnosticSeverity = "warning" | "error";

export interface JsTargetDiagnostic {
  readonly code: string;
  readonly severity: JsTargetDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

const JS_RUNTIMES: readonly JsRuntime[] = ["browser", "node"];
const JS_MODULE_FORMATS: readonly JsModuleFormat[] = ["esm", "cjs"];
const SOURCE_MAP_MODES: readonly SourceMapMode[] = ["external", "inline", "none"];
const JS_BUILD_MODES: readonly JsBuildMode[] = ["debug", "release"];

/** Node-only module surface (deny-by-default for browser plans). A specifier is
 *  server-only when it carries the `node:` scheme OR matches this bare-name list —
 *  the classic builtins that have no browser meaning and typically signal a
 *  server-capability leak into a browser bundle. */
const SERVER_ONLY_MODULES: ReadonlySet<string> = new Set([
  "fs", "path", "os", "process", "child_process", "cluster", "worker_threads",
  "net", "tls", "dns", "dgram", "http", "https", "http2",
  "crypto", "stream", "buffer", "v8", "vm", "module", "readline", "repl",
  "zlib", "util", "assert", "async_hooks", "perf_hooks", "inspector",
  "timers", "console", "constants", "diagnostics_channel", "domain",
  "events", "punycode", "querystring", "string_decoder", "sys",
  "trace_events", "tty", "url", "wasi",
]);

export function isServerOnlyImport(specifier: string): boolean {
  const s = specifier.trim();
  if (s.startsWith("node:")) return true;
  const moduleName = s;
  for (const root of SERVER_ONLY_MODULES) {
    if (moduleName === root || moduleName.startsWith(`${root}/`)) return true;
  }
  return false;
}

function jsDiagnostic(
  code: string,
  severity: JsTargetDiagnosticSeverity,
  message: string,
  path?: string,
): JsTargetDiagnostic {
  return { code, severity, message, ...(path === undefined ? {} : { path }) };
}

type DecodeResult<T> =
  | { readonly value: T }
  | { readonly diagnostic: JsTargetDiagnostic };

const MAX_EXACT_ARRAY_ITEMS = 1024;

function isStructuredCloneable(value: unknown): boolean {
  try {
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

function decodeFailure(path: string, detail: string): DecodeResult<never> {
  return {
    diagnostic: jsDiagnostic(
      "FUNGI-JS-001",
      "error",
      `JS target input must be an exact own-data value: ${detail}.`,
      path,
    ),
  };
}

function decodeString(value: unknown, path: string): DecodeResult<string> {
  return typeof value === "string"
    ? { value }
    : decodeFailure(path, "expected a string");
}

function decodeBoolean(value: unknown, path: string): DecodeResult<boolean> {
  return typeof value === "boolean"
    ? { value }
    : decodeFailure(path, "expected a boolean");
}

function decodeOwnDataRecord(
  value: unknown,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  path: string,
): DecodeResult<Record<string, unknown>> {
  try {
    if (typeof value !== "object" || value === undefined || value === null) {
      return decodeFailure(path, "expected an object record");
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return decodeFailure(path, "inherited or non-plain records are refused");
    }

    const keys = Reflect.ownKeys(value);
    const stringKeys = keys.filter((key): key is string => typeof key === "string");
    if (stringKeys.length !== keys.length ||
        stringKeys.some((key) => !allowedKeys.includes(key)) ||
        requiredKeys.some((key) => !stringKeys.includes(key))) {
      return decodeFailure(path, "surplus, symbol, or missing fields are refused");
    }

    const copy: Record<string, unknown> = {};
    for (const key of stringKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        return decodeFailure(`${path}.${key}`, "accessor properties are refused");
      }
      copy[key] = descriptor.value;
    }
    return { value: copy };
  } catch {
    return decodeFailure(path, "exceptional or proxy-like records are refused");
  }
}

function decodeExactArray(
  value: unknown,
  path: string,
  maxItems: number = MAX_EXACT_ARRAY_ITEMS,
): DecodeResult<readonly unknown[]> {
  try {
    if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
      return decodeFailure(path, "expected a plain array");
    }
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (lengthDescriptor === undefined || !("value" in lengthDescriptor) ||
        typeof lengthDescriptor.value !== "number" ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        lengthDescriptor.value < 0 ||
        lengthDescriptor.value > maxItems) {
      return decodeFailure(path, "array length is invalid or unbounded");
    }
    const length = lengthDescriptor.value;
    const keys = Reflect.ownKeys(value);
    if (keys.length !== length + 1 || !keys.includes("length")) {
      return decodeFailure(path, "sparse or surplus array fields are refused");
    }
    for (const key of keys) {
      if (key === "length") continue;
      if (typeof key !== "string" || !/^\d+$/.test(key) ||
          String(Number(key)) !== key || Number(key) >= length) {
        return decodeFailure(path, "sparse or surplus array fields are refused");
      }
    }

    const copy: unknown[] = [];
    for (let index = 0; index < length; index += 1) {
      const key = String(index);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        return decodeFailure(`${path}.${index}`, "array elements must be own data");
      }
      copy.push(descriptor.value);
    }
    return { value: Object.freeze(copy) };
  } catch {
    return decodeFailure(path, "exceptional or proxy-like arrays are refused");
  }
}

function decodeStringArray(value: unknown, path: string): DecodeResult<readonly string[]> {
  const decoded = decodeExactArray(value, path);
  if ("diagnostic" in decoded) return decoded;
  const strings: string[] = [];
  for (const [index, item] of decoded.value.entries()) {
    const stringValue = decodeString(item, `${path}.${index}`);
    if ("diagnostic" in stringValue) return stringValue;
    strings.push(stringValue.value);
  }
  if (!isStructuredCloneable(value)) {
    return decodeFailure(path, "proxy-backed arrays are refused");
  }
  return { value: Object.freeze(strings) };
}

function decodeSourceMapRule(value: unknown, path: string): DecodeResult<SourceMapRule> {
  const record = decodeOwnDataRecord(
    value,
    ["mode", "includeSourcesContent", "production", "outsideShippedOutput"],
    ["mode", "includeSourcesContent", "production"],
    path,
  );
  if ("diagnostic" in record) return record;
  const mode = decodeString(record.value.mode, `${path}.mode`);
  if ("diagnostic" in mode) return mode;
  const includeSourcesContent = decodeBoolean(
    record.value.includeSourcesContent,
    `${path}.includeSourcesContent`,
  );
  if ("diagnostic" in includeSourcesContent) return includeSourcesContent;
  const production = decodeBoolean(record.value.production, `${path}.production`);
  if ("diagnostic" in production) return production;
  const outside = Object.hasOwn(record.value, "outsideShippedOutput")
    ? decodeBoolean(record.value.outsideShippedOutput, `${path}.outsideShippedOutput`)
    : { value: false };
  if ("diagnostic" in outside) return outside;
  if (!isStructuredCloneable(value)) {
    return decodeFailure(path, "proxy-backed records are refused");
  }
  return {
    value: Object.freeze({
      mode: mode.value as SourceMapMode,
      includeSourcesContent: includeSourcesContent.value,
      production: production.value,
      ...(outside.value ? { outsideShippedOutput: true } : {}),
    }),
  };
}

function decodeJsOutputPlan(value: unknown, path: string): DecodeResult<JsOutputPlan> {
  const record = decodeOwnDataRecord(
    value,
    ["flow", "runtime", "moduleFormat", "imports", "accessesEnvironment", "accessesSecrets", "sourceMap", "buildMode"],
    ["flow", "runtime", "moduleFormat", "imports", "accessesEnvironment", "accessesSecrets", "sourceMap"],
    path,
  );
  if ("diagnostic" in record) return record;
  const flow = decodeString(record.value.flow, `${path}.flow`);
  if ("diagnostic" in flow) return flow;
  const runtime = decodeString(record.value.runtime, `${path}.runtime`);
  if ("diagnostic" in runtime) return runtime;
  const moduleFormat = decodeString(record.value.moduleFormat, `${path}.moduleFormat`);
  if ("diagnostic" in moduleFormat) return moduleFormat;
  const imports = decodeStringArray(record.value.imports, `${path}.imports`);
  if ("diagnostic" in imports) return imports;
  const accessesEnvironment = decodeBoolean(
    record.value.accessesEnvironment,
    `${path}.accessesEnvironment`,
  );
  if ("diagnostic" in accessesEnvironment) return accessesEnvironment;
  const accessesSecrets = decodeBoolean(record.value.accessesSecrets, `${path}.accessesSecrets`);
  if ("diagnostic" in accessesSecrets) return accessesSecrets;
  const sourceMap = decodeSourceMapRule(record.value.sourceMap, `${path}.sourceMap`);
  if ("diagnostic" in sourceMap) return sourceMap;
  const buildMode = Object.hasOwn(record.value, "buildMode")
    ? decodeString(record.value.buildMode, `${path}.buildMode`)
    : { value: "" };
  if ("diagnostic" in buildMode) return buildMode;
  if (!isStructuredCloneable(value)) {
    return decodeFailure(path, "proxy-backed records are refused");
  }
  return {
    value: Object.freeze({
      ...(Object.hasOwn(record.value, "buildMode") ? { buildMode: buildMode.value as JsBuildMode } : {}),
      flow: flow.value,
      runtime: runtime.value as JsRuntime,
      moduleFormat: moduleFormat.value as JsModuleFormat,
      imports: imports.value,
      accessesEnvironment: accessesEnvironment.value,
      accessesSecrets: accessesSecrets.value,
      sourceMap: sourceMap.value,
    }),
  };
}

function decodeEsModuleMetadata(value: unknown, path: string): DecodeResult<EsModuleMetadata> {
  const record = decodeOwnDataRecord(value, ["path", "exports", "imports"], ["path", "exports", "imports"], path);
  if ("diagnostic" in record) return record;
  const modulePath = decodeString(record.value.path, `${path}.path`);
  if ("diagnostic" in modulePath) return modulePath;
  const exportsValue = decodeStringArray(record.value.exports, `${path}.exports`);
  if ("diagnostic" in exportsValue) return exportsValue;
  const imports = decodeStringArray(record.value.imports, `${path}.imports`);
  if ("diagnostic" in imports) return imports;
  if (!isStructuredCloneable(value)) {
    return decodeFailure(path, "proxy-backed records are refused");
  }
  return { value: Object.freeze({ path: modulePath.value, exports: exportsValue.value, imports: imports.value }) };
}

function decodeFrameworkAdapterMetadata(
  value: unknown,
  path: string,
): DecodeResult<FrameworkAdapterMetadata> {
  const record = decodeOwnDataRecord(
    value,
    ["framework", "adapterVersion", "mountPoint"],
    ["framework"],
    path,
  );
  if ("diagnostic" in record) return record;
  const framework = decodeString(record.value.framework, `${path}.framework`);
  if ("diagnostic" in framework) return framework;
  const adapterVersion = Object.hasOwn(record.value, "adapterVersion")
    ? decodeString(record.value.adapterVersion, `${path}.adapterVersion`)
    : { value: undefined };
  if ("diagnostic" in adapterVersion) return adapterVersion;
  const mountPoint = Object.hasOwn(record.value, "mountPoint")
    ? decodeString(record.value.mountPoint, `${path}.mountPoint`)
    : { value: undefined };
  if ("diagnostic" in mountPoint) return mountPoint;
  if (!isStructuredCloneable(value)) {
    return decodeFailure(path, "proxy-backed records are refused");
  }
  return {
    value: Object.freeze({
      framework: framework.value,
      ...(adapterVersion.value === undefined ? {} : { adapterVersion: adapterVersion.value }),
      ...(mountPoint.value === undefined ? {} : { mountPoint: mountPoint.value }),
    }),
  };
}

function validateDecodedJsOutputPlan(
  plan: JsOutputPlan,
  path: string,
): readonly JsTargetDiagnostic[] {
  const diagnostics: JsTargetDiagnostic[] = [];

  if (plan.flow.trim().length === 0) {
    diagnostics.push(jsDiagnostic(
      "FUNGI-JS-003",
      "error",
      "JS output plan requires a flow.",
      `${path}.flow`,
    ));
  }

  if (!JS_RUNTIMES.includes(plan.runtime)) {
    diagnostics.push(jsDiagnostic(
      "FUNGI-JS-004",
      "error",
      `JS output runtime must be one of: ${JS_RUNTIMES.join(", ")}.`,
      `${path}.runtime`,
    ));
    return diagnostics;
  }

  if (!JS_MODULE_FORMATS.includes(plan.moduleFormat)) {
    diagnostics.push(jsDiagnostic(
      "FUNGI-JS-005",
      "error",
      `JS module format must be one of: ${JS_MODULE_FORMATS.join(", ")}.`,
      `${path}.moduleFormat`,
    ));
  } else if (plan.runtime === "browser" && plan.moduleFormat !== "esm") {
    diagnostics.push(jsDiagnostic(
      "FUNGI-JS-006",
      "error",
      "Browser JS output is ES-module-only; cjs is reserved for the optional Node target.",
      `${path}.moduleFormat`,
    ));
  }

  if (plan.runtime === "browser") {
    plan.imports.forEach((spec, index) => {
      if (isServerOnlyImport(spec)) {
        diagnostics.push(jsDiagnostic(
          "FUNGI-JS-007",
          "error",
          `Browser JS plan imports server-only module "${spec}" — blocked (deny-by-default).`,
          `${path}.imports.${index}`,
        ));
      }
    });

    if (plan.accessesEnvironment) {
      diagnostics.push(jsDiagnostic(
        "FUNGI-JS-008",
        "error",
        "Browser JS output must not access the host environment.",
        `${path}.accessesEnvironment`,
      ));
    }

    if (plan.accessesSecrets) {
      diagnostics.push(jsDiagnostic(
        "FUNGI-JS-009",
        "error",
        "Browser JS output must not access secret material — a shipped bundle is public text.",
        `${path}.accessesSecrets`,
      ));
    }
  }

  if (!SOURCE_MAP_MODES.includes(plan.sourceMap.mode)) {
    diagnostics.push(jsDiagnostic(
      "FUNGI-JS-010",
      "error",
      `Source-map mode must be one of: ${SOURCE_MAP_MODES.join(", ")}.`,
      `${path}.sourceMap.mode`,
    ));
  } else if (plan.sourceMap.production && plan.runtime === "browser") {
    if (plan.sourceMap.mode === "inline") {
      // W01 G3 (A1 NB-5): raised from warning to error; owner may revisit.
      diagnostics.push(jsDiagnostic(
        "FUNGI-JS-011",
        "error",
        "Inline source maps in a production browser bundle disclose source structure.",
        `${path}.sourceMap.mode`,
      ));
    }
    if (plan.sourceMap.includeSourcesContent && plan.sourceMap.mode !== "none") {
      diagnostics.push(jsDiagnostic(
        "FUNGI-JS-012",
        "error",
        "sourcesContent embeds original sources — never acceptable in production browser output.",
        `${path}.sourceMap.includeSourcesContent`,
      ));
    }
  }

  diagnostics.push(...validateBuildModeRules(plan, path));
  return diagnostics;
}

function validateBuildModeRules(plan: JsOutputPlan, path: string): JsTargetDiagnostic[] {
  if (plan.buildMode === undefined) return [];
  const out: JsTargetDiagnostic[] = [];
  if (!JS_BUILD_MODES.includes(plan.buildMode)) {
    out.push(jsDiagnostic(
      "FUNGI-JS-018",
      "error",
      `Build mode must be one of: ${JS_BUILD_MODES.join(", ")}.`,
      `${path}.buildMode`,
    ));
    return out;
  }
  const releaseMode = plan.buildMode === "release";
  if (plan.sourceMap.production !== releaseMode) {
    out.push(jsDiagnostic(
      "FUNGI-JS-019",
      "error",
      releaseMode
        ? "Release builds are production artifacts; sourceMap.production must be true."
        : "Debug builds are never production artifacts; sourceMap.production must be false.",
      `${path}.sourceMap.production`,
    ));
  }
  if (releaseMode && plan.sourceMap.mode === "inline") {
    out.push(jsDiagnostic(
      "FUNGI-JS-020",
      "error",
      "Inline source maps are refused in release builds (any runtime).",
      `${path}.sourceMap.mode`,
    ));
  }
  if (releaseMode && plan.sourceMap.mode === "external" && plan.sourceMap.outsideShippedOutput !== true) {
    out.push(jsDiagnostic(
      "FUNGI-JS-021",
      "error",
      "Release builds may keep an external source map only outside the shipped folder (sourceMap.outsideShippedOutput: true).",
      `${path}.sourceMap.outsideShippedOutput`,
    ));
  }
  if (releaseMode && plan.sourceMap.includeSourcesContent) {
    out.push(jsDiagnostic(
      "FUNGI-JS-022",
      "error",
      "Release builds must not embed sourcesContent.",
      `${path}.sourceMap.includeSourcesContent`,
    ));
  }
  return out;
}

/** A JS output plan must name its flow, use a known runtime/format, and — fail-closed —
 *  a BROWSER plan may not import server-only modules, may not access environment or
 *  secret material, and must be ESM. Source-map disclosure rules are enforced for
 *  production artifacts. */
export function validateJsOutputPlan(
  plan: JsOutputPlan,
  path = "plan",
): readonly JsTargetDiagnostic[] {
  const decoded = decodeJsOutputPlan(plan, path);
  return "diagnostic" in decoded
    ? [decoded.diagnostic]
    : validateDecodedJsOutputPlan(decoded.value, path);
}

/** ES-module metadata must name a path; a module exporting nothing is inert (warning —
 *  it may be side-effect-only glue, so not a hard error). */
export function validateEsModuleMetadata(
  meta: EsModuleMetadata,
  path = "module",
): readonly JsTargetDiagnostic[] {
  const decoded = decodeEsModuleMetadata(meta, path);
  if ("diagnostic" in decoded) return [decoded.diagnostic];
  return validateDecodedEsModuleMetadata(decoded.value, path);
}

function validateDecodedEsModuleMetadata(
  meta: EsModuleMetadata,
  path: string,
): readonly JsTargetDiagnostic[] {
  const diagnostics: JsTargetDiagnostic[] = [];

  if (meta.path.trim().length === 0) {
    diagnostics.push(jsDiagnostic(
      "FUNGI-JS-013",
      "error",
      "ES module metadata requires a path.",
      `${path}.path`,
    ));
  }

  if (meta.exports.length === 0) {
    diagnostics.push(jsDiagnostic(
      "FUNGI-JS-014",
      "warning",
      "ES module declares no exports; nothing can be imported from it.",
      `${path}.exports`,
    ));
  }

  return diagnostics;
}

/** Framework adapter metadata must name the framework (the adapter surface is
 *  metadata-only by design — this package must not become a framework). */
export function validateFrameworkAdapterMetadata(
  meta: FrameworkAdapterMetadata,
  path = "adapter",
): readonly JsTargetDiagnostic[] {
  const decoded = decodeFrameworkAdapterMetadata(meta, path);
  if ("diagnostic" in decoded) return [decoded.diagnostic];
  return validateDecodedFrameworkAdapterMetadata(decoded.value, path);
}

function validateDecodedFrameworkAdapterMetadata(
  meta: FrameworkAdapterMetadata,
  path: string,
): readonly JsTargetDiagnostic[] {
  if (meta.framework.trim().length === 0) {
    return [jsDiagnostic(
      "FUNGI-JS-015",
      "error",
      "Framework adapter metadata requires a framework name.",
      `${path}.framework`,
    )];
  }
  return [];
}

/** Build a bundle report over a plan + its modules. The report's check outcomes are
 *  DERIVED from validation (never caller-asserted): a report cannot claim
 *  "server-only imports blocked" while the plan carries one. */
export function createJsBundleReport(input: {
  readonly plan: JsOutputPlan;
  readonly entry: string;
  readonly modules: readonly EsModuleMetadata[];
  readonly adapters?: readonly FrameworkAdapterMetadata[];
}): JsBundleReport {
  const diagnostics: JsTargetDiagnostic[] = [];
  const decodedInput = decodeOwnDataRecord(
    input,
    ["plan", "entry", "modules", "adapters"],
    ["plan", "entry", "modules"],
    "input",
  );
  let entry = "";
  let plan: JsOutputPlan | undefined;
  let modules: readonly EsModuleMetadata[] = Object.freeze([]);
  let adapters: readonly FrameworkAdapterMetadata[] = Object.freeze([]);
  let validationComplete = true;

  if ("diagnostic" in decodedInput) {
    diagnostics.push(decodedInput.diagnostic);
    validationComplete = false;
  } else {
    const decodedEntry = decodeString(decodedInput.value.entry, "input.entry");
    if ("diagnostic" in decodedEntry) {
      diagnostics.push(decodedEntry.diagnostic);
      validationComplete = false;
    } else {
      entry = decodedEntry.value;
    }

    const decodedPlan = decodeJsOutputPlan(decodedInput.value.plan, "plan");
    if ("diagnostic" in decodedPlan) {
      diagnostics.push(decodedPlan.diagnostic);
      validationComplete = false;
    } else {
      plan = decodedPlan.value;
      diagnostics.push(...validateDecodedJsOutputPlan(plan, "plan"));
    }

    const decodedModules = decodeExactArray(decodedInput.value.modules, "input.modules");
    if ("diagnostic" in decodedModules) {
      diagnostics.push(decodedModules.diagnostic);
      validationComplete = false;
    } else {
      const moduleCopies: EsModuleMetadata[] = [];
      for (const [index, value] of decodedModules.value.entries()) {
        const decodedModule = decodeEsModuleMetadata(value, `modules.${index}`);
        if ("diagnostic" in decodedModule) {
          diagnostics.push(decodedModule.diagnostic);
          validationComplete = false;
        } else {
          moduleCopies.push(decodedModule.value);
          diagnostics.push(...validateDecodedEsModuleMetadata(decodedModule.value, `modules.${index}`));
        }
      }
      modules = Object.freeze(moduleCopies);
    }

    const decodedAdapters = decodeExactArray(
      Object.hasOwn(decodedInput.value, "adapters") ? decodedInput.value.adapters : [],
      "input.adapters",
    );
    if ("diagnostic" in decodedAdapters) {
      diagnostics.push(decodedAdapters.diagnostic);
      validationComplete = false;
    } else {
      const adapterCopies: FrameworkAdapterMetadata[] = [];
      for (const [index, value] of decodedAdapters.value.entries()) {
        const decodedAdapter = decodeFrameworkAdapterMetadata(value, `adapters.${index}`);
        if ("diagnostic" in decodedAdapter) {
          diagnostics.push(decodedAdapter.diagnostic);
          validationComplete = false;
        } else {
          adapterCopies.push(decodedAdapter.value);
          diagnostics.push(...validateDecodedFrameworkAdapterMetadata(decodedAdapter.value, `adapters.${index}`));
        }
      }
      adapters = Object.freeze(adapterCopies);
    }
  }

  if (plan !== undefined) {
    const usedImports = new Set<string>();
    for (const [moduleIndex, module] of modules.entries()) {
      for (const [importIndex, specifier] of module.imports.entries()) {
        usedImports.add(specifier);
        if (plan.runtime === "browser" && isServerOnlyImport(specifier)) {
          diagnostics.push(jsDiagnostic(
            "FUNGI-JS-007",
            "error",
            `Browser JS module imports server-only module "${specifier}" — blocked (deny-by-default).`,
            `modules.${moduleIndex}.imports.${importIndex}`,
          ));
        }
        if (!plan.imports.includes(specifier)) {
          diagnostics.push(jsDiagnostic(
            "FUNGI-JS-002",
            "error",
            `Module import "${specifier}" is absent from the admitted plan import set.`,
            `modules.${moduleIndex}.imports.${importIndex}`,
          ));
        }
      }
    }
    const seenPlanImports = new Set<string>();
    for (const [index, specifier] of plan.imports.entries()) {
      if (seenPlanImports.has(specifier)) {
        diagnostics.push(jsDiagnostic(
          "FUNGI-JS-016",
          "error",
          `Plan import "${specifier}" is duplicated; the admitted import set is exact, not a bag.`,
          `plan.imports.${index}`,
        ));
      }
      seenPlanImports.add(specifier);
      if (!usedImports.has(specifier)) {
        diagnostics.push(jsDiagnostic(
          "FUNGI-JS-017",
          "error",
          `Plan import "${specifier}" is unused by the module set; surplus plan entries are refused.`,
          `plan.imports.${index}`,
        ));
      }
    }
  }

  if (validationComplete && !isStructuredCloneable(input)) {
    const inputFailure = decodeFailure("input", "proxy-backed records are refused");
    if ("diagnostic" in inputFailure) diagnostics.push(inputFailure.diagnostic);
    validationComplete = false;
  }

  const has = (code: string): boolean => diagnostics.some((d) => d.code === code);
  const checksAdmitted = validationComplete && plan !== undefined &&
    diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  const browserPlan = plan?.runtime === "browser";
  const checks: JsBundleCheckOutcome[] = [
    {
      check: "server-only-imports-blocked",
      passed: checksAdmitted && !has("FUNGI-JS-007") && !has("FUNGI-JS-002")
        && !has("FUNGI-JS-016") && !has("FUNGI-JS-017"),
      detail: browserPlan
        ? "browser plan scanned against the server-only module list (deny-by-default)"
        : checksAdmitted ? "node target — server modules are legal here" : "input validation refused",
    },
    {
      check: "browser-secret-access-denied",
      passed: checksAdmitted && !has("FUNGI-JS-009")
        && !has("FUNGI-JS-008"),
      detail: browserPlan
        ? "browser plan checked for environment/secret access declarations"
        : checksAdmitted ? "node target — environment access is declared, not denied" : "input validation refused",
    },
    {
      check: "source-map-disclosure",
      passed: checksAdmitted && !has("FUNGI-JS-012")
        && !has("FUNGI-JS-011") && !has("FUNGI-JS-020") && !has("FUNGI-JS-021") && !has("FUNGI-JS-022"),
      detail: checksAdmitted
        ? "production browser artifacts must not disclose sources via maps"
        : "input validation refused",
    },
  ];

  return Object.freeze({
    runtime: plan !== undefined && JS_RUNTIMES.includes(plan.runtime) ? plan.runtime : undefined,
    entry,
    modules,
    checks: Object.freeze(checks.map((check) => Object.freeze(check))),
    adapters,
    warnings: Object.freeze(diagnostics.filter((d) => d.severity === "warning").map((d) => d.message)),
    diagnostics: Object.freeze(diagnostics.map((diagnostic) => Object.freeze({ ...diagnostic }))),
  });
}

// ── W01 G3: build modes, layout, app.source-map.json and binary-error mapping ──
// Design: grok-scratch designs/galerina-core-w01-zero-trust-designs-2026-10-05.md G3 + A1.

export interface JsBuildModePolicy {
  readonly mode: JsBuildMode;
  readonly minify: boolean;
  readonly defaultSourceMap: SourceMapMode;
  readonly allowedSourceMaps: readonly SourceMapMode[];
  readonly testReportAllowed: boolean;
  readonly production: boolean;
}

const BUILD_MODE_POLICIES: Readonly<Record<JsBuildMode, JsBuildModePolicy>> = Object.freeze({
  debug: Object.freeze({
    mode: "debug",
    minify: false,
    defaultSourceMap: "external",
    allowedSourceMaps: Object.freeze(["external", "inline", "none"] as SourceMapMode[]),
    testReportAllowed: true,
    production: false,
  }),
  release: Object.freeze({
    mode: "release",
    minify: true,
    defaultSourceMap: "none",
    // `external` only with sourceMap.outsideShippedOutput (FUNGI-JS-021).
    allowedSourceMaps: Object.freeze(["none", "external"] as SourceMapMode[]),
    testReportAllowed: false,
    production: true,
  }),
});

/** Policy for a build mode; an unknown mode returns undefined (callers must refuse). */
export function jsBuildModePolicy(mode: string): JsBuildModePolicy | undefined {
  return mode === "debug" || mode === "release" ? BUILD_MODE_POLICIES[mode] : undefined;
}

export interface JsBuildLayoutEntry {
  readonly path: string;
  readonly role: "app" | "source-map" | "report";
  readonly required: boolean;
}

export interface JsBuildLayout {
  readonly root: string;
  readonly entries: readonly JsBuildLayoutEntry[];
  readonly note: string;
}

/** Contract for `build/<mode>/`. This records the layout; it never creates, moves or
 *  deletes files. The repository's existing `build/debug/` already holds compiler
 *  artifacts (app.build-manifest.json, app.map-manifest.json, reports); they are left
 *  as they are. */
export function jsBuildLayout(mode: string): JsBuildLayout | undefined {
  const policy = jsBuildModePolicy(mode);
  if (policy === undefined) return undefined;
  const root = `build/${policy.mode}/`;
  const entries: JsBuildLayoutEntry[] = [
    { path: `${root}app.js`, role: "app", required: true },
    { path: `${root}app.build-manifest.json`, role: "report", required: true },
    { path: `${root}app.map-manifest.json`, role: "report", required: true },
  ];
  if (policy.mode === "debug") {
    entries.splice(1, 0, { path: `${root}app.source-map.json`, role: "source-map", required: true });
    entries.push({ path: `${root}app.test-report.json`, role: "report", required: false });
  }
  return Object.freeze({
    root,
    entries: Object.freeze(entries.map((e) => Object.freeze(e))),
    note: policy.mode === "release"
      ? "Release ships no source map; an external map, when requested, is written outside build/release/."
      : "Existing build/debug/ compiler artifacts are recorded, not modified.",
  });
}

export const JS_SOURCE_MAP_MAX_MAPPINGS = 100_000;
const JS_SOURCE_MAP_MAX_PATH = 1024;

export interface JsSourcePosition {
  readonly line: number;
  readonly column: number;
}

export interface JsSourceMapping {
  readonly generated: JsSourcePosition;
  readonly source: number;
  readonly original: JsSourcePosition;
}

/** `app.source-map.json` v1. Mappings are sorted by (generated.line, generated.column)
 *  with no duplicates; lines are 1-based, columns 0-based. */
export interface JsSourceMap {
  readonly version: 1;
  readonly file: string;
  readonly sources: readonly string[];
  readonly mappings: readonly JsSourceMapping[];
}

export interface JsSourceMapValidation {
  readonly ok: boolean;
  readonly map?: JsSourceMap;
  readonly diagnostics: readonly JsTargetDiagnostic[];
}

function relativePathProblem(value: string, requiredSuffix: string): string {
  if (value.length === 0) return "is empty";
  if (value.length > JS_SOURCE_MAP_MAX_PATH) return "is too long";
  if (value.includes("\\")) return "uses backslashes";
  if (value.includes(":")) return "carries a scheme or drive letter";
  if (value.startsWith("/")) return "is absolute";
  if (/[\u0000-\u001f]/.test(value)) return "contains control characters";
  if (value.split("/").some((seg) => seg === ".." || seg === "." || seg === "")) {
    return "has empty, '.' or '..' segments";
  }
  if (!value.endsWith(requiredSuffix)) return `does not end with ${requiredSuffix}`;
  return "";
}

function decodePosition(value: unknown, path: string): DecodeResult<JsSourcePosition> {
  const record = decodeOwnDataRecord(value, ["line", "column"], ["line", "column"], path);
  if ("diagnostic" in record) return record;
  const { line, column } = record.value;
  if (typeof line !== "number" || !Number.isSafeInteger(line) || line < 1) {
    return { diagnostic: jsDiagnostic("FUNGI-JS-025", "error", "line must be a safe integer >= 1.", `${path}.line`) };
  }
  if (typeof column !== "number" || !Number.isSafeInteger(column) || column < 0) {
    return { diagnostic: jsDiagnostic("FUNGI-JS-025", "error", "column must be a safe integer >= 0.", `${path}.column`) };
  }
  return { value: Object.freeze({ line, column }) };
}

function comparePositions(a: JsSourcePosition, b: JsSourcePosition): number {
  return a.line !== b.line ? a.line - b.line : a.column - b.column;
}

/** Fail-closed validator for `app.source-map.json` v1. Refuses absolute, `..`,
 *  scheme-bearing or non-`.fungi` sources, duplicate sources, out-of-range source
 *  indices, invalid positions, more than 100k mappings and unsorted or duplicate
 *  generated positions. */
export function validateJsSourceMap(value: unknown, path = "sourceMap"): JsSourceMapValidation {
  const fail = (d: JsTargetDiagnostic): JsSourceMapValidation =>
    Object.freeze({ ok: false, diagnostics: Object.freeze([Object.freeze(d)]) });
  const record = decodeOwnDataRecord(value, ["version", "file", "sources", "mappings"], ["version", "file", "sources", "mappings"], path);
  if ("diagnostic" in record) return fail(record.diagnostic);
  if (record.value.version !== 1) {
    return fail(jsDiagnostic("FUNGI-JS-023", "error", "Source map version must be 1.", `${path}.version`));
  }
  const file = decodeString(record.value.file, `${path}.file`);
  if ("diagnostic" in file) return fail(file.diagnostic);
  const fileProblem = relativePathProblem(file.value, ".js");
  if (fileProblem !== "") {
    return fail(jsDiagnostic("FUNGI-JS-024", "error", `Source map file ${fileProblem}.`, `${path}.file`));
  }
  const sources = decodeStringArray(record.value.sources, `${path}.sources`);
  if ("diagnostic" in sources) return fail(sources.diagnostic);
  const seen = new Set<string>();
  for (const [index, source] of sources.value.entries()) {
    const problem = relativePathProblem(source, ".fungi");
    if (problem !== "") {
      return fail(jsDiagnostic("FUNGI-JS-024", "error", `Source path ${problem}; only relative .fungi paths are allowed.`, `${path}.sources.${index}`));
    }
    if (seen.has(source)) {
      return fail(jsDiagnostic("FUNGI-JS-024", "error", "Duplicate source path.", `${path}.sources.${index}`));
    }
    seen.add(source);
  }
  const rawMappings = decodeExactArray(record.value.mappings, `${path}.mappings`, JS_SOURCE_MAP_MAX_MAPPINGS);
  if ("diagnostic" in rawMappings) {
    return fail(jsDiagnostic("FUNGI-JS-026", "error", `Mappings must be a plain array of at most ${JS_SOURCE_MAP_MAX_MAPPINGS} entries.`, `${path}.mappings`));
  }
  const mappings: JsSourceMapping[] = [];
  for (const [index, raw] of rawMappings.value.entries()) {
    const at = `${path}.mappings.${index}`;
    const entry = decodeOwnDataRecord(raw, ["generated", "source", "original"], ["generated", "source", "original"], at);
    if ("diagnostic" in entry) return fail(entry.diagnostic);
    const generated = decodePosition(entry.value.generated, `${at}.generated`);
    if ("diagnostic" in generated) return fail(generated.diagnostic);
    const original = decodePosition(entry.value.original, `${at}.original`);
    if ("diagnostic" in original) return fail(original.diagnostic);
    const source = entry.value.source;
    if (typeof source !== "number" || !Number.isSafeInteger(source) || source < 0 || source >= sources.value.length) {
      return fail(jsDiagnostic("FUNGI-JS-025", "error", "Mapping source index is out of range.", `${at}.source`));
    }
    const previous = mappings[mappings.length - 1];
    if (previous !== undefined && comparePositions(previous.generated, generated.value) >= 0) {
      return fail(jsDiagnostic("FUNGI-JS-027", "error", "Mappings must be sorted by generated (line, column) with no duplicates.", `${at}.generated`));
    }
    mappings.push(Object.freeze({ generated: generated.value, source, original: original.value }));
  }
  if (!isStructuredCloneable(value)) {
    return fail(jsDiagnostic("FUNGI-JS-001", "error", "proxy-backed source maps are refused", path));
  }
  const map: JsSourceMap = Object.freeze({
    version: 1,
    file: file.value,
    sources: sources.value,
    mappings: Object.freeze(mappings),
  });
  return Object.freeze({ ok: true, map, diagnostics: Object.freeze([]) });
}

export type JsBinaryErrorMapping =
  | { readonly status: "mapped"; readonly source: string; readonly line: number; readonly column: number; readonly exact: boolean }
  | { readonly status: "unmapped"; readonly reason: "invalid-map" | "invalid-position" | "no-mapping-on-line" };

/** Map a generated (binary/JS) error position back to its `.fungi` source. Uses the
 *  nearest preceding mapping on the SAME generated line (binary search over the
 *  sorted mappings); it never guesses across lines. Invalid maps fail closed. */
export function mapBinaryError(map: unknown, position: unknown): JsBinaryErrorMapping {
  const validated = validateJsSourceMap(map);
  if (!validated.ok || validated.map === undefined) return Object.freeze({ status: "unmapped", reason: "invalid-map" });
  const pos = decodePosition(position, "position");
  if ("diagnostic" in pos) return Object.freeze({ status: "unmapped", reason: "invalid-position" });
  const { mappings, sources } = validated.map;
  // Largest index whose generated position is <= pos.
  let lo = 0;
  let hi = mappings.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const candidate = mappings[mid];
    if (candidate !== undefined && comparePositions(candidate.generated, pos.value) <= 0) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const hit = found >= 0 ? mappings[found] : undefined;
  if (hit === undefined || hit.generated.line !== pos.value.line) {
    return Object.freeze({ status: "unmapped", reason: "no-mapping-on-line" });
  }
  return Object.freeze({
    status: "mapped",
    source: sources[hit.source] ?? "",
    line: hit.original.line,
    column: hit.original.column,
    exact: hit.generated.column === pos.value.column,
  });
}
