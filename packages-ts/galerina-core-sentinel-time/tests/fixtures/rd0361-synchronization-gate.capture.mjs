// rd0361-synchronization-gate.capture.mjs: RD-0361 frozen-reference capture spec (schema v2) for the
// synchronization-gate twin. Oracle = the REAL synchronization-gate.ts (package dist), driven exactly as
// rd0361-execution-cutover.test.mjs drives it. Re-capture: node scripts/rd0361-freeze-reference.mjs.
import { LogicalClock, SynchronizationGate } from "../../dist/index.js";

export const twin = Object.freeze({
  dir: "packages-ts/galerina-core-sentinel-time/src/self-hosted",
  file: "synchronization-gate.fungi",
  module: "sync-gate",
});
export const oracle = Object.freeze({
  kind: "typescript-shadow-capture",
  source: "packages-ts/galerina-core-sentinel-time/src/synchronization-gate.ts",
});
export const signatures = Object.freeze([
  { name: "syncGateVerdict", params: ["bool"], returns: "k3" },
  { name: "driftGateVerdict", params: ["bool", "int", "int"], returns: "k3" },
]);

// drift == +driftAbs; throw => DENY (-1), return => ALLOW (+1).
function tsDriftVerdict(synced, driftAbs, maxDriftTicks) {
  const clock = new LogicalClock();
  const gate = new SynchronizationGate(clock, { maxDriftTicks });
  try {
    if (!synced) { gate.enforceDrift(100, 1); return 1; }
    gate.syncToPhysical(0);
    clock.advance(100 + driftAbs);
    gate.enforceDrift(100, 1);
    return 1;
  } catch {
    return -1;
  }
}
export const reference = Object.freeze({
  syncGateVerdict: (synced) => tsDriftVerdict(synced, 0, 0),
  driftGateVerdict: (synced, driftAbs, maxDriftTicks) => tsDriftVerdict(synced, driftAbs, maxDriftTicks),
});

export function cases() {
  const rows = [];
  for (const s of [false, true]) rows.push({ id: `sync-s${s ? 1 : 0}`, export: "syncGateVerdict", args: [s] });
  const drifts = [0, 1, 4, 5, 6, 9, 10, 11, 100, 1000000];
  const maxes = [0, 1, 5, 10, 1000000];
  for (const s of [false, true]) for (const d of drifts) for (const m of maxes) {
    rows.push({ id: `drift-s${s ? 1 : 0}-d${d}-m${m}`, export: "driftGateVerdict", args: [s, d, m] });
  }
  for (const [s, d, m] of [[true, 2147483647, 2147483647], [true, 2147483647, 2147483646], [true, 2147483646, 2147483647], [false, 2147483647, 2147483647]]) {
    rows.push({ id: `drift-s${s ? 1 : 0}-d${d}-m${m}`, export: "driftGateVerdict", args: [s, d, m] });
  }
  return rows;
}
