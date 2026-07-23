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

// ── B1 (RD-0529): root-cause of an INVALID, coarse-bucketed from the `why` this gate already computes.
// This is NOT a re-implementation of wat-invalid-triage (which recovers the EXACT validator reason and the
// deeper A3/A1 classes) — it is a thin bucketing of the message so the ENFORCING gate can track the backlog
// per cause toward closure. The two live root causes across the corpus (measured 2026-07-23: 21 + 4 = 25):
const CAUSES = {
  "undefined-call": "emitter lowers `(call $X)` but never defines/imports $X — needs a faithful standalone lowering OR a host import (per-callee; the `redact` 7180bd04 precedent).",
  "type-mismatch": "an i32 slot/scalar can't hold an f64 → wabt type mismatch (the f64/i32-width class) — owned by audit-wat-lowering.mjs legs B/C (#132 slot-width · #137 Decimal).",
  "other": "neither undefined-call nor width — e.g. a spaced-local (A3) or void-with-result (A1); see wat-invalid-triage for the deep class.",
};
// Two further emitter gaps are known but NOT corpus-present (so not baselined here): `int(float)` → undefined
// `$int` call (an undefined-call instance) and a negative float literal `-1.0` in SOURCE → wabt validate-fail
// (its own bucket). Recorded in RD-0529 A4; they surface only when a corpus example exercises them.
function classifyCause(why) {
  if (/neither defined nor imported/.test(why)) return "undefined-call";
  if (/error:\s*type|type mismatch/i.test(why)) return "type-mismatch";
  return "other";
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

  let u8, asmDiag = [];
  try {
    const b = await L.assembleWAT(wat);                 // MUST await — see discipline 1
    asmDiag = b.diagnostics ?? [];
    // A2 pre-check path (2026-07-xx): assembleWAT returns valid:false + empty wasm when the WAT
    // calls a function that is neither defined nor imported. This is INVALID, not SKIP — the
    // emitter produced a structurally defective module. Bucket it before the <= 8 guard so
    // the self-test's "known-bad" case is not silently reclassified as unassessed.
    if (!b.valid && b.wasm.length === 0 && asmDiag.length > 0) {
      return { k: "INVALID", why: "assembler A2 pre-check: " + asmDiag[0].message.slice(0, 120) };
    }
    // #141: the STUB case — a wabt-rejected module returns the minimal-encoder stub with valid:true PLUS a
    // "NOT a faithful compile" diagnostic (#163). It is >8 bytes and WebAssembly.validate()s, so without
    // this it buckets as VALID — an unfaithful compile counted valid. Branch on b.valid AND b.diagnostics
    // directly (not just size) before touching b.wasm.
    if (!b.valid || (b.diagnostics ?? []).length > 0) {
      return { k: "INVALID", why: "unfaithful assembly (valid but diagnostics): " + (b.diagnostics?.[0]?.message ?? "invalid").slice(0, 120) };
    }
    u8 = b.wasm;
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
    // B1 — the cause classifier must DISCRIMINATE the two live root classes (not lump them / not 'other').
    ["B1 classifyCause: an undefined-callee message → undefined-call",
      classifyCause("assembler A2 pre-check: WAT module calls function(s) that are neither defined nor imported: $gbp") === "undefined-call"],
    ["B1 classifyCause: a wabt type-mismatch message → type-mismatch",
      classifyCause("wabt rejected this WAT: validate failed: galerina.wat:17:6: error: type mismatch") === "type-mismatch"],
    ["B1 classifyCause: an unrecognised reason → other (fail-open into the deep-dive, never silently a known class)",
      classifyCause("some novel emitter failure") === "other"],
    ["B1: the known-bad money-ratio classifies as a real cause, not 'other'", classifyCause(b.why) !== "other"],
  ];
  console.log(`  [good -> ${g.k} ${g.why}]  [bad -> ${b.k} ${b.why}]`);
  let ok = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`); if (!pass) ok = false; }
  console.log(ok ? `self-test ${checks.length}/${checks.length}` : "SELF-TEST FAILED — the gate cannot be trusted");
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
// backward-compat: a baseline entry is either a bare string (pre-B1) or { file, cause } (B1).
const baseEntries = (baseline.invalid || []).map((e) => (typeof e === "string" ? { file: e, cause: null } : e));
const known = new Set(baseEntries.map((e) => e.file));
const knownCause = new Map(baseEntries.map((e) => [e.file, e.cause]));
// current INVALIDs + the cause bucketed from the `why` this gate already produced (B1)
const currentEntries = buckets.INVALID.map(([f, why]) => ({ file: f, cause: classifyCause(why) }));
const current = currentEntries.map((e) => e.file);
const fresh = current.filter((f) => !known.has(f));
const fixed = [...known].filter((f) => !current.includes(f));
const byCause = {};
for (const e of currentEntries) (byCause[e.cause] ??= []).push(e.file);
// cause-DRIFT: a still-invalid baselined file whose cause changed (a "fix" that moved the defect between
// classes — surfaced as a signal, NOT a hard fail; the fresh-file shrink-only below is the enforcing edge).
const drift = currentEntries
  .filter((e) => known.has(e.file) && knownCause.get(e.file) && knownCause.get(e.file) !== e.cause)
  .map((e) => ({ file: e.file, was: knownCause.get(e.file), now: e.cause }));

if (process.argv.includes("--update-baseline")) {
  const entries = currentEntries.slice().sort((a, b) => a.file.localeCompare(b.file));
  writeFileSync(BASELINE, JSON.stringify({ invalid: entries }, null, 2) + "\n");
  const split = Object.entries(byCause).map(([c, l]) => `${c}:${l.length}`).join(" · ");
  console.log(`baseline updated: ${entries.length} known-invalid (${split})`);
  process.exit(0);
}

if (process.argv.includes("--json")) {
  // --json emits ONLY json + exits with the enforcement code (previously fell through to the trailing
  // "VIOLATIONS" text, which broke a strict JSON parse of this gate's output).
  console.log(JSON.stringify({
    counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, v.length])),
    byCause: Object.fromEntries(Object.entries(byCause).map(([c, l]) => [c, l.length])),
    buckets, fresh, fixed, drift,
  }, null, 2));
  process.exit(fresh.length ? 1 : 0);
} else {
  console.log(`audit-wasm-validate — swept ${files.length} .fungi\n`);
  for (const k of ["VALID", "DECLINES", "INVALID", "CHECK-REJECT", "SKIP"]) console.log("  " + k.padEnd(14) + buckets[k].length);
  console.log("\n  SKIP is NOT clean — these are unassessed:");
  for (const [f, w] of buckets.SKIP) console.log("    ? " + f + "   " + w);
  if (buckets.INVALID.length) {
    console.log("\n  INVALID (emitter produced a malformed module):");
    for (const [f, w] of buckets.INVALID) {
      const c = classifyCause(w);
      console.log("    x " + f + `  [${c}]  ` + w + (known.has(f) ? "   [baselined]" : "   *** NEW ***"));
    }
    // B1 — the actionable per-cause split of the backlog toward closure (undefined-call vs f64/i32-width)
    console.log("\n  by root cause (RD-0529 B1):");
    for (const [c, l] of Object.entries(byCause).sort((a, b) => b[1].length - a[1].length))
      console.log(`    ${String(l.length).padStart(3)}  ${c} — ${CAUSES[c] ?? ""}`);
  }
  if (drift.length) {
    console.log(`\n  ⚠ cause-drift (${drift.length}) — a still-invalid baselined file changed root class (a "fix" that moved the defect between classes):`);
    for (const d of drift) console.log(`    ~ ${d.file}   ${d.was} → ${d.now}`);
  }
  if (fixed.length) console.log(`\n  ${fixed.length} baselined file(s) now pass — shrink the baseline: --update-baseline`);
}

if (fresh.length) {
  console.error(`\nVIOLATIONS: ${fresh.length} NEW invalid module(s) — ${fresh.join(", ")}`);
  process.exit(1);
}
console.log(`\nVIOLATIONS: 0  (${known.size} baselined)`);
