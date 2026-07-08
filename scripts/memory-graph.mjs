#!/usr/bin/env node
// =============================================================================
// memory-graph.mjs — index the auto-memory (MEMORY.md + topic files) as a tag/link GRAPH.
//
// Owner request (2026-06-27): keep MEMORY.md tiny — put detail in topic files, reference only
// subject + tags in the index, and build a dev tool to index this. This is the memory analogue of
// scripts/kb-index.mjs (which indexes the KB prose). It lets a session FIND a memory by tag/subject/
// link instead of loading the whole index, AND audits memory health (dangling links, orphans, dupes)
// so the index can be pruned and kept small.
//
// MODES
//   BUILD:  node scripts/memory-graph.mjs              -> writes <dir>/MEMORY-GRAPH.json + prints a health report
//   QUERY:  node scripts/memory-graph.mjs <terms...>   -> ranked memories (tag/subject/description) + their links
//           node scripts/memory-graph.mjs --tag rd     -> memories carrying #rd
//   --dir <path>  override the memory dir (default: this machine's Claude auto-memory dir; or env MEMORY_DIR)
//
// Pure Node ESM, zero deps. Read-only on the memory tree except the generated MEMORY-GRAPH.json sidecar.
// =============================================================================

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";

// Resolve the auto-memory dir ROBUSTLY. A hardcoded C:\Users\<name>\... path breaks on any machine
// reinstall / username change (it did: the old `desig` default 404'd after the box was rebuilt as `phill`).
// Precedence: --dir (parsed below) > MEMORY_DIR env > autodetect the populated memory/ under
// ~/.claude/projects (the folder that actually holds MEMORY.md) > a last-resort guess.
function autodetectMemoryDir() {
  const projects = join(homedir(), ".claude", "projects");
  let entries;
  try { entries = readdirSync(projects, { withFileTypes: true }); } catch { return null; }
  let best = null, bestScore = -1;
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const mem = join(projects, e.name, "memory");
    let mds;
    try { mds = readdirSync(mem).filter((f) => f.endsWith(".md")); } catch { continue; }
    // Strongly prefer the dir carrying the MEMORY.md index; tie-break on note count.
    const score = mds.length + (mds.includes("MEMORY.md") ? 1_000_000 : 0);
    if (score > bestScore) { bestScore = score; best = mem; }
  }
  return best;
}

const DEFAULT_DIR =
  process.env.MEMORY_DIR ??
  autodetectMemoryDir() ??
  join(homedir(), ".claude", "projects", "C--Users-phill", "memory");

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
let dir = DEFAULT_DIR;
let tagFilter = null;
const terms = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--dir") dir = argv[++i];
  else if (argv[i] === "--tag") tagFilter = (argv[++i] || "").replace(/^#/, "").toLowerCase();
  else terms.push(argv[i]);
}
if (!existsSync(dir)) {
  console.error(`memory-graph: memory dir not found: ${dir}\n  pass --dir <path> or set MEMORY_DIR.`);
  process.exit(2);
}

