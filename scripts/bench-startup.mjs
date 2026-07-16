#!/usr/bin/env node
// bench-startup.mjs — W1, the start-up/warm-up measurement rig (RD-0401 §build-order rung 1).
// EVERY later warm-ladder rung (W2 slimming, A1 overlap, A2 priming, W3 decision) is measured
// through THIS tool — no number ships without it (RD-0394 law: paired, interleaved, noise-gated).
//
// Modes:
//   node scripts/bench-startup.mjs                 floors: control/help/check interleaved + NOISE GATE
//   node scripts/bench-startup.mjs --phases        in-process phase marks (import·parse·check·emit·wasm·call)
//   node scripts/bench-startup.mjs --modules       --cpu-prof census: TOP MODULES BY SELF-TIME (where the floor lives)
//   node scripts/bench-startup.mjs --graph         MEASURED import graph (nodes=modules+self-ms, edges=imports) → build/bench-startup/
//   node scripts/bench-startup.mjs --self-test     prove the aggregator/emitter/noise-refusal fire correctly
//   [--pairs N]  interleaved sample count per lane (default 7)
//
// Laws honored: RD-0394 (control-lane noise gate — control spread > 10% ⇒ REFUSE, no numbers published);
// path-hygiene (emitted artifacts carry REPO-RELATIVE module paths only — build/ is tracked and the
// path-leak gate scans it); the NODE_COMPILE_CACHE dead end stays closed (not retried here).
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "build", "bench-startup");
const FIXTURE = "tests/patterns/pattern-01-pure-transform.fungi";
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const num = (f, d) => { const i = argv.indexOf(f); const v = i >= 0 ? Number(argv[i + 1]) : NaN; return Number.isFinite(v) && v > 0 ? v : d; };
const NOISE_LIMIT_PCT = 10;

// Repo-relative, forward-slash module label — the ONLY path form that may reach an emitted artifact.
function relModule(url) {
  if (!url) return "(unknown)";
  if (url.startsWith("node:")) return url;
  try {
    const p = url.startsWith("file:") ? fileURLToPath(url) : url;
    const rel = resolve(p).startsWith(ROOT) ? resolve(p).slice(ROOT.length + 1) : "(external)/" + p.split(/[\\/]/).slice(-2).join("/");
    return rel.replace(/\\/g, "/");
  } catch { return "(unparsed)"; }
}

const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const spreadPct = (xs) => { const m = median(xs); const lo = Math.min(...xs), hi = Math.max(...xs); return m > 0 ? ((hi - lo) / m) * 100 : 0; };

function spawnMs(args, env = {}) {
  const t0 = performance.now();
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", env: { ...process.env, ...env }, windowsHide: true });
  const ms = performance.now() - t0;
  return { ms, status: r.status };
}

// ── floors: interleaved control/help/check + the noise gate ─────────────────────────────────────
function runFloors(pairs) {
  const lanes = {
    control: ["-e", "0"],                                    // bare node spawn — the machine-noise reference
    help: ["galerina.mjs", "--help"],
    check: ["galerina.mjs", "check", FIXTURE],
  };
  const samples = { control: [], help: [], check: [] };
  for (const args of Object.values(lanes)) spawnMs(args);   // warm-up round, DISCARDED (first-spawn AV/page-cache jitter)
  for (let i = 0; i < pairs; i++) {                          // interleaved ABC ABC … (RD-0394: pair, don't batch)
    for (const [lane, args] of Object.entries(lanes)) {
      const { ms, status } = spawnMs(args);
      if (lane !== "control" && status !== 0) throw new Error(`${lane} exited ${status}`);
      samples[lane].push(ms);
    }
  }
  const ctlSpread = spreadPct(samples.control);
  if (ctlSpread > NOISE_LIMIT_PCT) {
    console.error(`  ❌ NOISE GATE: control spread ${ctlSpread.toFixed(1)}% > ${NOISE_LIMIT_PCT}% — session unmeasurable, NO numbers published (RD-0394).`);
    process.exit(1);
  }
  console.log(`  noise gate: control spread ${ctlSpread.toFixed(1)}% ≤ ${NOISE_LIMIT_PCT}% — measurable ✅  (n=${pairs}/lane, interleaved)`);
  for (const lane of Object.keys(lanes)) {
    console.log(`  ${lane.padEnd(8)} median ${median(samples[lane]).toFixed(0).padStart(4)} ms · spread ${spreadPct(samples[lane]).toFixed(1)}%`);
  }
  console.log(`  stack floor (check − control): ~${(median(samples.check) - median(samples.control)).toFixed(0)} ms  ·  lazy-help floor: ~${(median(samples.help) - median(samples.control)).toFixed(0)} ms`);
  return samples;
}

