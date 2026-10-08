// Scheduler evidence event shape (TODO "scheduler evidence event shape", Grok
// 2026-10-06; zero-trust defaults, owner may revisit).
//
// Grounded in docs/runtime-audit-log-schema-and-execution-proof.md:
//  - section 31 "Scheduler Evidence Example":
//      { category: "scheduler", event: "execution_queued", traceId, queue, priority }
//  - section 17 "Runtime Event Example":
//      { category: "scheduler", event: "task_scheduled", traceId, scheduler, task, target }
// Each documented event has EXACTLY its documented fields: no schemaVersion,
// no timestamp, no extra fields, nothing invented. Only the two documented
// events exist; anything else refuses.
//
// Scheduler evidence is NOT converted into a galerina.runtime.audit.v1 event:
// the frozen v1 RuntimeAuditCategory set has no "scheduler" category, and this
// module does not widen it (that is an owner decision).
//
// OWNER-REVISIT picks (the doc gives examples, not types; NOT spec):
//  - traceId, queue, scheduler, task, priority: the package audit id pattern
//    (isAuditId) and no secret material. priority is NOT a closed vocabulary:
//    the doc shows only "normal" and this module does not invent the others.
//  - target: the existing 11-value REPORT_RUNTIME_TARGETS vocabulary.
//  - codes reuse FUNGI-REPORT-002 (missing/invalid/outside the closed shape)
//    and FUNGI-REPORT-004 (secret), as runtime-health does. No new code family.
//
// Zero-trust: descriptor snapshot (getters never run), closed keys (unknown or
// symbol keys refuse without being echoed), never throws. Pure: no I/O, no clock.

import { containsSecretMaterial } from "../audit/audit-redaction.js";
import { REPORT_RUNTIME_TARGETS, type ReportRuntimeTarget } from "../audit/audit-runtime.js";
import { isAuditId } from "../shared/audit-reference.js";

/** The documented scheduler events (sections 17 and 31). */
export const SCHEDULER_EVIDENCE_EVENTS = Object.freeze(["execution_queued", "task_scheduled"] as const);

export type SchedulerEvidenceEvent = (typeof SCHEDULER_EVIDENCE_EVENTS)[number];

/** Documented field order per event. */
export const SCHEDULER_EVIDENCE_FIELDS = Object.freeze({
  execution_queued: Object.freeze(["category", "event", "traceId", "queue", "priority"] as const),
  task_scheduled: Object.freeze(["category", "event", "traceId", "scheduler", "task", "target"] as const),
});

export interface ExecutionQueuedEvidence {
  readonly category: "scheduler";
  readonly event: "execution_queued";
  readonly traceId: string;
  readonly queue: string;
  readonly priority: string;
}

export interface TaskScheduledEvidence {
  readonly category: "scheduler";
  readonly event: "task_scheduled";
  readonly traceId: string;
  readonly scheduler: string;
  readonly task: string;
  readonly target: ReportRuntimeTarget;
}

export type SchedulerEvidence = ExecutionQueuedEvidence | TaskScheduledEvidence;

type SchedulerField = "category" | "event" | "traceId" | "queue" | "priority" | "scheduler" | "task" | "target";

export interface SchedulerEvidenceDiagnostic {
  readonly code: "FUNGI-REPORT-002" | "FUNGI-REPORT-004";
  readonly severity: "error";
  readonly message: string;
  /** A documented field name, or "record". Never a caller-supplied key. */
  readonly field: SchedulerField | "record";
}

export type SchedulerEvidenceResult =
  | { readonly ok: true; readonly value: SchedulerEvidence }
  | { readonly ok: false; readonly diagnostics: readonly SchedulerEvidenceDiagnostic[] };

const ALL_FIELDS: readonly string[] = Object.freeze([
  "category", "event", "traceId", "queue", "priority", "scheduler", "task", "target",
]);

const diag = (
  code: SchedulerEvidenceDiagnostic["code"],
  message: string,
  field: SchedulerEvidenceDiagnostic["field"],
): SchedulerEvidenceDiagnostic => Object.freeze({ code, severity: "error" as const, message, field });

const refuse = (d: SchedulerEvidenceDiagnostic): SchedulerEvidenceResult =>
  Object.freeze({ ok: false as const, diagnostics: Object.freeze([d]) });

function snapshot(value: unknown): ReadonlyMap<string, unknown> | undefined {
  try {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    const proto: unknown = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return undefined;
    const keys = Reflect.ownKeys(value);
    if (keys.length > ALL_FIELDS.length) return undefined;
    const out = new Map<string, unknown>();
    for (const key of keys) {
      if (typeof key !== "string" || !ALL_FIELDS.includes(key)) return undefined;
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (d === undefined || !("value" in d) || d.get !== undefined || d.set !== undefined) return undefined;
      out.set(key, d.value);
    }
    return out;
  } catch {
    return undefined;
  }
}

