#!/usr/bin/env node
// =============================================================================
// rebuild-fusable-packages.mjs — keep fused .wasm artifacts fresh in dev
// =============================================================================
// For every FUSABLE package (one that has a `package.fungi.json` descriptor),
// rebuild its governed `.wasm` IF its `/src` is newer than `dist/<name>.wasm`
// (or the .wasm doesn't exist yet). Rebuild = `node galerina.mjs build --package`.
//
// Wired as the FIRST Stop hook in .claude/settings.json so it runs at the end
// of a turn ("≈ end of chapter"), BEFORE the phase-close tests — so anything
// that fuses a package consumes the current build.
//
// Informational — never blocks the session (always exits 0).
// Skip with:  GALERINA_SKIP_FUSE_REBUILD=1
// Run manually:  node scripts/rebuild-fusable-packages.mjs [--force] [--root <dir>]
//   --root  operate on a different tree (fixture testing); default = repo root.
//
// Signed detection (#21 unification, 2026-07-10): discovery + protection come
// from the SHARED lib (findFusablePackages + isCommittedSignedManifest) — the
// same predicate audit-signed-fixture-drift.mjs gates on, so the two tools can
// no longer disagree about what is protected. Protection = the manifest is
// git-tracked AND real-signed in HEAD (the committed ceremony artifact). A
// committed-PLACEHOLDER manifest (fuse-demo awaiting its ceremony) and an
// untracked dev-signed manifest (api-protocol-rest's test-regenerated dist)
// are both regenerable — deciding from DISK shape instead is what made this
// script rebuild a package the drift audit then flagged (the 2026-07-10 flap).
// =============================================================================

import { spawnSync } from "node:child_process";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { findFusablePackages } from "./lib/signed-lmanifest.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const rootIdx = argv.indexOf("--root");
const ROOT = rootIdx >= 0 && argv[rootIdx + 1] ? argv[rootIdx + 1] : REPO;
const isWin = process.platform === "win32";
// Cascade guard override (owner-directed 2026-07-01, forwarding approved
// 2026-07-02): a committed ceremony-signed package is NEVER auto-rebuilt —
// replacing its offline-ceremony .lmanifest with a locally minted UNSIGNED one
// makes the fuse loader fail-close (FUNGI-FUSE-UNSIGNED). --force overrides
// for the deliberate pre-re-sign rebuild — LOUDLY, naming each bypass.
const FORCE = argv.includes("--force");

if (process.env.GALERINA_SKIP_FUSE_REBUILD === "1") {
  console.log("⏭️  fuse-rebuild skipped (GALERINA_SKIP_FUSE_REBUILD=1)");
  process.exit(0);
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "build", ".graph"]);

/** Newest mtime (ms) of any .fungi under `dir` (recursively, skipping build dirs). */
function newestFungi(dir, depth = 0) {
  let newest = 0;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return newest; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isFile() && p.endsWith(".fungi")) {
      const m = statSync(p).mtimeMs;
      if (m > newest) newest = m;
    } else if (e.isDirectory() && depth < 6) {
      const m = newestFungi(p, depth + 1);
      if (m > newest) newest = m;
    }
  }
  return newest;
}

// --root fixtures are scanned directly; the real repo scans its two package roots.
const baseDirs = rootIdx >= 0
  ? [ROOT]
  : [join(ROOT, "packages-galerina"), join(ROOT, "examples")];
const packages = findFusablePackages(baseDirs, { gitRoot: ROOT });

let rebuilt = 0, fresh = 0, failed = 0, skipped = 0, lockedSigned = 0;
const details = [];

for (const pkg of packages) {
  const { dir, name } = pkg;

  // Committed ceremony-signed package → the committed dist artifacts ARE the
  // signed build. Never regenerate locally (would be unsigned); the offline
  // re-sign ceremony owns it. Same predicate the CG-7 drift audit gates on.
  if (!FORCE && pkg.committedSigned) {
    lockedSigned++;
    details.push(`🔒 ${name}: committed ceremony-SIGNED .lmanifest — never auto-rebuilt (offline ceremony owns it; --force to override)`);
    continue;
  }

  const srcRoot = existsSync(join(dir, "src")) ? join(dir, "src") : dir;
  const wasm = join(dir, "dist", `${name}.wasm`);
  const srcMtime = newestFungi(srcRoot);

  // No .fungi source to fuse — e.g. an ext-bridge with a `.ts` entry (galerina-ext-bridge-quantum) that carries a
  // package.fungi.json descriptor but is NOT a fusable .fungi module. `galerina build --package` would try to parse
  // a non-.fungi entry and fail with FUNGI-PARSE-001. Not a build failure — there is simply nothing to fuse. Skip.
  if (srcMtime === 0) { skipped++; continue; }

  const wasmMtime = existsSync(wasm) ? statSync(wasm).mtimeMs : 0;

  if (wasmMtime > 0 && wasmMtime >= srcMtime) { fresh++; continue; } // up to date — skip

  // The CG-7 bypass is deliberate (pre-re-sign rebuild) — never silent. Printed
  // only when the forced rebuild actually proceeds (--force does NOT bypass the
  // freshness skip above; that is unchanged owner-approved behavior).
  if (FORCE && pkg.committedSigned) {
    details.push(`⚠️  ${name}: FORCED rebuild of a committed ceremony-SIGNED package — CG-7 bypass (pre-re-sign only; the fuse loader fail-closes on the unsigned result until re-signed)`);
  }

  // Forward --force to the child build: when this rebuild is deliberately forced (FORCE bypasses the
  // signed-skip above), the child `build --package` must also accept the CG-7 direct-invocation guard's
  // override, or a forced rebuild of a signed package would be refused downstream.
  const buildArgs = [join(REPO, "galerina.mjs"), "build", "--package", dir];
  if (FORCE) buildArgs.push("--force");
  const r = spawnSync("node", buildArgs,
    { cwd: REPO, encoding: "utf8", shell: isWin, timeout: 60000 });
  if (r.status === 0) { rebuilt++; details.push(`✅ rebuilt ${name}`); }
  else {
    failed++;
    const msg = (r.stderr || r.stdout || "").trim().split("\n").pop();
    details.push(`❌ ${name}: ${msg}`);
  }
}

const head = `🔁 fuse-rebuild: ${rebuilt} rebuilt · ${fresh} fresh · ${skipped} skipped · ${lockedSigned} signed-locked · ${failed} failed` +
  (packages.length === 0 ? " (no fusable packages)" : "");
console.log(details.length ? `${head}\n   ${details.join("\n   ")}` : head);
process.exit(0); // informational — never block
