import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseProgram, checkTypes, resolveSymbols, executeFlow, FUNGI_VOID, FUNGI_NONE } from "../dist/index.js";

async function parseAndRun(source, flowName, args = new Map()) {
  const parsed = parseProgram(source, "test.fungi");
  resolveSymbols(parsed.ast);
  checkTypes(parsed.ast);
  return await executeFlow(flowName, args, parsed.ast);
}

describe("Interpreter - basic execution", () => {
  it("exports canonical void and none constants", () => {
    assert.equal(FUNGI_VOID.__tag, "void");
    assert.equal(FUNGI_NONE.__tag, "none");
  });

  it("returns a string literal from a pure flow", async () => {
    const result = await parseAndRun(`
pure flow greet() -> String {
  return "hello"
}
`, "greet");

    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "hello");
  });

  it("evaluates arithmetic with parameters", async () => {
    const result = await parseAndRun(`
pure flow add(a: Int, b: Int) -> Int {
  return a + b
}
`, "add", new Map([
      ["a", { __tag: "int", value: 3 }],
      ["b", { __tag: "int", value: 4 }],
    ]));

    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 7);
  });

  it("returns an integer literal from a pure flow", async () => {
    const result = await parseAndRun(`
pure flow answer() -> Int {
  return 42
}
`, "answer");

    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 42);
  });

  it("evaluates arithmetic without parameters", async () => {
    const result = await parseAndRun(`
pure flow add() -> Int {
  return 3 + 4
}
`, "add");

    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 7);
  });

  it("concatenates strings", async () => {
    const result = await parseAndRun(`
pure flow concat() -> String {
  return "foo" + "bar"
}
`, "concat");

    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "foobar");
  });

  it("executes if branches", async () => {
    const source = `
pure flow checkFlow(x: Int) -> String {
  if x == 0 {
    return "zero"
  }
  return "nonzero"
}
`;

    const zero = await parseAndRun(source, "checkFlow", new Map([["x", { __tag: "int", value: 0 }]]));
    const nonzero = await parseAndRun(source, "checkFlow", new Map([["x", { __tag: "int", value: 1 }]]));

    assert.equal(zero.value.__tag, "string");
    assert.equal(zero.value.value, "zero");
    assert.equal(nonzero.value.__tag, "string");
    assert.equal(nonzero.value.value, "nonzero");
  });

  it("registers let bindings", async () => {
    const result = await parseAndRun(`
pure flow double(n: Int) -> Int {
  let result: Int = n + n
  return result
}
`, "double", new Map([["n", { __tag: "int", value: 3 }]]));

    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 6);
  });

  it("uses a let binding in return", async () => {
    const result = await parseAndRun(`
pure flow ten() -> Int {
  let x: Int = 10
  return x
}
`, "ten");

    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 10);
  });

  it("executes an if true branch", async () => {
    const result = await parseAndRun(`
pure flow yes() -> String {
  if 1 == 1 {
    return "yes"
  } else {
    return "no"
  }
}
`, "yes");

    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "yes");
  });

  it("executes an if false branch", async () => {
    const result = await parseAndRun(`
pure flow no() -> String {
  if 1 == 2 {
    return "yes"
  } else {
    return "no"
  }
}
`, "no");

    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "no");
  });

  it("matches on bool literals", async () => {
    const result = await parseAndRun(`
pure flow decide(flag: Bool) -> String {
  match flag {
    true => "yes"
    false => "no"
  }
}
`, "decide", new Map([["flag", { __tag: "bool", value: true }]]));

    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "yes");
  });

  it("matches on None", async () => {
    const result = await parseAndRun(`
pure flow maybe() -> String {
  match None {
    None => "absent"
    Some(v) => v
  }
}
`, "maybe");

    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "absent");
  });

  it("matches on Some and binds the inner value", async () => {
    const result = await parseAndRun(`
pure flow maybe() -> String {
  match Some("inner") {
    Some(v) => v
    None => "absent"
  }
}
`, "maybe");

    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "inner");
  });

  it("matches on Ok and unwraps the value", async () => {
    const result = await parseAndRun(`
pure flow okData() -> String {
  match Ok("data") {
    Ok(v) => v
    Err(e) => e
  }
}
`, "okData");

    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "data");
  });

  it("passes flow parameters", async () => {
    const result = await parseAndRun(`
pure flow greet(name: String) -> String {
  return "Hello " + name
}
`, "greet", new Map([["name", { __tag: "string", value: "World" }]]));

    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "Hello World");
  });

  it("executes nested pure flow calls", async () => {
    const result = await parseAndRun(`
pure flow child() -> String {
  return "child"
}

pure flow parent() -> String {
  return child()
}
`, "parent");

    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "child");
  });
});

