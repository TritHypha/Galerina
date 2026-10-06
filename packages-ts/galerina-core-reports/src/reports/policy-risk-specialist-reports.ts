// Policy, risk, and specialist-hardware report contracts (TODO pass, Grok 2026-10-05).
// Zero-trust defaults, owner may revisit. Pure: no I/O. Closed vocabularies only —
// reports carry ids, counts, closed enums and diagnostic codes; never free-text
// reasons, policy bodies, model prompts, payloads, or secret material.

import { isAuditTimestamp } from "../shared/audit-reference.js";

/** Upper bound on items one of these reports will accept. */
export const MAX_CONTRACT_ITEMS = 100_000;

const ID = /^[A-Za-z][A-Za-z0-9._-]{0,63}$/;
const CODE = /^FUNGI-[A-Z0-9-]{1,48}$/;

function requireTimestamp(value: unknown, code: string): void {
  if (!isAuditTimestamp(value)) throw new Error(code + ": generatedAt must be ISO-8601 UTC.");
}

function readOwn<T extends object>(value: unknown, label: string): T {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("FUNGI-REPORT-002: " + label + " must be a record.");
  }
  try {
    return Object.fromEntries(Object.keys(value as object).map((k) => [k, (value as Record<string, unknown>)[k]])) as T;
  } catch {
    throw new Error("FUNGI-REPORT-002: " + label + " could not be read.");
  }
}

/**
 * Closed-shape read (SuperGrok C15 NB-1, zero-trust default, owner may revisit): the entry may
 * carry only the listed keys. Any other own key (enumerable or not, string or symbol) refuses the
 * whole entry instead of being silently dropped. The refused key is never echoed.
 */
function assertClosedKeys(value: unknown, label: string, allowed: readonly string[]): void {
  let keys: readonly (string | symbol)[];
  try {
    keys = Reflect.ownKeys(value as object);
  } catch {
    throw new Error("FUNGI-REPORT-002: " + label + " could not be read.");
  }
  for (const k of keys) {
    if (typeof k !== "string" || !allowed.includes(k)) throw new Error("FUNGI-REPORT-002: " + label + " has a field outside its closed shape.");
  }
}

function readClosed<T extends object>(value: unknown, label: string, allowed: readonly string[]): T {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return readOwn<T>(value, label); // throws: not a record
  assertClosedKeys(value, label, allowed); // keys only; no getter runs before the shape is accepted
  return readOwn<T>(value, label);
}

function requireId(value: unknown, label: string): string {
  if (typeof value !== "string" || !ID.test(value)) throw new Error("FUNGI-REPORT-002: " + label + " id refused.");
  return value;
}

function requireCode(value: unknown, label: string): string {
  if (typeof value !== "string" || !CODE.test(value)) throw new Error("FUNGI-REPORT-002: " + label + " code refused.");
  return value;
}

function freezeCodes(values: unknown, label: string): readonly string[] {
  if (!Array.isArray(values)) throw new Error("FUNGI-REPORT-002: " + label + " must be an array.");
  if (values.length > 64) throw new Error("FUNGI-REPORT-005: " + label + " too long.");
  const out: string[] = [];
  for (const v of values) out.push(requireCode(v, label));
  return Object.freeze(out);
}

function boundedList<T>(items: unknown, label: string, mapOne: (raw: unknown, index: number) => T | null): {
  readonly accepted: readonly T[];
  readonly rejectedIndexes: readonly number[];
  readonly truncated: boolean;
  readonly complete: boolean;
} {
  if (!Array.isArray(items)) throw new Error("FUNGI-REPORT-002: " + label + " must be an array.");
  const rejectedIndexes: number[] = [];
  const accepted: T[] = [];
  const limit = Math.min(items.length, MAX_CONTRACT_ITEMS);
  for (let i = 0; i < limit; i++) {
    try {
      const one = mapOne(items[i], i);
      if (one === null) rejectedIndexes.push(i);
      else accepted.push(one);
    } catch {
      rejectedIndexes.push(i);
    }
  }
  const truncated = items.length > MAX_CONTRACT_ITEMS;
  return {
    accepted: Object.freeze(accepted),
    rejectedIndexes: Object.freeze(rejectedIndexes),
    truncated,
    complete: rejectedIndexes.length === 0 && !truncated,
  };
}

