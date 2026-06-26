import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseProgram } from "../dist/index.js";

function parseExpr(exprSource) {
  // Wrap in a pure flow so the parser has a valid context
  const source = `pure flow test(a: Int, b: Int, status: Status) -> Int {\n  return ${exprSource}\n}`;
  const result = parseProgram(source, "test.spore");
  // Find the binaryExpr or unaryExpr node in the return statement
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

function findNodeWhere(node, pred) {
  if (node === undefined) return undefined;
  if (pred(node)) return node;
  for (const child of node.children ?? []) {
    const found = findNodeWhere(child, pred);
    if (found !== undefined) return found;
  }
  return undefined;
}

describe("Readable logic forms — 'and'", () => {
  it("'a and b' parses to binaryExpr with value '&&'", () => {
    const result = parseExpr("a and b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "&&");
    assert.ok(node !== undefined, "Expected binaryExpr with value '&&'");
  });

  it("'a and b' sets readableForm to 'and'", () => {
    const result = parseExpr("a and b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "&&");
    assert.equal(node?.readableForm, "and");
  });

  it("'a and b' has two children", () => {
    const result = parseExpr("a and b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "&&");
    assert.equal(node?.children?.length, 2);
  });
});

describe("Readable logic forms — 'or'", () => {
  it("'a or b' parses to binaryExpr with value '||'", () => {
    const result = parseExpr("a or b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "||");
    assert.ok(node !== undefined, "Expected binaryExpr with value '||'");
  });

  it("'a or b' sets readableForm to 'or'", () => {
    const result = parseExpr("a or b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "||");
    assert.equal(node?.readableForm, "or");
  });
});

describe("Readable logic forms — 'is' equality variants", () => {
  it("'a is b' parses to binaryExpr with value '=='", () => {
    const result = parseExpr("a is b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "==");
    assert.ok(node !== undefined, "Expected binaryExpr with value '=='");
    assert.equal(node?.readableForm, "is");
  });

  it("'a is not b' parses to binaryExpr with value '!='", () => {
    const result = parseExpr("a is not b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "!=");
    assert.ok(node !== undefined, "Expected binaryExpr with value '!='");
    assert.equal(node?.readableForm, "is not");
  });

  it("'a is equal to b' parses to binaryExpr with value '=='", () => {
    const result = parseExpr("a is equal to b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "==");
    assert.ok(node !== undefined, "Expected binaryExpr with value '=='");
    assert.equal(node?.readableForm, "is equal to");
  });

  it("'a is not equal to b' parses to binaryExpr with value '!='", () => {
    const result = parseExpr("a is not equal to b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "!=");
    assert.ok(node !== undefined, "Expected binaryExpr with value '!='");
    assert.equal(node?.readableForm, "is not equal to");
  });
});

describe("Readable logic forms — 'is' comparison variants", () => {
  it("'a is greater than b' parses to binaryExpr with value '>'", () => {
    const result = parseExpr("a is greater than b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === ">");
    assert.ok(node !== undefined, "Expected binaryExpr with value '>'");
    assert.equal(node?.readableForm, "is greater than");
  });

  it("'a is less than b' parses to binaryExpr with value '<'", () => {
    const result = parseExpr("a is less than b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "<");
    assert.ok(node !== undefined, "Expected binaryExpr with value '<'");
    assert.equal(node?.readableForm, "is less than");
  });

  it("'a is greater than or equal to b' parses to binaryExpr with value '>='", () => {
    const result = parseExpr("a is greater than or equal to b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === ">=");
    assert.ok(node !== undefined, "Expected binaryExpr with value '>='");
    assert.equal(node?.readableForm, "is greater than or equal to");
  });

  it("'a is less than or equal to b' parses to binaryExpr with value '<='", () => {
    const result = parseExpr("a is less than or equal to b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "<=");
    assert.ok(node !== undefined, "Expected binaryExpr with value '<='");
    assert.equal(node?.readableForm, "is less than or equal to");
  });

  it("'a is not greater than b' parses to binaryExpr with value '<='", () => {
    const result = parseExpr("a is not greater than b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "<=");
    assert.ok(node !== undefined, "Expected binaryExpr with value '<='");
    assert.equal(node?.readableForm, "is not greater than");
  });

  it("'a is not less than b' parses to binaryExpr with value '>='", () => {
    const result = parseExpr("a is not less than b");
    const node = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === ">=");
    assert.ok(node !== undefined, "Expected binaryExpr with value '>='");
    assert.equal(node?.readableForm, "is not less than");
  });
});

describe("Readable logic forms — 'unless'", () => {
  it("'unless x > 5 { }' parses as ifStmt with unary '!' around condition", () => {
    const source = `pure flow test(x: Int) -> Int {
  unless x > 5 {
    return x
  }
  return x
}`;
    const result = parseProgram(source, "test.spore");
    const ifNode = findNode(result.ast, "ifStmt");
    assert.ok(ifNode !== undefined, "Expected ifStmt node");
    assert.equal(ifNode.value, "unless");
    assert.equal(ifNode.readableForm, "unless");
    // First child should be a unaryExpr with "!"
    const negated = ifNode.children?.[0];
    assert.ok(negated !== undefined);
    assert.equal(negated.kind, "unaryExpr");
    assert.equal(negated.value, "!");
  });

  it("'unless' with else branch parses correctly", () => {
    const source = `pure flow test(x: Int) -> Int {
  unless x > 5 {
    return x
  } else {
    return 0
  }
  return x
}`;
    const result = parseProgram(source, "test.spore");
    const ifNode = findNode(result.ast, "ifStmt");
    assert.ok(ifNode !== undefined, "Expected ifStmt node");
    assert.equal(ifNode.value, "unless");
    // Should have 3 children: negated condition, then block, else block
    assert.equal(ifNode.children?.length, 3);
  });
});

describe("Readable logic forms — mixed style", () => {
  it("'amount > 10 and status is Active' parses correctly", () => {
    const source = `pure flow test(amount: Int, status: Status) -> Bool {
  return amount > 10 and status is Active
}`;
    const result = parseProgram(source, "test.spore");
    // Should have no errors
    const errors = result.diagnostics.filter((d) => d.severity === "error");
    assert.equal(errors.length, 0, `Expected no errors, got: ${errors.map((e) => e.message).join(", ")}`);
    // Should have a && node at the top
    const andNode = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "&&");
    assert.ok(andNode !== undefined, "Expected && node");
    assert.equal(andNode?.readableForm, "and");
  });

  it("'a and b or c' respects precedence (or binds looser than and)", () => {
    const source = `pure flow test(a: Bool, b: Bool, c: Bool) -> Bool {
  return a and b or c
}`;
    const result = parseProgram(source, "test.spore");
    // Should parse as (a and b) or c → || at top
    const orNode = findNodeWhere(result.ast, (n) => n.kind === "binaryExpr" && n.value === "||");
    assert.ok(orNode !== undefined, "Expected top-level || node");
    // Left child of || should be &&
    const andNode = orNode?.children?.[0];
    assert.equal(andNode?.kind, "binaryExpr");
    assert.equal(andNode?.value, "&&");
  });
});
