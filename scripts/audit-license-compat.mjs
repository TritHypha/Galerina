#!/usr/bin/env node
// audit-license-compat.mjs — the license-audit GATE (RD-0355 L3).
//
// WHY: Package Standard §3 ("no GPL in a non-native-floor core dependency"; MIT
// default) was DOC-ONLY — a rule with no detector is fail-open (house rule: the fix
// and the detector are one unit). This gate is that detector.
//
// It PORTS the classifier from the KB census tool
// (ZTF-Knowledge-Bases/tools/license-census.mjs) — one source of truth, bound by the
// SHARED self-test fixtures below (anti-drift, the CANONICAL_EFFECTS lesson). The two
// repos live apart, so a cross-repo import is impossible; the conformance is the
// identical fixture set (GPL→RED · missing→RED · MIT→green · dual→DUAL-OK).
//
// Fail-closed RED (Standard §3), on:
//   (1) COPYLEFT in a package's runtime closure where that package is NOT a sanctioned
//       self-GPL extension — the RD-0355 F1 invariant: GPL stays inside opt-in GPL
//       extensions, never under an MIT @galerina/* package.
//   (2) UNKNOWN / unparseable license with no EVIDENCED override entry.
//   (4) Any @galerina/* package declaring a sanctioned GPL extension as a runtime
//       dependency — extensions are app-level opt-ins, never library deps.
//   (3, partial) An override whose recorded LICENSE-file sha256 no longer matches the
//       file on disk → RED (the npm license-flip vector, verified on the pinned set).
// WARN (advisory — L2 is owner-gated): a sanctioned GPL extension whose OWN license
//   field is not yet "GPL-3.0-only"/"GPL-3.0". Main prepares that diff; the owner merges.
// DEFERRED (honest, needs infra not yet present): full (3) drift over EVERY dep needs a
//   pinned license baseline; (5) NOTICE propagation needs sbom.json licenseFileHash
//   with teeth. Tracked in RD-0355 §4; not silently claimed here.
//
// Zero-dep, read-only. --self-test plants fixtures and asserts the RED/green matrix
// (the ZT-43 redness proof — a neutered gate is caught). Run from repo root.

