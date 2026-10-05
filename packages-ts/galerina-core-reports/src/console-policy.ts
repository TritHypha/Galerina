/**
 * Debug console policy (galerina-core TODO L831-L836, W01 design G4).
 *
 * Policy values and pure renderers only: this module defines no console syntax
 * (L829/L830 and the compiler prototype L837 stay with the language owner) and
 * performs no I/O. A host prints the returned line when `emit` returns one.
 *
 * Defensive debug-output defaults (not a confidentiality boundary):
 *   - production allows `warn` and `error` only; everything else is dropped and
 *     counted, and an unknown mode is treated as production;
 *   - SecureString values and secret-named entries always render as [REDACTED];
 *   - dumps are capped at 4096 bytes, depth 4 and 100 keys, with explicit markers;
 *   - JSON over 4096 bytes is summarised as key paths and types, never values;
 *   - every free-text string goes through the AI-digest redactor.
 */

import { aiSafeText } from "./ai-digest.js";

export type ConsoleMode = "debug" | "production";
export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug" | "dump" | "scope" | "vars";

export const CONSOLE_LEVELS: readonly ConsoleLevel[] = ["log", "info", "warn", "error", "debug", "dump", "scope", "vars"];
export const CONSOLE_DUMP_LIMITS = { maxBytes: 4096, maxDepth: 4, maxKeys: 100 } as const;
export const CONSOLE_REDACTED = "[REDACTED]";
export const CONSOLE_REPORT_SCHEMA = "galerina.console-report.v1";
const INSPECTION_REFUSED = "[inspection refused]";

const SECRET_TERMS = new Set([
  "secret", "password", "passwd", "passphrase", "token", "credential", "credentials",
  "authorization", "bearer", "cookie", "session", "refresh", "jwt", "otp", "pin",
  "nonce", "csrf", "seed", "connectionstring",
]);
const KEY_PREFIX_TERMS = new Set(["api", "access", "private", "client", "signing", "encryption", "master"]);

function isSensitiveName(name: string): boolean {
  const words = name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (words.some((word) => SECRET_TERMS.has(word))) return true;
  return words.some((word, index) =>
    (KEY_PREFIX_TERMS.has(word) && words[index + 1] === "key") ||
    (word === "connection" && words[index + 1] === "string"),
  );
}

export interface ConsolePolicy {
  readonly mode: ConsoleMode;
  readonly allowed: readonly ConsoleLevel[];
  readonly limits: typeof CONSOLE_DUMP_LIMITS;
}

/** L835: production console policy. Unknown modes fail closed to production. */
export function consolePolicy(mode: string): ConsolePolicy {
  const resolved: ConsoleMode = mode === "debug" ? "debug" : "production";
  return {
    mode: resolved,
    allowed: resolved === "debug" ? CONSOLE_LEVELS : ["warn", "error"],
    limits: CONSOLE_DUMP_LIMITS,
  };
}

function isSecureString(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "kind");
    return descriptor !== undefined && "value" in descriptor && descriptor.value === "SecureString";
  } catch {
    return false;
  }
}

function typeTag(value: unknown): string {
  try {
    if (Array.isArray(value)) return "array";
  } catch {
    return "unknown";
  }
  if (value === null) return "null";
  if (isSecureString(value)) return "SecureString";
  return typeof value;
}

interface RenderState {
  redacted: number;
  nodes: number;
}

type SafeEntry = readonly [string, unknown];
interface SafeInspection {
  readonly entries: readonly SafeEntry[];
  readonly total: number;
  readonly array: boolean;
}

/** Read only enumerable own data properties; never invoke accessors. */
function safeEntries(value: object): SafeInspection | null {
  try {
    const array = Array.isArray(value);
    if (!array) {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) return null;
    }
    const allKeys = Object.keys(value);
    const keys = allKeys.slice(0, CONSOLE_DUMP_LIMITS.maxKeys);
    const entries: SafeEntry[] = [];
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return null;
      entries.push([key, descriptor.value]);
    }
    for (const symbol of Object.getOwnPropertySymbols(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, symbol);
      if (descriptor?.enumerable) return null;
    }
    return { entries, total: allKeys.length, array };
  } catch {
    return null;
  }
}

