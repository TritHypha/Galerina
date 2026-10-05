// W01 G5 — startup validation, build flags and build report schemas (pure; no I/O).
// Design: galerina-core-w01-zero-trust-designs-2026-10-05.md G5 + SuperGrok A1
// (NB-2: env/secrets present AND non-empty via validateRuntimeEnvironment / FUNGI-CONFIG-004;
//  NB-5: extends RuntimeConfigHandoff / ProductionStrictnessPolicy; NB-6: FUNGI-CONFIG-* codes).
// Startup values are never echoed: diagnostics carry names only.

import { isProxy } from "node:util/types";
import {
  createConfigDiagnostic,
  validateRuntimeEnvironment,
  type ConfigDiagnostic,
  type EnvironmentConfig,
  type EnvironmentMode,
  type EnvironmentVariableReference,
  type ProductionStrictnessPolicy,
} from "./index.js";

export const STARTUP_REPORT_SCHEMA = "galerina.startup-report.v1" as const;
export const APP_TEST_REPORT_SCHEMA = "galerina.app-test-report.v1" as const;
export const APP_AI_SUGGESTIONS_SCHEMA = "galerina.app-ai-suggestions.v1" as const;

const MAX_ITEMS = 4096;
const MAX_TEXT = 2000;
const MAX_TITLE = 200;
const MAX_SUGGESTIONS = 200;
const HTTP_METHODS: ReadonlySet<string> = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]);
const PINNED_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const MAX_REPLAY_WINDOW_SECONDS = 86_400;

export interface StartupRoute {
  readonly method: string;
  readonly path: string;
  readonly handler: string;
}

export interface StartupWebhook {
  readonly route: string;
  readonly hmac: boolean;
  readonly replayWindowSeconds: number;
  readonly idempotencyKey: string;
}

export interface StartupPackage {
  readonly name: string;
  readonly version: string;
}

export interface StartupRegistryEntry {
  readonly name: string;
  readonly versions: readonly string[];
}

/** Declared startup manifest. Every field is required so that an omitted section can
 *  never read as "nothing to check". */
export interface StartupManifest {
  readonly environment: EnvironmentConfig;
  readonly apiMethods: readonly string[];
  readonly routes: readonly StartupRoute[];
  readonly listenPorts: readonly number[];
  readonly inboundPorts: readonly number[];
  readonly webhooks: readonly StartupWebhook[];
  readonly packages: readonly StartupPackage[];
  readonly registry: readonly StartupRegistryEntry[];
}

export type StartupCheckId =
  | "manifest-shape"
  | "required-env"
  | "required-secrets"
  | "api-methods"
  | "inbound-ports"
  | "route-handlers"
  | "webhook-guards"
  | "package-registry";

export interface StartupCheck {
  readonly id: StartupCheckId;
  readonly passed: boolean;
  readonly diagnostics: readonly ConfigDiagnostic[];
}

/** `StartupReport` v1: ordered checks; `pass` is true only when every check passes. */
export interface StartupReport {
  readonly schema: typeof STARTUP_REPORT_SCHEMA;
  readonly mode: EnvironmentMode;
  readonly pass: boolean;
  readonly checks: readonly StartupCheck[];
  readonly diagnostics: readonly ConfigDiagnostic[];
}

const CHECK_ORDER: readonly StartupCheckId[] = [
  "required-env",
  "required-secrets",
  "api-methods",
  "inbound-ports",
  "route-handlers",
  "webhook-guards",
  "package-registry",
];

// ── untrusted-input helpers ────────────────────────────────────────────────────

function plainRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value) || isProxy(value)) return undefined;
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return undefined;
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return undefined;
    const d = Object.getOwnPropertyDescriptor(value, key);
    if (d === undefined || !("value" in d)) return undefined;
  }
  return value as Readonly<Record<string, unknown>>;
}

