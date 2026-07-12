import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  KNOWN_HYDRATION_CLASSIFICATIONS,
  KNOWN_PAGE_STATE_FIELD_KINDS,
  KNOWN_PAGE_STATE_PHASES,
  WEB_STATE_CHECKS,
  createClientStateReport,
  deriveWebStateReportStatus,
  validateApiToStateConversion,
  validateHydrationContract,
  validatePageStateContract,
  validateStateDiffPlan,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const goodContract = {
  name: "ProductPageState",
  initialPhase: "idle",
  fields: [
    { name: "products", kind: "list" },
    { name: "page", kind: "integer" },
    { name: "filter", kind: "string" },
  ],
};

const goodConversion = {
  stateContract: "ProductPageState",
  responseMappingRef: "@galerina/data-response#ProductListResponse",
};

const goodHydration = {
  name: "product-page-hydration",
  fields: [
    { name: "products", classification: "public" },
    { name: "page", classification: "public" },
  ],
};

const goodDiffPlan = { name: "product-page-diff", maxDiffOps: 200 };

describe("typed page state — every field declares a kind from the known set", () => {
  it("accepts a fully typed contract", () => {
    assert.deepEqual(codes(validatePageStateContract(goodContract)), []);
  });

  it("declares loading, error and partial as first-class phases", () => {
    assert.deepEqual(KNOWN_PAGE_STATE_PHASES, [
      "idle",
      "loading",
      "loaded",
      "error",
      "partial",
    ]);
  });

  it("accepts every first-class phase as an initial phase", () => {
    for (const initialPhase of KNOWN_PAGE_STATE_PHASES) {
      const diags = validatePageStateContract({ ...goodContract, initialPhase });
      assert.deepEqual(codes(diags), [], initialPhase);
    }
  });

  it("REJECTS an unknown phase instead of defaulting it", () => {
    for (const initialPhase of ["ready", "stale", "", undefined]) {
      const diags = validatePageStateContract({ ...goodContract, initialPhase });
      assert.deepEqual(codes(diags), ["Galerina_WEB_STATE_PHASE_UNKNOWN"], String(initialPhase));
      assert.equal(diags[0].severity, "error");
    }
  });

  it("requires a contract name", () => {
    const diags = validatePageStateContract({ ...goodContract, name: " " });
    assert.deepEqual(codes(diags), ["Galerina_WEB_STATE_CONTRACT_NAME_REQUIRED"]);
  });

  it("rejects fields with unknown kinds — untyped data cannot enter state", () => {
    const diags = validatePageStateContract({
      ...goodContract,
      fields: [{ name: "blob", kind: "any" }],
    });
    assert.deepEqual(codes(diags), ["Galerina_WEB_STATE_FIELD_KIND_UNKNOWN"]);
    assert.equal(diags[0].severity, "error");
    assert.ok(!KNOWN_PAGE_STATE_FIELD_KINDS.includes("any"));
  });

  it("requires field names and rejects duplicate fields", () => {
    const diags = validatePageStateContract({
      ...goodContract,
      fields: [
        { name: " ", kind: "string" },
        { name: "page", kind: "integer" },
        { name: "page", kind: "string" },
      ],
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_WEB_STATE_FIELD_DUPLICATE",
      "Galerina_WEB_STATE_FIELD_NAME_REQUIRED",
    ]);
  });

  it("warns on an empty field list (valid but carries nothing)", () => {
    const diags = validatePageStateContract({ ...goodContract, fields: [] });
    assert.deepEqual(codes(diags), ["Galerina_WEB_STATE_FIELDS_EMPTY"]);
    assert.equal(diags[0].severity, "warning");
  });
});

describe("API-to-state conversion — raw model data never enters browser state", () => {
  it("accepts a conversion naming its response mapping", () => {
    assert.deepEqual(codes(validateApiToStateConversion(goodConversion)), []);
  });

  it("requires a non-empty galerina-data-response mapping ref", () => {
    for (const responseMappingRef of ["", "   "]) {
      const diags = validateApiToStateConversion({ ...goodConversion, responseMappingRef });
      assert.deepEqual(codes(diags), [
        "Galerina_WEB_STATE_RESPONSE_MAPPING_REF_REQUIRED",
      ]);
      assert.equal(diags[0].severity, "error");
    }
  });

  it("requires the target state contract name", () => {
    const diags = validateApiToStateConversion({ ...goodConversion, stateContract: "" });
    assert.deepEqual(codes(diags), ["Galerina_WEB_STATE_CONVERSION_TARGET_REQUIRED"]);
  });
});

