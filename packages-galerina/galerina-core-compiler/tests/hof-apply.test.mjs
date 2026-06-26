// Higher-order stdlib fns (map/filter/reduce) with a named-fn argument — correctness + fail-closed.
// BUG (fixed): the interpreter's applyFn only resolved a TOP-LEVEL flow ref and otherwise `return arg` —
// silently ECHOING the input. So `xs.map(g)` returned the input unchanged (g never applied), `reduce(0,add)`
// returned an empty record, and a map/filter/reduce chain returned a WRONG value — a silent-wrong-value
// fail-open on a core collection op. Now applyFn resolves an inner `fn` (fnIndex) too, binds the arg to the
// target's REAL params (reduce's {acc,item} → 2 params), and FAILS CLOSED on an unresolvable fn.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProgram, resolveSymbols, checkTypes, executeFlow } from "../dist/index.js";

const FNS = `fn g(x: Int) -> Int { return x * 2 }
  fn h(y: Int) -> Bool { return y > 4 }
  fn add(a: Int, b: Int) -> Int { return a + b }
  fn boom(x: Int) -> Int { return x / 0 }
  fn neg(x: Int) -> Int { return 100 - x }
  fn gt2(z: Int) -> Bool { return z > 2 }
  let xs: Array<Int> = [1, 2, 3, 4]
`;
async function run(body, ret = "Int") {
  const src = `pure flow f() -> ${ret}\ncontract { effects {} }\n{ ${FNS}  ${body} }`;
  const p = parseProgram(src, "p.spore");
  assert.equal(p.diagnostics.filter((d) => d.severity === "error").length, 0, "parse");
  try { resolveSymbols(p.ast); checkTypes(p.ast); } catch {}
  const r = await executeFlow("f", new Map(), p.ast);
  return r.value;
}
const intsOf = (v) => v.items.map((i) => i.value);

test("map applies its fn argument (was: returned the input unchanged)", async () => {
  assert.deepEqual(intsOf(await run("return xs.map(g)", "Array<Int>")), [2, 4, 6, 8]);
});

test("filter applies its predicate", async () => {
  assert.deepEqual(intsOf(await run("return xs.map(g).filter(h)", "Array<Int>")), [6, 8]);
});

test("reduce binds (acc, item) to the reducer's real two params (was: empty record)", async () => {
  const r = await run("return xs.reduce(0, add)");
  assert.equal(r.__tag, "int"); assert.equal(r.value, 10);
});

test("a chained map→filter→reduce computes correctly (was: 0)", async () => {
  const r = await run("return xs.map(g).filter(h).reduce(0, add)");
  assert.equal(r.value, 14); // [1,2,3,4]·2 → [2,4,6,8] → >4 → [6,8] → +0 → 14
});

test("FAIL-CLOSED: an unresolvable fn argument traps, never silently echoes the input", async () => {
  const r = await run("return xs.map(nope)", "Array<Int>");
  assert.equal(r.__tag, "runtimeError", `map(unknown) must fail closed, got ${JSON.stringify(r).slice(0, 80)}`);
  assert.match(r.message, /cannot apply|fails closed/);
});

test("FAIL-CLOSED: a mapper whose body traps propagates the trap (not a list of nulls)", async () => {
  // g2 divides by zero → a propagating trap; map must abort, not collect runtimeErrors.
  const r = await run("return xs.map(boom)", "Array<Int>");
  assert.equal(r.__tag, "runtimeError");
});

test("sortBy applies the key fn and SORTS (was: returned unchanged via a concurrent-apply race)", async () => {
  // neg(x)=100-x → keys [99,98,97,96]; ascending by key → items [4,3,2,1].
  assert.deepEqual(intsOf(await run("return xs.sortBy(neg)", "Array<Int>")), [4, 3, 2, 1]);
});

test("count(predicate) counts MATCHING; count() = length (was: count(pred) always returned the total)", async () => {
  assert.equal((await run("return xs.count(gt2)")).value, 2);   // >2 ⇒ 3,4
  assert.equal((await run("return xs.count()")).value, 4);
});

test("FAIL-CLOSED across the HOF family: a trapping fn aborts find / count / sortBy", async () => {
  assert.equal((await run("return xs.find(boom)", "Option<Int>")).__tag, "runtimeError");
  assert.equal((await run("return xs.count(boom)")).__tag, "runtimeError");
  assert.equal((await run("return xs.sortBy(boom)", "Array<Int>")).__tag, "runtimeError");
});

test("partition is method-wired: splits by predicate, and fails closed on a trap (#61)", async () => {
  const r = await run("return xs.partition(gt2)", "Array<Array<Int>>"); // [1,2,3,4], >2 ⇒ pass [3,4], fail [1,2]
  assert.equal(r.__tag, "list");
  assert.deepEqual(r.items.map((s) => s.items.map((i) => i.value)), [[3, 4], [1, 2]]);
  assert.equal((await run("return xs.partition(boom)", "Array<Array<Int>>")).__tag, "runtimeError");
});

test("any/every quantifiers (#61): correct, vacuous-true for [], fail-closed on a trap", async () => {
  assert.equal((await run("return xs.any(gt2)", "Bool")).value, true);    // some >2
  assert.equal((await run("return xs.every(gt2)", "Bool")).value, false); // not all >2 (1,2 fail)
  assert.equal((await run("let e: Array<Int> = []\n  return e.every(gt2)", "Bool")).value, true); // vacuous
  assert.equal((await run("return xs.any(boom)", "Bool")).__tag, "runtimeError"); // a trapping predicate fails closed
});
