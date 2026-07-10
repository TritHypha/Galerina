// Umbrella contracts for the Galerina browser-safe web family.
//
// This package owns the vocabulary the web family shares — the coordinated
// package list, the browser runtime profile and the family-wide report
// index — and enforces the umbrella-level invariants itself: the browser
// runtime fails closed and presents a secret-free surface (both literal
// `true`, re-checked at runtime), declared imports are checked against the
// server-only module denial (the galerina-target-js vocabulary, re-declared
// here by name because sibling packages are never imported), and the family
// report index makes coverage gaps visible instead of implying an all-green
// family. It implements no engine, framework or renderer of any kind.

// The packages this umbrella coordinates, as named in its README.
export type WebFamilyPackage =
  | "@galerina/web-render"
  | "@galerina/web-state"
  | "@galerina/web-router"
  | "@galerina/web-events"
  | "@galerina/web-components";

export const WEB_FAMILY_PACKAGES: readonly WebFamilyPackage[] = [
  "@galerina/web-render",
  "@galerina/web-state",
  "@galerina/web-router",
  "@galerina/web-events",
  "@galerina/web-components",
];

export type WebDiagnosticSeverity = "warning" | "error";

export interface WebDiagnostic {
  readonly code: string;
  readonly severity: WebDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

// The browser runtime profile. failClosed and secretFreeSurface are the
// literal `true`: a fail-open browser boundary or a secret-bearing browser
// surface is not a profile this family can express.
export interface BrowserRuntimeProfile {
  readonly name: string;
  readonly failClosed: true;
  readonly secretFreeSurface: true;
  /** Module specifiers the browser bundle declares it imports. */
  readonly imports: readonly string[];
}

export type WebRuntimeCheck =
  | "profile"
  | "failClosed"
  | "secretFreeSurface"
  | "imports";

export type WebRuntimeCheckOutcome = "pass" | "fail";

export type WebReportStatus = "success" | "partial" | "failed";

export interface BrowserRuntimeReport {
  readonly profile: string;
  readonly status: WebReportStatus;
  readonly checks: Readonly<Record<WebRuntimeCheck, WebRuntimeCheckOutcome>>;
  readonly diagnostics: readonly WebDiagnostic[];
  readonly warnings: readonly string[];
}

export const WEB_RUNTIME_CHECKS: readonly WebRuntimeCheck[] = [
  "profile",
  "failClosed",
  "secretFreeSurface",
  "imports",
];

export interface WebFamilyReportEntry {
  readonly kind: string;
  readonly producer: string;
  readonly status: WebReportStatus;
  readonly errorCount: number;
  readonly warningCount: number;
}

export interface WebFamilyReportIndex {
  readonly generatedAt: string;
  readonly overallStatus: WebReportStatus;
  readonly entries: readonly WebFamilyReportEntry[];
  readonly missingProducers: readonly string[];
  readonly diagnostics: readonly WebDiagnostic[];
  readonly warnings: readonly string[];
}

const FAMILY_PACKAGES: ReadonlySet<string> = new Set(WEB_FAMILY_PACKAGES);

const KNOWN_STATUSES: ReadonlySet<string> = new Set(["success", "partial", "failed"]);

const REPORT_KIND_PATTERN = /^app\.[a-z0-9-]+\.json$/;

// Server-only module surface, deny-by-default for browser imports. This is
// the galerina-target-js vocabulary re-declared BY NAME (never imported): a
// specifier is server-only when it carries the `node:` scheme OR matches
// this bare-name list — the classic builtins that have no browser meaning
// and typically signal a server-capability leak into a browser bundle.
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

// Every error code maps to exactly one report check, so a failed check is
// always explained by a diagnostic and never asserted by the caller.
const CHECK_CODES: Readonly<Record<WebRuntimeCheck, readonly string[]>> = {
  profile: ["Galerina_WEB_PROFILE_NAME_REQUIRED"],
  failClosed: ["Galerina_WEB_FAIL_CLOSED_REQUIRED"],
  secretFreeSurface: ["Galerina_WEB_SECRET_FREE_SURFACE_REQUIRED"],
  imports: [
    "Galerina_WEB_IMPORT_SPECIFIER_REQUIRED",
    "Galerina_WEB_SERVER_ONLY_IMPORT_FORBIDDEN",
  ],
};

function webDiagnostic(
  code: string,
  severity: WebDiagnosticSeverity,
  message: string,
  path?: string,
): WebDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function isNonNegativeSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

// Untyped callers can relax the literal-true fields; the contract re-checks
// them at runtime and fails closed.
export function validateBrowserRuntimeProfile(
  profile: BrowserRuntimeProfile,
  path = "profile",
): readonly WebDiagnostic[] {
  const diagnostics: WebDiagnostic[] = [];

  if (profile.name.trim().length === 0) {
    diagnostics.push(webDiagnostic(
      "Galerina_WEB_PROFILE_NAME_REQUIRED",
      "error",
      "Browser runtime profile requires a name.",
      `${path}.name`,
    ));
  }

  if ((profile.failClosed as boolean) !== true) {
    diagnostics.push(webDiagnostic(
      "Galerina_WEB_FAIL_CLOSED_REQUIRED",
      "error",
      "The browser runtime boundary must fail closed; this is not configurable.",
      `${path}.failClosed`,
    ));
  }

  if ((profile.secretFreeSurface as boolean) !== true) {
    diagnostics.push(webDiagnostic(
      "Galerina_WEB_SECRET_FREE_SURFACE_REQUIRED",
      "error",
      "The browser surface must be secret-free; a shipped bundle is public text and this is not configurable.",
      `${path}.secretFreeSurface`,
    ));
  }

  profile.imports.forEach((specifier, index) => {
    if (specifier.trim().length === 0) {
      diagnostics.push(webDiagnostic(
        "Galerina_WEB_IMPORT_SPECIFIER_REQUIRED",
        "error",
        "Declared imports must be non-empty module specifiers.",
        `${path}.imports.${index}`,
      ));
      return;
    }
    if (isServerOnlyImport(specifier)) {
      diagnostics.push(webDiagnostic(
        "Galerina_WEB_SERVER_ONLY_IMPORT_FORBIDDEN",
        "error",
        `Browser profile imports server-only module "${specifier.trim()}" — blocked (deny-by-default).`,
        `${path}.imports.${index}`,
      ));
    }
  });

  return diagnostics;
}

// Status is arithmetic, not assertion: derived from the diagnostics the
// validators actually produced, never accepted from the caller.
export function deriveWebReportStatus(
  diagnostics: readonly WebDiagnostic[],
): WebReportStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "failed";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "partial";
  }
  return "success";
}

