/**
 * Phase 28 — Profile Enforcement + Taint Tracking
 *
 * Tests:
 *   - checkProfiles: SPORE-PROFILE-001 (recursion), -002 (unbounded loop), -006 (budget)
 *   - checkTaint:    SPORE-TAINT-001 (tainted→sink), -003 (wrong context), -004 (discouraged)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseProgram,
  checkProfiles, SPORE_PROFILE_001, SPORE_PROFILE_002, SPORE_PROFILE_006,
  checkTaint, SPORE_TAINT_001, SPORE_TAINT_003, SPORE_TAINT_004,
  UNTAINT_BOUNDARIES, INJECTION_SINKS,
} from "../dist/index.js";

function profileCodes(src, profiles) {
  const prog = parseProgram(src, "test.spore");
  return checkProfiles(prog.ast, prog.flows, profiles).map(d => d.code);
}

function taintCodes(src) {
  const prog = parseProgram(src, "test.spore");
  return checkTaint(prog.ast, prog.flows).map(d => d.code);
}

// ---------------------------------------------------------------------------
// Profile enforcement
// ---------------------------------------------------------------------------

describe("Phase 28: profile enforcement", () => {
  const recursiveFib =
    "pure flow fib(n: Int) -> Int contract { effects {} } { if n <= 1 { return n } return fib(n - 1) + fib(n - 2) }";

  it("SPORE-PROFILE-001: recursion in strict profile", () => {
    assert.ok(profileCodes(recursiveFib, ["strict"]).includes("SPORE-PROFILE-001"));
  });

  it("SPORE-PROFILE-001: recursion in high_integrity profile", () => {
    assert.ok(profileCodes(recursiveFib, ["high_integrity"]).includes("SPORE-PROFILE-001"));
  });

  it("recursion with NO profile is allowed", () => {
    assert.deepEqual(profileCodes(recursiveFib, []), []);
  });

  it("SPORE-PROFILE-002: unbounded loop in strict profile", () => {
    const src = [
      "pure flow s(n: Int) -> Int contract { effects {} }",
      "{ mut t: Int = 0  mut i: Int = 0  while i < n { t = t + i  i = i + 1 } return t }",
    ].join("\n");
    assert.ok(profileCodes(src, ["strict"]).includes("SPORE-PROFILE-002"));
  });

  it("bounded loop (literal limit) in strict profile is allowed", () => {
    const src = [
      "pure flow s() -> Int contract { effects {} }",
      "{ mut t: Int = 0  mut i: Int = 0  while i < 100 { t = t + i  i = i + 1 } return t }",
    ].join("\n");
    assert.ok(!profileCodes(src, ["strict"]).includes("SPORE-PROFILE-002"));
  });

  it("SPORE-PROFILE-006: high_integrity without runtime budget warns", () => {
    const src = "secure flow f(n: Int) -> Int contract { effects { audit.write } } { return n }";
    assert.ok(profileCodes(src, ["high_integrity"]).includes("SPORE-PROFILE-006"));
  });

  it("SPORE_PROFILE constants have correct codes", () => {
    assert.equal(SPORE_PROFILE_001.code, "SPORE-PROFILE-001");
    assert.equal(SPORE_PROFILE_001.severity, "error");
    assert.equal(SPORE_PROFILE_002.code, "SPORE-PROFILE-002");
    assert.equal(SPORE_PROFILE_006.severity, "warning");
  });
});

// ---------------------------------------------------------------------------
// Taint tracking
// ---------------------------------------------------------------------------

describe("Phase 28: taint tracking", () => {
  it("SPORE-TAINT-001: tainted request reaches SQL sink", () => {
    const src = [
      "secure flow q(req: Request) -> Response contract { effects { database.read } }",
      "{ let userId: String = req.body  let r: String = Database.query(userId)  return r }",
    ].join("\n");
    assert.ok(taintCodes(src).includes("SPORE-TAINT-001"));
  });

  it("sanitised value reaches SQL sink cleanly (no diagnostic)", () => {
    const src = [
      "secure flow q(req: Request) -> Response contract { effects { database.read } }",
      "{ let safe: String = Sql.parameterize(req.body)  let r: String = Database.query(safe)  return r }",
    ].join("\n");
    assert.deepEqual(taintCodes(src), []);
  });

  it("SPORE-TAINT-003: value cleaned for HTML used at SQL sink", () => {
    const src = [
      "secure flow q(req: Request) -> Response contract { effects { database.read } }",
      "{ let h: String = Html.escapeContent(req.body)  let r: String = Database.query(h)  return r }",
    ].join("\n");
    assert.ok(taintCodes(src).includes("SPORE-TAINT-003"));
  });

  it("SPORE-TAINT-004: discouraged Sql.escape warns", () => {
    const src = [
      "secure flow q(req: Request) -> Response contract { effects { database.read } }",
      "{ let s: String = Sql.escape(req.body)  return s }",
    ].join("\n");
    assert.ok(taintCodes(src).includes("SPORE-TAINT-004"));
  });

  it("literal argument at SQL sink is clean", () => {
    const src = [
      "secure flow q() -> Response contract { effects { database.read } }",
      "{ let r: String = Database.query(\"SELECT 1\")  return r }",
    ].join("\n");
    assert.deepEqual(taintCodes(src), []);
  });

  it("UNTAINT_BOUNDARIES includes OWASP-preferred boundaries", () => {
    const fns = UNTAINT_BOUNDARIES.map(b => b.fn);
    assert.ok(fns.includes("Sql.parameterize"));
    assert.ok(fns.includes("Process.spawn"));
    assert.ok(fns.includes("Path.canonicalizeWithin"));
    // discouraged ones present but flagged
    const sqlEscape = UNTAINT_BOUNDARIES.find(b => b.fn === "Sql.escape");
    assert.equal(sqlEscape?.preferred, false);
  });

  it("INJECTION_SINKS maps Database.query to SqlValue", () => {
    assert.equal(INJECTION_SINKS.get("Database.query"), "SqlValue");
    assert.equal(INJECTION_SINKS.get("Shell.exec"), "ShellArg");
  });
});
