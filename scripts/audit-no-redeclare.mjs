#!/usr/bin/env node
// =============================================================================
// audit-no-redeclare.mjs — P9 Option-Y guard (R&D 2026-07-19, optional strengthening).
// =============================================================================
// P9 brick-2 supplies each self-hosted STAGE its AST types by CONCATENATING the real
// lexer+parser upstream (Option Y — audit-stage-execution.mjs builds lexer+parser+stage+driver).
// That is sound ONLY while a stage declares NO top-level name already declared upstream:
// the compiler accepts duplicate FLOW names and only throws `Duplicate export name` at WASM
// INSTANTIATE (task #107). Verified collision-free today (parser↔each stage: 0 record + 0 flow
// collisions). This gate keeps it true as the stages evolve — turning a future late-instantiate
// failure (or a silent shadow) into an EARLY, fail-closed diagnostic. Same class as the R2
// stage-execution gate: a cheap name-set intersection, self-tested, phase-close-wired.
//
//   node scripts/audit-no-redeclare.mjs             → enforce (exit = collision count)
//   node scripts/audit-no-redeclare.mjs --self-test → prove the detector fires on a real collision
//   node scripts/audit-no-redeclare.mjs --json      → machine-readable
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SH = join(ROOT, "packages-galerina/galerina-core-compiler/src/self-hosted");

// The upstream that every stage concatenates (the shared-AST-type "prelude", Option Y).
const UPSTREAM = ["lexer.fungi", "parser.fungi"];
// The stages compiled as lexer+parser+<stage> (one module each; they are NOT combined with each other).
const STAGES = ["type-checker.fungi", "effect-checker.fungi", "governance-verifier.fungi", "gir-emitter.fungi", "runtime.fungi"];

/**
 * Pure: extract top-level declaration names (records + flows of any qualifier) from a .fungi source.
 * Anchored to line-start so it never picks up a nested/quoted mention. DI seam — self-testable.
 */
export function declNames(src) {
  const names = new Set();
  for (const m of src.matchAll(/^\s*record\s+([A-Za-z_][A-Za-z0-9_]*)/gm)) names.add(m[1]);
  for (const m of src.matchAll(/^\s*(?:pure |secure |impure |governed )?flow\s+([A-Za-z_][A-Za-z0-9_]*)/gm)) names.add(m[1]);
  return names;
}

/**
 * Pure: given the upstream name-set and a list of {file, names}, return every stage name that
 * collides with upstream. Injected data ⇒ self-testable without the filesystem (DI seam).
 */
export function findCollisions(upstreamNames, stages) {
  const violations = [];
  for (const st of stages) {
    for (const n of st.names) if (upstreamNames.has(n)) violations.push({ stage: st.file, name: n });
  }
  return violations;
}

function loadFungi(file) {
  const p = join(SH, file);
  if (!existsSync(p)) return null;
  let s = readFileSync(p, "utf8");
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);
  return s;
}

// Live path — fail-closed: any missing source is a violation, not a silent pass over nothing.
function run() {
  const missing = [];
  const upstreamNames = new Set();
  for (const f of UPSTREAM) {
    const s = loadFungi(f);
    if (s === null) { missing.push(f); continue; }
    for (const n of declNames(s)) upstreamNames.add(n);
  }
  const stages = [];
  for (const f of STAGES) {
    const s = loadFungi(f);
    if (s === null) { missing.push(f); continue; }
    stages.push({ file: f, names: declNames(s) });
  }
  const violations = findCollisions(upstreamNames, stages);
  return { upstreamCount: upstreamNames.size, stageCount: stages.length, violations, missing };
}

// ── self-test — the detector fires on a real collision AND is silent on the clean tree ──────────
const IS_MAIN = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("scripts/audit-no-redeclare.mjs");
if (IS_MAIN && process.argv.includes("--self-test")) {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) { pass++; console.log(`  ✅ ${m}`); } else { fail++; console.log(`  ❌ ${m}`); } };

  const up = declNames("record Token { kind: String }\npure flow tokenize(s: String) -> Int\ncontract { intent { \"x\" } }\n{ return 0 }");
  ok(up.has("Token") && up.has("tokenize"), "declNames extracts a top-level record AND a flow");
  ok(!declNames("  // a comment mentioning record Token and flow tokenize").size, "does NOT pick up mentions inside a comment line");

  // FIRES: a stage that redeclares an upstream name is flagged.
  const fires = findCollisions(up, [{ file: "fake-stage.fungi", names: new Set(["FlowDecl", "tokenize"]) }]);
  ok(fires.length === 1 && fires[0].name === "tokenize", "FIRES on a stage that redeclares an upstream name (tokenize)");
  // SILENT: a disjoint stage is clean.
  ok(findCollisions(up, [{ file: "fake.fungi", names: new Set(["TypeDiagnostic", "checkFlows"]) }]).length === 0,
    "SILENT on a stage with only its own names");

  // Live: the REAL tree is collision-free, and non-vacuously so (upstream + stages both non-empty).
  const r = run();
  ok(r.missing.length === 0, `all upstream + stage sources present (missing: ${r.missing.join(", ") || "none"})`);
  ok(r.upstreamCount > 0 && r.stageCount === STAGES.length, `non-vacuous: ${r.upstreamCount} upstream names over ${r.stageCount} stages`);
  ok(r.violations.length === 0, `the real tree has 0 parser↔stage collisions (${r.violations.map((v) => `${v.stage}:${v.name}`).join(", ") || "clean"})`);

  console.log(`\n${fail === 0 ? "✅" : "❌"} no-redeclare self-test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

if (IS_MAIN && !process.argv.includes("--self-test")) {
  const asJson = process.argv.includes("--json");
  const r = run();
  const total = r.violations.length + r.missing.length;
  if (asJson) { console.log(JSON.stringify(r, null, 2)); process.exit(total); }
  if (r.missing.length) console.error(`[no-redeclare] fail-closed — missing source(s): ${r.missing.join(", ")}`);
  if (r.violations.length) {
    console.error(`  ❌ no-redeclare: ${r.violations.length} parser↔stage name collision(s) — a stage redeclares an upstream name; this fails LATE at WASM instantiate (Duplicate export name, #107):`);
    for (const v of r.violations) console.error(`    ${v.stage} redeclares '${v.name}'`);
  } else if (!r.missing.length) {
    console.log(`  ✅ no-redeclare: ${r.stageCount} stage(s) declare 0 names colliding with the ${r.upstreamCount}-name lexer+parser upstream (Option Y concat stays sound).`);
  }
  console.log(`VIOLATIONS: ${total}`);
  process.exit(total);
}
