#!/usr/bin/env node
/**
 * audit-wasm-validate.mjs — corpus-wide "does the emitted module actually VALIDATE?" gate.
 *
 * Provenance: R&D prototype (coordination/to-main/prototypes/, 2026-07-19), owner-directed into
 * the test/audit run. Vendored to scripts/ by main; only BASELINE was adapted to the repo's
 * fixtures convention (ROOT/DIST/SCAN_DIRS were already correct for scripts/ placement). Pairs with
 * scripts/audit-wat-lowering.mjs.
 *
 * WHY: nothing else in the suite assembles the corpus and asks "does the emitted module VALIDATE?".
 * That gap is what hid 052-decimal-basic and 077-money-ratio — both clear checkTypes, verifyGovernance
 * and the security gate, and STILL emit modules WebAssembly.validate rejects. By construction this
 * defect class is invisible to every other gate.
 *
 * DISCIPLINES BAKED IN (each cost a false conclusion this week):
 *   1. `assembleWAT` is ASYNC. Un-awaited, EVERY module "fails validation" — including a known-good
 *      control. The --self-test fails closed if the control ever comes back invalid.
 *   2. SKIP is its own bucket and is NEVER counted clean (the 0/450 vacuous-scan shape).
 *   3. Examples carrying `expected_diagnostics:` are CHECK-REJECT, not INVALID — meant to be refused.
 *   4. Do NOT short-circuit to DECLINES on the presence of `unreachable` — ALWAYS assemble+validate;
 *      "declines" is a sub-label of VALID, never a substitute for checking.
 *
 * RUN:  node scripts/audit-wasm-validate.mjs [--self-test] [--json] [--update-baseline]
 * EXIT: 0 clean · 1 a NEW off-baseline INVALID (or a self-test failure)
 */
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GALERINA_ROOT || join(HERE, "..");
const DIST = `file:///${join(ROOT, "packages-galerina/galerina-core-compiler/dist/index.js").replace(/\\/g, "/")}`;
const BASELINE = join(ROOT, "packages-galerina/galerina-core-compiler/tests/fixtures/wasm-validate-baseline.json");
const SCAN_DIRS = ["docs/examples"];

const L = await import(DIST);

// ── existence-checked anchors: if the API this gate relies on moves, FAIL CLOSED rather than pass ──
for (const [name, ok] of [
  ["assembleWAT exported", typeof L.assembleWAT === "function"],
  ["checkTypes exported", typeof L.checkTypes === "function"],
  ["verifyGovernance exported", typeof L.verifyGovernance === "function"],
  ["buildWATModuleFromGIR exported", typeof L.buildWATModuleFromGIR === "function"],
]) if (!ok) { console.error(`[audit-wasm-validate] ANCHOR GONE: ${name} — refusing to report clean.`); process.exit(1); }

function walk(dir, acc = []) {
  let entries; try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc); else if (e.endsWith(".fungi")) acc.push(p);
  }
  return acc;
}

/**
 * Does a FLOW body fail-close? Two traps live here, both of which bit R&D:
 *  - `;; …traps (unreachable)` is a COMMENT on the checked-arith helper — strip `;;` comments first.
 *  - `$fungi_checked_add_i32` (and friends) legitimately contain `unreachable` for signed-overflow —
 *    exclude compiler-emitted `$fungi_*` helpers. Only an `unreachable` in a user flow body declines.
 */
