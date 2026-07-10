// =============================================================================
// signed-lmanifest.mjs — shared predicate: is a fusable package PROTECTED by a
// REAL (offline-ceremony) signature?
// =============================================================================
// The committed dist/<name>.wasm + .lmanifest.json of a signed fusable package
// ARE the signed artifacts; re-signing is an offline ceremony. Any local tool
// that regenerates the manifest produces an UNSIGNED one the fuse loader
// fail-closes on (FUNGI-FUSE-UNSIGNED) — and any tool that dirties the
// package's src (generated //fungi: comments included) triggers exactly that
// regeneration via the mtime-based fuse-rebuild hook. Rule (owner-directed
// 2026-07-01, "both ends + detector"): NEVER locally rebuild or dirty a SIGNED
// fusable package.
//
// Signature shape mirrors fuse-loader.ts verifyManifestSignature: an object
// `governanceSignature` with string keyId + string signature is REAL (Ed25519
// or hybrid Ed25519+ML-DSA-65). A missing/placeholder signature is regenerable.
// Deny-by-default: a manifest that EXISTS but cannot be read/parsed is treated
// as SIGNED (protect what we cannot prove regenerable).
//
// TWO predicates, one rule (#21 unification, 2026-07-10). CG-7 protects the
// COMMITTED ceremony artifact, so protection is decided from GIT, not disk:
//   isCommittedSignedManifest — tracked AND real-signed in HEAD → protected.
// Disk state is what DRIFTS — deciding from disk produced both failure modes
// this class has seen: a locally minted dev-key signature promoted an
// unprotected fixture into a false CG-7 red (my-custom-api-rest flap), and a
// locally CLOBBERED ceremony manifest would demote itself out of protection
// (fail-open). isRealSignedManifest (disk) remains the conservative floor when
// git cannot answer, and the predicate for local-artifact questions.
// =============================================================================

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const isWin = process.platform === "win32";

/** Signature-shape check shared by the disk and committed predicates. */
export function isRealSignature(sig) {
  return (
    sig !== null &&
    typeof sig === "object" &&
    typeof sig.keyId === "string" &&
    typeof sig.signature === "string" &&
    sig.signature.length > 0 &&
    !sig.signature.startsWith("placeholder")
  );
}

/** True when the .lmanifest.json at `manifestPath` carries a REAL signature ON DISK. */
export function isRealSignedManifest(manifestPath) {
  if (!existsSync(manifestPath)) return false;
  let sig;
  try {
    sig = JSON.parse(readFileSync(manifestPath, "utf8")).governanceSignature;
  } catch {
    return true; // exists but unreadable → assume signed (fail-closed)
  }
  return isRealSignature(sig);
}

/**
 * The CG-7 protection predicate: is the manifest a COMMITTED ceremony artifact —
 * git-tracked AND real-signed in HEAD? Fail direction on every ambiguity:
 *   untracked            → false (a local dev artifact, e.g. api-protocol-rest's
 *                          test-regenerated dist — matches the direct-invocation
 *                          guard's discriminator, signed-fixture-guard §5)
 *   tracked, HEAD real   → true  (the ceremony's — protect)
 *   tracked, HEAD placeholder/unsigned → false (regenerable; the fuse-demo
 *                          fixture stays here until the owner ceremony-signs it)
 *   tracked, HEAD unreadable/not-yet-committed → true (cannot prove regenerable)
 *   git errors entirely  → fall back to the DISK predicate (conservative floor)
 */
export function isCommittedSignedManifest(gitRoot, manifestPath) {
  const rel = relative(gitRoot, manifestPath).replace(/\\/g, "/");
  const tracked = spawnSync("git", ["-C", gitRoot, "ls-files", "--error-unmatch", "--", rel],
    { encoding: "utf8", timeout: 15_000, shell: isWin });
  if (tracked.status === 1) return false;                        // untracked → dev-local
  if (tracked.status !== 0) return isRealSignedManifest(manifestPath); // git can't answer → disk floor
  const show = spawnSync("git", ["-C", gitRoot, "show", `HEAD:${rel}`],
    { encoding: "utf8", timeout: 15_000, shell: isWin });
  if (show.status !== 0) return true;                            // tracked but no HEAD blob → protect
  try {
    return isRealSignature(JSON.parse(show.stdout).governanceSignature);
  } catch {
    return true;                                                 // tracked + unparseable → protect
  }
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "build", ".graph"]);

/**
 * Find every fusable package (dir with a package.fungi.json) under the given
 * base dirs. THE single discovery walker for CG-7 tooling — both
 * rebuild-fusable-packages.mjs and audit-signed-fixture-drift.mjs consume it,
 * so their package sets cannot diverge (depth ≤ 6, same skip set, non-empty
 * descriptor `name` required).
 *
 * Returns { dir, name, manifestPath, signed, committedSigned } records:
 *   signed          — DISK shape (isRealSignedManifest)
 *   committedSigned — the CG-7 protection predicate (isCommittedSignedManifest),
 *                     computed against opts.gitRoot; omitted (undefined) when no
 *                     gitRoot is supplied.
 */
export function findFusablePackages(baseDirs, opts = {}) {
  const out = [];
  const walk = (base, depth) => {
    if (depth > 6 || !existsSync(base)) return;
    let entries;
    try { entries = readdirSync(base, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isFile() && e.name === "package.fungi.json") {
        let name = null;
        try { name = JSON.parse(readFileSync(join(base, e.name), "utf8")).name ?? null; } catch { /* unreadable descriptor → no name */ }
        if (typeof name === "string" && name.length > 0) {
          const manifestPath = join(base, "dist", `${name}.lmanifest.json`);
          const rec = { dir: base, name, manifestPath, signed: isRealSignedManifest(manifestPath) };
          if (opts.gitRoot) rec.committedSigned = isCommittedSignedManifest(opts.gitRoot, manifestPath);
          out.push(rec);
        }
      } else if (e.isDirectory() && !SKIP_DIRS.has(e.name)) {
        walk(join(base, e.name), depth + 1);
      }
    }
  };
  for (const base of baseDirs) walk(base, 0);
  return out;
}
