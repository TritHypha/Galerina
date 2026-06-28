#!/usr/bin/env node
// audit-syntax.mjs — BAD-SYNTAX / PARSE-ERROR tracker for BOTH `.spore` AND `.ts` (owner 2026-06-28).
// Surfaces parse/lex errors EARLY — the kind that today only bite late in the fuse pipeline (e.g. an
// "Unexpected token }" SPORE-PARSE-001 that escaped review in an ext-bridge package, or a stray brace in a
// .ts that only blows up at tsc time). Implements the owner's "every error ⇒ a dev-tool detector" rule.
//
//   node scripts/audit-syntax.mjs            -> grouped report (by language) of every file with a parse error
//   node scripts/audit-syntax.mjs --summary   -> one-line heartbeat for the periodic Stop hook
//   node scripts/audit-syntax.mjs --json      -> machine-readable JSON
//
// HOW IT WORKS (a re-runnable TOKEN-SAVER — never spawns `galerina build`; there are 400+ .spore):
//   .spore : parsed IN-PROCESS via the SHIPPED core-compiler parser (parseProgram), per-file try/catch.
//            A finding = a thrown error, OR a SPORE-PARSE-* / SPORE-LEX-* diagnostic of severity "error".
//            (Syntax/lex layer only — semantic-checker diagnostics live in other passes, not parseProgram.)
//   .ts    : parsed IN-PROCESS via the TypeScript compiler API (createSourceFile -> parseDiagnostics).
//            SYNTAX errors ONLY — no typecheck, so it stays fast. Degrades gracefully (skips .ts with a
//            note) if `typescript` cannot be resolved from the compiler package.
//
// Informational only — exit 0 ALWAYS, handles missing dist / missing typescript gracefully (never blocks).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd();
const asJson = process.argv.includes("--json");
const summaryOnly = process.argv.includes("--summary"); // one-line heartbeat for the periodic Stop hook
const includeAll = process.argv.includes("--all");      // also scan the known non-prod corpora (examples/tests/drafts)

// Vendored / generated / VCS noise — never scanned (matches audit-stray-docs.mjs).
const SKIP_DIRS = new Set(["node_modules", "dist", "build", ".git", ".graph", ".pytest_cache", ".cache", "coverage", "out", "target", ".next", ".turbo"]);
// .ts scan is scoped to first-party source roots (the rest is vendored or generated).
const TS_ROOTS = ["packages-galerina", "scripts"];

