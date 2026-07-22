#!/usr/bin/env node
// export-differential-fixture.mjs — emit the DSS.wasm Milestone-1 differential fixture for the
// Rust/wasmtime harness (subprojects/dss-host), from the SAME build + Stage-A oracle the Node
// differential test uses (galerina-core-security/tests/dss-supervisor-wasm-differential.test.mjs):
//   fixtures/supervisor.wasm        — the DSS supervisor module (bytes) the test admits + instantiates
//   fixtures/interned-strings.json  — [{handle,value}] the Rust host seeds so `__str_eq` is faithful
//   fixtures/matrix.json            — the 386 agreement points {flow,args,expected(u32)}
//
// The Rust harness re-runs matrix.json through REAL wasmtime and asserts each result === expected,
// closing U10's engine-transfer gap (Node `WebAssembly` verdict === wasmtime verdict). The `expected`
// values are the Stage-A interpreter's — the exact oracle the Node test proves the Node-WASM equals —
// so a wasmtime match is a THREE-way agreement (interpreter === Node-WASM === wasmtime).
//
// Fixtures are GENERATED (gitignored). Regenerate:  node tools/export-differential-fixture.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..", "..");        // tools -> dss-host -> subprojects -> repo root
const COMPILER = join(ROOT, "packages-galerina", "galerina-core-compiler", "dist", "index.js");
const DSS = join(ROOT, "packages-galerina", "galerina-core-security", "src", "dss");
const OUT = join(HERE, "..", "fixtures");
if (!existsSync(COMPILER)) { console.error(`compiler dist not built: ${COMPILER}\n  run the workspace build first.`); process.exit(1); }
const L = await import(pathToFileURL(COMPILER).href);

// ── import-DAG bundler (verbatim from the differential test) ──
const read = (p) => { const s = readFileSync(p, "utf8"); return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; };
const importsOf = (src) => [...src.matchAll(/^\s*import\s+"([^"]+)"\s*$/gm)].map((m) => m[1]);
function bundleFor(entryAbs) {
  const seen = new Set(), order = [];
  (function load(abs) {
    const key = resolve(abs);
    if (seen.has(key) || !existsSync(key)) return;
    seen.add(key);
    const src = read(key);
    for (const spec of importsOf(src)) load(join(dirname(key), spec));
    order.push(src);
  })(entryAbs);
  const strip = (s) => s.replace(/^\s*import\s+"[^"]+"\s*$/gm, "").replace(/^@version\s+\d+\s*$/gm, "");
  return "@version 1\n" + order.map(strip).join("\n\n");
}
const u32 = (v) => Number(BigInt.asUintN(32, BigInt(v)));

// ── R0/R1 · build the supervisor exactly as the test does ──
const source = bundleFor(join(DSS, "dss-supervisor.fungi"));
const prog = L.parseProgram(source, "dss-supervisor.fungi");
const perr = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
if (perr.length) { console.error(`supervisor bundle parse errors: ${JSON.stringify(perr)}`); process.exit(1); }
const fx = L.checkEffects(prog.flows, prog.ast);
const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "dss-supervisor", prog.ast, /*exportAllPure*/ true));
const asm = await L.assembleWAT(wat);
if (!(asm.valid && asm.diagnostics.length === 0)) { console.error(`assemble failed: ${JSON.stringify(asm.diagnostics)}`); process.exit(1); }

// host runtime + interned strings — seeds the Stage-A oracle AND gives the effect->handle mapping
const host = L.createHostRuntime(undefined, { effectHandlers: { "audit.write": () => 0, "audit.log": () => 0 } });
const interned = L.getInternedStrings();
for (const e of interned) host.seedString(e.handle, e.value);

// ── Stage-A oracle (verbatim shape from the test) ──
const I = (n) => ({ __tag: "int", value: n });
const S = (s) => ({ __tag: "string", value: s });
async function interp(flowName, args) {
  const r = await L.executeFlow(flowName, new Map(args), prog.ast, prog.flows);
  const v = r.value;
  if (v?.__tag === "bool") return v.value ? 1 : 0;
  if (v?.__tag === "int") return u32(v.value);
  throw new Error(`interpreter returned unexpected shape for ${flowName}: ${JSON.stringify(v)}`);
}

// ── the matrix (12 states × 14 effects), identical to the differential test ──
const BIT = { dag: 1 << 8, quarantine: 2 ** 30, emergency: 2 ** 31 };
const INITIAL = 15728895;
const VDPM_STATES = [0, BIT.dag, 1, BIT.dag + 1, BIT.dag + 35, INITIAL, INITIAL + BIT.dag, BIT.dag + BIT.quarantine, BIT.dag + BIT.emergency + 1, BIT.quarantine + BIT.emergency, 4279230464, 4294967295];
const EFFECTS = ["network.outbound", "storage.write", "secret.access", "audit.write", "database.write", "ai.inference", "shell.execute", "native.call", "payment.charge", "pii.read", "phi.read", "phi.write", "unknown.effect", ""];
const H = (s) => host.internString(s); // effect string -> interned i32 handle (the arg the WASM export takes)

const points = [];
for (const eff of EFFECTS) {
  points.push({ flow: "capability_to_bitmask", args: [{ kind: "handle", value: H(eff), str: eff }], expected: await interp("capability_to_bitmask", [["effect", S(eff)]]) });
}
for (const vdpm of VDPM_STATES) {
  for (const eff of EFFECTS) {
    for (const flow of ["vdpm_check", "isCapabilityPermitted"]) {
      points.push({ flow, args: [{ kind: "i32", value: vdpm }, { kind: "handle", value: H(eff), str: eff }], expected: await interp(flow, [["vdpm", I(vdpm)], ["effect", S(eff)]]) });
    }
  }
}
for (const vdpm of VDPM_STATES) {
  for (const flow of ["vdpm_apply_circuit_breaker", "vdpm_enter_quarantine", "vdpm_enter_emergency"]) {
    points.push({ flow, args: [{ kind: "i32", value: vdpm }], expected: await interp(flow, [["vdpm", I(vdpm)]]) });
  }
}

// ── write the fixture (deterministic — no timestamp, so a re-export is byte-stable) ──
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "supervisor.wasm"), Buffer.from(asm.wasm));
writeFileSync(join(OUT, "interned-strings.json"), JSON.stringify(interned, null, 2) + "\n");
const meta = { generated_by: "tools/export-differential-fixture.mjs", source: "dss-supervisor.fungi", wasm_bytes: asm.wasm.length, interned_strings: interned.length, points: points.length };
writeFileSync(join(OUT, "matrix.json"), JSON.stringify({ meta, points }, null, 2) + "\n");

console.log(`fixture -> ${OUT}`);
console.log(`  supervisor.wasm        ${asm.wasm.length} bytes`);
console.log(`  interned-strings.json  ${interned.length} entries`);
console.log(`  matrix.json            ${points.length} points`);
if (points.length < 380) { console.error(`FAIL: only ${points.length} points (<380) — matrix incomplete`); process.exit(1); }
console.log(`M1 fixture ready — ${points.length} points for the wasmtime harness.`);
