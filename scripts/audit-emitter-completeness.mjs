#!/usr/bin/env node
// =============================================================================
// audit-emitter-completeness.mjs — RD-0529 B2: the standalone-emitter completeness matrix
// =============================================================================
// WHY: nothing gives an HONEST, per-construct "how complete is the standalone WAT emitter?" view.
// component-health hand-types a WAT-emitter %; audit-wasm-validate sweeps docs/examples per-FILE for
// validity but has no per-CONSTRUCT rollup and never checks for host imports. This tool classifies a
// CURATED construct inventory through the SAME front-end gate + emitter the wasm target runs, into a
// taxonomy MEASURED from the emitter's actual behaviour (2026-07-23), and derives the completeness %
// from that classification (a checkable ladder — never a hand-typed number).
//
// TAXONOMY (measured, not the R&D-proposed labels adopted on faith — rule: a proposal is not verified):
//   standalone-valid  — valid module · 0 host imports · no fail-closed `unreachable` in a flow body ·
//                        callable in V8 with an empty import object. The emitter FULLY + self-containedly
//                        lowers it. (int/float/i64/bool/record-read/string/money-add)
//   fail-closed       — valid module · 0 imports · a fail-closed `unreachable` in a flow body: the emitter
//                        lowers to a module that TRAPS rather than compute (a SAFE partial). (ensure, decimal)
//   host-import       — valid module that DECLARES >=1 import (needs a host). ** MEASURED EMPTY 2026-07-23 **
//                        — the emitter emits NO declared imports; effectful/opaque constructs decline or emit
//                        undefined-calls instead. Kept as a class so the day one appears, it is visible.
//   emitter-invalid   — reaches the emitter but the module is MALFORMED/UNFAITHFUL (undefined-call, the #141
//                        minimal-encoder stub, or fails WebAssembly.validate): the GAP class. (money-ratio 077)
//   gate-refused      — the FRONT-END (checkTypes/verifyGovernance) refuses it; it never reaches the emitter.
//                        A separate axis from emitter completeness — reported, but excluded from the % base.
//   parse-skip        — unparseable / anchor-not-exercised (never counted clean).
// (R&D's "walker" class was NOT observed as a standalone-emitter signal — see RD-0529 bridge #0072/A8.)
//
// completeness% = standalone-valid / (constructs that REACH the emitter) — i.e. total minus gate-refused
// and parse-skip. fail-closed + host-import + emitter-invalid are the not-yet-complete remainder.
//
// Ratchet: baseline is the exact {id: class} map. A construct that REGRESSES (drops emitter-completeness
// rank, e.g. standalone-valid -> emitter-invalid) fails the gate. An IMPROVEMENT or a NEW construct is a
// note prompting --update-baseline (additive, never a silent pass).
//
// RUN:  node scripts/audit-emitter-completeness.mjs [--self-test] [--json] [--update-baseline]
// EXIT: 0 clean · 1 a construct regressed (or a self-test/anchor failure)
// =============================================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "packages-galerina/galerina-core-compiler/dist/index.js");
const BASELINE = join(ROOT, "packages-galerina/galerina-core-compiler/tests/fixtures/emitter-completeness-baseline.json");

const argv = new Set(process.argv.slice(2));
const JSON_OUT = argv.has("--json");
const SELF_TEST = argv.has("--self-test");
const UPDATE = argv.has("--update-baseline");

const L = await import(pathToFileURL(DIST).href);
// existence-checked anchors: if the emitter API this gate drives moves, FAIL CLOSED, never report clean.
for (const [name, ok] of [
  ["parseProgram", typeof L.parseProgram === "function"],
  ["checkEffects", typeof L.checkEffects === "function"],
  ["checkTypes", typeof L.checkTypes === "function"],
  ["verifyGovernance", typeof L.verifyGovernance === "function"],
  ["emitGIR", typeof L.emitGIR === "function"],
  ["buildWATModuleFromGIR", typeof L.buildWATModuleFromGIR === "function"],
  ["renderWAT", typeof L.renderWAT === "function"],
  ["assembleWAT", typeof L.assembleWAT === "function"],
]) if (!ok) { console.error(`[audit-emitter-completeness] ANCHOR GONE: ${name} — refusing to report clean.`); process.exit(2); }

// ── the class lattice (higher = more complete). A drop in rank between runs is a regression. ──
const RANK = { "standalone-valid": 4, "fail-closed": 3, "host-import": 2, "emitter-invalid": 1, "gate-refused": 0, "parse-skip": 0 };
const REACHES_EMITTER = new Set(["standalone-valid", "fail-closed", "host-import", "emitter-invalid"]);

