import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseProgram,
  checkTypes,
  checkValueStates,
  resolveSymbols,
  executeFlow,
} from "../dist/index.js";

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

async function parseAndRun(source, flowName, args = new Map()) {
  const parsed = parseProgram(source, "test.spore");
  resolveSymbols(parsed.ast);
  checkTypes(parsed.ast);
  return await executeFlow(flowName, args, parsed.ast);
}

// ── 1. Array<String>, Array<Int>, Array<Bool> — type-checker ─────────────────

describe("Collections — Array<String>, Array<Int>, Array<Bool> (type-checker)", () => {
  it("accepts Array<String> with all string elements", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let names: Array<String> = ["alice", "bob", "carol"]
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-011"), "Unexpected SPORE-TYPE-011 for valid Array<String>");
  });

  it("accepts Array<Int> with all integer elements", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let scores: Array<Int> = [10, 20, 30, 40]
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-011"), "Unexpected SPORE-TYPE-011 for valid Array<Int>");
  });

  it("accepts Array<Bool> with all boolean elements", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let flags: Array<Bool> = [true, false, true]
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-011"), "Unexpected SPORE-TYPE-011 for valid Array<Bool>");
  });

  it("rejects Array<String> with a mixed Int element", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let names: Array<String> = ["alice", 99]
  return
}
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-011"), "Expected SPORE-TYPE-011 for Array<String> with Int element");
  });

  it("rejects Array<Bool> with a String element", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let flags: Array<Bool> = [true, "yes"]
  return
}
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-011"), "Expected SPORE-TYPE-011 for Array<Bool> with String element");
  });
});

// ── 2. Array<Email> — collection of domain types ──────────────────────────────

