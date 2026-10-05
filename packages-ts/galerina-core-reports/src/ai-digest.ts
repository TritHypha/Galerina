/**
 * AI-friendly digests (galerina-core TODO L1006-L1009, W01 design G2).
 *
 * Token-efficient, deterministic, redacted summaries that are safe to hand to an
 * AI assistant. Zero-trust defaults (owner may revisit):
 *   - only allow-listed fields are read, so unknown input fields never leak;
 *   - every free-text string is redacted (absolute paths, bearer tokens,
 *     key=value secrets, long opaque blobs) and capped at 200 characters;
 *   - lists are capped at 50 items with an explicit `truncated` count;
 *   - output order is sorted, so the same input gives the same digest;
 *   - no I/O: callers pass data in and decide where the digest goes.
 */

import type { ReportDiagnostic, ReportSeverity } from "./index.js";

export const AI_DIGEST_MAX_TEXT = 200;
export const AI_DIGEST_MAX_ITEMS = 50;
export const AI_DIGEST_MAX_INPUT = 4096;

export interface AiDigestList<T> {
  readonly items: readonly T[];
  readonly truncated: number;
}

export interface AiDigest<T> {
  readonly text: string;
  readonly json: AiDigestList<T>;
}

const SEVERITY_RANK: Readonly<Record<ReportSeverity, number>> = {
  critical: 0,
  error: 1,
  warning: 2,
  info: 3,
};

const SEVERITY_LETTER: Readonly<Record<ReportSeverity, string>> = {
  critical: "C",
  error: "E",
  warning: "W",
  info: "I",
};

const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const AUTH_VALUES = new Set(["required", "optional", "none"]);
const NAME_RE = /^[A-Za-z0-9@._/:-]{1,64}$/;

