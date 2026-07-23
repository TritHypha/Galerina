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
  // ── float determinism (RD-0529 A2) ───────────────────────────────────────────────────────────────────
  // Galerina traps any NON-FINITE float result ($fungi_assert_finite_f64: (v-v)≠0 ⟹ unreachable), so a
  // NaN or ±Inf can NEVER reach the boundary — A2's "cross-engine NaN-payload" question is MOOT by design.
  // What A2 proves here instead: (a) that fail-closed non-finite TRAP is ENGINE-CONSISTENT (interp≡V8≡
  // wasmtime all trap on a would-be NaN/+Inf/-Inf), and (b) finite + SUBNORMAL floats are BIT-identical
  // across the three engines (no flush-to-zero divergence). The tricky f64 values are passed as runtime
  // ARGS, never source literals, so they dodge the neg-float-literal + int()-cast emitter gaps (reported
  // to R&D separately).
  { id: "float-nonfinite-trap", ...bin("Float", "/", F)("Float", "Float"), trap: true, calls: [{ args: [0.0, 0.0] }, { args: [1.0, 0.0] }, { args: [-1.0, 0.0] }] }, // NaN · +Inf · -Inf ⟹ all fail-closed
  { id: "float-precision-bits", ...bin("Float", "+", F)("Float", "Float"), calls: [{ args: [0.1, 0.2] }, { args: [1000000000000000.0, 1.0] }, { args: [1e-300, 1e-300] }] }, // 0.1+0.2 = 0x3fd3333333333334 exactly
  { id: "float-subnormal-bits", ...bin("Float", "*", F)("Float", "Float"), calls: [{ args: [5e-324, 2.0] }, { args: [1e-320, 4.0] }] }, // smallest subnormals — preserved, not flushed
  // ── i64 / u64 (RD-0529 A1 later rung): BigInt-exact args, via the ASYNC executeFlow interp path (the sync
  //    fast-path returns null for i64). The u64 cases pass 2^64-1 (all bits set) as an arg — a SIGNED lowering
  //    reads it as -1 and gets the wrong quotient/remainder/compare; i64.div_u/rem_u/gt_u are what they pin.
  //    Results are chosen < 2^63 so there is no result-side signedness ambiguity in this rung.
  { id: "i64-add-beyond-2p53", ...bin("Int64", "+", I)("Int64", "Int64"), calls: [{ args: [9007199254740993n, 2n] }, { args: [-9007199254740993n, -2n] }] }, // exact past the JS-double limit
  { id: "i64-div-trunc", ...bin("Int64", "/", I)("Int64", "Int64"), calls: [{ args: [1000000000007n, 3n] }, { args: [-7n, 2n] }] },
  { id: "i64-mod", ...bin("Int64", "%", I)("Int64", "Int64"), calls: [{ args: [1000000000007n, 3n] }] },
  { id: "u64-div-high-bit", ...bin("UInt64", "/", I)("UInt64", "UInt64"), calls: [{ args: [18446744073709551615n, 2n] }] }, // 2^64-1 / 2 = 2^63-1 (a signed lowering gives 0)
  { id: "u64-mod-high-bit", ...bin("UInt64", "%", I)("UInt64", "UInt64"), calls: [{ args: [18446744073709551615n, 10n] }] }, // 2^64-1 % 10 = 5
  { id: "u64-cmp-high-bit", ...bin("Bool", ">", I)("UInt64", "UInt64"), calls: [{ args: [18446744073709551615n, 1n] }] }, // 2^64-1 > 1 = true (a signed lowering gives false)
  // ── i64 / u64 OVERFLOW-trap rung (RD-0529 A1): the checked 64-bit helpers ($fungi_checked_{add,sub,mul}_{i64,u64},
  //    wat-emitter INT64/UINT64_ARITH_WAT) TRAP on 64-bit overflow — extending the i32 fail-closed story to the
  //    lifted 64-bit widths. MEASURED, refuting a first hypothesis: I expected the interpreter to use UNBOUNDED
  //    BigInt (⟹ compute 2^63 where the WASM traps ⟹ a wasmEnforcedTrap divergence). It does NOT — the interp
  //    BOUNDS Int64/UInt64 and raises the IntegerOverflow sentinel, so every 64-bit overflow is a SYMMETRIC three-way
  //    trap (interp≡V8≡wasmtime all fail-closed), exactly like i32. Each case pins a distinct checked helper.
  { id: "i64-add-overflow", ...bin("Int64", "+", I)("Int64", "Int64"), trap: true, calls: [{ args: [9223372036854775807n, 1n] }] }, // i64_max + 1 ⟹ checked_add_i64 traps
  { id: "i64-sub-overflow", ...bin("Int64", "-", I)("Int64", "Int64"), trap: true, calls: [{ args: [-9223372036854775808n, 1n] }] }, // i64_min - 1 ⟹ checked_sub_i64 traps
  { id: "i64-mul-overflow", ...bin("Int64", "*", I)("Int64", "Int64"), trap: true, calls: [{ args: [9223372036854775807n, 2n] }] }, // i64_max * 2 ⟹ checked_mul_i64 traps
  { id: "u64-add-overflow", ...bin("UInt64", "+", I)("UInt64", "UInt64"), trap: true, calls: [{ args: [18446744073709551615n, 1n] }] }, // 2^64-1 + 1 ⟹ checked_add_u64 traps (no silent wrap)
  // ── D1 (RD-0529): the `invariant { ensure … }` postcondition is a RUNTIME fail-closed trap in standalone
  //    WASM (MEASURED — not static-only as the parser comment suggests: a violated ensure lowers to a runtime
  //    check + unreachable). This proves the fail-closed contract is engine-consistent for a governance-adjacent
  //    class beyond overflow/÷0/non-finite. (Non-exhaustive match is COMPILE-caught FUNGI-MATCH-001, not a
  //    runtime trap; capability-deny is DSS/governance — M1's domain. Neither is a standalone-flow runtime trap.)
  // MEASURED, precised by R&D #0067: an `invariant { ensure … }` violation is scope-specific across engines —
  //   the production WASM traps on ALL ensures, but the Stage-A interpreter enforces ONLY output-postconditions
  //   (`ensure result …`, checkOutputPostconditions interpreter.ts:1487), NOT parameter/pre-condition ensures
  //   (`ensure a …`, which reference a param — outside that scope). So the corpus pins BOTH classes:
  //   ● param/pre-condition `ensure a > 0` → WASM enforces, interp does NOT ⟹ wasmEnforcedTrap (V8≡wasmtime
  //     trap; interp non-enforcement RECORDED, never asserted — forward-safe if the interp is later fixed).
  //   ● output-postcondition `ensure result > 0` → interp AND WASM both enforce ⟹ a SYMMETRIC three-way trap.
  //   Together they make the divergence precise (result vs param), not the blanket claim my first pass wrote.
  { id: "ensure-param-precond-trap", src: `pure flow f(a: Int) -> Int\ncontract { effects {} invariant { ensure a > 0 } }\n{ return a }`, wrap: I, wasmEnforcedTrap: true, calls: [{ args: [-5] }, { args: [0] }] },
  { id: "ensure-param-precond-pass", src: `pure flow f(a: Int) -> Int\ncontract { effects {} invariant { ensure a > 0 } }\n{ return a }`, wrap: I, calls: [{ args: [5] }, { args: [1] }] }, // satisfied ⟹ interp≡V8 both return
  { id: "ensure-result-postcond-trap", src: `pure flow f(a: Int) -> Int\ncontract { effects {} invariant { ensure result > 0 } }\n{ return a }`, wrap: I, trap: true, calls: [{ args: [-5] }, { args: [0] }] }, // violated ⟹ interp≡V8≡wasmtime ALL trap
  { id: "ensure-result-postcond-pass", src: `pure flow f(a: Int) -> Int\ncontract { effects {} invariant { ensure result > 0 } }\n{ return a }`, wrap: I, calls: [{ args: [5] }, { args: [1] }] }, // satisfied ⟹ all return
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