// ── Policy family ─────────────────────────────────────────────────────────

export const POLICY_KINDS = Object.freeze([
  "network",
  "capability",
  "effect",
  "runtime",
  "data",
  "unknown",
] as const);
export type PolicyKind = (typeof POLICY_KINDS)[number];

export const POLICY_EFFECTIVE_DECISIONS = Object.freeze(["allow", "deny", "abstain"] as const);
export type PolicyEffectiveDecision = (typeof POLICY_EFFECTIVE_DECISIONS)[number];

export const POLICY_CONFLICT_KINDS = Object.freeze([
  "duplicate_id",
  "contradictory_decision",
  "unknown_reference",
  "priority_tie",
] as const);
export type PolicyConflictKind = (typeof POLICY_CONFLICT_KINDS)[number];

export const POLICY_AI_SUMMARY_TOKENS = Object.freeze([
  "deny_default",
  "conflicts_present",
  "unknown_policies",
  "allow_present",
  "empty",
] as const);
export type PolicyAiSummaryToken = (typeof POLICY_AI_SUMMARY_TOKENS)[number];

export interface PolicyIndexEntry {
  readonly policyId: string;
  readonly kind: PolicyKind;
}

export interface PolicyIndexReport {
  readonly schema: "galerina.report.policy-index.v1";
  readonly generatedAt: string;
  readonly entries: readonly PolicyIndexEntry[];
  readonly byKind: Readonly<Record<PolicyKind, number>>;
  readonly rejectedIndexes: readonly number[];
  readonly truncated: boolean;
  readonly complete: boolean;
}

export interface PolicyDefinitionEntry {
  readonly policyId: string;
  readonly kind: PolicyKind;
  /** Closed field names present on the definition; values are never copied. */
  readonly fieldNames: readonly string[];
}

export interface PolicyDefinitionsReport {
  readonly schema: "galerina.report.policy-definitions.v1";
  readonly generatedAt: string;
  readonly entries: readonly PolicyDefinitionEntry[];
  readonly rejectedIndexes: readonly number[];
  readonly truncated: boolean;
  readonly complete: boolean;
}

export interface PolicyEffectiveEntry {
  readonly subjectId: string;
  readonly policyId: string;
  readonly decision: PolicyEffectiveDecision;
}

export interface PolicyEffectiveReport {
  readonly schema: "galerina.report.policy-effective.v1";
  readonly generatedAt: string;
  readonly entries: readonly PolicyEffectiveEntry[];
  readonly byDecision: Readonly<Record<PolicyEffectiveDecision, number>>;
  readonly rejectedIndexes: readonly number[];
  readonly truncated: boolean;
  readonly complete: boolean;
}

export interface PolicyConflictEntry {
  readonly conflictId: string;
  readonly kind: PolicyConflictKind;
  readonly policyIds: readonly string[];
  readonly diagnosticCodes: readonly string[];
}

export interface PolicyConflictReport {
  readonly schema: "galerina.report.policy-conflict.v1";
  readonly generatedAt: string;
  readonly entries: readonly PolicyConflictEntry[];
  readonly byKind: Readonly<Record<PolicyConflictKind, number>>;
  readonly rejectedIndexes: readonly number[];
  readonly truncated: boolean;
  readonly complete: boolean;
}

export interface PolicyAiSummaryReport {
  readonly schema: "galerina.report.policy-ai-summary.v1";
  readonly generatedAt: string;
  readonly tokens: readonly PolicyAiSummaryToken[];
  readonly policyCount: number;
  readonly conflictCount: number;
  readonly denyCount: number;
  readonly allowCount: number;
  readonly complete: boolean;
}

