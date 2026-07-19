#!/usr/bin/env node
// =============================================================================
// audit-wat-lowering.mjs — corpus auditor for the WAT record-field-layout fault class
// =============================================================================
// Owner-directed (R&D design 2026-07-19). The FUNGI-LAYOUT-001 compile guard refuses a bad record field
// at compile time, ONE program at a time. This is the complement: a corpus-wide inventory that (a) finds
// every AFFECTED site — including in non-compiled / example / staged .fungi the guard never sees — and
// (b) separates the TWO distinct core root causes so a fix for one is not mistaken for a fix for the other,
// and (c) fail-closes on drift so a NEW affected site is caught in CI, not at someone's compile error.
//
//   Leg A — AFFECTED sites: a record field whose type lowers to a WASM value WIDER than the fixed 4-byte
//           record slot. Predicate = the emitter's OWN `galerinaTypeToWAT(fieldType) !== "i32"` (imported,
//           never a re-implemented name list — it stays honest as the mapping evolves). That is
//           f64 {Float,Float64,Double,Decimal} · i64 {Int64,UInt64} · f32 {Float32,Float16}.
//   Leg B — CORE ROOT CAUSE #1 (slot-width): WAT_REC_FIELD_SIZE = 4 can't hold an i64/f32/f64 field →
//           invalid module / silent mis-read. The genuine fix is variable-width slots — task #132.
//   Leg C — CORE ROOT CAUSE #2 (Decimal→f64 wart): galerinaTypeToWAT("Decimal") = "f64", but Decimal is a
//           bignum (stdlib ScaledDecimal). An f64 can't faithfully hold it. This is DISTINCT from #132
//           (fixing slot width won't fix Decimal — it needs a faithful representation) and it also
//           mis-lowers SCALARS (params/locals/returns), so this leg inventories EVERY Decimal occurrence.
//           Task #137.
//
// A Decimal RECORD FIELD is therefore both a Leg-A affected site AND a Leg-C occurrence; the tool
// attributes each Leg-A site to its root cause (Decimal field → decimal-f64-wart, otherwise slot-width) so
// the two are never conflated.
//
// Baseline (shrink-only, ratcheted — the house pattern): the CURRENT known sites live in
// tests/fixtures/wat-lowering-baseline.json. A NEW off-baseline affected site → exit 1. Each root cause
// carries an EXISTENCE-CHECKED anchor (its `why` cannot rot): slot-width ↔ WAT_REC_FIELD_SIZE===4 in
// record-abi.ts; decimal-wart ↔ galerinaTypeToWAT("Decimal")==="f64"; plus the FUNGI-LAYOUT-001 compile
// guard must still be present. If an anchor is GONE the root cause can't be verified → fail closed.
//
// Usage:
//   node scripts/audit-wat-lowering.mjs                 → enforce (exit = violation count)
//   node scripts/audit-wat-lowering.mjs --self-test     → prove the detector fires on known + fabricated faults
//   node scripts/audit-wat-lowering.mjs --json          → machine-readable
//   node scripts/audit-wat-lowering.mjs --update-baseline → recapture the baseline from the current corpus
// =============================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "packages-galerina/galerina-core-compiler/dist/index.js");
const RECORD_ABI = join(ROOT, "packages-galerina/galerina-core-runtime-wasm/src/record-abi.ts");
const WAT_EMITTER = join(ROOT, "packages-galerina/galerina-core-compiler/src/wat-emitter.ts");
const BASELINE = join(ROOT, "packages-galerina/galerina-core-compiler/tests/fixtures/wat-lowering-baseline.json");

const args = new Set(process.argv.slice(2));
const JSON_OUT = args.has("--json");
const SELF_TEST = args.has("--self-test");
const UPDATE = args.has("--update-baseline");

const L = await import(pathToFileURL(DIST).href);
if (typeof L.galerinaTypeToWAT !== "function" || typeof L.parseProgram !== "function") {
  console.error("FATAL: compiler dist missing galerinaTypeToWAT/parseProgram — build packages-galerina/galerina-core-compiler first.");
  process.exit(2);
}

// ── the predicate: reuse the emitter's REAL type→wasm mapping ─────────────────
function baseOf(type) { return (type.split("<")[0] ?? "").trim(); }        // Array<Float> → "Array" (an i32 handle)
function loweredWasm(base) { if (!base) return "?"; try { return L.galerinaTypeToWAT(base); } catch { return "?"; } }
function splitNameType(v) { const i = v.indexOf(":"); return i < 0 ? { name: v.trim(), type: "" } : { name: v.slice(0, i).trim(), type: v.slice(i + 1).trim() }; }

