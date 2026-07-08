#!/usr/bin/env node
// =============================================================================
// relink-workspace.mjs — repair broken intra-workspace `file:` dependency links
// =============================================================================
// WHY THIS EXISTS
//   This monorepo has no root `workspaces` field. Each package declares its
//   internal siblings as `file:../galerina-*` deps, which `npm install`
//   materialises as directory JUNCTIONS under `<pkg>/node_modules/@galerina/*`
//   (Windows) or symlinks (POSIX). A Windows re-install / restore-from-backup
//   does NOT preserve junction reparse points — they come back as EMPTY
//   directories, so Node resolves the bare import to a non-existent
//   `.../<dep>/index.js` and every dependent package fails to load with
//   "Cannot find package '.../index.js'".
//
//   Re-running `npm install` per package repairs this, but on a fresh OS that
//   risks re-compiling native deps (argon2) with no build toolchain, hits the
//   network, and churns lockfiles. When the third-party node_modules survived
//   (the common re-install case), the ONLY thing broken is the `file:` links —
//   so we recreate exactly those, offline, and touch nothing else.
//
// WHAT IT DOES
//   Walks every package.json in the repo (skipping node_modules/.git), and for
//   each `file:` dependency ensures `<pkg>/node_modules/<name>` is a live link
//   (or populated copy) to the resolved target. Broken/empty entries are
//   recreated as junctions (Windows) / symlinks (POSIX). Populated real dirs
//   and already-valid links are left untouched.
//
// USAGE
//   node scripts/relink-workspace.mjs            # dry-run: report only
//   node scripts/relink-workspace.mjs --apply    # actually repair
//   node scripts/relink-workspace.mjs --json     # machine-readable report
// =============================================================================

import { readFileSync, readdirSync, existsSync, lstatSync, statSync,
         mkdirSync, rmdirSync, unlinkSync, symlinkSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const APPLY = process.argv.includes("--apply");
const JSON_OUT = process.argv.includes("--json");
const isWin = process.platform === "win32";
const LINK_TYPE = isWin ? "junction" : "dir";

/** Recursively collect package.json paths, skipping node_modules and .git. */
function findPackageJsons(dir, out = []) {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name === ".git") continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) findPackageJsons(full, out);
    else if (e.name === "package.json") out.push(full);
  }
  return out;
}

/** Is `p` an empty directory (the broken-junction footprint)? */
function isEmptyDir(p) {
  try { return statSync(p).isDirectory() && readdirSync(p).length === 0; }
  catch { return false; }
}

/** Does the link at `p` already resolve to a valid package (has package.json)? */
function isPopulated(p) {
  return existsSync(join(p, "package.json"));
}

const report = { ok: 0, recreated: [], created: [], missingTarget: [], leftCopy: [] };

const pkgJsons = findPackageJsons(join(ROOT, "packages-galerina"))
  .concat(findPackageJsons(join(ROOT, "packages")))
  .concat([join(ROOT, "package.json")].filter(existsSync));

for (const pj of pkgJsons) {
  const pkgDir = dirname(pj);
  let manifest;
  try { manifest = JSON.parse(readFileSync(pj, "utf8")); }
  catch { continue; }
  const deps = {
    ...(manifest.dependencies || {}),
    ...(manifest.devDependencies || {}),
    ...(manifest.optionalDependencies || {}),
  };
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec !== "string" || !spec.startsWith("file:")) continue;
    const targetRel = spec.slice("file:".length);
    const target = resolve(pkgDir, targetRel);
    const link = join(pkgDir, "node_modules", ...name.split("/"));
    const rel = relative(ROOT, link);

    if (!existsSync(target)) { report.missingTarget.push({ link: rel, target }); continue; }

    // Already a valid link/copy?
    if (isPopulated(link)) { report.ok++; continue; }

    // Non-empty but unpopulated dir that's NOT ours to clobber → leave, note.
    if (existsSync(link) && !isEmptyDir(link)) { report.leftCopy.push({ link: rel }); continue; }

    const isNew = !existsSync(link);
    if (APPLY) {
      // Remove the empty leftover (broken junction footprint), then relink.
      if (existsSync(link)) { try { unlinkSync(link); } catch { try { rmdirSync(link); } catch {} } }
      mkdirSync(dirname(link), { recursive: true });
      symlinkSync(target, link, LINK_TYPE);
    }
    (isNew ? report.created : report.recreated).push({ link: rel, target: relative(ROOT, target) });
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const fix = report.recreated.length + report.created.length;
  console.log(`relink-workspace ${APPLY ? "(APPLY)" : "(dry-run)"} — root: ${ROOT}`);
  console.log(`  already-valid links : ${report.ok}`);
  console.log(`  ${APPLY ? "recreated" : "would recreate"} broken : ${report.recreated.length}`);
  console.log(`  ${APPLY ? "created" : "would create"} missing  : ${report.created.length}`);
  if (report.leftCopy.length) console.log(`  left populated copies : ${report.leftCopy.length}`);
  if (report.missingTarget.length) {
    console.log(`  ⚠️  file: targets NOT FOUND : ${report.missingTarget.length}`);
    for (const m of report.missingTarget.slice(0, 20)) console.log(`       ${m.link}  ->  ${m.target}`);
  }
  if (!APPLY && fix > 0) console.log(`\n  run with --apply to repair ${fix} link(s).`);
  if (APPLY) console.log(`\n✅ ${fix} link(s) repaired.`);
}

process.exit(0);