// ── declines: an `unreachable` in a NON-helper flow body (audit-wasm-validate's predicate, shared shape) ──
function declines(wat) {
  const code = wat.replace(/;;[^\n]*/g, "");
  return code.split(/\(func\s+/).slice(1).some((chunk) => {
    const nm = (/^\$?([A-Za-z0-9_$.]+)/.exec(chunk) || [, ""])[1];
    return !/^fungi_/.test(nm) && /\bunreachable\b/.test(chunk);
  });
}

// ── classify ONE construct through the real front-end gate + emitter ──────────────────────────────────
async function classify(src, id) {
  let p;
  try { p = L.parseProgram(src, `${id}.fungi`, { requireVersionHeader: false }); }
  catch (e) { return { cls: "parse-skip", why: "parse threw: " + e.message.slice(0, 50) }; }
  if (p.diagnostics.some((d) => d.severity === "error")) return { cls: "parse-skip", why: "parse error" };
  let fx;
  try { fx = L.checkEffects(p.flows, p.ast); } catch { return { cls: "parse-skip", why: "checkEffects threw" }; }
  const gate = [];
  try {
    for (const d of L.checkTypes(p.ast).diagnostics) if (d.severity === "error") gate.push(d.code);
    for (const d of L.verifyGovernance(p.ast, p.flows, fx, "production", `${id}.fungi`).diagnostics) if (d.severity === "error") gate.push(d.code);
  } catch { return { cls: "parse-skip", why: "gate threw" }; }
  if (gate.length) return { cls: "gate-refused", why: [...new Set(gate)].join(",") };
  let wat;
  try {
    const { gir } = L.emitGIR(p.ast, p.flows, fx);
    wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, id.replace(/[^a-zA-Z0-9_]/g, "_"), p.ast, true));
  } catch (e) { return { cls: "emitter-invalid", why: "lowering threw: " + e.message.slice(0, 50) }; }
  let b;
  try { b = await L.assembleWAT(wat); }              // MUST await (audit-wasm-validate discipline 1)
  catch (e) { return { cls: "emitter-invalid", why: "assemble threw: " + e.message.slice(0, 50) }; }
  const diags = b.diagnostics ?? [];
  const u8 = b.wasm instanceof Uint8Array ? b.wasm : new Uint8Array(b.wasm ?? []);
  if (!b.valid && u8.length === 0 && diags.length) return { cls: "emitter-invalid", why: "A2 pre-check: " + diags[0].message.slice(0, 80) };
  if (!b.valid || diags.length) return { cls: "emitter-invalid", why: "unfaithful (#141 stub): " + (diags[0]?.message ?? "invalid").slice(0, 80) };
  if (u8.length <= 8) return { cls: "emitter-invalid", why: "empty module (unassembled WAT)" };
  if (!WebAssembly.validate(u8)) return { cls: "emitter-invalid", why: "failed WebAssembly.validate" };
  // valid module — split host-import / fail-closed / standalone-valid
  let imports = 0;
  try { imports = WebAssembly.Module.imports(new WebAssembly.Module(u8)).length; } catch { imports = (wat.match(/\(import\s/g) || []).length; }
  if (imports > 0) return { cls: "host-import", why: `${imports} import(s)` };
  if (declines(wat)) return { cls: "fail-closed", why: "valid module, fail-closed trap in a flow body" };
  // standalone-valid — confirm it actually instantiates + exports a callable with no imports
  try {
    const inst = new WebAssembly.Instance(new WebAssembly.Module(u8), {});
    const fn = inst.exports.f ?? Object.values(inst.exports).find((v) => typeof v === "function");
    if (typeof fn !== "function") return { cls: "fail-closed", why: "valid but no callable export" };
  } catch (e) { return { cls: "emitter-invalid", why: "instantiate failed: " + e.message.slice(0, 40) }; }
  return { cls: "standalone-valid", why: "" };
}

