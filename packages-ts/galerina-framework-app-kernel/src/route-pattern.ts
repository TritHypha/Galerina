/**
 * Route path patterns with `:param` segments (pure, not wired).
 *
 * The kernel routing table matches exact paths only (kernel.ts byPath lookup).
 * The docs package already reads `:param` and `{param}` segments when it
 * generates OpenAPI paths (galerina-docs/src/openapi.ts convertPath). This
 * module is the closed, fail-closed grammar and matcher that the kernel could
 * adopt. It is NOT consulted by createAppKernel: wiring it into the request
 * path is a separate kernel change that needs owner review.
 *
 * Zero-trust choices (owner may revisit):
 * - Closed grammar. A literal segment is RFC 3986 unreserved characters only,
 *   and a parameter name is an identifier. Wildcards, regex segments, optional
 *   segments, and percent-encoding in patterns are refused.
 * - No precedence rules. Two patterns that could both match one request path
 *   (for example `/users/me` and `/users/:id`) are refused as ambiguous, rather
 *   than inventing a literal-beats-parameter order.
 * - Request values are never decoded. A parameter value is the raw segment.
 *   Empty segments, dot segments, and encoded `/` or `\` are refused, so a
 *   value can never move across a path boundary.
 * - Diagnostics never echo the input text, only a code, a reason, and an index.
 */

export const ROUTE_PATTERN_MAX_PATH_CHARS = 2048;
export const ROUTE_PATTERN_MAX_SEGMENTS = 32;
export const ROUTE_PATTERN_MAX_PARAMS = 16;
export const ROUTE_PATTERN_MAX_PARAM_NAME_CHARS = 64;
export const ROUTE_PATTERN_MAX_VALUE_CHARS = 256;

/** Pattern is not a string, not absolute, too long, or has an empty or trailing segment. */
export const FUNGI_APPK_RPT_001 = "FUNGI-APPK-RPT-001";
/** A segment is outside the closed literal or parameter grammar. */
export const FUNGI_APPK_RPT_002 = "FUNGI-APPK-RPT-002";
/** A parameter name repeats within one pattern. */
export const FUNGI_APPK_RPT_003 = "FUNGI-APPK-RPT-003";
/** Segment or parameter count exceeds the bound. */
export const FUNGI_APPK_RPT_004 = "FUNGI-APPK-RPT-004";
/** Two patterns could match the same request path (ambiguous or duplicate). */
export const FUNGI_APPK_RPT_005 = "FUNGI-APPK-RPT-005";

export type RoutePatternSegment =
  | { readonly kind: "literal"; readonly value: string }
  | { readonly kind: "param"; readonly name: string };

export interface RoutePattern {
  /** Canonical form: parameters written as `:name`. */
  readonly canonical: string;
  readonly segments: readonly RoutePatternSegment[];
  readonly params: readonly string[];
}

export interface RoutePatternDiagnostic {
  readonly code: string;
  readonly reason: string;
  /** Index of the offending segment, or of the offending pattern for conflicts. */
  readonly index?: number;
  /** Index of the earlier pattern a conflict collides with. */
  readonly otherIndex?: number;
}

export type RoutePatternResult =
  | { readonly ok: true; readonly pattern: RoutePattern }
  | { readonly ok: false; readonly diagnostics: readonly RoutePatternDiagnostic[] };

export type RoutePatternConflictResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly diagnostics: readonly RoutePatternDiagnostic[] };

