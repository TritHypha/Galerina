// Evidence validation (TODO pass, Grok 2026-10-05; owner may revisit).

import type { ReportDiagnostic } from "../index.js";
import { containsSecretMaterial } from "../audit/audit-redaction.js";
import { isAuditId, isAuditTimestamp, isRuntimeAuditReference } from "../shared/audit-reference.js";

const text = (v: unknown, max = 512): boolean => typeof v === "string" && v.length > 0 && v.length <= max;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
type Add = (code: string, message: string, path: string) => void;

function common(e: Record<string, unknown>, path: string, add: Add, keys: readonly string[]): void {
  for (const key of Object.keys(e)) if (!keys.includes(key)) add("FUNGI-EVIDENCE-002", `Unknown evidence field ${key}.`, `${path}.${key}`);
  if (e.schemaVersion !== "galerina.evidence.v1") add("FUNGI-EVIDENCE-001", "schemaVersion must be galerina.evidence.v1.", `${path}.schemaVersion`);
  if (!isAuditId(e.evidenceId)) add("FUNGI-EVIDENCE-002", "evidenceId is invalid.", `${path}.evidenceId`);
  if (!isAuditTimestamp(e.generatedAt)) add("FUNGI-EVIDENCE-002", "generatedAt must be ISO-8601 UTC.", `${path}.generatedAt`);
  if (!text(e.reason, 2048)) add("FUNGI-EVIDENCE-002", "reason is required.", `${path}.reason`);
  if (containsSecretMaterial(e)) add("FUNGI-EVIDENCE-004", "Evidence contains secret material.", path);
}

export function validateCapabilityEvidence(value: unknown, path = "capabilityEvidence"): readonly ReportDiagnostic[] {
  const out: ReportDiagnostic[] = [];
  const add: Add = (code, message, p) => { out.push(Object.freeze({ code, severity: "error" as const, message, path: p })); };
  if (!isRecord(value)) { add("FUNGI-EVIDENCE-002", "Capability evidence must be a plain record.", path); return out; }
  common(value, path, add, ["schemaVersion", "evidenceId", "generatedAt", "capability", "decision", "policyId", "reason", "references"]);
  if (!text(value.capability)) add("FUNGI-EVIDENCE-002", "capability is required.", `${path}.capability`);
  if (value.decision !== "allow" && value.decision !== "deny") add("FUNGI-EVIDENCE-002", "decision must be allow or deny.", `${path}.decision`);
  if ("policyId" in value && !isAuditId(value.policyId)) add("FUNGI-EVIDENCE-002", "policyId is invalid when present.", `${path}.policyId`);
  if (!Array.isArray(value.references) || !value.references.every(isRuntimeAuditReference)) add("FUNGI-EVIDENCE-002", "references must be RuntimeAuditReference values.", `${path}.references`);
  return out;
}

export function validateEffectEvidence(value: unknown, path = "effectEvidence"): readonly ReportDiagnostic[] {
  const out: ReportDiagnostic[] = [];
  const add: Add = (code, message, p) => { out.push(Object.freeze({ code, severity: "error" as const, message, path: p })); };
  if (!isRecord(value)) { add("FUNGI-EVIDENCE-002", "Effect evidence must be a plain record.", path); return out; }
  common(value, path, add, ["schemaVersion", "evidenceId", "generatedAt", "effect", "declared", "inferred", "transitive", "allowed", "reason"]);
  if (!text(value.effect)) add("FUNGI-EVIDENCE-002", "effect is required.", `${path}.effect`);
  for (const key of ["declared", "inferred", "transitive", "allowed"]) if (typeof value[key] !== "boolean") add("FUNGI-EVIDENCE-002", `${key} must be Boolean.`, `${path}.${key}`);
  if (value.allowed === true && value.declared !== true && value.inferred !== true) add("FUNGI-EVIDENCE-002", "An effect cannot be allowed when it was neither declared nor inferred.", `${path}.allowed`);
  if (value.transitive === true && value.inferred !== true) add("FUNGI-EVIDENCE-002", "A transitive effect must also be inferred.", `${path}.transitive`);
  return out;
}
