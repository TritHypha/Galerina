import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SPORE_NONE, SPORE_VOID, callStdlib } from "../dist/index.js";

function ctx() {
  return {
    recordEffect: () => {},
    resolveIdentifier: () => undefined,
    callFlow: async () => SPORE_VOID,
    applyFn: async (_fn, arg) => arg,
  };
}

describe("Stdlib - Option", () => {
  it("None.isSome() -> false", async () => {
    const r = await callStdlib("isSome", SPORE_NONE, [], ctx());
    assert.equal(r?.__tag, "bool");
    assert.equal(r?.value, false);
  });
  it("Some(x).isSome() -> true", async () => {
    const r = await callStdlib("isSome", { __tag: "some", value: { __tag: "string", value: "x" } }, [], ctx());
    assert.equal(r?.__tag, "bool");
    assert.equal(r?.value, true);
  });
  it("None.unwrapOr(default) -> default", async () => {
    const r = await callStdlib("unwrapOr", SPORE_NONE, [{ __tag: "string", value: "default" }], ctx());
    assert.equal(r?.__tag, "string");
    assert.equal(r?.value, "default");
  });
  it("Some(value).unwrapOr(default) -> value", async () => {
    const r = await callStdlib("unwrapOr", { __tag: "some", value: { __tag: "string", value: "value" } }, [{ __tag: "string", value: "default" }], ctx());
    assert.equal(r?.__tag, "string");
    assert.equal(r?.value, "value");
  });
  it("Some(x).isNone() -> false", async () => {
    const r = await callStdlib("isNone", { __tag: "some", value: { __tag: "string", value: "x" } }, [], ctx());
    assert.equal(r?.__tag, "bool");
    assert.equal(r?.value, false);
  });
});

describe("Stdlib - Result", () => {
  it("Ok(v).isOk() -> true", async () => {
    const r = await callStdlib("isOk", { __tag: "ok", value: { __tag: "string", value: "v" } }, [], ctx());
    assert.equal(r?.__tag, "bool");
    assert.equal(r?.value, true);
  });
  it("Err(e).isErr() -> true", async () => {
    const r = await callStdlib("isErr", { __tag: "err", error: { __tag: "string", value: "e" } }, [], ctx());
    assert.equal(r?.__tag, "bool");
    assert.equal(r?.value, true);
  });
  it("Err(e).unwrapOr(default) -> default", async () => {
    const r = await callStdlib("unwrapOr", { __tag: "err", error: { __tag: "string", value: "e" } }, [{ __tag: "string", value: "default" }], ctx());
    assert.equal(r?.__tag, "string");
    assert.equal(r?.value, "default");
  });
  it("Ok(v).unwrapOr(default) -> v", async () => {
    const r = await callStdlib("unwrapOr", { __tag: "ok", value: { __tag: "string", value: "v" } }, [{ __tag: "string", value: "default" }], ctx());
    assert.equal(r?.__tag, "string");
    assert.equal(r?.value, "v");
  });
});

describe("Stdlib - String", () => {
  const s = { __tag: "string", value: "hello" };
  it("toUpper", async () => assert.equal((await callStdlib("toUpper", s, [], ctx()))?.value, "HELLO"));
  it("trim", async () => assert.equal((await callStdlib("trim", { __tag: "string", value: " hi " }, [], ctx()))?.value, "hi"));
  it("startsWith", async () => assert.equal((await callStdlib("startsWith", s, [{ __tag: "string", value: "hel" }], ctx()))?.value, true));
  it("contains", async () => assert.equal((await callStdlib("contains", s, [{ __tag: "string", value: "ell" }], ctx()))?.value, true));
  it("split length", async () => {
    const split = await callStdlib("split", { __tag: "string", value: "a,b,c" }, [{ __tag: "string", value: "," }], ctx());
    const len = await callStdlib("length", split, [], ctx());
    assert.equal(len?.value, 3);
  });
  it("length", async () => assert.equal((await callStdlib("length", s, [], ctx()))?.value, 5));
  it("replace", async () => assert.equal((await callStdlib("replace", { __tag: "string", value: "hello world" }, [{ __tag: "string", value: "world" }, { __tag: "string", value: "Galerina" }], ctx()))?.value, "hello Galerina"));
  it("toLower", async () => assert.equal((await callStdlib("toLower", { __tag: "string", value: "HI" }, [], ctx()))?.value, "hi"));
});