// ── parse the MEMORY.md index: "- [subject](slug.md) — hook #tag #tag" ───────
function parseIndex(text) {
  const entries = new Map(); // slug -> {subject, hook, tags[], section}
  let section = "";
  for (const line of text.split(/\r?\n/)) {
    const sec = /^##\s+(.+?)\s*$/.exec(line);
    if (sec) { section = sec[1]; continue; }
    const m = /^- \[([^\]]+)\]\(([^)]+)\)\s*(?:[—-]\s*(.*))?$/.exec(line);
    if (!m) continue;
    const subject = m[1].trim();
    const slug = m[2].trim();
    const rest = (m[3] ?? "").trim();
    const tags = [...rest.matchAll(/#([a-z0-9-]+)/gi)].map((t) => t[1].toLowerCase());
    const hook = rest.replace(/#[a-z0-9-]+/gi, "").replace(/\s+$/, "").trim();
    entries.set(slug, { subject, hook, tags, section });
  }
  return entries;
}

// ── parse a topic file's frontmatter + [[links]] ──────────────────────────────
function parseTopic(text) {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const meta = { name: null, description: null, type: null };
  if (fm) {
    const name = /(^|\n)name:\s*(.+)/.exec(fm[1]);
    const desc = /(^|\n)description:\s*(.+)/.exec(fm[1]);
    const type = /(^|\n)\s*type:\s*([A-Za-z|]+)/.exec(fm[1]);
    if (name) meta.name = name[2].trim().replace(/^["']|["']$/g, "");
    if (desc) meta.description = desc[2].trim().replace(/^["']|["']$/g, "");
    if (type) meta.type = type[2].trim();
  }
  const links = [...text.matchAll(/\[\[([a-z0-9-]+)\]\]/gi)].map((l) => l[1].toLowerCase());
  return { meta, links: [...new Set(links)] };
}

// ── scan ──────────────────────────────────────────────────────────────────────
// The index is SPLIT (owner 2026-07-02): MEMORY.md = HOT set (auto-loaded into every session, kept tiny);
// MEMORY-ARCHIVE.md = COLD overflow (NOT auto-loaded, recall by query). Both are authoritative index files —
// a topic file listed in EITHER is "indexed". Neither is itself a topic file.
const INDEX_FILES = ["MEMORY.md", "MEMORY-ARCHIVE.md"];
const files = readdirSync(dir).filter((f) => f.endsWith(".md") && !INDEX_FILES.includes(f));
const fileSlugs = new Set(files.map((f) => basename(f, ".md")));
const readIndex = (name) =>
  existsSync(join(dir, name)) ? parseIndex(readFileSync(join(dir, name), "utf8")) : new Map();
const hotEntries = readIndex("MEMORY.md");
const coldEntries = readIndex("MEMORY-ARCHIVE.md");
const indexEntries = new Map([...coldEntries, ...hotEntries]); // union; hot wins on any overlap

const nodes = {}; // slug -> node
for (const f of files) {
  const slug = basename(f, ".md");
  const { meta, links } = parseTopic(readFileSync(join(dir, f), "utf8"));
  const idx = indexEntries.get(`${slug}.md`) ?? indexEntries.get(slug);
  nodes[slug] = {
    slug,
    subject: idx?.subject ?? meta.name ?? slug,
    description: meta.description ?? idx?.hook ?? "",
    type: meta.type ?? "unknown",
    section: idx?.section ?? null,
    tags: idx?.tags ?? [],
    links,
    inIndex: Boolean(idx),
  };
}

// links + health
const danglingLinks = []; // file -> missing [[target]]
const tagMap = {}; // tag -> [slug]
const orphans = []; // file not referenced in MEMORY.md
for (const n of Object.values(nodes)) {
  for (const l of n.links) if (!fileSlugs.has(l)) danglingLinks.push({ from: n.slug, to: l });
  for (const t of n.tags) (tagMap[t] ??= []).push(n.slug);
  if (!n.inIndex) orphans.push(n.slug);
}
// dangling INDEX entries (a MEMORY.md line whose target file does not exist)
const danglingIndex = [];
for (const key of indexEntries.keys()) {
  const slug = key.replace(/\.md$/, "");
  if (!fileSlugs.has(slug)) danglingIndex.push(slug);
}
// duplicate descriptions (near-dupe smell)
const byDesc = {};
for (const n of Object.values(nodes)) {
  const k = n.description.slice(0, 40).toLowerCase();
  if (k) (byDesc[k] ??= []).push(n.slug);
}
const dupes = Object.values(byDesc).filter((a) => a.length > 1);

// ── QUERY mode ────────────────────────────────────────────────────────────────
if (terms.length || tagFilter) {
  const q = terms.map((t) => t.toLowerCase());
  const scored = Object.values(nodes)
    .map((n) => {
      let s = 0;
      if (tagFilter && n.tags.includes(tagFilter)) s += 5;
      for (const t of q) {
        if (n.tags.includes(t)) s += 4;
        if (n.subject.toLowerCase().includes(t)) s += 3;
        if (n.slug.includes(t)) s += 2;
        if (n.description.toLowerCase().includes(t)) s += 1;
      }
      return { n, s };
    })
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, 15);
  if (!scored.length) { console.log(`No memory matches ${tagFilter ? `#${tagFilter} ` : ""}${q.join(" ")}`); process.exit(0); }
  console.log(`\nMemory matches (${scored.length}):\n`);
  for (const { n, s } of scored) {
    console.log(`  [${s}] ${n.subject}  (${n.slug}.md)  #${n.tags.join(" #") || "—"}`);
    if (n.description) console.log(`        ${n.description.slice(0, 110)}`);
    if (n.links.length) console.log(`        → ${n.links.join(", ")}`);
  }
  console.log("");
  process.exit(0);
}

// ── BUILD mode ──────────────────────────────────────────────────────────────────
const graph = {
  generatedFrom: dir,
  counts: { files: files.length, indexed: indexEntries.size, hot: hotEntries.size, cold: coldEntries.size, nodes: Object.keys(nodes).length },
  tags: Object.fromEntries(Object.entries(tagMap).map(([t, a]) => [t, a.length]).sort((a, b) => b[1] - a[1])),
  tagMap,
  nodes,
  health: {
    danglingIndex,     // MEMORY.md lines pointing at a missing file (prune or write the file)
    orphans,           // topic files missing from MEMORY.md (add a line or delete)
    danglingLinks,     // [[links]] whose target file is absent
    duplicateDescriptions: dupes,
  },
};
writeFileSync(join(dir, "MEMORY-GRAPH.json"), JSON.stringify(graph, null, 2));

const topTags = Object.entries(graph.tags).slice(0, 12).map(([t, c]) => `#${t}(${c})`).join(" ");
console.log(`\nmemory-graph: ${graph.counts.files} files · ${graph.counts.indexed} indexed · ${Object.keys(graph.tags).length} tags`);
console.log(`  -> ${join(dir, "MEMORY-GRAPH.json")}`);
console.log(`  TIERS: ${graph.counts.hot} hot (MEMORY.md, auto-loaded) · ${graph.counts.cold} cold (MEMORY-ARCHIVE.md, recall by query)`);
console.log(`  top tags: ${topTags}`);
// "unindexed" = a topic file in NEITHER index (genuinely undiscoverable → add a line or delete). Being COLD
// (in the archive, not in MEMORY.md) is EXPECTED and healthy — that is how the hot set is kept tiny.
console.log(`  HEALTH: ${danglingIndex.length} dangling index, ${orphans.length} unindexed files, ${danglingLinks.length} dangling [[links]], ${dupes.length} dup-description clusters`);
if (danglingIndex.length) console.log(`    dangling index (prune or create the file): ${danglingIndex.slice(0, 20).join(", ")}`);
if (orphans.length) console.log(`    unindexed (add to MEMORY.md or MEMORY-ARCHIVE.md, or delete): ${orphans.slice(0, 20).join(", ")}`);
if (danglingLinks.length) console.log(`    dangling [[links]] (fix or write target): ${danglingLinks.slice(0, 20).map((d) => `${d.from}→${d.to}`).join(", ")}`);
console.log(`  query: node scripts/memory-graph.mjs <terms>   |   --tag <tag>\n`);