describe("Interpreter - Result and audit", () => {
  it("propagates Err values with the postfix ? operator", async () => {
    const result = await parseAndRun(`
pure flow run() -> Result<Int, Error> {
  fn fail() -> Result<Int, Error> {
    return Err("bad")
  }
  return fail()?
}
`, "run");

    assert.equal(result.value.__tag, "err");
  });

  it("unwraps Ok values with postfix ? before returning", async () => {
    const result = await parseAndRun(`
pure flow run() -> Int {
  return Ok(1)?
}
`, "run");

    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 1);
  });

  it("emits the runtime audit schema", async () => {
    const result = await parseAndRun(`
pure flow greet() -> String {
  return "hello"
}
`, "greet");

    assert.equal(result.audit.schemaVersion, "fungi.runtime.audit.v1");
  });

  it("records AuditLog.write calls", async () => {
    const result = await parseAndRun(`
guarded flow audited() -> Void
contract { effects { audit.write } }
{
  AuditLog.write(event: "Test")
  return
}
`, "audited");

    assert.equal(result.audit.auditEntries.length, 1);
    assert.equal(result.audit.auditEntries[0].event, "Test");
  });

  it("records AuditLog.write block-style calls", async () => {
    const result = await parseAndRun(`
guarded flow audited() -> Void
contract { effects { audit.write } }
{
  AuditLog.write({ event: "Test" })
  return
}
`, "audited");

    // { event: "Test" } now parses as a record literal — same as named-arg form
    assert.equal(result.audit.auditEntries.length, 1);
    assert.equal(result.audit.auditEntries[0].event, "Test");
  });

  it("validate gate wraps a value in protected", async () => {
    const result = await parseAndRun(`
pure flow validateEmail(rawEmail: String) -> protected Email {
  return validate.email(rawEmail)?
}
`, "validateEmail", new Map([["rawEmail", { __tag: "string", value: "a@example.com" }]]));

    assert.equal(result.value.__tag, "protected");
    assert.equal(result.value.baseType, "Email");
  });

  it("masks protected values in console output", async () => {
    const originalLog = console.log;
    const lines = [];
    console.log = (value) => {
      lines.push(String(value));
    };

    try {
      await parseAndRun(`
secure flow logEmail() -> Void {
  let email: protected Email = "raw@example.com"
  print(email)
  return
}
`, "logEmail");
    } finally {
      console.log = originalLog;
    }

    assert.ok(lines.includes("[PROTECTED]"));
    assert.equal(lines.some((line) => line.includes("raw@example.com")), false);
  });
});

// ── Extended stdlib — Phase 9A additions ─────────────────────────────────────

describe("Stdlib — Duration operations", () => {
  it("Duration.ofMs creates a duration record with correct seconds", async () => {
    const r = await parseAndRun(`
pure flow test() -> Int {
  let d = Duration.ofMs(5000)
  return d.toSeconds()
}
`, "test");
    assert.equal(r.value.__tag, "int");
    assert.equal(r.value.value, 5);
  });

  it("Duration.ofMinutes produces a string with time units", async () => {
    const r = await parseAndRun(`
pure flow test() -> String {
  let d = Duration.ofMinutes(90)
  return d.toString()
}
`, "test");
    assert.equal(r.value.__tag, "string");
    assert.ok(r.value.value.includes("h") || r.value.value.includes("m"));
  });
});

describe("Stdlib — Array extended operations", () => {
  it("Array.range generates a range of correct length", async () => {
    const r = await parseAndRun(`
pure flow test() -> Int {
  let nums = Array.range(0, 5)
  return nums.length()
}
`, "test");
    assert.equal(r.value.__tag, "int");
    assert.equal(r.value.value, 5);
  });

  it("Array.take returns first N elements", async () => {
    const r = await parseAndRun(`
pure flow test() -> Int {
  let nums = Array.range(0, 10)
  let first3 = nums.take(3)
  return first3.length()
}
`, "test");
    assert.equal(r.value.value, 3);
  });

  it("Array.zip creates pairs of correct length", async () => {
    const r = await parseAndRun(`
pure flow test() -> Int {
  let a = Array.of(1, 2, 3)
  let b = Array.of(4, 5, 6)
  let z = a.zip(b)
  return z.length()
}
`, "test");
    assert.equal(r.value.value, 3);
  });

  it("Array.sort returns smallest element first", async () => {
    const r = await parseAndRun(`
pure flow test() -> Int {
  let nums = Array.of(3, 1, 2)
  let sorted = nums.sort()
  return sorted.first().unwrapOr(0)
}
`, "test");
    assert.equal(r.value.value, 1);
  });

  it("Array.distinct removes duplicates", async () => {
    const r = await parseAndRun(`
pure flow test() -> Int {
  let nums = Array.of(1, 2, 1, 3, 2)
  let unique = nums.distinct()
  return unique.length()
}
`, "test");
    assert.equal(r.value.value, 3);
  });
});

