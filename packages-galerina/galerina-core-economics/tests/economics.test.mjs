/**
 * @galerina/core-economics — CostGraph + ValueGraph tests (Phase 29)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  estimateCost, calculateRiskCost, selectRoute, selectVectorTier,
  DataClassification, PER_RECORD_LOSS_USD, RISK_MODIFIERS,
  I9_DESKTOP, I5_LAPTOP, AI_PRICING, CLOUD_PRICING,
} from "../dist/index.js";

describe("CostGraph: estimateCost", () => {
  it("produces a total = sum of all cost terms", () => {
    const est = estimateCost({
      flowName: "f", target: "cpu", cpuMs: 100, auditRecords: 1, proofLevel: 0,
    });
    const b = est.breakdown;
    const sum = b.computeCost + b.auditCost + b.governanceCost + b.aiCost + b.storageCost + b.networkCost + b.riskCost;
    assert.ok(Math.abs(sum - b.total) < 1e-9, "total must equal sum of terms");
  });

  it("higher proof level costs more (governance tax)", () => {
    const base = { flowName: "f", target: "cpu", cpuMs: 1000, auditRecords: 1 };
    const p0 = estimateCost({ ...base, proofLevel: 0 });
    const p2 = estimateCost({ ...base, proofLevel: 2 });
    assert.ok(p2.breakdown.governanceCost > p0.breakdown.governanceCost,
      "ProofLevel 2 must cost more governance than ProofLevel 0");
  });

  it("AI cost uses OpenAI per-1M-token pricing", () => {
    const est = estimateCost({
      flowName: "ai", target: "cpu", cpuMs: 10, auditRecords: 1, proofLevel: 0,
      aiTokens: { input: 1_000_000, cached: 0, output: 0, model: "gpt-5.4-mini" },
    });
    // 1M input tokens of gpt-5.4-mini = $0.75 × 0.79 GBP
    const expected = 0.75 * CLOUD_PRICING.usdToGbp;
    assert.ok(Math.abs(est.breakdown.aiCost - expected) < 1e-6, `AI cost ${est.breakdown.aiCost} ≈ ${expected}`);
  });
});

describe("ValueGraph: calculateRiskCost", () => {
  it("Customer PII at $160/record", () => {
    assert.equal(PER_RECORD_LOSS_USD[DataClassification.Customer_PII], 160);
  });

  it("Intellectual Property is the costliest classification", () => {
    assert.equal(PER_RECORD_LOSS_USD[DataClassification.Intellectual_Property], 178);
    assert.ok(PER_RECORD_LOSS_USD[DataClassification.Intellectual_Property]
      > PER_RECORD_LOSS_USD[DataClassification.Customer_PII]);
  });

  it("risk_cost = breach_probability × loss", () => {
    // 20,000 PII records × $160 = $3.2M loss; 0.1% probability = $3,200 USD
    const risk = calculateRiskCost({
      classification: DataClassification.Customer_PII,
      recordCount: 20000, breachProbability: 0.001,
      isMultiCloud: false, isUngovernedNpu: false,
    });
    const expectedUsd = 0.001 * 20000 * 160;       // = $3,200
    const expectedGbp = expectedUsd * CLOUD_PRICING.usdToGbp;
    assert.ok(Math.abs(risk - expectedGbp) < 1, `risk ${risk} ≈ ${expectedGbp}`);
  });

  it("multi-cloud penalty inflates loss", () => {
    const base = { classification: DataClassification.Customer_PII, recordCount: 100, breachProbability: 1, isUngovernedNpu: false };
    const single = calculateRiskCost({ ...base, isMultiCloud: false });
    const multi  = calculateRiskCost({ ...base, isMultiCloud: true });
    assert.ok(multi > single, "multi-cloud must cost more");
  });

  it("shadow AI accelerator tax adds $670K", () => {
    const base = { classification: DataClassification.Public, recordCount: 0, breachProbability: 1, isMultiCloud: false };
    const clean = calculateRiskCost({ ...base, isUngovernedNpu: false });
    const shadow = calculateRiskCost({ ...base, isUngovernedNpu: true });
    const deltaUsd = (shadow - clean) / CLOUD_PRICING.usdToGbp;
    assert.ok(Math.abs(deltaUsd - RISK_MODIFIERS.shadowAiAcceleratorTaxUsd) < 1);
  });
});

describe("RouteDecision: selectRoute", () => {
  it("picks the cheapest governance-approved path", () => {
    const cheap = estimateCost({ flowName: "f", target: "wasm", cpuMs: 1, auditRecords: 1, proofLevel: 0 });
    const dear  = estimateCost({ flowName: "f", target: "cloud-cpu", cpuMs: 1000, auditRecords: 1, proofLevel: 0 });
    const route = selectRoute([dear, cheap]);
    assert.equal(route.selectedTarget, "wasm");
    assert.equal(route.governanceApproved, true);
  });

  it("governanceApproved is always true (literal type)", () => {
    const est = estimateCost({ flowName: "f", target: "cpu", cpuMs: 1, auditRecords: 1, proofLevel: 0 });
    const route = selectRoute([est]);
    assert.equal(route.governanceApproved, true);
  });

  it("emergency brake blocks safe-but-over-budget path", () => {
    const est = estimateCost({ flowName: "f", target: "cloud-cpu", cpuMs: 1e9, auditRecords: 1, proofLevel: 0 });
    const route = selectRoute([est], { maxCostGbp: 0.0001, riskThresholdGbp: 1000 });
    assert.ok(route.emergencyBrake, "must pull emergency brake when over budget");
    assert.equal(route.governanceApproved, true, "still approved — economics never grants/denies authority");
  });

  it("risk escalation forces higher proof level", () => {
    // High risk_cost candidate → escalate to highest proof level among candidates
    const lowProof  = estimateCost({ flowName: "f", target: "cpu", cpuMs: 10, auditRecords: 1, proofLevel: 0, riskCost: 5000 });
    const highProof = estimateCost({ flowName: "f", target: "enclave", cpuMs: 10, auditRecords: 1, proofLevel: 3, riskCost: 5000 });
    const route = selectRoute([lowProof, highProof], { riskThresholdGbp: 1000 });
    assert.ok(route.proofEscalation, "must escalate when risk ≥ threshold");
    assert.equal(route.estimatedCost.proofLevel, 3, "must pick highest proof level");
  });
});

describe("Hardware routing: both machines AVX2 (no AVX-512)", () => {
  it("i9 desktop → avx2", () => {
    assert.equal(selectVectorTier(I9_DESKTOP), "avx2");
    assert.equal(I9_DESKTOP.topology, "symmetric");
  });

  it("i5 laptop → avx2", () => {
    assert.equal(selectVectorTier(I5_LAPTOP), "avx2");
    assert.equal(I5_LAPTOP.topology, "symmetric");
  });

  it("neither machine reports avx512", () => {
    assert.notEqual(I9_DESKTOP.vectorTier, "avx512");
    assert.notEqual(I5_LAPTOP.vectorTier, "avx512");
  });
});
