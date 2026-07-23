// =============================================================================
// audit-u2-version-floor.mjs — U2 compiler-version admission floor
// =============================================================================
// U2: every artifact's admission provenance carries `compilerVersion` (stamped by
// generateManifest INSIDE the signed body). Artifacts built before the #140/#163
// fidelity fixes can be placeholder-bodied yet validate cleanly — and a signature
// proves provenance, never fidelity — so the floor exists to recall them: once
// enforcement flips, an artifact WITHOUT the field is pre-floor and is REFUSED.
//
// MODES (deliberately two-phase — the ceremony-signed set predates the field by
// design, so enforcing before the owner's U2 re-sign ceremony would red the world):
//   report-only (default) — NEVER exits 1 on a pre-floor row; prints every one
//     LOUDLY with an explicit "will be REFUSED once enforced" label. A report-only
//     gate that could read as a pass would be the signal-conflation class — the
//     mode banner is unmissable and pre-floor rows are individually named.
//   --enforce — flips at U2 ceremony step 4.8: any SIGNED package manifest
//     (ceremony or dev-signed) missing the field ⟹ exit 1. Zero measurable rows
//     ⟹ exit 1 too (cannot-attest is not a pass). Unsigned manifests are listed
//     but not enforced — they are already inadmissible at fuse
//     (FUNGI-FUSE-UNSIGNED); local build/ artifacts are informational only.
//
// Discovery reuses scripts/lib/signed-lmanifest.mjs — THE single walker +
// signed-predicate the CG-7 tooling shares (never a second detector).
//
// Usage:
//   node scripts/audit-u2-version-floor.mjs               # report-only (phase-close wiring)
//   node scripts/audit-u2-version-floor.mjs --enforce     # post-ceremony floor (step 4.8)
//   node scripts/audit-u2-version-floor.mjs --json        # machine-readable verdict
//   node scripts/audit-u2-version-floor.mjs --self-test   # hermetic truth table
// =============================================================================

import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// Row extraction
// ---------------------------------------------------------------------------

/** Read a manifest's compilerVersion. Unreadable/corrupt ⟹ {version:null, unreadable:true}
 *  — under enforcement that counts PRE-FLOOR (fail-closed: cannot prove stamped). */
export function readManifestVersion(manifestPath) {
  try {
    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    const v = m?.compilerVersion;
    return { version: typeof v === "string" && v.length > 0 ? v : null, unreadable: false };
  } catch {
    return { version: null, unreadable: true };
  }
}