// ── interpreter (Stage-A) via ASYNC executeFlow. { k:"VALUE",value } | { k:"TRAP" } ──
// executeFlow, NOT executeFlowSync: the sync fast-path returns null for i64/u64 (interpreter.ts doc: "if the
// sync interpreter cannot handle it, returns null"), so it can't surface an i64 flow return — but the async
// path CAN ({__tag:"int64"|"uint64", value:bigint}), which keeps the i64 rung three-way. executeFlow returns
// a richer envelope { value:<boxed>, audit:{result}, … }; the boxed result is at r.value.
async function interp(src, flow, args, wrap) {
  try {
    const p = L.parseProgram(src, "x.fungi", { requireVersionHeader: false });
    // .match (not .matchAll): matchAll throws on a non-global regex. First `(...)` = the flow params.
    const names = (src.match(/\(([^)]*)\)/)?.[1] ?? "").split(",").map((s) => s.trim().split(":")[0].trim()).filter(Boolean);
    const m = new Map();
    args.forEach((v, i) => { if (names[i]) m.set(names[i], wrap(v)); });
    const r = await L.executeFlow(flow, m, p.ast, p.flows);
    if (r == null) return { k: "TRAP", why: "declined" };
    // fail-closed: the runtimeError sentinel is NESTED at r.value (IntegerOverflow / DivisionByZero / …), and
    // the audit envelope marks result:"error". Either signals a TRAP, not a value.
    if (r.audit?.result === "error" || (r.value && typeof r.value === "object" && r.value.__tag === "runtimeError")) {
      return { k: "TRAP", why: r.value?.message || "runtimeError" };
    }
    return { k: "VALUE", value: r.value }; // r.value is the boxed {__tag,value}; canon()/unwrap() reduce it
  } catch { return { k: "TRAP", why: "interp" }; }
}

