// Browser route, navigation and link contracts.
//
// This package defines typed route boundaries for the Galerina web family —
// not a server router, API server or SPA framework. Routes are typed path
// templates: every ":param" segment must declare a validator kind from a
// known set (mirroring the galerina-data-query placeholder discipline — an
// undeclared parameter is an error, a declared-but-unused parameter is a
// warning). Link generation is deny-by-default: only relative paths, https,
// localhost-only http and mailto are expressible outcomes; javascript:,
// data: and vbscript: are errors, protocol-relative targets are errors, and
// any scheme outside the allowlist is an error rather than a default.
// Route-level data fetching names its query/response contracts as reference
// strings into the data family, never imports. Preloading is bounded.

export type WebRouterDiagnosticSeverity = "warning" | "error";

export interface WebRouterDiagnostic {
  readonly code: string;
  readonly severity: WebRouterDiagnosticSeverity;
  readonly message: string;
  readonly path?: string;
}

// Route parameters are validated, never trusted: URL parameters are
// attacker-controlled input. Every template parameter declares its
// validator kind from this set.
export type RouteParamValidatorKind = "string" | "integer" | "uuid" | "slug";

export const KNOWN_ROUTE_PARAM_VALIDATORS: readonly RouteParamValidatorKind[] = [
  "string",
  "integer",
  "uuid",
  "slug",
];

export interface RouteParamDeclaration {
  readonly name: string;
  readonly validator: RouteParamValidatorKind;
}

// Route-level data fetching consumes the typed data family by name; refs are
// strings into sibling packages (e.g. "@galerina/data-query#FindProduct"),
// never imports.
export interface RouteDataFetchContract {
  readonly queryContractRef: string;
  readonly responseContractRef: string;
}

export interface RouteContract {
  readonly name: string;
  /** Path template with ":param" segments, e.g. "/products/:productId". */
  readonly pathTemplate: string;
  readonly params: readonly RouteParamDeclaration[];
  readonly dataFetch?: RouteDataFetchContract;
}

// Preloading is bounded work: an unbounded preload policy is a self-DoS.
export interface RoutePreloadPolicy {
  readonly maxPreloadRoutes: number;
}

export type WebRouterCheck = "routes" | "links" | "dataFetch" | "preload";

export type WebRouterCheckOutcome = "pass" | "fail";

export type WebRouterReportStatus = "success" | "partial" | "failed";

export interface WebRouteReport {
  readonly routeCount: number;
  readonly status: WebRouterReportStatus;
  readonly checks: Readonly<Record<WebRouterCheck, WebRouterCheckOutcome>>;
  readonly diagnostics: readonly WebRouterDiagnostic[];
  readonly warnings: readonly string[];
}

export const WEB_ROUTER_CHECKS: readonly WebRouterCheck[] = [
  "routes",
  "links",
  "dataFetch",
  "preload",
];

const KNOWN_VALIDATORS: ReadonlySet<string> = new Set(KNOWN_ROUTE_PARAM_VALIDATORS);

// Executable-content schemes that may never be generated as links. Their
// presence is an error, not a warning: a javascript: href is script
// injection by navigation.
const FORBIDDEN_LINK_SCHEMES: ReadonlySet<string> = new Set([
  "javascript",
  "data",
  "vbscript",
]);

const LOCALHOST_HOSTS: ReadonlySet<string> = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
]);

const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/;

