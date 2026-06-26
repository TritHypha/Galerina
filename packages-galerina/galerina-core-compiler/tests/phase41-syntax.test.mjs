import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, executeFlow } from "../dist/index.js";

async function run(src, flowName, args = new Map()) {
  const prog = parseProgram(src, "test.spore");
  const errs = prog.diagnostics.filter(d => d.severity === "error");
  if (errs.length > 0) throw new Error("Parse errors: " + errs.map(d => d.message).join(", "));
  const r = await executeFlow(flowName, args, prog.ast, prog.flows);
  return r.value;
}

describe("Phase 41: when-guard match arms", () => {
  const src = `
pure flow classify(score: Int): String {
  contract { effects {} }
  match score {
    when score >= 90 => return "critical"
    when score >= 70 => return "high"
    when score >= 40 => return "medium"
    _               => return "low"
  }
}`;
  it("score 95 -> critical", async () => {
    const v = await run(src, "classify", new Map([["score", {__tag:"int",value:95}]]));
    assert.equal(v.value, "critical");
  });
  it("score 75 -> high", async () => {
    const v = await run(src, "classify", new Map([["score", {__tag:"int",value:75}]]));
    assert.equal(v.value, "high");
  });
  it("score 45 -> medium", async () => {
    const v = await run(src, "classify", new Map([["score", {__tag:"int",value:45}]]));
    assert.equal(v.value, "medium");
  });
  it("score 20 -> low (wildcard)", async () => {
    const v = await run(src, "classify", new Map([["score", {__tag:"int",value:20}]]));
    assert.equal(v.value, "low");
  });
});

describe("Phase 41: integer literal match arms", () => {
  const src = `
pure flow httpStatus(code: Int): String {
  contract { effects {} }
  match code {
    200 => return "ok"
    201 => return "created"
    400 => return "bad_request"
    404 => return "not_found"
    500 => return "server_error"
    _   => return "unknown"
  }
}`;
  for (const [code, expected] of [[200,"ok"],[201,"created"],[404,"not_found"],[999,"unknown"]]) {
    it(`code ${code} -> ${expected}`, async () => {
      const v = await run(src, "httpStatus", new Map([["code", {__tag:"int",value:code}]]));
      assert.equal(v.value, expected);
    });
  }
});

describe("Phase 41: colon return type syntax", () => {
  it("accepts : as return type separator", () => {
    const src = "pure flow f(x: Int): Int { contract { effects {} } return x }";
    const prog = parseProgram(src, "t.spore");
    const errs = prog.diagnostics.filter(d => d.severity === "error");
    assert.equal(errs.length, 0, "Colon return type should parse without errors");
    assert.equal(prog.flows[0]?.returnType, "Int");
  });
  it("-> and : both work in same file", () => {
    const src = `
pure flow add(a: Int, b: Int) -> Int { contract { effects {} } return a }
pure flow mul(a: Int, b: Int): Int { contract { effects {} } return a }`;
    const prog = parseProgram(src, "t.spore");
    const errs = prog.diagnostics.filter(d => d.severity === "error");
    assert.equal(errs.length, 0);
    assert.equal(prog.flows.length, 2);
  });
});

describe("Phase 41: inline contract (contract first in flow body)", () => {
  it("contract inside flow body is accepted", () => {
    const src = `pure flow f(x: Int): Int {
  contract {
    intent { "A pure computation." }
    effects {}
  }
  return x
}`;
    const prog = parseProgram(src, "t.spore");
    const errs = prog.diagnostics.filter(d => d.severity === "error");
    assert.equal(errs.length, 0, "Inline contract should parse without errors: " + errs.map(d=>d.message).join(", "));
    assert.equal(prog.flows[0]?.name, "f");
  });
  it("inline contract effects are extracted", () => {
    const src = `secure flow save(x: Int): Bool {
  contract { effects { database.write audit.write } }
  return true
}`;
    const prog = parseProgram(src, "t.spore");
    const errs = prog.diagnostics.filter(d => d.severity === "error");
    assert.equal(errs.length, 0);
    const effects = prog.flows[0]?.declaredEffects ?? [];
    assert.ok(effects.includes("database.write"), "Should extract database.write from inline contract");
    assert.ok(effects.includes("audit.write"), "Should extract audit.write from inline contract");
  });
});

describe("Phase 41: top-level type aliases", () => {
  it("type alias at top level parses cleanly", () => {
    const src = `
type ClassifyResult = Result<String, String>

pure flow classify(score: Int): String {
  contract { effects {} }
  return "ok"
}`;
    const prog = parseProgram(src, "t.spore");
    const errs = prog.diagnostics.filter(d => d.severity === "error");
    assert.equal(errs.length, 0);
  });
});
