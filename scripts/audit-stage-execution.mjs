#!/usr/bin/env node
// =============================================================================
// audit-stage-execution.mjs — R2: does each self-hosted stage actually RUN?
// =============================================================================
// THE MISSING RUNG. P9's ladder was R0 (builds → WASM) → R1 (#105-admits, exports) → R3 (byte-parity ≡
// Stage-A). From 2026-07-12 the status read: "all 7 stage twins build (R0) + #105-admit (R1), flows
// callable — the WAT emitter is not the blocker." Every word TRUE. It read as "the stages work".
//
// On 2026-07-17 a sweep found THREE of them throw `unreachable` on one trivial flow. They ARE callable.
// They do not RUN. R1 asks "does it export?"; R3 asks "does it agree with Stage-A?". Nothing asked "does
// it run at all?" — and that question is cheap: one call per stage. Five days of "proven" rested on a
// question nobody had put.
//
//     R0  builds to WASM
//     R1  #105-admits and exports
//     R2  RUNS on one real input, without trapping     <- this file
//     R3  byte-parity ≡ Stage-A over a corpus
//
// ★ THIS GATE IS RATCHETED, NOT ZERO-BASELINE, AND THAT IS DELIBERATE. Three stages trap TODAY (root
// cause: task #100 — reading a record field off an Option payload from `.get()` on an `Array<Auto>`;
// the element type is erased so the field offset is unknown at lowering). A zero-baseline gate would be
// red on arrival and get switched off within a day. A DECLARED shrink-only baseline is red the moment a
// FOURTH stage breaks, and red if a trapping stage is fixed without lowering the number — which is the
// house pattern (ADVISORY_BASELINE, ESCAPE_BASELINE, CROSSING_BASELINE).
//
// Usage:
//   node scripts/audit-stage-execution.mjs             → enforce (exit = violation count)
//   node scripts/audit-stage-execution.mjs --self-test → prove the detector fires on a known trap
//   node scripts/audit-stage-execution.mjs --json      → machine-readable
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SH = join(ROOT, "packages-galerina/galerina-core-compiler/src/self-hosted");
const DIST = join(ROOT, "packages-galerina/galerina-core-compiler/dist/index.js");
const REGISTRY = join(ROOT, "docs/contract-registry/contract-registry.json");
const TESTS = join(ROOT, "packages-galerina/galerina-core-compiler/tests");

// ── the declared surface ─────────────────────────────────────────────────────
// Every entry is CHECKED against the Contract Registry before the sweep. A hand list that silently rots
// sweeps nothing and reports it as a pass — that is the exact class this gate exists to catch, and a gate
// is not exempt from its own thesis.
//
// `expect` is the DECLARED baseline: what this stage does today. "runs" must never regress to "traps".
// "traps" is a debt with a name (#100) — lowering it is the goal; a stage silently joining it is not.
const STAGES = [
  { file: "parser.fungi", entry: "parseFlows", expect: "runs",
    body: "let p = parseFlows(toks) return p.flows.count()" },
  { file: "type-checker.fungi", entry: "checkFlows", expect: "traps", debt: "#100",
    body: "let p = parseFlows(toks) let r = checkFlows(p.flows) return r.flowCount" },
  { file: "effect-checker.fungi", entry: "checkFlowEffects", expect: "traps", debt: "#100",
    body: "let p = parseFlows(toks) let r = checkFlowEffects(p.flows) return r.flowCount" },
  { file: "governance-verifier.fungi", entry: "verifyGovernance", expect: "traps", debt: "#100",
    body: "let p = parseFlows(toks) let r = verifyGovernance(p.flows) return r.passed + r.failed" },
  // gir-emitter's ON-chain entry is emitGIRModule(flows: Array<Auto>). It read fd.name/fd.returnExpr off the
  // erased Auto payload — the identical #100 shape as the three above. FIXED 2026-07-19 (P9 brick-2, Option Y —
  // concatenate the real lexer+parser, the in-tree R2 pattern, so parser's FlowDecl/Expr/Stmt are in scope):
  // emitGIRModule's `flows` param concretized to Array<FlowDecl>, its callees' AST params to Expr/Stmt/FlowParam,
  // and the record-field binder given a typed local (`let re: ReturnExpr = fd.returnExpr`) — so field offsets
  // resolve and the stage RUNS. R3 emitGIRModule byte-parity (Stage-A interpreter == Stage-B WASM) verified green.
  // The driver returns g.pureCount (an Int field on GIRModule) so a dead-code-eliminated call can't read as "runs".
  { file: "gir-emitter.fungi", entry: "emitGIRModule", expect: "runs",
    body: "let p = parseFlows(toks) let g = emitGIRModule(p.flows) return g.pureCount" },
];
// Shrink-only. Raise it and you are declaring a new stage broken; that needs a human sentence, not a bump.
// 3: gir-emitter's #100 debt was PAID 2026-07-19 (its `flows` param concretized to Array<FlowDecl> — it RUNS and
// is R3 byte-parity green), so the sweep drops 4→3, leaving the three remaining trappers (type-checker,
// effect-checker, governance-verifier). Lowered because a debt was retired, never raised.
const TRAP_BASELINE = 3;

