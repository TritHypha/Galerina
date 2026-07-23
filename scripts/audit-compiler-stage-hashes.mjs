// =============================================================================
// audit-compiler-stage-hashes.mjs — RD-0528 evidence-pack drift GATE (bridge 0101/0103, owner-blessed 0104)
// =============================================================================
// The evidence pack (docs/security/rd0528-compiler-stages-evidence-pack.md) records evidence item (d):
// each self-hosted compiler stage's compiled-WASM byte count + sha256. That table was a STATIC doc
// SNAPSHOT — nothing re-derived it, so it drifted SILENTLY as the emitter evolved (measured 0101:
// `parser` 17062→17854 bytes with no parser.fungi change is pure emitter drift). A recorded-but-ungated
// value silently rots — the same class as fail-closed-gates and new-error-type→detector.
//
// R&D ruling (0103, owner-approved 0104): gate the INVARIANT, not the frozen VALUE. Emitter drift is
// LEGITIMATE (compiled bytes SHOULD change as the emitter is iterated); the gap is that the drift is
// INVISIBLE + the pack claims live "hash-pin" evidence it can't back. So:
//   - re-derive all stage hashes (via gather-compiler-stage-hashes --json; its sha256 is wasmHash of the
//     WASM bytes, NOT the ephemeral signature → deterministic),
//   - compare to a recorded BASELINE (rd0528-compiler-stage-hashes-baseline.json),
//   - on drift → FAIL VISIBLE (never silent), naming each drifted stage old→new,
//   - the fix path is a REVIEW: `--update-baseline` if it's expected emitter evolution; INVESTIGATE if a
//     `.fungi` source changed unexpectedly (that is the real thing a hash-pin should catch).
// This upgrades item (d) from a stale snapshot (prose) to a gated baseline (gate) — assurance ladder.
//
// Usage:
//   node scripts/audit-compiler-stage-hashes.mjs                 # enforce: FAIL on drift vs baseline
//   node scripts/audit-compiler-stage-hashes.mjs --update-baseline  # refresh ALL rows after review
//   node scripts/audit-compiler-stage-hashes.mjs --json          # machine verdict
//   node scripts/audit-compiler-stage-hashes.mjs --self-test     # determinism + drift-detection truth table
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const GATHER = join(ROOT, "scripts", "gather-compiler-stage-hashes.mjs");
const BASELINE = join(ROOT, "docs", "security", "rd0528-compiler-stage-hashes-baseline.json");
const isWin = process.platform === "win32";

/** Re-derive the current per-stage {bytes, sha256} by running the gather producer in --json mode. */
export function deriveCurrent() {
  const r = spawnSync(process.execPath, [GATHER, "--json"], { cwd: ROOT, encoding: "utf8", timeout: 180_000, windowsHide: true, maxBuffer: 32 * 1024 * 1024, shell: false });
  if (r.status !== 0) throw new Error(`gather-compiler-stage-hashes --json failed (exit ${r.status}): ${(r.stderr || "").slice(0, 400)}`);
  const parsed = JSON.parse(r.stdout);
  if (!parsed.allClean) throw new Error("gather reports a stage is not build-clean/#105-admitted — cannot derive a trustworthy baseline (fail-closed)");
  const out = {};
  for (const row of parsed.rows) out[row.stage] = { bytes: row.bytes, sha256: row.sha256 };
  return out;
}

/** PURE decision (self-tested): compare current derivation to the recorded baseline. */
export function decideStageDrift(current, baseline) {
  const drifted = [];
  const missing = [];
  const extra = [];
  for (const stage of Object.keys(baseline)) {
    const c = current[stage];
    if (c === undefined) { missing.push(stage); continue; }
    const b = baseline[stage];
    if (c.sha256 !== b.sha256 || c.bytes !== b.bytes) {
      drifted.push({ stage, from: b, to: c });
    }
  }
  for (const stage of Object.keys(current)) if (baseline[stage] === undefined) extra.push(stage);
  const ok = drifted.length === 0 && missing.length === 0 && extra.length === 0;
  return { ok, drifted, missing, extra };
}

function readBaseline() {
  if (!existsSync(BASELINE)) return null;
  try { return JSON.parse(readFileSync(BASELINE, "utf8")).stages ?? null; } catch { return null; }
}

