// =============================================================================
// Unified Annotator — single-pass annotation tests
//
// Tests for the alongside unified annotation pass (unified-annotator.ts).
// Verifies that annotate() correctly computes type, value-state, and effect
// properties in one AST walk without replacing the existing checkers.
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { annotate, TypeId } from "../../dist/index.js";

// ---------------------------------------------------------------------------
// Helpers — minimal AstNode factories
// ---------------------------------------------------------------------------

function makeNode(kind, value, children) {
  const node = { kind };
  if (value !== undefined) node.value = value;
  if (children !== undefined) node.children = children;
  return node;
}

function countNodes(node) {
  let count = 1;
  for (const child of node.children ?? []) {
    count += countNodes(child);
  }
  return count;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Unified annotator: single-pass annotation", () => {
  // Test 1: annotate() returns a Map
  it("annotate() returns a Map", () => {
    const ast = makeNode("program", undefined, []);
    const result = annotate(ast, []);
    assert.ok(result instanceof Map, "annotate() should return a Map");
  });

  // Test 2: Number literal node gets typeId=TypeId.Int
  it("number literal node gets typeId=TypeId.Int", () => {
    const numNode = makeNode("numberLiteral", "42");
    const ast = makeNode("program", undefined, [numNode]);
    const annMap = annotate(ast, []);

    // The program node is id=0, the numberLiteral is id=1
    const numAnn = annMap.get(1);
    assert.ok(numAnn !== undefined, "numberLiteral annotation should exist");
    assert.equal(
      numAnn.typeId,
      TypeId.Int,
      `expected TypeId.Int (${TypeId.Int}) for integer literal, got ${numAnn.typeId}`,
    );
  });

  // Test 3: String literal node gets typeId=TypeId.String
  it("string literal node gets typeId=TypeId.String", () => {
    const strNode = makeNode("stringLiteral", "hello");
    const ast = makeNode("program", undefined, [strNode]);
    const annMap = annotate(ast, []);

    // The program node is id=0, the stringLiteral is id=1
    const strAnn = annMap.get(1);
    assert.ok(strAnn !== undefined, "stringLiteral annotation should exist");
    assert.equal(
      strAnn.typeId,
      TypeId.String,
      `expected TypeId.String (${TypeId.String}) for string literal, got ${strAnn.typeId}`,
    );
  });

  // Test 4: Node count matches pre-order traversal count
  it("node count matches pre-order traversal count", () => {
    const leaf1 = makeNode("numberLiteral", "1");
    const leaf2 = makeNode("stringLiteral", "x");
    const leaf3 = makeNode("boolLiteral", "true");
    const inner = makeNode("binaryExpr", "+", [leaf1, leaf2]);
    const ast = makeNode("program", undefined, [inner, leaf3]);

    const annMap = annotate(ast, []);
    const expectedCount = countNodes(ast);

    assert.equal(
      annMap.size,
      expectedCount,
      `annotation map should have ${expectedCount} entries (one per pre-order node), got ${annMap.size}`,
    );
  });
});
