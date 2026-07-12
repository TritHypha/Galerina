import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  KNOWN_RENDERABLE_CONTENT_KINDS,
  WEB_RENDER_CHECKS,
  createDomUpdateReport,
  deriveWebRenderReportStatus,
  validateRenderableContent,
  validateRenderableContentList,
  validateStateDiffRenderPlan,
  validateStreamingBatchRenderPlan,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const textContent = { kind: "text", value: "Hello <script>" };

const safeHtmlContent = {
  kind: "safe_html",
  sanitizePolicyRef: "@galerina/data-html#ArticlePolicy",
};

const goodPlan = {
  name: "product-grid",
  stateContractRef: "@galerina/web-state#ProductPageState",
  maxPatchOps: 500,
};

const goodStreaming = {
  name: "product-stream",
  maxBatchItems: 50,
  maxBatchDelayMs: 200,
};

const goodCounts = { nodesCreated: 3, nodesUpdated: 12, nodesRemoved: 1 };

describe("the SafeHtml render gate — raw HTML is unrepresentable", () => {
  it("declares exactly text and safe_html as renderable kinds", () => {
    assert.deepEqual(KNOWN_RENDERABLE_CONTENT_KINDS, ["text", "safe_html"]);
    assert.ok(!KNOWN_RENDERABLE_CONTENT_KINDS.includes("raw_html"));
  });

  it("accepts text content (always escaped, any value)", () => {
    assert.deepEqual(codes(validateRenderableContent(textContent)), []);
  });

  it("accepts safe_html content that names its sanitize policy", () => {
    assert.deepEqual(codes(validateRenderableContent(safeHtmlContent)), []);
  });

  it("REJECTS raw_html smuggled in by an untyped caller", () => {
    const diags = validateRenderableContent({
      kind: "raw_html",
      value: "<script>alert(1)</script>",
    });
    assert.deepEqual(codes(diags), ["Galerina_WEB_RENDER_CONTENT_KIND_UNKNOWN"]);
    assert.equal(diags[0].severity, "error");
  });

  it("rejects any unknown content kind instead of defaulting it", () => {
    for (const kind of ["markdown", "html", "", undefined]) {
      const diags = validateRenderableContent({ kind, value: "x" });
      assert.deepEqual(
        codes(diags),
        ["Galerina_WEB_RENDER_CONTENT_KIND_UNKNOWN"],
        String(kind),
      );
    }
  });

  it("requires a non-empty sanitize policy ref on safe_html", () => {
    for (const sanitizePolicyRef of ["", "   "]) {
      const diags = validateRenderableContent({ kind: "safe_html", sanitizePolicyRef });
      assert.deepEqual(codes(diags), [
        "Galerina_WEB_RENDER_SANITIZE_POLICY_REF_REQUIRED",
      ]);
      assert.equal(diags[0].severity, "error");
    }
  });

  it("validates every list item with an indexed path and warns on an empty list", () => {
    const diags = validateRenderableContentList([
      textContent,
      { kind: "raw_html", value: "<b>x</b>" },
    ]);
    assert.deepEqual(codes(diags), ["Galerina_WEB_RENDER_CONTENT_KIND_UNKNOWN"]);
    assert.equal(diags[0].path, "content.1.kind");

    const empty = validateRenderableContentList([]);
    assert.deepEqual(codes(empty), ["Galerina_WEB_RENDER_CONTENT_EMPTY"]);
    assert.equal(empty[0].severity, "warning");
  });
});

describe("state-diff render plans — bounded, state-named", () => {
  it("accepts a bounded plan naming its state contract", () => {
    assert.deepEqual(codes(validateStateDiffRenderPlan(goodPlan)), []);
  });

  it("requires a plan name and a state contract reference", () => {
    const diags = validateStateDiffRenderPlan({
      ...goodPlan,
      name: " ",
      stateContractRef: "",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_WEB_RENDER_PLAN_NAME_REQUIRED",
      "Galerina_WEB_RENDER_STATE_CONTRACT_REF_REQUIRED",
    ]);
  });

  it("requires a positive integer maxPatchOps bound", () => {
    for (const maxPatchOps of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const diags = validateStateDiffRenderPlan({ ...goodPlan, maxPatchOps });
      assert.deepEqual(
        codes(diags),
        ["Galerina_WEB_RENDER_PATCH_OPS_BOUND_REQUIRED"],
        String(maxPatchOps),
      );
    }
  });
});