// ---------------------------------------------------------------------------
// Self-test — hermetic (synthetic current/baseline) + a live determinism check
// ---------------------------------------------------------------------------
function selfTest() {
  const results = [];
  const t = (name, ok) => { results.push(ok); console.log(`  ${ok ? "✅" : "❌"} ${name}`); };
  const base = { lexer: { bytes: 10, sha256: "aaa" }, parser: { bytes: 20, sha256: "bbb" } };

  // 1. identical → ok
  t("match: identical current == baseline → ok", decideStageDrift({ ...base }, base).ok === true);
  // 2. a changed sha → drift, named
  let d = decideStageDrift({ lexer: { bytes: 10, sha256: "ZZZ" }, parser: { bytes: 20, sha256: "bbb" } }, base);
  t("drift: a changed sha256 → NOT ok, names the stage", d.ok === false && d.drifted.length === 1 && d.drifted[0].stage === "lexer");
  // 3. a changed byte count (same sha is impossible, but bytes-only guard) → drift
  d = decideStageDrift({ lexer: { bytes: 99, sha256: "aaa" }, parser: { bytes: 20, sha256: "bbb" } }, base);
  t("drift: a changed byte count → NOT ok", d.ok === false && d.drifted.length === 1);
  // 4. a missing stage → NOT ok (a dropped stage must fail, not silently pass)
  d = decideStageDrift({ lexer: { bytes: 10, sha256: "aaa" } }, base);
  t("missing: a baseline stage absent from current → NOT ok", d.ok === false && d.missing.includes("parser"));
  // 5. an extra stage → NOT ok (an unrecorded stage must be reviewed into the baseline)
  d = decideStageDrift({ ...base, runtime: { bytes: 5, sha256: "ccc" } }, base);
  t("extra: a new stage not in baseline → NOT ok", d.ok === false && d.extra.includes("runtime"));

  // 6. LIVE determinism — the real reproducibility property: two derivations are identical.
  try {
    const a = deriveCurrent();
    const b = deriveCurrent();
    const same = Object.keys(a).length === Object.keys(b).length &&
      Object.keys(a).every((s) => b[s] && a[s].sha256 === b[s].sha256 && a[s].bytes === b[s].bytes);
    t(`determinism: two live derivations identical (${Object.keys(a).length} stages)`, same);
    // 7. and the live derivation has no drift vs its own snapshot fed as baseline (non-vacuous compare)
    t("non-vacuity: live derivation matches itself as baseline", decideStageDrift(a, a).ok === true);
  } catch (e) {
    t(`determinism: live derivation (${e.message})`, false);
  }

  const failed = results.filter((x) => !x).length;
  console.log(`\nself-test: ${results.length - failed}/${results.length} passed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) return selfTest();

  const current = deriveCurrent();

  if (args.has("--update-baseline") || args.has("--write")) {
    writeFileSync(BASELINE, JSON.stringify({
      note: "RD-0528 evidence item (d) baseline — re-derived + gated by scripts/audit-compiler-stage-hashes.mjs. Emitter drift is legitimate; on a drift FAIL, review then re-run --update-baseline (expected) or investigate a .fungi change (unexpected).",
      stages: current,
    }, null, 2) + "\n");
    console.log(`✅ baseline written: ${Object.keys(current).length} stages → docs/security/rd0528-compiler-stage-hashes-baseline.json`);
    process.exitCode = 0;
    return;
  }

  const baseline = readBaseline();
  if (baseline === null) {
    console.error("❌ no baseline (docs/security/rd0528-compiler-stage-hashes-baseline.json missing/unreadable) — run --update-baseline once after review to establish it (fail-closed: cannot attest without a baseline).");
    process.exitCode = 1;
    return;
  }

  const verdict = decideStageDrift(current, baseline);
  if (args.has("--json")) { console.log(JSON.stringify({ ...verdict, current, baseline }, null, 2)); process.exitCode = verdict.ok ? 0 : 1; return; }

  console.log("RD-0528 compiler-stage-hash drift gate (evidence item d — gated baseline, not a frozen value)");
  if (verdict.ok) {
    console.log(`  ✅ all ${Object.keys(baseline).length} stages match the reviewed baseline (bytes + sha256).`);
  } else {
    for (const d of verdict.drifted) console.log(`  ⚠ DRIFT ${d.stage.padEnd(22)} ${d.from.bytes}B ${d.from.sha256.slice(0, 12)} → ${d.to.bytes}B ${d.to.sha256.slice(0, 12)}`);
    for (const s of verdict.missing) console.log(`  ❌ MISSING ${s} — a baselined stage is absent from the current derivation`);
    for (const s of verdict.extra) console.log(`  ❌ EXTRA ${s} — a stage not in the baseline (record it after review)`);
    console.log("\n  A drift is EXPECTED when the emitter evolves — review, then `--update-baseline`. It is a RED FLAG");
    console.log("  when the affected stage's `.fungi` source did NOT change — investigate that before updating.");
  }
  process.exitCode = verdict.ok ? 0 : 1;
}

main();
