#!/usr/bin/env node
// =============================================================================
// audit-wat-lowering.mjs — corpus auditor for WAT record representation gaps
// =============================================================================
// The emitter uses one naturally aligned typed layout for i32 handles, i64 integers and f64 floating
// values. This audit inventories record fields that still lack a faithful executable representation,
// and separately inventories the exact-Decimal-to-f64 mismatch across every type site. It imports the
// compiler's own isWATRecordFieldTypeSupported predicate, so no second hand-written type list can drift.
//
// Leg A — unsupported record fields. Float16/Float32 remain blocked until the scalar f32 expression
//         lane is complete. Decimal remains blocked because Galerina Decimal is exact and f64 is not.
// Leg C — every Decimal occurrence, including params, locals and returns, because the current scalar
//         mapping remains f64 and is therefore not an exact production representation.
//
// The shrink-only baseline records current unsupported sites. A new site, a missing typed-layout
// anchor, or a missing FUNGI-LAYOUT-001 guard fails closed.
//
// Usage:
//   node scripts/audit-wat-lowering.mjs                 → enforce (exit = violation count)
//   node scripts/audit-wat-lowering.mjs --self-test     → prove the detector fires on known + fabricated faults
//   node scripts/audit-wat-lowering.mjs --json          → machine-readable
//   node scripts/audit-wat-lowering.mjs --update-baseline → recapture the baseline from the current corpus
// =============================================================================
import { readFileSync, writeFileSync, existsSync, readdirSync, lstatSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST = join(ROOT, "packages-ts/galerina-core-compiler/dist/index.js");
const RECORD_ABI = join(ROOT, "packages-ts/galerina-core-runtime-wasm/src/record-abi.ts");
const WAT_EMITTER = join(ROOT, "packages-ts/galerina-core-compiler/src/wat-emitter.ts");
const BASELINE = join(ROOT, "packages-ts/galerina-core-compiler/tests/fixtures/wat-lowering-baseline.json");

const args = new Set(process.argv.slice(2));
const JSON_OUT = args.has("--json");
const SELF_TEST = args.has("--self-test");
const UPDATE = args.has("--update-baseline");

const L = await import(pathToFileURL(DIST).href);
if (typeof L.galerinaTypeToWAT !== "function" || typeof L.isWATRecordFieldTypeSupported !== "function" || typeof L.parseProgram !== "function") {
  console.error("FATAL: compiler dist missing galerinaTypeToWAT/parseProgram — build packages-ts/galerina-core-compiler first.");
  process.exit(2);
}

// ── the predicate: reuse the emitter's REAL type→wasm mapping ─────────────────
function baseOf(type) { return (type.split("<")[0] ?? "").trim(); }        // Array<Float> → "Array" (an i32 handle)
function loweredWasm(base) { if (!base) return "?"; try { return L.galerinaTypeToWAT(base); } catch { return "?"; } }
function splitNameType(v) { const i = v.indexOf(":"); return i < 0 ? { name: v.trim(), type: "" } : { name: v.slice(0, i).trim(), type: v.slice(i + 1).trim() }; }

// ── collect every type-annotation site (record field / flow param / return / local) from one source ──
export function collectSites(src, rel) {
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
  const parseError = perr.length > 0 && sites.length === 0;
  return { sites, parseError, hadTypeError: perr.length > 0 };
}

// ── leg extraction ────────────────────────────────────────────────────────────
const rootCauseOf = (site) => (site.base === "Decimal" ? "decimal-f64-wart" : "missing-f32-scalar-lane");
function legA(sites) { return sites.filter((s) => s.kind === "record-field" && !L.isWATRecordFieldTypeSupported(s.type)); }
function legC(sites) { return sites.filter((s) => s.base === "Decimal"); }
const keyA = (s) => `${s.rel}::${s.container}.${s.name}::${s.type}`;
const keyC = (s) => `${s.rel}::${s.kind}::${s.container}.${s.name}::${s.type}`;

// ── corpus discovery ──────────────────────────────────────────────────────────
const IGNORED_CORPUS_DIRECTORIES = new Set(["node_modules", ".git", ".worktrees", "dist", "build"]);
function shouldSkipDirectory(name) { return IGNORED_CORPUS_DIRECTORIES.has(name); }

export const MAX_WAT_CORPUS_FILE_BYTES = 1_048_576;
export const MAX_WAT_CORPUS_FILES = 8192;
export const MAX_WAT_WALK_DEPTH = 32;

export function fungiFiles(root) {
  const files = [];
  const refused = [];
  (function walk(d, depth) {
    if (depth > MAX_WAT_WALK_DEPTH) {
      refused.push({ path: d, why: "depth" });
      return;
    }
    let ents;
    try { ents = readdirSync(d, { withFileTypes: true }); } catch {
      refused.push({ path: d, why: "unreadable-dir" });
      return;
    }
    for (const e of ents) {
      if (shouldSkipDirectory(e.name)) continue;
      const p = join(d, e.name);
      if (e.isSymbolicLink()) {
        refused.push({ path: p, why: "symlink" });
        continue;
      }
      if (e.isDirectory()) walk(p, depth + 1);
      else if (e.name.endsWith(".fungi")) {
        if (files.length >= MAX_WAT_CORPUS_FILES) {
          refused.push({ path: p, why: "cap" });
          return;
        }
        files.push(p);
      }
    }
  })(root, 0);
  return { files, refused };
}

export function coverageProblems(scan) {
  const problems = [];
  if (!Number.isSafeInteger(scan.scanned) || scan.scanned <= 0) problems.push("absent or unread corpus");
  if (scan.parseErr > 0) problems.push(`${scan.parseErr} parse-skipped`);
  if (scan.unread > 0) problems.push(`${scan.unread} unread`);
  if (Array.isArray(scan.refused) && scan.refused.length > 0) problems.push(`${scan.refused.length} refused`);
  return problems;
}

export function scanFungiCorpus(root = ROOT) {
  const aSites = [], cSites = [];
  let scanned = 0, parseErr = 0, unread = 0;
  const { files, refused } = fungiFiles(root);
  for (const f of files) {
    let src;
    try {
      const st = lstatSync(f);
      if (st.isSymbolicLink() || !st.isFile() || st.size > MAX_WAT_CORPUS_FILE_BYTES) {
        unread++;
        continue;
      }
      src = readFileSync(f, "utf8");
      if (Buffer.byteLength(src, "utf8") > MAX_WAT_CORPUS_FILE_BYTES) {
        unread++;
        continue;
      }
    } catch {
      unread++;
      continue;
    }
    scanned++;
    const rel = relative(root, f).replace(/\\/g, "/");
    const { sites, parseError } = collectSites(src, rel);
    if (parseError) { parseErr++; continue; }
    aSites.push(...legA(sites));
    cSites.push(...legC(sites));
  }
  return { aSites, cSites, scanned, parseErr, unread, refused };
}

function scanCorpus() {
  return scanFungiCorpus(ROOT);
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
  const emitterSource = existsSync(WAT_EMITTER) ? readFileSync(WAT_EMITTER, "utf8") : "";
  const guardPresent = /FUNGI-LAYOUT-001/.test(emitterSource);
  const typedLayoutPresent = /buildWATRecordLayouts/.test(emitterSource) && /isWATRecordFieldTypeSupported/.test(emitterSource);
  if (!guardPresent) problems.push("FUNGI-LAYOUT-001 compile guard GONE from wat-emitter.ts — auditor + guard are decoupled");
  if (!typedLayoutPresent) problems.push("typed WAT record layout GONE from wat-emitter.ts; wide-field admission is unverifiable");
  return { problems, notes, slotSize, decWasm, guardPresent, typedLayoutPresent };
}

// ── baseline ──────────────────────────────────────────────────────────────────
function currentBaselineShape(aSites, cSites) {
  return {
    generatedBy: "audit-wat-lowering.mjs",
    note: "Shrink-only inventory of the WAT record-field-layout fault class + Decimal-wart occurrences. A NEW off-baseline site fails the gate. Keys are line-independent (path + qualified name + type).",
    rootCauses: {
      "missing-f32-scalar-lane": { why: "Float16/Float32 lack a faithful scalar WAT expression lane", task: "#132", anchor: "isWATRecordFieldTypeSupported" },
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

  const red1 = collectSites(`@version 1\nrecord R { x: Float32 }\npure flow f() -> Int contract { intent { "x" } } { return 0 }\n`, "red1");
  ok(legA(red1.sites).some((s) => s.base === "Float32" && s.wasm === "f32"), "RED: a Float32 record field lacks the scalar f32 lane");

  const red2 = collectSites(`@version 1\nrecord R { x: Int64 }\npure flow f() -> Int contract { intent { "x" } } { return 0 }\n`, "red2");
  ok(legA(red2.sites).length === 0, "GREEN: a naturally aligned Int64 record field is supported");

  const red3 = collectSites(`@version 1\npure flow f(d: Decimal, n: Int) -> Int contract { intent { "x" } } { return n }\n`, "red3");
  ok(legC(red3.sites).some((s) => s.kind === "flow-param" && s.base === "Decimal"), "RED: a Decimal SCALAR param is a Leg-C occurrence (scalar, not a field)");

  const redDecField = collectSites(`@version 1\nrecord M { amount: Decimal }\npure flow f() -> Int contract { intent { "x" } } { return 0 }\n`, "redDecField");
  ok(legA(redDecField.sites).some((s) => s.base === "Decimal") && legC(redDecField.sites).some((s) => s.kind === "record-field"), "RED: a Decimal record field is BOTH Leg-A and Leg-C");
  ok(legA(redDecField.sites).every((s) => rootCauseOf(s) === "decimal-f64-wart"), "RED: a Decimal field attributes to the decimal-wart, not slot-width");

  const green = collectSites(`@version 1\nrecord R { a: Int; s: String; xs: Array<Float>; b: Bool }\npure flow f() -> Int contract { intent { "x" } } { return 0 }\n`, "green");
  ok(legA(green.sites).length === 0, "GREEN: an all-i32/handle record (Int/String/Array<Float>/Bool) has no Leg-A site (no false-positive)");
  ok(legC(green.sites).length === 0, "GREEN: no Decimal → no Leg-C occurrence");

  ok(shouldSkipDirectory(".worktrees"), "BOUNDARY: nested Git worktrees are not part of the selected checkout corpus");

  // fabricated off-baseline regression: a NEW affected site must be a violation against an empty baseline
  const fabricated = legA(red1.sites);
  const emptyBaseA = new Set();
  const violations = fabricated.filter((s) => !emptyBaseA.has(keyA(s)));
  ok(violations.length > 0, "FIRES: a new off-baseline Leg-A site is flagged as a violation");

  ok(coverageProblems({ scanned: 0, parseErr: 0, unread: 0, refused: [] }).length > 0, "FIRES: unread/empty corpus is not a clean result");
  ok(coverageProblems({ scanned: 1, parseErr: 1, unread: 0, refused: [] }).some((p) => /parse-skipped/.test(p)), "FIRES: parse-skipped corpus is not a clean result");

  // anchors self-check
  const anc = checkAnchors();
  ok(anc.decWasm === "f64", "ANCHOR: the decimal-wart is still present (galerinaTypeToWAT(Decimal)=f64)");
  ok(anc.slotSize === 4, "ANCHOR: compact i32 host staging remains WAT_REC_FIELD_SIZE=4");
  ok(anc.typedLayoutPresent, "ANCHOR: typed naturally aligned record layout is present");
  ok(anc.guardPresent, "ANCHOR: the FUNGI-LAYOUT-001 compile guard is present");

  console.log(`\naudit-wat-lowering --self-test: ${pass}/${pass + fail} checks passed`);
  process.exit(fail === 0 ? 0 : 1);
}

function isDirectRun() {
  const argv1 = process.argv[1];
  if (typeof argv1 !== "string" || argv1.length === 0) return false;
  return resolve(fileURLToPath(import.meta.url)) === resolve(argv1);
}

function runAudit() {
  if (SELF_TEST) selfTest();

  const { aSites, cSites, scanned, parseErr, unread, refused } = scanCorpus();
  const anchors = checkAnchors();
  const coverage = coverageProblems({ scanned, parseErr, unread, refused });

  if (UPDATE) {
    if (coverage.length > 0) {
      console.error(`audit-wat-lowering: refusing --update-baseline (${coverage.join("; ")})`);
      process.exit(1);
    }
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

  const violations = newA.length + newC.length + anchors.problems.length + coverage.length;
  const exitCode = violations > 0 ? 1 : 0;

  if (JSON_OUT) {
    console.log(JSON.stringify({ scanned, parseErr, unread, refused: refused.length,
      coverage, legA: { total: curAkeys.size, new: newA, stale: staleA },
      legC: { total: curCkeys.size, new: newC, stale: staleC },
      rootCauses: { "slot-width": aSites.filter((s) => rootCauseOf(s) === "slot-width").length, "decimal-f64-wart": aSites.filter((s) => rootCauseOf(s) === "decimal-f64-wart").length + cSites.length },
      anchors, violations, exitCode }, null, 2));
    process.exit(exitCode);
  }

  console.log(`audit-wat-lowering — WAT record-field-layout fault class`);
  console.log(`  scanned ${scanned} .fungi · ${parseErr} parse-skipped · ${unread} unread`);
  console.log(`\n  Leg A — record fields without a faithful WAT representation: ${curAkeys.size}`);
  for (const s of aSites.sort((a, b) => keyA(a).localeCompare(keyA(b))))
    console.log(`    ${s.rel}:${s.line}  record ${s.container}.${s.name}: ${s.type} → ${s.wasm}  [${rootCauseOf(s)}]`);
  console.log(`\n  Leg C — every Decimal occurrence (fields + params + returns + locals): ${curCkeys.size}`);
  for (const s of cSites.sort((a, b) => keyC(a).localeCompare(keyC(b))))
    console.log(`    ${s.rel}:${s.line}  ${s.kind} ${s.container}.${s.name}: ${s.type}`);
  console.log(`\n  Root causes:`);
  console.log(`    missing f32 lane (#132)— ${aSites.filter((s) => rootCauseOf(s) === "missing-f32-scalar-lane").length} Leg-A field(s); i64/f64 use typed natural alignment`);
  console.log(`    decimal-f64-wart (#137)— galerinaTypeToWAT("Decimal")="${anchors.decWasm}"; ${aSites.filter((s) => rootCauseOf(s) === "decimal-f64-wart").length} field(s) + ${cSites.length} occurrence(s)`);
  for (const n of anchors.notes) console.log(`  ⚠ note: ${n}`);
  for (const c of coverage) console.log(`  ✗ COVERAGE: ${c}`);
  if (staleA.length || staleC.length) console.log(`\n  ✎ baseline can shrink (fixed/removed): Leg A ${staleA.length} · Leg C ${staleC.length} — run --update-baseline`);
  if (newA.length) { console.log(`\n  ✗ NEW off-baseline Leg-A record field(s):`); for (const k of newA) console.log(`      ${k}`); }
  if (newC.length) { console.log(`\n  ✗ NEW off-baseline Leg-C Decimal occurrence(s):`); for (const k of newC) console.log(`      ${k}`); }
  for (const p of anchors.problems) console.log(`  ✗ ANCHOR: ${p}`);
  console.log(`\n  VIOLATIONS: ${violations}${violations === 0 ? "  ✅" : "  (a NEW affected site, missing coverage, or a missing anchor — fix it or, if intended, run --update-baseline)"}`);
  process.exit(exitCode);
}

if (isDirectRun()) runAudit();
