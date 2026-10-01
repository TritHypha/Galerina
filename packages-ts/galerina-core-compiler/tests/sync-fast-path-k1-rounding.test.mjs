/**
 * K1 fast-path rounding (Grok Bot, 2026-10-01) — the sync fast path (executeFlowSync) now carries
 * statement-position Int `match`, Decimal `+`, and `d.divide(b, scale, mode)`. Each admitted case must
 * agree across ALL THREE engines: the governed tree-walker (executeFlow), the WASM backend
 * (compile → wabt → instantiate against createHostRuntime) and the sync fast path. A fast path that
 * DECLINES (null) is not agreement. The zero-trust declines are pinned too: anything outside the
 * admitted shape returns null so the governed walker runs it.
 *
 * NON_AUTHORIZING: a parity test, not a clearance.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as L from "../dist/index.js";
import { flowDeclaresUnlowerable64, flowDeclaresSyncTierUnlowerable } from "../dist/numeric-lowering.js";

const flow = (sig, body) => `@version 1\npure flow ${sig}\ncontract { effects {} }\n{\n${body}\n}\n`;
const I = (n) => ({ t: "int", v: n });
const D = (s) => ({ t: "decimal", v: s });
const toVal = (a) => (a.t === "int" ? { __tag: "int", value: a.v } : { __tag: "decimal", value: a.v });

function parse(src, file) {
  const p = L.parseProgram(src, file);
  const errs = (p.diagnostics ?? []).filter((d) => d.severity === "error");
  assert.equal(errs.length, 0, `parse errors: ${errs.map((e) => `${e.code} ${e.message}`).join("; ")}`);
  L.resolveSymbols(p.ast);
  return p;
}

function norm(v) {
  if (v === null || v === undefined) return "declined";
  if (v.__tag === "runtimeError") return `trap:${v.message}`;
  if (v.__tag === "int" || v.__tag === "bool" || v.__tag === "decimal") return `${v.__tag}:${v.value}`;
  return `other:${v.__tag}`;
}

async function wasmLeg(p, id) {
  const fx = L.checkEffects(p.flows, p.ast);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, id, p.ast, true));
  const asm = await L.assembleWAT(wat);
  const diag = (asm.diagnostics ?? []).map((d) => d.message ?? "").join(" | ");
  if (/wabt not available/.test(diag)) return { unavailable: true };
  assert.ok(asm.valid && (asm.diagnostics ?? []).length === 0, `WASM must assemble: ${diag}`);
  const host = L.createHostRuntime();
  for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
  const { instance } = await WebAssembly.instantiate(asm.wasm, host.imports);
  return { instance, host };
}

const AGREE = [
  {
    id: "k1-match-int",
    src: flow("f(a: Int) -> Int", "  match a {\n    1 => { return 10 }\n    2 => { return 20 }\n    3 => { return 30 }\n    _ => { return 0 }\n  }"),
    params: ["a"], ret: "int",
    cases: [[I(1)], [I(2)], [I(3)], [I(-3)], [I(0)]],
    want: ["int:10", "int:20", "int:30", "int:0", "int:0"],
  },
  {
    id: "k1-match-int-body",
    src: flow("f(a: Int, b: Int) -> Int", "  match a {\n    0 => {\n      let t = b * 2\n      return t + 1\n    }\n    _ => { return b - a }\n  }"),
    params: ["a", "b"], ret: "int",
    cases: [[I(0), I(5)], [I(4), I(5)], [I(0), I(-3)]],
    want: ["int:11", "int:1", "int:-5"],
  },
  {
    id: "k1-decimal-add",
    src: flow("f(a: Decimal, b: Decimal) -> Decimal", "  return a + b"),
    params: ["a", "b"], ret: "decimal",
    cases: [[D("0.1"), D("0.2")], [D("-1.50"), D("0.25")], [D("123.456"), D("-0.001")], [D("0"), D("0")]],
    want: ["decimal:0.3", "decimal:-1.25", "decimal:123.455", "decimal:0"],
  },
  {
    id: "k1-decimal-divide",
    src: flow("f(a: Decimal, b: Decimal) -> Decimal", '  return a.divide(b, 2, "halfEven")'),
    params: ["a", "b"], ret: "decimal",
    cases: [[D("1"), D("3")], [D("2"), D("3")], [D("-7"), D("2")], [D("1"), D("0")]],
    want: ["decimal:0.33", "decimal:0.67", "decimal:-3.50", "trap"],
  },
];

for (const rung of AGREE) {
  test(`three-engine agreement: ${rung.id} (walker == WASM == executeFlowSync, never declined)`, async (t) => {
    const p = parse(rung.src, `${rung.id}.fungi`);
    const w = await wasmLeg(p, rung.id);
    if (w.unavailable) { t.skip("wabt not available — the WASM leg cannot run"); return; }
    for (const [i, c] of rung.cases.entries()) {
      const args = new Map(rung.params.map((name, k) => [name, toVal(c[k])]));
      const walker = (await L.executeFlow("f", args, p.ast, p.flows)).value;
      const fast = L.executeFlowSync("f", args, p.ast, p.flows);
      let wasm;
      try {
        const raw = w.instance.exports.f(...c.map((a) => (a.t === "int" ? a.v : w.host.internDecimal(a.v))));
        wasm = rung.ret === "decimal" ? `decimal:${w.host.readDecimal(raw)}` : `int:${raw}`;
      } catch {
        wasm = "trap";
      }
      const nw = norm(walker);
      const nf = norm(fast);
      assert.notEqual(nf, "declined", `${rung.id} case ${i}: the sync fast path must not decline`);
      assert.equal(nf, nw, `${rung.id} case ${i}: sync ${nf} vs walker ${nw} (trap messages must match exactly)`);
      const cls = nw.startsWith("trap:") ? "trap" : nw;
      assert.equal(wasm, cls, `${rung.id} case ${i}: WASM ${wasm} vs walker ${nw}`);
      assert.equal(cls, rung.want[i], `${rung.id} case ${i}: expected ${rung.want[i]}`);
    }
  });
}

const DECLINE = [
  { why: "match without a `_` arm", src: flow("f(a: Int) -> Int", "  match a {\n    1 => { return 10 }\n    2 => { return 20 }\n  }\n  return 0"), args: [I(1)] },
  { why: "multi-pattern arm", src: flow("f(a: Int) -> Int", "  match a {\n    1 | 2 => { return 10 }\n    _ => { return 0 }\n  }"), args: [I(1)] },
  { why: "taken arm does not return", src: flow("f(a: Int) -> Int", "  match a {\n    1 => { let t = 1 }\n    _ => { return 0 }\n  }\n  return 5"), args: [I(1)] },
  { why: "Decimal-typed binding", src: flow("f(a: Decimal) -> Decimal", "  let d: Decimal = a\n  return d"), args: [D("1.5")] },
  { why: "Decimal re-assignment", src: flow("f(a: Decimal, b: Decimal) -> Decimal", "  mut s = a\n  s = s + b\n  return s"), args: [D("1.5"), D("2")] },
  { why: "a Decimal receiver outside divide/remainder", src: flow("f(a: Decimal) -> Decimal", "  return a.abs()"), args: [D("-1.5")] },
  { why: "Int64 param (still i32-only on sync)", src: flow("f(a: Int64) -> Int64", "  return a"), args: [I(1)] },
];

for (const d of DECLINE) {
  test(`zero-trust decline: ${d.why} → executeFlowSync returns null (governed walker runs it)`, () => {
    const p = parse(d.src, "k1-decline.fungi");
    const params = (p.ast.children.find((c) => c.value === "f").children ?? [])
      .filter((c) => c.kind === "paramDecl").map((c) => c.value.split(":")[0].trim());
    const args = new Map(params.map((name, k) => [name, toVal(d.args[k])]));
    assert.equal(L.executeFlowSync("f", args, p.ast, p.flows), null);
  });
}

test("the bytecode/WASM bail is unchanged: Decimal still in flowDeclaresUnlowerable64; sync scan admits only its signature", () => {
  const p = parse(flow("f(a: Decimal, b: Decimal) -> Decimal", "  return a + b"), "k1-scan.fungi");
  const node = p.ast.children.find((c) => c.value === "f");
  assert.equal(flowDeclaresUnlowerable64(node), true, "bytecode VM / WASM f64 path must still bail on Decimal");
  assert.equal(flowDeclaresSyncTierUnlowerable(node), false, "sync scan admits a Decimal signature");
  const q = parse(flow("f(a: Int) -> Int", "  let y: Decimal = 1\n  return a"), "k1-scan2.fungi");
  assert.equal(flowDeclaresSyncTierUnlowerable(q.ast.children.find((c) => c.value === "f")), true, "a Decimal binding still bails");
});

test("pureFastPath: a Decimal value runs on the sync tier; a Decimal trap is re-run on the governed walker", async () => {
  L.clearPureFlowCache?.();
  const p = parse(flow("f(a: Decimal, b: Decimal) -> Decimal", '  return a.divide(b, 2, "halfEven")'), "k1-tier.fungi");
  const ok = await L.executeFlow("f", new Map([["a", toVal(D("1"))], ["b", toVal(D("4"))]]), p.ast, p.flows, undefined, undefined, { pureFastPath: true });
  assert.equal(norm(ok.value), "decimal:0.25");
  assert.equal(ok.executionTier, "sync");
  const bad = await L.executeFlow("f", new Map([["a", toVal(D("1"))], ["b", toVal(D("0"))]]), p.ast, p.flows, undefined, undefined, { pureFastPath: true });
  assert.equal(bad.value.__tag, "runtimeError");
  assert.notEqual(bad.executionTier, "sync", "a trap must not be reported from the sync tier (audit would read ok)");
  const walker = await L.executeFlow("f", new Map([["a", toVal(D("1"))], ["b", toVal(D("0"))]]), p.ast, p.flows);
  assert.equal(norm(bad.value), norm(walker.value), "the trap is the walker's own");
});