// fully unwrap a boxed runtime value ({__tag,value} possibly nested) to a primitive, then canonicalise.
const unwrap = (x) => (x && typeof x === "object" && "value" in x ? unwrap(x.value) : x);
const canon = (v) => { const u = unwrap(v); return typeof u === "boolean" ? (u ? "1" : "0") : String(u); };
// f64 bit pattern (hex) of a value coerced to double — the BIT-exact key the wasmtime leg compares floats by
// (== would treat -0.0 as 0.0 and can't express A2's "bit-identical" claim; a bit key is unambiguous).
const f64bits = (v) => "0x" + new BigUint64Array(new Float64Array([Number(unwrap(v))]).buffer)[0].toString(16).padStart(16, "0");

// ── run + assert interp ≡ V8 (values AND traps), collect the fixture ─────────────────────────────────────
// MODEL (measured): the interpreter is a faithful oracle for BOTH — a value call must equal V8, and a trap
// class must fail-closed in BOTH (the interpreter raises a runtimeError sentinel; the WASM traps). So the
// binding assertion is symmetric interp≡V8 on every call; the wasmtime leg (tests/corpus_differential.rs)
// then re-verifies each through real wasmtime to close interp ≡ V8 ≡ wasmtime. A trap class where only one
// engine fails-closed is a REAL divergence (exit 1) — that is the fail-closed conformance this proves.
const programs = [];
const divergences = [];
const interpNotEnforcing = []; // wasmEnforcedTrap cases where the interp returned a value instead of trapping (the finding)
let calls = 0, valueCalls = 0, trapCalls = 0, wasmEnforcedCalls = 0;
mkdirSync(OUT, { recursive: true });
for (const prog of SEED) {
  const u8 = await compile(prog.src, prog.id);
  const rec = { id: prog.id, wasm_file: `${prog.id}.wasm`, flow: "f", calls: [] };
  for (const call of prog.calls) {
    calls++;
    const v8 = v8run(u8, "f", call.args);
    const a = await interp(prog.src, "f", call.args, prog.wrap);
    // BigInt args (i64/u64) can't be JSON'd — store them as strings; the Rust leg parses per the module's param type.
    const argsJson = call.args.map((x) => (typeof x === "bigint" ? x.toString() : x));
    if (prog.wasmEnforcedTrap) {
      // WASM-ENFORCED trap (D1): the WASM engines enforce a fail-closed trap the interpreter does NOT. Assert
      // V8 traps (the fail-closed contract; wasmtime re-verifies via expect.trap); RECORD the interp
      // non-enforcement informationally (forward-safe — never asserted, so an interp fix just drops the count).
      wasmEnforcedCalls++;
      if (v8.k !== "TRAP") divergences.push(`${prog.id}(${call.args}): WASM did NOT enforce the invariant — V8 returned ${v8.k}${v8.k === "VALUE" ? `(${canon(v8.value)})` : ""}`);
      if (a.k !== "TRAP") interpNotEnforcing.push(`${prog.id}(${call.args}): interp returned ${a.k === "VALUE" ? canon(a.value) : a.k} where the WASM enforces the fail-closed trap`);
      rec.calls.push({ args: argsJson, expect: { trap: true } });
    } else if (prog.trap) {
      trapCalls++;
      if (v8.k !== "TRAP") divergences.push(`${prog.id}(${call.args}): WASM did NOT fail-closed — V8 returned ${v8.k}${v8.k === "VALUE" ? `(${canon(v8.value)})` : ""}`);
      if (a.k !== "TRAP") divergences.push(`${prog.id}(${call.args}): interpreter did NOT fail-closed — computed ${canon(a.value)} where the WASM traps`);
      rec.calls.push({ args: argsJson, expect: { trap: true } });
    } else {
      valueCalls++;
      if (v8.k !== "VALUE" || a.k !== "VALUE") divergences.push(`${prog.id}(${call.args}): expected a value, got interp=${a.k}${a.why ? `(${a.why})` : ""} v8=${v8.k}`);
      else if (canon(v8.value) !== canon(a.value)) divergences.push(`${prog.id}(${call.args}): interp≠V8 — interp=${canon(a.value)} v8=${canon(v8.value)}`);
      rec.calls.push({ args: argsJson, expect: { trap: false, value: v8.k === "VALUE" ? canon(v8.value) : null, f64bits: v8.k === "VALUE" ? f64bits(v8.value) : null } });
    }
  }
  writeFileSync(join(OUT, rec.wasm_file), Buffer.from(u8));
  programs.push(rec);
}

