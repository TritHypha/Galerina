import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_AI_SAFETY_POLICY, admitAiReportExplanation, validateAiReportExplanationRequest } from "../dist/index.js";

const D = `sha256:${"c".repeat(64)}`;
const model = { name: "local-review", format: "gguf", source: "local-file", capabilities: [], safetyPolicy: DEFAULT_AI_SAFETY_POLICY };
const request = { reportKind: "security.audit", reportDigest: D, sections: [{ id: "findings", text: "2 HOLD" }, { id: "summary", text: "ok" }], audience: "owner", maxSummaryChars: 200, network: "denied" };
const explanation = { reportDigest: D, summary: "Two findings are on HOLD.", citedSections: ["findings"], outputTrust: "untrusted", advisoryOnly: true, changesVerdict: false };
const codes = (v) => v.diagnostics.map((d) => d.code);

describe("local AI report explanation", () => {
  it("admits a local, cited, untrusted explanation as advisory only", () => {
    assert.deepEqual(validateAiReportExplanationRequest(request, model), []);
    const v = admitAiReportExplanation(explanation, request, model);
    assert.equal(v.status, "ADVISORY_ADMITTED");
    assert.equal(v.authorityReleased, false);
    assert.ok(Object.isFrozen(v));
  });
  it("refuses remote models, weak policies and network", () => {
    assert.ok(codes(admitAiReportExplanation(explanation, request, { ...model, source: "remote-api" })).includes("Galerina_AI_REVIEW_MODEL_NOT_LOCAL"));
    assert.ok(codes(admitAiReportExplanation(explanation, request, { ...model, format: "remote" })).includes("Galerina_AI_REVIEW_MODEL_NOT_LOCAL"));
    assert.ok(codes(admitAiReportExplanation(explanation, request, { ...model, safetyPolicy: { ...DEFAULT_AI_SAFETY_POLICY, outputTrust: "trusted-local" } })).includes("Galerina_AI_REVIEW_POLICY_TOO_WEAK"));
    assert.ok(codes(admitAiReportExplanation(explanation, request, { ...model, safetyPolicy: { ...DEFAULT_AI_SAFETY_POLICY, allowSecurityDecisions: true } })).includes("Galerina_AI_REVIEW_POLICY_TOO_WEAK"));
    assert.ok(codes(admitAiReportExplanation(explanation, { ...request, network: "allowed" }, model)).includes("Galerina_AI_REVIEW_NETWORK_DENIED"));
  });
  it("refuses malformed requests", () => {
    const cases = [
      [{ reportKind: "Security" }, "Galerina_AI_REVIEW_REPORT_KIND_INVALID"],
      [{ reportDigest: "sha256:abc" }, "Galerina_AI_REVIEW_REPORT_DIGEST_INVALID"],
      [{ audience: "public" }, "Galerina_AI_REVIEW_AUDIENCE_INVALID"],
      [{ maxSummaryChars: 0 }, "Galerina_AI_REVIEW_SUMMARY_LIMIT_INVALID"],
      [{ maxSummaryChars: 8193 }, "Galerina_AI_REVIEW_SUMMARY_LIMIT_INVALID"],
      [{ maxSummaryChars: Number.NaN }, "Galerina_AI_REVIEW_SUMMARY_LIMIT_INVALID"],
      [{ sections: [] }, "Galerina_AI_REVIEW_SECTIONS_REQUIRED"],
      [{ sections: [{ id: "a", text: "x" }, { id: "a", text: "y" }] }, "Galerina_AI_REVIEW_SECTION_ID_INVALID"],
      [{ sections: [{ id: "a", text: 7 }] }, "Galerina_AI_REVIEW_SECTION_TEXT_INVALID"],
    ];
    for (const [patch, code] of cases) assert.ok(validateAiReportExplanationRequest({ ...request, ...patch }, model).some((d) => d.code === code), code);
  });
  it("refuses wrong-report, uncited, overlong and authority-claiming explanations", () => {
    const cases = [
      [{ reportDigest: `sha256:${"d".repeat(64)}` }, "Galerina_AI_REVIEW_DIGEST_MISMATCH"],
      [{ summary: " " }, "Galerina_AI_REVIEW_SUMMARY_REQUIRED"],
      [{ summary: "x".repeat(201) }, "Galerina_AI_REVIEW_SUMMARY_TOO_LONG"],
      [{ citedSections: [] }, "Galerina_AI_REVIEW_CITATION_UNKNOWN"],
      [{ citedSections: ["findings", "invented"] }, "Galerina_AI_REVIEW_CITATION_UNKNOWN"],
      [{ outputTrust: "policy-reviewed" }, "Galerina_AI_REVIEW_AUTHORITY_CLAIM"],
      [{ advisoryOnly: false }, "Galerina_AI_REVIEW_AUTHORITY_CLAIM"],
      [{ changesVerdict: true }, "Galerina_AI_REVIEW_AUTHORITY_CLAIM"],
    ];
    for (const [patch, code] of cases) {
      const v = admitAiReportExplanation({ ...explanation, ...patch }, request, model);
      assert.equal(v.status, "REFUSED", code);
      assert.ok(codes(v).includes(code), code);
    }
  });
});