// ── file walker ──────────────────────────────────────────────────────────────────
// Collect files matching `pred(name)` under `dir`, skipping noise dirs + dotdirs.
function walk(dir, pred, acc) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue; // skip noise + dotdirs
      walk(full, pred, acc);
    } else if (e.isFile() && pred(e.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const rel = (p) => relative(ROOT, p).replace(/\\/g, "/");
const topDir = (r) => (r.includes("/") ? r.slice(0, r.indexOf("/")) : "(repo root)");

// Known NON-PRODUCTION corpora the Stage-A compiler legitimately does not parse — excluded from the heartbeat
// baseline (use --all to include). Real source (src/) is ALWAYS scanned. See the examples-corpora / compiler-gaps
// memory notes: per-package examples are the v0.1 prototype corpus, docs/examples are unimplemented readable-forms,
// tests/ hold deliberately-malformed parser fixtures, and _audit_tmp/_scratch/tmp are throwaway.
function isExpectedCorpus(r) {
  if (r.startsWith("docs/examples/")) return true;
  if (r.startsWith("_audit_tmp/") || r.startsWith("_scratch/") || r.startsWith("tmp/")) return true;
  const seg = r.split("/");
  if (seg.includes("tests")) return true;
  if (r.startsWith("packages-galerina/") && seg.includes("examples")) return true; // per-package prototype corpora (NOT repo-root examples/)
  return false;
}

// ── .spore : SHIPPED core-compiler parser, resolved relative to THIS script (works from any checkout) ──
const DIST = join(HERE, "..", "packages-galerina", "galerina-core-compiler", "dist", "index.js");
let parseProgram = null;
let sporeLoadError = null;
try {
  const mod = await import(pathToFileURL(DIST).href);
  parseProgram = mod.parseProgram;
  if (typeof parseProgram !== "function") throw new Error("dist did not export parseProgram");
} catch (e) {
  sporeLoadError = e.message; // degrade gracefully — .spore section reports it could not load the parser
}

const sporeFiles = walk(ROOT, (n) => n.endsWith(".spore"), []).filter((abs) => includeAll || !isExpectedCorpus(rel(abs)));
const sporeFindings = []; // { rel, line, code, message }
let sporeScanned = 0;
if (parseProgram) {
  for (const abs of sporeFiles) {
    sporeScanned++;
    const r = rel(abs);
    let text;
    try { text = readFileSync(abs, "utf8"); } catch (e) {
      sporeFindings.push({ rel: r, line: 0, code: "READ", message: `could not read file: ${e.message}` });
      continue;
    }
    try {
      const result = parseProgram(text, r);
      // A SYNTAX finding = a SPORE-PARSE-* / SPORE-LEX-* diagnostic of severity "error".
      // (Other "error" diagnostics, if any, belong to later semantic passes — out of scope for a SYNTAX audit.)
      for (const d of result?.diagnostics ?? []) {
        if (d?.severity !== "error") continue;
        const code = String(d.code ?? "");
        if (!(code.startsWith("SPORE-PARSE") || code.startsWith("SPORE-LEX"))) continue;
        sporeFindings.push({ rel: r, line: d.location?.line ?? 0, code, message: d.message ?? "(no message)" });
      }
    } catch (e) {
      // The parser is fail-closed but a never-before-seen input could still throw (e.g. depth RangeError) —
      // that IS a finding: a file the parser cannot handle would crash the fuse pipeline.
      sporeFindings.push({ rel: r, line: 0, code: "SPORE-THROW", message: (e && e.message) ? e.message : String(e) });
    }
  }
}

// ── .ts : TypeScript compiler API (syntax-only parse), resolved from a package that ships typescript ──
let ts = null;
let tsLoadError = null;
try {
  // The compiler package carries typescript as a devDependency; resolve from there.
  const require = createRequire(join(HERE, "..", "packages-galerina", "galerina-core-compiler", "package.json"));
  ts = require("typescript");
} catch (e1) {
  try {
    // Fallback: resolve relative to this script's own package tree.
    const require = createRequire(pathToFileURL(join(HERE, "package.json")).href);
    ts = require("typescript");
  } catch (e2) {
    tsLoadError = `${e1.message}`; // degrade gracefully — .ts section reports it was skipped
  }
}

// .ts under first-party roots only; exclude generated declaration files (.d.ts have no syntax of their own).
let tsFiles = [];
if (ts) {
  for (const root of TS_ROOTS) {
    walk(join(ROOT, root), (n) => n.endsWith(".ts") && !n.endsWith(".d.ts"), tsFiles);
  }
  tsFiles = tsFiles.filter((abs) => includeAll || !isExpectedCorpus(rel(abs)));
}
const tsFindings = []; // { rel, line, code, message }
let tsScanned = 0;
if (ts) {
  for (const abs of tsFiles) {
    tsScanned++;
    const r = rel(abs);
    let text;
    try { text = readFileSync(abs, "utf8"); } catch (e) {
      tsFindings.push({ rel: r, line: 0, code: "READ", message: `could not read file: ${e.message}` });
      continue;
    }
    try {
      // setParentNodes=false -> faster; we only need parse diagnostics, not a bound tree.
      const sf = ts.createSourceFile(r, text, ts.ScriptTarget.Latest, false);
      // parseDiagnostics = SYNTAX errors from the scanner/parser ONLY (no binder/typecheck). Internal but stable.
      const diags = sf.parseDiagnostics ?? [];
      for (const d of diags) {
        let line = 0;
        try { if (d.start != null) line = sf.getLineAndCharacterOfPosition(d.start).line + 1; } catch { /* keep 0 */ }
        const message = ts.flattenDiagnosticMessageText(d.messageText, "\n");
        tsFindings.push({ rel: r, line, code: `TS${d.code}`, message });
      }
    } catch (e) {
      tsFindings.push({ rel: r, line: 0, code: "TS-THROW", message: (e && e.message) ? e.message : String(e) });
    }
  }
}

// ── tallies (files with ≥1 finding, not raw finding count) ─────────────────────────
const sporeBadFiles = new Set(sporeFindings.map((f) => f.rel)).size;
const tsBadFiles = new Set(tsFindings.map((f) => f.rel)).size;

// ── JSON ───────────────────────────────────────────────────────────────────────────
if (asJson) {
  console.log(JSON.stringify({
    generated: "audit-syntax",
    spore: {
      scanned: sporeScanned,
      parserLoaded: parseProgram != null,
      loadError: sporeLoadError,
      badFiles: sporeBadFiles,
      findings: sporeFindings,
    },
    ts: {
      scanned: tsScanned,
      typescriptLoaded: ts != null,
      loadError: tsLoadError,
      badFiles: tsBadFiles,
      findings: tsFindings,
    },
  }, null, 2));
  process.exit(0);
}

// ── one-line summary (the required heartbeat shape) ─────────────────────────────────
const totalScanned = sporeScanned + tsScanned;
const summary = `syntax-audit: ${sporeBadFiles} .spore + ${tsBadFiles} .ts file(s) with parse errors (of ${totalScanned} scanned)`;
const notes = [];
if (!parseProgram) notes.push(`.spore parser NOT loaded (${sporeLoadError}) — build Galerina first; .spore skipped`);
if (!ts) notes.push(`typescript NOT resolved (${tsLoadError}) — .ts skipped`);
if (!includeAll) notes.push("non-prod corpora (examples/tests/drafts) excluded — use --all to include");

if (summaryOnly) {
  console.log(summary + (notes.length ? `  [${notes.join(" · ")}]` : ""));
  process.exit(0);
}

// ── grouped human report (by language, then by top-level dir) ───────────────────────
function groupByDir(findings) {
  const byDir = new Map();
  for (const f of findings) {
    const t = topDir(f.rel);
    if (!byDir.has(t)) byDir.set(t, []);
    byDir.get(t).push(f);
  }
  for (const arr of byDir.values()) arr.sort((a, b) => a.rel.localeCompare(b.rel) || a.line - b.line);
  return [...byDir.entries()].sort((a, b) => b[1].length - a[1].length);
}

function emitSection(out, label, scanned, loaded, loadErr, badFiles, findings, hint) {
  out.push(`\n## ${label}  —  ${badFiles} file(s) with parse errors  (of ${scanned} scanned)`);
  if (!loaded) {
    out.push(`  SKIPPED: ${hint} (${loadErr}).`);
    return;
  }
  if (findings.length === 0) {
    out.push(`  clean — no parse errors.`);
    return;
  }
  for (const [dir, arr] of groupByDir(findings)) {
    out.push(`\n  ${dir}/  (${arr.length} finding(s))`);
    for (const f of arr.slice(0, 50)) {
      out.push(`    ${f.rel}:${f.line} — [${f.code}] ${f.message}`);
    }
    if (arr.length > 50) out.push(`    … and ${arr.length - 50} more`);
  }
}

const out = [];
out.push(summary + (notes.length ? `  [${notes.join(" · ")}]` : ""));
emitSection(out, "(a) .spore — Galerina source (core-compiler parseProgram)", sporeScanned, parseProgram != null, sporeLoadError, sporeBadFiles, sporeFindings, "could not import the shipped parser dist");
emitSection(out, "(b) .ts — TypeScript implementation (createSourceFile, syntax-only)", tsScanned, ts != null, tsLoadError, tsBadFiles, tsFindings, "could not resolve the typescript compiler API");

console.log(out.join("\n"));
process.exit(0);
