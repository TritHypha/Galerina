import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  KNOWN_MYSQL_PLACEHOLDER_STYLES,
  KNOWN_MYSQL_TLS_MODES,
  MYSQL_ADAPTER_CHECKS,
  createMysqlAdapterReport,
  deriveMysqlAdapterStatus,
  validateMysqlAdapterDeclaration,
  validateMysqlAdapterRequirements,
  validateMysqlConnection,
  validateMysqlContractRefs,
  validateMysqlCredentialRef,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const requirements = {
  parameterisedOnly: true,
  rawSqlDenied: true,
  responseMappingRequired: true,
};

const contractRefs = {
  modelContractRef: "@galerina/data-model#User",
  queryContractRef: "@galerina/data-query#FindUser",
  responseContractRef: "@galerina/data-response#UserResponse",
};

const credential = { kind: "external_ref", ref: "secrets://galerina/mysql/app-role" };

const goodConnection = {
  host: "db.internal.example",
  port: 3306,
  database: "app",
  tlsMode: "verify_identity",
  credential,
};

const goodDeclaration = {
  adapter: "app-mysql",
  provider: "mysql",
  requirements,
  contractRefs,
  placeholderStyle: "question_mark",
  connection: goodConnection,
  statementTimeoutMs: 30000,
};

describe("validateMysqlAdapterDeclaration — the complete contract", () => {
  it("accepts a fully-declared adapter", () => {
    assert.deepEqual(codes(validateMysqlAdapterDeclaration(goodDeclaration)), []);
  });

  it("requires an adapter name and the mysql provider literal", () => {
    const diags = validateMysqlAdapterDeclaration({
      ...goodDeclaration,
      adapter: " ",
      provider: "postgres",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_MYSQL_ADAPTER_NAME_REQUIRED",
      "Galerina_DB_MYSQL_PROVIDER_MISMATCH",
    ]);
  });

  it("REJECTS any placeholder style other than question_mark", () => {
    for (const placeholderStyle of ["dollar_numbered", "named_colon"]) {
      const diags = validateMysqlAdapterDeclaration({
        ...goodDeclaration,
        placeholderStyle,
      });
      assert.deepEqual(
        codes(diags),
        ["Galerina_DB_MYSQL_PLACEHOLDER_STYLE_INVALID"],
        placeholderStyle,
      );
      assert.equal(diags[0].severity, "error");
    }
  });

  it("requires a positive integer statement timeout bound", () => {
    for (const statementTimeoutMs of [0, -1, 1.5, Number.NaN]) {
      const diags = validateMysqlAdapterDeclaration({
        ...goodDeclaration,
        statementTimeoutMs,
      });
      assert.deepEqual(
        codes(diags),
        ["Galerina_DB_MYSQL_STATEMENT_TIMEOUT_REQUIRED"],
        String(statementTimeoutMs),
      );
    }
  });
});