describe("streaming batch render plans — bounded items and delay", () => {
  it("accepts a bounded streaming plan", () => {
    assert.deepEqual(codes(validateStreamingBatchRenderPlan(goodStreaming)), []);
  });

  it("requires positive integer batch item and delay bounds", () => {
    const diags = validateStreamingBatchRenderPlan({
      ...goodStreaming,
      maxBatchItems: 0,
      maxBatchDelayMs: -5,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_WEB_RENDER_BATCH_DELAY_BOUND_REQUIRED",
      "Galerina_WEB_RENDER_BATCH_ITEMS_BOUND_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });
});

describe("createDomUpdateReport — status and checks derived, never asserted", () => {
  it("reports success with every check passing for a clean render", () => {
    const report = createDomUpdateReport({
      target: "#product-grid",
      plan: goodPlan,
      content: [textContent, safeHtmlContent],
      streaming: goodStreaming,
      counts: goodCounts,
    });
    assert.equal(report.target, "#product-grid");
    assert.equal(report.status, "success");
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(report.counts, goodCounts);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(WEB_RENDER_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("fails the contentGate check when raw HTML is smuggled into the pipeline", () => {
    const report = createDomUpdateReport({
      target: "#grid",
      plan: goodPlan,
      content: [{ kind: "raw_html", value: "<script>x</script>" }],
      counts: goodCounts,
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics), [
      "Galerina_WEB_RENDER_CONTENT_KIND_UNKNOWN",
    ]);
    assert.equal(report.checks.contentGate, "fail");
    assert.equal(report.checks.target, "pass");
    assert.equal(report.checks.plan, "pass");
    assert.equal(report.checks.bounds, "pass");
    assert.equal(report.checks.counts, "pass");
  });

  it("fails the counts check on negative or non-integer DOM update counts", () => {
    const report = createDomUpdateReport({
      target: "#grid",
      plan: goodPlan,
      content: [textContent],
      counts: { nodesCreated: -1, nodesUpdated: 2.5, nodesRemoved: 0 },
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics), [
      "Galerina_WEB_RENDER_UPDATE_COUNT_INVALID",
      "Galerina_WEB_RENDER_UPDATE_COUNT_INVALID",
    ]);
    assert.deepEqual(
      report.diagnostics.map((d) => d.path),
      ["counts.nodesCreated", "counts.nodesUpdated"],
    );
    assert.equal(report.checks.counts, "fail");
    assert.equal(report.checks.contentGate, "pass");
  });

  it("fails target, plan and bounds checks from their own diagnostics", () => {
    const report = createDomUpdateReport({
      target: " ",
      plan: { name: "p", stateContractRef: "", maxPatchOps: 0 },
      content: [textContent],
      streaming: { name: "s", maxBatchItems: -1, maxBatchDelayMs: 10 },
      counts: goodCounts,
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics).sort(), [
      "Galerina_WEB_RENDER_BATCH_ITEMS_BOUND_REQUIRED",
      "Galerina_WEB_RENDER_PATCH_OPS_BOUND_REQUIRED",
      "Galerina_WEB_RENDER_STATE_CONTRACT_REF_REQUIRED",
      "Galerina_WEB_RENDER_TARGET_REQUIRED",
    ]);
    assert.equal(report.checks.target, "fail");
    assert.equal(report.checks.plan, "fail");
    assert.equal(report.checks.bounds, "fail");
    assert.equal(report.checks.contentGate, "pass");
    assert.equal(report.checks.counts, "pass");
  });

  it("reports partial with warning messages for an empty content list", () => {
    const report = createDomUpdateReport({
      target: "#grid",
      plan: goodPlan,
      content: [],
      counts: goodCounts,
    });
    assert.equal(report.status, "partial");
    assert.deepEqual(codes(report.diagnostics), ["Galerina_WEB_RENDER_CONTENT_EMPTY"]);
    assert.deepEqual(report.warnings, [report.diagnostics[0].message]);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(WEB_RENDER_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("derives status from severity arithmetic", () => {
    assert.equal(deriveWebRenderReportStatus([]), "success");
    assert.equal(
      deriveWebRenderReportStatus([{ code: "x", severity: "warning", message: "m" }]),
      "partial",
    );
    assert.equal(
      deriveWebRenderReportStatus([
        { code: "x", severity: "warning", message: "m" },
        { code: "y", severity: "error", message: "m" },
      ]),
      "failed",
    );
  });
});
