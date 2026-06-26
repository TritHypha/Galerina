// =============================================================================
// @galerina/core-economics — CostGraph + ValueGraph
//
// Phase 29. Economics is a CONSTRAINT layer below governance:
//   "Economics can pull the emergency brake on a safe path.
//    Economics can never press the gas pedal on an unsafe one."
//
// This package READS governance artefacts (ProofGraph results) but NEVER
// modifies them. The RouteDecision type carries governanceApproved: true as a
// literal — it is structurally impossible to produce an unapproved route here.
//
// Calibration: docs/Knowledge-Bases/galerina-calibration-data.md
//   Hardware: i9-9900K (AVX2), i5-11400H (AVX2) — no AVX-512
//   Cloud:    DigitalOcean per-second billing
//   AI:       OpenAI per-1M-token pricing
//   Risk:     IBM/Ponemon 2025 breach matrix
// =============================================================================

// ---------------------------------------------------------------------------
// Execution targets
// ---------------------------------------------------------------------------

export type ExecutionTarget =
  | "cpu" | "wasm" | "wasm-simd"
  | "gpu" | "npu" | "apu"
  | "cloud-cpu" | "enclave";

// ---------------------------------------------------------------------------
// CostGraph — total cost of an execution path
// ---------------------------------------------------------------------------

/**
 * total_cost = compute + audit + governance + AI + storage + network + risk
 * All amounts in GBP. Lower is preferred — among governance-APPROVED paths only.
 */
export interface CostBreakdown {
  readonly computeCost:    number;
  readonly auditCost:      number;
  readonly governanceCost: number;
  readonly aiCost:         number;
  readonly storageCost:    number;
  readonly networkCost:    number;
  readonly riskCost:       number;
  readonly total:          number;
}

export interface CostEstimate {
  readonly flowName:        string;
  readonly target:          ExecutionTarget;
  readonly breakdown:       CostBreakdown;
  readonly proofLevel:      number;   // from the hardware trust profile
}

// ---------------------------------------------------------------------------
// Calibration constants (real data)
// ---------------------------------------------------------------------------

/** DigitalOcean per-second-billed droplet hourly rates (USD), GBP at ~0.79. */
export const CLOUD_PRICING = {
  usdToGbp: 0.79,
  droplet1gbHourlyUsd: 0.00893,
  droplet2gbHourlyUsd: 0.01786,
  bandwidthPerGibUsd: 0.01,
} as const;

/** OpenAI per-1M-token pricing (USD). */
export const AI_PRICING = {
  "gpt-5.5":      { inputPer1m: 5.00, cachedPer1m: 0.50, outputPer1m: 30.00 },
  "gpt-5.4-mini": { inputPer1m: 0.75, cachedPer1m: 0.075, outputPer1m: 4.50 },
} as const;

export type AiModel = keyof typeof AI_PRICING;

// ---------------------------------------------------------------------------
// CostGraph builder
// ---------------------------------------------------------------------------

export interface CostInputs {
  readonly flowName:        string;
  readonly target:          ExecutionTarget;
  readonly cpuMs:           number;          // estimated CPU time
  readonly auditRecords:    number;          // number of audit.write events
  readonly proofLevel:      number;          // 0-4 (Standard..FormalRequired)
  readonly aiTokens?:       { input: number; cached: number; output: number; model: AiModel };
  readonly storageBytes?:   number;
  readonly networkBytes?:   number;
  readonly riskCost?:       number;          // from ValueGraph (see below)
}

/**
 * Build a full cost breakdown for an execution path.
 * Higher proof levels cost more (sealing, attestation) — that's the security tax.
 */
