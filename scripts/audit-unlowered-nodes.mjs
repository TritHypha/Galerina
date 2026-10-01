#!/usr/bin/env node
// =============================================================================
// audit-unlowered-nodes.mjs — the un-lowered-node ratchet (R&D grounding #6.1)
// =============================================================================
// R2 (audit-stage-execution.mjs) catches #100 at RUN time: the stage traps when it is called. This
// catches the SAME class one stage EARLIER — at EMIT time — by counting the WAT nodes the emitter
// fail-closed to `(unreachable) (; … emitter cannot lower … ;)` instead of lowering. A node the emitter
// "silently couldn't lower" becomes a NAMED compile-time audit failure against a shrink-only baseline, so
// a NEW un-lowerable construct breaks the build the day it is introduced — not the day someone runs the
// stage that hits it. R&D's words: "the R2 baseline pattern applied one stage earlier."
//
// THE MARKER IS THE EMITTER'S OWN. wat-emitter.ts emits, at every site it declines to lower a node:
//     (unreachable) (; <what> — fail-closed (emitter cannot lower; #<task>) ;)
// at lines 1282/1330/1340/1495/1535/1656/1860/2005/2053. That phrase is DISTINCT from the runtime-guard
// traps (overflow / fuel-cap / `ensure` / RD-0240 non-exhaustive match) which also use `unreachable` but
// are CORRECT lowerings that trap by design — those never carry "emitter cannot lower". wat-emitter.ts:632
// relies on exactly this distinction, so counting the marker counts un-lowered nodes and nothing else.
// (The Phase-25 "cannot lower -> falls back to walker" stubs say "cannot lower" but NOT "emitter cannot
// lower", so they are correctly excluded: they fall back to the tree-walker, they are not hard failures.)
//
// ★ RATCHETED, shrink-only, MEASURED not assumed. R&D's grounding expected the baseline to be roughly "the
// #100 sites". RUNNING it falsified that: 385 nodes, module-wide, ALL #128 — the emitter's TOTAL partial-
// lowering debt across the stages, of which #100 is an indistinguishable subset. A new un-lowerable node
// RAISES the count and fails the gate; real lowering progress (incl. an eventual #100 fix) LOWERS it. Same
// house pattern as TRAP_BASELINE / ESCAPE_BASELINE / CROSSING_BASELINE — and the same lesson as this session
// keeps relearning: the number you measure is not always the number you assumed.
//
// ★ #2 LAW — R&D's discriminating-trap contract, encoded structurally. The self-test ships the real #100
// fixture (an un-lowered node FIRES) AND a control that is identical BUT FOR the single trapping variable
// (the element type) — and it is silent. Minimality is not eyeballed: both fixtures are generated from ONE
// template with the element type as the only substitution, and the self-test ASSERTS the two sources differ
// in exactly that. A ratchet whose detector cannot tell "this node didn't lower" from "nothing lowers" is
// vacuous; the control is what makes the count mean "un-lowered", not "emitter is broken".
//
// Usage:
//   node scripts/audit-unlowered-nodes.mjs             enforce (exit = violation count)
//   node scripts/audit-unlowered-nodes.mjs --self-test prove the counter fires on #100, silent on control
//   node scripts/audit-unlowered-nodes.mjs --json
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SH = join(ROOT, "packages-ts/galerina-core-compiler/src/self-hosted");
const DIST = join(ROOT, "packages-ts/galerina-core-compiler/dist/index.js");

// The emitter's own fail-closed lowering-stub phrase. Distinct from every runtime-guard `unreachable`.
const MARKER = "emitter cannot lower";

