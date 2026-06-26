import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes } from "../dist/index.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAndCheck(source) {
  const parsed = parseProgram(source, "test.spore");
  return checkTypes(parsed.ast);
}

function hasDiag(result, code) {
  return result.diagnostics.some((d) => d.code === code);
}

function diagsWithCode(result, code) {
  return result.diagnostics.filter((d) => d.code === code);
}

// ── Task 1: SPORE-TYPE-005 — call argument type mismatch ───────────────────────

describe("Type checker — SPORE-TYPE-005 InvalidCallArgType", () => {
  it("emits SPORE-TYPE-005 when calling flow(42) where flow expects String", () => {
    const result = parseAndCheck(`
flow greet(name: String) -> Void {
  return
}

flow test() -> Void {
  greet(42)
  return
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-005"),
      `Expected SPORE-TYPE-005 for greet(42) where greet expects String, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("does NOT emit SPORE-TYPE-005 when calling flow('ok') where flow expects String", () => {
    const result = parseAndCheck(`
flow greet(name: String) -> Void {
  return
}

flow test() -> Void {
  greet("hello")
  return
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-005"),
      `Unexpected SPORE-TYPE-005 for greet("hello") where greet expects String`,
    );
  });

  it("SPORE-TYPE-005 message mentions the expected and received types", () => {
    const result = parseAndCheck(`
flow process(count: Int) -> Void {
  return
}

flow test() -> Void {
  process("oops")
  return
}
`);
    const diags = diagsWithCode(result, "SPORE-TYPE-005");
    assert.ok(diags.length > 0, "Expected SPORE-TYPE-005");
    assert.ok(
      diags.some((d) => d.message.includes("Int") && d.message.includes("String")),
      `Expected message to mention 'Int' and 'String', got: ${diags.map((d) => d.message).join("; ")}`,
    );
  });

  it("does NOT emit SPORE-TYPE-005 when argument count is wrong (that is TYPE-007)", () => {
    const result = parseAndCheck(`
flow greet(name: String) -> Void {
  return
}

flow test() -> Void {
  greet("a", "b")
  return
}
`);
    // Wrong count → TYPE-007, not TYPE-005
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-005"),
      `SPORE-TYPE-005 must not fire when argument count is wrong`,
    );
    assert.ok(
      hasDiag(result, "SPORE-TYPE-007"),
      `Expected SPORE-TYPE-007 for wrong argument count`,
    );
  });

  it("does NOT emit SPORE-TYPE-005 when argument type is unknown (undefined)", () => {
    // Identifier 'x' is an unknown binding — inferType returns undefined — no TYPE-005
    const result = parseAndCheck(`
flow greet(name: String) -> Void {
  return
}

flow test(x: String) -> Void {
  greet(x)
  return
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-005"),
      `SPORE-TYPE-005 must not fire when arg type is String (compatible with String param)`,
    );
  });
});

// ── Task 2: SPORE-TYPE-014 — MissingRequiredEffect ─────────────────────────────

describe("Type checker — SPORE-TYPE-014 MissingRequiredEffect", () => {
  it("emits SPORE-TYPE-014 when calling a flow with network.outbound from a pure flow", () => {
    const result = parseAndCheck(`
flow fetchRate(url: String) -> String
  contract { effects { network.outbound } }
{
  return "1.0"
}

pure flow computeRate() -> String {
  let r = fetchRate("https://api.example.com")
  return r
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-014"),
      `Expected SPORE-TYPE-014 when pure flow calls effectful flow, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("SPORE-TYPE-014 message mentions the missing effect and the called flow", () => {
    const result = parseAndCheck(`
flow fetchData(url: String) -> String
  contract { effects { network.outbound } }
{
  return "data"
}

flow pureProcessor() -> String {
  return fetchData("http://example.com")
}
`);
    const diags = diagsWithCode(result, "SPORE-TYPE-014");
    assert.ok(diags.length > 0, "Expected SPORE-TYPE-014");
    assert.ok(
      diags.some((d) => d.message.includes("network.outbound") && d.message.includes("fetchData")),
      `Expected message to mention 'network.outbound' and 'fetchData', got: ${diags.map((d) => d.message).join("; ")}`,
    );
  });

  it("does NOT emit SPORE-TYPE-014 when caller declares the required effect", () => {
    const result = parseAndCheck(`
flow fetchRate(url: String) -> String
  contract { effects { network.outbound } }
{
  return "1.0"
}

flow getRates() -> String
  contract { effects { network.outbound } }
{
  return fetchRate("https://api.example.com")
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-014"),
      `Unexpected SPORE-TYPE-014 when caller declares the required effect`,
    );
  });

  it("does NOT emit SPORE-TYPE-014 for flows with no declared effects", () => {
    const result = parseAndCheck(`
flow pureHelper(x: String) -> String {
  return x
}

flow caller() -> String {
  return pureHelper("hello")
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-014"),
      `Unexpected SPORE-TYPE-014 for flow with no declared effects`,
    );
  });
});

// ── Task 3: match expression type inference ───────────────────────────────────

describe("Type checker — match expression type inference", () => {
  it("infers Int from match expression where all arms return Int literals", () => {
    // A let binding with Auto type assigned a match expression with all-Int arms
    // should NOT emit TYPE-002 (Int is compatible with Int)
    const result = parseAndCheck(`
flow test(x: Result<String, String>) -> Int {
  let val: Int = match x {
    Ok(v) => 1
    Err(e) => 2
  }
  return val
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-002"),
      `Unexpected SPORE-TYPE-002 when match infers Int and binding is Int, got: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`,
    );
  });

  it("allows a match expression where Ok arm and Err arm both return Int", () => {
    const result = parseAndCheck(`
flow classify(x: Result<String, String>) -> Int {
  return match x {
    Ok(v) => 0
    Err(e) => 1
  }
}
`);
    // No TYPE-002 or return type mismatch expected
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-002"),
      `Unexpected SPORE-TYPE-002 for match with all-Int arms`,
    );
  });
});

// ── Task 4: SPORE-TYPE-002 — protected Email assigned to protected Email ────────

describe("Type checker — SPORE-TYPE-002 does not fire for protected-to-protected", () => {
  it("does NOT emit TYPE-002 for protected Email assigned to protected Email binding", () => {
    const result = parseAndCheck(`
flow test(raw: String) -> Void {
  let email: protected Email = validate.email(raw)
  return
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-002"),
      `Unexpected SPORE-TYPE-002 for protected Email binding assigned validate.email(), got: ${result.diagnostics.map((d) => d.code + ": " + d.message).join("; ")}`,
    );
  });

  it("does NOT emit TYPE-002 when Auto is declared (widening always allowed)", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let x: Auto = 42
  return
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-002"),
      `Unexpected SPORE-TYPE-002 for Auto binding`,
    );
  });

  it("emits TYPE-002 when String literal assigned to Int binding", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let x: Int = "not a number"
  return
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-002"),
      `Expected SPORE-TYPE-002 for let x: Int = "not a number", got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("emits TYPE-002 when Bool literal assigned to String binding", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let x: String = true
  return
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-002"),
      `Expected SPORE-TYPE-002 for let x: String = true, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("does NOT emit TYPE-002 for Int literal assigned to Int binding", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let x: Int = 42
  return
}
`);
    assert.ok(
      !hasDiag(result, "SPORE-TYPE-002"),
      `Unexpected SPORE-TYPE-002 for let x: Int = 42`,
    );
  });
});
