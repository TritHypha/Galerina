// Runtime health schema (TODO "runtime health schema", Grok 2026-10-06;
// zero-trust defaults, owner may revisit).
//
// Grounded in docs/runtime-audit-log-schema-and-execution-proof.md section 30
// "Runtime Health Schema" (the eight fields below, in that order) and section 33
// (`runtime-health.json` = runtime metrics). The record shape is EXACTLY the
// documented one: no schemaVersion, no extra fields, nothing invented.
//
// OWNER-REVISIT picks (the doc gives an example, not types or ranges; NOT spec):
//  - timestamp: ISO-8601 UTC, same rule as audit events (isAuditTimestamp).
//  - runtime: the package audit id pattern (isAuditId) and no secret material.
//  - cpuLoad: finite number >= 0 (no upper bound: the doc does not say whether
//    it is a 0..1 fraction or a load average).
//  - memoryUsageMb, schedulerQueueDepth, activeExecutions, fallbackCount,
//    denialCount: non-negative safe integers (all examples are integers).
//  - codes reuse FUNGI-REPORT-002 (field missing/invalid/outside the closed
//    shape), FUNGI-REPORT-003 (timestamp) and FUNGI-REPORT-004 (secret), as the
//    #87 report contracts do. No new code family.
//
// Zero-trust: descriptor snapshot (getters never run), closed keys (unknown or
// symbol keys refuse without being echoed), no null/NaN collapse, never throws.
// Pure: no I/O, no clock; the caller supplies the timestamp.

import { containsSecretMaterial } from "../audit/audit-redaction.js";
import { isAuditId, isAuditTimestamp } from "../shared/audit-reference.js";

/** Report file name from docs section 33. */
export const RUNTIME_HEALTH_REPORT_FILE = "runtime-health.json";

/** The documented fields, in documented order. */
export const RUNTIME_HEALTH_FIELDS = Object.freeze([
  "timestamp",
  "runtime",
  "cpuLoad",
  "memoryUsageMb",
  "schedulerQueueDepth",
  "activeExecutions",
  "fallbackCount",
  "denialCount",
] as const);

export type RuntimeHealthField = (typeof RUNTIME_HEALTH_FIELDS)[number];

const COUNT_FIELDS = Object.freeze([
  "memoryUsageMb",
  "schedulerQueueDepth",
  "activeExecutions",
  "fallbackCount",
  "denialCount",
] as const);

export interface RuntimeHealth {
  readonly timestamp: string;
  readonly runtime: string;
  readonly cpuLoad: number;
  readonly memoryUsageMb: number;
  readonly schedulerQueueDepth: number;
  readonly activeExecutions: number;
  readonly fallbackCount: number;
  readonly denialCount: number;
}

export interface RuntimeHealthDiagnostic {
  readonly code: "FUNGI-REPORT-002" | "FUNGI-REPORT-003" | "FUNGI-REPORT-004";
  readonly severity: "error";
  readonly message: string;
  /** A documented field name, or "record". Never a caller-supplied key. */
  readonly field: RuntimeHealthField | "record";
}

export type RuntimeHealthResult =
  | { readonly ok: true; readonly value: RuntimeHealth }
  | { readonly ok: false; readonly diagnostics: readonly RuntimeHealthDiagnostic[] };

const diag = (
  code: RuntimeHealthDiagnostic["code"],
  message: string,
  field: RuntimeHealthDiagnostic["field"],
): RuntimeHealthDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

const refuse = (d: RuntimeHealthDiagnostic): RuntimeHealthResult =>
  Object.freeze({ ok: false as const, diagnostics: Object.freeze([d]) });

