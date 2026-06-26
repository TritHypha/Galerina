#!/usr/bin/env node
// rd-absorb.mjs — R&D DONE-FILE ABSORBER / REPORTER. Automates the standing process (owner 2026-06-23):
// when an R&D job comes back (`_session-bridge/done/NNNN-*.done.md`) the hub must ABSORB it into the KB and
// add a verdict row to docs/Knowledge-Bases/galerina-rd-results-log.md. This tool tells you WHAT still needs
// absorbing instead of eyeballing two directories — a re-runnable TOKEN-SAVER (reads state, recomputes nothing).
//
//   node scripts/rd-absorb.mjs            -> report: UNABSORBED (actionable) vs already-logged
//   node scripts/rd-absorb.mjs --json     -> machine-readable
//   node scripts/rd-absorb.mjs --all      -> also list the already-logged set
//
// Per done-file it reads: the NNNN id (leading digits of the filename — slug fallback if none), the title +
// status marker from the FIRST '# ' heading (DONE / partial / blocked / complete / killed, checkmark-aware).
// "Absorbed" = the id/slug is referenced in the results log OUTSIDE its '## Pending' table (a Pending row means
// dispatched-but-not-yet-absorbed → still UNABSORBED). Informational: exit 0 ALWAYS, missing files handled.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = process.cwd();
// R&D repo is a sibling of the Galerina repo; allow override via env for non-standard checkouts.
const RND = process.env.GALERINA_RND_DIR || join(ROOT, "..", "Galerina-R-AND-D");
const DONE_DIR = join(RND, "_session-bridge", "done");
const LOG = join(ROOT, "docs", "Knowledge-Bases", "galerina-rd-results-log.md");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const showAll = args.includes("--all");
const summaryOnly = args.includes("--summary"); // one-line heartbeat for the periodic Stop hook

// ── gather done-files ─────────────────────────────────────────────────────────
let files = [];
try {
  files = readdirSync(DONE_DIR).filter((f) => f.endsWith(".done.md")).sort();
} catch {
  const msg = "rd-absorb: 0 done-files yet (no _session-bridge/done/ — nothing to absorb).";
  console.log(asJson ? JSON.stringify({ doneDir: DONE_DIR, exists: false, doneFiles: 0, unabsorbed: [] }, null, 2) : msg);
  process.exit(0);
}
if (files.length === 0) {
  const msg = "rd-absorb: 0 done-files yet (done/ is empty).";
  console.log(asJson ? JSON.stringify({ doneDir: DONE_DIR, exists: true, doneFiles: 0, unabsorbed: [] }, null, 2) : msg);
  process.exit(0);
}

