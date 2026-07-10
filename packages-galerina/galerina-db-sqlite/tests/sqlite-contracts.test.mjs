import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  KNOWN_SQLITE_JOURNAL_MODES,
  KNOWN_SQLITE_PLACEHOLDER_STYLES,
  SQLITE_ADAPTER_CHECKS,
  createSqliteAdapterReport,
  deriveSqliteAdapterStatus,
  validateSqliteAdapterDeclaration,
  validateSqliteAdapterRequirements,
  validateSqliteContractRefs,
  validateSqliteCredentialRef,
  validateSqliteDatabaseFile,
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

const goodDeclaration = {
  adapter: "app-sqlite",
  provider: "sqlite",
  requirements,
  contractRefs,
  placeholderStyle: "question_mark",
  databaseFile: "data/app.db",
  journalMode: "wal",
};

describe("validateSqliteAdapterDeclaration — the complete contract", () => {
  it("accepts a fully-declared adapter", () => {
    assert.deepEqual(codes(validateSqliteAdapterDeclaration(goodDeclaration)), []);
  });

  it("accepts both known placeholder styles", () => {
    for (const placeholderStyle of KNOWN_SQLITE_PLACEHOLDER_STYLES) {
      const diags = validateSqliteAdapterDeclaration({
        ...goodDeclaration,
        placeholderStyle,
      });
      assert.deepEqual(codes(diags), [], placeholderStyle);
    }
  });

  it("REJECTS a placeholder style outside the known set", () => {
    const diags = validateSqliteAdapterDeclaration({
      ...goodDeclaration,
      placeholderStyle: "dollar_numbered",
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_SQLITE_PLACEHOLDER_STYLE_INVALID"]);
    assert.equal(diags[0].severity, "error");
  });

  it("requires an adapter name and the sqlite provider literal", () => {
    const diags = validateSqliteAdapterDeclaration({
      ...goodDeclaration,
      adapter: " ",
      provider: "postgres",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_SQLITE_ADAPTER_NAME_REQUIRED",
      "Galerina_DB_SQLITE_PROVIDER_MISMATCH",
    ]);
  });

  it("validates the optional encryption key reference only when present", () => {
    assert.deepEqual(
      codes(validateSqliteAdapterDeclaration({
        ...goodDeclaration,
        encryptionKeyRef: { kind: "external_ref", ref: "secrets://galerina/sqlite/key" },
      })),
      [],
    );
    const diags = validateSqliteAdapterDeclaration({
      ...goodDeclaration,
      encryptionKeyRef: { kind: "inline", ref: " " },
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_SQLITE_CREDENTIAL_KIND_INVALID",
      "Galerina_DB_SQLITE_CREDENTIAL_REF_REQUIRED",
    ]);
  });
});

describe("the three non-negotiables — literal true, re-checked at runtime", () => {
  it("accepts the required literal-true requirements", () => {
    assert.deepEqual(codes(validateSqliteAdapterRequirements(requirements)), []);
  });

  it("fails closed when an untyped caller relaxes any of them", () => {
    const diags = validateSqliteAdapterRequirements({
      parameterisedOnly: false,
      rawSqlDenied: false,
      responseMappingRequired: false,
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_SQLITE_PARAMETERISED_ONLY_REQUIRED",
      "Galerina_DB_SQLITE_RAW_SQL_DENIAL_REQUIRED",
      "Galerina_DB_SQLITE_RESPONSE_MAPPING_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });
});

describe("typed contract refs — the adapter must consume the data family", () => {
  it("requires all three contract references to be non-empty", () => {
    const diags = validateSqliteContractRefs({
      modelContractRef: "",
      queryContractRef: " ",
      responseContractRef: "",
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DB_SQLITE_MODEL_CONTRACT_REF_REQUIRED",
      "Galerina_DB_SQLITE_QUERY_CONTRACT_REF_REQUIRED",
      "Galerina_DB_SQLITE_RESPONSE_CONTRACT_REF_REQUIRED",
    ]);
    assert.ok(diags.every((d) => d.severity === "error"));
  });
});

describe("database file — the archive path rule: relative only", () => {
  it("accepts relative paths", () => {
    for (const databaseFile of ["app.db", "data/app.db", "var/data/app.sqlite3"]) {
      assert.deepEqual(codes(validateSqliteDatabaseFile(databaseFile)), [], databaseFile);
    }
  });

  it("requires a non-empty path", () => {
    const diags = validateSqliteDatabaseFile(" ");
    assert.deepEqual(codes(diags), ["Galerina_DB_SQLITE_DATABASE_PATH_REQUIRED"]);
  });

  it("REJECTS absolute paths, drive letters and upward traversal", () => {
    for (const databaseFile of [
      "/var/lib/app.db",
      "\\srv\\app.db",
      "C:/data/app.db",
      "C:\\data\\app.db",
      "../app.db",
      "data/../../app.db",
    ]) {
      const diags = validateSqliteDatabaseFile(databaseFile);
      assert.deepEqual(
        codes(diags),
        ["Galerina_DB_SQLITE_DATABASE_PATH_UNSAFE"],
        databaseFile,
      );
      assert.equal(diags[0].severity, "error");
    }
  });

  it("REJECTS a credential-bearing connection string smuggled as a path", () => {
    const diags = validateSqliteDatabaseFile("sqlite://app:hunter2@example.com/app.db");
    assert.deepEqual(codes(diags), ["Galerina_DB_SQLITE_INLINE_CREDENTIALS_FORBIDDEN"]);
  });
});

describe("journal mode — known set membership, never defaulted", () => {
  it("accepts every mode in the known set", () => {
    for (const journalMode of KNOWN_SQLITE_JOURNAL_MODES) {
      const diags = validateSqliteAdapterDeclaration({ ...goodDeclaration, journalMode });
      assert.deepEqual(codes(diags), [], journalMode);
    }
  });

  it("REJECTS unknown modes, including the unrepresentable \"off\"", () => {
    for (const journalMode of ["off", "OFF", "rollback"]) {
      const diags = validateSqliteAdapterDeclaration({ ...goodDeclaration, journalMode });
      assert.deepEqual(codes(diags), ["Galerina_DB_SQLITE_JOURNAL_MODE_UNKNOWN"], journalMode);
      assert.equal(diags[0].severity, "error");
    }
  });
});

describe("credentials — external references only, never inline", () => {
  it("REJECTS a credential-bearing connection string in the ref", () => {
    const diags = validateSqliteCredentialRef({
      kind: "external_ref",
      ref: "sqlite://app:hunter2@example.com/key",
    });
    assert.deepEqual(codes(diags), ["Galerina_DB_SQLITE_INLINE_CREDENTIALS_FORBIDDEN"]);
    assert.equal(diags[0].severity, "error");
  });
});

describe("createSqliteAdapterReport — status and checks derived, never asserted", () => {
  it("reports success with every check passing for a clean declaration", () => {
    const report = createSqliteAdapterReport({ declaration: goodDeclaration });
    assert.equal(report.adapter, "app-sqlite");
    assert.equal(report.provider, "sqlite");
    assert.equal(report.status, "success");
    assert.deepEqual(report.diagnostics, []);
    assert.deepEqual(report.warnings, []);
    assert.deepEqual(
      report.checks,
      Object.fromEntries(SQLITE_ADAPTER_CHECKS.map((check) => [check, "pass"])),
    );
  });

  it("derives failed status and per-check outcomes from the diagnostics", () => {
    const report = createSqliteAdapterReport({
      declaration: {
        ...goodDeclaration,
        databaseFile: "../escape.db",
        journalMode: "off",
      },
    });
    assert.equal(report.status, "failed");
    assert.deepEqual(codes(report.diagnostics).sort(), [
      "Galerina_DB_SQLITE_DATABASE_PATH_UNSAFE",
      "Galerina_DB_SQLITE_JOURNAL_MODE_UNKNOWN",
    ]);
    assert.equal(report.checks.databasePath, "fail");
    assert.equal(report.checks.journalMode, "fail");
    assert.equal(report.checks.nonNegotiables, "pass");
    assert.equal(report.checks.credentials, "pass");
  });

  it("derives status from severity arithmetic", () => {
    assert.equal(deriveSqliteAdapterStatus([]), "success");
    assert.equal(
      deriveSqliteAdapterStatus([{ code: "x", severity: "warning", message: "m" }]),
      "partial",
    );
    assert.equal(
      deriveSqliteAdapterStatus([
        { code: "x", severity: "warning", message: "m" },
        { code: "y", severity: "error", message: "m" },
      ]),
      "failed",
    );
  });
});

describe("known-set vocabulary — no network, no TLS", () => {
  it("declares the two sqlite placeholder styles", () => {
    assert.deepEqual(KNOWN_SQLITE_PLACEHOLDER_STYLES, ["question_mark", "named_colon"]);
  });

  it("declares the journal modes without \"off\"", () => {
    assert.deepEqual(KNOWN_SQLITE_JOURNAL_MODES, [
      "wal",
      "delete",
      "truncate",
      "persist",
      "memory",
    ]);
    assert.ok(!KNOWN_SQLITE_JOURNAL_MODES.includes("off"));
  });

  it("has no TLS or host field on the declaration — sqlite is not a network database", () => {
    // The invariant is structural: a clean declaration carries no network
    // surface for a validator to weaken. Assert the declared keys exactly.
    assert.deepEqual(Object.keys(goodDeclaration).sort(), [
      "adapter",
      "contractRefs",
      "databaseFile",
      "journalMode",
      "placeholderStyle",
      "provider",
      "requirements",
    ]);
  });
});