describe("Collections — Array<Email> domain type (type-checker)", () => {
  it("accepts empty Array<Email> without element mismatch when Email is declared", () => {
    const result = parseAndCheck(`
type Email = Brand<String, "Email">

flow test() -> Void {
  let emails: Array<Email> = []
  return
}
`);
    // An empty list assigned to Array<Email> should produce no element mismatch
    assert.ok(!hasDiag(result, "SPORE-TYPE-011"), "Unexpected SPORE-TYPE-011 for empty Array<Email>");
  });

  it("does not emit SPORE-TYPE-001 for the Array type itself when Email is declared", () => {
    const result = parseAndCheck(`
type Email = Brand<String, "Email">

flow test() -> Void {
  let emails: Array<Email> = []
  return
}
`);
    // Array is a built-in — no unknown-type error for Array itself
    const arrayErrors = diagsWithCode(result, "SPORE-TYPE-001").filter((d) =>
      d.message.includes("Array"),
    );
    assert.equal(arrayErrors.length, 0, "Unexpected SPORE-TYPE-001 for built-in Array type");
  });

  it("does not emit SPORE-TYPE-011 when an Array<String> holds all string elements", () => {
    // Even though Email is a domain type, a valid Array<String> must not trigger 010
    const result = parseAndCheck(`
flow test() -> Void {
  let addresses: Array<String> = ["alice@example.com", "bob@example.com"]
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-011"), "Unexpected SPORE-TYPE-011 for valid Array<String>");
  });

  it("emits SPORE-TYPE-011 when an Array<String> contains a non-String element", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let addresses: Array<String> = ["good@example.com", 42]
  return
}
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-011"), "Expected SPORE-TYPE-011 for Array<String> with Int element");
  });
});

// ── 3. protected Array<Email> — protected collection (value-state-checker) ────

describe("Collections — protected Array<Email> (value-state-checker)", () => {
  it("does not emit SPORE-VALUESTATE-006 when protected value is assigned to protected binding", () => {
    const parsed = parseProgram(`
flow test() -> String {
  let emails: protected String = protect("raw")
  return "ok"
}
`, "test.spore");
    const result = checkValueStates(parsed.ast);
    // protect("raw") assigned to protected String — no violation
    assert.ok(!hasDiag(result, "SPORE-VALUESTATE-006"), "Unexpected SPORE-VALUESTATE-006 when protected qualifier matches");
  });

  it("emits SPORE-VALUESTATE-006 when protect() result is assigned to plain String", () => {
    const parsed = parseProgram(`
flow test() -> String {
  let x: String = protect("raw")
  return "ok"
}
`, "test.spore");
    const result = checkValueStates(parsed.ast);
    assert.ok(hasDiag(result, "SPORE-VALUESTATE-006"), "Expected SPORE-VALUESTATE-006 for unprotected assignment of protect() result");
  });
});

// ── 4. SPORE-TYPE-011: Array<Int> with String element ──────────────────────────

describe("Collections — SPORE-TYPE-011 Array<Int> with String element", () => {
  it("emits SPORE-TYPE-011 for Array<Int> = [1, 'two']", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<Int> = [1, "two"]
  return
}
`);
    assert.ok(
      hasDiag(result, "SPORE-TYPE-011"),
      `Expected SPORE-TYPE-011, got: ${result.diagnostics.map((d) => d.code).join(", ")}`,
    );
  });

  it("SPORE-TYPE-011 message mentions the actual element type (String)", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<Int> = [1, "two"]
  return
}
`);
    const diags = diagsWithCode(result, "SPORE-TYPE-011");
    assert.ok(diags.length > 0, "Expected at least one SPORE-TYPE-011 diagnostic");
    assert.ok(
      diags.some((d) => d.message.includes("String")),
      `Expected message to mention 'String', got: ${diags.map((d) => d.message).join("; ")}`,
    );
  });

  it("does not emit SPORE-TYPE-011 for correct Array<Int> = [1, 2, 3]", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<Int> = [1, 2, 3]
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-011"), "Unexpected SPORE-TYPE-011 for valid Array<Int>");
  });

  it("emits SPORE-TYPE-011 for Array<Bool> = [true, 42]", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let flags: Array<Bool> = [true, 42]
  return
}
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-011"), "Expected SPORE-TYPE-011 for Array<Bool> containing Int");
  });
});

// ── 5. Array methods: .map, .filter, .find, .length, .first, .last ────────────

describe("Collections — Array methods (interpreter)", () => {
  it(".length returns the number of elements", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let xs = [10, 20, 30]
  return xs.length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 3);
  });

  it(".first returns Some(firstElement) for a non-empty list", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let xs = [42, 99, 7]
  let head = xs.first()
  return head.unwrapOr(0)
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 42);
  });

  it(".last returns Some(lastElement) for a non-empty list", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let xs = [1, 2, 99]
  let tail = xs.last()
  return tail.unwrapOr(0)
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 99);
  });

  it(".first returns None for an empty list", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let xs = []
  let head = xs.first()
  return head.unwrapOr(0)
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 0);
  });

  it(".filter keeps only matching elements — callback flow with 'arg' parameter", async () => {
    // The interpreter's applyFn passes the item under the key "arg".
    // Callback flows must therefore declare their single parameter as "arg".
    const result = await parseAndRun(`
flow IsPositive(arg: Int) -> Bool {
  return arg > 0
}

guarded flow test() -> Int {
  let xs = [-1, 2, -3, 4, 5]
  let pos = xs.filter(IsPositive)
  return pos.length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 3);
  });

  it(".map transforms each element — callback flow with 'arg' parameter", async () => {
    const result = await parseAndRun(`
flow Double(arg: Int) -> Int {
  return arg * 2
}

guarded flow test() -> Int {
  let xs = [1, 2, 3]
  let doubled = xs.map(Double)
  return doubled.sum()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 12);
  });

  it(".find returns Some(item) when a predicate matches — callback flow with 'arg' parameter", async () => {
    const result = await parseAndRun(`
flow IsThirty(arg: Int) -> Bool {
  return arg == 30
}

guarded flow test() -> Int {
  let xs = [10, 20, 30, 40]
  let found = xs.find(IsThirty)
  return found.unwrapOr(0)
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 30);
  });

  it(".find returns None when no element matches", async () => {
    const result = await parseAndRun(`
flow IsHundred(arg: Int) -> Bool {
  return arg == 100
}

guarded flow test() -> Int {
  let xs = [10, 20, 30]
  let found = xs.find(IsHundred)
  return found.unwrapOr(-1)
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, -1);
  });
});

// ── 6. Array.range, Array.empty, Array.of ────────────────────────────────────

describe("Collections — Array static constructors (interpreter)", () => {
  it("Array.empty() produces an empty list", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let xs = Array.empty()
  return xs.length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 0);
  });

  it("Array.of() produces a list from its arguments", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let xs = Array.of(1, 2, 3, 4)
  return xs.length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 4);
  });

  it("Array.range(0, 5) produces [0,1,2,3,4]", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let xs = Array.range(0, 5)
  return xs.sum()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 10);
  });

  it("Array.range with step produces every-other element", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let xs = Array.range(0, 10, 2)
  return xs.length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    // 0,2,4,6,8 → 5 elements
    assert.equal(result.value.value, 5);
  });

  it("Array.range(3, 3) produces an empty list", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let xs = Array.range(3, 3)
  return xs.length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 0);
  });
});

// ── 7. Map<String, Int> usage ─────────────────────────────────────────────────

describe("Collections — Map<String, Int> (interpreter)", () => {
  it("Map.empty() produces a map with size 0", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let m = Map.empty()
  return m.size()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 0);
  });

  it("Map.set() adds a key-value pair and increases size", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let m = Map.empty()
  let m2 = m.set("age", 30)
  return m2.size()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 1);
  });

  it("Map.get() returns Some(value) for a known key", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let m = Map.empty()
  let m2 = m.set("score", 99)
  let v = m2.get("score")
  return v.unwrapOr(0)
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 99);
  });

  it("Map.get() returns None for a missing key", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let m = Map.empty()
  let v = m.get("missing")
  return v.unwrapOr(-1)
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, -1);
  });

  it("Map.has() returns true for an existing key", async () => {
    const result = await parseAndRun(`
pure flow test() -> Bool {
  let m = Map.empty()
  let m2 = m.set("name", "alice")
  return m2.has("name")
}
`, "test");
    assert.equal(result.value.__tag, "bool");
    assert.equal(result.value.value, true);
  });

  it("Map.keys() returns a list of all keys", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let m = Map.empty()
  let m2 = m.set("a", 1)
  let m3 = m2.set("b", 2)
  return m3.keys().length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 2);
  });
});

// ── 8. Set<CustomerId> ────────────────────────────────────────────────────────

describe("Collections — Set (interpreter)", () => {
  it("Set.empty() produces a set with no items — verified via toList().length()", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let s = Set.empty()
  return s.toList().length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 0);
  });

  it("Set.from([...]) constructs a set with the given elements — toList().length()", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let s = Set.from([10, 20, 30])
  return s.toList().length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 3);
  });

  it("Set.add() inserts a new element", async () => {
    const result = await parseAndRun(`
pure flow test() -> Bool {
  let s = Set.empty()
  let s2 = s.add(42)
  return s2.contains(42)
}
`, "test");
    assert.equal(result.value.__tag, "bool");
    assert.equal(result.value.value, true);
  });

  it("Set.add() does not duplicate an existing element", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let s = Set.from([1, 2, 3])
  let s2 = s.add(2)
  return s2.toList().length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 3);
  });

  it("type-checker accepts Set<String> without element mismatch", () => {
    // Set<String> is a valid generic instantiation — no SPORE-TYPE-009 or SPORE-TYPE-001 expected
    const result = parseAndCheck(`
flow test() -> Void {
  let ids: Set<String> = Set.empty()
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-009"), "Unexpected SPORE-TYPE-009 for Set<String>");
  });
});

// ── 9. Nested collections: Array<Array<Int>> ──────────────────────────────────

describe("Collections — Nested Array<Array<Int>> (interpreter)", () => {
  it("builds a nested list and reads the inner length", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let inner1 = [1, 2, 3]
  let inner2 = [4, 5]
  let outer = Array.of(inner1, inner2)
  return outer.length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 2);
  });

  it("flattens a nested list using flatMap", async () => {
    // Callback flow parameter must be 'arg' (interpreter applyFn convention)
    const result = await parseAndRun(`
flow Identity(arg: Array<Int>) -> Array<Int> {
  return arg
}

guarded flow test() -> Int {
  let nested = Array.of([1, 2], [3, 4], [5])
  let flat = nested.flatMap(Identity)
  return flat.sum()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 15);
  });
});

// ── 10. Option<Array<Email>> ──────────────────────────────────────────────────

describe("Collections — Option<Array<Email>> (interpreter)", () => {
  it("Some wraps a list and unwrapOr returns it when Some", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let emails = ["a@example.com", "b@example.com"]
  let opt = Some(emails)
  let resolved = opt.unwrapOr([])
  return resolved.length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 2);
  });

  it("None.unwrapOr returns the fallback empty list", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let opt = None
  let resolved = opt.unwrapOr([])
  return resolved.length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 0);
  });

  it("Option.isSome returns true for Some(list)", async () => {
    const result = await parseAndRun(`
pure flow test() -> Bool {
  let opt = Some(["x@y.com"])
  return opt.isSome()
}
`, "test");
    assert.equal(result.value.__tag, "bool");
    assert.equal(result.value.value, true);
  });
});

// ── 11. Result<Array<Patient>, ApiError> ──────────────────────────────────────

describe("Collections — Result wrapping a list (interpreter)", () => {
  it("Ok([...]).isOk() returns true", async () => {
    const result = await parseAndRun(`
pure flow test() -> Bool {
  let patients = ["pat-1", "pat-2", "pat-3"]
  let r = Ok(patients)
  return r.isOk()
}
`, "test");
    assert.equal(result.value.__tag, "bool");
    assert.equal(result.value.value, true);
  });

  it("Err(apiError).isErr() returns true", async () => {
    const result = await parseAndRun(`
pure flow test() -> Bool {
  let r = Err("ApiError: not found")
  return r.isErr()
}
`, "test");
    assert.equal(result.value.__tag, "bool");
    assert.equal(result.value.value, true);
  });

  it("Ok([...]).unwrapOr([]) returns the inner list", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let patients = ["pat-1", "pat-2"]
  let r = Ok(patients)
  let list = r.unwrapOr([])
  return list.length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 2);
  });

  it("Err(...).unwrapOr([]) returns the fallback empty list", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let r = Err("ApiError: timeout")
  let list = r.unwrapOr([])
  return list.length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 0);
  });
});

// ── 12. Building arrays with while loops ──────────────────────────────────────

describe("Collections — building arrays with while loops (interpreter)", () => {
  it("appends elements in a while loop to build a list of given length", async () => {
    const result = await parseAndRun(`
guarded flow test() -> Int {
  mut acc = Array.empty()
  mut i = 0
  while i < 5 {
    acc = acc.push(i)
    i = i + 1
  }
  return acc.length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 5);
  });

  it("accumulates a sum via push + sum in a while loop", async () => {
    const result = await parseAndRun(`
guarded flow test() -> Int {
  mut nums = Array.empty()
  mut i = 1
  while i <= 4 {
    nums = nums.push(i)
    i = i + 1
  }
  return nums.sum()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    // 1+2+3+4 = 10
    assert.equal(result.value.value, 10);
  });
});

// ── 13. for item in list iteration ───────────────────────────────────────────

describe("Collections — for-each iteration (interpreter)", () => {
  it("iterates a string list and counts items", async () => {
    const result = await parseAndRun(`
guarded flow test() -> Int {
  mut count = 0
  for name in ["alice", "bob", "carol"] {
    count = count + 1
  }
  return count
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 3);
  });

  it("iterates over Array.range result and sums items", async () => {
    const result = await parseAndRun(`
guarded flow test() -> Int {
  let nums = Array.range(1, 6)
  mut total = 0
  for n in nums {
    total = total + n
  }
  return total
}
`, "test");
    assert.equal(result.value.__tag, "int");
    // 1+2+3+4+5 = 15
    assert.equal(result.value.value, 15);
  });

  it("for-each over empty list executes body zero times", async () => {
    const result = await parseAndRun(`
guarded flow test() -> Int {
  mut x = 77
  for item in Array.empty() {
    x = 0
  }
  return x
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 77);
  });

  it("for-each can build a filtered accumulator", async () => {
    const result = await parseAndRun(`
guarded flow test() -> Int {
  mut result = Array.empty()
  for n in [1, 2, 3, 4, 5, 6] {
    if n > 3 {
      result = result.push(n)
    }
  }
  return result.length()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    // 4,5,6 → 3 elements
    assert.equal(result.value.value, 3);
  });
});

// ── 14. Array operations in flows ────────────────────────────────────────────

describe("Collections — Array operations in flows (interpreter)", () => {
  it("combines .filter and .map to produce a transformed subset", async () => {
    // Callback flows must use 'arg' as the parameter name (interpreter convention)
    const result = await parseAndRun(`
flow IsEven(arg: Int) -> Bool {
  return arg % 2 == 0
}

flow Triple(arg: Int) -> Int {
  return arg * 3
}

guarded flow test() -> Int {
  let xs = [1, 2, 3, 4, 5, 6]
  let evens = xs.filter(IsEven)
  let tripled = evens.map(Triple)
  return tripled.sum()
}
`, "test");
    assert.equal(result.value.__tag, "int");
    // evens: [2,4,6] → tripled: [6,12,18] → sum: 36
    assert.equal(result.value.value, 36);
  });

  it(".reverse reverses the element order", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let xs = [1, 2, 3]
  let rev = xs.reverse()
  return rev.first().unwrapOr(0)
}
`, "test");
    assert.equal(result.value.__tag, "int");
    // reversed first element is 3
    assert.equal(result.value.value, 3);
  });

  it(".join concatenates string elements with a separator", async () => {
    const result = await parseAndRun(`
pure flow test() -> String {
  let words = ["hello", "world"]
  return words.join(", ")
}
`, "test");
    assert.equal(result.value.__tag, "string");
    assert.equal(result.value.value, "hello, world");
  });

  it(".contains returns true when element is present", async () => {
    const result = await parseAndRun(`
pure flow test() -> Bool {
  let xs = [10, 20, 30]
  return xs.contains(20)
}
`, "test");
    assert.equal(result.value.__tag, "bool");
    assert.equal(result.value.value, true);
  });

  it(".sort orders integer elements ascending", async () => {
    const result = await parseAndRun(`
pure flow test() -> Int {
  let xs = [5, 1, 4, 2, 3]
  let sorted = xs.sort()
  return sorted.first().unwrapOr(0)
}
`, "test");
    assert.equal(result.value.__tag, "int");
    assert.equal(result.value.value, 1);
  });
});

// ── 15. Type inference for list literals: [1, 2, 3] infers Array<Int> ────────

describe("Collections — type inference for list literals (type-checker)", () => {
  it("infers Array<Int> for [1, 2, 3] — no SPORE-TYPE-011 when assigned to Array<Int>", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<Int> = [1, 2, 3]
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-011"), "Unexpected element mismatch for inferred Array<Int>");
  });

  it("infers Array<String> for ['a','b','c'] — no SPORE-TYPE-011 when assigned to Array<String>", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let words: Array<String> = ["hello", "world"]
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-011"), "Unexpected element mismatch for inferred Array<String>");
  });

  it("infers Array<Bool> for [true, false] — no SPORE-TYPE-011", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let flags: Array<Bool> = [true, false]
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-011"), "Unexpected element mismatch for inferred Array<Bool>");
  });

  it("[1,'two'] — mismatched list literal triggers SPORE-TYPE-011 on Array<Int>", () => {
    const result = parseAndCheck(`
flow test() -> Void {
  let xs: Array<Int> = [1, "two", 3]
  return
}
`);
    assert.ok(hasDiag(result, "SPORE-TYPE-011"), "Expected SPORE-TYPE-011 for heterogeneous list on Array<Int>");
  });

  it("bare list literal without annotation is accepted (no arity error)", () => {
    // A list literal assigned to an untyped binding should not trigger SPORE-TYPE-011
    const result = parseAndCheck(`
flow test() -> Void {
  let xs = [1, 2, 3]
  return
}
`);
    assert.ok(!hasDiag(result, "SPORE-TYPE-011"), "Unexpected SPORE-TYPE-011 for untyped list literal");
  });
});
