#!/usr/bin/env node
// symbol-usage-search.mjs - READ-ONLY usage search across EVERY file type in a Galerina checkout, grouped by
// package -> file -> kind of use. Built 2026-10-02 (Grok Bot, for Phillip Booth) for the E5 Float32Array /
// Float16Array / Math.fround audit, when an editor search with file-type exclusions proved incomplete.
// Sibling to code-index.mjs and kb-index.mjs, but it never writes into the repo.
//
//   node scripts/symbol-usage-search.mjs [--root <dir>] [--preset float-width | --pattern <regex>]...
//        [--json] [--out <file>] [--check <snapshot.json>] [--vscode-export <file.code-search.md>]
//
//   default                 human summary on stdout
//   --json                  the full deterministic JSON report on stdout
//   --out <file>            also write the JSON report to <file> (an explicit path; nothing is written by default)
//   --check <snapshot>      exit 1 if the current report differs from a saved --json snapshot (drift gate)
//   --vscode-export <file>  compare against a VS Code "search editor" export: paths it lists that the scan
//                           did not find, and paths the scan found that the export missed (e.g. excluded types)
//
// File set: `git ls-files --cached --others --exclude-standard` (tracked and untracked-not-ignored, all
// extensions), falling back to a directory walk when <root> is not a git checkout. Always excluded:
// node_modules, nested .worktrees, and generated build output (build/, dist/, target/, coverage/, .next/).
// Binary files (a NUL byte in the first 8 KiB) and files over 8 MiB are skipped and counted, never silently.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const PRESETS = Object.freeze({
  "float-width": ["Float32Array", "Float16Array", "Math\\.fround", "Math\\.f16round"],
});

const EXCLUDED_DIR = /(^|\/)(node_modules|\.worktrees|build|dist|target|coverage|\.next|\.git)(\/|$)/;
const MAX_BYTES = 8 * 1024 * 1024;

export function isExcludedPath(relPath) {
  return EXCLUDED_DIR.test(relPath.replace(/\\/g, "/"));
}

