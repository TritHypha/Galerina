import assert from "node:assert/strict";
import { test } from "node:test";

import { checkTypes, executeFlow, parseProgram, resolveSymbols } from "../dist/index.js";

const source = `
  flow id(x: UInt64) -> UInt64 { return x }
  flow caller(xs: Array<UInt64>) -> Int {
    let ignored = id(id(xs.first().unwrapOr(0)))
    return 7
  }
`;

function parseCheckedSource() {
  const parsed = parseProgram(source, "interpreter-refusal-propagation.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0, "fixture must parse");
  resolveSymbols(parsed.ast);
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0,
    "fixture must typecheck");
  return parsed;
}

test("two nested UInt64 conversions preserve malformed-host refusal instead of discarding it", async () => {
  const parsed = parseCheckedSource();
  const refused = await executeFlow("caller", new Map([[
    "xs", { __tag: "list", items: [{ __tag: "uint64", value: "bad" }] },
  ]]), parsed.ast);

  assert.equal(refused.value.__tag, "runtimeError", "invalid nested wide input must refuse the caller");
  assert.equal(refused.audit.result, "error", "a refused nested conversion must not audit caller success");
  assert.equal(Object.isFrozen(refused.value), true, "a refusal carrying internal provenance must not be mutable by its host receiver");
  assert.throws(() => { refused.value.__tag = "int"; }, TypeError);
});

test("two nested UInt64 conversions retain valid input behavior", async () => {
  const parsed = parseCheckedSource();
  const valid = await executeFlow("caller", new Map([[
    "xs", { __tag: "list", items: [{ __tag: "uint64", value: 9n }] },
  ]]), parsed.ast);

  assert.deepEqual(valid.value, { __tag: "int", value: 7 });
  assert.equal(valid.audit.result, "ok");
});

test("Some cannot turn a nested UInt64 refusal into successful option data", async () => {
  const parsed = parseProgram(`
    flow id(x: UInt64) -> UInt64 { return x }
    flow caller(xs: Array<UInt64>) -> Int {
      let ignored = Some(id(id(xs.first().unwrapOr(0))))
      return 7
    }
  `, "some-refusal-propagation.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
  resolveSymbols(parsed.ast);
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0);
  const refused = await executeFlow("caller", new Map([[
    "xs", { __tag: "list", items: [{ __tag: "uint64", value: "bad" }] },
  ]]), parsed.ast);

  assert.equal(refused.value.__tag, "runtimeError");
  assert.equal(refused.audit.result, "error");
  const valid = await executeFlow("caller", new Map([[
    "xs", { __tag: "list", items: [{ __tag: "uint64", value: 9n }] },
  ]]), parsed.ast);
  assert.deepEqual(valid.value, { __tag: "int", value: 7 });
  assert.equal(valid.audit.result, "ok");
});

test("assignment into an Int binding cannot discard a nested UInt64 refusal", async () => {
  const parsed = parseProgram(`
    flow id(x: UInt64) -> UInt64 { return x }
    flow caller(xs: Array<UInt64>) -> Int {
      mut ignored: Int = 0
      ignored = id(id(xs.first().unwrapOr(0)))
      return 7
    }
  `, "assignment-refusal-propagation.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
  resolveSymbols(parsed.ast);
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0);
  const refused = await executeFlow("caller", new Map([[
    "xs", { __tag: "list", items: [{ __tag: "uint64", value: "bad" }] },
  ]]), parsed.ast);

  assert.equal(refused.value.__tag, "runtimeError");
  assert.equal(refused.audit.result, "error");
  const valid = await executeFlow("caller", new Map([[
    "xs", { __tag: "list", items: [{ __tag: "uint64", value: 9n }] },
  ]]), parsed.ast);
  assert.deepEqual(valid.value, { __tag: "int", value: 7 });
  assert.equal(valid.audit.result, "ok");
});

