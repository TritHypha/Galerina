// =============================================================================
// Phase 29 — NaN-boxing, ExecutionGraph fast-path, production readiness
//
// 29A: Tagged integer helpers (tagInt, isTagged, untag, fitsTagged)
// 29B: ExecutionGraph fast-path (pure flows without enforcer use register VM)
// 29C: checkProductionReadiness — production mode summary
// =============================================================================

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  executeFlow,
  tagInt,
  isTagged,
  untag,
  fitsTagged,
  MAX_TAGGED,
  MIN_TAGGED,
  checkProductionReadiness,
} from "../dist/index.js";

// =============================================================================
// 29A: NaN-boxing tagged integer helpers
// =============================================================================

describe("Phase 29A: tagged integer helpers", () => {
  it("tagInt produces an odd number (LSB=1)", () => {
    assert.equal(tagInt(0) & 1, 1);
    assert.equal(tagInt(1) & 1, 1);
    assert.equal(tagInt(42) & 1, 1);
    assert.equal(tagInt(-1) & 1, 1);
  });

  it("isTagged returns true for tagged values and false for plain objects", () => {
    assert.equal(isTagged(tagInt(0)), true);
    assert.equal(isTagged(tagInt(100)), true);
    assert.equal(isTagged(0), false, "Even number 0 is not tagged");
    assert.equal(isTagged(2), false, "Even number 2 is not tagged");
    assert.equal(isTagged("hello"), false, "string is not tagged");
    assert.equal(isTagged({}), false, "object is not tagged");
    assert.equal(isTagged(null), false, "null is not tagged");
  });

  it("untag round-trips correctly for small integers", () => {
    for (const n of [0, 1, 2, 100, 255, 1000, MAX_TAGGED]) {
      const tagged = tagInt(n);
      assert.equal(isTagged(tagged), true, `tagInt(${n}) should be tagged`);
      assert.equal(untag(tagged), n, `untag(tagInt(${n})) should equal ${n}`);
    }
  });

  it("untag round-trips negative integers", () => {
    for (const n of [-1, -100, -1000, MIN_TAGGED]) {
      const tagged = tagInt(n);
      assert.equal(untag(tagged), n, `untag(tagInt(${n})) should equal ${n}`);
    }
  });

  it("fitsTagged correctly identifies in-range integers", () => {
    assert.equal(fitsTagged(0), true);
    assert.equal(fitsTagged(MAX_TAGGED), true);
    assert.equal(fitsTagged(MIN_TAGGED), true);
    assert.equal(fitsTagged(1.5), false, "float does not fit");
    assert.equal(fitsTagged(MAX_TAGGED + 1), false, "out-of-range positive");
    assert.equal(fitsTagged(MIN_TAGGED - 1), false, "out-of-range negative");
  });

  it("MAX_TAGGED and MIN_TAGGED are the correct 31-bit signed bounds", () => {
    assert.equal(MAX_TAGGED, 1073741823);
    assert.equal(MIN_TAGGED, -1073741824);
  });
});

// =============================================================================
// 29B: ExecutionGraph fast-path execution
// =============================================================================

describe("Phase 29B: ExecutionGraph fast-path for pure flows", () => {
  it("pure flow add() returns correct result via fast-path (no enforcer)", async () => {
    const source = `
pure flow add(a: Int, b: Int) -> Int {
  return a + b
}
`;
    const parsed = parseProgram(source, "test.spore");
    const args = new Map([
      ["a", { __tag: "int", value: 3 }],
      ["b", { __tag: "int", value: 4 }],
    ]);

    const result = await executeFlow("add", args, parsed.ast, parsed.flows);
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 7);
  });

  it("pure flow result is consistent across multiple calls (graph caching)", async () => {
    const source = `
pure flow double(n: Int) -> Int {
  return n + n
}
`;
    const parsed = parseProgram(source, "test.spore");

    for (const n of [1, 5, 10, 100]) {
      const args = new Map([["n", { __tag: "int", value: n }]]);
      const result = await executeFlow("double", args, parsed.ast, parsed.flows);
      assert.equal(result.value.__tag, "int");
      assert.equal(result.value.value, n * 2, `double(${n}) should be ${n * 2}`);
    }
  });

  it("non-pure flow still executes correctly via tree-walker fallback", async () => {
    // Use a unique flow name to avoid collisions with the graph cache
    // populated by other pure-flow tests that share the same flowName key.
    const source = `
flow sayHello29(name: String) -> String {
  return "Hello"
}
`;
    const parsed = parseProgram(source, "test.spore");
    const args = new Map([["name", { __tag: "string", value: "World" }]]);
    const result = await executeFlow("sayHello29", args, parsed.ast, parsed.flows);
    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "Hello");
  });

  it("fast-path result audit has qualifier=pure", async () => {
    const source = `
pure flow square(n: Int) -> Int {
  return n * n
}
`;
    const parsed = parseProgram(source, "test.spore");
    const args = new Map([["n", { __tag: "int", value: 6 }]]);
    const result = await executeFlow("square", args, parsed.ast, parsed.flows);

    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 36);
    // The fast-path produces an audit record with qualifier "pure"
    assert.equal(result.audit.qualifier, "pure");
    assert.equal(result.audit.result, "ok");
  });
});

// =============================================================================
// 29C: checkProductionReadiness
// =============================================================================

