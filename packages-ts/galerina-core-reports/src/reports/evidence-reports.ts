// Audit, capability, effect and denial report contracts, plus the capability/effect
// evidence audit-event shapes (TODO pass, Grok 2026-10-05; zero-trust defaults, owner may revisit).
//
// Pure: no I/O. Inputs are untrusted. Every item is validated with the existing v0.2
// validators; an item that fails is counted (by index or line number only, never its
// content) and leaves the report `complete: false`. Reports carry names, ids, counts and
// codes; they never copy audit messages, reasons or metadata values.

import type { ReportDiagnostic } from "../index.js";
import { validateRuntimeAuditEvent, RUNTIME_AUDIT_CATEGORIES, type RuntimeAuditCategory, type RuntimeAuditEvent } from "../audit/audit-events.js";
import type { RuntimeAuditRuntime } from "../audit/audit-runtime.js";
import { RUNTIME_AUDIT_STATUSES, type RuntimeAuditStatus } from "../shared/audit-status.js";
import { isAuditTimestamp, type RuntimeAuditReference } from "../shared/audit-reference.js";
import type { CapabilityEvidence } from "../evidence/capability-evidence.js";
import type { EffectEvidence } from "../evidence/effect-evidence.js";
import { validateCapabilityEvidence, validateEffectEvidence } from "../evidence/evidence-validator.js";
import { DENIAL_CATEGORIES, type DenialCategory, type DenialReport } from "../denials/denial-report.js";
import { validateDenialReport } from "../denials/denial-validator.js";

/** Upper bound on items one report will read. Anything beyond is not read and the report is incomplete. */
export const MAX_REPORT_ITEMS = 100_000;
/** Upper bound on one JSONL line, in UTF-16 code units. */
export const MAX_AUDIT_LINE_LENGTH = 65_536;

const firstCode = (problems: readonly ReportDiagnostic[], fallback: string): string => problems[0]?.code ?? fallback;
const requireTimestamp = (value: unknown, code: string): void => {
  if (!isAuditTimestamp(value)) throw new Error(`${code}: generatedAt must be ISO-8601 UTC.`);
};
const countMap = <K extends string>(keys: readonly K[]): Record<K, number> => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
const frozenSorted = (values: Iterable<string>): readonly string[] => Object.freeze([...new Set(values)].sort());

// ── capability / effect evidence -> runtime audit events ──────────────────
export interface EvidenceEventParams {
  readonly eventId: string;
  readonly timestamp: string;
  readonly runtime: RuntimeAuditRuntime;
}

function finishEvent(event: RuntimeAuditEvent): RuntimeAuditEvent {
  const problems = validateRuntimeAuditEvent(event);
  if (problems.length > 0) throw new Error(`${firstCode(problems, "FUNGI-REPORT-002")}: audit event refused (${[...new Set(problems.map((p) => p.code))].join(", ")}).`);
  return Object.freeze(event);
}

const evidenceReference = (evidenceId: string): RuntimeAuditReference => Object.freeze({ type: "evidence" as const, id: evidenceId });

/**
 * Copy of the caller's runtime record: every own enumerable key is read once into a fresh,
 * frozen record, so later mutation of the caller's object cannot change the event or its
 * serialised JSONL line. Object.fromEntries defines data properties, so an own "__proto__"
 * key stays a plain (refused) field. Non-record values pass through for the validator to refuse.
 */
function snapshotRuntime(runtime: unknown): RuntimeAuditRuntime {
  if (typeof runtime !== "object" || runtime === null || Array.isArray(runtime)) return runtime as RuntimeAuditRuntime;
  let copy: Record<string, unknown>;
  try {
    copy = Object.fromEntries(Object.keys(runtime).map((key) => [key, (runtime as Record<string, unknown>)[key]]));
  } catch {
    throw new Error("FUNGI-REPORT-002: audit event refused (runtime could not be read).");
  }
  return Object.freeze(copy) as unknown as RuntimeAuditRuntime;
}

/**
 * Capability evidence as a runtime audit event (category "capability"). The message is fixed;
 * the evidence reason is not copied. Throws with the first FUNGI-EVIDENCE / FUNGI-REPORT code.
 */