describe("the three non-negotiables — literal true, re-checked at runtime", () => {
  it("accepts the required literal-true requirements", () => {
    assert.deepEqual(codes(validateMysqlAdapterRequirements(requirements)), []);
  });

  it("fails closed when an untyped caller relaxes any of them", () => {
    const diags = validateMysqlAdapterRequirements({
      parameterisedOnly: false,
      rawSqlDenied: false,
      responseMappingRequired: false,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_MYSQL_PARAMETERISED_ONLY_REQUIRED",
      "Galerina_DB_MYSQL_RAW_SQL_DENIAL_REQUIRED",
      "Galerina_DB_MYSQL_RESPONSE_MAPPING_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });
});

describe("typed contract refs — the adapter must consume the data family", () => {
  it("requires all three contract references to be non-empty", () => {
    const diags = validateMysqlContractRefs({
      modelContractRef: "",
      queryContractRef: " ",
      responseContractRef: "",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_MYSQL_MODEL_CONTRACT_REF_REQUIRED",
      "Galerina_DB_MYSQL_QUERY_CONTRACT_REF_REQUIRED",
      "Galerina_DB_MYSQL_RESPONSE_CONTRACT_REF_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });
});

describe("credentials — external references only, never inline", () => {
  it("accepts an external reference", () => {
    assert.deepEqual(codes(validateMysqlCredentialRef(credential)), []);
  });

  it("rejects a non-external_ref kind smuggled in by an untyped caller", () => {
    const diags = validateMysqlCredentialRef({ kind: "inline", ref: "hunter2" });
    assert.deepEqual(codes(diags), ["Galerina_DB_MYSQL_CREDENTIAL_KIND_INVALID"]);
  });

  it("requires a non-empty reference", () => {
    const diags = validateMysqlCredentialRef({ kind: "external_ref", ref: " " });
    assert.deepEqual(codes(diags), ["Galerina_DB_MYSQL_CREDENTIAL_REF_REQUIRED"]);
  });

  it("REJECTS a credential-bearing connection string in the ref", () => {
    const diags = validateMysqlCredentialRef({
      kind: "external_ref",
      ref: "mysql://app:hunter2@db.example.com/app",
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_MYSQL_INLINE_CREDENTIALS_FORBIDDEN"]);
    assert.equal(diags[0].severity, "error");
  });

  it("REJECTS userinfo smuggled into the connection host", () => {
    const diags = validateMysqlConnection({
      ...goodConnection,
      host: "app:hunter2@db.example.com",
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_MYSQL_INLINE_CREDENTIALS_FORBIDDEN"]);
  });
});

describe("TLS — required for any non-localhost host", () => {
  it("errors on tlsMode disabled for a non-localhost host", () => {
    const diags = validateMysqlConnection({ ...goodConnection, tlsMode: "disabled" });
    assert.deepEqual(codes(diags), ["Galerina_DB_MYSQL_TLS_REQUIRED"]);
    assert.equal(diags[0].severity, "error");
  });

  it("allows tlsMode disabled only for localhost hosts", () => {
    for (const host of ["localhost", "127.0.0.1", "::1"]) {
      const diags = validateMysqlConnection({
        ...goodConnection,
        host,
        tlsMode: "disabled",
      });
      assert.deepEqual(codes(diags), [], host);
    }
  });

  it("rejects an unknown tlsMode instead of defaulting it (preferred is unrepresentable)", () => {
    const diags = validateMysqlConnection({ ...goodConnection, tlsMode: "preferred" });
    assert.deepEqual(codes(diags), ["Galerina_DB_MYSQL_TLS_MODE_UNKNOWN"]);
    assert.equal(diags[0].severity, "error");
  });

  it("warns that verify_identity is recommended when TLS does not verify identity", () => {
    for (const tlsMode of ["required", "verify_ca"]) {
      const diags = validateMysqlConnection({ ...goodConnection, tlsMode });
      assert.deepEqual(codes(diags), ["Galerina_DB_MYSQL_VERIFY_IDENTITY_RECOMMENDED"], tlsMode);
      assert.equal(diags[0].severity, "warning");
    }
  });

  it("treats an empty host as non-localhost and fails closed", () => {
    const diags = validateMysqlConnection({
      ...goodConnection,
      host: "",
      tlsMode: "disabled",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_MYSQL_HOST_REQUIRED",
      "Galerina_DB_MYSQL_TLS_REQUIRED",
    ]);
  });

  it("validates database name and port bounds", () => {
    const diags = validateMysqlConnection({
      ...goodConnection,
      database: " ",
      port: 0,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_MYSQL_DATABASE_REQUIRED",
      "Galerina_DB_MYSQL_PORT_INVALID",
    ]);
  });
});

describe("createMysqlAdapterReport — status and checks derived, never asserted", () => {
  it("reports success with every check passing for a clean declaration", () => {
    const report = createMysqlAdapterReport({ declaration: goodDeclaration });
    assert.equal(report.adapter, "app-mysql");
    assert.equal(report.provider, "mysql");
    assert.equal(report.status, "success");
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(MYSQL_ADAPTER_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("derives failed status and per-check outcomes from the diagnostics", () => {
    const report = createMysqlAdapterReport({
      declaration: {
        ...goodDeclaration,
        requirements: { ...requirements, parameterisedOnly: false },
        connection: { ...goodConnection, tlsMode: "disabled" },
      },
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics).sort(), [
      "Galerina_DB_MYSQL_PARAMETERISED_ONLY_REQUIRED",
      "Galerina_DB_MYSQL_TLS_REQUIRED",
    ]);
    assert.equal(report.checks.nonNegotiables, "fail");
    assert.equal(report.checks.tls, "fail");
    assert.equal(report.checks.credentials, "pass");
    assert.equal(report.checks.parameterisation, "pass");
  });

  it("reports partial status with the warning messages when TLS is weak", () => {
    const report = createMysqlAdapterReport({
      declaration: {
        ...goodDeclaration,
        connection: { ...goodConnection, tlsMode: "required" },
      },
    });
    assert.equal(report.status, "partial");
    assert.deepEqual(codes(report.diagnostics), [
      "Galerina_DB_MYSQL_VERIFY_IDENTITY_RECOMMENDED",
    ]);
    assert.deepEqual(report.warnings, [report.diagnostics[0].message]);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(MYSQL_ADAPTER_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("derives status from severity arithmetic", () => {
    assert.equal(deriveMysqlAdapterStatus([]), "success");
    assert.equal(
      deriveMysqlAdapterStatus([{ code: "x", severity: "warning", message: "m" }]),
      "partial",
    );
    assert.equal(
      deriveMysqlAdapterStatus([
        { code: "x", severity: "warning", message: "m" },
        { code: "y", severity: "error", message: "m" },
      ]),
      "failed",
    );
  });
});

describe("known-set vocabulary", () => {
  it("declares exactly the question_mark placeholder style", () => {
    assert.deepEqual(KNOWN_MYSQL_PLACEHOLDER_STYLES, ["question_mark"]);
  });

  it("declares the four mysql tls modes", () => {
    assert.deepEqual(KNOWN_MYSQL_TLS_MODES, [
      "disabled",
      "required",
      "verify_ca",
      "verify_identity",
    ]);
  });
});