// ── phases: in-process marks over the real pipeline ────────────────────────────────────────────
async function runPhases() {
  const marks = [["t0", performance.now()]];
  const L = await import(pathToFileURL(join(ROOT, "packages-galerina", "galerina-core-compiler", "dist", "index.js")).href);
  marks.push(["import-done", performance.now()]);
  const src = readFileSync(join(ROOT, FIXTURE), "utf8");
  const prog = L.parseProgram(src, FIXTURE);
  marks.push(["parse", performance.now()]);
  L.checkTypes(prog.ast, prog.flows);
  const fx = L.checkEffects(prog.flows, prog.ast);
  marks.push(["check", performance.now()]);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "bench", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  marks.push(["emit", performance.now()]);
  let firstCallNote = "";
  if (asm.valid) {
    const kp = L.generateRunnerKeypair();
    const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
    const { instance } = await L.admitAndInstantiate({ wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host: L.createHostRuntime() });
    marks.push(["wasm-instantiate", performance.now()]);
    const exp = Object.entries(instance.exports).find(([, v]) => typeof v === "function");
    if (exp) { try { exp[1](0); } catch { /* a trap is still a completed first call */ } }
    marks.push(["first-call", performance.now()]);
  } else {
    firstCallNote = " (module did not assemble — wasm phases skipped)";
  }
  console.log(`  in-process phase marks (fresh node → real pipeline over ${FIXTURE}):${firstCallNote}`);
  for (let i = 1; i < marks.length; i++) {
    console.log(`    ${marks[i][0].padEnd(17)} +${(marks[i][1] - marks[i - 1][1]).toFixed(1).padStart(7)} ms`);
  }
  console.log(`    TOTAL             ${(marks[marks.length - 1][1] - marks[0][1]).toFixed(1).padStart(8)} ms`);
}

// ── --modules: --cpu-prof census — SELF time per module (where the import floor lives) ─────────
export function aggregateSelfTime(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  const perUrl = new Map();
  const samples = profile.samples ?? [], deltas = profile.timeDeltas ?? [];
  for (let i = 0; i < samples.length; i++) {
    const node = byId.get(samples[i]);
    const url = node?.callFrame?.url || "(v8)";
    perUrl.set(url, (perUrl.get(url) ?? 0) + (deltas[i] ?? 0));
  }
  return [...perUrl.entries()].map(([url, us]) => ({ url, ms: us / 1000 })).sort((a, b) => b.ms - a.ms);
}