export function capabilityEvidenceAuditEvent(evidence: CapabilityEvidence, params: EvidenceEventParams): RuntimeAuditEvent {
  const problems = validateCapabilityEvidence(evidence);
  if (problems.length > 0) throw new Error(`${firstCode(problems, "FUNGI-EVIDENCE-002")}: capability evidence refused.`);
  return finishEvent({
    schemaVersion: "galerina.runtime.audit.v1",
    eventId: params?.eventId,
    timestamp: params?.timestamp,
    category: "capability",
    status: evidence.decision === "allow" ? "allowed" : "denied",
    message: evidence.decision === "allow" ? "Capability allowed." : "Capability denied.",
    runtime: snapshotRuntime(params?.runtime),
    capability: evidence.capability,
    references: Object.freeze([evidenceReference(evidence.evidenceId), ...evidence.references.map((r) => Object.freeze({ type: r.type, id: r.id }))]),
    metadata: Object.freeze({ decision: evidence.decision, ...(evidence.policyId === undefined ? {} : { policyId: evidence.policyId }) }),
  } as RuntimeAuditEvent);
}

/** Effect evidence as a runtime audit event (category "effect"). Same rules as the capability shape. */
export function effectEvidenceAuditEvent(evidence: EffectEvidence, params: EvidenceEventParams): RuntimeAuditEvent {
  const problems = validateEffectEvidence(evidence);
  if (problems.length > 0) throw new Error(`${firstCode(problems, "FUNGI-EVIDENCE-002")}: effect evidence refused.`);
  return finishEvent({
    schemaVersion: "galerina.runtime.audit.v1",
    eventId: params?.eventId,
    timestamp: params?.timestamp,
    category: "effect",
    status: evidence.allowed ? "allowed" : "denied",
    message: evidence.allowed ? "Effect allowed." : "Effect denied.",
    runtime: snapshotRuntime(params?.runtime),
    effect: evidence.effect,
    references: Object.freeze([evidenceReference(evidence.evidenceId)]),
    metadata: Object.freeze({ declared: String(evidence.declared), inferred: String(evidence.inferred), transitive: String(evidence.transitive) }),
  } as RuntimeAuditEvent);
}

// ── audit-report.json (fed from runtime-audit.jsonl) ─────────────────────
export interface AuditReport {
  readonly schema: "galerina.report.audit.v1";
  readonly generatedAt: string;
  readonly eventCount: number;
  readonly byCategory: Readonly<Record<RuntimeAuditCategory, number>>;
  readonly byStatus: Readonly<Record<RuntimeAuditStatus, number>>;
  readonly firstTimestamp?: string;
  readonly lastTimestamp?: string;
  /** 1-based line numbers that did not parse or validate, or repeated an eventId. Content is never copied. */
  readonly rejectedLines: readonly number[];
  readonly rejectedCodes: readonly string[];
  readonly truncated: boolean;
  readonly complete: boolean;
}

/**
 * Build audit-report.json from runtime-audit.jsonl lines (the caller splits on "\n"; one
 * trailing empty string is ignored). Lines over MAX_AUDIT_LINE_LENGTH, unparsable JSON,
 * invalid events and repeated eventIds are rejected; lines past MAX_REPORT_ITEMS are not read.
 */
export function createAuditReport(lines: readonly string[], generatedAt: string): AuditReport {
  requireTimestamp(generatedAt, "FUNGI-REPORT-003");
  if (!Array.isArray(lines)) throw new Error("FUNGI-REPORT-002: audit lines must be an array of strings.");
  // One trailing empty line is ignored by shortening the read length, not by copying the array.
  const length = lines.length > 0 && lines[lines.length - 1] === "" ? lines.length - 1 : lines.length;
  const byCategory = countMap(RUNTIME_AUDIT_CATEGORIES);
  const byStatus = countMap(RUNTIME_AUDIT_STATUSES);
  const rejectedLines: number[] = [];
  const rejectedCodes = new Set<string>();
  const seen = new Set<string>();
  let first: string | undefined;
  let last: string | undefined;
  let eventCount = 0;
  const limit = Math.min(length, MAX_REPORT_ITEMS);
  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    const reject = (code: string): void => { rejectedLines.push(i + 1); rejectedCodes.add(code); };
    if (typeof line !== "string" || line.length === 0 || line.length > MAX_AUDIT_LINE_LENGTH) { reject("FUNGI-REPORT-005"); continue; }
    let parsed: unknown;
    try { parsed = JSON.parse(line); } catch { reject("FUNGI-REPORT-002"); continue; }
    const problems = validateRuntimeAuditEvent(parsed);
    if (problems.length > 0) { reject(firstCode(problems, "FUNGI-REPORT-002")); continue; }
    const event = parsed as RuntimeAuditEvent;
    if (seen.has(event.eventId)) { reject("FUNGI-REPORT-002"); continue; }
    seen.add(event.eventId);
    eventCount++;
    byCategory[event.category]++;
    byStatus[event.status]++;
    const t = Date.parse(event.timestamp);
    if (first === undefined || t < Date.parse(first)) first = event.timestamp;
    if (last === undefined || t > Date.parse(last)) last = event.timestamp;
  }
  const truncated = length > MAX_REPORT_ITEMS;
  return Object.freeze({
    schema: "galerina.report.audit.v1",
    generatedAt,
    eventCount,
    byCategory: Object.freeze(byCategory),
    byStatus: Object.freeze(byStatus),
    ...(first === undefined ? {} : { firstTimestamp: first }),
    ...(last === undefined ? {} : { lastTimestamp: last }),
    rejectedLines: Object.freeze(rejectedLines),
    rejectedCodes: frozenSorted(rejectedCodes),
    truncated,
    complete: rejectedLines.length === 0 && !truncated,
  });
}