test("while cannot treat a nested UInt64 refusal as a false condition", async () => {
  const parsed = parseProgram(`
    flow id(x: UInt64) -> UInt64 { return x }
    flow caller(xs: Array<UInt64>) -> Int {
      while id(id(xs.first().unwrapOr(0))) > 0 { return 1 }
      return 7
    }
  `, "while-refusal-propagation.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
  resolveSymbols(parsed.ast);
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0);
  const refused = await executeFlow("caller", new Map([[
    "xs", { __tag: "list", items: [{ __tag: "uint64", value: "bad" }] },
  ]]), parsed.ast);

  assert.equal(refused.value.__tag, "runtimeError");
  assert.equal(refused.audit.result, "error");
  const valid = await executeFlow("caller", new Map([[
    "xs", { __tag: "list", items: [{ __tag: "uint64", value: 9n }] },
  ]]), parsed.ast);
  assert.deepEqual(valid.value, { __tag: "int", value: 1 });
  assert.equal(valid.audit.result, "ok");
});

test("wide refusal provenance survives an ordinary flow-result boundary", async () => {
  const parsed = parseProgram(`
    flow id(x: UInt64) -> UInt64 { return x }
    flow relay(xs: Array<UInt64>) -> Int {
      let ignored = id(id(xs.first().unwrapOr(0)))
      return 7
    }
    flow caller(xs: Array<UInt64>) -> Int {
      let ignored = relay(xs)
      return 9
    }
  `, "nested-flow-refusal-propagation.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
  resolveSymbols(parsed.ast);
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0);
  const refused = await executeFlow("caller", new Map([[
    "xs", { __tag: "list", items: [{ __tag: "uint64", value: "bad" }] },
  ]]), parsed.ast);
  assert.equal(refused.value.__tag, "runtimeError");
  assert.equal(refused.audit.result, "error");

  const valid = await executeFlow("caller", new Map([[
    "xs", { __tag: "list", items: [{ __tag: "uint64", value: 9n }] },
  ]]), parsed.ast);
  assert.deepEqual(valid.value, { __tag: "int", value: 9 });
  assert.equal(valid.audit.result, "ok");
});

test("a wide refusal inside a returned list cannot become successful list data", async () => {
  const parsed = parseProgram(`
    flow id(x: UInt64) -> UInt64 { return x }
    flow escape(xs: Array<UInt64>) -> Array<UInt64> {
      return [id(id(xs.first().unwrapOr(0)))]
    }
  `, "list-refusal-propagation.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
  resolveSymbols(parsed.ast);
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0);
  const refused = await executeFlow("escape", new Map([[
    "xs", { __tag: "list", items: [{ __tag: "uint64", value: "bad" }] },
  ]]), parsed.ast);
  assert.equal(refused.value.__tag, "runtimeError");
  assert.equal(refused.audit.result, "error");

  const valid = await executeFlow("escape", new Map([[
    "xs", { __tag: "list", items: [{ __tag: "uint64", value: 9n }] },
  ]]), parsed.ast);
  assert.deepEqual(valid.value, { __tag: "list", items: [{ __tag: "uint64", value: 9n }] });
  assert.equal(valid.audit.result, "ok");
});

test("binary arithmetic cannot turn a single-level UInt64 refusal into success", async () => {
  const parsed = parseProgram(`
    flow id(x: UInt64) -> UInt64 { return x }
    flow caller(xs: Array<UInt64>) -> Int {
      let ignored = id(xs.first().unwrapOr(0)) + 1
      return 7
    }
  `, "binary-refusal-propagation.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
  resolveSymbols(parsed.ast);
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0);
  const refused = await executeFlow("caller", new Map([[
    "xs", { __tag: "list", items: [{ __tag: "uint64", value: "bad" }] },
  ]]), parsed.ast);
  assert.equal(refused.value.__tag, "runtimeError");
  assert.equal(refused.audit.result, "error");

  const valid = await executeFlow("caller", new Map([[
    "xs", { __tag: "list", items: [{ __tag: "uint64", value: 9n }] },
  ]]), parsed.ast);
  assert.deepEqual(valid.value, { __tag: "int", value: 7 });
  assert.equal(valid.audit.result, "ok");
});

