// =============================================================================
// Interpreter Optimizations — Binding Slot Array + While Loop Fast-Path Stub
//
// Covers:
//   A. assignSlots — sequential index assignment for all bindings in a flow
//   B. SlottedScope — O(1) array-backed get/set
//   C. tryWhileFastPath — stub always returns false (fall-through)
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, resolveSymbols, checkTypes, assignSlots, SlottedScope, tryWhileFastPath } from "../dist/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse a single-flow program and return the flow's AstNode so it can be
 * passed directly to assignSlots().
 */
function parseFlow(source, flowName) {
  const parsed = parseProgram(source, "test.spore");
  resolveSymbols(parsed.ast);
  checkTypes(parsed.ast);
  // Walk the top-level children to find the flow declaration node.
  for (const child of parsed.ast.children ?? []) {
    if (child.value === flowName) return child;
  }
  throw new Error(`Flow '${flowName}' not found in parsed AST`);
}

// =============================================================================
// Describe A: assignSlots — sequential index assignment
// =============================================================================

describe("Binding slot allocation", () => {
  it("assignSlots assigns sequential indices to all bindings in a flow", () => {
    // This flow has three distinct bindings: i, total, extra.
    // letDecl and mutDecl nodes appear in order: i (mutDecl), total (mutDecl), extra (letDecl).
    // paramDecl "n" is also present.
    const flowNode = parseFlow(`
guarded flow slotTest(n: Int) -> Int {
  mut i = 0
  mut total = 0
  let extra = 1
  return total
}
`, "slotTest");

    const slots = assignSlots(flowNode);

    // All four names must have been assigned a slot.
    assert.ok(slots.has("n"), "Expected slot for param 'n'");
    assert.ok(slots.has("i"), "Expected slot for mut binding 'i'");
    assert.ok(slots.has("total"), "Expected slot for mut binding 'total'");
    assert.ok(slots.has("extra"), "Expected slot for let binding 'extra'");

    // Indices must be non-negative integers.
    for (const [name, idx] of slots) {
      assert.ok(typeof idx === "number" && idx >= 0 && Number.isInteger(idx),
        `Slot for '${name}' should be a non-negative integer, got ${idx}`);
    }

    // Indices must be unique.
    const indexValues = [...slots.values()];
    const uniqueIndices = new Set(indexValues);
    assert.equal(uniqueIndices.size, indexValues.length, "All slot indices must be unique");

    // Indices must form a contiguous range [0, N-1].
    const sorted = [...uniqueIndices].sort((a, b) => a - b);
    for (let i = 0; i < sorted.length; i++) {
      assert.equal(sorted[i], i, `Expected slot index ${i} but got ${sorted[i]}`);
    }
  });

  it("assignSlots handles a flow with no explicit bindings (returns empty map)", () => {
    const flowNode = parseFlow(`
pure flow noBindings() -> Int {
  return 42
}
`, "noBindings");

    const slots = assignSlots(flowNode);
    // No letDecl / mutDecl / paramDecl in this minimal flow.
    assert.equal(slots.size, 0, "Expected empty slot map for a binding-free flow");
  });
});

// =============================================================================
// Describe B: SlottedScope — get/set correctness
// =============================================================================

describe("SlottedScope get/set", () => {
  it("SlottedScope get/set work correctly for integer values", () => {
    const scope = new SlottedScope(4);

    // Set three slots with different Galerina-shaped values.
    scope.set(0, { __tag: "int", value: 10 });
    scope.set(1, { __tag: "int", value: 20 });
    scope.set(2, { __tag: "bool", value: true });
    scope.set(3, { __tag: "string", value: "hello" });

    const v0 = scope.get(0);
    assert.equal(v0.__tag, "int");
    assert.equal(v0.value, 10);

    const v1 = scope.get(1);
    assert.equal(v1.__tag, "int");
    assert.equal(v1.value, 20);

    const v2 = scope.get(2);
    assert.equal(v2.__tag, "bool");
    assert.equal(v2.value, true);

    const v3 = scope.get(3);
    assert.equal(v3.__tag, "string");
    assert.equal(v3.value, "hello");
  });

  it("SlottedScope overwrite updates the stored value at the same slot", () => {
    const scope = new SlottedScope(2);

    scope.set(0, { __tag: "int", value: 1 });
    assert.equal(scope.get(0).value, 1);

    // Overwrite slot 0.
    scope.set(0, { __tag: "int", value: 99 });
    assert.equal(scope.get(0).value, 99);

    // Slot 1 remains untouched — it was never set, so we only check slot 0 here.
    // (Reading an unset slot returns undefined which is expected for the raw array.)
  });
});

// =============================================================================
// Describe C: tryWhileFastPath stub
// =============================================================================

describe("While loop fast-path stub", () => {
  it("tryWhileFastPath always returns false (stub — falls through to tree-walker)", () => {
    // We just need any AstNode shaped objects; the stub ignores all arguments.
    const dummyNode = { kind: "identifier", value: "x" };
    const result = tryWhileFastPath(dummyNode, dummyNode, new Map());
    assert.equal(result, false, "Stub must return false so the tree-walker is used");
  });
});