// Classify a stub by the task tag the emitter stamps on it, so the report names the KIND, not just a count.
const classify = (line) => (/emitter cannot lower[^#]*#(\d+)/.exec(line) ?? [])[1] ?? "?";

// Count marker occurrences in rendered WAT, returning the classified tag of each. Counts EVERY occurrence
// on a line (a line can only carry one stub in practice, but the scan does not assume it).
function countUnlowered(wat) {
  const hits = [];
  for (const line of wat.split("\n")) {
    let i = 0;
    while ((i = line.indexOf(MARKER, i)) !== -1) { hits.push(classify(line)); i += MARKER.length; }
  }
  return hits;
}

// ── run-path scoping (R&D's R2->R3 bridge) ───────────────────────────────────
// Count un-lowered nodes STATICALLY REACHABLE from a stage's R2 entry flow (vs the module-wide total).
// run-path is a SUBSET of module-wide; run-path>0 means the entry can reach a node the emitter declined — a
// latent or live R2 trap. The rendered WAT has ZERO call_indirect (asserted), so the direct-call graph
// (`(call $x)` edges) is COMPLETE and reachability is EXACT, not a lower bound. Funcs are segmented by their
// `(func $name` declaration, keeping the FIRST per name (the definition; later occurrences are export refs) —
// no paren-matching, robust against the `(; … emitter cannot lower … ;)` block comments the markers live
// inside (those never contain `(call $` or `(func $`).
function runPathCount(wat, entry) {
  if (/call_indirect/.test(wat)) return { err: "call_indirect present — the direct-call graph is incomplete" };
  const starts = [...wat.matchAll(/\(func\s+(\$[^\s()]+)/g)];
  const seg = new Map();
  for (let i = 0; i < starts.length; i++) {
    const body = wat.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : wat.length);
    if (!seg.has(starts[i][1])) seg.set(starts[i][1], body); // first occurrence = the definition
  }
  const entryFn = "$" + entry;
  if (!seg.has(entryFn)) return { err: `entry ${entryFn} not found among ${seg.size} funcs` };
  const reach = new Set();
  const stack = [entryFn];
  while (stack.length) {
    const f = stack.pop();
    if (reach.has(f) || !seg.has(f)) continue;
    reach.add(f);
    for (const m of seg.get(f).matchAll(/\(call\s+(\$[^\s()]+)/g)) if (!reach.has(m[1])) stack.push(m[1]);
  }
  let count = 0;
  for (const f of reach) count += (seg.get(f).match(new RegExp(MARKER, "g")) || []).length;
  return { count, reachable: reach.size, funcs: seg.size };
}

const strip = (p) => {
  let s = readFileSync(join(SH, p), "utf8");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s.replace(/^@version 1\s*/m, "");
};

// Render a full source string to WAT through the same CheckedProgram front door as
// production WASM (resolve → types → effects → governance). Stops BEFORE assembly.
// A gate refusal is a structured error row — never an un-lowered count on a program
// production would reject.
function renderWat(L, source, label) {
  const checked = L.checkProgram(source, label);
  if (!checked.ok) {
    const family = typeof checked.family === "string" && checked.family.length > 0 ? checked.family : "gate";
    const code = typeof checked.code === "string" && checked.code.length > 0 ? checked.code : "FUNGI-WAT-CHECKED-001";
    return { error: `${family}:${code}`, wat: "" };
  }
  const wat = L.renderWAT(L.buildWATFromCheckedProgram(checked.program, L.STDLIB_CAPABILITY_MAP, "wasm-standalone", true));
  return { wat };
}

// Slice one `record Name { … }` from a .fungi source (brace-matched). Used so runtime
// composition reuses gir-emitter.fungi's exact field offsets instead of a second copy.
function extractRecordDecl(src, name) {
  const re = new RegExp(`(^|\\n)record\\s+${name}\\b`);
  const m = re.exec(src);
  if (!m) throw new Error(`audit-unlowered-nodes: missing record ${name} in gir-emitter.fungi`);
  const start = m.index + (m[1] ? m[1].length : 0);
  const brace = src.indexOf("{", start);
  if (brace < 0) throw new Error(`audit-unlowered-nodes: record ${name} has no body`);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const c = src[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`audit-unlowered-nodes: unclosed record ${name}`);
}

// J7 / E2d: runtime.fungi walks GIRNode/GIRExprNode/GIRModule/GIRExpr/GIRStmt/FlowEntry
// declared only in gir-emitter.fungi. Audit previously rendered runtime as lexer+parser+runtime
// (this file ~116-119), so those layouts were absent and every expr.value/.kids/.body was
// #128. Option (b) stage-declaration: prepend the six record bodies from gir-emitter.fungi
// (single source of truth; no wat-emitter.ts layout teaching). Full gir-emitter flows are
// NOT concatenated here — duplicate flow names would mix gir-emitter's un-lowered count
// into the runtime row. p9-100-site-mapper.mjs already models the 4-stage intent.
const RUNTIME_GIR_RECORDS = [
  "GIRNode",
  "GIRExprNode",
  "GIRModule",
  "GIRExpr",
  "GIRStmt",
  "FlowEntry",
];
function girRecordsForRuntime() {
  const src = strip("gir-emitter.fungi");
  return RUNTIME_GIR_RECORDS.map((n) => extractRecordDecl(src, n)).join("\n\n");
}

// A stage is rendered as lexer + parser + stage (one module per stage — the stages cannot be concatenated,
// #107). parser needs nothing extra; every later stage is appended to the lexer+parser base it references.
// runtime additionally receives the six GIR record declarations it consumes (J7 option b).
function stageSource(file) {
  // lexer.fungi is already the base; appending it again duplicated the lexer
  // (lexer+parser+lexer) and produced dishonest redefinition rows.
  const extra = (file === "lexer.fungi" || file === "parser.fungi") ? "" : "\n" + strip(file);
  const girDecls = file === "runtime.fungi" ? "\n" + girRecordsForRuntime() : "";
  return "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + girDecls + extra;
}

// ── the corpus: the seven self-hosted stages ─────────────────────────────────
// MEASURED 2026-10-01 Q2 BUILD. All seven stages 0 module-wide and 0 run-path.
// runtime stays in the corpus so a regression that reintroduces emit-time stubs
// is visible here, not only when someone runs the stage.
const STAGES = [
  { file: "lexer.fungi", entry: "tokenize" },
  { file: "parser.fungi", entry: "parseFlows" },
  { file: "type-checker.fungi", entry: "checkFlows" },
  { file: "effect-checker.fungi", entry: "checkFlowEffects" },
  { file: "governance-verifier.fungi", entry: "verifyGovernance" },
  { file: "gir-emitter.fungi", entry: "emitGIRModule" },
  { file: "runtime.fungi", entry: "runProgram" },
];

// ★ MEASURED 2026-10-01 Q2 BUILD (`audit-unlowered-nodes.mjs --json`). Module-wide un-lowered
// count across the seven stages is 0. Q1-B measured 7, all #128 in type-checker parked flows
// (checkMatchArms .pattern, checkStepExpr .target, checkBinding litI32Overflow). Q2 cleared those
// sites (Array<Stmt>+.name, stmt.litI32Overflow, delete checkStepExpr). Shrink-only: a RISE = a
// new un-lowerable construct (fix the node); a FALL = real lowering progress (lower the number
// to lock it in). Never raise.
const UNLOWERED_BASELINE = 0;

// ★ RUN-PATH baseline — un-lowered nodes REACHABLE from each stage's R2 entry (a subset of module-wide).
// MEASURED 2026-10-01 Q2 BUILD: 0. Shrink-only.
const RUNPATH_BASELINE = 0; // MEASURED Q2. Per stage: lexer 0 · parser 0 · type-checker 0 · effect-checker 0 · governance-verifier 0 · gir-emitter 0 · runtime 0.

// ── #2-law self-test fixtures — generated from ONE template, element type the only variable ──────────────
const mkFixture = (elemType, flowName) => `@version 1
record Item {
  name: String
  size: Int
}
record Other {
  size: Int
  tag: String
}
pure flow ${flowName}(items: Array<${elemType}>) -> Int
contract { intent { "read a record field off an Array<${elemType}> payload" } }
{
  mut total: Int = 0
  mut i: Int = 0
  while i < items.count() {
    let e = items.get(i)
    match e {
      Some(it) => { total = total + it.size }
      _ => { total = total + 0 }
    }
    i = i + 1
  }
  return total
}`;
// J4–J6c unique-layout teaching interned a UNIQUE Array<Auto> field set (lone Item + it.size).
// FIRE keeps the original read (`it.size`) but adds sibling Other {size, tag} so {size} is
// ambiguous (Alpha/Beta equal-shape fail-closed). CONTROL is the same source with Array<Item>.
const FIRE = mkFixture("Auto", "getAutoField");     // Auto + ambiguous {size} — a field read must NOT lower
const CONTROL = mkFixture("Item", "getTypedField"); // concrete Item — the same read must lower

// ── run-path #2 control fixture: two entries — one REACHES a trapping helper, one only a clean helper —
// both in a module whose module-wide un-lowered count is >0. Proves run-path is a strict subset, with its OWN
// control (not the module-wide fixture) because the property under test changed (R&D's note).
const RP_FIXTURE = `@version 1
record Item { name: String  size: Int }
record Other { size: Int  tag: String }
pure flow trapHelper(items: Array<Auto>) -> Int
contract { intent { "an Array<Auto> field read leaves an un-lowered node" } }
{ mut t: Int = 0  let e = items.get(0)  match e { Some(it) => { t = it.size } _ => { t = 0 } }  return t }
pure flow cleanHelper(items: Array<Item>) -> Int
contract { intent { "a concrete-type field read fully lowers" } }
{ mut t: Int = 0  let e = items.get(0)  match e { Some(it) => { t = it.size } _ => { t = 0 } }  return t }
pure flow entryReaches(xs: Array<Auto>) -> Int
contract { intent { "calls the trapping helper" } }
{ return trapHelper(xs) }
pure flow entryClean(xs: Array<Item>) -> Int
contract { intent { "calls only the clean helper" } }
{ return cleanHelper(xs) }`;

async function selfTest(L) {
  const checks = [];
  const TYPE_FAIL = `@version 1
pure flow bad() -> Int {
  return "nope"
}`;
  const typeFail = renderWat(L, TYPE_FAIL, "ul-typefail");
  checks.push(["type-failing program is a structured gate error, not an un-lowered count",
    typeof typeFail.error === "string" && typeFail.error.startsWith("type:") && typeFail.wat === ""]);
  const lexerSrc = stageSource("lexer.fungi");
  const lexerBody = strip("lexer.fungi");
  const lexerCopies = lexerSrc.split(lexerBody).length - 1;
  checks.push(["lexer.fungi is composed once (not lexer+parser+lexer)", lexerCopies === 1]);
  const fire = renderWat(L, FIRE, "ul-fire");
  const control = renderWat(L, CONTROL, "ul-control");
  checks.push(["both fixtures render to WAT (no parse/emit error) — a fixture that fails to build tests nothing",
    !fire.error && !control.error]);
  const fireHits = fire.wat ? countUnlowered(fire.wat) : [];
  const ctrlHits = control.wat ? countUnlowered(control.wat) : [];
  checks.push(["★ the counter FIRES: the Array<Auto> field read leaves an un-lowered node", fireHits.length > 0]);
  checks.push(["★ the counter is SILENT on the control: the same read through a concrete type fully lowers",
    ctrlHits.length === 0]);
  // Minimality (R&D's #2 law): the control must differ from the fire case in EXACTLY the trapping variable.
  // Neutralise each fixture's element-type-in-Array and its (cosmetic) flow name to a common placeholder,
  // leaving everything else — crucially the shared `record Item` declaration — untouched. If the ONLY
  // difference was the element type, the two neutralised sources are byte-identical. A control that differs
  // in more than one variable proves the trap EXISTS but not what CAUSES it (the Option-vs-erasure
  // mis-attribution from the #100 ruling). We replace `Array<elem>` (not bare `elem`) precisely so the
  // element type in the record's own name is not swept in.
  const canon = (s, elem, flow) => s.split(`Array<${elem}>`).join("Array<§>").split(flow).join("§F");
  checks.push(["★ the control is MINIMAL: fire and control differ in exactly the element type (one variable)",
    canon(FIRE, "Auto", "getAutoField") === canon(CONTROL, "Item", "getTypedField")]);
  const kinds = [...new Set(fireHits)].map((k) => `#${k}`).join(", ");
  checks.push([`the un-lowered node is classified by the emitter's task tag (got: ${kinds || "none"})`,
    fireHits.length > 0 && fireHits.every((k) => k !== "?")]);
  // run-path #2 control — its own fixture (the property under test changed from the module-wide detector).
  const rpFix = renderWat(L, RP_FIXTURE, "ul-rp");
  const rpMW = rpFix.wat ? countUnlowered(rpFix.wat).length : 0;
  const rpReach = rpFix.wat ? runPathCount(rpFix.wat, "entryReaches") : { err: "no wat" };
  const rpClean = rpFix.wat ? runPathCount(rpFix.wat, "entryClean") : { err: "no wat" };
  checks.push(["★ run-path FIRES: an entry calling a trapping helper reaches the un-lowered node",
    !rpReach.err && rpReach.count > 0]);
  checks.push(["★ run-path SILENT: an entry calling only a clean helper reaches 0 — module-wide still > 0",
    !rpClean.err && rpClean.count === 0 && rpMW > 0]);

  let ok = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${name}`); if (!pass) ok = false; }
  if (!ok) { console.error("\n  ❌ unlowered-nodes self-test FAILED — the ratchet's detector is neutered"); process.exit(1); }
  console.log("\n  unlowered-nodes self-test: fires on the real #100 emit site, silent on the minimal concrete-type control ✅");
  process.exit(0);
}

// ── main ─────────────────────────────────────────────────────────────────────
const asJson = process.argv.includes("--json");
if (!existsSync(DIST)) {
  console.error(`[unlowered-nodes] compiler dist not built (${DIST}) — fail-closed`);
  console.log("VIOLATIONS: 1");
  process.exit(1);
}
const L = await import(`file:///${DIST.replace(/\\/g, "/")}`);
if (process.argv.includes("--self-test")) await selfTest(L);

const rows = [];
let total = 0, runPathTotal = 0;
const byKind = {};
for (const { file, entry } of STAGES) {
  const r = renderWat(L, stageSource(file), `ul-${file}`);
  if (r.error) { rows.push({ file, entry, error: r.error, count: 0, runPath: null, kinds: {} }); continue; }
  const hits = countUnlowered(r.wat);
  const kinds = {};
  for (const k of hits) { kinds[k] = (kinds[k] ?? 0) + 1; byKind[k] = (byKind[k] ?? 0) + 1; }
  const rp = runPathCount(r.wat, entry);
  rows.push({ file, entry, count: hits.length, runPath: rp.err ? null : rp.count, rpErr: rp.err ?? null, kinds });
  total += hits.length;
  if (!rp.err) runPathTotal += rp.count;
}

const violations = [];
const renderErr = rows.filter((r) => r.error);
// A render error is fail-closed: a stage we cannot render is a stage we cannot audit — not a silent 0.
for (const r of renderErr) violations.push(`${r.file}: could not render (${r.error}) — cannot count un-lowered nodes; fail-closed`);
if (total > UNLOWERED_BASELINE) violations.push(`${total} un-lowered node(s), baseline ${UNLOWERED_BASELINE} — a NEW un-lowerable construct was introduced. Shrink-only: fix the node, never raise the number.`);
if (total < UNLOWERED_BASELINE && !renderErr.length) violations.push(`${total} un-lowered node(s), baseline ${UNLOWERED_BASELINE} — the count FELL (likely #100 progress). Lower UNLOWERED_BASELINE to ${total} to lock the win in.`);

// run-path resolution is fail-closed: an unresolved call graph (call_indirect, or a missing entry) is NOT a 0.
const rpErr = rows.filter((r) => !r.error && r.rpErr);
for (const r of rpErr) violations.push(`${r.file}: run-path unresolved (${r.rpErr}) — reachability graph incomplete; fail-closed`);
if (!rpErr.length && !renderErr.length && runPathTotal > RUNPATH_BASELINE) violations.push(`run-path un-lowered ${runPathTotal}, baseline ${RUNPATH_BASELINE} — a new REACHABLE un-lowerable node (a fresh R2 trap risk). Shrink-only.`);
if (!rpErr.length && !renderErr.length && runPathTotal < RUNPATH_BASELINE) violations.push(`run-path un-lowered ${runPathTotal}, baseline ${RUNPATH_BASELINE} — reachable debt FELL. Lower RUNPATH_BASELINE to ${runPathTotal}.`);

if (asJson) {
  console.log(JSON.stringify({ rows, total, baseline: UNLOWERED_BASELINE, runPathTotal, runPathBaseline: RUNPATH_BASELINE, byKind, violations }, null, 2));
  process.exit(violations.length);
}

console.log(`\n  un-lowered-node ratchet — WAT nodes the emitter fail-closed instead of lowering (marker: "${MARKER}")\n`);
console.log("  " + "stage".padEnd(28) + "run-path".padEnd(10) + "module".padEnd(9) + "kinds");
console.log("  " + "-".repeat(72));
for (const r of rows) {
  const kinds = r.error ? `render error: ${r.error}` : Object.entries(r.kinds).map(([k, n]) => `#${k}×${n}`).join(" ") || "—";
  const rpDisp = r.error ? "?" : r.rpErr ? "ERR" : String(r.runPath);
  console.log("  " + r.file.padEnd(28) + rpDisp.padEnd(10) + (r.error ? "?" : String(r.count)).padEnd(9) + kinds);
}
console.log("");
if (violations.length) {
  console.error(`  ❌ unlowered-nodes: ${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`    ${v}`);
  console.error("");
} else {
  console.log(`  ✅ unlowered-nodes: run-path ${runPathTotal} (baseline ${RUNPATH_BASELINE}) · module-wide ${total} (baseline ${UNLOWERED_BASELINE}) un-lowered node(s) across ${STAGES.length} stages.`);
  console.log(`     ★ R2->R3 BRIDGE (run-path, module-wide): run-path = nodes REACHABLE from the stage's R2 entry (a live/latent R2 trap); module-wide = every flow's nodes (the R3 byte-parity precondition). run-path ⊆ module-wide; the ${total - runPathTotal}-node gap is un-lowered nodes in funcs the entry never calls — dead from R2, still emitted, so they block R3. A (0, >0) stage RUNS but won't byte-parity (today: type-checker parked 7).`);
  console.log(`     by task tag: ${Object.entries(byKind).map(([k, n]) => `#${k}×${n}`).join(" · ") || "none"} — ALL #128 (unresolved member/name/op/node). #100's field-reads are an INDISTINGUISHABLE subset, NOT the bulk.`);
  console.log(`     surface: EMIT-time, MODULE-WIDE — every flow's un-lowered nodes, not the R2 run-path (audit-stage-execution.mjs). This is the WAT emitter's total partial-lowering debt over the self-hosted stages; fixing #100 removes only its subset.`);
}
console.log(`VIOLATIONS: ${violations.length}`);
console.log(`TOTAL: ${violations.length} unlowered-nodes violation(s) · run-path ${runPathTotal}/${RUNPATH_BASELINE} · module-wide ${total}/${UNLOWERED_BASELINE} (both shrink-only)`);
process.exit(violations.length);