// ── load the results log + carve off the Pending table (dispatched ≠ absorbed) ──
let logText = "";
let logExists = true;
try { logText = readFileSync(LOG, "utf8"); } catch { logExists = false; }
// Split into the "## Pending" section vs the rest. A Pending-only mention is NOT an absorption.
function sliceSection(text, headingRe) {
  const lines = text.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) { if (headingRe.test(lines[i])) { start = i; break; } }
  if (start === -1) return { section: "", rest: text };
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) { if (/^##\s+/.test(lines[i])) { end = i; break; } }
  return {
    section: lines.slice(start, end).join("\n"),
    rest: lines.slice(0, start).concat(lines.slice(end)).join("\n"),
  };
}
const { section: pendingSection, rest: absorbedText } = sliceSection(logText, /^##\s+Pending\b/i);

// ── parse one done-file ───────────────────────────────────────────────────────
const STATUS = [
  [/\bkilled\b/i, "killed"],
  [/\bblocked\b/i, "blocked"],
  [/⚠️|\bpartial\b/i, "partial"],
  [/\b(r&d-complete|done|complete|proven|shipped)\b/i, "done"],
];
function parseDoneFile(file) {
  const path = join(DONE_DIR, file);
  const name = basename(file).replace(/\.done\.md$/, "");
  const idMatch = name.match(/^(\d{3,4})/);
  const id = idMatch ? idMatch[1] : null;          // numeric R&D id, or null for slug-named records
  const slug = name;                               // full unique identity (handles 0009 vs 0009-recheck)
  let firstHeading = "";
  try {
    const txt = readFileSync(path, "utf8");
    const line = txt.split(/\r?\n/).find((l) => /^#\s+/.test(l)); // first real '# ' heading (skips '>' citation blocks)
    firstHeading = (line || "").replace(/^#\s+/, "").trim();
  } catch { /* unreadable — keep blank, still reported */ }
  // title = heading minus a leading "NNNN — " / "NNNN-recheck — " prefix and a trailing status marker
  let title = firstHeading
    .replace(/^\d{3,4}[\w-]*\s*[—–-]\s*/, "")
    .replace(/\s*[—–-]\s*(done|complete|partial|blocked|killed|r&d-complete).*$/i, "")
    .replace(/\s*[✅⚠️].*$/u, "")
    .trim() || firstHeading || slug;
  let status = "done"; // default: it's in done/, treat as done unless the heading says otherwise
  for (const [re, s] of STATUS) { if (re.test(firstHeading)) { status = s; break; } }
  return { id, slug, title, status, firstHeading, file };
}

// ── "is this id/slug already absorbed?" (mentioned outside the Pending table) ──
function absorbed(rec) {
  if (!logExists) return false;
  // Prefer the numeric id (referenced as "0036", "R&D 0036", "0014-C3", "#0036"); fall back to a slug keyword.
  if (rec.id) {
    // word-bounded id, NOT immediately followed by more digits (so 003 doesn't match 0036)
    const re = new RegExp(`(?<!\\d)${rec.id}(?!\\d)`);
    if (re.test(absorbedText)) return true;
    // also accept the recheck/follow-up form (e.g. "0009-recheck") referenced anywhere incl. pending text
    if (rec.slug.includes("-") && absorbedText.includes(rec.slug)) return true;
    return false;
  }
  // slug-named records (owed-closure, roadmap-*, quantum-bridge) — match a distinctive token
  const key = rec.slug.split("-").slice(0, 3).join("-");
  return absorbedText.toLowerCase().includes(key.toLowerCase());
}
// pending = the id appears ONLY in the Pending table (dispatched, awaiting absorption)
function pendingOnly(rec) {
  if (!rec.id) return false;
  const re = new RegExp(`(?<!\\d)${rec.id}(?!\\d)`);
  return re.test(pendingSection) && !absorbed(rec);
}

const records = files.map(parseDoneFile);
const unabsorbed = records.filter((r) => !absorbed(r));
const loggedSet = records.filter((r) => absorbed(r));

// ── output ────────────────────────────────────────────────────────────────────
if (asJson) {
  console.log(JSON.stringify({
    doneDir: DONE_DIR, logExists, doneFiles: records.length,
    unabsorbedCount: unabsorbed.length, loggedCount: loggedSet.length,
    unabsorbed: unabsorbed.map((r) => ({ id: r.id, slug: r.slug, title: r.title, status: r.status, pending: pendingOnly(r) })),
    logged: loggedSet.map((r) => ({ id: r.id, slug: r.slug, status: r.status })),
  }, null, 2));
  process.exit(0);
}

const STAT_MARK = { done: "✓", partial: "⚠", blocked: "⛔", killed: "✗" };
console.log(
  `rd-absorb: ${records.length} done-file(s) · ${unabsorbed.length} UNABSORBED · ${loggedSet.length} already-logged` +
  (logExists ? "" : "  (results-log MISSING — everything counts as unabsorbed)"),
);
if (summaryOnly) process.exit(0);

if (unabsorbed.length) {
  console.log(`\n── UNABSORBED — add a verdict row to galerina-rd-results-log.md ──`);
  for (const r of unabsorbed) {
    const mark = STAT_MARK[r.status] || "?";
    const tag = pendingOnly(r) ? " [dispatched/pending — done-file just landed]" : "";
    console.log(`  ${mark} ${(r.id || "—").padEnd(5)} ${r.title}${tag}`);
  }
} else {
  console.log(`\nAll done-files are referenced in the results log — nothing to absorb. ✓`);
}

if (showAll && loggedSet.length) {
  console.log(`\n── already-logged (${loggedSet.length}) ──`);
  for (const r of loggedSet) console.log(`  ${(r.id || "—").padEnd(5)} ${r.title}`);
} else if (loggedSet.length) {
  console.log(`\n(${loggedSet.length} already-logged — pass --all to list them)`);
}
process.exit(0);