function declines(wat) {
  const code = wat.replace(/;;[^\n]*/g, "");                       // drop line comments
  for (const chunk of code.split(/\(func\s+/).slice(1)) {
    const name = (/^\$?([A-Za-z0-9_$.]+)/.exec(chunk) || [, ""])[1];
    if (/^fungi_/.test(name)) continue;                            // compiler helper, not a flow
    if (/\bunreachable\b/.test(chunk)) return true;
  }
  return false;
}

async function classify(src, file) {
  const expectsDiag = /^\/\/\/ expected_diagnostics:\s*(?!none)\S/m.test(src);
  const reject = expectsDiag ? "CHECK-REJECT" : null;
  let p;
  try { p = L.parseProgram(src, file, { requireVersionHeader: false }); }
  catch (e) { return { k: reject || "SKIP", why: "parse threw: " + e.message.slice(0, 60) }; }
  if (p.diagnostics.some((d) => d.severity === "error")) return { k: reject || "SKIP", why: "parse error" };

  // the same front-end gate the WASM target runs (cli.ts BK-5/H1/M1) — a file the gate blocks
  // never reaches the emitter in production, so it is not this gate's business.
  let fx;
  try { fx = L.checkEffects(p.flows, p.ast); } catch (e) { return { k: "SKIP", why: "checkEffects threw" }; }
  const gateErrs = [];
  for (const d of L.checkTypes(p.ast).diagnostics) if (d.severity === "error") gateErrs.push(d.code);
  try {
    for (const d of L.verifyGovernance(p.ast, p.flows, fx, "production", file).diagnostics)
      if (d.severity === "error") gateErrs.push(d.code);
  } catch { return { k: "SKIP", why: "verifyGovernance threw" }; }
  if (gateErrs.length) return { k: "CHECK-REJECT", why: [...new Set(gateErrs)].join(",") };

  let wat;
  try {
    const { gir } = L.emitGIR(p.ast, p.flows, fx);
    wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "audit", p.ast, true));
  } catch (e) { return { k: "SKIP", why: "lowering threw: " + e.message.slice(0, 60) }; }

  let u8;
  try {
    const b = await L.assembleWAT(wat);                 // MUST await — see discipline 1
    u8 = b instanceof Uint8Array ? b : new Uint8Array(b?.bytes || b?.wasm || b);
  } catch (e) { return { k: "INVALID", why: "assemble rejected: " + e.message.slice(0, 60) }; }
  // <= 8, not < 8 (R&D 2026-07-19): the bespoke assembler does NOT throw on unparseable WAT — it
  // returns the 8-byte EMPTY module (`\0asm` + version) which WebAssembly.validate() reports TRUE,
  // so a `< 8` check lets an unassembled module bucket as VALID (a fail-open in the fail-open gate).
  // Treat the minimal empty module as unassessed (SKIP), never VALID.
  if (!u8 || u8.length <= 8) return { k: "SKIP", why: "assembler returned only the empty module (unparseable WAT)" };
  if (!WebAssembly.validate(u8)) return { k: "INVALID", why: "failed WebAssembly.validate" };
  return declines(wat) ? { k: "DECLINES", why: "valid module, fail-closed trap in a flow body" } : { k: "VALID", why: "" };
}

// ── self-test: the gate must FIRE on known-bad and stay quiet on known-good ──
if (process.argv.includes("--self-test")) {
  const good = `pure flow f(a: Int, b: Int) -> Int\ncontract { effects {} }\n{ return a + b }`;
  const bad = `pure flow f(revenue: Money<GBP>, cost: Money<GBP>) -> Decimal\ncontract { effects {} }\n{ let r: Decimal = revenue / cost\n  return r }`;
  const g = await classify(good, "good.fungi");
  const b = await classify(bad, "bad.fungi");
  const checks = [
    ["known-good Int flow is VALID (proves assembleWAT is awaited)", g.k === "VALID"],
    ["known-bad money-ratio is INVALID (proves the gate fires)", b.k === "INVALID"],
    ["the two verdicts differ (the projection discriminates)", g.k !== b.k],
  ];
  console.log(`  [good -> ${g.k} ${g.why}]  [bad -> ${b.k} ${b.why}]`);
  let ok = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`); if (!pass) ok = false; }
  console.log(ok ? "self-test 3/3" : "SELF-TEST FAILED — the gate cannot be trusted");
  process.exit(ok ? 0 : 1);
}

const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))).sort();
const buckets = { VALID: [], DECLINES: [], INVALID: [], "CHECK-REJECT": [], SKIP: [] };
for (const abs of files) {
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  let src; try { src = readFileSync(abs, "utf8"); } catch (e) { buckets.SKIP.push([rel, "read " + e.code]); continue; }
  const r = await classify(src, rel);
  buckets[r.k].push([rel, r.why]);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : { invalid: [] };
const known = new Set(baseline.invalid || []);
const current = buckets.INVALID.map(([f]) => f);
const fresh = current.filter((f) => !known.has(f));
const fixed = [...known].filter((f) => !current.includes(f));

if (process.argv.includes("--update-baseline")) {
  writeFileSync(BASELINE, JSON.stringify({ invalid: current.sort() }, null, 2) + "\n");
  console.log(`baseline updated: ${current.length} known-invalid`);
  process.exit(0);
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])), buckets, fresh, fixed }, null, 2));
} else {
  console.log(`audit-wasm-validate — swept ${files.length} .fungi\n`);
  for (const k of ["VALID", "DECLINES", "INVALID", "CHECK-REJECT", "SKIP"]) console.log("  " + k.padEnd(14) + buckets[k].length);
  console.log("\n  SKIP is NOT clean — these are unassessed:");
  for (const [f, w] of buckets.SKIP) console.log("    ? " + f + "   " + w);
  if (buckets.INVALID.length) {
    console.log("\n  INVALID (emitter produced a malformed module):");
    for (const [f, w] of buckets.INVALID) console.log("    x " + f + "   " + w + (known.has(f) ? "   [baselined]" : "   *** NEW ***"));
  }
  if (fixed.length) console.log(`\n  ${fixed.length} baselined file(s) now pass — shrink the baseline: --update-baseline`);
}

if (fresh.length) {
  console.error(`\nVIOLATIONS: ${fresh.length} NEW invalid module(s) — ${fresh.join(", ")}`);
  process.exit(1);
}
console.log(`\nVIOLATIONS: 0  (${known.size} baselined)`);