function isPolicyKind(v: unknown): v is PolicyKind {
  return typeof v === "string" && (POLICY_KINDS as readonly string[]).includes(v);
}
function isDecision(v: unknown): v is PolicyEffectiveDecision {
  return typeof v === "string" && (POLICY_EFFECTIVE_DECISIONS as readonly string[]).includes(v);
}
function isConflictKind(v: unknown): v is PolicyConflictKind {
  return typeof v === "string" && (POLICY_CONFLICT_KINDS as readonly string[]).includes(v);
}
function isAiToken(v: unknown): v is PolicyAiSummaryToken {
  return typeof v === "string" && (POLICY_AI_SUMMARY_TOKENS as readonly string[]).includes(v);
}

const FIELD_NAME = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

// Closed input shapes (C15 NB-1): an entry with any other key is rejected, not trimmed.
const POLICY_INDEX_KEYS = Object.freeze(["policyId", "kind"]);
const POLICY_DEFINITION_KEYS = Object.freeze(["policyId", "kind", "fieldNames"]);
const POLICY_EFFECTIVE_KEYS = Object.freeze(["subjectId", "policyId", "decision"]);
const POLICY_CONFLICT_KEYS = Object.freeze(["conflictId", "kind", "policyIds", "diagnosticCodes"]);
const POLICY_AI_SUMMARY_KEYS = Object.freeze(["tokens", "policyCount", "conflictCount", "denyCount", "allowCount"]);

export function createPolicyIndexReport(items: unknown, generatedAt: string): PolicyIndexReport {
  requireTimestamp(generatedAt, "FUNGI-REPORT-003");
  const seen = new Set<string>();
  const byKind = Object.fromEntries(POLICY_KINDS.map((k) => [k, 0])) as Record<PolicyKind, number>;
  const listed = boundedList<PolicyIndexEntry>(items, "policy index", (raw) => {
    const o = readClosed<Record<string, unknown>>(raw, "policy index entry", POLICY_INDEX_KEYS);
    const policyId = requireId(o.policyId, "policy");
    if (!isPolicyKind(o.kind)) return null;
    if (seen.has(policyId)) return null;
    seen.add(policyId);
    byKind[o.kind]++;
    return Object.freeze({ policyId, kind: o.kind });
  });
  return Object.freeze({
    schema: "galerina.report.policy-index.v1",
    generatedAt,
    entries: listed.accepted,
    byKind: Object.freeze({ ...byKind }),
    rejectedIndexes: listed.rejectedIndexes,
    truncated: listed.truncated,
    complete: listed.complete,
  });
}

export function createPolicyDefinitionsReport(items: unknown, generatedAt: string): PolicyDefinitionsReport {
  requireTimestamp(generatedAt, "FUNGI-REPORT-003");
  const seen = new Set<string>();
  const listed = boundedList<PolicyDefinitionEntry>(items, "policy definitions", (raw) => {
    const o = readClosed<Record<string, unknown>>(raw, "policy definition", POLICY_DEFINITION_KEYS);
    const policyId = requireId(o.policyId, "policy");
    if (!isPolicyKind(o.kind)) return null;
    if (seen.has(policyId)) return null;
    seen.add(policyId);
    if (!Array.isArray(o.fieldNames) || o.fieldNames.length > 64) return null;
    const fieldNames: string[] = [];
    for (const n of o.fieldNames) {
      if (typeof n !== "string" || !FIELD_NAME.test(n)) return null;
      fieldNames.push(n);
    }
    return Object.freeze({ policyId, kind: o.kind, fieldNames: Object.freeze(fieldNames) });
  });
  return Object.freeze({
    schema: "galerina.report.policy-definitions.v1",
    generatedAt,
    entries: listed.accepted,
    rejectedIndexes: listed.rejectedIndexes,
    truncated: listed.truncated,
    complete: listed.complete,
  });
}

export function createPolicyEffectiveReport(items: unknown, generatedAt: string): PolicyEffectiveReport {
  requireTimestamp(generatedAt, "FUNGI-REPORT-003");
  const byDecision = Object.fromEntries(POLICY_EFFECTIVE_DECISIONS.map((k) => [k, 0])) as Record<PolicyEffectiveDecision, number>;
  const listed = boundedList<PolicyEffectiveEntry>(items, "policy effective", (raw) => {
    const o = readClosed<Record<string, unknown>>(raw, "policy effective entry", POLICY_EFFECTIVE_KEYS);
    const subjectId = requireId(o.subjectId, "subject");
    const policyId = requireId(o.policyId, "policy");
    if (!isDecision(o.decision)) return null;
    byDecision[o.decision]++;
    return Object.freeze({ subjectId, policyId, decision: o.decision });
  });
  return Object.freeze({
    schema: "galerina.report.policy-effective.v1",
    generatedAt,
    entries: listed.accepted,
    byDecision: Object.freeze({ ...byDecision }),
    rejectedIndexes: listed.rejectedIndexes,
    truncated: listed.truncated,
    complete: listed.complete,
  });
}

