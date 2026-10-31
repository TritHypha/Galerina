// MEM-R30b (gap 4.6/H13): unit pins for the integer-width classifier in galerina.mjs. Phillip's decision
// 2026-10-31: narrowing 64-to-32 is checked and refuses; Int is an alias of Int32. The frozen TS checker
// reports width mismatches as advisory FUNGI-TYPE-002/005/008; galerina.mjs lifts the NARROWING ones into
// a fail-closed FUNGI-INT-NARROW-001 (K3 DENY), drops the Int/Int32 alias pair, and leaves the rest alone.
import { test } from "node:test";
import assert from "node:assert/strict";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..", "..");
// MR30B_GALERINA lets the mutant harness in mr30b-narrowing-cli.test.mjs point this file at a mutated copy.
const G = await import(pathToFileURL(process.env.MR30B_GALERINA ?? join(REPO, "galerina.mjs")).href);
const { classifyIntegerWidthDiagnostic, integerNarrowingDiagnostics, withoutIntegerWidthHandled,
  integerWidthTypePair, normalizeIntegerWidth, INT_WIDTH_ALIAS, INT_NARROW_CODE, INT_WIDTH_MESSAGE_SHAPES,
  INVOKE_INTEGER_RANGES } = G;

const LOC = Object.freeze({ file: "synthetic.fungi", line: 4, column: 3 });
const ret = (decl, got) => ({ code: "FUNGI-TYPE-008", severity: "error", location: LOC,
  message: `Flow declares return type '${decl}' but this return expression has type '${got}'.` });
const asg = (from, to) => ({ code: "FUNGI-TYPE-002", severity: "error", location: LOC,
  message: `Cannot assign '${from}' to '${to}'. Add an explicit conversion.` });
const arg = (expects, got) => ({ code: "FUNGI-TYPE-005", severity: "error", location: LOC,
  message: `Argument 1 to 'id32' expects '${expects}' but received '${got}'.` });

test("exports are frozen and the alias is exactly Int -> Int32", () => {
  assert.deepEqual({ ...INT_WIDTH_ALIAS }, { Int: "Int32" });
  assert.equal(Object.isFrozen(INT_WIDTH_ALIAS), true);
  assert.equal(Object.isFrozen(INT_WIDTH_MESSAGE_SHAPES), true);
  assert.equal(INT_NARROW_CODE, "FUNGI-INT-NARROW-001");
  assert.deepEqual(Object.keys(INT_WIDTH_MESSAGE_SHAPES).sort(), ["FUNGI-TYPE-002", "FUNGI-TYPE-005", "FUNGI-TYPE-008"]);
  assert.equal(normalizeIntegerWidth("Int"), "Int32");
  assert.equal(normalizeIntegerWidth("Int64"), "Int64");
  for (const bad of ["Float", "String", "int", "", "__proto__", "constructor", null, 7]) {
    assert.equal(normalizeIntegerWidth(bad), undefined, String(bad));
  }
});

test("every pinned shape names from/to the right way round", () => {
  assert.deepEqual(integerWidthTypePair(ret("Int", "Int64")), { from: "Int64", to: "Int", normalizedFrom: "Int64", normalizedTo: "Int32", site: "return" });
  assert.deepEqual(integerWidthTypePair(asg("Int64", "Int")), { from: "Int64", to: "Int", normalizedFrom: "Int64", normalizedTo: "Int32", site: "assignment" });
  assert.deepEqual(integerWidthTypePair(arg("Int", "Int64")), { from: "Int64", to: "Int", normalizedFrom: "Int64", normalizedTo: "Int32", site: "argument" });
});