/** Package bucket: packages-ts/<pkg>/... (or the legacy packages-galerina/<pkg>/...) -> <pkg>; else the top dir. */
export function packageOf(relPath) {
  const p = relPath.replace(/\\/g, "/");
  const m = p.match(/^packages-(?:ts|galerina)\/([^/]+)\//);
  if (m) return m[1];
  const slash = p.indexOf("/");
  return slash === -1 ? "(root)" : p.slice(0, slash);
}

/** Kind of use for one matching line. Order matters: the most specific kind wins. */
export function classifyUse(relPath, lineText) {
  const p = relPath.replace(/\\/g, "/");
  const t = lineText.trim();
  if (/\.(md|markdown|txt|rst)$/i.test(p)) return "documentation";
  if (/\.(json|csv|tsv|ya?ml)$/i.test(p)) return "data";
  if (/^(\/\/|\/\*|\*|#|;;|<!--)/.test(t)) return "comment";
  if (/\bnew\s+Float(?:32|16)Array\s*\(/.test(t)) return "typed-array-construct";
  if (/\bFloat(?:32|16)Array\.(?:from|of)\s*\(/.test(t)) return "typed-array-construct";
  if (/\bMath\.(?:fround|f16round)\s*\(/.test(t)) return "rounding-call";
  if (/["'`]Float(?:32|16)Array["'`]/.test(t)) return "string-literal";
  if (/\binstanceof\s+Float(?:32|16)Array\b|:\s*Float(?:32|16)Array\b|<Float(?:32|16)Array>/.test(t)) return "type-reference";
  return "other";
}

export function areaOf(relPath) {
  const p = relPath.replace(/\\/g, "/");
  if (/(^|\/)tests?\/|\.test\.|\.spec\./.test(p)) return "test";
  if (/(^|\/)(docs?|kb)\//.test(p) || /\.(md|markdown)$/i.test(p)) return "docs";
  if (/(^|\/)(benchmarks?|results)\//.test(p)) return "benchmark";
  if (/(^|\/)examples?\//.test(p)) return "example";
  if (/(^|\/)scripts\//.test(p)) return "script";
  return "source";
}

function listFiles(root) {
  try {
    const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      cwd: root, encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "ignore"],
    });
    return { source: "git", files: [...new Set(out.split("\0").filter(Boolean))].sort() };
  } catch {
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir).sort()) {
        const abs = join(dir, name);
        const rel = relative(root, abs).split(sep).join("/");
        if (isExcludedPath(rel)) continue;
        const st = statSync(abs);
        if (st.isDirectory()) walk(abs);
        else if (st.isFile()) files.push(rel);
      }
    };
    walk(root);
    return { source: "walk", files };
  }
}

/** Scan <root> for <patterns> (regex sources). Pure over the file contents; returns a deterministic report. */
export function scan(root, patterns) {
  if (!Array.isArray(patterns) || patterns.length === 0) throw new Error("symbol-usage-search: no patterns");
  const re = new RegExp(patterns.map((s) => `(?:${s})`).join("|"));
  const { source, files } = listFiles(root);
  const skipped = { excluded: 0, binary: 0, tooLarge: 0, unreadable: 0 };
  const byPackage = new Map();
  const byKind = {};
  const byArea = {};
  const byExtension = {};
  let matches = 0;
  let scanned = 0;
  for (const rel of files) {
    if (isExcludedPath(rel)) { skipped.excluded += 1; continue; }
    const abs = join(root, rel);
    let buf;
    try {
      const st = statSync(abs);
      if (!st.isFile()) continue;
      if (st.size > MAX_BYTES) { skipped.tooLarge += 1; continue; }
      buf = readFileSync(abs);
    } catch { skipped.unreadable += 1; continue; }
    if (buf.subarray(0, 8192).includes(0)) { skipped.binary += 1; continue; }
    scanned += 1;
    const text = buf.toString("utf8");
    if (!re.test(text)) continue;
    const lines = text.split(/\r?\n/);
    const hits = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (!re.test(lines[i])) continue;
      const kind = classifyUse(rel, lines[i]);
      const line = lines[i].trim();
      hits.push({ line: i + 1, kind, text: line.length > 200 ? `${line.slice(0, 200)}...` : line });
      byKind[kind] = (byKind[kind] ?? 0) + 1;
    }
    if (hits.length === 0) continue;
    matches += hits.length;
    const pkg = packageOf(rel);
    const area = areaOf(rel);
    byArea[area] = (byArea[area] ?? 0) + hits.length;
    const ext = (rel.match(/\.([A-Za-z0-9]+)$/)?.[1] ?? "(none)").toLowerCase();
    byExtension[ext] = (byExtension[ext] ?? 0) + hits.length;
    if (!byPackage.has(pkg)) byPackage.set(pkg, []);
    byPackage.get(pkg).push({ path: rel, area, matches: hits });
  }
  const packages = [...byPackage.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, fl]) => ({
    package: name,
    matches: fl.reduce((n, f) => n + f.matches.length, 0),
    files: fl.sort((a, b) => a.path.localeCompare(b.path)),
  }));
  const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  return {
    schema: "galerina.symbol-usage-search.v1",
    patterns: [...patterns],
    fileSource: source,
    totals: { filesListed: files.length, filesScanned: scanned, filesMatched: packages.reduce((n, p) => n + p.files.length, 0), matches },
    skipped,
    byKind: sortObj(byKind),
    byArea: sortObj(byArea),
    byExtension: sortObj(byExtension),
    packages,
  };
}

/** Paths listed in a VS Code search-editor export, with any `.worktrees/<name>/` prefix removed. */
export function parseVsCodeExport(text) {
  const out = new Set();
  for (const raw of text.split(/\r?\n/)) {
    if (!/:\s*$/.test(raw) || /^\s/.test(raw) || raw.startsWith("#")) continue;
    const unix = raw.replace(/\\/g, "/");
    if (!/Galerina\/(.+?):\s*$/.test(unix)) continue;
    const p = unix.replace(/^.*?Galerina\/(.+?):\s*$/, "$1").replace(/^\.worktrees\/[^/]+\/(?:Galerina\/)?/, "");
    out.add(p);
  }
  return [...out].sort();
}

export function compareWithExport(report, exportPaths) {
  const norm = (p) => p.replace(/^packages-galerina\//, "packages-ts/");
  const found = new Set(report.packages.flatMap((p) => p.files.map((f) => norm(f.path))));
  const exp = new Set(exportPaths.filter((p) => !isExcludedPath(p)).map(norm));
  return {
    exportPaths: exp.size,
    excludedGeneratedInExport: exportPaths.length - exportPaths.filter((p) => !isExcludedPath(p)).length,
    onlyInExport: [...exp].filter((p) => !found.has(p)).sort(),
    onlyInScan: [...found].filter((p) => !exp.has(p)).sort(),
  };
}

function parseArgs(argv) {
  // "" = option not given (explicit sentinel; resolve() never returns "").
  const o = { root: process.cwd(), patterns: [], json: false, out: "", check: "", vscodeExport: "" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const val = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith("--")) throw new Error(`symbol-usage-search: ${a} requires a value`);
      return argv[++i];
    };
    if (a === "--root") o.root = resolve(val());
    else if (a === "--pattern") o.patterns.push(val());
    else if (a === "--preset") {
      const name = val();
      if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) throw new Error(`symbol-usage-search: unknown preset ${name} (known: ${Object.keys(PRESETS).join(", ")})`);
      o.patterns.push(...PRESETS[name]);
    } else if (a === "--json") o.json = true;
    else if (a === "--out") o.out = resolve(val());
    else if (a === "--check") o.check = resolve(val());
    else if (a === "--vscode-export") o.vscodeExport = resolve(val());
    else throw new Error(`symbol-usage-search: unknown argument ${a}`);
  }
  if (o.patterns.length === 0) o.patterns.push(...PRESETS["float-width"]);
  return o;
}

function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (e) { process.stderr.write(`${e.message}\n`); process.exit(2); }
  const report = scan(o.root, o.patterns);
  if (o.vscodeExport !== "") {
    if (!existsSync(o.vscodeExport)) { process.stderr.write(`symbol-usage-search: no such export ${o.vscodeExport}\n`); process.exit(2); }
    report.vscodeExportComparison = compareWithExport(report, parseVsCodeExport(readFileSync(o.vscodeExport, "utf8")));
  }
  const json = `${JSON.stringify(report, null, 2)}\n`;
  if (o.out !== "") writeFileSync(o.out, json);
  if (o.check !== "") {
    const prev = existsSync(o.check) ? readFileSync(o.check, "utf8").replace(/\r\n/g, "\n") : "";
    if (prev !== json) { process.stderr.write(`symbol-usage-search: --check FAILED, report differs from ${o.check}\n`); process.exit(1); }
    process.stdout.write(`symbol-usage-search: --check OK (${report.totals.matches} matches)\n`);
    return;
  }
  if (o.json) { process.stdout.write(json); return; }
  const t = report.totals;
  const lines = [
    `symbol-usage-search: ${t.matches} matches in ${t.filesMatched} files (${t.filesScanned} scanned of ${t.filesListed} listed via ${report.fileSource})`,
    `  skipped: ${JSON.stringify(report.skipped)}`,
    `  by kind: ${JSON.stringify(report.byKind)}`,
    `  by area: ${JSON.stringify(report.byArea)}`,
    `  by extension: ${JSON.stringify(report.byExtension)}`,
  ];
  for (const p of report.packages) {
    lines.push(`  [${p.package}] ${p.matches}`);
    for (const f of p.files) lines.push(`    ${f.path} (${f.area}): ${f.matches.map((m) => `${m.line}:${m.kind}`).join(", ")}`);
  }
  if ("vscodeExportComparison" in report) {
    const c = report.vscodeExportComparison;
    lines.push(`  vs export: ${c.exportPaths} export paths; only in export ${c.onlyInExport.length}; only in scan ${c.onlyInScan.length}`);
    for (const p of c.onlyInExport) lines.push(`    only-in-export ${p}`);
    for (const p of c.onlyInScan) lines.push(`    only-in-scan ${p}`);
  }
  process.stdout.write(`${lines.join("\n")}\n`);
}

if (typeof process.argv[1] === "string" && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
