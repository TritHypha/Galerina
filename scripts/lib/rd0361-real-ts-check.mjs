// rd0361-real-ts-check.mjs: RD-0361 SLIDE track (slice S6b). Checks a hash-pinned FROZEN reference set
// against the REAL shipped TypeScript module, through a per-twin adapter file
// (packages-ts/<pkg>/tests/fixtures/rd0361-<stem>.real-ts.mjs). This exists because most frozen sets were
// captured from the hand-written spec in the existing rd0361 execution tests (oracle
// differential-spec-capture); this check closes that gap without RE-CAPTURING anything: a disagreement is
// reported as a mismatch, never written back (recapture authority is owner decision D-A, PLAN S7).
//
// Adapter file exports:
//   source     repo-relative path of the real .ts module the adapters drive
//   adapters   { exportName: { covers(...args) -> boolean, run(...args) -> value } }
//              covers() names the realisable domain: cases outside it are counted as `skipped`, never compared
//   uncovered  { exportName: "reason" } for twin exports with no real .ts counterpart
//   gaps       [ "human-readable note on each skipped domain" ]
// NON_AUTHORIZING.
import { plantedValue } from "./rd0361-frozen-reference.mjs";

/** Compare every frozen case the adapters can realise against the real .ts. Returns plain facts. */
export function checkRealTsAgainstFrozen(frozen, realTs) {
  const adapters = realTs.adapters;
  const uncovered = realTs.uncovered;
  const perExport = {};
  const mismatches = [];
  const errors = [];
  let compared = 0;
  let skipped = 0;
  for (const sig of frozen.exports) perExport[sig.name] = { compared: 0, skipped: 0 };
  for (const row of frozen.cases) {
    if (!Object.hasOwn(adapters, row.export)) { perExport[row.export].skipped += 1; skipped += 1; continue; }
    const adapter = adapters[row.export];
    if (!adapter.covers(...row.args)) { perExport[row.export].skipped += 1; skipped += 1; continue; }
    let real;
    try {
      real = adapter.run(...row.args);
    } catch (err) {
      errors.push({ id: row.id, message: String(err && err.message ? err.message : err) });
      continue;
    }
    perExport[row.export].compared += 1;
    compared += 1;
    if (!Object.is(real, row.expected)) mismatches.push({ id: row.id, export: row.export, args: row.args, frozen: row.expected, real });
  }
  const names = frozen.exports.map((sig) => sig.name);
  const unadapted = names.filter((n) => !Object.hasOwn(adapters, n) && !Object.hasOwn(uncovered, n));
  const strayAdapters = Object.keys(adapters).filter((n) => !names.includes(n));
  const idleAdapters = Object.keys(adapters).filter((n) => names.includes(n) && perExport[n].compared === 0);
  return { compared, skipped, total: frozen.cases.length, perExport, mismatches, errors, unadapted, strayAdapters, idleAdapters };
}

/** Non-vacuity control: flip the frozen value of the first realisable case; exactly that case must mismatch. */
export function plantedRealTsControl(frozen, realTs) {
  const idx = frozen.cases.findIndex((row) => Object.hasOwn(realTs.adapters, row.export) && realTs.adapters[row.export].covers(...row.args));
  if (idx < 0) return { plantedId: "", mismatches: [] };
  const sig = frozen.exports.find((s) => s.name === frozen.cases[idx].export);
  const cases = frozen.cases.map((row, i) => (i === idx ? { ...row, expected: plantedValue(sig.returns, row.expected) } : row));
  const r = checkRealTsAgainstFrozen({ ...frozen, cases }, realTs);
  return { plantedId: frozen.cases[idx].id, mismatches: r.mismatches.map((m) => m.id) };
}