export function createPolicyConflictReport(items: unknown, generatedAt: string): PolicyConflictReport {
  requireTimestamp(generatedAt, "FUNGI-REPORT-003");
  const seen = new Set<string>();
  const byKind = Object.fromEntries(POLICY_CONFLICT_KINDS.map((k) => [k, 0])) as Record<PolicyConflictKind, number>;
  const listed = boundedList<PolicyConflictEntry>(items, "policy conflicts", (raw) => {
    const o = readClosed<Record<string, unknown>>(raw, "policy conflict", POLICY_CONFLICT_KEYS);
    const conflictId = requireId(o.conflictId, "conflict");
    if (seen.has(conflictId)) return null;
    seen.add(conflictId);
    if (!isConflictKind(o.kind)) return null;
    if (!Array.isArray(o.policyIds) || o.policyIds.length < 1 || o.policyIds.length > 16) return null;
    const policyIds: string[] = [];
    for (const id of o.policyIds) policyIds.push(requireId(id, "policy"));
    const diagnosticCodes = freezeCodes(o.diagnosticCodes ?? [], "conflict codes");
    byKind[o.kind]++;
    return Object.freeze({ conflictId, kind: o.kind, policyIds: Object.freeze(policyIds), diagnosticCodes });
  });
  return Object.freeze({
    schema: "galerina.report.policy-conflict.v1",
    generatedAt,
    entries: listed.accepted,
    byKind: Object.freeze({ ...byKind }),
    rejectedIndexes: listed.rejectedIndexes,
    truncated: listed.truncated,
    complete: listed.complete,
  });
}

/**
 * AI-summary report: closed tokens + counts only. Never accepts free-text summary
 * strings (those are refused so a model cannot inject prose into the report).
 */
export function createPolicyAiSummaryReport(input: unknown, generatedAt: string): PolicyAiSummaryReport {
  requireTimestamp(generatedAt, "FUNGI-REPORT-003");
  // C16 NB-1 (zero-trust default, owner may revisit): closed-key check before any getter runs.
  assertClosedKeys(input, "policy ai summary", POLICY_AI_SUMMARY_KEYS);
  const o = readOwn<Record<string, unknown>>(input, "policy ai summary");
  if (o.summaryText !== undefined || o.text !== undefined || o.message !== undefined || o.prompt !== undefined) {
    throw new Error("FUNGI-REPORT-002: free-text AI summary fields refused.");
  }
  if (!Array.isArray(o.tokens) || o.tokens.length > 16) throw new Error("FUNGI-REPORT-002: tokens refused.");
  const tokens: PolicyAiSummaryToken[] = [];
  for (const t of o.tokens) {
    if (!isAiToken(t)) throw new Error("FUNGI-REPORT-002: unknown AI summary token.");
    tokens.push(t);
  }
  const asCount = (v: unknown): number => {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > MAX_CONTRACT_ITEMS) {
      throw new Error("FUNGI-REPORT-002: count refused.");
    }
    return v;
  };
  return Object.freeze({
    schema: "galerina.report.policy-ai-summary.v1",
    generatedAt,
    tokens: Object.freeze(tokens),
    policyCount: asCount(o.policyCount ?? 0),
    conflictCount: asCount(o.conflictCount ?? 0),
    denyCount: asCount(o.denyCount ?? 0),
    allowCount: asCount(o.allowCount ?? 0),
    complete: true,
  });
}

// ── Risk / security family ────────────────────────────────────────────────

export const RISK_SEVERITIES = Object.freeze(["info", "low", "medium", "high", "critical"] as const);
export type RiskSeverity = (typeof RISK_SEVERITIES)[number];

