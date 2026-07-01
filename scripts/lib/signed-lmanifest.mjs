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
// =============================================================================

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** True when the .lmanifest.json at `manifestPath` carries a REAL signature. */
export function isRealSignedManifest(manifestPath) {
  if (!existsSync(manifestPath)) return false;
  let sig;
  try {
    sig = JSON.parse(readFileSync(manifestPath, "utf8")).governanceSignature;
  } catch {
    return true; // exists but unreadable → assume signed (fail-closed)
  }
  return (
    sig !== null &&
    typeof sig === "object" &&
    typeof sig.keyId === "string" &&
    typeof sig.signature === "string" &&
    sig.signature.length > 0 &&
    !sig.signature.startsWith("placeholder")
  );
}

const SKIP_DIRS = new Set(["node_modules", "dist", ".git", "build", ".graph"]);

/**
 * Find every fusable package (dir with a package.fungi.json) under the given
 * base dirs. Returns { dir, name, manifestPath, signed } records. Walk rules
 * match rebuild-fusable-packages.mjs (depth ≤ 6, same skip set).
 */
export function findFusablePackages(baseDirs) {
  const out = [];
  const walk = (base, depth) => {
    if (depth > 6 || !existsSync(base)) return;
    let entries;
    try { entries = readdirSync(base, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isFile() && e.name === "package.fungi.json") {
        let name = null;
        try { name = JSON.parse(readFileSync(join(base, e.name), "utf8")).name ?? null; } catch { /* unreadable descriptor → no name */ }
        if (name !== null) {
          const manifestPath = join(base, "dist", `${name}.lmanifest.json`);
          out.push({ dir: base, name, manifestPath, signed: isRealSignedManifest(manifestPath) });
        }
      } else if (e.isDirectory() && !SKIP_DIRS.has(e.name)) {
        walk(join(base, e.name), depth + 1);
      }
    }
  };
  for (const base of baseDirs) walk(base, 0);
  return out;
}