// ★ NOT SWEPT — declared, never silently omitted. A gate that quietly covers 4 of 7 while its green says
// nothing is the surface problem this whole file is about.
const NOT_SWEPT = [
  { file: "lexer.fungi", why: "exercised by every probe below — tokenize runs first in each driver; a lex failure surfaces as -1" },
  { file: "runtime.fungi", why: "verified by wat-p9-runtime-exec-parity.test.mjs (exec-value R3: Stage-A interpreter == Stage-B WASM over runProgram's real return value), NOT by this compile-pipeline sweep. Its #100 sites were concretized 2026-07-19 (stage-local RtValue/Binding + the cross-stage GIRExpr/GIRStmt/FlowEntry it walks from gir-emitter), so envLookup no longer reads off an Array<Auto> payload. Excluded here for a STRUCTURAL reason, not a debt: runtime consumes gir-emitter's records, so it needs the 4-STAGE concat (lexer+parser+gir-emitter+runtime); this gate's 2-stage lexer+parser+<stage> probe cannot express that cross-stage type dependency. runtime also traps at EXECUTION, not COMPILE, so an admitted-and-run driver (that test) is its correct instrument — a compile sweep that never runs a GIR can't observe it." },
];

// RD 2026-07-19 hardening: a NOT_SWEPT `why` that cites an enforcing test ("verified by X.test.mjs") is a
// CLAIM, and a claim that isn't mechanically checkable rots. The stale `why` I hand-fixed here (it named an
// Array<Auto> read + "no execution driver", both untrue after the concretization + the exec-parity test) is
// exactly the stale-green this gate exists to catch — recurring inside the gate's OWN exemption list. So
// every cited *.test.mjs must EXIST in the suite dir, else the exemption's proof is a fiction → fail closed.
function citedTests(why) {
  return [...String(why ?? "").matchAll(/([A-Za-z0-9._-]+\.test\.mjs)/g)].map((m) => m[1]);
}
function missingCitedTests() {
  const missing = [];
  for (const s of NOT_SWEPT) {
    for (const t of citedTests(s.why)) {
      if (!existsSync(join(TESTS, t))) missing.push({ file: s.file, test: t });
    }
  }
  return missing;
}

// Stages CANNOT share a module: `appendAll` is defined in both type-checker and governance-verifier
// (`paramNames` in type-checker and gir-emitter), the compiler accepts duplicate FLOW names, and it only
// fails at WASM instantiate with `Duplicate export name`. See task #107. Hence: one module per stage.

const TRIVIAL_FLOW = `pure flow ok(a: Int) -> Int
contract { intent { "the simplest valid input a stage can be handed" } }
{
  return a
}`;

const strip = (p) => {
  let s = readFileSync(join(SH, p), "utf8");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s.replace(/^@version 1\s*/m, "");
};

