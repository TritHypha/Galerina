#!/usr/bin/env node
// =============================================================================
// audit-checker-wiring.mjs — "dead gate" detector (generalises check-gate-injection.mjs)
// =============================================================================
// THE FAIL-OPEN CLASS THIS PREVENTS (RD-0234 / RD-0234b):
//   A governance checker can be fully IMPLEMENTED and EXPORTED — with diagnostics,
//   tests, docs, the works — yet never CALLED from the compiler pipeline. A file
//   that violates that check then compiles clean and mints a signed .lmanifest,
//   because the gate that would have rejected it is dead code. This is pure
//   negative-space: nothing is wrong with the checker; the wiring that should
//   invoke it simply does not exist. checkTaint, checkMonkeyPatching and
//   checkAttributeDirectives each had ZERO call-sites before the RD-0234 fix — a
//   tainted SQLi, a Runtime.patch monkey-patch and an @experimental_profile{}
//   hidden block all signed clean.
//
// This audit is the generalisation of check-gate-injection.mjs (which guards ONE
// border, fusePackage's revocationCheck) to EVERY exported checker: it scans the
// compiler src for exported functions whose name matches /^(check|verify|detect)[A-Z]/
// and FAILS (exit 1) on any that has ZERO call-sites anywhere in src (excluding the
// defining file's own definition + re-export lines and *.test.* files). Genuinely
// dormant/stub checkers are recorded — with a reason — in the allowlist fixture.
//
// Run:   node scripts/audit-checker-wiring.mjs            (exit 1 on any dead gate)
//        node scripts/audit-checker-wiring.mjs --json
//        node scripts/audit-checker-wiring.mjs --self-test (proves the detector fires)
// =============================================================================
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, relative, sep, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// --root <dir> overrides the repo root (used by fixture tests); default = repo.
const rootIdx = process.argv.indexOf("--root");
const ROOT = rootIdx !== -1 ? process.argv[rootIdx + 1] : join(HERE, "..");
const SRC_DIR = join(ROOT, "packages-galerina/galerina-core-compiler/src");
const ALLOWLIST = join(HERE, "fixtures/checker-wiring-allowlist.txt");

// An exported checker: `export function check|verify|detect` + Capital.  We treat
// these as the governance-gate surface. (Predicates like `verifyWasm` that return a
// boolean are still gates — a caller that never runs them is still a dead gate.)
const EXPORTED_CHECKER_RE = /export\s+function\s+((?:check|verify|detect)[A-Z]\w*)\s*\(/g;

const isTest = (p) => /[\\/]tests?[\\/]|\.test\.|\.spec\./.test(p);
const toRel = (f) => relative(ROOT, f).split(sep).join("/");

/** Recursively collect .ts source files under a dir (excluding .d.ts and dist/build). */
function walkTs(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (["node_modules", ".git", "dist", "build", ".graph"].includes(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walkTs(p, acc);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) acc.push(p);
  }
  return acc;
}

/** Parse the reasoned allowlist: `symbolName  # reason`. Lines starting with # or blank are ignored. */
function loadAllowlist(path) {
  const map = new Map();
  if (!existsSync(path)) return map;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const hash = line.indexOf("#");
    const name = (hash === -1 ? line : line.slice(0, hash)).trim();
    const reason = hash === -1 ? "" : line.slice(hash + 1).trim();
    if (name !== "") map.set(name, reason);
  }
  return map;
}

// ── the pure core (also exercised by --self-test) ────────────────────────────
// Given the set of source files as { relPath, src }, return every exported checker
// and whether it has >=1 call-site OUTSIDE its own definition/re-export lines & tests.
//
// A "call-site" for `checkX` is an occurrence of `checkX(` OR `checkX (` that is NOT:
//   • the `export function checkX(` definition itself,
//   • a re-export / import line naming it (`export { checkX }`, `import { checkX }`),
//   • inside a *.test.* file.
// Aliased re-exports (`export { checkX as gate }`) are conservatively NOT counted as a
// call — a rename is not an invocation. If wiring goes through an alias the call still
// appears as `gate(` somewhere, but to stay honest we require the ORIGINAL name to be
// invoked; a legitimately alias-only checker belongs on the allowlist with that reason.
export function analyzeCheckerWiring(files) {
  // 1. discover every exported checker + where it is defined.
  const defs = new Map(); // name -> { file, defLine (0-based) }
  for (const { relPath, src } of files) {
    if (isTest(relPath)) continue;
    for (const m of src.matchAll(EXPORTED_CHECKER_RE)) {
      const name = m[1];
      // line index of the match
      const lineNo = src.slice(0, m.index).split("\n").length - 1;
      if (!defs.has(name)) defs.set(name, { file: relPath, defLine: lineNo });
    }
  }

  // 2. for each checker, look for a call-site anywhere in non-test src.
  const results = [];
  for (const [name, def] of defs) {
    // A call is the name immediately followed by optional space then "(".
    const callRe = new RegExp(`\\b${name}\\s*\\(`);
    // Lines that merely NAME the symbol without calling it (import/export/type-only).
    const nameRe = new RegExp(`\\b${name}\\b`);
    let callSite = null;
    for (const { relPath, src } of files) {
      if (isTest(relPath)) continue;
      const lines = src.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!nameRe.test(line)) continue;
        // Skip the definition itself (same file + same line).
        if (relPath === def.file && i === def.defLine) continue;
        // Skip import / (re-)export statement lines — these name, not call.
        const t = line.trim();
        if (/^(export|import)\b/.test(t) && !callRe.test(line)) continue;
        // Skip a `export function checkX(` overload/redecl of the same name anywhere.
        if (/^export\s+function\s/.test(t)) continue;
        if (callRe.test(line)) { callSite = { file: relPath, line: i + 1 }; break; }
      }
      if (callSite) break;
    }
    results.push({ name, definedIn: def.file, called: callSite !== null, callSite });
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  return results;
}