function renderValue(value: unknown, depth: number, state: RenderState, seen: Set<object>): string {
  if (state.nodes >= CONSOLE_DUMP_LIMITS.maxKeys) return "[truncated]";
  state.nodes++;
  if (isSecureString(value)) {
    state.redacted++;
    return CONSOLE_REDACTED;
  }
  if (typeof value === "string") return JSON.stringify(aiSafeText(value, CONSOLE_DUMP_LIMITS.maxBytes));
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value !== "object" || value === null) return typeTag(value);
  if (seen.has(value)) return "[circular]";
  if (depth >= CONSOLE_DUMP_LIMITS.maxDepth) return "[depth]";
  const inspection = safeEntries(value);
  if (inspection === null) return INSPECTION_REFUSED;
  seen.add(value);
  const shown = inspection.entries.map(([k, v]) => {
    const array = inspection.array;
    if (!array && isSensitiveName(k)) {
      state.redacted++;
      return `${JSON.stringify(k)}:${JSON.stringify(CONSOLE_REDACTED)}`;
    }
    const rendered = renderValue(v, depth + 1, state, seen);
    return array ? rendered : `${JSON.stringify(k)}:${rendered}`;
  });
  seen.delete(value);
  const more = inspection.total - shown.length;
  if (more > 0) shown.push(JSON.stringify(`+${more} more`));
  return inspection.array ? `[${shown.join(",")}]` : `{${shown.join(",")}}`;
}

/** UTF-8 byte length without Node typings (no Buffer dependency). */
function utf8Length(text: string): number {
  let n = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < text.length) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

function utf8Prefix(text: string, maxBytes: number): string {
  let prefix = "";
  let bytes = 0;
  for (const character of text) {
    const size = utf8Length(character);
    if (bytes + size > maxBytes) break;
    prefix += character;
    bytes += size;
  }
  return prefix;
}

function capBytes(text: string): string {
  const max = CONSOLE_DUMP_LIMITS.maxBytes;
  const bytes = utf8Length(text);
  if (bytes <= max) return text;
  let prefix = utf8Prefix(text, max - 32);
  while (true) {
    const suffix = `...[truncated ${bytes - utf8Length(prefix)} bytes]`;
    const next = utf8Prefix(text, max - utf8Length(suffix));
    if (next === prefix) return `${prefix}${suffix}`;
    prefix = next;
  }
}

/**
 * L832/L833: bounded, redacted rendering of inert data. This is not a sandbox:
 * reflective operations on a Proxy may execute its traps, so callers must not
 * pass attacker-controlled live objects as a confidentiality boundary.
 */
export function renderConsoleValue(value: unknown): { readonly text: string; readonly redacted: number } {
  const state: RenderState = { redacted: 0, nodes: 0 };
  return { text: capBytes(renderValue(value, 0, state, new Set())), redacted: state.redacted };
}

/** L834: summary of a large JSON value as key paths, types and counts (never values). */
export function summarizeLargeJson(value: unknown): { readonly text: string; readonly paths: number; readonly truncated: number } {
  const lines: string[] = [];
  let total = 0;
  let truncated = 0;
  const walk = (v: unknown, path: string, depth: number, seen: Set<object>): void => {
    if (total >= CONSOLE_DUMP_LIMITS.maxKeys) {
      truncated++;
      return;
    }
    total++;
    const tag = typeTag(v);
    const inspection = typeof v === "object" && v !== null && !isSecureString(v) ? safeEntries(v) : null;
    if (typeof v === "object" && v !== null && !isSecureString(v) && inspection === null) throw new Error("inspection refused");
    const size = inspection?.array ? `[${inspection.total}]` : inspection !== null ? `{${inspection.total}}` : "";
    if (lines.length < CONSOLE_DUMP_LIMITS.maxKeys - 1) lines.push(`${path || "$"}: ${tag}${size}`);
    if (typeof v !== "object" || v === null || isSecureString(v) || depth >= CONSOLE_DUMP_LIMITS.maxDepth || seen.has(v)) return;
    seen.add(v);
    const children = inspection?.entries ?? [];
    for (let i = 0; i < children.length; i++) {
      if (total >= CONSOLE_DUMP_LIMITS.maxKeys) {
        truncated += children.length - i;
        break;
      }
      const [k, child] = children[i]!;
      walk(child, `${path}.${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}`, depth + 1, seen);
    }
    seen.delete(v);
  };
  try {
    walk(value, "$", 0, new Set());
  } catch {
    return { text: INSPECTION_REFUSED, paths: 0, truncated: 0 };
  }
  if (truncated > 0) lines.push(`... at least ${truncated} more path branches`);
  return { text: capBytes(lines.join("\n")), paths: total, truncated };
}