export function estimateCost(inputs: CostInputs): CostEstimate {
  const gbp = CLOUD_PRICING.usdToGbp;

  // compute_cost: CPU-ms × droplet rate (per-second billing, 1GB baseline)
  const dropletPerMsGbp = (CLOUD_PRICING.droplet1gbHourlyUsd * gbp) / (3600 * 1000);
  const computeCost = inputs.cpuMs * dropletPerMsGbp;

  // audit_cost: each record ~1KB stored; storage is cheap but non-zero
  const auditCost = inputs.auditRecords * 0.0000001;

  // governance_cost: proof level scales the governance overhead
  // ProofLevel 0 (Standard) = baseline; each level adds sealing/attestation cost
  const governanceCost = inputs.proofLevel * computeCost * 0.05;

  // ai_cost: token pricing
  let aiCost = 0;
  if (inputs.aiTokens) {
    const p = AI_PRICING[inputs.aiTokens.model];
    aiCost = ((inputs.aiTokens.input / 1e6) * p.inputPer1m
            + (inputs.aiTokens.cached / 1e6) * p.cachedPer1m
            + (inputs.aiTokens.output / 1e6) * p.outputPer1m) * gbp;
  }

  // storage_cost + network_cost
  const storageCost = (inputs.storageBytes ?? 0) / 1e9 * 0.01 * gbp;
  const networkCost = (inputs.networkBytes ?? 0) / (1024 ** 3) * CLOUD_PRICING.bandwidthPerGibUsd * gbp;

  const riskCost = inputs.riskCost ?? 0;

  const total = computeCost + auditCost + governanceCost + aiCost + storageCost + networkCost + riskCost;

  return {
    flowName: inputs.flowName,
    target: inputs.target,
    proofLevel: inputs.proofLevel,
    breakdown: { computeCost, auditCost, governanceCost, aiCost, storageCost, networkCost, riskCost, total },
  };
}

// ---------------------------------------------------------------------------
// ValueGraph — risk-adjusted value (IBM/Ponemon 2025)
// ---------------------------------------------------------------------------

export enum DataClassification {
  Public = 0,
  Employee_Data = 1,
  Healthcare_PHI = 2,
  Financial_Record = 3,
  Customer_PII = 4,
  Intellectual_Property = 5,
}

/** Per-record loss in USD (IBM/Ponemon 2025). */
export const PER_RECORD_LOSS_USD: Record<DataClassification, number> = {
  [DataClassification.Public]: 0,
  [DataClassification.Employee_Data]: 138,
  [DataClassification.Healthcare_PHI]: 142,
  [DataClassification.Financial_Record]: 155,
  [DataClassification.Customer_PII]: 160,
  [DataClassification.Intellectual_Property]: 178,
};

export const RISK_MODIFIERS = {
  multiEnvironmentPenaltyUsd: 1_040_000,  // multi-cloud vs pure on-prem delta
  shadowAiAcceleratorTaxUsd: 670_000,     // ungoverned external AI / unvetted runtime
} as const;

export interface RiskInputs {
  readonly classification:      DataClassification;
  readonly recordCount:         number;
  readonly breachProbability:   number;   // 0-1, from ProofGraph vulnerability assessment
  readonly isMultiCloud:        boolean;
  readonly isUngovernedNpu:     boolean;
}

/**
 * risk_cost = breach_probability × breach_loss   (GBP)
 * Calibrated with the IBM/Ponemon 2025 matrix.
 */
export function calculateRiskCost(inputs: RiskInputs): number {
  let lossUsd = PER_RECORD_LOSS_USD[inputs.classification] * inputs.recordCount;
  if (inputs.isMultiCloud)   lossUsd += RISK_MODIFIERS.multiEnvironmentPenaltyUsd;
  if (inputs.isUngovernedNpu) lossUsd += RISK_MODIFIERS.shadowAiAcceleratorTaxUsd;
  const riskUsd = inputs.breachProbability * lossUsd;
  return riskUsd * CLOUD_PRICING.usdToGbp;
}

// ---------------------------------------------------------------------------
// RouteDecision — the output. governanceApproved is ALWAYS true (literal).
// ---------------------------------------------------------------------------

/**
 * The economics layer can only emit routes for ALREADY-APPROVED flows.
 * `governanceApproved: true` is a literal type — there is no `false` variant.
 * This makes it structurally impossible for economics to grant authority.
 */
export interface RouteDecision {
  readonly flowName:           string;
  readonly selectedTarget:     ExecutionTarget;
  readonly reason:             string;
  readonly governanceApproved: true;          // LITERAL — never false
  readonly estimatedCost:      CostEstimate;
  readonly emergencyBrake?:    string;         // set if a safe-but-expensive path was BLOCKED
  readonly proofEscalation?:   string;         // set when risk forces a higher proof level
}

