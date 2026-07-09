#!/usr/bin/env node
// audit-papers-index.mjs — fail-CLOSED guard for the papers corpus index (docs/paper/README.md).
// A published defensive-publication is a prior-art record; an index that silently omits one, or links to a
// paper that no longer exists, is a governance gap (the corpus no longer says what it contains). This gate:
//   1. every tracked paper under docs/paper/{defensive,scientific}-papers/ MUST be linked from the index;
//   2. every paper link in the index MUST resolve to a real file (no dangling record);
//   3. the intro corpus COUNTS ("**22**" defensive, "**1**" scientific) MUST match reality (no header drift).
// Core logic is pure (FS + git injected) so `--self-test` proves the detectors fire without touching disk —
// a neutered guard is itself a fail-open ([[fail-closed-not-fail-open-gates]]).
//
// Usage:
//   node scripts/audit-papers-index.mjs --self-test   # prove the detectors fire (run first in CI)
//   node scripts/audit-papers-index.mjs               # enforce: exit 1 on any gap
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Spawn git directly, NO shell: args pass as an array (no shell-injection surface, no DEP0190).
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", windowsHide: true });

const INDEX = "docs/paper/README.md";
const DEF_DIR = "docs/paper/defensive-papers/";
const SCI_DIR = "docs/paper/scientific-papers/";

// Paper targets linked from the index. Links are relative to docs/paper/, e.g.
// `](defensive-papers/foo.md)` -> docs/paper/defensive-papers/foo.md. Only .md file links count
// (a bare folder link like `](defensive-papers/)` is not a paper and is ignored).
function linkedPapers(readmeText) {
  const out = new Set();
  const re = /\]\((?:\.\/)?((?:defensive-papers|scientific-papers)\/[^)]+?\.md)\)/g;
  let m;
  while ((m = re.exec(readmeText)) !== null) out.add(`docs/paper/${m[1]}`);
  return out;
}

// Pure analysis so the self-test can prove it without disk. `papers` = repo-relative tracked paper paths;
// `exists(relPath)` resolves a link target.
function analyze({ papers, readmeText, exists }) {
  const linked = linkedPapers(readmeText);
  const unindexed = papers.filter((p) => !linked.has(p)).sort();
  const dangling = [...linked].filter((t) => !exists(t)).sort();

  const defCount = papers.filter((p) => p.startsWith(DEF_DIR)).length;
  const sciCount = papers.filter((p) => p.startsWith(SCI_DIR)).length;
  const countErrors = [];
  const defM = readmeText.match(/\*\*(\d+)\*\*\s+defensive-publication notes/);
  const sciM = readmeText.match(/currently\s+\*\*(\d+)\*\*/);
  if (!defM) countErrors.push('intro line "**N** defensive-publication notes" not found');
  else if (Number(defM[1]) !== defCount) countErrors.push(`intro says **${defM[1]}** defensive papers, tracked ${defCount}`);
  if (!sciM) countErrors.push('intro line "currently **N**" (scientific) not found');
  else if (Number(sciM[1]) !== sciCount) countErrors.push(`intro says **${sciM[1]}** scientific papers, tracked ${sciCount}`);

  return { unindexed, dangling, countErrors, defCount, sciCount };
}

function selfTest() {
  const readme = [
    "- all **2** defensive-publication notes",
    "- scientific-papers/ ... currently **1**, superseded",
    "[`a`](defensive-papers/a.md) [`b`](defensive-papers/b.md) [`s`](scientific-papers/s.md)",
  ].join("\n");
  const papers = ["docs/paper/defensive-papers/a.md", "docs/paper/defensive-papers/b.md", "docs/paper/scientific-papers/s.md"];
  const all = () => true;

  const clean = analyze({ papers, readmeText: readme, exists: all });
  // A tracked paper the index never links.
  const missing = analyze({ papers: [...papers, "docs/paper/defensive-papers/c.md"], readmeText: readme, exists: all });
  // A link whose file does not exist.
  const dead = analyze({ papers, readmeText: readme + "\n[`x`](defensive-papers/gone.md)", exists: (t) => t !== "docs/paper/defensive-papers/gone.md" });
  // Header count drift (says 2 defensive but 3 tracked).
  const drift = analyze({ papers: [...papers, "docs/paper/defensive-papers/c.md"], readmeText: readme + "\n[`c`](defensive-papers/c.md)", exists: all });

  const checks = [
    ["clean index passes", clean.unindexed.length === 0 && clean.dangling.length === 0 && clean.countErrors.length === 0],
    ["unindexed paper fires", missing.unindexed.length === 1 && missing.unindexed[0].endsWith("/c.md")],
    ["dangling index link fires", dead.dangling.length === 1 && dead.dangling[0].endsWith("/gone.md")],
    ["header count drift fires", drift.countErrors.length >= 1],
    ["clean link parse count", linkedPapers(readme).size === 3],
  ];
  let ok = true;
  for (const [name, pass] of checks) { console.log(`  ${pass ? "✅" : "❌"} ${name}`); if (!pass) ok = false; }
  if (!ok) { console.error("  ❌ self-test FAILED — papers-index detectors are neutered"); process.exit(1); }
  console.log("  papers-index self-test: detectors fire on gaps, silent on a complete index ✅");
}

if (process.argv.includes("--self-test")) { selfTest(); process.exit(0); }

const readmeText = readFileSync(join(ROOT, INDEX), "utf8");
const papers = git("ls-files", `${DEF_DIR}*.md`, `${SCI_DIR}*.md`)
  .split("\n").map((s) => s.trim().split("\\").join("/")).filter(Boolean);
const exists = (rel) => existsSync(join(ROOT, rel));
const { unindexed, dangling, countErrors, defCount, sciCount } = analyze({ papers, readmeText, exists });

const problems = [];
for (const p of unindexed) problems.push(`  UNINDEXED  ${p}  — tracked paper not linked from ${INDEX}`);
for (const d of dangling) problems.push(`  DANGLING   ${d}  — ${INDEX} links a paper that does not exist`);
for (const c of countErrors) problems.push(`  COUNT      ${c}`);

if (problems.length) {
  console.error(`\n  ❌ papers-index: ${problems.length} problem(s) in ${INDEX}:\n`);
  console.error(problems.join("\n"));
  console.error(`\n  Fix: link every paper under ${DEF_DIR} and ${SCI_DIR} from ${INDEX}, remove dead links,`);
  console.error(`  and update the intro counts. Add a paper file? Add its index row in the same commit.`);
  process.exit(1);
}
console.log(`  ✅ papers-index: ${INDEX} covers all ${defCount + sciCount} tracked papers (${defCount} defensive, ${sciCount} scientific), no dangling links, counts match.`);