function checkToken(snap: ReadonlyMap<string, unknown>, field: SchedulerField, out: SchedulerEvidenceDiagnostic[]): void {
  const v = snap.get(field);
  if (typeof v === "string" && containsSecretMaterial(v)) {
    out.push(diag("FUNGI-REPORT-004", "Scheduler evidence field contains secret material.", field));
  } else if (!isAuditId(v)) {
    out.push(diag("FUNGI-REPORT-002", "Scheduler evidence field is invalid.", field));
  }
}

/**
 * Validate an untrusted scheduler evidence record against the documented
 * shape for its event. Returns a detached frozen copy on success. Never throws.
 */
export function validateSchedulerEvidence(input: unknown): SchedulerEvidenceResult {
  try {
    const snap = snapshot(input);
    if (snap === undefined) {
      return refuse(diag("FUNGI-REPORT-002", "Scheduler evidence must be a plain data record with only documented fields.", "record"));
    }
    if (snap.get("category") !== "scheduler") {
      return refuse(diag("FUNGI-REPORT-002", "Scheduler evidence category must be \"scheduler\".", "category"));
    }
    const event = snap.get("event");
    if (typeof event !== "string" || !(SCHEDULER_EVIDENCE_EVENTS as readonly string[]).includes(event)) {
      return refuse(diag("FUNGI-REPORT-002", "Scheduler evidence event is not a documented scheduler event.", "event"));
    }
    const fields = SCHEDULER_EVIDENCE_FIELDS[event as SchedulerEvidenceEvent] as readonly SchedulerField[];
    const diagnostics: SchedulerEvidenceDiagnostic[] = [];
    // Closed per-event shape: a field documented for the other event refuses.
    for (const key of snap.keys()) {
      if (!(fields as readonly string[]).includes(key)) {
        return refuse(diag("FUNGI-REPORT-002", "Scheduler evidence has a field outside the documented shape for its event.", "record"));
      }
    }
    for (const field of fields) {
      if (!snap.has(field)) diagnostics.push(diag("FUNGI-REPORT-002", "Scheduler evidence is missing a required field.", field));
    }
    if (diagnostics.length > 0) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(diagnostics) });

    if (event === "execution_queued") {
      for (const field of ["traceId", "queue", "priority"] as const) checkToken(snap, field, diagnostics);
      if (diagnostics.length > 0) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(diagnostics) });
      const value: ExecutionQueuedEvidence = Object.freeze({
        category: "scheduler" as const,
        event: "execution_queued" as const,
        traceId: snap.get("traceId") as string,
        queue: snap.get("queue") as string,
        priority: snap.get("priority") as string,
      });
      return Object.freeze({ ok: true as const, value });
    }

    for (const field of ["traceId", "scheduler", "task"] as const) checkToken(snap, field, diagnostics);
    const target = snap.get("target");
    if (typeof target !== "string" || !(REPORT_RUNTIME_TARGETS as readonly string[]).includes(target)) {
      diagnostics.push(diag("FUNGI-REPORT-002", "Scheduler evidence target is not a known runtime target.", "target"));
    }
    if (diagnostics.length > 0) return Object.freeze({ ok: false as const, diagnostics: Object.freeze(diagnostics) });
    const value: TaskScheduledEvidence = Object.freeze({
      category: "scheduler" as const,
      event: "task_scheduled" as const,
      traceId: snap.get("traceId") as string,
      scheduler: snap.get("scheduler") as string,
      task: snap.get("task") as string,
      target: target as ReportRuntimeTarget,
    });
    return Object.freeze({ ok: true as const, value });
  } catch {
    return refuse(diag("FUNGI-REPORT-002", "Scheduler evidence refused after an unexpected failure.", "record"));
  }
}

/**
 * Serialize scheduler evidence as one JSONL line (no trailing newline) in
 * documented field order. Re-validates first; returns undefined on refusal.
 * Never throws.
 */
export function serializeSchedulerEvidence(input: unknown): string | undefined {
  try {
    const r = validateSchedulerEvidence(input);
    if (!r.ok) return undefined;
    const v = r.value as unknown as Record<string, unknown>;
    const ordered: Record<string, unknown> = {};
    for (const field of SCHEDULER_EVIDENCE_FIELDS[r.value.event]) ordered[field] = v[field];
    return JSON.stringify(ordered);
  } catch {
    return undefined;
  }
}