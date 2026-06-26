import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { run } from "../dist/index.js";

describe("Runtime pipeline", () => {
  it("check-only mode runs checkers without executing", async () => {
    const result = await run(`
pure flow greet() -> String {
  return "hello"
}
`, "test.spore", "greet", new Map(), { mode: "check-only" });

    assert.equal(result.ok, true);
    assert.equal(result.value, undefined);
    assert.equal(result.mode, "check-only");
  });

  it("check-only mode reports type errors", async () => {
    const result = await run(`
flow bad() -> Strng {
  return "hello"
}
`, "test.spore", "bad", new Map(), { mode: "check-only" });

    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "SPORE-TYPE-001"));
  });

  it("dev mode executes a flow", async () => {
    const result = await run(`
pure flow answer() -> Int {
  return 42
}
`, "test.spore", "answer");

    assert.equal(result.ok, true);
    assert.equal(result.value?.__tag, "int");
  });

  it("returns ok false for parse errors", async () => {
    const result = await run(`flow {`, "test.spore", "missing");

    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith("SPORE-PARSE-")));
  });

  it("diagnostics array contains checker results", async () => {
    const result = await run(`
flow bad() -> UnknownType {
  return "hello"
}
`, "test.spore", "bad", new Map(), { mode: "check-only" });

    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "SPORE-TYPE-001"));
  });
});

describe("Runtime pipeline — naming policy", () => {
  it("Get_User flow with enforceNamingPolicy:false does not cause run failure", async () => {
    const result = await run(
      `flow Get_User() -> String { return "ok" }`,
      "test.spore",
      "Get_User",
      new Map(),
      { enforceNamingPolicy: false },
    );
    assert.equal(result.ok, true);
  });

  it("Get_User flow with enforceNamingPolicy:true causes ok=false", async () => {
    const result = await run(
      `flow Get_User() -> String { return "ok" }`,
      "test.spore",
      "Get_User",
      new Map(),
      { enforceNamingPolicy: true },
    );
    assert.equal(result.ok, false);
    assert.ok(
      result.namingDiagnostics !== undefined && result.namingDiagnostics.length > 0,
      "Should have naming diagnostics when enforcing",
    );
  });

  it("SPORE-STYLE-001 fires for PascalCase flow name Get_User", async () => {
    const result = await run(
      `flow Get_User() -> String { return "ok" }`,
      "test.spore",
      "Get_User",
      new Map(),
      { enforceNamingPolicy: false },
    );
    assert.ok(
      result.namingDiagnostics !== undefined &&
        result.namingDiagnostics.some((d) => d.code === "SPORE-STYLE-001"),
      "Expected SPORE-STYLE-001 for Get_User",
    );
  });

  it("SPORE-STYLE-002 fires for lowercase type name userId", async () => {
    const result = await run(
      `type userId = String\nflow getUser() -> String { return "ok" }`,
      "test.spore",
      "getUser",
      new Map(),
      { enforceNamingPolicy: false },
    );
    assert.ok(
      result.namingDiagnostics !== undefined &&
        result.namingDiagnostics.some((d) => d.code === "SPORE-STYLE-002"),
      "Expected SPORE-STYLE-002 for userId type",
    );
  });

  it("namingDiagnostics field is present in RuntimeResult", async () => {
    const result = await run(
      `pure flow greet() -> String { return "hello" }`,
      "test.spore",
      "greet",
      new Map(),
      { enforceNamingPolicy: false },
    );
    assert.ok(
      Object.prototype.hasOwnProperty.call(result, "namingDiagnostics"),
      "RuntimeResult should always include namingDiagnostics field",
    );
  });
});
