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

export interface SourceMapRule {
  readonly mode: SourceMapMode;
  /** Embeds original sources in the map — never acceptable in production browser output. */
  readonly includeSourcesContent: boolean;
  /** True when this plan describes a production artifact (stricter disclosure rules). */
  readonly production: boolean;
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
  readonly runtime: JsRuntime;
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

/** Node-only module surface (deny-by-default for browser plans). A specifier is
 *  server-only when it carries the `node:` scheme OR matches this bare-name list —
 *  the classic builtins that have no browser meaning and typically signal a
 *  server-capability leak into a browser bundle. */
const SERVER_ONLY_MODULES: ReadonlySet<string> = new Set([
  "fs", "path", "os", "process", "child_process", "cluster", "worker_threads",
  "net", "tls", "dns", "dgram", "http", "https", "http2",
  "crypto", "stream", "buffer", "v8", "vm", "module", "readline", "repl",
  "zlib", "util", "assert", "async_hooks", "perf_hooks", "inspector",
]);

export function isServerOnlyImport(specifier: string): boolean {
  const s = specifier.trim();
  if (s.startsWith("node:")) return true;
  return SERVER_ONLY_MODULES.has(s);
}

function jsDiagnostic(
  code: string,
  severity: JsTargetDiagnosticSeverity,
  message: string,
  path?: string,
): JsTargetDiagnostic {
  return { code, severity, message, ...(path === undefined ? {} : { path }) };
}

/** A JS output plan must name its flow, use a known runtime/format, and — fail-closed —
 *  a BROWSER plan may not import server-only modules, may not access environment or
 *  secret material, and must be ESM. Source-map disclosure rules are enforced for
 *  production artifacts. */
export function validateJsOutputPlan(
  plan: JsOutputPlan,
  path = "plan",
): readonly JsTargetDiagnostic[] {
  const diagnostics: JsTargetDiagnostic[] = [];

  if (plan.flow.trim().length === 0) {
    diagnostics.push(jsDiagnostic(
      "Galerina_JS_PLAN_FLOW_REQUIRED",
      "error",
      "JS output plan requires a flow.",
      `${path}.flow`,
    ));
  }

  if (!JS_RUNTIMES.includes(plan.runtime)) {
    diagnostics.push(jsDiagnostic(
      "Galerina_JS_RUNTIME_INVALID",
      "error",
      `JS output runtime must be one of: ${JS_RUNTIMES.join(", ")}.`,
      `${path}.runtime`,
    ));
    // Unknown runtime: the browser-specific rules below cannot be evaluated meaningfully.
    return diagnostics;
  }

  if (!JS_MODULE_FORMATS.includes(plan.moduleFormat)) {
    diagnostics.push(jsDiagnostic(
      "Galerina_JS_MODULE_FORMAT_INVALID",
      "error",
      `JS module format must be one of: ${JS_MODULE_FORMATS.join(", ")}.`,
      `${path}.moduleFormat`,
    ));
  } else if (plan.runtime === "browser" && plan.moduleFormat !== "esm") {
    diagnostics.push(jsDiagnostic(
      "Galerina_JS_BROWSER_REQUIRES_ESM",
      "error",
      "Browser JS output is ES-module-only; cjs is reserved for the optional Node target.",
      `${path}.moduleFormat`,
    ));
  }

  if (plan.runtime === "browser") {
    plan.imports.forEach((spec, index) => {
      if (isServerOnlyImport(spec)) {
        diagnostics.push(jsDiagnostic(
          "Galerina_JS_SERVER_ONLY_IMPORT_IN_BROWSER",
          "error",
          `Browser JS plan imports server-only module "${spec}" — blocked (deny-by-default).`,
          `${path}.imports.${index}`,
        ));
      }
    });

    if (plan.accessesEnvironment) {
      diagnostics.push(jsDiagnostic(
        "Galerina_JS_BROWSER_ENVIRONMENT_ACCESS_DENIED",
        "error",
        "Browser JS output must not access the host environment.",
        `${path}.accessesEnvironment`,
      ));
    }

    if (plan.accessesSecrets) {
      diagnostics.push(jsDiagnostic(
        "Galerina_JS_BROWSER_SECRET_ACCESS_DENIED",
        "error",
        "Browser JS output must not access secret material — a shipped bundle is public text.",
        `${path}.accessesSecrets`,
      ));
    }
  }

  if (!SOURCE_MAP_MODES.includes(plan.sourceMap.mode)) {
    diagnostics.push(jsDiagnostic(
      "Galerina_JS_SOURCE_MAP_MODE_INVALID",
      "error",
      `Source-map mode must be one of: ${SOURCE_MAP_MODES.join(", ")}.`,
      `${path}.sourceMap.mode`,
    ));
  } else if (plan.sourceMap.production && plan.runtime === "browser") {
    // Disclosure rules: a production browser artifact must not carry its sources.
    if (plan.sourceMap.mode === "inline") {
      diagnostics.push(jsDiagnostic(
        "Galerina_JS_SOURCE_MAP_INLINE_IN_PRODUCTION",
        "warning",
        "Inline source maps in a production browser bundle disclose source structure.",
        `${path}.sourceMap.mode`,
      ));
    }
    if (plan.sourceMap.includeSourcesContent && plan.sourceMap.mode !== "none") {
      diagnostics.push(jsDiagnostic(
        "Galerina_JS_SOURCES_CONTENT_IN_PRODUCTION",
        "error",
        "sourcesContent embeds original sources — never acceptable in production browser output.",
        `${path}.sourceMap.includeSourcesContent`,
      ));
    }
  }

  return diagnostics;
}

/** ES-module metadata must name a path; a module exporting nothing is inert (warning —
 *  it may be side-effect-only glue, so not a hard error). */
export function validateEsModuleMetadata(
  meta: EsModuleMetadata,
  path = "module",
): readonly JsTargetDiagnostic[] {
  const diagnostics: JsTargetDiagnostic[] = [];

  if (meta.path.trim().length === 0) {
    diagnostics.push(jsDiagnostic(
      "Galerina_JS_MODULE_PATH_REQUIRED",
      "error",
      "ES module metadata requires a path.",
      `${path}.path`,
    ));
  }

  if (meta.exports.length === 0) {
    diagnostics.push(jsDiagnostic(
      "Galerina_JS_MODULE_NO_EXPORTS",
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
  if (meta.framework.trim().length === 0) {
    return [jsDiagnostic(
      "Galerina_JS_ADAPTER_FRAMEWORK_REQUIRED",
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
  const diagnostics: JsTargetDiagnostic[] = [...validateJsOutputPlan(input.plan)];
  input.modules.forEach((m, i) => diagnostics.push(...validateEsModuleMetadata(m, `modules.${i}`)));
  const adapters = input.adapters ?? [];
  adapters.forEach((a, i) => diagnostics.push(...validateFrameworkAdapterMetadata(a, `adapters.${i}`)));

  const has = (code: string): boolean => diagnostics.some((d) => d.code === code);
  const checks: JsBundleCheckOutcome[] = [
    {
      check: "server-only-imports-blocked",
      passed: !has("Galerina_JS_SERVER_ONLY_IMPORT_IN_BROWSER"),
      detail: input.plan.runtime === "browser"
        ? "browser plan scanned against the server-only module list (deny-by-default)"
        : "node target — server modules are legal here",
    },
    {
      check: "browser-secret-access-denied",
      passed: !has("Galerina_JS_BROWSER_SECRET_ACCESS_DENIED")
        && !has("Galerina_JS_BROWSER_ENVIRONMENT_ACCESS_DENIED"),
      detail: input.plan.runtime === "browser"
        ? "browser plan checked for environment/secret access declarations"
        : "node target — environment access is declared, not denied",
    },
    {
      check: "source-map-disclosure",
      passed: !has("Galerina_JS_SOURCES_CONTENT_IN_PRODUCTION")
        && !has("Galerina_JS_SOURCE_MAP_INLINE_IN_PRODUCTION"),
      detail: "production browser artifacts must not disclose sources via maps",
    },
  ];

  return {
    runtime: input.plan.runtime,
    entry: input.entry,
    modules: input.modules,
    checks,
    adapters,
    warnings: diagnostics.filter((d) => d.severity === "warning").map((d) => d.message),
    diagnostics,
  };
}
