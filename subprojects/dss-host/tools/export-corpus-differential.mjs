#!/usr/bin/env node
// =============================================================================
// export-corpus-differential.mjs — RD-0529 A1 (part 1 of 2): the GENERAL-corpus engine differential.
// =============================================================================
// R&D finding #1 (measured): the corpus WASM executes on V8 (742 WebAssembly.instantiate sites), but
// wasmtime is an execution oracle ONLY in the dss-host DSS-supervisor suite (M1 — one 1218B module).
// So "WASM is the production path, wasmtime tomorrow" has NO corpus-level wasmtime conformance behind it.
//
// A1 closes that with a THREE-way differential over a general corpus: interp ≡ V8 ≡ wasmtime, result AND
// trap bit-identical. It generalises the M1 harness past its 6 fixed DSS exports. Built in two parts, the
// same shape M1 was:
//   • THIS tool (part 1): compile each seed program, run it under the Stage-A INTERPRETER and under V8,
//     ASSERT interp ≡ V8 (value-equal, or both trap), and emit a fixture the Rust harness consumes —
//     per program: the .wasm bytes + each call's args + the agreed expected {value | trap}.
//   • tests/corpus_differential.rs (part 2, next): re-run every call through REAL wasmtime (dynamic
//     Func::call + func.ty() signature introspection, catching traps) and assert wasmtime ≡ the fixture —
//     which, since the fixture is interp≡V8, closes the three-way.
//
// SCOPE (honest — this is rung 1 of the flagship): the seed is pure flows with Number-exact signatures
// (Int/Bool → i32, Float → f64) plus the fail-closed TRAP classes (signed-overflow, /0, %0). NON-VACUOUS
// by construction: an all-value corpus proves nothing, so trapping programs are mandatory here. i64/u64
// (BigInt-exact marshalling), f32, records/strings, and the benchmark/auth-service/r6 file corpus are the
// NEXT rungs — each broadens the seed below; the harness shape does not change.
//
// Deterministic output (no timestamps) so a re-export is byte-stable. Fixtures are GENERATED (gitignored).
// Regenerate + assert interp≡V8:  node tools/export-corpus-differential.mjs   (exit 1 on any divergence)
// =============================================================================
import { writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");           // tools -> dss-host -> subprojects -> repo root
const COMPILER = join(ROOT, "packages-galerina", "galerina-core-compiler", "dist", "index.js");
const OUT = join(HERE, "..", "fixtures", "corpus");
if (!existsSync(COMPILER)) { console.error(`compiler dist not built: ${COMPILER}\n  run the workspace build first.`); process.exit(1); }
const L = await import(pathToFileURL(COMPILER).href);

for (const [n, ok] of [
  ["parseProgram", typeof L.parseProgram === "function"],
  ["checkTypes", typeof L.checkTypes === "function"],
  ["checkEffects", typeof L.checkEffects === "function"],
  ["verifyGovernance", typeof L.verifyGovernance === "function"],
  ["emitGIR", typeof L.emitGIR === "function"],
  ["buildWATModuleFromGIR", typeof L.buildWATModuleFromGIR === "function"],
  ["renderWAT", typeof L.renderWAT === "function"],
  ["assembleWAT", typeof L.assembleWAT === "function"],
  ["executeFlowSync", typeof L.executeFlowSync === "function"],
]) if (!ok) { console.error(`[A1 export] ANCHOR GONE: ${n} — refusing to emit a fixture.`); process.exit(1); }

const I = (value) => ({ __tag: "int", value });
const F = (value) => ({ __tag: "float", value });
const body = (sig, expr) => `pure flow f(${sig}) -> ${expr.ret}\ncontract { effects {} }\n{ return ${expr.body} }`;

// ── the seed. Each program is ONE pure flow `f`; `calls` are the input vectors. `trap:true` means every
//    engine must fail-closed (never a value). wrap = how the interpreter boxes the args (Int vs Float). ──
const bin = (ret, op, wrap) => (a, b, c, d) => ({
  src: `pure flow f(a: ${a}, b: ${b}) -> ${ret}\ncontract { effects {} }\n{ return a ${op} b }`, wrap,
});
const SEED = [
  { id: "int-add", ...bin("Int", "+", I)("Int", "Int"), calls: [{ args: [7, 5] }, { args: [-3, 10] }, { args: [0, 0] }, { args: [-8, -9] }] },
  { id: "int-sub", ...bin("Int", "-", I)("Int", "Int"), calls: [{ args: [7, 5] }, { args: [5, 7] }, { args: [0, 100] }] },
  { id: "int-mul", ...bin("Int", "*", I)("Int", "Int"), calls: [{ args: [7, 5] }, { args: [-6, 7] }, { args: [0, 99] }] },
  { id: "int-div-trunc", ...bin("Int", "/", I)("Int", "Int"), calls: [{ args: [7, 2] }, { args: [-7, 2] }, { args: [7, -2] }, { args: [100, 10] }] },
  { id: "int-mod", ...bin("Int", "%", I)("Int", "Int"), calls: [{ args: [7, 3] }, { args: [-7, 3] }, { args: [10, 5] }] },
  { id: "cmp-lt", ...bin("Bool", "<", I)("Int", "Int"), calls: [{ args: [3, 5] }, { args: [5, 3] }, { args: [3, 3] }] },
  { id: "cmp-gte", ...bin("Bool", ">=", I)("Int", "Int"), calls: [{ args: [3, 3] }, { args: [2, 3] }, { args: [4, 3] }] },
  { id: "cmp-eq", ...bin("Bool", "==", I)("Int", "Int"), calls: [{ args: [3, 3] }, { args: [3, 4] }] },
  { id: "float-add", ...bin("Float", "+", F)("Float", "Float"), calls: [{ args: [0.5, 0.25] }, { args: [0.1, 0.2] }, { args: [-1.5, 1.5] }] },
  { id: "float-mul", ...bin("Float", "*", F)("Float", "Float"), calls: [{ args: [0.5, 0.5] }, { args: [1.5, 2.0] }] },
  { id: "float-sub", ...bin("Float", "-", F)("Float", "Float"), calls: [{ args: [0.75, 0.25] }, { args: [1.0, 2.5] }] },
  // ── fail-closed TRAP classes (mandatory non-vacuity: an all-value corpus proves nothing) ──
  { id: "int-overflow-trap", ...bin("Int", "+", I)("Int", "Int"), trap: true, calls: [{ args: [2147483647, 1] }] },
  { id: "int-divzero-trap", ...bin("Int", "/", I)("Int", "Int"), trap: true, calls: [{ args: [7, 0] }] },
  { id: "int-modzero-trap", ...bin("Int", "%", I)("Int", "Int"), trap: true, calls: [{ args: [7, 0] }] },
];

// ── compile one program's source to WASM bytes (front-end gated, #141 stub-rejected) ──
async function compile(src, id) {
  const p = L.parseProgram(src, `${id}.fungi`, { requireVersionHeader: false });
  if (p.diagnostics.some((d) => d.severity === "error")) throw new Error(`${id}: parse error`);
  const fx = L.checkEffects(p.flows, p.ast);
  const gate = [
    ...L.checkTypes(p.ast).diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
    ...L.verifyGovernance(p.ast, p.flows, fx, "production", `${id}.fungi`).diagnostics.filter((d) => d.severity === "error").map((d) => d.code),
  ];
  if (gate.length) throw new Error(`${id}: front-end gate blocked (${[...new Set(gate)].join(",")})`);
  const { gir } = L.emitGIR(p.ast, p.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, id.replace(/[^a-zA-Z0-9_]/g, "_"), p.ast, true));
  const asm = await L.assembleWAT(wat);
  // #141: a wabt-rejected module comes back as the minimal-encoder STUB (valid:true + a "NOT faithful" diag).
  // Reading .valid alone is the fail-open; require zero diagnostics before trusting the bytes.
  if (!asm || !asm.valid || (asm.diagnostics?.length ?? 0) > 0) {
    throw new Error(`${id}: unfaithful assembly — ${asm?.diagnostics?.[0]?.message?.slice(0, 80) ?? "invalid"}`);
  }
  const u8 = asm.wasm instanceof Uint8Array ? asm.wasm : new Uint8Array(asm.wasm);
  if (u8.length <= 8) throw new Error(`${id}: ${u8.length}-byte empty module (unparseable WAT)`);
  if (!WebAssembly.validate(u8)) throw new Error(`${id}: WebAssembly.validate rejected the module`);
  return u8;
}

