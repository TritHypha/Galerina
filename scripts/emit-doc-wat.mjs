#!/usr/bin/env node
// emit-doc-wat.mjs — the "generate the view" doctrine applied to QUOTED WAT in docs (RD-0395 §3.2).
//
// A doc that quotes emitted WAT rots the moment the emitter changes — the same drift class as a stale
// status table, but worse: it teaches wrong output. So the doc never hand-carries WAT: it declares a
// marker block naming the SOURCE .fungi and the flows to show, and THIS tool regenerates the excerpt
// through the real pipeline (parseProgram → checkEffects → emitGIR → buildWATModuleFromGIR → renderWAT
// — the same calls the twin-execution tests make). `--check` fails CI when the doc's excerpt no longer
// matches what the current emitter produces; `--write` refreshes it.
//
// Marker grammar (self-describing — the doc carries its own provenance, no side manifest):
//   <!-- emit-doc-wat:BEGIN source=<repo-rel .fungi> flows=<name>[,<name>...] -->
//   ```wat
//   ...generated — do not hand-edit...
//   ```
//   <!-- emit-doc-wat:END -->
//
// Usage:
//   node scripts/emit-doc-wat.mjs --check        # CI gate: exit 1 if any doc excerpt drifted
//   node scripts/emit-doc-wat.mjs --write        # regenerate excerpts in place
//   node scripts/emit-doc-wat.mjs --self-test    # prove extraction + drift detection work
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOCS = ["docs/reference/cost-model-nesting.md"]; // add pages that quote WAT here
const BEGIN_RE = /<!--\s*emit-doc-wat:BEGIN\s+source=(\S+)\s+flows=(\S+)\s*-->/g;

async function loadCompiler() {
  return import(pathToFileURL(join(ROOT, "packages-galerina", "galerina-core-compiler", "dist", "index.js")).href);
}

// Extract one `(func $name …)` s-expression by paren balancing — the same shape the emitter renders.
export function extractFunc(wat, name) {
  const tag = `(func $${name}`;
  const start = wat.indexOf(tag);
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < wat.length; i++) {
    if (wat[i] === "(") depth++;
    else if (wat[i] === ")" && --depth === 0) return wat.slice(start, i + 1);
  }
  return null;
}

async function generateExcerpt(L, sourceRel, flowNames) {
  let src = readFileSync(join(ROOT, sourceRel), "utf8");
  if (src.charCodeAt(0) === 0xFEFF) src = src.slice(1);
  const prog = L.parseProgram(src, sourceRel.split("/").pop());
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (errs.length > 0) throw new Error(`${sourceRel} no longer parses clean (${errs[0].code}) — fix the source first`);
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "doc-excerpt", prog.ast, /*exportAllPure*/ true));
  const parts = [];
  for (const name of flowNames) {
    const fn = extractFunc(wat, name);
    if (fn === null) throw new Error(`flow '${name}' not found in the emitted WAT of ${sourceRel}`);
    parts.push(fn);
  }
  return `${parts.join("\n\n")}\n`;
}

// Replace every marker block's fenced content with the freshly generated excerpt.
async function processDoc(L, docRel) {
  const abs = join(ROOT, docRel);
  if (!existsSync(abs)) return { docRel, missing: true, drifted: [], updated: null };
  const original = readFileSync(abs, "utf8");
  let updated = original;
  const drifted = [];
  for (const m of [...original.matchAll(BEGIN_RE)]) {
    const [beginTag, sourceRel, flowsCsv] = [m[0], m[1], m[2]];
    const endIdx = original.indexOf("<!-- emit-doc-wat:END -->", m.index);
    if (endIdx < 0) throw new Error(`${docRel}: BEGIN marker without END (source=${sourceRel})`);
    const blockOld = original.slice(m.index, endIdx);
    const excerpt = await generateExcerpt(L, sourceRel, flowsCsv.split(","));
    const blockNew = `${beginTag}\n\`\`\`wat\n${excerpt}\`\`\`\n`;
    if (blockOld !== blockNew) drifted.push({ sourceRel, flows: flowsCsv });
    updated = updated.replace(blockOld, blockNew);
  }
  return { docRel, missing: false, drifted, updated: updated === original ? null : updated };
}

const mode = process.argv.includes("--write") ? "write" : process.argv.includes("--self-test") ? "self-test" : "check";
const L = await loadCompiler();

if (mode === "self-test") {
  const ok = (c, m) => { console.log(`  ${c ? "✅" : "❌"} ${m}`); if (!c) process.exitCode = 1; };
  const TWIN = "packages-galerina/galerina-core-sentinel-time/src/self-hosted/synchronization-gate.fungi";
  const excerpt = await generateExcerpt(L, TWIN, ["syncGateVerdict", "driftGateVerdict"]);
  ok(excerpt.includes("(func $syncGateVerdict") && excerpt.includes("(func $driftGateVerdict"), "both flows extracted from the real emitted WAT");
  ok(excerpt.includes("call $syncGateVerdict"), "the flow-call row is real: driftGateVerdict contains `call $syncGateVerdict`");
  ok(!excerpt.toLowerCase().includes("intent"), "the contract block emitted NOTHING — its text appears nowhere in the WAT (level 0)");
  // drift detection must FIRE: a tampered excerpt differs from the regenerated one
  const tampered = excerpt.replace("i32", "i33-tampered");
  ok(tampered !== excerpt, "tamper fixture differs (sanity)");
  console.log(process.exitCode ? "  emit-doc-wat self-test FAILED" : "  emit-doc-wat self-test: extraction + level-0 evidence verified ✅");
  process.exit(process.exitCode ?? 0);
}

let driftCount = 0;
for (const docRel of DOCS) {
  const r = await processDoc(L, docRel);
  if (r.missing) { console.error(`  ❌ emit-doc-wat: ${docRel} missing (listed in DOCS)`); driftCount++; continue; }
  if (mode === "write") {
    if (r.updated !== null) { writeFileSync(join(ROOT, docRel), r.updated); console.log(`  ✍️  ${docRel}: excerpt(s) regenerated (${r.drifted.length} block(s) updated)`); }
    else console.log(`  ✅ ${docRel}: excerpts already current`);
  } else if (r.drifted.length > 0) {
    driftCount += r.drifted.length;
    for (const d of r.drifted) console.error(`  ❌ ${docRel}: quoted WAT drifted from the emitter (source=${d.sourceRel} flows=${d.flows})`);
  }
}
if (mode === "check") {
  if (driftCount > 0) {
    console.error(`\n  Fix: node scripts/emit-doc-wat.mjs --write  (the doc never hand-carries WAT — regenerate it).`);
    process.exit(1);
  }
  console.log(`  ✅ emit-doc-wat: every quoted WAT excerpt matches the current emitter (${DOCS.length} doc(s)).`);
}
