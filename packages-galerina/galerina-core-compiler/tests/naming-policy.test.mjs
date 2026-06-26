// =============================================================================
// Naming Policy Checker Tests — Phase 17A
//
// Covers:
//   1. camelCase flow names pass (no SPORE-STYLE-001)
//   2. PascalCase type names pass (no SPORE-STYLE-002)
//   3. Get_User → SPORE-STYLE-001 with suggested fix "getUser"
//   4. userId type → SPORE-STYLE-002 with suggested fix "UserId"
//   5. Binding named "password" → SPORE-STYLE-SEC-001
//   6. Binding named "rawPassword" → no SEC warning (raw prefix acknowledges boundary)
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkNamingPolicy, SPORE_STYLE_001, SPORE_STYLE_002, SPORE_STYLE_SEC_001 } from "../dist/index.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parse(source) {
  return parseProgram(source, "test.spore").ast;
}

function hasDiag(diags, code) {
  return diags.some((d) => d.code === code);
}

function getDiag(diags, code) {
  return diags.find((d) => d.code === code);
}

// ── Exported constants ────────────────────────────────────────────────────────

describe("Naming policy — exported constants", () => {
  it("SPORE_STYLE_001 has correct code and severity", () => {
    assert.equal(SPORE_STYLE_001.code, "SPORE-STYLE-001");
    assert.equal(SPORE_STYLE_001.severity, "warning");
  });

  it("SPORE_STYLE_002 has correct code and severity", () => {
    assert.equal(SPORE_STYLE_002.code, "SPORE-STYLE-002");
    assert.equal(SPORE_STYLE_002.severity, "warning");
  });

  it("SPORE_STYLE_SEC_001 has correct code and severity", () => {
    assert.equal(SPORE_STYLE_SEC_001.code, "SPORE-STYLE-SEC-001");
    assert.equal(SPORE_STYLE_SEC_001.severity, "warning");
  });
});

// ── Flow naming (SPORE-STYLE-001) ────────────────────────────────────────────────