describe("Phase 29C: checkProductionReadiness", () => {
  it("returns ready=true for empty diagnostics", () => {
    const r = checkProductionReadiness([]);
    assert.equal(r.ready, true);
    assert.equal(r.errors, 0);
    assert.equal(r.warnings, 0);
    assert.equal(r.blockers.length, 0);
  });

  it("returns ready=false for any error-severity diagnostic", () => {
    const r = checkProductionReadiness([
      { code: "SPORE-TYPE-001", severity: "error", message: "Type mismatch" },
    ]);
    assert.equal(r.ready, false);
    assert.equal(r.errors, 1);
  });

  it("counts warnings without blocking", () => {
    const r = checkProductionReadiness([
      { code: "SPORE-EFFECT-005", severity: "warning", message: "Broad alias used" },
    ]);
    assert.equal(r.ready, true);
    assert.equal(r.errors, 0);
    assert.equal(r.warnings, 1);
    assert.equal(r.blockers.length, 0);
  });

  it("adds production-blocker codes to blockers list", () => {
    const r = checkProductionReadiness([
      { code: "SPORE-SEC-020", severity: "error", message: "Runtime mutation" },
    ]);
    assert.equal(r.ready, false);
    assert.equal(r.errors, 1);
    assert.equal(r.blockers.length, 1);
    assert.ok(r.blockers[0].includes("SPORE-SEC-020"));
  });

  it("SPORE-SAFETY-004 (secret literal) is a production blocker", () => {
    const r = checkProductionReadiness([
      { code: "SPORE-SAFETY-004", severity: "error", message: "Secret literal" },
    ]);
    assert.equal(r.ready, false);
    assert.ok(r.blockers.some((b) => b.includes("SPORE-SAFETY-004")));
  });

  it("SPORE-BUILD-001 (non-deterministic build) is a production blocker", () => {
    const r = checkProductionReadiness([
      { code: "SPORE-BUILD-001", severity: "error", message: "Non-deterministic" },
    ]);
    assert.equal(r.ready, false);
    assert.ok(r.blockers.some((b) => b.includes("SPORE-BUILD-001")));
  });

  it("multiple diagnostics: counts errors and warnings independently", () => {
    const diagnostics = [
      { code: "SPORE-EFFECT-005", severity: "warning", message: "Broad alias" },
      { code: "SPORE-TYPE-002", severity: "error", message: "Narrowing" },
      { code: "SPORE-MEMORY-008", severity: "error", message: "unsafe block missing reason" },
    ];
    const r = checkProductionReadiness(diagnostics);
    assert.equal(r.ready, false);
    assert.equal(r.errors, 2);
    assert.equal(r.warnings, 1);
    // SPORE-MEMORY-008 is a blocker WITH A REAL EMITTER (detectUnsafeBlockWithoutReason); SPORE-TYPE-002 is
    // an error but not in PRODUCTION_BLOCKERS. (001/002/003/007 removed — RESERVED, no emitter; RD-0124.)
    assert.ok(r.blockers.some((b) => b.includes("SPORE-MEMORY-008")));
  });

  it("handles diagnostics without code or message gracefully", () => {
    const r = checkProductionReadiness([
      { severity: "error" },       // no code, no message
      { severity: "warning" },     // no code, no message
    ]);
    assert.equal(r.errors, 1);
    assert.equal(r.warnings, 1);
  });

  it("blockers list is frozen (readonly)", () => {
    const r = checkProductionReadiness([
      { code: "SPORE-SEC-020", severity: "error", message: "Runtime mutation" },
    ]);
    assert.ok(Object.isFrozen(r.blockers), "blockers should be frozen");
  });

  // #65 / RD-0130 tripwire: the RESERVED (un-emitted) memory codes must NEVER be production
  // blockers — a blocker no pass can emit is a false capability claim (RD-0124). Galerina is
  // value-semantics, so 001..007 (use-after-move / borrow-* / readonly-mutation / mutable-alias /
  // compile-time bounds / unchecked-access) have no emitter. Only SPORE-MEMORY-008 (wired via
  // detectUnsafeBlockWithoutReason) is a memory blocker. Re-adding any of 001..007 here flips this red.
  it("reserved memory codes SPORE-MEMORY-001..007 are NOT production blockers; 008 is", () => {
    for (const code of [
      "SPORE-MEMORY-001", "SPORE-MEMORY-002", "SPORE-MEMORY-003",
      "SPORE-MEMORY-004", "SPORE-MEMORY-005", "SPORE-MEMORY-006", "SPORE-MEMORY-007",
    ]) {
      // severity "warning" isolates blocker-set membership from the error count.
      const r = checkProductionReadiness([{ code, severity: "warning", message: code }]);
      assert.equal(r.blockers.length, 0, `${code} must NOT be a production blocker (RESERVED, no emitter — value-semantics #65)`);
      assert.equal(r.ready, true, `${code} as a warning must leave the program production-ready`);
    }
    const r8 = checkProductionReadiness([{ code: "SPORE-MEMORY-008", severity: "warning", message: "unsafe block missing reason" }]);
    assert.ok(r8.blockers.some((b) => b.includes("SPORE-MEMORY-008")), "SPORE-MEMORY-008 (the one WIRED memory code) must remain a production blocker");
  });
});