const LITERAL_RE = /^[A-Za-z0-9._~-]+$/;
const PARAM_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const VALUE_RE = /^[A-Za-z0-9._~!$&'()*+,;=:@%-]+$/;
const ENCODED_SEPARATOR_RE = /%(?:2f|5c)/i;
const PERCENT_TRIPLET_RE = /%(?![0-9A-Fa-f]{2})/;

function diag(code: string, reason: string, index?: number, otherIndex?: number): RoutePatternDiagnostic {
  const d: { code: string; reason: string; index?: number; otherIndex?: number } = { code, reason };
  if (index !== undefined) d.index = index;
  if (otherIndex !== undefined) d.otherIndex = otherIndex;
  return Object.freeze(d);
}

function refused(diagnostics: RoutePatternDiagnostic[]): RoutePatternResult {
  return Object.freeze({ ok: false as const, diagnostics: Object.freeze(diagnostics) });
}

function isDotSegment(segment: string): boolean {
  return segment === "." || segment === "..";
}

function parseSegment(raw: string, index: number): RoutePatternSegment | RoutePatternDiagnostic {
  let name: string | undefined;
  if (raw.startsWith(":")) name = raw.slice(1);
  else if (raw.startsWith("{") && raw.endsWith("}") && raw.length >= 2) name = raw.slice(1, -1);
  if (name !== undefined) {
    if (name.length === 0 || name.length > ROUTE_PATTERN_MAX_PARAM_NAME_CHARS || !PARAM_NAME_RE.test(name)) {
      return diag(FUNGI_APPK_RPT_002, "parameter name is outside the identifier grammar", index);
    }
    return Object.freeze({ kind: "param" as const, name });
  }
  if (!LITERAL_RE.test(raw) || isDotSegment(raw)) {
    return diag(FUNGI_APPK_RPT_002, "literal segment is outside the unreserved grammar", index);
  }
  return Object.freeze({ kind: "literal" as const, value: raw });
}

/** Compile one route path pattern. Fails closed on anything outside the grammar. */
export function compileRoutePattern(path: unknown): RoutePatternResult {
  if (typeof path !== "string") return refused([diag(FUNGI_APPK_RPT_001, "pattern must be a string")]);
  if (path.length === 0 || path.length > ROUTE_PATTERN_MAX_PATH_CHARS || !path.startsWith("/")) {
    return refused([diag(FUNGI_APPK_RPT_001, "pattern must be an absolute path within the length bound")]);
  }
  if (path === "/") {
    return Object.freeze({
      ok: true as const,
      pattern: Object.freeze({ canonical: "/", segments: Object.freeze([]), params: Object.freeze([]) }),
    });
  }
  const rawSegments = path.slice(1).split("/");
  if (rawSegments.length > ROUTE_PATTERN_MAX_SEGMENTS) {
    return refused([diag(FUNGI_APPK_RPT_004, "pattern has too many segments")]);
  }
  const diagnostics: RoutePatternDiagnostic[] = [];
  const segments: RoutePatternSegment[] = [];
  const params: string[] = [];
  const seen = new Set<string>();
  rawSegments.forEach((raw, index) => {
    if (raw.length === 0) {
      diagnostics.push(diag(FUNGI_APPK_RPT_001, "pattern has an empty or trailing segment", index));
      return;
    }
    const parsed = parseSegment(raw, index);
    if ("code" in parsed) {
      diagnostics.push(parsed);
      return;
    }
    if (parsed.kind === "param") {
      if (seen.has(parsed.name)) {
        diagnostics.push(diag(FUNGI_APPK_RPT_003, "parameter name repeats within the pattern", index));
        return;
      }
      seen.add(parsed.name);
      params.push(parsed.name);
    }
    segments.push(parsed);
  });
  if (params.length > ROUTE_PATTERN_MAX_PARAMS) {
    diagnostics.push(diag(FUNGI_APPK_RPT_004, "pattern has too many parameters"));
  }
  if (diagnostics.length > 0) return refused(diagnostics);
  const canonical = "/" + segments.map((s) => (s.kind === "param" ? `:${s.name}` : s.value)).join("/");
  return Object.freeze({
    ok: true as const,
    pattern: Object.freeze({ canonical, segments: Object.freeze(segments), params: Object.freeze(params) }),
  });
}

/**
 * Match a request path against a compiled pattern. Returns a frozen,
 * null-prototype record of raw (undecoded) parameter values, or undefined when
 * the path does not match or carries an unsafe segment.
 */
export function matchRoutePattern(
  pattern: RoutePattern,
  requestPath: unknown,
): Readonly<Record<string, string>> | undefined {
  if (typeof requestPath !== "string" || requestPath.length > ROUTE_PATTERN_MAX_PATH_CHARS) return undefined;
  if (!requestPath.startsWith("/")) return undefined;
  const values: Record<string, string> = Object.create(null) as Record<string, string>;
  if (requestPath === "/") return pattern.segments.length === 0 ? Object.freeze(values) : undefined;
  const parts = requestPath.slice(1).split("/");
  if (parts.length !== pattern.segments.length) return undefined;
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i] as string;
    const segment = pattern.segments[i] as RoutePatternSegment;
    if (segment.kind === "literal") {
      if (part !== segment.value) return undefined;
      continue;
    }
    if (
      part.length === 0 ||
      part.length > ROUTE_PATTERN_MAX_VALUE_CHARS ||
      isDotSegment(part) ||
      !VALUE_RE.test(part) ||
      ENCODED_SEPARATOR_RE.test(part) ||
      PERCENT_TRIPLET_RE.test(part)
    ) {
      return undefined;
    }
    values[segment.name] = part;
  }
  return Object.freeze(values);
}

function overlaps(a: RoutePattern, b: RoutePattern): boolean {
  if (a.segments.length !== b.segments.length) return false;
  for (let i = 0; i < a.segments.length; i += 1) {
    const x = a.segments[i] as RoutePatternSegment;
    const y = b.segments[i] as RoutePatternSegment;
    if (x.kind === "literal" && y.kind === "literal" && x.value !== y.value) return false;
  }
  return true;
}

/**
 * Refuse any pair of patterns that could match the same request path. With no
 * precedence rules, an overlap is always a configuration error. Callers check
 * per method: two methods may share one pattern.
 */
export function checkRoutePatternConflicts(patterns: readonly RoutePattern[]): RoutePatternConflictResult {
  const diagnostics: RoutePatternDiagnostic[] = [];
  for (let i = 0; i < patterns.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (overlaps(patterns[j] as RoutePattern, patterns[i] as RoutePattern)) {
        diagnostics.push(diag(FUNGI_APPK_RPT_005, "patterns can match the same request path", i, j));
      }
    }
  }
  return diagnostics.length === 0
    ? Object.freeze({ ok: true as const })
    : Object.freeze({ ok: false as const, diagnostics: Object.freeze(diagnostics) });
}