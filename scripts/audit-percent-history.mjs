// =============================================================================
// audit-percent-history.mjs — recurring % audit snapshots + deltas
// =============================================================================
// Owner ask (2026-07-16): "save audit % data, next % audit show difference,
// make this recurring — diff since last and diff since the start of the day."
//
// Each run:
//   1. invokes `component-health.mjs --json` and takes its `percentAudit`
//      section (shipReadinessPct / ztAvg / buildAvg + per-row label/pct),
//   2. writes a snapshot to build/audit-history/percent-<stamp>.json,
//   3. prints + writes (build/audit-history/percent-diff-latest.json) the
//      per-row percentage-point deltas vs
//        (a) the PREVIOUS snapshot ("since last audit"), and
//        (b) the FIRST snapshot of the same local day ("since day start").
//
// First run of a day seeds the day baseline; the very first run overall is the
// series baseline (both diffs empty, stated explicitly — never invented).
// Snapshots are committed (build/audit-history is tracked) so the series
// survives across sessions and machines.
//
// Usage:  node scripts/audit-percent-history.mjs [--self-test]
// =============================================================================
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const HIST = join(ROOT, "build", "audit-history");

// ── pure helpers (self-tested) ───────────────────────────────────────────────

// Flatten a percentAudit into a { "section:label" -> pct } map plus toplines.
export function flatten(pa) {
  const flat = {
    "topline:ship-readiness": round1(pa.shipReadinessPct),
    "topline:zt-avg": pa.ztAvg,
    "topline:build-avg": pa.buildAvg,
  };
  for (const s of pa.sections ?? []) {
    for (const r of s.rows ?? []) {
      if (typeof r.pct === "number") flat[`${s.key}:${r.label}`] = r.pct;
    }
  }
  return flat;
}

// Percentage-point deltas between two flat maps (rows present in either side).
export function diffFlat(from, to) {
  const keys = [...new Set([...Object.keys(from ?? {}), ...Object.keys(to ?? {})])].sort();
  const rows = [];
  for (const k of keys) {
    const a = from?.[k];
    const b = to?.[k];
    if (a === undefined || b === undefined) {
      rows.push({ key: k, from: a ?? null, to: b ?? null, deltaPp: null, note: a === undefined ? "new row" : "row removed" });
    } else {
      rows.push({ key: k, from: a, to: b, deltaPp: round1(b - a) });
    }
  }
  return rows;
}

export function localDay(stamp) { return stamp.slice(0, 10); }
function round1(n) { return Math.round(n * 10) / 10; }
function stampNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

// ── self-test (fail-closed: any mismatch exits 1) ────────────────────────────
if (process.argv.includes("--self-test")) {
  const pa = { shipReadinessPct: 97.87, ztAvg: 78, buildAvg: 75, sections: [{ key: "zt", rows: [{ label: "Compiler", pct: 100 }, { label: "Memory", pct: 62 }] }] };
  const flat = flatten(pa);
  assert(flat["zt:Compiler"] === 100 && flat["zt:Memory"] === 62 && flat["topline:ship-readiness"] === 97.9, "flatten");
  const d = diffFlat({ "zt:Memory": 62, "zt:Gone": 5 }, { "zt:Memory": 64, "zt:New": 1 });
  const m = Object.fromEntries(d.map((r) => [r.key, r]));
  assert(m["zt:Memory"].deltaPp === 2, "delta math");
  assert(m["zt:Gone"].note === "row removed" && m["zt:New"].note === "new row", "row add/remove");
  assert(localDay("2026-07-16T16-02-11") === "2026-07-16", "localDay");
  console.log("audit-percent-history self-test: 4/4 ok");
  process.exit(0);
}
function assert(ok, what) { if (!ok) { console.error(`self-test FAIL: ${what}`); process.exit(1); } }

// ── main ─────────────────────────────────────────────────────────────────────
const raw = execFileSync(process.execPath, [join(ROOT, "scripts", "component-health.mjs"), "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const health = JSON.parse(raw.replace(/^﻿/, ""));
const pa = health.percentAudit;
if (!pa) { console.error("component-health --json returned no percentAudit section (fail-closed)"); process.exit(1); }

mkdirSync(HIST, { recursive: true });
const stamp = stampNow();
const snapshot = {
  stamp,
  provenance: pa.provenance ?? null,
  shipReadinessPct: round1(pa.shipReadinessPct),
  ztAvg: pa.ztAvg,
  buildAvg: pa.buildAvg,
  flat: flatten(pa),
};

// prior series (before writing ours)
const priors = readdirSync(HIST)
  .filter((f) => /^percent-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/.test(f))
  .sort()
  .map((f) => JSON.parse(readFileSync(join(HIST, f), "utf8")));

writeFileSync(join(HIST, `percent-${stamp}.json`), JSON.stringify(snapshot, null, 1) + "\n");

const last = priors.length > 0 ? priors[priors.length - 1] : null;
const dayFirst = priors.find((p) => localDay(p.stamp) === localDay(stamp)) ?? null;

function report(label, from) {
  if (!from) return { baseline: true, note: `no prior snapshot — this run seeds the ${label} baseline`, rows: [] };
  const rows = diffFlat(from.flat, snapshot.flat);
  return { baseline: false, fromStamp: from.stamp, rows };
}
const out = {
  stamp,
  sinceLast: report("series", last),
  sinceDayStart: report("day", dayFirst),
};
writeFileSync(join(HIST, "percent-diff-latest.json"), JSON.stringify(out, null, 1) + "\n");

// terminal summary — movers only (|Δ| > 0), full data in the JSON
console.log(`percent-audit snapshot: ${stamp}  (ship ${snapshot.shipReadinessPct}% · zt ${snapshot.ztAvg}% · build ${snapshot.buildAvg}%)`);
for (const [title, rep] of [["since last audit", out.sinceLast], ["since day start", out.sinceDayStart]]) {
  if (rep.baseline) { console.log(`  ${title}: ${rep.note}`); continue; }
  const movers = rep.rows.filter((r) => (r.deltaPp !== null && r.deltaPp !== 0) || r.note);
  console.log(`  ${title} (vs ${rep.fromStamp}): ${movers.length === 0 ? "no change" : ""}`);
  for (const r of movers) {
    console.log(`    ${r.key}: ${r.from ?? "—"} -> ${r.to ?? "—"}  ${r.deltaPp !== null ? (r.deltaPp > 0 ? "+" : "") + r.deltaPp + "pp" : r.note}`);
  }
}
console.log(`  -> ${join("build", "audit-history", "percent-diff-latest.json")}`);