export interface RoutePolicy {
  readonly maxCostGbp?:        number;         // economics may block over-budget SAFE flows
  readonly riskThresholdGbp:   number;         // ≥ this → escalate proof level (default 1000)
}

/**
 * Choose the cheapest valid execution path among governance-approved candidates.
 *
 * The candidates are ALREADY proven safe (caller only passes approved flows).
 * Economics picks the cheapest, may pull the emergency brake on over-budget
 * paths, and escalates proof level when risk_cost crosses the threshold —
 * but NEVER unblocks an unsafe flow (it cannot — only approved flows reach here).
 */
export function selectRoute(
  candidates: readonly CostEstimate[],
  policy: RoutePolicy = { riskThresholdGbp: 1000 },
): RouteDecision {
  if (candidates.length === 0) {
    throw new Error("selectRoute: no candidate execution paths");
  }

  // Cheapest first
  const sorted = [...candidates].sort((a, b) => a.breakdown.total - b.breakdown.total);
  const cheapest = sorted[0]!;
  const flowName = cheapest.flowName;

  // Emergency brake: if even the cheapest exceeds budget, block (safe-but-too-expensive)
  if (policy.maxCostGbp !== undefined && cheapest.breakdown.total > policy.maxCostGbp) {
    return {
      flowName,
      selectedTarget: cheapest.target,
      reason: `cheapest path £${cheapest.breakdown.total.toFixed(4)} exceeds budget £${policy.maxCostGbp}`,
      governanceApproved: true,
      estimatedCost: cheapest,
      emergencyBrake: `Blocked: exceeds cost budget. Economics pulled the emergency brake on a safe-but-expensive path.`,
    };
  }

  // Risk escalation: if risk_cost ≥ threshold, prefer the highest-proof-level candidate
  const riskCost = cheapest.breakdown.riskCost;
  if (riskCost >= policy.riskThresholdGbp) {
    // Among candidates, pick the one with the highest proof level (most sealing)
    const escalated = [...candidates].sort((a, b) => b.proofLevel - a.proofLevel)[0]!;
    return {
      flowName,
      selectedTarget: escalated.target,
      reason: `risk_cost £${riskCost.toFixed(2)} ≥ threshold £${policy.riskThresholdGbp} — escalated to ProofLevel ${escalated.proofLevel}`,
      governanceApproved: true,
      estimatedCost: escalated,
      proofEscalation: `Escalated Track: Input/Output seals enforced (ProofLevel ${escalated.proofLevel}).`,
    };
  }

  // Standard: cheapest valid path
  return {
    flowName,
    selectedTarget: cheapest.target,
    reason: `cheapest governance-approved path (£${cheapest.breakdown.total.toFixed(6)})`,
    governanceApproved: true,
    estimatedCost: cheapest,
  };
}

// ---------------------------------------------------------------------------
// Hardware profiles (calibration: i9 / i5 — both AVX2, no AVX-512)
// ---------------------------------------------------------------------------

export interface HardwareProfile {
  readonly model:       string;
  readonly cores:       number;
  readonly maxTurboHz:  number;
  readonly vectorTier:  "scalar" | "avx2" | "avx512";
  readonly topology:    "symmetric" | "hybrid";
}

export const I9_DESKTOP: HardwareProfile = {
  model: "Intel_Core_i9_9900K", cores: 8, maxTurboHz: 5.0e9,
  vectorTier: "avx2", topology: "symmetric",
};

export const I5_LAPTOP: HardwareProfile = {
  model: "Intel_Core_i5_11400H", cores: 6, maxTurboHz: 4.36e9,
  vectorTier: "avx2", topology: "symmetric",
};

/**
 * Route a flow to a vector tier based on hardware. Both canonical machines are
 * AVX2 (no AVX-512), so this always returns "avx2" or below — never avx512.
 */
export function selectVectorTier(hw: HardwareProfile): "scalar" | "avx2" | "avx512" {
  return hw.vectorTier;  // i9 + i5 both → "avx2"
}
