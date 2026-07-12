#!/usr/bin/env node
// status.mjs — Galerina STATUS one-shot. Print the live project state (version / stage / test line / overall % /
// open critical tasks / R&D bridge queue / pointers) WITHOUT re-running the test suite or re-deriving counts.
// A re-runnable TOKEN-SAVER (owner request, 2026-06-22): a session runs THIS instead of `npm test` or grepping.
// Pure-read, zero deps (node:fs/node:path only), informational — never throws on missing files, always exit 0.
//
//   node scripts/status.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."); // repo root (scripts/..)
// R&D bridge lives in a SIBLING repo (…/Galerina-R-AND-D). Resolve relative to the repo root so this
// works on any checkout — never a hardcoded absolute path (see scripts/audit-path-leak.mjs). Missing dir
// is handled gracefully (listDir → null), so an absent sibling just prints n/a.
const RND_TASKS = join(ROOT, "..", "Galerina-R-AND-D", "_session-bridge", "tasks");
const RND_DONE = join(ROOT, "..", "Galerina-R-AND-D", "_session-bridge", "done");

const NA = "n/a";
const readText = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const readJSON = (p) => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const listDir = (p) => { try { return readdirSync(p); } catch { return null; } };

// ── version.json ──────────────────────────────────────────────────────────────
const v = readJSON(join(ROOT, "version.json")) || {};
const version = v.version || NA;
const stage = v.stage || NA;
const date = v.date || NA;
const milestone = v.milestone || NA;

// live test line: prefer packageCount/testCount; format with thousands separators + '0 fail'
const fmt = (n) => (typeof n === "number" ? n.toLocaleString("en-US") : null);
let testLine = NA;
if (v.packageCount != null && v.testCount != null) {
  testLine = `${v.packageCount}/${v.packageCount} packages, ${fmt(v.testCount)} tests, 0 fail`;
} else if (v.testCountNote) {
  testLine = v.testCountNote;
}

// ── overall % : newest *percent-audit* doc in the KB ──────────────────────────
// The KB corpus migrated to the sibling ZTF-Knowledge-Bases repo — resolve like kb-index.mjs /
// audit-doc-drift.mjs (GALERINA_KB_DIR override first), NOT the retired local docs/Knowledge-Bases.
const KB = process.env.GALERINA_KB_DIR || join(ROOT, "..", "ZTF-Knowledge-Bases");
let overall = NA;
let roadmapDoc = null;
const kbFiles = listDir(KB) || [];
// Match ANY percent-audit doc across the historical naming variants (roadmap-and-percent-audit-*,
// percent-audit-roadmap-*, percent-audit-and-*) and pick the newest by the ISO date embedded in the name.
const dateOf = (f) => (f.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || "";
const audits = kbFiles
  // GALERINA-framework audits only — exclude sibling products (tritmeshql-percent-audit-*, etc.).
  .filter((f) => /^galerina-.*percent-audit.*\.md$/i.test(f))
  .sort((a, b) => (dateOf(a) < dateOf(b) ? -1 : dateOf(a) > dateOf(b) ? 1 : a.localeCompare(b)));
if (audits.length) {
  const newest = audits[audits.length - 1];
  roadmapDoc = newest; // KB-relative (sibling ZTF-Knowledge-Bases)
  const txt = readText(join(KB, newest)) || "";
  const line = txt.split(/\r?\n/).find((l) => /shippable|overall/i.test(l));
  if (line) {
    overall = line.replace(/^#+\s*/, "").replace(/\*\*/g, "").replace(/\s+/g, " ").trim();
    overall = overall.split(/\s+[—–-]\s+/)[0].trim(); // keep the leading headline clause only
  }
}

// ── R&D bridge queue : queued tasks vs matching done records ──────────────────
let rndLine = NA;
const tasks = listDir(RND_TASKS);
if (tasks) {
  const queued = tasks.filter((f) => f.endsWith(".md") && f !== "_TEMPLATE.md");
  const doneFiles = listDir(RND_DONE) || [];
  const doneNums = new Set(
    doneFiles
      .map((f) => (f.match(/^(\d{3,4})/) || [])[1])
      .filter(Boolean),
  );
  let doneCount = 0;
  for (const t of queued) {
    const num = (t.match(/^(\d{3,4})/) || [])[1];
    if (num && doneNums.has(num)) doneCount++;
  }
  rndLine = `${queued.length} queued, ${doneCount} done`;
}

// ── pointers (print only if present in the sibling KB) ────────────────────────
const pointerCandidates = [roadmapDoc, "galerina-rd-results-log.md", "galerina-roadmap.md"].filter(Boolean);
const pointers = pointerCandidates
  .filter((p) => existsSync(join(KB, p)))
  .map((p) => `ZTF-Knowledge-Bases/${p}`);

// ── print compact status block ────────────────────────────────────────────────
const out = [];
out.push(`Galerina status — v${version} · ${stage}${date !== NA ? ` · ${date}` : ""}`);
out.push("");
out.push(`  tests     : ${testLine}`);
out.push(`  overall   : ${overall}`);
out.push(`  milestone : ${milestone}`);
out.push("");
out.push(`  open critical tasks:`);
const openTasks = Array.isArray(v.openTasks) ? v.openTasks : [];
if (openTasks.length) {
  for (const t of openTasks) out.push(`    • ${t}`);
} else {
  out.push(`    ${NA}`);
}
out.push("");
out.push(`  R&D queue : ${rndLine}`);
out.push("");
out.push(`  pointers:`);
if (pointers.length) {
  for (const p of pointers) out.push(`    - ${p}`);
} else {
  out.push(`    ${NA}`);
}

console.log(out.join("\n"));
process.exit(0);