import { readdirSync, readFileSync, existsSync, lstatSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

// ── Classifier (ported verbatim from tools/license-census.mjs — keep in lockstep) ──
const PERMISSIVE = new Set([
  "MIT", "ISC", "0BSD", "BSD-2-CLAUSE", "BSD-3-CLAUSE", "APACHE-2.0",
  "CC0-1.0", "UNLICENSE", "BLUEOAK-1.0.0", "PYTHON-2.0", "WTFPL", "ZLIB", "MIT-0",
]);
const WEAK = new Set(["MPL-2.0", "LGPL-2.1", "LGPL-3.0", "LGPL-2.1-OR-LATER", "LGPL-3.0-OR-LATER", "CC-BY-4.0", "CC-BY-3.0"]);
const isCopyleft = (id) => /(^|[^L])GPL/i.test(id) && !/LGPL/i.test(id); // GPL/AGPL, not LGPL

function licenseOf(pkg) {
  const raw = pkg.license ?? pkg.licenses;
  if (raw == null) return "UNKNOWN";
  if (typeof raw === "string") return raw.trim() || "UNKNOWN";
  if (Array.isArray(raw)) return raw.map((l) => (typeof l === "string" ? l : l?.type ?? "UNKNOWN")).join(" OR ") || "UNKNOWN";
  if (typeof raw === "object") return raw.type?.trim() || "UNKNOWN";
  return "UNKNOWN";
}

export function classify(expr) {
  const up = expr.toUpperCase().replace(/[()]/g, " ").trim();
  if (up === "UNKNOWN" || up === "") return "UNKNOWN-RED";
  const alternatives = up.split(/\s+OR\s+/);
  const verdictOfOne = (branch) => {
    const parts = branch.split(/\s+AND\s+/);
    let worst = "PERMISSIVE";
    for (const pRaw of parts) {
      const p = pRaw.trim().replace(/-ONLY$/, "").replace(/\s+/g, "-");
      if (PERMISSIVE.has(p) || PERMISSIVE.has(p.replace(/-OR-LATER$/, ""))) continue;
      if (WEAK.has(p)) { if (worst === "PERMISSIVE") worst = "WEAK"; continue; }
      if (isCopyleft(p)) return "COPYLEFT-RED";
      return "UNKNOWN-RED";
    }
    return worst;
  };
  const verdicts = alternatives.map(verdictOfOne);
  if (verdicts.includes("PERMISSIVE")) return alternatives.length > 1 ? "DUAL-OK" : "PERMISSIVE";
  if (verdicts.includes("WEAK")) return "WEAK";
  if (verdicts.every((v) => v === "COPYLEFT-RED")) return "COPYLEFT-RED";
  return "UNKNOWN-RED";
}

// ── The one measured, sanctioned GPL container (RD-0355 F1). GPL is allowed to live
//    ONLY inside these opt-in extensions; anywhere else it is a §3 breach. ────────────
const SANCTIONED_GPL_EXTENSIONS = new Set(["@galerina/ext-proof-snarkjs"]);
const GPL_EXTENSION_EXPECTED_LICENSE = new Set(["GPL-3.0-ONLY", "GPL-3.0", "GPL-3.0-OR-LATER"]);

const LICENSE_FILENAMES = ["LICENSE", "LICENSE.BSD", "LICENSE.md", "LICENSE.txt", "LICENCE", "license", "license.txt", "COPYING"];

// ── Tree walk (mirrors the census; collects third-party {name,version,license}) ──────
function collectTree(nmDir, sink, seen, depth = 0) {
  if (depth > 8 || !existsSync(nmDir)) return;
  let entries;
  try { entries = readdirSync(nmDir, { withFileTypes: true }); } catch { return; }
  for (const ent of entries) {
    if (!ent.isDirectory() && !ent.isSymbolicLink()) continue;
    const name = ent.name;
    if (name.startsWith(".")) continue;
    const dir = join(nmDir, name);
    if (name.startsWith("@")) {
      if (name === "@galerina") continue;
      let scoped; try { scoped = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const s of scoped) if (s.isDirectory() || s.isSymbolicLink()) visitPkg(join(dir, s.name), sink, seen, depth, name);
      continue;
    }
    visitPkg(dir, sink, seen, depth);
  }
}
function visitPkg(dir, sink, seen, depth, scope) {
  let key;
  try { key = lstatSync(dir).ino + ":" + dir.toLowerCase(); } catch { return; }
  if (seen.has(key)) return;
  seen.add(key);
  const pj = join(dir, "package.json");
  if (existsSync(pj)) {
    try {
      const pkg = JSON.parse(readFileSync(pj, "utf8"));
      const name = pkg.name ?? (scope ? `${scope}/${basename(dir)}` : basename(dir));
      if (!name.startsWith("@galerina/")) {
        const lic = licenseOf(pkg);
        const k = `${name}@${pkg.version ?? "?"}`;
        if (!sink.has(k)) sink.set(k, { name, version: pkg.version ?? "?", license: lic, verdict: classify(lic), dir });
      }
    } catch { /* unreadable manifest — the census tracks that gap; here we skip */ }
  }
  collectTree(join(dir, "node_modules"), sink, seen, depth + 1);
}

function sha256File(f) {
  try { return createHash("sha256").update(readFileSync(f)).digest("hex"); } catch { return null; }
}
// True iff SOME license file in `dir` hashes to `hash`.
function dirHasLicenseHash(dir, hash) {
  for (const fn of LICENSE_FILENAMES) {
    const f = join(dir, fn);
    if (existsSync(f) && sha256File(f) === hash) return true;
  }
  return false;
}

function loadOverrides(root) {
  const f = join(root, "governance", "license-overrides.json");
  if (!existsSync(f)) return { list: [], byKey: new Map() };
  let json; try { json = JSON.parse(readFileSync(f, "utf8")); } catch { return { list: [], byKey: new Map() }; }
  const list = Array.isArray(json.overrides) ? json.overrides : [];
  const byKey = new Map(list.map((o) => [`${o.package}@${o.version}`, o]));
  return { list, byKey };
}

// ── The gate ─────────────────────────────────────────────────────────────────────────
export function auditLicenses(root) {
  const pkgsDir = join(root, "packages-galerina");
  const firstParty = readdirSync(pkgsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const { byKey: overrides } = loadOverrides(root);
  const reds = [];
  const warns = [];
  const usedOverrides = new Set();

  for (const fp of firstParty) {
    const fpDir = join(pkgsDir, fp);
    let manifest = {};
    try { manifest = JSON.parse(readFileSync(join(fpDir, "package.json"), "utf8")); } catch { /* no manifest */ }
    const selfName = manifest.name ?? `@galerina/${fp}`;
    const isSanctionedExt = SANCTIONED_GPL_EXTENSIONS.has(selfName);

    // (4) an @galerina/* package may NOT declare a sanctioned GPL extension as a dep.
    const deps = { ...(manifest.dependencies ?? {}) };
    for (const dep of Object.keys(deps)) {
      if (SANCTIONED_GPL_EXTENSIONS.has(dep)) {
        reds.push(`(4) ${selfName} declares the GPL extension '${dep}' as a dependency — extensions are opt-in app-level, never a library dep.`);
      }
    }

    // WARN: a sanctioned GPL extension whose OWN license isn't GPL-3.0 (L2 owner-gated).
    if (isSanctionedExt) {
      const selfLic = licenseOf(manifest).toUpperCase().replace(/\s+/g, "-");
      if (!GPL_EXTENSION_EXPECTED_LICENSE.has(selfLic)) {
        warns.push(`(L2-pending) ${selfName} contains the GPL cluster but its own license field is '${licenseOf(manifest)}' — should be 'GPL-3.0-only' (owner-gated licensing act L2).`);
      }
    }

    // Scan the installed tree for copyleft / unknown.
    const sink = new Map();
    collectTree(join(fpDir, "node_modules"), sink, new Set());
    for (const v of sink.values()) {
      if (v.verdict === "COPYLEFT-RED" && !isSanctionedExt) {
        // (1) GPL under a package that is NOT a sanctioned extension.
        reds.push(`(1) COPYLEFT '${v.name}@${v.version}' (${v.license}) is in the runtime closure of '${selfName}', which is not a sanctioned GPL extension.`);
      } else if (v.verdict === "UNKNOWN-RED") {
        // (2) UNKNOWN needs an evidenced override.
        const k = `${v.name}@${v.version}`;
        const ov = overrides.get(k);
        if (!ov) {
          reds.push(`(2) UNKNOWN/unparseable license '${v.license}' for '${k}' (in '${selfName}') has no evidenced override in governance/license-overrides.json.`);
        } else if (!ov.licenseFileSha256) {
          reds.push(`(2) override for '${k}' has no licenseFileSha256 evidence — an override without evidence is invalid.`);
        } else if (!dirHasLicenseHash(v.dir, ov.licenseFileSha256)) {
          // (3, partial) drift: the pinned evidence hash no longer matches the file on disk.
          reds.push(`(3) override for '${k}' is stale — no LICENSE file in '${v.dir}' matches the pinned sha256 ${ov.licenseFileSha256.slice(0, 12)}… (re-vet: the license text changed).`);
        } else {
          usedOverrides.add(k);
        }
      }
    }
  }
  return { firstPartyCount: firstParty.length, reds, warns, usedOverrides: [...usedOverrides] };
}

// ── ZT-43 self-test ───────────────────────────────────────────────────────────────────
function selfTest() {
  const tmp = mkdtempSync(join(tmpdir(), "license-audit-"));
  try {
    const mk = (rel, obj) => { const d = join(tmp, rel); mkdirSync(d, { recursive: true }); writeFileSync(join(d, "package.json"), JSON.stringify(obj)); return d; };
    // MIT package with a planted GPL dep → (1) RED.
    mk("packages-galerina/mit-pkg", { name: "@galerina/mit-pkg", license: "MIT", dependencies: { "evil-gpl": "1.0.0" } });
    mk("packages-galerina/mit-pkg/node_modules/evil-gpl", { name: "evil-gpl", version: "1.0.0", license: "GPL-3.0" });
    // Package with an UNKNOWN dep and NO override → (2) RED.
    mk("packages-galerina/unk-pkg", { name: "@galerina/unk-pkg", license: "MIT", dependencies: { "mystery": "1.0.0" } });
    mk("packages-galerina/unk-pkg/node_modules/mystery", { name: "mystery", version: "1.0.0" });
    // Package with an UNKNOWN dep COVERED by an evidenced override (matching hash) → green.
    const okDir = mk("packages-galerina/ovr-pkg", { name: "@galerina/ovr-pkg", license: "MIT", dependencies: { "oldbsd": "1.2.5" } });
    const depDir = mk("packages-galerina/ovr-pkg/node_modules/oldbsd", { name: "oldbsd", version: "1.2.5", licenses: [{ type: "BSD" }] });
    writeFileSync(join(depDir, "LICENSE"), "the 2-clause bsd text\n");
    const licHash = createHash("sha256").update(readFileSync(join(depDir, "LICENSE"))).digest("hex");
    // The sanctioned GPL extension: GPL in its tree is OK → green (no (1) RED).
    mk("packages-galerina/galerina-ext-proof-snarkjs", { name: "@galerina/ext-proof-snarkjs", license: "GPL-3.0-only", dependencies: { "snarkjs": "0.7.0" } });
    mk("packages-galerina/galerina-ext-proof-snarkjs/node_modules/snarkjs", { name: "snarkjs", version: "0.7.0", license: "GPL-3.0" });
    // A DIFFERENT @galerina pkg declaring the extension as a dep → (4) RED.
    mk("packages-galerina/bad-consumer", { name: "@galerina/bad-consumer", license: "MIT", dependencies: { "@galerina/ext-proof-snarkjs": "1.0.0" } });
    mkdirSync(join(tmp, "governance"), { recursive: true });
    writeFileSync(join(tmp, "governance", "license-overrides.json"), JSON.stringify({
      overrides: [{ package: "oldbsd", version: "1.2.5", declaredLicense: "BSD", resolvedLicense: "BSD-2-Clause", licenseFileSha256: licHash, reviewer: "self-test", date: "2026-07-11" }],
    }));

    const r = auditLicenses(tmp);
    const red = (frag) => r.reds.some((x) => x.includes(frag));
    const checks = [
      ["(1) GPL under an MIT package → RED", red("COPYLEFT 'evil-gpl")],
      ["(2) UNKNOWN with no override → RED", red("mystery@1.0.0")],
      ["(2/3) UNKNOWN with an evidenced, hash-matching override → green", !red("oldbsd@1.2.5") && r.usedOverrides.includes("oldbsd@1.2.5")],
      ["(1) GPL inside the sanctioned extension → NOT red", !red("snarkjs@0.7.0")],
      ["(4) @galerina pkg declaring the GPL extension → RED", red("declares the GPL extension")],
      ["classifier: MIT→PERMISSIVE, GPL→COPYLEFT-RED, ''→UNKNOWN-RED, (MIT OR GPL-2.0)→DUAL-OK",
        classify("MIT") === "PERMISSIVE" && classify("GPL-3.0") === "COPYLEFT-RED" && classify("") === "UNKNOWN-RED" && classify("(MIT OR GPL-2.0)") === "DUAL-OK"],
    ];
    let pass = 0;
    for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (ok) pass++; }
    console.log(`\nlicense-audit self-test: ${pass}/${checks.length}`);
    process.exit(pass === checks.length ? 0 : 1);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// ── CLI ────────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes("--self-test")) {
  selfTest();
} else {
  const root = process.cwd();
  const { firstPartyCount, reds, warns, usedOverrides } = auditLicenses(root);
  console.log(`# license-audit (RD-0355 §3) — ${new Date().toISOString().slice(0, 10)}`);
  console.log(`Scanned ${firstPartyCount} first-party packages · sanctioned GPL extension(s): ${[...SANCTIONED_GPL_EXTENSIONS].join(", ")}`);
  if (usedOverrides.length) console.log(`Evidenced overrides applied: ${usedOverrides.join(", ")}`);
  for (const w of warns) console.log(`  WARN  ${w}`);
  if (reds.length === 0) {
    console.log(`\n✅ license-audit: 0 violations — no GPL under a non-extension package, no unevidenced unknowns, no extension declared as a library dep.`);
    process.exit(0);
  }
  console.log(`\n## VIOLATIONS (${reds.length})`);
  for (const r of reds) console.log(`  ❌ ${r}`);
  process.exit(Math.min(reds.length, 250));
}
