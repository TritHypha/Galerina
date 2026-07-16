#!/usr/bin/env node
// audit-dss-wasm-build.mjs — measured, ratcheted R0 build gate for the DSS.wasm modules (RD-0366:
// "measure, don't narrate"; the DSS.wasm supervisor row, task #57).
//
// DSS.wasm (galerina-core-security/src/dss/*.fungi) is the Deterministic Security Supervisor — the
// Wasmtime-TCB component that runs alongside guest DWI isolates (V_DPM register, WASI broker, trap
// routing). Stage-B goal: every module compiles to REAL WASM. This gate MEASURES that R0 state per
// module and RATCHETS it, so a compiler/emitter regression that breaks a module that used to build
// (the INT32_MIN-literal class) is caught RED, not narrated away.
//
// BUILD MODES (the supervisor is multi-module):
//   • standalone — a module with no `import` builds on its own.
//   • bundle     — a module that `import`s siblings is built as a CONCATENATED bundle of its resolved
//     import DAG (the #56 concatenated-twins pattern), so cross-module calls resolve into ONE module.
//
// ★ RESOLVED (2026-07-16 evening): the supervisor bundle now builds IN-BATCH — 10/10, deterministic.
//   The "wabt batch-flake" had TWO stacked causes, both fixed:
//   (1) assembleWAT shared ONE cached wabt (Emscripten) instance across builds → residue; fixed with a
//       fresh toolkit instance per build (factory cached; ~3 ms/instantiation — wat-assembler.ts).
//   (2) The REAL deterministic blocker by fix-time: the P9.4 guarded-body adoption gate accepted
//       PARTIALLY-lowered bodies (inline "#128-sibling" placeholders) that referenced $pN params the
//       GIR signature didn't declare — WAT that does not even PARSE ("undefined local variable $p1",
//       flow checkCapabilityBefore), blocking the whole 16-flow module. The adoption gate now rejects
//       partial bodies fail-closed to the plain `unreachable` stub (wat-emitter.ts, isAdoptableGuardedBody).
//   This gate's 60-char error truncation HID defect (2) behind the flake story — kept at 160 now.
//   Conformance: core-compiler tests/wat-assembler-isolation.test.mjs; the ratchet below owns regression.
//
// Usage:
//   node scripts/audit-dss-wasm-build.mjs --self-test        # prove the detectors fire (CI first)
//   node scripts/audit-dss-wasm-build.mjs                    # enforce: RED if a baselined-building module regresses
//   node scripts/audit-dss-wasm-build.mjs --update-baseline  # re-record (deliberate; diff-reviewed)
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DSS = join(ROOT, "packages-galerina", "galerina-core-security", "src", "dss");
const COMPILER = join(ROOT, "packages-galerina", "galerina-core-compiler", "dist", "index.js");
const BASELINE = join(ROOT, "scripts", "baselines", "dss-wasm-build.json");

const read = (p) => { const s = readFileSync(p, "utf8"); return s.charCodeAt(0) === 0xFEFF ? s.slice(1) : s; };
const importsOf = (src) => [...src.matchAll(/^\s*import\s+"([^"]+)"\s*$/gm)].map((m) => m[1]);

// Resolve a module's import DAG (DFS, dedup, deps-before-dependents) into a single concatenated bundle.
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

async function buildModule(L, name) {
  const abs = join(DSS, name);
  const raw = read(abs);
  const mode = importsOf(raw).length > 0 ? "bundle" : "standalone";
  const source = mode === "bundle" ? bundleFor(abs) : raw;
  try {
    const prog = L.parseProgram(source, name);
    const perr = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
    if (perr.length) return { name, mode, ok: false, why: `parse ${perr[0].code}` };
    const fx = L.checkEffects(prog.flows, prog.ast);
    const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, name.replace(/\.fungi$/, ""), prog.ast, true));
    const asm = await L.assembleWAT(wat);
    if (asm.valid && asm.diagnostics.length === 0) return { name, mode, ok: true, bytes: asm.wasm.length, wasm: asm.wasm };
    // 160 chars: the old 60-char cut hid the ACTUAL wabt error ("undefined local variable $p1")
    // behind the generic "does not link" prefix for a full session. Show enough to diagnose.
    return { name, mode, ok: false, why: `assemble ${JSON.stringify(asm.diagnostics).slice(0, 160)}` };
  } catch (e) { return { name, mode, ok: false, why: `throw ${String(e?.message ?? e).slice(0, 60)}` }; }
}

const loadJson = (p, d) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return d; } };

async function run() {
  if (!existsSync(COMPILER)) { console.error("  dss-wasm-build: core-compiler dist not built — run the suite first"); process.exit(1); }
  const L = await import(pathToFileURL(COMPILER).href);
  const modules = readdirSync(DSS).filter((f) => f.endsWith(".fungi")).sort();
  const results = [];
  for (const m of modules) results.push(await buildModule(L, m));
  return { L, results };
}

