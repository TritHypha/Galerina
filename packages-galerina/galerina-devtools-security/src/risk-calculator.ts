// =============================================================================
// @galerina/devtools-security — Breach Risk Calculator
//
// Wraps the IBM/Ponemon 2025 breach cost model from @galerina/core-economics.
// Provides a security-focused interface for risk calculation.
// =============================================================================

import {
  DataClassification,
  calculateRiskCost,
  PER_RECORD_LOSS_USD,
  RISK_MODIFIERS,
  CLOUD_PRICING,
} from "@galerina/core-economics";

export { DataClassification };

export interface RiskProfile {
  readonly classification:    DataClassification;
  readonly recordCount:       number;
  readonly breachProbability: number;    // 0.0 – 1.0
  readonly isMultiCloud:      boolean;
  readonly isUngovernedAI:    boolean;
}

export interface RiskAssessment {
  readonly riskCostGbp:       number;
  readonly riskCostUsd:       number;
  readonly lossPerRecordUsd:  number;
  readonly proofLevel:        "standard" | "sealed" | "escalated" | "formal";
  readonly recommendation:    string;
  readonly modifiers:         readonly string[];
}

const RISK_THRESHOLD_GBP = 1000;  // escalate above this

/** Calculate risk cost and recommend a proof level. */
export function assessRisk(profile: RiskProfile): RiskAssessment {
  const riskCostGbp = calculateRiskCost({
    classification:    profile.classification,
    recordCount:       profile.recordCount,
    breachProbability: profile.breachProbability,
    isMultiCloud:      profile.isMultiCloud,
    isUngovernedNpu:   profile.isUngovernedAI,
  });
  const riskCostUsd = riskCostGbp / CLOUD_PRICING.usdToGbp;
  const lossPerRecordUsd = PER_RECORD_LOSS_USD[profile.classification];

  const modifiers: string[] = [];
  if (profile.isMultiCloud) modifiers.push(`multi-cloud penalty: +$${(RISK_MODIFIERS.multiEnvironmentPenaltyUsd).toLocaleString()}`);
  if (profile.isUngovernedAI) modifiers.push(`shadow AI penalty: +$${(RISK_MODIFIERS.shadowAiAcceleratorTaxUsd).toLocaleString()}`);

  let proofLevel: RiskAssessment["proofLevel"];
  let recommendation: string;

  if (profile.classification >= DataClassification.Intellectual_Property
      || profile.classification === DataClassification.Healthcare_PHI) {
    proofLevel = "formal";
    recommendation = "FormalRequired: full proof chain, post-execution validation, hardware attestation";
  } else if (riskCostGbp >= RISK_THRESHOLD_GBP * 10) {
    proofLevel = "escalated";
    recommendation = "Escalated: Input/Output seals + runtime attestation. Consider hardware enclave.";
  } else if (riskCostGbp >= RISK_THRESHOLD_GBP) {
    proofLevel = "sealed";
    recommendation = "Sealed: Input/Output seals required before any accelerator dispatch.";
  } else {
    proofLevel = "standard";
    recommendation = "Standard: ProofGraph sufficient. No additional sealing required.";
  }

  return { riskCostGbp, riskCostUsd, lossPerRecordUsd, proofLevel, recommendation, modifiers };
}

/** Format a risk assessment as a human-readable string. */
export function formatRiskAssessment(profile: RiskProfile): string {
  const a = assessRisk(profile);
  const lines = [
    `Risk Assessment for ${DataClassification[profile.classification]}:`,
    `  Records: ${profile.recordCount.toLocaleString()} × $${a.lossPerRecordUsd}/record`,
    `  Breach probability: ${(profile.breachProbability * 100).toFixed(2)}%`,
    `  Risk cost: £${a.riskCostGbp.toFixed(2)} (≈ $${a.riskCostUsd.toFixed(2)})`,
    ...a.modifiers.map(m => `  + ${m}`),
    `  Proof level required: ${a.proofLevel.toUpperCase()}`,
    `  → ${a.recommendation}`,
  ];
  return lines.join("\n");
}
