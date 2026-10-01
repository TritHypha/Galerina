// =============================================================================
// interpreter-parity-ladder.mjs — the Runtime interpreter %'s RULING-1 ladder (K1, D10 option A)
// =============================================================================
// Owner decision D10 = option A (PLAN.md): a runtime feature COUNTS only when the three executors agree
// on its corpus — the governed tree-walker (executeFlow), the WASM backend (compile → wabt → instantiate
// against createHostRuntime) and the sync fast path (executeFlowSync). A rung is one feature of the
// charter below; it is DONE iff, for EVERY input vector, all three produce the same normalised result
// (a value, or a trap on all three). A fast path that DECLINES (null) is not agreement — fail-closed.
//
// If the measurement cannot run at all (dist missing, wabt missing so only the minimal encoder is
// available, a charter program that does not compile), this THROWS and component-health carries a
// WORD ("unmeasured"), never the old hand-typed 87.
//
// Rung ids are prefixed "rt:" so they cannot collide with the twin-parity codes or the WAT flow names
// that share audit-percent-evidence's checkRung.
//
// Usage: node scripts/lib/interpreter-parity-ladder.mjs [--self-test | --json]
// Grok Bot rounding work, 2026-09-30 (K1). NON_AUTHORIZING: a measurement, not a clearance.
// =============================================================================
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIST = join(ROOT, "packages-ts/galerina-core-compiler/dist/index.js");

const I = (n) => ({ t: "int", v: n });
const D = (s) => ({ t: "decimal", v: s });
const flow = (sig, body) => `pure flow ${sig}\ncontract { effects {} }\n{\n${body}\n}`;

/** The feature charter. Each rung: id, program, entry flow, parameter names, return kind, input vectors. */
export const CHARTER = Object.freeze([
  { id: "rt:int-arithmetic", src: flow("f(a: Int, b: Int) -> Int", "  return a * b + a - b"), entry: "f", params: ["a", "b"], ret: "int", cases: [[I(3), I(4)], [I(-7), I(2)]] },
  { id: "rt:int-division", src: flow("f(a: Int, b: Int) -> Int", "  return a / b"), entry: "f", params: ["a", "b"], ret: "int", cases: [[I(7), I(2)], [I(-7), I(2)], [I(1), I(0)]] },
  { id: "rt:int-remainder", src: flow("f(a: Int, b: Int) -> Int", "  return a % b"), entry: "f", params: ["a", "b"], ret: "int", cases: [[I(7), I(2)], [I(-7), I(2)]] },
  { id: "rt:int-overflow-trap", src: flow("f(a: Int, b: Int) -> Int", "  return a * b"), entry: "f", params: ["a", "b"], ret: "int", cases: [[I(65536), I(65536)], [I(2), I(3)]] },
  { id: "rt:comparison", src: flow("f(a: Int, b: Int) -> Bool", "  return a < b"), entry: "f", params: ["a", "b"], ret: "bool", cases: [[I(1), I(2)], [I(2), I(1)]] },
  { id: "rt:if-else", src: flow("f(a: Int, b: Int) -> Int", "  if a > b {\n    return a\n  }\n  return b"), entry: "f", params: ["a", "b"], ret: "int", cases: [[I(5), I(3)], [I(-1), I(4)]] },
  { id: "rt:let-binding", src: flow("f(a: Int) -> Int", "  let t = a + 1\n  return t * 2"), entry: "f", params: ["a"], ret: "int", cases: [[I(4)], [I(-3)]] },
  { id: "rt:while-loop", src: flow("f(n: Int) -> Int", "  mut s = 0\n  mut i = 1\n  while i <= n {\n    s = s + i\n    i = i + 1\n  }\n  return s"), entry: "f", params: ["n"], ret: "int", cases: [[I(10)], [I(0)]] },
  { id: "rt:recursion", src: flow("fact(n: Int) -> Int", "  if n <= 1 {\n    return 1\n  }\n  return n * fact(n - 1)"), entry: "fact", params: ["n"], ret: "int", cases: [[I(5)], [I(1)]] },
  { id: "rt:flow-call", src: `${flow("inc(x: Int) -> Int", "  return x + 1")}\n\n${flow("f(a: Int) -> Int", "  return inc(a) * 2")}`, entry: "f", params: ["a"], ret: "int", cases: [[I(3)], [I(-1)]] },
  { id: "rt:bool-logic", src: flow("f(a: Int, b: Int) -> Bool", "  return a > 0 && b > 0"), entry: "f", params: ["a", "b"], ret: "bool", cases: [[I(1), I(1)], [I(1), I(-1)], [I(-1), I(1)]] },
  { id: "rt:match-int", src: flow("f(a: Int) -> Int", "  match a {\n    1 => { return 10 }\n    2 => { return 20 }\n    _ => { return 0 }\n  }"), entry: "f", params: ["a"], ret: "int", cases: [[I(1)], [I(2)], [I(9)]] },
  { id: "rt:decimal-add", src: flow("f(a: Decimal, b: Decimal) -> Decimal", "  return a + b"), entry: "f", params: ["a", "b"], ret: "decimal", cases: [[D("0.1"), D("0.2")], [D("-1.50"), D("0.25")]] },
  { id: "rt:decimal-divide", src: flow("f(a: Decimal, b: Decimal) -> Decimal", '  return a.divide(b, 2, "halfEven")'), entry: "f", params: ["a", "b"], ret: "decimal", cases: [[D("1"), D("3")], [D("1"), D("0")]] },
]);