// ── shared item reader ─────────────────────────────────────────────────────
function readItems<T>(items: readonly T[], validate: (v: unknown, path: string) => readonly ReportDiagnostic[], label: string, idOf: (v: T) => string, malformedCode: string, duplicateCode: string) {
  if (!Array.isArray(items)) throw new Error(`${malformedCode}: ${label} must be an array.`);
  const kept: T[] = [];
  const rejectedIndices: number[] = [];
  const codes = new Set<string>();
  const seen = new Set<string>();
  const limit = Math.min(items.length, MAX_REPORT_ITEMS);
  for (let i = 0; i < limit; i++) {
    const problems = validate(items[i], `${label}.${i}`);
    if (problems.length > 0) { rejectedIndices.push(i); codes.add(firstCode(problems, malformedCode)); continue; }
    const id = idOf(items[i] as T);
    if (seen.has(id)) { rejectedIndices.push(i); codes.add(duplicateCode); continue; }
    seen.add(id);
    kept.push(items[i] as T);
  }
  const truncated = items.length > MAX_REPORT_ITEMS;
  return { kept, rejectedIndices: Object.freeze(rejectedIndices), rejectedCodes: frozenSorted(codes), truncated, complete: rejectedIndices.length === 0 && !truncated };
}

// ── capability-report.json ─────────────────────────────────────────────────
export interface CapabilityReportRow {
  readonly capability: string;
  readonly allowed: number;
  readonly denied: number;
}

export interface CapabilityReport {
  readonly schema: "galerina.report.capability.v1";
  readonly generatedAt: string;
  readonly capabilities: readonly CapabilityReportRow[];
  readonly deniedCapabilities: readonly string[];
  readonly policyIds: readonly string[];
  readonly rejectedIndices: readonly number[];
  readonly rejectedCodes: readonly string[];
  readonly truncated: boolean;
  readonly complete: boolean;
}

export function createCapabilityReport(evidence: readonly CapabilityEvidence[], generatedAt: string): CapabilityReport {
  requireTimestamp(generatedAt, "FUNGI-EVIDENCE-002");
  const read = readItems(evidence, validateCapabilityEvidence, "capabilityEvidence", (e) => e.evidenceId, "FUNGI-EVIDENCE-002", "FUNGI-EVIDENCE-003");
  const rows = new Map<string, { allowed: number; denied: number }>();
  for (const e of read.kept) {
    const row = rows.get(e.capability) ?? { allowed: 0, denied: 0 };
    if (e.decision === "allow") row.allowed++; else row.denied++;
    rows.set(e.capability, row);
  }
  const capabilities = [...rows.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([capability, r]) => Object.freeze({ capability, allowed: r.allowed, denied: r.denied }));
  return Object.freeze({
    schema: "galerina.report.capability.v1",
    generatedAt,
    capabilities: Object.freeze(capabilities),
    deniedCapabilities: frozenSorted(capabilities.filter((r) => r.denied > 0).map((r) => r.capability)),
    policyIds: frozenSorted(read.kept.flatMap((e) => (e.policyId === undefined ? [] : [e.policyId]))),
    rejectedIndices: read.rejectedIndices,
    rejectedCodes: read.rejectedCodes,
    truncated: read.truncated,
    complete: read.complete,
  });
}

// ── effect-report.json ─────────────────────────────────────────────────────
export interface EffectReportRow {
  readonly effect: string;
  readonly declared: boolean;
  readonly inferred: boolean;
  readonly transitive: boolean;
  readonly allowed: number;
  readonly denied: number;
}