// ── collect every type-annotation site (record field / flow param / return / local) from one source ──
function collectSites(src, rel) {
  let prog;
  try { prog = L.parseProgram(src, rel); } catch { return { sites: [], parseError: true }; }
  const perr = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  const sites = [];
  const loc = (node) => (node && node.location ? node.location.line : 0);
  const push = (kind, container, name, type, line) => {
    const type2 = String(type).trim(); if (!type2) return;
    const base = baseOf(type2);
    sites.push({ rel, kind, container, name, type: type2, base, wasm: loweredWasm(base), line });
  };
  (function walk(node, ctx) {
    if (!node || typeof node !== "object") return;
    const k = node.kind ?? "";
    let next = ctx;
    if (k === "recordDecl") next = { kind: "record", name: node.value ?? "?" };
    else if (/flow/i.test(k) && /decl/i.test(k)) next = { kind: "flow", name: node.value ?? "?" };
    if (k === "paramDecl" && ctx) {
      const { name, type } = splitNameType(node.value ?? "");
      push(ctx.kind === "record" ? "record-field" : "flow-param", ctx.name, name, type, loc(node));
    } else if (k === "letDecl") {
      const { name, type } = splitNameType(node.value ?? "");
      push("local", ctx?.name ?? "?", name, type, loc(node));
    }
    for (const c of node.children ?? []) walk(c, next);
  })(prog.ast, null);
  for (const f of prog.flows ?? []) {
    if (typeof f.returnType === "string" && f.returnType.trim())
      push("flow-return", f.name ?? "?", "return", f.returnType, f.location ? f.location.line : 0);
  }
  return { sites, parseError: false, hadTypeError: perr.length > 0 };
}

// ── leg extraction ────────────────────────────────────────────────────────────
const rootCauseOf = (site) => (site.base === "Decimal" ? "decimal-f64-wart" : "slot-width");
function legA(sites) { return sites.filter((s) => s.kind === "record-field" && s.wasm !== "i32" && s.wasm !== "?"); }
function legC(sites) { return sites.filter((s) => s.base === "Decimal"); }
const keyA = (s) => `${s.rel}::${s.container}.${s.name}::${s.type}`;
const keyC = (s) => `${s.rel}::${s.kind}::${s.container}.${s.name}::${s.type}`;

// ── corpus discovery ──────────────────────────────────────────────────────────
function fungiFiles(root) {
  const out = [];
  (function walk(d) {
    let ents; try { ents = readdirSync(d); } catch { return; }
    for (const e of ents) {
      if (e === "node_modules" || e === ".git" || e === "dist" || e === "build") continue;
      const p = join(d, e); let st; try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) walk(p);
      else if (e.endsWith(".fungi")) out.push(p);
    }
  })(root);
  return out;
}

function scanCorpus() {
  const aSites = [], cSites = [];
  let scanned = 0, parseErr = 0;
  for (const f of fungiFiles(ROOT)) {
    let src; try { src = readFileSync(f, "utf8"); } catch { continue; }
    scanned++;
    const rel = relative(ROOT, f).replace(/\\/g, "/");
    const { sites, parseError } = collectSites(src, rel);
    if (parseError) { parseErr++; continue; }
    aSites.push(...legA(sites));
    cSites.push(...legC(sites));
  }
  return { aSites, cSites, scanned, parseErr };
}

// ── existence-checked root-cause anchors (the `why` cannot rot) ───────────────
function checkAnchors() {
  const problems = [];
  const notes = [];
  // slot-width ↔ WAT_REC_FIELD_SIZE === 4
  let slotSize = null;
  if (!existsSync(RECORD_ABI)) problems.push("slot-width anchor GONE: record-abi.ts missing — cannot verify the slot-width root cause");
  else {
    const m = readFileSync(RECORD_ABI, "utf8").match(/WAT_REC_FIELD_SIZE\s*=\s*(\d+)/);
    if (!m) problems.push("slot-width anchor GONE: WAT_REC_FIELD_SIZE not found in record-abi.ts");
    else { slotSize = Number(m[1]); if (slotSize !== 4) notes.push(`slot-width anchor CHANGED: WAT_REC_FIELD_SIZE=${slotSize} (was 4) — #132 may be in progress; re-verify the baseline`); }
  }
  // decimal-wart ↔ galerinaTypeToWAT("Decimal") === "f64"
  let decWasm = "?"; try { decWasm = L.galerinaTypeToWAT("Decimal"); } catch { /* falls through */ }
  if (decWasm !== "f64") notes.push(`decimal-wart anchor CHANGED: galerinaTypeToWAT("Decimal")="${decWasm}" (was "f64") — the wart may be fixed; Decimal sites can shrink from the baseline`);
  // FUNGI-LAYOUT-001 compile guard still present
  const guardPresent = existsSync(WAT_EMITTER) && /FUNGI-LAYOUT-001/.test(readFileSync(WAT_EMITTER, "utf8"));
  if (!guardPresent) problems.push("FUNGI-LAYOUT-001 compile guard GONE from wat-emitter.ts — auditor + guard are decoupled");
  return { problems, notes, slotSize, decWasm, guardPresent };
}

