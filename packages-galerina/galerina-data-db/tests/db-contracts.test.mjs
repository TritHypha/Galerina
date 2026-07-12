import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  KNOWN_DB_OPERATION_KINDS,
  createDbBoundaryReport,
  validateDbBoundaryOperation,
  validateDbBoundaryRequirements,
  validateDbModelFlow,
  validateDbReportIndex,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const requirements = {
  parameterisedOnly: true,
  rawSqlDenied: true,
  responseMappingRequired: true,
};

const op = (name, kind, extra = {}) => ({
  name,
  kind,
  contractRef: `@galerina/data-${kind === "model" ? "model" : "query"}#${name}`,
  ...extra,
});

const goodFlow = {
  model: "User",
  operations: [
    op("userModel", "model"),
    op("findUser", "query", { requiresPermission: "users.read" }),
    op("userResponse", "response"),
  ],
  requirements,
};

describe("validateDbBoundaryOperation — every operation declares a known kind", () => {
  it("accepts each of the six declared kinds", () => {
    assert.equal(KNOWN_DB_OPERATION_KINDS.length, 6);
    for (const kind of KNOWN_DB_OPERATION_KINDS) {
      const diags = validateDbBoundaryOperation({
        name: `${kind}-op`,
        kind,
        contractRef: "ref",
      });
      assert.deepEqual(codes(diags), [], kind);
    }
  });

  it("REJECTS an unknown operation kind", () => {
    const diags = validateDbBoundaryOperation({
      name: "sneaky",
      kind: "migration",
      contractRef: "ref",
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_DB_OPERATION_KIND_UNKNOWN"]);
    assert.equal(diags[0].severity, "error");
  });

  it("requires a name and a contract reference", () => {
    const diags = validateDbBoundaryOperation({ name: " ", kind: "query", contractRef: "" });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DATA_DB_CONTRACT_REF_REQUIRED",
      "Galerina_DATA_DB_OPERATION_NAME_REQUIRED",
    ]);
  });

  it("rejects a blank permission ref only when present", () => {
    const diags = validateDbBoundaryOperation({
      name: "q",
      kind: "query",
      contractRef: "ref",
      requiresPermission: " ",
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_DB_PERMISSION_REF_INVALID"]);
  });
});

describe("validateDbBoundaryRequirements — the three non-negotiables", () => {
  it("accepts the required literal-true requirements", () => {
    assert.deepEqual(codes(validateDbBoundaryRequirements(requirements)), []);
  });

  it("fails closed when an untyped caller relaxes any requirement", () => {
    const diags = validateDbBoundaryRequirements({
      parameterisedOnly: false,
      rawSqlDenied: false,
      responseMappingRequired: false,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DATA_DB_PARAMETERISED_ONLY_REQUIRED",
      "Galerina_DATA_DB_RAW_SQL_DENIAL_REQUIRED",
      "Galerina_DATA_DB_RESPONSE_MAPPING_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });
});

describe("validateDbModelFlow — flows are permissioned and response-bounded", () => {
  it("accepts a complete flow", () => {
    assert.deepEqual(codes(validateDbModelFlow(goodFlow)), []);
  });

  it("requires a model and at least one operation", () => {
    const diags = validateDbModelFlow({ model: "", operations: [], requirements });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DATA_DB_MODEL_REQUIRED",
      "Galerina_DATA_DB_OPERATIONS_REQUIRED",
    ]);
  });

  it("rejects duplicate operation names", () => {
    const diags = validateDbModelFlow({
      ...goodFlow,
      operations: [
        op("findUser", "query", { requiresPermission: "users.read" }),
        op("findUser", "query", { requiresPermission: "users.read" }),
        op("userResponse", "response"),
      ],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_DB_OPERATION_DUPLICATE"]);
  });

  it("warns when a query/command declares no required permission", () => {
    const diags = validateDbModelFlow({
      ...goodFlow,
      operations: [op("findUser", "query"), op("userResponse", "response")],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_DB_PERMISSION_UNDECLARED"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("warns when queries flow out with no response operation", () => {
    const diags = validateDbModelFlow({
      ...goodFlow,
      operations: [op("findUser", "query", { requiresPermission: "users.read" })],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_DB_RESPONSE_OPERATION_MISSING"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("propagates unknown-kind and relaxed-requirement errors", () => {
    const diags = validateDbModelFlow({
      ...goodFlow,
      operations: [...goodFlow.operations, op("sneaky", "migration")],
      requirements: { ...requirements, rawSqlDenied: false },
    });
    assert.ok(codes(diags).includes("Galerina_DATA_DB_OPERATION_KIND_UNKNOWN"));
    assert.ok(codes(diags).includes("Galerina_DATA_DB_RAW_SQL_DENIAL_REQUIRED"));
  });
});

describe("validateDbReportIndex — app.<name>.json at relative locations", () => {
  const goodIndex = {
    flow: "User",
    entries: [
      { kind: "app.database-archive-report.json", location: "reports/db-archive.json" },
    ],
  };

  it("accepts a well-formed index", () => {
    assert.deepEqual(codes(validateDbReportIndex(goodIndex)), []);
  });

  it("rejects malformed kinds and duplicate kinds", () => {
    const diags = validateDbReportIndex({
      flow: "User",
      entries: [
        { kind: "database-report", location: "reports/a.json" },
        { kind: "app.pipeline-report.json", location: "reports/b.json" },
        { kind: "app.pipeline-report.json", location: "reports/c.json" },
      ],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_DB_REPORT_KIND_INVALID"));
    assert.ok(codes(diags).includes("Galerina_DATA_DB_REPORT_DUPLICATE"));
  });

  it("rejects absolute and traversal locations", () => {
    for (const location of ["/etc/reports.json", "..\\up.json", "a/../../b.json"]) {
      const diags = validateDbReportIndex({
        flow: "User",
        entries: [{ kind: "app.archive-report.json", location }],
      });
      assert.deepEqual(codes(diags), ["Galerina_DATA_DB_REPORT_LOCATION_UNSAFE"], location);
    }
  });

  it("warns on an empty index", () => {
    const diags = validateDbReportIndex({ flow: "User", entries: [] });
    assert.deepEqual(codes(diags), ["Galerina_DATA_DB_REPORT_INDEX_EMPTY"]);
    assert.equal(diags[0].severity, "warning");
  });
});

describe("createDbBoundaryReport — per-kind operation counts travel with diagnostics", () => {
  it("counts operations by kind for a clean flow", () => {
    const report = createDbBoundaryReport({ flow: goodFlow });
    assert.equal(report.flow, "User");
    assert.equal(report.operationCounts.model, 1);
    assert.equal(report.operationCounts.query, 1);
    assert.equal(report.operationCounts.response, 1);
    assert.equal(report.operationCounts.command, 0);
    assert.deepEqual(report.diagnostics, []);
  });

  it("carries flow diagnostics and never counts unknown kinds", () => {
    const report = createDbBoundaryReport({
      flow: { ...goodFlow, operations: [...goodFlow.operations, op("sneaky", "migration")] },
    });
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_DB_OPERATION_KIND_UNKNOWN"));
    const total = Object.values(report.operationCounts).reduce((a, b) => a + b, 0);
    assert.equal(total, 3);
  });
});
