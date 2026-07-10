import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createQueryReport,
  isSome,
  optionNone,
  optionSome,
  unwrapOr,
  validateDatabaseAccessPolicy,
  validateTypedCommand,
  validateTypedQuery,
} from "../dist/index.js";

const codes = (diags) => diags.map((d) => d.code);

const findUser = {
  name: "findUserByEmail",
  model: "User",
  parameters: [{ name: "email", type: "string" }],
  template: "select id, email from users where email = :email",
  resultType: "UserRow",
  cardinality: "option",
};

const denyPolicy = { name: "default", rawSqlDenied: true, exceptions: [] };

describe("validateTypedQuery — parameterised-only, injection unrepresentable", () => {
  it("accepts a named-parameter query", () => {
    assert.deepEqual(codes(validateTypedQuery(findUser)), []);
  });

  it("rejects a template with a raw interpolation marker", () => {
    const diags = validateTypedQuery({
      ...findUser,
      // eslint-disable-next-line no-template-curly-in-string
      template: "select * from users where email = '${email}'",
      parameters: [],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_QUERY_RAW_INTERPOLATION"));
  });

  it("rejects stacked statements", () => {
    const diags = validateTypedQuery({
      ...findUser,
      template: "select 1; drop table users",
      parameters: [],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_QUERY_STACKED_STATEMENTS"));
  });

  it("allows a single trailing semicolon", () => {
    const diags = validateTypedQuery({
      ...findUser,
      template: "select id from users where email = :email;",
    });
    assert.deepEqual(codes(diags), []);
  });

  it("rejects empty parameter names", () => {
    const diags = validateTypedQuery({
      ...findUser,
      parameters: [{ name: "", type: "string" }],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_QUERY_PARAMETER_NAME_INVALID"));
  });

  it("rejects undeclared placeholders and duplicate parameters", () => {
    const diags = validateTypedQuery({
      ...findUser,
      template: "select id from users where email = :email and tenant = :tenant",
      parameters: [
        { name: "email", type: "string" },
        { name: "email", type: "string" },
      ],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_QUERY_PLACEHOLDER_UNDECLARED"));
    assert.ok(codes(diags).includes("Galerina_DATA_QUERY_PARAMETER_DUPLICATE"));
  });

  it("warns on a declared-but-unused parameter", () => {
    const diags = validateTypedQuery({
      ...findUser,
      parameters: [
        { name: "email", type: "string" },
        { name: "orphan", type: "integer" },
      ],
    });
    assert.deepEqual(codes(diags), ["Galerina_DATA_QUERY_PARAMETER_UNUSED"]);
    assert.equal(diags[0].severity, "warning");
  });

  it("rejects unknown parameter types and cardinalities, and requires names", () => {
    const diags = validateTypedQuery({
      name: " ",
      model: "",
      parameters: [{ name: "email", type: "varchar_max" }],
      template: "select 1 from users where email = :email",
      resultType: "",
      cardinality: "at_least_one",
    });
    assert.ok(codes(diags).includes("Galerina_DATA_QUERY_NAME_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_DATA_QUERY_MODEL_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_DATA_QUERY_RESULT_TYPE_REQUIRED"));
    assert.ok(codes(diags).includes("Galerina_DATA_QUERY_PARAMETER_TYPE_UNKNOWN"));
    assert.ok(codes(diags).includes("Galerina_DATA_QUERY_CARDINALITY_UNKNOWN"));
  });
});

describe("validateTypedCommand — same template discipline, declared effect", () => {
  const insertUser = {
    name: "insertUser",
    model: "User",
    effect: "insert",
    parameters: [
      { name: "id", type: "uuid" },
      { name: "email", type: "string" },
    ],
    template: "insert into users (id, email) values (:id, :email)",
  };

  it("accepts a parameterised command", () => {
    assert.deepEqual(codes(validateTypedCommand(insertUser)), []);
  });

  it("rejects an unknown effect", () => {
    const diags = validateTypedCommand({ ...insertUser, effect: "truncate" });
    assert.deepEqual(codes(diags), ["Galerina_DATA_QUERY_COMMAND_EFFECT_UNKNOWN"]);
  });

  it("rejects raw interpolation in commands too", () => {
    const diags = validateTypedCommand({
      ...insertUser,
      // eslint-disable-next-line no-template-curly-in-string
      template: "insert into users values ('${id}')",
      parameters: [],
    });
    assert.ok(codes(diags).includes("Galerina_DATA_QUERY_RAW_INTERPOLATION"));
  });
});

describe("validateDatabaseAccessPolicy — raw SQL denied by default", () => {
  it("accepts a denying policy with no exceptions", () => {
    assert.deepEqual(codes(validateDatabaseAccessPolicy(denyPolicy)), []);
  });

  it("fails closed when an untyped caller passes rawSqlDenied: false", () => {
    const diags = validateDatabaseAccessPolicy({ ...denyPolicy, rawSqlDenied: false });
    assert.deepEqual(codes(diags), ["Galerina_DATA_QUERY_RAW_SQL_DENIAL_REQUIRED"]);
  });

  it("requires review, justification and expiry on every exception", () => {
    const diags = validateDatabaseAccessPolicy({
      ...denyPolicy,
      exceptions: [
        { queryName: "legacyReport", reviewedBy: "", justification: "", expiresAt: "never" },
      ],
    });
    assert.deepEqual(codes(diags).sort(), [
      "Galerina_DATA_QUERY_EXCEPTION_EXPIRY_REQUIRED",
      "Galerina_DATA_QUERY_EXCEPTION_UNREVIEWED",
    ]);
  });

  it("accepts a fully-reviewed, expiring exception", () => {
    const diags = validateDatabaseAccessPolicy({
      ...denyPolicy,
      exceptions: [
        {
          queryName: "legacyReport",
          reviewedBy: "owner",
          justification: "vendor-generated report SQL, migration tracked",
          expiresAt: "2026-12-31T00:00:00Z",
        },
      ],
    });
    assert.deepEqual(codes(diags), []);
  });
});

describe("Option — missing results are typed, not null surprises", () => {
  it("round-trips some/none", () => {
    const someValue = optionSome(42);
    const noneValue = optionNone();
    assert.equal(isSome(someValue), true);
    assert.equal(isSome(noneValue), false);
    assert.equal(unwrapOr(someValue, 0), 42);
    assert.equal(unwrapOr(noneValue, 0), 0);
  });
});

describe("createQueryReport — exceptions are counted and never invisible", () => {
  it("builds a clean report from valid declarations", () => {
    const report = createQueryReport({
      flow: "app.users",
      queries: [findUser],
      commands: [],
      policy: denyPolicy,
    });
    assert.deepEqual(report.queries, ["findUserByEmail"]);
    assert.equal(report.rawSqlExceptionCount, 0);
    assert.deepEqual(report.diagnostics, []);
  });

  it("surfaces every active raw-SQL exception as a warning", () => {
    const report = createQueryReport({
      flow: "app.users",
      queries: [findUser],
      commands: [],
      policy: {
        ...denyPolicy,
        exceptions: [
          {
            queryName: "legacyReport",
            reviewedBy: "owner",
            justification: "tracked",
            expiresAt: "2026-12-31T00:00:00Z",
          },
        ],
      },
    });
    assert.equal(report.rawSqlExceptionCount, 1);
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_QUERY_RAW_SQL_EXCEPTION_ACTIVE"));
    assert.equal(report.warnings.length, 1);
  });

  it("propagates declaration errors into the report", () => {
    const report = createQueryReport({
      flow: "app.users",
      queries: [{ ...findUser, template: "select 1; drop table users", parameters: [] }],
      commands: [],
      policy: denyPolicy,
    });
    assert.ok(codes(report.diagnostics).includes("Galerina_DATA_QUERY_STACKED_STATEMENTS"));
  });
});