// ── baseline ──────────────────────────────────────────────────────────────────
function currentBaselineShape(aSites, cSites) {
  return {
    generatedBy: "audit-wat-lowering.mjs",
    note: "Shrink-only inventory of the WAT record-field-layout fault class + Decimal-wart occurrences. A NEW off-baseline site fails the gate. Keys are line-independent (path + qualified name + type).",
    rootCauses: {
      "slot-width": { why: "WAT_REC_FIELD_SIZE=4 cannot hold an i64/f32/f64 record field", task: "#132", anchor: "record-abi.ts WAT_REC_FIELD_SIZE===4" },
      "decimal-f64-wart": { why: "galerinaTypeToWAT(Decimal)=f64 but Decimal is a bignum; also mis-lowers scalars", task: "#137", anchor: 'galerinaTypeToWAT("Decimal")==="f64"' },
    },
    legA_record_fields: [...new Set(aSites.map(keyA))].sort(),
    legC_decimal_occurrences: [...new Set(cSites.map(keyC))].sort(),
  };
}

// ── self-test: RED fixtures fire, GREEN passes, a fabricated off-baseline site is caught ──
function selfTest() {
  let pass = 0, fail = 0;
  const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log(`  ✗ ${msg}`); } };

  const red1 = collectSites(`@version 1\nrecord R { x: Float }\npure flow f() -> Int contract { intent { "x" } } { return 0 }\n`, "red1");
  ok(legA(red1.sites).some((s) => s.base === "Float" && s.wasm === "f64"), "RED: a Float record field is a Leg-A affected site (f64)");

  const red2 = collectSites(`@version 1\nrecord R { x: Int64 }\npure flow f() -> Int contract { intent { "x" } } { return 0 }\n`, "red2");
  ok(legA(red2.sites).some((s) => s.base === "Int64" && s.wasm === "i64"), "RED: an Int64 record field is a Leg-A affected site (i64)");
  ok(legA(red2.sites).every((s) => rootCauseOf(s) === "slot-width"), "RED: an Int64 field attributes to slot-width, not the Decimal wart");

  const red3 = collectSites(`@version 1\npure flow f(d: Decimal, n: Int) -> Int contract { intent { "x" } } { return n }\n`, "red3");
  ok(legC(red3.sites).some((s) => s.kind === "flow-param" && s.base === "Decimal"), "RED: a Decimal SCALAR param is a Leg-C occurrence (scalar, not a field)");

  const redDecField = collectSites(`@version 1\nrecord M { amount: Decimal }\npure flow f() -> Int contract { intent { "x" } } { return 0 }\n`, "redDecField");
  ok(legA(redDecField.sites).some((s) => s.base === "Decimal") && legC(redDecField.sites).some((s) => s.kind === "record-field"), "RED: a Decimal record field is BOTH Leg-A and Leg-C");
  ok(legA(redDecField.sites).every((s) => rootCauseOf(s) === "decimal-f64-wart"), "RED: a Decimal field attributes to the decimal-wart, not slot-width");

  const green = collectSites(`@version 1\nrecord R { a: Int; s: String; xs: Array<Float>; b: Bool }\npure flow f() -> Int contract { intent { "x" } } { return 0 }\n`, "green");
  ok(legA(green.sites).length === 0, "GREEN: an all-i32/handle record (Int/String/Array<Float>/Bool) has no Leg-A site (no false-positive)");
  ok(legC(green.sites).length === 0, "GREEN: no Decimal → no Leg-C occurrence");

  // fabricated off-baseline regression: a NEW affected site must be a violation against an empty baseline
  const fabricated = legA(red1.sites);
  const emptyBaseA = new Set();
  const violations = fabricated.filter((s) => !emptyBaseA.has(keyA(s)));
  ok(violations.length > 0, "FIRES: a new off-baseline Leg-A site is flagged as a violation");

  // anchors self-check
  const anc = checkAnchors();
  ok(anc.decWasm === "f64", "ANCHOR: the decimal-wart is still present (galerinaTypeToWAT(Decimal)=f64)");
  ok(anc.slotSize === 4, "ANCHOR: the slot-width root cause is still present (WAT_REC_FIELD_SIZE=4)");
  ok(anc.guardPresent, "ANCHOR: the FUNGI-LAYOUT-001 compile guard is present");

  console.log(`\naudit-wat-lowering --self-test: ${pass}/${pass + fail} checks passed`);
  process.exit(fail === 0 ? 0 : 1);
}