function plainArray(value: unknown, max = MAX_ITEMS): readonly unknown[] | undefined {
  if (!Array.isArray(value) || isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return undefined;
  if (value.length > max) return undefined;
  for (let i = 0; i < value.length; i += 1) {
    const d = Object.getOwnPropertyDescriptor(value, String(i));
    if (d === undefined || !("value" in d)) return undefined;
  }
  return value;
}

function exactKeys(record: Readonly<Record<string, unknown>>, keys: readonly string[]): boolean {
  const own = Object.keys(record);
  return own.length === keys.length && keys.every((k) => Object.hasOwn(record, k));
}

function str(value: unknown, max = MAX_TEXT): value is string {
  return typeof value === "string" && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}

function stringList(value: unknown): readonly string[] | undefined {
  const list = plainArray(value);
  if (list === undefined || !list.every((item) => str(item, 256))) return undefined;
  return list as readonly string[];
}

function portList(value: unknown): readonly number[] | undefined {
  const list = plainArray(value);
  if (list === undefined) return undefined;
  return list.every((p) => typeof p === "number" && Number.isInteger(p) && p >= 1 && p <= 65_535)
    ? (list as readonly number[])
    : undefined;
}

function recordList<T>(value: unknown, keys: readonly string[], check: (r: Readonly<Record<string, unknown>>) => boolean): readonly T[] | undefined {
  const list = plainArray(value);
  if (list === undefined) return undefined;
  const out: T[] = [];
  for (const item of list) {
    const r = plainRecord(item);
    if (r === undefined || !exactKeys(r, keys) || !check(r)) return undefined;
    out.push(Object.freeze({ ...r }) as T);
  }
  return Object.freeze(out);
}

function envRefs(value: unknown, secret: boolean): readonly EnvironmentVariableReference[] | undefined {
  const list = plainArray(value);
  if (list === undefined) return undefined;
  const out: EnvironmentVariableReference[] = [];
  for (const item of list) {
    const r = plainRecord(item);
    if (r === undefined || !str(r["name"], 256) || !/^[A-Z_][A-Z0-9_]*$/.test(r["name"] as string) ||
        typeof r["required"] !== "boolean") return undefined;
    out.push(Object.freeze({
      kind: "env",
      name: r["name"] as string,
      required: r["required"] as boolean,
      secret,
      scope: "runtime",
    }));
  }
  return Object.freeze(out);
}

function decodeStartupManifest(value: unknown): StartupManifest | undefined {
  try {
    const r = plainRecord(value);
    const keys = ["environment", "apiMethods", "routes", "listenPorts", "inboundPorts", "webhooks", "packages", "registry"];
    if (r === undefined || !exactKeys(r, keys)) return undefined;
    const env = plainRecord(r["environment"]);
    if (env === undefined || !exactKeys(env, ["mode", "variables", "secrets"])) return undefined;
    const mode = env["mode"];
    if (mode !== "development" && mode !== "test" && mode !== "staging" && mode !== "production") return undefined;
    const variables = envRefs(env["variables"], false);
    const secrets = envRefs(env["secrets"], true);
    const apiMethods = stringList(r["apiMethods"]);
    const routes = recordList<StartupRoute>(r["routes"], ["method", "path", "handler"],
      (x) => str(x["method"], 16) && str(x["path"], 1024) && str(x["handler"], 256));
    const listenPorts = portList(r["listenPorts"]);
    const inboundPorts = portList(r["inboundPorts"]);
    const webhooks = recordList<StartupWebhook>(r["webhooks"], ["route", "hmac", "replayWindowSeconds", "idempotencyKey"],
      (x) => str(x["route"], 1024) && typeof x["hmac"] === "boolean" && typeof x["replayWindowSeconds"] === "number" &&
        str(x["idempotencyKey"], 256));
    const packages = recordList<StartupPackage>(r["packages"], ["name", "version"],
      (x) => str(x["name"], 214) && str(x["version"], 64));
    const registry = recordList<StartupRegistryEntry>(r["registry"], ["name", "versions"],
      (x) => str(x["name"], 214) && stringList(x["versions"]) !== undefined);
    if (variables === undefined || secrets === undefined || apiMethods === undefined || routes === undefined ||
        listenPorts === undefined || inboundPorts === undefined || webhooks === undefined ||
        packages === undefined || registry === undefined) return undefined;
    return Object.freeze({
      environment: Object.freeze({ mode, variables, secrets }),
      apiMethods, routes, listenPorts, inboundPorts, webhooks, packages, registry,
    });
  } catch {
    return undefined;
  }
}

function diag(code: string, name: string, severity: "warning" | "error", message: string, path: string): ConfigDiagnostic {
  return Object.freeze(createConfigDiagnostic(code, name, severity, message, path));
}

function check(id: StartupCheckId, diagnostics: readonly ConfigDiagnostic[], strictMissing = false): StartupCheck {
  return Object.freeze({
    id,
    passed: strictMissing ? diagnostics.length === 0 : diagnostics.every((d) => d.severity !== "error"),
    diagnostics: Object.freeze([...diagnostics]),
  });
}

/** Pure startup validation (L949-L956). `availableEnvironment` is consulted for
 *  presence and non-emptiness only; values are never copied into the report. */
export function validateStartup(
  manifest: unknown,
  availableEnvironment: Readonly<Record<string, string | undefined>>,
  policy?: ProductionStrictnessPolicy,
): StartupReport {
  const m = decodeStartupManifest(manifest);
  if (m === undefined) {
    const d = diag("FUNGI-CONFIG-031", "STARTUP_MANIFEST_INVALID", "error",
      "Startup manifest is malformed, has surplus or missing sections, or exceeds caps; startup refused.", "startup");
    const checks = Object.freeze([check("manifest-shape", [d])]);
    return Object.freeze({ schema: STARTUP_REPORT_SCHEMA, mode: "production", pass: false, checks, diagnostics: Object.freeze([d]) });
  }
  const env = m.environment;
  const envOnly: EnvironmentConfig = { mode: env.mode, variables: env.variables, secrets: [] };
  const secretsOnly: EnvironmentConfig = { mode: env.mode, variables: [], secrets: env.secrets };
  const safeEnv: Readonly<Record<string, string | undefined>> = Object.create(null);
  const presence: Record<string, string> = safeEnv as Record<string, string>;
  for (const ref of [...env.variables, ...env.secrets]) {
    const v = Object.hasOwn(availableEnvironment, ref.name) ? availableEnvironment[ref.name] : undefined;
    // Presence marker only; the value itself never leaves this function.
    presence[ref.name] = typeof v === "string" && v.length > 0 ? "set" : "";
  }

  const byId = new Map<StartupCheckId, StartupCheck>();
  byId.set("required-env", check("required-env", validateRuntimeEnvironment(envOnly, safeEnv, policy), true));
  byId.set("required-secrets", check("required-secrets", validateRuntimeEnvironment(secretsOnly, safeEnv, policy), true));

  const methods: ConfigDiagnostic[] = [];
  const allowed = new Set(m.apiMethods);
  m.apiMethods.forEach((method, i) => {
    if (!HTTP_METHODS.has(method)) {
      methods.push(diag("FUNGI-CONFIG-032", "API_METHOD_NOT_ALLOWED", "error", `security.api_methods entry "${method}" is not an HTTP method.`, `startup.apiMethods.${i}`));
    }
  });
  const used = new Set<string>();
  m.routes.forEach((route, i) => {
    used.add(route.method);
    if (!allowed.has(route.method)) {
      methods.push(diag("FUNGI-CONFIG-032", "API_METHOD_NOT_ALLOWED", "error", `Route ${route.method} ${route.path} uses a method outside security.api_methods.`, `startup.routes.${i}.method`));
    }
  });
  m.apiMethods.forEach((method, i) => {
    if (HTTP_METHODS.has(method) && !used.has(method)) {
      methods.push(diag("FUNGI-CONFIG-033", "API_METHOD_UNUSED", "warning", `security.api_methods allows ${method} but no route uses it.`, `startup.apiMethods.${i}`));
    }
  });
  byId.set("api-methods", check("api-methods", methods));

  const inbound = new Set(m.inboundPorts);
  const ports: ConfigDiagnostic[] = [];
  m.listenPorts.forEach((port, i) => {
    if (!inbound.has(port)) {
      ports.push(diag("FUNGI-CONFIG-034", "LISTEN_PORT_NOT_DECLARED", "error", `server.listen() port ${port} is not a declared inbound port.`, `startup.listenPorts.${i}`));
    }
  });
  byId.set("inbound-ports", check("inbound-ports", ports));

  const handlers: ConfigDiagnostic[] = [];
  const seenRoutes = new Set<string>();
  m.routes.forEach((route, i) => {
    if (route.handler.trim().length === 0) {
      handlers.push(diag("FUNGI-CONFIG-035", "ROUTE_HANDLER_INVALID", "error", `Route ${route.method} ${route.path} has no handler.`, `startup.routes.${i}.handler`));
    }
    const key = `${route.method} ${route.path}`;
    if (seenRoutes.has(key)) {
      handlers.push(diag("FUNGI-CONFIG-035", "ROUTE_HANDLER_INVALID", "error", `Route ${key} is declared more than once.`, `startup.routes.${i}`));
    }
    seenRoutes.add(key);
  });
  byId.set("route-handlers", check("route-handlers", handlers));

  const hooks: ConfigDiagnostic[] = [];
  const postPaths = new Set(m.routes.filter((r) => r.method === "POST").map((r) => r.path));
  m.webhooks.forEach((hook, i) => {
    const at = `startup.webhooks.${i}`;
    if (!hook.hmac) hooks.push(diag("FUNGI-CONFIG-036", "WEBHOOK_GUARD_MISSING", "error", `Webhook ${hook.route} does not require an HMAC signature.`, `${at}.hmac`));
    if (!Number.isInteger(hook.replayWindowSeconds) || hook.replayWindowSeconds < 1 || hook.replayWindowSeconds > MAX_REPLAY_WINDOW_SECONDS) {
      hooks.push(diag("FUNGI-CONFIG-036", "WEBHOOK_GUARD_MISSING", "error", `Webhook ${hook.route} needs a replay window of 1-${MAX_REPLAY_WINDOW_SECONDS} seconds.`, `${at}.replayWindowSeconds`));
    }
    if (hook.idempotencyKey.trim().length === 0) hooks.push(diag("FUNGI-CONFIG-036", "WEBHOOK_GUARD_MISSING", "error", `Webhook ${hook.route} does not declare an idempotency key.`, `${at}.idempotencyKey`));
    if (!postPaths.has(hook.route)) hooks.push(diag("FUNGI-CONFIG-036", "WEBHOOK_GUARD_MISSING", "error", `Webhook ${hook.route} has no matching POST route.`, `${at}.route`));
  });
  byId.set("webhook-guards", check("webhook-guards", hooks));

  const pkgs: ConfigDiagnostic[] = [];
  const registry = new Map<string, ReadonlySet<string>>();
  for (const entry of m.registry) registry.set(entry.name, new Set(entry.versions));
  m.packages.forEach((pkg, i) => {
    const at = `startup.packages.${i}`;
    if (!PINNED_VERSION.test(pkg.version)) {
      pkgs.push(diag("FUNGI-CONFIG-037", "PACKAGE_VERSION_NOT_PINNED", "error", `Package ${pkg.name} must pin an exact version.`, `${at}.version`));
      return;
    }
    if (registry.get(pkg.name)?.has(pkg.version) !== true) {
      pkgs.push(diag("FUNGI-CONFIG-038", "PACKAGE_NOT_IN_REGISTRY", "error", `Package ${pkg.name}@${pkg.version} is not in the package registry.`, at));
    }
  });
  byId.set("package-registry", check("package-registry", pkgs));

  const checks = Object.freeze(CHECK_ORDER.map((id) => byId.get(id) ?? check(id, [diag("FUNGI-CONFIG-031", "STARTUP_MANIFEST_INVALID", "error", "Startup check did not run.", "startup")])));
  const diagnostics = Object.freeze(checks.flatMap((c) => c.diagnostics));
  return Object.freeze({
    schema: STARTUP_REPORT_SCHEMA,
    mode: env.mode,
    pass: checks.every((c) => c.passed),
    checks,
    diagnostics,
  });
}

// ── build flags (L958-L960, L962-L963) ────────────────────────────────────────

export interface BuildFlags {
  readonly withTests: boolean;
  readonly security: boolean;
  readonly strict: boolean;
  readonly failOnWarning: boolean;
  /** Always true in every mode (owner may revisit). */
  readonly failOnTestFailure: true;
}

export interface BuildFlagResolution {
  readonly ok: boolean;
  readonly flags: BuildFlags;
  readonly diagnostics: readonly ConfigDiagnostic[];
}

const KNOWN_BUILD_FLAGS: ReadonlySet<string> = new Set(["--with-tests", "--security", "--strict", "--fail-on-warning"]);

/** Pure resolver for `galerina build` flags. `--strict` implies `--with-tests`,
 *  `--security` and fail_on_warning. Unknown flags, `--flag=value` forms and
 *  positional arguments are refused; on refusal the strictest flags are returned. */
export function resolveBuildFlags(argv: unknown): BuildFlagResolution {
  const diagnostics: ConfigDiagnostic[] = [];
  const list = plainArray(argv, 64);
  const seen = new Set<string>();
  if (list === undefined) {
    diagnostics.push(diag("FUNGI-CONFIG-040", "BUILD_FLAG_UNKNOWN", "error", "Build flags must be a plain array of at most 64 strings.", "argv"));
  } else {
    list.forEach((arg, i) => {
      if (typeof arg !== "string" || !KNOWN_BUILD_FLAGS.has(arg)) {
        const shown = typeof arg === "string" && str(arg, 64) ? arg : "(non-string or oversized)";
        diagnostics.push(diag("FUNGI-CONFIG-040", "BUILD_FLAG_UNKNOWN", "error", `Unknown build flag ${shown}.`, `argv.${i}`));
      } else {
        seen.add(arg);
      }
    });
  }
  const ok = diagnostics.length === 0;
  const strict = !ok || seen.has("--strict");
  const flags: BuildFlags = Object.freeze({
    withTests: strict || seen.has("--with-tests"),
    security: strict || seen.has("--security"),
    strict,
    failOnWarning: strict || seen.has("--fail-on-warning"),
    failOnTestFailure: true,
  });
  return Object.freeze({ ok, flags, diagnostics: Object.freeze(diagnostics) });
}

// ── app.test-report.json (L964) ───────────────────────────────────────────────

export interface AppTestSuite {
  readonly name: string;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
}

export interface AppTestReport {
  readonly schema: typeof APP_TEST_REPORT_SCHEMA;
  readonly passed: number;
  readonly failed: number;
  readonly skipped: number;
  readonly durationMs: number;
  readonly suites: readonly AppTestSuite[];
}

const count = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

export function validateAppTestReport(value: unknown): { readonly ok: boolean; readonly report?: AppTestReport; readonly diagnostics: readonly ConfigDiagnostic[] } {
  const bad = (why: string) => Object.freeze({ ok: false, diagnostics: Object.freeze([diag("FUNGI-CONFIG-041", "TEST_REPORT_INVALID", "error", `app.test-report.json refused: ${why}.`, "testReport")]) });
  try {
    const r = plainRecord(value);
    if (r === undefined || !exactKeys(r, ["schema", "passed", "failed", "skipped", "durationMs", "suites"])) return bad("shape");
    if (r["schema"] !== APP_TEST_REPORT_SCHEMA) return bad("schema");
    if (!count(r["passed"]) || !count(r["failed"]) || !count(r["skipped"]) || !count(r["durationMs"])) return bad("counts");
    const suites = recordList<AppTestSuite>(r["suites"], ["name", "passed", "failed", "skipped"],
      (s) => str(s["name"], 256) && count(s["passed"]) && count(s["failed"]) && count(s["skipped"]));
    if (suites === undefined) return bad("suites");
    const sum = (k: "passed" | "failed" | "skipped") => suites.reduce((n, s) => n + s[k], 0);
    if (sum("passed") !== r["passed"] || sum("failed") !== r["failed"] || sum("skipped") !== r["skipped"]) return bad("totals do not match suites");
    const report: AppTestReport = Object.freeze({
      schema: APP_TEST_REPORT_SCHEMA,
      passed: r["passed"] as number,
      failed: r["failed"] as number,
      skipped: r["skipped"] as number,
      durationMs: r["durationMs"] as number,
      suites,
    });
    return Object.freeze({ ok: true, report, diagnostics: Object.freeze([]) });
  } catch {
    return bad("exceptional input");
  }
}

export interface BuildGateResult {
  readonly pass: boolean;
  readonly reasons: readonly string[];
}

/** Applies fail_on_warning (L962) and fail_on_test_failure (L963). When tests are
 *  requested, a missing or invalid test report fails the build (fail-closed). */
export function evaluateBuildGate(input: {
  readonly flags: BuildFlags;
  readonly warningCount: number;
  readonly testReport?: unknown;
}): BuildGateResult {
  const reasons: string[] = [];
  if (!count(input.warningCount)) reasons.push("warning count is invalid");
  else if (input.flags.failOnWarning && input.warningCount > 0) reasons.push(`fail_on_warning: ${input.warningCount} warning(s)`);
  if (input.flags.withTests) {
    const t = validateAppTestReport(input.testReport);
    if (!t.ok || t.report === undefined) reasons.push("tests were requested but app.test-report.json is missing or invalid");
    else if (input.flags.failOnTestFailure && t.report.failed > 0) reasons.push(`fail_on_test_failure: ${t.report.failed} failed test(s)`);
  }
  return Object.freeze({ pass: reasons.length === 0, reasons: Object.freeze(reasons) });
}

// ── app.ai-suggestions.json / .md (L965, L966) ────────────────────────────────

export interface AppAiSuggestion {
  readonly id: string;
  readonly severity: "info" | "warning" | "error";
  readonly title: string;
  readonly detail: string;
  readonly path?: string;
}

export interface AppAiSuggestions {
  readonly schema: typeof APP_AI_SUGGESTIONS_SCHEMA;
  readonly suggestions: readonly AppAiSuggestion[];
}

const SECRET_LIKE = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\bAKIA[0-9A-Z]{16}\b|\bgh[pousr]_[A-Za-z0-9]{20,}|\bsk_(?:live|test)_[A-Za-z0-9]{10,}|\b(?:password|secret|token)\s*[:=]\s*\S{6,})/i;

