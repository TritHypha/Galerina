// Denial validation (TODO pass, Grok 2026-10-05; owner may revisit).

import type { ReportDiagnostic } from "../index.js";
import { containsSecretMaterial } from "../audit/audit-redaction.js";
import { isAuditId, isAuditTimestamp, isRuntimeAuditReference } from "../shared/audit-reference.js";
import { DENIAL_CATEGORIES } from "./denial-report.js";

const KEYS = ["schemaVersion", "denialId", "timestamp", "category", "reason", "policyId", "runtimeId", "effect", "capability", "destination", "diagnostics", "references"];
const text = (v: unknown, max = 512): boolean => typeof v === "string" && v.length > 0 && v.length <= max;

export function validateDenialReport(report: unknown): readonly ReportDiagnostic[] {
  const out: ReportDiagnostic[] = [];
  const add = (code: string, message: string, path: string): void => { out.push(Object.freeze({ code, severity: "error" as const, message, path })); };
  if (typeof report !== "object" || report === null || Array.isArray(report)) { add("FUNGI-DENIAL-003", "Denial report must be a plain record.", "denial"); return Object.freeze(out); }
  const d = report as Record<string, unknown>;
  for (const key of Object.keys(d)) if (!KEYS.includes(key)) add("FUNGI-DENIAL-003", `Unknown denial field ${key}.`, key);
  if (d.schemaVersion !== "galerina.denial.v1") add("FUNGI-DENIAL-001", "schemaVersion must be galerina.denial.v1.", "schemaVersion");
  if (typeof d.category !== "string" || !(DENIAL_CATEGORIES as readonly string[]).includes(d.category)) add("FUNGI-DENIAL-002", "category is invalid.", "category");
  if (!isAuditId(d.denialId)) add("FUNGI-DENIAL-003", "denialId is invalid.", "denialId");
  if (!isAuditTimestamp(d.timestamp)) add("FUNGI-DENIAL-003", "timestamp must be ISO-8601 UTC.", "timestamp");
  if (!text(d.reason, 2048)) add("FUNGI-DENIAL-003", "reason is required.", "reason");
  if (!isAuditId(d.runtimeId)) add("FUNGI-DENIAL-003", "runtimeId is invalid.", "runtimeId");
  if ("policyId" in d && !isAuditId(d.policyId)) add("FUNGI-DENIAL-003", "policyId is invalid when present.", "policyId");
  for (const key of ["effect", "capability", "destination"]) if (key in d && !text(d[key])) add("FUNGI-DENIAL-003", `${key} must be a non-empty short string when present.`, key);
  if (!Array.isArray(d.diagnostics) || !d.diagnostics.every((x) => text(x, 64))) add("FUNGI-DENIAL-003", "diagnostics must be a list of diagnostic codes.", "diagnostics");
  if (!Array.isArray(d.references) || !d.references.every(isRuntimeAuditReference)) add("FUNGI-DENIAL-003", "references must be RuntimeAuditReference values.", "references");
  if (containsSecretMaterial(d)) add("FUNGI-DENIAL-004", "Denial report contains secret material.", "denial");
  return Object.freeze(out);
}
