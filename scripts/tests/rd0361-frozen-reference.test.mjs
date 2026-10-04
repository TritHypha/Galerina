// rd0361-frozen-reference.test.mjs: RD-0361 S2. The shared frozen-reference loader refuses every malformed
// or tampered variant, accepts the well-formed one (so the refusals are not vacuous), and its comparator
// never skips and fires on a planted fault. Pure: no compiler, no twin build.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FROZEN_REFERENCE_SCHEMA,
  FrozenReferenceError,
  canonicalCasesDigest,
  compareAgainstFrozen,
  isValueOfKind,
  ledgerPin,
  parseFrozenReference,
  plantedValue,
} from "../lib/rd0361-frozen-reference.mjs";

const PIN = "a".repeat(64);
const EXPECT = Object.freeze({ dir: "packages-ts/galerina-x/src/self-hosted", file: "x.fungi", ledgerSha256: PIN });

function goodDoc() {
  const cases = [
    { id: "k-a", export: "kVerdict", args: [true, 5], expected: 1 },
    { id: "k-b", export: "kVerdict", args: [false, 5], expected: -1 },
    { id: "s-a", export: "label", args: ["POST"], expected: "allow" },
    { id: "b-a", export: "isRelax", args: [-1], expected: false },
    { id: "i-a", export: "ceiling", args: [], expected: 65536 },
  ];
  return {
    schema: FROZEN_REFERENCE_SCHEMA, rd: "RD-0361",
    twin: { dir: EXPECT.dir, file: EXPECT.file, module: "x-twin", ledgerSha256: PIN },
    oracle: { kind: "differential-spec-capture", source: "packages-ts/galerina-x/tests/rd0361-x-execution.test.mjs", capturedAtCommit: "b".repeat(40) },
    exports: [
      { name: "kVerdict", params: ["bool", "int"], returns: "k3" },
      { name: "label", params: ["string"], returns: "string" },
      { name: "isRelax", params: ["int"], returns: "bool" },
      { name: "ceiling", params: [], returns: "int" },
    ],
    caseCount: cases.length, casesSha256: canonicalCasesDigest(cases), cases,
  };
}
const repin = (doc) => { doc.casesSha256 = canonicalCasesDigest(doc.cases); doc.caseCount = doc.cases.length; return doc; };
const edit = (fn) => { const doc = goodDoc(); fn(doc); return JSON.stringify(repin(doc)); };
const invokers = Object.freeze({
  kVerdict: (b, n) => (b && n >= 0 ? 1 : -1),
  label: (m) => (m === "POST" ? "allow" : "deny"),
  isRelax: (n) => n > 65536,
  ceiling: () => 65536,
});

test("well-formed v2 frozen set loads, deep-frozen, and the comparator compares N of N", () => {
  const frozen = parseFrozenReference(JSON.stringify(goodDoc()), EXPECT);
  assert.ok(Object.isFrozen(frozen) && Object.isFrozen(frozen.cases[0].args));
  const r = compareAgainstFrozen(frozen, invokers);
  assert.deepEqual(r.mismatches, []);
  assert.equal(r.compared, frozen.caseCount);
});

test("planted fault fires on exactly the planted case; missing invoker throws", () => {
  const doc = goodDoc();
  doc.cases[2].expected = plantedValue("string", doc.cases[2].expected);
  const r = compareAgainstFrozen(parseFrozenReference(JSON.stringify(repin(doc)), EXPECT), invokers);
  assert.deepEqual(r.mismatches.map((m) => m.id), ["s-a"]);
  const frozen = parseFrozenReference(JSON.stringify(goodDoc()), EXPECT);
  const { label, ...partial } = invokers;
  assert.equal(typeof label, "function");
  assert.throws(() => compareAgainstFrozen(frozen, partial), FrozenReferenceError);
});

test("plantedValue always returns a different valid value of the same kind", () => {
  for (const [kind, value] of [["bool", true], ["bool", false], ["k3", 1], ["k3", 0], ["k3", -1], ["int", 2147483647], ["int", -5], ["string", "planted-fault"], ["string", ""]]) {
    const planted = plantedValue(kind, value);
    assert.ok(isValueOfKind(kind, planted) && !Object.is(planted, value), `${kind} ${value}`);
  }
});

