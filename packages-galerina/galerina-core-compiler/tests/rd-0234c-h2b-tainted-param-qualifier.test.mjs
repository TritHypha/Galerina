// =============================================================================================
// RD-0234c H2-b — checkTaint honors the DECLARED `tainted` param qualifier (provenance, not name).
// ---------------------------------------------------------------------------------------------
// THE GAP (RD-0234 audit §2 HIGH / H2, second half): the parser has accepted a `tainted` param
// qualifier since 34A ("tainted data: RequestPayload — untrusted input; closes the
// param-trusted-by-default fail-OPEN (0031) opt-in", parser.ts:1030-1041), and the value-state
// checker consumes it — but checkTaint (the FUNGI-TAINT-001 injection-sink layer) IGNORED it: its
// param loop was pure name-allowlist (`TAINT_SOURCES.has(pname)`, taint-checker.ts:378-383, with a
// "Phase 28B will read `tainted` qualifier" TODO). A developer who EXPLICITLY declared a param
// untrusted still got no injection-sink guard unless the param happened to carry an allowlisted
// name. The two taint engines disagreed about a declared contract — a fail-open.
//
// WORSE (found designing this fix): the parser writes qualifiers as a PREFIX inside paramDecl.value
// ("tainted data: T", "readonly req: T"), so the old `split(":")[0]` name lookup read
// "readonly req" — ANY qualifier silently defeated the name heuristic too.
//
// H2-b wires the declared qualifier: the LAST word of the value head is the identifier, the leading
// words are qualifiers; `tainted` ⇒ the param starts tainted. Purely opt-in: a bare param is
// byte-identical to before (zero over-block on undeclared code); the AMBIGUOUS names H2-a excluded
// (payload/data/…) are now guardable by EXPLICIT declaration — provenance beats name.
// =============================================================================================
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, checkTaint } from "../dist/index.js";

function taintCodes(src) {
  const prog = parseProgram(src, "test.fungi");
  return checkTaint(prog.ast, prog.flows).map((d) => d.code);
}

// A flow whose SOLE potential taint source is the (optionally qualified) param, flowing straight
// into a SQL injection sink (Database.query). Fires FUNGI-TAINT-001 iff the param taints.
const sinkFlow = (paramDecl, use = null) =>
  `secure flow q(${paramDecl}) -> Response contract { effects { database.read } }\n` +
  `{ let r: String = Database.query(${use ?? paramDecl.split(":")[0].trim().split(/\s+/).pop()})  return r }`;

describe("RD-0234c H2-b: the DECLARED `tainted` param qualifier is a taint source (FUNGI-TAINT-001)", () => {
  it("ADOPTED: `tainted userId: String` reaching Database.query FIRES (name NOT in TAINT_SOURCES — the qualifier is the carrier)", () => {
    assert.ok(taintCodes(sinkFlow("tainted userId: String")).includes("FUNGI-TAINT-001"),
      "a param the developer DECLARED tainted must guard injection sinks regardless of its name");
  });

  it("ADOPTED: the H2-a-excluded ambiguous name `payload` IS guardable by explicit declaration", () => {
    assert.ok(taintCodes(sinkFlow("tainted payload: String")).includes("FUNGI-TAINT-001"),
      "explicit `tainted payload` must fire — provenance-by-declaration beats the name heuristic");
  });

  it("ADOPTED: a value DERIVED from a tainted param also fires at the sink (propagation)", () => {
    const src =
      `secure flow q(tainted raw: String) -> Response contract { effects { database.read } }\n` +
      `{ let s: String = raw.trim()  let r: String = Database.query(s)  return r }`;
    assert.ok(taintCodes(src).includes("FUNGI-TAINT-001"),
      "taint declared on a param must propagate through derivation to the sink");
  });

  it("ANTI-OVER-BLOCK: a bare `userId` param (no qualifier) stays clean — opt-in only", () => {
    assert.deepEqual(taintCodes(sinkFlow("userId: String")), [],
      "undeclared params must keep today's behaviour byte-identical (zero over-block)");
  });

  it("ANTI-OVER-BLOCK: `readonly cfg: Config` does NOT taint (readonly is not tainted)", () => {
    assert.deepEqual(taintCodes(sinkFlow("readonly cfg: Config", "cfg")), [],
      "other qualifiers must not be conflated with `tainted`");
  });

  it("PREFIX-REPAIR: a qualified SOURCE-NAMED param (`tainted query: String`) still fires (the prefix no longer defeats the name path)", () => {
    assert.ok(taintCodes(sinkFlow("tainted query: String", "query")).includes("FUNGI-TAINT-001"),
      "qualifier + allowlisted name must fire via BOTH carriers, not be masked by the prefix");
  });

  it("REGRESSION GUARD: an existing bare source name (`req`) still taints", () => {
    assert.ok(taintCodes(sinkFlow("req: Request", "req")).includes("FUNGI-TAINT-001"),
      "the name heuristic must survive the qualifier wiring");
  });

  it("REGRESSION GUARD: a literal at the SQL sink stays clean (no spurious taint)", () => {
    assert.deepEqual(taintCodes(`secure flow q() -> Response contract { effects { database.read } }\n{ let r: String = Database.query("SELECT 1")  return r }`), [],
      "a literal argument must never be tainted");
  });
});
