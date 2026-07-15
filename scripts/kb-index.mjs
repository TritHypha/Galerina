#!/usr/bin/env node
// kb-index.mjs — index the Galerina Knowledge-Base (ZTF-Knowledge-Bases/**/*.md, RECURSIVE — ~690 files) so you can
// FIND the right doc by keyword instead of grep-reading the whole tree. A re-runnable TOKEN-SAVER (owner request,
// 2026-06-22): build the index once, then QUERY it. Sibling to code-index.mjs (codes) — this indexes KB PROSE.
//
// Two modes:
//   BUILD:  node scripts/kb-index.mjs               -> build/kb-index/kb-index.json + KB-INDEX.md + stdout summary
//   QUERY:  node scripts/kb-index.mjs <terms...>    -> ranked docs (tf-idf, title/heading/code-boosted) + matching headings
//           node scripts/kb-index.mjs --code FUNGI-PRIVACY-002   -> docs that mention a specific code
//
// Per doc it indexes: title (first # heading), all sub-headings, bold terms, FUNGI-*/ERR_ codes, task #NNN refs,
// [[kb-cross-refs]], and a term-frequency table (title+headings weighted). JSON for tools, MD for humans/AI.
import { readdirSync, readFileSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { extractCodes } from "./lib/codes.mjs";
import { writeProvenance } from "./lib/provenance.mjs"; // BLD-003 / #216 provenance sidecar

const ROOT = process.cwd(); // repo root when run by phase-close (cwd=Galerina); the dev-tool test drives it with cwd=tmp
// The KB was relocated OUT of this repo (IP separation) — same convention as audit-effect-canonicality.mjs.
// Default to the sibling ZTF-Knowledge-Bases; override with GALERINA_KB_DIR. Recurse it: rd-absorbed/,
// defensive-publications/, schemas/ … were silently dropped by the old flat scan of the now-removed
// docs/Knowledge-Bases (a flat, non-recursive index reports a false "seen everything").
const KB = process.env.GALERINA_KB_DIR || join(ROOT, "..", "ZTF-Knowledge-Bases");
const KB_SKIP = new Set(["build", "node_modules", ".git"]);       // build/ = generated indexes (would self-pollute)
const EXTRA = ["README.md", "AGENTS.md"]; // also index repo-root key docs if present
const OUT = join(ROOT, "build", "kb-index");
const STOP = new Set(
  ("the a an and or of to in for on with is are be as by at from this that it its into not no can may will would " +
   "should could we you our your they their than then so but if has have had was were which who what when where how " +
   "all any one two via per etc eg ie vs do does done now new use used using only also more most less over under")
    .split(/\s+/),
);

function walkMd(dir, out) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.isDirectory()) { if (!KB_SKIP.has(e.name)) walkMd(join(dir, e.name), out); }
    else if (e.isFile() && e.name.endsWith(".md")) out.push(join(dir, e.name));
  }
  return out;
}
function kbFiles() {
  const out = walkMd(KB, []);                                    // recurse the whole KB (skip build/ etc.)
  // FAIL-CLOSED (worktree footgun, 2026-07-09): an absent/unreadable KB dir used to scan as 0 docs and BUILD
  // silently OVERWROTE the good committed index with an empty one (764->2 docs data-loss inside a
  // .claude/worktrees/** checkout, where the sibling ../ZTF-Knowledge-Bases is NOT adjacent — walkMd's
  // catch{} laundered the ENOENT). A 0-doc KB is never a valid corpus; refuse loudly BEFORE any write.
  // Counted BEFORE adding EXTRA so the repo-root README/AGENTS files can't mask an empty KB as "2 docs".
  if (out.length === 0) {
    console.error(
      `kb-index: FAIL-CLOSED — no .md docs found under the KB dir:\n  ${KB}\n` +
      `  The corpus lives in the sibling ZTF-Knowledge-Bases repo (override: GALERINA_KB_DIR). In a git\n` +
      `  worktree (.claude/worktrees/**) the sibling is not adjacent — set GALERINA_KB_DIR or run from the\n` +
      `  main checkout. Nothing was written; the existing build/kb-index/ is preserved.`,
    );
    process.exit(1);
  }
  for (const f of EXTRA) { const p = join(ROOT, f); try { statSync(p); out.push(p); } catch { /* absent */ } }
  return out;
}
const tokenize = (s) => (s.toLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || []).filter((w) => !STOP.has(w));
// KB doc titles/headings sometimes embed an absolute local path (a doc titled with `C:\Users\<name>\...`).
// This index is committed in the PUBLIC Galerina repo, so copy those in verbatim and it leaks the OS
// username/layout (the class scripts/audit-path-leak.mjs enforces). Genericize on the way out so a regen
// never re-introduces the leak, no matter what the private KB source contains.
const scrub = (s) => s
  .replace(/[A-Za-z]:[\\/]{1,2}Users[\\/]{1,2}[^\s"'`)\]]+/g, "<path>")
  .replace(/(?:[A-Za-z]:[\\/]{1,2})?wwwprojects[\\/][^\s"'`)\]]*/g, "<path>")
  // Windows env-var path literals (the USERPROFILE / APPDATA / HOMEPATH tokens, percent-wrapped) — the
  // `windows-env-literal` class scripts/audit-path-leak.mjs enforces. scrub() predated that detector, so a KB
  // doc that QUOTES the pattern to teach the portability rule leaked it into this committed index on regen.
  // Genericize it too, so the two stay in lockstep (a bare `userprofile` token never trips the %-anchored gate).
  .replace(/%(?:USERPROFILE|USERNAME|HOMEPATH|HOMEDRIVE|APPDATA|LOCALAPPDATA)%/gi, "<env-var>");

function indexDoc(file) {
  const rel = relative(ROOT, file).replace(/\\/g, "/");
  const txt = readFileSync(file, "utf8");
  const lines = txt.split(/\r?\n/);
  const title = scrub((lines.find((l) => /^#\s+/.test(l)) || basename(file)).replace(/^#\s+/, "").trim());
  const headings = lines.filter((l) => /^#{2,4}\s+/.test(l)).map((l) => scrub(l.replace(/^#+\s+/, "").trim()));
  const bold = [...new Set([...txt.matchAll(/\*\*([^*\n]{2,64})\*\*/g)].map((m) => scrub(m[1].trim())))];
  const codes = [...new Set(extractCodes(txt))];
  const tasks = [...new Set(txt.match(/#\d{2,4}\b/g) || [])];
  const xrefs = [...new Set([...txt.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]))];
  const tf = new Map();
  const bump = (w, n) => tf.set(w, (tf.get(w) || 0) + n);
  for (const w of tokenize(txt)) bump(w, 1);
  for (const w of tokenize(title + " " + headings.join(" "))) bump(w, 4); // boost structural terms
  return { rel, title, headings, bold, codes, tasks, xrefs, tf, len: Math.max(1, [...tf.values()].reduce((a, b) => a + b, 0)) };
}

const docs = kbFiles().map(indexDoc);
const N = docs.length;
const df = new Map();
for (const d of docs) for (const w of d.tf.keys()) df.set(w, (df.get(w) || 0) + 1);

// ── QUERY mode ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const codeFlag = args.indexOf("--code");
if (codeFlag !== -1) {
  const code = args[codeFlag + 1];
  const hits = docs.filter((d) => d.codes.includes(code)).map((d) => d.rel);
  console.log(`# kb-index --code ${code}  (${hits.length} doc(s))\n${hits.map((h) => "  " + h).join("\n")}`);
  process.exit(0);
}
const query = args.filter((a) => !a.startsWith("--"));
if (query.length) {
  const qts = tokenize(query.join(" "));
  const scored = docs.map((d) => {
    let s = 0;
    for (const qt of qts) {
      const tf = d.tf.get(qt) || 0; if (!tf) continue;
      s += (tf / d.len) * Math.log(1 + N / (df.get(qt) || 1)); // tf-idf
    }
    const hay = (d.title + " " + d.headings.join(" ") + " " + d.codes.join(" ") + " " + d.xrefs.join(" ")).toLowerCase();
    for (const qt of qts) if (hay.includes(qt)) s += 0.05; // exact title/heading/code/xref bonus
    return { d, s };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 12);
  console.log(`# kb-index query: "${query.join(" ")}"  (${scored.length} hit(s))\n`);
  for (const { d, s } of scored) {
    console.log(`${s.toFixed(3)}  ${d.rel}`);
    console.log(`    ${d.title}`);
    const hh = d.headings.filter((h) => qts.some((qt) => h.toLowerCase().includes(qt))).slice(0, 4);
    if (hh.length) console.log(`    ↳ ${hh.join("  ·  ")}`);
  }
  if (!scored.length) console.log("(no matches — try fewer/broader terms, or --code <CODE>)");
  process.exit(0);
}

// ── BUILD mode ────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true });
const topTerms = (d, n) => [...d.tf.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([w]) => w);
const machine = docs.map((d) => ({ rel: d.rel, title: d.title, headings: d.headings, codes: d.codes, tasks: d.tasks, xrefs: d.xrefs, topTerms: topTerms(d, 25) }));
writeFileSync(join(OUT, "kb-index.json"), JSON.stringify({ generated: "kb-index", docCount: N, docs: machine }, null, 2));
const md = [`# Galerina KB index (${N} docs)`, ``, `Query: \`node scripts/kb-index.mjs <terms>\`  ·  by code: \`node scripts/kb-index.mjs --code FUNGI-...\``, ``];
for (const d of [...docs].sort((a, b) => a.rel.localeCompare(b.rel))) {
  md.push(`## ${d.title}`);
  md.push(`\`${d.rel}\``);
  if (d.codes.length) md.push(`- codes: ${d.codes.slice(0, 24).join(", ")}`);
  if (d.tasks.length) md.push(`- tasks: ${d.tasks.slice(0, 24).join(", ")}`);
  if (d.xrefs.length) md.push(`- links: ${d.xrefs.slice(0, 12).map((x) => "[[" + x + "]]").join(" ")}`);
  md.push(`- terms: ${topTerms(d, 14).join(", ")}`);
  md.push("");
}
writeFileSync(join(OUT, "KB-INDEX.md"), md.join("\n"));
writeProvenance(OUT, "kb-index"); // BLD-003 / #216
console.log(`kb-index: ${N} KB docs indexed -> build/kb-index/KB-INDEX.md + kb-index.json (query: node scripts/kb-index.mjs <terms>)`);