// Every error code maps to exactly one report check, so a failed check is
// always explained by a diagnostic and never asserted by the caller.
const CHECK_CODES: Readonly<Record<WebRouterCheck, readonly string[]>> = {
  routes: [
    "Galerina_WEB_ROUTER_ROUTE_NAME_REQUIRED",
    "Galerina_WEB_ROUTER_PATH_TEMPLATE_REQUIRED",
    "Galerina_WEB_ROUTER_PATH_PARAM_MALFORMED",
    "Galerina_WEB_ROUTER_PARAM_NAME_REQUIRED",
    "Galerina_WEB_ROUTER_PARAM_DUPLICATE",
    "Galerina_WEB_ROUTER_PARAM_VALIDATOR_UNKNOWN",
    "Galerina_WEB_ROUTER_PARAM_UNDECLARED",
  ],
  links: [
    "Galerina_WEB_ROUTER_LINK_TARGET_REQUIRED",
    "Galerina_WEB_ROUTER_LINK_PROTOCOL_RELATIVE_FORBIDDEN",
    "Galerina_WEB_ROUTER_LINK_SCHEME_FORBIDDEN",
    "Galerina_WEB_ROUTER_LINK_SCHEME_UNKNOWN",
    "Galerina_WEB_ROUTER_LINK_HTTP_REQUIRES_LOCALHOST",
  ],
  dataFetch: [
    "Galerina_WEB_ROUTER_QUERY_CONTRACT_REF_REQUIRED",
    "Galerina_WEB_ROUTER_RESPONSE_CONTRACT_REF_REQUIRED",
  ],
  preload: ["Galerina_WEB_ROUTER_PRELOAD_BOUND_REQUIRED"],
};

