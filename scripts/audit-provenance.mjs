#!/usr/bin/env node
// audit-provenance.mjs — TASK-BLD-003 (#219 standard "artifact provenance + freshness"; folds #216).
//
// Every generated artifact must (a) carry a provenance sidecar `provenance.json` {tool, gitCommit, builtAt} and
// (b) be FRESH vs its sources. This gate flags:
//   MISSING   — the artifact was never generated (run its tool)
//   UNSTAMPED — no provenance sidecar / no gitCommit (can't tell what produced it — #216 gap)
//   STALE     — a source file is NEWER than the artifact (mtime), i.e. a source changed since the last regen
// Freshness is mtime-based (locally accurate; the phase-close regen refreshes all three so a clean tree is green).
//
// --soft = report-only (exit 0). Prints `VIOLATIONS: N` for the lint-conventions umbrella. Run from repo root.
import { readFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const soft = process.argv.includes("--soft");
const asJson = process.argv.includes("--json");
const SKIP = new Set(["node_modules", "dist", ".git", "build"]);
const EXT = /\.(ts|mjs|cjs|fungi|md|json)$/;

// Registered generated artifacts → the source trees/files they derive from.
const ARTIFACTS = [
  { name: "code-index", file: "build/code-index/code-index.json", prov: "build/code-index/provenance.json", sources: ["packages-galerina", "docs", "scripts"] },
  { name: "code-registry", file: "build/code-registry/registry.json", prov: "build/code-registry/provenance.json", sources: ["packages-galerina", "scripts"] },
  // KB corpus migrated to the sibling ZTF-Knowledge-Bases repo — track freshness against the REAL source
  // (kb-index.mjs indexes it), not the retired local docs/Knowledge-Bases (which read as mtime 0 = a blind spot).
  { name: "kb-index", file: "build/kb-index/kb-index.json", prov: "build/kb-index/provenance.json", sources: ["../ZTF-Knowledge-Bases", "README.md", "AGENTS.md"] },
];

function newestMtime(dir) {
  let newest = 0, ents;
  try { ents = readdirSync(join(ROOT, dir), { withFileTypes: true }); } catch { return 0; }
  for (const e of ents) {
    if (SKIP.has(e.name)) continue;
    const rel = join(dir, e.name);
    if (e.isDirectory()) newest = Math.max(newest, newestMtime(rel));
    else if (EXT.test(e.name)) { try { newest = Math.max(newest, statSync(join(ROOT, rel)).mtimeMs); } catch { /* skip */ } }
  }
  return newest;
}
function newestOf(src) {
  const abs = join(ROOT, src);
  try { const st = statSync(abs); return st.isDirectory() ? newestMtime(src) : st.mtimeMs; } catch { return 0; }
}

const findings = [];
for (const a of ARTIFACTS) {
  const abs = join(ROOT, a.file);
  if (!existsSync(abs)) { findings.push({ name: a.name, issue: "MISSING", detail: `${a.file} not generated (run its tool / phase-close)` }); continue; }
  // provenance sidecar (#216): present + has a gitCommit?
  let prov;
  try { prov = JSON.parse(readFileSync(join(ROOT, a.prov), "utf8")); } catch { /* absent */ }
  if (!prov || !prov.gitCommit) findings.push({ name: a.name, issue: "UNSTAMPED", detail: `${a.prov} missing or has no gitCommit` });
  // freshness: any source newer than the artifact?
  const artMtime = statSync(abs).mtimeMs;
  const srcMtime = Math.max(0, ...a.sources.map(newestOf));
  if (srcMtime > artMtime) findings.push({ name: a.name, issue: "STALE", detail: `a source is newer than the artifact (built ${new Date(artMtime).toISOString()}) — regenerate` });
}

if (asJson) {
  console.log(JSON.stringify({ tool: "provenance", artifacts: ARTIFACTS.map((a) => a.name), findings }, null, 2));
} else {
  const out = ["# BLD-003 artifact provenance + freshness\n"];
  for (const a of ARTIFACTS) {
    const f = findings.filter((x) => x.name === a.name);
    out.push(`${f.length ? "✗" : "✓"} ${a.name} — ${f.length ? f.map((x) => x.issue).join(", ") : "fresh + stamped"}`);
    for (const x of f) out.push(`    ${x.issue}: ${x.detail}`);
  }
  out.push(`\nVIOLATIONS: ${findings.length}`);
  out.push(findings.length === 0 ? "ARTIFACTS FRESH + STAMPED ✓" : "ARTIFACT PROVENANCE/FRESHNESS GAPS — regenerate or stamp.");
  console.log(out.join("\n"));
}
process.exit(soft ? 0 : Math.min(findings.length, 250));
