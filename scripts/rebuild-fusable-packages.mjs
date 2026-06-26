#!/usr/bin/env node
// =============================================================================
// rebuild-fusable-packages.mjs — keep fused .wasm artifacts fresh in dev
// =============================================================================
// For every FUSABLE package (one that has a `package.spore.json` descriptor),
// rebuild its governed `.wasm` IF its `/src` is newer than `dist/<name>.wasm`
// (or the .wasm doesn't exist yet). Rebuild = `node galerina.mjs build --package`.
//
// Wired as the FIRST Stop hook in .claude/settings.json so it runs at the end
// of a turn ("≈ end of chapter"), BEFORE the phase-close tests — so anything
// that fuses a package consumes the current build.
//
// Informational — never blocks the session (always exits 0).
// Skip with:  GALERINA_SKIP_FUSE_REBUILD=1
// Run manually:  node scripts/rebuild-fusable-packages.mjs
// =============================================================================

import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const isWin = process.platform === "win32";

if (process.env.GALERINA_SKIP_FUSE_REBUILD === "1") {
  console.log("⏭️  fuse-rebuild skipped (GALERINA_SKIP_FUSE_REBUILD=1)");
  process.exit(0);
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "build", ".graph"]);

/** Find every directory containing a package.spore.json under `base`. */
function findDescriptors(base, depth = 0, acc = []) {
  if (depth > 6 || !existsSync(base)) return acc;
  let entries;
  try { entries = readdirSync(base, { withFileTypes: true }); } catch { return acc; }
  for (const e of entries) {
    if (e.isFile() && e.name === "package.spore.json") acc.push(base);
    else if (e.isDirectory() && !SKIP_DIRS.has(e.name)) findDescriptors(join(base, e.name), depth + 1, acc);
  }
  return acc;
}

/** Newest mtime (ms) of any .spore under `dir` (recursively, skipping build dirs). */
function newestLlnMtime(dir, depth = 0) {
  let newest = 0;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return newest; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isFile() && p.endsWith(".spore")) {
      const m = statSync(p).mtimeMs;
      if (m > newest) newest = m;
    } else if (e.isDirectory() && depth < 6) {
      const m = newestLlnMtime(p, depth + 1);
      if (m > newest) newest = m;
    }
  }
  return newest;
}

const pkgDirs = [
  ...findDescriptors(join(ROOT, "packages-galerina")),
  ...findDescriptors(join(ROOT, "examples")),
];

let rebuilt = 0, fresh = 0, failed = 0;
const details = [];

for (const dir of pkgDirs) {
  let desc;
  try { desc = JSON.parse(readFileSync(join(dir, "package.spore.json"), "utf8")); } catch { continue; }
  const name = desc.name;
  if (!name) continue;

  const srcRoot = existsSync(join(dir, "src")) ? join(dir, "src") : dir;
  const wasm = join(dir, "dist", `${name}.wasm`);
  const srcMtime = newestLlnMtime(srcRoot);
  const wasmMtime = existsSync(wasm) ? statSync(wasm).mtimeMs : 0;

  if (wasmMtime > 0 && wasmMtime >= srcMtime) { fresh++; continue; } // up to date — skip

  const r = spawnSync("node", ["galerina.mjs", "build", "--package", dir],
    { cwd: ROOT, encoding: "utf8", shell: isWin, timeout: 60000 });
  if (r.status === 0) { rebuilt++; details.push(`✅ rebuilt ${name}`); }
  else {
    failed++;
    const msg = (r.stderr || r.stdout || "").trim().split("\n").pop();
    details.push(`❌ ${name}: ${msg}`);
  }
}

const head = `🔁 fuse-rebuild: ${rebuilt} rebuilt · ${fresh} fresh · ${failed} failed` +
  (pkgDirs.length === 0 ? " (no fusable packages)" : "");
console.log(details.length ? `${head}\n   ${details.join("\n   ")}` : head);
process.exit(0); // informational — never block