/** Redact and bound one free-text string. */
export function aiSafeText(input: string, max: number = AI_DIGEST_MAX_TEXT): string {
  // Bound the work before any regex runs (owner may revisit).
  let text = String(input)
    .slice(0, AI_DIGEST_MAX_INPUT)
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer <redacted>")
    .replace(/\b(api[_-]?key|token|secret|password|passwd|authorization|cookie)\s*[=:]\s*[^\s,;]+/gi, "$1=<redacted>")
    .replace(/[A-Za-z]:[\\/][^\s"'`<>|]*/g, "<path>")
    .replace(/\\\\[^\s"'`<>|]+/g, "<path>")
    .replace(/(^|[\s"'`(=])\/(?:home|Users|root|var|tmp|etc|opt|mnt|private|srv|workspace)\/[^\s"'`<>|]*/g, "$1<path>")
    // Opaque blobs: 32+ token characters containing both a digit and a letter.
    .replace(/\b(?=[A-Za-z0-9+=_]{0,64}\d)(?=[A-Za-z0-9+=_]{0,64}[A-Za-z])[A-Za-z0-9+=_]{32,}/g, "<blob>")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length > max) text = `${text.slice(0, Math.max(0, max - 3))}...`;
  return text;
}

/** Repository-relative path or a placeholder; absolute and escaping paths are refused. */
export function aiSafePath(path: string): string {
  const p = String(path).replace(/\\/g, "/");
  if (p === "") return "<unknown>";
  if (/^[A-Za-z]:\//.test(p) || p.startsWith("/") || p.startsWith("//")) return "<absolute>";
  if (p.split("/").includes("..")) return "<outside>";
  return aiSafeText(p.replace(/^\.\//, ""), 120);
}

function safeName(name: string): string {
  return NAME_RE.test(name) ? name : "<invalid-name>";
}

function bounded<T>(items: readonly T[]): AiDigestList<T> {
  return {
    items: items.slice(0, AI_DIGEST_MAX_ITEMS),
    truncated: Math.max(0, items.length - AI_DIGEST_MAX_ITEMS),
  };
}

function render<T>(list: AiDigestList<T>, line: (item: T) => string, header: string): string {
  const lines = [header, ...list.items.map(line)];
  if (list.truncated > 0) lines.push(`... ${list.truncated} more`);
  return lines.join("\n");
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface AiErrorItem {
  readonly severity: ReportSeverity;
  readonly code: string;
  readonly location: string;
  readonly message: string;
}

/** L1006: token-efficient error report, one line per diagnostic. */
export function aiErrorDigest(diagnostics: readonly ReportDiagnostic[]): AiDigest<AiErrorItem> {
  const items = diagnostics
    .map((d): AiErrorItem => {
      const path = d.source?.path ?? d.path ?? "";
      const line = d.source?.line;
      const location = path === "" ? "-" : `${aiSafePath(path)}${line === undefined ? "" : `:${line}`}`;
      return {
        severity: SEVERITY_RANK[d.severity] === undefined ? "error" : d.severity,
        code: safeName(d.code),
        location,
        message: d.redacted === true ? "<redacted>" : aiSafeText(d.message),
      };
    })
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
        compareText(a.location, b.location) ||
        compareText(a.code, b.code) ||
        compareText(a.message, b.message),
    );
  const json = bounded(items);
  return {
    text: render(json, (i) => `${SEVERITY_LETTER[i.severity]} ${i.code} ${i.location} ${i.message}`, `errors ${items.length}`),
    json,
  };
}

export interface AiProjectInput {
  readonly name: string;
  readonly version?: string;
  readonly packages?: readonly string[];
  readonly targets?: readonly string[];
  readonly flowCount?: number;
  readonly routeCount?: number;
  readonly diagnostics?: { readonly errors: number; readonly warnings: number };
}

export interface AiProjectDigest {
  readonly text: string;
  readonly json: {
    readonly name: string;
    readonly version: string;
    readonly packages: AiDigestList<string>;
    readonly targets: AiDigestList<string>;
    readonly flowCount: number;
    readonly routeCount: number;
    readonly errors: number;
    readonly warnings: number;
  };
}

function count(n: number | undefined): number {
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : 0;
}

/** L1007: AI-safe project summary built only from names and counts. */
export function aiProjectDigest(input: AiProjectInput): AiProjectDigest {
  const names = (xs: readonly string[] | undefined) => bounded([...new Set((xs ?? []).map(safeName))].sort(compareText));
  const json = {
    name: safeName(input.name),
    version: input.version !== undefined && /^[0-9A-Za-z.+-]{1,32}$/.test(input.version) ? input.version : "<unknown>",
    packages: names(input.packages),
    targets: names(input.targets),
    flowCount: count(input.flowCount),
    routeCount: count(input.routeCount),
    errors: count(input.diagnostics?.errors),
    warnings: count(input.diagnostics?.warnings),
  };
  const list = (l: AiDigestList<string>) => `${l.items.join(",")}${l.truncated > 0 ? `,+${l.truncated}` : ""}`;
  const text = [
    `project ${json.name}@${json.version}`,
    `packages ${json.packages.items.length + json.packages.truncated}: ${list(json.packages)}`,
    `targets: ${list(json.targets)}`,
    `flows ${json.flowCount} routes ${json.routeCount} errors ${json.errors} warnings ${json.warnings}`,
  ].join("\n");
  return { text, json };
}

export interface AiRouteInput {
  readonly method: string;
  readonly path: string;
  readonly auth?: string;
}

export interface AiRouteItem {
  readonly method: string;
  readonly path: string;
  readonly auth: string;
}

/** L1008: route summary (method, path and auth requirement only; query strings dropped). */
export function aiRouteDigest(routes: readonly AiRouteInput[]): AiDigest<AiRouteItem> {
  const items = routes
    .map((r): AiRouteItem => {
      const method = String(r.method).toUpperCase();
      const rawPath = String(r.path).split(/[?#]/)[0] ?? "";
      const path = rawPath.startsWith("/") && /^[\x21-\x7e]+$/.test(rawPath) ? aiSafeText(rawPath, 120) : "<invalid-path>";
      return {
        method: HTTP_METHODS.has(method) ? method : "INVALID",
        path,
        // Zero-trust: an undeclared auth requirement is reported as unknown, never as "none".
        auth: r.auth !== undefined && AUTH_VALUES.has(r.auth) ? r.auth : "unknown",
      };
    })
    .sort((a, b) => compareText(a.path, b.path) || compareText(a.method, b.method));
  const json = bounded(items);
  return { text: render(json, (i) => `${i.method} ${i.path} auth=${i.auth}`, `routes ${items.length}`), json };
}

export interface AiTypeFieldInput {
  readonly name: string;
  readonly type: string;
  readonly secret?: boolean;
}

export interface AiTypeInput {
  readonly name: string;
  readonly kind: string;
  readonly fields?: readonly AiTypeFieldInput[];
}

export interface AiTypeItem {
  readonly name: string;
  readonly kind: string;
  readonly fields: AiDigestList<string>;
}

/** L1009: type summary; secret fields show as SecureString, never with any value or default. */
export function aiTypeDigest(types: readonly AiTypeInput[]): AiDigest<AiTypeItem> {
  const items = types
    .map((t): AiTypeItem => ({
      name: safeName(t.name),
      kind: safeName(t.kind),
      fields: bounded((t.fields ?? []).map((f) => `${safeName(f.name)}:${f.secret === true ? "SecureString" : safeName(f.type)}`)),
    }))
    .sort((a, b) => compareText(a.name, b.name));
  const json = bounded(items);
  const line = (i: AiTypeItem) =>
    `${i.kind} ${i.name}{${i.fields.items.join(",")}${i.fields.truncated > 0 ? `,+${i.fields.truncated}` : ""}}`;
  return { text: render(json, line, `types ${items.length}`), json };
}