/** L831: scope/vars rendering: names and type tags; values only for safe primitives. */
export function renderConsoleScope(vars: Readonly<Record<string, unknown>>): { readonly text: string; readonly redacted: number } {
  const entries = safeEntries(vars);
  if (entries === null) return { text: INSPECTION_REFUSED, redacted: 0 };
  let redacted = 0;
  const names = [...entries.entries].sort(([a], [b]) => a.localeCompare(b));
  const shown = names.map(([name, v]) => {
    const tag = typeTag(v);
    if (isSensitiveName(name) || isSecureString(v)) {
      redacted++;
      return `${name}: ${tag} = ${CONSOLE_REDACTED}`;
    }
    if (typeof v === "number" || typeof v === "boolean") return `${name}: ${tag} = ${String(v)}`;
    if (typeof v === "string" && v.length <= 64) return `${name}: ${tag} = ${JSON.stringify(aiSafeText(v, 64))}`;
    return `${name}: ${tag}`;
  });
  if (entries.total > shown.length) shown.push(`... ${entries.total - shown.length} more`);
  return { text: capBytes(shown.join("\n")), redacted };
}

export interface ConsoleLevelCounts {
  readonly emitted: number;
  readonly dropped: number;
  readonly redacted: number;
}

/** L836: console report schema v1. */
export interface ConsoleReport {
  readonly schemaVersion: typeof CONSOLE_REPORT_SCHEMA;
  readonly mode: ConsoleMode;
  readonly levels: Readonly<Record<ConsoleLevel, ConsoleLevelCounts>>;
}

export interface ConsoleRecorder {
  /** Returns the line to print, or "" when the policy drops the call. */
  emit(level: ConsoleLevel, ...values: readonly unknown[]): string;
  report(): ConsoleReport;
}

export function createConsoleRecorder(mode: string): ConsoleRecorder {
  const policy = consolePolicy(mode);
  const counts = new Map<ConsoleLevel, { emitted: number; dropped: number; redacted: number }>(
    CONSOLE_LEVELS.map((l) => [l, { emitted: 0, dropped: 0, redacted: 0 }]),
  );
  return {
    emit(level, ...values) {
      const c = counts.get(level);
      if (c === undefined) throw new Error("unknown console level");
      if (!policy.allowed.includes(level)) {
        c.dropped++;
        return "";
      }
      let redacted = 0;
      let body: string;
      if (level === "scope" || level === "vars") {
        const first = values[0];
        const r = typeof first === "object" && first !== null && !Array.isArray(first)
          ? renderConsoleScope(first as Record<string, unknown>)
          : { text: typeTag(first), redacted: 0 };
        body = r.text;
        redacted = r.redacted;
      } else {
        const parts = values.map((v) => {
          if (typeof v === "string" && level !== "dump") return { text: aiSafeText(v, CONSOLE_DUMP_LIMITS.maxBytes), redacted: 0 };
          if (level === "dump" && typeof v === "object" && v !== null) {
            // Large object dumps never print values (L834).
            const summary = summarizeLargeJson(v);
            const inspection = safeEntries(v as object);
            const redacted = isSecureString(v) || inspection?.entries.some(([k]) => isSensitiveName(k)) === true ? 1 : 0;
            return { text: summary.text, redacted };
          }
          return renderConsoleValue(v);
        });
        body = capBytes(parts.map((p) => p.text).join(" "));
        redacted = parts.reduce((n, p) => n + p.redacted, 0);
      }
      c.emitted++;
      c.redacted += redacted;
      return capBytes(`[${level}] ${body}`);
    },
    report() {
      const levels = Object.fromEntries(CONSOLE_LEVELS.map((l) => [l, { ...counts.get(l)! }])) as Record<ConsoleLevel, ConsoleLevelCounts>;
      return { schemaVersion: CONSOLE_REPORT_SCHEMA, mode: policy.mode, levels };
    },
  };
}