test("loader refuses every malformed or tampered variant", () => {
  const text = JSON.stringify(goodDoc());
  const variants = {
    "BOM": "\uFEFF" + text,
    "invalid JSON": text.slice(0, -2),
    "unknown top key": JSON.stringify({ ...goodDoc(), extra: 1 }),
    "missing top key": (() => { const d = goodDoc(); delete d.oracle; return JSON.stringify(d); })(),
    "v1 schema": JSON.stringify({ ...goodDoc(), schema: "galerina.rd0361.frozen-reference.v1" }),
    "wrong rd": JSON.stringify({ ...goodDoc(), rd: "RD-0362" }),
    "other twin": JSON.stringify({ ...goodDoc(), twin: { ...goodDoc().twin, file: "y.fungi" } }),
    "stale pin": JSON.stringify({ ...goodDoc(), twin: { ...goodDoc().twin, ledgerSha256: "0".repeat(64) } }),
    "bad module": JSON.stringify({ ...goodDoc(), twin: { ...goodDoc().twin, module: "X Twin" } }),
    "oracle kind": JSON.stringify({ ...goodDoc(), oracle: { ...goodDoc().oracle, kind: "hand-written" } }),
    "oracle source suffix": JSON.stringify({ ...goodDoc(), oracle: { ...goodDoc().oracle, source: "x.ts" } }),
    "short commit": JSON.stringify({ ...goodDoc(), oracle: { ...goodDoc().oracle, capturedAtCommit: "abc" } }),
    "count mismatch": JSON.stringify({ ...goodDoc(), caseCount: 99 }),
    "digest not repinned": (() => { const d = goodDoc(); d.cases[0].expected = -1; return JSON.stringify(d); })(),
    "empty cases": edit((d) => { d.cases = []; }),
    "duplicate id": edit((d) => { d.cases[1].id = "k-a"; }),
    "duplicate args": edit((d) => { d.cases.push({ ...d.cases[0], id: "k-copy" }); }),
    "non-K3 expected": edit((d) => { d.cases[0].expected = 2; }),
    "bool as 1": edit((d) => { d.cases[0].args[0] = 1; }),
    "fractional int": edit((d) => { d.cases[0].args[1] = 1.5; }),
    "out-of-i32 int": edit((d) => { d.cases[0].args[1] = 2147483648; }),
    "string as number": edit((d) => { d.cases[2].args[0] = 5; }),
    "control char string": edit((d) => { d.cases[2].args[0] = "PO\nST"; }),
    "wrong arity": edit((d) => { d.cases[0].args.push(1); }),
    "bool expected as 0": edit((d) => { d.cases[3].expected = 0; }),
    "unknown case key": edit((d) => { d.cases[0].note = "x"; }),
    "undeclared export": edit((d) => { d.cases[0].export = "other"; }),
    "uncovered export": edit((d) => { d.cases = d.cases.filter((row) => row.export !== "label"); }),
    "duplicate export": JSON.stringify({ ...goodDoc(), exports: [...goodDoc().exports, goodDoc().exports[0]] }),
    "unknown kind": JSON.stringify({ ...goodDoc(), exports: [{ ...goodDoc().exports[0], returns: "float" }, ...goodDoc().exports.slice(1)] }),
  };
  for (const [name, variant] of Object.entries(variants)) {
    assert.throws(() => parseFrozenReference(variant, EXPECT), FrozenReferenceError, `must refuse: ${name}`);
  }
});

test("ledgerPin requires exactly one well-formed ledger entry", () => {
  const row = { dir: EXPECT.dir, file: EXPECT.file, sha256: PIN };
  assert.equal(ledgerPin(JSON.stringify({ twins: [row] }), EXPECT.dir, EXPECT.file), PIN);
  for (const bad of ["{", JSON.stringify({}), JSON.stringify({ twins: [] }), JSON.stringify({ twins: [row, row] }), JSON.stringify({ twins: [{ ...row, sha256: "x" }] })]) {
    assert.throws(() => ledgerPin(bad, EXPECT.dir, EXPECT.file), FrozenReferenceError);
  }
});