const TRAP = "trap";

function toGalerina(arg) {
  return arg.t === "int" ? { __tag: "int", value: arg.v } : { __tag: "decimal", value: arg.v };
}

/** Normalise an interpreter value to a comparable string; a trap/error/declined result is its own class. */
export function normaliseValue(v) {
  if (v === null || v === undefined) return "declined";
  if (v.__tag === "runtimeError") return TRAP;
  if (v.__tag === "int") return `int:${v.value}`;
  if (v.__tag === "bool") return `bool:${v.value}`;
  if (v.__tag === "decimal") return `decimal:${v.value}`;
  return `other:${v.__tag}`;
}

function normaliseWasm(ret, raw, host) {
  if (ret === "int") return `int:${raw}`;
  if (ret === "bool") return raw === 1 ? "bool:true" : raw === 0 ? "bool:false" : `bool-invalid:${raw}`;
  if (ret === "decimal") return `decimal:${host.readDecimal(raw)}`;
  return `other:${ret}`;
}

/** Pure: the ladder from per-rung verdicts. `agreed` is the Set checkRung consults. */
export function deriveLadder(verdicts) {
  if (!Array.isArray(verdicts) || verdicts.length === 0) {
    throw new Error("interpreter-parity-ladder: empty charter — RULING-1 forbids publishing a number with no rungs.");
  }
  const ladder = verdicts.map((v) => v.id);
  if (new Set(ladder).size !== ladder.length) throw new Error("interpreter-parity-ladder: duplicate rung id");
  const agreed = new Set(verdicts.filter((v) => v.agree === true).map((v) => v.id));
  const done = agreed.size;
  const total = ladder.length;
  return { ladder, agreed, done, total, pct: Math.round((done / total) * 100) };
}

async function measure(L) {
  const verdicts = [];
  for (const rung of CHARTER) {
    const prog = L.parseProgram(`@version 1\n${rung.src}`, `${rung.id}.fungi`);
    const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    if (errs.length) throw new Error(`interpreter-parity-ladder: ${rung.id} does not parse (${errs[0].code})`);
    L.resolveSymbols(prog.ast);
    let instance = null;
    let host = null;
    let wasmReason = "";
    try {
      const fx = L.checkEffects(prog.flows, prog.ast);
      const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
      const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, rung.id, prog.ast, true));
      const asm = await L.assembleWAT(wat);
      const diag = (asm.diagnostics ?? []).map((d) => d.message ?? "").join(" | ");
      if (/wabt not available/.test(diag)) {
        throw new Error("interpreter-parity-ladder: wabt is not installed — the WASM leg cannot run (unmeasured)");
      }
      if (asm.valid && (asm.diagnostics ?? []).length === 0) {
        host = L.createHostRuntime();
        for (const e of L.getInternedStrings()) host.seedString(e.handle, e.value);
        ({ instance } = await WebAssembly.instantiate(asm.wasm, host.imports));
      } else {
        wasmReason = `assemble:${diag.slice(0, 120)}`;
      }
    } catch (e) {
      if (/unmeasured/.test(String(e.message))) throw e;
      wasmReason = `compile:${String(e.message).slice(0, 120)}`;
    }
    let agree = instance !== null;
    const detail = [];
    for (const c of rung.cases) {
      const args = new Map(rung.params.map((p, i) => [p, toGalerina(c[i])]));
      let walker;
      try { walker = normaliseValue((await L.executeFlow(rung.entry, args, prog.ast, prog.flows)).value); } catch { walker = TRAP; }
      let fast;
      try { fast = normaliseValue(L.executeFlowSync(rung.entry, args, prog.ast, prog.flows)); } catch { fast = TRAP; }
      let wasm = `unavailable:${wasmReason}`;
      if (instance !== null) {
        const wasmArgs = c.map((a) => (a.t === "int" ? a.v : host.internDecimal(a.v)));
        try { wasm = normaliseWasm(rung.ret, instance.exports[rung.entry](...wasmArgs), host); } catch { wasm = TRAP; }
      }
      const same = walker === wasm && wasm === fast && walker !== "declined";
      if (!same) agree = false;
      detail.push({ walker, wasm, fast });
    }
    verdicts.push({ id: rung.id, agree, detail });
  }
  return verdicts;
}

