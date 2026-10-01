/**
 * K2 / I5 — admit proveably-pure stdlib on SyncInterpreter with identical
 * results vs the async tree-walker. Governance / I/O / HOF / Money / range stay deferred.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseProgram,
  tryPureFlowSync,
  executeFlow,
  clearBytecodeCache,
  clearPureFlowCache,
} from "../dist/index.js";

function parse(src, file = "k2.fungi") {
  const p = parseProgram(src, file);
  const errs = (p.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse errors: ${errs.map((e) => e.message).join("; ")}`);
  return p;
}

function flow(retType, body) {
  return `pure flow main() -> ${retType}
contract { effects {} }
{ ${body} }`;
}

function assertVal(got, tag, value) {
  assert.notEqual(got, null, "sync path must return a value");
  assert.equal(got.__tag, tag, JSON.stringify(got));
  if (tag === "list") {
    assert.deepEqual(got.items.map((i) => i.value), value);
    return;
  }
  assert.equal(got.value, value, JSON.stringify(got));
}

const CORPUS = [
  { name: "Math.abs", src: flow("Int", "return Math.abs(-5)"), tag: "int", value: 5 },
  { name: "Math.min", src: flow("Int", "return Math.min(3, 7)"), tag: "int", value: 3 },
  { name: "Math.max", src: flow("Int", "return Math.max(3, 7)"), tag: "int", value: 7 },
  { name: "Math.clamp", src: flow("Int", "return Math.clamp(20, 0, 10)"), tag: "int", value: 10 },
  { name: "Math.sign", src: flow("Int", "return Math.sign(-4)"), tag: "int", value: -1 },
  { name: "method abs", src: flow("Int", "let x: Int = -8\n  return x.abs()"), tag: "int", value: 8 },
  { name: "String.toLower", src: flow("String", "return \"Hello\".toLower()"), tag: "string", value: "hello" },
  { name: "String.length", src: flow("Int", "return \"Hello\".length()"), tag: "int", value: 5 },
  { name: "Array.of.sum", src: flow("Int", "return Array.of(1, 2, 3).sum()"), tag: "int", value: 6 },
  { name: "Some.isSome", src: flow("Bool", "return Some(1).isSome()"), tag: "bool", value: true },
];

test("tryPureFlowSync: admitted pure stdlib returns values (not null)", () => {
  for (const c of CORPUS) {
    const p = parse(c.src, `k2-${c.name.replace(/\s+/g, "-")}.fungi`);
    const r = tryPureFlowSync(p.ast, p.flows, "main", new Map());
    assertVal(r, c.tag, c.value);
  }
});

test("parity: tryPureFlowSync values match async tree-walker", async () => {
  clearBytecodeCache?.();
  clearPureFlowCache?.();
  for (const c of CORPUS) {
    const p = parse(c.src, `k2-parity-${c.name.replace(/\s+/g, "-")}.fungi`);
    const sync = tryPureFlowSync(p.ast, p.flows, "main", new Map());
    const tree = await executeFlow("main", new Map(), p.ast, p.flows);
    assert.notEqual(sync, null, c.name);
    assert.equal(sync.__tag, tree.value.__tag, c.name);
    if (c.tag === "list") {
      assert.deepEqual(sync.items, tree.value.items, c.name);
    } else {
      assert.equal(sync.value, tree.value.value, `${c.name}: ${JSON.stringify(sync)} vs ${JSON.stringify(tree.value)}`);
    }
  }
});

test("executeFlow pureFastPath: String.toLower stays executionTier sync", async () => {
  clearBytecodeCache?.();
  clearPureFlowCache?.();
  const p = parse(flow("String", "return \"Hello\".toLower()"), "k2-tier-tolower.fungi");
  const res = await executeFlow(
    "main",
    new Map(),
    p.ast,
    p.flows,
    undefined,
    undefined,
    { pureFastPath: true, sourceTag: "k2-tier-tolower" },
  );
  assert.equal(res.value.__tag, "string");
  assert.equal(res.value.value, "hello");
  assert.equal(res.executionTier, "sync", JSON.stringify({ tier: res.executionTier, fallback: res.fallbackReason }));
  assert.notEqual(res.fallbackReason, "sync-unsupported");
});

test("step-budget: exceeding maxSteps on admitted stdlib defers (null)", () => {
  const p = parse(flow("Int", "return Math.abs(-5)"), "k2-steps.fungi");
  const r = tryPureFlowSync(p.ast, p.flows, "main", new Map(), 100_000, 1);
  assert.equal(r, null, "maxSteps=1 must bail to the async cap");
});

test("negative: print still defers (SyncNotSupported / sync-unsupported)", async () => {
  clearBytecodeCache?.();
  clearPureFlowCache?.();
  const p = parse(flow("Int", "return print(\"x\")"), "k2-print.fungi");
  const sync = tryPureFlowSync(p.ast, p.flows, "main", new Map());
  assert.equal(sync, null, "print must not run on sync");
  const res = await executeFlow(
    "main",
    new Map(),
    p.ast,
    p.flows,
    undefined,
    undefined,
    { pureFastPath: true, sourceTag: "k2-print", outputSink: () => {} },
  );
  assert.equal(res.fallbackReason, "sync-unsupported");
  assert.notEqual(res.executionTier, "sync");
});

test("negative: Money.gbp still defers", () => {
  const p = parse(
    `pure flow main() -> Money
contract { effects {} }
{ return Money.gbp("12.34") }`,
    "k2-money.fungi",
  );
  const sync = tryPureFlowSync(p.ast, p.flows, "main", new Map());
  assert.equal(sync, null, "Money.gbp must not run on sync");
});

test("negative: Array.range still defers", () => {
  const p = parse(flow("Int", "return Array.range(0, 3).length()"), "k2-range.fungi");
  const sync = tryPureFlowSync(p.ast, p.flows, "main", new Map());
  assert.equal(sync, null, "Array.range must not run on sync");
});
