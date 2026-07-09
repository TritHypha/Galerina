#!/usr/bin/env node
// rename-package.mjs — mechanical, exact-token rename of a monorepo package across TRACKED files.
// Renames packages-galerina/<oldDir> -> <newDir> (git mv) and rewrites every tracked TEXT file,
// replacing the directory token and the derived @galerina/<...> package-name token. Exact-substring
// replacement — monorepo package/dir names are unique, so there is no word-boundary hazard (e.g.
// `galerina-ext-tmf` is NOT a substring of `galerina-ext-secrets-tmf`). Binary files (NUL sniff) are
// skipped. Prints a per-file summary. Does NOT commit or push — review `git diff`, rebuild, verify, commit.
//
// Usage: node scripts/rename-package.mjs <old-dir-name> <new-dir-name>
//   e.g. node scripts/rename-package.mjs galerina-ext-tmf galerina-ext-spore
import { readFileSync, writeFileSync, existsSync, rmSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [oldDir, newDir] = process.argv.slice(2);
if (!oldDir || !newDir) { console.error("usage: rename-package.mjs <old-dir> <new-dir>"); process.exit(1); }

// dir `galerina-ext-tmf` -> package name `@galerina/ext-tmf` (drop the leading `galerina-`, scope it).
const toPkg = (d) => "@galerina/" + d.replace(/^galerina-/, "");
const pkgOld = toPkg(oldDir), pkgNew = toPkg(newDir);
// Replace the longer token first (defensive — the two are disjoint here, but longest-first is a safe rule).
const pairs = [[pkgOld, pkgNew], [oldDir, newDir]].sort((a, b) => b[0].length - a[0].length);

const IS_WIN = process.platform === "win32";
const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8", shell: IS_WIN });

// 1. git mv the package directory (moves tracked files + records the rename).
const oldPath = join("packages-galerina", oldDir), newPath = join("packages-galerina", newDir);
if (existsSync(join(ROOT, oldPath))) {
  git("mv", oldPath, newPath);
  console.log(`  git mv ${oldPath} -> ${newPath}`);
  // git mv leaves behind only gitignored artifacts (dist/, node_modules/) in the old dir on some
  // platforms; remove the empty/ignored husk so nothing stale lingers at the old path.
  const husk = join(ROOT, oldPath);
  if (existsSync(husk)) { try { rmSync(husk, { recursive: true, force: true }); console.log(`  removed leftover ignored husk ${oldPath}/`); } catch {} }
} else if (existsSync(join(ROOT, newPath))) {
  console.log(`  (dir already at ${newPath} — skipping git mv)`);
} else { console.error(`  ✗ neither ${oldPath} nor ${newPath} exists`); process.exit(1); }

// 2. Rewrite tracked text files.
const files = git("ls-files").split("\n").map((s) => s.trim()).filter(Boolean);
const isBinary = (buf) => buf.subarray(0, 8000).includes(0);
let changed = 0, hits = 0;
for (const rel of files) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) continue;
  const buf = readFileSync(abs);
  if (isBinary(buf)) continue;
  let text = buf.toString("utf8");
  const before = text;
  let n = 0;
  for (const [from, to] of pairs) {
    if (text.includes(from)) { n += text.split(from).length - 1; text = text.split(from).join(to); }
  }
  if (text !== before) { writeFileSync(abs, text); changed++; hits += n; console.log(`    ~ ${rel} (${n})`); }
}
console.log(`\n  rename ${oldDir} -> ${newDir}: ${changed} file(s) rewritten, ${hits} token(s). Package ${pkgOld} -> ${pkgNew}.`);
console.log("  NOT committed/pushed — review `git status` + `git diff`, rebuild, verify, then commit.");
