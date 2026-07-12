#!/usr/bin/env node
// =============================================================================
// repoint-kb-refs.mjs — deterministic codemod: repoint dangling in-repo KB refs
//                       at the old `docs/Knowledge-Bases/` path to the sibling
//                       repo `ZTF-Knowledge-Bases/` (checked out one level ABOVE
//                       the Galerina repo root).
//
// WHY THIS EXISTS
//   The knowledge base migrated out of this (public) repo into the sibling repo
//   ../ZTF-Knowledge-Bases to protect pre-release IP. ~400 references to the old
//   in-repo path are now dangling. This script rewrites them, matching the
//   convention the ~correct refs already use (see `.github/workflows/conventions.yml`
//   — GALERINA_KB_DIR + a checked-out `ZTF-Knowledge-Bases` path — and
//   `build/kb-index/KB-INDEX.md`, which spells a repo-root-relative ref as
//   `../ZTF-Knowledge-Bases/…`).
//
// THREE OLD REF FORMS HANDLED (all point at the same old location, so all share
// the same trailing path after `Knowledge-Bases/`):
//   (A) `docs/Knowledge-Bases/…`      root-relative, incl. `../../docs/…` variants
//   (B) `../Knowledge-Bases/…`        one-or-more `../` relative links (docs/* subdirs)
//   (C) `Knowledge-Bases/…`           bare, relative to the file's own dir
//                                     (the docs/ TOC files, e.g. docs/README.md)
//
// TARGET SPELLING
//   The sibling repo sits ONE LEVEL ABOVE the Galerina root, so a repo-root ref is
//   `../ZTF-Knowledge-Bases/…`. Two rewrite modes:
//     • Markdown (*.md): DEPTH-ADJUST the relative prefix so the link actually
//       resolves on disk — prefix = `../` repeated (dirDepth + 1) times:
//         repo root (depth 0) → `../ZTF-Knowledge-Bases/…`
//         docs/ file (depth 1) → `../../ZTF-Knowledge-Bases/…`
//         docs/paper/ (depth 2) → `../../../ZTF-Knowledge-Bases/…`   … etc.
//     • Everything else (code comments in *.ts/*.mjs/*.fungi, JSON string values,
//       SVG <text>, and the named tooling defaults): the CANONICAL repo-root-
//       relative pointer `../ZTF-Knowledge-Bases/…`. These refs are textual (a
//       comment / config value), not filesystem links resolved from the file's own
//       dir, and this matches the existing convention (e.g. the `../ZTF-Knowledge-
//       Bases/…` comment refs already in the tree). For the tooling defaults this
//       is exactly the "prefer the sibling path" instruction; runtime KB resolution
//       in kb-graph/cli.ts is ALREADY correct (env GALERINA_KB_DIR → in-repo
//       fallback → sibling) and is left untouched — only its stale banner is fixed.
//
// HARD EXCLUSIONS (never edited — see EXCLUDE_* below). Rationale:
//   • SECURITY.md, governance/revocations.json, version.json — governance/security
//     surfaces; out of scope for a mechanical doc-link sweep.
//   • node_modules/, build/ — vendored / generated artifacts (build/ is regenerated
//     by its own tooling; editing it by hand would be overwritten and pollutes the
//     generated index).
//   • Migration-NARRATIVE files that correctly DOCUMENT the move (rewriting them
//     would falsify history / break their own drift assertions): CHANGELOG.md,
//     docs/TODO.md, scripts/audit-provenance.mjs, scripts/audit-doc-drift.mjs,
//     scripts/status.mjs, scripts/rd-absorb.mjs, scripts/tests/dev-tools-scripts.test.mjs,
//     scripts/kb-index.mjs, scripts/audit-coverage.mjs, and
//     docs/paper/defensive-papers/*fail-open-taxonomy*.md.
//   • packages-galerina/galerina-core-compiler/docs/Knowledge-Bases/ — an in-repo
//     VESTIGE dir that still exists; refs that legitimately point INTO it resolve
//     in-repo and must stay. (The matcher also structurally refuses a nested
//     `…/docs/Knowledge-Bases/`, so this is belt-and-suspenders.)
//   • This script itself.
//
// PATH-LEAK DISCIPLINE (house rule: no absolute local paths in a public repo)
//   Every path this script PRINTS is repo-relative (POSIX `/`). It never prints the
//   absolute repo root or any user-home path. File rewrites likewise only ever
//   emit repo-relative `../ZTF-Knowledge-Bases/…` strings — never an absolute path.
//
// USAGE
//   node scripts/repoint-kb-refs.mjs            # DRY-RUN (default) — writes nothing
//   node scripts/repoint-kb-refs.mjs --dry-run  # explicit dry-run
//   node scripts/repoint-kb-refs.mjs --apply     # rewrite files in place
// =============================================================================

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

// scripts/ -> repo root. Derived from THIS file's location (no absolute path is printed).
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..");

