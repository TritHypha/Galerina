import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  KNOWN_POSTGRES_PLACEHOLDER_STYLES,
  KNOWN_POSTGRES_SSL_MODES,
  POSTGRES_ADAPTER_CHECKS,
  createPostgresAdapterReport,
  derivePostgresAdapterStatus,
  validatePostgresAdapterDeclaration,
  validatePostgresAdapterRequirements,
  validatePostgresConnection,
  validatePostgresContractRefs,
  validatePostgresCredentialRef,
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

const credential = { kind: "external_ref", ref: "secrets://galerina/postgres/app-role" };

const goodConnection = {
  host: "db.internal.example",
  port: 5432,
  database: "app",
  sslMode: "verify-full",
  credential,
};

const goodDeclaration = {
  adapter: "app-postgres",
  provider: "postgres",
  requirements,
  contractRefs,
  placeholderStyle: "dollar_numbered",
  connection: goodConnection,
  statementTimeoutMs: 30000,
};

describe("validatePostgresAdapterDeclaration — the complete contract", () => {
  it("accepts a fully-declared adapter", () => {
    assert.deepEqual(codes(validatePostgresAdapterDeclaration(goodDeclaration)), []);
  });

  it("requires an adapter name and the postgres provider literal", () => {
    const diags = validatePostgresAdapterDeclaration({
      ...goodDeclaration,
      adapter: " ",
      provider: "mysql",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_POSTGRES_ADAPTER_NAME_REQUIRED",
      "Galerina_DB_POSTGRES_PROVIDER_MISMATCH",
    ]);
  });

  it("REJECTS any placeholder style other than dollar_numbered", () => {
    const diags = validatePostgresAdapterDeclaration({
      ...goodDeclaration,
      placeholderStyle: "question_mark",
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_POSTGRES_PLACEHOLDER_STYLE_INVALID"]);
    assert.equal(diags[0].severity, "error");
  });

  it("requires a positive integer statement timeout bound", () => {
    for (const statementTimeoutMs of [0, -1, 1.5, Number.NaN]) {
      const diags = validatePostgresAdapterDeclaration({
        ...goodDeclaration,
        statementTimeoutMs,
      });
      assert.deepEqual(
        codes(diags),
        ["Galerina_DB_POSTGRES_STATEMENT_TIMEOUT_REQUIRED"],
        String(statementTimeoutMs),
      );
    }
  });
});

describe("the three non-negotiables — literal true, re-checked at runtime", () => {
  it("accepts the required literal-true requirements", () => {
    assert.deepEqual(codes(validatePostgresAdapterRequirements(requirements)), []);
  });

  it("fails closed when an untyped caller relaxes any of them", () => {
    const diags = validatePostgresAdapterRequirements({
      parameterisedOnly: false,
      rawSqlDenied: false,
      responseMappingRequired: false,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_POSTGRES_PARAMETERISED_ONLY_REQUIRED",
      "Galerina_DB_POSTGRES_RAW_SQL_DENIAL_REQUIRED",
      "Galerina_DB_POSTGRES_RESPONSE_MAPPING_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });
});

describe("typed contract refs — the adapter must consume the data family", () => {
  it("requires all three contract references to be non-empty", () => {
    const diags = validatePostgresContractRefs({
      modelContractRef: "",
      queryContractRef: " ",
      responseContractRef: "",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_POSTGRES_MODEL_CONTRACT_REF_REQUIRED",
      "Galerina_DB_POSTGRES_QUERY_CONTRACT_REF_REQUIRED",
      "Galerina_DB_POSTGRES_RESPONSE_CONTRACT_REF_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });
});

describe("credentials — external references only, never inline", () => {
  it("accepts an external reference", () => {
    assert.deepEqual(codes(validatePostgresCredentialRef(credential)), []);
  });

  it("rejects a non-external_ref kind smuggled in by an untyped caller", () => {
    const diags = validatePostgresCredentialRef({ kind: "inline", ref: "hunter2" });
    assert.deepEqual(codes(diags), ["Galerina_DB_POSTGRES_CREDENTIAL_KIND_INVALID"]);
  });

  it("requires a non-empty reference", () => {
    const diags = validatePostgresCredentialRef({ kind: "external_ref", ref: " " });
    assert.deepEqual(codes(diags), ["Galerina_DB_POSTGRES_CREDENTIAL_REF_REQUIRED"]);
  });

  it("REJECTS a credential-bearing connection string in the ref", () => {
    const diags = validatePostgresCredentialRef({
      kind: "external_ref",
      ref: "postgres://app:hunter2@db.example.com/app",
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_POSTGRES_INLINE_CREDENTIALS_FORBIDDEN"]);
    assert.equal(diags[0].severity, "error");
  });

  it("REJECTS userinfo smuggled into the connection host", () => {
    const diags = validatePostgresConnection({
      ...goodConnection,
      host: "app:hunter2@db.example.com",
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_POSTGRES_INLINE_CREDENTIALS_FORBIDDEN"]);
  });
});

describe("TLS — required for any non-localhost host", () => {
  it("errors on sslMode disable for a non-localhost host", () => {
    const diags = validatePostgresConnection({ ...goodConnection, sslMode: "disable" });
    assert.deepEqual(codes(diags), ["Galerina_DB_POSTGRES_TLS_REQUIRED"]);
    assert.equal(diags[0].severity, "error");
  });

  it("allows sslMode disable only for localhost hosts", () => {
    for (const host of ["localhost", "127.0.0.1", "::1"]) {
      const diags = validatePostgresConnection({
        ...goodConnection,
        host,
        sslMode: "disable",
      });
      assert.deepEqual(codes(diags), [], host);
    }
  });

  it("rejects an unknown sslMode instead of defaulting it", () => {
    const diags = validatePostgresConnection({ ...goodConnection, sslMode: "prefer" });
    assert.deepEqual(codes(diags), ["Galerina_DB_POSTGRES_SSL_MODE_UNKNOWN"]);
  });

  it("warns that verify-full is recommended when TLS does not verify identity", () => {
    for (const sslMode of ["require", "verify-ca"]) {
      const diags = validatePostgresConnection({ ...goodConnection, sslMode });
      assert.deepEqual(codes(diags), ["Galerina_DB_POSTGRES_VERIFY_FULL_RECOMMENDED"], sslMode);
      assert.equal(diags[0].severity, "warning");
    }
  });

  it("treats an empty host as non-localhost and fails closed", () => {
    const diags = validatePostgresConnection({
      ...goodConnection,
      host: "",
      sslMode: "disable",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_POSTGRES_HOST_REQUIRED",
      "Galerina_DB_POSTGRES_TLS_REQUIRED",
    ]);
  });

  it("validates database name and port bounds", () => {
    const diags = validatePostgresConnection({
      ...goodConnection,
      database: " ",
      port: 70000,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_POSTGRES_DATABASE_REQUIRED",
      "Galerina_DB_POSTGRES_PORT_INVALID",
    ]);
  });
});

describe("createPostgresAdapterReport — status and checks derived, never asserted", () => {
  it("reports success with every check passing for a clean declaration", () => {
    const report = createPostgresAdapterReport({ declaration: goodDeclaration });
    assert.equal(report.adapter, "app-postgres");
    assert.equal(report.provider, "postgres");
    assert.equal(report.status, "success");
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(POSTGRES_ADAPTER_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("derives failed status and per-check outcomes from the diagnostics", () => {
    const report = createPostgresAdapterReport({
      declaration: {
        ...goodDeclaration,
        requirements: { ...requirements, rawSqlDenied: false },
        connection: { ...goodConnection, sslMode: "disable" },
      },
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics).sort(), [
      "Galerina_DB_POSTGRES_RAW_SQL_DENIAL_REQUIRED",
      "Galerina_DB_POSTGRES_TLS_REQUIRED",
    ]);
    assert.equal(report.checks.nonNegotiables, "fail");
    assert.equal(report.checks.tls, "fail");
    assert.equal(report.checks.credentials, "pass");
    assert.equal(report.checks.parameterisation, "pass");
  });

  it("reports partial status with the warning messages when TLS is weak", () => {
    const report = createPostgresAdapterReport({
      declaration: {
        ...goodDeclaration,
        connection: { ...goodConnection, sslMode: "require" },
      },
    });
    assert.equal(report.status, "partial");
    assert.deepEqual(codes(report.diagnostics), [
      "Galerina_DB_POSTGRES_VERIFY_FULL_RECOMMENDED",
    ]);
    assert.deepEqual(report.warnings, [report.diagnostics[0].message]);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(POSTGRES_ADAPTER_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("derives status from severity arithmetic", () => {
    assert.equal(derivePostgresAdapterStatus([]), "success");
    assert.equal(
      derivePostgresAdapterStatus([{ code: "x", severity: "warning", message: "m" }]),
      "partial",
    );
    assert.equal(
      derivePostgresAdapterStatus([
        { code: "x", severity: "warning", message: "m" },
        { code: "y", severity: "error", message: "m" },
      ]),
      "failed",
    );
  });
});

describe("known-set vocabulary", () => {
  it("declares exactly the dollar_numbered placeholder style", () => {
    assert.deepEqual(KNOWN_POSTGRES_PLACEHOLDER_STYLES, ["dollar_numbered"]);
  });

  it("declares the four postgres ssl modes", () => {
    assert.deepEqual(KNOWN_POSTGRES_SSL_MODES, [
      "disable",
      "require",
      "verify-ca",
      "verify-full",
    ]);
  });
});