describe("hydration — browser hydration is public text", () => {
  it("accepts a hydration contract of public fields", () => {
    assert.deepEqual(codes(validateHydrationContract(goodHydration)), []);
  });

  it("REJECTS secret and credential classified fields", () => {
    for (const classification of ["secret", "credential"]) {
      const diags = validateHydrationContract({
        ...goodHydration,
        fields: [{ name: "sessionToken", classification }],
      });
      assert.deepEqual(
        codes(diags),
        ["Galerina_WEB_STATE_HYDRATION_SECRET_FORBIDDEN"],
        classification,
      );
      assert.equal(diags[0].severity, "error");
    }
  });

  it("rejects an unknown classification rather than assuming public", () => {
    const diags = validateHydrationContract({
      ...goodHydration,
      fields: [{ name: "x", classification: "internal" }],
    });
    assert.deepEqual(codes(diags), [
      "Galerina_WEB_STATE_HYDRATION_CLASSIFICATION_UNKNOWN",
    ]);
    assert.ok(!KNOWN_HYDRATION_CLASSIFICATIONS.includes("internal"));
  });

  it("requires the hydration contract and field names", () => {
    const diags = validateHydrationContract({
      name: " ",
      fields: [{ name: "", classification: "public" }],
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_WEB_STATE_HYDRATION_FIELD_NAME_REQUIRED",
      "Galerina_WEB_STATE_HYDRATION_NAME_REQUIRED",
    ]);
  });
});

describe("state diff plans — bounded", () => {
  it("accepts a bounded diff plan", () => {
    assert.deepEqual(codes(validateStateDiffPlan(goodDiffPlan)), []);
  });

  it("requires a positive integer maxDiffOps", () => {
    for (const maxDiffOps of [0, -10, 2.5, Number.NaN]) {
      const diags = validateStateDiffPlan({ ...goodDiffPlan, maxDiffOps });
      assert.deepEqual(
        codes(diags),
        ["Galerina_WEB_STATE_DIFF_OPS_BOUND_REQUIRED"],
        String(maxDiffOps),
      );
    }
  });

  it("requires a plan name", () => {
    const diags = validateStateDiffPlan({ ...goodDiffPlan, name: "" });
    assert.deepEqual(codes(diags), ["Galerina_WEB_STATE_DIFF_PLAN_NAME_REQUIRED"]);
  });
});

describe("createClientStateReport — status and checks derived, never asserted", () => {
  it("reports success with every check passing for a clean declaration", () => {
    const report = createClientStateReport({
      contract: goodContract,
      conversion: goodConversion,
      hydration: goodHydration,
      diffPlan: goodDiffPlan,
    });
    assert.equal(report.contract, "ProductPageState");
    assert.equal(report.status, "success");
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(WEB_STATE_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("fails the hydration check when a secret rides the hydration payload", () => {
    const report = createClientStateReport({
      contract: goodContract,
      conversion: goodConversion,
      hydration: {
        name: "h",
        fields: [{ name: "apiKey", classification: "secret" }],
      },
      diffPlan: goodDiffPlan,
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics), [
      "Galerina_WEB_STATE_HYDRATION_SECRET_FORBIDDEN",
    ]);
    assert.equal(report.checks.hydration, "fail");
    assert.equal(report.checks.contract, "pass");
    assert.equal(report.checks.conversion, "pass");
    assert.equal(report.checks.diffBounds, "pass");
  });

  it("fails conversion and diffBounds checks from their own diagnostics", () => {
    const report = createClientStateReport({
      contract: goodContract,
      conversion: { stateContract: "ProductPageState", responseMappingRef: " " },
      diffPlan: { name: "d", maxDiffOps: 0 },
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics).sort(), [
      "Galerina_WEB_STATE_DIFF_OPS_BOUND_REQUIRED",
      "Galerina_WEB_STATE_RESPONSE_MAPPING_REF_REQUIRED",
    ]);
    assert.equal(report.checks.conversion, "fail");
    assert.equal(report.checks.diffBounds, "fail");
    assert.equal(report.checks.contract, "pass");
    assert.equal(report.checks.hydration, "pass");
  });

  it("reports partial with warning messages for an empty field list", () => {
    const report = createClientStateReport({
      contract: { ...goodContract, fields: [] },
      conversion: goodConversion,
    });
    assert.equal(report.status, "partial");
    assert.deepEqual(codes(report.diagnostics), ["Galerina_WEB_STATE_FIELDS_EMPTY"]);
    assert.deepEqual(report.warnings, [report.diagnostics[0].message]);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(WEB_STATE_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("derives status from severity arithmetic", () => {
    assert.equal(deriveWebStateReportStatus([]), "success");
    assert.equal(
      deriveWebStateReportStatus([{ code: "x", severity: "warning", message: "m" }]),
      "partial",
    );
    assert.equal(
      deriveWebStateReportStatus([
        { code: "x", severity: "warning", message: "m" },
        { code: "y", severity: "error", message: "m" },
      ]),
      "failed",
    );
  });
});
