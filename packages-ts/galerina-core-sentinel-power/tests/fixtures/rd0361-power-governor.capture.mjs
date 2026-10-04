// rd0361-power-governor.capture.mjs: RD-0361 frozen-reference capture spec (schema v2) for the
// power-governor twin. Oracle = the reference spec in rd0361-power-governor-execution.test.mjs, copied
// verbatim (differential-spec-capture; NOT the real .ts). A real-.ts adapter is required before S13.
// The hostile "shadow\u0000" powerRank vector stays covered by the existing test: the frozen loader
// admits printable ASCII strings only. Re-capture: node scripts/rd0361-freeze-reference.mjs.
export const twin = Object.freeze({
  dir: "packages-ts/galerina-core-sentinel-power/src/self-hosted",
  file: "power-governor.fungi",
  module: "power-governor",
});
export const oracle = Object.freeze({
  kind: "differential-spec-capture",
  source: "packages-ts/galerina-core-sentinel-power/tests/rd0361-power-governor-execution.test.mjs",
});
export const signatures = Object.freeze([
  { name: "powerRank", params: ["string"], returns: "int" },
  { name: "powerStateVerdict", params: ["bool", "bool", "bool"], returns: "int" },
  { name: "kernelForState", params: ["int"], returns: "int" },
  { name: "adjustmentVerdict", params: ["int", "int"], returns: "k3" },
  { name: "envelopeValid", params: ["bool", "bool", "bool"], returns: "k3" },
  { name: "killSwitchVerdict", params: ["int"], returns: "k3" },
]);

const RANKS = new Map([["native", 0], ["simd", 1], ["shadow", 2]]);
export const reference = Object.freeze({
  powerRank: (kernel) => (RANKS.has(kernel) ? RANKS.get(kernel) : -1),
  powerStateVerdict: (crit, safe, thr) => (crit ? 3 : safe ? 2 : thr ? 1 : 0),
  kernelForState: (s) => (s === 0 ? 0 : s === 1 ? 1 : 2),
  adjustmentVerdict: (target, permitted) => (target < permitted ? -1 : 1),
  envelopeValid: (tp, tls, slc) => (!tp ? -1 : !tls ? -1 : !slc ? -1 : 1),
  killSwitchVerdict: (s) => (s === 3 ? -1 : 1),
});

const B = [false, true];
const b = (x) => (x ? 1 : 0);
const INTS = [-2147483648, -1, 0, 1, 2, 3, 4, 5, 2147483647];
export function cases() {
  const rows = [];
  for (const [i, k] of ["native", "simd", "shadow", "", "Native", " shadow", "unknown", "SIMD"].entries()) {
    rows.push({ id: `rank-${i}`, export: "powerRank", args: [k] });
  }
  for (const c of B) for (const s of B) for (const t of B) rows.push({ id: `state-${b(c)}${b(s)}${b(t)}`, export: "powerStateVerdict", args: [c, s, t] });
  for (const s of INTS) rows.push({ id: `kernel-${s}`, export: "kernelForState", args: [s] });
  for (const t of INTS) for (const p of INTS) rows.push({ id: `adjust-${t}-${p}`, export: "adjustmentVerdict", args: [t, p] });
  for (const x of B) for (const y of B) for (const z of B) rows.push({ id: `envelope-${b(x)}${b(y)}${b(z)}`, export: "envelopeValid", args: [x, y, z] });
  for (const s of INTS) rows.push({ id: `kill-${s}`, export: "killSwitchVerdict", args: [s] });
  return rows;
}