const APPLY = process.argv.includes("--apply");
const DRY_RUN = !APPLY; // default is dry-run; --apply is the only way to write.

// This script's own repo-relative path — never rewrite ourselves.
const SELF_REL = "scripts/repoint-kb-refs.mjs";

// Exact repo-relative file paths to skip.
const EXCLUDE_FILES = new Set([
  "SECURITY.md",
  "governance/revocations.json",
  "version.json",
  "CHANGELOG.md",
  "docs/TODO.md",
  "scripts/audit-provenance.mjs",
  "scripts/audit-doc-drift.mjs",
  "scripts/status.mjs",
  "scripts/rd-absorb.mjs",
  "scripts/tests/dev-tools-scripts.test.mjs",
  "scripts/kb-index.mjs",
  "scripts/audit-coverage.mjs",
  SELF_REL,
]);

// Repo-relative path PREFIXES to skip (directories).
const EXCLUDE_PREFIXES = [
  "node_modules/",
  "build/",
  // In-repo vestige KB dir — files inside it, and refs pointing into it, stay put.
  "packages-galerina/galerina-core-compiler/docs/Knowledge-Bases/",
];

// Named tooling defaults — rewritten with the canonical sibling path (like all
// non-markdown), listed explicitly so the report can call them out for review.
const TOOLING_FILES = new Set([
  "galerina.mjs",
  "galerina.check.json",
  "packages-galerina/galerina-devtools-kb-graph/src/scanner.ts",
  "packages-galerina/galerina-devtools-kb-graph/src/cli.ts",
]);

// Binary-ish extensions we never scan (defensive; git-tracked corpus is mostly text).
const BINARY_EXT = /\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|gz|wasm|woff2?|ttf|otf|spore)$/i;

// -----------------------------------------------------------------------------
// The matcher.
//
// Captures an optional dangling PREFIX ( (../)*  optionally + `docs/` ) immediately
// followed by `Knowledge-Bases/` and a TAIL (the path/filename after it).
//
// The leading negative lookbehind `(?<![A-Za-z0-9_/-])` is what makes this SOUND:
//   • It refuses a preceding `-`, so `ZTF-Knowledge-Bases/…` (the already-correct
//     ref) never matches — its `Knowledge-Bases/` is preceded by `-`.
//   • It refuses a preceding `/`, so a nested `…/docs/Knowledge-Bases/…` (the
//     vestige path, or any other dir literally named docs deeper in the tree) never
//     matches — a legitimate root-relative `docs/…` ref is always preceded by a
//     delimiter such as `(`, quote, backtick or whitespace, never by `/`.
//   • It refuses a preceding word char, so tokens like `xKnowledge-Bases` can't match.
//
// TAIL char class stops at the first delimiter (space, `)`, quote, backtick, `]`,
// `:`, `#`, `§`, EOL, …) so line-number suffixes (`…SOT.md:15`) and anchors
// (`…#sec`) are preserved unchanged after the rewritten span.
// -----------------------------------------------------------------------------
const REF_RE =
  /(?<![A-Za-z0-9_/-])((?:\.\.\/)*(?:docs\/)?)Knowledge-Bases\/([A-Za-z0-9._/-]*)/g;

/** True if the repo-relative path is excluded from editing. */
function isExcluded(rel) {
  if (EXCLUDE_FILES.has(rel)) return true;
  if (EXCLUDE_PREFIXES.some((p) => rel.startsWith(p))) return true;
  // Glob: docs/paper/defensive-papers/*fail-open-taxonomy*.md
  if (/^docs\/paper\/defensive-papers\/[^/]*fail-open-taxonomy[^/]*\.md$/.test(rel))
    return true;
  return false;
}

/** Markdown files get depth-adjusted, resolvable relative links. */
function isMarkdown(rel) {
  return rel.toLowerCase().endsWith(".md");
}

/**
 * The new relative prefix for a file:
 *   • markdown  -> `../` * (dirDepth + 1)  (sibling is one level above repo root)
 *   • otherwise -> `../`                    (canonical repo-root-relative pointer)
 */
function newPrefixFor(rel) {
  if (!isMarkdown(rel)) return "../";
  const dirDepth = rel.split("/").length - 1; // segments before the filename
  return "../".repeat(dirDepth + 1);
}

/** Classify an old ref by its captured prefix, for reporting (A / B / C). */
function classify(prefix) {
  if (prefix.includes("docs/")) return "A"; // docs/… (incl. ../../docs/…)
  if (prefix.length > 0) return "B"; // ../ (one or more), no docs/
  return "C"; // bare Knowledge-Bases/…
}

/** Enumerate git-tracked files (POSIX-relative), so node_modules/untracked are skipped. */
function listTrackedFiles() {
  const out = execFileSync("git", ["-C", REPO_ROOT, "ls-files", "-z"], {
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
  });
  return out.split("\0").filter(Boolean);
}