export const RISK_KINDS = Object.freeze([
  "malicious_data",
  "exploit_resistance",
  "resource_budget",
  "taint_flow",
  "hardware_risk",
] as const);
export type RiskKind = (typeof RISK_KINDS)[number];

export interface RiskFinding {
  readonly findingId: string;
  readonly kind: RiskKind;
  readonly severity: RiskSeverity;
  readonly diagnosticCodes: readonly string[];
}

export interface RiskFamilyReport {
  readonly schema: "galerina.report.risk.v1";
  readonly generatedAt: string;
  readonly kind: RiskKind;
  readonly findings: readonly RiskFinding[];
  readonly bySeverity: Readonly<Record<RiskSeverity, number>>;
  readonly rejectedIndexes: readonly number[];
  readonly truncated: boolean;
  readonly complete: boolean;
}

// Payload-family keys (payload/sample/raw/message/reason) are outside this shape, so they still refuse the finding.
const RISK_FINDING_KEYS = Object.freeze(["findingId", "kind", "severity", "diagnosticCodes"]);

function isSeverity(v: unknown): v is RiskSeverity {
  return typeof v === "string" && (RISK_SEVERITIES as readonly string[]).includes(v);
}

function createRiskReport(kind: RiskKind, items: unknown, generatedAt: string): RiskFamilyReport {
  requireTimestamp(generatedAt, "FUNGI-REPORT-003");
  const seen = new Set<string>();
  const bySeverity = Object.fromEntries(RISK_SEVERITIES.map((k) => [k, 0])) as Record<RiskSeverity, number>;
  const listed = boundedList<RiskFinding>(items, kind, (raw) => {
    const o = readClosed<Record<string, unknown>>(raw, kind + " finding", RISK_FINDING_KEYS);
    const findingId = requireId(o.findingId, "finding");
    if (seen.has(findingId)) return null;
    seen.add(findingId);
    if (o.kind !== undefined && o.kind !== kind) return null;
    if (!isSeverity(o.severity)) return null;
    const diagnosticCodes = freezeCodes(o.diagnosticCodes ?? [], "risk codes");
    bySeverity[o.severity]++;
    return Object.freeze({ findingId, kind, severity: o.severity, diagnosticCodes });
  });
  return Object.freeze({
    schema: "galerina.report.risk.v1",
    generatedAt,
    kind,
    findings: listed.accepted,
    bySeverity: Object.freeze({ ...bySeverity }),
    rejectedIndexes: listed.rejectedIndexes,
    truncated: listed.truncated,
    complete: listed.complete,
  });
}

export const createMaliciousDataReport = (items: unknown, generatedAt: string): RiskFamilyReport =>
  createRiskReport("malicious_data", items, generatedAt);
export const createExploitResistanceReport = (items: unknown, generatedAt: string): RiskFamilyReport =>
  createRiskReport("exploit_resistance", items, generatedAt);
export const createResourceBudgetReport = (items: unknown, generatedAt: string): RiskFamilyReport =>
  createRiskReport("resource_budget", items, generatedAt);
export const createTaintFlowReport = (items: unknown, generatedAt: string): RiskFamilyReport =>
  createRiskReport("taint_flow", items, generatedAt);
export const createHardwareRiskReport = (items: unknown, generatedAt: string): RiskFamilyReport =>
  createRiskReport("hardware_risk", items, generatedAt);

// ── Specialist / accelerator family ───────────────────────────────────────
// Local closed vocabularies (package border admits no @galerina/core-compute).

export const SPECIALIST_HARDWARE_CLASSES = Object.freeze([
  "cpu",
  "gpu",
  "npu",
  "tpu",
  "vpu",
  "fpga",
  "asic",
] as const);
export type SpecialistHardwareClass = (typeof SPECIALIST_HARDWARE_CLASSES)[number];

export const SPECIALIST_AVAILABILITIES = Object.freeze([
  "available",
  "planning_only",
  "unavailable",
  "unknown",
] as const);
export type SpecialistAvailability = (typeof SPECIALIST_AVAILABILITIES)[number];