export async function interpreterParityLadderAsync() {
  if (!existsSync(DIST)) throw new Error(`interpreter-parity-ladder: compiler dist not built (${DIST}) — unmeasured`);
  const L = await import(`file:///${DIST.replace(/\\/g, "/")}`);
  return deriveLadder(await measure(L));
}

/** Sync wrapper (component-health / the percent-evidence gate): spawn this file with --json. */
export function interpreterParityLadder() {
  const self = resolve(fileURLToPath(import.meta.url));
  let raw;
  try {
    raw = execFileSync(process.execPath, [self, "--json"], { encoding: "utf8", cwd: ROOT, maxBuffer: 16 * 1024 * 1024 });
  } catch (e) {
    throw new Error(`interpreter-parity-ladder: --json failed (${e.message}) — unmeasured`);
  }
  const parsed = JSON.parse(raw);
  if (!parsed || parsed.ok !== true) throw new Error(`interpreter-parity-ladder: --json not ok (${parsed?.reason ?? "invalid"}) — unmeasured`);
  return deriveLadder(parsed.verdicts);
}

const IS_MAIN = process.argv[1] !== undefined && process.argv[1].replace(/\\/g, "/").endsWith("scripts/lib/interpreter-parity-ladder.mjs");

if (IS_MAIN && process.argv.includes("--json")) {
  try {
    if (!existsSync(DIST)) throw new Error("dist-missing");
    const L = await import(`file:///${DIST.replace(/\\/g, "/")}`);
    const verdicts = await measure(L);
    const d = deriveLadder(verdicts);
    process.stdout.write(`${JSON.stringify({ ok: true, verdicts, done: d.done, total: d.total, pct: d.pct })}\n`);
  } catch (e) {
    process.stdout.write(`${JSON.stringify({ ok: false, reason: String(e.message).slice(0, 300) })}\n`);
    process.exit(1);
  }
}

if (IS_MAIN && process.argv.includes("--self-test")) {
  let pass = 0;
  let fail = 0;
  const ok = (c, m) => { if (c) { pass += 1; console.log(`  ✅ ${m}`); } else { fail += 1; console.log(`  ❌ ${m}`); } };
  const r = deriveLadder([{ id: "a", agree: true }, { id: "b", agree: false }, { id: "c", agree: true }, { id: "d", agree: false }]);
  ok(r.done === 2 && r.total === 4 && r.pct === 50, `derives 2/4 = 50 (got ${r.done}/${r.total} = ${r.pct})`);
  ok(r.agreed.has("a") && !r.agreed.has("b"), "a disagreeing rung is a RUNG but not agreed");
  ok(normaliseValue(null) === "declined", "a declined fast path is 'declined', never agreement");
  ok(normaliseValue({ __tag: "runtimeError", message: "x" }) === TRAP, "a runtimeError normalises to the trap class");
  let threw = false;
  try { deriveLadder([]); } catch { threw = true; }
  ok(threw, "an empty charter THROWS (no rungs, no number)");
  threw = false;
  try { deriveLadder([{ id: "a", agree: true }, { id: "a", agree: true }]); } catch { threw = true; }
  ok(threw, "a duplicate rung id THROWS");
  const live = await interpreterParityLadderAsync();
  ok(live.total === CHARTER.length && live.pct === Math.round((live.done / live.total) * 100),
    `live path is consistent (${live.done}/${live.total} = ${live.pct}%)`);
  console.log(`\n${fail === 0 ? "✅" : "❌"} interpreter-parity-ladder self-test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}