// ── --self-test: a neutered dead-gate detector is itself a fail-open ──────────
if (process.argv.includes("--self-test")) {
  // Plant a FAKE exported-but-uncalled checker and assert the detector flags exactly it,
  // and that a genuinely-called checker in the same synthetic corpus is NOT flagged.
  const corpus = [
    // defines checkPlanted (uncalled) AND checkWired (defined here, called in pipeline.ts)
    { relPath: "src/planted-checker.ts",
      src: `export function checkPlanted(ast) { return []; }\nexport function checkWired(ast) { return []; }\n` },
    // the pipeline calls checkWired but NEVER checkPlanted
    { relPath: "src/pipeline.ts",
      src: `import { checkWired, checkPlanted } from "./planted-checker.js";\n` +
           `export function run(ast) {\n  const d = checkWired(ast);\n  return d;\n}\n` },
    // a re-export line that names checkPlanted must NOT count as a call
    { relPath: "src/index.ts",
      src: `export { checkPlanted, checkWired } from "./planted-checker.js";\n` },
    // a test file that DOES call checkPlanted must NOT rescue it (tests are excluded)
    { relPath: "src/planted-checker.test.ts",
      src: `import { checkPlanted } from "./planted-checker.js";\ncheckPlanted(fakeAst);\n` },
  ];
  const res = analyzeCheckerWiring(corpus);
  const planted = res.find((r) => r.name === "checkPlanted");
  const wired = res.find((r) => r.name === "checkWired");
  const ok =
    planted !== undefined && planted.called === false &&   // dead gate detected
    wired !== undefined && wired.called === true;          // live gate NOT false-flagged
  if (ok) {
    console.log("[self-test] PASS — detector flags the planted uncalled checker (dead gate) and");
    console.log("            does NOT flag the wired one; re-export + test-file call-sites are ignored.");
  } else {
    console.log("[self-test] FAIL");
    console.log("  checkPlanted:", JSON.stringify(planted));
    console.log("  checkWired:  ", JSON.stringify(wired));
  }
  process.exit(ok ? 0 : 1);
}

// ── scan the real compiler source ────────────────────────────────────────────
const files = walkTs(SRC_DIR).map((f) => ({ relPath: toRel(f), abs: f, src: readFileSync(f, "utf8") }));
if (files.length === 0) {
  console.error(`FAIL: no source files under ${toRel(SRC_DIR)} — extractor/path mismatch.`);
  process.exit(1);
}
const allow = loadAllowlist(ALLOWLIST);
const results = analyzeCheckerWiring(files);

const wired = results.filter((r) => r.called);
const dormantAllowed = results.filter((r) => !r.called && allow.has(r.name));
const deadGates = results.filter((r) => !r.called && !allow.has(r.name));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({
    checkerCount: results.length, wired: wired.length,
    allowlisted: dormantAllowed.map((r) => ({ name: r.name, reason: allow.get(r.name) })),
    deadGates: deadGates.map((r) => ({ name: r.name, definedIn: r.definedIn })),
  }, null, 2));
  process.exit(deadGates.length ? 1 : 0);
}

console.log(`\n=== checker-wiring audit — every exported checker must have a call-site ===`);
console.log(`   scanned ${files.length} src files | exported checkers: ${results.length} | wired: ${wired.length}`);
if (dormantAllowed.length) {
  console.log(`\n   allowlisted (intentionally dormant — see fixtures/checker-wiring-allowlist.txt):`);
  for (const r of dormantAllowed) console.log(`     [skip] ${r.name}  — ${allow.get(r.name) || "(no reason given)"}`);
}
if (deadGates.length) {
  console.log(`\n   DEAD GATES (exported checker with ZERO call-sites — the RD-0234 fail-open class):`);
  for (const r of deadGates) console.log(`     [FAIL] ${r.name}   (defined in ${r.definedIn})`);
  console.log(`\nFAIL: ${deadGates.length} exported checker(s) are never called anywhere in src.`);
  console.log(`Wire each into the compile pipeline (see index.ts / cli.ts), or — if genuinely`);
  console.log(`dormant/stub — add a line + reason to scripts/fixtures/checker-wiring-allowlist.txt.`);
  process.exit(1);
}
console.log(`\nOK: all ${results.length} exported checkers have at least one call-site.`);