export interface EffectReport {
  readonly schema: "galerina.report.effect.v1";
  readonly generatedAt: string;
  readonly effects: readonly EffectReportRow[];
  /** Inferred but never declared: the review hot spot. */
  readonly undeclaredInferredEffects: readonly string[];
  readonly deniedEffects: readonly string[];
  /** Effects recorded as both allowed and denied in this evidence set. */
  readonly conflictingEffects: readonly string[];
  readonly rejectedIndices: readonly number[];
  readonly rejectedCodes: readonly string[];
  readonly truncated: boolean;
  readonly complete: boolean;
}

export function createEffectReport(evidence: readonly EffectEvidence[], generatedAt: string): EffectReport {
  requireTimestamp(generatedAt, "FUNGI-EVIDENCE-002");
  const read = readItems(evidence, validateEffectEvidence, "effectEvidence", (e) => e.evidenceId, "FUNGI-EVIDENCE-002", "FUNGI-EVIDENCE-003");
  const rows = new Map<string, { declared: boolean; inferred: boolean; transitive: boolean; allowed: number; denied: number }>();
  for (const e of read.kept) {
    const row = rows.get(e.effect) ?? { declared: false, inferred: false, transitive: false, allowed: 0, denied: 0 };
    row.declared = row.declared || e.declared;
    row.inferred = row.inferred || e.inferred;
    row.transitive = row.transitive || e.transitive;
    if (e.allowed) row.allowed++; else row.denied++;
    rows.set(e.effect, row);
  }
  const effects = [...rows.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([effect, r]) => Object.freeze({ effect, ...r }));
  return Object.freeze({
    schema: "galerina.report.effect.v1",
    generatedAt,
    effects: Object.freeze(effects),
    undeclaredInferredEffects: frozenSorted(effects.filter((r) => r.inferred && !r.declared).map((r) => r.effect)),
    deniedEffects: frozenSorted(effects.filter((r) => r.denied > 0).map((r) => r.effect)),
    conflictingEffects: frozenSorted(effects.filter((r) => r.denied > 0 && r.allowed > 0).map((r) => r.effect)),
    rejectedIndices: read.rejectedIndices,
    rejectedCodes: read.rejectedCodes,
    truncated: read.truncated,
    complete: read.complete,
  });
}

// ── denial-report.json ─────────────────────────────────────────────────────
// Named DenialReportSummary: DenialReport is the single v0.2 denial record.
export interface DenialReportSummary {
  readonly schema: "galerina.report.denial.v1";
  readonly generatedAt: string;
  readonly denialCount: number;
  readonly byCategory: Readonly<Record<DenialCategory, number>>;
  readonly denialIds: readonly string[];
  readonly policyIds: readonly string[];
  readonly runtimeIds: readonly string[];
  readonly diagnosticCodes: readonly string[];
  readonly rejectedIndices: readonly number[];
  readonly rejectedCodes: readonly string[];
  readonly truncated: boolean;
  readonly complete: boolean;
}

const DIAGNOSTIC_CODE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const validateDenialAt = (value: unknown): readonly ReportDiagnostic[] => validateDenialReport(value);

export function createDenialReportSummary(denials: readonly DenialReport[], generatedAt: string): DenialReportSummary {
  requireTimestamp(generatedAt, "FUNGI-DENIAL-003");
  const read = readItems(denials, validateDenialAt, "denials", (d) => d.denialId, "FUNGI-DENIAL-003", "FUNGI-DENIAL-003");
  const byCategory = countMap(DENIAL_CATEGORIES);
  for (const d of read.kept) byCategory[d.category]++;
  return Object.freeze({
    schema: "galerina.report.denial.v1",
    generatedAt,
    denialCount: read.kept.length,
    byCategory: Object.freeze(byCategory),
    denialIds: frozenSorted(read.kept.map((d) => d.denialId)),
    policyIds: frozenSorted(read.kept.flatMap((d) => (d.policyId === undefined ? [] : [d.policyId]))),
    runtimeIds: frozenSorted(read.kept.map((d) => d.runtimeId)),
    // Only code-shaped entries are listed; other diagnostic text is not copied.
    diagnosticCodes: frozenSorted(read.kept.flatMap((d) => d.diagnostics).filter((c) => DIAGNOSTIC_CODE.test(c))),
    rejectedIndices: read.rejectedIndices,
    rejectedCodes: read.rejectedCodes,
    truncated: read.truncated,
    complete: read.complete,
  });
}