test("record construction cannot turn a nested UInt64 refusal into successful record data", async () => {
  const parsed = parseProgram(`
    record Box { n: UInt64 }
    flow id(x: UInt64) -> UInt64 { return x }
    flow caller(xs: Array<UInt64>) -> Box {
      return Box { n: id(id(xs.first().unwrapOr(0))) }
    }
  `, "record-refusal-propagation.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
  resolveSymbols(parsed.ast);
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0);
  const refused = await executeFlow("caller", new Map([["xs", {
    __tag: "list", items: [{ __tag: "uint64", value: "bad" }],
  }]]), parsed.ast);
  assert.equal(refused.value.__tag, "runtimeError");
  assert.equal(refused.audit.result, "error");

  const valid = await executeFlow("caller", new Map([["xs", {
    __tag: "list", items: [{ __tag: "uint64", value: 9n }],
  }]]), parsed.ast);
  assert.equal(valid.value.__tag, "record");
  assert.equal(valid.value.fields.get("n").value, 9n);
  assert.equal(valid.audit.result, "ok");
});

test("field access cannot discard a refusal returned by a record-producing flow", async () => {
  const parsed = parseProgram(`
    record Box { n: UInt64 }
    flow id(x: UInt64) -> UInt64 { return x }
    flow make(xs: Array<UInt64>) -> Box {
      return Box { n: id(id(xs.first().unwrapOr(0))) }
    }
    flow caller(xs: Array<UInt64>) -> Int {
      let ignored = make(xs).n
      return 7
    }
  `, "record-member-refusal-propagation.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
  resolveSymbols(parsed.ast);
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0);
  const refused = await executeFlow("caller", new Map([["xs", {
    __tag: "list", items: [{ __tag: "uint64", value: "bad" }],
  }]]), parsed.ast);
  assert.equal(refused.value.__tag, "runtimeError");
  assert.equal(refused.audit.result, "error");

  const valid = await executeFlow("caller", new Map([["xs", {
    __tag: "list", items: [{ __tag: "uint64", value: 9n }],
  }]]), parsed.ast);
  assert.deepEqual(valid.value, { __tag: "int", value: 7 });
  assert.equal(valid.audit.result, "ok");
});

test("a refused method receiver prevents later argument effects", async () => {
  const parsed = parseProgram(`
    flow id(x: UInt64) -> UInt64 { return x }
    flow caller(xs: Array<UInt64>) -> Int {
      fn tick() -> Int { print("tick") return 1 }
      let ignored = Some(id(id(xs.first().unwrapOr(0)))).unwrapOr(tick())
      return 7
    }
  `, "method-receiver-refusal-ordering.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
  const symbols = resolveSymbols(parsed.ast, ["print"]);
  assert.deepEqual(symbols.diagnostics, [], "the effect fixture must pass symbol resolution");
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0);
  const output = [];
  const refused = await executeFlow("caller", new Map([["xs", {
    __tag: "list", items: [{ __tag: "uint64", value: "bad" }],
  }]]), parsed.ast, undefined, undefined, undefined, { outputSink: line => output.push(line) });
  assert.equal(refused.value.__tag, "runtimeError");
  assert.equal(refused.audit.result, "error");
  assert.deepEqual(output, [], "the later method argument's output effect must not execute");

  const validOutput = [];
  const valid = await executeFlow("caller", new Map([["xs", {
    __tag: "list", items: [{ __tag: "uint64", value: 9n }],
  }]]), parsed.ast, undefined, undefined, undefined, { outputSink: line => validOutput.push(line) });
  assert.deepEqual(valid.value, { __tag: "int", value: 7 });
  assert.equal(valid.audit.result, "ok");
  assert.deepEqual(validOutput, ["tick"], "ordinary method arguments retain eager call-by-value evaluation");
});