export const SPECIALIST_SENSITIVITIES = Object.freeze([
  "public",
  "internal",
  "confidential",
  "restricted",
  "secret",
] as const);
export type SpecialistSensitivity = (typeof SPECIALIST_SENSITIVITIES)[number];

export const SPECIALIST_PRECISIONS = Object.freeze([
  "fp32",
  "fp16",
  "bf16",
  "int8",
  "int4",
  "binary",
  "ternary",
  "mixed",
] as const);
export type SpecialistPrecision = (typeof SPECIALIST_PRECISIONS)[number];

export const FALLBACK_TARGETS = Object.freeze(["cpu", "wasm", "none"] as const);
export type FallbackTarget = (typeof FALLBACK_TARGETS)[number];

function isHw(v: unknown): v is SpecialistHardwareClass {
  return typeof v === "string" && (SPECIALIST_HARDWARE_CLASSES as readonly string[]).includes(v);
}
function isAvail(v: unknown): v is SpecialistAvailability {
  return typeof v === "string" && (SPECIALIST_AVAILABILITIES as readonly string[]).includes(v);
}
function isSens(v: unknown): v is SpecialistSensitivity {
  return typeof v === "string" && (SPECIALIST_SENSITIVITIES as readonly string[]).includes(v);
}
function isPrec(v: unknown): v is SpecialistPrecision {
  return typeof v === "string" && (SPECIALIST_PRECISIONS as readonly string[]).includes(v);
}
function isFallback(v: unknown): v is FallbackTarget {
  return typeof v === "string" && (FALLBACK_TARGETS as readonly string[]).includes(v);
}

export interface SpecialistHardwareEntry {
  readonly targetId: string;
  readonly hardwareClass: SpecialistHardwareClass;
  readonly availability: SpecialistAvailability;
  /** Under v1 freeze only cpu may be reported available. */
  readonly v1Executable: boolean;
}

export interface SpecialistHardwareReport {
  readonly schema: "galerina.report.specialist-hardware.v1";
  readonly generatedAt: string;
  readonly entries: readonly SpecialistHardwareEntry[];
  readonly byClass: Readonly<Record<SpecialistHardwareClass, number>>;
  readonly rejectedIndexes: readonly number[];
  readonly truncated: boolean;
  readonly complete: boolean;
}

export interface AcceleratorCapabilityEntry {
  readonly targetId: string;
  readonly hardwareClass: SpecialistHardwareClass;
  readonly capabilityIds: readonly string[];
  readonly admitted: boolean;
}

export interface AcceleratorCapabilityReport {
  readonly schema: "galerina.report.accelerator-capability.v1";
  readonly generatedAt: string;
  readonly entries: readonly AcceleratorCapabilityEntry[];
  readonly rejectedIndexes: readonly number[];
  readonly truncated: boolean;
  readonly complete: boolean;
}

export interface AcceleratorFallbackEntry {
  readonly fromClass: SpecialistHardwareClass;
  readonly toTarget: FallbackTarget;
  readonly diagnosticCodes: readonly string[];
}

export interface AcceleratorFallbackReport {
  readonly schema: "galerina.report.accelerator-fallback.v1";
  readonly generatedAt: string;
  readonly entries: readonly AcceleratorFallbackEntry[];
  readonly rejectedIndexes: readonly number[];
  readonly truncated: boolean;
  readonly complete: boolean;
}

export interface DataSensitivityEntry {
  readonly targetId: string;
  readonly maxSensitivity: SpecialistSensitivity;
  readonly requestedSensitivity: SpecialistSensitivity;
  readonly allowed: boolean;
}

export interface DataSensitivityReport {
  readonly schema: "galerina.report.data-sensitivity.v1";
  readonly generatedAt: string;
  readonly entries: readonly DataSensitivityEntry[];
  readonly rejectedIndexes: readonly number[];
  readonly truncated: boolean;
  readonly complete: boolean;
}

export interface PrecisionCompatibilityEntry {
  readonly targetId: string;
  readonly requested: SpecialistPrecision;
  readonly supported: readonly SpecialistPrecision[];
  readonly compatible: boolean;
}

