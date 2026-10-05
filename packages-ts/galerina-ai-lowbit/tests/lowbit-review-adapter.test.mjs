import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { validateLowBitAiReviewAdapterContract } from "../dist/index.js";

const adapter = { id: "bitnet", name: "bitnet.cpp", runtime: "external-process", device: "cpu", supportedWeightFormats: ["ternary_b1_58"], supportedQuantizations: ["i2_s"], supportedEmbeddingQuantizations: ["none"], supportedKernelFamilies: ["i2_s"] };
const contract = { adapter, purpose: "report-explanation", network: "denied", outputTrust: "untrusted", changesVerdict: false, maxOutputTokens: 512, timeoutMs: 30000 };
const has = (c, code) => validateLowBitAiReviewAdapterContract(c).some((d) => d.code === code);

describe("low-bit AI review adapter contract", () => {
  it("admits a local, network-denied, untrusted explanation adapter", () => {
    assert.deepEqual(validateLowBitAiReviewAdapterContract(contract), []);
  });
  it("refuses remote, plan-only, networked, authority-claiming or unbounded adapters", () => {
    assert.ok(has({ ...contract, adapter: { ...adapter, runtime: "remote-runtime" } }, "Galerina_LOWBIT_AI_REVIEW_REMOTE_RUNTIME"));
    assert.ok(has({ ...contract, adapter: { ...adapter, runtime: "plan-only" } }, "Galerina_LOWBIT_AI_REVIEW_PLAN_ONLY"));
    assert.ok(has({ ...contract, adapter: { ...adapter, id: "plan_only" } }, "Galerina_LOWBIT_AI_REVIEW_PLAN_ONLY"));
    assert.ok(has({ ...contract, purpose: "code-generation" }, "Galerina_LOWBIT_AI_REVIEW_PURPOSE_INVALID"));
    assert.ok(has({ ...contract, network: "allowed" }, "Galerina_LOWBIT_AI_REVIEW_NETWORK_DENIED"));
    assert.ok(has({ ...contract, outputTrust: "trusted-local" }, "Galerina_LOWBIT_AI_REVIEW_AUTHORITY_CLAIM"));
    assert.ok(has({ ...contract, changesVerdict: true }, "Galerina_LOWBIT_AI_REVIEW_AUTHORITY_CLAIM"));
    for (const maxOutputTokens of [0, 4097, Number.NaN, 1.5]) assert.ok(has({ ...contract, maxOutputTokens }, "Galerina_LOWBIT_AI_REVIEW_OUTPUT_LIMIT_INVALID"), String(maxOutputTokens));
    for (const timeoutMs of [0, 120001, Number.POSITIVE_INFINITY]) assert.ok(has({ ...contract, timeoutMs }, "Galerina_LOWBIT_AI_REVIEW_TIMEOUT_INVALID"), String(timeoutMs));
  });
});
