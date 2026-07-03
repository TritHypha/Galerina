/**
 * Phase 28 — Profile Enforcement + Taint Tracking
 *
 * Tests:
 *   - checkProfiles: FUNGI-PROFILE-001 (recursion), -002 (unbounded loop), -006 (budget)
 *   - checkTaint:    FUNGI-TAINT-001 (tainted→sink), -003 (wrong context), -004 (discouraged)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  parseProgram,
  checkProfiles, FUNGI_PROFILE_001, FUNGI_PROFILE_002, FUNGI_PROFILE_006,
  checkTaint, FUNGI_TAINT_001, FUNGI_TAINT_003, FUNGI_TAINT_004,
  UNTAINT_BOUNDARIES, INJECTION_SINKS,
} from "../dist/index.js";

function profileCodes(src, profiles) {
  const prog = parseProgram(src, "test.fungi");
  return checkProfiles(prog.ast, prog.flows, profiles).map(d => d.code);
}

function taintCodes(src) {
  const prog = parseProgram(src, "test.fungi");
  return checkTaint(prog.ast, prog.flows).map(d => d.code);
}

// ---------------------------------------------------------------------------
// Profile enforcement
// ---------------------------------------------------------------------------

describe("Phase 28: profile enforcement", () => {
  const recursiveFib =
    "pure flow fib(n: Int) -> Int contract { effects {} } { if n <= 1 { return n } return fib(n - 1) + fib(n - 2) }";

  it("FUNGI-PROFILE-001: recursion in strict profile", () => {
    assert.ok(profileCodes(recursiveFib, ["strict"]).includes("FUNGI-PROFILE-001"));
  });

  it("FUNGI-PROFILE-001: recursion in high_integrity profile", () => {
    assert.ok(profileCodes(recursiveFib, ["high_integrity"]).includes("FUNGI-PROFILE-001"));
  });

  it("recursion with NO profile is allowed", () => {
    assert.deepEqual(profileCodes(recursiveFib, []), []);
  });

  it("FUNGI-PROFILE-002: unbounded loop in strict profile", () => {
    const src = [
      "pure flow s(n: Int) -> Int contract { effects {} }",
      "{ mut t: Int = 0  mut i: Int = 0  while i < n { t = t + i  i = i + 1 } return t }",
    ].join("\n");
    assert.ok(profileCodes(src, ["strict"]).includes("FUNGI-PROFILE-002"));
  });

  it("bounded loop (literal limit) in strict profile is allowed", () => {
    const src = [
      "pure flow s() -> Int contract { effects {} }",
      "{ mut t: Int = 0  mut i: Int = 0  while i < 100 { t = t + i  i = i + 1 } return t }",
    ].join("\n");
    assert.ok(!profileCodes(src, ["strict"]).includes("FUNGI-PROFILE-002"));
  });

  it("FUNGI-PROFILE-006: high_integrity without runtime budget warns", () => {
    const src = "secure flow f(n: Int) -> Int contract { effects { audit.write } } { return n }";
    assert.ok(profileCodes(src, ["high_integrity"]).includes("FUNGI-PROFILE-006"));
  });

  it("FUNGI_PROFILE constants have correct codes", () => {
    assert.equal(FUNGI_PROFILE_001.code, "FUNGI-PROFILE-001");
    assert.equal(FUNGI_PROFILE_001.severity, "error");
    assert.equal(FUNGI_PROFILE_002.code, "FUNGI-PROFILE-002");
    assert.equal(FUNGI_PROFILE_006.severity, "warning");
  });
});

// ---------------------------------------------------------------------------
// Taint tracking
// ---------------------------------------------------------------------------

describe("Phase 28: taint tracking", () => {
  it("FUNGI-TAINT-001: tainted request reaches SQL sink", () => {
    const src = [
      "secure flow q(req: Request) -> Response contract { effects { database.read } }",
      "{ let userId: String = req.body  let r: String = Database.query(userId)  return r }",
    ].join("\n");
    assert.ok(taintCodes(src).includes("FUNGI-TAINT-001"));
  });

  it("sanitised value reaches SQL sink cleanly (no diagnostic)", () => {
    const src = [
      "secure flow q(req: Request) -> Response contract { effects { database.read } }",
      "{ let safe: String = Sql.parameterize(req.body)  let r: String = Database.query(safe)  return r }",
    ].join("\n");
    assert.deepEqual(taintCodes(src), []);
  });

  it("FUNGI-TAINT-003: value cleaned for HTML used at SQL sink", () => {
    const src = [
      "secure flow q(req: Request) -> Response contract { effects { database.read } }",
      "{ let h: String = Html.escapeContent(req.body)  let r: String = Database.query(h)  return r }",
    ].join("\n");
    assert.ok(taintCodes(src).includes("FUNGI-TAINT-003"));
  });

  it("FUNGI-TAINT-004: discouraged Sql.escape warns", () => {
    const src = [
      "secure flow q(req: Request) -> Response contract { effects { database.read } }",
      "{ let s: String = Sql.escape(req.body)  return s }",
    ].join("\n");
    assert.ok(taintCodes(src).includes("FUNGI-TAINT-004"));
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

// ---------------------------------------------------------------------------
// C1 / RD-0234c (VD-2) — lowercase + unknown-shaped injection sinks now fail CLOSED.
// Before this fix every case below returned [] — `calleeNameOf` treated only first-char-A–Z
// receivers as modules and INJECTION_SINKS was exact-case, so `db.query`/`pg.query`/`knex.raw`/
// `child_process.exec`/bare `exec()` on tainted input built `--production` clean and SIGNED a
// `.lmanifest` (SQLi/cmd-injection). Now: (b) case-insensitive, (c) sink-SHAPE pattern by method
// name, (d) unknown sink-shaped + tainted ⇒ deny-by-default. Scope stays narrow (SQL/command/XSS
// families) so generic methods do NOT false-positive.
// ---------------------------------------------------------------------------

describe("Phase 28: C1/RD-0234c — case-insensitive + shape + deny-by-default injection sinks", () => {
  const flow = (body) => [
    "secure flow q(req: Request) -> Response contract { effects { database.read } }",
    `{ let userId: String = req.body  ${body}  return "" }`,
  ].join("\n");

  it("lowercase receiver db.query(tainted) FIRES (was [] — case drift)", () => {
    assert.ok(taintCodes(flow("let r: String = db.query(userId)")).includes("FUNGI-TAINT-001"));
  });

  it("unknown receiver pg.query(tainted) FIRES by shape (deny-by-default)", () => {
    assert.ok(taintCodes(flow("let r: String = pg.query(userId)")).includes("FUNGI-TAINT-001"));
  });

  it("knex.raw(tainted) FIRES by shape (deny-by-default)", () => {
    assert.ok(taintCodes(flow("let r: String = knex.raw(userId)")).includes("FUNGI-TAINT-001"));
  });

  it("multi-segment receiver child_process.exec(tainted) FIRES by shape", () => {
    assert.ok(taintCodes(flow("let r: String = child_process.exec(userId)")).includes("FUNGI-TAINT-001"));
  });

  it("bare exec(tainted) FIRES by shape (deny-by-default)", () => {
    assert.ok(taintCodes(flow("let r: String = exec(userId)")).includes("FUNGI-TAINT-001"));
  });

  it("sanitised value into unknown-shaped pg.query stays CLEAN (untaint boundary honoured)", () => {
    assert.deepEqual(
      taintCodes(flow("let safe: String = Sql.parameterize(userId)  let r: String = pg.query(safe)")),
      [],
    );
  });

  it("tainted value into a NON-sink method log.info stays CLEAN (no false positive)", () => {
    assert.deepEqual(taintCodes(flow("let r: String = log.info(userId)")), []);
  });

  it("literal into lowercase db.query stays CLEAN", () => {
    assert.deepEqual(taintCodes(flow('let r: String = db.query("SELECT 1")')), []);
  });
});