// ── V8 execution: instantiate + call. { k:"VALUE",value } | { k:"TRAP" } ──
function v8run(u8, flow, args) {
  let inst;
  try { inst = new WebAssembly.Instance(new WebAssembly.Module(u8), {}); }
  catch { return { k: "TRAP", why: "instantiate" }; }
  const fn = inst.exports[flow] ?? Object.values(inst.exports).find((v) => typeof v === "function");
  if (typeof fn !== "function") throw new Error(`no callable export for ${flow}`);
  try { return { k: "VALUE", value: fn(...args) }; }
  catch { return { k: "TRAP", why: "runtime" }; }
}

// ── interpreter (Stage-A) via executeFlowSync. { k:"VALUE",value } | { k:"TRAP" } ──
function interp(src, flow, args, wrap) {
  try {
    const p = L.parseProgram(src, "x.fungi", { requireVersionHeader: false });
    // .match (not .matchAll): matchAll throws on a non-global regex. First `(...)` = the flow params.
    const names = (src.match(/\(([^)]*)\)/)?.[1] ?? "").split(",").map((s) => s.trim().split(":")[0].trim()).filter(Boolean);
    const m = new Map();
    args.forEach((v, i) => { if (names[i]) m.set(names[i], wrap(v)); });
    const r = L.executeFlowSync(flow, m, p.ast, p.flows);
    if (r === null || r === undefined) return { k: "TRAP", why: "declined" };
    // the interpreter fail-closes with a runtimeError SENTINEL (IntegerOverflow / DivisionByZero / …) — it is a
    // trap, NOT a value. Decoding it is what makes the interpreter a faithful trap oracle alongside the WASM.
    if (r && typeof r === "object" && r.__tag === "runtimeError") return { k: "TRAP", why: r.message || "runtimeError" };
    return { k: "VALUE", value: r }; // raw; canon()/unwrap() fully reduce {__tag,value} nesting
  } catch { return { k: "TRAP", why: "interp" }; }
}