describe("Stdlib — String extended operations", () => {
  it("String.charAt returns Some for valid index", async () => {
    const r = await parseAndRun(`
pure flow test() -> Bool {
  let s = "hello"
  let ch = s.charAt(0)
  return ch.isSome()
}
`, "test");
    assert.equal(r.value.value, true);
  });

  it("String.indexOf returns position of substring", async () => {
    const r = await parseAndRun(`
pure flow test() -> Int {
  let s = "hello world"
  return s.indexOf("world")
}
`, "test");
    assert.equal(r.value.value, 6);
  });

  it("String.padStart pads with zeros to target length", async () => {
    const r = await parseAndRun(`
pure flow test() -> String {
  let s = "42"
  return s.padStart(5, "0")
}
`, "test");
    assert.equal(r.value.value, "00042");
  });

  it("String.repeat returns repeated string", async () => {
    const r = await parseAndRun(`
pure flow test() -> String {
  let s = "ab"
  return s.repeat(3)
}
`, "test");
    assert.equal(r.value.value, "ababab");
  });

  it("String.fromChar converts single char to string", async () => {
    const r = await parseAndRun(`
pure flow test() -> String {
  let c: Char = 'A'
  return String.fromChar(c)
}
`, "test");
    assert.equal(r.value.value, "A");
  });
});

describe("Stdlib — Numeric formatting", () => {
  it("Int.toString converts integer to string", async () => {
    const r = await parseAndRun(`
pure flow test() -> String {
  let n: Int = 42
  return n.toString()
}
`, "test");
    assert.equal(r.value.value, "42");
  });

  it("toFixed formats float to 2 decimal places", async () => {
    const r = await parseAndRun(`
pure flow test() -> String {
  let n: Float = 3.14159
  return n.toFixed(2)
}
`, "test");
    assert.equal(r.value.value, "3.14");
  });

  it("Math.pow computes 2^10", async () => {
    const r = await parseAndRun(`
pure flow test() -> Int {
  return Math.pow(2, 10)
}
`, "test");
    assert.equal(r.value.value, 1024);
  });

  it("Math.sqrt of 4 returns 2", async () => {
    const r = await parseAndRun(`
pure flow test() -> Float {
  return Math.sqrt(4)
}
`, "test");
    assert.equal(r.value.value, 2);
  });

  it("clamp restricts value to range", async () => {
    const r = await parseAndRun(`
pure flow test() -> Int {
  let n: Int = 150
  return n.clamp(0, 100)
}
`, "test");
    assert.equal(r.value.value, 100);
  });
});

describe("Stdlib — Map extended operations", () => {
  it("Map.entries returns both key-value pairs", async () => {
    const r = await parseAndRun(`
pure flow test() -> Int {
  let m = Map.empty()
  let m2 = m.set("a", 1)
  let m3 = m2.set("b", 2)
  return m3.entries().length()
}
`, "test");
    assert.equal(r.value.value, 2);
  });

  it("Map.merge combines two maps into one", async () => {
    const r = await parseAndRun(`
pure flow test() -> Int {
  let a = Map.empty().set("x", 1)
  let b = Map.empty().set("y", 2)
  return a.merge(b).size()
}
`, "test");
    assert.equal(r.value.value, 2);
  });
});

describe("Stdlib — Result/Option combinators", () => {
  it("Result.sequence on all Ok returns Ok Array", async () => {
    const r = await parseAndRun(`
pure flow test() -> Bool {
  let results = Array.of(Ok(1), Ok(2), Ok(3))
  let all = Result.sequence(results)
  return all.isOk()
}
`, "test");
    assert.equal(r.value.value, true);
  });

  it("Result.sequence short-circuits on first Err", async () => {
    const r = await parseAndRun(`
pure flow test() -> Bool {
  let results = Array.of(Ok(1), Err("fail"), Ok(3))
  let all = Result.sequence(results)
  return all.isErr()
}
`, "test");
    assert.equal(r.value.value, true);
  });

  it("Option.sequence on all Some returns Some Array", async () => {
    const r = await parseAndRun(`
pure flow test() -> Bool {
  let opts = Array.of(Some(1), Some(2), Some(3))
  let all = Option.sequence(opts)
  return all.isSome()
}
`, "test");
    assert.equal(r.value.value, true);
  });
});

describe("Stdlib — Error type constructors", () => {
  it("ApiError.notFound creates a record with HTTP status 404", async () => {
    const r = await parseAndRun(`
pure flow test() -> Int {
  let e = ApiError.notFound("User not found")
  return e.__httpStatus
}
`, "test");
    assert.equal(r.value.value, 404);
  });

  it("ApiError.badRequest creates a record with HTTP status 400", async () => {
    const r = await parseAndRun(`
pure flow test() -> Int {
  let e = ApiError.badRequest("Invalid email")
  return e.__httpStatus
}
`, "test");
    assert.equal(r.value.value, 400);
  });
});

describe("Interpreter - match on string literals", () => {
  const SRC = `
pure flow classify(kind: String) -> String {
  match kind {
    "literal" => { return "is-literal" }
    "arith" => { return "is-arith" }
    _ => { return "fallthrough" }
  }
}
`;
  const run = (k) => parseAndRun(SRC, "classify", new Map([["kind", { __tag: "string", value: k }]]));

  it("dispatches to the first string-literal arm", async () => {
    const r = await run("literal");
    assert.equal(r.value.value, "is-literal");
  });

  it("dispatches to a later string-literal arm", async () => {
    const r = await run("arith");
    assert.equal(r.value.value, "is-arith");
  });

  it("falls through to the wildcard when no literal matches", async () => {
    const r = await run("compare");
    assert.equal(r.value.value, "fallthrough");
  });
});