describe("Stdlib - Array", () => {
  const list = { __tag: "list", items: [{ __tag: "int", value: 1 }, { __tag: "int", value: 2 }, { __tag: "int", value: 3 }] };
  it("length", async () => assert.equal((await callStdlib("length", list, [], ctx()))?.value, 3));
  it("isEmpty", async () => assert.equal((await callStdlib("isEmpty", { __tag: "list", items: [] }, [], ctx()))?.value, true));
  it("first", async () => assert.equal((await callStdlib("first", list, [], ctx()))?.__tag, "some"));
  it("last", async () => assert.equal((await callStdlib("last", list, [], ctx()))?.__tag, "some"));
  it("empty first is None", async () => assert.equal((await callStdlib("first", { __tag: "list", items: [] }, [], ctx()))?.__tag, "none"));
  it("contains", async () => assert.equal((await callStdlib("contains", list, [{ __tag: "int", value: 2 }], ctx()))?.value, true));
});

describe("Stdlib - Map", () => {
  const map = { __tag: "record", fields: new Map([["key", { __tag: "string", value: "val" }]]) };
  it("size", async () => assert.equal((await callStdlib("size", { __tag: "record", fields: new Map() }, [], ctx()))?.value, 0));
  it("has", async () => assert.equal((await callStdlib("has", map, [{ __tag: "string", value: "key" }], ctx()))?.value, true));
  it("get", async () => assert.equal((await callStdlib("get", map, [{ __tag: "string", value: "key" }], ctx()))?.__tag, "some"));
});

describe("Stdlib - Numeric", () => {
  it("Int.parse success", async () => {
    const r = await callStdlib("Int.parse", undefined, [{ __tag: "string", value: "42" }], ctx());
    assert.equal(r?.__tag, "ok");
    assert.equal(r?.value.__tag, "int");
    assert.equal(r?.value.value, 42);
  });
  it("Int.parse invalid", async () => assert.equal((await callStdlib("Int.parse", undefined, [{ __tag: "string", value: "abc" }], ctx()))?.__tag, "err"));
  it("Math.abs", async () => assert.equal((await callStdlib("Math.abs", undefined, [{ __tag: "int", value: -5 }], ctx()))?.value, 5));
  it("Math.min", async () => assert.equal((await callStdlib("Math.min", undefined, [{ __tag: "int", value: 3 }, { __tag: "int", value: 7 }], ctx()))?.value, 3));
});

describe("Stdlib - Serialization", () => {
  it("json.decode valid", async () => {
    const r = await callStdlib("json.decode", undefined, [{ __tag: "string", value: "{\"a\":1}" }], ctx());
    assert.equal(r?.__tag, "ok");
    assert.equal(r?.value.__tag, "record");
  });
  it("json.decode invalid", async () => assert.equal((await callStdlib("json.decode", undefined, [{ __tag: "string", value: "invalid" }], ctx()))?.__tag, "err"));
  it("json.encode", async () => {
    const r = await callStdlib("json.encode", undefined, [{ __tag: "record", fields: new Map([["name", { __tag: "string", value: "test" }]]) }], ctx());
    assert.equal(r?.__tag, "string");
    assert.ok(r?.value.includes("name"));
  });
});

describe("Stdlib - Gates", () => {
  it("validate.email valid", async () => {
    const r = await callStdlib("validate.email", undefined, [{ __tag: "string", value: "user@example.com" }], ctx());
    assert.equal(r?.__tag, "ok");
    assert.equal(r?.value.__tag, "protected");
  });
  it("validate.email invalid", async () => assert.equal((await callStdlib("validate.email", undefined, [{ __tag: "string", value: "notanemail" }], ctx()))?.__tag, "err"));
  it("redact", async () => {
    const p = { __tag: "protected", baseType: "Email", value: { __tag: "string", value: "x@example.com" } };
    const r = await callStdlib("redact", undefined, [p], ctx());
    assert.equal(r?.__tag, "redacted");
    assert.equal(r?.baseType, "Email");
  });
});

