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
// Informational by default — never blocks the editor/session hook.
// `--strict` is the authorizing final-build mode: a failed/indeterminate
// child or empty discovery surface returns non-zero.
// Skip with:  GALERINA_SKIP_FUSE_REBUILD=1
// Run manually:  node scripts/rebuild-fusable-packages.mjs [--strict] [--rebuild-all] [--allow-signed] [--root <dir>]
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
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findFusablePackages } from "./lib/signed-lmanifest.mjs";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
let customRoot = false;
let ROOT = REPO;
let REBUILD_ALL = false;
let ALLOW_SIGNED = false;
let STRICT = false;
const seen = new Set();
for (let index = 0; index < argv.length; index += 1) {
  const argument = argv[index];
  if (argument === "--root") {
    if (seen.has(argument)
        || index + 1 >= argv.length
        || argv[index + 1].startsWith("--")) {
      console.error("fuse-rebuild: --root requires exactly one path");
      process.exit(2);
    }
    seen.add(argument);
    ROOT = resolve(argv[++index]);
    customRoot = true;
    continue;
  }
  if (argument === "--force") {
    console.error("fuse-rebuild: --force is ambiguous; use --rebuild-all for every unsigned package or --allow-signed for a deliberate ceremony-custody bypass");
    process.exit(2);
  }
  if (["--rebuild-all", "--allow-signed", "--strict"].includes(argument)) {
    if (seen.has(argument)) {
      console.error(`fuse-rebuild: duplicate argument ${argument}`);
      process.exit(2);
    }
    seen.add(argument);
    if (argument === "--rebuild-all") REBUILD_ALL = true;
    if (argument === "--allow-signed") ALLOW_SIGNED = true;
    if (argument === "--strict") STRICT = true;
    continue;
  }
  console.error(`fuse-rebuild: unknown argument ${argument}`);
  process.exit(2);
}
// Cascade guard override (owner-directed 2026-07-01, forwarding approved
// 2026-07-02): a committed ceremony-signed package is NEVER auto-rebuilt —
// replacing its offline-ceremony .lmanifest with a locally minted UNSIGNED one
// makes the fuse loader fail-close (FUNGI-FUSE-UNSIGNED). --allow-signed
// overrides for the deliberate pre-re-sign rebuild — LOUDLY, naming each bypass.
if (process.env.GALERINA_SKIP_FUSE_REBUILD === "1") {
  console.log(
    "⏭️  fuse-rebuild skipped (GALERINA_SKIP_FUSE_REBUILD=1)"
    + (STRICT ? " — strict mode refuses skipped authority" : ""),
  );
  process.exit(STRICT ? 1 : 0);
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
const baseDirs = customRoot
  ? [ROOT]
  : [join(ROOT, "packages-ts"), join(ROOT, "examples")];
const packages = findFusablePackages(baseDirs, { gitRoot: ROOT });

let rebuilt = 0, fresh = 0, failed = 0, skipped = 0, lockedSigned = 0;
const details = [];

for (const pkg of packages) {
  const { dir, name } = pkg;

  // Committed ceremony-signed package → the committed dist artifacts ARE the
  // signed build. Never regenerate locally (would be unsigned); the offline
  // re-sign ceremony owns it. Same predicate the CG-7 drift audit gates on.
  if (!ALLOW_SIGNED && pkg.committedSigned) {
    lockedSigned++;
    details.push(`🔒 ${name}: committed ceremony-SIGNED .lmanifest — never auto-rebuilt (offline ceremony owns it; --allow-signed to override)`);
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

  if (!REBUILD_ALL && wasmMtime > 0 && wasmMtime >= srcMtime) { fresh++; continue; } // up to date — skip

  // The CG-7 bypass is deliberate (pre-re-sign rebuild) — never silent. Printed
  // only when the signed rebuild actually proceeds.
  if (ALLOW_SIGNED && pkg.committedSigned) {
    details.push(`⚠️  ${name}: ALLOWED rebuild of a committed ceremony-SIGNED package — CG-7 bypass (pre-re-sign only; the fuse loader fail-closes on the unsigned result until re-signed)`);
  }

  // Forward --force to the child build: when this rebuild is deliberately allowed (ALLOW_SIGNED bypasses the
  // signed-skip above), the child `build --package` must also accept the CG-7 direct-invocation guard's
  // override, or a forced rebuild of a signed package would be refused downstream.
  const buildArgs = [join(REPO, "galerina.mjs"), "build", "--package", dir];
  if (ALLOW_SIGNED) buildArgs.push("--force");
  const r = spawnSync(process.execPath, buildArgs,
    { cwd: REPO, encoding: "utf8", shell: false, windowsHide: true, timeout: 60000 });
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
if (STRICT && packages.length === 0) {
  console.error(
    "fuse-rebuild: strict mode refuses an empty package discovery surface",
  );
  process.exit(1);
}
process.exit(STRICT && failed > 0 ? 1 : 0);
