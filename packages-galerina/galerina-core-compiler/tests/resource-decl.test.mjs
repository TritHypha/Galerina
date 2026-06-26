import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram } from "../dist/index.js";
import { lex } from "../dist/lexer.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseOk(source) {
  const result = parseProgram(source, "test.spore");
  const errors = result.diagnostics.filter((d) => d.severity === "error");
  assert.equal(
    errors.length,
    0,
    `Expected no errors, got:\n${errors.map((e) => `  ${e.code}: ${e.message}`).join("\n")}`,
  );
  return result;
}

function findNode(node, kind) {
  if (node === undefined) return undefined;
  if (node.kind === kind) return node;
  for (const child of node.children ?? []) {
    const found = findNode(child, kind);
    if (found !== undefined) return found;
  }
  return undefined;
}

// ── Task 1: Lexer ─────────────────────────────────────────────────────────────

describe("Lexer — resource keyword", () => {
  it("lexes 'resource' as a keyword token", () => {
    const result = lex("resource UserProfile { }", "test.spore");
    const tok = result.tokens.find((t) => t.value === "resource");
    assert.ok(tok !== undefined, "Expected a 'resource' token");
    assert.equal(tok.kind, "keyword");
  });

  it("produces no lex errors for resource keyword", () => {
    const result = lex("resource User { id: UserId }", "test.spore");
    assert.equal(result.diagnostics.length, 0);
  });

  it("lexes 'operations' as an identifier (contextual keyword)", () => {
    const result = lex("operations", "test.spore");
    const tok = result.tokens.find((t) => t.value === "operations");
    assert.ok(tok !== undefined);
    assert.equal(tok.kind, "identifier");
  });
});

// ── Task 2+3: Parser — resourceDecl node kind ─────────────────────────────────

describe("Parser — resource declaration", () => {
  it("parses a minimal resource as resourceDecl", () => {
    const result = parseOk(`
resource User {
  id: UserId
}
`);
    const node = findNode(result.ast, "resourceDecl");
    assert.ok(node !== undefined, "Expected a resourceDecl node");
    assert.equal(node.value, "User");
  });

  it("captures field declarations as paramDecl children", () => {
    const result = parseOk(`
resource User {
  id: UserId
  email: protected Email
  name: String
}
`);
    const node = findNode(result.ast, "resourceDecl");
    assert.ok(node !== undefined);
    const fields = (node.children ?? []).filter((c) => c.kind === "paramDecl");
    assert.equal(fields.length, 3);
    assert.equal(fields[0].value, "id: UserId");
    assert.equal(fields[1].value, "email: protected Email");
    assert.equal(fields[2].value, "name: String");
  });

  it("parses resource with operations block", () => {
    const result = parseOk(`
resource Order {
  id: OrderId
  total: Money

  operations {
    create effects [database.write, audit.write]
    read   effects [database.read]
    update effects [database.write, audit.write]
    delete effects [database.write, audit.write]
  }
}
`);
    const node = findNode(result.ast, "resourceDecl");
    assert.ok(node !== undefined);
    const opBlock = (node.children ?? []).find(
      (c) => c.kind === "identifier" && c.value === "operations:block",
    );
    assert.ok(opBlock !== undefined, "Expected operations:block child");
    const ops = (opBlock.children ?? []).filter(
      (c) => c.kind === "identifier" && c.value.startsWith("op:"),
    );
    assert.ok(ops.length >= 4, `Expected at least 4 operations, got ${ops.length}`);
    assert.ok(ops.some((o) => o.value.startsWith("op:create")));
    assert.ok(ops.some((o) => o.value.startsWith("op:read")));
    assert.ok(ops.some((o) => o.value.startsWith("op:update")));
    assert.ok(ops.some((o) => o.value.startsWith("op:delete")));
  });

  it("captures effects in operation lines", () => {
    const result = parseOk(`
resource Product {
  id: ProductId

  operations {
    create effects [database.write, audit.write]
  }
}
`);
    const node = findNode(result.ast, "resourceDecl");
    assert.ok(node !== undefined);
    const opBlock = (node.children ?? []).find(
      (c) => c.kind === "identifier" && c.value === "operations:block",
    );
    assert.ok(opBlock !== undefined);
    const createOp = (opBlock.children ?? []).find((c) => c.value?.startsWith("op:create"));
    assert.ok(createOp !== undefined, "Expected op:create");
    assert.ok(
      createOp.value.includes("database.write"),
      `Expected database.write in op value, got: ${createOp.value}`,
    );
    assert.ok(
      createOp.value.includes("audit.write"),
      `Expected audit.write in op value, got: ${createOp.value}`,
    );
  });

  it("parses resource with policy block", () => {
    const result = parseOk(`
resource Patient {
  id: PatientId

  policy {
    require audit on create, update, delete
    deny delete unless role.admin
    require redaction before audit.write
  }
}
`);
    const node = findNode(result.ast, "resourceDecl");
    assert.ok(node !== undefined);
    const polBlock = (node.children ?? []).find(
      (c) => c.kind === "identifier" && c.value === "policy:block",
    );
    assert.ok(polBlock !== undefined, "Expected policy:block child");
    const clauses = (polBlock.children ?? []).filter(
      (c) => c.kind === "identifier" && c.value.startsWith("policy:"),
    );
    assert.ok(clauses.length >= 3, `Expected at least 3 policy clauses, got ${clauses.length}`);
  });

  it("parses a full resource with fields, operations, and policy without errors", () => {
    parseOk(`
resource UserProfile {
  id: UserId
  email: protected Email
  name: String

  operations {
    create effects [database.write, audit.write]
    read   effects [database.read]
    update effects [database.write, audit.write]
    delete effects [database.write, audit.write]
  }

  policy {
    require audit on create, update, delete
    deny delete unless role.admin
    require redaction before audit.write
    deny protected Email to response
  }
}
`);
    // If we get here, no error was thrown
    assert.ok(true);
  });

  it("assigns the resource name as the node value", () => {
    const result = parseOk(`
resource Invoice {
  id: InvoiceId
}
`);
    const node = findNode(result.ast, "resourceDecl");
    assert.ok(node !== undefined);
    assert.equal(node.value, "Invoice");
  });

  it("parses multiple resources in one file", () => {
    const result = parseOk(`
resource User {
  id: UserId
}

resource Order {
  id: OrderId
}
`);
    // Count resourceDecl nodes
    let count = 0;
    function countNodes(n) {
      if (n.kind === "resourceDecl") count++;
      for (const c of n.children ?? []) countNodes(c);
    }
    countNodes(result.ast);
    assert.equal(count, 2);
  });
});
