// RuntimeAuditEvent v0.2 (TODO pass, Grok 2026-10-05; owner may revisit).

import type { ReportDiagnostic } from "../index.js";
import { isAuditId, isAuditTimestamp, isRuntimeAuditReference, type RuntimeAuditReference } from "../shared/audit-reference.js";
import { RUNTIME_AUDIT_STATUSES, type RuntimeAuditStatus } from "../shared/audit-status.js";
import { REPORT_RUNTIME_TARGETS, type RuntimeAuditRuntime } from "./audit-runtime.js";
import { containsSecretMaterial } from "./audit-redaction.js";

export type RuntimeAuditCategory = "effect" | "capability" | "boundary" | "secret" | "network" | "policy" | "denial" | "proof";

export const RUNTIME_AUDIT_CATEGORIES: readonly RuntimeAuditCategory[] = Object.freeze(["effect", "capability", "boundary", "secret", "network", "policy", "denial", "proof"] as const);

export interface RuntimeAuditEvent {
  readonly schemaVersion: "galerina.runtime.audit.v1";
  readonly eventId: string;
  readonly timestamp: string;
  readonly category: RuntimeAuditCategory;
  readonly status: RuntimeAuditStatus;
  readonly message: string;
  readonly runtime: RuntimeAuditRuntime;
  readonly effect?: string;
  readonly capability?: string;
  readonly destination?: string;
  readonly references?: readonly RuntimeAuditReference[];
  /** String values only; never secrets. */
  readonly metadata?: Readonly<Record<string, string>>;
}

const EVENT_KEYS = ["schemaVersion", "eventId", "timestamp", "category", "status", "message", "runtime", "effect", "capability", "destination", "references", "metadata"];
const RUNTIME_KEYS = ["runtimeId", "environment", "target", "processId", "region"];
export const AUDIT_MESSAGE_MAX = 2048;
export const AUDIT_METADATA_MAX_KEYS = 32;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const shortText = (v: unknown, max = 256): boolean => typeof v === "string" && v.length > 0 && v.length <= max;

export function validateRuntimeAuditEvent(event: unknown): readonly ReportDiagnostic[] {
  const out: ReportDiagnostic[] = [];
  const add = (code: string, message: string, path: string): void => { out.push(Object.freeze({ code, severity: "error" as const, message, path })); };
  if (!isRecord(event)) { add("FUNGI-REPORT-002", "Audit event must be a plain record.", "event"); return Object.freeze(out); }
  for (const key of Object.keys(event)) if (!EVENT_KEYS.includes(key)) add("FUNGI-REPORT-002", `Unknown audit event field ${key}.`, key);
  if (event.schemaVersion !== "galerina.runtime.audit.v1") add("FUNGI-REPORT-001", "schemaVersion must be galerina.runtime.audit.v1.", "schemaVersion");
  if (!isAuditId(event.eventId)) add("FUNGI-REPORT-002", "eventId is invalid.", "eventId");
  if (!isAuditTimestamp(event.timestamp)) add("FUNGI-REPORT-003", "timestamp must be ISO-8601 UTC.", "timestamp");
  if (typeof event.category !== "string" || !(RUNTIME_AUDIT_CATEGORIES as readonly string[]).includes(event.category)) add("FUNGI-REPORT-002", "category is invalid.", "category");
  if (typeof event.status !== "string" || !(RUNTIME_AUDIT_STATUSES as readonly string[]).includes(event.status)) add("FUNGI-REPORT-002", "status must be a v0.2 RuntimeAuditStatus.", "status");
  if (!shortText(event.message, AUDIT_MESSAGE_MAX)) add("FUNGI-REPORT-002", `message must be 1..${AUDIT_MESSAGE_MAX} characters.`, "message");
  const rt = event.runtime;
  if (!isRecord(rt)) add("FUNGI-REPORT-002", "runtime must be a plain record.", "runtime");
  else {
    for (const key of Object.keys(rt)) if (!RUNTIME_KEYS.includes(key)) add("FUNGI-REPORT-002", `Unknown runtime field ${key}.`, `runtime.${key}`);
    if (!isAuditId(rt.runtimeId)) add("FUNGI-REPORT-002", "runtime.runtimeId is invalid.", "runtime.runtimeId");
    if (!shortText(rt.environment)) add("FUNGI-REPORT-002", "runtime.environment is required.", "runtime.environment");
    if (typeof rt.target !== "string" || !(REPORT_RUNTIME_TARGETS as readonly string[]).includes(rt.target)) add("FUNGI-REPORT-002", "runtime.target is invalid.", "runtime.target");
    if (!shortText(rt.processId)) add("FUNGI-REPORT-002", "runtime.processId is required.", "runtime.processId");
    if ("region" in rt && !shortText(rt.region)) add("FUNGI-REPORT-002", "runtime.region must be a short string when present.", "runtime.region");
  }
  for (const key of ["effect", "capability", "destination"] as const) {
    if (key in event && !shortText(event[key], 512)) add("FUNGI-REPORT-002", `${key} must be a non-empty short string when present.`, key);
  }
  if ("references" in event && (!Array.isArray(event.references) || !event.references.every(isRuntimeAuditReference))) add("FUNGI-REPORT-005", "references must be RuntimeAuditReference values.", "references");
  if ("metadata" in event) {
    const md = event.metadata;
    if (!isRecord(md) || Object.keys(md).length > AUDIT_METADATA_MAX_KEYS || !Object.values(md).every((v) => typeof v === "string" && v.length <= 512)) {
      add("FUNGI-REPORT-005", `metadata must be at most ${AUDIT_METADATA_MAX_KEYS} string values of up to 512 characters.`, "metadata");
    }
  }
  if (containsSecretMaterial(event)) add("FUNGI-REPORT-004", "Audit event contains secret material.", "event");
  return Object.freeze(out);
}