const meta = {
  generated_by: "tools/export-corpus-differential.mjs", rd: "RD-0529 A1+A2+D1",
  programs: programs.length, calls, value_calls: valueCalls, trap_calls: trapCalls,
  wasm_enforced_trap_calls: wasmEnforcedCalls, interp_not_enforcing: interpNotEnforcing.length,
  note: "interp≡V8 asserted for value + symmetric-trap calls; wasmEnforcedTrap (D1) calls assert V8 traps only (the interp does not enforce the invariant — recorded, not asserted). The wasmtime leg re-runs each call to close V8≡wasmtime (and interp for the symmetric classes).",
};
writeFileSync(join(OUT, "corpus-differential.json"), JSON.stringify({ meta, programs }, null, 2) + "\n");

console.log(`A1 corpus differential — ${programs.length} programs / ${calls} calls (${valueCalls} value · ${trapCalls} symmetric-trap · ${wasmEnforcedCalls} wasm-enforced-trap)`);
for (const p of programs) console.log(`  · ${p.id.padEnd(22)} ${p.calls.length} call(s)`);
if (interpNotEnforcing.length) {
  console.log(`\n  FINDING (D1) — the WASM engines enforce a fail-closed trap the INTERPRETER does not (${interpNotEnforcing.length} call(s)):`);
  for (const f of interpNotEnforcing) console.log(`    · ${f}`);
  console.log(`    SCOPE (R&D #0067): only PARAMETER/pre-condition ensures (\`ensure a\`) are WASM-lowering-only — the interp`);
  console.log(`    DOES enforce OUTPUT-postconditions (\`ensure result\`), proven by the symmetric ensure-result-postcond cases.`);
  console.log(`    Whether Stage-A should ALSO enforce pre-conditions is the owner spec question (RD-0529 A7; R&D lean: gap-to-close, low urgency).`);
}
if (divergences.length) {
  console.error(`\n❌ ${divergences.length} divergence(s) (interp≠V8 value, or a WASM engine that did NOT fail-closed):`);
  for (const d of divergences) console.error(`   ${d}`);
  console.error(`\nFixture NOT trustworthy — refusing (exit 1).`);
  process.exit(1);
}
console.log(`\n✅ ${valueCalls} values interp≡V8 · ${trapCalls} symmetric traps fail-closed in BOTH · ${wasmEnforcedCalls} wasm-enforced traps V8-fail-closed. Fixture -> ${OUT}`);
console.log(`   ${programs.length} .wasm + corpus-differential.json — ready for the wasmtime leg (tests/corpus_differential.rs).`);
console.log(`SUMMARY: A1/A2/D1 ${calls} calls (${valueCalls} value · ${trapCalls} sym-trap · ${wasmEnforcedCalls} wasm-enforced-trap) · ${interpNotEnforcing.length} interp-non-enforce findings · fixture emitted`);