/** Enumerate floor rows: package manifests (classified) + local build/ manifests (info). */
async function collectRows() {
  const { findFusablePackages } = await import("./lib/signed-lmanifest.mjs");
  const rows = [];
  for (const p of findFusablePackages([join(ROOT, "packages-galerina")], { gitRoot: ROOT })) {
    if (!existsSync(p.manifestPath)) continue; // package never built → nothing minted to measure
    const { version, unreadable } = readManifestVersion(p.manifestPath);
    rows.push({
      name: p.name,
      cls: p.committedSigned ? "ceremony" : p.signed ? "dev-signed" : "unsigned",
      version, unreadable,
    });
  }
  const buildDir = join(ROOT, "build");
  if (existsSync(buildDir)) {
    for (const f of readdirSync(buildDir).filter((f) => f.endsWith(".lmanifest.json"))) {
      const { version, unreadable } = readManifestVersion(join(buildDir, f));
      rows.push({ name: `build/${f}`, cls: "local-build", version, unreadable });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Pure decision — the enforcement truth table (self-tested below)
// ---------------------------------------------------------------------------

export function decideU2Floor(rows, { enforce }) {
  const measured = rows.filter((r) => r.cls !== "local-build");
  const flagged = measured.filter((r) => (r.cls === "ceremony" || r.cls === "dev-signed") && r.version === null);
  const unsignedUnstamped = measured.filter((r) => r.cls === "unsigned" && r.version === null);
  const cannotAttest = enforce && measured.length === 0;
  const exit = enforce && (flagged.length > 0 || cannotAttest) ? 1 : 0;
  return { exit, flagged, unsignedUnstamped, measured, cannotAttest };
}

// ---------------------------------------------------------------------------
// Self-test (hermetic — synthetic rows + a tmp-dir extraction check)
// ---------------------------------------------------------------------------

function selfTest() {
  const results = [];
  const t = (name, ok) => { results.push({ name, ok }); console.log(`  ${ok ? "✅" : "❌"} ${name}`); };

  const stamped = (cls, name = cls) => ({ name, cls, version: "1.0.0-beta.2", unreadable: false });
  const bare = (cls, name = cls) => ({ name, cls, version: null, unreadable: false });

  // 1. report-only NEVER fails on a pre-floor row — but DETECTS it (non-vacuous)
  let d = decideU2Floor([bare("ceremony")], { enforce: false });
  t("report-only: unstamped ceremony row → exit 0", d.exit === 0);
  t("report-only: unstamped ceremony row IS flagged (detection non-vacuous)", d.flagged.length === 1);

  // 2. enforce flips the same input to a failure
  d = decideU2Floor([bare("ceremony")], { enforce: true });
  t("enforce: unstamped ceremony row → exit 1", d.exit === 1);

  // 3. enforce passes when every signed manifest is stamped
  d = decideU2Floor([stamped("ceremony"), stamped("dev-signed")], { enforce: true });
  t("enforce: all signed rows stamped → exit 0", d.exit === 0);

  // 4. enforce with NOTHING measurable is a failure (a no-op must not read as a pass)
  d = decideU2Floor([], { enforce: true });
  t("enforce: zero measurable rows → exit 1 (cannot-attest ≠ pass)", d.exit === 1 && d.cannotAttest);

  // 5. local build/ artifacts are informational — never enforced
  d = decideU2Floor([stamped("ceremony"), bare("local-build", "build/x.lmanifest.json")], { enforce: true });
  t("enforce: unstamped local-build row alone does not fail", d.exit === 0);

  // 6. unsigned manifests are listed, not enforced (already inadmissible at fuse)
  d = decideU2Floor([stamped("ceremony"), bare("unsigned")], { enforce: true });
  t("enforce: unstamped UNSIGNED row does not fail but is reported", d.exit === 0 && d.unsignedUnstamped.length === 1);

  // 7. dev-signed manifests ARE enforced (admission credentials regenerate with the field)
  d = decideU2Floor([bare("dev-signed")], { enforce: true });
  t("enforce: unstamped dev-signed row → exit 1", d.exit === 1);

  // 8. extraction: stamped / unstamped / corrupt JSON from real files
  const dir = mkdtempSync(join(tmpdir(), "u2-floor-selftest-"));
  try {
    writeFileSync(join(dir, "a.json"), JSON.stringify({ compilerVersion: "9.9.9" }));
    writeFileSync(join(dir, "b.json"), JSON.stringify({ schemaVersion: "fungi.manifest.v1" }));
    writeFileSync(join(dir, "c.json"), "{ not json");
    const a = readManifestVersion(join(dir, "a.json"));
    const b = readManifestVersion(join(dir, "b.json"));
    const c = readManifestVersion(join(dir, "c.json"));
    t("extract: stamped manifest → its version", a.version === "9.9.9" && !a.unreadable);
    t("extract: unstamped manifest → null (pre-floor)", b.version === null && !b.unreadable);
    t("extract: corrupt manifest → null + unreadable (fail-closed)", c.version === null && c.unreadable);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\nself-test: ${results.length - failed}/${results.length} passed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) return selfTest();
  const enforce = args.has("--enforce");

  const rows = await collectRows();
  const verdict = decideU2Floor(rows, { enforce });

  if (args.has("--json")) {
    console.log(JSON.stringify({ mode: enforce ? "enforce" : "report-only", ...verdict, rows }, null, 2));
    process.exitCode = verdict.exit;
    return;
  }

  console.log("═".repeat(76));
  console.log(enforce
    ? "U2 COMPILER-VERSION FLOOR — MODE: ENFORCE (absent field = REFUSE, fail-closed)"
    : "U2 COMPILER-VERSION FLOOR — MODE: REPORT-ONLY (a pre-floor row does NOT fail this run;");
  if (!enforce) console.log("  enforcement flips to --enforce at U2 ceremony step 4.8 — until then this is a preview)");
  console.log("═".repeat(76));

  for (const r of rows.filter((r) => r.cls !== "local-build")) {
    const label = r.version !== null
      ? `stamped ${r.version}`
      : r.unreadable
        ? "UNREADABLE → PRE-FLOOR (fail-closed)"
        : "PRE-FLOOR (no compilerVersion — will be REFUSED once enforced)";
    console.log(`  [${r.cls.padEnd(11)}] ${r.name.padEnd(34)} ${label}`);
  }
  // Local build/ artifacts are transient + informational — one summary line, not 100 rows
  // (full per-file detail remains in --json). Stamped ones are named: they are the live
  // evidence that a REBUILT artifact carries the field.
  const localRows = rows.filter((r) => r.cls === "local-build");
  if (localRows.length > 0) {
    const localStamped = localRows.filter((r) => r.version !== null);
    console.log(`  [local-build] ${localRows.length} transient build/ manifest(s): ${localStamped.length} stamped · ${localRows.length - localStamped.length} pre-floor (informational — never enforced)`);
    for (const r of localStamped) console.log(`      stamped ${r.version}  ${r.name}`);
  }
  if (rows.length === 0) console.log("  ⚠ 0 manifests found — NOTHING was measured (this line is the no-op alarm).");

  const stampedCount = verdict.measured.filter((r) => r.version !== null).length;
  console.log("─".repeat(76));
  console.log(`  measured(package): ${verdict.measured.length} · stamped: ${stampedCount} · pre-floor(signed): ${verdict.flagged.length} · unsigned-unstamped: ${verdict.unsignedUnstamped.length}`);
  if (verdict.flagged.length > 0) {
    console.log(enforce
      ? `  ❌ ${verdict.flagged.length} signed pre-floor artifact(s) — REFUSED under the U2 floor: ${verdict.flagged.map((r) => r.name).join(", ")}`
      : `  ⚠ ${verdict.flagged.length} signed pre-floor artifact(s) awaiting the owner's U2 re-sign ceremony: ${verdict.flagged.map((r) => r.name).join(", ")}`);
  }
  if (verdict.cannotAttest) console.log("  ❌ zero measurable package manifests — cannot attest the floor (fail-closed).");
  console.log(`  exit ${verdict.exit}`);
  process.exitCode = verdict.exit;
}

main().catch((err) => { console.error(`audit-u2-version-floor: ${err.message}`); process.exitCode = 1; });