describe("Stdlib - format", () => {
  it("format hello (positional)", async () => assert.equal((await callStdlib("format", undefined, [{ __tag: "string", value: "hello {}" }, { __tag: "string", value: "world" }], ctx()))?.value, "hello world"));
  it("format multiple positional", async () => assert.equal((await callStdlib("format", undefined, [{ __tag: "string", value: "{} + {} = {}" }, { __tag: "int", value: 1 }, { __tag: "int", value: 2 }, { __tag: "int", value: 3 }], ctx()))?.value, "1 + 2 = 3"));
});

// ── Phase 9A-3: String.format named interpolation ────────────────────────────

describe("Stdlib - String.format named interpolation (Phase 9A-3)", () => {
  it("named single field", async () => {
    const receiver = { __tag: "string", value: "Hello {name}!" };
    const record = { __tag: "record", fields: new Map([["name", { __tag: "string", value: "Alice" }]]) };
    const r = await callStdlib("format", receiver, [record], ctx());
    assert.equal(r?.__tag, "string");
    assert.equal(r?.value, "Hello Alice!");
  });

  it("named multiple fields", async () => {
    const receiver = { __tag: "string", value: "{greeting}, {name}! You have {count} messages." };
    const record = { __tag: "record", fields: new Map([
      ["greeting", { __tag: "string", value: "Hi" }],
      ["name",     { __tag: "string", value: "Bob" }],
      ["count",    { __tag: "int",    value: 3      }],
    ]) };
    const r = await callStdlib("format", receiver, [record], ctx());
    assert.equal(r?.value, "Hi, Bob! You have 3 messages.");
  });

  it("positional {} still works on string receiver", async () => {
    const receiver = { __tag: "string", value: "Hello {}!" };
    const r = await callStdlib("format", receiver, [{ __tag: "string", value: "World" }], ctx());
    assert.equal(r?.value, "Hello World!");
  });
});

// ── Phase 9A-3: Timestamp.format ─────────────────────────────────────────────

describe("Stdlib - Timestamp.format (Phase 9A-3)", () => {
  const makeTimestampVal = (ms) => ({
    __tag: "record",
    fields: new Map([
      ["__isTimestamp", { __tag: "bool",  value: true }],
      ["__ms",          { __tag: "int",   value: ms   }],
    ]),
  });

  it("formats YYYY-MM-DD", async () => {
    // 2024-03-15 UTC = 1710460800000 ms
    const ts = makeTimestampVal(1710460800000);
    const r = await callStdlib("format", ts, [{ __tag: "string", value: "YYYY-MM-DD" }], ctx());
    assert.equal(r?.__tag, "string");
    assert.equal(r?.value, "2024-03-15");
  });

  it("formats YYYY-MM-DD HH:mm:ss", async () => {
    // 2024-01-01 12:30:00 UTC
    // = 1704067200000 (Jan 1 00:00 UTC) + (12*3600 + 30*60)*1000
    // = 1704067200000 + 45000000 = 1704112200000
    const ts = makeTimestampVal(1704112200000);
    const r = await callStdlib("format", ts, [{ __tag: "string", value: "YYYY-MM-DD HH:mm:ss" }], ctx());
    assert.equal(r?.__tag, "string");
    assert.equal(r?.value, "2024-01-01 12:30:00");
  });
});

// ── New: Array extended methods ───────────────────────────────────────────────

describe("Stdlib - Array.chunk", () => {
  it("chunk([1,2,3,4,5], 2) -> 3 sub-arrays", async () => {
    const list = { __tag: "list", items: [1,2,3,4,5].map(v => ({ __tag: "int", value: v })) };
    const r = await callStdlib("chunk", list, [{ __tag: "int", value: 2 }], ctx());
    assert.equal(r?.__tag, "list");
    assert.equal(r?.items.length, 3);
    assert.equal(r?.items[0]?.__tag, "list");
    assert.equal(r?.items[0]?.items.length, 2);
    assert.equal(r?.items[2]?.items.length, 1); // last chunk has 1 element
  });
});