export function createBrowserRuntimeReport(input: {
  readonly profile: BrowserRuntimeProfile;
}): BrowserRuntimeReport {
  const diagnostics = [...validateBrowserRuntimeProfile(input.profile)];

  const errorCodes = new Set(
    diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code),
  );

  const checks = {} as Record<WebRuntimeCheck, WebRuntimeCheckOutcome>;
  for (const check of WEB_RUNTIME_CHECKS) {
    checks[check] = CHECK_CODES[check].some((code) => errorCodes.has(code))
      ? "fail"
      : "pass";
  }

  return {
    profile: input.profile.name,
    status: deriveWebReportStatus(diagnostics),
    checks,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}

export function validateWebFamilyReportEntry(
  entry: WebFamilyReportEntry,
  path = "entry",
): readonly WebDiagnostic[] {
  const diagnostics: WebDiagnostic[] = [];

  if (!REPORT_KIND_PATTERN.test(entry.kind)) {
    diagnostics.push(webDiagnostic(
      "Galerina_WEB_REPORT_KIND_INVALID",
      "error",
      `Report kind "${entry.kind}" must match app.<name>.json.`,
      `${path}.kind`,
    ));
  }

  if (entry.producer.trim().length === 0) {
    diagnostics.push(webDiagnostic(
      "Galerina_WEB_PRODUCER_REQUIRED",
      "error",
      "Report entry requires a producer package name.",
      `${path}.producer`,
    ));
  } else if (!FAMILY_PACKAGES.has(entry.producer)) {
    // A report from outside the coordinated family is not fatal, but the
    // index must not silently launder it into the family picture.
    diagnostics.push(webDiagnostic(
      "Galerina_WEB_PRODUCER_UNKNOWN",
      "warning",
      `Report producer "${entry.producer}" is not a coordinated web family package.`,
      `${path}.producer`,
    ));
  }

  if (!KNOWN_STATUSES.has(entry.status)) {
    diagnostics.push(webDiagnostic(
      "Galerina_WEB_REPORT_STATUS_UNKNOWN",
      "error",
      `Report status "${String(entry.status)}" is not in the shared vocabulary (success/partial/failed).`,
      `${path}.status`,
    ));
  }

  for (const [name, value] of [
    ["errorCount", entry.errorCount],
    ["warningCount", entry.warningCount],
  ] as const) {
    if (!isNonNegativeSafeInteger(value)) {
      diagnostics.push(webDiagnostic(
        "Galerina_WEB_REPORT_COUNT_INVALID",
        "error",
        `Report entry ${name} must be a non-negative integer.`,
        `${path}.${name}`,
      ));
    }
  }

  // The family invariant, enforced at the umbrella too: success may not
  // coexist with errors.
  if (
    entry.status === "success" &&
    isNonNegativeSafeInteger(entry.errorCount) &&
    entry.errorCount > 0
  ) {
    diagnostics.push(webDiagnostic(
      "Galerina_WEB_STATUS_CONTRADICTION",
      "error",
      `Report entry from "${entry.producer}" claims success while carrying ${entry.errorCount} errors.`,
      `${path}.status`,
    ));
  }

  if (entry.status === "failed" && entry.errorCount === 0) {
    diagnostics.push(webDiagnostic(
      "Galerina_WEB_FAILURE_UNEXPLAINED",
      "warning",
      `Report entry from "${entry.producer}" claims failure but carries no errors.`,
      `${path}.status`,
    ));
  }

  return diagnostics;
}

