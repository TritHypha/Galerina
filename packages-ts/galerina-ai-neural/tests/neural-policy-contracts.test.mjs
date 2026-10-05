import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_NEURAL_CONFIDENCE_POLICY,
  DEFAULT_NEURAL_MODEL_LOAD_POLICY,
  evaluateNeuralInferenceResult,
  validateNeuralConfidencePolicy,
  validateNeuralTrainingDataPolicy,
  validateNeuralTrainingPlanDataPolicy,
  verifyNeuralModelArtifact,
} from "../dist/index.js";

const out = [{ elementType: "Float32", shape: { dimensions: [1, 10] } }];
const result = (confidence, extra = {}) => ({ model: "m", outputs: out, confidence, outputTrusted: false, ...extra });
const codes = (v) => v.diagnostics.map((d) => d.code);
const D = `sha256:${"a".repeat(64)}`;

describe("inference result and confidence policy", () => {
  it("admits an in-shape result at or above the floor as advisory only", () => {
    for (const value of [0.9, 1]) {
      const v = evaluateNeuralInferenceResult(result({ kind: "scored", value }), out);
      assert.equal(v.status, "ADMITTED_ADVISORY");
      assert.equal(v.authorityReleased, false);
      assert.ok(Object.isFrozen(v));
    }
  });
  it("refuses below-floor, unscored, NaN, infinite and out-of-range confidence", () => {
    assert.deepEqual(codes(evaluateNeuralInferenceResult(result({ kind: "scored", value: 0.89 }), out)), ["Galerina_NEURAL_RESULT_BELOW_CONFIDENCE_FLOOR"]);
    assert.deepEqual(codes(evaluateNeuralInferenceResult(result({ kind: "unscored" }), out)), ["Galerina_NEURAL_RESULT_UNSCORED"]);
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, -0.1, 1.1, "0.95"]) {
      const v = evaluateNeuralInferenceResult(result({ kind: "scored", value }), out);
      assert.equal(v.status, "REFUSED", String(value));
      assert.deepEqual(codes(v), ["Galerina_NEURAL_RESULT_CONFIDENCE_INVALID"]);
    }
    assert.equal(evaluateNeuralInferenceResult(result({ kind: "other", value: 1 }), out).status, "REFUSED");
  });
  it("refuses trusted-output claims and shape mismatches", () => {
    assert.ok(codes(evaluateNeuralInferenceResult(result({ kind: "scored", value: 1 }, { outputTrusted: true }), out)).includes("Galerina_NEURAL_RESULT_TRUST_CLAIM"));
    assert.ok(codes(evaluateNeuralInferenceResult(result({ kind: "scored", value: 1 }, { outputs: [] }), out)).includes("Galerina_NEURAL_RESULT_SHAPE_MISMATCH"));
    assert.ok(codes(evaluateNeuralInferenceResult(result({ kind: "scored", value: 1 }, { outputs: [{ elementType: "Float32", shape: { dimensions: [1, 11] } }] }), out)).includes("Galerina_NEURAL_RESULT_SHAPE_MISMATCH"));
  });
  it("policy cannot be weakened: invalid floor or non-refuse actions refuse", () => {
    assert.deepEqual(validateNeuralConfidencePolicy(DEFAULT_NEURAL_CONFIDENCE_POLICY), []);
    assert.ok(Object.isFrozen(DEFAULT_NEURAL_CONFIDENCE_POLICY));
    const weak = { ...DEFAULT_NEURAL_CONFIDENCE_POLICY, onBelowMinimum: "warn" };
    assert.equal(evaluateNeuralInferenceResult(result({ kind: "scored", value: 1 }), out, weak).status, "REFUSED");
    for (const minimumConfidence of [Number.NaN, -1, 2]) {
      assert.equal(evaluateNeuralInferenceResult(result({ kind: "scored", value: 1 }), out, { ...DEFAULT_NEURAL_CONFIDENCE_POLICY, minimumConfidence }).status, "REFUSED");
    }
  });
});