describe("Stdlib - Array.flatten", () => {
  it("flatten([[1,2],[3,4]]) -> [1,2,3,4]", async () => {
    const inner1 = { __tag: "list", items: [{ __tag: "int", value: 1 }, { __tag: "int", value: 2 }] };
    const inner2 = { __tag: "list", items: [{ __tag: "int", value: 3 }, { __tag: "int", value: 4 }] };
    const outer = { __tag: "list", items: [inner1, inner2] };
    const r = await callStdlib("flatten", outer, [], ctx());
    assert.equal(r?.__tag, "list");
    assert.equal(r?.items.length, 4);
    assert.equal(r?.items[0]?.value, 1);
    assert.equal(r?.items[3]?.value, 4);
  });
});

describe("Stdlib - Array.average", () => {
  it("average([1,2,3]) -> 2.0", async () => {
    const list = { __tag: "list", items: [1,2,3].map(v => ({ __tag: "int", value: v })) };
    const r = await callStdlib("average", list, [], ctx());
    assert.equal(r?.__tag, "float");
    assert.equal(r?.value, 2);
  });
});

describe("Stdlib - Array.median", () => {
  it("median([1,2,3,4,5]) -> 3 (odd length)", async () => {
    const list = { __tag: "list", items: [1,2,3,4,5].map(v => ({ __tag: "int", value: v })) };
    const r = await callStdlib("median", list, [], ctx());
    assert.equal(r?.value, 3);
  });
  it("median([1,2,3,4]) -> 2.5 (even length)", async () => {
    const list = { __tag: "list", items: [1,2,3,4].map(v => ({ __tag: "int", value: v })) };
    const r = await callStdlib("median", list, [], ctx());
    assert.equal(r?.__tag, "float");
    assert.equal(r?.value, 2.5);
  });
});

describe("Stdlib - Array.partition", () => {
  it("partition returns [passing, failing]", async () => {
    const list = { __tag: "list", items: [1,2,3,4].map(v => ({ __tag: "int", value: v })) };
    // predicate: item > 2
    const predFn = {
      __tag: "function",
      name: "gt2",
      params: [],
      body: null,
      closure: null,
      applyFn: async (_fn, arg) => ({ __tag: "bool", value: arg.value > 2 }),
    };
    const mockCtx = {
      recordEffect: () => {},
      resolveIdentifier: () => undefined,
      callFlow: async () => SPORE_VOID,
      applyFn: async (_fn, arg) => ({ __tag: "bool", value: arg.value > 2 }),
    };
    const r = await callStdlib("partition", list, [predFn], mockCtx);
    assert.equal(r?.__tag, "list");
    assert.equal(r?.items.length, 2);
    assert.equal(r?.items[0]?.__tag, "list"); // passing
    assert.equal(r?.items[0]?.items.length, 2); // 3 and 4
    assert.equal(r?.items[1]?.items.length, 2); // 1 and 2
  });
});

describe("Stdlib - Array.tally", () => {
  it("tally counts occurrences", async () => {
    const list = { __tag: "list", items: ["a","b","a","c","b","a"].map(v => ({ __tag: "string", value: v })) };
    const r = await callStdlib("tally", list, [], ctx());
    assert.equal(r?.__tag, "record");
    assert.equal(r?.fields.get("a")?.__tag, "int");
    assert.equal(r?.fields.get("a")?.value, 3);
    assert.equal(r?.fields.get("b")?.value, 2);
    assert.equal(r?.fields.get("c")?.value, 1);
  });
});

// ── New: Statistics module ────────────────────────────────────────────────────

describe("Stdlib - Statistics.mean", () => {
  it("Statistics.mean([1,2,3,4,5]) -> 3.0", async () => {
    const list = { __tag: "list", items: [1,2,3,4,5].map(v => ({ __tag: "int", value: v })) };
    const r = await callStdlib("Statistics.mean", undefined, [list], ctx());
    assert.equal(r?.__tag, "float");
    assert.equal(r?.value, 3);
  });
});

describe("Stdlib - Statistics.median", () => {
  it("Statistics.median([1,2,3,4,5]) -> 3", async () => {
    const list = { __tag: "list", items: [1,2,3,4,5].map(v => ({ __tag: "int", value: v })) };
    const r = await callStdlib("Statistics.median", undefined, [list], ctx());
    assert.equal(r?.value, 3);
  });
  it("Statistics.median([2,4]) -> 3.0", async () => {
    const list = { __tag: "list", items: [2,4].map(v => ({ __tag: "int", value: v })) };
    const r = await callStdlib("Statistics.median", undefined, [list], ctx());
    assert.equal(r?.__tag, "float");
    assert.equal(r?.value, 3);
  });
});

