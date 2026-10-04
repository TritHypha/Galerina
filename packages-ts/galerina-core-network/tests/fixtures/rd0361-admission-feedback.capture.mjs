// rd0361-admission-feedback.capture.mjs: RD-0361 frozen-reference capture spec (schema v2) for the admission-feedback twin.
// Oracle = the reference spec in rd0361-admission-feedback-execution.test.mjs, copied verbatim
// (differential-spec-capture; NOT the real .ts). A real-.ts adapter is required before S13.
// Re-capture: node scripts/rd0361-freeze-reference.mjs --write <this file>. NON_AUTHORIZING.
export const twin = Object.freeze({
  dir: "packages-ts/galerina-core-network/src/self-hosted",
  file: "admission-feedback.fungi",
  module: "admission-feedback",
});
export const oracle = Object.freeze({
  kind: "differential-spec-capture",
  source: "packages-ts/galerina-core-network/tests/rd0361-admission-feedback-execution.test.mjs",
});
const B = [false, true];
const TRITS = [-1, 0, 1];
const b = (x) => (x ? 1 : 0);
export const signatures = Object.freeze([
  { name: "vAnd", params: ["k3", "k3"], returns: "k3" },
  { name: "telemetrySideSignal", params: ["bool", "bool", "bool", "bool", "bool"], returns: "k3" },
]);
export const reference = Object.freeze({
  vAnd: (x, y) => Math.min(x, y),
  telemetrySideSignal: (health, present, garbage, hardDeny, throttle) => {
    let v = 1;
    if (health) v = Math.min(v, 0);
    if (present) {
      if (garbage) v = Math.min(v, 0);
      else if (hardDeny) v = Math.min(v, -1);
      else if (throttle) v = Math.min(v, 0);
    }
    return v;
  },
});
export function cases() {
  const rows = [];
  for (const x of TRITS) for (const y of TRITS) rows.push({ id: `vand-${x}-${y}`, export: "vAnd", args: [x, y] });
  for (const h of B) for (const p of B) for (const g of B) for (const d of B) for (const t of B)
    rows.push({ id: `side-${b(h)}${b(p)}${b(g)}${b(d)}${b(t)}`, export: "telemetrySideSignal", args: [h, p, g, d, t] });
  return rows;
}