if (process.argv.includes("--self-test")) {
  const ok = (c, m) => { console.log(`  ${c ? "✅" : "❌"} ${m}`); if (!c) process.exitCode = 1; };
  const { results } = await run();
  ok(results.length >= 8, `DSS corpus found (${results.length} modules)`);
  ok(results.some((r) => r.name === "dss-supervisor.fungi" && r.mode === "bundle"), "the supervisor is built in BUNDLE mode (import-DAG concatenation)");
  ok(results.filter((r) => r.ok).length >= 8, `≥8 modules build to WASM in-batch (${results.filter((r) => r.ok).length})`);
  // The supervisor bundle — the historical re-entrancy/partial-lowering victim — must build IN-BATCH
  // (resolved 2026-07-16; see header). This is the specific detector for both fixed causes.
  ok(results.some((r) => r.name === "dss-supervisor.fungi" && r.ok), "the supervisor bundle builds IN-BATCH (re-entrancy + partial-lowering fixes hold)");
  // The regression detector must FIRE on a planted un-buildable module (an undefined symbol).
  const bad = await (async () => {
    try {
      const prog = L.parseProgram("@version 1\ngoverned floor_2 flow x() -> Int contract { intent \"y\" effects {} } { return undefinedSibling(1) }", "plant.fungi");
      const fx = L.checkEffects(prog.flows, prog.ast);
      const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
      const asm = await L.assembleWAT(L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "plant", prog.ast, true)));
      return asm.valid && asm.diagnostics.length === 0;
    } catch { return false; }
  })();
  ok(!bad, "detector FIRES on a planted un-buildable module (undefined symbol → not valid WASM)");
  console.log(process.exitCode ? "  dss-wasm-build self-test FAILED" : "  dss-wasm-build self-test: build + bundle-link + regression detector verified ✅");
  process.exit(process.exitCode ?? 0);
}

const { results } = await run();
const building = results.filter((r) => r.ok).map((r) => r.name).sort();
const failing = results.filter((r) => !r.ok);

// Emit the built modules as REAL .wasm artifacts (feasibility artifacts — unsigned, regenerated
// every run, build/ is untracked). A compiled .wasm is NOT proven isolation (#102-106 post-v1);
// the manifest records exactly what was built and its digest so downstream work pins by hash.
{
  const OUT = join(ROOT, "build", "dss-wasm");
  mkdirSync(OUT, { recursive: true });
  const manifest = [];
  for (const r of results) {
    if (!r.ok || !r.wasm) continue;
    const file = r.name.replace(/\.fungi$/, ".wasm");
    writeFileSync(join(OUT, file), Buffer.from(r.wasm));
    manifest.push({ name: file, source: r.name, mode: r.mode, bytes: r.bytes, sha256: createHash("sha256").update(r.wasm).digest("hex") });
  }
  writeFileSync(join(OUT, "manifest.json"), JSON.stringify({
    generated: "audit-dss-wasm-build",
    note: "Feasibility artifacts: real WASM builds of the DSS modules (supervisor = import-DAG bundle). UNSIGNED — admission happens at load via #105; isolation is NOT claimed (Wasmtime TCB #102-106, post-v1).",
    modules: manifest,
  }, null, 2) + "\n");
  console.log(`  artifacts: ${manifest.length} .wasm written to build/dss-wasm/ (+ manifest.json, sha256-pinned)`);
}
for (const r of results) {
  console.log(`  ${r.ok ? "OK  " : "FAIL"} [${r.mode.padEnd(10)}] ${r.name.padEnd(24)} ${r.ok ? r.bytes + " B" : "→ " + r.why}`);
}
console.log(`  dss-wasm-build: ${building.length}/${results.length} modules build to real WASM in-batch`);

if (process.argv.includes("--update-baseline")) {
  mkdirSync(dirname(BASELINE), { recursive: true });
  writeFileSync(BASELINE, JSON.stringify({ note: "DSS modules that build to WASM in-batch (RATCHET: may only GROW — a building module that regresses is RED). Includes dss-supervisor since 2026-07-16 (re-entrancy + partial-lowering fixes).", generated: "audit-dss-wasm-build", building }, null, 2) + "\n");
  console.log(`  baseline recorded: ${building.length} building in-batch.`);
  process.exit(0);
}

const base = loadJson(BASELINE, { building: [] }).building ?? [];
const REGRESSED = base.filter((n) => !building.includes(n));
if (REGRESSED.length) {
  console.error(`\n  ❌ dss-wasm-build: ${REGRESSED.length} module(s) REGRESSED from build → fail:\n${REGRESSED.map((n) => `     ${n}  [${failing.find((f) => f.name === n)?.why ?? "gone"}]`).join("\n")}`);
  console.error(`  A module that used to compile to WASM no longer does — a compiler/emitter regression. Fix it, don't re-baseline.`);
  process.exit(1);
}
const GAINED = building.filter((n) => !base.includes(n));
if (GAINED.length) console.log(`  ↑ ${GAINED.length} newly building since baseline (record with --update-baseline): ${GAINED.join(", ")}`);
console.log(`  ✅ dss-wasm-build: no regression (${building.length} building in-batch, ${base.length} baselined).`);
process.exit(0);
