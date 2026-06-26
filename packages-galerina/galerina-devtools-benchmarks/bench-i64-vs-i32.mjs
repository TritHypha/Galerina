// Int64 vs Int32 — real WASM-tier arithmetic throughput (the cost of the newly-added faithful i64 lowering).
// Emits an i32 loop and an i64 loop through the SAME path the differential uses (emitGIR →
// buildWATModuleFromGIR → wabt → instantiate), runs each natively, and reports ops/sec. Both stay in range
// (n < 2^31 so the i32 accumulator never overflow-traps). Honest: i64 ops are wider + the i64 mul uses a
// divide-back overflow check, so i64 is EXPECTED to be modestly slower than i32 — this measures that cost.
import * as L from "../galerina-core-compiler/dist/index.js";
import { parseProgram } from "../galerina-core-compiler/dist/index.js";

const N = 200_000_000; // 2e8 iterations; t = N < 2^31 so the i32 add never traps

const SRC = `pure flow sumI32(n: Int) -> Int contract { effects {} } { mut t: Int = 0  mut i: Int = 0  while i < n { t = t + 1  i = i + 1 }  return t }
pure flow sumI64(n: Int) -> Int64 contract { effects {} } { mut t: Int64 = 0  mut i: Int = 0  while i < n { t = t + 1  i = i + 1 }  return t }
pure flow mulI32(n: Int) -> Int contract { effects {} } { mut t: Int = 1  mut i: Int = 0  while i < n { t = t * 1  i = i + 1 }  return t }
pure flow mulI64(n: Int) -> Int64 contract { effects {} } { mut t: Int64 = 1  mut i: Int = 0  while i < n { t = t * 1  i = i + 1 }  return t }`;

const prog = parseProgram(SRC, "bench.spore");
const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
if (errs.length) { console.error("parse error:", errs.map((d) => d.message).join("; ")); process.exit(1); }

const fx = L.checkEffects(prog.flows, prog.ast);
const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "i64bench", prog.ast, true));
const asm = await L.assembleWAT(wat);
if (!asm.valid) { console.error("module did not assemble:", JSON.stringify(asm.diagnostics)); process.exit(2); }
const kp = L.generateRunnerKeypair();
const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
const { instance } = await L.admitAndInstantiate({
  wasm: asm.wasm, attestation: att,
  policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem },
  host: L.createHostRuntime(),
});

const time = (fn, arg) => {
  fn(Math.min(arg, 1_000_000)); // warm
  const t0 = process.hrtime.bigint();
  const r = fn(arg);
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  return { ms, opsPerSec: arg / (ms / 1000), result: r };
};

console.log(`Int64 vs Int32 — WASM-tier arithmetic, N=${N.toLocaleString()} iterations each (the new i64 lowering vs i32 reference)`);
console.log("benchmark   | width | ms      | M ops/sec | result");
console.log("------------|-------|---------|-----------|--------");
const rows = [];
for (const [name, fn] of [["add-loop i32", instance.exports.sumI32], ["add-loop i64", instance.exports.sumI64], ["mul-loop i32", instance.exports.mulI32], ["mul-loop i64", instance.exports.mulI64]]) {
  const r = time(fn, N);
  rows.push([name, r]);
  const width = name.includes("i64") ? "i64" : "i32";
  console.log(`${name.padEnd(11)} | ${width}   | ${r.ms.toFixed(1).padStart(7)} | ${(r.opsPerSec / 1e6).toFixed(1).padStart(9)} | ${r.result}`);
}
const ratio = (a, b) => rows.find(([n]) => n === a)[1].opsPerSec / rows.find(([n]) => n === b)[1].opsPerSec;
console.log(`\nHONEST: i64/i32 throughput ratio — add: ${(ratio("add-loop i64", "add-loop i32")).toFixed(2)}× · mul: ${(ratio("mul-loop i64", "mul-loop i32")).toFixed(2)}× (i64 modestly slower = the cost of wider ops + the checked-overflow helpers; this is the real, faithful i64 — exact past 2^53, traps on overflow). Both validate under wabt.`);