function main() {
  let files;
  try {
    files = listTrackedFiles();
  } catch (err) {
    console.error(
      "FAILED to list git-tracked files (is this a git repo?). Aborting (fail-closed).",
    );
    console.error(String(err && err.message ? err.message : err));
    process.exit(1);
  }

  const perFile = []; // {rel, count, cat, depthPrefix, oldSample, newSample}
  const catRefs = { A: 0, B: 0, C: 0 };
  const catFiles = { A: new Set(), B: new Set(), C: new Set() };
  let mdRefs = 0;
  let nonMdRefs = 0;
  let totalRefs = 0;
  let excludedFilesWithRefs = 0;
  let excludedRefs = 0;
  const toolingHits = [];

  for (const rel of files) {
    if (BINARY_EXT.test(rel)) continue;

    let content;
    try {
      content = readFileSync(join(REPO_ROOT, rel), "utf8");
    } catch {
      continue; // unreadable / not a regular file
    }
    if (!content.includes("Knowledge-Bases/")) continue;

    // Does this file contain at least one MATCHABLE dangling ref?
    REF_RE.lastIndex = 0;
    const matches = [...content.matchAll(REF_RE)];
    if (matches.length === 0) continue;

    if (isExcluded(rel)) {
      excludedFilesWithRefs += 1;
      excludedRefs += matches.length;
      continue; // never edit
    }

    const newPrefix = newPrefixFor(rel);
    const md = isMarkdown(rel);
    let firstOld = null;
    let firstNew = null;
    for (const m of matches) {
      const [full, prefix, tail] = m;
      const cat = classify(prefix);
      catRefs[cat] += 1;
      catFiles[cat].add(rel);
      if (md) mdRefs += 1;
      else nonMdRefs += 1;
      if (firstOld === null) {
        firstOld = full;
        firstNew = newPrefix + "ZTF-Knowledge-Bases/" + tail;
      }
    }
    totalRefs += matches.length;

    const cat = classify(matches[0][1]);
    perFile.push({
      rel,
      count: matches.length,
      cat,
      md,
      depthPrefix: newPrefix,
      oldSample: firstOld,
      newSample: firstNew,
    });

    if (TOOLING_FILES.has(rel)) {
      toolingHits.push({ rel, count: matches.length, oldSample: firstOld, newSample: firstNew });
    }

    if (APPLY) {
      const rewritten = content.replace(
        REF_RE,
        (_full, _prefix, tail) => newPrefix + "ZTF-Knowledge-Bases/" + tail,
      );
      if (rewritten !== content) writeFileSync(join(REPO_ROOT, rel), rewritten);
    }
  }

  // Deterministic ordering: most refs first, then path.
  perFile.sort((a, b) => b.count - a.count || a.rel.localeCompare(b.rel));

  // --------------------------------------------------------------------------
  // Report (repo-relative paths only — never an absolute local path).
  // --------------------------------------------------------------------------
  const mode = APPLY ? "APPLY (writing files in place)" : "DRY-RUN (no files written)";
  console.log(`repoint-kb-refs — ${mode}`);
  console.log(`(all paths below are repo-relative; pass --apply to write)\n`);

  console.log("── Changes by file  (path : refs → first before→after) ──");
  for (const f of perFile) {
    console.log(
      `${f.rel} : ${f.count} [cat ${f.cat}${f.md ? `, md ${f.depthPrefix}` : ", code ../"}]\n` +
        `    "${f.oldSample}"  →  "${f.newSample}"`,
    );
  }

  console.log("\n── Named tooling defaults (called out for review) ──");
  if (toolingHits.length === 0) {
    console.log("  (none matched)");
  } else {
    for (const t of toolingHits) {
      console.log(`  ${t.rel} : ${t.count}   "${t.oldSample}" → "${t.newSample}"`);
    }
  }

  console.log("\n── Category totals ──");
  console.log(
    `  A  docs/Knowledge-Bases/…   : ${catRefs.A} refs in ${catFiles.A.size} files`,
  );
  console.log(
    `  B  ../Knowledge-Bases/…     : ${catRefs.B} refs in ${catFiles.B.size} files`,
  );
  console.log(
    `  C  bare Knowledge-Bases/…   : ${catRefs.C} refs in ${catFiles.C.size} files`,
  );
  console.log(
    `  markdown (depth-adjusted)   : ${mdRefs} refs   |   code/json/svg (canonical ../): ${nonMdRefs} refs`,
  );

  console.log("\n── Excluded (matched a dangling ref but intentionally skipped) ──");
  console.log(
    `  ${excludedFilesWithRefs} files / ${excludedRefs} refs skipped by the exclusion list.`,
  );

  console.log("\n── Grand total ──");
  console.log(
    `  ${totalRefs} refs across ${perFile.length} files would be repointed${
      APPLY ? " (WRITTEN)" : " (dry-run — nothing written)"
    }.`,
  );
}

main();
