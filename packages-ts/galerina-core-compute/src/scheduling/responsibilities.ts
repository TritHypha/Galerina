// Compute scheduler / planner responsibility vocabulary and audit event shapes
// (TODO pass, Grok 2026-10-05). Zero-trust defaults, owner may revisit.
// Planning vocabulary only: no live scheduler, no admitting a non-cpu executable
// target, no free-text reasons, no I/O.

import type { ComputeDiagnostic } from "../index.js";

/** Closed scheduler responsibility tokens (thermal, queue, fairness, fallback). */
export const SCHEDULER_RESPONSIBILITIES = Object.freeze([
  "thermal_balancing",
  "queue_depth",
  "fairness",
  "fallback",
] as const);

export type SchedulerResponsibility = (typeof SCHEDULER_RESPONSIBILITIES)[number];

/** Closed planner responsibility tokens. */
export const PLANNER_RESPONSIBILITIES = Object.freeze([
  "parallelism",
  "memory",
  "energy_cost",
  "backend_suitability",
] as const);

export type PlannerResponsibility = (typeof PLANNER_RESPONSIBILITIES)[number];

/** Closed compute audit event kinds for planner / scheduler / fallback / distributed. */
export const COMPUTE_AUDIT_EVENT_KINDS = Object.freeze([
  "planner",
  "scheduler",
  "fallback",
  "distributed_execution",
] as const);

export type ComputeAuditEventKind = (typeof COMPUTE_AUDIT_EVENT_KINDS)[number];

export const COMPUTE_AUDIT_SCHEMA_VERSION = "galerina.compute.audit-event.v0.1" as const;

/** Under v1 freeze every responsibility stays planning_only; nothing is admitted live. */
export type ResponsibilityAvailability = "planning_only" | "refused";

export interface SchedulerResponsibilityClaim {
  readonly name: SchedulerResponsibility;
  readonly availability: ResponsibilityAvailability;
}

export interface PlannerResponsibilityClaim {
  readonly name: PlannerResponsibility;
  readonly availability: ResponsibilityAvailability;
}

/** Exact closed shape for a compute audit event. No free-text detail field. */
export interface ComputeAuditEventShape {
  readonly schemaVersion: typeof COMPUTE_AUDIT_SCHEMA_VERSION;
  readonly kind: ComputeAuditEventKind;
  /** Closed responsibility or fallback token that the event is about. */
  readonly subject: string;
  /** Outcome token; closed set. */
  readonly outcome: "planned" | "refused" | "fallback_selected" | "not_admitted";
}

export const COMPUTE_AUDIT_OUTCOMES = Object.freeze([
  "planned",
  "refused",
  "fallback_selected",
  "not_admitted",
] as const);

export type ComputeAuditOutcome = (typeof COMPUTE_AUDIT_OUTCOMES)[number];

function isPlainExact(input: unknown, fields: readonly string[]): Record<string, unknown> | undefined {
  try {
    if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
    const proto = Object.getPrototypeOf(input);
    if (proto !== Object.prototype && proto !== null) return undefined;
    const keys = Reflect.ownKeys(input);
    if (keys.length !== fields.length) return undefined;
    const out: Record<string, unknown> = Object.create(null);
    for (const field of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(input, field);
      if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) return undefined;
      out[field] = descriptor.value;
    }
    return out;
  } catch {
    return undefined;
  }
}

const diag = (code: string, message: string, path?: string): ComputeDiagnostic =>
  Object.freeze({
    code,
    severity: "error" as const,
    message,
    ...(path === undefined ? {} : { path }),
  });

export function isSchedulerResponsibility(value: unknown): value is SchedulerResponsibility {
  return typeof value === "string" && (SCHEDULER_RESPONSIBILITIES as readonly string[]).includes(value);
}

export function isPlannerResponsibility(value: unknown): value is PlannerResponsibility {
  return typeof value === "string" && (PLANNER_RESPONSIBILITIES as readonly string[]).includes(value);
}

export function isComputeAuditEventKind(value: unknown): value is ComputeAuditEventKind {
  return typeof value === "string" && (COMPUTE_AUDIT_EVENT_KINDS as readonly string[]).includes(value);
}

export function isComputeAuditOutcome(value: unknown): value is ComputeAuditOutcome {
  return typeof value === "string" && (COMPUTE_AUDIT_OUTCOMES as readonly string[]).includes(value);
}

/** Validate a scheduler responsibility claim. Live availability is refused under v1. */
export function validateSchedulerResponsibilityClaim(input: unknown): readonly ComputeDiagnostic[] {
  const v = isPlainExact(input, ["name", "availability"]);
  if (v === undefined) {
    return [diag("Galerina_COMPUTE_SCHEDULER_CLAIM_SHAPE", "Scheduler responsibility claim is not the exact closed contract.")];
  }
  const out: ComputeDiagnostic[] = [];
  if (!isSchedulerResponsibility(v.name)) {
    out.push(diag("Galerina_COMPUTE_SCHEDULER_UNKNOWN", "Scheduler responsibility name is not admitted.", "name"));
  }
  if (v.availability !== "planning_only" && v.availability !== "refused") {
    out.push(diag("Galerina_COMPUTE_SCHEDULER_AVAILABILITY", "Scheduler responsibility availability is not admitted.", "availability"));
  } else if (v.availability === "planning_only" && isSchedulerResponsibility(v.name)) {
    // planning_only is the only non-refused state under v1; still not live.
  }
  // Explicit refuse of any attempt to spell "available" via unknown string already caught.
  return Object.freeze(out);
}

