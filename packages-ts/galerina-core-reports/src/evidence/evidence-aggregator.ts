// Evidence summary (TODO pass, Grok 2026-10-05; owner may revisit).

import type { RuntimeEvidence } from "./runtime-evidence.js";

export interface EvidenceSummary {
  readonly runtimeId: string;
  readonly capabilitiesAllowed: number;
  readonly capabilitiesDenied: number;
  readonly effectsAllowed: number;
  readonly effectsDenied: number;
  readonly undeclaredInferredEffects: readonly string[];
  readonly clean: boolean;
}

/** Counts plus the effects that were inferred but never declared (the review hot spot). */
export function summarizeRuntimeEvidence(evidence: RuntimeEvidence): EvidenceSummary {
  const caps = evidence.capabilityEvidence;
  const effects = evidence.effectEvidence;
  return Object.freeze({
    runtimeId: evidence.runtimeId,
    capabilitiesAllowed: caps.filter((c) => c.decision === "allow").length,
    capabilitiesDenied: caps.filter((c) => c.decision === "deny").length,
    effectsAllowed: effects.filter((e) => e.allowed).length,
    effectsDenied: effects.filter((e) => !e.allowed).length,
    undeclaredInferredEffects: Object.freeze(effects.filter((e) => e.inferred && !e.declared).map((e) => e.effect).sort()),
    clean: evidence.diagnostics.length === 0,
  });
}