test("the width matrix follows range containment, not names", () => {
  const names = Object.keys(INVOKE_INTEGER_RANGES);
  for (const from of names) {
    for (const to of names) {
      const [fl, fh] = INVOKE_INTEGER_RANGES[normalizeIntegerWidth(from)];
      const [tl, th] = INVOKE_INTEGER_RANGES[normalizeIntegerWidth(to)];
      const want = normalizeIntegerWidth(from) === normalizeIntegerWidth(to) ? "ALIAS"
        : fl >= tl && fh <= th ? "WIDENING" : "NARROWING";
      for (const d of [ret(to, from), asg(from, to), arg(to, from)]) {
        assert.equal(classifyIntegerWidthDiagnostic(d), want, `${from} -> ${to} via ${d.code}`);
      }
    }
  }
  // The decision's named cases.
  assert.equal(classifyIntegerWidthDiagnostic(ret("Int", "Int64")), "NARROWING");
  assert.equal(classifyIntegerWidthDiagnostic(ret("Int32", "Int64")), "NARROWING");
  assert.equal(classifyIntegerWidthDiagnostic(ret("Int64", "UInt64")), "NARROWING");
  assert.equal(classifyIntegerWidthDiagnostic(ret("UInt64", "Int64")), "NARROWING");
  assert.equal(classifyIntegerWidthDiagnostic(ret("UInt32", "Int")), "NARROWING");
  assert.equal(classifyIntegerWidthDiagnostic(ret("Int64", "Int")), "WIDENING");
  assert.equal(classifyIntegerWidthDiagnostic(ret("Int64", "UInt32")), "WIDENING");
  assert.equal(classifyIntegerWidthDiagnostic(ret("Int", "Int32")), "ALIAS");
  assert.equal(classifyIntegerWidthDiagnostic(ret("Int32", "Int")), "ALIAS");
});

test("anything off-shape is NOT classified and keeps its existing treatment", () => {
  const cases = [
    ret("Int", "Float"), ret("String", "Int64"), asg("Bool", "Int"),
    { ...ret("Int", "Int64"), code: "FUNGI-TYPE-003" },
    { ...ret("Int", "Int64"), message: "Prefix: Flow declares return type 'Int' but this return expression has type 'Int64'." },
    { code: "FUNGI-TYPE-008", severity: "error" }, { code: 8, message: "x" }, null, undefined, "FUNGI-TYPE-008", 0,
  ];
  for (const d of cases) assert.equal(classifyIntegerWidthDiagnostic(d), null, JSON.stringify(d));
  assert.deepEqual(withoutIntegerWidthHandled(cases.filter((d) => d && typeof d === "object")).length, 7);
});

test("narrowing errors become one K3 DENY each, with location and no value", () => {
  const input = [ret("Int", "Int64"), asg("Int64", "Int"), arg("Int", "Int64"), ret("Int64", "Int"), ret("Int", "Int32"), ret("Int", "Float")];
  const out = integerNarrowingDiagnostics(input);
  assert.equal(out.length, 3);
  for (const [i, d] of out.entries()) {
    assert.equal(d.code, "FUNGI-INT-NARROW-001");
    assert.equal(d.severity, "error");
    assert.equal(d.verdict, "DENY");
    assert.equal(d.reason, "INT_NARROWING");
    assert.equal(d.sourceCode, input[i].code);
    assert.equal(d.location, LOC);
    assert.match(d.message, /^K3 DENY INT_NARROWING: a Int64 value used as Int \((return|assignment|argument), FUNGI-TYPE-00[258]\) is refused;/);
    assert.match(d.message, /no wrap, no truncation/);
    assert.doesNotMatch(d.message.replace(/FUNGI-TYPE-00[258]/u, ""), /\d{3,}/, "no numeric value is ever named");
  }
  assert.deepEqual(out.map((d) => d.message.match(/\((\w+),/)[1]), ["return", "assignment", "argument"]);
});

test("only ERROR severity is lifted; warnings and junk are ignored", () => {
  assert.deepEqual(integerNarrowingDiagnostics([{ ...ret("Int", "Int64"), severity: "warning" }]), []);
  assert.deepEqual(integerNarrowingDiagnostics([{ ...ret("Int", "Int64"), severity: "info" }]), []);
  assert.deepEqual(integerNarrowingDiagnostics(null), []);
  assert.deepEqual(integerNarrowingDiagnostics("nope"), []);
  assert.deepEqual(integerNarrowingDiagnostics([null, 3, "x"]), []);
});

test("the advisory filter drops alias and narrowing pairs, keeps widening and everything else", () => {
  const keepW = ret("Int64", "Int");
  const keepO = ret("Int", "Float");
  const kept = withoutIntegerWidthHandled([ret("Int", "Int32"), ret("Int", "Int64"), keepW, keepO, asg("UInt64", "Int64")]);
  assert.deepEqual(kept, [keepW, keepO]);
  assert.deepEqual(withoutIntegerWidthHandled(undefined), []);
});