describe("Stdlib - Statistics.stddev", () => {
  it("stddev([2,4,4,4,5,5,7,9]) population stddev is 2", async () => {
    const list = { __tag: "list", items: [2,4,4,4,5,5,7,9].map(v => ({ __tag: "int", value: v })) };
    const r = await callStdlib("Statistics.stddev", undefined, [list], ctx());
    assert.equal(r?.__tag, "float");
    assert.ok(Math.abs(r?.value - 2) < 0.001, `Expected ~2, got ${r?.value}`);
  });
});

describe("Stdlib - Statistics.sum", () => {
  it("Statistics.sum([1,2,3]) -> 6", async () => {
    const list = { __tag: "list", items: [1,2,3].map(v => ({ __tag: "int", value: v })) };
    const r = await callStdlib("Statistics.sum", undefined, [list], ctx());
    assert.equal(r?.__tag, "int");
    assert.equal(r?.value, 6);
  });
});

// ── New: String regex methods ─────────────────────────────────────────────────

describe("Stdlib - String.matchesPattern", () => {
  it('matchesPattern("hello", "hel.*") -> true', async () => {
    const r = await callStdlib("matchesPattern", { __tag: "string", value: "hello" }, [{ __tag: "string", value: "hel.*" }], ctx());
    assert.equal(r?.__tag, "bool");
    assert.equal(r?.value, true);
  });
  it('matchesPattern("world", "^hel") -> false', async () => {
    const r = await callStdlib("matchesPattern", { __tag: "string", value: "world" }, [{ __tag: "string", value: "^hel" }], ctx());
    assert.equal(r?.value, false);
  });
  it("invalid pattern returns err", async () => {
    const r = await callStdlib("matchesPattern", { __tag: "string", value: "hello" }, [{ __tag: "string", value: "[invalid" }], ctx());
    assert.equal(r?.__tag, "err");
  });
});

describe("Stdlib - String.extractGroups", () => {
  it("extracts capture groups", async () => {
    const r = await callStdlib("extractGroups", { __tag: "string", value: "2024-03-15" }, [{ __tag: "string", value: "(\\d{4})-(\\d{2})-(\\d{2})" }], ctx());
    assert.equal(r?.__tag, "list");
    assert.equal(r?.items.length, 3);
    assert.equal(r?.items[0]?.value, "2024");
    assert.equal(r?.items[1]?.value, "03");
  });
  it("returns empty list when no match", async () => {
    const r = await callStdlib("extractGroups", { __tag: "string", value: "hello" }, [{ __tag: "string", value: "(\\d+)" }], ctx());
    assert.equal(r?.__tag, "list");
    assert.equal(r?.items.length, 0);
  });
});

describe("Stdlib - String.replacePattern", () => {
  it("replaces all matches", async () => {
    const r = await callStdlib("replacePattern", { __tag: "string", value: "hello world hello" }, [{ __tag: "string", value: "hello" }, { __tag: "string", value: "hi" }], ctx());
    assert.equal(r?.__tag, "string");
    assert.equal(r?.value, "hi world hi");
  });
});

// ── New: Map improvements ─────────────────────────────────────────────────────

describe("Stdlib - Map.filter", () => {
  it("filter keeps only matching entries", async () => {
    const map = {
      __tag: "record",
      fields: new Map([
        ["a", { __tag: "int", value: 1 }],
        ["b", { __tag: "int", value: 2 }],
        ["c", { __tag: "int", value: 3 }],
      ]),
    };
    // predicate: entry.value > 1
    const mockCtx = {
      recordEffect: () => {},
      resolveIdentifier: () => undefined,
      callFlow: async () => SPORE_VOID,
      applyFn: async (_fn, entry) => {
        const v = entry.fields?.get("value");
        return { __tag: "bool", value: v?.value > 1 };
      },
    };
    const predFn = { __tag: "function", name: "pred" };
    const r = await callStdlib("filter", map, [predFn], mockCtx);
    assert.equal(r?.__tag, "record");
    assert.equal(r?.fields.has("a"), false);
    assert.equal(r?.fields.has("b"), true);
    assert.equal(r?.fields.has("c"), true);
  });
});