/**
 * Build ONE module (lexer + parser + stage + driver), admit it through #105, call the driver once.
 * Returns { stage, r0, r1, r2 } where r2 ∈ {"runs","traps","lex-failed","not-exported",...}.
 *
 * The driver returns a value DERIVED from the stage's own result — never a constant. A probe returning
 * `1` after calling f() passes while f() is dead-code-eliminated: it reports "runs" for a call that never
 * happened.
 */
async function probeStage(L, { file, entry, body }, source) {
  const extra = file === "parser.fungi" ? "" : "\n" + strip(file);
  const driver = `
pure flow r2probe(src: String) -> Int
contract { intent { "R2: does ${entry} run on one real input?" } }
{
  let res = tokenize(src)
  match res {
    Ok(toks) => { ${body} }
    _ => { return -1 }
  }
}
`;
  const src = "@version 1\n" + strip("lexer.fungi") + "\n" + strip("parser.fungi") + extra + "\n" + driver;
  const out = { file, entry, r0: "?", r1: "?", r2: "?" };

  const prog = L.parseProgram(src, `r2-${file}`);
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  if (errs.length) { out.r0 = `parse:${errs[0].code}`; out.r2 = "r0-failed"; return out; }
  const fx = L.checkEffects(prog.flows, prog.ast);
  const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
  const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "r2", prog.ast, true));
  const asm = await L.assembleWAT(wat);
  if (!asm.valid) { out.r0 = "assemble-invalid"; out.r2 = "r0-failed"; return out; }
  out.r0 = "ok";

  const host = L.createHostRuntime();
  let maxH = 0;
  for (const e of L.getInternedStrings()) { host.seedString(e.handle, e.value); if (e.handle > maxH) maxH = e.handle; }
  const kp = L.generateRunnerKeypair();
  const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
  let instance;
  try {
    ({ instance } = await L.admitAndInstantiate({
      wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
    }));
    out.r1 = "ok";
  } catch (e) {
    out.r1 = "rejected";
    out.r2 = "r1-failed";
    out.detail = String(e.message).replace("CRITICAL_SECURITY_VIOLATION: instantiation failed: ", "").split(" @+")[0];
    return out;
  }
  if (typeof instance.exports.r2probe !== "function") { out.r2 = "not-exported"; return out; }

  const h = maxH + 1;
  host.seedString(h, source);
  try {
    const v = instance.exports.r2probe(h);
    out.r2 = v === -1 ? "lex-failed" : "runs";
    out.value = v;
  } catch (e) {
    out.r2 = "traps";
    out.detail = String(e).split("\n")[0].replace("RuntimeError: ", "");
  }
  return out;
}

// ── self-test ────────────────────────────────────────────────────────────────
// ★ The fixture is the REAL repro that root-caused the outage — Array<Auto>.get() + a field read on the
// payload. A detector proven against a synthetic trap proves it can see a trap I invented; this one is
// proven against the trap that actually happened.
const TRAP_FIXTURE = `@version 1

record Item {
  name: String
  size: Int
}

/// TRAPS: the element type is erased to Auto, so the field offset is unknown at lowering (task #100).
pure flow getAutoField(items: Array<Auto>) -> Int
contract { intent { "read a record field off an Option payload from an Array<Auto>" } }
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
}

/// CONTROL: identical body, CONCRETE element type — must RUN, else the fixture proves nothing.
pure flow getTypedField(items: Array<Item>) -> Int
contract { intent { "the same read through a concretely-typed array" } }
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
}

pure flow driveAuto() -> Int
contract { intent { "drive the trapping shape" } }
{
  mut xs: Array<Item> = Array.empty()
  xs = xs.append(Item { name: "a", size: 1 })
  return getAutoField(xs)
}
pure flow driveTyped() -> Int
contract { intent { "drive the control shape" } }
{
  mut xs: Array<Item> = Array.empty()
  xs = xs.append(Item { name: "a", size: 1 })
  return getTypedField(xs)
}
`;