function relPath(v: unknown): boolean {
  return str(v, 1024) && v.length > 0 && !v.startsWith("/") && !v.includes("\\") && !v.includes(":") &&
    !v.split("/").some((seg) => seg === ".." || seg === "");
}

export function validateAppAiSuggestions(value: unknown): { readonly ok: boolean; readonly suggestions?: AppAiSuggestions; readonly diagnostics: readonly ConfigDiagnostic[] } {
  const bad = (why: string) => Object.freeze({ ok: false, diagnostics: Object.freeze([diag("FUNGI-CONFIG-042", "AI_SUGGESTIONS_INVALID", "error", `app.ai-suggestions.json refused: ${why}.`, "aiSuggestions")]) });
  try {
    const r = plainRecord(value);
    if (r === undefined || !exactKeys(r, ["schema", "suggestions"]) || r["schema"] !== APP_AI_SUGGESTIONS_SCHEMA) return bad("shape or schema");
    const list = plainArray(r["suggestions"], MAX_SUGGESTIONS);
    if (list === undefined) return bad(`suggestions must be a plain array of at most ${MAX_SUGGESTIONS}`);
    const out: AppAiSuggestion[] = [];
    const ids = new Set<string>();
    for (const item of list) {
      const s = plainRecord(item);
      if (s === undefined) return bad("suggestion is not a plain record");
      const keys = Object.keys(s);
      const allowedKeys = ["id", "severity", "title", "detail", "path"];
      if (!keys.every((k) => allowedKeys.includes(k)) || !["id", "severity", "title", "detail"].every((k) => Object.hasOwn(s, k))) return bad("suggestion fields");
      if (!str(s["id"], 64) || !/^[a-z0-9][a-z0-9-]*$/.test(s["id"] as string) || ids.has(s["id"] as string)) return bad("suggestion id");
      if (s["severity"] !== "info" && s["severity"] !== "warning" && s["severity"] !== "error") return bad("severity");
      if (!str(s["title"], MAX_TITLE) || (s["title"] as string).trim() === "") return bad("title");
      if (typeof s["detail"] !== "string" || s["detail"].length > MAX_TEXT || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(s["detail"])) return bad("detail");
      if (Object.hasOwn(s, "path") && !relPath(s["path"])) return bad("path must be relative");
      if (SECRET_LIKE.test(`${s["title"] as string}\n${s["detail"] as string}`)) return bad("secret-like content");
      ids.add(s["id"] as string);
      out.push(Object.freeze({
        id: s["id"] as string,
        severity: s["severity"],
        title: s["title"] as string,
        detail: s["detail"] as string,
        ...(Object.hasOwn(s, "path") ? { path: s["path"] as string } : {}),
      }));
    }
    return Object.freeze({ ok: true, suggestions: Object.freeze({ schema: APP_AI_SUGGESTIONS_SCHEMA, suggestions: Object.freeze(out) }), diagnostics: Object.freeze([]) });
  } catch {
    return bad("exceptional input");
  }
}

function mdEscape(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/([\\`*_\[\]#|])/g, "\\$1");
}

/** Renders `app.ai-suggestions.md` from validated JSON only; invalid JSON yields
 *  ok:false and an empty string. */
export function renderAppAiSuggestionsMarkdown(value: unknown): { readonly ok: boolean; readonly markdown: string } {
  const v = validateAppAiSuggestions(value);
  if (!v.ok || v.suggestions === undefined) return Object.freeze({ ok: false, markdown: "" });
  const lines = ["# AI suggestions", "", `Schema: ${APP_AI_SUGGESTIONS_SCHEMA}`, ""];
  if (v.suggestions.suggestions.length === 0) lines.push("No suggestions.");
  for (const s of v.suggestions.suggestions) {
    lines.push(`## ${mdEscape(s.title)}`, "", `- id: ${s.id}`, `- severity: ${s.severity}`);
    if (s.path !== undefined) lines.push(`- path: ${mdEscape(s.path)}`);
    lines.push("", ...mdEscape(s.detail).split("\n").map((l) => (l.length ? `> ${l}` : ">")), "");
  }
  return Object.freeze({ ok: true, markdown: `${lines.join("\n").trimEnd()}\n` });
}
