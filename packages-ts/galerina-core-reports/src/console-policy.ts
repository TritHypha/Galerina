/**
 * Debug console policy (galerina-core TODO L831-L836, W01 design G4).
 *
 * Policy values and pure renderers only: this module defines no console syntax
 * (L829/L830 and the compiler prototype L837 stay with the language owner) and
 * performs no I/O. A host prints the returned line when `emit` returns one.
 *
 * Zero-trust defaults (owner may revisit):
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

const SECRET_NAME = /(secret|password|passwd|token|api[_-]?key|private[_-]?key|credential|cookie|authorization|session)/i;

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
  return typeof value === "object" && value !== null && (value as { kind?: unknown }).kind === "SecureString";
}

function typeTag(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (isSecureString(value)) return "SecureString";
  return typeof value;
}

interface RenderState {
  redacted: number;
}

function renderValue(value: unknown, depth: number, state: RenderState, seen: Set<object>): string {
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
  seen.add(value);
  const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
  const shown = entries.slice(0, CONSOLE_DUMP_LIMITS.maxKeys).map(([k, v]) => {
    if (!Array.isArray(value) && SECRET_NAME.test(k)) {
      state.redacted++;
      return `${JSON.stringify(k)}:${JSON.stringify(CONSOLE_REDACTED)}`;
    }
    const rendered = renderValue(v, depth + 1, state, seen);
    return Array.isArray(value) ? rendered : `${JSON.stringify(k)}:${rendered}`;
  });
  seen.delete(value);
  const more = entries.length - shown.length;
  if (more > 0) shown.push(JSON.stringify(`+${more} more`));
  return Array.isArray(value) ? `[${shown.join(",")}]` : `{${shown.join(",")}}`;
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

function capBytes(text: string): string {
  const max = CONSOLE_DUMP_LIMITS.maxBytes;
  const bytes = utf8Length(text);
  if (bytes <= max) return text;
  let cut = text.slice(0, max);
  while (cut.length > 0 && utf8Length(cut) > max - 40) cut = cut.slice(0, -64);
  return `${cut}...[truncated ${bytes - utf8Length(cut)} bytes]`;
}

/** L832/L833: bounded, redacted rendering of one value. */
export function renderConsoleValue(value: unknown): { readonly text: string; readonly redacted: number } {
  const state: RenderState = { redacted: 0 };
  return { text: capBytes(renderValue(value, 0, state, new Set())), redacted: state.redacted };
}

/** L834: summary of a large JSON value as key paths, types and counts (never values). */
export function summarizeLargeJson(value: unknown): { readonly text: string; readonly paths: number; readonly truncated: number } {
  const lines: string[] = [];
  let total = 0;
  const walk = (v: unknown, path: string, depth: number, seen: Set<object>): void => {
    total++;
    const tag = typeTag(v);
    const size = Array.isArray(v) ? `[${v.length}]` : typeof v === "object" && v !== null && !isSecureString(v) ? `{${Object.keys(v).length}}` : "";
    if (lines.length < CONSOLE_DUMP_LIMITS.maxKeys) lines.push(`${path || "$"}: ${tag}${size}`);
    if (typeof v !== "object" || v === null || isSecureString(v) || depth >= CONSOLE_DUMP_LIMITS.maxDepth || seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) {
      if (v.length > 0) walk(v[0], `${path}[0]`, depth + 1, seen);
    } else {
      for (const k of Object.keys(v)) walk((v as Record<string, unknown>)[k], `${path}.${/^[A-Za-z_$][\w$]*$/.test(k) ? k : JSON.stringify(k)}`, depth + 1, seen);
    }
    seen.delete(v);
  };
  walk(value, "$", 0, new Set());
  const truncated = Math.max(0, total - lines.length);
  if (truncated > 0) lines.push(`... ${truncated} more paths`);
  return { text: lines.join("\n"), paths: total, truncated };
}

/** L831: scope/vars rendering: names and type tags; values only for safe primitives. */
export function renderConsoleScope(vars: Readonly<Record<string, unknown>>): { readonly text: string; readonly redacted: number } {
  let redacted = 0;
  const names = Object.keys(vars).sort();
  const shown = names.slice(0, CONSOLE_DUMP_LIMITS.maxKeys).map((name) => {
    const v = vars[name];
    const tag = typeTag(v);
    if (SECRET_NAME.test(name) || isSecureString(v)) {
      redacted++;
      return `${name}: ${tag} = ${CONSOLE_REDACTED}`;
    }
    if (typeof v === "number" || typeof v === "boolean") return `${name}: ${tag} = ${String(v)}`;
    if (typeof v === "string" && v.length <= 64) return `${name}: ${tag} = ${JSON.stringify(aiSafeText(v, 64))}`;
    return `${name}: ${tag}`;
  });
  if (names.length > shown.length) shown.push(`... ${names.length - shown.length} more`);
  return { text: shown.join("\n"), redacted };
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
            const redacted = isSecureString(v) || Object.keys(v as object).some((k) => SECRET_NAME.test(k)) ? 1 : 0;
            return { text: summary.text, redacted };
          }
          return renderConsoleValue(v);
        });
        body = capBytes(parts.map((p) => p.text).join(" "));
        redacted = parts.reduce((n, p) => n + p.redacted, 0);
      }
      c.emitted++;
      c.redacted += redacted;
      return `[${level}] ${body}`;
    },
    report() {
      const levels = Object.fromEntries(CONSOLE_LEVELS.map((l) => [l, { ...counts.get(l)! }])) as Record<ConsoleLevel, ConsoleLevelCounts>;
      return { schemaVersion: CONSOLE_REPORT_SCHEMA, mode: policy.mode, levels };
    },
  };
}