/** Validate a planner responsibility claim. Live availability is refused under v1. */
export function validatePlannerResponsibilityClaim(input: unknown): readonly ComputeDiagnostic[] {
  const v = isPlainExact(input, ["name", "availability"]);
  if (v === undefined) {
    return [diag("Galerina_COMPUTE_PLANNER_CLAIM_SHAPE", "Planner responsibility claim is not the exact closed contract.")];
  }
  const out: ComputeDiagnostic[] = [];
  if (!isPlannerResponsibility(v.name)) {
    out.push(diag("Galerina_COMPUTE_PLANNER_UNKNOWN", "Planner responsibility name is not admitted.", "name"));
  }
  if (v.availability !== "planning_only" && v.availability !== "refused") {
    out.push(diag("Galerina_COMPUTE_PLANNER_AVAILABILITY", "Planner responsibility availability is not admitted.", "availability"));
  }
  return Object.freeze(out);
}

const SUBJECT_BY_KIND: Readonly<Record<ComputeAuditEventKind, readonly string[]>> = Object.freeze({
  planner: PLANNER_RESPONSIBILITIES,
  scheduler: SCHEDULER_RESPONSIBILITIES,
  fallback: Object.freeze(["cpu_fallback", "explicit_cpu_fallback", "not_admitted"] as const),
  distributed_execution: Object.freeze(["distributed_compute", "not_admitted"] as const),
});

/** Validate a compute audit event shape. Kind/subject/outcome are closed; no free-text. */
export function validateComputeAuditEventShape(input: unknown): readonly ComputeDiagnostic[] {
  const v = isPlainExact(input, ["schemaVersion", "kind", "subject", "outcome"]);
  if (v === undefined) {
    return [diag("Galerina_COMPUTE_AUDIT_SHAPE", "Compute audit event is not the exact closed contract.")];
  }
  const out: ComputeDiagnostic[] = [];
  if (v.schemaVersion !== COMPUTE_AUDIT_SCHEMA_VERSION) {
    out.push(diag("Galerina_COMPUTE_AUDIT_VERSION", "Compute audit event schemaVersion is not admitted.", "schemaVersion"));
  }
  if (!isComputeAuditEventKind(v.kind)) {
    out.push(diag("Galerina_COMPUTE_AUDIT_KIND", "Compute audit event kind is not admitted.", "kind"));
  }
  if (!isComputeAuditOutcome(v.outcome)) {
    out.push(diag("Galerina_COMPUTE_AUDIT_OUTCOME", "Compute audit event outcome is not admitted.", "outcome"));
  }
  if (isComputeAuditEventKind(v.kind)) {
    const allowed = SUBJECT_BY_KIND[v.kind];
    if (typeof v.subject !== "string" || !allowed.includes(v.subject)) {
      out.push(diag("Galerina_COMPUTE_AUDIT_SUBJECT", "Compute audit event subject is not admitted for its kind.", "subject"));
    }
  } else if (typeof v.subject !== "string") {
    out.push(diag("Galerina_COMPUTE_AUDIT_SUBJECT", "Compute audit event subject is not admitted for its kind.", "subject"));
  }
  return Object.freeze(out);
}

/** Build a frozen audit event after validation; returns diagnostics on refuse (never throws on shape). */
export function buildComputeAuditEvent(
  input: unknown,
): { readonly ok: true; readonly event: ComputeAuditEventShape } | { readonly ok: false; readonly diagnostics: readonly ComputeDiagnostic[] } {
  const diagnostics = validateComputeAuditEventShape(input);
  if (diagnostics.length > 0) return Object.freeze({ ok: false as const, diagnostics });
  const v = input as ComputeAuditEventShape;
  return Object.freeze({
    ok: true as const,
    event: Object.freeze({
      schemaVersion: COMPUTE_AUDIT_SCHEMA_VERSION,
      kind: v.kind,
      subject: v.subject,
      outcome: v.outcome,
    }),
  });
}

/** Under v1 freeze every closed scheduler responsibility is planning_only. */
export function defaultSchedulerResponsibilityClaims(): readonly SchedulerResponsibilityClaim[] {
  return Object.freeze(
    SCHEDULER_RESPONSIBILITIES.map((name) => Object.freeze({ name, availability: "planning_only" as const })),
  );
}

/** Under v1 freeze every closed planner responsibility is planning_only. */
export function defaultPlannerResponsibilityClaims(): readonly PlannerResponsibilityClaim[] {
  return Object.freeze(
    PLANNER_RESPONSIBILITIES.map((name) => Object.freeze({ name, availability: "planning_only" as const })),
  );
}