export interface PrecisionCompatibilityReport {
  readonly schema: "galerina.report.precision-compatibility.v1";
  readonly generatedAt: string;
  readonly entries: readonly PrecisionCompatibilityEntry[];
  readonly rejectedIndexes: readonly number[];
  readonly truncated: boolean;
  readonly complete: boolean;
}

const SPECIALIST_HARDWARE_KEYS = Object.freeze(["targetId", "hardwareClass", "availability"]);
const ACCELERATOR_CAPABILITY_KEYS = Object.freeze(["targetId", "hardwareClass", "capabilityIds", "admitted"]);
const ACCELERATOR_FALLBACK_KEYS = Object.freeze(["fromClass", "toTarget", "diagnosticCodes"]);
const DATA_SENSITIVITY_KEYS = Object.freeze(["targetId", "maxSensitivity", "requestedSensitivity", "allowed"]);
const PRECISION_COMPATIBILITY_KEYS = Object.freeze(["targetId", "requested", "supported", "compatible"]);

const SENS_RANK: Readonly<Record<SpecialistSensitivity, number>> = Object.freeze({
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
  secret: 4,
});

export function createSpecialistHardwareReport(items: unknown, generatedAt: string): SpecialistHardwareReport {
  requireTimestamp(generatedAt, "FUNGI-REPORT-003");
  const seen = new Set<string>();
  const byClass = Object.fromEntries(SPECIALIST_HARDWARE_CLASSES.map((k) => [k, 0])) as Record<SpecialistHardwareClass, number>;
  const listed = boundedList<SpecialistHardwareEntry>(items, "specialist hardware", (raw) => {
    const o = readClosed<Record<string, unknown>>(raw, "specialist hardware entry", SPECIALIST_HARDWARE_KEYS);
    const targetId = requireId(o.targetId, "target");
    if (seen.has(targetId)) return null;
    seen.add(targetId);
    if (!isHw(o.hardwareClass) || !isAvail(o.availability)) return null;
    // Zero-trust v1 freeze: non-cpu cannot claim available.
    if (o.availability === "available" && o.hardwareClass !== "cpu") return null;
    const v1Executable = o.hardwareClass === "cpu" && o.availability === "available";
    byClass[o.hardwareClass]++;
    return Object.freeze({ targetId, hardwareClass: o.hardwareClass, availability: o.availability, v1Executable });
  });
  return Object.freeze({
    schema: "galerina.report.specialist-hardware.v1",
    generatedAt,
    entries: listed.accepted,
    byClass: Object.freeze({ ...byClass }),
    rejectedIndexes: listed.rejectedIndexes,
    truncated: listed.truncated,
    complete: listed.complete,
  });
}

export function createAcceleratorCapabilityReport(items: unknown, generatedAt: string): AcceleratorCapabilityReport {
  requireTimestamp(generatedAt, "FUNGI-REPORT-003");
  const seen = new Set<string>();
  const listed = boundedList<AcceleratorCapabilityEntry>(items, "accelerator capability", (raw) => {
    const o = readClosed<Record<string, unknown>>(raw, "accelerator capability", ACCELERATOR_CAPABILITY_KEYS);
    const targetId = requireId(o.targetId, "target");
    if (seen.has(targetId)) return null;
    seen.add(targetId);
    if (!isHw(o.hardwareClass)) return null;
    if (!Array.isArray(o.capabilityIds) || o.capabilityIds.length > 32) return null;
    const capabilityIds: string[] = [];
    for (const id of o.capabilityIds) capabilityIds.push(requireId(id, "capability"));
    // Zero-trust: non-cpu accelerators are never admitted on this report surface.
    const admitted = o.hardwareClass === "cpu" && o.admitted === true;
    if (o.admitted === true && o.hardwareClass !== "cpu") return null;
    if (typeof o.admitted !== "boolean") return null;
    return Object.freeze({
      targetId,
      hardwareClass: o.hardwareClass,
      capabilityIds: Object.freeze(capabilityIds),
      admitted,
    });
  });
  return Object.freeze({
    schema: "galerina.report.accelerator-capability.v1",
    generatedAt,
    entries: listed.accepted,
    rejectedIndexes: listed.rejectedIndexes,
    truncated: listed.truncated,
    complete: listed.complete,
  });
}