// ── main ───────────────────────────────────────────────────────────────────────
if (SELF_TEST) selfTest();

const { aSites, cSites, scanned, parseErr } = scanCorpus();
const anchors = checkAnchors();

if (UPDATE) {
  writeFileSync(BASELINE, JSON.stringify(currentBaselineShape(aSites, cSites), null, 2) + "\n");
  console.log(`audit-wat-lowering: baseline recaptured → ${relative(ROOT, BASELINE).replace(/\\/g, "/")} (Leg A ${new Set(aSites.map(keyA)).size} · Leg C ${new Set(cSites.map(keyC)).size})`);
  process.exit(0);
}

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, "utf8")) : { legA_record_fields: [], legC_decimal_occurrences: [] };
const baseA = new Set(baseline.legA_record_fields ?? []);
const baseC = new Set(baseline.legC_decimal_occurrences ?? []);
const curAkeys = new Set(aSites.map(keyA));
const curCkeys = new Set(cSites.map(keyC));

const newA = [...curAkeys].filter((k) => !baseA.has(k)).sort();
const newC = [...curCkeys].filter((k) => !baseC.has(k)).sort();
const staleA = [...baseA].filter((k) => !curAkeys.has(k)).sort();   // fixed/removed since baseline (shrink)
const staleC = [...baseC].filter((k) => !curCkeys.has(k)).sort();

const violations = newA.length + newC.length + anchors.problems.length;

if (JSON_OUT) {
  console.log(JSON.stringify({ scanned, parseErr,
    legA: { total: curAkeys.size, new: newA, stale: staleA },
    legC: { total: curCkeys.size, new: newC, stale: staleC },
    rootCauses: { "slot-width": aSites.filter((s) => rootCauseOf(s) === "slot-width").length, "decimal-f64-wart": aSites.filter((s) => rootCauseOf(s) === "decimal-f64-wart").length + cSites.length },
    anchors, violations }, null, 2));
  process.exit(violations);
}

console.log(`audit-wat-lowering — WAT record-field-layout fault class`);
console.log(`  scanned ${scanned} .fungi · ${parseErr} parse-skipped`);
console.log(`\n  Leg A — record fields wider than the 4-byte i32 slot (galerinaTypeToWAT != i32): ${curAkeys.size}`);
for (const s of aSites.sort((a, b) => keyA(a).localeCompare(keyA(b))))
  console.log(`    ${s.rel}:${s.line}  record ${s.container}.${s.name}: ${s.type} → ${s.wasm}  [${rootCauseOf(s)}]`);
console.log(`\n  Leg C — every Decimal occurrence (fields + params + returns + locals): ${curCkeys.size}`);
for (const s of cSites.sort((a, b) => keyC(a).localeCompare(keyC(b))))
  console.log(`    ${s.rel}:${s.line}  ${s.kind} ${s.container}.${s.name}: ${s.type}`);
console.log(`\n  Root causes:`);
console.log(`    slot-width (#132)      — WAT_REC_FIELD_SIZE=${anchors.slotSize}; ${aSites.filter((s) => rootCauseOf(s) === "slot-width").length} Leg-A field(s)`);
console.log(`    decimal-f64-wart (#137)— galerinaTypeToWAT("Decimal")="${anchors.decWasm}"; ${aSites.filter((s) => rootCauseOf(s) === "decimal-f64-wart").length} field(s) + ${cSites.length} occurrence(s)`);
for (const n of anchors.notes) console.log(`  ⚠ note: ${n}`);
if (staleA.length || staleC.length) console.log(`\n  ✎ baseline can shrink (fixed/removed): Leg A ${staleA.length} · Leg C ${staleC.length} — run --update-baseline`);
if (newA.length) { console.log(`\n  ✗ NEW off-baseline Leg-A record field(s):`); for (const k of newA) console.log(`      ${k}`); }
if (newC.length) { console.log(`\n  ✗ NEW off-baseline Leg-C Decimal occurrence(s):`); for (const k of newC) console.log(`      ${k}`); }
for (const p of anchors.problems) console.log(`  ✗ ANCHOR: ${p}`);
console.log(`\n  VIOLATIONS: ${violations}${violations === 0 ? "  ✅" : "  (a NEW affected site or a missing anchor — fix it or, if intended, run --update-baseline)"}`);
process.exit(violations);