function routerDiagnostic(
  code: string,
  severity: WebRouterDiagnosticSeverity,
  message: string,
  path?: string,
): WebRouterDiagnostic {
  return {
    code,
    severity,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

interface TemplateParse {
  readonly paramNames: readonly string[];
  readonly malformedSegments: readonly number[];
}

function parseTemplateParams(pathTemplate: string): TemplateParse {
  const paramNames: string[] = [];
  const malformedSegments: number[] = [];

  pathTemplate.split("/").forEach((segment, index) => {
    if (!segment.startsWith(":")) {
      return;
    }
    const name = segment.slice(1).trim();
    if (name.length === 0) {
      malformedSegments.push(index);
      return;
    }
    paramNames.push(name);
  });

  return { paramNames, malformedSegments };
}

// Typed routes: every ":param" in the template must be declared with a
// validator; a declared parameter the template never uses is dead weight
// (warning); an unknown validator kind is rejected, never defaulted.
export function validateRouteContract(
  route: RouteContract,
  path = "route",
): readonly WebRouterDiagnostic[] {
  const diagnostics: WebRouterDiagnostic[] = [];

  if (route.name.trim().length === 0) {
    diagnostics.push(routerDiagnostic(
      "Galerina_WEB_ROUTER_ROUTE_NAME_REQUIRED",
      "error",
      "Route contract requires a name.",
      `${path}.name`,
    ));
  }

  const template = route.pathTemplate.trim();
  let templateParams: readonly string[] = [];
  let templateParsed = false;

  if (template.length === 0) {
    diagnostics.push(routerDiagnostic(
      "Galerina_WEB_ROUTER_PATH_TEMPLATE_REQUIRED",
      "error",
      "Route contract requires a path template.",
      `${path}.pathTemplate`,
    ));
  } else {
    templateParsed = true;
    const parsed = parseTemplateParams(template);
    templateParams = parsed.paramNames;
    for (const segmentIndex of parsed.malformedSegments) {
      diagnostics.push(routerDiagnostic(
        "Galerina_WEB_ROUTER_PATH_PARAM_MALFORMED",
        "error",
        `Path template segment ${segmentIndex} declares ":" without a parameter name.`,
        `${path}.pathTemplate`,
      ));
    }
  }

  const declared = new Set<string>();
  route.params.forEach((param, index) => {
    const name = param.name.trim();
    if (name.length === 0) {
      diagnostics.push(routerDiagnostic(
        "Galerina_WEB_ROUTER_PARAM_NAME_REQUIRED",
        "error",
        "Route parameter declaration requires a name.",
        `${path}.params.${index}.name`,
      ));
    } else if (declared.has(name)) {
      diagnostics.push(routerDiagnostic(
        "Galerina_WEB_ROUTER_PARAM_DUPLICATE",
        "error",
        `Route parameter "${name}" is declared more than once.`,
        `${path}.params.${index}.name`,
      ));
    } else {
      declared.add(name);
    }

    if (!KNOWN_VALIDATORS.has(param.validator)) {
      diagnostics.push(routerDiagnostic(
        "Galerina_WEB_ROUTER_PARAM_VALIDATOR_UNKNOWN",
        "error",
        `Route parameter validator "${String(param.validator)}" is not in the known set (string/integer/uuid/slug); unvalidated URL input is rejected.`,
        `${path}.params.${index}.validator`,
      ));
    }
  });

  for (const templateParam of templateParams) {
    if (!declared.has(templateParam)) {
      diagnostics.push(routerDiagnostic(
        "Galerina_WEB_ROUTER_PARAM_UNDECLARED",
        "error",
        `Path template parameter ":${templateParam}" has no declared validator; URL parameters are untrusted input.`,
        `${path}.pathTemplate`,
      ));
    }
  }

  if (templateParsed) {
    const inTemplate = new Set(templateParams);
    route.params.forEach((param, index) => {
      const name = param.name.trim();
      if (name.length > 0 && !inTemplate.has(name)) {
        diagnostics.push(routerDiagnostic(
          "Galerina_WEB_ROUTER_PARAM_UNUSED",
          "warning",
          `Route parameter "${name}" is declared but never appears in the path template.`,
          `${path}.params.${index}.name`,
        ));
      }
    });
  }

  if (route.dataFetch !== undefined) {
    diagnostics.push(...validateRouteDataFetchContract(route.dataFetch, `${path}.dataFetch`));
  }

  return diagnostics;
}

export function validateRouteDataFetchContract(
  dataFetch: RouteDataFetchContract,
  path = "dataFetch",
): readonly WebRouterDiagnostic[] {
  const diagnostics: WebRouterDiagnostic[] = [];

  if (dataFetch.queryContractRef.trim().length === 0) {
    diagnostics.push(routerDiagnostic(
      "Galerina_WEB_ROUTER_QUERY_CONTRACT_REF_REQUIRED",
      "error",
      "Route data fetch must name its galerina-data-query contract reference.",
      `${path}.queryContractRef`,
    ));
  }

  if (dataFetch.responseContractRef.trim().length === 0) {
    diagnostics.push(routerDiagnostic(
      "Galerina_WEB_ROUTER_RESPONSE_CONTRACT_REF_REQUIRED",
      "error",
      "Route data fetch must name its galerina-data-response contract reference.",
      `${path}.responseContractRef`,
    ));
  }

  return diagnostics;
}

function httpHostIsLocalhost(compact: string): boolean {
  const rest = compact.slice("http:".length);
  if (!rest.startsWith("//")) {
    // "http:evil" is not a well-formed absolute http URL; fail closed.
    return false;
  }
  let authority = rest.slice(2);
  for (const stop of ["/", "?", "#"]) {
    const stopIndex = authority.indexOf(stop);
    if (stopIndex !== -1) {
      authority = authority.slice(0, stopIndex);
    }
  }
  // The real host follows any userinfo: "localhost@evil.example" navigates
  // to evil.example, so the part after the last "@" is what gets checked.
  const atIndex = authority.lastIndexOf("@");
  if (atIndex !== -1) {
    authority = authority.slice(atIndex + 1);
  }
  let host = authority;
  if (host.startsWith("[")) {
    const closeIndex = host.indexOf("]");
    host = closeIndex === -1 ? host.slice(1) : host.slice(1, closeIndex);
  } else {
    const colonIndex = host.indexOf(":");
    if (colonIndex !== -1) {
      host = host.slice(0, colonIndex);
    }
  }
  return LOCALHOST_HOSTS.has(host);
}

// Safe link generation, deny-by-default. The allowlist of expressible link
// outcomes is: relative, https, http-to-localhost-only, mailto. Executable
// schemes are errors; protocol-relative targets ("//host") are errors
// because they navigate cross-origin while looking relative; any other
// scheme is an error rather than a default. Scheme detection strips ASCII
// control characters and whitespace first, so "java\tscript:" cannot slip
// past the gate.
export function validateLinkTarget(
  href: string,
  path = "link",
): readonly WebRouterDiagnostic[] {
  const diagnostics: WebRouterDiagnostic[] = [];

  const trimmed = href.trim();
  if (trimmed.length === 0) {
    diagnostics.push(routerDiagnostic(
      "Galerina_WEB_ROUTER_LINK_TARGET_REQUIRED",
      "error",
      "Link target must be non-empty.",
      path,
    ));
    return diagnostics;
  }

  const compact = trimmed.replace(/[\u0000-\u0020]/g, "").toLowerCase();

  if (compact.startsWith("//")) {
    diagnostics.push(routerDiagnostic(
      "Galerina_WEB_ROUTER_LINK_PROTOCOL_RELATIVE_FORBIDDEN",
      "error",
      `Link target "${trimmed}" is protocol-relative; it looks relative but navigates to another host, so it is denied.`,
      path,
    ));
    return diagnostics;
  }

  const schemeMatch = SCHEME_PATTERN.exec(compact);
  if (schemeMatch === null) {
    // No scheme: a relative target (path, query or fragment). Allowed.
    return diagnostics;
  }

  const scheme = schemeMatch[1];
  if (scheme === undefined) {
    return diagnostics;
  }

  if (FORBIDDEN_LINK_SCHEMES.has(scheme)) {
    diagnostics.push(routerDiagnostic(
      "Galerina_WEB_ROUTER_LINK_SCHEME_FORBIDDEN",
      "error",
      `Link scheme "${scheme}:" is executable content and may never be generated as a link.`,
      path,
    ));
    return diagnostics;
  }

  if (scheme === "https" || scheme === "mailto") {
    return diagnostics;
  }

  if (scheme === "http") {
    if (!httpHostIsLocalhost(compact)) {
      diagnostics.push(routerDiagnostic(
        "Galerina_WEB_ROUTER_LINK_HTTP_REQUIRES_LOCALHOST",
        "error",
        `Link target "${trimmed}" uses cleartext http to a non-localhost host; http links are localhost-only.`,
        path,
      ));
    }
    return diagnostics;
  }

  diagnostics.push(routerDiagnostic(
    "Galerina_WEB_ROUTER_LINK_SCHEME_UNKNOWN",
    "error",
    `Link scheme "${scheme}:" is not in the allowlist (relative/https/http-localhost/mailto); unknown schemes are denied by default.`,
    path,
  ));
  return diagnostics;
}

export function validateRoutePreloadPolicy(
  policy: RoutePreloadPolicy,
  path = "preload",
): readonly WebRouterDiagnostic[] {
  const diagnostics: WebRouterDiagnostic[] = [];

  if (!isPositiveSafeInteger(policy.maxPreloadRoutes)) {
    diagnostics.push(routerDiagnostic(
      "Galerina_WEB_ROUTER_PRELOAD_BOUND_REQUIRED",
      "error",
      "Route preload policy requires a positive integer maxPreloadRoutes; unbounded preloading is unbounded work.",
      `${path}.maxPreloadRoutes`,
    ));
  }

  return diagnostics;
}

// Status is arithmetic, not assertion: derived from the diagnostics the
// validators actually produced, never accepted from the caller.
export function deriveWebRouterReportStatus(
  diagnostics: readonly WebRouterDiagnostic[],
): WebRouterReportStatus {
  if (diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    return "failed";
  }
  if (diagnostics.some((diagnostic) => diagnostic.severity === "warning")) {
    return "partial";
  }
  return "success";
}

export function createWebRouteReport(input: {
  readonly routes: readonly RouteContract[];
  readonly links?: readonly string[];
  readonly preload: RoutePreloadPolicy;
}): WebRouteReport {
  const diagnostics: WebRouterDiagnostic[] = [];

  input.routes.forEach((route, index) => {
    diagnostics.push(...validateRouteContract(route, `routes.${index}`));
  });

  const links = input.links ?? [];
  links.forEach((link, index) => {
    diagnostics.push(...validateLinkTarget(link, `links.${index}`));
  });

  diagnostics.push(...validateRoutePreloadPolicy(input.preload));

  const errorCodes = new Set(
    diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .map((diagnostic) => diagnostic.code),
  );

  const checks = {} as Record<WebRouterCheck, WebRouterCheckOutcome>;
  for (const check of WEB_ROUTER_CHECKS) {
    checks[check] = CHECK_CODES[check].some((code) => errorCodes.has(code))
      ? "fail"
      : "pass";
  }

  return {
    routeCount: input.routes.length,
    status: deriveWebRouterReportStatus(diagnostics),
    checks,
    diagnostics,
    warnings: diagnostics
      .filter((diagnostic) => diagnostic.severity === "warning")
      .map((diagnostic) => diagnostic.message),
  };
}