function runModules(top = 20) {
  mkdirSync(OUT, { recursive: true });
  const profDir = join(OUT, "_cpuprof");
  rmSync(profDir, { recursive: true, force: true });
  mkdirSync(profDir, { recursive: true });
  const r = spawnSync(process.execPath, ["--cpu-prof", "--cpu-prof-dir", profDir, "galerina.mjs", "check", FIXTURE], { cwd: ROOT, encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`profiled check exited ${r.status}`);
  const profFile = readdirSync(profDir).find((f) => f.endsWith(".cpuprofile"));
  if (!profFile) throw new Error("no .cpuprofile produced");
  const rows = aggregateSelfTime(JSON.parse(readFileSync(join(profDir, profFile), "utf8")));
  const total = rows.reduce((a, x) => a + x.ms, 0);
  console.log(`  module census (self-time, one profiled 'check' run; total sampled ${total.toFixed(0)} ms):`);
  for (const row of rows.slice(0, top)) {
    console.log(`    ${row.ms.toFixed(1).padStart(7)} ms  ${((row.ms / total) * 100).toFixed(1).padStart(5)}%  ${relModule(row.url)}`);
  }
  rmSync(profDir, { recursive: true, force: true }); // raw profile carries absolute paths — never leave it in tracked build/
  return rows;
}

// ── --graph: the MEASURED import graph (nodes=modules+self-ms, edges=real resolutions) ─────────
export function toDot(nodes, edges) {
  const esc = (s) => s.replace(/"/g, "'");
  const lines = ["digraph imports {", "  rankdir=LR;", "  node [shape=box, fontsize=9];"];
  for (const n of nodes) lines.push(`  "${esc(n.id)}" [label="${esc(n.id)}\\n${n.selfMs.toFixed(1)} ms"];`);
  for (const e of edges) lines.push(`  "${esc(e.from)}" -> "${esc(e.to)}";`);
  lines.push("}");
  return lines.join("\n");
}

function runGraph() {
  mkdirSync(OUT, { recursive: true });
  const logPath = join(OUT, "_resolutions.log");
  rmSync(logPath, { force: true });
  const r = spawnSync(process.execPath, ["--import", "./scripts/lib/import-graph-register.mjs", "galerina.mjs", "check", FIXTURE],
    { cwd: ROOT, encoding: "utf8", env: { ...process.env, GALERINA_IMPORT_GRAPH_LOG: logPath }, windowsHide: true });
  if (r.status !== 0) throw new Error(`hooked check exited ${r.status}`);
  const raw = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  const edgeSet = new Set();
  for (const line of raw.split("\n")) {
    const [p, c] = line.split("\t");
    if (!p || !c) continue;
    const from = relModule(p), to = relModule(c);
    if (from.startsWith("scripts/lib/import-graph")) continue; // the rig itself is not part of the graph
    if (from !== to) edgeSet.add(`${from} ${to}`);
  }
  const edges = [...edgeSet].map((k) => { const [from, to] = k.split(" "); return { from, to }; });
  const selfByModule = new Map(runModules(0).map((x) => [relModule(x.url), x.ms]));
  const ids = new Set(edges.flatMap((e) => [e.from, e.to]));
  const nodes = [...ids].map((id) => ({ id, selfMs: selfByModule.get(id) ?? 0 }));
  writeFileSync(join(OUT, "import-graph.json"), JSON.stringify({ generated: "scripts/bench-startup.mjs --graph", fixture: FIXTURE, nodes, edges }, null, 2));
  writeFileSync(join(OUT, "import-graph.dot"), toDot(nodes, edges));
  rmSync(logPath, { force: true }); // raw log carries absolute file:// URLs — scrubbed graph only
  const repoNodes = nodes.filter((n) => !n.id.startsWith("node:") && !n.id.startsWith("(external)"));
  console.log(`  measured import graph: ${nodes.length} modules (${repoNodes.length} in-repo) · ${edges.length} edges → build/bench-startup/import-graph.{json,dot}`);
  console.log(`  heaviest in-repo modules on the check path (W2's dominator-cut input):`);
  for (const n of [...repoNodes].sort((a, b) => b.selfMs - a.selfMs).slice(0, 8)) {
    console.log(`    ${n.selfMs.toFixed(1).padStart(7)} ms  ${n.id}`);
  }
}

// ── --self-test: the detectors must fire (a rig that can't fail is not a measurement) ──────────
function selfTest() {
  const ok = (c, m) => { console.log(`  ${c ? "✅" : "❌"} ${m}`); if (!c) process.exitCode = 1; };
  // (a) census aggregation on a synthetic profile: 2 modules, known deltas.
  const prof = {
    nodes: [{ id: 1, callFrame: { url: "file:///x/a.js" } }, { id: 2, callFrame: { url: "file:///x/b.js" } }],
    samples: [1, 2, 2],
    timeDeltas: [1000, 2000, 3000], // μs
  };
  const rows = aggregateSelfTime(prof);
  ok(rows.length === 2 && rows[0].ms === 5 && rows[0].url.endsWith("b.js"), "census: self-time attributes deltas to the sampled frame (b=5ms > a=1ms)");
  // (b) DOT emitter shape.
  const dot = toDot([{ id: "a", selfMs: 1.5 }], [{ from: "a", to: "b" }]);
  ok(dot.startsWith("digraph imports {") && dot.includes('"a" -> "b"'), "graph: DOT emitter produces the digraph + the edge");
  // (c) the noise refusal fires on a wide-spread control sample.
  ok(spreadPct([10, 10, 25]) > NOISE_LIMIT_PCT, "noise gate: a 150%-spread control sample exceeds the refusal threshold");
  ok(spreadPct([10, 10.2, 10.1]) < NOISE_LIMIT_PCT, "noise gate: a tight control sample passes");
  // (d) path hygiene: relModule never emits an absolute local path.
  ok(!/[A-Za-z]:[\\/]/.test(relModule(pathToFileURL(join(ROOT, "galerina.mjs")).href)), "hygiene: emitted module labels are repo-relative, never absolute");
  console.log(process.exitCode ? "  bench-startup self-test FAILED" : "  bench-startup self-test: aggregator + emitter + noise refusal verified ✅");
  process.exit(process.exitCode ?? 0);
}

if (has("--self-test")) selfTest();
else if (has("--phases")) await runPhases();
else if (has("--modules")) runModules(num("--top", 20));
else if (has("--graph")) runGraph();
else runFloors(num("--pairs", 7));