export function createAcceleratorFallbackReport(items: unknown, generatedAt: string): AcceleratorFallbackReport {
  requireTimestamp(generatedAt, "FUNGI-REPORT-003");
  const listed = boundedList<AcceleratorFallbackEntry>(items, "accelerator fallback", (raw) => {
    const o = readClosed<Record<string, unknown>>(raw, "accelerator fallback", ACCELERATOR_FALLBACK_KEYS);
    if (!isHw(o.fromClass) || !isFallback(o.toTarget)) return null;
    // Executable fallback under v1 is always cpu (or none); wasm is advisory only.
    if (o.toTarget === "none" && o.fromClass === "cpu") return null;
    const diagnosticCodes = freezeCodes(o.diagnosticCodes ?? [], "fallback codes");
    return Object.freeze({ fromClass: o.fromClass, toTarget: o.toTarget, diagnosticCodes });
  });
  return Object.freeze({
    schema: "galerina.report.accelerator-fallback.v1",
    generatedAt,
    entries: listed.accepted,
    rejectedIndexes: listed.rejectedIndexes,
    truncated: listed.truncated,
    complete: listed.complete,
  });
}

export function createDataSensitivityReport(items: unknown, generatedAt: string): DataSensitivityReport {
  requireTimestamp(generatedAt, "FUNGI-REPORT-003");
  const seen = new Set<string>();
  const listed = boundedList<DataSensitivityEntry>(items, "data sensitivity", (raw) => {
    const o = readClosed<Record<string, unknown>>(raw, "data sensitivity", DATA_SENSITIVITY_KEYS);
    const targetId = requireId(o.targetId, "target");
    if (seen.has(targetId)) return null;
    seen.add(targetId);
    if (!isSens(o.maxSensitivity) || !isSens(o.requestedSensitivity)) return null;
    const allowed = SENS_RANK[o.requestedSensitivity] <= SENS_RANK[o.maxSensitivity];
    // Caller cannot force allowed=true when the ranks forbid it.
    if (o.allowed === true && !allowed) return null;
    if (typeof o.allowed === "boolean" && o.allowed !== allowed) return null;
    return Object.freeze({
      targetId,
      maxSensitivity: o.maxSensitivity,
      requestedSensitivity: o.requestedSensitivity,
      allowed,
    });
  });
  return Object.freeze({
    schema: "galerina.report.data-sensitivity.v1",
    generatedAt,
    entries: listed.accepted,
    rejectedIndexes: listed.rejectedIndexes,
    truncated: listed.truncated,
    complete: listed.complete,
  });
}

export function createPrecisionCompatibilityReport(items: unknown, generatedAt: string): PrecisionCompatibilityReport {
  requireTimestamp(generatedAt, "FUNGI-REPORT-003");
  const seen = new Set<string>();
  const listed = boundedList<PrecisionCompatibilityEntry>(items, "precision compatibility", (raw) => {
    const o = readClosed<Record<string, unknown>>(raw, "precision compatibility", PRECISION_COMPATIBILITY_KEYS);
    const targetId = requireId(o.targetId, "target");
    if (seen.has(targetId)) return null;
    seen.add(targetId);
    if (!isPrec(o.requested) || !Array.isArray(o.supported) || o.supported.length > 16) return null;
    const supported: SpecialistPrecision[] = [];
    for (const p of o.supported) {
      if (!isPrec(p)) return null;
      supported.push(p);
    }
    const compatible = supported.includes(o.requested);
    if (o.compatible === true && !compatible) return null;
    if (typeof o.compatible === "boolean" && o.compatible !== compatible) return null;
    return Object.freeze({
      targetId,
      requested: o.requested,
      supported: Object.freeze(supported),
      compatible,
    });
  });
  return Object.freeze({
    schema: "galerina.report.precision-compatibility.v1",
    generatedAt,
    entries: listed.accepted,
    rejectedIndexes: listed.rejectedIndexes,
    truncated: listed.truncated,
    complete: listed.complete,
  });
}