test("record-update cannot turn a nested UInt64 refusal into successful record data", async () => {
  const parsed = parseProgram(`
    flow id(x: UInt64) -> UInt64 { return x }
    flow caller(xs: Array<UInt64>) -> Int {
      let base = { n: 1 }
      let updated = { ...base, n: id(id(xs.first().unwrapOr(0))) }
      return 7
    }
  `, "record-update-refusal-propagation.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
  resolveSymbols(parsed.ast);
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0);
  const refused = await executeFlow("caller", new Map([["xs", {
    __tag: "list", items: [{ __tag: "uint64", value: "bad" }],
  }]]), parsed.ast);
  assert.equal(refused.value.__tag, "runtimeError");
  assert.equal(refused.audit.result, "error");

  const valid = await executeFlow("caller", new Map([["xs", {
    __tag: "list", items: [{ __tag: "uint64", value: 9n }],
  }]]), parsed.ast);
  assert.deepEqual(valid.value, { __tag: "int", value: 7 });
  assert.equal(valid.audit.result, "ok");
});

test("foreach cannot treat a refused collection expression as an empty collection", async () => {
  const parsed = parseProgram(`
    flow id(x: UInt64) -> UInt64 { return x }
    flow caller(xs: Array<UInt64>) -> Int {
      for item in [id(id(xs.first().unwrapOr(0)))] { return 1 }
      return 7
    }
  `, "foreach-collection-refusal-propagation.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
  resolveSymbols(parsed.ast);
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0);
  const refused = await executeFlow("caller", new Map([["xs", {
    __tag: "list", items: [{ __tag: "uint64", value: "bad" }],
  }]]), parsed.ast);
  assert.equal(refused.value.__tag, "runtimeError");
  assert.equal(refused.audit.result, "error");

  const valid = await executeFlow("caller", new Map([["xs", {
    __tag: "list", items: [{ __tag: "uint64", value: 9n }],
  }]]), parsed.ast);
  assert.deepEqual(valid.value, { __tag: "int", value: 1 });
  assert.equal(valid.audit.result, "ok");
});

test("foreach cannot treat a refused where guard as false", async () => {
  const parsed = parseProgram(`
    flow id(x: UInt64) -> UInt64 { return x }
    flow caller(xs: Array<UInt64>) -> Int {
      for item in [1] where id(id(xs.first().unwrapOr(0))) > 0 { return 1 }
      return 7
    }
  `, "foreach-where-refusal-propagation.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
  resolveSymbols(parsed.ast);
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0);
  const refused = await executeFlow("caller", new Map([["xs", {
    __tag: "list", items: [{ __tag: "uint64", value: "bad" }],
  }]]), parsed.ast);
  assert.equal(refused.value.__tag, "runtimeError");
  assert.equal(refused.audit.result, "error");

  const valid = await executeFlow("caller", new Map([["xs", {
    __tag: "list", items: [{ __tag: "uint64", value: 9n }],
  }]]), parsed.ast);
  assert.deepEqual(valid.value, { __tag: "int", value: 1 });
  assert.equal(valid.audit.result, "ok");
});

test("a refusal entering a Bool parameter prevents later call arguments from evaluating", async () => {
  const parsed = parseProgram(`
    flow id(x: UInt64) -> UInt64 { return x }
    flow ignore(x: Bool, later: Int) -> Int { return 1 }
    flow caller(xs: Array<UInt64>) -> Int {
      mut counter: Int = 0
      fn tick() -> Int { counter = counter + 1 return 1 }
      let ignored = ignore(id(id(xs.first().unwrapOr(0))) > 0, tick())
      return counter
    }
  `, "bool-call-refusal-ordering.fungi");
  assert.equal(parsed.diagnostics.filter((d) => d.severity === "error").length, 0);
  resolveSymbols(parsed.ast);
  assert.equal(checkTypes(parsed.ast).diagnostics.filter((d) => d.severity === "error").length, 0);
  const refused = await executeFlow("caller", new Map([["xs", {
    __tag: "list", items: [{ __tag: "uint64", value: "bad" }],
  }]]), parsed.ast);
  assert.equal(refused.value.__tag, "runtimeError");
  assert.equal(refused.audit.result, "error");

  const valid = await executeFlow("caller", new Map([["xs", {
    __tag: "list", items: [{ __tag: "uint64", value: 9n }],
  }]]), parsed.ast);
  assert.deepEqual(valid.value, { __tag: "int", value: 1 });
  assert.equal(valid.audit.result, "ok");
});