describe("Stdlib - Map.mapValues", () => {
  it("transforms values, keeps keys", async () => {
    const map = {
      __tag: "record",
      fields: new Map([
        ["x", { __tag: "int", value: 10 }],
        ["y", { __tag: "int", value: 20 }],
      ]),
    };
    // transform: v * 2
    const mockCtx = {
      recordEffect: () => {},
      resolveIdentifier: () => undefined,
      callFlow: async () => SPORE_VOID,
      applyFn: async (_fn, v) => ({ __tag: "int", value: v.value * 2 }),
    };
    const transFn = { __tag: "function", name: "double" };
    const r = await callStdlib("mapValues", map, [transFn], mockCtx);
    assert.equal(r?.__tag, "record");
    assert.equal(r?.fields.get("x")?.value, 20);
    assert.equal(r?.fields.get("y")?.value, 40);
  });
});

describe("Stdlib - Map.toList", () => {
  it("converts map to list of {key, value} records", async () => {
    const map = {
      __tag: "record",
      fields: new Map([
        ["foo", { __tag: "string", value: "bar" }],
      ]),
    };
    const r = await callStdlib("toList", map, [], ctx());
    assert.equal(r?.__tag, "list");
    assert.equal(r?.items.length, 1);
    assert.equal(r?.items[0]?.__tag, "record");
    assert.equal(r?.items[0]?.fields.get("key")?.value, "foo");
    assert.equal(r?.items[0]?.fields.get("value")?.value, "bar");
  });
});

describe("Stdlib - Map.fromList", () => {
  it("creates Map from Array<{key, value}> records", async () => {
    const entry = {
      __tag: "record",
      fields: new Map([
        ["key", { __tag: "string", value: "name" }],
        ["value", { __tag: "string", value: "Galerina" }],
      ]),
    };
    const list = { __tag: "list", items: [entry] };
    const r = await callStdlib("Map.fromList", undefined, [list], ctx());
    assert.equal(r?.__tag, "record");
    assert.equal(r?.fields.get("name")?.__tag, "string");
    assert.equal(r?.fields.get("name")?.value, "Galerina");
  });
});

// ── Phase 9A-3: BigInt decimal arithmetic precision ───────────────────────────

describe("Stdlib - BigInt decimal arithmetic (Phase 9A-3)", () => {
  it("Money.add avoids floating-point rounding 0.1 + 0.2", async () => {
    const gbp01 = { __tag: "record", fields: new Map([
      ["__isMoney", { __tag: "bool", value: true }],
      ["__amount",  { __tag: "decimal", value: "0.1" }],
      ["__currency",{ __tag: "string", value: "GBP" }],
    ]) };
    const gbp02 = { __tag: "record", fields: new Map([
      ["__isMoney", { __tag: "bool", value: true }],
      ["__amount",  { __tag: "decimal", value: "0.2" }],
      ["__currency",{ __tag: "string", value: "GBP" }],
    ]) };
    const r = await callStdlib("add", gbp01, [gbp02], ctx());
    assert.equal(r?.__tag, "record");
    const amount = r?.fields.get("__amount");
    // With BigInt arithmetic this should be exactly 0.30, NOT 0.30000000000000004
    assert.equal(amount?.value, "0.30", `Expected 0.30, got ${amount?.value}`);
  });

  it("Money.subtract exact result", async () => {
    const gbp10 = { __tag: "record", fields: new Map([
      ["__isMoney", { __tag: "bool", value: true }],
      ["__amount",  { __tag: "decimal", value: "10.00" }],
      ["__currency",{ __tag: "string", value: "GBP" }],
    ]) };
    const gbp333 = { __tag: "record", fields: new Map([
      ["__isMoney", { __tag: "bool", value: true }],
      ["__amount",  { __tag: "decimal", value: "3.33" }],
      ["__currency",{ __tag: "string", value: "GBP" }],
    ]) };
    const r = await callStdlib("subtract", gbp10, [gbp333], ctx());
    const amount = r?.fields.get("__amount");
    assert.equal(amount?.value, "6.67", `Expected 6.67, got ${amount?.value}`);
  });
});