describe("SPORE-STYLE-001 — flow camelCase convention", () => {
  it("camelCase flow name passes without SPORE-STYLE-001", () => {
    const ast = parse(`
flow getUser(id: String) -> String {
  return id
}
`);
    const result = checkNamingPolicy(ast);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-STYLE-001"),
      `getUser should pass camelCase check, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("camelCase flow names: createPatient, validateEmail pass", () => {
    const ast = parse(`
flow createPatient(name: String) -> String {
  return name
}

flow validateEmail(email: String) -> Bool {
  return true
}
`);
    const result = checkNamingPolicy(ast);
    const style001 = result.diagnostics.filter((d) => d.code === "SPORE-STYLE-001");
    assert.equal(
      style001.length,
      0,
      `createPatient, validateEmail should pass, got violations: ${style001.map((d) => d.message).join("; ")}`,
    );
  });

  it("Get_User emits SPORE-STYLE-001 with suggested fix 'getUser'", () => {
    const ast = parse(`
flow Get_User(id: String) -> String {
  return id
}
`);
    const result = checkNamingPolicy(ast);
    assert.ok(
      hasDiag(result.diagnostics, "SPORE-STYLE-001"),
      `Get_User should emit SPORE-STYLE-001`,
    );
    const diag = getDiag(result.diagnostics, "SPORE-STYLE-001");
    assert.ok(diag !== undefined, "Should have SPORE-STYLE-001 diagnostic");
    assert.ok(
      diag.message.includes("Get_User"),
      `Message should mention 'Get_User', got: ${diag.message}`,
    );
    assert.equal(
      diag.suggestedFix,
      "getUser",
      `Suggested fix should be 'getUser', got: ${diag.suggestedFix}`,
    );
  });

  it("GetUser (PascalCase) emits SPORE-STYLE-001", () => {
    const ast = parse(`
flow GetUser(id: String) -> String {
  return id
}
`);
    const result = checkNamingPolicy(ast);
    assert.ok(
      hasDiag(result.diagnostics, "SPORE-STYLE-001"),
      `GetUser (PascalCase) should emit SPORE-STYLE-001`,
    );
  });

  it("snake_case flow name (get_user) emits SPORE-STYLE-001", () => {
    // snake_case is not valid camelCase — should emit SPORE-STYLE-001
    const fakeAst = {
      kind: "program",
      children: [
        {
          kind: "flowDecl",
          value: "get_user(id: String) -> String",
        },
      ],
    };
    const result = checkNamingPolicy(fakeAst);
    assert.ok(
      hasDiag(result.diagnostics, "SPORE-STYLE-001"),
      `get_user (snake_case) should emit SPORE-STYLE-001`,
    );
  });

  it("SPORE-STYLE-001 message contains 'camelCase'", () => {
    const ast = parse(`
flow Get_User(id: String) -> String {
  return id
}
`);
    const result = checkNamingPolicy(ast);
    const diag = getDiag(result.diagnostics, "SPORE-STYLE-001");
    assert.ok(diag !== undefined);
    assert.ok(
      diag.message.toLowerCase().includes("camelcase"),
      `Message should mention camelCase, got: ${diag.message}`,
    );
  });

  it("fnDecl with PascalCase emits SPORE-STYLE-001", () => {
    const fakeAst = {
      kind: "program",
      children: [
        {
          kind: "fnDecl",
          value: "ComputeScore(x: Int) -> Float",
        },
      ],
    };
    const result = checkNamingPolicy(fakeAst);
    assert.ok(
      hasDiag(result.diagnostics, "SPORE-STYLE-001"),
      `ComputeScore fnDecl should emit SPORE-STYLE-001`,
    );
  });
});

// ── Type naming (SPORE-STYLE-002) ────────────────────────────────────────────────

describe("SPORE-STYLE-002 — type PascalCase convention", () => {
  it("PascalCase type name passes without SPORE-STYLE-002", () => {
    const ast = parse(`
type UserId = String
`);
    const result = checkNamingPolicy(ast);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-STYLE-002"),
      `UserId should pass PascalCase check, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("PascalCase names: PatientRecord, OrderStatus pass", () => {
    const ast = parse(`
type PatientRecord = String
type OrderStatus = String
`);
    const result = checkNamingPolicy(ast);
    const style002 = result.diagnostics.filter((d) => d.code === "SPORE-STYLE-002");
    assert.equal(
      style002.length,
      0,
      `PatientRecord, OrderStatus should pass PascalCase check`,
    );
  });

  it("userId type emits SPORE-STYLE-002 with suggested fix 'UserId'", () => {
    const ast = parse(`
type userId = String
`);
    const result = checkNamingPolicy(ast);
    assert.ok(
      hasDiag(result.diagnostics, "SPORE-STYLE-002"),
      `userId type should emit SPORE-STYLE-002`,
    );
    const diag = getDiag(result.diagnostics, "SPORE-STYLE-002");
    assert.ok(diag !== undefined, "Should have SPORE-STYLE-002 diagnostic");
    assert.ok(
      diag.message.includes("userId"),
      `Message should mention 'userId', got: ${diag.message}`,
    );
    assert.equal(
      diag.suggestedFix,
      "UserId",
      `Suggested fix should be 'UserId', got: ${diag.suggestedFix}`,
    );
  });

  it("user_id type emits SPORE-STYLE-002", () => {
    const fakeAst = {
      kind: "program",
      children: [
        {
          kind: "typeDecl",
          value: "user_id = String",
        },
      ],
    };
    const result = checkNamingPolicy(fakeAst);
    assert.ok(
      hasDiag(result.diagnostics, "SPORE-STYLE-002"),
      `user_id type should emit SPORE-STYLE-002`,
    );
  });

  it("USER_ID type emits SPORE-STYLE-002", () => {
    const fakeAst = {
      kind: "program",
      children: [
        {
          kind: "typeDecl",
          value: "USER_ID = String",
        },
      ],
    };
    const result = checkNamingPolicy(fakeAst);
    assert.ok(
      hasDiag(result.diagnostics, "SPORE-STYLE-002"),
      `USER_ID type should emit SPORE-STYLE-002`,
    );
  });

  it("recordDecl with lowercase name emits SPORE-STYLE-002", () => {
    const fakeAst = {
      kind: "program",
      children: [
        {
          kind: "recordDecl",
          value: "patientRecord { name: String }",
        },
      ],
    };
    const result = checkNamingPolicy(fakeAst);
    assert.ok(
      hasDiag(result.diagnostics, "SPORE-STYLE-002"),
      `patientRecord recordDecl should emit SPORE-STYLE-002`,
    );
  });

  it("SPORE-STYLE-002 message contains 'PascalCase'", () => {
    const ast = parse(`
type userId = String
`);
    const result = checkNamingPolicy(ast);
    const diag = getDiag(result.diagnostics, "SPORE-STYLE-002");
    assert.ok(diag !== undefined);
    assert.ok(
      diag.message.toLowerCase().includes("pascalcase"),
      `Message should mention PascalCase, got: ${diag.message}`,
    );
  });
});

// ── Sensitive binding (SPORE-STYLE-SEC-001) ─────────────────────────────────────

describe("SPORE-STYLE-SEC-001 — sensitive binding names", () => {
  it("binding named 'password' emits SPORE-STYLE-SEC-001", () => {
    const fakeAst = {
      kind: "program",
      children: [
        {
          kind: "flowDecl",
          value: "login(x: String) -> Bool",
          children: [
            {
              kind: "block",
              children: [
                {
                  kind: "letDecl",
                  value: "password = x",
                },
              ],
            },
          ],
        },
      ],
    };
    const result = checkNamingPolicy(fakeAst);
    assert.ok(
      hasDiag(result.diagnostics, "SPORE-STYLE-SEC-001"),
      `Binding 'password' should emit SPORE-STYLE-SEC-001`,
    );
    const diag = getDiag(result.diagnostics, "SPORE-STYLE-SEC-001");
    assert.ok(diag !== undefined);
    assert.ok(
      diag.message.includes("password"),
      `Message should mention 'password', got: ${diag.message}`,
    );
  });

  it("binding named 'secret' emits SPORE-STYLE-SEC-001", () => {
    const fakeAst = {
      kind: "program",
      children: [
        {
          kind: "letDecl",
          value: "secret = apiCall()",
        },
      ],
    };
    const result = checkNamingPolicy(fakeAst);
    assert.ok(
      hasDiag(result.diagnostics, "SPORE-STYLE-SEC-001"),
      `Binding 'secret' should emit SPORE-STYLE-SEC-001`,
    );
  });

  it("binding named 'apiKey' emits SPORE-STYLE-SEC-001", () => {
    const fakeAst = {
      kind: "program",
      children: [
        {
          kind: "letDecl",
          value: "apiKey = getKey()",
        },
      ],
    };
    const result = checkNamingPolicy(fakeAst);
    assert.ok(
      hasDiag(result.diagnostics, "SPORE-STYLE-SEC-001"),
      `Binding 'apiKey' should emit SPORE-STYLE-SEC-001`,
    );
  });

  it("binding named 'token' emits SPORE-STYLE-SEC-001", () => {
    const fakeAst = {
      kind: "program",
      children: [
        {
          kind: "letDecl",
          value: "token = getToken()",
        },
      ],
    };
    const result = checkNamingPolicy(fakeAst);
    assert.ok(
      hasDiag(result.diagnostics, "SPORE-STYLE-SEC-001"),
      `Binding 'token' should emit SPORE-STYLE-SEC-001`,
    );
  });

  it("binding named 'rawPassword' does NOT emit SPORE-STYLE-SEC-001", () => {
    const fakeAst = {
      kind: "program",
      children: [
        {
          kind: "letDecl",
          value: "rawPassword = input",
        },
      ],
    };
    const result = checkNamingPolicy(fakeAst);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-STYLE-SEC-001"),
      `Binding 'rawPassword' with raw prefix should NOT emit SPORE-STYLE-SEC-001, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("binding named 'unsafeToken' does NOT emit SPORE-STYLE-SEC-001", () => {
    const fakeAst = {
      kind: "program",
      children: [
        {
          kind: "letDecl",
          value: "unsafeToken = rawInput",
        },
      ],
    };
    const result = checkNamingPolicy(fakeAst);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-STYLE-SEC-001"),
      `Binding 'unsafeToken' with unsafe prefix should NOT emit SPORE-STYLE-SEC-001`,
    );
  });

  it("non-sensitive binding 'username' does not emit SPORE-STYLE-SEC-001", () => {
    const fakeAst = {
      kind: "program",
      children: [
        {
          kind: "letDecl",
          value: "username = input",
        },
      ],
    };
    const result = checkNamingPolicy(fakeAst);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-STYLE-SEC-001"),
      `Binding 'username' should not emit SPORE-STYLE-SEC-001`,
    );
  });
});

// ── RD-0122: SEC-001 real parsed-source coverage (false-green regression guard) ──
// The synthetic SEC-001 tests above feed `letDecl` nodes with `value: "password = rhs"` placed
// directly under `program` — a shape the parser NEVER emits (real: a top-level let is refused, and
// `letDecl.value` is the BARE name "password" with the RHS in a child). extractDeclName's leading-id
// regex recovers the name from both, so SEC-001 is NOT fail-open today — but this SECURITY guard had
// ZERO real-AST coverage, so a future parser shape change would silently disarm it with every synthetic
// test still green (the RD-0103 / limit-enforcer Bug-A pattern). These cases drive the TRUE parser AST.
describe("SPORE-STYLE-SEC-001 — real parsed source (RD-0122 false-green regression guard)", () => {
  it("a real letDecl carries the BARE name ('password', not 'password = rhs')", () => {
    const ast = parse(`flow f() -> Int {
  let password = getSecret()
  return 0
}`);
    const lets = [];
    (function walk(n) { if (!n) return; if (n.kind === "letDecl") lets.push(n.value); for (const c of n.children ?? []) walk(c); })(ast);
    assert.deepEqual(lets, ["password"], `real letDecl.value should be the bare name, got: ${JSON.stringify(lets)}`);
  });

  for (const name of ["password", "secret", "apiKey", "token"]) {
    it(`SEC-001 fires on a real \`let ${name}\` inside a flow`, () => {
      const ast = parse(`flow f(x: String) -> Int {
  let ${name} = derive(x)
  return 0
}`);
      const result = checkNamingPolicy(ast);
      assert.ok(
        hasDiag(result.diagnostics, "SPORE-STYLE-SEC-001"),
        `real \`let ${name}\` should fire SEC-001, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
      );
    });
  }

  it("SEC-001 does NOT fire on a benign real `let total` (no false positive)", () => {
    const ast = parse(`flow f() -> Int {
  let total = 1 + 2
  return total
}`);
    const result = checkNamingPolicy(ast);
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-STYLE-SEC-001"),
      `benign \`let total\` should not fire SEC-001, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("STYLE-001 fires on a real snake_case flow name `get_user` (true flowDecl shape)", () => {
    const ast = parse(`flow get_user(id: String) -> String {
  return id
}`);
    const result = checkNamingPolicy(ast);
    assert.ok(hasDiag(result.diagnostics, "SPORE-STYLE-001"), `real snake_case flow should fire STYLE-001`);
  });
});

// ── RD-0122: STYLE-002 real parsed-source coverage for record/enum names ─────────
// The synthetic STYLE-002 tests above feed recordDecl/enumDecl nodes with full-header values
// ("patientRecord { name: String }") — the real parser emits the BARE name ("PatientRecord")
// with fields/variants in children. typeDecl had real-source coverage; record/enum did not.
// (Worker RD-0122 follow-up, verified 13/13 against the true parser.)
describe("SPORE-STYLE-002 — real parsed source (RD-0122 record/enum coverage)", () => {
  it("a real recordDecl carries the BARE name ('PatientRecord', not 'PatientRecord { ... }')", () => {
    const ast = parse(`record PatientRecord { name: String }`);
    let val;
    (function walk(n) { if (!n || val) return; if (n.kind === "recordDecl") { val = n.value; return; } for (const c of n.children ?? []) walk(c); })(ast);
    assert.equal(val, "PatientRecord", `real recordDecl.value should be the bare name, got: ${JSON.stringify(val)}`);
  });

  it("STYLE-002 fires on a real snake_case record name `patient_record`", () => {
    const result = checkNamingPolicy(parse(`record patient_record { name: String }`));
    assert.ok(hasDiag(result.diagnostics, "SPORE-STYLE-002"), `real snake_case record should fire STYLE-002`);
  });

  it("STYLE-002 does NOT fire on a real PascalCase record `PatientRecord`", () => {
    const result = checkNamingPolicy(parse(`record PatientRecord { name: String }`));
    assert.ok(!hasDiag(result.diagnostics, "SPORE-STYLE-002"), `PascalCase record should be clean`);
  });

  it("STYLE-002 fires on a real snake_case enum name `order_status`", () => {
    const result = checkNamingPolicy(parse(`enum order_status { New }`));
    assert.ok(hasDiag(result.diagnostics, "SPORE-STYLE-002"), `real snake_case enum should fire STYLE-002`);
  });

  it("STYLE-002 does NOT fire on a real PascalCase enum `OrderStatus`", () => {
    const result = checkNamingPolicy(parse(`enum OrderStatus { New }`));
    assert.ok(!hasDiag(result.diagnostics, "SPORE-STYLE-002"), `PascalCase enum should be clean`);
  });
});

// ── Severity config override ───────────────────────────────────────────────────

describe("Naming policy — severity config", () => {
  it("default severity for style violations is 'warning'", () => {
    const ast = parse(`
flow Get_User(id: String) -> String {
  return id
}
`);
    const result = checkNamingPolicy(ast);
    const diag = getDiag(result.diagnostics, "SPORE-STYLE-001");
    assert.ok(diag !== undefined);
    assert.equal(diag.severity, "warning");
  });

  it("severity 'error' config escalates style violations", () => {
    const ast = parse(`
flow Get_User(id: String) -> String {
  return id
}
`);
    const result = checkNamingPolicy(ast, { severity: "error" });
    const diag = getDiag(result.diagnostics, "SPORE-STYLE-001");
    assert.ok(diag !== undefined);
    assert.equal(diag.severity, "error");
  });

  it("flowNames: 'none' disables SPORE-STYLE-001", () => {
    const ast = parse(`
flow Get_User(id: String) -> String {
  return id
}
`);
    const result = checkNamingPolicy(ast, { flowNames: "none" });
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-STYLE-001"),
      `flowNames: 'none' should disable SPORE-STYLE-001`,
    );
  });

  it("typeNames: 'none' disables SPORE-STYLE-002", () => {
    const ast = parse(`
type userId = String
`);
    const result = checkNamingPolicy(ast, { typeNames: "none" });
    assert.ok(
      !hasDiag(result.diagnostics, "SPORE-STYLE-002"),
      `typeNames: 'none' should disable SPORE-STYLE-002`,
    );
  });

  it("SEC-001 is always emitted regardless of flowNames/typeNames config", () => {
    const fakeAst = {
      kind: "program",
      children: [
        {
          kind: "letDecl",
          value: "password = x",
        },
      ],
    };
    const result = checkNamingPolicy(fakeAst, { flowNames: "none", typeNames: "none" });
    assert.ok(
      hasDiag(result.diagnostics, "SPORE-STYLE-SEC-001"),
      `SEC-001 should fire even when other checks are disabled`,
    );
  });
});

// ── Empty / clean AST ─────────────────────────────────────────────────────────

describe("Naming policy — clean programs", () => {
  it("empty program returns no diagnostics", () => {
    const ast = parse("");
    const result = checkNamingPolicy(ast);
    assert.equal(result.diagnostics.length, 0);
  });

  it("well-named program returns no style diagnostics", () => {
    const ast = parse(`
type UserId = String
type PatientRecord = String

flow getUser(id: UserId) -> PatientRecord {
  return "ok"
}

flow createPatient(name: String) -> UserId {
  return "new-id"
}
`);
    const result = checkNamingPolicy(ast);
    const styleDiags = result.diagnostics.filter(
      (d) => d.code === "SPORE-STYLE-001" || d.code === "SPORE-STYLE-002",
    );
    assert.equal(
      styleDiags.length,
      0,
      `Well-named program should have no style diagnostics, got: ${styleDiags.map((d) => d.message).join("; ")}`,
    );
  });
});