async function selfTest(L) {
  const checks = [];
  const prog = L.parseProgram(TRAP_FIXTURE, "r2-selftest.fungi");
  const errs = (prog.diagnostics ?? []).filter((d) => d.severity === "error");
  checks.push(["the trap fixture parses clean (R0) — a fixture that fails to build tests nothing", errs.length === 0]);
  if (errs.length === 0) {
    const fx = L.checkEffects(prog.flows, prog.ast);
    const { gir } = L.emitGIR(prog.ast, prog.flows, fx);
    const wat = L.renderWAT(L.buildWATModuleFromGIR(gir, undefined, "st", prog.ast, true));
    const asm = await L.assembleWAT(wat);
    checks.push(["…and assembles (R0) — so the trap is at RUN time, not build time", asm.valid]);
    if (asm.valid) {
      const host = L.createHostRuntime();
      let maxH = 0;
      for (const e of L.getInternedStrings()) { host.seedString(e.handle, e.value); if (e.handle > maxH) maxH = e.handle; }
      const kp = L.generateRunnerKeypair();
      const att = L.signWasm(asm.wasm, kp.privateKeyPem, "dev");
      const { instance } = await L.admitAndInstantiate({
        wasm: asm.wasm, attestation: att, policy: { requireSigned: true, publicKeyPem: kp.publicKeyPem }, host,
      });
      checks.push(["…and #105-admits + exports (R1) — R0+R1 GREEN on code that does not run: the whole point", typeof instance.exports.driveAuto === "function"]);

      let autoTrapped = false, typedRan = false, typedValue = null;
      try { instance.exports.driveAuto(); } catch { autoTrapped = true; }
      try { typedValue = instance.exports.driveTyped(); typedRan = true; } catch { /* control must not trap */ }

      checks.push(["★ the detector FIRES: Array<Auto>.get() + field read traps", autoTrapped]);
      checks.push(["★ the detector is SILENT on the control: the same read via a concrete type RUNS", typedRan && typedValue === 1]);
      // Without the control, "it traps" is indistinguishable from "everything traps" — the fires-case
      // alone would pass against a totally broken emitter and prove nothing about the discriminator.
    }
  }
  checks.push(["the declared baseline is shrink-only and stated", Number.isInteger(TRAP_BASELINE) && TRAP_BASELINE >= 0]);
  checks.push(["the not-swept set is declared, not silently omitted", NOT_SWEPT.length > 0 && NOT_SWEPT.every((s) => s.why)]);
  checks.push(["every NOT_SWEPT 'verified by <test>' cites a test file that EXISTS in tests/", missingCitedTests().length === 0]);
  checks.push(["★ the NOT_SWEPT test-reference check FIRES on a missing test (silent on a real one)",
    citedTests("verified by __no_such_test__.test.mjs").length === 1 && !existsSync(join(TESTS, "__no_such_test__.test.mjs"))]);

  let ok = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${name}`); if (!pass) ok = false; }
  if (!ok) { console.error("\n  ❌ stage-execution self-test FAILED — the R2 detector is neutered"); process.exit(1); }
  console.log("\n  stage-execution self-test: fires on the real #100 trap, silent on the concrete-type control ✅");
  process.exit(0);
}

// ── main ─────────────────────────────────────────────────────────────────────
const asJson = process.argv.includes("--json");

if (!existsSync(DIST)) {
  console.error(`[stage-execution] compiler dist not built (${DIST}) — fail-closed`);
  console.log("VIOLATIONS: 1");
  process.exit(1);
}
const L = await import(`file:///${DIST.replace(/\\/g, "/")}`);

if (process.argv.includes("--self-test")) await selfTest(L);

// Verify the declared surface against the Contract Registry BEFORE sweeping. Absent registry = fail
// closed: sweeping an unverified list is how a probe reports "0 traps" over nothing.
if (!existsSync(REGISTRY)) {
  console.error(`[stage-execution] contract registry absent (${REGISTRY}) — cannot verify the declared entry points; fail-closed.`);
  console.error(`  Fix: node scripts/gen-contract-registry.mjs`);
  console.log("VIOLATIONS: 1");
  process.exit(1);
}
const REG = JSON.parse(readFileSync(REGISTRY, "utf8")).rows;
const rotted = STAGES.filter((s) => !REG.some((c) => c.file.endsWith(`self-hosted/${s.file}`) && c.name === s.entry));
if (rotted.length) {
  console.error(`[stage-execution] declared entry point(s) not in the registry — the list has rotted; fail-closed:`);
  for (const s of rotted) console.error(`    ${s.entry} not found in ${s.file}`);
  console.log(`VIOLATIONS: ${rotted.length}`);
  process.exit(rotted.length);
}

const results = [];
for (const s of STAGES) results.push({ ...(await probeStage(L, s, TRIVIAL_FLOW)), expect: s.expect, debt: s.debt });

const violations = [];
for (const r of results) {
  if (r.expect === "runs" && r.r2 !== "runs") violations.push(`${r.file}: DECLARED "runs" but R2 = ${r.r2}${r.detail ? ` (${r.detail})` : ""} — a stage that ran now does not`);
  if (r.expect === "traps" && r.r2 === "runs") violations.push(`${r.file}: DECLARED "traps" (${r.debt}) but it RUNS — the debt is paid; LOWER TRAP_BASELINE to ${TRAP_BASELINE - 1} and update the declaration`);
}
const traps = results.filter((r) => r.r2 === "traps").length;
if (traps > TRAP_BASELINE) violations.push(`${traps} stage(s) trap, baseline ${TRAP_BASELINE} — a NEW stage broke. The baseline is shrink-only: fix the stage, never raise the number.`);
// A NOT_SWEPT exemption that cites an enforcing test must point at a test that EXISTS — else "covered
// elsewhere" is an unbacked claim (the stale-`why` class). Fail closed on a missing cited test.
for (const m of missingCitedTests()) {
  violations.push(`${m.file}: NOT_SWEPT 'why' cites ${m.test} as its enforcing test, but that file is ABSENT from tests/ — the exemption's proof does not exist (fail-closed).`);
}

if (asJson) {
  console.log(JSON.stringify({ results, traps, baseline: TRAP_BASELINE, notSwept: NOT_SWEPT, violations }, null, 2));
  process.exit(violations.length);
}

console.log(`\n  R2 — does each self-hosted stage RUN on one real input? (input: the simplest valid flow)\n`);
console.log("  " + "stage".padEnd(28) + "R0".padEnd(6) + "R1".padEnd(6) + "R2".padEnd(14) + "declared");
console.log("  " + "-".repeat(70));
for (const r of results) {
  const flag = (r.expect === "runs" && r.r2 !== "runs") || (r.expect === "traps" && r.r2 === "runs") ? " ⚠" : "";
  console.log("  " + r.file.padEnd(28) + r.r0.padEnd(6) + r.r1.padEnd(6) + r.r2.padEnd(14) + r.expect + (r.debt ? ` (${r.debt})` : "") + flag);
}
console.log("");
if (violations.length) {
  console.error(`  ❌ stage-execution: ${violations.length} violation(s):\n`);
  for (const v of violations) console.error(`    ${v}`);
  console.error("");
} else {
  // G0 — the green states its SURFACE and its EXCLUSIONS. "Stages run" over 4 of 7 is the false green
  // this gate exists because of.
  console.log(`  ✅ stage-execution: ${results.length - traps}/${results.length} swept stage(s) RUN · ${traps} trap, matching the declared baseline (${TRAP_BASELINE}).`);
  console.log(`     ★ this is NOT "P9 works": ${traps} stage(s) are KNOWN BROKEN and declared so — the debt is ${[...new Set(results.filter((r) => r.debt).map((r) => r.debt))].join(", ")}.`);
  console.log(`     surface: R2 only — "runs without trapping". NOT R3 (byte-parity ≡ Stage-A), which is a separate, stronger claim.`);
  console.log(`     NOT swept:`);
  for (const s of NOT_SWEPT) console.log(`       ${s.file.padEnd(26)} ${s.why}`);
}
console.log(`VIOLATIONS: ${violations.length}`);
console.log(`TOTAL: ${violations.length} stage-execution violation(s) · ${traps}/${results.length} swept stages trap (baseline ${TRAP_BASELINE}, shrink-only)`);
process.exit(violations.length);