// Family-wide report aggregator, mirroring the galerina-data umbrella.
// Overall status is derived: any invalid or failed entry fails the family;
// partial entries or coverage gaps cap the family at "partial"; only a
// full, clean sweep is "success".
export function createWebFamilyReportIndex(input: {
  readonly entries: readonly WebFamilyReportEntry[];
  readonly generatedAt?: string;
}): WebFamilyReportIndex {
  const diagnostics: WebDiagnostic[] = [];
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  if (Number.isNaN(Date.parse(generatedAt))) {
    diagnostics.push(webDiagnostic(
      "Galerina_WEB_TIMESTAMP_INVALID",
      "error",
      "Family report index generatedAt must be a parseable timestamp.",
      "generatedAt",
    ));
  }

  const seen = new Set<string>();
  input.entries.forEach((entry, index) => {
    diagnostics.push(...validateWebFamilyReportEntry(entry, `entries.${index}`));

    const key = `${entry.producer}::${entry.kind}`;
    if (seen.has(key)) {
      diagnostics.push(webDiagnostic(
        "Galerina_WEB_REPORT_DUPLICATE",
        "error",
        `Duplicate report entry for ${entry.kind} from ${entry.producer}.`,
        `entries.${index}`,
      ));
    }
    seen.add(key);
  });

  // Coverage: a family package that reported nothing is a gap the index
  // must show, or "everything green" quietly means "everything we heard
  // from was green".
  const producers = new Set(input.entries.map((entry) => entry.producer));
  const missingProducers = WEB_FAMILY_PACKAGES.filter(
    (name) => !producers.has(name),
  );
  for (const missing of missingProducers) {
    diagnostics.push(webDiagnostic(
      "Galerina_WEB_REPORT_COVERAGE_GAP",
      "warning",
      `Web family package "${missing}" produced no report entry.`,
      "entries",
    ));
  }

  const hasErrorDiagnostics = diagnostics.some(
    (diagnostic) => diagnostic.severity === "error",
  );
  const anyFailed = input.entries.some((entry) => entry.status === "failed");
  const anyPartial = input.entries.some((entry) => entry.status === "partial");

  let overallStatus: WebReportStatus;
  if (hasErrorDiagnostics || anyFailed) {
    overallStatus = "failed";
  } else if (anyPartial || missingProducers.length > 0) {
    overallStatus = "partial";
  } else {
    overallStatus = "success";
  }

  return {
    generatedAt,
    overallStatus,
    entries: input.entries,
    missingProducers,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