const C = "contract { effects {} }";
const bin = (ret, a, bT, op) => `pure flow f(a: ${a}, b: ${bT}) -> ${ret}\n${C}\n{ return a ${op} b }`;
// ── curated construct inventory (rung 1: inline-verified exemplars covering every class). match/tensor/
//    duration need corpus-example probes (their real syntax lives in docs/examples) — a later rung. ──
const INVENTORY = [
  { id: "int-add",       group: "arithmetic", src: bin("Int", "Int", "Int", "+") },
  { id: "float-add",     group: "arithmetic", src: bin("Float", "Float", "Float", "+") },
  { id: "int64-add",     group: "arithmetic", src: bin("Int64", "Int64", "Int64", "+") },
  { id: "uint64-div",    group: "arithmetic", src: bin("UInt64", "UInt64", "UInt64", "/") },
  { id: "bool-cmp",      group: "comparison", src: bin("Bool", "Int", "Int", "<") },
  { id: "record-read",   group: "aggregate",  src: `record R { a: Int, b: Int }\npure flow f(r: R) -> Int\n${C}\n{ return r.a }` },
  { id: "string-id",     group: "text",       src: `pure flow f(s: String) -> String\n${C}\n{ return s }` },
  { id: "money-add",     group: "value-unit", src: bin("Money<GBP>", "Money<GBP>", "Money<GBP>", "+") },
  { id: "ensure-result", group: "contract",   src: `pure flow f(a: Int) -> Int\ncontract { effects {} invariant { ensure result > 0 } }\n{ return a }` },
  { id: "decimal-add",   group: "value-unit", src: bin("Decimal", "Decimal", "Decimal", "+") },
  { id: "money-ratio",   group: "value-unit", src: `pure flow f(revenue: Money<GBP>, cost: Money<GBP>) -> Decimal\n${C}\n{ let r: Decimal = revenue / cost\n  return r }` },
  { id: "type-mismatch", group: "front-end",  src: `pure flow f() -> Int\n${C}\n{ return "not an int" }` },
  { id: "io-effect",     group: "effect",     src: `flow f(s: String) -> Int\ncontract { effects { io } }\n{ return 0 }` },
];

// ── self-test: one exemplar per class must classify as that class; the % must be derived, not constant ──
async function selfTest() {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else { fail++; console.log(`  ✗ ${m}`); } };
  const cl = async (src, id) => (await classify(src, id)).cls;
  ok(await cl(bin("Int", "Int", "Int", "+"), "t-valid") === "standalone-valid", "standalone-valid: int-add");
  ok(await cl(`pure flow f(a: Int) -> Int\ncontract { effects {} invariant { ensure result > 0 } }\n{ return a }`, "t-fc") === "fail-closed", "fail-closed: a violated-able ensure lowers to a trap");
  ok(await cl(`pure flow f(revenue: Money<GBP>, cost: Money<GBP>) -> Decimal\n${C}\n{ let r: Decimal = revenue / cost\n  return r }`, "t-inv") === "emitter-invalid", "emitter-invalid: money-ratio (the 077 gap)");
  ok(await cl(`pure flow f() -> Int\n${C}\n{ return "x" }`, "t-gate") === "gate-refused", "gate-refused: a String-for-Int return is refused by the front-end");
  // the completeness % must MOVE when the classification moves (not a hand-typed constant)
  const invAllValid = [{ id: "a", src: bin("Int", "Int", "Int", "+") }];
  const invHalf = [{ id: "a", src: bin("Int", "Int", "Int", "+") }, { id: "b", src: `pure flow f(revenue: Money<GBP>, cost: Money<GBP>) -> Decimal\n${C}\n{ let r: Decimal = revenue / cost\n  return r }` }];
  const p1 = await completeness(invAllValid), p2 = await completeness(invHalf);
  ok(p1.pct === 100 && p2.pct === 50, `derived %: all-valid=100 (${p1.pct}) · half-invalid=50 (${p2.pct}) — % tracks the classification`);
  // host-import class is (measured) empty across the inventory — assert the finding holds so a silent
  // appearance of an import is surfaced, and a regression that starts emitting spurious imports is caught.
  const rows = await runInventory();
  ok(rows.every((r) => r.cls !== "host-import"), "FINDING holds: no construct emits a declared host import (host-import class empty)");
  // ratchet: prove the enforcing edge — a construct that WAS a higher rank and is NOW lower is a regression.
  const nowInvalid = (await classify(`pure flow f(revenue: Money<GBP>, cost: Money<GBP>) -> Decimal\n${C}\n{ let r: Decimal = revenue / cost\n  return r }`, "t-reg")).cls;
  ok(RANK[nowInvalid] < RANK["standalone-valid"], "ratchet FIRES: a construct classified emitter-invalid ranks below a standalone-valid baseline → regression");
  ok(RANK["standalone-valid"] > RANK["host-import"] && RANK["host-import"] > RANK["emitter-invalid"] && RANK["fail-closed"] > RANK["emitter-invalid"], "ratchet: the completeness lattice is strictly ordered");
  console.log(`\naudit-emitter-completeness --self-test: ${pass}/${pass + fail} checks passed`);
  return fail === 0 ? 0 : 1;
}

