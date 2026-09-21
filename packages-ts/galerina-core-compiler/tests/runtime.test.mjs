import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { run } from "../dist/index.js";

describe("Runtime pipeline", () => {
  it("check-only mode runs checkers without executing", async () => {
    const result = await run(`
pure flow greet() -> String {
  return "hello"
}
`, "test.fungi", "greet", new Map(), { mode: "check-only" });

    assert.equal(result.ok, true);
    assert.equal(result.value, undefined);
    assert.equal(result.mode, "check-only");
  });

  it("check-only mode reports type errors", async () => {
    const result = await run(`
flow bad() -> Strng {
  return "hello"
}
`, "test.fungi", "bad", new Map(), { mode: "check-only" });

    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-TYPE-001"));
  });

  it("dev mode executes a flow", async () => {
    const result = await run(`
pure flow answer() -> Int {
  return 42
}
`, "test.fungi", "answer");

    assert.equal(result.ok, true);
    assert.equal(result.value?.__tag, "int");
  });

  it("returns ok false for parse errors", async () => {
    const result = await run(`flow {`, "test.fungi", "missing");

    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith("FUNGI-PARSE-")));
  });

  it("diagnostics array contains checker results", async () => {
    const result = await run(`
flow bad() -> UnknownType {
  return "hello"
}
`, "test.fungi", "bad", new Map(), { mode: "check-only" });

    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-TYPE-001"));
  });

  it("refuses positional record pseudo-calls before execution", async () => {
    const result = await run(`
record Receipt {
  value: Int
}

pure flow buildReceipt() -> Receipt {
  return Receipt(1)
}
`, "record-call.fungi", "buildReceipt");

    assert.equal(result.ok, false);
    assert.equal(result.execution, undefined);
    assert.equal(result.value, undefined);
    assert.equal(
      result.diagnostics.filter((diagnostic) => diagnostic.code === "FUNGI-NAME-001").length,
      1,
    );
  });

  it("fails closed when a discarded expression emits a runtime diagnostic", async () => {
    const result = await run(`
pure flow grow(seed: Int) -> Int {
  mut items: Array<Int> = []
  items.totallyFakeMethodXyzzy(seed)
  return items.count()
}
`, "unresolved-method.fungi", "grow", new Map([
      ["seed", { __tag: "int", value: 7 }],
    ]));

    assert.equal(result.ok, false, "an unknown method must deny the run");
    assert.ok(
      result.diagnostics.some((diagnostic) => diagnostic.code === "FUNGI-PIPELINE-001"),
      "C03 refuses unknown methods at check time so they cannot become a discarded runtime success",
    );
    assert.equal(
      result.value,
      undefined,
      "a refused unknown method must not produce the later return value",
    );
  });
});

describe("Runtime pipeline — naming policy", () => {
  it("Get_User flow with enforceNamingPolicy:false does not cause run failure", async () => {
    const result = await run(
      `flow Get_User() -> String { return "ok" }`,
      "test.fungi",
      "Get_User",
      new Map(),
      { enforceNamingPolicy: false },
    );
    assert.equal(result.ok, true);
  });

  it("Get_User flow with enforceNamingPolicy:true causes ok=false", async () => {
    const result = await run(
      `flow Get_User() -> String { return "ok" }`,
      "test.fungi",
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

  it("FUNGI-STYLE-001 fires for PascalCase flow name Get_User", async () => {
    const result = await run(
      `flow Get_User() -> String { return "ok" }`,
      "test.fungi",
      "Get_User",
      new Map(),
      { enforceNamingPolicy: false },
    );
    assert.ok(
      result.namingDiagnostics !== undefined &&
        result.namingDiagnostics.some((d) => d.code === "FUNGI-STYLE-001"),
      "Expected FUNGI-STYLE-001 for Get_User",
    );
  });

  it("FUNGI-STYLE-002 fires for lowercase type name userId", async () => {
    const result = await run(
      `type userId = String\nflow getUser() -> String { return "ok" }`,
      "test.fungi",
      "getUser",
      new Map(),
      { enforceNamingPolicy: false },
    );
    assert.ok(
      result.namingDiagnostics !== undefined &&
        result.namingDiagnostics.some((d) => d.code === "FUNGI-STYLE-002"),
      "Expected FUNGI-STYLE-002 for userId type",
    );
  });

  it("namingDiagnostics field is present in RuntimeResult", async () => {
    const result = await run(
      `pure flow greet() -> String { return "hello" }`,
      "test.fungi",
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