function snapshot(value: unknown): ReadonlyMap<string, unknown> | undefined {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return undefined;
    const keys = Reflect.ownKeys(value);
    if (keys.length > RUNTIME_HEALTH_FIELDS.length) return undefined;
    const out = new Map<string, unknown>();
    for (const key of keys) {
      if (typeof key !== "string" || !(RUNTIME_HEALTH_FIELDS as readonly string[]).includes(key)) return undefined;
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (d === undefined || !("value" in d) || d.get !== undefined || d.set !== undefined) return undefined;
      out.set(key, d.value);
    }
    return out;
  } catch {
    return undefined;
  }
}

/**
 * Validate an untrusted runtime-health record against the documented shape.
 * Returns a detached frozen copy on success. Never throws.
 */
export function validateRuntimeHealth(input: unknown): RuntimeHealthResult {
  try {
    const snap = snapshot(input);
    if (snap === undefined) {
      return refuse(diag("FUNGI-REPORT-002", "Runtime health must be a plain data record with only the documented fields.", "record"));
    }
    const diagnostics: RuntimeHealthDiagnostic[] = [];
    for (const field of RUNTIME_HEALTH_FIELDS) {
      if (!snap.has(field)) diagnostics.push(diag("FUNGI-REPORT-002", "Runtime health is missing a required field.", field));
    }
    if (diagnostics.length > 0) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(diagnostics) });

    const timestamp = snap.get("timestamp");
    if (!isAuditTimestamp(timestamp)) diagnostics.push(diag("FUNGI-REPORT-003", "Runtime health timestamp is not an ISO-8601 UTC timestamp.", "timestamp"));

    const runtime = snap.get("runtime");
    if (typeof runtime !== "string" || containsSecretMaterial(runtime)) {
      diagnostics.push(typeof runtime === "string"
        ? diag("FUNGI-REPORT-004", "Runtime health runtime contains secret material.", "runtime")
        : diag("FUNGI-REPORT-002", "Runtime health runtime is invalid.", "runtime"));
    } else if (!isAuditId(runtime)) {
      diagnostics.push(diag("FUNGI-REPORT-002", "Runtime health runtime is invalid.", "runtime"));
    }

    const cpuLoad = snap.get("cpuLoad");
    if (typeof cpuLoad !== "number" || !Number.isFinite(cpuLoad) || cpuLoad < 0) {
      diagnostics.push(diag("FUNGI-REPORT-002", "Runtime health cpuLoad must be a finite non-negative number.", "cpuLoad"));
    }
    for (const field of COUNT_FIELDS) {
      const v = snap.get(field);
      if (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0) {
        diagnostics.push(diag("FUNGI-REPORT-002", "Runtime health count must be a non-negative safe integer.", field));
      }
    }
    if (diagnostics.length > 0) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(diagnostics) });

    const value: RuntimeHealth = Object.freeze({
      timestamp: timestamp as string,
      runtime: runtime as string,
      cpuLoad: (cpuLoad as number) === 0 ? 0 : (cpuLoad as number), // normalise -0
      memoryUsageMb: snap.get("memoryUsageMb") as number,
      schedulerQueueDepth: snap.get("schedulerQueueDepth") as number,
      activeExecutions: snap.get("activeExecutions") as number,
      fallbackCount: snap.get("fallbackCount") as number,
      denialCount: snap.get("denialCount") as number,
    });
    return Object.freeze({ ok: true as const, value });
  } catch {
    return refuse(diag("FUNGI-REPORT-002", "Runtime health refused after an unexpected failure.", "record"));
  }
}

/**
 * Serialize a runtime-health record for `runtime-health.json` in documented
 * field order. Re-validates first; returns undefined on refusal. Never throws.
 */
export function serializeRuntimeHealth(input: unknown): string | undefined {
  try {
    const r = validateRuntimeHealth(input);
    if (!r.ok) return undefined;
    const v = r.value;
    const ordered: Record<string, unknown> = {};
    for (const field of RUNTIME_HEALTH_FIELDS) ordered[field] = v[field];
    return JSON.stringify(ordered, null, 2) + "\n";
  } catch {
    return undefined;
  }
}