async function runInventory() {
  const rows = [];
  for (const c of INVENTORY) rows.push({ ...c, ...(await classify(c.src, c.id)) });
  return rows;
}
async function completeness(inv) {
  let valid = 0, reach = 0;
  for (const c of inv) { const { cls } = await classify(c.src, c.id); if (REACHES_EMITTER.has(cls)) reach++; if (cls === "standalone-valid") valid++; }
  return { pct: reach === 0 ? 0 : Math.round((valid / reach) * 100), valid, reach };
}

// process.exitCode (never process.exit): forcing exit while WebAssembly.Module/Instance async handles are
// still closing trips a libuv assertion on Windows (UV_HANDLE_CLOSING). Draining the loop avoids it.
async function main() {
if (SELF_TEST) { process.exitCode = await selfTest(); return; }

const rows = await runInventory();
const byClass = {};
for (const r of rows) (byClass[r.cls] ??= []).push(r);
const reach = rows.filter((r) => REACHES_EMITTER.has(r.cls)).length;
const valid = (byClass["standalone-valid"] ?? []).length;
const pct = reach === 0 ? 0 : Math.round((valid / reach) * 100);

// ── baseline / ratchet ──────────────────────────────────────────────────────────
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : { classes: {} };
const baseClasses = baseline.classes ?? {};
const regressions = [], improvements = [], added = [];
for (const r of rows) {
  const was = baseClasses[r.id];
  if (was === undefined) { added.push(r.id); continue; }
  if (RANK[r.cls] < RANK[was]) regressions.push({ id: r.id, was, now: r.cls });
  else if (RANK[r.cls] > RANK[was]) improvements.push({ id: r.id, was, now: r.cls });
}
const removed = Object.keys(baseClasses).filter((id) => !rows.some((r) => r.id === id));

if (UPDATE) {
  const classes = Object.fromEntries(rows.map((r) => [r.id, r.cls]).sort((a, b) => a[0].localeCompare(b[0])));
  writeFileSync(BASELINE, JSON.stringify({ note: "RD-0529 B2 emitter-completeness — {construct: class}. A construct that drops emitter-completeness rank fails the gate; recapture with --update-baseline after an intended change.", completeness_pct: pct, classes }, null, 2) + "\n");
  console.log(`baseline recaptured → ${relative(ROOT, BASELINE).replace(/\\/g, "/")} (${rows.length} constructs · completeness ${pct}%)`);
  process.exitCode = 0; return;
}

if (JSON_OUT) {
  console.log(JSON.stringify({ completeness_pct: pct, reach, valid, counts: Object.fromEntries(Object.entries(byClass).map(([k, v]) => [k, v.length])),
    matrix: rows.map((r) => ({ id: r.id, group: r.group, cls: r.cls, why: r.why })), regressions, improvements, added, removed }, null, 2));
  process.exitCode = regressions.length ? 1 : 0; return;
}

console.log(`audit-emitter-completeness — RD-0529 B2 standalone-emitter matrix (${rows.length} constructs)\n`);
const ORDER = ["standalone-valid", "fail-closed", "host-import", "emitter-invalid", "gate-refused", "parse-skip"];
for (const cls of ORDER) {
  const g = byClass[cls]; if (!g) continue;
  console.log(`  ${cls}  (${g.length})`);
  for (const r of g) console.log(`    ${r.id.padEnd(15)} [${r.group}]  ${r.why}`);
}
console.log(`\n  COMPLETENESS: ${valid}/${reach} emitter-reaching constructs are standalone-valid = ${pct}%`);
console.log(`    (fail-closed ${(byClass["fail-closed"] ?? []).length} · host-import ${(byClass["host-import"] ?? []).length} · emitter-invalid ${(byClass["emitter-invalid"] ?? []).length} = the not-yet-complete remainder; gate-refused ${(byClass["gate-refused"] ?? []).length} excluded from the base)`);
if (added.length) console.log(`\n  ✎ ${added.length} new construct(s) not in baseline — run --update-baseline: ${added.join(", ")}`);
if (improvements.length) { console.log(`\n  ↑ improvements (run --update-baseline to lock in):`); for (const i of improvements) console.log(`      ${i.id}: ${i.was} → ${i.now}`); }
if (removed.length) console.log(`\n  ✎ ${removed.length} baselined construct(s) no longer in the inventory: ${removed.join(", ")}`);
if (regressions.length) { console.error(`\n  ✗ REGRESSIONS (a construct lost emitter-completeness rank):`); for (const r of regressions) console.error(`      ${r.id}: ${r.was} → ${r.now}`); }
console.log(`\n  VIOLATIONS: ${regressions.length}${regressions.length === 0 ? "  ✅" : "  (a construct regressed — fix the emitter or, if intended, --update-baseline)"}`);
process.exitCode = regressions.length;
}
await main();