// fully unwrap a boxed runtime value ({__tag,value} possibly nested) to a primitive, then canonicalise.
const unwrap = (x) => (x && typeof x === "object" && "value" in x ? unwrap(x.value) : x);
const canon = (v) => { const u = unwrap(v); return typeof u === "boolean" ? (u ? "1" : "0") : String(u); };

// ── run + assert interp ≡ V8 (values AND traps), collect the fixture ─────────────────────────────────────
// MODEL (measured): the interpreter is a faithful oracle for BOTH — a value call must equal V8, and a trap
// class must fail-closed in BOTH (the interpreter raises a runtimeError sentinel; the WASM traps). So the
// binding assertion is symmetric interp≡V8 on every call; the wasmtime leg (tests/corpus_differential.rs)
// then re-verifies each through real wasmtime to close interp ≡ V8 ≡ wasmtime. A trap class where only one
// engine fails-closed is a REAL divergence (exit 1) — that is the fail-closed conformance this proves.
const programs = [];
const divergences = [];
let calls = 0, valueCalls = 0, trapCalls = 0;
mkdirSync(OUT, { recursive: true });
for (const prog of SEED) {
  const u8 = await compile(prog.src, prog.id);
  const rec = { id: prog.id, wasm_file: `${prog.id}.wasm`, flow: "f", calls: [] };
  for (const call of prog.calls) {
    calls++;
    const v8 = v8run(u8, "f", call.args);
    const a = interp(prog.src, "f", call.args, prog.wrap);
    if (prog.trap) {
      trapCalls++;
      if (v8.k !== "TRAP") divergences.push(`${prog.id}(${call.args}): WASM did NOT fail-closed — V8 returned ${v8.k}${v8.k === "VALUE" ? `(${canon(v8.value)})` : ""}`);
      if (a.k !== "TRAP") divergences.push(`${prog.id}(${call.args}): interpreter did NOT fail-closed — computed ${canon(a.value)} where the WASM traps`);
      rec.calls.push({ args: call.args, expect: { trap: true } });
    } else {
      valueCalls++;
      if (v8.k !== "VALUE" || a.k !== "VALUE") divergences.push(`${prog.id}(${call.args}): expected a value, got interp=${a.k}${a.why ? `(${a.why})` : ""} v8=${v8.k}`);
      else if (canon(v8.value) !== canon(a.value)) divergences.push(`${prog.id}(${call.args}): interp≠V8 — interp=${canon(a.value)} v8=${canon(v8.value)}`);
      rec.calls.push({ args: call.args, expect: { trap: false, value: v8.k === "VALUE" ? canon(v8.value) : null } });
    }
  }
  writeFileSync(join(OUT, rec.wasm_file), Buffer.from(u8));
  programs.push(rec);
}

const meta = {
  generated_by: "tools/export-corpus-differential.mjs", rd: "RD-0529 A1",
  programs: programs.length, calls, value_calls: valueCalls, trap_calls: trapCalls,
  note: "interp≡V8 asserted here on every call (values AND fail-closed traps). The wasmtime leg (tests/corpus_differential.rs) re-runs each call through real wasmtime to close interp≡V8≡wasmtime.",
};
writeFileSync(join(OUT, "corpus-differential.json"), JSON.stringify({ meta, programs }, null, 2) + "\n");

console.log(`A1 corpus differential — interp ≡ V8 over ${programs.length} programs / ${calls} calls (${valueCalls} value · ${trapCalls} trap)`);
for (const p of programs) console.log(`  · ${p.id.padEnd(20)} ${p.calls.length} call(s)`);
if (divergences.length) {
  console.error(`\n❌ ${divergences.length} interp≡V8 divergence(s):`);
  for (const d of divergences) console.error(`   ${d}`);
  console.error(`\nFixture NOT trustworthy — refusing (exit 1).`);
  process.exit(1);
}
console.log(`\n✅ interp ≡ V8 on all ${calls} calls: ${valueCalls} values equal, ${trapCalls} trap classes fail-closed in BOTH. Fixture -> ${OUT}`);
console.log(`   ${programs.length} .wasm + corpus-differential.json — ready for the wasmtime leg (tests/corpus_differential.rs).`);
console.log(`SUMMARY: A1 interp≡V8 ${calls}/${calls} calls agree (${valueCalls} value · ${trapCalls} fail-closed) · wasmtime fixture emitted`);