describe("training data policy", () => {
  const policy = { id: "faces.v1", dataset: "faces", provenance: "licensed", licence: "CC-BY-4.0", datasetDigest: D, containsPersonalData: true, personalDataBasis: "consent-recorded", maxRecords: 1000 };
  const plan = { flow: "train", model: "m", dataset: "faces", loss: "cross_entropy", optimizer: "adam", epochs: 1, batchSize: 8, maxMemoryBytes: 1024, timeoutMs: 1000, dataPolicy: "faces.v1" };
  it("admits a registered, pinned, lawful policy", () => {
    assert.deepEqual(validateNeuralTrainingDataPolicy(policy), []);
    assert.deepEqual(validateNeuralTrainingPlanDataPolicy(plan, [policy]), []);
  });
  it("refuses each missing or contradictory field", () => {
    const cases = [
      [{ id: "Faces" }, "Galerina_NEURAL_DATA_POLICY_ID_INVALID"],
      [{ dataset: " " }, "Galerina_NEURAL_DATA_POLICY_DATASET_REQUIRED"],
      [{ provenance: "scraped" }, "Galerina_NEURAL_DATA_POLICY_PROVENANCE_UNKNOWN"],
      [{ licence: "" }, "Galerina_NEURAL_DATA_POLICY_LICENCE_REQUIRED"],
      [{ datasetDigest: `sha256:${"A".repeat(64)}` }, "Galerina_NEURAL_DATA_POLICY_DIGEST_INVALID"],
      [{ personalDataBasis: "no-personal-data" }, "Galerina_NEURAL_DATA_POLICY_BASIS_REQUIRED"],
      [{ containsPersonalData: false }, "Galerina_NEURAL_DATA_POLICY_BASIS_CONTRADICTION"],
      [{ containsPersonalData: "yes" }, "Galerina_NEURAL_DATA_POLICY_PERSONAL_DATA_FLAG"],
      [{ personalDataBasis: "legitimate-interest" }, "Galerina_NEURAL_DATA_POLICY_BASIS_UNKNOWN"],
      [{ maxRecords: 0 }, "Galerina_NEURAL_DATA_POLICY_MAX_RECORDS_INVALID"],
      [{ maxRecords: Number.NaN }, "Galerina_NEURAL_DATA_POLICY_MAX_RECORDS_INVALID"],
    ];
    for (const [patch, code] of cases) assert.ok(validateNeuralTrainingDataPolicy({ ...policy, ...patch }).some((d) => d.code === code), code);
  });
  it("refuses unregistered, duplicate and mismatched plan policies", () => {
    assert.ok(validateNeuralTrainingPlanDataPolicy({ ...plan, dataPolicy: "other" }, [policy]).some((d) => d.code === "Galerina_NEURAL_DATA_POLICY_UNREGISTERED"));
    assert.ok(validateNeuralTrainingPlanDataPolicy(plan, [policy, policy]).some((d) => d.code === "Galerina_NEURAL_DATA_POLICY_DUPLICATE"));
    assert.ok(validateNeuralTrainingPlanDataPolicy({ ...plan, dataset: "cats" }, [policy]).some((d) => d.code === "Galerina_NEURAL_DATA_POLICY_DATASET_MISMATCH"));
    assert.ok(validateNeuralTrainingPlanDataPolicy(plan, []).some((d) => d.code === "Galerina_NEURAL_DATA_POLICY_UNREGISTERED"));
  });
});

describe("model verification and loading", () => {
  const ref = { model: "m", format: "safetensors", sha256: D, byteLength: 4096 };
  it("verifies a pinned match without authorising a load", () => {
    const v = verifyNeuralModelArtifact(ref, { sha256: D, byteLength: 4096 });
    assert.equal(v.status, "VERIFIED_NOT_LOADED");
    assert.equal(v.loadAuthorized, false);
    assert.ok(Object.isFrozen(DEFAULT_NEURAL_MODEL_LOAD_POLICY.allowedFormats));
  });
  it("refuses digest or size drift, denied or unknown formats and oversize artifacts", () => {
    const one = (r, o) => codes(verifyNeuralModelArtifact(r, o));
    assert.ok(one(ref, { sha256: `sha256:${"b".repeat(64)}`, byteLength: 4096 }).includes("Galerina_NEURAL_ARTIFACT_DIGEST_MISMATCH"));
    assert.ok(one(ref, { sha256: D, byteLength: 4097 }).includes("Galerina_NEURAL_ARTIFACT_SIZE_MISMATCH"));
    assert.ok(one({ ...ref, format: "gguf" }, { sha256: D, byteLength: 4096 }).includes("Galerina_NEURAL_ARTIFACT_FORMAT_DENIED"));
    assert.ok(one({ ...ref, format: "pickle" }, { sha256: D, byteLength: 4096 }).includes("Galerina_NEURAL_ARTIFACT_FORMAT_UNKNOWN"));
    assert.ok(one({ ...ref, byteLength: 5 * 1024 ** 3 }, { sha256: D, byteLength: 5 * 1024 ** 3 }).includes("Galerina_NEURAL_ARTIFACT_TOO_LARGE"));
    assert.ok(one({ ...ref, sha256: "abc" }, { sha256: "abc", byteLength: 4096 }).includes("Galerina_NEURAL_ARTIFACT_DIGEST_INVALID"));
    assert.ok(one({ ...ref, byteLength: Number.NaN }, { sha256: D, byteLength: Number.NaN }).includes("Galerina_NEURAL_ARTIFACT_SIZE_INVALID"));
    assert.equal(verifyNeuralModelArtifact({ ...ref, format: "gguf" }, { sha256: D, byteLength: 4096 }, { allowedFormats: ["gguf"], maxBytes: 8192 }).status, "VERIFIED_NOT_LOADED");
  });
});
