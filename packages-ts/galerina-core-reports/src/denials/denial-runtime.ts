// Denial construction (TODO pass, Grok 2026-10-05; owner may revisit).

import type { RuntimeAuditReference } from "../shared/audit-reference.js";
import type { DenialCategory, DenialReport } from "./denial-report.js";
import { validateDenialReport } from "./denial-validator.js";

export interface DenialInput {
  readonly denialId: string;
  readonly timestamp: string;
  readonly category: DenialCategory;
  readonly reason: string;
  readonly runtimeId: string;
  readonly policyId?: string;
  readonly effect?: string;
  readonly capability?: string;
  readonly destination?: string;
  readonly diagnostics?: readonly string[];
  readonly references?: readonly RuntimeAuditReference[];
}

/** Builds a frozen v0.2 denial; throws with the first FUNGI-DENIAL code when the result is invalid or unsafe. */
export function createDenialReport(input: DenialInput): DenialReport {
  const report: DenialReport = {
    schemaVersion: "galerina.denial.v1",
    denialId: input.denialId,
    timestamp: input.timestamp,
    category: input.category,
    reason: input.reason,
    ...(input.policyId === undefined ? {} : { policyId: input.policyId }),
    runtimeId: input.runtimeId,
    ...(input.effect === undefined ? {} : { effect: input.effect }),
    ...(input.capability === undefined ? {} : { capability: input.capability }),
    ...(input.destination === undefined ? {} : { destination: input.destination }),
    diagnostics: Object.freeze([...(input.diagnostics ?? [])]),
    references: Object.freeze((input.references ?? []).map((r) => Object.freeze({ type: r.type, id: r.id }))),
  };
  const problems = validateDenialReport(report);
  if (problems.length > 0) throw new Error(`${problems[0]?.code ?? "FUNGI-DENIAL-003"}: denial report refused (${problems.map((p) => p.code).join(", ")}).`);
  return Object.freeze(report);
}
