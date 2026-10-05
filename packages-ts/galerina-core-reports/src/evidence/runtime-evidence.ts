// RuntimeEvidence v0.2 and buildRuntimeEvidence (TODO pass, Grok 2026-10-05; owner may revisit).

import type { ReportRuntimeTarget } from "../audit/audit-runtime.js";
import { REPORT_RUNTIME_TARGETS } from "../audit/audit-runtime.js";
import { isAuditId, isAuditTimestamp, isRuntimeAuditReference, type RuntimeAuditReference } from "../shared/audit-reference.js";
import type { CapabilityEvidence } from "./capability-evidence.js";
import type { EffectEvidence } from "./effect-evidence.js";
import { validateCapabilityEvidence, validateEffectEvidence } from "./evidence-validator.js";

export interface RuntimeEvidence {
  readonly schemaVersion: "galerina.evidence.v1";
  readonly runtimeId: string;
  readonly generatedAt: string;
  readonly target: ReportRuntimeTarget;
  readonly environment: string;
  readonly capabilityEvidence: readonly CapabilityEvidence[];
  readonly effectEvidence: readonly EffectEvidence[];
  readonly denialReferences: readonly RuntimeAuditReference[];
  readonly proofReferences: readonly RuntimeAuditReference[];
  /** FUNGI-EVIDENCE codes found while building; empty means the document is clean. */
  readonly diagnostics: readonly string[];
}

export interface RuntimeEvidenceParams {
  readonly runtimeId: string;
  readonly target: ReportRuntimeTarget;
  readonly environment: string;
  readonly generatedAt: string;
  readonly capabilityDecisions: readonly CapabilityEvidence[];
  readonly effectDecisions: readonly EffectEvidence[];
  readonly denialReferences?: readonly RuntimeAuditReference[];
  readonly proofReferences?: readonly RuntimeAuditReference[];
}

/**
 * Aggregates decisions into one frozen document. Invalid entries are kept OUT of the
 * evidence arrays and recorded as diagnostics, so a consumer can never read a malformed
 * "allow" as evidence. Header problems throw. Async per the v0.2 signature; no I/O.
 */
export async function buildRuntimeEvidence(params: RuntimeEvidenceParams): Promise<RuntimeEvidence> {
  if (!isAuditId(params.runtimeId)) throw new Error("FUNGI-EVIDENCE-002: runtimeId is invalid.");
  if (!REPORT_RUNTIME_TARGETS.includes(params.target)) throw new Error("FUNGI-EVIDENCE-002: target is invalid.");
  if (typeof params.environment !== "string" || params.environment.length === 0) throw new Error("FUNGI-EVIDENCE-002: environment is required.");
  if (!isAuditTimestamp(params.generatedAt)) throw new Error("FUNGI-EVIDENCE-002: generatedAt must be ISO-8601 UTC.");
  const diagnostics: string[] = [];
  const seen = new Set<string>();
  const keep = <T extends { readonly evidenceId: string }>(items: readonly T[], check: (v: unknown, p: string) => readonly { code: string }[], label: string): T[] => {
    const kept: T[] = [];
    items.forEach((item, index) => {
      const problems = check(item, `${label}.${index}`);
      if (problems.length > 0) { diagnostics.push(...problems.map((p) => p.code)); return; }
      if (seen.has(item.evidenceId)) { diagnostics.push("FUNGI-EVIDENCE-003"); return; }
      seen.add(item.evidenceId);
      kept.push(Object.freeze({ ...item }));
    });
    return kept;
  };
  const capabilityEvidence = keep(params.capabilityDecisions, validateCapabilityEvidence, "capabilityDecisions");
  const effectEvidence = keep(params.effectDecisions, validateEffectEvidence, "effectDecisions");
  const refs = (list: readonly RuntimeAuditReference[] | undefined, type: RuntimeAuditReference["type"]): RuntimeAuditReference[] => {
    const out: RuntimeAuditReference[] = [];
    for (const r of list ?? []) {
      if (isRuntimeAuditReference(r) && r.type === type) out.push(Object.freeze({ type: r.type, id: r.id }));
      else diagnostics.push("FUNGI-EVIDENCE-002");
    }
    return out;
  };
  const denialReferences = refs(params.denialReferences, "denial");
  const proofReferences = refs(params.proofReferences, "proof");
  return Object.freeze({
    schemaVersion: "galerina.evidence.v1",
    runtimeId: params.runtimeId,
    generatedAt: params.generatedAt,
    target: params.target,
    environment: params.environment,
    capabilityEvidence: Object.freeze(capabilityEvidence),
    effectEvidence: Object.freeze(effectEvidence),
    denialReferences: Object.freeze(denialReferences),
    proofReferences: Object.freeze(proofReferences),
    diagnostics: Object.freeze([...new Set(diagnostics)].sort()),
  });
}
